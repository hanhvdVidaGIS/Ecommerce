using System.Net;
using Ccp.Domain.Enums;
using Ccp.Domain.Security;
using Ccp.Tests.Infrastructure;
using Microsoft.EntityFrameworkCore;
using static Ccp.Tests.Infrastructure.CatalogApi;
using static Ccp.Tests.Infrastructure.SalesApi;

namespace Ccp.Tests;

public partial class SalesTests
{
    private async Task<(TestClient Client, string Email)> CustomerAsync()
    {
        var email = $"kh-{Guid.NewGuid():N}@test.local";
        var c = factory.NewClient();
        var r = await c.PostAsync("/api/auth/register", new { email, password = TestData.Password, fullName = "Khách thử" });
        Assert.True(r.Success, r.Body.ToString());
        return (c, email);
    }

    private async Task<ApiResult> StatusAsync(TestClient admin, Guid id, string status, string? note = null) =>
        await admin.PostAsync($"/api/admin/orders/{id}/status", new { status, note });

    // ---------- quy trình trạng thái ----------
    [Fact]
    public async Task Order_moves_through_the_state_machine_records_history_and_completion_books_the_sale()
    {
        var (admin, province, ward) = await SetupAsync();
        var sku = await ProductAsync(admin, price: 100_000, stock: 10);
        var order = await PlaceAsync(factory.NewClient(), sku, 4, province, ward);
        var id = OrderId(order);

        foreach (var next in new[] { "Confirmed", "Processing", "Shipping" })
        {
            var r = await StatusAsync(admin, id, next, "Chuyển " + next);
            Assert.True(r.Success, r.Body.ToString());
            Assert.Equal(next, r.Data.GetProperty("status").GetString());
        }
        Assert.Equal(0, await factory.WithDbAsync(db => db.Products.Where(p => p.Id == sku.ProductId).Select(p => p.SoldCount).SingleAsync())); // chưa hoàn thành thì chưa tính đã bán

        var done = await StatusAsync(admin, id, "Completed");
        Assert.Equal("Paid", done.Data.GetProperty("paymentStatus").GetString()); // COD thu tiền khi hoàn thành
        Assert.Equal("Paid", done.Data.GetProperty("payments")[0].GetProperty("status").GetString());
        Assert.Equal(5, done.Data.GetProperty("history").GetArrayLength()); // Pending + 4 lần chuyển
        Assert.Equal(4, await factory.WithDbAsync(db => db.Products.Where(p => p.Id == sku.ProductId).Select(p => p.SoldCount).SingleAsync()));
        Assert.Equal(6, await StockAsync(admin, sku)); // hoàn thành không hoàn kho
        var history = done.Data.GetProperty("history").EnumerateArray().Select(h => h.GetProperty("to").GetString()).ToArray();
        Assert.Equal(["Pending", "Confirmed", "Processing", "Shipping", "Completed"], history);
    }

    [Fact]
    public async Task Invalid_transitions_are_refused_and_change_nothing()
    {
        var (admin, province, ward) = await SetupAsync();
        var sku = await ProductAsync(admin, stock: 10);
        var id = OrderId(await PlaceAsync(factory.NewClient(), sku, 2, province, ward));

        var skip = await StatusAsync(admin, id, "Completed");
        Assert.Equal(HttpStatusCode.Conflict, skip.Status);
        Assert.Equal("invalid_transition", skip.ErrorCode);
        Assert.Equal("same_status", (await StatusAsync(admin, id, "Pending")).ErrorCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsync($"/api/admin/orders/{id}/status", new { status = "Bay" })).Status);
        Assert.Equal(HttpStatusCode.NotFound, (await StatusAsync(admin, Guid.NewGuid(), "Confirmed")).Status);

        Assert.True((await StatusAsync(admin, id, "Cancelled")).Success);
        Assert.Equal(10, await StockAsync(admin, sku));
        // đơn đã huỷ là trạng thái cuối: không huỷ lần hai (tránh hoàn kho hai lần), không mở lại
        Assert.Equal(HttpStatusCode.Conflict, (await StatusAsync(admin, id, "Cancelled")).Status);
        Assert.Equal(HttpStatusCode.Conflict, (await StatusAsync(admin, id, "Confirmed")).Status);
        Assert.Equal(10, await StockAsync(admin, sku));
        Assert.Equal(HttpStatusCode.Conflict, (await admin.PostAsync($"/api/admin/orders/{id}/mark-paid")).Status);
    }

    [Fact]
    public async Task Concurrent_cancels_restock_exactly_once()
    {
        var (admin, province, ward) = await SetupAsync();
        var sku = await ProductAsync(admin, stock: 10);
        var id = OrderId(await PlaceAsync(factory.NewClient(), sku, 3, province, ward));
        Assert.Equal(7, await StockAsync(admin, sku));

        var results = await Task.WhenAll(Enumerable.Range(0, 5).Select(_ => StatusAsync(admin, id, "Cancelled")));

        Assert.Equal(1, results.Count(r => r.Success));
        Assert.Equal(10, await StockAsync(admin, sku));
    }

    [Fact]
    public async Task Refund_needs_the_refund_permission_and_marks_payments_refunded()
    {
        var (admin, province, ward) = await SetupAsync();
        var staff = await factory.LoginAsRoleAsync(RoleDefaults.Staff);
        var sku = await ProductAsync(admin);
        var id = OrderId(await PlaceAsync(factory.NewClient(), sku, 1, province, ward, method: "BankTransfer"));
        await admin.PostAsync($"/api/admin/orders/{id}/mark-paid");
        foreach (var s in new[] { "Confirmed", "Processing", "Shipping", "Completed" }) Assert.True((await StatusAsync(admin, id, s)).Success);

        var denied = await StatusAsync(staff, id, "Refunded");
        Assert.Equal(HttpStatusCode.Forbidden, denied.Status);
        Assert.Equal("Completed", (await admin.GetAsync($"/api/admin/orders/{id}")).Data.GetProperty("status").GetString());

        var ok = await StatusAsync(admin, id, "Refunded", "Sản phẩm lỗi");
        Assert.Equal("Refunded", ok.Data.GetProperty("paymentStatus").GetString());
        Assert.Equal("Refunded", ok.Data.GetProperty("payments")[0].GetProperty("status").GetString());
    }

    [Fact]
    public async Task Admin_note_is_kept_in_history_without_changing_status_and_empty_note_is_rejected()
    {
        var (admin, province, ward) = await SetupAsync();
        var id = OrderId(await PlaceAsync(factory.NewClient(), await ProductAsync(admin), 1, province, ward));

        var r = await admin.PostAsync($"/api/admin/orders/{id}/notes", new { note = "Khách hẹn giao sau 18h" });
        Assert.Equal("Pending", r.Data.GetProperty("status").GetString());
        Assert.Equal(2, r.Data.GetProperty("history").GetArrayLength());
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsync($"/api/admin/orders/{id}/notes", new { note = "  " })).Status);
    }

    [Fact]
    public async Task Admin_order_list_filters_searches_without_diacritics_and_sorts_only_by_allowed_fields()
    {
        var (admin, province, ward) = await SetupAsync();
        var sku = await ProductAsync(admin, stock: 20);
        var marker = $"Trần Thị Đặc Biệt {Guid.NewGuid():N}"[..24];
        var guest = factory.NewClient();
        await AddToCartAsync(guest, sku);
        var special = await guest.PostAsync("/api/orders/checkout", CheckoutBody(province, ward, name: marker, phone: "0987654321"));
        await PlaceAsync(factory.NewClient(), sku, 1, province, ward);

        var byName = await admin.GetAsync("/api/admin/orders?q=" + Uri.EscapeDataString("tran thi dac biet"));
        Assert.Contains(OrderNumber(special), byName.Data.EnumerateArray().Select(o => o.GetProperty("orderNumber").GetString()));
        Assert.All(byName.Data.EnumerateArray(), o => Assert.Contains("Đặc Biệt", o.GetProperty("customerName").GetString()));
        Assert.Single((await admin.GetAsync("/api/admin/orders?q=" + OrderNumber(special).ToLowerInvariant())).Data.EnumerateArray());
        Assert.Single((await admin.GetAsync("/api/admin/orders?q=0987654321")).Data.EnumerateArray().Where(o => o.GetProperty("phone").GetString() == "0987654321" && o.GetProperty("customerName").GetString() == marker));
        Assert.Empty((await admin.GetAsync("/api/admin/orders?q=%25")).Data.EnumerateArray()); // % không phải ký tự đại diện

        await StatusAsync(admin, OrderId(special), "Confirmed");
        var confirmed = await admin.GetAsync("/api/admin/orders?status=Confirmed&pageSize=100");
        Assert.All(confirmed.Data.EnumerateArray(), o => Assert.Equal("Confirmed", o.GetProperty("status").GetString()));
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.GetAsync("/api/admin/orders?sort=phone:asc")).Status);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.GetAsync("/api/admin/orders?status=Bay")).Status);
        var asc = (await admin.GetAsync("/api/admin/orders?sort=total:asc&pageSize=100")).Data.EnumerateArray().Select(o => o.GetProperty("grandTotal").GetDecimal()).ToList();
        Assert.Equal(asc.OrderBy(x => x), asc);
    }

    // ---------- tra cứu và đơn của tôi ----------
    [Fact]
    public async Task Tracking_needs_matching_order_number_and_phone_and_never_reveals_which_one_was_wrong()
    {
        var (admin, province, ward) = await SetupAsync();
        var order = await PlaceAsync(factory.NewClient(), await ProductAsync(admin), 1, province, ward, phone: "0912345678");
        var number = OrderNumber(order);
        var anon = factory.NewClient();

        var ok = await anon.PostAsync("/api/orders/track", new { orderNumber = number.ToLowerInvariant(), phone = "+84 912 345 678" });
        Assert.True(ok.Success, ok.Body.ToString());
        Assert.Equal(number, OrderNumber(ok));

        var wrongPhone = await anon.PostAsync("/api/orders/track", new { orderNumber = number, phone = "0912345679" });
        var wrongNumber = await anon.PostAsync("/api/orders/track", new { orderNumber = "OD000000-AAAAA", phone = "0912345678" });
        var badPhone = await anon.PostAsync("/api/orders/track", new { orderNumber = number, phone = "abc" });
        Assert.Equal(HttpStatusCode.NotFound, wrongPhone.Status);
        Assert.Equal(wrongPhone.Body.GetProperty("error").GetProperty("message").GetString(), wrongNumber.Body.GetProperty("error").GetProperty("message").GetString());
        Assert.Equal(HttpStatusCode.NotFound, badPhone.Status);
        Assert.Equal(HttpStatusCode.BadRequest, (await anon.PostAsync("/api/orders/track", new { orderNumber = "", phone = "0912345678" })).Status);
    }

    [Fact]
    public async Task Customer_sees_only_own_orders_and_can_cancel_only_while_pending()
    {
        var (admin, province, ward) = await SetupAsync();
        var sku = await ProductAsync(admin, stock: 20);
        var (alice, _) = await CustomerAsync();
        var (bob, _) = await CustomerAsync();

        var mine = await PlaceAsync(alice, sku, 2, province, ward);
        var bobs = await PlaceAsync(bob, sku, 1, province, ward);

        var list = await alice.GetAsync("/api/account/orders");
        Assert.Single(list.Data.EnumerateArray());
        Assert.Equal(OrderNumber(mine), list.Data[0].GetProperty("orderNumber").GetString());
        Assert.Equal(HttpStatusCode.NotFound, (await alice.GetAsync($"/api/account/orders/{OrderNumber(bobs)}")).Status);
        Assert.Equal(HttpStatusCode.NotFound, (await alice.PostAsync($"/api/account/orders/{OrderNumber(bobs)}/cancel", new { reason = "x" })).Status);
        Assert.Equal(HttpStatusCode.Unauthorized, (await factory.NewClient().GetAsync("/api/account/orders")).Status);

        var cancelled = await alice.PostAsync($"/api/account/orders/{OrderNumber(mine)}/cancel", new { reason = "Đặt nhầm" });
        Assert.True(cancelled.Success, cancelled.Body.ToString());
        Assert.Equal("Cancelled", cancelled.Data.GetProperty("status").GetString());
        Assert.Equal(19, await StockAsync(admin, sku)); // chỉ còn đơn của Bob giữ 1 sản phẩm

        var next = await PlaceAsync(alice, sku, 1, province, ward);
        await StatusAsync(admin, OrderId(next), "Confirmed");
        var late = await alice.PostAsync($"/api/account/orders/{OrderNumber(next)}/cancel", new { reason = "x" });
        Assert.Equal(HttpStatusCode.Conflict, late.Status);
        Assert.Equal("cannot_cancel", late.ErrorCode);
    }

    [Fact]
    public async Task Logged_in_checkout_links_the_order_to_the_account()
    {
        var (admin, province, ward) = await SetupAsync();
        var (c, email) = await CustomerAsync();
        var sku = await ProductAsync(admin);
        var order = await PlaceAsync(c, sku, 1, province, ward);

        var userId = await factory.WithDbAsync(db => db.Users.Where(u => u.Email == email).Select(u => u.Id).SingleAsync());
        Assert.Equal(userId, await factory.WithDbAsync(db => db.Orders.Where(o => o.OrderNumber == OrderNumber(order)).Select(o => o.UserId).SingleAsync()));
    }

    [Fact]
    public async Task My_orders_honour_page_and_page_size()
    {
        var (admin, province, ward) = await SetupAsync();
        var (c, _) = await CustomerAsync();
        var sku = await ProductAsync(admin, stock: 20);
        var numbers = new List<string>();
        for (var i = 0; i < 3; i++) numbers.Add(OrderNumber(await PlaceAsync(c, sku, 1, province, ward)));

        var first = await c.GetAsync("/api/account/orders?page=1&pageSize=2");
        var second = await c.GetAsync("/api/account/orders?page=2&pageSize=2");
        Assert.Equal(2, first.Data.GetArrayLength());
        Assert.Equal(1, second.Data.GetArrayLength());
        Assert.Equal(3, second.Meta.GetProperty("total").GetInt32());
        Assert.Equal(2, second.Meta.GetProperty("page").GetInt32());
        Assert.Equal(2, second.Meta.GetProperty("pageSize").GetInt32());
        var all = first.Data.EnumerateArray().Concat(second.Data.EnumerateArray()).Select(o => o.GetProperty("orderNumber").GetString()).ToList();
        Assert.Equal(numbers.Order().ToList(), all.Order().ToList()); // hai trang không trùng, không sót
    }

    // ---------- địa chỉ và yêu thích ----------
    [Fact]
    public async Task Addresses_keep_exactly_one_default_validate_location_and_are_private_per_user()
    {
        var (_, province, ward) = await SetupAsync();
        var (c, _) = await CustomerAsync();
        object Body(bool def, string? w = null) => new { receiverName = "Người nhận", phone = "0901234567", addressLine = "1 Đường A", provinceCode = province, wardCode = w ?? ward, isDefault = def };

        var first = await c.PostAsync("/api/account/addresses", Body(false));
        Assert.True(first.Success, first.Body.ToString());
        Assert.True(first.Data[0].GetProperty("isDefault").GetBoolean()); // địa chỉ đầu tiên tự là mặc định
        var second = await c.PostAsync("/api/account/addresses", Body(true));
        Assert.Equal(2, second.Data.GetArrayLength());
        Assert.Single(second.Data.EnumerateArray().Where(a => a.GetProperty("isDefault").GetBoolean()));
        var secondId = second.Data[0].GetProperty("id").GetGuid(); // mặc định xếp đầu
        Assert.True(second.Data[0].GetProperty("isDefault").GetBoolean());

        Assert.Equal(HttpStatusCode.BadRequest, (await c.PostAsync("/api/account/addresses", Body(false, "99999"))).Status);
        Assert.Equal(HttpStatusCode.BadRequest, (await c.PostAsync("/api/account/addresses", new { receiverName = "", phone = "1", addressLine = "", provinceCode = "", wardCode = "" })).Status);

        var (other, _) = await CustomerAsync();
        Assert.Equal(HttpStatusCode.NotFound, (await other.PutAsync($"/api/account/addresses/{secondId}", Body(true))).Status);
        Assert.Equal(HttpStatusCode.NotFound, (await other.DeleteAsync($"/api/account/addresses/{secondId}")).Status);
        Assert.Empty((await other.GetAsync("/api/account/addresses")).Data.EnumerateArray());

        var afterDelete = await c.DeleteAsync($"/api/account/addresses/{secondId}");
        Assert.Single(afterDelete.Data.EnumerateArray());
        Assert.True(afterDelete.Data[0].GetProperty("isDefault").GetBoolean()); // xoá mặc định → địa chỉ còn lại lên làm mặc định
    }

    [Fact]
    public async Task Address_book_is_capped()
    {
        var (_, province, ward) = await SetupAsync();
        var (c, _) = await CustomerAsync();
        for (var i = 0; i < 10; i++)
            Assert.True((await c.PostAsync("/api/account/addresses", new { receiverName = "N", phone = "0901234567", addressLine = "x" + i, provinceCode = province, wardCode = ward, isDefault = false })).Success);
        var r = await c.PostAsync("/api/account/addresses", new { receiverName = "N", phone = "0901234567", addressLine = "x", provinceCode = province, wardCode = ward, isDefault = false });
        Assert.Equal("address_limit", r.ErrorCode);
    }

    [Fact]
    public async Task Wishlist_is_idempotent_private_and_skips_products_that_became_hidden()
    {
        var (admin, _, _) = await SetupAsync();
        var a = await ProductAsync(admin);
        var b = await ProductAsync(admin);
        var (c, _) = await CustomerAsync();

        Assert.True((await c.PutAsync($"/api/account/wishlist/{a.ProductId}")).Success);
        Assert.True((await c.PutAsync($"/api/account/wishlist/{a.ProductId}")).Success); // thêm lại không lỗi
        Assert.True((await c.PutAsync($"/api/account/wishlist/{b.ProductId}")).Success);
        Assert.Equal(HttpStatusCode.NotFound, (await c.PutAsync($"/api/account/wishlist/{Guid.NewGuid()}")).Status);
        var hidden = await ProductAsync(admin, status: "Hidden");
        Assert.Equal(HttpStatusCode.NotFound, (await c.PutAsync($"/api/account/wishlist/{hidden.ProductId}")).Status);

        Assert.Equal(2, (await c.GetAsync("/api/account/wishlist/ids")).Data.GetArrayLength());
        var cards = (await c.GetAsync("/api/account/wishlist")).Data.EnumerateArray().Select(x => x.GetProperty("id").GetGuid()).ToList();
        Assert.Equal([b.ProductId, a.ProductId], cards); // mới thêm xếp trước

        await admin.PutAsync($"/api/admin/products/{a.ProductId}/flags", new { isFeatured = false, isBestSeller = false, isNew = false, status = "Hidden" });
        Assert.Equal([b.ProductId], (await c.GetAsync("/api/account/wishlist")).Data.EnumerateArray().Select(x => x.GetProperty("id").GetGuid()).ToList());

        var (other, _) = await CustomerAsync();
        Assert.Empty((await other.GetAsync("/api/account/wishlist/ids")).Data.EnumerateArray());
        Assert.True((await c.DeleteAsync($"/api/account/wishlist/{b.ProductId}")).Success);
        Assert.True((await c.DeleteAsync($"/api/account/wishlist/{b.ProductId}")).Success); // xoá lại không lỗi
        Assert.Equal(1, (await c.GetAsync("/api/account/wishlist/ids")).Data.GetArrayLength());
    }

    // ---------- khách hàng (quản trị) ----------
    [Fact]
    public async Task Admin_can_list_view_and_lock_customers_but_not_staff_accounts()
    {
        var (admin, province, ward) = await SetupAsync();
        var (c, email) = await CustomerAsync();
        var order = await PlaceAsync(c, await ProductAsync(admin, price: 250_000), 2, province, ward);
        await StatusAsync(admin, OrderId(order), "Confirmed");
        var id = await factory.WithDbAsync(db => db.Users.Where(u => u.Email == email).Select(u => u.Id).SingleAsync());

        var list = await admin.GetAsync("/api/admin/customers?q=" + Uri.EscapeDataString(email));
        Assert.True(list.Success, list.Body.ToString());
        var row = Assert.Single(list.Data.EnumerateArray());
        Assert.Equal(1, row.GetProperty("orderCount").GetInt32());
        Assert.Equal(500_000, row.GetProperty("totalSpent").GetDecimal());
        var detail = await admin.GetAsync($"/api/admin/customers/{id}");
        Assert.Equal(1, detail.Data.GetProperty("recentOrders").GetArrayLength());

        var cancelled = await PlaceAsync(c, await ProductAsync(admin, price: 100_000), 1, province, ward);
        await StatusAsync(admin, OrderId(cancelled), "Cancelled");
        Assert.Equal(500_000, (await admin.GetAsync($"/api/admin/customers/{id}")).Data.GetProperty("totalSpent").GetDecimal()); // đơn huỷ không tính doanh số

        Assert.True((await admin.PutAsync($"/api/admin/customers/{id}/active", new { isActive = false })).Success);
        Assert.False((await factory.NewClient().LoginAsync(email, TestData.Password)).Success);
        Assert.Equal(HttpStatusCode.Unauthorized, (await c.PostAsync("/api/auth/refresh")).Status); // phiên cũ không làm mới được
        Assert.True((await admin.PutAsync($"/api/admin/customers/{id}/active", new { isActive = true })).Success);
        Assert.True((await factory.NewClient().LoginAsync(email, TestData.Password)).Success);

        var adminUserId = await factory.WithDbAsync(db => db.Users.Where(u => u.Email == TestSecrets.AdminEmail).Select(u => u.Id).SingleAsync());
        Assert.Equal(HttpStatusCode.NotFound, (await admin.GetAsync($"/api/admin/customers/{adminUserId}")).Status);
        Assert.Equal(HttpStatusCode.Forbidden, (await admin.PutAsync($"/api/admin/customers/{adminUserId}/active", new { isActive = false })).Status);
        Assert.True((await admin.GetAsync("/api/admin/orders")).Success); // quản trị vẫn đăng nhập được
    }

    // ---------- phân quyền ----------
    [Fact]
    public async Task Sales_admin_endpoints_enforce_permissions_per_role()
    {
        var (admin, province, ward) = await SetupAsync();
        var id = OrderId(await PlaceAsync(factory.NewClient(), await ProductAsync(admin), 1, province, ward));
        var customer = (await CustomerAsync()).Client;
        var staff = await factory.LoginAsRoleAsync(RoleDefaults.Staff);
        var manager = await factory.LoginAsRoleAsync(RoleDefaults.Manager);
        var anon = factory.NewClient();

        foreach (var url in new[] { "/api/admin/orders", $"/api/admin/orders/{id}", "/api/admin/customers", "/api/admin/coupons", "/api/admin/shipping-rates" })
        {
            Assert.Equal(HttpStatusCode.Unauthorized, (await anon.GetAsync(url)).Status);
            Assert.Equal(HttpStatusCode.Forbidden, (await customer.GetAsync(url)).Status);
        }
        // Staff: xem và đổi trạng thái đơn, không thấy khách hàng, mã giảm giá, vận chuyển
        Assert.True((await staff.GetAsync("/api/admin/orders")).Success);
        Assert.True((await StatusAsync(staff, id, "Confirmed")).Success);
        Assert.Equal(HttpStatusCode.Forbidden, (await staff.GetAsync("/api/admin/customers")).Status);
        Assert.Equal(HttpStatusCode.Forbidden, (await staff.GetAsync("/api/admin/coupons")).Status);
        Assert.Equal(HttpStatusCode.Forbidden, (await staff.GetAsync("/api/admin/shipping-rates")).Status);
        // Manager: có khách hàng và mã giảm giá, nhưng vận chuyển thuộc cấu hình cửa hàng
        var mc = await manager.GetAsync("/api/admin/customers");
        Assert.True(mc.Success, mc.Body.ToString());
        Assert.True((await manager.GetAsync("/api/admin/coupons")).Success);
        Assert.Equal(HttpStatusCode.Forbidden, (await manager.GetAsync("/api/admin/shipping-rates")).Status);
        Assert.Equal(HttpStatusCode.Forbidden, (await manager.PutAsync($"/api/admin/customers/{Guid.NewGuid()}/active", new { isActive = false })).Status);
        // ghi không có CSRF bị chặn
        Assert.Equal(HttpStatusCode.Forbidden, (await admin.PostAsync($"/api/admin/orders/{id}/status", new { status = "Processing" }, sendCsrf: false)).Status);
    }

    [Fact]
    public async Task Order_status_changes_are_audited()
    {
        var (admin, province, ward) = await SetupAsync();
        var id = OrderId(await PlaceAsync(factory.NewClient(), await ProductAsync(admin), 1, province, ward));
        await StatusAsync(admin, id, "Confirmed");
        Assert.Equal(1, await factory.WithDbAsync(db => db.AuditLogs.CountAsync(a => a.Action == "order.status" && a.EntityId == id.ToString())));
    }
}
