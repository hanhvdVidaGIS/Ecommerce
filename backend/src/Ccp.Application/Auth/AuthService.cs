using Ccp.Application.Abstractions;
using Ccp.Application.Common;
using Ccp.Domain.Entities;
using Ccp.Domain.Security;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Ccp.Application.Auth;

public class AuthService(
    IAppDbContext db, IPasswordHasher hasher, ITokenService tokens, IEmailSender email,
    IOptions<AuthOptions> options, TimeProvider clock)
{
    private readonly AuthOptions _opt = options.Value;
    private const string InvalidCredentials = "Email hoặc mật khẩu không đúng.";

    public static string NormalizeEmail(string email) => email.Trim().ToLowerInvariant();

    public async Task<AuthResult> RegisterAsync(RegisterRequest req, string? ip, CancellationToken ct = default)
    {
        var emailKey = NormalizeEmail(req.Email);
        if (await db.Users.AnyAsync(u => u.Email == emailKey, ct))
            throw AppException.Conflict("Email đã được sử dụng.", "email_taken");

        var customerRole = await db.Roles.SingleAsync(r => r.Code == RoleDefaults.Customer, ct);
        var user = new User
        {
            Email = emailKey, FullName = req.FullName.Trim(), PhoneNumber = req.PhoneNumber?.Trim(),
            PasswordHash = hasher.Hash(req.Password),
        };
        user.UserRoles.Add(new UserRole { UserId = user.Id, RoleId = customerRole.Id });
        db.Users.Add(user);
        await db.SaveChangesAsync(ct);
        return await IssueAsync(user.Id, ip, ct);
    }

    public async Task<AuthResult> LoginAsync(LoginRequest req, string? ip, CancellationToken ct = default)
    {
        var emailKey = NormalizeEmail(req.Email);
        var user = await db.Users.SingleOrDefaultAsync(u => u.Email == emailKey, ct);
        var now = clock.GetUtcNow().UtcDateTime;
        if (user is null)
        {
            hasher.Verify(DummyHash, req.Password); // cân bằng thời gian phản hồi giữa email có và không có
            throw AppException.Unauthorized(InvalidCredentials, "invalid_credentials");
        }

        if (user.LockoutEnd > now)
            throw new AppException("account_locked", "Tài khoản tạm khoá do đăng nhập sai nhiều lần. Thử lại sau.", 423);

        if (!hasher.Verify(user.PasswordHash, req.Password))
        {
            user.FailedLoginCount++;
            if (user.FailedLoginCount >= _opt.MaxFailedLogins)
            {
                user.LockoutEnd = now.AddMinutes(_opt.LockoutMinutes);
                user.FailedLoginCount = 0;
            }
            await db.SaveChangesAsync(ct);
            throw AppException.Unauthorized(InvalidCredentials, "invalid_credentials");
        }

        if (!user.IsActive)
            throw new AppException("account_disabled", "Tài khoản đã bị khoá. Liên hệ quản trị viên.", 403);

        user.FailedLoginCount = 0;
        user.LockoutEnd = null;
        await db.SaveChangesAsync(ct);
        return await IssueAsync(user.Id, ip, ct);
    }

    public async Task<AuthResult> RefreshAsync(string? rawToken, string? ip, CancellationToken ct = default)
    {
        if (string.IsNullOrEmpty(rawToken)) throw AppException.Unauthorized();
        var hash = tokens.HashRefreshToken(rawToken);
        var stored = await db.RefreshTokens.SingleOrDefaultAsync(t => t.TokenHash == hash, ct);
        var now = clock.GetUtcNow().UtcDateTime;
        if (stored is null) throw AppException.Unauthorized();

        if (stored.RevokedAt is not null)
        {
            // Token đã xoay vòng bị dùng lại: coi là bị đánh cắp, thu hồi toàn bộ phiên của người dùng.
            await RevokeAllAsync(stored.UserId, now, ct);
            throw AppException.Unauthorized("Phiên không hợp lệ. Vui lòng đăng nhập lại.", "refresh_reuse");
        }
        if (stored.ExpiresAt <= now) throw AppException.Unauthorized();

        var user = await db.Users.SingleOrDefaultAsync(u => u.Id == stored.UserId, ct);
        if (user is null || !user.IsActive) throw AppException.Unauthorized();

        var result = await IssueAsync(user.Id, ip, ct);
        stored.RevokedAt = now;
        stored.ReplacedByHash = tokens.HashRefreshToken(result.RefreshToken);
        await db.SaveChangesAsync(ct);
        return result;
    }

    public async Task LogoutAsync(string? rawToken, CancellationToken ct = default)
    {
        if (string.IsNullOrEmpty(rawToken)) return;
        var hash = tokens.HashRefreshToken(rawToken);
        var stored = await db.RefreshTokens.SingleOrDefaultAsync(t => t.TokenHash == hash && t.RevokedAt == null, ct);
        if (stored is null) return;
        stored.RevokedAt = clock.GetUtcNow().UtcDateTime;
        await db.SaveChangesAsync(ct);
    }

    public async Task<CurrentUserDto> GetMeAsync(Guid userId, CancellationToken ct = default)
    {
        var user = await db.Users.AsNoTracking().SingleOrDefaultAsync(u => u.Id == userId, ct)
                   ?? throw AppException.Unauthorized();
        var (roles, permissions) = await LoadAccessAsync(userId, ct);
        return new CurrentUserDto(user.Id, user.Email, user.FullName, user.PhoneNumber, roles, permissions);
    }

    public async Task ForgotPasswordAsync(string emailAddress, CancellationToken ct = default)
    {
        var emailKey = NormalizeEmail(emailAddress);
        var user = await db.Users.SingleOrDefaultAsync(u => u.Email == emailKey && u.IsActive, ct);
        if (user is null) return; // luôn trả về như nhau để không lộ email nào đã đăng ký

        var token = tokens.CreateResetToken(user, TimeSpan.FromMinutes(_opt.ResetTokenMinutes));
        var link = $"{_opt.PublicBaseUrl.TrimEnd('/')}/reset-password?token={Uri.EscapeDataString(token)}";
        await email.SendAsync(user.Email, "Đặt lại mật khẩu",
            $"<p>Xin chào {System.Net.WebUtility.HtmlEncode(user.FullName)},</p><p>Nhấn vào <a href=\"{link}\">liên kết này</a> để đặt lại mật khẩu. Liên kết có hiệu lực {_opt.ResetTokenMinutes} phút.</p>", ct);
    }

    public async Task ResetPasswordAsync(ResetPasswordRequest req, CancellationToken ct = default)
    {
        var info = tokens.ReadResetToken(req.Token)
                   ?? throw new AppException("invalid_reset_token", "Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.", 400);
        var user = await db.Users.SingleOrDefaultAsync(u => u.Id == info.UserId, ct);
        // Dấu vân tay gắn với mật khẩu hiện tại: sau khi đổi mật khẩu, token cũ không dùng lại được.
        if (user is null || tokens.PasswordFingerprint(user) != info.Fingerprint)
            throw new AppException("invalid_reset_token", "Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.", 400);

        user.PasswordHash = hasher.Hash(req.NewPassword);
        user.FailedLoginCount = 0;
        user.LockoutEnd = null;
        await RevokeAllAsync(user.Id, clock.GetUtcNow().UtcDateTime, ct, save: false);
        await db.SaveChangesAsync(ct);
    }

    public async Task ChangePasswordAsync(Guid userId, ChangePasswordRequest req, CancellationToken ct = default)
    {
        var user = await db.Users.SingleAsync(u => u.Id == userId, ct);
        if (!hasher.Verify(user.PasswordHash, req.CurrentPassword))
            throw new AppException("invalid_credentials", "Mật khẩu hiện tại không đúng.", 400);
        user.PasswordHash = hasher.Hash(req.NewPassword);
        await db.SaveChangesAsync(ct);
    }

    // ---- nội bộ ----
    private string? _dummyHash;
    private string DummyHash => _dummyHash ??= hasher.Hash(Guid.NewGuid().ToString("N"));

    private async Task<AuthResult> IssueAsync(Guid userId, string? ip, CancellationToken ct)
    {
        var user = await db.Users.SingleAsync(u => u.Id == userId, ct);
        var (roles, permissions) = await LoadAccessAsync(userId, ct);
        var now = clock.GetUtcNow().UtcDateTime;
        var access = tokens.CreateAccessToken(user, roles, permissions);
        var (raw, hash) = tokens.NewRefreshToken();
        var expires = now.AddDays(_opt.RefreshTokenDays);
        db.RefreshTokens.Add(new RefreshToken { UserId = userId, TokenHash = hash, CreatedAt = now, ExpiresAt = expires, CreatedByIp = ip });
        await db.SaveChangesAsync(ct);
        return new AuthResult(new CurrentUserDto(user.Id, user.Email, user.FullName, user.PhoneNumber, roles, permissions),
            access.Value, access.ExpiresAt, raw, expires);
    }

    private async Task<(IReadOnlyList<string> Roles, IReadOnlyList<string> Permissions)> LoadAccessAsync(Guid userId, CancellationToken ct)
    {
        var roles = await db.UserRoles.Where(ur => ur.UserId == userId).Select(ur => ur.Role!.Code).ToListAsync(ct);
        // Super Admin có mọi quyền, kể cả quyền mới thêm chưa kịp đồng bộ vào bảng.
        var permissions = roles.Contains(RoleDefaults.SuperAdmin)
            ? Permissions.All.Select(p => p.Code).ToList()
            : await db.UserRoles.Where(ur => ur.UserId == userId)
                .SelectMany(ur => ur.Role!.RolePermissions.Select(rp => rp.Permission!.Code)).Distinct().ToListAsync(ct);
        return (roles, permissions.Order().ToList());
    }

    private async Task RevokeAllAsync(Guid userId, DateTime now, CancellationToken ct, bool save = true)
    {
        var active = await db.RefreshTokens.Where(t => t.UserId == userId && t.RevokedAt == null).ToListAsync(ct);
        foreach (var t in active) t.RevokedAt = now;
        if (save) await db.SaveChangesAsync(ct);
    }
}
