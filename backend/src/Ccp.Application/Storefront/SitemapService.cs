using Ccp.Application.Abstractions;
using Ccp.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Ccp.Application.Storefront;

public sealed record SitemapEntryDto(string Slug, DateTime UpdatedAt);
public sealed record SitemapDto(IReadOnlyList<SitemapEntryDto> Products, IReadOnlyList<SitemapEntryDto> Categories, IReadOnlyList<SitemapEntryDto> Pages, IReadOnlyList<SitemapEntryDto> Posts);

/// <summary>Danh sách địa chỉ công khai cho sitemap.xml của Storefront: chỉ những gì khách thật sự xem được (cùng quy tắc hiển thị với danh sách sản phẩm).</summary>
public class SitemapService(IAppDbContext db, ISiteCache cache, TimeProvider clock)
{
    private const int MaxEntries = 40_000; // giới hạn của một sitemap là 50.000 địa chỉ

    public Task<SitemapDto> GetAsync(CancellationToken ct = default) => cache.GetOrCreateAsync("sitemap", async () =>
    {
        var products = await db.Products.AsNoTracking()
            .Where(p => p.Status == ProductStatus.Active && (p.PrimaryCategory == null || p.PrimaryCategory.IsActive) && p.Variants.Any(v => v.IsActive))
            .OrderBy(p => p.Slug).Take(MaxEntries).Select(p => new SitemapEntryDto(p.Slug, p.UpdatedAt ?? p.CreatedAt)).ToListAsync(ct);
        var categories = await db.Categories.AsNoTracking().Where(c => c.IsActive).OrderBy(c => c.Slug).Take(MaxEntries).Select(c => new SitemapEntryDto(c.Slug, c.UpdatedAt ?? c.CreatedAt)).ToListAsync(ct);
        var pages = await db.Pages.AsNoTracking().Where(p => p.Status == PublishStatus.Published && !p.Seo.NoIndex).OrderBy(p => p.Slug).Take(MaxEntries).Select(p => new SitemapEntryDto(p.Slug, p.UpdatedAt ?? p.CreatedAt)).ToListAsync(ct);
        var now = clock.GetUtcNow().UtcDateTime;
        var posts = await db.Posts.AsNoTracking().Where(p => p.Status == PublishStatus.Published && p.PublishedAt != null && p.PublishedAt <= now && !p.Seo.NoIndex)
            .OrderBy(p => p.Slug).Take(MaxEntries).Select(p => new SitemapEntryDto(p.Slug, p.UpdatedAt ?? p.PublishedAt!.Value)).ToListAsync(ct);
        return new SitemapDto(products, categories, pages, posts);
    });
}
