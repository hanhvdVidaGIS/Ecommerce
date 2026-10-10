using Ccp.Application.Abstractions;
using Ccp.Application.Common;
using Ccp.Application.Config;
using Ccp.Application.MediaLibrary;
using Ccp.Domain.Entities;
using Ccp.Domain.Enums;
using Ccp.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using MediaEntity = Ccp.Domain.Entities.Media;

namespace Ccp.Infrastructure.Seed;

/// <summary>
/// Dữ liệu mẫu ngành nước hoa: cấu hình website, danh mục/thuộc tính (từ Business Type), thương hiệu, sản phẩm và biến thể,
/// banner, section trang chủ, trang nội dung, menu. Idempotent: bỏ qua nếu thương hiệu mẫu đã tồn tại.
/// </summary>
public sealed class DemoSeeder(CcpDbContext db, IStorageService storage, BusinessTypeService businessTypes, SettingsService settings,
    TimeProvider clock, ILogger<DemoSeeder> logger)
{
    private static readonly string AssetRoot = Path.Combine(AppContext.BaseDirectory, "Seed", "DemoAssets");
    private readonly Random _random = new(2026);

    public async Task RunAsync(CancellationToken ct = default)
    {
        if (await db.Brands.AnyAsync(b => b.Slug == DemoData.Brands[0].Slug, ct))
        {
            // Cơ sở dữ liệu tạo từ giai đoạn 1 chưa có vận chuyển/mã giảm giá: bổ sung mà không nạp lại phần còn lại.
            if (!await db.ShippingRates.AnyAsync(ct) && !await db.Coupons.AnyAsync(ct))
            {
                SeedCommerce();
                await db.SaveChangesAsync(ct);
                logger.LogInformation("Đã bổ sung phí vận chuyển và mã giảm giá mẫu.");
            }
            logger.LogInformation("Dữ liệu mẫu đã tồn tại, bỏ qua.");
            return;
        }
        if (!Directory.Exists(AssetRoot)) throw new DirectoryNotFoundException($"Thiếu thư mục ảnh mẫu: {AssetRoot}");

        await businessTypes.ApplyAsync("perfume", applyLabels: true, dryRun: false, ct);
        var site = await SeedSiteSettingsAsync(ct);
        var brands = await SeedBrandsAsync(ct);
        await SeedProductsAsync(brands, ct);
        await SeedBannersAsync(ct);
        await SeedSectionsAsync(ct);
        var pages = await SeedPagesAsync(ct);
        await SeedMenusAsync(pages, ct);
        SeedCommerce();
        await db.SaveChangesAsync(ct);
        logger.LogInformation("Đã nạp dữ liệu mẫu nước hoa: {Brands} thương hiệu, {Products} sản phẩm.", DemoData.Brands.Length, DemoData.Products.Length);
    }

    // ---------- vận chuyển và mã giảm giá ----------
    private void SeedCommerce()
    {
        // Mã tỉnh theo Quyết định 19/2025/QĐ-TTg: 01 Hà Nội, 79 TP. Hồ Chí Minh, 48 Đà Nẵng.
        db.ShippingRates.AddRange(
            new ShippingRate { Name = "Giao tiêu chuẩn toàn quốc", Fee = 35_000, FreeShipThreshold = 1_500_000, SortOrder = 10 },
            new ShippingRate { Name = "Nội thành Hà Nội", ProvinceCode = "01", Fee = 20_000, FreeShipThreshold = 1_000_000, SortOrder = 1 },
            new ShippingRate { Name = "Nội thành TP. Hồ Chí Minh", ProvinceCode = "79", Fee = 20_000, FreeShipThreshold = 1_000_000, SortOrder = 2 },
            new ShippingRate { Name = "Đà Nẵng", ProvinceCode = "48", Fee = 25_000, FreeShipThreshold = 1_200_000, SortOrder = 3 });
        var start = DateTime.UtcNow.Date;
        db.Coupons.AddRange(
            new Coupon { Code = "WELCOME10", Type = CouponType.Percent, Value = 10, MinOrderAmount = 500_000, MaxDiscount = 200_000, PerUserLimit = 1, StartAt = start, EndAt = start.AddYears(1) },
            new Coupon { Code = "GIAM100K", Type = CouponType.FixedAmount, Value = 100_000, MinOrderAmount = 1_000_000, UsageLimit = 500, StartAt = start, EndAt = start.AddYears(1) },
            new Coupon { Code = "FREESHIP", Type = CouponType.FreeShipping, MinOrderAmount = 300_000, StartAt = start, EndAt = start.AddYears(1) });
    }

    // ---------- cấu hình website ----------
    private async Task<bool> SeedSiteSettingsAsync(CancellationToken ct)
    {
        var logo = await AddMediaAsync("site/logo.png", "site", "Logo Luxury Perfume", ct);
        var favicon = await AddMediaAsync("site/favicon.png", "site", "Favicon", ct);
        await settings.SetInternalAsync(new Dictionary<string, string>
        {
            [SettingKeys.SiteName] = "Luxury Perfume",
            [SettingKeys.Slogan] = "Khẳng định phong cách riêng",
            [SettingKeys.Description] = "Cửa hàng nước hoa chính hãng, tuyển chọn hương thơm cho từng phong cách.",
            [SettingKeys.Logo] = logo.Id.ToString(),
            [SettingKeys.Favicon] = favicon.Id.ToString(),
            [SettingKeys.PrimaryColor] = "#000000",
            [SettingKeys.SecondaryColor] = "#B8860B",
            [SettingKeys.FontFamily] = "Be Vietnam Pro",
            [SettingKeys.Email] = "lienhe@luxuryperfume.example",
            [SettingKeys.Phone] = "1900 0000",
            [SettingKeys.Address] = "123 Đường Mẫu, Quận 1, TP. Hồ Chí Minh (địa chỉ minh hoạ)",
            [SettingKeys.Facebook] = "https://facebook.com/luxuryperfume.demo",
            [SettingKeys.TikTok] = "https://tiktok.com/@luxuryperfume.demo",
            [SettingKeys.Instagram] = "https://instagram.com/luxuryperfume.demo",
            [SettingKeys.Zalo] = "https://zalo.me/0000000000",
            [SettingKeys.FooterText] = "Luxury Perfume – nơi hội tụ những mùi hương đẳng cấp.",
            [SettingKeys.Copyright] = "© 2026 Luxury Perfume. Bảo lưu mọi quyền.",
            [SettingKeys.StoreName] = "Công ty TNHH Luxury Perfume (minh hoạ)",
            [SettingKeys.SeoTitle] = "Luxury Perfume – Nước hoa chính hãng",
            [SettingKeys.SeoDescription] = "Mua nước hoa nam, nữ, unisex và gift set. Giao hàng toàn quốc.",
            [SettingKeys.BankAccount] = "{\"bank\":\"Ngân hàng Mẫu\",\"accountNumber\":\"0000000000\",\"accountName\":\"LUXURY PERFUME\"}",
        }, ct);
        await db.SaveChangesAsync(ct);
        return true;
    }

    // ---------- thương hiệu ----------
    private async Task<Dictionary<string, Brand>> SeedBrandsAsync(CancellationToken ct)
    {
        var result = new Dictionary<string, Brand>();
        var order = 0;
        foreach (var b in DemoData.Brands)
        {
            var logo = await AddMediaAsync($"brands/{b.Code.ToLowerInvariant()}.png", "brands", b.Name, ct);
            var brand = new Brand { Name = b.Name, Slug = b.Slug, Description = b.Description, LogoMediaId = logo.Id, SortOrder = order += 10 };
            db.Brands.Add(brand);
            result[b.Code] = brand;
        }
        await db.SaveChangesAsync(ct);
        return result;
    }

    // ---------- sản phẩm ----------
    private async Task SeedProductsAsync(Dictionary<string, Brand> brands, CancellationToken ct)
    {
        var categories = await db.Categories.ToDictionaryAsync(c => c.Slug, ct);
        var attrs = await db.ProductAttributes.Include(a => a.Values).Where(a => new[] { "gender", "volume", "concentration", "scent", "origin" }.Contains(a.Code))
            .ToDictionaryAsync(a => a.Code, ct);

        ProductAttributeValue Value(string code, string label) =>
            attrs[code].Values.Single(v => v.Code == Slugger.Slugify(label));

        for (var i = 0; i < DemoData.Products.Length; i++)
        {
            var d = DemoData.Products[i];
            var index = i + 1;
            var brand = brands[d.BrandCode];
            var product = new Product
            {
                Name = d.Name, Slug = Slugger.Slugify(d.Name), PrimaryCategoryId = categories[d.CategorySlug].Id, BrandId = brand.Id,
                ShortDescription = $"{d.Name} – {d.Concentration}, hương {string.Join(" và ", d.Scents.Select(s => s.ToLowerInvariant()))} dành cho {DemoData.GenderPhrase[d.Gender]}.",
                Description = Describe(d), Status = ProductStatus.Active, IsNew = d.IsNew, IsBestSeller = d.IsBest, IsFeatured = d.IsFeatured,
                SoldCount = d.IsBest ? 120 + _random.Next(0, 200) : _random.Next(0, 80),
            };
            product.Seo.MetaTitle = $"{d.Name} – {brand.Name}";
            product.Seo.MetaDescription = product.ShortDescription;

            // ảnh: hai góc nhìn cho mỗi sản phẩm
            var imageA = await AddMediaAsync($"products/p{index:00}-a.jpg", "products", $"{d.Name} – mặt trước", ct);
            var imageB = await AddMediaAsync($"products/p{index:00}-b.jpg", "products", $"{d.Name} – góc nghiêng", ct);
            product.Images.Add(new ProductImage { ProductId = product.Id, MediaId = imageA.Id, SortOrder = 10, IsPrimary = true });
            product.Images.Add(new ProductImage { ProductId = product.Id, MediaId = imageB.Id, SortOrder = 20 });

            // thuộc tính mô tả
            AddAssignment(product, attrs["gender"], Value("gender", d.Gender));
            AddAssignment(product, attrs["concentration"], Value("concentration", d.Concentration));
            AddAssignment(product, attrs["origin"], Value("origin", d.Origin));
            foreach (var scent in d.Scents) AddAssignment(product, attrs["scent"], Value("scent", scent));

            // biến thể theo dung tích (hoặc một biến thể mặc định cho gift set)
            if (d.Volumes.Length == 0)
            {
                product.Variants.Add(NewVariant(product, $"{d.BrandCode}-{d.Code}", d.Base50, d.OnSale, []));
            }
            else
            {
                foreach (var vol in d.Volumes)
                {
                    var factor = vol switch { "30ml" => 0.65m, "50ml" => 1m, "100ml" => 1.6m, _ => 2.2m };
                    var price = Math.Round(d.Base50 * factor / 10_000m) * 10_000m;
                    var volumeValue = Value("volume", vol);
                    product.Variants.Add(NewVariant(product, $"{d.BrandCode}-{d.Code}-{vol.Replace("ml", "")}", price, d.OnSale && vol == "100ml",
                        [new VariantOptionValue { AttributeId = attrs["volume"].Id, ValueId = volumeValue.Id }]));
                }
            }
            var prices = product.Variants.Select(v => v.EffectivePrice).ToList();
            product.MinPrice = prices.Min(); product.MaxPrice = prices.Max();
            db.Products.Add(product);
        }
        await db.SaveChangesAsync(ct);
    }

    private ProductVariant NewVariant(Product product, string sku, decimal price, bool onSale, List<VariantOptionValue> options)
    {
        var variant = new ProductVariant
        {
            ProductId = product.Id, Sku = sku, Price = price, SalePrice = onSale ? Math.Round(price * 0.9m / 1_000m) * 1_000m : null,
            CostPrice = Math.Round(price * 0.55m / 1_000m) * 1_000m, StockQuantity = _random.Next(0, 12) == 0 ? 0 : _random.Next(5, 60),
            IsDefault = options.Count == 0, IsActive = true,
        };
        foreach (var o in options) { o.VariantId = variant.Id; variant.OptionValues.Add(o); }
        variant.OptionHash = options.Count == 0 ? "" : Application.Catalog.ProductService.OptionHash(options.Select(o => new Application.Catalog.VariantOptionDto(o.AttributeId, o.ValueId)).ToList());
        return variant;
    }

    private static void AddAssignment(Product p, ProductAttribute attr, ProductAttributeValue value) =>
        p.AttributeAssignments.Add(new ProductAttributeAssignment { ProductId = p.Id, AttributeId = attr.Id, ValueId = value.Id });

    private static string Describe(DemoProduct d)
    {
        string Pick(Func<(string Top, string Heart, string Base), string> f) =>
            string.Join(", ", d.Scents.Select(s => f(DemoData.Notes[s])).Distinct());
        return $"<p><strong>{d.Name}</strong> là dòng {d.Concentration} dành cho {DemoData.GenderPhrase[d.Gender]}, xuất xứ {d.Origin}.</p>" +
               "<ul>" +
               $"<li><strong>Hương đầu:</strong> {Pick(n => n.Top)}</li>" +
               $"<li><strong>Hương giữa:</strong> {Pick(n => n.Heart)}</li>" +
               $"<li><strong>Hương cuối:</strong> {Pick(n => n.Base)}</li>" +
               "</ul>" +
               "<p><em>Sản phẩm minh hoạ; thương hiệu và mô tả là hư cấu phục vụ demo.</em></p>";
    }

    // ---------- banner, section ----------
    private async Task SeedBannersAsync(CancellationToken ct)
    {
        (string Key, string Title, string Sub, string Button, string Url, string Placement)[] items =
        [
            ("hero1", "Bộ sưu tập Mùa hè", "Hương cam chanh tươi mát", "Mua ngay", "/products?category=nuoc-hoa-unisex", "hero"),
            ("hero2", "Hương mới 2026", "Gỗ và xạ hương ấm áp", "Khám phá", "/products?sort=newest", "hero"),
            ("hero3", "Quà tặng cao cấp", "Gift Set cho người đặc biệt", "Xem Gift Set", "/products?category=gift-set", "hero"),
            ("promo1", "Ưu đãi thành viên", "Giảm đến 15% cho đơn đầu tiên", "Đăng ký ngay", "/register", "promo"),
            ("promo2", "Miễn phí vận chuyển", "Cho đơn từ 1.000.000đ", "Xem chính sách", "/pages/chinh-sach-van-chuyen", "promo"),
        ];
        var order = 0;
        foreach (var b in items)
        {
            var desktop = await AddMediaAsync($"banners/{b.Key}-desktop.jpg", "banners", b.Title, ct);
            var mobile = await AddMediaAsync($"banners/{b.Key}-mobile.jpg", "banners", b.Title, ct);
            db.Banners.Add(new Banner
            {
                Title = b.Title, Subtitle = b.Sub, ButtonText = b.Button, ButtonUrl = b.Url, Placement = b.Placement,
                DesktopMediaId = desktop.Id, MobileMediaId = mobile.Id, Status = PublishStatus.Published, SortOrder = order += 10,
            });
        }
        await db.SaveChangesAsync(ct);
    }

    private async Task SeedSectionsAsync(CancellationToken ct)
    {
        var sections = await db.HomepageSections.ToListAsync(ct);
        void Set(HomepageSectionType type, string? title, string? subtitle, string config, bool? active = null)
        {
            var s = sections.First(x => x.Type == type);
            if (title is not null) s.Title = title;
            if (subtitle is not null) s.Subtitle = subtitle;
            s.ConfigJson = config;
            if (active is not null) s.IsActive = active.Value;
        }
        Set(HomepageSectionType.Hero, null, null, "{\"autoplay\":true,\"intervalMs\":6000}", true);
        Set(HomepageSectionType.FeaturedCategories, "Danh mục nổi bật", "Chọn theo phong cách của bạn", "{\"limit\":4}");
        Set(HomepageSectionType.NewProducts, "Nước hoa mới về", "Những mùi hương vừa cập bến", "{\"limit\":8,\"viewAllUrl\":\"/products?sort=newest\"}");
        Set(HomepageSectionType.BestSellers, "Nước hoa bán chạy", "Được yêu thích nhất", "{\"limit\":8,\"viewAllUrl\":\"/products?sort=bestseller\"}");
        Set(HomepageSectionType.FeaturedProducts, "Lựa chọn nổi bật", null, "{\"limit\":8}");
        Set(HomepageSectionType.Brands, "Thương hiệu", "Tuyển chọn từ các nhà hương", "{\"limit\":7}");
        Set(HomepageSectionType.PromoBanners, "Ưu đãi", null, "{\"placement\":\"promo\"}", true);
        await db.SaveChangesAsync(ct);
    }

    // ---------- trang nội dung, menu ----------
    private async Task<Dictionary<string, Page>> SeedPagesAsync(CancellationToken ct)
    {
        const string note = "<p><em>Nội dung mẫu phục vụ demo; cần thay bằng thông tin thật của cửa hàng.</em></p>";
        (string Title, string Slug, string Body)[] defs =
        [
            ("Giới thiệu", "gioi-thieu", "<h2>Về Luxury Perfume</h2><p>Luxury Perfume tuyển chọn những mùi hương cho từng phong cách, từ nước hoa nam, nữ đến unisex và các bộ quà tặng.</p>"),
            ("Liên hệ", "lien-he", "<h2>Liên hệ</h2><p>Email: lienhe@luxuryperfume.example</p><p>Điện thoại: 1900 0000</p><p>Giờ làm việc: 8:30 – 21:00 hằng ngày.</p>"),
            ("Chính sách vận chuyển", "chinh-sach-van-chuyen", "<h2>Chính sách vận chuyển</h2><p>Giao hàng toàn quốc trong 2–5 ngày làm việc. Miễn phí vận chuyển cho đơn từ 1.000.000đ.</p>"),
            ("Chính sách đổi trả", "chinh-sach-doi-tra", "<h2>Chính sách đổi trả</h2><p>Đổi trả trong 7 ngày nếu sản phẩm lỗi do nhà cung cấp, còn nguyên tem và hộp.</p>"),
            ("Chính sách bảo mật", "chinh-sach-bao-mat", "<h2>Chính sách bảo mật</h2><p>Thông tin khách hàng chỉ được dùng để xử lý đơn hàng và chăm sóc khách hàng.</p>"),
            ("Điều khoản sử dụng", "dieu-khoan-su-dung", "<h2>Điều khoản sử dụng</h2><p>Khi sử dụng website, bạn đồng ý với các điều khoản mua bán được nêu tại đây.</p>"),
            ("Câu hỏi thường gặp", "faq", "<h2>Câu hỏi thường gặp</h2><h3>Sản phẩm có chính hãng không?</h3><p>Toàn bộ sản phẩm trong dữ liệu mẫu là hư cấu.</p><h3>Thời gian giao hàng?</h3><p>2–5 ngày làm việc.</p>"),
        ];
        var result = new Dictionary<string, Page>();
        foreach (var d in defs)
        {
            var page = new Page { Title = d.Title, Slug = d.Slug, Content = d.Body + note, Status = PublishStatus.Published };
            page.Seo.MetaTitle = $"{d.Title} – Luxury Perfume";
            db.Pages.Add(page);
            result[d.Slug] = page;
        }
        await db.SaveChangesAsync(ct);
        return result;
    }

    private async Task SeedMenusAsync(Dictionary<string, Page> pages, CancellationToken ct)
    {
        var cats = await db.Categories.Where(c => new[] { "nuoc-hoa", "nuoc-hoa-nam", "nuoc-hoa-nu", "nuoc-hoa-unisex", "gift-set" }.Contains(c.Slug)).ToDictionaryAsync(c => c.Slug, ct);
        var header = await db.Menus.Include(m => m.Items).SingleAsync(m => m.Code == "header", ct);
        var footer = await db.Menus.Include(m => m.Items).SingleAsync(m => m.Code == "footer", ct);
        foreach (var old in header.Items.Concat(footer.Items).ToList()) db.MenuItems.Remove(old);
        await db.SaveChangesAsync(ct);

        MenuItem Item(Menu menu, string title, string type, Guid? target, string? url, int order, Guid? parent = null) =>
            new() { MenuId = menu.Id, Title = title, TargetType = type, TargetId = target, Url = url, SortOrder = order, ParentId = parent };

        db.MenuItems.Add(Item(header, "Trang chủ", "Url", null, "/", 10));
        var root = Item(header, "Nước hoa", "Category", cats["nuoc-hoa"].Id, null, 20);
        db.MenuItems.Add(root);
        db.MenuItems.Add(Item(header, "Nước hoa nam", "Category", cats["nuoc-hoa-nam"].Id, null, 10, root.Id));
        db.MenuItems.Add(Item(header, "Nước hoa nữ", "Category", cats["nuoc-hoa-nu"].Id, null, 20, root.Id));
        db.MenuItems.Add(Item(header, "Nước hoa unisex", "Category", cats["nuoc-hoa-unisex"].Id, null, 30, root.Id));
        db.MenuItems.Add(Item(header, "Gift Set", "Category", cats["gift-set"].Id, null, 40, root.Id));
        db.MenuItems.Add(Item(header, "Thương hiệu", "Url", null, "/brands", 30));
        db.MenuItems.Add(Item(header, "Giới thiệu", "Page", pages["gioi-thieu"].Id, null, 40));
        db.MenuItems.Add(Item(header, "Liên hệ", "Page", pages["lien-he"].Id, null, 50));

        var order = 0;
        foreach (var slug in new[] { "chinh-sach-van-chuyen", "chinh-sach-doi-tra", "chinh-sach-bao-mat", "dieu-khoan-su-dung", "faq" })
            db.MenuItems.Add(Item(footer, pages[slug].Title, "Page", pages[slug].Id, null, order += 10));
        await db.SaveChangesAsync(ct);
    }

    // ---------- tệp ----------
    private async Task<MediaEntity> AddMediaAsync(string relative, string folder, string alt, CancellationToken ct)
    {
        var path = Path.Combine(AssetRoot, relative.Replace('/', Path.DirectorySeparatorChar));
        var bytes = await File.ReadAllBytesAsync(path, ct);
        var sniffed = ImageInspector.Detect(bytes) ?? throw new InvalidOperationException($"Ảnh mẫu không hợp lệ: {relative}");
        var ext = Path.GetExtension(path).ToLowerInvariant();
        var now = clock.GetUtcNow().UtcDateTime;
        var key = $"{now:yyyy}/{now:MM}/{Guid.NewGuid():N}{ext}";
        await using var stream = new MemoryStream(bytes);
        var stored = await storage.SaveAsync(key, stream, ext == ".png" ? "image/png" : "image/jpeg", ct);
        var media = new MediaEntity
        {
            StorageKey = stored.Key, Provider = stored.Provider, FileName = Path.GetFileName(path), SizeBytes = stored.SizeBytes,
            MimeType = ext == ".png" ? "image/png" : "image/jpeg", Width = sniffed.Width, Height = sniffed.Height, Kind = "image", Folder = folder, AltText = alt,
        };
        db.Media.Add(media);
        return media;
    }
}
