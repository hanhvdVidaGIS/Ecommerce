using System.Text.Json;
using static Ccp.Tests.Infrastructure.CatalogApi;

namespace Ccp.Tests.Infrastructure;

/// <summary>Dựng dữ liệu bán hàng qua API thật: sản phẩm có tồn kho xác định, giỏ hàng, đơn hàng.</summary>
public static class SalesApi
{
    public sealed record Sku(Guid ProductId, Guid VariantId, string Code);

    public static async Task<Sku> ProductAsync(TestClient admin, decimal price = 200_000, int stock = 10, decimal? sale = null, string status = "Active")
    {
        var code = Uniq("SKU-").ToUpperInvariant();
        var r = await CreateProductAsync(admin, ProductPayload(variants: [Variant(code, price: price, stock: stock, sale: sale)], status: status));
        if (!r.Success) throw new InvalidOperationException("Tạo sản phẩm thất bại: " + r.Body);
        return new Sku(r.Data.GetProperty("id").GetGuid(), r.Data.GetProperty("variants")[0].GetProperty("id").GetGuid(), code);
    }

    public static async Task SetVariantAsync(TestClient admin, Sku sku, decimal? price = null, int? stock = null)
    {
        var current = (await admin.GetAsync($"/api/admin/products/{sku.ProductId}")).Data;
        var v = current.GetProperty("variants")[0];
        var payload = ProductPayload(name: current.GetProperty("name").GetString(), variants:
            [Variant(sku.Code, price ?? v.GetProperty("price").GetDecimal(), stock ?? v.GetProperty("stockQuantity").GetInt32(), id: sku.VariantId)]);
        var r = await admin.PutAsync($"/api/admin/products/{sku.ProductId}", payload);
        if (!r.Success) throw new InvalidOperationException("Cập nhật sản phẩm thất bại: " + r.Body);
    }

    public static async Task<int> StockAsync(TestClient admin, Sku sku) =>
        (await admin.GetAsync($"/api/admin/products/{sku.ProductId}")).Data.GetProperty("variants")[0].GetProperty("stockQuantity").GetInt32();

    public static async Task<(string Province, string Ward)> AddressAsync(TestClient c, int provinceIndex = 0)
    {
        var provinces = (await c.GetAsync("/api/public/address/provinces")).Data.EnumerateArray().ToList();
        var p = provinces[provinceIndex == -1 ? provinces.Count - 1 : provinceIndex].GetProperty("code").GetString()!;
        var wards = (await c.GetAsync($"/api/public/address/provinces/{p}/wards")).Data;
        return (p, wards[0].GetProperty("code").GetString()!);
    }

    public static object CheckoutBody(string province, string ward, string method = "Cod", string phone = "0901234567", string? email = "khach@test.local", string name = "Nguyễn Văn A") => new
    {
        customerName = name, phone, email, addressLine = "12 Đường Thử Nghiệm", provinceCode = province, wardCode = ward, note = "Giao giờ hành chính", paymentMethod = method,
    };

    public static async Task<ApiResult> AddToCartAsync(TestClient c, Sku sku, int qty = 1) =>
        await c.PostAsync("/api/cart/items", new { variantId = sku.VariantId, quantity = qty });

    public static async Task<ApiResult> PlaceAsync(TestClient c, Sku sku, int qty, string province, string ward, string method = "Cod", string phone = "0901234567")
    {
        var add = await AddToCartAsync(c, sku, qty);
        if (!add.Success) throw new InvalidOperationException("Thêm giỏ thất bại: " + add.Body);
        return await c.PostAsync("/api/orders/checkout", CheckoutBody(province, ward, method, phone));
    }

    public static string OrderNumber(ApiResult r) => r.Data.GetProperty("orderNumber").GetString()!;
    public static Guid OrderId(ApiResult r) => r.Data.GetProperty("id").GetGuid();
    public static JsonElement Prop(this JsonElement e, string name) => e.GetProperty(name);
}
