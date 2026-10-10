using Ccp.Application.Abstractions;
using Ccp.Application.Common;
using Ccp.Domain.Entities;
using Ccp.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Ccp.Application.Storefront;

/// <summary>Truy vấn danh mục công khai cho cửa hàng: danh mục, danh sách + bộ lọc động, chi tiết, tìm kiếm.</summary>
public class PublicCatalogService(IAppDbContext db, MediaResolver media)
{
    public const int MaxPageSize = 60;
    private const string LikeEscape = "\\";

    // ---------- khả năng hiển thị ----------
    /// <summary>Sản phẩm chỉ hiển thị khi đang bán, danh mục chính (nếu có) đang bật và còn ít nhất một biến thể đang bật.</summary>
    private IQueryable<Product> Visible() => db.Products.AsNoTracking()
        .Where(p => p.Status == ProductStatus.Active && (p.PrimaryCategory == null || p.PrimaryCategory.IsActive) && p.Variants.Any(v => v.IsActive));

    // ---------- danh mục ----------
    public async Task<IReadOnlyList<PublicCategoryDto>> CategoryTreeAsync(CancellationToken ct = default)
    {
        var all = await db.Categories.AsNoTracking().Where(c => c.IsActive).ToListAsync(ct);
        var activeIds = all.Select(c => c.Id).ToHashSet();
        var direct = await CountByCategoryAsync(ct);
        var icons = await media.LoadAsync(all.SelectMany(c => new[] { c.IconMediaId, c.BannerMediaId }), ct);

        var byParent = all.ToLookup(c => c.ParentId);
        // Danh mục con chỉ hiển thị khi cha cũng đang bật; số sản phẩm của cha gồm cả các nhánh con.
        PublicCategoryDto Build(Category c, out int count)
        {
            var kids = new List<PublicCategoryDto>();
            var total = direct.GetValueOrDefault(c.Id);
            foreach (var child in byParent[c.Id].OrderBy(x => x.SortOrder).ThenBy(x => x.Name))
            {
                kids.Add(Build(child, out var n));
                total += n;
            }
            count = total;
            return new PublicCategoryDto(c.Id, c.Name, c.Slug, c.Description, MediaResolver.Get(icons, c.IconMediaId), MediaResolver.Get(icons, c.BannerMediaId), total, SeoDto.From(c.Seo), kids);
        }
        return byParent[null].Where(c => c.ParentId is null || activeIds.Contains(c.ParentId.Value))
            .OrderBy(c => c.SortOrder).ThenBy(c => c.Name).Select(c => Build(c, out _)).ToList();
    }

    public async Task<PublicCategoryDetailDto> CategoryAsync(string slug, CancellationToken ct = default)
    {
        var all = await db.Categories.AsNoTracking().Where(c => c.IsActive).ToListAsync(ct);
        var cat = all.SingleOrDefault(c => c.Slug == slug) ?? throw AppException.NotFound("danh mục");
        var byId = all.ToDictionary(c => c.Id);
        var crumbs = new List<BreadcrumbDto>();
        for (Category? cur = cat; cur is not null; cur = cur.ParentId is { } pid && byId.TryGetValue(pid, out var parent) ? parent : null)
            crumbs.Insert(0, new BreadcrumbDto(cur.Name, cur.Slug));
        var tree = await CategoryTreeAsync(ct);
        var node = Find(tree, cat.Id);
        var banner = await media.LoadAsync([cat.BannerMediaId], ct);
        return new PublicCategoryDetailDto(cat.Id, cat.Name, cat.Slug, cat.Description, MediaResolver.Get(banner, cat.BannerMediaId), SeoDto.From(cat.Seo), crumbs, node?.Children ?? []);
    }

    private static PublicCategoryDto? Find(IReadOnlyList<PublicCategoryDto> nodes, Guid id)
    {
        foreach (var n in nodes)
        {
            if (n.Id == id) return n;
            var inner = Find(n.Children, id);
            if (inner is not null) return inner;
        }
        return null;
    }

    private async Task<Dictionary<Guid, int>> CountByCategoryAsync(CancellationToken ct)
    {
        var visible = Visible();
        var primary = await visible.Where(p => p.PrimaryCategoryId != null).GroupBy(p => p.PrimaryCategoryId!.Value).Select(g => new { Id = g.Key, N = g.Count() }).ToListAsync(ct);
        var extra = await db.ProductCategories.AsNoTracking().Where(pc => visible.Any(p => p.Id == pc.ProductId)).GroupBy(pc => pc.CategoryId).Select(g => new { Id = g.Key, N = g.Count() }).ToListAsync(ct);
        var result = new Dictionary<Guid, int>();
        foreach (var x in primary.Concat(extra)) result[x.Id] = result.GetValueOrDefault(x.Id) + x.N;
        return result;
    }

    public async Task<IReadOnlyList<PublicBrandDto>> BrandsAsync(CancellationToken ct = default)
    {
        var counts = await Visible().Where(p => p.BrandId != null).GroupBy(p => p.BrandId!.Value).Select(g => new { Id = g.Key, N = g.Count() }).ToDictionaryAsync(x => x.Id, x => x.N, ct);
        var brands = await db.Brands.AsNoTracking().Where(b => b.IsActive).OrderBy(b => b.SortOrder).ThenBy(b => b.Name).ToListAsync(ct);
        var logos = await media.LoadAsync(brands.Select(b => b.LogoMediaId), ct);
        return brands.Where(b => counts.ContainsKey(b.Id)).Select(b => new PublicBrandDto(b.Id, b.Name, b.Slug, b.Description, MediaResolver.Get(logos, b.LogoMediaId), counts[b.Id])).ToList();
    }

    // ---------- danh sách + bộ lọc ----------
    private enum Dimension { None, Brand, Price, Attribute }

    private async Task<List<Guid>> CategoryScopeAsync(string slug, CancellationToken ct)
    {
        var all = await db.Categories.AsNoTracking().Where(c => c.IsActive).Select(c => new { c.Id, c.ParentId, c.Slug }).ToListAsync(ct);
        var root = all.SingleOrDefault(c => c.Slug == slug) ?? throw AppException.NotFound("danh mục");
        var ids = new List<Guid> { root.Id };
        for (var i = 0; i < ids.Count; i++) ids.AddRange(all.Where(c => c.ParentId == ids[i]).Select(c => c.Id));
        return ids;
    }

    private sealed record AttrMeta(Guid Id, string Code, bool IsVariantOption);

    private IQueryable<Product> ApplyFilters(IQueryable<Product> query, ProductFilter f, IReadOnlyList<Guid>? scope, IReadOnlyDictionary<string, AttrMeta> attrs,
        Dimension exclude = Dimension.None, string? excludeAttr = null)
    {
        if (scope is not null)
            query = query.Where(p => (p.PrimaryCategoryId != null && scope.Contains(p.PrimaryCategoryId.Value)) || p.Categories.Any(c => scope.Contains(c.CategoryId)));

        if (!string.IsNullOrWhiteSpace(f.Q))
            foreach (var term in SearchText.Fold(f.Q).Split(' ', StringSplitOptions.RemoveEmptyEntries).Take(6))
            {
                var like = SearchText.LikePattern(term);
                query = query.Where(p =>
                    EF.Functions.Like(SqlFunctions.Unaccent(p.Name.ToLower()), like, LikeEscape)
                    || p.Variants.Any(v => EF.Functions.Like(SqlFunctions.Unaccent(v.Sku.ToLower()), like, LikeEscape))
                    || (p.Brand != null && EF.Functions.Like(SqlFunctions.Unaccent(p.Brand.Name.ToLower()), like, LikeEscape))
                    || (p.PrimaryCategory != null && EF.Functions.Like(SqlFunctions.Unaccent(p.PrimaryCategory.Name.ToLower()), like, LikeEscape)));
            }

        if (exclude != Dimension.Brand && f.Brands.Count > 0)
        {
            var slugs = f.Brands.Select(b => b.ToLowerInvariant()).ToList();
            query = query.Where(p => p.Brand != null && slugs.Contains(p.Brand.Slug));
        }
        if (exclude != Dimension.Price)
        {
            if (f.PriceMin is not null) query = query.Where(p => p.MaxPrice >= f.PriceMin);
            if (f.PriceMax is not null) query = query.Where(p => p.MinPrice <= f.PriceMax);
        }

        foreach (var (code, values) in f.Attrs)
        {
            if (excludeAttr is not null && code.Equals(excludeAttr, StringComparison.OrdinalIgnoreCase)) continue;
            if (!attrs.TryGetValue(code, out var meta) || values.Length == 0) continue;
            var vs = values.Select(v => v.ToLowerInvariant()).ToList();
            var attrId = meta.Id;
            query = meta.IsVariantOption
                ? query.Where(p => p.Variants.Any(v => v.IsActive && v.OptionValues.Any(o => o.AttributeId == attrId && vs.Contains(o.Value!.Code))))
                : query.Where(p => p.AttributeAssignments.Any(a => a.AttributeId == attrId && a.Value != null && vs.Contains(a.Value.Code)));
        }

        return f.Flag switch
        {
            "featured" => query.Where(p => p.IsFeatured),
            "new" => query.Where(p => p.IsNew),
            "bestseller" => query.Where(p => p.IsBestSeller),
            "sale" => query.Where(p => p.Variants.Any(v => v.IsActive && v.SalePrice != null && v.SalePrice > 0 && v.SalePrice < v.Price)),
            _ => query,
        };
    }

    private async Task<Dictionary<string, AttrMeta>> FilterableAttributesAsync(CancellationToken ct) =>
        (await db.ProductAttributes.AsNoTracking().Where(a => a.IsActive && a.IsFilterable).Select(a => new AttrMeta(a.Id, a.Code, a.IsVariantOption)).ToListAsync(ct))
        .ToDictionary(a => a.Code, StringComparer.OrdinalIgnoreCase);

    public async Task<PagedResult<ProductCardDto>> ListAsync(ProductFilter f, CancellationToken ct = default)
    {
        f.Page = Math.Max(1, f.Page);
        f.PageSize = Math.Clamp(f.PageSize, 1, MaxPageSize);
        var scope = string.IsNullOrWhiteSpace(f.Category) ? null : await CategoryScopeAsync(f.Category, ct);
        var attrs = await FilterableAttributesAsync(ct);
        var query = ApplyFilters(Visible(), f, scope, attrs);

        query = f.Sort switch
        {
            "price_asc" => query.OrderBy(p => p.MinPrice).ThenBy(p => p.Name),
            "price_desc" => query.OrderByDescending(p => p.MinPrice).ThenBy(p => p.Name),
            "bestseller" => query.OrderByDescending(p => p.IsBestSeller).ThenByDescending(p => p.SoldCount).ThenBy(p => p.Name),
            "name" => query.OrderBy(p => p.Name),
            null or "" or "newest" => query.OrderByDescending(p => p.CreatedAt).ThenBy(p => p.Name),
            _ => throw AppException.Validation("Tham số sort không hợp lệ.", new ErrorDetail("sort", "Chọn: newest, price_asc, price_desc, bestseller, name.")),
        };

        var total = await query.CountAsync(ct);
        var rows = await query.Skip((f.Page - 1) * f.PageSize).Take(f.PageSize).Select(CardProjection).ToListAsync(ct);
        return new PagedResult<ProductCardDto>(await ToCardsAsync(rows, ct), f.Page, f.PageSize, total);
    }

    private sealed record CardRow(Guid Id, string Slug, string Name, string? BrandName, string? BrandSlug, decimal MinPrice, decimal MaxPrice, decimal? CompareAt,
        bool OnSale, bool IsNew, bool IsBest, bool IsFeatured, bool InStock, Guid? Image1, Guid? Image2);

    private static readonly System.Linq.Expressions.Expression<Func<Product, CardRow>> CardProjection = p => new CardRow(
        p.Id, p.Slug, p.Name, p.Brand != null ? p.Brand.Name : null, p.Brand != null ? p.Brand.Slug : null, p.MinPrice, p.MaxPrice,
        p.Variants.Where(v => v.IsActive && v.SalePrice != null && v.SalePrice > 0 && v.SalePrice < v.Price).OrderBy(v => v.SalePrice).Select(v => (decimal?)v.Price).FirstOrDefault(),
        p.Variants.Any(v => v.IsActive && v.SalePrice != null && v.SalePrice > 0 && v.SalePrice < v.Price),
        p.IsNew, p.IsBestSeller, p.IsFeatured, p.Variants.Any(v => v.IsActive && v.StockQuantity > 0),
        p.Images.OrderByDescending(i => i.IsPrimary).ThenBy(i => i.SortOrder).Select(i => (Guid?)i.MediaId).FirstOrDefault(),
        p.Images.OrderByDescending(i => i.IsPrimary).ThenBy(i => i.SortOrder).Skip(1).Select(i => (Guid?)i.MediaId).FirstOrDefault());

    private async Task<IReadOnlyList<ProductCardDto>> ToCardsAsync(IReadOnlyList<CardRow> rows, CancellationToken ct)
    {
        var map = await media.LoadAsync(rows.SelectMany(r => new[] { r.Image1, r.Image2 }), ct);
        return rows.Select(r => new ProductCardDto(r.Id, r.Slug, r.Name, r.BrandName, r.BrandSlug, MediaResolver.Get(map, r.Image1), MediaResolver.Get(map, r.Image2),
            r.MinPrice, r.MaxPrice, r.CompareAt, r.OnSale, r.IsNew, r.IsBest, r.IsFeatured, r.InStock)).ToList();
    }

    /// <summary>Bộ lọc khả dụng. Số đếm của mỗi chiều tính trên kết quả đã áp mọi bộ lọc khác, trừ chính chiều đó.</summary>
    public async Task<FacetsDto> FacetsAsync(ProductFilter f, CancellationToken ct = default)
    {
        var scope = string.IsNullOrWhiteSpace(f.Category) ? null : await CategoryScopeAsync(f.Category, ct);
        var attrs = await FilterableAttributesAsync(ct);

        // thương hiệu
        var forBrands = ApplyFilters(Visible(), f, scope, attrs, Dimension.Brand);
        var brandRows = await forBrands.Where(p => p.BrandId != null).GroupBy(p => new { p.Brand!.Slug, p.Brand.Name }).Select(g => new { g.Key.Slug, g.Key.Name, N = g.Count() }).ToListAsync(ct);
        var brands = brandRows.OrderByDescending(b => b.N).ThenBy(b => b.Name).Select(b => new FacetBrandDto(b.Slug, b.Name, b.N)).ToList();

        // khoảng giá
        var forPrice = ApplyFilters(Visible(), f, scope, attrs, Dimension.Price);
        var any = await forPrice.AnyAsync(ct);
        FacetPriceDto? price = null;
        if (any) price = new FacetPriceDto(await forPrice.MinAsync(p => p.MinPrice, ct), await forPrice.MaxAsync(p => p.MaxPrice, ct));

        // thuộc tính: chỉ các thuộc tính lọc được áp dụng cho danh mục (gồm danh mục cha)
        var applicable = attrs.Values.Select(a => a.Id).ToHashSet();
        if (scope is not null && f.Category is not null)
        {
            var chain = await AncestorChainAsync(scope[0], ct);
            applicable = (await db.CategoryAttributes.AsNoTracking().Where(x => chain.Contains(x.CategoryId)).Select(x => x.AttributeId).ToListAsync(ct)).ToHashSet();
        }
        else
        {
            applicable = (await db.CategoryAttributes.AsNoTracking().Select(x => x.AttributeId).Distinct().ToListAsync(ct)).ToHashSet();
        }

        var attrDefs = await db.ProductAttributes.AsNoTracking().Include(a => a.Values)
            .Where(a => a.IsActive && a.IsFilterable && applicable.Contains(a.Id)).OrderBy(a => a.SortOrder).ThenBy(a => a.Name).ToListAsync(ct);
        var images = await media.LoadAsync(attrDefs.SelectMany(a => a.Values).Select(v => v.ImageMediaId), ct);

        var facets = new List<FacetAttributeDto>();
        foreach (var a in attrDefs)
        {
            var ids = ApplyFilters(Visible(), f, scope, attrs, Dimension.Attribute, a.Code).Select(p => p.Id);
            var aId = a.Id;
            var counts = a.IsVariantOption
                ? await db.VariantOptionValues.AsNoTracking().Where(o => o.AttributeId == aId && o.Variant!.IsActive && ids.Contains(o.Variant.ProductId))
                    .GroupBy(o => o.ValueId).Select(g => new { Id = g.Key, N = g.Select(x => x.Variant!.ProductId).Distinct().Count() }).ToDictionaryAsync(x => x.Id, x => x.N, ct)
                : await db.ProductAttributeAssignments.AsNoTracking().Where(x => x.AttributeId == aId && x.ValueId != null && ids.Contains(x.ProductId))
                    .GroupBy(x => x.ValueId!.Value).Select(g => new { Id = g.Key, N = g.Select(x => x.ProductId).Distinct().Count() }).ToDictionaryAsync(x => x.Id, x => x.N, ct);

            var selected = f.Attrs.TryGetValue(a.Code, out var sel) ? sel.Select(s => s.ToLowerInvariant()).ToHashSet() : [];
            var values = a.Values.OrderBy(v => v.SortOrder).ThenBy(v => v.Label)
                .Where(v => counts.GetValueOrDefault(v.Id) > 0 || selected.Contains(v.Code))
                .Select(v => new FacetValueDto(v.Code, v.Label, v.ColorHex, MediaResolver.Get(images, v.ImageMediaId), counts.GetValueOrDefault(v.Id))).ToList();
            if (values.Count > 0) facets.Add(new FacetAttributeDto(a.Code, a.Name, a.DataType, values));
        }
        return new FacetsDto(brands, price, facets);
    }

    private async Task<List<Guid>> AncestorChainAsync(Guid categoryId, CancellationToken ct)
    {
        var parents = await db.Categories.AsNoTracking().ToDictionaryAsync(c => c.Id, c => c.ParentId, ct);
        var chain = new List<Guid>();
        Guid? cur = categoryId;
        while (cur is not null && parents.TryGetValue(cur.Value, out var parent) && chain.Count < 20) { chain.Add(cur.Value); cur = parent; }
        return chain;
    }

    // ---------- tìm kiếm gợi ý ----------
    public async Task<SearchSuggestionsDto> SuggestAsync(string? q, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(q) || q.Trim().Length < 2) return new SearchSuggestionsDto([], [], []);
        var folded = SearchText.Fold(q);
        var like = SearchText.LikePattern(folded);
        var attrs = new Dictionary<string, AttrMeta>();
        var rows = await ApplyFilters(Visible(), new ProductFilter { Q = q }, null, attrs).OrderByDescending(p => p.SoldCount).ThenBy(p => p.Name).Take(6).Select(CardProjection).ToListAsync(ct);

        var brands = await db.Brands.AsNoTracking().Where(b => b.IsActive && EF.Functions.Like(SqlFunctions.Unaccent(b.Name.ToLower()), like, LikeEscape)).OrderBy(b => b.Name).Take(4)
            .Select(b => new FacetBrandDto(b.Slug, b.Name, 0)).ToListAsync(ct);
        var cats = await db.Categories.AsNoTracking().Where(c => c.IsActive && EF.Functions.Like(SqlFunctions.Unaccent(c.Name.ToLower()), like, LikeEscape)).OrderBy(c => c.Name).Take(4)
            .Select(c => new BreadcrumbDto(c.Name, c.Slug)).ToListAsync(ct);
        return new SearchSuggestionsDto(await ToCardsAsync(rows, ct), brands, cats);
    }

    // ---------- chi tiết ----------
    public async Task<PublicProductDto> DetailAsync(string slug, CancellationToken ct = default)
    {
        var p = await Visible().AsSplitQuery()
            .Include(x => x.Brand).Include(x => x.PrimaryCategory)
            .Include(x => x.Images)
            .Include(x => x.Variants.Where(v => v.IsActive)).ThenInclude(v => v.OptionValues).ThenInclude(o => o.Value)
            .Include(x => x.AttributeAssignments).ThenInclude(a => a.Attribute)
            .Include(x => x.AttributeAssignments).ThenInclude(a => a.Value)
            .SingleOrDefaultAsync(x => x.Slug == slug, ct) ?? throw AppException.NotFound("sản phẩm");

        var variants = p.Variants.Where(v => v.IsActive).OrderBy(v => v.EffectivePrice).ThenBy(v => v.Sku).ToList();
        var optionAttrIds = variants.SelectMany(v => v.OptionValues.Select(o => o.AttributeId)).Distinct().ToList();
        var optionAttrs = await db.ProductAttributes.AsNoTracking().Include(a => a.Values).Where(a => optionAttrIds.Contains(a.Id)).OrderBy(a => a.SortOrder).ToListAsync(ct);
        var usedValueIds = variants.SelectMany(v => v.OptionValues.Select(o => o.ValueId)).ToHashSet();

        var mediaMap = await media.LoadAsync(p.Images.Select(i => (Guid?)i.MediaId).Concat(variants.Select(v => v.ImageMediaId)).Concat(optionAttrs.SelectMany(a => a.Values).Select(v => v.ImageMediaId)).Append(p.Seo.OgImageMediaId), ct);

        var options = optionAttrs.Select(a => new ProductOptionDto(a.Id, a.Code, a.Name, a.DataType,
            a.Values.Where(v => usedValueIds.Contains(v.Id)).OrderBy(v => v.SortOrder).ThenBy(v => v.Label)
                .Select(v => new OptionValueDto(v.Id, v.Code, v.Label, v.ColorHex, MediaResolver.Get(mediaMap, v.ImageMediaId))).ToList())).ToList();

        var optionOrder = optionAttrs.Select(a => a.Id).ToList();
        var publicVariants = variants.Select(v => new PublicVariantDto(v.Id, v.Sku, v.Price, v.SalePrice, v.EffectivePrice, v.StockQuantity > 0, Math.Min(v.StockQuantity, 20),
            v.OptionValues.Select(o => o.ValueId).ToList(),
            string.Join(" / ", v.OptionValues.OrderBy(o => optionOrder.IndexOf(o.AttributeId)).Select(o => o.Value!.Label)), MediaResolver.Get(mediaMap, v.ImageMediaId))).ToList();

        // Nhóm theo mã thuộc tính (không theo đối tượng: mỗi dòng gán nạp ra một thể hiện riêng khi không theo dõi thay đổi).
        var attributes = p.AttributeAssignments.Where(a => a.Attribute!.IsVisibleOnProduct && a.Attribute.IsActive).GroupBy(a => a.AttributeId)
            .Select(g => (Attr: g.First().Attribute!, Rows: g.ToList())).OrderBy(x => x.Attr.SortOrder)
            .Select(x => new DetailAttributeDto(x.Attr.Code, x.Attr.Name, x.Rows.Select(a => a.Value?.Label ?? a.TextValue ?? a.NumberValue?.ToString("0.##") ?? (a.BoolValue is { } b ? (b ? "Có" : "Không") : "")).Where(s => s.Length > 0).ToList())).ToList();

        var crumbs = new List<BreadcrumbDto>();
        if (p.PrimaryCategory is not null)
        {
            var all = await db.Categories.AsNoTracking().ToDictionaryAsync(c => c.Id, ct);
            for (Category? cur = p.PrimaryCategory; cur is not null; cur = cur.ParentId is { } pid && all.TryGetValue(pid, out var par) ? par : null)
                crumbs.Insert(0, new BreadcrumbDto(cur.Name, cur.Slug));
        }

        var related = await RelatedAsync(p, ct);
        return new PublicProductDto(p.Id, p.Slug, p.Name, p.Brand?.Name, p.Brand?.Slug, p.ShortDescription, p.Description, p.VideoUrl, p.IsNew, p.IsBestSeller, p.IsFeatured,
            p.Images.OrderByDescending(i => i.IsPrimary).ThenBy(i => i.SortOrder).Select(i => MediaResolver.Get(mediaMap, i.MediaId)).Where(m => m is not null).Select(m => m!).ToList(),
            crumbs, attributes, options, publicVariants, p.MinPrice, p.MaxPrice, SeoDto.From(p.Seo), related);
    }

    private async Task<IReadOnlyList<ProductCardDto>> RelatedAsync(Product p, CancellationToken ct)
    {
        var categoryId = p.PrimaryCategoryId;
        var brandId = p.BrandId;
        var rows = await Visible().Where(x => x.Id != p.Id && ((categoryId != null && x.PrimaryCategoryId == categoryId) || (brandId != null && x.BrandId == brandId)))
            .OrderByDescending(x => x.PrimaryCategoryId == categoryId).ThenByDescending(x => x.SoldCount).Take(8).Select(CardProjection).ToListAsync(ct);
        return await ToCardsAsync(rows, ct);
    }

    /// <summary>Thẻ sản phẩm theo danh sách mã (wishlist); bỏ qua sản phẩm đã ẩn hoặc xoá, giữ thứ tự của <paramref name="ids"/>.</summary>
    public async Task<IReadOnlyList<ProductCardDto>> CardsByIdsAsync(IReadOnlyList<Guid> ids, CancellationToken ct = default)
    {
        if (ids.Count == 0) return [];
        var rows = await Visible().Where(p => ids.Contains(p.Id)).Select(CardProjection).ToListAsync(ct);
        var cards = await ToCardsAsync(rows, ct);
        var order = ids.Select((id, i) => (id, i)).ToDictionary(x => x.id, x => x.i);
        return cards.OrderBy(c => order[c.Id]).ToList();
    }

    /// <summary>Danh sách thẻ cho các section trang chủ (mới, bán chạy, nổi bật, khuyến mãi).</summary>
    public async Task<IReadOnlyList<ProductCardDto>> HomeProductsAsync(string kind, int limit, CancellationToken ct = default)
    {
        limit = Math.Clamp(limit, 1, 24);
        var query = ApplyFilters(Visible(), new ProductFilter { Flag = kind is "new" or "bestseller" or "featured" or "sale" ? kind : null }, null, new Dictionary<string, AttrMeta>());
        query = kind switch
        {
            "bestseller" => query.OrderByDescending(p => p.SoldCount).ThenBy(p => p.Name),
            "new" => query.OrderByDescending(p => p.CreatedAt),
            _ => query.OrderByDescending(p => p.CreatedAt),
        };
        return await ToCardsAsync(await query.Take(limit).Select(CardProjection).ToListAsync(ct), ct);
    }
}
