using System.Text.Json;
using System.Text.Json.Serialization;
using Ccp.Domain.Enums;

namespace Ccp.Application.Config;

public sealed record PresetValue(string Code, string Label, string? ColorHex = null);

public sealed record PresetAttribute(string Code, string Name, AttributeDataType DataType, bool IsFilterable, bool IsVariantOption,
    IReadOnlyList<PresetValue> Values, string? Unit = null);

public sealed record PresetCategory(string Name, string Slug, IReadOnlyList<PresetCategory>? Children = null,
    IReadOnlyList<string>? AttributeCodes = null);

public sealed record PresetLabels(string Product, string Category, string Brand);

/// <summary>Nội dung PresetJson của BusinessType: nhãn, bộ thuộc tính và cây danh mục gợi ý.</summary>
public sealed record BusinessTypePreset(PresetLabels Labels, IReadOnlyList<PresetAttribute> Attributes, IReadOnlyList<PresetCategory> Categories)
{
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter() },
    };
}

public sealed record BusinessTypeSeed(string Code, string Name, string Description, BusinessTypePreset Preset);

public static class BusinessTypePresets
{
    private static PresetValue[] V(params string[] labels) =>
        labels.Select(l => new PresetValue(Slug(l), l)).ToArray();

    public static string Slug(string text) => Common.Slugger.Slugify(text);

    private static PresetAttribute Select(string code, string name, bool variant, params string[] labels) =>
        new(code, name, AttributeDataType.Select, true, variant, V(labels));

    private static PresetAttribute Brandless(string code, string name, params string[] labels) => Select(code, name, false, labels);

    private static PresetAttribute ColorAttr() => new("color", "Màu sắc", AttributeDataType.Color, true, true,
    [
        new("den", "Đen", "#111111"), new("trang", "Trắng", "#FFFFFF"), new("xanh-navy", "Xanh navy", "#1E3A8A"),
        new("do", "Đỏ", "#DC2626"), new("be", "Be", "#D6C7A1"),
    ]);

    private static PresetCategory Cat(string name, params PresetCategory[] children) =>
        new(name, Slug(name), children.Length == 0 ? null : children);

    public static readonly IReadOnlyList<BusinessTypeSeed> All =
    [
        new("perfume", "Nước hoa", "Nước hoa nam, nữ, unisex theo dung tích và nồng độ.", new BusinessTypePreset(
            new PresetLabels("Nước hoa", "Danh mục", "Thương hiệu"),
            [
                Brandless("gender", "Giới tính", "Nam", "Nữ", "Unisex"),
                Select("volume", "Dung tích", true, "30ml", "50ml", "100ml", "200ml"),
                Brandless("concentration", "Nồng độ", "Eau de Parfum", "Eau de Toilette", "Eau de Cologne", "Parfum"),
                new("scent", "Mùi hương", AttributeDataType.MultiSelect, true, false, V("Hoa cỏ", "Gỗ", "Cam chanh", "Phương Đông", "Xạ hương", "Trái cây")),
                Brandless("origin", "Xuất xứ", "Pháp", "Ý", "Mỹ", "Anh", "Việt Nam"),
            ],
            [new("Nước hoa", "nuoc-hoa",
                [Cat("Nước hoa nam"), Cat("Nước hoa nữ"), Cat("Nước hoa unisex"), Cat("Gift Set")],
                ["gender", "volume", "concentration", "scent", "origin"])])),

        new("apparel", "Quần áo", "Thời trang theo size, màu sắc, chất liệu.", new BusinessTypePreset(
            new PresetLabels("Quần áo", "Danh mục", "Thương hiệu"),
            [
                Select("size", "Size", true, "XS", "S", "M", "L", "XL", "XXL"),
                ColorAttr(),
                Brandless("material", "Chất liệu", "Cotton", "Linen", "Polyester", "Denim", "Len"),
                Brandless("fit", "Kiểu dáng", "Regular", "Slim", "Oversize"),
            ],
            [new("Quần áo", "quan-ao",
                [Cat("Nam", Cat("Áo nam"), Cat("Quần nam"), Cat("Áo khoác nam")),
                 Cat("Nữ", Cat("Váy"), Cat("Áo nữ"), Cat("Quần nữ")),
                 Cat("Phụ kiện")],
                ["size", "color", "material", "fit"])])),

        new("footwear", "Giày dép", "Giày nam, nữ, sneaker, sandal theo size và màu.", new BusinessTypePreset(
            new PresetLabels("Giày dép", "Danh mục", "Thương hiệu"),
            [
                Select("size", "Size", true, "38", "39", "40", "41", "42", "43", "44"),
                ColorAttr(),
                Brandless("material", "Chất liệu", "Da", "Vải", "Cao su", "Lưới"),
            ],
            [new("Giày dép", "giay-dep", [Cat("Giày nam"), Cat("Giày nữ"), Cat("Sneaker"), Cat("Sandal")], ["size", "color", "material"])])),

        new("cosmetics", "Mỹ phẩm", "Mỹ phẩm theo loại da, dung tích, xuất xứ.", new BusinessTypePreset(
            new PresetLabels("Mỹ phẩm", "Danh mục", "Thương hiệu"),
            [
                Brandless("skin-type", "Loại da", "Da dầu", "Da khô", "Da hỗn hợp", "Da nhạy cảm"),
                Select("volume", "Dung tích", true, "30ml", "50ml", "100ml", "200ml"),
                Brandless("origin", "Xuất xứ", "Hàn Quốc", "Nhật Bản", "Pháp", "Mỹ", "Việt Nam"),
            ],
            [new("Mỹ phẩm", "my-pham", [Cat("Chăm sóc da"), Cat("Trang điểm"), Cat("Chăm sóc tóc")], ["skin-type", "volume", "origin"])])),

        new("watch", "Đồng hồ", "Đồng hồ theo loại máy, chất liệu dây, đường kính mặt.", new BusinessTypePreset(
            new PresetLabels("Đồng hồ", "Danh mục", "Thương hiệu"),
            [
                Brandless("movement", "Loại máy", "Quartz", "Automatic", "Cơ tay lên cót"),
                Brandless("strap", "Chất liệu dây", "Da", "Thép không gỉ", "Cao su", "Vải"),
                Select("case-size", "Đường kính mặt", true, "36mm", "40mm", "42mm", "44mm"),
            ],
            [new("Đồng hồ", "dong-ho", [Cat("Đồng hồ nam"), Cat("Đồng hồ nữ")], ["movement", "strap", "case-size"])])),

        new("phone", "Điện thoại", "Điện thoại theo dung lượng, RAM, màu sắc.", new BusinessTypePreset(
            new PresetLabels("Điện thoại", "Danh mục", "Thương hiệu"),
            [
                Select("storage", "Dung lượng", true, "64GB", "128GB", "256GB", "512GB"),
                Brandless("ram", "RAM", "4GB", "6GB", "8GB", "12GB"),
                ColorAttr(),
            ],
            [new("Điện thoại", "dien-thoai", [Cat("Điện thoại thông minh"), Cat("Phụ kiện điện thoại")], ["storage", "ram", "color"])])),

        new("laptop", "Laptop", "Laptop theo CPU, RAM, ổ cứng.", new BusinessTypePreset(
            new PresetLabels("Laptop", "Danh mục", "Thương hiệu"),
            [
                Brandless("cpu", "CPU", "Intel Core i5", "Intel Core i7", "AMD Ryzen 5", "AMD Ryzen 7", "Apple M-series"),
                Select("ram", "RAM", true, "8GB", "16GB", "32GB"),
                Select("storage", "Ổ cứng", true, "256GB", "512GB", "1TB"),
            ],
            [new("Laptop", "laptop", [Cat("Laptop văn phòng"), Cat("Laptop gaming"), Cat("Phụ kiện laptop")], ["cpu", "ram", "storage"])])),

        new("homeware", "Đồ gia dụng", "Đồ gia dụng theo công suất, chất liệu, màu sắc.", new BusinessTypePreset(
            new PresetLabels("Đồ gia dụng", "Danh mục", "Thương hiệu"),
            [
                Brandless("power", "Công suất", "500W", "1000W", "1500W", "2000W"),
                Brandless("material", "Chất liệu", "Inox", "Nhựa", "Thủy tinh", "Gốm"),
                ColorAttr(),
            ],
            [new("Đồ gia dụng", "do-gia-dung", [Cat("Đồ dùng nhà bếp"), Cat("Thiết bị điện gia dụng")], ["power", "material", "color"])])),

        new("furniture", "Nội thất", "Nội thất theo chất liệu, kích thước, màu sắc.", new BusinessTypePreset(
            new PresetLabels("Nội thất", "Danh mục", "Thương hiệu"),
            [
                Brandless("material", "Chất liệu", "Gỗ sồi", "Gỗ óc chó", "Kim loại", "Vải bọc", "Da"),
                Select("dimension", "Kích thước", true, "Nhỏ", "Vừa", "Lớn"),
                ColorAttr(),
            ],
            [new("Nội thất", "noi-that", [Cat("Phòng khách"), Cat("Phòng ngủ"), Cat("Văn phòng")], ["material", "dimension", "color"])])),

        new("food", "Thực phẩm", "Thực phẩm theo trọng lượng, xuất xứ.", new BusinessTypePreset(
            new PresetLabels("Thực phẩm", "Danh mục", "Thương hiệu"),
            [
                Select("weight", "Trọng lượng", true, "250g", "500g", "1kg"),
                Brandless("origin", "Xuất xứ", "Việt Nam", "Nhật Bản", "Hàn Quốc", "Mỹ", "Úc"),
            ],
            [new("Thực phẩm", "thuc-pham", [Cat("Đồ khô"), Cat("Đồ uống"), Cat("Bánh kẹo")], ["weight", "origin"])])),

        new("other", "Khác", "Cấu hình trống; tự tạo danh mục và thuộc tính.", new BusinessTypePreset(
            new PresetLabels("Sản phẩm", "Danh mục", "Thương hiệu"), [], [])),
    ];
}
