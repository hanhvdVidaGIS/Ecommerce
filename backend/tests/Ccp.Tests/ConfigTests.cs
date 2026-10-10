using System.Net;
using System.Text.Json;
using Ccp.Application.Config;
using Ccp.Domain.Entities;
using Ccp.Domain.Enums;
using Ccp.Domain.Security;
using Ccp.Tests.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Ccp.Tests;

[Collection(ApiCollection.Name)]
public class ConfigTests(ApiFactory factory)
{
    private static Dictionary<string, string> Settings(ApiResult site) =>
        site.Data.GetProperty("settings").EnumerateObject().ToDictionary(p => p.Name, p => p.Value.GetString() ?? "");

    [Fact]
    public async Task Public_site_config_is_anonymous_and_contains_exactly_the_public_keys()
    {
        var site = await factory.NewClient().GetAsync("/api/public/site-config");

        Assert.True(site.Success);
        var expected = SettingDefinitions.All.Where(d => d.IsPublic).Select(d => d.Key).Order().ToList();
        Assert.Equal(expected, Settings(site).Keys.Order().ToList());
    }

    [Fact]
    public async Task Admin_settings_list_describes_every_definition_with_a_known_control()
    {
        var admin = await factory.NewAdminClientAsync();
        var list = (await admin.GetAsync("/api/admin/settings")).Data.EnumerateArray().ToList();

        Assert.Equal(SettingDefinitions.All.Select(d => d.Key).Order().ToList(), list.Select(s => s.GetProperty("key").GetString()!).Order().ToList());
        Assert.All(list, s => Assert.Contains(s.GetProperty("control").GetString(), SettingDefinition.Controls));
        Assert.All(list, s => Assert.False(string.IsNullOrWhiteSpace(s.GetProperty("label").GetString())));
        // Mọi khoá kiểu MediaId dùng ô chọn ảnh; mọi khoá kiểu Color dùng ô chọn màu
        Assert.All(list.Where(s => s.GetProperty("type").GetString() == "MediaId"), s => Assert.Equal("media", s.GetProperty("control").GetString()));
        Assert.All(list.Where(s => s.GetProperty("type").GetString() == "Color"), s => Assert.Equal("color", s.GetProperty("control").GetString()));
    }

    [Fact]
    public async Task Non_public_setting_never_appears_in_public_site_config()
    {
        var secretKey = $"secret.{Guid.NewGuid():N}";
        await factory.WithDbAsync(async db =>
        {
            db.WebsiteSettings.Add(new WebsiteSetting { Key = secretKey, Group = "secret", Value = "TOP-SECRET-VALUE", ValueType = SettingValueType.String, IsPublic = false });
            await db.SaveChangesAsync();
        });
        factory.Services.GetRequiredService<Ccp.Application.Abstractions.ISiteCache>().InvalidateAll();

        var site = await factory.NewClient().GetAsync("/api/public/site-config");
        Assert.DoesNotContain(secretKey, site.Body.ToString());
        Assert.DoesNotContain("TOP-SECRET-VALUE", site.Body.ToString());
    }

    [Fact]
    public async Task Admin_changes_are_visible_on_the_public_site_config_without_restart()
    {
        var admin = await factory.NewAdminClientAsync();
        var name = "Luxury Perfume " + Guid.NewGuid().ToString("N")[..6];

        var update = await admin.PutAsync("/api/admin/settings", new
        {
            values = new Dictionary<string, string> { ["general.siteName"] = name, ["theme.primaryColor"] = "#000000", ["general.slogan"] = "Khẳng định phong cách riêng" },
        });
        Assert.True(update.Success);

        var site = await factory.NewClient().GetAsync("/api/public/site-config");
        var s = Settings(site);
        Assert.Equal(name, s["general.siteName"]);
        Assert.Equal("#000000", s["theme.primaryColor"]);
        Assert.Equal("Khẳng định phong cách riêng", s["general.slogan"]);
    }

    [Theory]
    [InlineData("theme.primaryColor", "red")]
    [InlineData("theme.primaryColor", "#12345")]
    [InlineData("theme.fontFamily", "Comic Sans'; DROP TABLE x;--")]
    [InlineData("general.logo", "not-a-guid")]
    [InlineData("store.paymentMethods", "{broken")]
    [InlineData("no.such.key", "x")]
    public async Task Invalid_setting_values_are_rejected_with_the_offending_key(string key, string value)
    {
        var admin = await factory.NewAdminClientAsync();
        var r = await admin.PutAsync("/api/admin/settings", new { values = new Dictionary<string, string> { [key] = value } });

        Assert.Equal(HttpStatusCode.BadRequest, r.Status);
        Assert.Equal("validation_failed", r.ErrorCode);
        Assert.Contains(r.Body.GetProperty("error").GetProperty("details").EnumerateArray(), d => d.GetProperty("field").GetString() == key);
    }

    [Fact]
    public async Task Media_setting_must_reference_an_existing_media()
    {
        var admin = await factory.NewAdminClientAsync();
        var r = await admin.PutAsync("/api/admin/settings", new { values = new Dictionary<string, string> { ["general.logo"] = Guid.NewGuid().ToString() } });

        Assert.Equal("validation_failed", r.ErrorCode);
    }

    [Fact]
    public async Task Setting_permissions_are_checked_per_group()
    {
        var manager = await factory.LoginAsRoleAsync(RoleDefaults.Manager); // chỉ có WebsiteConfig.View
        var staff = await factory.LoginAsRoleAsync(RoleDefaults.Staff);     // không có quyền cấu hình
        var admin = await factory.LoginAsRoleAsync(RoleDefaults.Admin);     // có cả hai quyền Update

        Assert.True((await manager.GetAsync("/api/admin/settings")).Success);
        Assert.Equal(HttpStatusCode.Forbidden, (await staff.GetAsync("/api/admin/settings")).Status);

        var website = new { values = new Dictionary<string, string> { ["general.slogan"] = "x" } };
        var store = new { values = new Dictionary<string, string> { ["store.currency"] = "VND" } };
        Assert.Equal(HttpStatusCode.Forbidden, (await manager.PutAsync("/api/admin/settings", website)).Status);
        Assert.Equal(HttpStatusCode.Forbidden, (await staff.PutAsync("/api/admin/settings", store)).Status);
        Assert.True((await admin.PutAsync("/api/admin/settings", store)).Success);
        Assert.Equal(HttpStatusCode.Unauthorized, (await factory.NewClient().PutAsync("/api/admin/settings", website, false)).Status);
    }

    [Fact]
    public async Task Business_type_cannot_be_changed_through_plain_settings_update()
    {
        var admin = await factory.NewAdminClientAsync();
        var r = await admin.PutAsync("/api/admin/settings", new { values = new Dictionary<string, string> { ["store.businessType"] = "apparel" } });

        Assert.Equal("validation_failed", r.ErrorCode);
    }

    [Fact]
    public async Task Apply_preset_dry_run_matches_real_apply_and_second_apply_creates_nothing()
    {
        var admin = await factory.NewAdminClientAsync();
        var preset = BusinessTypePresets.All.Single(b => b.Code == "homeware").Preset;

        // Dữ liệu người dùng tự tạo trước khi áp gói không bị đụng tới
        var custom = $"custom-{Guid.NewGuid():N}"[..14];
        await factory.WithDbAsync(async db =>
        {
            db.ProductAttributes.Add(new ProductAttribute { Code = custom, Name = "Thuộc tính tự tạo", DataType = AttributeDataType.Text });
            await db.SaveChangesAsync();
        });

        var dry = await admin.PostAsync("/api/admin/business-types/homeware/apply?dryRun=true");
        Assert.True(dry.Success);
        Assert.True(dry.Data.GetProperty("dryRun").GetBoolean());
        Assert.False(await factory.WithDbAsync(db => db.ProductAttributes.AnyAsync(a => a.Code == "power")), "dry-run không được ghi dữ liệu");

        var real = await admin.PostAsync("/api/admin/business-types/homeware/apply");
        Assert.True(real.Success);
        foreach (var field in new[] { "attributesCreated", "valuesCreated", "categoriesCreated" })
            Assert.Equal(dry.Data.GetProperty(field).GetInt32(), real.Data.GetProperty(field).GetInt32());

        var again = await admin.PostAsync("/api/admin/business-types/homeware/apply");
        Assert.Equal(0, again.Data.GetProperty("attributesCreated").GetInt32());
        Assert.Equal(0, again.Data.GetProperty("valuesCreated").GetInt32());
        Assert.Equal(0, again.Data.GetProperty("categoriesCreated").GetInt32());

        // Kết quả khớp với preset (đọc từ chính preset, không từ hằng số trong test)
        await factory.WithDbAsync(async db =>
        {
            foreach (var a in preset.Attributes)
            {
                var attr = await db.ProductAttributes.Include(x => x.Values).SingleAsync(x => x.Code == a.Code);
                Assert.Equal(a.IsVariantOption, attr.IsVariantOption);
                Assert.True(a.Values.Select(v => v.Code).ToHashSet().IsSubsetOf(attr.Values.Select(v => v.Code)));
            }
            var root = await db.Categories.SingleAsync(c => c.Slug == preset.Categories[0].Slug);
            var assigned = await db.CategoryAttributes.Where(x => x.CategoryId == root.Id).Select(x => x.Attribute!.Code).ToListAsync();
            Assert.Equal(preset.Categories[0].AttributeCodes!.Order().ToList(), assigned.Order().ToList());
            Assert.True(await db.ProductAttributes.AnyAsync(a => a.Code == custom), "dữ liệu có sẵn bị xoá");
        });

        var site = await factory.NewClient().GetAsync("/api/public/site-config");
        Assert.Equal("homeware", site.Data.GetProperty("businessType").GetProperty("code").GetString());
        Assert.Equal(preset.Labels.Product, Settings(site)["store.productLabel"]);
    }

    [Fact]
    public async Task Apply_preset_requires_store_config_permission_and_a_real_code()
    {
        var manager = await factory.LoginAsRoleAsync(RoleDefaults.Manager);
        Assert.Equal(HttpStatusCode.Forbidden, (await manager.PostAsync("/api/admin/business-types/food/apply")).Status);

        var admin = await factory.NewAdminClientAsync();
        var missing = await admin.PostAsync("/api/admin/business-types/khong-co/apply");
        Assert.Equal(HttpStatusCode.NotFound, missing.Status);
    }

    [Fact]
    public async Task Every_seeded_business_type_has_a_valid_preset_and_unique_codes()
    {
        var admin = await factory.NewAdminClientAsync();
        var list = await admin.GetAsync("/api/admin/business-types");

        var codes = list.Data.EnumerateArray().Select(x => x.GetProperty("code").GetString()!).Order().ToList();
        Assert.Equal(BusinessTypePresets.All.Select(b => b.Code).Order().ToList(), codes);
        Assert.Equal(codes.Distinct().Count(), codes.Count);
        foreach (var seed in BusinessTypePresets.All)
        {
            // Mọi mã thuộc tính được gán cho danh mục phải tồn tại trong cùng preset
            var attrCodes = seed.Preset.Attributes.Select(a => a.Code).ToHashSet();
            void Check(IEnumerable<PresetCategory> nodes)
            {
                foreach (var n in nodes)
                {
                    Assert.All(n.AttributeCodes ?? [], c => Assert.Contains(c, attrCodes));
                    Check(n.Children ?? []);
                }
            }
            Check(seed.Preset.Categories);
            Assert.Equal(seed.Preset.Attributes.Count, seed.Preset.Attributes.Select(a => a.Code).Distinct().Count());
        }
    }
}
