using Ccp.Domain.Common;
using Ccp.Domain.Enums;

namespace Ccp.Domain.Entities;

public class Cart : AuditableEntity
{
    public Guid? UserId { get; set; }
    public string? SessionToken { get; set; }
    public string? CouponCode { get; set; }
    public DateTime? ExpiresAt { get; set; }
    public List<CartItem> Items { get; set; } = [];
}

public class CartItem : Entity
{
    public Guid CartId { get; set; }
    public Cart? Cart { get; set; }
    public Guid VariantId { get; set; }
    public ProductVariant? Variant { get; set; }
    public int Quantity { get; set; }
}

public class Coupon : SoftDeletableEntity
{
    public string Code { get; set; } = "";
    public CouponType Type { get; set; }
    public decimal Value { get; set; }
    public decimal? MinOrderAmount { get; set; }
    public decimal? MaxDiscount { get; set; }
    public int? UsageLimit { get; set; }
    public int UsedCount { get; set; }
    public int? PerUserLimit { get; set; }
    public DateTime? StartAt { get; set; }
    public DateTime? EndAt { get; set; }
    public bool IsActive { get; set; } = true;
}

public class Order : AuditableEntity
{
    public string OrderNumber { get; set; } = "";
    public Guid? UserId { get; set; }
    public User? User { get; set; }
    public string CustomerName { get; set; } = "";
    public string Phone { get; set; } = "";
    public string? Email { get; set; }
    public string ShippingAddress { get; set; } = "";
    public string? ProvinceCode { get; set; }
    public string? WardCode { get; set; }
    /// <summary>Tên đơn vị hành chính tại thời điểm đặt (ảnh chụp, không đổi khi danh mục hành chính thay đổi).</summary>
    public string? ProvinceName { get; set; }
    public string? WardName { get; set; }
    public string? Note { get; set; }
    public decimal Subtotal { get; set; }
    public decimal DiscountTotal { get; set; }
    public decimal ShippingFee { get; set; }
    public decimal GrandTotal { get; set; }
    public string? CouponCode { get; set; }
    public OrderStatus Status { get; set; } = OrderStatus.Pending;
    public PaymentStatus PaymentStatus { get; set; } = PaymentStatus.Unpaid;
    public DateTime PlacedAt { get; set; }
    public uint RowVersion { get; set; }
    public List<OrderItem> Items { get; set; } = [];
    public List<OrderStatusHistory> History { get; set; } = [];
    public List<Payment> Payments { get; set; } = [];
}

public class OrderItem : Entity
{
    public Guid OrderId { get; set; }
    public Order? Order { get; set; }
    public Guid? VariantId { get; set; }
    public string ProductName { get; set; } = "";
    public string? VariantName { get; set; }
    public string Sku { get; set; } = "";
    public decimal UnitPrice { get; set; }
    public int Quantity { get; set; }
    public decimal LineTotal { get; set; }
    public string? ImageUrl { get; set; }
}

public class OrderStatusHistory : Entity
{
    public Guid OrderId { get; set; }
    public Order? Order { get; set; }
    public OrderStatus? FromStatus { get; set; }
    public OrderStatus ToStatus { get; set; }
    public string? Note { get; set; }
    public Guid? ChangedBy { get; set; }
    public DateTime ChangedAt { get; set; }
}

public class Payment : AuditableEntity
{
    public Guid OrderId { get; set; }
    public Order? Order { get; set; }
    public PaymentMethod Method { get; set; }
    public string Provider { get; set; } = "";
    public decimal Amount { get; set; }
    public PaymentStatus Status { get; set; } = PaymentStatus.Unpaid;
    public string? TransactionRef { get; set; }
    /// <summary>jsonb</summary>
    public string? RawPayload { get; set; }
    public DateTime? PaidAt { get; set; }
}

public class ShippingRate : SoftDeletableEntity
{
    public string Name { get; set; } = "";
    /// <summary>Rỗng: mức mặc định cho mọi tỉnh.</summary>
    public string? ProvinceCode { get; set; }
    public decimal? MinOrderAmount { get; set; }
    public decimal Fee { get; set; }
    public decimal? FreeShipThreshold { get; set; }
    public bool IsActive { get; set; } = true;
    public int SortOrder { get; set; }
}

public class FlashSale : SoftDeletableEntity
{
    public string Name { get; set; } = "";
    public DateTime StartAt { get; set; }
    public DateTime EndAt { get; set; }
    public bool IsActive { get; set; } = true;
    public List<FlashSaleItem> Items { get; set; } = [];
}

public class FlashSaleItem : Entity
{
    public Guid FlashSaleId { get; set; }
    public FlashSale? FlashSale { get; set; }
    public Guid VariantId { get; set; }
    public ProductVariant? Variant { get; set; }
    public decimal SalePrice { get; set; }
    public int QuantityLimit { get; set; }
    public int SoldCount { get; set; }
}
