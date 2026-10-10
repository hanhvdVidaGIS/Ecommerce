using System.Net;
using System.Text.Json;
using Ccp.Domain.Entities;
using Ccp.Domain.Enums;
using Ccp.Domain.Security;
using Ccp.Tests.Infrastructure;
using Microsoft.EntityFrameworkCore;
using static Ccp.Tests.Infrastructure.CatalogApi;

namespace Ccp.Tests;

[Collection(ApiCollection.Name)]
public class BannerTests(ApiFactory factory)
{
    private static object Body(string title, string status = "Published", DateTime? start = null, DateTime? end = null, string placement = "hero",
        string? url = "/products?category=summer", Guid? desktop = null, Guid? mobile = null, int sort = 0) =>
        new { title, subtitle = "Phụ đề", buttonText = "Mua ngay", buttonUrl = url, startAt = start, endAt = end, placement, status, sortOrder = sort, desktopMediaId = desktop, mobileMediaId = mobile };

    private async Task<Guid> UploadAsync(TestClient admin)
    {
        var up = await admin.SendAsync(HttpMethod.Post, "/api/admin/media", null, content: SampleFiles.Form(null, ("b.png", "image/png", SampleFiles.Png())));
        return up.Data.GetProperty("items")[0].GetProperty("id").GetGuid();
    }

    private static List<string> PublicTitles(ApiResult site) => site.Data.GetProperty("banners").EnumerateArray().Select(b => b.GetProperty("title").GetString()!).ToList();

    [Fact]
    public async Task Banner_with_images_shows_on_public_config_with_both_image_urls()
    {
        var admin = await factory.NewAdminClientAsync();
        var d = await UploadAsync(admin); var m = await UploadAsync(admin);
        var title = "Summer " + Uniq();
        var r = await admin.PostAsync("/api/admin/banners", Body(title, desktop: d, mobile: m));

        Assert.True(r.Success, r.Body.ToString());
        Assert.True(r.Data.GetProperty("isLive").GetBoolean());
        var site = await factory.NewClient().GetAsync("/api/public/site-config");
        var banner = site.Data.GetProperty("banners").EnumerateArray().Single(b => b.GetProperty("title").GetString() == title);
        Assert.Equal("/products?category=summer", banner.GetProperty("buttonUrl").GetString());
        Assert.Equal(d, banner.GetProperty("desktopImage").GetProperty("id").GetGuid());
        Assert.Equal(m, banner.GetProperty("mobileImage").GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task Draft_scheduled_and_expired_banners_are_not_public()
    {
        var admin = await factory.NewAdminClientAsync();
        var tag = Uniq();
        var now = DateTime.UtcNow;
        await admin.PostAsync("/api/admin/banners", Body($"draft {tag}", "Draft"));
        await admin.PostAsync("/api/admin/banners", Body($"future {tag}", start: now.AddDays(1), end: now.AddDays(2)));
        await admin.PostAsync("/api/admin/banners", Body($"expired {tag}", start: now.AddDays(-3), end: now.AddDays(-1)));
        await admin.PostAsync("/api/admin/banners", Body($"live {tag}", start: now.AddDays(-1), end: now.AddDays(1)));

        var titles = PublicTitles(await factory.NewClient().GetAsync("/api/public/site-config"));
        Assert.Contains($"live {tag}", titles);
        Assert.DoesNotContain($"draft {tag}", titles);
        Assert.DoesNotContain($"future {tag}", titles);
        Assert.DoesNotContain($"expired {tag}", titles);

        var list = await admin.GetAsync($"/api/admin/banners?q={tag}&pageSize=50");
        Assert.Equal(4, list.Meta.GetProperty("total").GetInt32()); // quản trị vẫn thấy cả bốn
    }

    [Theory]
    [InlineData("javascript:alert(1)")]
    [InlineData("//evil.example/x")]
    [InlineData("data:text/html,x")]
    [InlineData("ftp://x.y/z")]
    public async Task Unsafe_button_urls_are_rejected(string url)
    {
        var admin = await factory.NewAdminClientAsync();
        var r = await admin.PostAsync("/api/admin/banners", Body("x", url: url));

        Assert.Equal(HttpStatusCode.BadRequest, r.Status);
        Assert.Contains(r.Body.GetProperty("error").GetProperty("details").EnumerateArray(), d => d.GetProperty("field").GetString() == "buttonUrl");
    }

    [Fact]
    public async Task Date_range_placement_title_and_media_are_validated()
    {
        var admin = await factory.NewAdminClientAsync();
        var now = DateTime.UtcNow;
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsync("/api/admin/banners", Body("x", start: now, end: now.AddDays(-1)))).Status);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsync("/api/admin/banners", Body("x", placement: "footer"))).Status);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsync("/api/admin/banners", Body(""))).Status);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsync("/api/admin/banners", Body("x", desktop: Guid.NewGuid()))).Status);
        Assert.True((await admin.PostAsync("/api/admin/banners", Body("x", url: "https://example.com/sale"))).Success);
    }

    [Fact]
    public async Task Reorder_changes_public_order_and_delete_removes_banner()
    {
        var admin = await factory.NewAdminClientAsync();
        var tag = Uniq();
        var a = (await admin.PostAsync("/api/admin/banners", Body($"A {tag}", sort: 1))).Data.GetProperty("id").GetGuid();
        var b = (await admin.PostAsync("/api/admin/banners", Body($"B {tag}", sort: 2))).Data.GetProperty("id").GetGuid();

        var before = PublicTitles(await factory.NewClient().GetAsync("/api/public/site-config")).Where(t => t.EndsWith(tag)).ToList();
        Assert.Equal([$"A {tag}", $"B {tag}"], before);

        Assert.True((await admin.PostAsync("/api/admin/banners/reorder", new[] { new { id = a, sortOrder = 20 }, new { id = b, sortOrder = 10 } })).Success);
        var after = PublicTitles(await factory.NewClient().GetAsync("/api/public/site-config")).Where(t => t.EndsWith(tag)).ToList();
        Assert.Equal([$"B {tag}", $"A {tag}"], after);

        Assert.True((await admin.DeleteAsync($"/api/admin/banners/{a}")).Success);
        Assert.DoesNotContain($"A {tag}", PublicTitles(await factory.NewClient().GetAsync("/api/public/site-config")));
        Assert.Equal(HttpStatusCode.NotFound, (await admin.GetAsync($"/api/admin/banners/{a}")).Status);
    }

    [Fact]
    public async Task Banner_permissions()
    {
        Assert.Equal(HttpStatusCode.Forbidden, (await (await factory.LoginAsRoleAsync(RoleDefaults.Staff)).PostAsync("/api/admin/banners", Body("x"))).Status);
        Assert.True((await (await factory.LoginAsRoleAsync(RoleDefaults.Manager)).PostAsync("/api/admin/banners", Body("m " + Uniq()))).Success);
        Assert.Equal(HttpStatusCode.Unauthorized, (await factory.NewClient().GetAsync("/api/admin/banners")).Status);
    }
}

[Collection(ApiCollection.Name)]
public class HomepageSectionTests(ApiFactory factory)
{
    [Fact]
    public async Task Every_section_type_is_available_by_default_so_admin_can_toggle_each()
    {
        var admin = await factory.NewAdminClientAsync();
        var list = await admin.GetAsync("/api/admin/homepage-sections");
        var types = list.Data.EnumerateArray().Select(s => s.GetProperty("type").GetString()).ToHashSet();

        Assert.True(Enum.GetNames<HomepageSectionType>().ToHashSet().IsSubsetOf(types!));
    }

    [Fact]
    public async Task Toggle_title_and_order_changes_reach_the_public_site_config()
    {
        var admin = await factory.NewAdminClientAsync();
        var title = "Mới về " + Uniq();
        var created = await admin.PostAsync("/api/admin/homepage-sections", new { type = "NewProducts", title, subtitle = "x", config = new { limit = 8, link = "/products?sort=new" }, isActive = true, sortOrder = 5 });
        Assert.True(created.Success, created.Body.ToString());
        var id = created.Data.GetProperty("id").GetGuid();

        JsonElement Find(ApiResult site) => site.Data.GetProperty("homepageSections").EnumerateArray().FirstOrDefault(s => s.TryGetProperty("id", out var i) && i.GetGuid() == id);
        var s1 = Find(await factory.NewClient().GetAsync("/api/public/site-config"));
        Assert.Equal(title, s1.GetProperty("title").GetString());
        Assert.Equal(8, s1.GetProperty("config").GetProperty("limit").GetInt32());

        await admin.PutAsync($"/api/admin/homepage-sections/{id}", new { type = "NewProducts", title, config = new { limit = 8 }, isActive = false, sortOrder = 5 });
        Assert.Equal(JsonValueKind.Undefined, Find(await factory.NewClient().GetAsync("/api/public/site-config")).ValueKind);
    }

    [Fact]
    public async Task Reorder_sets_exact_order_and_unknown_ids_are_rejected_atomically()
    {
        var admin = await factory.NewAdminClientAsync();
        var a = (await admin.PostAsync("/api/admin/homepage-sections", new { type = "Brands", title = "A", isActive = true, sortOrder = 9001 })).Data.GetProperty("id").GetGuid();
        var b = (await admin.PostAsync("/api/admin/homepage-sections", new { type = "Brands", title = "B", isActive = true, sortOrder = 9002 })).Data.GetProperty("id").GetGuid();

        Assert.True((await admin.PostAsync("/api/admin/homepage-sections/reorder", new[] { new { id = a, sortOrder = 9100 }, new { id = b, sortOrder = 9050 } })).Success);
        var list = (await admin.GetAsync("/api/admin/homepage-sections")).Data.EnumerateArray().Select(s => s.GetProperty("id").GetGuid()).ToList();
        Assert.True(list.IndexOf(b) < list.IndexOf(a));

        var bad = await admin.PostAsync("/api/admin/homepage-sections/reorder", new[] { new { id = a, sortOrder = 1 }, new { id = Guid.NewGuid(), sortOrder = 2 } });
        Assert.Equal(HttpStatusCode.NotFound, bad.Status);
        Assert.Equal(9100, (await admin.GetAsync($"/api/admin/homepage-sections/{a}")).Data.GetProperty("sortOrder").GetInt32());
    }

    [Fact]
    public async Task Invalid_type_and_non_object_config_are_rejected()
    {
        var admin = await factory.NewAdminClientAsync();
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsync("/api/admin/homepage-sections", new { type = "Nope", isActive = true, sortOrder = 0 })).Status);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsync("/api/admin/homepage-sections", new { type = "Hero", config = new[] { 1, 2 }, isActive = true, sortOrder = 0 })).Status);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsync("/api/admin/homepage-sections", new { type = "Hero", config = "text", isActive = true, sortOrder = 0 })).Status);
    }

    [Fact]
    public async Task Section_permissions()
    {
        Assert.Equal(HttpStatusCode.Forbidden, (await (await factory.LoginAsRoleAsync(RoleDefaults.Staff)).GetAsync("/api/admin/homepage-sections")).Status);
        Assert.True((await (await factory.LoginAsRoleAsync(RoleDefaults.Manager)).GetAsync("/api/admin/homepage-sections")).Success);
    }
}

[Collection(ApiCollection.Name)]
public class MenuTests(ApiFactory factory)
{
    private static object Item(string title, string type = "Url", Guid? target = null, string? url = "/x", object[]? children = null, Guid? id = null, bool active = true) =>
        new { id, title, targetType = type, targetId = target, url = type == "Url" ? url : null, isActive = active, children = children ?? [] };

    private async Task<Guid> NewMenuAsync(TestClient admin)
    {
        var r = await admin.PostAsync("/api/admin/menus", new { code = "m" + Guid.NewGuid().ToString("N")[..10], name = "Menu thử" });
        return r.Data.GetProperty("id").GetGuid();
    }

    private static JsonElement PublicMenu(ApiResult site, string code) =>
        site.Data.GetProperty("menus").EnumerateArray().Single(m => m.GetProperty("code").GetString() == code);

    [Fact]
    public async Task System_menus_exist_and_cannot_be_deleted()
    {
        var admin = await factory.NewAdminClientAsync();
        var menus = (await admin.GetAsync("/api/admin/menus")).Data.EnumerateArray().ToList();
        foreach (var code in new[] { "header", "footer" })
        {
            var m = menus.Single(x => x.GetProperty("code").GetString() == code);
            var del = await admin.DeleteAsync($"/api/admin/menus/{m.GetProperty("id").GetGuid()}");
            Assert.Equal("system_menu", del.ErrorCode);
        }
    }

    [Fact]
    public async Task Tree_with_category_page_and_url_targets_resolves_slugs_publicly()
    {
        var admin = await factory.NewAdminClientAsync();
        var cat = await CategoryAsync(admin, "Menu cat " + Uniq());
        var page = await admin.PostAsync("/api/admin/pages", new { title = "Giới thiệu " + Uniq(), content = "<p>x</p>", status = "Published" });
        var pageId = page.Data.GetProperty("id").GetGuid();
        var menuId = await NewMenuAsync(admin);
        var code = (await admin.GetAsync($"/api/admin/menus/{menuId}")).Data.GetProperty("code").GetString()!;

        var save = await admin.PutAsync($"/api/admin/menus/{menuId}", new
        {
            name = "Menu thử", items = new[]
            {
                Item("Danh mục", "Category", cat, children: [Item("Con", "Url", url: "https://example.com")]),
                Item("Trang", "Page", pageId), Item("Khuyến mãi", url: "/khuyen-mai"),
            },
        });
        Assert.True(save.Success, save.Body.ToString());

        var pub = PublicMenu(await factory.NewClient().GetAsync("/api/public/site-config"), code).GetProperty("items");
        Assert.Equal(["Danh mục", "Trang", "Khuyến mãi"], pub.EnumerateArray().Select(i => i.GetProperty("title").GetString()!).ToArray());
        Assert.Equal((await admin.GetAsync($"/api/admin/categories/{cat}")).Data.GetProperty("slug").GetString(), pub[0].GetProperty("slug").GetString());
        Assert.Equal(page.Data.GetProperty("slug").GetString(), pub[1].GetProperty("slug").GetString());
        Assert.Equal("https://example.com", pub[0].GetProperty("children")[0].GetProperty("url").GetString());
    }

    [Fact]
    public async Task Resave_keeps_ids_removes_missing_items_and_hides_inactive_or_unpublished_targets()
    {
        var admin = await factory.NewAdminClientAsync();
        var menuId = await NewMenuAsync(admin);
        var code = (await admin.GetAsync($"/api/admin/menus/{menuId}")).Data.GetProperty("code").GetString()!;
        var draft = await admin.PostAsync("/api/admin/pages", new { title = "Nháp " + Uniq(), content = "x", status = "Draft" });

        var first = await admin.PutAsync($"/api/admin/menus/{menuId}", new { name = "M", items = new[] { Item("A"), Item("B"), Item("Nháp", "Page", draft.Data.GetProperty("id").GetGuid()) } });
        var items = first.Data.GetProperty("items").EnumerateArray().ToList();
        var aId = items[0].GetProperty("id").GetGuid();

        var second = await admin.PutAsync($"/api/admin/menus/{menuId}", new { name = "M", items = new[] { Item("A đổi tên", id: aId), Item("C") } });
        var after = second.Data.GetProperty("items").EnumerateArray().ToList();
        Assert.Equal(aId, after[0].GetProperty("id").GetGuid());
        Assert.Equal(["A đổi tên", "C"], after.Select(i => i.GetProperty("title").GetString()!).ToArray());

        var withDraft = await admin.PutAsync($"/api/admin/menus/{menuId}", new { name = "M", items = new[] { Item("Nháp", "Page", draft.Data.GetProperty("id").GetGuid()), Item("Hiện") } });
        Assert.True(withDraft.Success);
        var pub = PublicMenu(await factory.NewClient().GetAsync("/api/public/site-config"), code).GetProperty("items");
        Assert.Equal(["Hiện"], pub.EnumerateArray().Select(i => i.GetProperty("title").GetString()!).ToArray()); // trang chưa xuất bản không hiện

        var foreign = await admin.PutAsync($"/api/admin/menus/{menuId}", new { name = "M", items = new[] { Item("X", id: Guid.NewGuid()) } });
        Assert.Equal(HttpStatusCode.BadRequest, foreign.Status);
    }

    [Fact]
    public async Task Invalid_menus_are_rejected()
    {
        var admin = await factory.NewAdminClientAsync();
        var menuId = await NewMenuAsync(admin);
        Task<ApiResult> Save(params object[] items) => admin.PutAsync($"/api/admin/menus/{menuId}", new { name = "M", items });

        Assert.Equal(HttpStatusCode.BadRequest, (await Save(Item("x", url: "javascript:alert(1)"))).Status);
        Assert.Equal(HttpStatusCode.BadRequest, (await Save(Item("x", "Category", null))).Status);
        Assert.Equal(HttpStatusCode.BadRequest, (await Save(Item("x", "Category", Guid.NewGuid()))).Status);
        Assert.Equal(HttpStatusCode.BadRequest, (await Save(Item("x", "Page", Guid.NewGuid()))).Status);
        Assert.Equal(HttpStatusCode.BadRequest, (await Save(Item("x", "Banana"))).Status);
        Assert.Equal(HttpStatusCode.BadRequest, (await Save(Item(""))).Status);
        Assert.Equal(HttpStatusCode.BadRequest, (await Save(Item("1", children: [Item("2", children: [Item("3", children: [Item("4")])])]))).Status); // sâu 4 cấp
        Assert.Equal(HttpStatusCode.BadRequest, (await Save(Enumerable.Range(0, 101).Select(i => Item("i" + i)).ToArray())).Status);

        var dup = await admin.PostAsync("/api/admin/menus", new { code = "header", name = "x" });
        Assert.Equal("code_taken", dup.ErrorCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsync("/api/admin/menus", new { code = "Bad Code", name = "x" })).Status);
    }

    [Fact]
    public async Task Category_or_page_used_by_a_menu_cannot_be_deleted()
    {
        var admin = await factory.NewAdminClientAsync();
        var cat = await CategoryAsync(admin);
        var page = (await admin.PostAsync("/api/admin/pages", new { title = "P " + Uniq(), content = "x", status = "Published" })).Data.GetProperty("id").GetGuid();
        var menuId = await NewMenuAsync(admin);
        await admin.PutAsync($"/api/admin/menus/{menuId}", new { name = "M", items = new[] { Item("C", "Category", cat), Item("P", "Page", page) } });

        Assert.Equal("in_use", (await admin.DeleteAsync($"/api/admin/categories/{cat}")).ErrorCode);
        Assert.Equal("in_use", (await admin.DeleteAsync($"/api/admin/pages/{page}")).ErrorCode);

        await admin.PutAsync($"/api/admin/menus/{menuId}", new { name = "M", items = Array.Empty<object>() });
        Assert.True((await admin.DeleteAsync($"/api/admin/categories/{cat}")).Success);
        Assert.True((await admin.DeleteAsync($"/api/admin/pages/{page}")).Success);
        Assert.True((await admin.DeleteAsync($"/api/admin/menus/{menuId}")).Success);
    }
}

[Collection(ApiCollection.Name)]
public class PageTests(ApiFactory factory)
{
    [Fact]
    public async Task Content_is_sanitized_and_only_published_pages_are_public()
    {
        var admin = await factory.NewAdminClientAsync();
        var title = "Chính sách " + Uniq();
        var r = await admin.PostAsync("/api/admin/pages", new
        {
            title, content = "<h2>Đổi trả</h2><p onclick=\"x()\">7 ngày</p><script>alert(1)</script><iframe src=\"https://evil\"></iframe>",
            status = "Draft", seo = new { metaTitle = "Chính sách đổi trả", noIndex = false },
        });
        Assert.True(r.Success, r.Body.ToString());
        var slug = r.Data.GetProperty("slug").GetString()!;
        var html = r.Data.GetProperty("content").GetString()!;
        Assert.Contains("<h2>Đổi trả</h2>", html);
        Assert.DoesNotContain("script", html, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("iframe", html, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("onclick", html, StringComparison.OrdinalIgnoreCase);
        Assert.Equal("Chính sách đổi trả", r.Data.GetProperty("seo").GetProperty("metaTitle").GetString());

        var anon = factory.NewClient();
        Assert.Equal(HttpStatusCode.NotFound, (await anon.GetAsync($"/api/public/pages/{slug}")).Status);

        var id = r.Data.GetProperty("id").GetGuid();
        await admin.PutAsync($"/api/admin/pages/{id}", new { title, slug, content = "<p>ok</p>", status = "Published" });
        var pub = await anon.GetAsync($"/api/public/pages/{slug}");
        Assert.True(pub.Success);
        Assert.Equal("<p>ok</p>", pub.Data.GetProperty("content").GetString());

        await admin.PutAsync($"/api/admin/pages/{id}", new { title, slug, content = "<p>ok</p>", status = "Draft" });
        Assert.Equal(HttpStatusCode.NotFound, (await anon.GetAsync($"/api/public/pages/{slug}")).Status);
    }

    [Fact]
    public async Task Slug_rules_search_and_permissions()
    {
        var admin = await factory.NewAdminClientAsync();
        var tag = Uniq();
        var a = await admin.PostAsync("/api/admin/pages", new { title = $"Liên hệ {tag}", content = "x", status = "Published" });
        Assert.StartsWith("lien-he-", a.Data.GetProperty("slug").GetString());
        var dup = await admin.PostAsync("/api/admin/pages", new { title = "Khác", slug = a.Data.GetProperty("slug").GetString(), content = "x", status = "Draft" });
        Assert.Equal("slug_taken", dup.ErrorCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsync("/api/admin/pages", new { title = "", content = "x", status = "Draft" })).Status);

        var found = await admin.GetAsync($"/api/admin/pages?q={tag}&status=Published");
        Assert.Equal(1, found.Meta.GetProperty("total").GetInt32());

        var staff = await factory.LoginAsRoleAsync(RoleDefaults.Staff);
        Assert.Equal(HttpStatusCode.Forbidden, (await staff.GetAsync("/api/admin/pages")).Status);
    }
}
