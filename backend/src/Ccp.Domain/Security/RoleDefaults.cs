namespace Ccp.Domain.Security;

public sealed record RoleDefinition(string Code, string Name, IReadOnlyCollection<string> Permissions);

/// <summary>Vai trò hệ thống và quyền mặc định khi khởi tạo (docs: Phụ lục A, Bảng A.2).</summary>
public static class RoleDefaults
{
    public const string SuperAdmin = "SuperAdmin";
    public const string Admin = "Admin";
    public const string Manager = "Manager";
    public const string Staff = "Staff";
    public const string Customer = "Customer";

    private static readonly string[] ManagerPermissions =
    [
        Permissions.ProductView, Permissions.ProductViewCost, Permissions.ProductCreate, Permissions.ProductUpdate, Permissions.ProductDelete,
        Permissions.CategoryView, Permissions.CategoryCreate, Permissions.CategoryUpdate, Permissions.CategoryDelete,
        Permissions.BrandView, Permissions.BrandManage, Permissions.AttributeView, Permissions.AttributeManage,
        Permissions.OrderView, Permissions.OrderUpdate, Permissions.OrderRefund,
        Permissions.CustomerView, Permissions.CouponManage,
        Permissions.MediaView, Permissions.MediaUpload, Permissions.MediaDelete,
        Permissions.BannerManage, Permissions.HomepageSectionManage, Permissions.MenuManage, Permissions.PageManage, Permissions.PostManage,
        Permissions.ReviewModerate, Permissions.DashboardView, Permissions.WebsiteConfigView,
    ];

    private static readonly string[] StaffPermissions =
    [
        Permissions.ProductView, Permissions.ProductUpdate, Permissions.OrderView, Permissions.OrderUpdate,
        Permissions.MediaView, Permissions.MediaUpload,
    ];

    public static IReadOnlyList<RoleDefinition> All { get; } =
    [
        new(SuperAdmin, "Super Admin", Permissions.All.Select(p => p.Code).ToArray()),
        new(Admin, "Admin", Permissions.All.Where(p => !p.SuperAdminOnly).Select(p => p.Code).ToArray()),
        new(Manager, "Manager", ManagerPermissions),
        new(Staff, "Staff", StaffPermissions),
        new(Customer, "Customer", []),
    ];
}
