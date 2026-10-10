using Ccp.Domain.Enums;
using Ccp.Tests.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Ccp.Tests;

[Collection(DemoCollection.Name)]
public class SitemapTests(DemoApiFactory factory)
{
    [Fact]
    public async Task Sitemap_lists_exactly_what_a_visitor_can_see()
    {
        var r = await factory.NewClient().GetAsync("/api/public/sitemap");
        Assert.True(r.Success, r.Body.ToString());

        var slugs = (string name) => r.Data.GetProperty(name).EnumerateArray().Select(e => e.GetProperty("slug").GetString()!).ToList();
        var expectedProducts = await factory.WithDbAsync(db => db.Products
            .Where(p => p.Status == ProductStatus.Active && p.Variants.Any(v => v.IsActive)).Select(p => p.Slug).ToListAsync());
        var expectedPages = await factory.WithDbAsync(db => db.Pages.Where(p => p.Status == PublishStatus.Published).Select(p => p.Slug).ToListAsync());
        var expectedCategories = await factory.WithDbAsync(db => db.Categories.Where(c => c.IsActive).Select(c => c.Slug).ToListAsync());

        Assert.Equal(expectedProducts.Order().ToList(), slugs("products").Order().ToList());
        Assert.Equal(expectedPages.Order().ToList(), slugs("pages").Order().ToList());
        Assert.Equal(expectedCategories.Order().ToList(), slugs("categories").Order().ToList());
        Assert.NotEmpty(slugs("products"));
        Assert.All(r.Data.GetProperty("products").EnumerateArray(), e => Assert.True(e.GetProperty("updatedAt").GetDateTime() > new DateTime(2020, 1, 1)));
    }

    [Fact]
    public async Task Hidden_products_and_draft_pages_are_not_in_the_sitemap()
    {
        var admin = await factory.NewAdminClientAsync();
        var hidden = await SalesApi.ProductAsync(admin, status: "Hidden");
        var slug = (await admin.GetAsync($"/api/admin/products/{hidden.ProductId}")).Data.GetProperty("slug").GetString();
        var draft = await admin.PostAsync("/api/admin/pages", new { title = "Trang nháp thử " + Guid.NewGuid().ToString("N")[..6], content = "<p>x</p>", status = "Draft" });
        Assert.True(draft.Success, draft.Body.ToString());

        // Dữ liệu sitemap được đệm vài phút nên cần xoá đệm bằng thao tác ghi nội dung; kiểm tra ở mức khẳng định phủ định
        // (thứ chưa từng được công khai thì không bao giờ xuất hiện, dù đệm cũ hay mới).
        var r = await factory.NewClient().GetAsync("/api/public/sitemap");
        Assert.DoesNotContain(slug, r.Data.GetProperty("products").EnumerateArray().Select(e => e.GetProperty("slug").GetString()));
        Assert.DoesNotContain(draft.Data.GetProperty("slug").GetString(), r.Data.GetProperty("pages").EnumerateArray().Select(e => e.GetProperty("slug").GetString()));
    }
}
