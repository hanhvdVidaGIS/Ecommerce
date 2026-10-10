using Ccp.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace Ccp.Application.Abstractions;

/// <summary>
/// Cổng truy cập dữ liệu của tầng Application. Các service dùng DbSet trực tiếp thay vì repository chung
/// cho từng thực thể; cách triển khai (Npgsql, migration) nằm ở Infrastructure.
/// </summary>
public interface IAppDbContext
{
    DbSet<WebsiteSetting> WebsiteSettings { get; }
    DbSet<BusinessType> BusinessTypes { get; }
    DbSet<Menu> Menus { get; }
    DbSet<MenuItem> MenuItems { get; }

    DbSet<Banner> Banners { get; }
    DbSet<HomepageSection> HomepageSections { get; }
    DbSet<Page> Pages { get; }
    DbSet<Post> Posts { get; }
    DbSet<Media> Media { get; }
    DbSet<NewsletterSubscriber> NewsletterSubscribers { get; }

    DbSet<User> Users { get; }
    DbSet<Role> Roles { get; }
    DbSet<Permission> Permissions { get; }
    DbSet<UserRole> UserRoles { get; }
    DbSet<RolePermission> RolePermissions { get; }
    DbSet<RefreshToken> RefreshTokens { get; }
    DbSet<AuditLog> AuditLogs { get; }

    DbSet<Category> Categories { get; }
    DbSet<Brand> Brands { get; }
    DbSet<Product> Products { get; }
    DbSet<ProductCategory> ProductCategories { get; }
    DbSet<ProductImage> ProductImages { get; }
    DbSet<ProductVariant> ProductVariants { get; }

    DbSet<ProductAttribute> ProductAttributes { get; }
    DbSet<CategoryAttribute> CategoryAttributes { get; }
    DbSet<ProductAttributeValue> ProductAttributeValues { get; }
    DbSet<ProductAttributeAssignment> ProductAttributeAssignments { get; }
    DbSet<VariantOptionValue> VariantOptionValues { get; }

    DbSet<Cart> Carts { get; }
    DbSet<CartItem> CartItems { get; }
    DbSet<Coupon> Coupons { get; }
    DbSet<Order> Orders { get; }
    DbSet<OrderItem> OrderItems { get; }
    DbSet<OrderStatusHistory> OrderStatusHistories { get; }
    DbSet<Payment> Payments { get; }
    DbSet<ShippingRate> ShippingRates { get; }
    DbSet<FlashSale> FlashSales { get; }
    DbSet<FlashSaleItem> FlashSaleItems { get; }

    DbSet<Wishlist> Wishlists { get; }
    DbSet<Review> Reviews { get; }
    DbSet<CustomerAddress> CustomerAddresses { get; }
    DbSet<AddressUnit> AddressUnits { get; }

    /// <summary>Dùng cho giao dịch nhiều bước (ví dụ lưu sản phẩm cùng biến thể).</summary>
    Microsoft.EntityFrameworkCore.Infrastructure.DatabaseFacade Database { get; }

    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
}
