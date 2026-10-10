using System.Net;
using Ccp.Domain.Security;
using Ccp.Tests.Infrastructure;
using static Ccp.Tests.Infrastructure.SalesApi;

namespace Ccp.Tests;

[Collection(ApiCollection.Name)]
public class DashboardTests(ApiFactory factory)
{
    private static async Task<System.Text.Json.JsonElement> Get(TestClient c, int days = 7) => (await c.GetAsync($"/api/admin/dashboard?days={days}")).Data;
    private static decimal Kpi(System.Text.Json.JsonElement d, string name) => d.GetProperty("kpi").GetProperty(name).GetDecimal();

    [Fact]
    public async Task Placing_an_order_moves_revenue_orders_series_status_and_top_products_by_exactly_that_order()
    {
        var admin = await factory.NewAdminClientAsync();
        var (province, ward) = await AddressAsync(factory.NewClient());
        var sku = await ProductAsync(admin, price: 400_000, stock: 20);
        var before = await Get(admin);

        var order = await PlaceAsync(factory.NewClient(), sku, 3, province, ward);
        var after = await Get(admin);

        Assert.Equal(Kpi(before, "revenue") + 1_200_000, Kpi(after, "revenue"));
        Assert.Equal(Kpi(before, "orders") + 1, Kpi(after, "orders"));
        Assert.Equal(Kpi(before, "previousRevenue"), Kpi(after, "previousRevenue")); // kỳ trước không bị đơn hôm nay làm đổi
        Assert.Equal(Kpi(before, "previousOrders"), Kpi(after, "previousOrders"));
        Assert.Equal(7, after.GetProperty("series").GetArrayLength());
        var last = after.GetProperty("series").EnumerateArray().Last();
        Assert.Equal(after.GetProperty("to").GetString(), last.GetProperty("date").GetString());
        Assert.Equal(after.GetProperty("series").EnumerateArray().Sum(p => p.GetProperty("revenue").GetDecimal()), Kpi(after, "revenue")); // chuỗi theo ngày cộng lại đúng tổng
        Assert.Equal(Kpi(after, "revenue") / Kpi(after, "orders"), Kpi(after, "averageOrderValue"), 0);

        Assert.Equal(OrderNumber(order), after.GetProperty("recentOrders")[0].GetProperty("orderNumber").GetString());
        Assert.True(after.GetProperty("alerts").GetProperty("pendingOrders").GetInt32() >= 1);
    }

    [Fact]
    public async Task Cancelled_orders_are_not_revenue_and_a_big_order_tops_the_product_ranking()
    {
        var admin = await factory.NewAdminClientAsync();
        var (province, ward) = await AddressAsync(factory.NewClient());
        var big = await ProductAsync(admin, price: 90_000_000, stock: 5);
        var name = (await admin.GetAsync($"/api/admin/products/{big.ProductId}")).Data.GetProperty("name").GetString();

        var order = await PlaceAsync(factory.NewClient(), big, 1, province, ward);
        var withOrder = await Get(admin);
        Assert.Equal(name, withOrder.GetProperty("topProducts")[0].GetProperty("name").GetString());
        Assert.Equal(big.ProductId, withOrder.GetProperty("topProducts")[0].GetProperty("productId").GetGuid());

        await admin.PostAsync($"/api/admin/orders/{OrderId(order)}/status", new { status = "Cancelled", note = "thử" });
        var cancelled = await Get(admin);
        Assert.Equal(Kpi(withOrder, "revenue") - 90_000_000, Kpi(cancelled, "revenue"));
        Assert.Equal(Kpi(withOrder, "orders") - 1, Kpi(cancelled, "orders"));
        Assert.DoesNotContain(name, cancelled.GetProperty("topProducts").EnumerateArray().Select(t => t.GetProperty("name").GetString()));
        // đơn huỷ vẫn nằm trong cơ cấu trạng thái
        Assert.Contains(cancelled.GetProperty("statuses").EnumerateArray(), s => s.GetProperty("status").GetString() == "Cancelled");
    }

    [Fact]
    public async Task Low_stock_count_includes_active_variants_at_the_threshold_and_ignores_others()
    {
        var admin = await factory.NewAdminClientAsync();
        async Task<int> Count() => (await Get(admin)).GetProperty("alerts").GetProperty("lowStockCount").GetInt32();
        var start = await Count();

        await ProductAsync(admin, stock: 5);                       // đúng ngưỡng: tính
        Assert.Equal(start + 1, await Count());
        await ProductAsync(admin, stock: 6);                       // trên ngưỡng: không tính
        await ProductAsync(admin, stock: 0, status: "Hidden");     // sản phẩm ẩn: không tính
        Assert.Equal(start + 1, await Count());
        await ProductAsync(admin, stock: 0);                       // hết hàng: tính
        Assert.Equal(start + 2, await Count());

        var list = (await Get(admin)).GetProperty("lowStock").EnumerateArray().Select(x => x.GetProperty("stock").GetInt32()).ToList();
        Assert.All(list, x => Assert.InRange(x, 0, 5));
        Assert.Equal(list.Order().ToList(), list); // thấp nhất lên đầu
    }

    [Fact]
    public async Task Days_parameter_is_clamped_and_previous_period_has_equal_length()
    {
        var admin = await factory.NewAdminClientAsync();
        Assert.Equal(1, (await Get(admin, 0)).GetProperty("series").GetArrayLength());
        Assert.Equal(1, (await Get(admin, -5)).GetProperty("series").GetArrayLength());
        Assert.Equal(366, (await Get(admin, 100_000)).GetProperty("series").GetArrayLength());
        Assert.Equal(30, (await Get(admin, 30)).GetProperty("days").GetInt32());
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.GetAsync("/api/admin/dashboard?days=abc")).Status);
    }

    [Fact]
    public async Task Dashboard_needs_the_dashboard_permission()
    {
        var staff = await factory.LoginAsRoleAsync(RoleDefaults.Staff);
        var manager = await factory.LoginAsRoleAsync(RoleDefaults.Manager);
        Assert.Equal(HttpStatusCode.Unauthorized, (await factory.NewClient().GetAsync("/api/admin/dashboard")).Status);
        Assert.Equal(HttpStatusCode.Forbidden, (await staff.GetAsync("/api/admin/dashboard")).Status);
        Assert.True((await manager.GetAsync("/api/admin/dashboard")).Success);
    }

    [Fact]
    public async Task Series_buckets_follow_the_store_timezone_not_utc()
    {
        // 18:30 UTC ngày D là 01:30 ngày D+1 theo giờ Việt Nam: đơn đặt lúc đó phải rơi vào ngày D+1 của cửa hàng.
        var zone = Ccp.Application.Dashboard.StoreTime.Zone("Asia/Ho_Chi_Minh");
        var utc = new DateTime(2026, 10, 9, 18, 30, 0, DateTimeKind.Utc);
        Assert.Equal(new DateOnly(2026, 10, 10), DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(utc, zone)));
        Assert.Equal(new DateTime(2026, 10, 9, 17, 0, 0, DateTimeKind.Utc), Ccp.Application.Dashboard.StoreTime.StartOfDayUtc(new DateOnly(2026, 10, 10), zone));
        await Task.CompletedTask;
    }
}
