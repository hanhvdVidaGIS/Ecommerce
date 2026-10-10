using System.Text.Json;
using Ccp.Application.Abstractions;
using Ccp.Domain.Entities;
using Ccp.Domain.Enums;
using Ccp.Domain.Security;
using Ccp.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Ccp.Tests;

/// <summary>
/// docs/catalog.json là nguồn gốc thiết kế của danh mục thực thể, enum, quyền, vai trò và máy trạng thái.
/// Các test này đọc tệp đó lúc chạy và đối chiếu với mã nguồn; lệch ở bất kỳ phía nào đều làm test hỏng.
/// </summary>
public class CatalogConsistencyTests
{
    private static readonly JsonElement Catalog = LoadCatalog();

    private static JsonElement LoadCatalog()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !File.Exists(Path.Combine(dir.FullName, "docs", "catalog.json"))) dir = dir.Parent;
        if (dir is null) throw new FileNotFoundException("Không tìm thấy docs/catalog.json từ " + AppContext.BaseDirectory);
        return JsonDocument.Parse(File.ReadAllText(Path.Combine(dir.FullName, "docs", "catalog.json"))).RootElement.Clone();
    }

    private static CcpDbContext NewContext() => new(
        new DbContextOptionsBuilder<CcpDbContext>().UseNpgsql("Host=unused").UseSnakeCaseNamingConvention().Options,
        new NoUser(), TimeProvider.System);

    private sealed class NoUser : ICurrentUser
    {
        public Guid? UserId => null;
        public bool IsAuthenticated => false;
        public string? Ip => null;
        public bool HasPermission(string permission) => false;
    }

    [Fact]
    public void Entities_in_model_match_catalog()
    {
        var expected = Catalog.GetProperty("entityGroups").EnumerateArray()
            .SelectMany(g => g.GetProperty("entities").EnumerateArray().Select(e => e.GetString()!)).Order().ToList();
        using var db = NewContext();
        var actual = db.Model.GetEntityTypes().Where(t => !t.IsOwned()).Select(t => t.ClrType.Name).Order().ToList();

        Assert.Equal(expected, actual);
    }

    [Fact]
    public void Enums_match_catalog_names_and_values()
    {
        foreach (var e in Catalog.GetProperty("enums").EnumerateObject())
        {
            var type = typeof(OrderStatus).Assembly.GetType($"Ccp.Domain.Enums.{e.Name}");
            Assert.True(type is not null, $"Enum {e.Name} có trong catalog nhưng không có trong Ccp.Domain.Enums");
            Assert.Equal(e.Value.EnumerateArray().Select(v => v.GetString()!).ToList(), Enum.GetNames(type!).ToList());
        }
    }

    [Fact]
    public void Every_domain_enum_is_in_catalog()
    {
        var inCatalog = Catalog.GetProperty("enums").EnumerateObject().Select(p => p.Name).ToHashSet();
        var inCode = typeof(OrderStatus).Assembly.GetTypes().Where(t => t.IsEnum && t.Namespace == "Ccp.Domain.Enums").Select(t => t.Name);
        Assert.DoesNotContain(inCode, n => !inCatalog.Contains(n));
    }

    [Fact]
    public void Permissions_match_catalog()
    {
        var expected = Catalog.GetProperty("permissions").EnumerateArray()
            .Select(p => (Code: p.GetProperty("code").GetString()!, Group: p.GetProperty("group").GetString()!,
                Description: p.GetProperty("description").GetString()!,
                SuperAdminOnly: p.TryGetProperty("superAdminOnly", out var s) && s.GetBoolean()))
            .ToList();
        var actual = Permissions.All.Select(p => (p.Code, p.Group, p.Description, p.SuperAdminOnly)).ToList();

        Assert.Equal(expected, actual);
    }

    [Fact]
    public void Order_transitions_match_catalog()
    {
        foreach (var t in Catalog.GetProperty("orderTransitions").EnumerateObject())
        {
            var from = Enum.Parse<OrderStatus>(t.Name);
            var expected = t.Value.EnumerateArray().Select(v => Enum.Parse<OrderStatus>(v.GetString()!)).ToList();
            Assert.Equal(expected, OrderStateMachine.NextOf(from).ToList());
        }
    }

    [Fact]
    public void Default_roles_match_catalog_codes_and_super_admin_rule()
    {
        var roles = Catalog.GetProperty("roles").EnumerateArray().Select(r => r.GetProperty("code").GetString()!).ToList();
        Assert.Equal(roles, RoleDefaults.All.Select(r => r.Code).ToList());

        var superOnly = Permissions.All.Where(p => p.SuperAdminOnly).Select(p => p.Code).ToHashSet();
        foreach (var role in RoleDefaults.All.Where(r => r.Code != RoleDefaults.SuperAdmin))
            Assert.DoesNotContain(role.Permissions, superOnly.Contains);
        Assert.True(superOnly.IsSubsetOf(RoleDefaults.All.Single(r => r.Code == RoleDefaults.SuperAdmin).Permissions));
    }
}
