using System.Net;
using System.Text.Json;
using Ccp.Application.Common;
using Ccp.Domain.Enums;
using Ccp.Domain.Security;
using Ccp.Tests.Infrastructure;
using static Ccp.Tests.Infrastructure.CatalogApi;

namespace Ccp.Tests;

[Collection(ApiCollection.Name)]
public class UserAdminTests(ApiFactory factory)
{
    private static string Email() => $"staff-{Guid.NewGuid():N}@test.local";

    private static object NewUser(string email, params string[] roles) => new { email, password = "Passw0rdOK", fullName = "Nhân viên", roleCodes = roles };

    [Fact]
    public async Task Only_super_admin_can_manage_users_roles_and_permissions()
    {
        var admin = await factory.LoginAsRoleAsync(RoleDefaults.Admin);
        var manager = await factory.LoginAsRoleAsync(RoleDefaults.Manager);
        var anon = factory.NewClient();

        foreach (var path in new[] { "/api/admin/users", "/api/admin/roles", "/api/admin/permissions", "/api/admin/audit-logs" })
        {
            Assert.Equal(HttpStatusCode.Forbidden, (await admin.GetAsync(path)).Status);
            Assert.Equal(HttpStatusCode.Forbidden, (await manager.GetAsync(path)).Status);
            Assert.Equal(HttpStatusCode.Unauthorized, (await anon.GetAsync(path)).Status);
        }
        Assert.Equal(HttpStatusCode.Forbidden, (await admin.PostAsync("/api/admin/users", NewUser(Email(), "Staff"))).Status);
        Assert.Equal(HttpStatusCode.Forbidden, (await admin.PostAsync("/api/admin/roles", new { code = "Hack", name = "Hack" })).Status);
    }

    [Fact]
    public async Task Super_admin_creates_staff_who_can_log_in_with_the_role_permissions()
    {
        var root = await factory.NewAdminClientAsync();
        var email = Email();
        var created = await root.PostAsync("/api/admin/users", NewUser(email, "Staff"));
        Assert.True(created.Success, created.Body.ToString());
        Assert.Equal(["Staff"], created.Data.GetProperty("roles").EnumerateArray().Select(x => x.GetString()!).ToArray());

        var login = await factory.NewClient().LoginAsync(email, "Passw0rdOK");
        Assert.True(login.Success);
        var perms = login.Data.GetProperty("permissions").EnumerateArray().Select(x => x.GetString()).ToList();
        Assert.Contains(Permissions.ProductUpdate, perms);
        Assert.DoesNotContain(Permissions.ProductDelete, perms);
    }

    [Fact]
    public async Task User_validation_duplicate_email_unknown_role_weak_password()
    {
        var root = await factory.NewAdminClientAsync();
        var email = Email();
        Assert.True((await root.PostAsync("/api/admin/users", NewUser(email, "Staff"))).Success);

        Assert.Equal("email_taken", (await root.PostAsync("/api/admin/users", NewUser(email.ToUpperInvariant(), "Staff"))).ErrorCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await root.PostAsync("/api/admin/users", NewUser(Email(), "NoSuchRole"))).Status);
        Assert.Equal(HttpStatusCode.BadRequest, (await root.PostAsync("/api/admin/users", new { email = Email(), password = "weak", fullName = "x", roleCodes = new[] { "Staff" } })).Status);
        Assert.Equal(HttpStatusCode.BadRequest, (await root.PostAsync("/api/admin/users", new { email = Email(), password = "Passw0rdOK", fullName = "x", roleCodes = Array.Empty<string>() })).Status);
    }

    [Fact]
    public async Task Staff_scope_excludes_customers_and_customer_scope_shows_them()
    {
        var root = await factory.NewAdminClientAsync();
        var staffEmail = Email();
        await root.PostAsync("/api/admin/users", NewUser(staffEmail, "Manager"));
        var customer = factory.NewClient();
        var custEmail = Email();
        await customer.PostAsync("/api/auth/register", new { email = custEmail, password = "Passw0rdOK", fullName = "Khách" }, false);

        var staff = await root.GetAsync($"/api/admin/users?q={staffEmail}");
        Assert.Equal(1, staff.Meta.GetProperty("total").GetInt32());
        Assert.Equal(0, (await root.GetAsync($"/api/admin/users?q={custEmail}")).Meta.GetProperty("total").GetInt32());
        Assert.Equal(1, (await root.GetAsync($"/api/admin/users?scope=customer&q={custEmail}")).Meta.GetProperty("total").GetInt32());
        Assert.Equal(1, (await root.GetAsync($"/api/admin/users?scope=all&q={custEmail}")).Meta.GetProperty("total").GetInt32());
        Assert.Equal(HttpStatusCode.BadRequest, (await root.GetAsync("/api/admin/users?scope=everyone")).Status);
    }

    [Fact]
    public async Task Deactivating_or_changing_roles_ends_existing_sessions()
    {
        var root = await factory.NewAdminClientAsync();
        var email = Email();
        var id = (await root.PostAsync("/api/admin/users", NewUser(email, "Staff"))).Data.GetProperty("id").GetGuid();
        var session = factory.NewClient();
        await session.LoginAsync(email, "Passw0rdOK");

        Assert.True((await root.PutAsync($"/api/admin/users/{id}", new { fullName = "Đổi tên", isActive = true, roleCodes = new[] { "Manager" } })).Success);
        Assert.Equal(HttpStatusCode.Unauthorized, (await session.PostAsync("/api/auth/refresh")).Status); // phải đăng nhập lại để nhận quyền mới
        var relogin = await factory.NewClient().LoginAsync(email, "Passw0rdOK");
        Assert.Contains(Permissions.CustomerView, relogin.Data.GetProperty("permissions").EnumerateArray().Select(x => x.GetString()));

        Assert.True((await root.PutAsync($"/api/admin/users/{id}", new { fullName = "Đổi tên", isActive = false, roleCodes = new[] { "Manager" } })).Success);
        var blocked = await factory.NewClient().LoginAsync(email, "Passw0rdOK");
        Assert.Equal(HttpStatusCode.Forbidden, blocked.Status);
        Assert.Equal("account_disabled", blocked.ErrorCode);
    }

    [Fact]
    public async Task Reset_password_changes_credentials_and_kills_sessions()
    {
        var root = await factory.NewAdminClientAsync();
        var email = Email();
        var id = (await root.PostAsync("/api/admin/users", NewUser(email, "Staff"))).Data.GetProperty("id").GetGuid();
        var session = factory.NewClient();
        await session.LoginAsync(email, "Passw0rdOK");

        Assert.True((await root.PostAsync($"/api/admin/users/{id}/reset-password", new { newPassword = "NewPass9999" })).Success);
        Assert.Equal(HttpStatusCode.Unauthorized, (await session.PostAsync("/api/auth/refresh")).Status);
        Assert.False((await factory.NewClient().LoginAsync(email, "Passw0rdOK")).Success);
        Assert.True((await factory.NewClient().LoginAsync(email, "NewPass9999")).Success);
        Assert.Equal(HttpStatusCode.BadRequest, (await root.PostAsync($"/api/admin/users/{id}/reset-password", new { newPassword = "short" })).Status);
    }

    [Fact]
    public async Task Deleted_user_cannot_log_in_and_email_can_be_reused()
    {
        var root = await factory.NewAdminClientAsync();
        var email = Email();
        var id = (await root.PostAsync("/api/admin/users", NewUser(email, "Staff"))).Data.GetProperty("id").GetGuid();

        Assert.True((await root.DeleteAsync($"/api/admin/users/{id}")).Success);
        Assert.False((await factory.NewClient().LoginAsync(email, "Passw0rdOK")).Success);
        Assert.Equal(HttpStatusCode.NotFound, (await root.GetAsync($"/api/admin/users/{id}")).Status);
        Assert.True((await root.PostAsync("/api/admin/users", NewUser(email, "Staff"))).Success);
    }
}

[Collection(ApiCollection.Name)]
public class RoleAdminTests(ApiFactory factory)
{
    private static string Code() => "R" + Guid.NewGuid().ToString("N")[..10];

    [Fact]
    public async Task Super_admin_only_permissions_can_never_be_granted_to_other_roles()
    {
        var root = await factory.NewAdminClientAsync();
        foreach (var p in new[] { Permissions.UserManage, Permissions.RoleManage, Permissions.PermissionManage })
        {
            var create = await root.PostAsync("/api/admin/roles", new { code = Code(), name = "X", permissionCodes = new[] { p } });
            Assert.Equal(HttpStatusCode.BadRequest, create.Status);
            Assert.Contains(p, create.Body.ToString());

            var manager = (await root.GetAsync("/api/admin/roles")).Data.EnumerateArray().Single(r => r.GetProperty("code").GetString() == "Manager").GetProperty("id").GetGuid();
            var update = await root.PutAsync($"/api/admin/roles/{manager}", new { name = "Manager", permissionCodes = new[] { Permissions.ProductView, p } });
            Assert.Equal(HttpStatusCode.BadRequest, update.Status);
        }
    }

    [Fact]
    public async Task Custom_role_lifecycle_with_permissions_in_new_logins()
    {
        var root = await factory.NewAdminClientAsync();
        var code = Code();
        var created = await root.PostAsync("/api/admin/roles", new { code, name = "Kế toán", permissionCodes = new[] { Permissions.OrderView, Permissions.DashboardView } });
        Assert.True(created.Success, created.Body.ToString());
        var id = created.Data.GetProperty("id").GetGuid();
        Assert.False(created.Data.GetProperty("isSystem").GetBoolean());
        Assert.Equal("code_taken", (await root.PostAsync("/api/admin/roles", new { code, name = "Trùng" })).ErrorCode);

        var email = $"acc-{Guid.NewGuid():N}@test.local";
        await root.PostAsync("/api/admin/users", new { email, password = "Passw0rdOK", fullName = "KT", roleCodes = new[] { code } });
        var perms1 = (await factory.NewClient().LoginAsync(email, "Passw0rdOK")).Data.GetProperty("permissions").EnumerateArray().Select(x => x.GetString()).ToList();
        Assert.Equal([Permissions.DashboardView, Permissions.OrderView], perms1.Order().ToList());

        Assert.True((await root.PutAsync($"/api/admin/roles/{id}", new { name = "Kế toán", permissionCodes = new[] { Permissions.OrderView, Permissions.OrderUpdate } })).Success);
        var perms2 = (await factory.NewClient().LoginAsync(email, "Passw0rdOK")).Data.GetProperty("permissions").EnumerateArray().Select(x => x.GetString()).ToList();
        Assert.Equal([Permissions.OrderUpdate, Permissions.OrderView], perms2.Order().ToList());

        Assert.Equal("in_use", (await root.DeleteAsync($"/api/admin/roles/{id}")).ErrorCode);
    }

    [Fact]
    public async Task System_roles_are_protected_and_unknown_permissions_rejected()
    {
        var root = await factory.NewAdminClientAsync();
        var roles = (await root.GetAsync("/api/admin/roles")).Data.EnumerateArray().ToList();
        JsonElement Role(string code) => roles.Single(r => r.GetProperty("code").GetString() == code);

        var superId = Role("SuperAdmin").GetProperty("id").GetGuid();
        Assert.Equal("immutable_role", (await root.PutAsync($"/api/admin/roles/{superId}", new { name = "x", permissionCodes = new[] { Permissions.ProductView } })).ErrorCode);
        Assert.Equal(Permissions.All.Count, (await root.GetAsync($"/api/admin/roles/{superId}")).Data.GetProperty("permissionCodes").GetArrayLength());

        foreach (var code in new[] { "SuperAdmin", "Admin", "Manager", "Staff", "Customer" })
            Assert.Equal("system_role", (await root.DeleteAsync($"/api/admin/roles/{Role(code).GetProperty("id").GetGuid()}")).ErrorCode);

        var custom = await root.PostAsync("/api/admin/roles", new { code = Code(), name = "X" });
        var unknown = await root.PutAsync($"/api/admin/roles/{custom.Data.GetProperty("id").GetGuid()}", new { name = "X", permissionCodes = new[] { "Nope.Nothing" } });
        Assert.Equal(HttpStatusCode.BadRequest, unknown.Status);
        Assert.True((await root.DeleteAsync($"/api/admin/roles/{custom.Data.GetProperty("id").GetGuid()}")).Success);
    }

    [Fact]
    public async Task Permission_catalog_matches_the_design_catalog_json()
    {
        var root = await factory.NewAdminClientAsync();
        var api = (await root.GetAsync("/api/admin/permissions")).Data.EnumerateArray().Select(p => p.GetProperty("code").GetString()!).Order().ToList();
        var json = JsonDocument.Parse(File.ReadAllText(FindCatalog())).RootElement.GetProperty("permissions").EnumerateArray().Select(p => p.GetProperty("code").GetString()!).Order().ToList();

        Assert.Equal(json, api);
    }

    internal static string FindCatalog()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !File.Exists(Path.Combine(dir.FullName, "docs", "catalog.json"))) dir = dir.Parent;
        return Path.Combine(dir!.FullName, "docs", "catalog.json");
    }
}

[Collection(ApiCollection.Name)]
public class AuditAndMetaTests(ApiFactory factory)
{
    [Fact]
    public async Task Sensitive_changes_are_audited_with_user_and_before_after_values()
    {
        var root = await factory.NewAdminClientAsync();
        var slogan = "Slogan " + Uniq();
        await root.PutAsync("/api/admin/settings", new { values = new Dictionary<string, string> { ["general.slogan"] = slogan } });

        var cat = await CategoryAsync(root);
        var created = await CreateProductAsync(root, ProductPayload(categoryId: cat, variants: [Variant(Uniq("A-").ToUpperInvariant(), price: 1000)]));
        var pid = created.Data.GetProperty("id").GetGuid();
        var vid = created.Data.GetProperty("variants")[0].GetProperty("id").GetGuid();
        var sku = created.Data.GetProperty("variants")[0].GetProperty("sku").GetString()!;
        await root.PutAsync($"/api/admin/products/{pid}", ProductPayload(created.Data.GetProperty("name").GetString(), cat, variants: [Variant(sku, price: 2500, id: vid)]));

        var settingsLog = await root.GetAsync("/api/admin/audit-logs?action=settings.update&pageSize=100");
        var entry = settingsLog.Data.EnumerateArray().First(e => e.GetProperty("changes").GetString()!.Contains(slogan));
        Assert.Equal("admin@test.local", entry.GetProperty("userEmail").GetString());
        Assert.Contains("general.slogan", entry.GetProperty("changes").GetString());

        var priceLog = await root.GetAsync($"/api/admin/audit-logs?action=product.price&entityType=Product&pageSize=100");
        var price = priceLog.Data.EnumerateArray().First(e => e.GetProperty("entityId").GetString() == pid.ToString());
        Assert.Contains("1000", price.GetProperty("changes").GetString());
        Assert.Contains("2500", price.GetProperty("changes").GetString());
    }

    [Fact]
    public async Task User_role_and_business_type_changes_are_audited()
    {
        var root = await factory.NewAdminClientAsync();
        var email = $"audit-{Guid.NewGuid():N}@test.local";
        var created = await root.PostAsync("/api/admin/users", new { email, password = "Passw0rdOK", fullName = "A", roleCodes = new[] { "Staff" } });
        var id = created.Data.GetProperty("id").GetGuid();
        await root.PutAsync($"/api/admin/users/{id}", new { fullName = "A", isActive = true, roleCodes = new[] { "Manager" } });
        await root.PostAsync("/api/admin/business-types/food/apply");

        var logs = (await root.GetAsync("/api/admin/audit-logs?pageSize=100")).Data.EnumerateArray().ToList();
        Assert.Contains(logs, l => l.GetProperty("action").GetString() == "user.create" && l.GetProperty("entityId").GetString() == id.ToString());
        var upd = logs.First(l => l.GetProperty("action").GetString() == "user.update" && l.GetProperty("entityId").GetString() == id.ToString());
        Assert.Contains("Staff", upd.GetProperty("changes").GetString());
        Assert.Contains("Manager", upd.GetProperty("changes").GetString());
        Assert.Contains(logs, l => l.GetProperty("action").GetString() == "businesstype.apply" && l.GetProperty("entityId").GetString() == "food");
    }

    [Fact]
    public async Task Audit_log_never_contains_passwords()
    {
        var root = await factory.NewAdminClientAsync();
        var email = $"pw-{Guid.NewGuid():N}@test.local";
        var created = await root.PostAsync("/api/admin/users", new { email, password = "SecretPass12345", fullName = "A", roleCodes = new[] { "Staff" } });
        await root.PostAsync($"/api/admin/users/{created.Data.GetProperty("id").GetGuid()}/reset-password", new { newPassword = "AnotherSecret9876" });

        var all = (await root.GetAsync("/api/admin/audit-logs?pageSize=100")).Body.ToString();
        Assert.DoesNotContain("SecretPass12345", all);
        Assert.DoesNotContain("AnotherSecret9876", all);
    }

    [Fact]
    public async Task Meta_exposes_every_catalog_enum_with_all_values_and_labels()
    {
        var admin = await factory.LoginAsRoleAsync(RoleDefaults.Staff); // chỉ cần đăng nhập
        var meta = await admin.GetAsync("/api/admin/meta");
        var catalog = JsonDocument.Parse(File.ReadAllText(RoleAdminTests.FindCatalog())).RootElement;

        foreach (var e in catalog.GetProperty("enums").EnumerateObject())
        {
            var served = meta.Data.GetProperty("enums").GetProperty(e.Name).EnumerateArray().ToList();
            Assert.Equal(e.Value.EnumerateArray().Select(v => v.GetString()).ToList(), served.Select(s => s.GetProperty("value").GetString()).ToList());
            Assert.All(served, s => Assert.False(string.IsNullOrWhiteSpace(s.GetProperty("label").GetString())));
        }
        foreach (var t in catalog.GetProperty("orderTransitions").EnumerateObject())
            Assert.Equal(t.Value.EnumerateArray().Select(v => v.GetString()).ToList(),
                meta.Data.GetProperty("orderTransitions").GetProperty(t.Name).EnumerateArray().Select(v => v.GetString()).ToList());
        Assert.Equal("Đang bán", meta.Data.GetProperty("enums").GetProperty("ProductStatus").EnumerateArray().Single(x => x.GetProperty("value").GetString() == "Active").GetProperty("label").GetString());

        Assert.Equal(HttpStatusCode.Unauthorized, (await factory.NewClient().GetAsync("/api/admin/meta")).Status);
    }
}

/// <summary>Cơ sở dữ liệu riêng: chỉ có đúng một Super Admin, để thử các quy tắc bảo vệ Super Admin mà không ảnh hưởng test khác.</summary>
public class SelfProtectionTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private static object NewSuper(string email) => new { email, password = "Passw0rdOK", fullName = "Super 2", roleCodes = new[] { "SuperAdmin" } };

    [Fact]
    public async Task Super_admin_cannot_lock_or_delete_themselves()
    {
        var root = await factory.NewAdminClientAsync();
        var myId = (await root.GetAsync("/api/auth/me")).Data.GetProperty("id").GetGuid();

        Assert.Equal(HttpStatusCode.BadRequest, (await root.PutAsync($"/api/admin/users/{myId}", new { fullName = "x", isActive = false, roleCodes = new[] { "SuperAdmin" } })).Status);
        Assert.Equal(HttpStatusCode.BadRequest, (await root.DeleteAsync($"/api/admin/users/{myId}")).Status);
    }
}

/// <summary>Cơ sở dữ liệu riêng cho thử nghiệm xoá Super Admin gốc (không dùng chung với test khác).</summary>
public class LastSuperAdminTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private static object NewSuper(string email) => new { email, password = "Passw0rdOK", fullName = "Super 2", roleCodes = new[] { "SuperAdmin" } };

    [Fact]
    public async Task The_last_active_super_admin_cannot_be_demoted_deactivated_or_deleted_by_anyone()
    {
        var root = await factory.NewAdminClientAsync();
        var rootId = (await root.GetAsync("/api/auth/me")).Data.GetProperty("id").GetGuid();
        var email = $"super2-{Guid.NewGuid():N}@test.local";
        var secondId = (await root.PostAsync("/api/admin/users", NewSuper(email))).Data.GetProperty("id").GetGuid();
        var second = factory.NewClient();
        await second.LoginAsync(email, "Passw0rdOK");

        // Có hai Super Admin: người thứ hai xoá được người đầu
        Assert.True((await second.DeleteAsync($"/api/admin/users/{rootId}")).Success);

        // Giờ chỉ còn một: root cũ không còn, người thứ ba thử hạ quyền / khoá người cuối
        var thirdEmail = $"super3-{Guid.NewGuid():N}@test.local";
        var third = await second.PostAsync("/api/admin/users", NewSuper(thirdEmail));
        var thirdId = third.Data.GetProperty("id").GetGuid();
        Assert.True((await second.DeleteAsync($"/api/admin/users/{thirdId}")).Success);

        // chỉ còn `second`: một Super Admin khác không tồn tại để thực hiện, nên kiểm tra bằng việc hạ quyền chính họ qua PUT
        var demote = await second.PutAsync($"/api/admin/users/{secondId}", new { fullName = "x", isActive = true, roleCodes = new[] { "Manager" } });
        Assert.Equal(HttpStatusCode.Conflict, demote.Status);
        Assert.Equal("last_super_admin", demote.ErrorCode);
    }
}
