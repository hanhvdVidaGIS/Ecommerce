using System.Linq.Expressions;
using Ccp.Application.Abstractions;
using Ccp.Domain.Common;
using Ccp.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace Ccp.Infrastructure.Persistence;

public class CcpDbContext(DbContextOptions<CcpDbContext> options, ICurrentUser currentUser, TimeProvider clock)
    : DbContext(options), IAppDbContext
{
    public DbSet<WebsiteSetting> WebsiteSettings => Set<WebsiteSetting>();
    public DbSet<BusinessType> BusinessTypes => Set<BusinessType>();
    public DbSet<Menu> Menus => Set<Menu>();
    public DbSet<MenuItem> MenuItems => Set<MenuItem>();

    public DbSet<Banner> Banners => Set<Banner>();
    public DbSet<HomepageSection> HomepageSections => Set<HomepageSection>();
    public DbSet<Page> Pages => Set<Page>();
    public DbSet<Post> Posts => Set<Post>();
    public DbSet<Media> Media => Set<Media>();
    public DbSet<NewsletterSubscriber> NewsletterSubscribers => Set<NewsletterSubscriber>();

    public DbSet<User> Users => Set<User>();
    public DbSet<Role> Roles => Set<Role>();
    public DbSet<Permission> Permissions => Set<Permission>();
    public DbSet<UserRole> UserRoles => Set<UserRole>();
    public DbSet<RolePermission> RolePermissions => Set<RolePermission>();
    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();

    public DbSet<Category> Categories => Set<Category>();
    public DbSet<Brand> Brands => Set<Brand>();
    public DbSet<Product> Products => Set<Product>();
    public DbSet<ProductCategory> ProductCategories => Set<ProductCategory>();
    public DbSet<ProductImage> ProductImages => Set<ProductImage>();
    public DbSet<ProductVariant> ProductVariants => Set<ProductVariant>();

    public DbSet<ProductAttribute> ProductAttributes => Set<ProductAttribute>();
    public DbSet<CategoryAttribute> CategoryAttributes => Set<CategoryAttribute>();
    public DbSet<ProductAttributeValue> ProductAttributeValues => Set<ProductAttributeValue>();
    public DbSet<ProductAttributeAssignment> ProductAttributeAssignments => Set<ProductAttributeAssignment>();
    public DbSet<VariantOptionValue> VariantOptionValues => Set<VariantOptionValue>();

    public DbSet<Cart> Carts => Set<Cart>();
    public DbSet<CartItem> CartItems => Set<CartItem>();
    public DbSet<Coupon> Coupons => Set<Coupon>();
    public DbSet<Order> Orders => Set<Order>();
    public DbSet<OrderItem> OrderItems => Set<OrderItem>();
    public DbSet<OrderStatusHistory> OrderStatusHistories => Set<OrderStatusHistory>();
    public DbSet<Payment> Payments => Set<Payment>();
    public DbSet<ShippingRate> ShippingRates => Set<ShippingRate>();
    public DbSet<FlashSale> FlashSales => Set<FlashSale>();
    public DbSet<FlashSaleItem> FlashSaleItems => Set<FlashSaleItem>();

    public DbSet<Wishlist> Wishlists => Set<Wishlist>();
    public DbSet<Review> Reviews => Set<Review>();
    public DbSet<CustomerAddress> CustomerAddresses => Set<CustomerAddress>();
    public DbSet<AddressUnit> AddressUnits => Set<AddressUnit>();

    protected override void ConfigureConventions(ModelConfigurationBuilder builder)
    {
        builder.Properties<decimal>().HavePrecision(18, 2);
        // Npgsql từ chối DateTime Kind=Unspecified với timestamptz; luôn chuẩn hoá về UTC.
        builder.Properties<DateTime>().HaveConversion<UtcDateTimeConverter>();
        builder.Properties<DateTime?>().HaveConversion<NullableUtcDateTimeConverter>();
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(CcpDbContext).Assembly);
        modelBuilder.HasDbFunction(typeof(Ccp.Application.Common.SqlFunctions).GetMethod(nameof(Ccp.Application.Common.SqlFunctions.Unaccent), [typeof(string)])!).HasName("f_unaccent");
        ApplySoftDeleteFilters(modelBuilder);
    }

    private static void ApplySoftDeleteFilters(ModelBuilder modelBuilder)
    {
        foreach (var entityType in modelBuilder.Model.GetEntityTypes().Where(t => typeof(ISoftDelete).IsAssignableFrom(t.ClrType)))
        {
            var parameter = Expression.Parameter(entityType.ClrType, "e");
            var notDeleted = Expression.Equal(Expression.Property(parameter, nameof(ISoftDelete.IsDeleted)), Expression.Constant(false));
            modelBuilder.Entity(entityType.ClrType).HasQueryFilter(Expression.Lambda(notDeleted, parameter));
        }
    }

    public override Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        ApplyAudit();
        return base.SaveChangesAsync(cancellationToken);
    }

    public override int SaveChanges() { ApplyAudit(); return base.SaveChanges(); }

    private void ApplyAudit()
    {
        var now = clock.GetUtcNow().UtcDateTime;
        var userId = currentUser.UserId;
        foreach (var entry in ChangeTracker.Entries().ToList())
        {
            if (entry.Entity is ISoftDelete softDelete && entry.State == EntityState.Deleted)
            {
                // Xoá mềm: chuyển lệnh DELETE thành UPDATE IsDeleted.
                entry.State = EntityState.Modified;
                softDelete.IsDeleted = true;
                softDelete.DeletedAt = now;
                // Kiểu sở hữu (Seo) dùng chung bảng: nếu để trạng thái Deleted, EF sẽ ghi NULL vào các cột của nó.
                foreach (var owned in entry.References.Select(r => r.TargetEntry).Where(t => t != null && t.Metadata.IsOwned()))
                    owned!.State = EntityState.Unchanged;
            }

            if (entry.Entity is not AuditableEntity audit) continue;
            if (entry.State == EntityState.Added)
            {
                audit.CreatedAt = now;
                audit.CreatedBy = userId;
            }
            else if (entry.State == EntityState.Modified)
            {
                audit.UpdatedAt = now;
                audit.UpdatedBy = userId;
            }
        }
    }
}

internal sealed class UtcDateTimeConverter() : ValueConverter<DateTime, DateTime>(
    v => v.Kind == DateTimeKind.Utc ? v : (v.Kind == DateTimeKind.Local ? v.ToUniversalTime() : DateTime.SpecifyKind(v, DateTimeKind.Utc)),
    v => DateTime.SpecifyKind(v, DateTimeKind.Utc));

internal sealed class NullableUtcDateTimeConverter() : ValueConverter<DateTime?, DateTime?>(
    v => v == null ? null : (v.Value.Kind == DateTimeKind.Utc ? v : (v.Value.Kind == DateTimeKind.Local ? v.Value.ToUniversalTime() : DateTime.SpecifyKind(v.Value, DateTimeKind.Utc))),
    v => v == null ? null : DateTime.SpecifyKind(v.Value, DateTimeKind.Utc));
