namespace Ccp.Infrastructure.Seed;

public sealed record DemoBrand(string Code, string Name, string Slug, string Description);

public sealed record DemoProduct(
    string Code, string Name, string BrandCode, string CategorySlug, string Gender, string Concentration, string[] Scents, string Origin,
    decimal Base50, string[] Volumes, bool IsNew = false, bool IsBest = false, bool IsFeatured = false, bool OnSale = false);

/// <summary>
/// Dữ liệu mẫu ngành nước hoa. Toàn bộ thương hiệu và sản phẩm là hư cấu, ảnh sinh tự động;
/// chỉ phục vụ demo, không đại diện cho nhãn hiệu thật.
/// </summary>
public static class DemoData
{
    public static readonly DemoBrand[] Brands =
    [
        new("MA", "Maison Aurel", "maison-aurel", "Nhà hương hư cấu theo phong cách Pháp, nổi bật với gỗ ấm và hổ phách."),
        new("NE", "Noir Étoile", "noir-etoile", "Dòng hương thanh lịch về đêm, tông xanh đêm và hoa trắng."),
        new("VE", "Velora", "velora", "Phong cách Ý rực rỡ, kết hợp trái cây và hoa tươi."),
        new("CA", "Casa Ambra", "casa-ambra", "Hương ấm áp của hổ phách, da thuộc và gia vị phương Đông."),
        new("SO", "Solen & Co", "solen-co", "Thương hiệu hư cấu phong cách Anh, tươi sáng và tối giản."),
        new("HL", "Harbor Lane", "harbor-lane", "Hương biển và gió, năng động cho mỗi ngày."),
        new("LH", "Lạc Hương", "lac-huong", "Thương hiệu hư cấu lấy cảm hứng từ trầm, sen và quế Việt Nam."),
    ];

    private const string Nam = "nuoc-hoa-nam", Nu = "nuoc-hoa-nu", Uni = "nuoc-hoa-unisex", Gift = "gift-set";
    private static readonly string[] V3 = ["30ml", "50ml", "100ml"], V2 = ["50ml", "100ml"];

    // Thứ tự khớp với ảnh p01..p26 do script sinh ảnh tạo ra.
    public static readonly DemoProduct[] Products =
    [
        new("NUIT1", "Aurel Nuit No.1", "MA", Nam, "Nam", "Eau de Parfum", ["Gỗ", "Xạ hương"], "Pháp", 1_950_000, V3, IsNew: true, IsBest: true, IsFeatured: true),
        new("SOLEIL", "Aurel Soleil", "MA", Nu, "Nữ", "Eau de Toilette", ["Cam chanh", "Hoa cỏ"], "Pháp", 1_450_000, V3, IsNew: true),
        new("AMBRE", "Aurel Ambre Noir", "MA", Uni, "Unisex", "Parfum", ["Phương Đông", "Gỗ"], "Pháp", 2_650_000, V2, IsFeatured: true),
        new("MIDNT", "Étoile Midnight", "NE", Nam, "Nam", "Eau de Parfum", ["Gỗ", "Phương Đông"], "Pháp", 1_850_000, V3, IsBest: true),
        new("ROSEB", "Étoile Rose Blanche", "NE", Nu, "Nữ", "Eau de Parfum", ["Hoa cỏ", "Xạ hương"], "Pháp", 1_790_000, V3, IsBest: true, OnSale: true),
        new("COLOG", "Étoile Cologne Légère", "NE", Uni, "Unisex", "Eau de Cologne", ["Cam chanh"], "Pháp", 990_000, V3),
        new("BIANC", "Velora Bianca", "VE", Nu, "Nữ", "Eau de Parfum", ["Hoa cỏ", "Trái cây"], "Ý", 1_690_000, V3, IsNew: true),
        new("UOMO", "Velora Uomo", "VE", Nam, "Nam", "Eau de Toilette", ["Cam chanh", "Gỗ"], "Ý", 1_390_000, V3, IsBest: true),
        new("ORO", "Velora Oro", "VE", Uni, "Unisex", "Eau de Parfum", ["Phương Đông", "Trái cây"], "Ý", 2_150_000, V2, IsFeatured: true),
        new("NOTTE", "Ambra Notte", "CA", Nam, "Nam", "Parfum", ["Phương Đông", "Xạ hương"], "Ý", 2_850_000, V2),
        new("FIORE", "Ambra Fiore", "CA", Nu, "Nữ", "Eau de Toilette", ["Hoa cỏ"], "Ý", 1_250_000, V3, OnSale: true),
        new("TERRA", "Ambra Terra", "CA", Uni, "Unisex", "Eau de Parfum", ["Gỗ"], "Ý", 1_750_000, V3),
        new("CITRS", "Solen Citrus Garden", "SO", Uni, "Unisex", "Eau de Cologne", ["Cam chanh", "Trái cây"], "Anh", 890_000, V3, IsBest: true),
        new("OAKSM", "Solen Oak & Smoke", "SO", Nam, "Nam", "Eau de Parfum", ["Gỗ", "Xạ hương"], "Anh", 2_050_000, V3, IsFeatured: true),
        new("PEONY", "Solen Peony", "SO", Nu, "Nữ", "Eau de Parfum", ["Hoa cỏ", "Trái cây"], "Anh", 1_590_000, V3),
        new("COAST", "Harbor Lane Coast", "HL", Nam, "Nam", "Eau de Toilette", ["Cam chanh"], "Mỹ", 1_150_000, V3, IsNew: true),
        new("DUNE", "Harbor Lane Dune", "HL", Uni, "Unisex", "Eau de Toilette", ["Gỗ", "Cam chanh"], "Mỹ", 1_190_000, V3),
        new("BLSSM", "Harbor Lane Blossom", "HL", Nu, "Nữ", "Eau de Toilette", ["Hoa cỏ", "Trái cây"], "Mỹ", 1_090_000, V3, OnSale: true),
        new("TRAM", "Lạc Hương Trầm", "LH", Uni, "Unisex", "Parfum", ["Gỗ", "Phương Đông"], "Việt Nam", 2_450_000, V2, IsNew: true, IsFeatured: true),
        new("SEN", "Lạc Hương Sen", "LH", Nu, "Nữ", "Eau de Parfum", ["Hoa cỏ"], "Việt Nam", 1_350_000, V3, IsBest: true),
        new("QUE", "Lạc Hương Quế", "LH", Nam, "Nam", "Eau de Parfum", ["Phương Đông", "Gỗ"], "Việt Nam", 1_550_000, V3),
        new("DISC", "Aurel Discovery Set", "MA", Gift, "Unisex", "Eau de Parfum", ["Gỗ", "Cam chanh"], "Pháp", 1_890_000, [], IsFeatured: true),
        new("DUO", "Étoile Duo Set", "NE", Gift, "Unisex", "Eau de Parfum", ["Hoa cỏ", "Gỗ"], "Pháp", 2_290_000, [], IsNew: true),
        new("TRIO", "Velora Trio Set", "VE", Gift, "Unisex", "Eau de Toilette", ["Trái cây", "Hoa cỏ"], "Ý", 1_990_000, [], IsFeatured: true, OnSale: true),
        new("MINI", "Solen Mini Set", "SO", Gift, "Unisex", "Eau de Cologne", ["Cam chanh", "Trái cây"], "Anh", 1_190_000, []),
        new("INTNS", "Aurel Nuit Intense", "MA", Nam, "Nam", "Parfum", ["Gỗ", "Phương Đông"], "Pháp", 2_450_000, V2),
    ];

    /// <summary>Gợi ý nốt hương (đầu, giữa, cuối) theo nhóm mùi; chỉ là mô tả minh hoạ.</summary>
    public static readonly Dictionary<string, (string Top, string Heart, string Base)> Notes = new()
    {
        ["Hoa cỏ"] = ("lá xanh, hoa nhài", "hoa hồng, linh lan", "xạ hương trắng"),
        ["Gỗ"] = ("tiêu đen, bergamot", "gỗ tuyết tùng, cỏ hương bài", "gỗ đàn hương, rêu sồi"),
        ["Cam chanh"] = ("chanh vàng, cam bergamot", "hoa cam, bạc hà", "gỗ nhẹ"),
        ["Phương Đông"] = ("nhục đậu khấu, quế", "hổ phách, hoa cam", "vani, nhựa thơm"),
        ["Xạ hương"] = ("hạt tiêu hồng", "hoa diên vĩ", "xạ hương, hổ phách xám"),
        ["Trái cây"] = ("lê, đào", "mận, hoa mẫu đơn", "đường nâu, gỗ trắng"),
    };

    public static readonly Dictionary<string, string> GenderPhrase = new()
    {
        ["Nam"] = "nam giới", ["Nữ"] = "nữ giới", ["Unisex"] = "mọi giới",
    };
}
