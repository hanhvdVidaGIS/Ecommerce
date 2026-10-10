using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Ccp.Application.Abstractions;
using Ccp.Domain.Entities;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace Ccp.Infrastructure.Security;

public sealed class JwtOptions
{
    public const string AccessAudience = "ccp-api";
    public const string ResetAudience = "ccp-password-reset";

    /// <summary>Khoá ký tối thiểu 32 byte, đọc từ biến môi trường JWT_KEY; không có giá trị mặc định.</summary>
    public string Key { get; set; } = "";
    public string Issuer { get; set; } = "ccp";
    public int AccessTokenMinutes { get; set; } = 15;

    public SymmetricSecurityKey SigningKey => new(Encoding.UTF8.GetBytes(Key));
}

public sealed class JwtTokenService(IOptions<JwtOptions> options, TimeProvider clock) : ITokenService
{
    private readonly JwtOptions _opt = options.Value;
    private readonly JwtSecurityTokenHandler _handler = new() { MapInboundClaims = false };

    public AccessToken CreateAccessToken(User user, IReadOnlyCollection<string> roles, IReadOnlyCollection<string> permissions)
    {
        var now = clock.GetUtcNow().UtcDateTime;
        var expires = now.AddMinutes(_opt.AccessTokenMinutes);
        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new(JwtRegisteredClaimNames.Email, user.Email),
            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString("N")),
        };
        claims.AddRange(roles.Select(r => new Claim("role", r)));
        claims.AddRange(permissions.Select(p => new Claim("perm", p)));
        return new AccessToken(Write(claims, JwtOptions.AccessAudience, now, expires), expires);
    }

    public (string Raw, string Hash) NewRefreshToken()
    {
        var raw = Base64Url(RandomNumberGenerator.GetBytes(64));
        return (raw, HashRefreshToken(raw));
    }

    public string HashRefreshToken(string raw) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(raw))).ToLowerInvariant();

    public string CreateResetToken(User user, TimeSpan lifetime)
    {
        var now = clock.GetUtcNow().UtcDateTime;
        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new("purpose", "pwd_reset"),
            new("pf", PasswordFingerprint(user)),
        };
        return Write(claims, JwtOptions.ResetAudience, now, now.Add(lifetime));
    }

    public (Guid UserId, string Fingerprint)? ReadResetToken(string token)
    {
        try
        {
            var principal = _handler.ValidateToken(token, new TokenValidationParameters
            {
                ValidateIssuer = true, ValidIssuer = _opt.Issuer,
                ValidateAudience = true, ValidAudience = JwtOptions.ResetAudience,
                ValidateIssuerSigningKey = true, IssuerSigningKey = _opt.SigningKey,
                ValidateLifetime = true, ClockSkew = TimeSpan.FromMinutes(1),
                ValidAlgorithms = [SecurityAlgorithms.HmacSha256],
                LifetimeValidator = (_, expires, _, _) => expires is not null && expires.Value > clock.GetUtcNow().UtcDateTime.AddMinutes(-1),
            }, out _);
            if (principal.FindFirst("purpose")?.Value != "pwd_reset") return null;
            var sub = principal.FindFirst(JwtRegisteredClaimNames.Sub)?.Value;
            var pf = principal.FindFirst("pf")?.Value;
            return Guid.TryParse(sub, out var id) && pf is not null ? (id, pf) : null;
        }
        catch (Exception ex) when (ex is SecurityTokenException or ArgumentException)
        {
            return null;
        }
    }

    public string PasswordFingerprint(User user) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(user.PasswordHash)))[..16].ToLowerInvariant();

    private string Write(IEnumerable<Claim> claims, string audience, DateTime now, DateTime expires)
    {
        var creds = new SigningCredentials(_opt.SigningKey, SecurityAlgorithms.HmacSha256);
        var token = new JwtSecurityToken(_opt.Issuer, audience, claims, now, expires, creds);
        return _handler.WriteToken(token);
    }

    private static string Base64Url(byte[] bytes) => Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
