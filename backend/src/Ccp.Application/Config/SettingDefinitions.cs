using Ccp.Domain.Enums;

namespace Ccp.Application.Config;

/// <summary>
/// Khoá cấu hình. Control là gợi ý kiểu ô nhập cho trang quản trị (giao diện không gắn cứng tên khoá):
/// text, textarea, color, font, media, number, boolean, json, payment-methods, bank-account, business-type.
/// </summary>
public sealed record SettingDefinition(string Key, string Group, SettingValueType Type, bool IsPublic, string Default, string Label, string? ControlOverride = null)
{
    public static readonly IReadOnlyList<string> Controls =
        ["text", "textarea", "color", "font", "media", "number", "boolean", "json", "payment-methods", "bank-account", "business-type"];

    public string Control => ControlOverride ?? Type switch
    {
        SettingValueType.Color => "color",
        SettingValueType.MediaId => "media",
        SettingValueType.Number => "number",
        SettingValueType.Boolean => "boolean",
        SettingValueType.Json => "json",
        _ => "text",
    };
}

/// <summary>
/// Danh mục khoá cấu hình. Trang quản trị lấy danh sách này từ API (không sao chép ở giao diện),
/// nên thêm khoá mới chỉ cần thêm một dòng ở đây.
/// </summary>
public static class SettingKeys
{
    public const string SiteName = "general.siteName";
    public const string Slogan = "general.slogan";
    public const string Description = "general.description";
    public const string Logo = "general.logo";
    public const string Favicon = "general.favicon";
    public const string Cover = "branding.cover";
    public const string BackgroundImage = "branding.backgroundImage";
    public const string PrimaryColor = "theme.primaryColor";
    public const string SecondaryColor = "theme.secondaryColor";
    public const string FontFamily = "theme.fontFamily";
    public const string Email = "contact.email";
    public const string Phone = "contact.phone";
    public const string Address = "contact.address";
    public const string Facebook = "social.facebook";
    public const string TikTok = "social.tiktok";
    public const string Instagram = "social.instagram";
    public const string Zalo = "social.zalo";
    public const string FooterText = "footer.text";
    public const string Copyright = "footer.copyright";
    public const string StoreName = "store.name";
    public const string BusinessType = "store.businessType";
    public const string ProductLabel = "store.productLabel";
    public const string CategoryLabel = "store.categoryLabel";
    public const string BrandLabel = "store.brandLabel";
    public const string Currency = "store.currency";
    public const string Timezone = "store.timezone";
    public const string Language = "store.language";
    public const string PaymentMethods = "store.paymentMethods";
    public const string BankAccount = "store.bankAccount";
    public const string SeoTitle = "seo.defaultTitle";
    public const string SeoDescription = "seo.defaultDescription";
    public const string SeoOgImage = "seo.ogImage";
}

public static class SettingDefinitions
{
    public static readonly IReadOnlyList<string> AllowedFonts =
    [
        "Inter", "Roboto", "Open Sans", "Lato", "Montserrat", "Poppins", "Be Vietnam Pro",
        "Nunito", "Raleway", "Source Sans 3", "Playfair Display", "Merriweather",
    ];

    // Giá trị mặc định trung tính: không gắn với ngành hàng nào. Dữ liệu mẫu ghi đè ở bộ nạp dữ liệu mẫu.
    public static readonly IReadOnlyList<SettingDefinition> All =
    [
        new(SettingKeys.SiteName, "general", SettingValueType.String, true, "Cửa hàng của tôi", "Tên website"),
        new(SettingKeys.Slogan, "general", SettingValueType.String, true, "", "Slogan"),
        new(SettingKeys.Description, "general", SettingValueType.String, true, "", "Mô tả website", "textarea"),
        new(SettingKeys.Logo, "general", SettingValueType.MediaId, true, "", "Logo"),
        new(SettingKeys.Favicon, "general", SettingValueType.MediaId, true, "", "Favicon"),
        new(SettingKeys.Cover, "branding", SettingValueType.MediaId, true, "", "Ảnh cover"),
        new(SettingKeys.BackgroundImage, "branding", SettingValueType.MediaId, true, "", "Ảnh nền"),
        new(SettingKeys.PrimaryColor, "theme", SettingValueType.Color, true, "#111827", "Màu chủ đạo"),
        new(SettingKeys.SecondaryColor, "theme", SettingValueType.Color, true, "#6B7280", "Màu phụ"),
        new(SettingKeys.FontFamily, "theme", SettingValueType.String, true, "Inter", "Font chữ", "font"),
        new(SettingKeys.Email, "contact", SettingValueType.String, true, "", "Email liên hệ"),
        new(SettingKeys.Phone, "contact", SettingValueType.String, true, "", "Số điện thoại"),
        new(SettingKeys.Address, "contact", SettingValueType.String, true, "", "Địa chỉ"),
        new(SettingKeys.Facebook, "social", SettingValueType.String, true, "", "Facebook"),
        new(SettingKeys.TikTok, "social", SettingValueType.String, true, "", "TikTok"),
        new(SettingKeys.Instagram, "social", SettingValueType.String, true, "", "Instagram"),
        new(SettingKeys.Zalo, "social", SettingValueType.String, true, "", "Zalo"),
        new(SettingKeys.FooterText, "footer", SettingValueType.String, true, "", "Nội dung footer", "textarea"),
        new(SettingKeys.Copyright, "footer", SettingValueType.String, true, "", "Bản quyền"),
        new(SettingKeys.StoreName, "store", SettingValueType.String, true, "", "Tên cửa hàng (pháp lý)"),
        new(SettingKeys.BusinessType, "store", SettingValueType.String, true, "other", "Ngành hàng (Business Type)", "business-type"),
        new(SettingKeys.ProductLabel, "store", SettingValueType.String, true, "Sản phẩm", "Nhãn \"Sản phẩm\""),
        new(SettingKeys.CategoryLabel, "store", SettingValueType.String, true, "Danh mục", "Nhãn \"Danh mục\""),
        new(SettingKeys.BrandLabel, "store", SettingValueType.String, true, "Thương hiệu", "Nhãn \"Thương hiệu\""),
        new(SettingKeys.Currency, "store", SettingValueType.String, true, "VND", "Tiền tệ"),
        new(SettingKeys.Timezone, "store", SettingValueType.String, true, "Asia/Ho_Chi_Minh", "Múi giờ"),
        new(SettingKeys.Language, "store", SettingValueType.String, true, "vi", "Ngôn ngữ"),
        new(SettingKeys.PaymentMethods, "store", SettingValueType.Json, true, "[\"Cod\",\"BankTransfer\"]", "Phương thức thanh toán đang bật", "payment-methods"),
        new(SettingKeys.BankAccount, "store", SettingValueType.Json, true, "{\"bank\":\"\",\"accountNumber\":\"\",\"accountName\":\"\"}", "Tài khoản nhận chuyển khoản", "bank-account"),
        new(SettingKeys.SeoTitle, "seo", SettingValueType.String, true, "", "Tiêu đề SEO mặc định"),
        new(SettingKeys.SeoDescription, "seo", SettingValueType.String, true, "", "Mô tả SEO mặc định", "textarea"),
        new(SettingKeys.SeoOgImage, "seo", SettingValueType.MediaId, true, "", "Ảnh Open Graph mặc định"),
    ];

    public static SettingDefinition? Find(string key) => All.FirstOrDefault(d => d.Key == key);
}
