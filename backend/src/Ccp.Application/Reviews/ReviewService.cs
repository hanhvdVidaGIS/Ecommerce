using Ccp.Application.Abstractions;
using Ccp.Application.Common;
using Ccp.Domain.Entities;
using Ccp.Domain.Enums;
using FluentValidation;
using Microsoft.EntityFrameworkCore;

namespace Ccp.Application.Reviews;

public sealed record PublicReviewDto(Guid Id, string AuthorName, int Rating, string? Title, string? Content, DateTime CreatedAt);
public sealed record RatingSummaryDto(decimal Average, int Count, IReadOnlyList<int> Distribution);
public sealed record ReviewEligibilityDto(bool CanReview, string? Reason, ReviewStatus? ExistingStatus);
public sealed record CreateReviewRequest(Guid ProductId, int Rating, string? Title, string? Content);
public sealed record MyReviewDto(Guid Id, Guid ProductId, string ProductName, string ProductSlug, int Rating, string? Title, string? Content, ReviewStatus Status, DateTime CreatedAt);

public sealed record AdminReviewDto(Guid Id, Guid ProductId, string ProductName, string AuthorName, string AuthorEmail, int Rating, string? Title, string? Content, ReviewStatus Status,
    DateTime CreatedAt, string? OrderNumber);
public sealed class ReviewQuery : PageRequest
{
    public ReviewStatus? Status { get; set; }
    public int? Rating { get; set; }
}
public sealed record SetReviewStatusRequest(ReviewStatus Status);

public sealed class CreateReviewRequestValidator : AbstractValidator<CreateReviewRequest>
{
    public CreateReviewRequestValidator()
    {
        RuleFor(x => x.ProductId).NotEmpty();
        RuleFor(x => x.Rating).InclusiveBetween(1, 5).WithMessage("Chọn số sao từ 1 đến 5.");
        RuleFor(x => x.Title).MaximumLength(200);
        RuleFor(x => x.Content).MaximumLength(4000);
    }
}

public sealed class SetReviewStatusRequestValidator : AbstractValidator<SetReviewStatusRequest>
{
    public SetReviewStatusRequestValidator() => RuleFor(x => x.Status).IsInEnum();
}

/// <summary>
/// Đánh giá sản phẩm. Chỉ khách đã mua và nhận hàng (đơn Hoàn thành chứa sản phẩm) được đánh giá, mỗi sản phẩm một lần;
/// đánh giá mới ở trạng thái chờ duyệt và chỉ hiện công khai sau khi quản trị duyệt.
/// </summary>
public class ReviewService(IAppDbContext db, ICurrentUser user, AuditService audit, ISiteCache cache)
{
    private Guid Uid => user.UserId ?? throw AppException.Unauthorized();

    /// <summary>Tên hiển thị rút gọn để bảo vệ người đánh giá: họ + chữ cái đầu của tên ("Nguyễn Văn Anh" → "Nguyễn A.").</summary>
    public static string MaskName(string fullName)
    {
        var parts = fullName.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries);
        return parts.Length switch { 0 => "Khách hàng", 1 => parts[0], _ => $"{parts[0]} {char.ToUpperInvariant(parts[^1][0])}." };
    }

    private static string? Clean(string? s) => string.IsNullOrWhiteSpace(s) ? null : System.Text.RegularExpressions.Regex.Replace(s.Trim(), @"[\u0000-\u0008\u000B\u000C\u000E-\u001F]", "");

    // ---------- công khai ----------
    private async Task<Guid> ProductIdAsync(string slug, CancellationToken ct) =>
        await db.Products.AsNoTracking().Where(p => p.Slug == slug && p.Status == ProductStatus.Active).Select(p => (Guid?)p.Id).FirstOrDefaultAsync(ct) ?? throw AppException.NotFound("sản phẩm");

    public async Task<PagedResult<PublicReviewDto>> ListAsync(string slug, PageRequest page, CancellationToken ct = default)
    {
        var pid = await ProductIdAsync(slug, ct);
        var query = db.Reviews.AsNoTracking().Where(r => r.ProductId == pid && r.Status == ReviewStatus.Approved).OrderByDescending(r => r.CreatedAt);
        var total = await query.CountAsync(ct);
        var rows = await query.Skip((page.Page - 1) * page.PageSize).Take(page.PageSize).Select(r => new { r.Id, r.User!.FullName, r.Rating, r.Title, r.Content, r.CreatedAt }).ToListAsync(ct);
        return new PagedResult<PublicReviewDto>(rows.Select(r => new PublicReviewDto(r.Id, MaskName(r.FullName), r.Rating, r.Title, r.Content, r.CreatedAt)).ToList(), page.Page, page.PageSize, total);
    }

    public async Task<RatingSummaryDto> SummaryAsync(string slug, CancellationToken ct = default)
    {
        var pid = await ProductIdAsync(slug, ct);
        var groups = await db.Reviews.AsNoTracking().Where(r => r.ProductId == pid && r.Status == ReviewStatus.Approved).GroupBy(r => r.Rating).Select(g => new { Rating = g.Key, N = g.Count() }).ToListAsync(ct);
        var dist = Enumerable.Range(1, 5).Select(star => groups.FirstOrDefault(g => g.Rating == star)?.N ?? 0).ToList();
        var count = dist.Sum();
        return new RatingSummaryDto(count == 0 ? 0 : Math.Round(dist.Select((n, i) => n * (i + 1m)).Sum() / count, 1), count, dist);
    }

    // ---------- khách hàng ----------
    private IQueryable<OrderItem> PurchasedItems(Guid uid, Guid productId) =>
        db.OrderItems.Where(i => i.Order!.UserId == uid && i.Order.Status == OrderStatus.Completed && i.VariantId != null
            && db.ProductVariants.IgnoreQueryFilters().Any(v => v.Id == i.VariantId && v.ProductId == productId));

    public async Task<ReviewEligibilityDto> EligibilityAsync(Guid productId, CancellationToken ct = default)
    {
        var uid = Uid;
        var existing = await db.Reviews.AsNoTracking().Where(r => r.UserId == uid && r.ProductId == productId).Select(r => (ReviewStatus?)r.Status).FirstOrDefaultAsync(ct);
        if (existing is not null) return new ReviewEligibilityDto(false, "already_reviewed", existing);
        if (!await PurchasedItems(uid, productId).AnyAsync(ct)) return new ReviewEligibilityDto(false, "not_purchased", null);
        return new ReviewEligibilityDto(true, null, null);
    }

    public async Task<MyReviewDto> CreateAsync(CreateReviewRequest req, CancellationToken ct = default)
    {
        var uid = Uid;
        var product = await db.Products.AsNoTracking().Where(p => p.Id == req.ProductId && p.Status == ProductStatus.Active).Select(p => new { p.Id, p.Name, p.Slug }).FirstOrDefaultAsync(ct)
            ?? throw AppException.NotFound("sản phẩm");
        if (await db.Reviews.AnyAsync(r => r.UserId == uid && r.ProductId == req.ProductId, ct))
            throw new AppException("already_reviewed", "Bạn đã đánh giá sản phẩm này.", 409);
        var item = await PurchasedItems(uid, req.ProductId).OrderByDescending(i => i.Order!.PlacedAt).Select(i => (Guid?)i.Id).FirstOrDefaultAsync(ct)
            ?? throw new AppException("not_purchased", "Chỉ khách đã mua và nhận sản phẩm mới có thể đánh giá.", 403);

        var review = new Review { ProductId = product.Id, UserId = uid, OrderItemId = item, Rating = req.Rating, Title = Clean(req.Title), Content = Clean(req.Content), Status = ReviewStatus.Pending };
        db.Reviews.Add(review);
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException) // hai yêu cầu cùng lúc: chỉ mục duy nhất (khách, sản phẩm) từ chối yêu cầu sau
        {
            throw new AppException("already_reviewed", "Bạn đã đánh giá sản phẩm này.", 409);
        }
        return new MyReviewDto(review.Id, product.Id, product.Name, product.Slug, review.Rating, review.Title, review.Content, review.Status, review.CreatedAt);
    }

    public async Task<IReadOnlyList<MyReviewDto>> MineAsync(CancellationToken ct = default)
    {
        var uid = Uid;
        return await db.Reviews.AsNoTracking().Where(r => r.UserId == uid).OrderByDescending(r => r.CreatedAt)
            .Select(r => new MyReviewDto(r.Id, r.ProductId, r.Product!.Name, r.Product.Slug, r.Rating, r.Title, r.Content, r.Status, r.CreatedAt)).ToListAsync(ct);
    }

    // ---------- quản trị ----------
    private static readonly IReadOnlyDictionary<string, System.Linq.Expressions.Expression<Func<Review, object?>>> Sorts = new Dictionary<string, System.Linq.Expressions.Expression<Func<Review, object?>>>
    {
        ["createdAt"] = r => r.CreatedAt, ["rating"] = r => r.Rating, ["status"] = r => r.Status,
    };

    public async Task<PagedResult<AdminReviewDto>> AdminListAsync(ReviewQuery q, CancellationToken ct = default)
    {
        var query = db.Reviews.AsNoTracking().AsQueryable();
        if (q.Status is { } st) query = query.Where(r => r.Status == st);
        if (q.Rating is { } star) query = query.Where(r => r.Rating == star);
        if (!string.IsNullOrWhiteSpace(q.Q))
        {
            var like = SearchText.LikePattern(SearchText.Fold(q.Q));
            query = query.Where(r => EF.Functions.Like(SqlFunctions.Unaccent(r.Product!.Name.ToLower()), like, "\\") || EF.Functions.Like(SqlFunctions.Unaccent(r.User!.FullName.ToLower()), like, "\\")
                || EF.Functions.Like(SqlFunctions.Unaccent((r.Content ?? "").ToLower()), like, "\\"));
        }
        query = query.ApplySort(q.Sort, Sorts, "createdAt:desc");
        var total = await query.CountAsync(ct);
        var rows = await query.Skip((q.Page - 1) * q.PageSize).Take(q.PageSize).Select(r => new
        {
            r.Id, r.ProductId, ProductName = r.Product!.Name, r.User!.FullName, r.User.Email, r.Rating, r.Title, r.Content, r.Status, r.CreatedAt,
            OrderNumber = db.OrderItems.Where(i => i.Id == r.OrderItemId).Select(i => i.Order!.OrderNumber).FirstOrDefault(),
        }).ToListAsync(ct);
        return new PagedResult<AdminReviewDto>(rows.Select(r => new AdminReviewDto(r.Id, r.ProductId, r.ProductName, r.FullName, r.Email, r.Rating, r.Title, r.Content, r.Status, r.CreatedAt, r.OrderNumber)).ToList(), q.Page, q.PageSize, total);
    }

    public async Task SetStatusAsync(Guid id, ReviewStatus status, CancellationToken ct = default)
    {
        var review = await db.Reviews.SingleOrDefaultAsync(r => r.Id == id, ct) ?? throw AppException.NotFound("đánh giá");
        var from = review.Status;
        review.Status = status;
        audit.Log("review.status", nameof(Review), id.ToString(), new { from, to = status });
        await db.SaveChangesAsync(ct);
        cache.InvalidateAll(); // báo Storefront làm mới ngay đánh giá vừa duyệt/ẩn
    }

    public async Task DeleteAsync(Guid id, CancellationToken ct = default)
    {
        var review = await db.Reviews.SingleOrDefaultAsync(r => r.Id == id, ct) ?? throw AppException.NotFound("đánh giá");
        review.IsDeleted = true; // xoá mềm; khách đó có thể đánh giá lại nhờ chỉ mục duy nhất chỉ xét bản ghi chưa xoá
        audit.Log("review.delete", nameof(Review), id.ToString());
        await db.SaveChangesAsync(ct);
        cache.InvalidateAll();
    }
}
