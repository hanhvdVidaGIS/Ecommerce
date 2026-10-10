using Ccp.Application.Abstractions;
using Ccp.Domain.Entities;
using Ccp.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Ccp.Tests.Infrastructure;

public static class TestData
{
    public const string Password = "Passw0rdOK";

    /// <summary>Tạo người dùng với vai trò hệ thống và đăng nhập, trả về client đã có cookie.</summary>
    public static async Task<TestClient> LoginAsRoleAsync(this ApiFactory factory, string roleCode)
    {
        var email = $"{roleCode.ToLowerInvariant()}-{Guid.NewGuid():N}@test.local";
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<CcpDbContext>();
            var hasher = scope.ServiceProvider.GetRequiredService<IPasswordHasher>();
            var role = await db.Roles.SingleAsync(r => r.Code == roleCode);
            var user = new User { Email = email, FullName = roleCode + " test", PasswordHash = hasher.Hash(Password), EmailConfirmed = true };
            user.UserRoles.Add(new UserRole { UserId = user.Id, RoleId = role.Id });
            db.Users.Add(user);
            await db.SaveChangesAsync();
        }
        var client = factory.NewClient();
        var login = await client.LoginAsync(email, Password);
        if (!login.Success) throw new InvalidOperationException("Đăng nhập thất bại: " + login.Body);
        return client;
    }

    public static async Task<T> WithDbAsync<T>(this ApiFactory factory, Func<CcpDbContext, Task<T>> action)
    {
        using var scope = factory.Services.CreateScope();
        return await action(scope.ServiceProvider.GetRequiredService<CcpDbContext>());
    }

    public static Task WithDbAsync(this ApiFactory factory, Func<CcpDbContext, Task> action) =>
        factory.WithDbAsync<int>(async db => { await action(db); return 0; });
}
