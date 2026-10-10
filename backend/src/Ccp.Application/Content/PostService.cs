using System.Linq.Expressions;
using Ccp.Application.Abstractions;
using Ccp.Application.Common;
using Ccp.Domain.Entities;
using Ccp.Domain.Enums;
using FluentValidation;
using Microsoft.EntityFrameworkCore;

namespace Ccp.Application.Content;

public sealed record PostListItemDto(Guid Id, string Title, string Slug, PublishStatus Status, DateTime? PublishedAt, DateTime CreatedAt, DateTime? UpdatedAt);
public sealed record PostDto(Guid Id, string Title, string Slug, string? Summary, string Content, Guid? CoverMediaId, MediaRefDto? Cover, PublishStatus Status, DateTime? PublishedAt, SeoDto Seo);
public sealed record SavePostRequest(string Title, string? Slug, string? Summary, string? Content, Guid? CoverMediaId, PublishStatus Status, DateTime? PublishedAt, SeoDto? Seo);

public sealed record PublicPostCardDto(string Slug, string Title, string? Summary, MediaRefDto? Cover, DateTime PublishedAt);
public sealed record PublicPostDto(string Slug, string Title, string? Summary, string Content, MediaRefDto? Cover, DateTime PublishedAt, DateTime? UpdatedAt, SeoDto Seo);

public sealed class PostQuery : PageRequest
{
    public PublishStatus? Status { get; set; }
}

public sealed class SavePostRequestValidator : AbstractValidator<SavePostRequest>
{
    public SavePostRequestValidator()
    {
        RuleFor(x => x.Title).NotEmpty().MaximumLength(200).WithMessage("Tiêu đề là bắt buộc (tối đa 200 ký tự).");
        RuleFor(x => x.Summary).MaximumLength(1000);
        RuleFor(x => x.Content).MaximumLength(500_000);
        RuleFor(x => x.Status).IsInEnum();
    }
}

/// <summary>
/// Bài viết blog. Bài chỉ hiện công khai khi trạng thái là Xuất bản và đã đến giờ xuất bản: đặt PublishedAt ở tương lai là hẹn giờ đăng.
/// Nội dung HTML được làm sạch khi lưu.
/// </summary>
public class PostService(IAppDbContext db, IHtmlSanitizerService sanitizer, MediaResolver media, ISiteCache cache, TimeProvider clock)
{
    private static readonly IReadOnlyDictionary<string, Expression<Func<Post, object?>>> Sorts = new Dictionary<string, Expression<Func<Post, object?>>>
    {
        ["title"] = p => p.Title, ["publishedAt"] = p => p.PublishedAt, ["createdAt"] = p => p.CreatedAt, ["status"] = p => p.Status,
    };

    // ---------- quản trị ----------
    public async Task<PagedResult<PostListItemDto>> ListAsync(PostQuery q, CancellationToken ct = default)
    {
        var query = db.Posts.AsNoTracking().AsQueryable();
        if (q.Status is { } st) query = query.Where(p => p.Status == st);
        if (!string.IsNullOrWhiteSpace(q.Q))
        {
            var like = SearchText.LikePattern(SearchText.Fold(q.Q));
            query = query.Where(p => EF.Functions.Like(SqlFunctions.Unaccent(p.Title.ToLower()), like, "\\") || EF.Functions.Like(p.Slug, like, "\\"));
        }
        var page = await query.ApplySort(q.Sort, Sorts, "createdAt:desc").ToPagedAsync(q, ct);
        return new PagedResult<PostListItemDto>(page.Items.Select(p => new PostListItemDto(p.Id, p.Title, p.Slug, p.Status, p.PublishedAt, p.CreatedAt, p.UpdatedAt)).ToList(), page.Page, page.PageSize, page.Total);
    }

    public async Task<PostDto> GetAsync(Guid id, CancellationToken ct = default)
    {
        var p = await db.Posts.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw AppException.NotFound("bài viết");
        return await ToDtoAsync(p, ct);
    }

    public async Task<PostDto> CreateAsync(SavePostRequest req, CancellationToken ct = default)
    {
        var post = new Post();
        await ApplyAsync(post, req, ct);
        db.Posts.Add(post);
        await db.SaveChangesAsync(ct);
        cache.InvalidateAll();
        return await ToDtoAsync(post, ct);
    }

    public async Task<PostDto> UpdateAsync(Guid id, SavePostRequest req, CancellationToken ct = default)
    {
        var post = await db.Posts.SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw AppException.NotFound("bài viết");
        await ApplyAsync(post, req, ct);
        await db.SaveChangesAsync(ct);
        cache.InvalidateAll();
        return await ToDtoAsync(post, ct);
    }

    public async Task DeleteAsync(Guid id, CancellationToken ct = default)
    {
        var post = await db.Posts.SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw AppException.NotFound("bài viết");
        db.Posts.Remove(post);
        await db.SaveChangesAsync(ct);
        cache.InvalidateAll();
    }

    private async Task ApplyAsync(Post p, SavePostRequest req, CancellationToken ct)
    {
        var title = req.Title.Trim();
        var slug = SlugRules.Resolve(req.Slug, title);
        if (await db.Posts.AnyAsync(x => x.Slug == slug && x.Id != p.Id, ct)) throw AppException.Conflict("Slug đã được dùng bởi bài viết khác.", "slug_taken");
        await media.EnsureExistAsync("coverMediaId", [req.CoverMediaId], ct);
        await media.EnsureExistAsync("seo.ogImageMediaId", [req.Seo?.OgImageMediaId], ct);

        p.Title = title; p.Slug = slug; p.Status = req.Status;
        p.Summary = string.IsNullOrWhiteSpace(req.Summary) ? null : req.Summary.Trim();
        p.Content = sanitizer.Sanitize(req.Content);
        p.CoverMediaId = req.CoverMediaId;
        // Xuất bản mà chưa có giờ thì đăng ngay; đã có giờ (kể cả tương lai) thì giữ để hẹn giờ.
        p.PublishedAt = req.PublishedAt?.ToUniversalTime() ?? (req.Status == PublishStatus.Published ? p.PublishedAt ?? clock.GetUtcNow().UtcDateTime : p.PublishedAt);
        (req.Seo ?? new SeoDto(null, null, null, null, null, false)).ApplyTo(p.Seo);
    }

    private async Task<PostDto> ToDtoAsync(Post p, CancellationToken ct)
    {
        var map = await media.LoadAsync([p.CoverMediaId], ct);
        return new PostDto(p.Id, p.Title, p.Slug, p.Summary, p.Content, p.CoverMediaId, MediaResolver.Get(map, p.CoverMediaId), p.Status, p.PublishedAt, SeoDto.From(p.Seo));
    }

    // ---------- công khai ----------
    private IQueryable<Post> Visible()
    {
        var now = clock.GetUtcNow().UtcDateTime;
        return db.Posts.AsNoTracking().Where(p => p.Status == PublishStatus.Published && p.PublishedAt != null && p.PublishedAt <= now);
    }

    public async Task<PagedResult<PublicPostCardDto>> PublicListAsync(PageRequest page, CancellationToken ct = default)
    {
        var query = Visible().OrderByDescending(p => p.PublishedAt).ThenBy(p => p.Slug);
        var total = await query.CountAsync(ct);
        var rows = await query.Skip((page.Page - 1) * page.PageSize).Take(page.PageSize).ToListAsync(ct);
        var map = await media.LoadAsync(rows.Select(r => r.CoverMediaId), ct);
        return new PagedResult<PublicPostCardDto>(rows.Select(r => new PublicPostCardDto(r.Slug, r.Title, r.Summary, MediaResolver.Get(map, r.CoverMediaId), r.PublishedAt!.Value)).ToList(), page.Page, page.PageSize, total);
    }

    public async Task<PublicPostDto> PublicGetAsync(string slug, CancellationToken ct = default)
    {
        var p = await Visible().SingleOrDefaultAsync(x => x.Slug == slug, ct) ?? throw AppException.NotFound("bài viết");
        var map = await media.LoadAsync([p.CoverMediaId], ct);
        return new PublicPostDto(p.Slug, p.Title, p.Summary, p.Content, MediaResolver.Get(map, p.CoverMediaId), p.PublishedAt!.Value, p.UpdatedAt, SeoDto.From(p.Seo));
    }

    /// <summary>Bài mới nhất cho section "Blog" trang chủ.</summary>
    public async Task<IReadOnlyList<PublicPostCardDto>> LatestAsync(int limit, CancellationToken ct = default)
    {
        var rows = await Visible().OrderByDescending(p => p.PublishedAt).Take(Math.Clamp(limit, 1, 12)).ToListAsync(ct);
        var map = await media.LoadAsync(rows.Select(r => r.CoverMediaId), ct);
        return rows.Select(r => new PublicPostCardDto(r.Slug, r.Title, r.Summary, MediaResolver.Get(map, r.CoverMediaId), r.PublishedAt!.Value)).ToList();
    }
}
