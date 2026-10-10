using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;
using Ccp.Application.Abstractions;
using Ccp.Application.Common;
using Ccp.Domain.Enums;
using Ccp.Domain.Security;
using Microsoft.EntityFrameworkCore;

namespace Ccp.Application.Config;

public class SettingsService(IAppDbContext db, ICurrentUser user, ISiteCache cache, AuditService audit)
{
    private static readonly Regex HexColor = new("^#[0-9A-Fa-f]{6}$", RegexOptions.Compiled);
    private const int MaxStringLength = 2000;

    public async Task<IReadOnlyList<SettingDto>> GetAllAsync(CancellationToken ct = default)
    {
        var stored = await db.WebsiteSettings.AsNoTracking().ToDictionaryAsync(s => s.Key, s => s.Value, ct);
        return SettingDefinitions.All
            .Select(d => new SettingDto(d.Key, d.Group, d.Label, d.Type.ToString(), d.Control, d.IsPublic, stored.GetValueOrDefault(d.Key, d.Default), d.Default))
            .ToList();
    }

    /// <summary>Nhóm "store" cần StoreConfig.Update; các nhóm còn lại cần WebsiteConfig.Update.</summary>
    public static string RequiredPermission(string group) => group == "store" ? Permissions.StoreConfigUpdate : Permissions.WebsiteConfigUpdate;

    public async Task<IReadOnlyList<SettingDto>> UpdateAsync(UpdateSettingsRequest request, CancellationToken ct = default)
    {
        if (request.Values.Count == 0) throw AppException.Validation("Không có giá trị nào để cập nhật.");
        var errors = new List<ErrorDetail>();
        var normalized = new Dictionary<string, string>();

        foreach (var (key, raw) in request.Values)
        {
            var def = SettingDefinitions.Find(key);
            if (def is null) { errors.Add(new ErrorDetail(key, "Khoá cấu hình không tồn tại.")); continue; }
            if (!user.HasPermission(RequiredPermission(def.Group)))
                throw AppException.Forbidden($"Bạn không có quyền sửa nhóm cấu hình \"{def.Group}\".");
            if (key == SettingKeys.BusinessType)
            {
                errors.Add(new ErrorDetail(key, "Đổi ngành hàng qua chức năng áp dụng Business Type."));
                continue;
            }
            var error = await ValidateAsync(def, raw ?? "", ct);
            if (error is not null) errors.Add(new ErrorDetail(key, error));
            else normalized[key] = (raw ?? "").Trim();
        }
        if (errors.Count > 0) throw AppException.Validation("Cấu hình không hợp lệ.", errors.ToArray());

        var rows = await db.WebsiteSettings.Where(s => normalized.Keys.Contains(s.Key)).ToDictionaryAsync(s => s.Key, ct);
        var changes = new Dictionary<string, object>();
        foreach (var (key, value) in normalized)
        {
            var oldValue = rows.TryGetValue(key, out var existing) ? existing.Value : SettingDefinitions.Find(key)!.Default;
            if (oldValue != value) changes[key] = new { from = oldValue, to = value };
            if (rows.TryGetValue(key, out var row)) row.Value = value;
            else
            {
                var def = SettingDefinitions.Find(key)!;
                db.WebsiteSettings.Add(new Domain.Entities.WebsiteSetting { Key = key, Group = def.Group, ValueType = def.Type, IsPublic = def.IsPublic, Value = value });
            }
        }
        if (changes.Count > 0) audit.Log("settings.update", "WebsiteSetting", null, changes);
        await db.SaveChangesAsync(ct);
        cache.InvalidateAll();
        return await GetAllAsync(ct);
    }

    /// <summary>Ghi giá trị đã được hệ thống tạo ra (ví dụ nhãn từ Business Type) mà không qua kiểm tra quyền theo nhóm.</summary>
    public async Task SetInternalAsync(IReadOnlyDictionary<string, string> values, CancellationToken ct = default)
    {
        var rows = await db.WebsiteSettings.Where(s => values.Keys.Contains(s.Key)).ToDictionaryAsync(s => s.Key, ct);
        foreach (var (key, value) in values)
        {
            if (rows.TryGetValue(key, out var row)) row.Value = value;
            else
            {
                var def = SettingDefinitions.Find(key) ?? throw new InvalidOperationException($"Khoá cấu hình không tồn tại: {key}");
                db.WebsiteSettings.Add(new Domain.Entities.WebsiteSetting { Key = key, Group = def.Group, ValueType = def.Type, IsPublic = def.IsPublic, Value = value });
            }
        }
    }

    private async Task<string?> ValidateAsync(SettingDefinition def, string raw, CancellationToken ct)
    {
        var value = raw.Trim();
        if (value.Length > MaxStringLength) return $"Tối đa {MaxStringLength} ký tự.";
        if (def.Key == SettingKeys.FontFamily)
            return SettingDefinitions.AllowedFonts.Contains(value) ? null : $"Font không được hỗ trợ. Chọn một trong: {string.Join(", ", SettingDefinitions.AllowedFonts)}.";
        if (value.Length == 0) return null; // cho phép để trống để xoá giá trị tuỳ chọn

        switch (def.Type)
        {
            case SettingValueType.Color:
                return HexColor.IsMatch(value) ? null : "Màu phải có dạng #RRGGBB.";
            case SettingValueType.Number:
                return decimal.TryParse(value, NumberStyles.Number, CultureInfo.InvariantCulture, out _) ? null : "Phải là số.";
            case SettingValueType.Boolean:
                return value is "true" or "false" ? null : "Phải là true hoặc false.";
            case SettingValueType.Json:
                try { JsonDocument.Parse(value); return null; } catch (JsonException) { return "JSON không hợp lệ."; }
            case SettingValueType.MediaId:
                if (!Guid.TryParse(value, out var id)) return "Mã ảnh không hợp lệ.";
                return await db.Media.AnyAsync(m => m.Id == id, ct) ? null : "Ảnh không tồn tại trong thư viện.";
            default:
                return null;
        }
    }
}
