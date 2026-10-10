using Ccp.Domain.Common;
using Ccp.Domain.Enums;

namespace Ccp.Domain.Entities;

public class Category : SoftDeletableEntity
{
    public Guid? ParentId { get; set; }
    public Category? Parent { get; set; }
    public List<Category> Children { get; set; } = [];
    public string Name { get; set; } = "";
    public string Slug { get; set; } = "";
    public string? Description { get; set; }
    public Guid? IconMediaId { get; set; }
    public Media? IconMedia { get; set; }
    public Guid? BannerMediaId { get; set; }
    public Media? BannerMedia { get; set; }
    public int SortOrder { get; set; }
    public bool IsActive { get; set; } = true;
    public SeoMeta Seo { get; set; } = new();
}

public class Brand : SoftDeletableEntity
{
    public string Name { get; set; } = "";
    public string Slug { get; set; } = "";
    public Guid? LogoMediaId { get; set; }
    public Media? LogoMedia { get; set; }
    public string? Description { get; set; }
    public bool IsActive { get; set; } = true;
    public int SortOrder { get; set; }
}

public class Product : SoftDeletableEntity
{
    public string Name { get; set; } = "";
    public string Slug { get; set; } = "";
    public Guid? PrimaryCategoryId { get; set; }
    public Category? PrimaryCategory { get; set; }
    public Guid? BrandId { get; set; }
    public Brand? Brand { get; set; }
    public string? ShortDescription { get; set; }
    public string? Description { get; set; }
    public string? VideoUrl { get; set; }
    public ProductStatus Status { get; set; } = ProductStatus.Draft;
    public bool IsFeatured { get; set; }
    public bool IsBestSeller { get; set; }
    public bool IsNew { get; set; }
    /// <summary>Tính lại từ biến thể đang bán khi lưu; phục vụ lọc giá và sắp xếp.</summary>
    public decimal MinPrice { get; set; }
    public decimal MaxPrice { get; set; }
    public int SoldCount { get; set; }
    public SeoMeta Seo { get; set; } = new();
    public uint RowVersion { get; set; }

    public List<ProductVariant> Variants { get; set; } = [];
    public List<ProductImage> Images { get; set; } = [];
    public List<ProductCategory> Categories { get; set; } = [];
    public List<ProductAttributeAssignment> AttributeAssignments { get; set; } = [];
}

public class ProductCategory
{
    public Guid ProductId { get; set; }
    public Product? Product { get; set; }
    public Guid CategoryId { get; set; }
    public Category? Category { get; set; }
    public int SortOrder { get; set; }
}

public class ProductImage : Entity
{
    public Guid ProductId { get; set; }
    public Product? Product { get; set; }
    /// <summary>Rỗng: ảnh chung của sản phẩm.</summary>
    public Guid? VariantId { get; set; }
    public Guid MediaId { get; set; }
    public Media? Media { get; set; }
    public int SortOrder { get; set; }
    public bool IsPrimary { get; set; }
}

public class ProductVariant : SoftDeletableEntity
{
    public Guid ProductId { get; set; }
    public Product? Product { get; set; }
    public string Sku { get; set; } = "";
    public string? Barcode { get; set; }
    public decimal Price { get; set; }
    public decimal? SalePrice { get; set; }
    /// <summary>Chỉ trả về cho người có quyền Product.ViewCost.</summary>
    public decimal? CostPrice { get; set; }
    public int StockQuantity { get; set; }
    public bool IsDefault { get; set; }
    public bool IsActive { get; set; } = true;
    /// <summary>Mã băm của tập (AttributeId, ValueId); rỗng với biến thể mặc định không có tuỳ chọn.</summary>
    public string OptionHash { get; set; } = "";
    public Guid? ImageMediaId { get; set; }
    public Media? ImageMedia { get; set; }
    public uint RowVersion { get; set; }
    public List<VariantOptionValue> OptionValues { get; set; } = [];

    public decimal EffectivePrice => SalePrice is > 0 and var s && s < Price ? s : Price;
}
