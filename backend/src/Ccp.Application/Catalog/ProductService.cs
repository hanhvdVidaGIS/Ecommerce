using System.Linq.Expressions;
using System.Security.Cryptography;
using System.Text;
using Ccp.Application.Abstractions;
using Ccp.Application.Common;
using Ccp.Domain.Entities;
using Ccp.Domain.Enums;
using Ccp.Domain.Security;
using Microsoft.EntityFrameworkCore;

namespace Ccp.Application.Catalog;

public class ProductService(IAppDbContext db, MediaResolver media, IHtmlSanitizerService sanitizer, ICurrentUser user, ISiteCache cache, AuditService audit)
{
    public const int MaxVariants = 200;

    private static readonly IReadOnlyDictionary<string, Expression<Func<Product, object?>>> Sorts = new Dictionary<string, Expression<Func<Product, object?>>>
    {
        ["name"] = p => p.Name, ["createdAt"] = p => p.CreatedAt, ["minPrice"] = p => p.MinPrice, ["status"] = p => p.Status, ["soldCount"] = p => p.SoldCount,
    };

    // ---------- đọc ----------
    public async Task<PagedResult<ProductListItemDto>> ListAsync(ProductQuery q, CancellationToken ct = default)
    {
        var query = db.Products.AsNoTracking().AsQueryable();
        if (q.CategoryId is not null)
        {
            var ids = await DescendantIdsAsync(q.CategoryId.Value, ct);
            query = query.Where(p => (p.PrimaryCategoryId != null && ids.Contains(p.PrimaryCategoryId.Value)) || p.Categories.Any(c => ids.Contains(c.CategoryId)));
        }
        if (q.BrandId is not null) query = query.Where(p => p.BrandId == q.BrandId);
        if (q.Status is not null) query = query.Where(p => p.Status == q.Status);
        if (q.IsFeatured is not null) query = query.Where(p => p.IsFeatured == q.IsFeatured);
        if (q.IsBestSeller is not null) query = query.Where(p => p.IsBestSeller == q.IsBestSeller);
        if (q.IsNew is not null) query = query.Where(p => p.IsNew == q.IsNew);
        if (!string.IsNullOrWhiteSpace(q.Q))
        {
            var t = q.Q.Trim().ToLower();
            query = query.Where(p => p.Name.ToLower().Contains(t) || p.Slug.Contains(t)
                || p.Variants.Any(v => v.Sku.ToLower().Contains(t) || (v.Barcode != null && v.Barcode.Contains(t)))
                || (p.Brand != null && p.Brand.Name.ToLower().Contains(t))
                || (p.PrimaryCategory != null && p.PrimaryCategory.Name.ToLower().Contains(t)));
        }

        var page = await query.ApplySort(q.Sort, Sorts, "createdAt:desc")
            .Select(p => new
            {
                p.Id, p.Name, p.Slug, p.Status, p.IsFeatured, p.IsBestSeller, p.IsNew, p.MinPrice, p.MaxPrice, p.CreatedAt,
                CategoryName = p.PrimaryCategory != null ? p.PrimaryCategory.Name : null,
                BrandName = p.Brand != null ? p.Brand.Name : null,
                Sku = p.Variants.OrderByDescending(v => v.IsDefault).ThenBy(v => v.Sku).Select(v => v.Sku).FirstOrDefault(),
                Stock = p.Variants.Where(v => v.IsActive).Sum(v => (int?)v.StockQuantity) ?? 0,
                VariantCount = p.Variants.Count,
                ImageMediaId = p.Images.OrderByDescending(i => i.IsPrimary).ThenBy(i => i.SortOrder).Select(i => (Guid?)i.MediaId).FirstOrDefault(),
            }).ToPagedAsync(q, ct);

        var images = await media.LoadAsync(page.Items.Select(i => i.ImageMediaId), ct);
        return new PagedResult<ProductListItemDto>(page.Items.Select(i => new ProductListItemDto(i.Id, i.Name, i.Slug, i.Status, i.IsFeatured, i.IsBestSeller, i.IsNew,
            i.CategoryName, i.BrandName, i.Sku, i.MinPrice, i.MaxPrice, i.Stock, i.VariantCount, MediaResolver.Get(images, i.ImageMediaId), i.CreatedAt)).ToList(),
            page.Page, page.PageSize, page.Total);
    }

    public async Task<ProductDetailDto> GetAsync(Guid id, CancellationToken ct = default)
    {
        var p = await db.Products.AsNoTracking().AsSplitQuery()
            .Include(x => x.Variants).ThenInclude(v => v.OptionValues)
            .Include(x => x.Images).Include(x => x.Categories).Include(x => x.AttributeAssignments)
            .SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw AppException.NotFound("sản phẩm");
        return await ToDetailAsync(p, ct);
    }

    // ---------- ghi ----------
    public async Task<ProductDetailDto> CreateAsync(SaveProductRequest req, CancellationToken ct = default)
    {
        var product = new Product();
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var ctx = await ValidateAsync(product, req, ct);
        db.Products.Add(product);
        Fill(product, req, ctx);
        ReplaceVariants(product, req, ctx, existing: []);
        ReplaceImagesCategoriesAttributes(product, req, ctx);
        RecomputePrices(product);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        cache.InvalidateAll();
        return await GetAsync(product.Id, ct);
    }

    public async Task<ProductDetailDto> UpdateAsync(Guid id, SaveProductRequest req, CancellationToken ct = default)
    {
        var product = await db.Products.AsSplitQuery()
            .Include(x => x.Variants).ThenInclude(v => v.OptionValues)
            .Include(x => x.Images).Include(x => x.Categories).Include(x => x.AttributeAssignments)
            .SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw AppException.NotFound("sản phẩm");

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var ctx = await ValidateAsync(product, req, ct);
        Fill(product, req, ctx);

        // Bước 1: gỡ biến thể không còn, cùng ảnh/danh mục phụ/thuộc tính cũ, để các ràng buộc duy nhất không va chạm với bản ghi mới.
        var keptIds = req.Variants.Where(v => v.Id.HasValue).Select(v => v.Id!.Value).ToHashSet();
        var removed = product.Variants.Where(v => !keptIds.Contains(v.Id)).ToList();
        foreach (var v in removed) await RemoveVariantAsync(v, ct);
        db.ProductImages.RemoveRange(product.Images);
        db.ProductCategories.RemoveRange(product.Categories);
        db.ProductAttributeAssignments.RemoveRange(product.AttributeAssignments);
        product.Images.Clear(); product.Categories.Clear(); product.AttributeAssignments.Clear();
        await db.SaveChangesAsync(ct);

        LogPriceChanges(product, req);

        // Bước 2: ghi bản mới.
        ReplaceVariants(product, req, ctx, existing: product.Variants.Where(v => keptIds.Contains(v.Id)).ToList());
        ReplaceImagesCategoriesAttributes(product, req, ctx);
        RecomputePrices(product);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        cache.InvalidateAll();
        return await GetAsync(product.Id, ct);
    }

    public async Task<ProductDetailDto> UpdateFlagsAsync(Guid id, UpdateProductFlagsRequest req, CancellationToken ct = default)
    {
        var p = await db.Products.Include(x => x.Variants).SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw AppException.NotFound("sản phẩm");
        if (req.Status == ProductStatus.Active) EnsureCanActivate(p.Variants);
        if (req.IsFeatured is not null) p.IsFeatured = req.IsFeatured.Value;
        if (req.IsBestSeller is not null) p.IsBestSeller = req.IsBestSeller.Value;
        if (req.IsNew is not null) p.IsNew = req.IsNew.Value;
        if (req.Status is not null) p.Status = req.Status.Value;
        await db.SaveChangesAsync(ct);
        cache.InvalidateAll();
        return await GetAsync(id, ct);
    }

    public async Task DeleteAsync(Guid id, CancellationToken ct = default)
    {
        var p = await db.Products.Include(x => x.Variants).SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw AppException.NotFound("sản phẩm");
        foreach (var v in p.Variants.ToList()) await RemoveVariantAsync(v, ct);
        db.Wishlists.RemoveRange(await db.Wishlists.Where(w => w.ProductId == id).ToListAsync(ct));
        db.Products.Remove(p);
        await db.SaveChangesAsync(ct);
        cache.InvalidateAll();
    }

    public async Task<IReadOnlyList<GeneratedVariantDto>> GenerateVariantsAsync(GenerateVariantsRequest req, CancellationToken ct = default)
    {
        if (req.Options.Count == 0) throw AppException.Validation("Chọn ít nhất một thuộc tính.", new ErrorDetail("options", "Bắt buộc."));
        if (req.Options.Select(o => o.AttributeId).Distinct().Count() != req.Options.Count)
            throw AppException.Validation("Thuộc tính bị lặp.", new ErrorDetail("options", "Lặp thuộc tính."));
        var total = req.Options.Aggregate(1L, (acc, o) => acc * Math.Max(1, o.ValueIds.Distinct().Count()));
        if (req.Options.Any(o => o.ValueIds.Count == 0)) throw AppException.Validation("Mỗi thuộc tính cần ít nhất một giá trị.", new ErrorDetail("options", "Thiếu giá trị."));
        if (total > MaxVariants) throw AppException.Validation($"Tổ hợp tạo ra {total} biến thể, vượt giới hạn {MaxVariants}.", new ErrorDetail("options", "Quá nhiều tổ hợp."));

        var attrIds = req.Options.Select(o => o.AttributeId).ToList();
        var attrs = await db.ProductAttributes.AsNoTracking().Include(a => a.Values).Where(a => attrIds.Contains(a.Id)).ToDictionaryAsync(a => a.Id, ct);
        foreach (var o in req.Options)
        {
            if (!attrs.TryGetValue(o.AttributeId, out var a) || !a.IsVariantOption || !a.IsActive)
                throw AppException.Validation("Thuộc tính không dùng để tạo biến thể.", new ErrorDetail("options", "Thuộc tính không hợp lệ."));
            var valid = a.Values.Select(v => v.Id).ToHashSet();
            if (o.ValueIds.Any(v => !valid.Contains(v))) throw AppException.Validation("Giá trị không thuộc thuộc tính.", new ErrorDetail("options", "Giá trị không hợp lệ."));
        }

        IEnumerable<List<GeneratedVariantOption>> combos = [[]];
        foreach (var o in req.Options)
        {
            var a = attrs[o.AttributeId];
            var values = o.ValueIds.Distinct().Select(id => a.Values.Single(v => v.Id == id)).OrderBy(v => v.SortOrder).ThenBy(v => v.Label).ToList();
            combos = combos.SelectMany(prefix => values.Select(v => new List<GeneratedVariantOption>(prefix) { new(a.Id, a.Name, v.Id, v.Label) })).ToList();
        }
        var baseSku = string.IsNullOrWhiteSpace(req.BaseSku) ? "SKU" : req.BaseSku.Trim().ToUpperInvariant();
        return combos.Select(c => new GeneratedVariantDto(
            $"{baseSku}-{string.Join('-', c.Select(o => Slugger.Slugify(o.ValueLabel).ToUpperInvariant()))}",
            string.Join(" / ", c.Select(o => o.ValueLabel)), c)).ToList();
    }

    // ---------- kiểm tra ----------
    private sealed record Context(
        Dictionary<Guid, ProductAttribute> Attributes, HashSet<Guid> Applicable, List<Guid> OptionAttributeIds, List<Guid> ExtraCategoryIds);

    private async Task<Context> ValidateAsync(Product product, SaveProductRequest req, CancellationToken ct)
    {
        var errors = new List<ErrorDetail>();
        void Fail(string field, string message) => errors.Add(new ErrorDetail(field, message));

        var name = req.Name.Trim();
        var slug = SlugRules.Resolve(req.Slug, name);
        if (await db.Products.AnyAsync(p => p.Slug == slug && p.Id != product.Id, ct)) throw AppException.Conflict("Slug đã được dùng bởi sản phẩm khác.", "slug_taken");

        // danh mục, thương hiệu
        var categoryIds = (req.CategoryIds ?? []).Where(c => c != req.PrimaryCategoryId).Distinct().ToList();
        var wantedCats = categoryIds.Concat(req.PrimaryCategoryId is null ? [] : [req.PrimaryCategoryId.Value]).ToList();
        if (wantedCats.Count > 0 && await db.Categories.CountAsync(c => wantedCats.Contains(c.Id), ct) != wantedCats.Count) Fail("primaryCategoryId", "Danh mục không tồn tại.");
        if (req.BrandId is not null && !await db.Brands.AnyAsync(b => b.Id == req.BrandId, ct)) Fail("brandId", "Thương hiệu không tồn tại.");

        // thuộc tính áp dụng cho danh mục chính (và các danh mục cha của nó)
        var applicable = new HashSet<Guid>();
        if (req.PrimaryCategoryId is not null)
        {
            var chain = await AncestorIdsAsync(req.PrimaryCategoryId.Value, ct);
            applicable = (await db.CategoryAttributes.Where(x => chain.Contains(x.CategoryId)).Select(x => x.AttributeId).ToListAsync(ct)).ToHashSet();
        }

        var attrIds = (req.Attributes ?? []).Select(a => a.AttributeId)
            .Concat(req.Variants.SelectMany(v => v.Options ?? []).Select(o => o.AttributeId)).Concat(applicable).Distinct().ToList();
        var attributes = await db.ProductAttributes.Include(a => a.Values).Where(a => attrIds.Contains(a.Id)).ToDictionaryAsync(a => a.Id, ct);

        var optionAttrIds = ValidateVariants(product, req, attributes, applicable, Fail);
        ValidateAttributeValues(req, attributes, applicable, Fail);
        await ValidateSkusAsync(product, req, Fail, ct);

        if (req.Status == ProductStatus.Active && !req.Variants.Any(v => v.IsActive)) Fail("status", "Sản phẩm đang bán cần ít nhất một biến thể đang bật.");
        if ((req.Images ?? []).Select(i => i.MediaId).Distinct().Count() != (req.Images ?? []).Count) Fail("images", "Ảnh bị lặp.");
        await media.EnsureExistAsync("images", (req.Images ?? []).Select(i => (Guid?)i.MediaId), ct);
        await media.EnsureExistAsync("variants.imageMediaId", req.Variants.Select(v => v.ImageMediaId), ct);
        await media.EnsureExistAsync("seo.ogImageMediaId", [req.Seo?.OgImageMediaId], ct);

        if (errors.Count > 0) throw AppException.Validation("Dữ liệu sản phẩm không hợp lệ.", errors.ToArray());
        return new Context(attributes, applicable, optionAttrIds, categoryIds);
    }

    private static List<Guid> ValidateVariants(Product product, SaveProductRequest req, Dictionary<Guid, ProductAttribute> attributes,
        HashSet<Guid> applicable, Action<string, string> fail)
    {
        if (req.Variants.Count == 0) { fail("variants", "Cần ít nhất một biến thể."); return []; }
        var optionSets = req.Variants.Select(v => (v.Options ?? []).Select(o => o.AttributeId).OrderBy(x => x).ToList()).ToList();
        var first = optionSets[0];
        if (optionSets.Any(s => !s.SequenceEqual(first))) fail("variants", "Mọi biến thể phải dùng cùng một bộ thuộc tính tuỳ chọn.");
        if (first.Distinct().Count() != first.Count) fail("variants", "Một biến thể không được lặp thuộc tính.");
        if (first.Count == 0 && req.Variants.Count != 1) fail("variants", "Sản phẩm không có tuỳ chọn chỉ có đúng một biến thể.");

        foreach (var attrId in first.Distinct())
        {
            if (!attributes.TryGetValue(attrId, out var a)) { fail("variants", "Thuộc tính tuỳ chọn không tồn tại."); continue; }
            if (!a.IsVariantOption || !a.IsActive) fail("variants", $"Thuộc tính \"{a.Name}\" không dùng để tạo biến thể.");
            if (!applicable.Contains(attrId)) fail("variants", $"Thuộc tính \"{a.Name}\" không áp dụng cho danh mục của sản phẩm.");
        }

        var seen = new HashSet<string>();
        for (var i = 0; i < req.Variants.Count; i++)
        {
            foreach (var o in req.Variants[i].Options ?? [])
                if (attributes.TryGetValue(o.AttributeId, out var a) && a.Values.All(v => v.Id != o.ValueId))
                    fail($"variants[{i}].options", $"Giá trị không thuộc thuộc tính \"{a.Name}\".");
            if (!seen.Add(OptionHash(req.Variants[i].Options))) fail($"variants[{i}]", "Trùng tổ hợp tuỳ chọn với biến thể khác.");
        }

        var ids = req.Variants.Where(v => v.Id.HasValue).Select(v => v.Id!.Value).ToList();
        if (ids.Distinct().Count() != ids.Count) fail("variants", "Mã biến thể bị lặp.");
        if (product.Id != Guid.Empty && ids.Any(id => product.Variants.All(v => v.Id != id))) fail("variants", "Biến thể không thuộc sản phẩm này.");
        return first.Distinct().ToList();
    }

    private static void ValidateAttributeValues(SaveProductRequest req, Dictionary<Guid, ProductAttribute> attributes, HashSet<Guid> applicable, Action<string, string> fail)
    {
        var given = new HashSet<Guid>();
        foreach (var (a, i) in (req.Attributes ?? []).Select((a, i) => (a, i)))
        {
            var field = $"attributes[{i}]";
            if (!given.Add(a.AttributeId)) { fail(field, "Thuộc tính bị lặp."); continue; }
            if (!attributes.TryGetValue(a.AttributeId, out var attr) || !attr.IsActive) { fail(field, "Thuộc tính không tồn tại hoặc đã tắt."); continue; }
            if (attr.IsVariantOption) { fail(field, $"\"{attr.Name}\" là thuộc tính tạo biến thể, khai báo qua biến thể."); continue; }
            if (!applicable.Contains(attr.Id)) { fail(field, $"\"{attr.Name}\" không áp dụng cho danh mục của sản phẩm."); continue; }

            var valueIds = a.ValueIds ?? [];
            switch (attr.DataType)
            {
                case AttributeDataType.Text:
                    if (string.IsNullOrWhiteSpace(a.Text) || a.Text.Length > 1000) fail(field, $"\"{attr.Name}\" cần văn bản (tối đa 1000 ký tự).");
                    break;
                case AttributeDataType.Number:
                    if (a.Number is null) fail(field, $"\"{attr.Name}\" cần một số.");
                    break;
                case AttributeDataType.Boolean:
                    if (a.Bool is null) fail(field, $"\"{attr.Name}\" cần giá trị đúng/sai.");
                    break;
                case AttributeDataType.MultiSelect:
                    if (valueIds.Count == 0) fail(field, $"\"{attr.Name}\" cần ít nhất một giá trị.");
                    break;
                default:
                    if (valueIds.Count != 1) fail(field, $"\"{attr.Name}\" cần đúng một giá trị.");
                    break;
            }
            if (valueIds.Any(v => attr.Values.All(x => x.Id != v))) fail(field, $"Giá trị không thuộc thuộc tính \"{attr.Name}\".");
        }
        foreach (var attr in attributes.Values.Where(a => applicable.Contains(a.Id) && a.IsActive && a.IsRequired && !a.IsVariantOption && !given.Contains(a.Id)))
            fail("attributes", $"Thiếu thuộc tính bắt buộc \"{attr.Name}\".");
    }

    private async Task ValidateSkusAsync(Product product, SaveProductRequest req, Action<string, string> fail, CancellationToken ct)
    {
        var skus = req.Variants.Select(v => v.Sku.Trim()).ToList();
        foreach (var dup in skus.GroupBy(s => s.ToLowerInvariant()).Where(g => g.Count() > 1)) fail("variants", $"SKU \"{dup.First()}\" bị lặp trong cùng sản phẩm.");
        var own = product.Variants.Select(v => v.Id).ToList();
        var lower = skus.Select(s => s.ToLowerInvariant()).ToList();
        var taken = await db.ProductVariants.AsNoTracking().Where(v => lower.Contains(v.Sku.ToLower()) && !own.Contains(v.Id)).Select(v => v.Sku).ToListAsync(ct);
        foreach (var sku in taken) fail("variants", $"SKU \"{sku}\" đã được dùng bởi sản phẩm khác.");
    }

    // ---------- áp dụng ----------
    private void Fill(Product p, SaveProductRequest req, Context ctx)
    {
        p.Name = req.Name.Trim();
        p.Slug = SlugRules.Resolve(req.Slug, p.Name);
        p.PrimaryCategoryId = req.PrimaryCategoryId;
        p.BrandId = req.BrandId;
        p.ShortDescription = string.IsNullOrWhiteSpace(req.ShortDescription) ? null : sanitizer.Sanitize(req.ShortDescription);
        p.Description = string.IsNullOrWhiteSpace(req.Description) ? null : sanitizer.Sanitize(req.Description);
        p.VideoUrl = string.IsNullOrWhiteSpace(req.VideoUrl) ? null : req.VideoUrl.Trim();
        p.Status = req.Status;
        p.IsFeatured = req.IsFeatured; p.IsBestSeller = req.IsBestSeller; p.IsNew = req.IsNew;
        (req.Seo ?? new SeoDto(null, null, null, null, null, false)).ApplyTo(p.Seo);
    }

    private void ReplaceVariants(Product p, SaveProductRequest req, Context ctx, List<ProductVariant> existing)
    {
        var canCost = user.HasPermission(Permissions.ProductViewCost);
        foreach (var r in req.Variants)
        {
            var variant = r.Id.HasValue ? existing.Single(v => v.Id == r.Id.Value) : new ProductVariant { ProductId = p.Id };
            variant.Sku = r.Sku.Trim();
            variant.Barcode = string.IsNullOrWhiteSpace(r.Barcode) ? null : r.Barcode.Trim();
            variant.Price = r.Price;
            variant.SalePrice = r.SalePrice;
            if (canCost) variant.CostPrice = r.CostPrice; // người không có quyền giá vốn không ghi đè được giá vốn
            variant.StockQuantity = r.StockQuantity;
            variant.IsActive = r.IsActive;
            variant.ImageMediaId = r.ImageMediaId;
            variant.OptionHash = OptionHash(r.Options);
            variant.IsDefault = (r.Options?.Count ?? 0) == 0;

            // tuỳ chọn: cập nhật tại chỗ theo thuộc tính (khoá chính là (biến thể, thuộc tính)), xoá phần dư, thêm phần mới
            var wanted = (r.Options ?? []).ToDictionary(o => o.AttributeId, o => o.ValueId);
            foreach (var old in variant.OptionValues.Where(o => !wanted.ContainsKey(o.AttributeId)).ToList())
            {
                variant.OptionValues.Remove(old);
                db.VariantOptionValues.Remove(old);
            }
            foreach (var (attributeId, valueId) in wanted)
            {
                var have = variant.OptionValues.FirstOrDefault(o => o.AttributeId == attributeId);
                if (have is not null) have.ValueId = valueId;
                else variant.OptionValues.Add(new VariantOptionValue { VariantId = variant.Id, AttributeId = attributeId, ValueId = valueId });
            }

            if (!r.Id.HasValue) { variant.ProductId = p.Id; p.Variants.Add(variant); db.ProductVariants.Add(variant); }
        }
    }

    private void ReplaceImagesCategoriesAttributes(Product p, SaveProductRequest req, Context ctx)
    {
        var images = req.Images ?? [];
        var primaryIndex = images.ToList().FindIndex(i => i.IsPrimary);
        for (var i = 0; i < images.Count; i++)
            db.ProductImages.Add(new ProductImage { ProductId = p.Id, MediaId = images[i].MediaId, SortOrder = (i + 1) * 10, IsPrimary = i == (primaryIndex < 0 ? 0 : primaryIndex) });

        foreach (var (cid, i) in ctx.ExtraCategoryIds.Select((c, i) => (c, i)))
            db.ProductCategories.Add(new ProductCategory { ProductId = p.Id, CategoryId = cid, SortOrder = i });

        foreach (var a in req.Attributes ?? [])
        {
            var attr = ctx.Attributes[a.AttributeId];
            if (attr.DataType is AttributeDataType.Text) db.ProductAttributeAssignments.Add(new ProductAttributeAssignment { ProductId = p.Id, AttributeId = attr.Id, TextValue = a.Text!.Trim() });
            else if (attr.DataType is AttributeDataType.Number) db.ProductAttributeAssignments.Add(new ProductAttributeAssignment { ProductId = p.Id, AttributeId = attr.Id, NumberValue = a.Number });
            else if (attr.DataType is AttributeDataType.Boolean) db.ProductAttributeAssignments.Add(new ProductAttributeAssignment { ProductId = p.Id, AttributeId = attr.Id, BoolValue = a.Bool });
            else foreach (var valueId in a.ValueIds!.Distinct())
                    db.ProductAttributeAssignments.Add(new ProductAttributeAssignment { ProductId = p.Id, AttributeId = attr.Id, ValueId = valueId });
        }
    }

    /// <summary>Ghi nhật ký khi giá bán, giá khuyến mãi hoặc giá vốn của biến thể sẵn có thay đổi.</summary>
    private void LogPriceChanges(Product product, SaveProductRequest req)
    {
        var canCost = user.HasPermission(Permissions.ProductViewCost);
        var changes = new List<object>();
        foreach (var r in req.Variants.Where(v => v.Id.HasValue))
        {
            var v = product.Variants.SingleOrDefault(x => x.Id == r.Id!.Value);
            if (v is null) continue;
            var costChanged = canCost && v.CostPrice != r.CostPrice;
            if (v.Price != r.Price || v.SalePrice != r.SalePrice || costChanged)
                changes.Add(new { sku = v.Sku, price = new { from = v.Price, to = r.Price }, salePrice = new { from = v.SalePrice, to = r.SalePrice },
                    costPrice = costChanged ? new { from = v.CostPrice, to = r.CostPrice } : null });
        }
        if (changes.Count > 0) audit.Log("product.price", nameof(Product), product.Id.ToString(), changes);
    }

    private static void RecomputePrices(Product p)
    {
        var prices = p.Variants.Where(v => v.IsActive && !v.IsDeleted).Select(v => v.EffectivePrice).ToList();
        p.MinPrice = prices.Count == 0 ? 0 : prices.Min();
        p.MaxPrice = prices.Count == 0 ? 0 : prices.Max();
    }

    private static void EnsureCanActivate(IEnumerable<ProductVariant> variants)
    {
        if (!variants.Any(v => v.IsActive)) throw AppException.Validation("Sản phẩm cần ít nhất một biến thể đang bật mới chuyển sang đang bán.", new ErrorDetail("status", "Thiếu biến thể."));
    }

    private async Task RemoveVariantAsync(ProductVariant v, CancellationToken ct)
    {
        db.CartItems.RemoveRange(await db.CartItems.Where(c => c.VariantId == v.Id).ToListAsync(ct));
        db.FlashSaleItems.RemoveRange(await db.FlashSaleItems.Where(f => f.VariantId == v.Id).ToListAsync(ct));
        db.VariantOptionValues.RemoveRange(v.OptionValues);
        db.ProductVariants.Remove(v); // xoá mềm
    }

    public static string OptionHash(IReadOnlyList<VariantOptionDto>? options)
    {
        if (options is null || options.Count == 0) return "";
        var key = string.Join('|', options.OrderBy(o => o.AttributeId).Select(o => $"{o.AttributeId:N}:{o.ValueId:N}"));
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(key)))[..32].ToLowerInvariant();
    }

    // ---------- chi tiết ----------
    private async Task<ProductDetailDto> ToDetailAsync(Product p, CancellationToken ct)
    {
        var canCost = user.HasPermission(Permissions.ProductViewCost);
        var mediaMap = await media.LoadAsync(p.Images.Select(i => (Guid?)i.MediaId).Concat(p.Variants.Select(v => v.ImageMediaId)), ct);
        var variants = p.Variants.Where(v => !v.IsDeleted).OrderByDescending(v => v.IsDefault).ThenBy(v => v.Sku)
            .Select(v => new VariantDto(v.Id, v.Sku, v.Barcode, v.Price, v.SalePrice, canCost ? v.CostPrice : null, v.StockQuantity, v.IsDefault, v.IsActive,
                v.ImageMediaId, MediaResolver.Get(mediaMap, v.ImageMediaId), v.OptionValues.Select(o => new VariantOptionDto(o.AttributeId, o.ValueId)).ToList())).ToList();
        var optionAttrs = variants.SelectMany(v => v.Options.Select(o => o.AttributeId)).Distinct().ToList();

        var attributes = p.AttributeAssignments.GroupBy(a => a.AttributeId).Select(g => new ProductAttributeValueInput(
            g.Key, g.Where(x => x.ValueId != null).Select(x => x.ValueId!.Value).ToList(), g.Select(x => x.TextValue).FirstOrDefault(x => x != null),
            g.Select(x => x.NumberValue).FirstOrDefault(x => x != null), g.Select(x => x.BoolValue).FirstOrDefault(x => x != null))).ToList();

        var applicable = p.PrimaryCategoryId is null ? [] : await ApplicableAttributeIdsAsync(p.PrimaryCategoryId.Value, ct);
        return new ProductDetailDto(p.Id, p.Name, p.Slug, p.PrimaryCategoryId, p.Categories.OrderBy(c => c.SortOrder).Select(c => c.CategoryId).ToList(), p.BrandId,
            p.ShortDescription, p.Description, p.VideoUrl, p.Status, p.IsFeatured, p.IsBestSeller, p.IsNew, SeoDto.From(p.Seo),
            p.Images.OrderBy(i => i.SortOrder).Select(i => new ProductImageDto(i.MediaId, MediaResolver.Get(mediaMap, i.MediaId), i.SortOrder, i.IsPrimary)).ToList(),
            attributes, optionAttrs, variants, canCost, applicable);
    }

    private async Task<IReadOnlyList<Guid>> ApplicableAttributeIdsAsync(Guid categoryId, CancellationToken ct)
    {
        var chain = await AncestorIdsAsync(categoryId, ct);
        return await db.CategoryAttributes.AsNoTracking().Where(x => chain.Contains(x.CategoryId)).OrderBy(x => x.SortOrder).Select(x => x.AttributeId).Distinct().ToListAsync(ct);
    }

    private async Task<List<Guid>> AncestorIdsAsync(Guid categoryId, CancellationToken ct)
    {
        var parents = await db.Categories.AsNoTracking().ToDictionaryAsync(c => c.Id, c => c.ParentId, ct);
        var chain = new List<Guid>();
        Guid? current = categoryId;
        while (current is not null && parents.TryGetValue(current.Value, out var parent) && chain.Count < 20) { chain.Add(current.Value); current = parent; }
        return chain;
    }

    private async Task<List<Guid>> DescendantIdsAsync(Guid categoryId, CancellationToken ct)
    {
        var all = await db.Categories.AsNoTracking().Select(c => new { c.Id, c.ParentId }).ToListAsync(ct);
        var result = new List<Guid> { categoryId };
        for (var i = 0; i < result.Count; i++) result.AddRange(all.Where(c => c.ParentId == result[i]).Select(c => c.Id));
        return result;
    }
}
