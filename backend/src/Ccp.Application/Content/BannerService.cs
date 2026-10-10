using System.Linq.Expressions;
using Ccp.Application.Abstractions;
using Ccp.Application.Common;
using Ccp.Domain.Entities;
using Ccp.Domain.Enums;
using FluentValidation;
using Microsoft.EntityFrameworkCore;

namespace Ccp.Application.Content;

public static class BannerPlacements
{
    public static readonly IReadOnlyList<string> All = ["hero", "slider", "promo"];
}

public static class LinkRules
{
    /// <summary>Liên kết nội bộ (bắt đầu bằng "/") hoặc http/https. Chặn javascript:, data:, //host.</summary>
    public static bool IsSafe(string? url)
    {
        if (string.IsNullOrWhiteSpace(url)) return true;
        var u = url.Trim();
        if (u.StartsWith('/')) return !u.StartsWith("//") && !u.Contains('\\');
        return Uri.TryCreate(u, UriKind.Absolute, out var uri) && uri.Scheme is "http" or "https";
    }
}

public sealed record BannerDto(Guid Id, string Title, string? Subtitle, Guid? DesktopMediaId, MediaRefDto? DesktopImage, Guid? MobileMediaId, MediaRefDto? MobileImage,
    string? ButtonText, string? ButtonUrl, DateTime? StartAt, DateTime? EndAt, string Placement, PublishStatus Status, int SortOrder, bool IsLive);

public sealed record SaveBannerRequest(string Title, string? Subtitle, Guid? DesktopMediaId, Guid? MobileMediaId, string? ButtonText, string? ButtonUrl,
    DateTime? StartAt, DateTime? EndAt, string Placement, PublishStatus Status, int SortOrder);

public sealed class BannerQuery : PageRequest
{
    public string? Placement { get; set; }
    public PublishStatus? Status { get; set; }
}

public sealed class SaveBannerRequestValidator : AbstractValidator<SaveBannerRequest>
{
    public SaveBannerRequestValidator()
    {
        RuleFor(x => x.Title).NotEmpty().MaximumLength(200).WithMessage("Tiêu đề là bắt buộc (tối đa 200 ký tự).");
        RuleFor(x => x.Subtitle).MaximumLength(500);
        RuleFor(x => x.ButtonText).MaximumLength(100);
        RuleFor(x => x.ButtonUrl).MaximumLength(500).Must(LinkRules.IsSafe).WithMessage("Liên kết phải bắt đầu bằng / hoặc http(s)://.");
        RuleFor(x => x.Placement).Must(p => BannerPlacements.All.Contains(p)).WithMessage($"Vị trí hợp lệ: {string.Join(", ", BannerPlacements.All)}.");
        RuleFor(x => x.Status).IsInEnum();
        RuleFor(x => x.EndAt).Must((r, end) => end is null || r.StartAt is null || end > r.StartAt).WithMessage("Ngày kết thúc phải sau ngày bắt đầu.");
    }
}

public class BannerService(IAppDbContext db, MediaResolver media, ISiteCache cache, TimeProvider clock)
{
    private static readonly IReadOnlyDictionary<string, Expression<Func<Banner, object?>>> Sorts = new Dictionary<string, Expression<Func<Banner, object?>>>
    {
        ["sortOrder"] = b => b.SortOrder, ["title"] = b => b.Title, ["createdAt"] = b => b.CreatedAt, ["startAt"] = b => b.StartAt,
    };

    public async Task<PagedResult<BannerDto>> ListAsync(BannerQuery q, CancellationToken ct = default)
    {
        var query = db.Banners.AsNoTracking().AsQueryable();
        if (!string.IsNullOrWhiteSpace(q.Placement)) query = query.Where(b => b.Placement == q.Placement);
        if (q.Status is not null) query = query.Where(b => b.Status == q.Status);
        if (!string.IsNullOrWhiteSpace(q.Q)) { var t = q.Q.Trim().ToLower(); query = query.Where(b => b.Title.ToLower().Contains(t)); }
        var page = await query.ApplySort(q.Sort, Sorts, "sortOrder:asc").ToPagedAsync(q, ct);
        var map = await media.LoadAsync(page.Items.SelectMany(b => new[] { b.DesktopMediaId, b.MobileMediaId }), ct);
        return new PagedResult<BannerDto>(page.Items.Select(b => ToDto(b, map)).ToList(), page.Page, page.PageSize, page.Total);
    }

    public async Task<BannerDto> GetAsync(Guid id, CancellationToken ct = default)
    {
        var b = await db.Banners.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw AppException.NotFound("banner");
        return ToDto(b, await media.LoadAsync([b.DesktopMediaId, b.MobileMediaId], ct));
    }

    public async Task<BannerDto> CreateAsync(SaveBannerRequest req, CancellationToken ct = default)
    {
        var banner = new Banner();
        await ApplyAsync(banner, req, ct);
        db.Banners.Add(banner);
        await db.SaveChangesAsync(ct);
        cache.InvalidateAll();
        return await GetAsync(banner.Id, ct);
    }

    public async Task<BannerDto> UpdateAsync(Guid id, SaveBannerRequest req, CancellationToken ct = default)
    {
        var banner = await db.Banners.SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw AppException.NotFound("banner");
        await ApplyAsync(banner, req, ct);
        await db.SaveChangesAsync(ct);
        cache.InvalidateAll();
        return await GetAsync(id, ct);
    }

    public async Task DeleteAsync(Guid id, CancellationToken ct = default)
    {
        var banner = await db.Banners.SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw AppException.NotFound("banner");
        db.Banners.Remove(banner);
        await db.SaveChangesAsync(ct);
        cache.InvalidateAll();
    }

    public async Task ReorderAsync(IReadOnlyList<SortItem> items, CancellationToken ct = default)
    {
        var ids = items.Select(i => i.Id).ToList();
        var banners = await db.Banners.Where(b => ids.Contains(b.Id)).ToListAsync(ct);
        if (banners.Count != ids.Distinct().Count()) throw AppException.NotFound("banner");
        foreach (var item in items) banners.Single(b => b.Id == item.Id).SortOrder = item.SortOrder;
        await db.SaveChangesAsync(ct);
        cache.InvalidateAll();
    }

    private async Task ApplyAsync(Banner b, SaveBannerRequest req, CancellationToken ct)
    {
        await media.EnsureExistAsync("desktopMediaId", [req.DesktopMediaId], ct);
        await media.EnsureExistAsync("mobileMediaId", [req.MobileMediaId], ct);
        b.Title = req.Title.Trim(); b.Subtitle = Clean(req.Subtitle); b.ButtonText = Clean(req.ButtonText); b.ButtonUrl = Clean(req.ButtonUrl);
        b.DesktopMediaId = req.DesktopMediaId; b.MobileMediaId = req.MobileMediaId;
        b.StartAt = req.StartAt; b.EndAt = req.EndAt; b.Placement = req.Placement; b.Status = req.Status; b.SortOrder = req.SortOrder;
    }

    private BannerDto ToDto(Banner b, IReadOnlyDictionary<Guid, MediaRefDto> map)
    {
        var now = clock.GetUtcNow().UtcDateTime;
        var live = b.Status == PublishStatus.Published && (b.StartAt is null || b.StartAt <= now) && (b.EndAt is null || b.EndAt >= now);
        return new BannerDto(b.Id, b.Title, b.Subtitle, b.DesktopMediaId, MediaResolver.Get(map, b.DesktopMediaId), b.MobileMediaId, MediaResolver.Get(map, b.MobileMediaId),
            b.ButtonText, b.ButtonUrl, b.StartAt, b.EndAt, b.Placement, b.Status, b.SortOrder, live);
    }

    private static string? Clean(string? v) => string.IsNullOrWhiteSpace(v) ? null : v.Trim();
}

public sealed record SortItem(Guid Id, int SortOrder);
