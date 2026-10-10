namespace Ccp.Domain.Security;

public sealed record PermissionDefinition(string Group, string Code, string Description, bool SuperAdminOnly);

/// <summary>Danh mục quyền. Nguồn thiết kế: docs/catalog.json; test CatalogConsistencyTests đối chiếu.</summary>
public static class Permissions
{
    public const string ProductView = "Product.View";
    public const string ProductViewCost = "Product.ViewCost";
    public const string ProductCreate = "Product.Create";
    public const string ProductUpdate = "Product.Update";
    public const string ProductDelete = "Product.Delete";
    public const string CategoryView = "Category.View";
    public const string CategoryCreate = "Category.Create";
    public const string CategoryUpdate = "Category.Update";
    public const string CategoryDelete = "Category.Delete";
    public const string BrandView = "Brand.View";
    public const string BrandManage = "Brand.Manage";
    public const string AttributeView = "Attribute.View";
    public const string AttributeManage = "Attribute.Manage";
    public const string OrderView = "Order.View";
    public const string OrderUpdate = "Order.Update";
    public const string OrderRefund = "Order.Refund";
    public const string CustomerView = "Customer.View";
    public const string CustomerUpdate = "Customer.Update";
    public const string CouponManage = "Coupon.Manage";
    public const string MediaView = "Media.View";
    public const string MediaUpload = "Media.Upload";
    public const string MediaDelete = "Media.Delete";
    public const string BannerManage = "Banner.Manage";
    public const string HomepageSectionManage = "HomepageSection.Manage";
    public const string MenuManage = "Menu.Manage";
    public const string PageManage = "Page.Manage";
    public const string PostManage = "Post.Manage";
    public const string ReviewModerate = "Review.Moderate";
    public const string DashboardView = "Dashboard.View";
    public const string WebsiteConfigView = "WebsiteConfig.View";
    public const string WebsiteConfigUpdate = "WebsiteConfig.Update";
    public const string StoreConfigUpdate = "StoreConfig.Update";
    public const string UserManage = "User.Manage";
    public const string RoleManage = "Role.Manage";
    public const string PermissionManage = "Permission.Manage";

    public static readonly IReadOnlyList<PermissionDefinition> All =
    [
        new("Product", ProductView, "Xem sản phẩm", false),
        new("Product", ProductViewCost, "Xem giá vốn", false),
        new("Product", ProductCreate, "Thêm sản phẩm", false),
        new("Product", ProductUpdate, "Sửa sản phẩm, biến thể, tồn kho", false),
        new("Product", ProductDelete, "Xoá sản phẩm", false),
        new("Category", CategoryView, "Xem danh mục", false),
        new("Category", CategoryCreate, "Thêm danh mục", false),
        new("Category", CategoryUpdate, "Sửa, sắp xếp, ẩn/hiện danh mục", false),
        new("Category", CategoryDelete, "Xoá danh mục", false),
        new("Brand", BrandView, "Xem thương hiệu", false),
        new("Brand", BrandManage, "Thêm, sửa, xoá thương hiệu", false),
        new("Attribute", AttributeView, "Xem thuộc tính", false),
        new("Attribute", AttributeManage, "Thêm, sửa, xoá thuộc tính và giá trị", false),
        new("Order", OrderView, "Xem đơn hàng", false),
        new("Order", OrderUpdate, "Đổi trạng thái đơn hàng", false),
        new("Order", OrderRefund, "Hoàn tiền đơn hàng", false),
        new("Customer", CustomerView, "Xem khách hàng và lịch sử mua", false),
        new("Customer", CustomerUpdate, "Khoá/mở tài khoản khách hàng", false),
        new("Coupon", CouponManage, "Quản lý mã giảm giá và Flash Sale", false),
        new("Media", MediaView, "Xem thư viện ảnh", false),
        new("Media", MediaUpload, "Tải ảnh lên", false),
        new("Media", MediaDelete, "Xoá ảnh", false),
        new("Content", BannerManage, "Quản lý banner", false),
        new("Content", HomepageSectionManage, "Quản lý section trang chủ", false),
        new("Content", MenuManage, "Quản lý menu", false),
        new("Content", PageManage, "Quản lý trang nội dung", false),
        new("Content", PostManage, "Quản lý bài viết blog", false),
        new("Review", ReviewModerate, "Duyệt, ẩn đánh giá", false),
        new("Dashboard", DashboardView, "Xem dashboard", false),
        new("WebsiteConfig", WebsiteConfigView, "Xem cấu hình website", false),
        new("WebsiteConfig", WebsiteConfigUpdate, "Sửa cấu hình website", false),
        new("StoreConfig", StoreConfigUpdate, "Sửa cấu hình cửa hàng, Business Type, vận chuyển, thanh toán", false),
        new("User", UserManage, "Quản lý người dùng quản trị", true),
        new("Role", RoleManage, "Quản lý vai trò", true),
        new("Permission", PermissionManage, "Gán quyền cho vai trò", true),
    ];
}
