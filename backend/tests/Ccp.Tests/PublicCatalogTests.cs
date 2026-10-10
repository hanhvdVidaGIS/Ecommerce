using System.Net;
using System.Text.Json;
using Ccp.Domain.Enums;
using Ccp.Tests.Infrastructure;
using Microsoft.EntityFrameworkCore;
using static Ccp.Tests.Infrastructure.CatalogApi;

namespace Ccp.Tests;

[Collection(DemoCollection.Name)]
public class PublicCatalogTests(DemoApiFactory factory)
{
    private TestClient Anon() => factory.NewClient();

    private static List<JsonElement> Items(ApiResult r) => r.Data.EnumerateArray().ToList();
    private static int Total(ApiResult r) => r.Meta.GetProperty("total").GetInt32();

    private async Task<int> VisibleCountAsync() => await factory.WithDbAsync(db =>
        db.Products.CountAsync(p => p.Status == ProductStatus.Active && p.Variants.Any(v => v.IsActive)));

    // ---------- danh mục ----------
    [Fact]
    public async Task Category_tree_counts_come_from_visible_products_and_roll_up_to_parents()
    {
        var tree = Items(await Anon().GetAsync("/api/public/categories"));
        var root = tree.Single(c => c.GetProperty("slug").GetString() == "nuoc-hoa");
        var children = root.GetProperty("children").EnumerateArray().ToList();

        Assert.Equal(4, children.Count);
        Assert.Equal(children.Sum(c => c.GetProperty("productCount").GetInt32()), root.GetProperty("productCount").GetInt32());
        foreach (var child in children)
        {
            var slug = child.GetProperty("slug").GetString();
            var listed = Total(await Anon().GetAsync($"/api/public/products?category={slug}&pageSize=1"));
            Assert.Equal(child.GetProperty("productCount").GetInt32(), listed);
        }
    }

    [Fact]
    public async Task Category_detail_has_breadcrumb_children_and_unknown_slug_is_404()
    {
        var r = await Anon().GetAsync("/api/public/categories/nuoc-hoa-nam");
        Assert.Equal(["Nước hoa", "Nước hoa nam"], r.Data.GetProperty("breadcrumb").EnumerateArray().Select(b => b.GetProperty("name").GetString()!).ToArray());

        var root = await Anon().GetAsync("/api/public/categories/nuoc-hoa");
        Assert.Equal(4, root.Data.GetProperty("children").GetArrayLength());
        Assert.Equal(HttpStatusCode.NotFound, (await Anon().GetAsync("/api/public/categories/khong-co")).Status);
    }

    // ---------- danh sách ----------
    [Fact]
    public async Task Listing_is_anonymous_paged_and_page_size_is_capped()
    {
        var all = await Anon().GetAsync("/api/public/products?pageSize=5&page=2");
        Assert.True(all.Success);
        Assert.Equal(await VisibleCountAsync(), Total(all));
        Assert.Equal(5, all.Data.GetArrayLength());
        Assert.Equal(2, all.Meta.GetProperty("page").GetInt32());
        Assert.Equal(60, (await Anon().GetAsync("/api/public/products?pageSize=100000")).Meta.GetProperty("pageSize").GetInt32());
        Assert.Equal(HttpStatusCode.BadRequest, (await Anon().GetAsync("/api/public/products?sort=costPrice")).Status);
    }

    [Fact]
    public async Task Cards_never_expose_cost_or_exact_stock()
    {
        var body = (await Anon().GetAsync("/api/public/products?pageSize=60")).Body.ToString();
        foreach (var secret in new[] { "costPrice", "stockQuantity", "cost" })
            Assert.DoesNotContain(secret, body, StringComparison.OrdinalIgnoreCase);
    }

    [Theory]
    [InlineData("etoile")]
    [InlineData("ÉTOILE")]
    [InlineData("Étoile Midnight")]
    [InlineData("midnight etoile")]
    [InlineData("MA-NUIT1")]
    [InlineData("casa ambra")]
    [InlineData("nuoc hoa nu")]
    public async Task Search_ignores_case_diacritics_and_matches_name_sku_brand_category(string q)
    {
        var r = await Anon().GetAsync($"/api/public/products?q={Uri.EscapeDataString(q)}&pageSize=60");

        Assert.True(Total(r) >= 1, $"Không tìm thấy gì cho \"{q}\"");
    }

    [Fact]
    public async Task Search_terms_are_all_required_and_wildcards_are_escaped()
    {
        var both = Total(await Anon().GetAsync("/api/public/products?q=aurel%20soleil"));
        var onlyAurel = Total(await Anon().GetAsync("/api/public/products?q=aurel"));
        Assert.Equal(1, both);
        Assert.True(onlyAurel > both);

        Assert.Equal(0, Total(await Anon().GetAsync("/api/public/products?q=zzzkhongco")));
        // % và _ không được thành ký tự đại diện (nếu không sẽ khớp mọi sản phẩm)
        Assert.Equal(0, Total(await Anon().GetAsync("/api/public/products?q=%25")));
        Assert.Equal(0, Total(await Anon().GetAsync("/api/public/products?q=_")));
        Assert.Equal(0, Total(await Anon().GetAsync("/api/public/products?q=%27%3B%20drop%20table%20products%3B--")));
    }

    [Fact]
    public async Task Descriptive_attribute_filter_matches_database_assignments()
    {
        var r = await Anon().GetAsync("/api/public/products?attr.gender=nam&pageSize=60");
        var ids = Items(r).Select(i => i.GetProperty("id").GetGuid()).ToHashSet();

        var expected = await factory.WithDbAsync(db => db.ProductAttributeAssignments
            .Where(a => a.Attribute!.Code == "gender" && a.Value!.Code == "nam" && a.Product!.Status == ProductStatus.Active).Select(a => a.ProductId).Distinct().ToListAsync());
        Assert.NotEmpty(expected);
        Assert.Equal(expected.ToHashSet(), ids);
    }

    [Fact]
    public async Task Variant_option_filter_uses_active_variants_and_combines_with_and_across_attributes()
    {
        var volume = await Anon().GetAsync("/api/public/products?attr.volume=30ml&pageSize=60");
        var expected = await factory.WithDbAsync(db => db.VariantOptionValues
            .Where(o => o.Attribute!.Code == "volume" && o.Value!.Code == "30ml" && o.Variant!.IsActive).Select(o => o.Variant!.ProductId).Distinct().ToListAsync());
        Assert.Equal(expected.ToHashSet(), Items(volume).Select(i => i.GetProperty("id").GetGuid()).ToHashSet());

        var combined = Total(await Anon().GetAsync("/api/public/products?attr.volume=30ml&attr.gender=nam"));
        Assert.True(combined < Total(volume));
        // OR trong cùng một thuộc tính
        var either = Total(await Anon().GetAsync("/api/public/products?attr.gender=nam,nu"));
        Assert.Equal(Total(await Anon().GetAsync("/api/public/products?attr.gender=nam")) + Total(await Anon().GetAsync("/api/public/products?attr.gender=nu")), either);
    }

    [Fact]
    public async Task Unknown_attribute_is_ignored_and_unknown_value_gives_empty_result()
    {
        var total = await VisibleCountAsync();
        Assert.Equal(total, Total(await Anon().GetAsync("/api/public/products?attr.khong-co=x")));
        Assert.Equal(0, Total(await Anon().GetAsync("/api/public/products?attr.gender=khong-co")));
    }

    [Fact]
    public async Task Price_brand_and_flag_filters_and_sorting_behave()
    {
        var priced = Items(await Anon().GetAsync("/api/public/products?priceMin=1000000&priceMax=1500000&pageSize=60"));
        Assert.NotEmpty(priced);
        Assert.All(priced, p =>
        {
            Assert.True(p.GetProperty("maxPrice").GetDecimal() >= 1_000_000);
            Assert.True(p.GetProperty("minPrice").GetDecimal() <= 1_500_000);
        });

        var asc = Items(await Anon().GetAsync("/api/public/products?sort=price_asc&pageSize=60")).Select(p => p.GetProperty("minPrice").GetDecimal()).ToList();
        Assert.Equal(asc.Order().ToList(), asc);
        var desc = Items(await Anon().GetAsync("/api/public/products?sort=price_desc&pageSize=60")).Select(p => p.GetProperty("minPrice").GetDecimal()).ToList();
        Assert.Equal(desc.OrderDescending().ToList(), desc);

        var brand = Items(await Anon().GetAsync("/api/public/products?brand=velora&pageSize=60"));
        Assert.NotEmpty(brand);
        Assert.All(brand, p => Assert.Equal("velora", p.GetProperty("brandSlug").GetString()));

        var sale = Items(await Anon().GetAsync("/api/public/products?flag=sale&pageSize=60"));
        Assert.NotEmpty(sale);
        Assert.All(sale, p => { Assert.True(p.GetProperty("onSale").GetBoolean()); Assert.True(p.GetProperty("compareAtPrice").GetDecimal() > p.GetProperty("minPrice").GetDecimal()); });
        Assert.All(Items(await Anon().GetAsync("/api/public/products?flag=new&pageSize=60")), p => Assert.True(p.GetProperty("isNew").GetBoolean()));
    }

    // ---------- bộ lọc khả dụng ----------
    [Fact]
    public async Task Facet_counts_equal_the_result_counts_of_applying_that_filter()
    {
        var facets = (await Anon().GetAsync("/api/public/products/facets?category=nuoc-hoa")).Data;
        var attributes = facets.GetProperty("attributes").EnumerateArray().ToList();
        Assert.NotEmpty(attributes);

        foreach (var attr in attributes)
        {
            var code = attr.GetProperty("code").GetString();
            foreach (var value in attr.GetProperty("values").EnumerateArray())
            {
                var v = value.GetProperty("code").GetString();
                var listed = Total(await Anon().GetAsync($"/api/public/products?category=nuoc-hoa&attr.{code}={v}&pageSize=1"));
                Assert.True(value.GetProperty("count").GetInt32() == listed, $"{code}={v}: facet {value.GetProperty("count").GetInt32()} ≠ danh sách {listed}");
            }
        }
        foreach (var brand in facets.GetProperty("brands").EnumerateArray())
            Assert.Equal(brand.GetProperty("count").GetInt32(), Total(await Anon().GetAsync($"/api/public/products?category=nuoc-hoa&brand={brand.GetProperty("slug").GetString()}&pageSize=1")));
    }

    [Fact]
    public async Task Facets_narrow_with_other_filters_but_keep_the_dimension_itself_open()
    {
        var gender = await Anon().GetAsync("/api/public/products/facets?attr.gender=nam");
        var volume = gender.Data.GetProperty("attributes").EnumerateArray().Single(a => a.GetProperty("code").GetString() == "volume");
        foreach (var value in volume.GetProperty("values").EnumerateArray())
        {
            var v = value.GetProperty("code").GetString();
            Assert.Equal(value.GetProperty("count").GetInt32(), Total(await Anon().GetAsync($"/api/public/products?attr.gender=nam&attr.volume={v}&pageSize=1")));
        }

        // Chiều đang lọc vẫn liệt kê các giá trị anh em (không tự thu hẹp về đúng giá trị đã chọn)
        var genderFacet = gender.Data.GetProperty("attributes").EnumerateArray().Single(a => a.GetProperty("code").GetString() == "gender");
        var codes = genderFacet.GetProperty("values").EnumerateArray().Select(x => x.GetProperty("code").GetString()).ToList();
        Assert.Contains("nam", codes);
        Assert.Contains("nu", codes);
    }

    [Fact]
    public async Task Facet_price_range_matches_the_listed_products_and_attributes_follow_the_category_scope()
    {
        var r = await Anon().GetAsync("/api/public/products/facets?category=nuoc-hoa-nam");
        var list = Items(await Anon().GetAsync("/api/public/products?category=nuoc-hoa-nam&pageSize=60"));
        Assert.Equal(list.Min(p => p.GetProperty("minPrice").GetDecimal()), r.Data.GetProperty("price").GetProperty("min").GetDecimal());
        Assert.Equal(list.Max(p => p.GetProperty("maxPrice").GetDecimal()), r.Data.GetProperty("price").GetProperty("max").GetDecimal());

        var empty = await Anon().GetAsync("/api/public/products/facets?q=zzzkhongco");
        Assert.Equal(JsonValueKind.Null, empty.Data.GetProperty("price").ValueKind);
        Assert.Equal(HttpStatusCode.NotFound, (await Anon().GetAsync("/api/public/products/facets?category=khong-co")).Status);
    }

    // ---------- chi tiết ----------
    [Fact]
    public async Task Detail_exposes_options_variants_attributes_images_breadcrumb_and_related_but_no_secrets()
    {
        var r = await Anon().GetAsync("/api/public/products/aurel-nuit-no-1");
        Assert.True(r.Success, r.Body.ToString());
        var d = r.Data;

        Assert.Equal("Aurel Nuit No.1", d.GetProperty("name").GetString());
        Assert.Equal(["Nước hoa", "Nước hoa nam"], d.GetProperty("breadcrumb").EnumerateArray().Select(b => b.GetProperty("name").GetString()!).ToArray());
        Assert.True(d.GetProperty("images").GetArrayLength() >= 2);
        var options = d.GetProperty("options").EnumerateArray().ToList();
        Assert.Equal("volume", options.Single().GetProperty("code").GetString());
        var variants = d.GetProperty("variants").EnumerateArray().ToList();
        Assert.Equal(options.Single().GetProperty("values").GetArrayLength(), variants.Count);
        Assert.All(variants, v => Assert.Equal(1, v.GetProperty("optionValueIds").GetArrayLength()));
        Assert.All(variants, v => Assert.InRange(v.GetProperty("maxPurchasable").GetInt32(), 0, 20));
        Assert.Contains(d.GetProperty("attributes").EnumerateArray(), a => a.GetProperty("code").GetString() == "scent" && a.GetProperty("values").GetArrayLength() == 2);
        var related = d.GetProperty("related").EnumerateArray().ToList();
        Assert.InRange(related.Count, 1, 8);
        Assert.DoesNotContain(related, x => x.GetProperty("slug").GetString() == "aurel-nuit-no-1");

        var body = r.Body.ToString();
        Assert.DoesNotContain("costPrice", body, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("stockQuantity", body, StringComparison.OrdinalIgnoreCase);
        Assert.Equal(HttpStatusCode.NotFound, (await Anon().GetAsync("/api/public/products/khong-co")).Status);
    }

    [Fact]
    public async Task Hidden_draft_and_inactive_category_products_are_not_visible_anywhere()
    {
        var admin = await factory.NewAdminClientAsync();
        var cat = await CategoryAsync(admin, "Ẩn " + Uniq());
        var slug = "qa-hidden-" + Uniq().ToLowerInvariant();
        var created = await CreateProductAsync(admin, new Dictionary<string, object?>
        {
            ["name"] = "QA hidden", ["slug"] = slug, ["primaryCategoryId"] = cat, ["status"] = "Draft",
            ["variants"] = new[] { Variant(Uniq("H-").ToUpperInvariant()) }, ["attributes"] = Array.Empty<object>(),
        });
        var id = created.Data.GetProperty("id").GetGuid();
        try
        {
            Assert.Equal(HttpStatusCode.NotFound, (await Anon().GetAsync($"/api/public/products/{slug}")).Status);          // nháp

            await admin.PutAsync($"/api/admin/products/{id}/flags", new { status = "Active" });
            var catSlug = (await admin.GetAsync($"/api/admin/categories/{cat}")).Data.GetProperty("slug").GetString();
            Assert.True((await Anon().GetAsync($"/api/public/products/{slug}")).Success);                                   // đang bán
            Assert.Equal(1, Total(await Anon().GetAsync($"/api/public/products?category={catSlug}")));

            await admin.PutAsync($"/api/admin/categories/{cat}", new { name = "Ẩn", slug = catSlug, isActive = false });
            Assert.Equal(HttpStatusCode.NotFound, (await Anon().GetAsync($"/api/public/products/{slug}")).Status);          // danh mục bị ẩn
            Assert.Equal(HttpStatusCode.NotFound, (await Anon().GetAsync($"/api/public/categories/{catSlug}")).Status);
        }
        finally
        {
            await admin.DeleteAsync($"/api/admin/products/{id}");
            await admin.DeleteAsync($"/api/admin/categories/{cat}");
        }
    }

    [Fact]
    public async Task Inactive_variants_are_hidden_and_out_of_stock_variants_are_flagged()
    {
        var admin = await factory.NewAdminClientAsync();
        var cat = await CategoryAsync(admin);
        var vol = await AttributeAsync(admin, "Select", true, true, false, [cat], "S", "M", "L");
        var slug = "qa-stock-" + Uniq().ToLowerInvariant();
        var created = await CreateProductAsync(admin, new Dictionary<string, object?>
        {
            ["name"] = "QA stock", ["slug"] = slug, ["primaryCategoryId"] = cat, ["status"] = "Active", ["attributes"] = Array.Empty<object>(),
            ["variants"] = new[]
            {
                Variant(Uniq("S-").ToUpperInvariant(), stock: 0, options: [(vol.Id, vol.ValueIds["S"])]),
                Variant(Uniq("M-").ToUpperInvariant(), stock: 500, options: [(vol.Id, vol.ValueIds["M"])]),
                Variant(Uniq("L-").ToUpperInvariant(), stock: 5, active: false, options: [(vol.Id, vol.ValueIds["L"])]),
            },
        });
        try
        {
            var d = (await Anon().GetAsync($"/api/public/products/{slug}")).Data;
            var variants = d.GetProperty("variants").EnumerateArray().ToList();
            Assert.Equal(2, variants.Count);                                                              // biến thể tắt bị ẩn
            Assert.Equal(1, variants.Count(v => !v.GetProperty("inStock").GetBoolean()));
            Assert.Equal(20, variants.Single(v => v.GetProperty("inStock").GetBoolean()).GetProperty("maxPurchasable").GetInt32()); // tồn thật 500 không lộ
            Assert.Equal(2, d.GetProperty("options").EnumerateArray().Single().GetProperty("values").GetArrayLength());           // giá trị L không dùng nên ẩn
            // Bộ lọc theo tuỳ chọn chỉ xét biến thể đang bật: giá trị L chỉ còn ở biến thể đã tắt nên không khớp
            var code = (await admin.GetAsync($"/api/admin/attributes/{vol.Id}")).Data.GetProperty("code").GetString();
            Assert.Equal(1, Total(await Anon().GetAsync($"/api/public/products?q=qa%20stock&attr.{code}=m")));
            Assert.Equal(0, Total(await Anon().GetAsync($"/api/public/products?q=qa%20stock&attr.{code}=l")));
        }
        finally
        {
            await admin.DeleteAsync($"/api/admin/products/{created.Data.GetProperty("id").GetGuid()}");
            await admin.DeleteAsync($"/api/admin/attributes/{vol.Id}");
            await admin.DeleteAsync($"/api/admin/categories/{cat}");
        }
    }

    // ---------- gợi ý, trang chủ ----------
    [Fact]
    public async Task Suggestions_need_two_characters_and_return_products_brands_and_categories()
    {
        var empty = await Anon().GetAsync("/api/public/search/suggest?q=v");
        Assert.Equal(0, empty.Data.GetProperty("products").GetArrayLength());

        var r = await Anon().GetAsync("/api/public/search/suggest?q=velora");
        Assert.InRange(r.Data.GetProperty("products").GetArrayLength(), 1, 6);
        Assert.Contains(r.Data.GetProperty("brands").EnumerateArray(), b => b.GetProperty("slug").GetString() == "velora");
        var cats = await Anon().GetAsync("/api/public/search/suggest?q=nuoc%20hoa");
        Assert.NotEmpty(cats.Data.GetProperty("categories").EnumerateArray());
    }

    [Fact]
    public async Task Home_products_follow_the_requested_kind_and_limit()
    {
        var news = Items(await Anon().GetAsync("/api/public/home/products?kind=new&limit=3"));
        Assert.Equal(3, news.Count);
        Assert.All(news, p => Assert.True(p.GetProperty("isNew").GetBoolean()));
        var best = Items(await Anon().GetAsync("/api/public/home/products?kind=bestseller&limit=100"));
        Assert.True(best.Count <= 24);
        Assert.All(best, p => Assert.True(p.GetProperty("isBestSeller").GetBoolean()));
        var brands = Items(await Anon().GetAsync("/api/public/brands"));
        Assert.Equal(7, brands.Count);
        Assert.All(brands, b => Assert.True(b.GetProperty("productCount").GetInt32() > 0));
    }

    [Fact]
    public async Task Search_index_is_used_for_unaccented_name_lookup()
    {
        // Chỉ mục trigram trên f_unaccent(lower(name)) phải tồn tại để tìm kiếm không phải quét toàn bảng khi dữ liệu lớn.
        var indexes = await factory.WithDbAsync(async db =>
        {
            var conn = db.Database.GetDbConnection();
            await conn.OpenAsync();
            await using var cmd = conn.CreateCommand();
            cmd.CommandText = "select indexdef from pg_indexes where indexname in ('ix_products_search_trgm','ix_product_variants_sku_trgm')";
            var list = new List<string>();
            await using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync()) list.Add(reader.GetString(0));
            return list;
        });
        Assert.Equal(2, indexes.Count);
        Assert.All(indexes, i => Assert.Contains("f_unaccent(lower(", i));
    }
}
