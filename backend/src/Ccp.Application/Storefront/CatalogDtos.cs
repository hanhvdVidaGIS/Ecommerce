using Ccp.Application.Common;
using Ccp.Domain.Enums;

namespace Ccp.Application.Storefront;

public sealed record PublicCategoryDto(Guid Id, string Name, string Slug, string? Description, MediaRefDto? Icon, MediaRefDto? Banner,
    int ProductCount, SeoDto Seo, IReadOnlyList<PublicCategoryDto> Children);

public sealed record BreadcrumbDto(string Name, string Slug);

public sealed record PublicCategoryDetailDto(Guid Id, string Name, string Slug, string? Description, MediaRefDto? Banner, SeoDto Seo,
    IReadOnlyList<BreadcrumbDto> Breadcrumb, IReadOnlyList<PublicCategoryDto> Children);

public sealed record PublicBrandDto(Guid Id, string Name, string Slug, string? Description, MediaRefDto? Logo, int ProductCount);

/// <summary>Thẻ sản phẩm ở danh sách. Không chứa giá vốn hay tồn kho chính xác.</summary>
public sealed record ProductCardDto(Guid Id, string Slug, string Name, string? BrandName, string? BrandSlug, MediaRefDto? Image, MediaRefDto? HoverImage,
    decimal MinPrice, decimal MaxPrice, decimal? CompareAtPrice, bool OnSale, bool IsNew, bool IsBestSeller, bool IsFeatured, bool InStock);

public sealed class ProductFilter
{
    public string? Category { get; set; }
    public string? Q { get; set; }
    public IReadOnlyList<string> Brands { get; set; } = [];
    public decimal? PriceMin { get; set; }
    public decimal? PriceMax { get; set; }
    /// <summary>Mã thuộc tính → các mã giá trị (OR trong một thuộc tính, AND giữa các thuộc tính).</summary>
    public Dictionary<string, string[]> Attrs { get; set; } = new(StringComparer.OrdinalIgnoreCase);
    /// <summary>featured | new | bestseller | sale</summary>
    public string? Flag { get; set; }
    /// <summary>newest | price_asc | price_desc | bestseller | name</summary>
    public string? Sort { get; set; }
    public int Page { get; set; } = 1;
    public int PageSize { get; set; } = 24;
}

public sealed record FacetBrandDto(string Slug, string Name, int Count);
public sealed record FacetValueDto(string Code, string Label, string? ColorHex, MediaRefDto? Image, int Count);
public sealed record FacetAttributeDto(string Code, string Name, AttributeDataType DataType, IReadOnlyList<FacetValueDto> Values);
public sealed record FacetPriceDto(decimal Min, decimal Max);
public sealed record FacetsDto(IReadOnlyList<FacetBrandDto> Brands, FacetPriceDto? Price, IReadOnlyList<FacetAttributeDto> Attributes);

public sealed record DetailAttributeDto(string Code, string Name, IReadOnlyList<string> Values);
public sealed record OptionValueDto(Guid Id, string Code, string Label, string? ColorHex, MediaRefDto? Image);
public sealed record ProductOptionDto(Guid AttributeId, string Code, string Name, AttributeDataType DataType, IReadOnlyList<OptionValueDto> Values);

/// <summary>InStock/MaxPurchasable thay cho tồn kho thật: không lộ số lượng tồn của cửa hàng.</summary>
public sealed record PublicVariantDto(Guid Id, string Sku, decimal Price, decimal? SalePrice, decimal EffectivePrice, bool InStock, int MaxPurchasable,
    IReadOnlyList<Guid> OptionValueIds, string Label, MediaRefDto? Image);

public sealed record PublicProductDto(Guid Id, string Slug, string Name, string? BrandName, string? BrandSlug, string? ShortDescription, string? Description,
    string? VideoUrl, bool IsNew, bool IsBestSeller, bool IsFeatured, IReadOnlyList<MediaRefDto> Images, IReadOnlyList<BreadcrumbDto> Breadcrumb,
    IReadOnlyList<DetailAttributeDto> Attributes, IReadOnlyList<ProductOptionDto> Options, IReadOnlyList<PublicVariantDto> Variants,
    decimal MinPrice, decimal MaxPrice, SeoDto Seo, IReadOnlyList<ProductCardDto> Related);

public sealed record SearchSuggestionsDto(IReadOnlyList<ProductCardDto> Products, IReadOnlyList<FacetBrandDto> Brands, IReadOnlyList<BreadcrumbDto> Categories);
