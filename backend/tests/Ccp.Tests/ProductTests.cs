using System.Net;
using System.Text.Json;
using Ccp.Application.Catalog;
using Ccp.Domain.Security;
using Ccp.Tests.Infrastructure;
using Microsoft.EntityFrameworkCore;
using static Ccp.Tests.Infrastructure.CatalogApi;

namespace Ccp.Tests;

[Collection(ApiCollection.Name)]
public class ProductTests(ApiFactory factory)
{
    private static string Sku() => Uniq("SKU-").ToUpperInvariant();

    private static Guid Id(ApiResult r) => r.Data.GetProperty("id").GetGuid();

    private static IEnumerable<string> ErrorFields(ApiResult r) =>
        r.Body.GetProperty("error").GetProperty("details").EnumerateArray().Select(d => d.GetProperty("field").GetString()!);

    /// <summary>Danh mục + hai thuộc tính tạo biến thể (Màu x Size), dùng cho nhiều test.</summary>
    private async Task<(TestClient Admin, Guid Category, AttributeInfo Color, AttributeInfo Size)> SetupAsync()
    {
        var admin = await factory.NewAdminClientAsync();
        var cat = await CategoryAsync(admin);
        var color = await AttributeAsync(admin, "Color", true, true, false, [cat], "Trắng", "Đen");
        var size = await AttributeAsync(admin, "Select", true, true, false, [cat], "S", "M", "L");
        return (admin, cat, color, size);
    }

    // ---------- tạo ----------
    [Fact]
    public async Task Product_without_options_gets_one_default_variant_and_price_range()
    {
        var admin = await factory.NewAdminClientAsync();
        var sku = Sku();
        var r = await CreateProductAsync(admin, ProductPayload(variants: [Variant(sku, price: 500_000, stock: 7, sale: 450_000, cost: 300_000)]));

        Assert.True(r.Success, r.Body.ToString());
        var variants = r.Data.GetProperty("variants");
        Assert.Equal(1, variants.GetArrayLength());
        Assert.True(variants[0].GetProperty("isDefault").GetBoolean());
        Assert.Equal(sku, variants[0].GetProperty("sku").GetString());
        Assert.Equal(300_000, variants[0].GetProperty("costPrice").GetDecimal());

        var list = await admin.GetAsync($"/api/admin/products?q={sku}");
        var item = list.Data[0];
        Assert.Equal(450_000, item.GetProperty("minPrice").GetDecimal());   // giá khuyến mãi là giá hiệu lực
        Assert.Equal(450_000, item.GetProperty("maxPrice").GetDecimal());
        Assert.Equal(7, item.GetProperty("stockTotal").GetInt32());
        Assert.Equal(sku, item.GetProperty("sku").GetString());
    }

    [Fact]
    public async Task Generated_variants_cover_the_cartesian_product_and_can_be_saved_as_is()
    {
        var (admin, cat, color, size) = await SetupAsync();
        var gen = await admin.PostAsync("/api/admin/products/generate-variants", new
        {
            baseSku = "ao-somi",
            options = new object[]
            {
                new { attributeId = color.Id, valueIds = color.ValueIds.Values },
                new { attributeId = size.Id, valueIds = size.ValueIds.Values },
            },
        });
        Assert.True(gen.Success, gen.Body.ToString());
        Assert.Equal(color.ValueIds.Count * size.ValueIds.Count, gen.Data.GetArrayLength());
        var skus = gen.Data.EnumerateArray().Select(x => x.GetProperty("suggestedSku").GetString()!).ToList();
        Assert.Equal(skus.Count, skus.Distinct().Count());
        Assert.All(skus, s => Assert.StartsWith("AO-SOMI-", s));
        Assert.Contains("AO-SOMI-TRANG-S", skus);

        var variants = gen.Data.EnumerateArray().Select(g => Variant(
            Uniq(g.GetProperty("suggestedSku").GetString()![..8]) + g.GetProperty("suggestedSku").GetString()![8..].Replace("-", "").Replace("Đ", "D"),
            options: g.GetProperty("options").EnumerateArray().Select(o => (o.GetProperty("attributeId").GetGuid(), o.GetProperty("valueId").GetGuid())))).ToList();
        var created = await CreateProductAsync(admin, ProductPayload(categoryId: cat, variants: variants));

        Assert.True(created.Success, created.Body.ToString());
        Assert.Equal(6, created.Data.GetProperty("variants").GetArrayLength());
        Assert.All(created.Data.GetProperty("variants").EnumerateArray(), v =>
        {
            Assert.False(v.GetProperty("isDefault").GetBoolean());
            Assert.Equal(2, v.GetProperty("options").GetArrayLength());
        });
        Assert.Equal(2, created.Data.GetProperty("optionAttributeIds").GetArrayLength());

        var hashes = await factory.WithDbAsync(db => db.ProductVariants.Where(v => v.ProductId == Id(created)).Select(v => v.OptionHash).ToListAsync());
        Assert.Equal(6, hashes.Distinct().Count());
        Assert.DoesNotContain("", hashes);
    }

    [Fact]
    public async Task Generate_rejects_non_variant_attributes_foreign_values_empty_input_and_explosions()
    {
        var (admin, cat, color, size) = await SetupAsync();
        var plain = await AttributeAsync(admin, "Select", false, true, false, [cat], "A");

        Task<ApiResult> Gen(params object[] options) => admin.PostAsync("/api/admin/products/generate-variants", new { options });
        Assert.Equal(HttpStatusCode.BadRequest, (await Gen()).Status);
        Assert.Equal(HttpStatusCode.BadRequest, (await Gen(new { attributeId = plain.Id, valueIds = plain.ValueIds.Values })).Status);
        Assert.Equal(HttpStatusCode.BadRequest, (await Gen(new { attributeId = color.Id, valueIds = size.ValueIds.Values })).Status);
        Assert.Equal(HttpStatusCode.BadRequest, (await Gen(new { attributeId = color.Id, valueIds = Array.Empty<Guid>() })).Status);
        Assert.Equal(HttpStatusCode.BadRequest, (await Gen(new { attributeId = color.Id, valueIds = color.ValueIds.Values }, new { attributeId = color.Id, valueIds = color.ValueIds.Values })).Status);

        // 15 x 15 = 225 > 200
        var big1 = await AttributeAsync(admin, "Select", true, false, false, [], Enumerable.Range(0, 15).Select(i => $"a{i}").ToArray());
        var big2 = await AttributeAsync(admin, "Select", true, false, false, [], Enumerable.Range(0, 15).Select(i => $"b{i}").ToArray());
        var tooMany = await Gen(new { attributeId = big1.Id, valueIds = big1.ValueIds.Values }, new { attributeId = big2.Id, valueIds = big2.ValueIds.Values });
        Assert.Equal(HttpStatusCode.BadRequest, tooMany.Status);
    }

    // ---------- kiểm tra dữ liệu ----------
    [Fact]
    public async Task Invalid_variant_data_is_reported_per_field()
    {
        var admin = await factory.NewAdminClientAsync();
        Task<ApiResult> Create(object variant) => CreateProductAsync(admin, ProductPayload(variants: [variant]));

        var neg = await Create(Variant(Sku(), price: -1));
        Assert.Equal(HttpStatusCode.BadRequest, neg.Status);
        Assert.Contains("variants[0].price", ErrorFields(neg));

        var saleTooHigh = await Create(Variant(Sku(), price: 100, sale: 100));
        Assert.Contains("variants[0].salePrice", ErrorFields(saleTooHigh));

        var stock = await Create(Variant(Sku(), stock: -5));
        Assert.Contains("variants[0].stockQuantity", ErrorFields(stock));

        var badSku = await Create(Variant("sku có dấu cách"));
        Assert.Contains("variants[0].sku", ErrorFields(badSku));

        var none = await CreateProductAsync(admin, ProductPayload(variants: []));
        Assert.Equal(HttpStatusCode.BadRequest, none.Status);
        Assert.Contains("variants", ErrorFields(none));

        var noName = ProductPayload(); noName["name"] = "";
        Assert.Contains("name", ErrorFields(await CreateProductAsync(admin, noName)));
    }

    [Fact]
    public async Task Duplicate_skus_are_rejected_within_a_request_and_across_products_case_insensitively()
    {
        var admin = await factory.NewAdminClientAsync();
        var sku = Sku();
        Assert.True((await CreateProductAsync(admin, ProductPayload(variants: [Variant(sku)]))).Success);

        var other = await CreateProductAsync(admin, ProductPayload(variants: [Variant(sku.ToLowerInvariant())]));
        Assert.Equal(HttpStatusCode.BadRequest, other.Status);
        Assert.Contains("variants", ErrorFields(other));

        var (a, cat, color, _) = await SetupAsync();
        var s = Sku();
        var within = await CreateProductAsync(a, ProductPayload(categoryId: cat, variants:
        [
            Variant(s, options: [(color.Id, color.ValueIds["Trắng"])]), Variant(s.ToLowerInvariant(), options: [(color.Id, color.ValueIds["Đen"])]),
        ]));
        Assert.Equal(HttpStatusCode.BadRequest, within.Status);
    }

    [Fact]
    public async Task Option_rules_same_attribute_set_unique_combos_applicable_values()
    {
        var (admin, cat, color, size) = await SetupAsync();
        var otherCat = await CategoryAsync(admin);
        var foreign = await AttributeAsync(admin, "Select", true, false, false, [otherCat], "X");
        var white = (color.Id, color.ValueIds["Trắng"]); var black = (color.Id, color.ValueIds["Đen"]); var s = (size.Id, size.ValueIds["S"]);

        // khác bộ thuộc tính giữa các biến thể
        var mixed = await CreateProductAsync(admin, ProductPayload(categoryId: cat, variants: [Variant(Sku(), options: [white, s]), Variant(Sku(), options: [black])]));
        Assert.Equal(HttpStatusCode.BadRequest, mixed.Status);

        // trùng tổ hợp
        var dup = await CreateProductAsync(admin, ProductPayload(categoryId: cat, variants: [Variant(Sku(), options: [white]), Variant(Sku(), options: [white])]));
        Assert.Equal(HttpStatusCode.BadRequest, dup.Status);

        // thuộc tính không áp dụng cho danh mục
        var notApplicable = await CreateProductAsync(admin, ProductPayload(categoryId: cat, variants: [Variant(Sku(), options: [(foreign.Id, foreign.ValueIds["X"])])]));
        Assert.Equal(HttpStatusCode.BadRequest, notApplicable.Status);

        // không có danh mục thì không có thuộc tính áp dụng
        var noCat = await CreateProductAsync(admin, ProductPayload(variants: [Variant(Sku(), options: [white])]));
        Assert.Equal(HttpStatusCode.BadRequest, noCat.Status);

        // giá trị của thuộc tính khác
        var wrongValue = await CreateProductAsync(admin, ProductPayload(categoryId: cat, variants: [Variant(Sku(), options: [(color.Id, size.ValueIds["S"])])]));
        Assert.Equal(HttpStatusCode.BadRequest, wrongValue.Status);

        // nhiều hơn một biến thể mà không có tuỳ chọn
        var noOpts = await CreateProductAsync(admin, ProductPayload(variants: [Variant(Sku()), Variant(Sku())]));
        Assert.Equal(HttpStatusCode.BadRequest, noOpts.Status);

        // thuộc tính thường (không phải tuỳ chọn biến thể) không dùng làm tuỳ chọn
        var plain = await AttributeAsync(admin, "Select", false, true, false, [cat], "P");
        var asOption = await CreateProductAsync(admin, ProductPayload(categoryId: cat, variants: [Variant(Sku(), options: [(plain.Id, plain.ValueIds["P"])])]));
        Assert.Equal(HttpStatusCode.BadRequest, asOption.Status);
    }

    [Fact]
    public async Task Descriptive_attributes_are_validated_by_data_type_and_required_ones_must_be_present()
    {
        var admin = await factory.NewAdminClientAsync();
        var cat = await CategoryAsync(admin);
        var origin = await AttributeAsync(admin, "Select", false, true, true, [cat], "Pháp", "Ý");
        var scent = await AttributeAsync(admin, "MultiSelect", false, true, false, [cat], "Gỗ", "Hoa", "Cam");
        var note = await AttributeAsync(admin, "Text", false, false, false, [cat]);
        var weight = await AttributeAsync(admin, "Number", false, false, false, [cat]);
        var organic = await AttributeAsync(admin, "Boolean", false, true, false, [cat]);

        object A(Guid id, object? values = null, string? text = null, decimal? number = null, bool? flag = null) =>
            new { attributeId = id, valueIds = values, text, number, @bool = flag };
        Task<ApiResult> Create(params object[] attrs) => CreateProductAsync(admin, ProductPayload(categoryId: cat, attributes: attrs));

        // thiếu thuộc tính bắt buộc
        var missing = await Create();
        Assert.Equal(HttpStatusCode.BadRequest, missing.Status);
        Assert.Contains("attributes", ErrorFields(missing));

        // sai kiểu / sai số lượng giá trị
        Assert.Equal(HttpStatusCode.BadRequest, (await Create(A(origin.Id, new[] { origin.ValueIds["Pháp"], origin.ValueIds["Ý"] }))).Status);
        Assert.Equal(HttpStatusCode.BadRequest, (await Create(A(origin.Id, new[] { origin.ValueIds["Pháp"] }), A(scent.Id, Array.Empty<Guid>()))).Status);
        Assert.Equal(HttpStatusCode.BadRequest, (await Create(A(origin.Id, new[] { origin.ValueIds["Pháp"] }), A(note.Id))).Status);
        Assert.Equal(HttpStatusCode.BadRequest, (await Create(A(origin.Id, new[] { origin.ValueIds["Pháp"] }), A(weight.Id))).Status);
        Assert.Equal(HttpStatusCode.BadRequest, (await Create(A(origin.Id, new[] { origin.ValueIds["Pháp"] }), A(organic.Id))).Status);
        Assert.Equal(HttpStatusCode.BadRequest, (await Create(A(origin.Id, new[] { scent.ValueIds["Gỗ"] }))).Status); // giá trị của thuộc tính khác
        Assert.Equal(HttpStatusCode.BadRequest, (await Create(A(origin.Id, new[] { origin.ValueIds["Pháp"] }), A(note.Id, text: "a"), A(note.Id, text: "b"))).Status); // lặp

        var ok = await Create(
            A(origin.Id, new[] { origin.ValueIds["Pháp"] }), A(scent.Id, new[] { scent.ValueIds["Gỗ"], scent.ValueIds["Cam"] }),
            A(note.Id, text: "Hương gỗ ấm"), A(weight.Id, number: 1.5m), A(organic.Id, flag: true));
        Assert.True(ok.Success, ok.Body.ToString());

        var saved = ok.Data.GetProperty("attributes").EnumerateArray().ToDictionary(x => x.GetProperty("attributeId").GetGuid());
        Assert.Equal(2, saved[scent.Id].GetProperty("valueIds").GetArrayLength());
        Assert.Equal("Hương gỗ ấm", saved[note.Id].GetProperty("text").GetString());
        Assert.Equal(1.5m, saved[weight.Id].GetProperty("number").GetDecimal());
        Assert.True(saved[organic.Id].GetProperty("bool").GetBoolean());
    }

    [Fact]
    public async Task Slug_category_brand_media_and_status_rules()
    {
        var admin = await factory.NewAdminClientAsync();
        var first = await CreateProductAsync(admin, ProductPayload(name: "Áo thun " + Uniq()));
        var slug = first.Data.GetProperty("slug").GetString()!;
        Assert.StartsWith("ao-thun-", slug);

        var p = ProductPayload(); p["slug"] = slug;
        Assert.Equal("slug_taken", (await CreateProductAsync(admin, p)).ErrorCode);

        Assert.Equal(HttpStatusCode.BadRequest, (await CreateProductAsync(admin, ProductPayload(categoryId: Guid.NewGuid()))).Status);
        Assert.Equal(HttpStatusCode.BadRequest, (await CreateProductAsync(admin, ProductPayload(brandId: Guid.NewGuid()))).Status);

        var badImage = ProductPayload(); badImage["images"] = new[] { new { mediaId = Guid.NewGuid(), isPrimary = true } };
        Assert.Equal(HttpStatusCode.BadRequest, (await CreateProductAsync(admin, badImage)).Status);

        var inactive = await CreateProductAsync(admin, ProductPayload(status: "Active", variants: [Variant(Sku(), active: false)]));
        Assert.Equal(HttpStatusCode.BadRequest, inactive.Status);
        Assert.Contains("status", ErrorFields(inactive));
        Assert.True((await CreateProductAsync(admin, ProductPayload(status: "Draft", variants: [Variant(Sku(), active: false)]))).Success);

        var badVideo = ProductPayload(); badVideo["videoUrl"] = "javascript:alert(1)";
        Assert.Contains("videoUrl", ErrorFields(await CreateProductAsync(admin, badVideo)));
    }

    [Fact]
    public async Task Images_keep_order_and_exactly_one_primary()
    {
        var admin = await factory.NewAdminClientAsync();
        var ids = new List<Guid>();
        foreach (var name in new[] { "a.png", "b.png", "c.png" })
        {
            var up = await admin.SendAsync(HttpMethod.Post, "/api/admin/media", null, content: SampleFiles.Form(null, (name, "image/png", SampleFiles.Png())));
            ids.Add(up.Data.GetProperty("items")[0].GetProperty("id").GetGuid());
        }
        var p = ProductPayload();
        p["images"] = new[] { new { mediaId = ids[0], isPrimary = false }, new { mediaId = ids[1], isPrimary = true }, new { mediaId = ids[2], isPrimary = true } };
        var r = await CreateProductAsync(admin, p);

        Assert.True(r.Success, r.Body.ToString());
        var images = r.Data.GetProperty("images").EnumerateArray().ToList();
        Assert.Equal(ids, images.Select(i => i.GetProperty("mediaId").GetGuid()).ToList());
        Assert.Equal([false, true, false], images.Select(i => i.GetProperty("isPrimary").GetBoolean()).ToArray());
        Assert.NotNull(images[0].GetProperty("media").GetProperty("url").GetString());

        var list = await admin.GetAsync($"/api/admin/products?q={r.Data.GetProperty("slug").GetString()}");
        Assert.Equal(ids[1], list.Data[0].GetProperty("image").GetProperty("id").GetGuid());

        var dup = ProductPayload(); dup["images"] = new[] { new { mediaId = ids[0], isPrimary = true }, new { mediaId = ids[0], isPrimary = false } };
        Assert.Equal(HttpStatusCode.BadRequest, (await CreateProductAsync(admin, dup)).Status);
    }

    // ---------- cập nhật ----------
    [Fact]
    public async Task Update_keeps_variant_identity_adds_and_removes_and_frees_removed_skus()
    {
        var (admin, cat, color, _) = await SetupAsync();
        var skuW = Sku(); var skuB = Sku();
        var created = await CreateProductAsync(admin, ProductPayload(categoryId: cat, variants:
        [
            Variant(skuW, price: 100_000, options: [(color.Id, color.ValueIds["Trắng"])]),
            Variant(skuB, price: 120_000, options: [(color.Id, color.ValueIds["Đen"])]),
        ]));
        Assert.True(created.Success, created.Body.ToString());
        var productId = Id(created);
        var white = created.Data.GetProperty("variants").EnumerateArray().Single(v => v.GetProperty("sku").GetString() == skuW);
        var whiteId = white.GetProperty("id").GetGuid();

        // sửa giá biến thể trắng, bỏ biến thể đen
        var update = ProductPayload(categoryId: cat, variants: [Variant(skuW, price: 150_000, stock: 3, options: [(color.Id, color.ValueIds["Trắng"])], id: whiteId)]);
        update["name"] = created.Data.GetProperty("name").GetString();
        var r = await admin.PutAsync($"/api/admin/products/{productId}", update);
        Assert.True(r.Success, r.Body.ToString());
        var variants = r.Data.GetProperty("variants");
        Assert.Equal(1, variants.GetArrayLength());
        Assert.Equal(whiteId, variants[0].GetProperty("id").GetGuid());
        Assert.Equal(150_000, variants[0].GetProperty("price").GetDecimal());
        Assert.Equal(3, variants[0].GetProperty("stockQuantity").GetInt32());

        var list = await admin.GetAsync($"/api/admin/products?q={skuW}");
        Assert.Equal(150_000, list.Data[0].GetProperty("minPrice").GetDecimal());
        Assert.Equal(1, list.Data[0].GetProperty("variantCount").GetInt32());

        // SKU của biến thể đã gỡ dùng lại được cho sản phẩm khác; dòng cũ vẫn còn trong DB ở dạng xoá mềm
        Assert.True((await CreateProductAsync(admin, ProductPayload(variants: [Variant(skuB)]))).Success);
        Assert.Equal(1, await factory.WithDbAsync(db => db.ProductVariants.IgnoreQueryFilters().CountAsync(v => v.Sku == skuB && v.IsDeleted)));

        // thêm lại biến thể đen
        var again = ProductPayload(categoryId: cat, variants:
        [
            Variant(skuW, price: 150_000, options: [(color.Id, color.ValueIds["Trắng"])], id: whiteId),
            Variant(Sku(), price: 99_000, options: [(color.Id, color.ValueIds["Đen"])]),
        ]);
        again["name"] = created.Data.GetProperty("name").GetString();
        var r2 = await admin.PutAsync($"/api/admin/products/{productId}", again);
        Assert.True(r2.Success, r2.Body.ToString());
        Assert.Equal(2, r2.Data.GetProperty("variants").GetArrayLength());
        Assert.Equal(99_000, (await admin.GetAsync($"/api/admin/products/{productId}")).Data.GetProperty("variants").EnumerateArray().Min(v => v.GetProperty("price").GetDecimal()));
    }

    [Fact]
    public async Task Saving_the_same_payload_twice_is_idempotent()
    {
        var (admin, cat, color, _) = await SetupAsync();
        var created = await CreateProductAsync(admin, ProductPayload(categoryId: cat, variants:
        [
            Variant(Sku(), options: [(color.Id, color.ValueIds["Trắng"])]), Variant(Sku(), options: [(color.Id, color.ValueIds["Đen"])]),
        ]));
        var id = Id(created);
        var variants = created.Data.GetProperty("variants").EnumerateArray().Select(v => Variant(
            v.GetProperty("sku").GetString()!, v.GetProperty("price").GetDecimal(), v.GetProperty("stockQuantity").GetInt32(),
            v.GetProperty("options").EnumerateArray().Select(o => (o.GetProperty("attributeId").GetGuid(), o.GetProperty("valueId").GetGuid())),
            id: v.GetProperty("id").GetGuid())).ToList();
        var payload = ProductPayload(created.Data.GetProperty("name").GetString(), cat, variants: variants);

        var first = await admin.PutAsync($"/api/admin/products/{id}", payload);
        var second = await admin.PutAsync($"/api/admin/products/{id}", payload);

        Assert.True(first.Success && second.Success, second.Body.ToString());
        Assert.Equal(first.Data.GetProperty("variants").ToString(), second.Data.GetProperty("variants").ToString());
        Assert.Equal(2, await factory.WithDbAsync(db => db.ProductVariants.CountAsync(v => v.ProductId == id)));
    }

    [Fact]
    public async Task Updating_with_a_variant_id_from_another_product_is_rejected()
    {
        var admin = await factory.NewAdminClientAsync();
        var a = await CreateProductAsync(admin, ProductPayload());
        var b = await CreateProductAsync(admin, ProductPayload());
        var foreignId = b.Data.GetProperty("variants")[0].GetProperty("id").GetGuid();

        var r = await admin.PutAsync($"/api/admin/products/{Id(a)}", ProductPayload(a.Data.GetProperty("name").GetString(), variants: [Variant(Sku(), id: foreignId)]));

        Assert.Equal(HttpStatusCode.BadRequest, r.Status);
    }

    [Fact]
    public async Task Flags_endpoint_toggles_without_touching_variants_and_active_needs_an_active_variant()
    {
        var admin = await factory.NewAdminClientAsync();
        var created = await CreateProductAsync(admin, ProductPayload(status: "Draft"));
        var id = Id(created);

        var r = await admin.PutAsync($"/api/admin/products/{id}/flags", new { isFeatured = true, isBestSeller = true, isNew = true, status = "Active" });
        Assert.True(r.Success);
        Assert.True(r.Data.GetProperty("isFeatured").GetBoolean() && r.Data.GetProperty("isBestSeller").GetBoolean() && r.Data.GetProperty("isNew").GetBoolean());
        Assert.Equal("Active", r.Data.GetProperty("status").GetString());
        Assert.Equal(created.Data.GetProperty("variants").ToString(), r.Data.GetProperty("variants").ToString());

        var list = await admin.GetAsync("/api/admin/products?isFeatured=true&status=Active&isBestSeller=true&isNew=true&pageSize=100");
        Assert.Contains(list.Data.EnumerateArray(), x => x.GetProperty("id").GetGuid() == id);

        var hidden = await admin.PutAsync($"/api/admin/products/{id}/flags", new { status = "Hidden" });
        Assert.Equal("Hidden", hidden.Data.GetProperty("status").GetString());

        var noActive = await CreateProductAsync(admin, ProductPayload(status: "Draft", variants: [Variant(Sku(), active: false)]));
        var bad = await admin.PutAsync($"/api/admin/products/{Id(noActive)}/flags", new { status = "Active" });
        Assert.Equal(HttpStatusCode.BadRequest, bad.Status);
    }

    // ---------- giá vốn, quyền ----------
    [Fact]
    public async Task Cost_price_is_hidden_from_users_without_view_cost_and_they_cannot_overwrite_it()
    {
        var admin = await factory.NewAdminClientAsync();
        var sku = Sku();
        var created = await CreateProductAsync(admin, ProductPayload(variants: [Variant(sku, price: 200_000, cost: 120_000)]));
        var id = Id(created);
        var variantId = created.Data.GetProperty("variants")[0].GetProperty("id").GetGuid();

        var staff = await factory.LoginAsRoleAsync(RoleDefaults.Staff); // Product.Update nhưng không có Product.ViewCost
        var seen = await staff.GetAsync($"/api/admin/products/{id}");
        Assert.True(seen.Success);
        Assert.Equal(JsonValueKind.Null, seen.Data.GetProperty("variants")[0].GetProperty("costPrice").ValueKind);
        Assert.False(seen.Data.GetProperty("canViewCost").GetBoolean());
        Assert.DoesNotContain("120000", seen.Body.ToString());

        // Staff sửa giá bán và cố ghi giá vốn: giá vốn cũ phải được giữ nguyên
        var edit = ProductPayload(created.Data.GetProperty("name").GetString(), variants: [Variant(sku, price: 210_000, cost: 1, id: variantId)]);
        Assert.True((await staff.PutAsync($"/api/admin/products/{id}", edit)).Success);
        var cost = await factory.WithDbAsync(db => db.ProductVariants.Where(v => v.Id == variantId).Select(v => new { v.CostPrice, v.Price }).SingleAsync());
        Assert.Equal(120_000, cost.CostPrice);
        Assert.Equal(210_000, cost.Price);

        var manager = await factory.LoginAsRoleAsync(RoleDefaults.Manager);
        Assert.Equal(120_000, (await manager.GetAsync($"/api/admin/products/{id}")).Data.GetProperty("variants")[0].GetProperty("costPrice").GetDecimal());
    }

    [Fact]
    public async Task Product_permissions_per_role()
    {
        var staff = await factory.LoginAsRoleAsync(RoleDefaults.Staff);
        var customer = await factory.LoginAsRoleAsync(RoleDefaults.Customer);
        var admin = await factory.NewAdminClientAsync();
        var id = Id(await CreateProductAsync(admin, ProductPayload()));

        Assert.Equal(HttpStatusCode.Forbidden, (await staff.PostAsync("/api/admin/products", ProductPayload())).Status);   // không có Product.Create
        Assert.Equal(HttpStatusCode.Forbidden, (await staff.DeleteAsync($"/api/admin/products/{id}")).Status);              // không có Product.Delete
        Assert.True((await staff.GetAsync("/api/admin/products")).Success);
        Assert.Equal(HttpStatusCode.Forbidden, (await customer.GetAsync("/api/admin/products")).Status);
        Assert.Equal(HttpStatusCode.Unauthorized, (await factory.NewClient().GetAsync("/api/admin/products")).Status);
    }

    // ---------- an toàn dữ liệu ----------
    [Fact]
    public async Task Rich_text_is_sanitized_on_save()
    {
        var admin = await factory.NewAdminClientAsync();
        var r = await CreateProductAsync(admin, ProductPayload(description:
            "<p onclick=\"steal()\">Xin chào <b>bạn</b></p><script>alert(1)</script><img src=x onerror=alert(2)><a href=\"javascript:alert(3)\">bấm</a>"));

        Assert.True(r.Success);
        var html = r.Data.GetProperty("description").GetString()!;
        Assert.Contains("<b>bạn</b>", html);
        Assert.DoesNotContain("<script", html, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("onclick", html, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("onerror", html, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("javascript:", html, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Sort_and_filter_parameters_are_whitelisted_and_search_matches_name_sku_brand_category()
    {
        var admin = await factory.NewAdminClientAsync();
        var tag = Uniq("q");
        var cat = await CategoryAsync(admin, $"Nhóm {tag}");
        var brand = await BrandAsync(admin, $"Hãng {tag}");
        var sku = $"CODE-{tag}".ToUpperInvariant();
        await CreateProductAsync(admin, ProductPayload($"Tên {tag}", cat, brand, [Variant(sku, price: 300)]));
        await CreateProductAsync(admin, ProductPayload($"Rẻ {tag}", cat, brand, [Variant(Sku(), price: 100)]));

        foreach (var term in new[] { $"tên {tag}", sku.ToLowerInvariant(), $"hãng {tag}", $"nhóm {tag}" })
            Assert.True((await admin.GetAsync($"/api/admin/products?q={Uri.EscapeDataString(term)}")).Meta.GetProperty("total").GetInt32() >= 1, term);

        var cheapFirst = await admin.GetAsync($"/api/admin/products?categoryId={cat}&sort=minPrice:asc");
        Assert.Equal(["Rẻ " + tag, "Tên " + tag], cheapFirst.Data.EnumerateArray().Select(x => x.GetProperty("name").GetString()!).ToArray());
        var byBrand = await admin.GetAsync($"/api/admin/products?brandId={brand}");
        Assert.Equal(2, byBrand.Meta.GetProperty("total").GetInt32());

        foreach (var bad in new[] { "cost", "price;drop table products", "name:up", "name:asc:asc" })
            Assert.Equal(HttpStatusCode.BadRequest, (await admin.GetAsync($"/api/admin/products?sort={Uri.EscapeDataString(bad)}")).Status);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.GetAsync("/api/admin/products?status=Nope")).Status);

        var paged = await admin.GetAsync("/api/admin/products?page=1&pageSize=1");
        Assert.Equal(1, paged.Data.GetArrayLength());
        Assert.Equal(1, paged.Meta.GetProperty("pageSize").GetInt32());
        var capped = await admin.GetAsync("/api/admin/products?pageSize=100000");
        Assert.Equal(100, capped.Meta.GetProperty("pageSize").GetInt32());
    }

    [Fact]
    public async Task Category_filter_includes_descendant_categories()
    {
        var admin = await factory.NewAdminClientAsync();
        var parent = await CategoryAsync(admin); var child = await CategoryAsync(admin, null, parent);
        var p = await CreateProductAsync(admin, ProductPayload(categoryId: child));

        var list = await admin.GetAsync($"/api/admin/products?categoryId={parent}");
        Assert.Contains(list.Data.EnumerateArray(), x => x.GetProperty("id").GetGuid() == Id(p));
    }

    [Fact]
    public async Task Delete_is_soft_hides_the_product_frees_the_slug_and_cleans_carts()
    {
        var admin = await factory.NewAdminClientAsync();
        var sku = Sku();
        var created = await CreateProductAsync(admin, ProductPayload(variants: [Variant(sku)]));
        var id = Id(created);
        var variantId = created.Data.GetProperty("variants")[0].GetProperty("id").GetGuid();
        await factory.WithDbAsync(async db =>
        {
            var cart = new Ccp.Domain.Entities.Cart { SessionToken = Guid.NewGuid().ToString("N") };
            cart.Items.Add(new Ccp.Domain.Entities.CartItem { VariantId = variantId, Quantity = 1 });
            db.Carts.Add(cart);
            await db.SaveChangesAsync();
        });

        Assert.True((await admin.DeleteAsync($"/api/admin/products/{id}")).Success);

        Assert.Equal(HttpStatusCode.NotFound, (await admin.GetAsync($"/api/admin/products/{id}")).Status);
        Assert.DoesNotContain(id, (await admin.GetAsync($"/api/admin/products?q={sku}")).Data.EnumerateArray().Select(x => x.GetProperty("id").GetGuid()));
        Assert.Equal(1, await factory.WithDbAsync(db => db.Products.IgnoreQueryFilters().CountAsync(p => p.Id == id && p.IsDeleted)));
        Assert.False(await factory.WithDbAsync(db => db.CartItems.AnyAsync(c => c.VariantId == variantId)));
        Assert.True((await CreateProductAsync(admin, ProductPayload(variants: [Variant(sku)]))).Success);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.DeleteAsync($"/api/admin/products/{id}")).Status);
    }

    [Fact]
    public async Task Concurrent_product_creation_with_same_sku_lets_only_one_win()
    {
        var admin1 = await factory.NewAdminClientAsync();
        var admin2 = await factory.NewAdminClientAsync();
        var sku = Sku();
        var results = await Task.WhenAll(
            CreateProductAsync(admin1, ProductPayload(variants: [Variant(sku)])),
            CreateProductAsync(admin2, ProductPayload(variants: [Variant(sku)])));

        Assert.Equal(1, results.Count(r => r.Success));
        var loser = results.Single(r => !r.Success);
        Assert.Contains(loser.Status, new[] { HttpStatusCode.BadRequest, HttpStatusCode.Conflict });
        Assert.Equal(1, await factory.WithDbAsync(db => db.ProductVariants.CountAsync(v => v.Sku == sku)));
    }
}
