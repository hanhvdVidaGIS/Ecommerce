using Ccp.Application.Abstractions;
using Ccp.Domain.Entities;
using Microsoft.AspNetCore.Identity;

namespace Ccp.Infrastructure.Security;

/// <summary>Băm mật khẩu bằng PBKDF2 của ASP.NET Core Identity (có muối, số vòng lặp lưu trong chuỗi băm).</summary>
public sealed class IdentityPasswordHasher : Application.Abstractions.IPasswordHasher
{
    private readonly PasswordHasher<User> _inner = new();
    private static readonly User Placeholder = new();

    public string Hash(string password) => _inner.HashPassword(Placeholder, password);

    public bool Verify(string hash, string password) =>
        _inner.VerifyHashedPassword(Placeholder, hash, password) != PasswordVerificationResult.Failed;
}
