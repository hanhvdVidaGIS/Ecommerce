using Ccp.Application.Config;
using Ccp.Infrastructure.Seed;
using Ccp.Tests.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Ccp.Tests;

public sealed class DemoApiFactory : ApiFactory
{
    protected override void ConfigureWebHost(Microsoft.AspNetCore.Hosting.IWebHostBuilder builder)
    {
        base.ConfigureWebHost(builder);
        builder.UseSetting("Seed:Demo", "true");
    }
}

/// <summary>Kiểm tra dữ liệu mẫu bằng truy vấn trực tiếp trên cơ sở dữ liệu đã nạp, không dùng lại hằng số của bộ nạp.</summary>
public class DemoSeedTests(DemoApiFactory factory) : IClassFixture<DemoApiFactory>
{
    [Fact]
    public async Task Seeds_the_documented_volume_of_data()
    {
        await factory.WithDbAsync(async db =>
        {
            var products = await db.Products.CountAsync();
            Assert.InRange(products, 15, 30);                       // yêu cầu: khoảng 15–30 sản phẩm
            Assert.Equal(DemoData.Products.Length, products);
            Assert.Equal(DemoData.Brands.Length, await db.Brands.CountAsync());
            Assert.True(await db.Banners.CountAsync() >= 3);
            Assert.True(await db.Pages.CountAsync() >= 6);
            Assert.True(await db.ProductVariants.CountAsync() > products);
        });
    }

    [Fact]
    public async Task Every_product_is_complete_active_priced_with_image_brand_category_and_attributes()
    {
        await factory.WithDbAsync(async db =>
        {
            var products = await db.Products.Include(p => p.Variants).ThenInclude(v => v.OptionValues).Include(p => p.Images)
                .Include(p => p.AttributeAssignments).ThenInclude(a => a.Attribute).ToListAsync();
            Assert.All(products, p =>
            {
                Assert.Equal(Ccp.Domain.Enums.ProductStatus.Active, p.Status);
                Assert.NotNull(p.BrandId);
                Assert.NotNull(p.PrimaryCategoryId);
                Assert.True(p.Images.Count(i => i.IsPrimary) == 1, $"{p.Name}: cần đúng một ảnh chính");
                Assert.NotEmpty(p.Description!);
                Assert.True(p.Variants.Any(v => v.IsActive));
                Assert.Equal(p.Variants.Min(v => v.EffectivePrice), p.MinPrice);
                Assert.Equal(p.Variants.Max(v => v.EffectivePrice), p.MaxPrice);
                var codes = p.AttributeAssignments.Select(a => a.Attribute!.Code).ToHashSet();
                Assert.True(new[] { "gender", "concentration", "origin", "scent" }.All(codes.Contains), $"{p.Name}: thiếu thuộc tính");
            });
        });
    }

    [Fact]
    public async Task Variants_have_unique_skus_consistent_options_and_cost_below_price()
    {
        await factory.WithDbAsync(async db =>
        {
            var variants = await db.ProductVariants.Include(v => v.OptionValues).Include(v => v.Product).ToListAsync();
            Assert.Equal(variants.Count, variants.Select(v => v.Sku.ToLowerInvariant()).Distinct().Count());
            foreach (var group in variants.GroupBy(v => v.ProductId))
            {
                Assert.Equal(group.Count(), group.Select(v => v.OptionHash).Distinct().Count());
                Assert.Single(group.Select(v => string.Join(",", v.OptionValues.Select(o => o.AttributeId).Order())).Distinct());
                if (group.Count() == 1) Assert.True(group.Single().IsDefault);
            }
            Assert.All(variants, v =>
            {
                Assert.True(v.Price > 0 && v.StockQuantity >= 0);
                Assert.True(v.CostPrice < v.Price);
                Assert.True(v.SalePrice is null || v.SalePrice < v.Price);
                Assert.Equal(v.OptionValues.Count == 0, v.IsDefault);
            });
        });
    }

    [Fact]
    public async Task Hash_stored_for_each_variant_matches_a_recomputation_from_its_options()
    {
        await factory.WithDbAsync(async db =>
        {
            var variants = await db.ProductVariants.Include(v => v.OptionValues).Where(v => v.OptionValues.Any()).ToListAsync();
            Assert.NotEmpty(variants);
            Assert.All(variants, v => Assert.Equal(
                Ccp.Application.Catalog.ProductService.OptionHash(v.OptionValues.Select(o => new Ccp.Application.Catalog.VariantOptionDto(o.AttributeId, o.ValueId)).ToList()), v.OptionHash));
        });
    }

    [Fact]
    public async Task Gift_sets_have_one_default_variant_and_sizes_use_the_volume_option()
    {
        await factory.WithDbAsync(async db =>
        {
            var gift = await db.Products.Include(p => p.Variants).Where(p => p.PrimaryCategory!.Slug == "gift-set").ToListAsync();
            Assert.True(gift.Count >= 3);
            Assert.All(gift, p => Assert.True(p.Variants.Count == 1 && p.Variants[0].IsDefault));

            var perfume = await db.Products.Include(p => p.Variants).ThenInclude(v => v.OptionValues).ThenInclude(o => o.Attribute)
                .Where(p => p.PrimaryCategory!.Slug != "gift-set").ToListAsync();
            Assert.All(perfume.SelectMany(p => p.Variants).SelectMany(v => v.OptionValues), o => Assert.Equal("volume", o.Attribute!.Code));
        });
    }

    [Fact]
    public async Task Flags_for_new_best_seller_and_featured_are_populated_for_each_homepage_section()
    {
        await factory.WithDbAsync(async db =>
        {
            Assert.True(await db.Products.CountAsync(p => p.IsNew) >= 3);
            Assert.True(await db.Products.CountAsync(p => p.IsBestSeller) >= 3);
            Assert.True(await db.Products.CountAsync(p => p.IsFeatured) >= 3);
        });
    }

    [Fact]
    public async Task Every_media_row_has_a_real_file_with_matching_size_and_dimensions()
    {
        var checkedFiles = await factory.WithDbAsync(async db =>
        {
            var media = await db.Media.ToListAsync();
            Assert.True(media.Count > 60);
            foreach (var m in media)
            {
                var path = Path.Combine(factory.UploadsRoot, m.StorageKey);
                Assert.True(File.Exists(path), $"Thiếu tệp {m.StorageKey} của {m.FileName}");
                Assert.Equal(new FileInfo(path).Length, m.SizeBytes);
                Assert.True(m.Width > 0 && m.Height > 0);
            }
            return media.Count;
        });
        Assert.True(checkedFiles > 0);
    }

    [Fact]
    public async Task Every_media_in_use_is_referenced_by_exactly_what_the_seed_claims_and_none_is_orphaned_by_a_missing_row()
    {
        await factory.WithDbAsync(async db =>
        {
            var mediaIds = (await db.Media.Select(m => m.Id).ToListAsync()).ToHashSet();
            var refs = (await db.ProductImages.Select(i => (Guid?)i.MediaId).ToListAsync())
                .Concat(await db.Banners.Select(b => b.DesktopMediaId).ToListAsync())
                .Concat(await db.Banners.Select(b => b.MobileMediaId).ToListAsync())
                .Concat(await db.Brands.Select(b => b.LogoMediaId).ToListAsync())
                .Where(r => r.HasValue).Select(r => r!.Value).ToList();
            Assert.All(refs, r => Assert.Contains(r, mediaIds));
        });
    }

    [Fact]
    public async Task Site_configuration_matches_the_documented_example_and_is_served_publicly()
    {
        var site = await factory.NewClient().GetAsync("/api/public/site-config");
        var s = site.Data.GetProperty("settings");

        Assert.Equal("Luxury Perfume", s.GetProperty("general.siteName").GetString());
        Assert.Equal("Khẳng định phong cách riêng", s.GetProperty("general.slogan").GetString());
        Assert.Equal("#000000", s.GetProperty("theme.primaryColor").GetString());
        Assert.Equal("perfume", site.Data.GetProperty("businessType").GetProperty("code").GetString());
        Assert.Equal("Nước hoa", s.GetProperty("store.productLabel").GetString());
        Assert.StartsWith("/uploads/", site.Data.GetProperty("media").GetProperty("general.logo").GetProperty("url").GetString());

        var menuCodes = site.Data.GetProperty("menus").EnumerateArray().Select(m => m.GetProperty("code").GetString()).ToList();
        Assert.Contains("header", menuCodes);
        Assert.Contains("footer", menuCodes);
        var header = site.Data.GetProperty("menus").EnumerateArray().Single(m => m.GetProperty("code").GetString() == "header").GetProperty("items");
        Assert.Equal(["Trang chủ", "Nước hoa", "Thương hiệu", "Giới thiệu", "Liên hệ"], header.EnumerateArray().Select(i => i.GetProperty("title").GetString()!).ToArray());
        Assert.Equal(4, header[1].GetProperty("children").GetArrayLength());
        Assert.True(site.Data.GetProperty("banners").GetArrayLength() >= 3);
    }

    [Fact]
    public async Task Category_tree_and_attribute_assignments_come_from_the_business_type_preset()
    {
        var preset = BusinessTypePresets.All.Single(b => b.Code == "perfume").Preset;
        await factory.WithDbAsync(async db =>
        {
            var root = await db.Categories.SingleAsync(c => c.Slug == preset.Categories[0].Slug);
            var children = await db.Categories.Where(c => c.ParentId == root.Id).Select(c => c.Slug).ToListAsync();
            Assert.Equal(preset.Categories[0].Children!.Select(c => c.Slug).Order().ToList(), children.Order().ToList());
            var assigned = await db.CategoryAttributes.Where(x => x.CategoryId == root.Id).Select(x => x.Attribute!.Code).ToListAsync();
            Assert.Equal(preset.Categories[0].AttributeCodes!.Order().ToList(), assigned.Order().ToList());
        });
    }

    [Fact]
    public async Task Running_the_seeder_again_changes_nothing()
    {
        (int Products, int Media, int Brands, int Pages, int Banners, int Shipping, int Coupons) Counts(Ccp.Infrastructure.Persistence.CcpDbContext db) =>
            (db.Products.Count(), db.Media.Count(), db.Brands.Count(), db.Pages.Count(), db.Banners.Count(), db.ShippingRates.Count(), db.Coupons.Count());
        var before = await factory.WithDbAsync(db => Task.FromResult(Counts(db)));

        using (var scope = factory.Services.CreateScope())
            await scope.ServiceProvider.GetRequiredService<DemoSeeder>().RunAsync();

        Assert.Equal(before, await factory.WithDbAsync(db => Task.FromResult(Counts(db))));
    }

    [Fact]
    public async Task Seeds_shipping_rates_and_coupons_that_work_in_the_cart()
    {
        await factory.WithDbAsync(async db =>
        {
            Assert.True(await db.ShippingRates.AnyAsync(r => r.ProvinceCode == null && r.IsActive), "cần một mức phí mặc định cho mọi tỉnh");
            Assert.Contains("WELCOME10", await db.Coupons.Select(c => c.Code).ToListAsync());
        });
        // Mã mẫu áp được vào giỏ thật (kiểm bằng API công khai, không gọi thẳng dịch vụ).
        var guest = factory.NewClient();
        var product = (await guest.GetAsync("/api/public/products?pageSize=1")).Data[0].GetProperty("slug").GetString();
        var variant = (await guest.GetAsync($"/api/public/products/{product}")).Data.GetProperty("variants")[0].GetProperty("id").GetGuid();
        Assert.True((await guest.PostAsync("/api/cart/items", new { variantId = variant, quantity = 3 })).Success);
        var applied = await guest.PostAsync("/api/cart/coupon", new { code = "welcome10" });
        Assert.True(applied.Success, applied.Body.ToString());
        Assert.True(applied.Data.GetProperty("discount").GetDecimal() > 0);
    }

    [Fact]
    public async Task Admin_api_lists_the_seeded_catalog_with_costs_for_super_admin()
    {
        var admin = await factory.NewAdminClientAsync();
        var list = await admin.GetAsync("/api/admin/products?pageSize=100&sort=name:asc");

        Assert.Equal(DemoData.Products.Length, list.Meta.GetProperty("total").GetInt32());
        var first = list.Data[0];
        var detail = await admin.GetAsync($"/api/admin/products/{first.GetProperty("id").GetGuid()}");
        Assert.True(detail.Data.GetProperty("canViewCost").GetBoolean());
        Assert.NotEqual(System.Text.Json.JsonValueKind.Null, detail.Data.GetProperty("variants")[0].GetProperty("costPrice").ValueKind);
        Assert.True(detail.Data.GetProperty("images").GetArrayLength() >= 2);
    }

    [Fact]
    public async Task Seeded_product_can_be_edited_and_saved_back_through_the_public_admin_contract()
    {
        var admin = await factory.NewAdminClientAsync();
        var list = await admin.GetAsync("/api/admin/products?q=Nuit No.1&pageSize=5");
        var detail = await admin.GetAsync($"/api/admin/products/{list.Data[0].GetProperty("id").GetGuid()}");
        var d = detail.Data;

        var payload = new Dictionary<string, object?>
        {
            ["name"] = d.GetProperty("name").GetString(), ["slug"] = d.GetProperty("slug").GetString(),
            ["primaryCategoryId"] = d.GetProperty("primaryCategoryId").GetGuid(), ["brandId"] = d.GetProperty("brandId").GetGuid(),
            ["description"] = d.GetProperty("description").GetString(), ["status"] = d.GetProperty("status").GetString(),
            ["isFeatured"] = true, ["isBestSeller"] = true, ["isNew"] = true,
            ["images"] = d.GetProperty("images").EnumerateArray().Select(i => new { mediaId = i.GetProperty("mediaId").GetGuid(), isPrimary = i.GetProperty("isPrimary").GetBoolean() }).ToList(),
            ["attributes"] = d.GetProperty("attributes").EnumerateArray().Select(a => new
            {
                attributeId = a.GetProperty("attributeId").GetGuid(),
                valueIds = a.GetProperty("valueIds").EnumerateArray().Select(v => v.GetGuid()).ToList(),
            }).ToList(),
            ["variants"] = d.GetProperty("variants").EnumerateArray().Select(v => new
            {
                id = v.GetProperty("id").GetGuid(), sku = v.GetProperty("sku").GetString(), price = v.GetProperty("price").GetDecimal(),
                salePrice = v.GetProperty("salePrice").ValueKind == System.Text.Json.JsonValueKind.Null ? (decimal?)null : v.GetProperty("salePrice").GetDecimal(),
                costPrice = v.GetProperty("costPrice").GetDecimal(), stockQuantity = v.GetProperty("stockQuantity").GetInt32(), isActive = true,
                options = v.GetProperty("options").EnumerateArray().Select(o => new { attributeId = o.GetProperty("attributeId").GetGuid(), valueId = o.GetProperty("valueId").GetGuid() }).ToList(),
            }).ToList(),
        };
        var r = await admin.PutAsync($"/api/admin/products/{d.GetProperty("id").GetGuid()}", payload);

        Assert.True(r.Success, r.Body.ToString());
        Assert.Equal(d.GetProperty("variants").GetArrayLength(), r.Data.GetProperty("variants").GetArrayLength());
    }
}
