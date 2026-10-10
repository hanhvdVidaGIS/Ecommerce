using Ccp.Application.Abstractions;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Testcontainers.PostgreSql;

namespace Ccp.Tests.Infrastructure;

public static class TestSecrets
{
    public const string AdminEmail = "admin@test.local";
    public const string AdminPassword = "Admin12345";
    public const string JwtKey = "test-only-jwt-key-0123456789-abcdefghijklmnopqrstuvwxyz";
}

/// <summary>Email gửi ra được giữ lại trong bộ nhớ để test đọc liên kết đặt lại mật khẩu.</summary>
public sealed class CapturingEmailSender : IEmailSender
{
    private readonly List<(string To, string Subject, string Body)> _sent = [];
    public IReadOnlyList<(string To, string Subject, string Body)> Sent { get { lock (_sent) return _sent.ToList(); } }

    public Task SendAsync(string to, string subject, string htmlBody, CancellationToken ct = default)
    {
        lock (_sent) _sent.Add((to, subject, htmlBody));
        return Task.CompletedTask;
    }
}

/// <summary>Chạy API thật trên PostgreSQL thật (container); không dùng cơ sở dữ liệu giả lập.</summary>
public class ApiFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    private readonly PostgreSqlContainer _db = new PostgreSqlBuilder("postgres:17-alpine").Build();
    public CapturingEmailSender Email { get; } = new();
    protected virtual int AuthPerMinute => 1_000_000;
    protected virtual int CheckoutPerMinute => 1_000_000;
    protected virtual string UploadsPath => Path.Combine(Path.GetTempPath(), "ccp-test-uploads-" + Guid.NewGuid().ToString("N"));
    public string UploadsRoot { get; private set; } = "";

    public async Task InitializeAsync() => await _db.StartAsync();

    public new async Task DisposeAsync()
    {
        await base.DisposeAsync();
        await _db.DisposeAsync();
        if (UploadsRoot.Length > 0 && Directory.Exists(UploadsRoot)) Directory.Delete(UploadsRoot, true);
    }

    public string ConnectionString => _db.GetConnectionString();

    public TestClient NewClient() => new(CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = false, AllowAutoRedirect = false }));

    public async Task<TestClient> NewAdminClientAsync()
    {
        var c = NewClient();
        var login = await c.LoginAdminAsync();
        if (!login.Success) throw new InvalidOperationException("Đăng nhập admin test thất bại: " + login.Body);
        return c;
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        UploadsRoot = UploadsPath;
        builder.UseEnvironment("Development");
        builder.UseSetting("ConnectionStrings:Default", _db.GetConnectionString());
        builder.UseSetting("JWT_KEY", TestSecrets.JwtKey);
        builder.UseSetting("SEED_ADMIN_EMAIL", TestSecrets.AdminEmail);
        builder.UseSetting("SEED_ADMIN_PASSWORD", TestSecrets.AdminPassword);
        builder.UseSetting("Database:AutoMigrate", "true");
        builder.UseSetting("RateLimit:AuthPerMinute", AuthPerMinute.ToString());
        builder.UseSetting("RateLimit:CheckoutPerMinute", CheckoutPerMinute.ToString());
        builder.UseSetting("RateLimit:GlobalPerMinute", "1000000");
        builder.UseSetting("Storage:LocalPath", UploadsRoot);
        builder.ConfigureTestServices(services =>
        {
            services.RemoveAll<IEmailSender>();
            services.AddSingleton<IEmailSender>(Email);
        });
    }
}
