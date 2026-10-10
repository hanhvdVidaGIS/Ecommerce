using Ccp.Domain.Common;
using Ccp.Domain.Enums;

namespace Ccp.Domain.Entities;

public class ProductAttribute : SoftDeletableEntity
{
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    public AttributeDataType DataType { get; set; }
    public string? Unit { get; set; }
    public bool IsFilterable { get; set; }
    public bool IsVariantOption { get; set; }
    public bool IsRequired { get; set; }
    public bool IsVisibleOnProduct { get; set; } = true;
    public bool IsActive { get; set; } = true;
    public int SortOrder { get; set; }
    public List<ProductAttributeValue> Values { get; set; } = [];
}

public class CategoryAttribute
{
    public Guid CategoryId { get; set; }
    public Category? Category { get; set; }
    public Guid AttributeId { get; set; }
    public ProductAttribute? Attribute { get; set; }
    public int SortOrder { get; set; }
}

public class ProductAttributeValue : SoftDeletableEntity
{
    public Guid AttributeId { get; set; }
    public ProductAttribute? Attribute { get; set; }
    public string Code { get; set; } = "";
    public string Label { get; set; } = "";
    public string? ColorHex { get; set; }
    public Guid? ImageMediaId { get; set; }
    public int SortOrder { get; set; }
}

public class ProductAttributeAssignment : Entity
{
    public Guid ProductId { get; set; }
    public Product? Product { get; set; }
    public Guid AttributeId { get; set; }
    public ProductAttribute? Attribute { get; set; }
    public Guid? ValueId { get; set; }
    public ProductAttributeValue? Value { get; set; }
    public string? TextValue { get; set; }
    public decimal? NumberValue { get; set; }
    public bool? BoolValue { get; set; }
}

public class VariantOptionValue
{
    public Guid VariantId { get; set; }
    public ProductVariant? Variant { get; set; }
    public Guid AttributeId { get; set; }
    public ProductAttribute? Attribute { get; set; }
    public Guid ValueId { get; set; }
    public ProductAttributeValue? Value { get; set; }
}
