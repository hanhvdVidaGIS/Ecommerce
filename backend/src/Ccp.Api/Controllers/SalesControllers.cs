using Ccp.Api.Http;
using Ccp.Api.Security;
using Ccp.Application.Abstractions;
using Ccp.Application.Common;
using Ccp.Application.Sales;
using Ccp.Application.Storefront;
using Ccp.Domain.Security;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace Ccp.Api.Controllers;

[Route("api/public")]
public class PublicCommerceController(AddressService addresses, ShippingService shipping, PaymentGatewayRegistry gateways) : ApiControllerBase
{
    [HttpGet("address/provinces"), AllowAnonymous]
    public async Task<ApiResponse<IReadOnlyList<AddressUnitDto>>> Provinces(CancellationToken ct) => Ok(await addresses.ProvincesAsync(ct));

    [HttpGet("address/provinces/{code}/wards"), AllowAnonymous]
    public async Task<ApiResponse<IReadOnlyList<AddressUnitDto>>> Wards(string code, CancellationToken ct) => Ok(await addresses.WardsAsync(code, ct));

    [HttpGet("shipping/quote"), AllowAnonymous]
    public async Task<ApiResponse<ShippingQuoteDto>> Quote([FromQuery] string? provinceCode, [FromQuery] decimal subtotal, CancellationToken ct) =>
        Ok(await shipping.QuoteAsync(provinceCode, Math.Max(0, subtotal), ct));

    [HttpGet("payment-methods"), AllowAnonymous]
    public async Task<ApiResponse<IReadOnlyList<string>>> PaymentMethods(CancellationToken ct) =>
        Ok<IReadOnlyList<string>>((await gateways.EnabledAsync(ct)).Select(m => m.ToString()).ToList());
}

[Route("api/public/newsletter")]
public class NewsletterController(Ccp.Application.Content.NewsletterService service) : ApiControllerBase
{
    [HttpPost, AllowAnonymous, EnableRateLimiting(RateLimitPolicies.Checkout)]
    public async Task<ApiResponse<object>> Subscribe(Ccp.Application.Content.SubscribeRequest request, CancellationToken ct)
    {
        await service.SubscribeAsync(request.Email, ct);
        return Done();
    }
}

[Route("api/cart")]
public class CartController(CartService carts, ICurrentUser user, CookieSettings cookies) : ApiControllerBase
{
    // Người đã đăng nhập dùng giỏ của tài khoản; khách dùng giỏ theo cookie ccp_cart.
    private CartOwner ReadOwner() => user.UserId is { } id ? new CartOwner(id, null) : new CartOwner(null, CookieSettings.ReadCartToken(Request));
    private CartOwner WriteOwner() => user.UserId is { } id ? new CartOwner(id, null) : new CartOwner(null, cookies.EnsureGuestCart(Request, Response));

    [HttpGet, AllowAnonymous]
    public async Task<ApiResponse<CartDto>> Get([FromQuery] string? provinceCode, CancellationToken ct) => Ok(await carts.GetAsync(ReadOwner(), provinceCode, ct));

    [HttpPost("items"), AllowAnonymous]
    public async Task<ApiResponse<CartDto>> Add(AddCartItemRequest request, [FromQuery] string? provinceCode, CancellationToken ct) => Ok(await carts.AddItemAsync(WriteOwner(), request, provinceCode, ct));

    [HttpPut("items/{id:guid}"), AllowAnonymous]
    public async Task<ApiResponse<CartDto>> Update(Guid id, UpdateCartItemRequest request, [FromQuery] string? provinceCode, CancellationToken ct) => Ok(await carts.UpdateItemAsync(ReadOwner(), id, request, provinceCode, ct));

    [HttpDelete("items/{id:guid}"), AllowAnonymous]
    public async Task<ApiResponse<CartDto>> Remove(Guid id, [FromQuery] string? provinceCode, CancellationToken ct) => Ok(await carts.RemoveItemAsync(ReadOwner(), id, provinceCode, ct));

    [HttpDelete, AllowAnonymous]
    public async Task<ApiResponse<object>> Clear(CancellationToken ct)
    {
        await carts.ClearAsync(ReadOwner(), ct);
        return Done();
    }

    [HttpPost("coupon"), AllowAnonymous]
    public async Task<ApiResponse<CartDto>> ApplyCoupon(ApplyCouponRequest request, [FromQuery] string? provinceCode, CancellationToken ct) => Ok(await carts.ApplyCouponAsync(ReadOwner(), request, provinceCode, ct));

    [HttpDelete("coupon"), AllowAnonymous]
    public async Task<ApiResponse<CartDto>> RemoveCoupon([FromQuery] string? provinceCode, CancellationToken ct) => Ok(await carts.RemoveCouponAsync(ReadOwner(), provinceCode, ct));
}

[Route("api/orders")]
public class CheckoutController(CheckoutService checkout, CustomerOrderService orders, ICurrentUser user) : ApiControllerBase
{
    [HttpPost("checkout"), AllowAnonymous, EnableRateLimiting(RateLimitPolicies.Checkout)]
    public async Task<ApiResponse<OrderDto>> Checkout(CheckoutRequest request, CancellationToken ct)
    {
        var owner = user.UserId is { } id ? new CartOwner(id, null) : new CartOwner(null, CookieSettings.ReadCartToken(Request));
        return Ok(await checkout.PlaceOrderAsync(owner, request, ct));
    }

    /// <summary>Tra cứu đơn của khách vãng lai bằng mã đơn + số điện thoại.</summary>
    [HttpPost("track"), AllowAnonymous, EnableRateLimiting(RateLimitPolicies.Checkout)]
    public async Task<ApiResponse<OrderDto>> Track(TrackOrderRequest request, CancellationToken ct) => Ok(await orders.TrackAsync(request, ct));
}

[Route("api/account"), Authorize]
public class AccountController(CustomerOrderService orders, AccountService account) : ApiControllerBase
{
    [HttpGet("orders")]
    public async Task<ApiResponse<IReadOnlyList<OrderListItemDto>>> Orders([FromQuery] PageRequest query, CancellationToken ct) => Paged(await orders.MineAsync(query, ct));

    [HttpGet("orders/{orderNumber}")]
    public async Task<ApiResponse<OrderDto>> Order(string orderNumber, CancellationToken ct) => Ok(await orders.GetMineAsync(orderNumber, ct));

    [HttpPost("orders/{orderNumber}/cancel")]
    public async Task<ApiResponse<OrderDto>> Cancel(string orderNumber, CancelOrderRequest request, CancellationToken ct) => Ok(await orders.CancelMineAsync(orderNumber, request.Reason, ct));

    [HttpGet("addresses")]
    public async Task<ApiResponse<IReadOnlyList<CustomerAddressDto>>> Addresses(CancellationToken ct) => Ok(await account.ListAddressesAsync(ct));

    [HttpPost("addresses")]
    public async Task<ApiResponse<IReadOnlyList<CustomerAddressDto>>> AddAddress(SaveAddressRequest request, CancellationToken ct) => Ok(await account.CreateAddressAsync(request, ct));

    [HttpPut("addresses/{id:guid}")]
    public async Task<ApiResponse<IReadOnlyList<CustomerAddressDto>>> UpdateAddress(Guid id, SaveAddressRequest request, CancellationToken ct) => Ok(await account.UpdateAddressAsync(id, request, ct));

    [HttpDelete("addresses/{id:guid}")]
    public async Task<ApiResponse<IReadOnlyList<CustomerAddressDto>>> DeleteAddress(Guid id, CancellationToken ct) => Ok(await account.DeleteAddressAsync(id, ct));

    [HttpGet("wishlist")]
    public async Task<ApiResponse<IReadOnlyList<ProductCardDto>>> Wishlist(CancellationToken ct) => Ok(await account.WishlistAsync(ct));

    [HttpGet("wishlist/ids")]
    public async Task<ApiResponse<IReadOnlyList<Guid>>> WishlistIds(CancellationToken ct) => Ok(await account.WishlistIdsAsync(ct));

    [HttpPut("wishlist/{productId:guid}")]
    public async Task<ApiResponse<object>> AddWishlist(Guid productId, CancellationToken ct)
    {
        await account.AddWishlistAsync(productId, ct);
        return Done();
    }

    [HttpDelete("wishlist/{productId:guid}")]
    public async Task<ApiResponse<object>> RemoveWishlist(Guid productId, CancellationToken ct)
    {
        await account.RemoveWishlistAsync(productId, ct);
        return Done();
    }
}

public sealed record CancelOrderRequest(string? Reason);

// ---------- quản trị ----------
[Route("api/admin/orders")]
public class AdminOrdersController(AdminOrderService service) : ApiControllerBase
{
    [HttpGet, HasPermission(Permissions.OrderView)]
    public async Task<ApiResponse<IReadOnlyList<AdminOrderListItemDto>>> List([FromQuery] OrderQuery query, CancellationToken ct) => Paged(await service.ListAsync(query, ct));

    [HttpGet("{id:guid}"), HasPermission(Permissions.OrderView)]
    public async Task<ApiResponse<OrderDto>> Get(Guid id, CancellationToken ct) => Ok(await service.GetAsync(id, ct));

    [HttpPost("{id:guid}/status"), HasPermission(Permissions.OrderUpdate)]
    public async Task<ApiResponse<OrderDto>> ChangeStatus(Guid id, ChangeOrderStatusRequest request, CancellationToken ct) => Ok(await service.ChangeStatusAsync(id, request, ct));

    [HttpPost("{id:guid}/mark-paid"), HasPermission(Permissions.OrderUpdate)]
    public async Task<ApiResponse<OrderDto>> MarkPaid(Guid id, CancellationToken ct) => Ok(await service.MarkPaidAsync(id, ct));

    [HttpPost("{id:guid}/notes"), HasPermission(Permissions.OrderUpdate)]
    public async Task<ApiResponse<OrderDto>> AddNote(Guid id, OrderNoteRequest request, CancellationToken ct) => Ok(await service.AddNoteAsync(id, request, ct));
}

[Route("api/admin/customers")]
public class AdminCustomersController(CustomerAdminService service) : ApiControllerBase
{
    [HttpGet, HasPermission(Permissions.CustomerView)]
    public async Task<ApiResponse<IReadOnlyList<CustomerListItemDto>>> List([FromQuery] CustomerQuery query, CancellationToken ct) => Paged(await service.ListAsync(query, ct));

    [HttpGet("{id:guid}"), HasPermission(Permissions.CustomerView)]
    public async Task<ApiResponse<CustomerDetailDto>> Get(Guid id, CancellationToken ct) => Ok(await service.GetAsync(id, ct));

    [HttpPut("{id:guid}/active"), HasPermission(Permissions.CustomerUpdate)]
    public async Task<ApiResponse<object>> SetActive(Guid id, SetCustomerActiveRequest request, CancellationToken ct)
    {
        await service.SetActiveAsync(id, request.IsActive, ct);
        return Done();
    }
}

[Route("api/admin/coupons")]
public class AdminCouponsController(CouponService service) : ApiControllerBase
{
    [HttpGet, HasPermission(Permissions.CouponManage)]
    public async Task<ApiResponse<IReadOnlyList<CouponDto>>> List([FromQuery] CouponQuery query, CancellationToken ct) => Paged(await service.ListAsync(query, ct));

    [HttpGet("{id:guid}"), HasPermission(Permissions.CouponManage)]
    public async Task<ApiResponse<CouponDto>> Get(Guid id, CancellationToken ct) => Ok(await service.GetAsync(id, ct));

    [HttpPost, HasPermission(Permissions.CouponManage)]
    public async Task<ApiResponse<CouponDto>> Create(SaveCouponRequest request, CancellationToken ct) => Ok(await service.CreateAsync(request, ct));

    [HttpPut("{id:guid}"), HasPermission(Permissions.CouponManage)]
    public async Task<ApiResponse<CouponDto>> Update(Guid id, SaveCouponRequest request, CancellationToken ct) => Ok(await service.UpdateAsync(id, request, ct));

    [HttpDelete("{id:guid}"), HasPermission(Permissions.CouponManage)]
    public async Task<ApiResponse<object>> Delete(Guid id, CancellationToken ct)
    {
        await service.DeleteAsync(id, ct);
        return Done();
    }
}

[Route("api/admin/shipping-rates")]
public class AdminShippingRatesController(ShippingRateService service) : ApiControllerBase
{
    [HttpGet, HasPermission(Permissions.StoreConfigUpdate)]
    public async Task<ApiResponse<IReadOnlyList<ShippingRateDto>>> List(CancellationToken ct) => Ok(await service.ListAsync(ct));

    [HttpPost, HasPermission(Permissions.StoreConfigUpdate)]
    public async Task<ApiResponse<ShippingRateDto>> Create(SaveShippingRateRequest request, CancellationToken ct) => Ok(await service.CreateAsync(request, ct));

    [HttpPut("{id:guid}"), HasPermission(Permissions.StoreConfigUpdate)]
    public async Task<ApiResponse<ShippingRateDto>> Update(Guid id, SaveShippingRateRequest request, CancellationToken ct) => Ok(await service.UpdateAsync(id, request, ct));

    [HttpDelete("{id:guid}"), HasPermission(Permissions.StoreConfigUpdate)]
    public async Task<ApiResponse<object>> Delete(Guid id, CancellationToken ct)
    {
        await service.DeleteAsync(id, ct);
        return Done();
    }
}

[Route("api/admin/dashboard")]
public class AdminDashboardController(Ccp.Application.Dashboard.DashboardService service) : ApiControllerBase
{
    /// <summary>Số liệu tổng quan trong N ngày gần nhất (1–366) tính theo múi giờ cửa hàng, kèm kỳ liền trước để so sánh.</summary>
    [HttpGet, HasPermission(Permissions.DashboardView)]
    public async Task<ApiResponse<Ccp.Application.Dashboard.DashboardDto>> Get([FromQuery] int days = 30, CancellationToken ct = default) => Ok(await service.GetAsync(days, ct));
}

[Route("api/public/products/{slug}")]
public class PublicReviewsController(Ccp.Application.Reviews.ReviewService service) : ApiControllerBase
{
    [HttpGet("reviews"), AllowAnonymous]
    public async Task<ApiResponse<IReadOnlyList<Ccp.Application.Reviews.PublicReviewDto>>> List(string slug, [FromQuery] PageRequest query, CancellationToken ct) => Paged(await service.ListAsync(slug, query, ct));

    [HttpGet("rating"), AllowAnonymous]
    public async Task<ApiResponse<Ccp.Application.Reviews.RatingSummaryDto>> Rating(string slug, CancellationToken ct) => Ok(await service.SummaryAsync(slug, ct));
}

[Route("api/account/reviews"), Authorize]
public class AccountReviewsController(Ccp.Application.Reviews.ReviewService service) : ApiControllerBase
{
    [HttpGet]
    public async Task<ApiResponse<IReadOnlyList<Ccp.Application.Reviews.MyReviewDto>>> Mine(CancellationToken ct) => Ok(await service.MineAsync(ct));

    /// <summary>Khách có được đánh giá sản phẩm này không (đã nhận hàng, chưa đánh giá).</summary>
    [HttpGet("eligibility/{productId:guid}")]
    public async Task<ApiResponse<Ccp.Application.Reviews.ReviewEligibilityDto>> Eligibility(Guid productId, CancellationToken ct) => Ok(await service.EligibilityAsync(productId, ct));

    [HttpPost, EnableRateLimiting(RateLimitPolicies.Checkout)]
    public async Task<ApiResponse<Ccp.Application.Reviews.MyReviewDto>> Create(Ccp.Application.Reviews.CreateReviewRequest request, CancellationToken ct) => Ok(await service.CreateAsync(request, ct));
}

[Route("api/admin/reviews")]
public class AdminReviewsController(Ccp.Application.Reviews.ReviewService service) : ApiControllerBase
{
    [HttpGet, HasPermission(Permissions.ReviewModerate)]
    public async Task<ApiResponse<IReadOnlyList<Ccp.Application.Reviews.AdminReviewDto>>> List([FromQuery] Ccp.Application.Reviews.ReviewQuery query, CancellationToken ct) => Paged(await service.AdminListAsync(query, ct));

    [HttpPut("{id:guid}/status"), HasPermission(Permissions.ReviewModerate)]
    public async Task<ApiResponse<object>> SetStatus(Guid id, Ccp.Application.Reviews.SetReviewStatusRequest request, CancellationToken ct)
    {
        await service.SetStatusAsync(id, request.Status, ct);
        return Done();
    }

    [HttpDelete("{id:guid}"), HasPermission(Permissions.ReviewModerate)]
    public async Task<ApiResponse<object>> Delete(Guid id, CancellationToken ct)
    {
        await service.DeleteAsync(id, ct);
        return Done();
    }
}
