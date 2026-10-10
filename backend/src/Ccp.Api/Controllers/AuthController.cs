using Ccp.Api.Http;
using Ccp.Api.Security;
using Ccp.Application.Auth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace Ccp.Api.Controllers;

[Route("api/auth")]
public class AuthController(AuthService auth, CookieSettings cookies, Application.Sales.CartService carts) : ApiControllerBase
{
    /// <summary>Gộp giỏ của khách (cookie ccp_cart) vào giỏ tài khoản. Lỗi gộp giỏ không được làm hỏng việc đăng nhập.</summary>
    private async Task MergeGuestCartAsync(Guid userId, CancellationToken ct)
    {
        var token = CookieSettings.ReadCartToken(Request);
        if (token is null) return;
        try { await carts.MergeAsync(token, userId, ct); }
        catch (Exception ex) when (ex is not OperationCanceledException) { HttpContext.RequestServices.GetRequiredService<ILogger<AuthController>>().LogWarning(ex, "Không gộp được giỏ hàng khách"); }
        cookies.ClearCartCookie(Response);
    }

    private string? Ip => HttpContext.Connection.RemoteIpAddress?.ToString();

    [HttpPost("register"), AllowAnonymous, EnableRateLimiting(RateLimitPolicies.Auth)]
    public async Task<ApiResponse<CurrentUserDto>> Register(RegisterRequest request, CancellationToken ct)
    {
        var result = await auth.RegisterAsync(request, Ip, ct);
        cookies.WriteAuthCookies(Response, result);
        await MergeGuestCartAsync(result.User.Id, ct);
        return Ok(result.User);
    }

    [HttpPost("login"), AllowAnonymous, EnableRateLimiting(RateLimitPolicies.Auth)]
    public async Task<ApiResponse<CurrentUserDto>> Login(LoginRequest request, CancellationToken ct)
    {
        var result = await auth.LoginAsync(request, Ip, ct);
        cookies.WriteAuthCookies(Response, result);
        await MergeGuestCartAsync(result.User.Id, ct);
        return Ok(result.User);
    }

    [HttpPost("refresh"), AllowAnonymous, EnableRateLimiting(RateLimitPolicies.Auth)]
    public async Task<ApiResponse<CurrentUserDto>> Refresh(CancellationToken ct)
    {
        var result = await auth.RefreshAsync(Request.Cookies[CookieNames.Refresh], Ip, ct);
        cookies.WriteAuthCookies(Response, result);
        return Ok(result.User);
    }

    [HttpPost("logout"), AllowAnonymous]
    public async Task<ApiResponse<object>> Logout(CancellationToken ct)
    {
        await auth.LogoutAsync(Request.Cookies[CookieNames.Refresh], ct);
        cookies.ClearAuthCookies(Response);
        return Done();
    }

    [HttpGet("me"), Authorize]
    public async Task<ApiResponse<CurrentUserDto>> Me([FromServices] Application.Abstractions.ICurrentUser user, CancellationToken ct) =>
        Ok(await auth.GetMeAsync(user.UserId!.Value, ct));

    [HttpPost("forgot-password"), AllowAnonymous, EnableRateLimiting(RateLimitPolicies.Auth)]
    public async Task<ApiResponse<object>> ForgotPassword(ForgotPasswordRequest request, CancellationToken ct)
    {
        await auth.ForgotPasswordAsync(request.Email, ct);
        return Done();
    }

    [HttpPost("reset-password"), AllowAnonymous, EnableRateLimiting(RateLimitPolicies.Auth)]
    public async Task<ApiResponse<object>> ResetPassword(ResetPasswordRequest request, CancellationToken ct)
    {
        await auth.ResetPasswordAsync(request, ct);
        return Done();
    }

    [HttpPost("change-password"), Authorize]
    public async Task<ApiResponse<object>> ChangePassword(ChangePasswordRequest request,
        [FromServices] Application.Abstractions.ICurrentUser user, CancellationToken ct)
    {
        await auth.ChangePasswordAsync(user.UserId!.Value, request, ct);
        return Done();
    }
}

public static class RateLimitPolicies
{
    public const string Auth = "auth";
    public const string Checkout = "checkout";
}
