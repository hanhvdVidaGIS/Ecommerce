using Ccp.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Ccp.Infrastructure.Persistence.Configurations;

internal class CategoryConfig : IEntityTypeConfiguration<Category>
{
    public void Configure(EntityTypeBuilder<Category> b)
    {
        b.Property(x => x.Name).HasMaxLength(200).IsRequired();
        b.Property(x => x.Slug).HasMaxLength(200).IsRequired();
        b.Property(x => x.Description).HasMaxLength(2000);
        b.OwnsOne(x => x.Seo);
        b.HasOne(x => x.Parent).WithMany(x => x.Children).HasForeignKey(x => x.ParentId).OnDelete(DeleteBehavior.Restrict);
        b.HasOne(x => x.IconMedia).WithMany().HasForeignKey(x => x.IconMediaId).OnDelete(DeleteBehavior.SetNull);
        b.HasOne(x => x.BannerMedia).WithMany().HasForeignKey(x => x.BannerMediaId).OnDelete(DeleteBehavior.SetNull);
        b.UniqueAmongActive(x => x.Slug);
        b.HasIndex(x => new { x.ParentId, x.SortOrder });
    }
}

internal class BrandConfig : IEntityTypeConfiguration<Brand>
{
    public void Configure(EntityTypeBuilder<Brand> b)
    {
        b.Property(x => x.Name).HasMaxLength(200).IsRequired();
        b.Property(x => x.Slug).HasMaxLength(200).IsRequired();
        b.Property(x => x.Description).HasMaxLength(2000);
        b.HasOne(x => x.LogoMedia).WithMany().HasForeignKey(x => x.LogoMediaId).OnDelete(DeleteBehavior.SetNull);
        b.UniqueAmongActive(x => x.Slug);
    }
}

internal class ProductConfig : IEntityTypeConfiguration<Product>
{
    public void Configure(EntityTypeBuilder<Product> b)
    {
        b.Property(x => x.Name).HasMaxLength(250).IsRequired();
        b.Property(x => x.Slug).HasMaxLength(250).IsRequired();
        b.Property(x => x.ShortDescription).HasMaxLength(1000);
        b.Property(x => x.VideoUrl).HasMaxLength(500);
        b.Property(x => x.Status).HasConversion<string>().HasMaxLength(20);
        b.Property(x => x.RowVersion).IsRowVersion();
        b.OwnsOne(x => x.Seo);
        b.HasOne(x => x.PrimaryCategory).WithMany().HasForeignKey(x => x.PrimaryCategoryId).OnDelete(DeleteBehavior.SetNull);
        b.HasOne(x => x.Brand).WithMany().HasForeignKey(x => x.BrandId).OnDelete(DeleteBehavior.SetNull);
        b.UniqueAmongActive(x => x.Slug);
        b.HasIndex(x => new { x.Status, x.PrimaryCategoryId });
        b.HasIndex(x => x.MinPrice);
        b.HasIndex(x => x.BrandId);
    }
}

internal class ProductCategoryConfig : IEntityTypeConfiguration<ProductCategory>
{
    public void Configure(EntityTypeBuilder<ProductCategory> b)
    {
        b.HasKey(x => new { x.ProductId, x.CategoryId });
        b.HasOne(x => x.Product).WithMany(p => p.Categories).HasForeignKey(x => x.ProductId).OnDelete(DeleteBehavior.Cascade);
        b.HasOne(x => x.Category).WithMany().HasForeignKey(x => x.CategoryId).OnDelete(DeleteBehavior.Cascade);
        b.HasIndex(x => x.CategoryId);
    }
}

internal class ProductImageConfig : IEntityTypeConfiguration<ProductImage>
{
    public void Configure(EntityTypeBuilder<ProductImage> b)
    {
        b.HasOne(x => x.Product).WithMany(p => p.Images).HasForeignKey(x => x.ProductId).OnDelete(DeleteBehavior.Cascade);
        b.HasOne(x => x.Media).WithMany().HasForeignKey(x => x.MediaId).OnDelete(DeleteBehavior.Restrict);
        b.HasIndex(x => new { x.ProductId, x.SortOrder });
    }
}

internal class ProductVariantConfig : IEntityTypeConfiguration<ProductVariant>
{
    public void Configure(EntityTypeBuilder<ProductVariant> b)
    {
        b.Property(x => x.Sku).HasMaxLength(100).IsRequired();
        b.Property(x => x.Barcode).HasMaxLength(100);
        b.Property(x => x.OptionHash).HasMaxLength(64).IsRequired();
        b.Property(x => x.RowVersion).IsRowVersion();
        b.Ignore(x => x.EffectivePrice);
        b.HasOne(x => x.Product).WithMany(p => p.Variants).HasForeignKey(x => x.ProductId).OnDelete(DeleteBehavior.Cascade);
        b.HasOne(x => x.ImageMedia).WithMany().HasForeignKey(x => x.ImageMediaId).OnDelete(DeleteBehavior.SetNull);
        b.UniqueAmongActive(x => x.Sku);
        b.UniqueAmongActive(x => new { x.ProductId, x.OptionHash });
        b.HasIndex(x => x.Barcode);
    }
}

internal class ProductAttributeConfig : IEntityTypeConfiguration<ProductAttribute>
{
    public void Configure(EntityTypeBuilder<ProductAttribute> b)
    {
        b.Property(x => x.Code).HasMaxLength(50).IsRequired();
        b.Property(x => x.Name).HasMaxLength(100).IsRequired();
        b.Property(x => x.Unit).HasMaxLength(20);
        b.Property(x => x.DataType).HasConversion<string>().HasMaxLength(20);
        b.UniqueAmongActive(x => x.Code);
    }
}

internal class CategoryAttributeConfig : IEntityTypeConfiguration<CategoryAttribute>
{
    public void Configure(EntityTypeBuilder<CategoryAttribute> b)
    {
        b.HasKey(x => new { x.CategoryId, x.AttributeId });
        b.HasOne(x => x.Category).WithMany().HasForeignKey(x => x.CategoryId).OnDelete(DeleteBehavior.Cascade);
        b.HasOne(x => x.Attribute).WithMany().HasForeignKey(x => x.AttributeId).OnDelete(DeleteBehavior.Cascade);
    }
}

internal class ProductAttributeValueConfig : IEntityTypeConfiguration<ProductAttributeValue>
{
    public void Configure(EntityTypeBuilder<ProductAttributeValue> b)
    {
        b.Property(x => x.Code).HasMaxLength(100).IsRequired();
        b.Property(x => x.Label).HasMaxLength(200).IsRequired();
        b.Property(x => x.ColorHex).HasMaxLength(9);
        b.HasOne(x => x.Attribute).WithMany(a => a.Values).HasForeignKey(x => x.AttributeId).OnDelete(DeleteBehavior.Cascade);
        b.UniqueAmongActive(x => new { x.AttributeId, x.Code });
    }
}

internal class ProductAttributeAssignmentConfig : IEntityTypeConfiguration<ProductAttributeAssignment>
{
    public void Configure(EntityTypeBuilder<ProductAttributeAssignment> b)
    {
        b.Property(x => x.TextValue).HasMaxLength(1000);
        b.HasOne(x => x.Product).WithMany(p => p.AttributeAssignments).HasForeignKey(x => x.ProductId).OnDelete(DeleteBehavior.Cascade);
        b.HasOne(x => x.Attribute).WithMany().HasForeignKey(x => x.AttributeId).OnDelete(DeleteBehavior.Cascade);
        b.HasOne(x => x.Value).WithMany().HasForeignKey(x => x.ValueId).OnDelete(DeleteBehavior.Cascade);
        b.HasIndex(x => new { x.AttributeId, x.ValueId });
        b.HasIndex(x => x.ProductId);
    }
}

internal class VariantOptionValueConfig : IEntityTypeConfiguration<VariantOptionValue>
{
    public void Configure(EntityTypeBuilder<VariantOptionValue> b)
    {
        b.HasKey(x => new { x.VariantId, x.AttributeId });
        b.HasOne(x => x.Variant).WithMany(v => v.OptionValues).HasForeignKey(x => x.VariantId).OnDelete(DeleteBehavior.Cascade);
        b.HasOne(x => x.Attribute).WithMany().HasForeignKey(x => x.AttributeId).OnDelete(DeleteBehavior.Restrict);
        b.HasOne(x => x.Value).WithMany().HasForeignKey(x => x.ValueId).OnDelete(DeleteBehavior.Restrict);
    }
}
