using Ccp.Application.Common;
using Ccp.Domain.Enums;
using FluentValidation;

namespace Ccp.Application.Sales;

// ---------- địa chỉ ----------
public sealed record AddressUnitDto(string Code, string Name);

// ---------- giỏ hàng ----------
/// <summary>Chủ giỏ hàng: người dùng đã đăng nhập hoặc phiên khách (token trong cookie).</summary>
public sealed record CartOwner(Guid? UserId, string? SessionToken)
{
    public bool IsEmpty => UserId is null && string.IsNullOrEmpty(SessionToken);
}

public sealed record CartLineDto(Guid Id, Guid VariantId, Guid ProductId, string ProductName, string ProductSlug, string Sku, string? VariantLabel, MediaRefDto? Image,
    decimal UnitPrice, decimal? CompareAtPrice, int Quantity, int MaxQuantity, decimal LineTotal, string? Issue);

/// <summary>Issue: unavailable (ngừng bán), out_of_stock (hết hàng), insufficient_stock (không đủ số lượng).</summary>
public sealed record CartDto(IReadOnlyList<CartLineDto> Items, int ItemCount, decimal Subtotal, string? CouponCode, decimal Discount, bool FreeShippingCoupon,
    decimal ShippingFee, decimal Total, string? CouponError, string? CouponErrorCode, bool HasIssues);

public sealed record AddCartItemRequest(Guid VariantId, int Quantity);
public sealed record UpdateCartItemRequest(int Quantity);
public sealed record ApplyCouponRequest(string Code);
public sealed record ShippingQuoteRequest(string? ProvinceCode);
public sealed record ShippingQuoteDto(decimal Fee, string? RateName, decimal? FreeShipThreshold, decimal? AmountToFreeShip);

public sealed class AddCartItemRequestValidator : AbstractValidator<AddCartItemRequest>
{
    public AddCartItemRequestValidator()
    {
        RuleFor(x => x.VariantId).NotEmpty();
        RuleFor(x => x.Quantity).InclusiveBetween(1, CartService.MaxLineQuantity).WithMessage($"Số lượng từ 1 đến {CartService.MaxLineQuantity}.");
    }
}

public sealed class UpdateCartItemRequestValidator : AbstractValidator<UpdateCartItemRequest>
{
    public UpdateCartItemRequestValidator() => RuleFor(x => x.Quantity).InclusiveBetween(1, CartService.MaxLineQuantity).WithMessage($"Số lượng từ 1 đến {CartService.MaxLineQuantity}.");
}

public sealed class ApplyCouponRequestValidator : AbstractValidator<ApplyCouponRequest>
{
    public ApplyCouponRequestValidator() => RuleFor(x => x.Code).NotEmpty().MaximumLength(50);
}

// ---------- đặt hàng ----------
public sealed record CheckoutRequest(string CustomerName, string Phone, string? Email, string AddressLine, string ProvinceCode, string WardCode, string? Note, PaymentMethod PaymentMethod);

public sealed class CheckoutRequestValidator : AbstractValidator<CheckoutRequest>
{
    public CheckoutRequestValidator()
    {
        RuleFor(x => x.CustomerName).NotEmpty().MaximumLength(200).WithMessage("Nhập họ tên (tối đa 200 ký tự).");
        RuleFor(x => x.Phone).NotEmpty().Must(PhoneRules.IsValid).WithMessage("Số điện thoại không hợp lệ.");
        RuleFor(x => x.Email).EmailAddress().MaximumLength(255).When(x => !string.IsNullOrWhiteSpace(x.Email)).WithMessage("Email không hợp lệ.");
        RuleFor(x => x.AddressLine).NotEmpty().MaximumLength(300).WithMessage("Nhập địa chỉ giao hàng (tối đa 300 ký tự).");
        RuleFor(x => x.ProvinceCode).NotEmpty().MaximumLength(20).WithMessage("Chọn tỉnh/thành phố.");
        RuleFor(x => x.WardCode).NotEmpty().MaximumLength(20).WithMessage("Chọn phường/xã.");
        RuleFor(x => x.Note).MaximumLength(1000);
        RuleFor(x => x.PaymentMethod).IsInEnum();
    }
}

public static class PhoneRules
{
    /// <summary>Số điện thoại Việt Nam: 0xxxxxxxxx (10 số) hoặc +84xxxxxxxxx; cho phép khoảng trắng, dấu chấm, gạch.</summary>
    public static bool IsValid(string? phone) => Normalize(phone) is not null;

    /// <summary>Chuẩn hoá về dạng 0xxxxxxxxx; trả về null nếu không hợp lệ.</summary>
    public static string? Normalize(string? phone)
    {
        if (string.IsNullOrWhiteSpace(phone)) return null;
        var digits = new string(phone.Where(c => char.IsDigit(c) || c == '+').ToArray());
        if (digits.StartsWith("+84")) digits = "0" + digits[3..];
        else if (digits.StartsWith("84") && digits.Length == 11) digits = "0" + digits[2..];
        if (digits.Contains('+')) return null;
        return digits.Length == 10 && digits[0] == '0' && digits[1] is >= '3' and <= '9' ? digits : null;
    }
}

public sealed record OrderItemDto(Guid Id, string ProductName, string? VariantName, string Sku, decimal UnitPrice, int Quantity, decimal LineTotal, string? ImageUrl, Guid? ProductId, string? ProductSlug);
public sealed record OrderHistoryDto(OrderStatus? From, OrderStatus To, string? Note, DateTime At);
public sealed record OrderPaymentDto(PaymentMethod Method, string Provider, decimal Amount, PaymentStatus Status, DateTime? PaidAt);

public sealed record BankTransferInfoDto(string? Bank, string? AccountNumber, string? AccountName, string TransferContent);

public sealed record OrderDto(Guid Id, string OrderNumber, OrderStatus Status, PaymentStatus PaymentStatus, DateTime PlacedAt, string CustomerName, string Phone, string? Email,
    string ShippingAddress, string? WardName, string? ProvinceName, string? Note, decimal Subtotal, decimal DiscountTotal, decimal ShippingFee, decimal GrandTotal, string? CouponCode,
    IReadOnlyList<OrderItemDto> Items, IReadOnlyList<OrderHistoryDto> History, IReadOnlyList<OrderPaymentDto> Payments, BankTransferInfoDto? BankTransfer,
    IReadOnlyList<OrderStatus> NextStatuses, bool CanCancel);

public sealed record OrderListItemDto(Guid Id, string OrderNumber, OrderStatus Status, PaymentStatus PaymentStatus, DateTime PlacedAt, decimal GrandTotal, int ItemCount, string? FirstItemName, string? FirstItemImage);

public sealed record TrackOrderRequest(string OrderNumber, string Phone);

public sealed class TrackOrderRequestValidator : AbstractValidator<TrackOrderRequest>
{
    public TrackOrderRequestValidator()
    {
        RuleFor(x => x.OrderNumber).NotEmpty().MaximumLength(30);
        RuleFor(x => x.Phone).NotEmpty().MaximumLength(30);
    }
}
