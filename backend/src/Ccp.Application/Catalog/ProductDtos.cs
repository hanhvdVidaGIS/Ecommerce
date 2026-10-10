using Ccp.Application.Common;
using Ccp.Domain.Enums;
using FluentValidation;

namespace Ccp.Application.Catalog;

public sealed class ProductQuery : PageRequest
{
    public Guid? CategoryId { get; set; }
    public Guid? BrandId { get; set; }
    public ProductStatus? Status { get; set; }
    public bool? IsFeatured { get; set; }
    public bool? IsBestSeller { get; set; }
    public bool? IsNew { get; set; }
}

public sealed record ProductListItemDto(Guid Id, string Name, string Slug, ProductStatus Status, bool IsFeatured, bool IsBestSeller, bool IsNew,
    string? CategoryName, string? BrandName, string? Sku, decimal MinPrice, decimal MaxPrice, int StockTotal, int VariantCount,
    MediaRefDto? Image, DateTime CreatedAt);

public sealed record ProductImageDto(Guid MediaId, MediaRefDto? Media, int SortOrder, bool IsPrimary);
public sealed record ProductAttributeValueInput(Guid AttributeId, IReadOnlyList<Guid>? ValueIds, string? Text, decimal? Number, bool? Bool);
public sealed record VariantOptionDto(Guid AttributeId, Guid ValueId);

public sealed record VariantDto(Guid Id, string Sku, string? Barcode, decimal Price, decimal? SalePrice, decimal? CostPrice, int StockQuantity,
    bool IsDefault, bool IsActive, Guid? ImageMediaId, MediaRefDto? Image, IReadOnlyList<VariantOptionDto> Options);

public sealed record ProductDetailDto(Guid Id, string Name, string Slug, Guid? PrimaryCategoryId, IReadOnlyList<Guid> CategoryIds, Guid? BrandId,
    string? ShortDescription, string? Description, string? VideoUrl, ProductStatus Status, bool IsFeatured, bool IsBestSeller, bool IsNew, SeoDto Seo,
    IReadOnlyList<ProductImageDto> Images, IReadOnlyList<ProductAttributeValueInput> Attributes, IReadOnlyList<Guid> OptionAttributeIds,
    IReadOnlyList<VariantDto> Variants, bool CanViewCost, IReadOnlyList<Guid> ApplicableAttributeIds);

public sealed record SaveImageRequest(Guid MediaId, bool IsPrimary);
public sealed record SaveVariantRequest(Guid? Id, string Sku, string? Barcode, decimal Price, decimal? SalePrice, decimal? CostPrice, int StockQuantity,
    bool IsActive, Guid? ImageMediaId, IReadOnlyList<VariantOptionDto>? Options);

public sealed record SaveProductRequest(string Name, string? Slug, Guid? PrimaryCategoryId, IReadOnlyList<Guid>? CategoryIds, Guid? BrandId,
    string? ShortDescription, string? Description, string? VideoUrl, ProductStatus Status, bool IsFeatured, bool IsBestSeller, bool IsNew, SeoDto? Seo,
    IReadOnlyList<SaveImageRequest>? Images, IReadOnlyList<ProductAttributeValueInput>? Attributes, IReadOnlyList<SaveVariantRequest> Variants);

public sealed record UpdateProductFlagsRequest(bool? IsFeatured, bool? IsBestSeller, bool? IsNew, ProductStatus? Status);

public sealed record GenerateOption(Guid AttributeId, IReadOnlyList<Guid> ValueIds);
public sealed record GenerateVariantsRequest(IReadOnlyList<GenerateOption> Options, string? BaseSku);
public sealed record GeneratedVariantOption(Guid AttributeId, string AttributeName, Guid ValueId, string ValueLabel);
public sealed record GeneratedVariantDto(string SuggestedSku, string Label, IReadOnlyList<GeneratedVariantOption> Options);

public sealed class SaveProductRequestValidator : AbstractValidator<SaveProductRequest>
{
    public SaveProductRequestValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(250).WithMessage("Tên là bắt buộc (tối đa 250 ký tự).");
        RuleFor(x => x.ShortDescription).MaximumLength(1000);
        RuleFor(x => x.Description).MaximumLength(100_000);
        RuleFor(x => x.VideoUrl).MaximumLength(500).Must(u => string.IsNullOrEmpty(u) || Uri.TryCreate(u, UriKind.Absolute, out var uri) && (uri.Scheme is "http" or "https"))
            .WithMessage("Liên kết video phải bắt đầu bằng http hoặc https.");
        RuleFor(x => x.Status).IsInEnum();
        RuleFor(x => x.Variants).NotNull().Must(v => v is { Count: > 0 and <= ProductService.MaxVariants })
            .WithMessage($"Sản phẩm cần từ 1 đến {ProductService.MaxVariants} biến thể.");
        RuleForEach(x => x.Variants).SetValidator(new SaveVariantRequestValidator());
    }
}

public sealed class SaveVariantRequestValidator : AbstractValidator<SaveVariantRequest>
{
    public SaveVariantRequestValidator()
    {
        RuleFor(x => x.Sku).NotEmpty().MaximumLength(100).Matches(@"^[A-Za-z0-9._\-]+$").WithMessage("SKU chỉ gồm chữ, số, dấu chấm, gạch ngang, gạch dưới.");
        RuleFor(x => x.Barcode).MaximumLength(100);
        RuleFor(x => x.Price).InclusiveBetween(0, 999_999_999_999m).WithMessage("Giá không hợp lệ.");
        RuleFor(x => x.SalePrice).GreaterThan(0).When(x => x.SalePrice.HasValue).WithMessage("Giá khuyến mãi phải lớn hơn 0.")
            .Must((v, sale) => sale is null || sale < v.Price).WithMessage("Giá khuyến mãi phải nhỏ hơn giá bán.");
        RuleFor(x => x.CostPrice).InclusiveBetween(0, 999_999_999_999m).When(x => x.CostPrice.HasValue);
        RuleFor(x => x.StockQuantity).InclusiveBetween(0, 10_000_000).WithMessage("Tồn kho không hợp lệ.");
    }
}
