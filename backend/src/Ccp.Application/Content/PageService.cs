using System.Linq.Expressions;
using Ccp.Application.Abstractions;
using Ccp.Application.Common;
using Ccp.Domain.Entities;
using Ccp.Domain.Enums;
using FluentValidation;
using Microsoft.EntityFrameworkCore;

namespace Ccp.Application.Content;

public sealed record PageListItemDto(Guid Id, string Title, string Slug, PublishStatus Status, DateTime CreatedAt, DateTime? UpdatedAt);
public sealed record PageDto(Guid Id, string Title, string Slug, string Content, PublishStatus Status, SeoDto Seo);
public sealed record SavePageRequest(string Title, string? Slug, string? Content, PublishStatus Status, SeoDto? Seo);

public sealed class PageQuery : PageRequest
{
    public PublishStatus? Status { get; set; }
}

public sealed class SavePageRequestValidator : AbstractValidator<SavePageRequest>
{
    public SavePageRequestValidator()
    {
        RuleFor(x => x.Title).NotEmpty().MaximumLength(200).WithMessage("Tiêu đề là bắt buộc (tối đa 200 ký tự).");
        RuleFor(x => x.Content).MaximumLength(500_000);
        RuleFor(x => x.Status).IsInEnum();
    }
}

public class PageService(IAppDbContext db, IHtmlSanitizerService sanitizer, MediaResolver media, ISiteCache cache)
{
    private static readonly IReadOnlyDictionary<string, Expression<Func<Page, object?>>> Sorts = new Dictionary<string, Expression<Func<Page, object?>>>
    {
        ["title"] = p => p.Title, ["createdAt"] = p => p.CreatedAt, ["status"] = p => p.Status,
    };

    public async Task<PagedResult<PageListItemDto>> ListAsync(PageQuery q, CancellationToken ct = default)
    {
        var query = db.Pages.AsNoTracking().AsQueryable();
        if (q.Status is not null) query = query.Where(p => p.Status == q.Status);
        if (!string.IsNullOrWhiteSpace(q.Q)) { var t = q.Q.Trim().ToLower(); query = query.Where(p => p.Title.ToLower().Contains(t) || p.Slug.Contains(t)); }
        var page = await query.ApplySort(q.Sort, Sorts, "title:asc").ToPagedAsync(q, ct);
        return new PagedResult<PageListItemDto>(page.Items.Select(p => new PageListItemDto(p.Id, p.Title, p.Slug, p.Status, p.CreatedAt, p.UpdatedAt)).ToList(), page.Page, page.PageSize, page.Total);
    }

    public async Task<PageDto> GetAsync(Guid id, CancellationToken ct = default)
    {
        var p = await db.Pages.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw AppException.NotFound("trang");
        return ToDto(p);
    }

    /// <summary>Trang đã xuất bản, dùng cho Storefront.</summary>
    public async Task<PageDto> GetPublishedBySlugAsync(string slug, CancellationToken ct = default)
    {
        var p = await db.Pages.AsNoTracking().SingleOrDefaultAsync(x => x.Slug == slug && x.Status == PublishStatus.Published, ct) ?? throw AppException.NotFound("trang");
        return ToDto(p);
    }

    public async Task<PageDto> CreateAsync(SavePageRequest req, CancellationToken ct = default)
    {
        var page = new Page();
        await ApplyAsync(page, req, ct);
        db.Pages.Add(page);
        await db.SaveChangesAsync(ct);
        cache.InvalidateAll();
        return ToDto(page);
    }

    public async Task<PageDto> UpdateAsync(Guid id, SavePageRequest req, CancellationToken ct = default)
    {
        var page = await db.Pages.SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw AppException.NotFound("trang");
        await ApplyAsync(page, req, ct);
        await db.SaveChangesAsync(ct);
        cache.InvalidateAll();
        return ToDto(page);
    }

    public async Task DeleteAsync(Guid id, CancellationToken ct = default)
    {
        var page = await db.Pages.SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw AppException.NotFound("trang");
        if (await db.MenuItems.AnyAsync(m => m.TargetType == MenuTargetTypes.Page && m.TargetId == id, ct))
            throw AppException.Conflict("Trang đang được dùng trong menu. Gỡ khỏi menu trước.", "in_use");
        db.Pages.Remove(page);
        await db.SaveChangesAsync(ct);
        cache.InvalidateAll();
    }

    private async Task ApplyAsync(Page p, SavePageRequest req, CancellationToken ct)
    {
        var title = req.Title.Trim();
        var slug = SlugRules.Resolve(req.Slug, title);
        if (await db.Pages.AnyAsync(x => x.Slug == slug && x.Id != p.Id, ct)) throw AppException.Conflict("Slug đã được dùng bởi trang khác.", "slug_taken");
        await media.EnsureExistAsync("seo.ogImageMediaId", [req.Seo?.OgImageMediaId], ct);
        p.Title = title; p.Slug = slug; p.Status = req.Status;
        p.Content = sanitizer.Sanitize(req.Content);
        (req.Seo ?? new SeoDto(null, null, null, null, null, false)).ApplyTo(p.Seo);
    }

    private static PageDto ToDto(Page p) => new(p.Id, p.Title, p.Slug, p.Content, p.Status, SeoDto.From(p.Seo));
}
