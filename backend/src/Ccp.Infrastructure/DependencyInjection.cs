using System.Security.Cryptography;
using Ccp.Application.Abstractions;
using Ccp.Infrastructure.Content;
using Ccp.Infrastructure.Email;
using Ccp.Infrastructure.Persistence;
using Ccp.Infrastructure.Security;
using Ccp.Infrastructure.Storage;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace Ccp.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration, bool isDevelopment)
    {
        var connectionString = ConnectionStringResolver.Resolve(configuration);

        services.AddSingleton(TimeProvider.System);
        services.AddDbContext<CcpDbContext>(options => options
            .UseNpgsql(connectionString)
            .UseSnakeCaseNamingConvention()
            .ConfigureWarnings(w => w.Ignore(Microsoft.EntityFrameworkCore.Diagnostics.CoreEventId.PossibleIncorrectRequiredNavigationWithQueryFilterInteractionWarning)));
        services.AddScoped<IAppDbContext>(sp => sp.GetRequiredService<CcpDbContext>());

        services.AddOptions<JwtOptions>().Configure(o =>
        {
            o.Key = configuration["JWT_KEY"] ?? "";
            o.Issuer = configuration["Jwt:Issuer"] ?? o.Issuer;
            o.AccessTokenMinutes = configuration.GetValue("Auth:AccessTokenMinutes", o.AccessTokenMinutes);
            if (o.Key.Length == 0 && isDevelopment)
                o.Key = Convert.ToBase64String(RandomNumberGenerator.GetBytes(48)); // khoá tạm cho mỗi lần chạy khi phát triển
        }).Validate(o => o.Key.Length >= 32, "JWT_KEY phải có tối thiểu 32 ký tự (xem .env.example).").ValidateOnStart();

        services.AddSingleton<IPasswordHasher, IdentityPasswordHasher>();
        services.AddSingleton<ITokenService, JwtTokenService>();
        services.AddSingleton<IHtmlSanitizerService, HtmlSanitizerService>();
        // Có Email:Smtp:Host (và FromAddress) thì gửi thật qua SMTP; nếu không chỉ ghi nhật ký (phát triển/kiểm thử).
        services.Configure<Email.SmtpOptions>(configuration.GetSection("Email:Smtp"));
        if (configuration.GetSection("Email:Smtp").Get<Email.SmtpOptions>() is { IsConfigured: true })
            services.AddSingleton<IEmailSender, Email.SmtpEmailSender>();
        else
            services.AddSingleton<IEmailSender, LoggingEmailSender>();

        services.AddMemoryCache();
        services.AddHttpClient();
        services.AddSingleton<ISiteCache, SiteCache>();

        services.AddScoped<Seed.SystemSeeder>();
        services.AddScoped<Seed.DemoSeeder>();

        services.Configure<StorageOptions>(configuration.GetSection("Storage"));
        services.AddSingleton<IStorageService, LocalStorageService>();
        return services;
    }
}

/// <summary>
/// Thứ tự: ConnectionStrings:Default, rồi các biến POSTGRES_* (cùng biến với docker-compose).
/// Không có giá trị mặc định cho mật khẩu: thiếu cấu hình thì báo lỗi rõ ràng thay vì kết nối sai.
/// </summary>
public static class ConnectionStringResolver
{
    public static string Resolve(IConfiguration configuration)
    {
        var explicitValue = configuration.GetConnectionString("Default");
        if (!string.IsNullOrWhiteSpace(explicitValue)) return explicitValue;

        var password = configuration["POSTGRES_PASSWORD"];
        if (string.IsNullOrWhiteSpace(password))
            throw new InvalidOperationException(
                "Thiếu cấu hình cơ sở dữ liệu: đặt ConnectionStrings__Default hoặc POSTGRES_PASSWORD (xem .env.example).");

        var host = configuration["POSTGRES_HOST"] ?? "localhost";
        var port = configuration["POSTGRES_PORT"] ?? "5433";
        var db = configuration["POSTGRES_DB"] ?? "ccp";
        var user = configuration["POSTGRES_USER"] ?? "ccp";
        return $"Host={host};Port={port};Database={db};Username={user};Password={password}";
    }
}
