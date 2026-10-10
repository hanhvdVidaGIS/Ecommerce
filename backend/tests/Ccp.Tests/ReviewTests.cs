using System.Net;
using Ccp.Application.Reviews;
using Ccp.Domain.Security;
using Ccp.Tests.Infrastructure;
using static Ccp.Tests.Infrastructure.SalesApi;

namespace Ccp.Tests;

[Collection(ApiCollection.Name)]
public class ReviewTests(ApiFactory factory)
{
    private async Task<(TestClient Customer, string Email)> CustomerAsync(string fullName = "Nguyễn Văn Anh")
    {
        var email = $"dg-{Guid.NewGuid():N}@test.local";
        var c = factory.NewClient();
        Assert.True((await c.PostAsync("/api/auth/register", new { email, password = TestData.Password, fullName })).Success);
        return (c, email);
    }

    /// <summary>Khách đặt hàng và quản trị đẩy đơn tới Hoàn thành.</summary>
    private async Task<Sku> BuyAndReceiveAsync(TestClient admin, TestClient customer)
    {
        var (p, w) = await AddressAsync(factory.NewClient());
        var sku = await ProductAsync(admin, stock: 10);
        var order = await PlaceAsync(customer, sku, 1, p, w);
        foreach (var s in new[] { "Confirmed", "Processing", "Shipping", "Completed" })
            Assert.True((await admin.PostAsync($"/api/admin/orders/{OrderId(order)}/status", new { status = s })).Success);
        return sku;
    }

    private static async Task<string> SlugAsync(TestClient admin, Sku sku) => (await admin.GetAsync($"/api/admin/products/{sku.ProductId}")).Data.GetProperty("slug").GetString()!;

    [Fact]
    public async Task Only_a_customer_who_received_the_product_can_review_it_once_and_it_waits_for_moderation()
    {
        var admin = await factory.NewAdminClientAsync();
        var (customer, _) = await CustomerAsync();
        var sku = await BuyAndReceiveAsync(admin, customer);
        var slug = await SlugAsync(admin, sku);

        var elig = await customer.GetAsync($"/api/account/reviews/eligibility/{sku.ProductId}");
        Assert.True(elig.Data.GetProperty("canReview").GetBoolean());

        var created = await customer.PostAsync("/api/account/reviews", new { productId = sku.ProductId, rating = 5, title = "Rất thơm", content = "Lưu hương lâu, giao nhanh." });
        Assert.True(created.Success, created.Body.ToString());
        Assert.Equal("Pending", created.Data.GetProperty("status").GetString());

        // chờ duyệt: chưa hiện công khai và chưa tính điểm
        var anon = factory.NewClient();
        Assert.Equal(0, (await anon.GetAsync($"/api/public/products/{slug}/reviews")).Data.GetArrayLength());
        Assert.Equal(0, (await anon.GetAsync($"/api/public/products/{slug}/rating")).Data.GetProperty("count").GetInt32());

        var again = await customer.PostAsync("/api/account/reviews", new { productId = sku.ProductId, rating = 1 });
        Assert.Equal(HttpStatusCode.Conflict, again.Status);
        Assert.Equal("already_reviewed", again.ErrorCode);
        var after = await customer.GetAsync($"/api/account/reviews/eligibility/{sku.ProductId}");
        Assert.False(after.Data.GetProperty("canReview").GetBoolean());
        Assert.Equal("already_reviewed", after.Data.GetProperty("reason").GetString());
    }

    [Fact]
    public async Task Customers_who_did_not_buy_or_have_not_received_cannot_review()
    {
        var admin = await factory.NewAdminClientAsync();
        var (p, w) = await AddressAsync(factory.NewClient());
        var (buyer, _) = await CustomerAsync();
        var (stranger, _) = await CustomerAsync();
        var sku = await ProductAsync(admin, stock: 10);

        var notBought = await stranger.PostAsync("/api/account/reviews", new { productId = sku.ProductId, rating = 5 });
        Assert.Equal(HttpStatusCode.Forbidden, notBought.Status);
        Assert.Equal("not_purchased", notBought.ErrorCode);

        var order = await PlaceAsync(buyer, sku, 1, p, w); // mới đặt, chưa nhận
        Assert.Equal("not_purchased", (await buyer.PostAsync("/api/account/reviews", new { productId = sku.ProductId, rating = 5 })).ErrorCode);
        await admin.PostAsync($"/api/admin/orders/{OrderId(order)}/status", new { status = "Cancelled" });
        Assert.Equal("not_purchased", (await buyer.PostAsync("/api/account/reviews", new { productId = sku.ProductId, rating = 5 })).ErrorCode); // đơn huỷ không tính

        var (other, _) = await CustomerAsync();
        var received = await BuyAndReceiveAsync(admin, other);
        var otherProduct = await other.PostAsync("/api/account/reviews", new { productId = sku.ProductId, rating = 5 }); // đã nhận sản phẩm khác, không phải sản phẩm này
        Assert.Equal("not_purchased", otherProduct.ErrorCode);
        Assert.True((await other.PostAsync("/api/account/reviews", new { productId = received.ProductId, rating = 4 })).Success);

        Assert.Equal(HttpStatusCode.Unauthorized, (await factory.NewClient().PostAsync("/api/account/reviews", new { productId = sku.ProductId, rating = 5 })).Status);
        Assert.Equal(HttpStatusCode.NotFound, (await other.PostAsync("/api/account/reviews", new { productId = Guid.NewGuid(), rating = 5 })).Status);
    }

    [Fact]
    public async Task Input_is_validated_rating_one_to_five_and_length_limits()
    {
        var admin = await factory.NewAdminClientAsync();
        var (customer, _) = await CustomerAsync();
        var sku = await BuyAndReceiveAsync(admin, customer);

        foreach (var rating in new[] { 0, 6, -1, 100 })
            Assert.Equal(HttpStatusCode.BadRequest, (await customer.PostAsync("/api/account/reviews", new { productId = sku.ProductId, rating })).Status);
        Assert.Equal(HttpStatusCode.BadRequest, (await customer.PostAsync("/api/account/reviews", new { productId = sku.ProductId, rating = 5, title = new string('t', 201) })).Status);
        Assert.Equal(HttpStatusCode.BadRequest, (await customer.PostAsync("/api/account/reviews", new { productId = sku.ProductId, rating = 5, content = new string('c', 4001) })).Status);
        Assert.True((await customer.PostAsync("/api/account/reviews", new { productId = sku.ProductId, rating = 1, title = new string('t', 200), content = new string('c', 4000) })).Success); // biên hợp lệ
    }

    [Fact]
    public async Task Approval_publishes_with_masked_name_and_the_summary_averages_only_approved_reviews()
    {
        var admin = await factory.NewAdminClientAsync();
        var first = await CustomerAsync("Trần Thị Bích Ngọc");
        var second = await CustomerAsync("Lê Văn Hùng");
        var third = await CustomerAsync("Phạm Minh");
        var sku = await BuyAndReceiveAsync(admin, first.Customer);
        // hai khách còn lại cũng mua đúng sản phẩm này
        var (p, w) = await AddressAsync(factory.NewClient());
        foreach (var c in new[] { second.Customer, third.Customer })
        {
            var o = await PlaceAsync(c, sku, 1, p, w);
            foreach (var s in new[] { "Confirmed", "Processing", "Shipping", "Completed" }) await admin.PostAsync($"/api/admin/orders/{OrderId(o)}/status", new { status = s });
        }
        var slug = await SlugAsync(admin, sku);

        var r1 = await first.Customer.PostAsync("/api/account/reviews", new { productId = sku.ProductId, rating = 5, title = "Tuyệt", content = "<b>Rất</b> thơm" });
        var r2 = await second.Customer.PostAsync("/api/account/reviews", new { productId = sku.ProductId, rating = 2, content = "Tạm" });
        var r3 = await third.Customer.PostAsync("/api/account/reviews", new { productId = sku.ProductId, rating = 4 });
        var id1 = r1.Data.GetProperty("id").GetGuid(); var id2 = r2.Data.GetProperty("id").GetGuid();

        Assert.True((await admin.PutAsync($"/api/admin/reviews/{id1}/status", new { status = "Approved" })).Success);
        Assert.True((await admin.PutAsync($"/api/admin/reviews/{id2}/status", new { status = "Approved" })).Success);
        // r3 vẫn chờ duyệt

        var anon = factory.NewClient();
        var list = await anon.GetAsync($"/api/public/products/{slug}/reviews");
        Assert.Equal(2, list.Data.GetArrayLength());
        var names = list.Data.EnumerateArray().Select(x => x.GetProperty("authorName").GetString()).ToList();
        Assert.Contains("Trần N.", names);
        Assert.Contains("Lê H.", names);
        Assert.DoesNotContain("@", list.Body.ToString()); // không lộ email
        Assert.DoesNotContain("Bích", list.Body.ToString());
        // nội dung được trả nguyên văn dạng văn bản; giao diện chịu trách nhiệm hiển thị như văn bản thuần
        Assert.Contains("<b>Rất</b> thơm", list.Data.EnumerateArray().Select(x => x.GetProperty("content").GetString()));

        var page1 = await anon.GetAsync($"/api/public/products/{slug}/reviews?page=1&pageSize=1");
        var page2 = await anon.GetAsync($"/api/public/products/{slug}/reviews?page=2&pageSize=1");
        Assert.Equal(1, page1.Data.GetArrayLength());
        Assert.Equal(2, page2.Meta.GetProperty("page").GetInt32());
        Assert.Equal(2, page2.Meta.GetProperty("total").GetInt32());
        Assert.NotEqual(page1.Data[0].GetProperty("id").GetGuid(), page2.Data[0].GetProperty("id").GetGuid());

        var rating = (await anon.GetAsync($"/api/public/products/{slug}/rating")).Data;
        Assert.Equal(2, rating.GetProperty("count").GetInt32());
        Assert.Equal(3.5m, rating.GetProperty("average").GetDecimal());
        Assert.Equal([0, 1, 0, 0, 1], rating.GetProperty("distribution").EnumerateArray().Select(x => x.GetInt32()).ToArray());

        // từ chối đánh giá đã duyệt thì ẩn lại và điểm tính lại
        Assert.True((await admin.PutAsync($"/api/admin/reviews/{id2}/status", new { status = "Rejected" })).Success);
        Assert.Equal(5m, (await anon.GetAsync($"/api/public/products/{slug}/rating")).Data.GetProperty("average").GetDecimal());
        Assert.Equal(1, (await anon.GetAsync($"/api/public/products/{slug}/reviews")).Data.GetArrayLength());
        _ = r3;
    }

    [Fact]
    public async Task Admin_can_filter_list_and_delete_and_the_customer_can_then_review_again()
    {
        var admin = await factory.NewAdminClientAsync();
        var (customer, email) = await CustomerAsync();
        var sku = await BuyAndReceiveAsync(admin, customer);
        var created = await customer.PostAsync("/api/account/reviews", new { productId = sku.ProductId, rating = 3, content = "Bình thường nhé" });
        var id = created.Data.GetProperty("id").GetGuid();

        var pending = await admin.GetAsync("/api/admin/reviews?status=Pending&pageSize=100");
        var row = pending.Data.EnumerateArray().Single(r => r.GetProperty("id").GetGuid() == id);
        Assert.Equal(email, row.GetProperty("authorEmail").GetString());
        Assert.False(string.IsNullOrEmpty(row.GetProperty("orderNumber").GetString()));
        Assert.Empty((await admin.GetAsync("/api/admin/reviews?status=Approved&q=" + Uri.EscapeDataString("binh thuong nhe"))).Data.EnumerateArray());
        Assert.Single((await admin.GetAsync("/api/admin/reviews?q=" + Uri.EscapeDataString("binh thuong nhe"))).Data.EnumerateArray()); // tìm không dấu
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.GetAsync("/api/admin/reviews?sort=email:asc")).Status);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PutAsync($"/api/admin/reviews/{id}/status", new { status = "Bay" })).Status);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.PutAsync($"/api/admin/reviews/{Guid.NewGuid()}/status", new { status = "Approved" })).Status);

        Assert.True((await admin.DeleteAsync($"/api/admin/reviews/{id}")).Success);
        Assert.Empty((await customer.GetAsync("/api/account/reviews")).Data.EnumerateArray());
        Assert.True((await customer.PostAsync("/api/account/reviews", new { productId = sku.ProductId, rating = 5 })).Success);
    }

    [Fact]
    public async Task Double_submit_creates_exactly_one_review()
    {
        var admin = await factory.NewAdminClientAsync();
        var (customer, _) = await CustomerAsync();
        var sku = await BuyAndReceiveAsync(admin, customer);

        var results = await Task.WhenAll(Enumerable.Range(0, 5).Select(_ => customer.PostAsync("/api/account/reviews", new { productId = sku.ProductId, rating = 5 })));

        Assert.Equal(1, results.Count(r => r.Success));
        Assert.All(results.Where(r => !r.Success), r => Assert.Equal(HttpStatusCode.Conflict, r.Status));
        Assert.Single((await customer.GetAsync("/api/account/reviews")).Data.EnumerateArray());
    }

    [Fact]
    public async Task Moderation_requires_the_permission_and_hidden_products_have_no_public_reviews()
    {
        var admin = await factory.NewAdminClientAsync();
        var staff = await factory.LoginAsRoleAsync(RoleDefaults.Staff);
        var manager = await factory.LoginAsRoleAsync(RoleDefaults.Manager);
        Assert.Equal(HttpStatusCode.Unauthorized, (await factory.NewClient().GetAsync("/api/admin/reviews")).Status);
        Assert.Equal(HttpStatusCode.Forbidden, (await staff.GetAsync("/api/admin/reviews")).Status);
        Assert.Equal(HttpStatusCode.Forbidden, (await staff.DeleteAsync($"/api/admin/reviews/{Guid.NewGuid()}")).Status);
        Assert.True((await manager.GetAsync("/api/admin/reviews")).Success);

        var hidden = await ProductAsync(admin, status: "Hidden");
        var slug = await SlugAsync(admin, hidden);
        Assert.Equal(HttpStatusCode.NotFound, (await factory.NewClient().GetAsync($"/api/public/products/{slug}/reviews")).Status);
        Assert.Equal(HttpStatusCode.NotFound, (await factory.NewClient().GetAsync("/api/public/products/khong-co/rating")).Status);
    }

    [Theory]
    [InlineData("Nguyễn Văn Anh", "Nguyễn A.")]
    [InlineData("  lê   hùng ", "lê H.")]
    [InlineData("Madonna", "Madonna")]
    [InlineData("", "Khách hàng")]
    [InlineData("   ", "Khách hàng")]
    public void Names_are_masked_to_family_name_and_initial(string full, string expected) => Assert.Equal(expected, ReviewService.MaskName(full));
}
