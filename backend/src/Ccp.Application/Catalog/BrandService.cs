using System.Linq.Expressions;
using Ccp.Application.Abstractions;
using Ccp.Application.Common;
using Ccp.Domain.Entities;
using FluentValidation;
using Microsoft.EntityFrameworkCore;

namespace Ccp.Application.Catalog;

public sealed record BrandDto(Guid Id, string Name, string Slug, string? Description, Guid? LogoMediaId, MediaRefDto? Logo, bool IsActive, int SortOrder, int ProductCount);
public sealed record SaveBrandRequest(string Name, string? Slug, string? Description, Guid? LogoMediaId, bool IsActive, int SortOrder);

public sealed class SaveBrandRequestValidator : AbstractValidator<SaveBrandRequest>
{
    public SaveBrandRequestValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(200).WithMessage("Tên là bắt buộc (tối đa 200 ký tự).");
        RuleFor(x => x.Description).MaximumLength(2000);
    }
}

public class BrandService(IAppDbContext db, MediaResolver media, ISiteCache cache)
{
    private static readonly IReadOnlyDictionary<string, Expression<Func<Brand, object?>>> Sorts = new Dictionary<string, Expression<Func<Brand, object?>>>
    {
        ["name"] = b => b.Name, ["sortOrder"] = b => b.SortOrder, ["createdAt"] = b => b.CreatedAt,
    };

    public async Task<PagedResult<BrandDto>> ListAsync(PageRequest q, CancellationToken ct = default)
    {
        var query = db.Brands.AsNoTracking().AsQueryable();
        if (!string.IsNullOrWhiteSpace(q.Q)) { var t = q.Q.Trim().ToLower(); query = query.Where(b => b.Name.ToLower().Contains(t)); }
        var page = await query.ApplySort(q.Sort, Sorts, "sortOrder:asc").ToPagedAsync(q, ct);
        var counts = await ProductCountsAsync(page.Items.Select(b => b.Id).ToList(), ct);
        var logos = await media.LoadAsync(page.Items.Select(b => b.LogoMediaId), ct);
        return new PagedResult<BrandDto>(page.Items.Select(b => ToDto(b, logos, counts)).ToList(), page.Page, page.PageSize, page.Total);
    }

    public async Task<BrandDto> GetAsync(Guid id, CancellationToken ct = default)
    {
        var b = await db.Brands.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw AppException.NotFound("thương hiệu");
        return await ToDtoAsync(b, ct);
    }

    public async Task<BrandDto> CreateAsync(SaveBrandRequest req, CancellationToken ct = default)
    {
        var brand = new Brand();
        await ApplyAsync(brand, req, ct);
        db.Brands.Add(brand);
        await db.SaveChangesAsync(ct);
        cache.InvalidateAll();
        return await ToDtoAsync(brand, ct);
    }

    public async Task<BrandDto> UpdateAsync(Guid id, SaveBrandRequest req, CancellationToken ct = default)
    {
        var brand = await db.Brands.SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw AppException.NotFound("thương hiệu");
        await ApplyAsync(brand, req, ct);
        await db.SaveChangesAsync(ct);
        cache.InvalidateAll();
        return await ToDtoAsync(brand, ct);
    }

    public async Task DeleteAsync(Guid id, CancellationToken ct = default)
    {
        var brand = await db.Brands.SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw AppException.NotFound("thương hiệu");
        if (await db.Products.AnyAsync(p => p.BrandId == id, ct))
            throw AppException.Conflict("Thương hiệu đang có sản phẩm. Chuyển sản phẩm sang thương hiệu khác trước.", "in_use");
        db.Brands.Remove(brand);
        await db.SaveChangesAsync(ct);
        cache.InvalidateAll();
    }

    private async Task ApplyAsync(Brand b, SaveBrandRequest req, CancellationToken ct)
    {
        var name = req.Name.Trim();
        var slug = SlugRules.Resolve(req.Slug, name);
        if (await db.Brands.AnyAsync(x => x.Slug == slug && x.Id != b.Id, ct)) throw AppException.Conflict("Slug đã được dùng bởi thương hiệu khác.", "slug_taken");
        await media.EnsureExistAsync("logoMediaId", [req.LogoMediaId], ct);
        b.Name = name; b.Slug = slug; b.Description = string.IsNullOrWhiteSpace(req.Description) ? null : req.Description.Trim();
        b.LogoMediaId = req.LogoMediaId; b.IsActive = req.IsActive; b.SortOrder = req.SortOrder;
    }

    private async Task<Dictionary<Guid, int>> ProductCountsAsync(IReadOnlyCollection<Guid> ids, CancellationToken ct) =>
        await db.Products.AsNoTracking().Where(p => p.BrandId != null && ids.Contains(p.BrandId.Value))
            .GroupBy(p => p.BrandId!.Value).Select(g => new { Id = g.Key, N = g.Count() }).ToDictionaryAsync(x => x.Id, x => x.N, ct);

    private async Task<BrandDto> ToDtoAsync(Brand b, CancellationToken ct) =>
        ToDto(b, await media.LoadAsync([b.LogoMediaId], ct), await ProductCountsAsync([b.Id], ct));

    private static BrandDto ToDto(Brand b, IReadOnlyDictionary<Guid, MediaRefDto> logos, IReadOnlyDictionary<Guid, int> counts) =>
        new(b.Id, b.Name, b.Slug, b.Description, b.LogoMediaId, MediaResolver.Get(logos, b.LogoMediaId), b.IsActive, b.SortOrder, counts.GetValueOrDefault(b.Id));
}
