using Ccp.Application.Content;
using Ccp.Domain.Entities;
using Ccp.Domain.Enums;

namespace Ccp.Application.Common;

public sealed record EnumOptionDto(string Value, string Label);

public sealed record MetaDto(
    IReadOnlyDictionary<string, IReadOnlyList<EnumOptionDto>> Enums,
    IReadOnlyList<string> BannerPlacements,
    IReadOnlyList<string> MenuTargetTypes,
    IReadOnlyDictionary<string, IReadOnlyList<string>> OrderTransitions,
    int MaxVariants);

/// <summary>
/// Danh mục enum cho giao diện quản trị, lấy từ chính enum trong Ccp.Domain nên Admin không phải giữ bản sao.
/// Nhãn tiếng Việt chỉ là chuỗi hiển thị; giá trị thiếu nhãn dùng tên enum.
/// </summary>
public static class MetaService
{
    private static readonly Dictionary<string, string> Labels = new()
    {
        ["HomepageSectionType.Hero"] = "Hero banner", ["HomepageSectionType.Slider"] = "Slider", ["HomepageSectionType.FeaturedCategories"] = "Danh mục nổi bật",
        ["HomepageSectionType.NewProducts"] = "Sản phẩm mới", ["HomepageSectionType.BestSellers"] = "Sản phẩm bán chạy", ["HomepageSectionType.FeaturedProducts"] = "Sản phẩm nổi bật",
        ["HomepageSectionType.Promotions"] = "Khuyến mãi", ["HomepageSectionType.FlashSale"] = "Flash Sale", ["HomepageSectionType.Brands"] = "Thương hiệu",
        ["HomepageSectionType.PromoBanners"] = "Banner quảng cáo", ["HomepageSectionType.Blog"] = "Blog", ["HomepageSectionType.Reviews"] = "Đánh giá khách hàng",
        ["HomepageSectionType.Newsletter"] = "Đăng ký nhận tin",
        ["AttributeDataType.Text"] = "Văn bản", ["AttributeDataType.Number"] = "Số", ["AttributeDataType.Select"] = "Chọn một", ["AttributeDataType.MultiSelect"] = "Chọn nhiều",
        ["AttributeDataType.Color"] = "Màu sắc", ["AttributeDataType.Boolean"] = "Đúng/Sai", ["AttributeDataType.Image"] = "Hình ảnh",
        ["ProductStatus.Draft"] = "Nháp", ["ProductStatus.Active"] = "Đang bán", ["ProductStatus.Hidden"] = "Ẩn",
        ["PublishStatus.Draft"] = "Nháp", ["PublishStatus.Published"] = "Đã xuất bản",
        ["OrderStatus.Pending"] = "Chờ xác nhận", ["OrderStatus.Confirmed"] = "Đã xác nhận", ["OrderStatus.Processing"] = "Đang xử lý", ["OrderStatus.Shipping"] = "Đang giao",
        ["OrderStatus.Completed"] = "Hoàn thành", ["OrderStatus.Cancelled"] = "Đã huỷ", ["OrderStatus.Refunded"] = "Đã hoàn tiền",
        ["PaymentStatus.Unpaid"] = "Chưa thanh toán", ["PaymentStatus.Paid"] = "Đã thanh toán", ["PaymentStatus.Failed"] = "Thất bại", ["PaymentStatus.Refunded"] = "Đã hoàn tiền",
        ["PaymentMethod.Cod"] = "Thanh toán khi nhận hàng (COD)", ["PaymentMethod.BankTransfer"] = "Chuyển khoản",
        ["CouponType.Percent"] = "Giảm theo %", ["CouponType.FixedAmount"] = "Giảm số tiền", ["CouponType.FreeShipping"] = "Miễn phí vận chuyển",
        ["ReviewStatus.Pending"] = "Chờ duyệt", ["ReviewStatus.Approved"] = "Đã duyệt", ["ReviewStatus.Rejected"] = "Từ chối",
    };

    public static MetaDto Build()
    {
        var enums = typeof(OrderStatus).Assembly.GetTypes()
            .Where(t => t.IsEnum && t.Namespace == typeof(OrderStatus).Namespace)
            .OrderBy(t => t.Name)
            .ToDictionary(t => t.Name, t => (IReadOnlyList<EnumOptionDto>)Enum.GetNames(t)
                .Select(n => new EnumOptionDto(n, Labels.GetValueOrDefault($"{t.Name}.{n}", n))).ToList());

        var transitions = Enum.GetValues<OrderStatus>().ToDictionary(s => s.ToString(),
            s => (IReadOnlyList<string>)OrderStateMachine.NextOf(s).Select(n => n.ToString()).ToList());

        return new MetaDto(enums, BannerPlacements.All, MenuTargetTypes.All, transitions, Catalog.ProductService.MaxVariants);
    }
}
