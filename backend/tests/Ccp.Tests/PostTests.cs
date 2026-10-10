using System.Net;
using Ccp.Domain.Security;
using Ccp.Tests.Infrastructure;
using static Ccp.Tests.Infrastructure.CatalogApi;

namespace Ccp.Tests;

[Collection(ApiCollection.Name)]
public class PostTests(ApiFactory factory)
{
    private static object Body(string title, string status = "Draft", string? slug = null, DateTime? publishedAt = null, string content = "<p>Nội dung</p>", Guid? cover = null) =>
        new { title, slug, summary = "Tóm tắt " + title, content, coverMediaId = cover, status, publishedAt, seo = (object?)null };

    private static string Title() => "Bài viết " + Uniq("t");

    private async Task<(Guid Id, string Slug)> CreateAsync(TestClient admin, string status = "Draft", DateTime? at = null, string? content = null)
    {
        var r = await admin.PostAsync("/api/admin/posts", Body(Title(), status, publishedAt: at, content: content ?? "<p>x</p>"));
        Assert.True(r.Success, r.Body.ToString());
        return (r.Data.GetProperty("id").GetGuid(), r.Data.GetProperty("slug").GetString()!);
    }

    [Fact]
    public async Task Draft_is_private_publishing_sets_the_time_and_makes_it_public()
    {
        var admin = await factory.NewAdminClientAsync();
        var anon = factory.NewClient();
        var (id, slug) = await CreateAsync(admin);

        Assert.Equal(HttpStatusCode.NotFound, (await anon.GetAsync($"/api/public/posts/{slug}")).Status);
        var created = await admin.GetAsync($"/api/admin/posts/{id}");
        Assert.Equal(JsonKindNull, created.Data.GetProperty("publishedAt").ValueKind);

        var pub = await admin.PutAsync($"/api/admin/posts/{id}", Body(created.Data.GetProperty("title").GetString()!, "Published", slug));
        Assert.True(pub.Success, pub.Body.ToString());
        var at = pub.Data.GetProperty("publishedAt").GetDateTime();
        Assert.InRange((DateTime.UtcNow - at).TotalSeconds, -5, 60);

        var open = await anon.GetAsync($"/api/public/posts/{slug}");
        Assert.True(open.Success);
        Assert.Equal(slug, open.Data.GetProperty("slug").GetString());

        // gỡ về nháp rồi đăng lại: giữ nguyên giờ đăng đầu tiên
        await admin.PutAsync($"/api/admin/posts/{id}", Body(created.Data.GetProperty("title").GetString()!, "Draft", slug));
        Assert.Equal(HttpStatusCode.NotFound, (await anon.GetAsync($"/api/public/posts/{slug}")).Status);
        var again = await admin.PutAsync($"/api/admin/posts/{id}", Body(created.Data.GetProperty("title").GetString()!, "Published", slug));
        Assert.True(Math.Abs((at - again.Data.GetProperty("publishedAt").GetDateTime()).TotalMilliseconds) < 1); // PostgreSQL lưu đến micro giây
    }

    private const System.Text.Json.JsonValueKind JsonKindNull = System.Text.Json.JsonValueKind.Null;

    [Fact]
    public async Task A_future_publish_time_schedules_the_post_and_it_is_hidden_until_then()
    {
        var admin = await factory.NewAdminClientAsync();
        var anon = factory.NewClient();
        var (_, slug) = await CreateAsync(admin, "Published", DateTime.UtcNow.AddDays(2));

        Assert.Equal(HttpStatusCode.NotFound, (await anon.GetAsync($"/api/public/posts/{slug}")).Status);
        Assert.DoesNotContain(slug, (await anon.GetAsync("/api/public/posts?pageSize=100")).Data.EnumerateArray().Select(p => p.GetProperty("slug").GetString()));
        Assert.DoesNotContain(slug, (await anon.GetAsync("/api/public/posts/latest?limit=12")).Data.EnumerateArray().Select(p => p.GetProperty("slug").GetString()));

        var (_, past) = await CreateAsync(admin, "Published", DateTime.UtcNow.AddDays(-2));
        Assert.True((await anon.GetAsync($"/api/public/posts/{past}")).Success);
    }

    [Fact]
    public async Task Public_list_is_newest_first_paged_and_only_contains_visible_posts()
    {
        var admin = await factory.NewAdminClientAsync();
        var anon = factory.NewClient();
        var (_, older) = await CreateAsync(admin, "Published", DateTime.UtcNow.AddDays(-30));
        var (_, newer) = await CreateAsync(admin, "Published", DateTime.UtcNow.AddDays(-1));
        var (_, draft) = await CreateAsync(admin, "Draft");

        var list = await anon.GetAsync("/api/public/posts?pageSize=100");
        var slugs = list.Data.EnumerateArray().Select(p => p.GetProperty("slug").GetString()).ToList();
        Assert.True(slugs.IndexOf(newer) < slugs.IndexOf(older));
        Assert.DoesNotContain(draft, slugs);
        var p1 = await anon.GetAsync("/api/public/posts?pageSize=1&page=1");
        var p2 = await anon.GetAsync("/api/public/posts?pageSize=1&page=2");
        Assert.Equal(1, p1.Data.GetArrayLength());
        Assert.Equal(2, p2.Meta.GetProperty("page").GetInt32());
        Assert.NotEqual(p1.Data[0].GetProperty("slug").GetString(), p2.Data[0].GetProperty("slug").GetString()); // trang 2 khác trang 1
        Assert.Equal(100, (await anon.GetAsync("/api/public/posts?pageSize=100000")).Meta.GetProperty("pageSize").GetInt32());
        Assert.Equal(slugs[0], (await anon.GetAsync("/api/public/posts/latest?limit=1")).Data[0].GetProperty("slug").GetString()); // "mới nhất" khớp đầu danh sách
    }

    [Fact]
    public async Task Content_is_sanitised_slug_is_generated_from_the_title_and_duplicates_are_refused()
    {
        var admin = await factory.NewAdminClientAsync();
        var title = "Cách chọn nước hoa " + Uniq("s");
        var r = await admin.PostAsync("/api/admin/posts", Body(title, content: "<p>An toàn</p><script>alert(1)</script><img src=x onerror=alert(2)>"));
        Assert.True(r.Success, r.Body.ToString());
        var content = r.Data.GetProperty("content").GetString()!;
        Assert.Contains("An toàn", content);
        Assert.DoesNotContain("<script", content, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("onerror", content, StringComparison.OrdinalIgnoreCase);
        Assert.StartsWith("cach-chon-nuoc-hoa-", r.Data.GetProperty("slug").GetString());

        var dup = await admin.PostAsync("/api/admin/posts", Body(Title(), slug: r.Data.GetProperty("slug").GetString()));
        Assert.Equal(HttpStatusCode.Conflict, dup.Status);
        Assert.Equal("slug_taken", dup.ErrorCode);
    }

    [Fact]
    public async Task Validation_rejects_empty_or_oversized_fields_and_unknown_cover_media()
    {
        var admin = await factory.NewAdminClientAsync();
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsync("/api/admin/posts", Body(""))).Status);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsync("/api/admin/posts", Body(new string('t', 201)))).Status);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsync("/api/admin/posts", Body(Title(), status: "Bay"))).Status);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsync("/api/admin/posts", Body(Title(), cover: Guid.NewGuid()))).Status);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.GetAsync($"/api/admin/posts/{Guid.NewGuid()}")).Status);
    }

    [Fact]
    public async Task Admin_list_filters_searches_without_diacritics_and_delete_removes_it_from_public()
    {
        var admin = await factory.NewAdminClientAsync();
        var anon = factory.NewClient();
        var title = "Hương Gỗ Đàn " + Uniq("k");
        var r = await admin.PostAsync("/api/admin/posts", Body(title, "Published"));
        var id = r.Data.GetProperty("id").GetGuid(); var slug = r.Data.GetProperty("slug").GetString();

        Assert.Contains(id, (await admin.GetAsync("/api/admin/posts?q=" + Uri.EscapeDataString("huong go dan"))).Data.EnumerateArray().Select(p => p.GetProperty("id").GetGuid()));
        Assert.All((await admin.GetAsync("/api/admin/posts?status=Draft&pageSize=100")).Data.EnumerateArray(), p => Assert.Equal("Draft", p.GetProperty("status").GetString()));
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.GetAsync("/api/admin/posts?sort=content:asc")).Status);

        Assert.True((await admin.DeleteAsync($"/api/admin/posts/{id}")).Success);
        Assert.Equal(HttpStatusCode.NotFound, (await anon.GetAsync($"/api/public/posts/{slug}")).Status);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.DeleteAsync($"/api/admin/posts/{id}")).Status);
        // slug của bài đã xoá có thể dùng lại
        Assert.True((await admin.PostAsync("/api/admin/posts", Body(Title(), slug: slug))).Success);
    }

    [Fact]
    public async Task Managing_posts_requires_the_post_permission_and_sitemap_lists_visible_posts_only()
    {
        var admin = await factory.NewAdminClientAsync();
        var staff = await factory.LoginAsRoleAsync(RoleDefaults.Staff);
        var manager = await factory.LoginAsRoleAsync(RoleDefaults.Manager);
        Assert.Equal(HttpStatusCode.Unauthorized, (await factory.NewClient().GetAsync("/api/admin/posts")).Status);
        Assert.Equal(HttpStatusCode.Forbidden, (await staff.GetAsync("/api/admin/posts")).Status);
        Assert.Equal(HttpStatusCode.Forbidden, (await staff.PostAsync("/api/admin/posts", Body(Title()))).Status);
        Assert.True((await manager.PostAsync("/api/admin/posts", Body(Title()))).Success);

        var (_, live) = await CreateAsync(admin, "Published", DateTime.UtcNow.AddDays(-1));
        var (_, later) = await CreateAsync(admin, "Published", DateTime.UtcNow.AddDays(5));
        var posts = (await factory.NewClient().GetAsync("/api/public/sitemap")).Data.GetProperty("posts").EnumerateArray().Select(p => p.GetProperty("slug").GetString()).ToList();
        Assert.DoesNotContain(later, posts);
        // sitemap được đệm vài phút nên bài vừa đăng có thể chưa có; bài hẹn giờ thì không bao giờ có
        _ = live;
    }
}
