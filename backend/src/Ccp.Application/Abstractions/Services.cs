using Ccp.Domain.Entities;

namespace Ccp.Application.Abstractions;

public interface IPasswordHasher
{
    string Hash(string password);
    bool Verify(string hash, string password);
}

public sealed record AccessToken(string Value, DateTime ExpiresAt);

public interface ITokenService
{
    AccessToken CreateAccessToken(User user, IReadOnlyCollection<string> roles, IReadOnlyCollection<string> permissions);
    (string Raw, string Hash) NewRefreshToken();
    string HashRefreshToken(string raw);
    string CreateResetToken(User user, TimeSpan lifetime);
    /// <summary>Trả về (UserId, dấu vân tay mật khẩu) nếu token hợp lệ và đúng mục đích; ngược lại null.</summary>
    (Guid UserId, string Fingerprint)? ReadResetToken(string token);
    string PasswordFingerprint(User user);
}

public interface IEmailSender
{
    Task SendAsync(string to, string subject, string htmlBody, CancellationToken ct = default);
}

public sealed record StoredFile(string Key, string Provider, long SizeBytes);

/// <summary>Lớp trừu tượng kho tệp: Local, S3/R2, Azure Blob chỉ khác nhau ở lớp triển khai.</summary>
public interface IStorageService
{
    string Provider { get; }
    Task<StoredFile> SaveAsync(string key, Stream content, string contentType, CancellationToken ct = default);
    Task DeleteAsync(string key, CancellationToken ct = default);
    Task<Stream?> OpenReadAsync(string key, CancellationToken ct = default);
    /// <summary>URL công khai dựng từ khoá; không lưu URL tuyệt đối trong cơ sở dữ liệu.</summary>
    string GetPublicUrl(string key);
}

public interface IHtmlSanitizerService
{
    string Sanitize(string? html);
}
