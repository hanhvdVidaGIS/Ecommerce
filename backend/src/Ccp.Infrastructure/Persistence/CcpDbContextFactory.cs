using Ccp.Application.Abstractions;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Microsoft.Extensions.Configuration;

namespace Ccp.Infrastructure.Persistence;

/// <summary>Chỉ dùng cho công cụ dotnet-ef (tạo migration).</summary>
internal sealed class CcpDbContextFactory : IDesignTimeDbContextFactory<CcpDbContext>
{
    public CcpDbContext CreateDbContext(string[] args)
    {
        var configuration = new ConfigurationBuilder().AddEnvironmentVariables().Build();
        var options = new DbContextOptionsBuilder<CcpDbContext>()
            .UseNpgsql(ConnectionStringResolver.Resolve(configuration))
            .UseSnakeCaseNamingConvention()
            .ConfigureWarnings(w => w.Ignore(Microsoft.EntityFrameworkCore.Diagnostics.CoreEventId.PossibleIncorrectRequiredNavigationWithQueryFilterInteractionWarning))
            .Options;
        return new CcpDbContext(options, new DesignTimeUser(), TimeProvider.System);
    }

    private sealed class DesignTimeUser : ICurrentUser
    {
        public Guid? UserId => null;
        public bool IsAuthenticated => false;
        public string? Ip => null;
        public bool HasPermission(string permission) => false;
    }
}
