using System.Net;
using Ccp.Domain.Security;
using Ccp.Tests.Infrastructure;
using Microsoft.EntityFrameworkCore;
using static Ccp.Tests.Infrastructure.CatalogApi;

namespace Ccp.Tests;

[Collection(ApiCollection.Name)]
public class CategoryTests(ApiFactory factory)
{
    [Fact]
    public async Task Create_generates_slug_from_vietnamese_name_and_rejects_duplicates()
    {
        var admin = await factory.NewAdminClientAsync();
        var tag = Uniq("x");
        var r = await admin.PostAsync("/api/admin/categories", new { name = $"Nước hoa Đặc biệt {tag}", isActive = true });

        Assert.True(r.Success);
        Assert.Equal($"nuoc-hoa-dac-biet-{tag}", r.Data.GetProperty("slug").GetString());

        var dup = await admin.PostAsync("/api/admin/categories", new { name = "Khác", slug = $"nuoc-hoa-dac-biet-{tag}", isActive = true });
        Assert.Equal(HttpStatusCode.Conflict, dup.Status);
        Assert.Equal("slug_taken", dup.ErrorCode);
    }

    [Theory]
    [InlineData("Slug Hoa")]
    [InlineData("-bad")]
    [InlineData("a_b")]
    public async Task Invalid_explicit_slug_is_rejected(string slug)
    {
        var admin = await factory.NewAdminClientAsync();
        var r = await admin.PostAsync("/api/admin/categories", new { name = "X", slug, isActive = true });

        Assert.Equal(HttpStatusCode.BadRequest, r.Status);
        Assert.Contains(r.Body.GetProperty("error").GetProperty("details").EnumerateArray(), d => d.GetProperty("field").GetString() == "slug");
    }

    [Fact]
    public async Task Tree_listing_orders_children_under_parents_with_depth_and_path()
    {
        var admin = await factory.NewAdminClientAsync();
        var root = await CategoryAsync(admin, "Gốc " + Uniq());
        var child = await CategoryAsync(admin, "Con", root);
        var grand = await CategoryAsync(admin, "Cháu", child);

        var list = (await admin.GetAsync("/api/admin/categories")).Data.EnumerateArray().ToList();
        var iRoot = list.FindIndex(x => x.GetProperty("id").GetGuid() == root);
        Assert.Equal(child, list[iRoot + 1].GetProperty("id").GetGuid());
        Assert.Equal(grand, list[iRoot + 2].GetProperty("id").GetGuid());
        Assert.Equal(2, list[iRoot + 2].GetProperty("depth").GetInt32());
        Assert.EndsWith("Con / Cháu", list[iRoot + 2].GetProperty("path").GetString());
        Assert.Equal(1, list[iRoot].GetProperty("childCount").GetInt32());
    }

    [Fact]
    public async Task Moving_a_category_under_its_own_descendant_is_rejected()
    {
        var admin = await factory.NewAdminClientAsync();
        var a = await CategoryAsync(admin);
        var b = await CategoryAsync(admin, null, a);
        var c = await CategoryAsync(admin, null, b);

        var self = await admin.PutAsync($"/api/admin/categories/{a}", new { name = "A", parentId = a, isActive = true });
        var cycle = await admin.PutAsync($"/api/admin/categories/{a}", new { name = "A", parentId = c, isActive = true });
        Assert.Equal(HttpStatusCode.BadRequest, self.Status);
        Assert.Equal(HttpStatusCode.BadRequest, cycle.Status);
        Assert.Equal("validation_failed", cycle.ErrorCode);

        var reorder = await admin.PostAsync("/api/admin/categories/reorder", new[] { new { id = a, parentId = (Guid?)c, sortOrder = 0 } });
        Assert.Equal(HttpStatusCode.BadRequest, reorder.Status);
    }

    [Fact]
    public async Task Tree_depth_is_limited_to_five_levels()
    {
        var admin = await factory.NewAdminClientAsync();
        Guid? parent = null;
        for (var i = 0; i < 5; i++) parent = await CategoryAsync(admin, $"L{i} {Uniq()}", parent);

        var tooDeep = await admin.PostAsync("/api/admin/categories", new { name = "Quá sâu", parentId = parent, isActive = true });
        Assert.Equal(HttpStatusCode.BadRequest, tooDeep.Status);
    }

    [Fact]
    public async Task Reorder_applies_new_parent_and_sort_atomically()
    {
        var admin = await factory.NewAdminClientAsync();
        var a = await CategoryAsync(admin);
        var b = await CategoryAsync(admin);

        var ok = await admin.PostAsync("/api/admin/categories/reorder", new[] { new { id = b, parentId = (Guid?)a, sortOrder = 5 } });
        Assert.True(ok.Success);
        var detail = await admin.GetAsync($"/api/admin/categories/{b}");
        Assert.Equal(a, detail.Data.GetProperty("parentId").GetGuid());
        Assert.Equal(5, detail.Data.GetProperty("sortOrder").GetInt32());

        // một phần tử sai thì không phần tử nào được lưu
        var c = await CategoryAsync(admin);
        var bad = await admin.PostAsync("/api/admin/categories/reorder", new[]
        {
            new { id = c, parentId = (Guid?)null, sortOrder = 99 },
            new { id = Guid.NewGuid(), parentId = (Guid?)null, sortOrder = 1 },
        });
        Assert.Equal(HttpStatusCode.NotFound, bad.Status);
        Assert.NotEqual(99, (await admin.GetAsync($"/api/admin/categories/{c}")).Data.GetProperty("sortOrder").GetInt32());
    }

    [Fact]
    public async Task Delete_is_blocked_while_category_has_children_or_products_or_menu_links()
    {
        var admin = await factory.NewAdminClientAsync();
        var parent = await CategoryAsync(admin);
        var child = await CategoryAsync(admin, null, parent);
        Assert.Equal("has_children", (await admin.DeleteAsync($"/api/admin/categories/{parent}")).ErrorCode);

        var created = await CreateProductAsync(admin, ProductPayload(categoryId: child));
        Assert.True(created.Success);
        Assert.Equal("in_use", (await admin.DeleteAsync($"/api/admin/categories/{child}")).ErrorCode);

        await admin.DeleteAsync($"/api/admin/products/{created.Data.GetProperty("id").GetGuid()}");
        Assert.True((await admin.DeleteAsync($"/api/admin/categories/{child}")).Success);
        Assert.True((await admin.DeleteAsync($"/api/admin/categories/{parent}")).Success);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.GetAsync($"/api/admin/categories/{parent}")).Status);
    }

    [Fact]
    public async Task Deleted_category_slug_can_be_reused()
    {
        var admin = await factory.NewAdminClientAsync();
        var slug = Uniq("reuse").ToLowerInvariant();
        var first = await admin.PostAsync("/api/admin/categories", new { name = "A", slug, isActive = true });
        await admin.DeleteAsync($"/api/admin/categories/{first.Data.GetProperty("id").GetGuid()}");

        var again = await admin.PostAsync("/api/admin/categories", new { name = "A", slug, isActive = true });
        Assert.True(again.Success);
    }

    [Fact]
    public async Task Category_permissions_are_enforced_per_action()
    {
        var staff = await factory.LoginAsRoleAsync(RoleDefaults.Staff);
        Assert.Equal(HttpStatusCode.Forbidden, (await staff.GetAsync("/api/admin/categories")).Status);
        Assert.Equal(HttpStatusCode.Forbidden, (await staff.PostAsync("/api/admin/categories", new { name = "x", isActive = true })).Status);

        var manager = await factory.LoginAsRoleAsync(RoleDefaults.Manager);
        Assert.True((await manager.PostAsync("/api/admin/categories", new { name = "Mgr " + Uniq(), isActive = true })).Success);
        Assert.Equal(HttpStatusCode.Unauthorized, (await factory.NewClient().GetAsync("/api/admin/categories")).Status);
    }
}

[Collection(ApiCollection.Name)]
public class BrandTests(ApiFactory factory)
{
    [Fact]
    public async Task Crud_with_unique_slug_and_listing_search_sort()
    {
        var admin = await factory.NewAdminClientAsync();
        var tag = Uniq("b");
        var a = await admin.PostAsync("/api/admin/brands", new { name = $"Alpha {tag}", isActive = true, sortOrder = 2 });
        var b = await admin.PostAsync("/api/admin/brands", new { name = $"Beta {tag}", isActive = true, sortOrder = 1 });
        Assert.True(a.Success && b.Success);
        Assert.Equal(HttpStatusCode.Conflict, (await admin.PostAsync("/api/admin/brands", new { name = "x", slug = a.Data.GetProperty("slug").GetString(), isActive = true })).Status);

        var list = await admin.GetAsync($"/api/admin/brands?q={tag}&sort=sortOrder:asc");
        Assert.Equal(["Beta " + tag, "Alpha " + tag], list.Data.EnumerateArray().Select(x => x.GetProperty("name").GetString()!).ToArray());

        var id = a.Data.GetProperty("id").GetGuid();
        var upd = await admin.PutAsync($"/api/admin/brands/{id}", new { name = $"Alpha2 {tag}", isActive = false, sortOrder = 9 });
        Assert.False(upd.Data.GetProperty("isActive").GetBoolean());
        Assert.True((await admin.DeleteAsync($"/api/admin/brands/{id}")).Success);
    }

    [Fact]
    public async Task Brand_with_products_cannot_be_deleted()
    {
        var admin = await factory.NewAdminClientAsync();
        var brand = await BrandAsync(admin);
        var p = await CreateProductAsync(admin, ProductPayload(brandId: brand));
        Assert.True(p.Success);

        var r = await admin.DeleteAsync($"/api/admin/brands/{brand}");
        Assert.Equal(HttpStatusCode.Conflict, r.Status);
        Assert.Equal("in_use", r.ErrorCode);
        var listed = await admin.GetAsync($"/api/admin/brands/{brand}");
        Assert.Equal(1, listed.Data.GetProperty("productCount").GetInt32());
    }

    [Fact]
    public async Task Brand_validation_and_permissions()
    {
        var admin = await factory.NewAdminClientAsync();
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsync("/api/admin/brands", new { name = "", isActive = true })).Status);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsync("/api/admin/brands", new { name = "X", logoMediaId = Guid.NewGuid(), isActive = true })).Status);

        var staff = await factory.LoginAsRoleAsync(RoleDefaults.Staff);
        Assert.Equal(HttpStatusCode.Forbidden, (await staff.PostAsync("/api/admin/brands", new { name = "X", isActive = true })).Status);
    }
}

[Collection(ApiCollection.Name)]
public class AttributeTests(ApiFactory factory)
{
    [Fact]
    public async Task Each_data_type_follows_its_value_rules()
    {
        var admin = await factory.NewAdminClientAsync();
        // Text/Number/Boolean không có danh sách giá trị
        foreach (var type in new[] { "Text", "Number", "Boolean" })
        {
            var a = await AttributeAsync(admin, type, false, false, false, []);
            var v = await admin.PostAsync($"/api/admin/attributes/{a.Id}/values", new { label = "x" });
            Assert.Equal(HttpStatusCode.BadRequest, v.Status);
        }
        // Color cần mã màu, Image cần ảnh
        var color = await AttributeAsync(admin, "Color", true, true, false, []);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsync($"/api/admin/attributes/{color.Id}/values", new { label = "Đỏ" })).Status);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsync($"/api/admin/attributes/{color.Id}/values", new { label = "Đỏ", colorHex = "red" })).Status);
        var ok = await admin.PostAsync($"/api/admin/attributes/{color.Id}/values", new { label = "Đỏ", colorHex = "#dc2626" });
        Assert.Equal("#DC2626", ok.Data.GetProperty("colorHex").GetString());
        Assert.Equal("do", ok.Data.GetProperty("code").GetString());

        var image = await AttributeAsync(admin, "Image", false, false, false, []);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsync($"/api/admin/attributes/{image.Id}/values", new { label = "Mẫu" })).Status);
    }

    [Fact]
    public async Task Variant_option_only_for_select_color_image_and_text_cannot_be_filterable()
    {
        var admin = await factory.NewAdminClientAsync();
        object Body(string type, bool variant, bool filter) => new
        {
            code = "c" + Guid.NewGuid().ToString("N")[..8], name = "X", dataType = type, isFilterable = filter, isVariantOption = variant,
            isRequired = false, isVisibleOnProduct = true, isActive = true, sortOrder = 0,
        };
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsync("/api/admin/attributes", Body("Text", true, false))).Status);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsync("/api/admin/attributes", Body("Number", true, false))).Status);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsync("/api/admin/attributes", Body("MultiSelect", true, false))).Status);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsync("/api/admin/attributes", Body("Text", false, true))).Status);
        Assert.True((await admin.PostAsync("/api/admin/attributes", Body("Select", true, true))).Success);
    }

    [Theory]
    [InlineData("Bad Code")]
    [InlineData("1abc")]
    [InlineData("a_b")]
    [InlineData("")]
    public async Task Attribute_code_format_is_validated(string code)
    {
        var admin = await factory.NewAdminClientAsync();
        var r = await admin.PostAsync("/api/admin/attributes", new
        {
            code, name = "X", dataType = "Select", isFilterable = false, isVariantOption = false, isRequired = false, isVisibleOnProduct = true, isActive = true, sortOrder = 0,
        });
        Assert.Equal(HttpStatusCode.BadRequest, r.Status);
    }

    [Fact]
    public async Task Code_cannot_change_and_duplicate_codes_are_rejected()
    {
        var admin = await factory.NewAdminClientAsync();
        var a = await AttributeAsync(admin, "Select", false, true, false, [], "A");
        object Update(string code) => new { code, name = "Đổi tên", dataType = "Select", isFilterable = true, isVariantOption = false, isRequired = false, isVisibleOnProduct = true, isActive = true, sortOrder = 3 };

        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PutAsync($"/api/admin/attributes/{a.Id}", Update("khac"))).Status);
        Assert.True((await admin.PutAsync($"/api/admin/attributes/{a.Id}", Update(a.Code))).Success);
        var dup = await admin.PostAsync("/api/admin/attributes", Update(a.Code));
        Assert.Equal("code_taken", dup.ErrorCode);
    }

    [Fact]
    public async Task Duplicate_value_codes_in_same_attribute_are_rejected_but_allowed_across_attributes()
    {
        var admin = await factory.NewAdminClientAsync();
        var a = await AttributeAsync(admin, "Select", false, true, false, [], "Cotton");
        var b = await AttributeAsync(admin, "Select", false, true, false, []);

        Assert.Equal("code_taken", (await admin.PostAsync($"/api/admin/attributes/{a.Id}/values", new { label = "Cotton" })).ErrorCode);
        Assert.True((await admin.PostAsync($"/api/admin/attributes/{b.Id}/values", new { label = "Cotton" })).Success);
    }

    [Fact]
    public async Task Category_assignment_replaces_the_whole_set_and_rejects_unknown_categories()
    {
        var admin = await factory.NewAdminClientAsync();
        var c1 = await CategoryAsync(admin); var c2 = await CategoryAsync(admin);
        var a = await AttributeAsync(admin, "Select", false, true, false, [c1], "A");

        var r = await admin.PutAsync($"/api/admin/attributes/{a.Id}/categories", new { categoryIds = new[] { c2 } });
        Assert.Equal([c2], r.Data.GetProperty("categoryIds").EnumerateArray().Select(x => x.GetGuid()).ToArray());
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PutAsync($"/api/admin/attributes/{a.Id}/categories", new { categoryIds = new[] { Guid.NewGuid() } })).Status);
        var cat = await admin.GetAsync($"/api/admin/categories/{c2}");
        Assert.Equal(a.Id, cat.Data.GetProperty("attributes")[0].GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task Attribute_and_value_in_use_by_a_product_cannot_be_removed_or_retyped()
    {
        var admin = await factory.NewAdminClientAsync();
        var cat = await CategoryAsync(admin);
        var size = await AttributeAsync(admin, "Select", true, true, false, [cat], "S", "M");
        var p = await CreateProductAsync(admin, ProductPayload(categoryId: cat, variants:
        [
            Variant(Uniq("S-").ToUpperInvariant(), options: [(size.Id, size.ValueIds["S"])]),
            Variant(Uniq("M-").ToUpperInvariant(), options: [(size.Id, size.ValueIds["M"])]),
        ]));
        Assert.True(p.Success, p.Body.ToString());

        Assert.Equal("in_use", (await admin.DeleteAsync($"/api/admin/attributes/{size.Id}/values/{size.ValueIds["S"]}")).ErrorCode);
        Assert.Equal("in_use", (await admin.DeleteAsync($"/api/admin/attributes/{size.Id}")).ErrorCode);
        var retype = await admin.PutAsync($"/api/admin/attributes/{size.Id}", new { code = size.Code, name = "X", dataType = "Color", isFilterable = true, isVariantOption = true, isRequired = false, isVisibleOnProduct = true, isActive = true, sortOrder = 0 });
        Assert.Equal("in_use", retype.ErrorCode);

        // giá trị chưa dùng thì xoá được
        var extra = await admin.PostAsync($"/api/admin/attributes/{size.Id}/values", new { label = "XL" });
        Assert.True((await admin.DeleteAsync($"/api/admin/attributes/{size.Id}/values/{extra.Data.GetProperty("id").GetGuid()}")).Success);
    }

    [Fact]
    public async Task Unused_attribute_can_be_deleted_with_its_values_and_category_links()
    {
        var admin = await factory.NewAdminClientAsync();
        var cat = await CategoryAsync(admin);
        var a = await AttributeAsync(admin, "Select", false, true, false, [cat], "A", "B");

        Assert.True((await admin.DeleteAsync($"/api/admin/attributes/{a.Id}")).Success);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.GetAsync($"/api/admin/attributes/{a.Id}")).Status);
        Assert.Empty((await admin.GetAsync($"/api/admin/categories/{cat}")).Data.GetProperty("attributes").EnumerateArray());
        Assert.False(await factory.WithDbAsync(db => db.CategoryAttributes.AnyAsync(x => x.AttributeId == a.Id)));
    }

    [Fact]
    public async Task Attribute_permissions()
    {
        var manager = await factory.LoginAsRoleAsync(RoleDefaults.Manager);
        Assert.True((await manager.GetAsync("/api/admin/attributes")).Success);
        var staff = await factory.LoginAsRoleAsync(RoleDefaults.Staff);
        Assert.Equal(HttpStatusCode.Forbidden, (await staff.GetAsync("/api/admin/attributes")).Status);
    }
}
