using System.Security.Cryptography;
using System.Text;
using Ccp.Api.Http;
using Ccp.Application.Auth;

namespace Ccp.Api.Security;

public static class CookieNames
{
    public const string Access = "ccp_at";
    public const string Refresh = "ccp_rt";
    public const string Csrf = "ccp_csrf";
    public const string Cart = "ccp_cart";
    public const string CsrfHeader = "X-CSRF-Token";
}

public sealed class CookieSettings(IHostEnvironment env)
{
    private bool Secure => !env.IsDevelopment();

    public void WriteAuthCookies(HttpResponse response, AuthResult auth)
    {
        response.Cookies.Append(CookieNames.Access, auth.AccessToken, new CookieOptions
        { HttpOnly = true, Secure = Secure, SameSite = SameSiteMode.Lax, Path = "/", Expires = auth.AccessExpiresAt });
        response.Cookies.Append(CookieNames.Refresh, auth.RefreshToken, new CookieOptions
        { HttpOnly = true, Secure = Secure, SameSite = SameSiteMode.Lax, Path = "/api/auth", Expires = auth.RefreshExpiresAt });
        // Cookie CSRF cố ý không HttpOnly để giao diện đọc được và gửi lại qua tiêu đề (double-submit).
        response.Cookies.Append(CookieNames.Csrf, Convert.ToHexString(RandomNumberGenerator.GetBytes(24)).ToLowerInvariant(), new CookieOptions
        { HttpOnly = false, Secure = Secure, SameSite = SameSiteMode.Lax, Path = "/", Expires = auth.RefreshExpiresAt });
    }

    private static readonly TimeSpan CartLifetime = TimeSpan.FromDays(30);

    /// <summary>Token giỏ hàng của khách: 64 ký tự hex ngẫu nhiên. Giá trị lạ trong cookie bị coi như không có.</summary>
    public static string? ReadCartToken(HttpRequest request)
    {
        var v = request.Cookies[CookieNames.Cart];
        return v is { Length: 64 } && v.All(Uri.IsHexDigit) ? v.ToLowerInvariant() : null;
    }

    /// <summary>
    /// Đảm bảo khách có cookie giỏ hàng (HttpOnly) và cookie CSRF (đọc được). Cookie CSRF cũng được cấp lại nếu bị mất,
    /// để các thao tác ghi vào giỏ luôn gửi được tiêu đề X-CSRF-Token.
    /// </summary>
    public string EnsureGuestCart(HttpRequest request, HttpResponse response)
    {
        var token = ReadCartToken(request);
        var expires = DateTimeOffset.UtcNow.Add(CartLifetime);
        if (token is null)
        {
            token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant();
            response.Cookies.Append(CookieNames.Cart, token, new CookieOptions { HttpOnly = true, Secure = Secure, SameSite = SameSiteMode.Lax, Path = "/", Expires = expires });
        }
        if (string.IsNullOrEmpty(request.Cookies[CookieNames.Csrf]))
            response.Cookies.Append(CookieNames.Csrf, Convert.ToHexString(RandomNumberGenerator.GetBytes(24)).ToLowerInvariant(), new CookieOptions
            { HttpOnly = false, Secure = Secure, SameSite = SameSiteMode.Lax, Path = "/", Expires = expires });
        return token;
    }

    public void ClearCartCookie(HttpResponse response) => response.Cookies.Delete(CookieNames.Cart, new CookieOptions { Path = "/" });

    public void ClearAuthCookies(HttpResponse response)
    {
        response.Cookies.Delete(CookieNames.Access, new CookieOptions { Path = "/" });
        response.Cookies.Delete(CookieNames.Refresh, new CookieOptions { Path = "/api/auth" });
        response.Cookies.Delete(CookieNames.Csrf, new CookieOptions { Path = "/" });
    }
}

/// <summary>
/// Chống CSRF: yêu cầu làm thay đổi dữ liệu mang cookie xác thực phải gửi tiêu đề X-CSRF-Token trùng cookie ccp_csrf.
/// Yêu cầu dùng tiêu đề Authorization (không phải cookie) không bị ảnh hưởng.
/// </summary>
public sealed class CsrfMiddleware(RequestDelegate next)
{
    // Các điểm cuối chưa có phiên hợp lệ: không có gì để giả mạo.
    private static readonly string[] Exempt =
        ["/api/auth/login", "/api/auth/register", "/api/auth/forgot-password", "/api/auth/reset-password"];

    public async Task InvokeAsync(HttpContext ctx)
    {
        if (RequiresCheck(ctx.Request) && !IsValid(ctx.Request))
        {
            await ResponseWriter.WriteAsync(ctx, 403, "csrf_failed", "Thiếu hoặc sai mã CSRF.");
            return;
        }
        await next(ctx);
    }

    private static bool RequiresCheck(HttpRequest req)
    {
        if (HttpMethods.IsGet(req.Method) || HttpMethods.IsHead(req.Method) || HttpMethods.IsOptions(req.Method)) return false;
        if (req.Headers.ContainsKey("Authorization")) return false;
        if (Exempt.Contains(req.Path.Value, StringComparer.OrdinalIgnoreCase)) return false;
        return req.Cookies.ContainsKey(CookieNames.Access) || req.Cookies.ContainsKey(CookieNames.Refresh) || req.Cookies.ContainsKey(CookieNames.Cart);
    }

    private static bool IsValid(HttpRequest req)
    {
        var cookie = req.Cookies[CookieNames.Csrf];
        var header = req.Headers[CookieNames.CsrfHeader].FirstOrDefault();
        if (string.IsNullOrEmpty(cookie) || string.IsNullOrEmpty(header)) return false;
        return CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(cookie), Encoding.UTF8.GetBytes(header));
    }
}
