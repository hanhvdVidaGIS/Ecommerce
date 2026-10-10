using Ccp.Infrastructure.Persistence;
using Ccp.Infrastructure.Seed;
using Microsoft.EntityFrameworkCore;

namespace Ccp.Api.Startup;

public static class DbInitializer
{
    /// <summary>
    /// Database:AutoMigrate (mặc định bật ở Development, tắt ở Production: chạy migration chủ động khi triển khai).
    /// Dữ liệu hệ thống luôn được đồng bộ; dữ liệu mẫu chỉ nạp khi Seed:Demo=true.
    /// </summary>
    public static async Task InitializeAsync(WebApplication app)
    {
        using var scope = app.Services.CreateScope();
        var sp = scope.ServiceProvider;
        var db = sp.GetRequiredService<CcpDbContext>();
        if (app.Configuration.GetValue("Database:AutoMigrate", app.Environment.IsDevelopment()))
            await db.Database.MigrateAsync();

        await sp.GetRequiredService<SystemSeeder>().RunAsync(app.Environment.IsProduction());
        if (app.Configuration.GetValue("Seed:Demo", false))
            await sp.GetRequiredService<DemoSeeder>().RunAsync();
    }
}
