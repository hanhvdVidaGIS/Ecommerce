using Ccp.Application.Abstractions;
using Ccp.Application.Common;
using Ccp.Domain.Entities;
using FluentValidation;
using Microsoft.EntityFrameworkCore;

namespace Ccp.Application.Catalog;

public sealed record CategoryListItemDto(Guid Id, Guid? ParentId, int Depth, string Path, string Name, string Slug, int SortOrder, bool IsActive,
    int ChildCount, int ProductCount, MediaRefDto? Icon);

public sealed record AttributeRefDto(Guid Id, string Code, string Name);

public sealed record CategoryDetailDto(Guid Id, Guid? ParentId, string Name, string Slug, string? Description, Guid? IconMediaId, Guid? BannerMediaId,
    MediaRefDto? Icon, MediaRefDto? Banner, int SortOrder, bool IsActive, SeoDto Seo, IReadOnlyList<AttributeRefDto> Attributes);

public sealed record SaveCategoryRequest(string Name, string? Slug, Guid? ParentId, string? Description, Guid? IconMediaId, Guid? BannerMediaId,
    int SortOrder, bool IsActive, SeoDto? Seo);

public sealed record ReorderItem(Guid Id, Guid? ParentId, int SortOrder);

public sealed class SaveCategoryRequestValidator : AbstractValidator<SaveCategoryRequest>
{
    public SaveCategoryRequestValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(200).WithMessage("Tên là bắt buộc (tối đa 200 ký tự).");
        RuleFor(x => x.Description).MaximumLength(2000);
        RuleFor(x => x.SortOrder).InclusiveBetween(-100000, 100000);
    }
}

public class CategoryService(IAppDbContext db, MediaResolver media, ISiteCache cache)
{
    public const int MaxDepth = 5;

    public async Task<IReadOnlyList<CategoryListItemDto>> ListAsync(CancellationToken ct = default)
    {
        var all = await db.Categories.AsNoTracking().ToListAsync(ct);
        var productCounts = await db.Products.AsNoTracking().Where(p => p.PrimaryCategoryId != null)
            .GroupBy(p => p.PrimaryCategoryId!.Value).Select(g => new { Id = g.Key, N = g.Count() }).ToDictionaryAsync(x => x.Id, x => x.N, ct);
        var icons = await media.LoadAsync(all.Select(c => c.IconMediaId), ct);

        var byParent = all.ToLookup(c => c.ParentId);
        var result = new List<CategoryListItemDto>();
        void Walk(Guid? parentId, int depth, string path)
        {
            foreach (var c in byParent[parentId].OrderBy(c => c.SortOrder).ThenBy(c => c.Name))
            {
                var p = path.Length == 0 ? c.Name : $"{path} / {c.Name}";
                result.Add(new CategoryListItemDto(c.Id, c.ParentId, depth, p, c.Name, c.Slug, c.SortOrder, c.IsActive,
                    byParent[c.Id].Count(), productCounts.GetValueOrDefault(c.Id), MediaResolver.Get(icons, c.IconMediaId)));
                Walk(c.Id, depth + 1, p);
            }
        }
        Walk(null, 0, "");
        return result;
    }

    public async Task<CategoryDetailDto> GetAsync(Guid id, CancellationToken ct = default)
    {
        var c = await db.Categories.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw AppException.NotFound("danh mục");
        var attrs = await db.CategoryAttributes.AsNoTracking().Where(x => x.CategoryId == id).OrderBy(x => x.SortOrder)
            .Select(x => new AttributeRefDto(x.AttributeId, x.Attribute!.Code, x.Attribute.Name)).ToListAsync(ct);
        return await ToDetailAsync(c, attrs, ct);
    }

    public async Task<CategoryDetailDto> CreateAsync(SaveCategoryRequest req, CancellationToken ct = default)
    {
        var category = new Category();
        await ApplyAsync(category, req, isNew: true, ct);
        db.Categories.Add(category);
        await db.SaveChangesAsync(ct);
        cache.InvalidateAll();
        return await GetAsync(category.Id, ct);
    }

    public async Task<CategoryDetailDto> UpdateAsync(Guid id, SaveCategoryRequest req, CancellationToken ct = default)
    {
        var category = await db.Categories.SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw AppException.NotFound("danh mục");
        await ApplyAsync(category, req, isNew: false, ct);
        await db.SaveChangesAsync(ct);
        cache.InvalidateAll();
        return await GetAsync(id, ct);
    }

    public async Task DeleteAsync(Guid id, CancellationToken ct = default)
    {
        var category = await db.Categories.SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw AppException.NotFound("danh mục");
        if (await db.Categories.AnyAsync(c => c.ParentId == id, ct))
            throw AppException.Conflict("Danh mục còn danh mục con. Xoá hoặc chuyển danh mục con trước.", "has_children");
        if (await db.Products.AnyAsync(p => p.PrimaryCategoryId == id, ct) || await db.ProductCategories.AnyAsync(pc => pc.CategoryId == id, ct))
            throw AppException.Conflict("Danh mục đang có sản phẩm. Chuyển sản phẩm sang danh mục khác trước.", "in_use");
        if (await db.MenuItems.AnyAsync(m => m.TargetType == "Category" && m.TargetId == id, ct))
            throw AppException.Conflict("Danh mục đang được dùng trong menu. Gỡ khỏi menu trước.", "in_use");

        var links = await db.CategoryAttributes.Where(x => x.CategoryId == id).ToListAsync(ct);
        db.CategoryAttributes.RemoveRange(links);
        db.Categories.Remove(category);
        await db.SaveChangesAsync(ct);
        cache.InvalidateAll();
    }

    /// <summary>Sắp xếp và chuyển cha hàng loạt (kéo-thả). Toàn bộ thay đổi hợp lệ hoặc không có gì được lưu.</summary>
    public async Task ReorderAsync(IReadOnlyList<ReorderItem> items, CancellationToken ct = default)
    {
        if (items.Count == 0) return;
        if (items.Select(i => i.Id).Distinct().Count() != items.Count)
            throw AppException.Validation("Danh sách sắp xếp có mã trùng lặp.");
        var all = await db.Categories.ToListAsync(ct);
        var byId = all.ToDictionary(c => c.Id);
        foreach (var item in items)
        {
            if (!byId.TryGetValue(item.Id, out var c)) throw AppException.NotFound("danh mục");
            if (item.ParentId is not null && !byId.ContainsKey(item.ParentId.Value)) throw AppException.NotFound("danh mục cha");
            c.ParentId = item.ParentId;
            c.SortOrder = item.SortOrder;
        }
        foreach (var c in all) EnsureAcyclicAndShallow(c, byId);
        await db.SaveChangesAsync(ct);
        cache.InvalidateAll();
    }

    private async Task ApplyAsync(Category c, SaveCategoryRequest req, bool isNew, CancellationToken ct)
    {
        var name = req.Name.Trim();
        var slug = SlugRules.Resolve(req.Slug, name);
        if (await db.Categories.AnyAsync(x => x.Slug == slug && x.Id != c.Id, ct))
            throw AppException.Conflict("Slug đã được dùng bởi danh mục khác.", "slug_taken");
        await media.EnsureExistAsync("iconMediaId", [req.IconMediaId], ct);
        await media.EnsureExistAsync("bannerMediaId", [req.BannerMediaId], ct);
        await media.EnsureExistAsync("seo.ogImageMediaId", [req.Seo?.OgImageMediaId], ct);

        if (req.ParentId is not null)
        {
            var all = await db.Categories.AsNoTracking().ToDictionaryAsync(x => x.Id, ct);
            if (!all.ContainsKey(req.ParentId.Value)) throw AppException.Validation("Danh mục cha không tồn tại.", new ErrorDetail("parentId", "Không tồn tại."));
            if (!isNew)
            {
                all[c.Id] = new Category { Id = c.Id, ParentId = req.ParentId, Name = name, Slug = slug };
                EnsureAcyclicAndShallow(all[c.Id], all);
            }
            else if (Depth(req.ParentId.Value, all) + 1 >= MaxDepth)
                throw AppException.Validation($"Cây danh mục tối đa {MaxDepth} cấp.", new ErrorDetail("parentId", "Quá sâu."));
        }

        c.Name = name; c.Slug = slug; c.ParentId = req.ParentId;
        c.Description = string.IsNullOrWhiteSpace(req.Description) ? null : req.Description.Trim();
        c.IconMediaId = req.IconMediaId; c.BannerMediaId = req.BannerMediaId;
        c.SortOrder = req.SortOrder; c.IsActive = req.IsActive;
        (req.Seo ?? new SeoDto(null, null, null, null, null, false)).ApplyTo(c.Seo);
    }

    private static int Depth(Guid id, IReadOnlyDictionary<Guid, Category> all)
    {
        var depth = 0; var current = all[id];
        while (current.ParentId is not null && all.TryGetValue(current.ParentId.Value, out var parent)) { depth++; current = parent; if (depth > 100) break; }
        return depth;
    }

    private static void EnsureAcyclicAndShallow(Category start, IReadOnlyDictionary<Guid, Category> all)
    {
        var seen = new HashSet<Guid> { start.Id };
        var current = start; var depth = 0;
        while (current.ParentId is not null)
        {
            if (!seen.Add(current.ParentId.Value)) throw AppException.Validation("Không thể chuyển danh mục vào chính nó hoặc danh mục con của nó.", new ErrorDetail("parentId", "Tạo vòng lặp."));
            current = all[current.ParentId.Value];
            if (++depth >= MaxDepth) throw AppException.Validation($"Cây danh mục tối đa {MaxDepth} cấp.", new ErrorDetail("parentId", "Quá sâu."));
        }
    }

    private async Task<CategoryDetailDto> ToDetailAsync(Category c, IReadOnlyList<AttributeRefDto> attrs, CancellationToken ct)
    {
        var map = await media.LoadAsync([c.IconMediaId, c.BannerMediaId], ct);
        return new CategoryDetailDto(c.Id, c.ParentId, c.Name, c.Slug, c.Description, c.IconMediaId, c.BannerMediaId,
            MediaResolver.Get(map, c.IconMediaId), MediaResolver.Get(map, c.BannerMediaId), c.SortOrder, c.IsActive, SeoDto.From(c.Seo), attrs);
    }
}
