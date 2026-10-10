namespace Ccp.Tests.Infrastructure;

/// <summary>Dựng dữ liệu danh mục qua chính API quản trị (không chèn thẳng vào cơ sở dữ liệu).</summary>
public static class CatalogApi
{
    public static string Uniq(string prefix = "t") => $"{prefix}{Guid.NewGuid():N}"[..14];

    public static async Task<Guid> CategoryAsync(TestClient admin, string? name = null, Guid? parentId = null)
    {
        name ??= Uniq("Danh mục ");
        var r = await admin.PostAsync("/api/admin/categories", new { name, parentId, isActive = true, sortOrder = 0 });
        if (!r.Success) throw new InvalidOperationException("Tạo danh mục thất bại: " + r.Body);
        return r.Data.GetProperty("id").GetGuid();
    }

    public static async Task<Guid> BrandAsync(TestClient admin, string? name = null)
    {
        var r = await admin.PostAsync("/api/admin/brands", new { name = name ?? Uniq("Hiệu "), isActive = true, sortOrder = 0 });
        if (!r.Success) throw new InvalidOperationException("Tạo thương hiệu thất bại: " + r.Body);
        return r.Data.GetProperty("id").GetGuid();
    }

    public sealed record AttributeInfo(Guid Id, string Code, Dictionary<string, Guid> ValueIds);

    public static async Task<AttributeInfo> AttributeAsync(TestClient admin, string dataType, bool variantOption, bool filterable, bool required,
        IEnumerable<Guid> categoryIds, params string[] valueLabels)
    {
        var code = "a" + Guid.NewGuid().ToString("N")[..10];
        var r = await admin.PostAsync("/api/admin/attributes", new
        {
            code, name = "Thuộc tính " + code, dataType, isFilterable = filterable, isVariantOption = variantOption, isRequired = required,
            isVisibleOnProduct = true, isActive = true, sortOrder = 0,
        });
        if (!r.Success) throw new InvalidOperationException("Tạo thuộc tính thất bại: " + r.Body);
        var id = r.Data.GetProperty("id").GetGuid();
        var values = new Dictionary<string, Guid>();
        foreach (var label in valueLabels)
        {
            var v = await admin.PostAsync($"/api/admin/attributes/{id}/values",
                new { label, colorHex = dataType == "Color" ? "#112233" : null, sortOrder = values.Count });
            if (!v.Success) throw new InvalidOperationException("Tạo giá trị thất bại: " + v.Body);
            values[label] = v.Data.GetProperty("id").GetGuid();
        }
        var cats = categoryIds.ToList();
        if (cats.Count > 0)
        {
            var a = await admin.PutAsync($"/api/admin/attributes/{id}/categories", new { categoryIds = cats });
            if (!a.Success) throw new InvalidOperationException("Gán danh mục thất bại: " + a.Body);
        }
        return new AttributeInfo(id, code, values);
    }

    public static object Variant(string sku, decimal price = 100_000, int stock = 10, IEnumerable<(Guid AttributeId, Guid ValueId)>? options = null,
        decimal? sale = null, decimal? cost = null, bool active = true, Guid? id = null) => new
    {
        id, sku, price, salePrice = sale, costPrice = cost, stockQuantity = stock, isActive = active,
        options = (options ?? []).Select(o => new { attributeId = o.AttributeId, valueId = o.ValueId }).ToList(),
    };

    public static Dictionary<string, object?> ProductPayload(string? name = null, Guid? categoryId = null, Guid? brandId = null,
        IEnumerable<object>? variants = null, string status = "Active", IEnumerable<object>? attributes = null, string? description = null) => new()
    {
        ["name"] = name ?? Uniq("SP "),
        ["primaryCategoryId"] = categoryId,
        ["brandId"] = brandId,
        ["status"] = status,
        ["description"] = description,
        ["attributes"] = (attributes ?? []).ToList(),
        ["variants"] = (variants ?? [Variant(Uniq("SKU-").ToUpperInvariant())]).ToList(),
    };

    public static async Task<ApiResult> CreateProductAsync(TestClient admin, Dictionary<string, object?> payload) =>
        await admin.PostAsync("/api/admin/products", payload);
}
