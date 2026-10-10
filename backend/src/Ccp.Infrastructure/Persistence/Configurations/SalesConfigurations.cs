using Ccp.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Ccp.Infrastructure.Persistence.Configurations;

internal class CartConfig : IEntityTypeConfiguration<Cart>
{
    public void Configure(EntityTypeBuilder<Cart> b)
    {
        b.Property(x => x.SessionToken).HasMaxLength(100);
        b.Property(x => x.CouponCode).HasMaxLength(50);
        b.HasIndex(x => x.UserId);
        b.HasIndex(x => x.SessionToken);
    }
}

internal class CartItemConfig : IEntityTypeConfiguration<CartItem>
{
    public void Configure(EntityTypeBuilder<CartItem> b)
    {
        b.HasOne(x => x.Cart).WithMany(c => c.Items).HasForeignKey(x => x.CartId).OnDelete(DeleteBehavior.Cascade);
        b.HasOne(x => x.Variant).WithMany().HasForeignKey(x => x.VariantId).OnDelete(DeleteBehavior.Cascade);
        b.HasIndex(x => new { x.CartId, x.VariantId }).IsUnique();
    }
}

internal class CouponConfig : IEntityTypeConfiguration<Coupon>
{
    public void Configure(EntityTypeBuilder<Coupon> b)
    {
        b.Property(x => x.Code).HasMaxLength(50).IsRequired();
        b.Property(x => x.Type).HasConversion<string>().HasMaxLength(20);
        b.UniqueAmongActive(x => x.Code);
    }
}

internal class OrderConfig : IEntityTypeConfiguration<Order>
{
    public void Configure(EntityTypeBuilder<Order> b)
    {
        b.Property(x => x.OrderNumber).HasMaxLength(30).IsRequired();
        b.Property(x => x.CustomerName).HasMaxLength(200).IsRequired();
        b.Property(x => x.Phone).HasMaxLength(30).IsRequired();
        b.Property(x => x.Email).HasMaxLength(255);
        b.Property(x => x.ShippingAddress).HasMaxLength(500).IsRequired();
        b.Property(x => x.ProvinceCode).HasMaxLength(20);
        b.Property(x => x.WardCode).HasMaxLength(20);
        b.Property(x => x.ProvinceName).HasMaxLength(200);
        b.Property(x => x.WardName).HasMaxLength(200);
        b.Property(x => x.Note).HasMaxLength(1000);
        b.Property(x => x.CouponCode).HasMaxLength(50);
        b.Property(x => x.Status).HasConversion<string>().HasMaxLength(20);
        b.Property(x => x.PaymentStatus).HasConversion<string>().HasMaxLength(20);
        b.Property(x => x.RowVersion).IsRowVersion();
        b.HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.SetNull);
        b.HasIndex(x => x.OrderNumber).IsUnique();
        b.HasIndex(x => new { x.Status, x.PlacedAt });
        b.HasIndex(x => new { x.UserId, x.PlacedAt });
    }
}

internal class OrderItemConfig : IEntityTypeConfiguration<OrderItem>
{
    public void Configure(EntityTypeBuilder<OrderItem> b)
    {
        b.Property(x => x.ProductName).HasMaxLength(250).IsRequired();
        b.Property(x => x.VariantName).HasMaxLength(250);
        b.Property(x => x.Sku).HasMaxLength(100).IsRequired();
        b.Property(x => x.ImageUrl).HasMaxLength(500);
        b.HasOne(x => x.Order).WithMany(o => o.Items).HasForeignKey(x => x.OrderId).OnDelete(DeleteBehavior.Cascade);
        // Không ràng buộc khoá ngoại tới biến thể: đơn hàng giữ ảnh chụp, biến thể có thể bị xoá về sau.
        b.HasIndex(x => x.OrderId);
        b.HasIndex(x => x.VariantId);
    }
}

internal class OrderStatusHistoryConfig : IEntityTypeConfiguration<OrderStatusHistory>
{
    public void Configure(EntityTypeBuilder<OrderStatusHistory> b)
    {
        b.Property(x => x.FromStatus).HasConversion<string>().HasMaxLength(20);
        b.Property(x => x.ToStatus).HasConversion<string>().HasMaxLength(20);
        b.Property(x => x.Note).HasMaxLength(500);
        b.HasOne(x => x.Order).WithMany(o => o.History).HasForeignKey(x => x.OrderId).OnDelete(DeleteBehavior.Cascade);
        b.HasIndex(x => new { x.OrderId, x.ChangedAt });
    }
}

internal class PaymentConfig : IEntityTypeConfiguration<Payment>
{
    public void Configure(EntityTypeBuilder<Payment> b)
    {
        b.Property(x => x.Method).HasConversion<string>().HasMaxLength(20);
        b.Property(x => x.Status).HasConversion<string>().HasMaxLength(20);
        b.Property(x => x.Provider).HasMaxLength(50).IsRequired();
        b.Property(x => x.TransactionRef).HasMaxLength(100);
        b.Property(x => x.RawPayload).HasColumnType("jsonb");
        b.HasOne(x => x.Order).WithMany(o => o.Payments).HasForeignKey(x => x.OrderId).OnDelete(DeleteBehavior.Cascade);
        b.HasIndex(x => new { x.Provider, x.TransactionRef }).IsUnique().HasFilter("transaction_ref IS NOT NULL");
    }
}

internal class ShippingRateConfig : IEntityTypeConfiguration<ShippingRate>
{
    public void Configure(EntityTypeBuilder<ShippingRate> b)
    {
        b.Property(x => x.Name).HasMaxLength(200).IsRequired();
        b.Property(x => x.ProvinceCode).HasMaxLength(20);
    }
}

internal class FlashSaleConfig : IEntityTypeConfiguration<FlashSale>
{
    public void Configure(EntityTypeBuilder<FlashSale> b)
    {
        b.Property(x => x.Name).HasMaxLength(200).IsRequired();
        b.HasIndex(x => new { x.StartAt, x.EndAt });
    }
}

internal class FlashSaleItemConfig : IEntityTypeConfiguration<FlashSaleItem>
{
    public void Configure(EntityTypeBuilder<FlashSaleItem> b)
    {
        b.HasOne(x => x.FlashSale).WithMany(f => f.Items).HasForeignKey(x => x.FlashSaleId).OnDelete(DeleteBehavior.Cascade);
        b.HasOne(x => x.Variant).WithMany().HasForeignKey(x => x.VariantId).OnDelete(DeleteBehavior.Cascade);
        b.HasIndex(x => new { x.FlashSaleId, x.VariantId }).IsUnique();
    }
}

internal class WishlistConfig : IEntityTypeConfiguration<Wishlist>
{
    public void Configure(EntityTypeBuilder<Wishlist> b)
    {
        b.HasKey(x => new { x.UserId, x.ProductId });
        b.HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        b.HasOne(x => x.Product).WithMany().HasForeignKey(x => x.ProductId).OnDelete(DeleteBehavior.Cascade);
    }
}

internal class ReviewConfig : IEntityTypeConfiguration<Review>
{
    public void Configure(EntityTypeBuilder<Review> b)
    {
        b.Property(x => x.Title).HasMaxLength(200);
        b.Property(x => x.Content).HasMaxLength(4000);
        b.Property(x => x.Status).HasConversion<string>().HasMaxLength(20);
        b.ToTable(t => t.HasCheckConstraint("ck_review_rating", "rating BETWEEN 1 AND 5"));
        b.HasOne(x => x.Product).WithMany().HasForeignKey(x => x.ProductId).OnDelete(DeleteBehavior.Cascade);
        b.HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        b.HasIndex(x => new { x.ProductId, x.Status });
        // Mỗi khách một đánh giá cho mỗi sản phẩm (xoá mềm thì được đánh giá lại)
        b.HasIndex(x => new { x.UserId, x.ProductId }).IsUnique().HasFilter("is_deleted = false");
    }
}

internal class CustomerAddressConfig : IEntityTypeConfiguration<CustomerAddress>
{
    public void Configure(EntityTypeBuilder<CustomerAddress> b)
    {
        b.Property(x => x.ReceiverName).HasMaxLength(200).IsRequired();
        b.Property(x => x.Phone).HasMaxLength(30).IsRequired();
        b.Property(x => x.AddressLine).HasMaxLength(500).IsRequired();
        b.Property(x => x.ProvinceCode).HasMaxLength(20);
        b.Property(x => x.WardCode).HasMaxLength(20);
        b.HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        b.HasIndex(x => x.UserId).IsUnique().HasFilter("is_default = true");
    }
}

internal class AddressUnitConfig : IEntityTypeConfiguration<AddressUnit>
{
    public void Configure(EntityTypeBuilder<AddressUnit> b)
    {
        b.Property(x => x.Code).HasMaxLength(20).IsRequired();
        b.Property(x => x.Name).HasMaxLength(200).IsRequired();
        b.Property(x => x.Level).HasConversion<string>().HasMaxLength(20);
        b.Property(x => x.ParentCode).HasMaxLength(20);
        b.Property(x => x.Source).HasMaxLength(300);
        b.HasIndex(x => x.Code).IsUnique();
        b.HasIndex(x => new { x.Level, x.ParentCode });
    }
}
