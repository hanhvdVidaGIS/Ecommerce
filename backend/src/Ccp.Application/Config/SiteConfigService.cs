using System.Text.Json;
using Ccp.Application.Abstractions;
using Ccp.Application.Common;
using Ccp.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Ccp.Application.Config;

/// <summary>Dựng cấu hình công khai cho Storefront. Chỉ khoá IsPublic=true được đưa ra.</summary>
public class SiteConfigService(IAppDbContext db, MediaResolver mediaResolver, ISiteCache cache, TimeProvider clock)
{
    public Task<SiteConfigDto> GetAsync(CancellationToken ct = default) =>
        cache.GetOrCreateAsync("site-config", () => BuildAsync(ct));

    private async Task<SiteConfigDto> BuildAsync(CancellationToken ct)
    {
        var rows = await db.WebsiteSettings.AsNoTracking().Where(s => s.IsPublic).ToListAsync(ct);
        var settings = SettingDefinitions.All.Where(d => d.IsPublic)
            .ToDictionary(d => d.Key, d => rows.FirstOrDefault(r => r.Key == d.Key)?.Value ?? d.Default);

        // Ảnh cấu hình (logo, favicon, cover...) được giải thành URL ở đây để Storefront không phải biết cách lưu tệp.
        var mediaKeys = SettingDefinitions.All.Where(d => d.IsPublic && d.Type == SettingValueType.MediaId).Select(d => d.Key).ToList();
        var mediaIds = mediaKeys.Select(k => Guid.TryParse(settings[k], out var g) ? g : (Guid?)null).Where(g => g.HasValue).Select(g => g!.Value).ToList();
        var mediaMap = await mediaResolver.LoadAsync(mediaIds.Select(i => (Guid?)i), ct);
        var media = mediaKeys.ToDictionary(k => k, k => Guid.TryParse(settings[k], out var g) ? mediaMap.GetValueOrDefault(g) : null);

        var code = settings.GetValueOrDefault(SettingKeys.BusinessType, "other");
        var bt = await db.BusinessTypes.AsNoTracking().Where(b => b.Code == code).Select(b => new BusinessTypeInfoDto(b.Code, b.Name)).FirstOrDefaultAsync(ct)
                 ?? new BusinessTypeInfoDto(code, code);

        return new SiteConfigDto(settings, media, bt, await BuildMenusAsync(ct), await BuildSectionsAsync(ct), await BuildBannersAsync(ct));
    }

    private async Task<IReadOnlyList<MenuDto>> BuildMenusAsync(CancellationToken ct)
    {
        var menus = await db.Menus.AsNoTracking().OrderBy(m => m.Code).ToListAsync(ct);
        var items = await db.MenuItems.AsNoTracking().Where(i => i.IsActive).OrderBy(i => i.SortOrder).ToListAsync(ct);
        var categoryIds = items.Where(i => i.TargetType == "Category" && i.TargetId != null).Select(i => i.TargetId!.Value).ToList();
        var pageIds = items.Where(i => i.TargetType == "Page" && i.TargetId != null).Select(i => i.TargetId!.Value).ToList();
        var categorySlugs = await db.Categories.AsNoTracking().Where(c => categoryIds.Contains(c.Id) && c.IsActive).ToDictionaryAsync(c => c.Id, c => c.Slug, ct);
        var pageSlugs = await db.Pages.AsNoTracking().Where(p => pageIds.Contains(p.Id) && p.Status == PublishStatus.Published).ToDictionaryAsync(p => p.Id, p => p.Slug, ct);

        MenuItemDto? Build(Domain.Entities.MenuItem i)
        {
            string? slug = null;
            if (i.TargetType == "Category") { if (i.TargetId is null || !categorySlugs.TryGetValue(i.TargetId.Value, out slug)) return null; }
            else if (i.TargetType == "Page") { if (i.TargetId is null || !pageSlugs.TryGetValue(i.TargetId.Value, out slug)) return null; }
            var children = items.Where(c => c.ParentId == i.Id).Select(Build).Where(c => c is not null).Select(c => c!).ToList();
            return new MenuItemDto(i.Id, i.Title, i.TargetType, slug, i.Url, children);
        }

        return menus.Select(m => new MenuDto(m.Code, m.Name,
            items.Where(i => i.MenuId == m.Id && i.ParentId == null).Select(Build).Where(x => x is not null).Select(x => x!).ToList())).ToList();
    }

    private async Task<IReadOnlyList<HomepageSectionDto>> BuildSectionsAsync(CancellationToken ct)
    {
        var sections = await db.HomepageSections.AsNoTracking().Where(s => s.IsActive).OrderBy(s => s.SortOrder).ToListAsync(ct);
        return sections.Select(s => new HomepageSectionDto(s.Id, s.Type.ToString(), s.Title, s.Subtitle, ParseJson(s.ConfigJson), s.SortOrder)).ToList();
    }

    private async Task<IReadOnlyList<PublicBannerDto>> BuildBannersAsync(CancellationToken ct)
    {
        var now = clock.GetUtcNow().UtcDateTime;
        var banners = await db.Banners.AsNoTracking()
            .Where(b => b.Status == PublishStatus.Published && (b.StartAt == null || b.StartAt <= now) && (b.EndAt == null || b.EndAt >= now))
            .OrderBy(b => b.SortOrder).ToListAsync(ct);
        var ids = banners.SelectMany(b => new[] { b.DesktopMediaId, b.MobileMediaId }).Where(i => i.HasValue).Select(i => i!.Value).Distinct().ToList();
        var map = await mediaResolver.LoadAsync(ids.Select(i => (Guid?)i), ct);
        MediaRefDto? Ref(Guid? id) => id is not null && map.TryGetValue(id.Value, out var m) ? m : null;
        return banners.Select(b => new PublicBannerDto(b.Id, b.Title, b.Subtitle, Ref(b.DesktopMediaId), Ref(b.MobileMediaId),
            b.ButtonText, b.ButtonUrl, b.Placement, b.SortOrder)).ToList();
    }

    private static JsonElement ParseJson(string json)
    {
        try { return JsonDocument.Parse(string.IsNullOrWhiteSpace(json) ? "{}" : json).RootElement.Clone(); }
        catch (JsonException) { return JsonDocument.Parse("{}").RootElement.Clone(); }
    }
}
