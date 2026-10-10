using System.Text.RegularExpressions;
using Ccp.Application.Abstractions;
using Ccp.Application.Common;
using Ccp.Domain.Entities;
using Ccp.Domain.Enums;
using FluentValidation;
using Microsoft.EntityFrameworkCore;

namespace Ccp.Application.Catalog;

public sealed record AttributeValueDto(Guid Id, string Code, string Label, string? ColorHex, Guid? ImageMediaId, MediaRefDto? Image, int SortOrder);

public sealed record AttributeListItemDto(Guid Id, string Code, string Name, AttributeDataType DataType, bool IsFilterable, bool IsVariantOption,
    bool IsActive, int SortOrder, int ValueCount, int CategoryCount);

public sealed record AttributeDetailDto(Guid Id, string Code, string Name, AttributeDataType DataType, string? Unit, bool IsFilterable, bool IsVariantOption,
    bool IsRequired, bool IsVisibleOnProduct, bool IsActive, int SortOrder, IReadOnlyList<AttributeValueDto> Values, IReadOnlyList<Guid> CategoryIds);

public sealed record SaveAttributeRequest(string Code, string Name, AttributeDataType DataType, string? Unit, bool IsFilterable, bool IsVariantOption,
    bool IsRequired, bool IsVisibleOnProduct, bool IsActive, int SortOrder);

public sealed record SaveAttributeValueRequest(string? Code, string Label, string? ColorHex, Guid? ImageMediaId, int SortOrder);
public sealed record SetAttributeCategoriesRequest(IReadOnlyList<Guid> CategoryIds);

public sealed class SaveAttributeRequestValidator : AbstractValidator<SaveAttributeRequest>
{
    public SaveAttributeRequestValidator()
    {
        RuleFor(x => x.Code).NotEmpty().MaximumLength(50).Matches("^[a-z][a-z0-9-]*$")
            .WithMessage("Mã thuộc tính gồm chữ thường, số, dấu gạch ngang và bắt đầu bằng chữ cái.");
        RuleFor(x => x.Name).NotEmpty().MaximumLength(100).WithMessage("Tên là bắt buộc (tối đa 100 ký tự).");
        RuleFor(x => x.DataType).IsInEnum();
        RuleFor(x => x.Unit).MaximumLength(20);
    }
}

public sealed class SaveAttributeValueRequestValidator : AbstractValidator<SaveAttributeValueRequest>
{
    public SaveAttributeValueRequestValidator()
    {
        RuleFor(x => x.Label).NotEmpty().MaximumLength(200).WithMessage("Nhãn là bắt buộc (tối đa 200 ký tự).");
        RuleFor(x => x.Code).MaximumLength(100).Matches("^[a-z0-9][a-z0-9-]*$").When(x => !string.IsNullOrEmpty(x.Code))
            .WithMessage("Mã giá trị gồm chữ thường, số, dấu gạch ngang.");
        RuleFor(x => x.ColorHex).Matches("^#[0-9A-Fa-f]{6}$").When(x => !string.IsNullOrEmpty(x.ColorHex)).WithMessage("Màu phải có dạng #RRGGBB.");
    }
}

public class AttributeService(IAppDbContext db, MediaResolver media, ISiteCache cache)
{
    public static bool HasValueList(AttributeDataType t) => t is AttributeDataType.Select or AttributeDataType.MultiSelect or AttributeDataType.Color or AttributeDataType.Image;

    public async Task<IReadOnlyList<AttributeListItemDto>> ListAsync(string? q, CancellationToken ct = default)
    {
        var query = db.ProductAttributes.AsNoTracking().AsQueryable();
        if (!string.IsNullOrWhiteSpace(q)) { var t = q.Trim().ToLower(); query = query.Where(a => a.Name.ToLower().Contains(t) || a.Code.Contains(t)); }
        var rows = await query.OrderBy(a => a.SortOrder).ThenBy(a => a.Name).ToListAsync(ct);
        var valueCounts = await db.ProductAttributeValues.AsNoTracking().GroupBy(v => v.AttributeId).Select(g => new { Id = g.Key, N = g.Count() }).ToDictionaryAsync(x => x.Id, x => x.N, ct);
        var catCounts = await db.CategoryAttributes.AsNoTracking().GroupBy(v => v.AttributeId).Select(g => new { Id = g.Key, N = g.Count() }).ToDictionaryAsync(x => x.Id, x => x.N, ct);
        return rows.Select(a => new AttributeListItemDto(a.Id, a.Code, a.Name, a.DataType, a.IsFilterable, a.IsVariantOption, a.IsActive, a.SortOrder,
            valueCounts.GetValueOrDefault(a.Id), catCounts.GetValueOrDefault(a.Id))).ToList();
    }

    public async Task<AttributeDetailDto> GetAsync(Guid id, CancellationToken ct = default)
    {
        var a = await db.ProductAttributes.AsNoTracking().Include(x => x.Values).SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw AppException.NotFound("thuộc tính");
        var images = await media.LoadAsync(a.Values.Select(v => v.ImageMediaId), ct);
        var cats = await db.CategoryAttributes.AsNoTracking().Where(x => x.AttributeId == id).Select(x => x.CategoryId).ToListAsync(ct);
        return new AttributeDetailDto(a.Id, a.Code, a.Name, a.DataType, a.Unit, a.IsFilterable, a.IsVariantOption, a.IsRequired, a.IsVisibleOnProduct, a.IsActive, a.SortOrder,
            a.Values.OrderBy(v => v.SortOrder).ThenBy(v => v.Label).Select(v => ToValueDto(v, images)).ToList(), cats);
    }

    public async Task<AttributeDetailDto> CreateAsync(SaveAttributeRequest req, CancellationToken ct = default)
    {
        Validate(req);
        if (await db.ProductAttributes.AnyAsync(a => a.Code == req.Code, ct)) throw AppException.Conflict("Mã thuộc tính đã tồn tại.", "code_taken");
        var attr = new ProductAttribute { Code = req.Code };
        Apply(attr, req);
        db.ProductAttributes.Add(attr);
        await db.SaveChangesAsync(ct);
        cache.InvalidateAll();
        return await GetAsync(attr.Id, ct);
    }

    public async Task<AttributeDetailDto> UpdateAsync(Guid id, SaveAttributeRequest req, CancellationToken ct = default)
    {
        Validate(req);
        var attr = await db.ProductAttributes.SingleOrDefaultAsync(a => a.Id == id, ct) ?? throw AppException.NotFound("thuộc tính");
        if (req.Code != attr.Code)
            throw AppException.Validation("Không đổi được mã thuộc tính sau khi tạo (mã nằm trong đường dẫn bộ lọc).", new ErrorDetail("code", "Không được đổi."));
        if (req.DataType != attr.DataType && await IsInUseAsync(id, ct))
            throw AppException.Conflict("Thuộc tính đã được gán cho sản phẩm nên không đổi được kiểu dữ liệu.", "in_use");
        if (req.IsVariantOption != attr.IsVariantOption && await IsInUseAsync(id, ct))
            throw AppException.Conflict("Thuộc tính đã được gán cho sản phẩm nên không đổi được vai trò tạo biến thể.", "in_use");
        if (!HasValueList(req.DataType) && await db.ProductAttributeValues.AnyAsync(v => v.AttributeId == id, ct))
            throw AppException.Conflict("Thuộc tính còn danh sách giá trị. Xoá các giá trị trước khi đổi sang kiểu không có danh sách.", "has_values");
        Apply(attr, req);
        await db.SaveChangesAsync(ct);
        cache.InvalidateAll();
        return await GetAsync(id, ct);
    }

    public async Task DeleteAsync(Guid id, CancellationToken ct = default)
    {
        var attr = await db.ProductAttributes.Include(a => a.Values).SingleOrDefaultAsync(a => a.Id == id, ct) ?? throw AppException.NotFound("thuộc tính");
        if (await IsInUseAsync(id, ct)) throw AppException.Conflict("Thuộc tính đang được dùng bởi sản phẩm. Gỡ khỏi sản phẩm trước.", "in_use");
        db.CategoryAttributes.RemoveRange(await db.CategoryAttributes.Where(x => x.AttributeId == id).ToListAsync(ct));
        foreach (var v in attr.Values.ToList()) db.ProductAttributeValues.Remove(v);
        db.ProductAttributes.Remove(attr);
        await db.SaveChangesAsync(ct);
        cache.InvalidateAll();
    }

    public async Task<AttributeDetailDto> SetCategoriesAsync(Guid id, SetAttributeCategoriesRequest req, CancellationToken ct = default)
    {
        if (!await db.ProductAttributes.AnyAsync(a => a.Id == id, ct)) throw AppException.NotFound("thuộc tính");
        var wanted = req.CategoryIds.Distinct().ToList();
        var existing = await db.Categories.Where(c => wanted.Contains(c.Id)).Select(c => c.Id).ToListAsync(ct);
        if (existing.Count != wanted.Count) throw AppException.Validation("Có danh mục không tồn tại.", new ErrorDetail("categoryIds", "Danh mục không tồn tại."));

        var current = await db.CategoryAttributes.Where(x => x.AttributeId == id).ToListAsync(ct);
        db.CategoryAttributes.RemoveRange(current.Where(x => !wanted.Contains(x.CategoryId)));
        foreach (var cid in wanted.Where(w => current.All(x => x.CategoryId != w)))
            db.CategoryAttributes.Add(new CategoryAttribute { AttributeId = id, CategoryId = cid });
        await db.SaveChangesAsync(ct);
        cache.InvalidateAll();
        return await GetAsync(id, ct);
    }

    // ---- giá trị ----
    public async Task<AttributeValueDto> CreateValueAsync(Guid attributeId, SaveAttributeValueRequest req, CancellationToken ct = default)
    {
        var attr = await db.ProductAttributes.AsNoTracking().SingleOrDefaultAsync(a => a.Id == attributeId, ct) ?? throw AppException.NotFound("thuộc tính");
        var value = new ProductAttributeValue { AttributeId = attributeId };
        await ApplyValueAsync(value, attr, req, ct);
        db.ProductAttributeValues.Add(value);
        await db.SaveChangesAsync(ct);
        cache.InvalidateAll();
        return ToValueDto(value, await media.LoadAsync([value.ImageMediaId], ct));
    }

    public async Task<AttributeValueDto> UpdateValueAsync(Guid attributeId, Guid valueId, SaveAttributeValueRequest req, CancellationToken ct = default)
    {
        var attr = await db.ProductAttributes.AsNoTracking().SingleOrDefaultAsync(a => a.Id == attributeId, ct) ?? throw AppException.NotFound("thuộc tính");
        var value = await db.ProductAttributeValues.SingleOrDefaultAsync(v => v.Id == valueId && v.AttributeId == attributeId, ct) ?? throw AppException.NotFound("giá trị");
        await ApplyValueAsync(value, attr, req, ct);
        await db.SaveChangesAsync(ct);
        cache.InvalidateAll();
        return ToValueDto(value, await media.LoadAsync([value.ImageMediaId], ct));
    }

    public async Task DeleteValueAsync(Guid attributeId, Guid valueId, CancellationToken ct = default)
    {
        var value = await db.ProductAttributeValues.SingleOrDefaultAsync(v => v.Id == valueId && v.AttributeId == attributeId, ct) ?? throw AppException.NotFound("giá trị");
        if (await db.ProductAttributeAssignments.AnyAsync(x => x.ValueId == valueId, ct) || await db.VariantOptionValues.AnyAsync(x => x.ValueId == valueId, ct))
            throw AppException.Conflict("Giá trị đang được dùng bởi sản phẩm. Gỡ khỏi sản phẩm trước.", "in_use");
        db.ProductAttributeValues.Remove(value);
        await db.SaveChangesAsync(ct);
        cache.InvalidateAll();
    }

    // ---- nội bộ ----
    private static void Validate(SaveAttributeRequest req)
    {
        if (req.IsVariantOption && req.DataType is not (AttributeDataType.Select or AttributeDataType.Color or AttributeDataType.Image))
            throw AppException.Validation("Chỉ thuộc tính kiểu Select, Color hoặc Image mới dùng để tạo biến thể.", new ErrorDetail("isVariantOption", "Kiểu dữ liệu không phù hợp."));
        if (req.IsFilterable && req.DataType == AttributeDataType.Text)
            throw AppException.Validation("Thuộc tính kiểu Text không dùng làm bộ lọc.", new ErrorDetail("isFilterable", "Kiểu dữ liệu không phù hợp."));
    }

    private static void Apply(ProductAttribute a, SaveAttributeRequest req)
    {
        a.Name = req.Name.Trim(); a.DataType = req.DataType; a.Unit = string.IsNullOrWhiteSpace(req.Unit) ? null : req.Unit.Trim();
        a.IsFilterable = req.IsFilterable; a.IsVariantOption = req.IsVariantOption; a.IsRequired = req.IsRequired && !req.IsVariantOption;
        a.IsVisibleOnProduct = req.IsVisibleOnProduct; a.IsActive = req.IsActive; a.SortOrder = req.SortOrder;
    }

    private async Task ApplyValueAsync(ProductAttributeValue v, ProductAttribute attr, SaveAttributeValueRequest req, CancellationToken ct)
    {
        if (!HasValueList(attr.DataType))
            throw AppException.Validation($"Thuộc tính kiểu {attr.DataType} không có danh sách giá trị.");
        if (attr.DataType == AttributeDataType.Color && string.IsNullOrEmpty(req.ColorHex))
            throw AppException.Validation("Giá trị kiểu Color cần mã màu.", new ErrorDetail("colorHex", "Bắt buộc."));
        if (attr.DataType == AttributeDataType.Image && req.ImageMediaId is null)
            throw AppException.Validation("Giá trị kiểu Image cần ảnh.", new ErrorDetail("imageMediaId", "Bắt buộc."));
        await media.EnsureExistAsync("imageMediaId", [req.ImageMediaId], ct);

        var label = req.Label.Trim();
        var code = string.IsNullOrWhiteSpace(req.Code) ? Slugger.Slugify(label) : req.Code.Trim();
        if (code.Length == 0 || !Regex.IsMatch(code, "^[a-z0-9][a-z0-9-]*$"))
            throw AppException.Validation("Mã giá trị không hợp lệ.", new ErrorDetail("code", "Chỉ chữ thường, số, gạch ngang."));
        if (await db.ProductAttributeValues.AnyAsync(x => x.AttributeId == attr.Id && x.Code == code && x.Id != v.Id, ct))
            throw AppException.Conflict("Mã giá trị đã tồn tại trong thuộc tính này.", "code_taken");

        v.Code = code; v.Label = label; v.SortOrder = req.SortOrder;
        v.ColorHex = attr.DataType == AttributeDataType.Color ? req.ColorHex!.ToUpperInvariant() : null;
        v.ImageMediaId = attr.DataType == AttributeDataType.Image ? req.ImageMediaId : null;
    }

    private async Task<bool> IsInUseAsync(Guid attributeId, CancellationToken ct) =>
        await db.ProductAttributeAssignments.AnyAsync(x => x.AttributeId == attributeId, ct) || await db.VariantOptionValues.AnyAsync(x => x.AttributeId == attributeId, ct);

    private static AttributeValueDto ToValueDto(ProductAttributeValue v, IReadOnlyDictionary<Guid, MediaRefDto> images) =>
        new(v.Id, v.Code, v.Label, v.ColorHex, v.ImageMediaId, MediaResolver.Get(images, v.ImageMediaId), v.SortOrder);
}
