using System.Globalization;
using System.Text;
using Ccp.Application.Abstractions;
using Ccp.Domain.Common;
using Microsoft.EntityFrameworkCore;

namespace Ccp.Application.Common;

public static class Slugger
{
    /// <summary>Chuyển tiếng Việt có dấu thành slug ASCII: "Nước hoa nam" → "nuoc-hoa-nam".</summary>
    public static string Slugify(string text)
    {
        var sb = new StringBuilder();
        foreach (var c in text.Normalize(NormalizationForm.FormD))
        {
            if (CharUnicodeInfo.GetUnicodeCategory(c) == UnicodeCategory.NonSpacingMark) continue;
            sb.Append(c == 'đ' ? 'd' : c == 'Đ' ? 'D' : c);
        }
        var chars = sb.ToString().ToLowerInvariant().Select(c => c is >= 'a' and <= 'z' or >= '0' and <= '9' ? c : '-').ToArray();
        return string.Join('-', new string(chars).Split('-', StringSplitOptions.RemoveEmptyEntries));
    }

    public static bool IsValidSlug(string slug) =>
        slug.Length is > 0 and <= 200 && slug.All(c => c is >= 'a' and <= 'z' or >= '0' and <= '9' or '-') && !slug.StartsWith('-') && !slug.EndsWith('-');
}

public sealed record SeoDto(string? MetaTitle, string? MetaDescription, string? Keywords, Guid? OgImageMediaId, string? CanonicalUrl, bool NoIndex)
{
    public static SeoDto From(SeoMeta s) => new(s.MetaTitle, s.MetaDescription, s.Keywords, s.OgImageMediaId, s.CanonicalUrl, s.NoIndex);

    public void ApplyTo(SeoMeta target)
    {
        target.MetaTitle = Clean(MetaTitle, 200);
        target.MetaDescription = Clean(MetaDescription, 500);
        target.Keywords = Clean(Keywords, 500);
        target.OgImageMediaId = OgImageMediaId;
        target.CanonicalUrl = Clean(CanonicalUrl, 500);
        target.NoIndex = NoIndex;
    }

    private static string? Clean(string? v, int max) => string.IsNullOrWhiteSpace(v) ? null : v.Trim()[..Math.Min(v.Trim().Length, max)];
}

public sealed record MediaRefDto(Guid Id, string Url, int? Width, int? Height, string? AltText);

/// <summary>Giải mã Media thành URL công khai; dùng chung cho mọi DTO có ảnh.</summary>
public class MediaResolver(IAppDbContext db, IStorageService storage)
{
    public async Task<Dictionary<Guid, MediaRefDto>> LoadAsync(IEnumerable<Guid?> ids, CancellationToken ct = default)
    {
        var distinct = ids.Where(i => i.HasValue).Select(i => i!.Value).Distinct().ToList();
        if (distinct.Count == 0) return [];
        var items = await db.Media.AsNoTracking().Where(m => distinct.Contains(m.Id)).ToListAsync(ct);
        return items.ToDictionary(m => m.Id, m => new MediaRefDto(m.Id, storage.GetPublicUrl(m.StorageKey), m.Width, m.Height, m.AltText));
    }

    public static MediaRefDto? Get(IReadOnlyDictionary<Guid, MediaRefDto> map, Guid? id) =>
        id is not null && map.TryGetValue(id.Value, out var r) ? r : null;

    /// <summary>Báo lỗi 400 nếu có mã ảnh không tồn tại trong thư viện.</summary>
    public async Task EnsureExistAsync(string field, IEnumerable<Guid?> ids, CancellationToken ct = default)
    {
        var distinct = ids.Where(i => i.HasValue).Select(i => i!.Value).Distinct().ToList();
        if (distinct.Count == 0) return;
        var found = await db.Media.Where(m => distinct.Contains(m.Id)).Select(m => m.Id).ToListAsync(ct);
        if (found.Count != distinct.Count)
            throw AppException.Validation("Ảnh không tồn tại trong thư viện.", new ErrorDetail(field, "Mã ảnh không tồn tại."));
    }
}

public static class SlugRules
{
    /// <summary>Slug do người dùng nhập hoặc tự sinh từ tên; trả về slug hợp lệ.</summary>
    public static string Resolve(string? slug, string name)
    {
        var value = string.IsNullOrWhiteSpace(slug) ? Slugger.Slugify(name) : slug.Trim().ToLowerInvariant();
        if (!Slugger.IsValidSlug(value))
            throw AppException.Validation("Slug không hợp lệ.", new ErrorDetail("slug", "Slug chỉ gồm chữ thường a-z, số và dấu gạch ngang."));
        return value;
    }
}
