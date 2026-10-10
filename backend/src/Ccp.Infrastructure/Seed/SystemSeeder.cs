using System.Text.RegularExpressions;
using Ccp.Application.Abstractions;
using Ccp.Application.Auth;
using Ccp.Application.Config;
using Ccp.Domain.Entities;
using Ccp.Domain.Enums;
using Ccp.Domain.Security;
using Ccp.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace Ccp.Infrastructure.Seed;

/// <summary>
/// Dữ liệu hệ thống bắt buộc: quyền, vai trò, Business Type, khoá cấu hình mặc định, Super Admin đầu tiên.
/// Idempotent: chạy lại không ghi đè thay đổi của quản trị viên (trừ danh mục quyền và preset hệ thống).
/// </summary>
public sealed class SystemSeeder(CcpDbContext db, IPasswordHasher hasher, IConfiguration configuration,
    ILogger<SystemSeeder> logger)
{
    public async Task RunAsync(bool isProduction, CancellationToken ct = default)
    {
        await SyncPermissionsAsync(ct);
        await SyncRolesAsync(ct);
        await SyncBusinessTypesAsync(ct);
        await SyncSettingsAsync(ct);
        await SeedDefaultLayoutAsync(ct);
        await SyncAddressUnitsAsync(ct);
        await EnsureSuperAdminAsync(isProduction, ct);
    }

    private async Task SyncPermissionsAsync(CancellationToken ct)
    {
        var existing = await db.Permissions.ToDictionaryAsync(p => p.Code, ct);
        foreach (var def in Permissions.All)
        {
            if (existing.TryGetValue(def.Code, out var p)) { p.Group = def.Group; p.Description = def.Description; }
            else db.Permissions.Add(new Permission { Code = def.Code, Group = def.Group, Description = def.Description });
        }
        await db.SaveChangesAsync(ct);
    }

    private async Task SyncRolesAsync(CancellationToken ct)
    {
        var permissionIds = await db.Permissions.ToDictionaryAsync(p => p.Code, p => p.Id, ct);
        foreach (var def in RoleDefaults.All)
        {
            var role = await db.Roles.Include(r => r.RolePermissions).SingleOrDefaultAsync(r => r.Code == def.Code, ct);
            if (role is null)
            {
                role = new Role { Code = def.Code, Name = def.Name, IsSystem = true };
                db.Roles.Add(role);
            }
            // SuperAdmin và Admin luôn theo danh mục quyền hiện hành; vai trò khác giữ nguyên tuỳ chỉnh của quản trị viên.
            var tracksDefaults = def.Code is RoleDefaults.SuperAdmin or RoleDefaults.Admin;
            var isNew = db.Entry(role).State == EntityState.Added;
            if (!isNew && !tracksDefaults) continue;
            var have = role.RolePermissions.Select(rp => rp.PermissionId).ToHashSet();
            foreach (var code in def.Permissions)
                if (permissionIds.TryGetValue(code, out var pid) && have.Add(pid))
                    role.RolePermissions.Add(new RolePermission { RoleId = role.Id, PermissionId = pid });
        }
        await db.SaveChangesAsync(ct);
    }

    private async Task SyncBusinessTypesAsync(CancellationToken ct)
    {
        var existing = await db.BusinessTypes.ToDictionaryAsync(b => b.Code, ct);
        foreach (var seed in BusinessTypePresets.All)
        {
            var json = System.Text.Json.JsonSerializer.Serialize(seed.Preset, BusinessTypePreset.Json);
            if (existing.TryGetValue(seed.Code, out var b))
            {
                if (!b.IsSystem) continue;
                b.Name = seed.Name; b.Description = seed.Description; b.PresetJson = json;
            }
            else db.BusinessTypes.Add(new BusinessType { Code = seed.Code, Name = seed.Name, Description = seed.Description, PresetJson = json, IsSystem = true });
        }
        await db.SaveChangesAsync(ct);
    }

    private async Task SyncSettingsAsync(CancellationToken ct)
    {
        var existing = (await db.WebsiteSettings.Select(s => s.Key).ToListAsync(ct)).ToHashSet();
        foreach (var def in SettingDefinitions.All.Where(d => !existing.Contains(d.Key)))
            db.WebsiteSettings.Add(new WebsiteSetting { Key = def.Key, Group = def.Group, ValueType = def.Type, IsPublic = def.IsPublic, Value = def.Default });
        await db.SaveChangesAsync(ct);
    }

    /// <summary>Bố cục trang chủ và menu mặc định (chỉ khi chưa có). Đây là nội dung CMS trung tính, quản trị viên sửa tự do.</summary>
    private async Task SeedDefaultLayoutAsync(CancellationToken ct)
    {
        if (!await db.HomepageSections.AnyAsync(ct))
        {
            (HomepageSectionType Type, string? Title, string? Subtitle, bool Active)[] defaults =
            [
                (HomepageSectionType.Hero, null, null, true),
                (HomepageSectionType.Slider, null, null, false),
                (HomepageSectionType.FeaturedCategories, "Danh mục nổi bật", null, true),
                (HomepageSectionType.NewProducts, "Hàng mới về", null, true),
                (HomepageSectionType.BestSellers, "Bán chạy nhất", null, true),
                (HomepageSectionType.FeaturedProducts, "Sản phẩm nổi bật", null, true),
                (HomepageSectionType.Promotions, "Khuyến mãi", null, false),
                (HomepageSectionType.FlashSale, "Flash Sale", null, false),
                (HomepageSectionType.Brands, "Thương hiệu", null, true),
                (HomepageSectionType.PromoBanners, null, null, false),
                (HomepageSectionType.Blog, "Tin tức", null, false),
                (HomepageSectionType.Reviews, "Khách hàng nói gì", null, false),
                (HomepageSectionType.Newsletter, "Đăng ký nhận tin", "Nhận thông tin ưu đãi mới nhất qua email.", true),
            ];
            var order = 0;
            foreach (var d in defaults)
                db.HomepageSections.Add(new HomepageSection { Type = d.Type, Title = d.Title, Subtitle = d.Subtitle, IsActive = d.Active, SortOrder = order += 10 });
        }

        foreach (var (code, name) in new[] { ("header", "Menu chính"), ("footer", "Menu chân trang") })
        {
            if (await db.Menus.AnyAsync(m => m.Code == code, ct)) continue;
            var menu = new Menu { Code = code, Name = name };
            if (code == "header")
            {
                menu.Items.Add(new MenuItem { Title = "Trang chủ", TargetType = "Url", Url = "/", SortOrder = 10 });
                menu.Items.Add(new MenuItem { Title = "Sản phẩm", TargetType = "Url", Url = "/products", SortOrder = 20 });
            }
            db.Menus.Add(menu);
        }
        await db.SaveChangesAsync(ct);
    }

    /// <summary>
    /// Đơn vị hành chính hai cấp (tỉnh/thành phố, phường/xã/đặc khu) theo Quyết định 19/2025/QĐ-TTg.
    /// Nguồn dữ liệu và phạm vi đối chiếu nằm trong tệp address-units.json (khối "source").
    /// </summary>
    private async Task SyncAddressUnitsAsync(CancellationToken ct)
    {
        var path = Path.Combine(AppContext.BaseDirectory, "Seed", "Data", "address-units.json");
        if (!File.Exists(path)) throw new FileNotFoundException("Thiếu dữ liệu đơn vị hành chính", path);
        using var doc = System.Text.Json.JsonDocument.Parse(await File.ReadAllTextAsync(path, ct));
        var root = doc.RootElement;
        var source = "Quyết định 19/2025/QĐ-TTg; " + root.GetProperty("source").GetProperty("dataset").GetString();
        var existing = await db.AddressUnits.ToDictionaryAsync(a => a.Code, ct);

        void Upsert(string code, string name, AddressLevel level, string? parent)
        {
            if (existing.TryGetValue(code, out var a)) { a.Name = name; a.ParentCode = parent; a.Source = source; return; }
            var unit = new AddressUnit { Code = code, Name = name, Level = level, ParentCode = parent, Source = source };
            db.AddressUnits.Add(unit);
            existing[code] = unit;
        }
        foreach (var p in root.GetProperty("provinces").EnumerateArray())
            Upsert(p.GetProperty("code").GetString()!, p.GetProperty("nameWithType").GetString()!, AddressLevel.Province, null);
        foreach (var w in root.GetProperty("wards").EnumerateArray())
            Upsert(w.GetProperty("code").GetString()!, w.GetProperty("nameWithType").GetString()!, AddressLevel.Ward, w.GetProperty("provinceCode").GetString());
        await db.SaveChangesAsync(ct);
    }

    private async Task EnsureSuperAdminAsync(bool isProduction, CancellationToken ct)
    {
        var role = await db.Roles.SingleAsync(r => r.Code == RoleDefaults.SuperAdmin, ct);
        if (await db.UserRoles.AnyAsync(ur => ur.RoleId == role.Id, ct)) return;

        var email = configuration["SEED_ADMIN_EMAIL"];
        var password = configuration["SEED_ADMIN_PASSWORD"];
        if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(password))
        {
            const string message = "Chưa có Super Admin: đặt SEED_ADMIN_EMAIL và SEED_ADMIN_PASSWORD (xem .env.example).";
            if (isProduction) throw new InvalidOperationException(message);
            logger.LogWarning(message);
            return;
        }
        if (password.Length < 8 || !Regex.IsMatch(password, "[A-Za-z]") || !Regex.IsMatch(password, "[0-9]"))
            throw new InvalidOperationException("SEED_ADMIN_PASSWORD phải tối thiểu 8 ký tự, có chữ cái và chữ số.");

        var user = new User
        {
            Email = AuthService.NormalizeEmail(email), FullName = "Super Admin", PasswordHash = hasher.Hash(password),
            EmailConfirmed = true,
        };
        user.UserRoles.Add(new UserRole { UserId = user.Id, RoleId = role.Id });
        db.Users.Add(user);
        await db.SaveChangesAsync(ct);
        logger.LogInformation("Đã tạo Super Admin {Email}", user.Email);
    }
}
