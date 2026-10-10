using System.Text.Json;
using Ccp.Application.Abstractions;
using Ccp.Application.Common;
using Ccp.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace Ccp.Application.Config;

public class BusinessTypeService(IAppDbContext db, SettingsService settings, ISiteCache cache, AuditService audit)
{
    public async Task<IReadOnlyList<BusinessTypeListItemDto>> ListAsync(CancellationToken ct = default)
    {
        var current = await CurrentCodeAsync(ct);
        var rows = await db.BusinessTypes.AsNoTracking().OrderBy(b => b.Name).ToListAsync(ct);
        return rows.Select(b =>
        {
            var preset = ParsePreset(b.PresetJson);
            return new BusinessTypeListItemDto(b.Code, b.Name, b.Description, b.IsSystem, b.Code == current,
                preset.Attributes.Count, CountCategories(preset.Categories));
        }).ToList();
    }

    public async Task<BusinessTypePreset> GetPresetAsync(string code, CancellationToken ct = default)
    {
        var bt = await db.BusinessTypes.AsNoTracking().SingleOrDefaultAsync(b => b.Code == code, ct) ?? throw AppException.NotFound("Business Type");
        return ParsePreset(bt.PresetJson);
    }

    /// <summary>
    /// Áp dụng gói cấu hình: chỉ thêm, không xoá hay sửa dữ liệu đang có. Phần tử trùng mã (thuộc tính, giá trị, slug danh mục) giữ nguyên.
    /// dryRun=true chỉ trả về phạm vi ảnh hưởng để quản trị viên xem trước.
    /// </summary>
    public async Task<ApplyPresetResult> ApplyAsync(string code, bool applyLabels, bool dryRun, CancellationToken ct = default)
    {
        var bt = await db.BusinessTypes.AsNoTracking().SingleOrDefaultAsync(b => b.Code == code, ct) ?? throw AppException.NotFound("Business Type");
        var preset = ParsePreset(bt.PresetJson);

        var existingAttrs = await db.ProductAttributes.Include(a => a.Values).ToDictionaryAsync(a => a.Code, ct);
        var existingSlugs = await db.Categories.ToDictionaryAsync(c => c.Slug, ct);
        int attrCreated = 0, attrExisting = 0, valuesCreated = 0, catCreated = 0, catExisting = 0;
        var attrByCode = new Dictionary<string, ProductAttribute>(existingAttrs);

        var order = 0;
        foreach (var a in preset.Attributes)
        {
            order += 10;
            if (!attrByCode.TryGetValue(a.Code, out var attr))
            {
                attrCreated++;
                attr = new ProductAttribute
                {
                    Code = a.Code, Name = a.Name, DataType = a.DataType, Unit = a.Unit, IsFilterable = a.IsFilterable,
                    IsVariantOption = a.IsVariantOption, SortOrder = order,
                };
                attrByCode[a.Code] = attr;
                if (!dryRun) db.ProductAttributes.Add(attr);
            }
            else attrExisting++;

            var haveValues = attr.Values.Select(v => v.Code).ToHashSet();
            var vOrder = 0;
            foreach (var v in a.Values)
            {
                vOrder += 10;
                if (!haveValues.Add(v.Code)) continue;
                valuesCreated++;
                var value = new ProductAttributeValue { AttributeId = attr.Id, Code = v.Code, Label = v.Label, ColorHex = v.ColorHex, SortOrder = vOrder };
                if (!dryRun) { value.Attribute = attr; attr.Values.Add(value); }
            }
        }

        void Walk(IReadOnlyList<PresetCategory> nodes, Category? parent)
        {
            var sort = 0;
            foreach (var node in nodes)
            {
                sort += 10;
                Category cat;
                if (existingSlugs.TryGetValue(node.Slug, out var found)) { cat = found; catExisting++; }
                else
                {
                    catCreated++;
                    cat = new Category { Name = node.Name, Slug = node.Slug, ParentId = parent?.Id, SortOrder = sort };
                    existingSlugs[node.Slug] = cat;
                    if (!dryRun) db.Categories.Add(cat);
                }
                if (node.Children is not null) Walk(node.Children, cat);
            }
        }
        Walk(preset.Categories, null);

        if (!dryRun)
        {
            await db.SaveChangesAsync(ct);
            await AssignExistingCategoryAttributesAsync(preset, existingSlugs, attrByCode, ct);

            var values = new Dictionary<string, string> { [SettingKeys.BusinessType] = bt.Code };
            if (applyLabels)
            {
                values[SettingKeys.ProductLabel] = preset.Labels.Product;
                values[SettingKeys.CategoryLabel] = preset.Labels.Category;
                values[SettingKeys.BrandLabel] = preset.Labels.Brand;
            }
            await settings.SetInternalAsync(values, ct);
            audit.Log("businesstype.apply", nameof(BusinessType), bt.Code, new { attrCreated, valuesCreated, catCreated, applyLabels });
            await db.SaveChangesAsync(ct);
            cache.InvalidateAll();
        }
        return new ApplyPresetResult(bt.Code, dryRun, applyLabels, attrCreated, attrExisting, valuesCreated, catCreated, catExisting);
    }

    /// <summary>Danh mục đã tồn tại từ trước (trùng slug) vẫn được gán thuộc tính của gói nếu chưa có.</summary>
    private async Task AssignExistingCategoryAttributesAsync(BusinessTypePreset preset, Dictionary<string, Category> categories,
        Dictionary<string, ProductAttribute> attributes, CancellationToken ct)
    {
        var have = (await db.CategoryAttributes.Select(x => new { x.CategoryId, x.AttributeId }).ToListAsync(ct))
            .Select(x => (x.CategoryId, x.AttributeId)).ToHashSet();
        void Walk(IReadOnlyList<PresetCategory> nodes)
        {
            foreach (var node in nodes)
            {
                if (node.AttributeCodes is not null && categories.TryGetValue(node.Slug, out var cat))
                    foreach (var code in node.AttributeCodes)
                        if (attributes.TryGetValue(code, out var attr) && have.Add((cat.Id, attr.Id)))
                            db.CategoryAttributes.Add(new CategoryAttribute { CategoryId = cat.Id, AttributeId = attr.Id });
                if (node.Children is not null) Walk(node.Children);
            }
        }
        Walk(preset.Categories);
        await db.SaveChangesAsync(ct);
    }

    private async Task<string> CurrentCodeAsync(CancellationToken ct) =>
        await db.WebsiteSettings.AsNoTracking().Where(s => s.Key == SettingKeys.BusinessType).Select(s => s.Value).FirstOrDefaultAsync(ct) ?? "other";

    private static BusinessTypePreset ParsePreset(string json) =>
        JsonSerializer.Deserialize<BusinessTypePreset>(json, BusinessTypePreset.Json)
        ?? new BusinessTypePreset(new PresetLabels("Sản phẩm", "Danh mục", "Thương hiệu"), [], []);

    private static int CountCategories(IReadOnlyList<PresetCategory> nodes) =>
        nodes.Sum(n => 1 + (n.Children is null ? 0 : CountCategories(n.Children)));
}
