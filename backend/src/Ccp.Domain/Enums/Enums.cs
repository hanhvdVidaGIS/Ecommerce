namespace Ccp.Domain.Enums;

// Danh mục enum: nguồn gốc thiết kế là docs/catalog.json; test CatalogConsistencyTests đối chiếu tên và giá trị.
public enum OrderStatus { Pending, Confirmed, Processing, Shipping, Completed, Cancelled, Refunded }
public enum PaymentStatus { Unpaid, Paid, Failed, Refunded }
public enum PaymentMethod { Cod, BankTransfer }
public enum ProductStatus { Draft, Active, Hidden }
public enum AttributeDataType { Text, Number, Select, MultiSelect, Color, Boolean, Image }
public enum CouponType { Percent, FixedAmount, FreeShipping }
public enum ReviewStatus { Pending, Approved, Rejected }
public enum PublishStatus { Draft, Published }
public enum SettingValueType { String, Number, Boolean, Color, Json, MediaId }
public enum AddressLevel { Province, Ward }
public enum HomepageSectionType
{
    Hero, Slider, FeaturedCategories, NewProducts, BestSellers, FeaturedProducts,
    Promotions, FlashSale, Brands, PromoBanners, Blog, Reviews, Newsletter
}
