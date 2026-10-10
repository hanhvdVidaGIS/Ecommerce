using System.Net;
using System.Text.RegularExpressions;
using Ccp.Domain.Enums;
using Ccp.Tests.Infrastructure;
using Microsoft.EntityFrameworkCore;
using static Ccp.Tests.Infrastructure.CatalogApi;
using static Ccp.Tests.Infrastructure.SalesApi;

namespace Ccp.Tests;

[Collection(ApiCollection.Name)]
public partial class SalesTests(ApiFactory factory)
{
    private static string Code(string prefix = "CP") => (prefix + Guid.NewGuid().ToString("N"))[..12].ToUpperInvariant();

    private async Task<(TestClient Admin, string Province, string Ward)> SetupAsync()
    {
        var admin = await factory.NewAdminClientAsync();
        var (p, w) = await AddressAsync(factory.NewClient());
        return (admin, p, w);
    }

    private static decimal Num(ApiResult r, string name) => r.Data.GetProperty(name).GetDecimal();

    // ---------- giỏ hàng ----------
    [Fact]
    public async Task Guest_cart_merges_lines_enforces_stock_and_prices_from_the_database()
    {
        var (admin, _, _) = await SetupAsync();
        var sku = await ProductAsync(admin, price: 250_000, stock: 6, sale: 200_000);
        var guest = factory.NewClient();

        var empty = await guest.GetAsync("/api/cart");
        Assert.Equal(0, empty.Data.GetProperty("items").GetArrayLength());
        Assert.False(guest.Cookies.ContainsKey("ccp_cart")); // đọc giỏ không tạo cookie

        var add = await AddToCartAsync(guest, sku, 2);
        Assert.True(add.Success, add.Body.ToString());
        Assert.Matches("^[0-9a-f]{64}$", guest.Cookies["ccp_cart"]);
        Assert.True(guest.Cookies.ContainsKey("ccp_csrf"));
        var line = add.Data.GetProperty("items")[0];
        Assert.Equal(200_000, line.GetProperty("unitPrice").GetDecimal()); // giá bán hiệu lực, không phải giá niêm yết
        Assert.Equal(400_000, Num(add, "subtotal"));

        var again = await AddToCartAsync(guest, sku, 1);
        Assert.Equal(1, again.Data.GetProperty("items").GetArrayLength());
        Assert.Equal(3, again.Data.GetProperty("items")[0].GetProperty("quantity").GetInt32());

        var lineId = again.Data.GetProperty("items")[0].GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.Conflict, (await guest.PutAsync($"/api/cart/items/{lineId}", new { quantity = 7 })).Status);
        var tooMany = await guest.PutAsync($"/api/cart/items/{lineId}", new { quantity = 100 });
        Assert.Equal(HttpStatusCode.BadRequest, tooMany.Status);
        var five = await guest.PutAsync($"/api/cart/items/{lineId}", new { quantity = 5 });
        Assert.Equal(1_000_000, Num(five, "subtotal"));

        var removed = await guest.DeleteAsync($"/api/cart/items/{lineId}");
        Assert.Equal(0, removed.Data.GetProperty("itemCount").GetInt32());
    }

    [Fact]
    public async Task Cart_rejects_unknown_hidden_out_of_stock_and_invalid_quantity()
    {
        var (admin, _, _) = await SetupAsync();
        var hidden = await ProductAsync(admin, status: "Hidden");
        var soldOut = await ProductAsync(admin, stock: 0);
        var ok = await ProductAsync(admin);
        var guest = factory.NewClient();

        Assert.Equal(HttpStatusCode.NotFound, (await guest.PostAsync("/api/cart/items", new { variantId = Guid.NewGuid(), quantity = 1 })).Status);
        Assert.Equal(HttpStatusCode.NotFound, (await AddToCartAsync(guest, hidden)).Status);
        var so = await AddToCartAsync(guest, soldOut);
        Assert.Equal(HttpStatusCode.Conflict, so.Status);
        Assert.Equal("out_of_stock", so.ErrorCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await AddToCartAsync(guest, ok, 0)).Status);
        Assert.Equal(HttpStatusCode.BadRequest, (await AddToCartAsync(guest, ok, -3)).Status);
        Assert.Equal(HttpStatusCode.BadRequest, (await AddToCartAsync(guest, ok, 100)).Status);
    }

    [Fact]
    public async Task Cart_writes_need_csrf_once_a_cart_cookie_exists_and_forged_tokens_are_ignored()
    {
        var (admin, _, _) = await SetupAsync();
        var sku = await ProductAsync(admin);
        var guest = factory.NewClient();
        Assert.True((await AddToCartAsync(guest, sku)).Success);

        var noCsrf = await guest.PostAsync("/api/cart/items", new { variantId = sku.VariantId, quantity = 1 }, sendCsrf: false);
        Assert.Equal(HttpStatusCode.Forbidden, noCsrf.Status);
        Assert.Equal("csrf_failed", noCsrf.ErrorCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await guest.DeleteAsync("/api/cart", sendCsrf: false)).Status);
        Assert.Equal(HttpStatusCode.Forbidden, (await guest.PostAsync("/api/orders/checkout", new { }, sendCsrf: false)).Status);

        // cookie giỏ giả không đúng định dạng bị bỏ qua và được thay bằng token mới do máy chủ sinh
        var forged = factory.NewClient();
        forged.SetCookie("ccp_cart", "../../etc/passwd");
        forged.SetCookie("ccp_csrf", "x");
        var r = await forged.SendAsync(HttpMethod.Post, "/api/cart/items", new { variantId = sku.VariantId, quantity = 1 }, headers: new Dictionary<string, string> { ["X-CSRF-Token"] = "x" });
        Assert.True(r.Success);
        Assert.Matches("^[0-9a-f]{64}$", forged.Cookies["ccp_cart"]);
    }

    [Fact]
    public async Task One_guest_cannot_see_or_change_another_guests_cart()
    {
        var (admin, _, _) = await SetupAsync();
        var sku = await ProductAsync(admin);
        var a = factory.NewClient();
        var added = await AddToCartAsync(a, sku, 2);
        var lineId = added.Data.GetProperty("items")[0].GetProperty("id").GetGuid();

        var b = factory.NewClient();
        await AddToCartAsync(b, await ProductAsync(admin));
        Assert.Equal(HttpStatusCode.NotFound, (await b.PutAsync($"/api/cart/items/{lineId}", new { quantity = 1 })).Status);
        Assert.Equal(HttpStatusCode.NotFound, (await b.DeleteAsync($"/api/cart/items/{lineId}")).Status);
        Assert.Equal(2, (await a.GetAsync("/api/cart")).Data.GetProperty("items")[0].GetProperty("quantity").GetInt32());
    }

    [Fact]
    public async Task Guest_cart_is_merged_into_the_account_cart_on_login_and_cookie_is_cleared()
    {
        var (admin, _, _) = await SetupAsync();
        var shared = await ProductAsync(admin, stock: 5);
        var only = await ProductAsync(admin, stock: 5);
        var email = $"merge-{Guid.NewGuid():N}@test.local";

        var first = factory.NewClient();
        Assert.True((await first.PostAsync("/api/auth/register", new { email, password = TestData.Password, fullName = "Khách gộp giỏ" })).Success);
        Assert.True((await AddToCartAsync(first, shared, 2)).Success);

        var browser = factory.NewClient();
        await AddToCartAsync(browser, shared, 4);
        await AddToCartAsync(browser, only, 1);
        Assert.True((await browser.LoginAsync(email, TestData.Password)).Success);
        Assert.False(browser.Cookies.ContainsKey("ccp_cart"));

        var cart = (await browser.GetAsync("/api/cart")).Data.GetProperty("items").EnumerateArray().ToList();
        Assert.Equal(2, cart.Count);
        Assert.Equal(5, cart.Single(i => i.GetProperty("variantId").GetGuid() == shared.VariantId).GetProperty("quantity").GetInt32()); // 2 + 4 bị chặn ở tồn kho 5
        Assert.Equal(1, cart.Single(i => i.GetProperty("variantId").GetGuid() == only.VariantId).GetProperty("quantity").GetInt32());
    }

    // ---------- đặt hàng ----------
    [Fact]
    public async Task Cod_checkout_creates_a_priced_snapshot_order_decrements_stock_and_empties_the_cart()
    {
        var (admin, province, ward) = await SetupAsync();
        var sku = await ProductAsync(admin, price: 300_000, stock: 10);
        var guest = factory.NewClient();

        var r = await PlaceAsync(guest, sku, 3, province, ward);
        Assert.True(r.Success, r.Body.ToString());
        Assert.Matches(@"^OD\d{6}-[A-HJ-NP-Z2-9]{5}$", OrderNumber(r));
        Assert.Equal("Pending", r.Data.GetProperty("status").GetString());
        Assert.Equal("Unpaid", r.Data.GetProperty("paymentStatus").GetString());
        Assert.Equal(900_000, Num(r, "subtotal"));
        Assert.Equal(900_000, Num(r, "grandTotal"));
        Assert.False(string.IsNullOrEmpty(r.Data.GetProperty("provinceName").GetString()));
        Assert.False(string.IsNullOrEmpty(r.Data.GetProperty("wardName").GetString()));
        Assert.Equal("Cod", r.Data.GetProperty("payments")[0].GetProperty("method").GetString());
        Assert.Equal(1, r.Data.GetProperty("history").GetArrayLength());
        Assert.Equal(sku.Code, r.Data.GetProperty("items")[0].GetProperty("sku").GetString());
        var item = r.Data.GetProperty("items")[0];
        Assert.Equal(sku.ProductId, item.GetProperty("productId").GetGuid()); // đơn dẫn được về trang sản phẩm
        Assert.Equal((await admin.GetAsync($"/api/admin/products/{sku.ProductId}")).Data.GetProperty("slug").GetString(), item.GetProperty("productSlug").GetString());

        Assert.Equal(7, await StockAsync(admin, sku));
        Assert.Equal(0, (await guest.GetAsync("/api/cart")).Data.GetProperty("itemCount").GetInt32());

        // đặt lại cùng giỏ không tạo thêm đơn thứ hai
        var again = await guest.PostAsync("/api/orders/checkout", CheckoutBody(province, ward));
        Assert.Equal(HttpStatusCode.BadRequest, again.Status);
        Assert.Equal("cart_empty", again.ErrorCode);
        Assert.Equal(7, await StockAsync(admin, sku));
        Assert.Equal(1, await factory.WithDbAsync(db => db.OrderItems.CountAsync(i => i.Sku == sku.Code)));
    }

    [Fact]
    public async Task Checkout_validates_phone_address_payment_method_and_does_not_touch_stock_on_failure()
    {
        var (admin, province, ward) = await SetupAsync();
        var otherProvince = (await AddressAsync(factory.NewClient(), 1)).Province;
        var sku = await ProductAsync(admin, stock: 5);
        var guest = factory.NewClient();
        await AddToCartAsync(guest, sku, 2);

        foreach (var bad in new[] { "12345", "abc", "0123456789", "+8490123", "" })
            Assert.Equal(HttpStatusCode.BadRequest, (await guest.PostAsync("/api/orders/checkout", CheckoutBody(province, ward, phone: bad))).Status);
        Assert.Equal(HttpStatusCode.BadRequest, (await guest.PostAsync("/api/orders/checkout", CheckoutBody(province, ward, email: "khong-phai-email"))).Status);
        Assert.Equal(HttpStatusCode.BadRequest, (await guest.PostAsync("/api/orders/checkout", CheckoutBody(province, ward, name: ""))).Status);
        Assert.Equal(HttpStatusCode.BadRequest, (await guest.PostAsync("/api/orders/checkout", CheckoutBody(province, ward, method: "Paypal"))).Status);
        var wrongWard = await guest.PostAsync("/api/orders/checkout", CheckoutBody(otherProvince, ward));
        Assert.Equal(HttpStatusCode.BadRequest, wrongWard.Status);
        Assert.Contains("wardCode", wrongWard.Body.GetProperty("error").GetProperty("details").EnumerateArray().Select(d => d.GetProperty("field").GetString()));
        Assert.Equal(HttpStatusCode.BadRequest, (await guest.PostAsync("/api/orders/checkout", CheckoutBody("99", "99999"))).Status);

        Assert.Equal(5, await StockAsync(admin, sku));
        Assert.Equal(2, (await guest.GetAsync("/api/cart")).Data.GetProperty("itemCount").GetInt32()); // giỏ còn nguyên để khách sửa lại
        Assert.Equal(0, await factory.WithDbAsync(db => db.OrderItems.CountAsync(i => i.Sku == sku.Code)));

        var accepted = await guest.PostAsync("/api/orders/checkout", CheckoutBody(province, ward, phone: "+84 901 234 567"));
        Assert.True(accepted.Success);
        Assert.Equal("0901234567", accepted.Data.GetProperty("phone").GetString()); // chuẩn hoá số điện thoại
    }

    [Fact]
    public async Task Checkout_uses_the_current_database_price_not_the_price_seen_when_added_to_cart()
    {
        var (admin, province, ward) = await SetupAsync();
        var sku = await ProductAsync(admin, price: 100_000, stock: 10);
        var guest = factory.NewClient();
        var added = await AddToCartAsync(guest, sku, 2);
        Assert.Equal(200_000, Num(added, "subtotal"));

        await SetVariantAsync(admin, sku, price: 150_000);
        var r = await guest.PostAsync("/api/orders/checkout", CheckoutBody(province, ward));
        Assert.Equal(300_000, Num(r, "grandTotal"));

        // giá đơn đã chốt: đổi giá sau đó không làm đổi đơn
        await SetVariantAsync(admin, sku, price: 999_000);
        var stored = await admin.GetAsync($"/api/admin/orders/{OrderId(r)}");
        Assert.Equal(150_000, stored.Data.GetProperty("items")[0].GetProperty("unitPrice").GetDecimal());
        Assert.Equal(300_000, Num(stored, "grandTotal"));
    }

    [Fact]
    public async Task Checkout_fails_with_409_and_leaves_everything_untouched_when_stock_dropped_after_adding()
    {
        var (admin, province, ward) = await SetupAsync();
        var a = await ProductAsync(admin, stock: 10);
        var b = await ProductAsync(admin, stock: 10);
        var guest = factory.NewClient();
        await AddToCartAsync(guest, a, 3);
        await AddToCartAsync(guest, b, 3);
        await SetVariantAsync(admin, b, stock: 2);

        var r = await guest.PostAsync("/api/orders/checkout", CheckoutBody(province, ward));
        Assert.Equal(HttpStatusCode.Conflict, r.Status);
        Assert.Equal("stock_changed", r.ErrorCode);
        Assert.Equal(10, await StockAsync(admin, a)); // không trừ dở một phần
        Assert.Equal(2, await StockAsync(admin, b));
        Assert.Equal(0, await factory.WithDbAsync(db => db.Orders.CountAsync(o => o.Items.Any(i => i.Sku == a.Code))));
        var cart = (await guest.GetAsync("/api/cart")).Data;
        Assert.True(cart.GetProperty("hasIssues").GetBoolean());
    }

    [Fact]
    public async Task Two_simultaneous_checkouts_for_the_last_unit_sell_it_exactly_once()
    {
        var (admin, province, ward) = await SetupAsync();
        var sku = await ProductAsync(admin, stock: 1);
        var buyers = Enumerable.Range(0, 6).Select(_ => factory.NewClient()).ToList();
        foreach (var b in buyers) Assert.True((await AddToCartAsync(b, sku)).Success);

        var results = await Task.WhenAll(buyers.Select(b => b.PostAsync("/api/orders/checkout", CheckoutBody(province, ward))));

        Assert.Equal(1, results.Count(r => r.Success));
        Assert.All(results.Where(r => !r.Success), r => Assert.Equal(HttpStatusCode.Conflict, r.Status));
        Assert.Equal(0, await StockAsync(admin, sku));
        Assert.Equal(1, await factory.WithDbAsync(db => db.OrderItems.CountAsync(i => i.Sku == sku.Code)));
    }

    [Fact]
    public async Task Order_numbers_are_unique_across_many_orders()
    {
        var (admin, province, ward) = await SetupAsync();
        var sku = await ProductAsync(admin, stock: 100);
        var numbers = new List<string>();
        for (var i = 0; i < 12; i++) numbers.Add(OrderNumber(await PlaceAsync(factory.NewClient(), sku, 1, province, ward)));
        Assert.Equal(numbers.Count, numbers.Distinct().Count());
    }

    // ---------- thanh toán ----------
    [Fact]
    public async Task Bank_transfer_returns_instructions_with_the_order_number_and_can_be_marked_paid_once()
    {
        var (admin, province, ward) = await SetupAsync();
        var sku = await ProductAsync(admin);
        var r = await PlaceAsync(factory.NewClient(), sku, 1, province, ward, method: "BankTransfer");

        Assert.True(r.Success, r.Body.ToString());
        Assert.Equal(OrderNumber(r), r.Data.GetProperty("bankTransfer").GetProperty("transferContent").GetString());
        Assert.Equal("BankTransfer", r.Data.GetProperty("payments")[0].GetProperty("method").GetString());

        var id = OrderId(r);
        var paid = await admin.PostAsync($"/api/admin/orders/{id}/mark-paid");
        Assert.Equal("Paid", paid.Data.GetProperty("paymentStatus").GetString());
        Assert.Equal(JsonValueKindNull, paid.Data.GetProperty("bankTransfer").ValueKind); // đã thanh toán thì không còn hướng dẫn chuyển khoản
        Assert.Equal(HttpStatusCode.Conflict, (await admin.PostAsync($"/api/admin/orders/{id}/mark-paid")).Status);
    }

    private const System.Text.Json.JsonValueKind JsonValueKindNull = System.Text.Json.JsonValueKind.Null;

    [Fact]
    public async Task Payment_method_that_is_switched_off_in_settings_is_refused()
    {
        var (admin, province, ward) = await SetupAsync();
        var sku = await ProductAsync(admin);
        var original = await factory.WithDbAsync(db => db.WebsiteSettings.Where(s => s.Key == "store.paymentMethods").Select(s => s.Value).SingleAsync());
        try
        {
            var set = await admin.PutAsync("/api/admin/settings", new { values = new Dictionary<string, string?> { ["store.paymentMethods"] = "[\"Cod\"]" } });
            Assert.True(set.Success, set.Body.ToString());
            var guest = factory.NewClient();
            await AddToCartAsync(guest, sku);
            var r = await guest.PostAsync("/api/orders/checkout", CheckoutBody(province, ward, method: "BankTransfer"));
            Assert.Equal(HttpStatusCode.BadRequest, r.Status);
            Assert.Equal(["Cod"], (await guest.GetAsync("/api/public/payment-methods")).Data.EnumerateArray().Select(x => x.GetString()!).ToArray());
            Assert.True((await guest.PostAsync("/api/orders/checkout", CheckoutBody(province, ward))).Success);
        }
        finally
        {
            await factory.WithDbAsync(db => db.WebsiteSettings.Where(s => s.Key == "store.paymentMethods").ExecuteUpdateAsync(s => s.SetProperty(x => x.Value, original)));
        }
    }

    // ---------- vận chuyển ----------
    [Fact]
    public async Task Shipping_prefers_province_rate_applies_free_threshold_and_ignores_inactive_rates()
    {
        var admin = await factory.NewAdminClientAsync();
        var anon = factory.NewClient();
        var (province, ward) = await AddressAsync(anon, -1);
        var sku = await ProductAsync(admin, price: 400_000, stock: 50);

        var rate = await admin.PostAsync("/api/admin/shipping-rates", new { name = "Tỉnh thử", provinceCode = province, fee = 45_000, freeShipThreshold = 1_000_000, isActive = true, sortOrder = 1 });
        Assert.True(rate.Success, rate.Body.ToString());
        var rateId = rate.Data.GetProperty("id").GetGuid();

        var q = await anon.GetAsync($"/api/public/shipping/quote?provinceCode={province}&subtotal=400000");
        Assert.Equal(45_000, q.Data.GetProperty("fee").GetDecimal());
        Assert.Equal(600_000, q.Data.GetProperty("amountToFreeShip").GetDecimal());
        Assert.Equal(0, (await anon.GetAsync($"/api/public/shipping/quote?provinceCode={province}&subtotal=1000000")).Data.GetProperty("fee").GetDecimal());

        var guest = factory.NewClient();
        await AddToCartAsync(guest, sku, 1);
        var order = await guest.PostAsync("/api/orders/checkout", CheckoutBody(province, ward));
        Assert.Equal(45_000, Num(order, "shippingFee"));
        Assert.Equal(445_000, Num(order, "grandTotal"));

        var off = await admin.PutAsync($"/api/admin/shipping-rates/{rateId}", new { name = "Tỉnh thử", provinceCode = province, fee = 45_000, freeShipThreshold = 1_000_000, isActive = false, sortOrder = 1 });
        Assert.True(off.Success);
        Assert.Equal(0, (await anon.GetAsync($"/api/public/shipping/quote?provinceCode={province}&subtotal=400000")).Data.GetProperty("fee").GetDecimal());
        Assert.True((await admin.DeleteAsync($"/api/admin/shipping-rates/{rateId}")).Success);
    }

    [Fact]
    public async Task Shipping_rate_validation_rejects_negative_fee_and_unknown_province()
    {
        var admin = await factory.NewAdminClientAsync();
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsync("/api/admin/shipping-rates", new { name = "x", fee = -1, isActive = true, sortOrder = 0 })).Status);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsync("/api/admin/shipping-rates", new { name = "x", provinceCode = "ZZ", fee = 1, isActive = true, sortOrder = 0 })).Status);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsync("/api/admin/shipping-rates", new { name = "", fee = 1, isActive = true, sortOrder = 0 })).Status);
    }

    [Fact]
    public async Task Province_rate_beats_the_default_rate_and_higher_minimum_tier_beats_lower()
    {
        var admin = await factory.NewAdminClientAsync();
        var anon = factory.NewClient();
        var (province, _) = await AddressAsync(anon, -1);
        var (other, _) = await AddressAsync(anon, 0);
        var ids = new List<Guid>();
        async Task<Guid> Rate(string name, string? prov, decimal fee, decimal? min, int sort)
        {
            var r = await admin.PostAsync("/api/admin/shipping-rates", new { name, provinceCode = prov, minOrderAmount = min, fee, isActive = true, sortOrder = sort });
            Assert.True(r.Success, r.Body.ToString());
            return r.Data.GetProperty("id").GetGuid();
        }
        try
        {
            ids.Add(await Rate("Mặc định thử", null, 50_000, null, 0));
            ids.Add(await Rate("Riêng tỉnh thử", province, 45_000, null, 5));
            ids.Add(await Rate("Riêng tỉnh thử, đơn lớn", province, 15_000, 500_000, 6));

            decimal Fee(ApiResult r) => r.Data.GetProperty("fee").GetDecimal();
            Assert.Equal(45_000, Fee(await anon.GetAsync($"/api/public/shipping/quote?provinceCode={province}&subtotal=100000")));  // mức riêng tỉnh thắng mức mặc định dù sortOrder lớn hơn
            Assert.Equal(15_000, Fee(await anon.GetAsync($"/api/public/shipping/quote?provinceCode={province}&subtotal=600000")));  // ngưỡng tối thiểu cao hơn thắng
            Assert.Equal(50_000, Fee(await anon.GetAsync($"/api/public/shipping/quote?provinceCode={other}&subtotal=600000")));     // tỉnh khác dùng mức mặc định
        }
        finally
        {
            foreach (var id in ids) await admin.DeleteAsync($"/api/admin/shipping-rates/{id}");
        }
    }

    [Fact]
    public async Task Order_line_is_priced_at_the_sale_price_in_force_at_checkout()
    {
        var (admin, province, ward) = await SetupAsync();
        var sku = await ProductAsync(admin, price: 500_000, stock: 5, sale: 350_000);
        var r = await PlaceAsync(factory.NewClient(), sku, 2, province, ward);
        Assert.Equal(350_000, r.Data.GetProperty("items")[0].GetProperty("unitPrice").GetDecimal());
        Assert.Equal(700_000, Num(r, "grandTotal"));
    }

    // ---------- mã giảm giá ----------
    private static object CouponBody(string code, string type = "Percent", decimal value = 10, decimal? min = null, decimal? max = null, int? limit = null, int? perUser = null,
        DateTime? start = null, DateTime? end = null, bool active = true) =>
        new { code, type, value, minOrderAmount = min, maxDiscount = max, usageLimit = limit, perUserLimit = perUser, startAt = start, endAt = end, isActive = active };

    [Fact]
    public async Task Percent_coupon_respects_cap_minimum_and_is_counted_then_released_on_cancel()
    {
        var (admin, province, ward) = await SetupAsync();
        var sku = await ProductAsync(admin, price: 500_000, stock: 10);
        var code = Code("PC");
        var created = await admin.PostAsync("/api/admin/coupons", CouponBody(code, value: 10, min: 600_000, max: 60_000, limit: 5));
        Assert.True(created.Success, created.Body.ToString());
        var couponId = created.Data.GetProperty("id").GetGuid();

        var guest = factory.NewClient();
        await AddToCartAsync(guest, sku, 1); // 500k < tối thiểu 600k
        var below = await guest.PostAsync("/api/cart/coupon", new { code });
        Assert.Equal(HttpStatusCode.BadRequest, below.Status);
        Assert.Equal("coupon_min_order", below.ErrorCode);

        await AddToCartAsync(guest, sku, 1); // 1.000.000 → 10% = 100k, trần 60k
        var applied = await guest.PostAsync("/api/cart/coupon", new { code = code.ToLowerInvariant() });
        Assert.True(applied.Success, applied.Body.ToString());
        Assert.Equal(60_000, Num(applied, "discount"));

        var order = await guest.PostAsync("/api/orders/checkout", CheckoutBody(province, ward));
        Assert.Equal(60_000, Num(order, "discountTotal"));
        Assert.Equal(940_000, Num(order, "grandTotal"));
        Assert.Equal(code, order.Data.GetProperty("couponCode").GetString());
        Assert.Equal(1, (await admin.GetAsync($"/api/admin/coupons/{couponId}")).Data.GetProperty("usedCount").GetInt32());
        Assert.Equal(8, await StockAsync(admin, sku));

        var cancel = await admin.PostAsync($"/api/admin/orders/{OrderId(order)}/status", new { status = "Cancelled", note = "Khách đổi ý" });
        Assert.True(cancel.Success, cancel.Body.ToString());
        Assert.Equal(0, (await admin.GetAsync($"/api/admin/coupons/{couponId}")).Data.GetProperty("usedCount").GetInt32());
        Assert.Equal(10, await StockAsync(admin, sku)); // hoàn kho
        Assert.Equal("Failed", cancel.Data.GetProperty("paymentStatus").GetString());
    }

    [Fact]
    public async Task Coupon_usage_limit_is_enforced_atomically_under_concurrent_checkouts()
    {
        var (admin, province, ward) = await SetupAsync();
        var sku = await ProductAsync(admin, price: 300_000, stock: 50);
        var code = Code("LIM");
        Assert.True((await admin.PostAsync("/api/admin/coupons", CouponBody(code, "FixedAmount", 30_000, limit: 2))).Success);

        var buyers = Enumerable.Range(0, 6).Select(_ => factory.NewClient()).ToList();
        foreach (var b in buyers)
        {
            await AddToCartAsync(b, sku);
            Assert.True((await b.PostAsync("/api/cart/coupon", new { code })).Success);
        }
        var results = await Task.WhenAll(buyers.Select(b => b.PostAsync("/api/orders/checkout", CheckoutBody(province, ward))));

        Assert.Equal(2, results.Count(r => r.Success));
        Assert.Equal(2, await factory.WithDbAsync(db => db.Coupons.Where(c => c.Code == code).Select(c => c.UsedCount).SingleAsync()));
        Assert.Equal(2, await factory.WithDbAsync(db => db.Orders.CountAsync(o => o.CouponCode == code)));
        // các đơn thất bại phải hoàn nguyên cả tồn kho đã trừ trong giao dịch
        Assert.Equal(48, await StockAsync(admin, sku));
    }

    [Fact]
    public async Task Fixed_free_shipping_and_per_user_coupons_and_invalid_states_are_handled()
    {
        var (admin, province, ward) = await SetupAsync();
        var sku = await ProductAsync(admin, price: 100_000, stock: 50);
        var guest = factory.NewClient();
        await AddToCartAsync(guest, sku, 2);

        var fixedCode = Code("FX");
        await admin.PostAsync("/api/admin/coupons", CouponBody(fixedCode, "FixedAmount", 999_999)); // lớn hơn tạm tính → không âm
        Assert.Equal(200_000, Num(await guest.PostAsync("/api/cart/coupon", new { code = fixedCode }), "discount"));
        Assert.Equal(0, Num(await guest.GetAsync("/api/cart"), "total"));

        var expired = Code("EX");
        await admin.PostAsync("/api/admin/coupons", CouponBody(expired, start: DateTime.UtcNow.AddDays(-10), end: DateTime.UtcNow.AddDays(-1)));
        Assert.Equal("coupon_expired", (await guest.PostAsync("/api/cart/coupon", new { code = expired })).ErrorCode);
        var future = Code("FU");
        await admin.PostAsync("/api/admin/coupons", CouponBody(future, start: DateTime.UtcNow.AddDays(1)));
        Assert.Equal("coupon_not_started", (await guest.PostAsync("/api/cart/coupon", new { code = future })).ErrorCode);
        var off = Code("OF");
        await admin.PostAsync("/api/admin/coupons", CouponBody(off, active: false));
        Assert.Equal("coupon_invalid", (await guest.PostAsync("/api/cart/coupon", new { code = off })).ErrorCode);
        Assert.Equal("coupon_invalid", (await guest.PostAsync("/api/cart/coupon", new { code = "KHONGCO" })).ErrorCode);

        var once = Code("ON");
        await admin.PostAsync("/api/admin/coupons", CouponBody(once, "FixedAmount", 10_000, perUser: 1));
        var shopper = factory.NewClient();
        await AddToCartAsync(shopper, sku);
        await shopper.PostAsync("/api/cart/coupon", new { code = once });
        Assert.True((await shopper.PostAsync("/api/orders/checkout", CheckoutBody(province, ward, email: "mot-lan@test.local"))).Success);
        var second = factory.NewClient();
        await AddToCartAsync(second, sku);
        var blocked = await second.PostAsync("/api/cart/coupon", new { code = once }); // cùng email vẫn đếm là một người
        Assert.True(blocked.Success); // chưa biết email ở bước giỏ, chặn ở bước đặt hàng
        var r = await second.PostAsync("/api/orders/checkout", CheckoutBody(province, ward, email: "MOT-LAN@test.local"));
        Assert.Equal(HttpStatusCode.BadRequest, r.Status);
        Assert.Equal("coupon_user_limit", r.ErrorCode);
        Assert.Equal(49, await StockAsync(admin, sku)); // chỉ một đơn đã trừ kho
    }

    [Fact]
    public async Task Free_shipping_coupon_zeroes_the_fee()
    {
        var admin = await factory.NewAdminClientAsync();
        var (province, ward) = await AddressAsync(factory.NewClient(), 2);
        var rate = await admin.PostAsync("/api/admin/shipping-rates", new { name = "Phí thử 2", provinceCode = province, fee = 30_000, isActive = true, sortOrder = 0 });
        var sku = await ProductAsync(admin, price: 400_000);
        var code = Code("FS");
        await admin.PostAsync("/api/admin/coupons", CouponBody(code, "FreeShipping", 0, min: 300_000));

        var guest = factory.NewClient();
        await AddToCartAsync(guest, sku);
        Assert.Equal(30_000, Num(await guest.GetAsync($"/api/cart?provinceCode={province}"), "shippingFee"));
        await guest.PostAsync("/api/cart/coupon", new { code });
        var r = await guest.PostAsync("/api/orders/checkout", CheckoutBody(province, ward));
        Assert.Equal(0, Num(r, "shippingFee"));
        Assert.Equal(400_000, Num(r, "grandTotal"));
        await admin.DeleteAsync($"/api/admin/shipping-rates/{rate.Data.GetProperty("id").GetGuid()}");
    }

    [Fact]
    public async Task Coupon_admin_validates_input_blocks_duplicates_and_locks_the_code_once_used()
    {
        var (admin, province, ward) = await SetupAsync();
        var code = Code("AD");
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsync("/api/admin/coupons", CouponBody(code, value: 101))).Status);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsync("/api/admin/coupons", CouponBody(code, value: 0))).Status);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsync("/api/admin/coupons", CouponBody("có dấu cách", value: 5))).Status);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsync("/api/admin/coupons", CouponBody(code, value: 5, start: DateTime.UtcNow.AddDays(2), end: DateTime.UtcNow.AddDays(1)))).Status);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsync("/api/admin/coupons", CouponBody(code, "FixedAmount", 5, limit: 0))).Status);

        var created = await admin.PostAsync("/api/admin/coupons", CouponBody(code.ToLowerInvariant(), "FixedAmount", 20_000, limit: 3));
        Assert.True(created.Success);
        Assert.Equal(code, created.Data.GetProperty("code").GetString()); // mã được chuẩn hoá chữ hoa
        Assert.Equal("running", created.Data.GetProperty("state").GetString());
        var dup = await admin.PostAsync("/api/admin/coupons", CouponBody(code, "FixedAmount", 1));
        Assert.Equal(HttpStatusCode.Conflict, dup.Status);
        Assert.Equal("code_taken", dup.ErrorCode);

        var id = created.Data.GetProperty("id").GetGuid();
        var sku = await ProductAsync(admin, price: 100_000);
        var guest = factory.NewClient();
        await AddToCartAsync(guest, sku);
        await guest.PostAsync("/api/cart/coupon", new { code });
        Assert.True((await guest.PostAsync("/api/orders/checkout", CheckoutBody(province, ward))).Success);

        var rename = await admin.PutAsync($"/api/admin/coupons/{id}", CouponBody(Code("NW"), "FixedAmount", 20_000, limit: 3));
        Assert.Equal("code_locked", rename.ErrorCode);
        var below = await admin.PutAsync($"/api/admin/coupons/{id}", CouponBody(code, "FixedAmount", 20_000, limit: 1));
        Assert.Equal("exhausted", below.Data.GetProperty("state").GetString());
        Assert.True((await admin.DeleteAsync($"/api/admin/coupons/{id}")).Success);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.GetAsync($"/api/admin/coupons/{id}")).Status);
        Assert.True((await admin.PostAsync("/api/admin/coupons", CouponBody(code, "FixedAmount", 1))).Success); // mã đã xoá có thể dùng lại
    }
}
