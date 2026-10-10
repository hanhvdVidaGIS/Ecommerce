using Ccp.Application.Abstractions;
using Ccp.Application.Common;
using Ccp.Domain.Enums;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MediaEntity = Ccp.Domain.Entities.Media;

namespace Ccp.Application.MediaLibrary;

public sealed class MediaOptions
{
    public long MaxImageBytes { get; set; } = 10 * 1024 * 1024;
    public long MaxVideoBytes { get; set; } = 100 * 1024 * 1024;
    public int MaxFilesPerRequest { get; set; } = 20;
}

public sealed record MediaDto(Guid Id, string Url, string FileName, string MimeType, long SizeBytes, int? Width, int? Height,
    string Kind, string? Folder, string? AltText, DateTime CreatedAt);

public sealed record UploadError(string FileName, string Message);
public sealed record UploadResult(IReadOnlyList<MediaDto> Items, IReadOnlyList<UploadError> Errors);
public sealed record UpdateMediaRequest(string? AltText, string? Folder);

public sealed class MediaQuery : PageRequest
{
    public string? Kind { get; set; }
    public string? Folder { get; set; }
}

public sealed record IncomingFile(string FileName, string ContentType, long Length, Func<Stream> Open);

public class MediaService(IAppDbContext db, IStorageService storage, IOptions<MediaOptions> options, TimeProvider clock)
{
    private readonly MediaOptions _opt = options.Value;

    private static readonly Dictionary<string, (string Kind, string[] Mimes)> AllowedExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        [".jpg"] = ("image", ["image/jpeg"]), [".jpeg"] = ("image", ["image/jpeg"]), [".png"] = ("image", ["image/png"]),
        [".webp"] = ("image", ["image/webp"]), [".gif"] = ("image", ["image/gif"]),
        [".mp4"] = ("video", ["video/mp4"]), [".webm"] = ("video", ["video/webm"]),
    };

    private static readonly IReadOnlyDictionary<string, System.Linq.Expressions.Expression<Func<MediaEntity, object?>>> Sorts =
        new Dictionary<string, System.Linq.Expressions.Expression<Func<MediaEntity, object?>>>
        {
            ["createdAt"] = m => m.CreatedAt, ["fileName"] = m => m.FileName, ["sizeBytes"] = m => m.SizeBytes,
        };

    public async Task<PagedResult<MediaDto>> ListAsync(MediaQuery q, CancellationToken ct = default)
    {
        var query = db.Media.AsNoTracking().AsQueryable();
        if (!string.IsNullOrWhiteSpace(q.Q)) { var term = q.Q.Trim().ToLower(); query = query.Where(m => m.FileName.ToLower().Contains(term) || (m.AltText != null && m.AltText.ToLower().Contains(term))); }
        if (!string.IsNullOrWhiteSpace(q.Kind)) query = query.Where(m => m.Kind == q.Kind);
        if (!string.IsNullOrWhiteSpace(q.Folder)) query = query.Where(m => m.Folder == q.Folder);
        var page = await query.ApplySort(q.Sort, Sorts, "createdAt:desc").ToPagedAsync(q, ct);
        return new PagedResult<MediaDto>(page.Items.Select(ToDto).ToList(), page.Page, page.PageSize, page.Total);
    }

    public async Task<IReadOnlyList<string>> FoldersAsync(CancellationToken ct = default) =>
        await db.Media.AsNoTracking().Where(m => m.Folder != null).Select(m => m.Folder!).Distinct().OrderBy(f => f).ToListAsync(ct);

    public async Task<UploadResult> UploadAsync(IReadOnlyList<IncomingFile> files, string? folder, CancellationToken ct = default)
    {
        if (files.Count == 0) throw AppException.Validation("Chưa chọn tệp nào.", new ErrorDetail("files", "Cần ít nhất một tệp."));
        if (files.Count > _opt.MaxFilesPerRequest)
            throw AppException.Validation($"Tối đa {_opt.MaxFilesPerRequest} tệp mỗi lần tải.", new ErrorDetail("files", "Quá số tệp cho phép."));
        folder = NormalizeFolder(folder);

        var items = new List<MediaDto>();
        var errors = new List<UploadError>();
        foreach (var file in files)
        {
            try { items.Add(ToDto(await SaveOneAsync(file, folder, ct))); }
            catch (AppException ex) { errors.Add(new UploadError(SafeName(file.FileName), ex.Message)); }
        }
        return new UploadResult(items, errors);
    }

    public async Task<MediaDto> UpdateAsync(Guid id, UpdateMediaRequest req, CancellationToken ct = default)
    {
        var media = await db.Media.SingleOrDefaultAsync(m => m.Id == id, ct) ?? throw AppException.NotFound("ảnh");
        media.AltText = string.IsNullOrWhiteSpace(req.AltText) ? null : req.AltText.Trim()[..Math.Min(req.AltText.Trim().Length, 300)];
        media.Folder = NormalizeFolder(req.Folder);
        await db.SaveChangesAsync(ct);
        return ToDto(media);
    }

    public async Task DeleteAsync(Guid id, CancellationToken ct = default)
    {
        var media = await db.Media.SingleOrDefaultAsync(m => m.Id == id, ct) ?? throw AppException.NotFound("ảnh");
        var uses = await FindUsesAsync(id, ct);
        if (uses.Count > 0)
            throw AppException.Conflict($"Ảnh đang được sử dụng ở: {string.Join(", ", uses)}. Gỡ ảnh khỏi các nơi này trước khi xoá.", "in_use");

        db.Media.Remove(media); // xoá mềm
        await db.SaveChangesAsync(ct);
        await storage.DeleteAsync(media.StorageKey, ct);
    }

    private async Task<List<string>> FindUsesAsync(Guid id, CancellationToken ct)
    {
        var uses = new List<string>();
        var idText = id.ToString();
        if (await db.WebsiteSettings.AnyAsync(s => s.ValueType == SettingValueType.MediaId && s.Value == idText, ct)) uses.Add("cấu hình website");
        if (await db.Categories.AnyAsync(c => c.IconMediaId == id || c.BannerMediaId == id, ct)) uses.Add("danh mục");
        if (await db.Brands.AnyAsync(b => b.LogoMediaId == id, ct)) uses.Add("thương hiệu");
        if (await db.Banners.AnyAsync(b => b.DesktopMediaId == id || b.MobileMediaId == id, ct)) uses.Add("banner");
        if (await db.ProductImages.AnyAsync(i => i.MediaId == id, ct) || await db.ProductVariants.AnyAsync(v => v.ImageMediaId == id, ct)) uses.Add("sản phẩm");
        if (await db.ProductAttributeValues.AnyAsync(v => v.ImageMediaId == id, ct)) uses.Add("giá trị thuộc tính");
        return uses;
    }

    private async Task<MediaEntity> SaveOneAsync(IncomingFile file, string? folder, CancellationToken ct)
    {
        var name = SafeName(file.FileName);
        var ext = Path.GetExtension(name);
        if (!AllowedExtensions.TryGetValue(ext, out var rule))
            throw AppException.Validation($"Định dạng \"{ext}\" không được hỗ trợ. Cho phép: {string.Join(", ", AllowedExtensions.Keys)}.");
        if (!rule.Mimes.Contains(file.ContentType, StringComparer.OrdinalIgnoreCase))
            throw AppException.Validation("Loại nội dung khai báo không khớp với đuôi tệp.");

        var limit = rule.Kind == "video" ? _opt.MaxVideoBytes : _opt.MaxImageBytes;
        if (file.Length <= 0) throw AppException.Validation("Tệp rỗng.");
        if (file.Length > limit) throw AppException.Validation($"Tệp vượt quá giới hạn {FormatSize(limit)}.");

        // Kiểm tra nội dung thật bằng chữ ký tệp (magic bytes), không tin đuôi hay Content-Type do client khai.
        byte[] header;
        await using (var probe = file.Open())
        {
            header = new byte[65536];
            var read = await ReadAtLeastAsync(probe, header, ct);
            header = header[..read];
        }
        var sniffed = ImageInspector.Detect(header);
        if (sniffed is null || !ExtensionMatches(ext, sniffed.Value.Format))
            throw AppException.Validation("Nội dung tệp không đúng định dạng đã khai báo.");

        var now = clock.GetUtcNow().UtcDateTime;
        var key = $"{now:yyyy}/{now:MM}/{Guid.NewGuid():N}{ext.ToLowerInvariant()}";
        StoredFile stored;
        await using (var content = file.Open())
            stored = await storage.SaveAsync(key, content, file.ContentType, ct);

        var media = new MediaEntity
        {
            StorageKey = stored.Key, Provider = stored.Provider, FileName = name, MimeType = rule.Mimes[0], SizeBytes = stored.SizeBytes,
            Width = sniffed.Value.Width, Height = sniffed.Value.Height, Kind = rule.Kind, Folder = folder,
        };
        try
        {
            db.Media.Add(media);
            await db.SaveChangesAsync(ct);
        }
        catch
        {
            await storage.DeleteAsync(stored.Key, ct); // không để lại tệp mồ côi nếu ghi cơ sở dữ liệu lỗi
            throw;
        }
        return media;
    }

    private static bool ExtensionMatches(string ext, ImageFormat format) => format switch
    {
        ImageFormat.Jpeg => ext.Equals(".jpg", StringComparison.OrdinalIgnoreCase) || ext.Equals(".jpeg", StringComparison.OrdinalIgnoreCase),
        ImageFormat.Png => ext.Equals(".png", StringComparison.OrdinalIgnoreCase),
        ImageFormat.Gif => ext.Equals(".gif", StringComparison.OrdinalIgnoreCase),
        ImageFormat.Webp => ext.Equals(".webp", StringComparison.OrdinalIgnoreCase),
        ImageFormat.Mp4 => ext.Equals(".mp4", StringComparison.OrdinalIgnoreCase),
        ImageFormat.Webm => ext.Equals(".webm", StringComparison.OrdinalIgnoreCase),
        _ => false,
    };

    private static string FormatSize(long bytes) => bytes >= 1024 * 1024 ? $"{bytes / 1024 / 1024} MB" : $"{bytes / 1024} KB";

    private static async Task<int> ReadAtLeastAsync(Stream s, byte[] buffer, CancellationToken ct)
    {
        var total = 0;
        while (total < buffer.Length)
        {
            var n = await s.ReadAsync(buffer.AsMemory(total), ct);
            if (n == 0) break;
            total += n;
        }
        return total;
    }

    /// <summary>Bỏ đường dẫn, ký tự điều khiển và độ dài quá mức; tên gốc chỉ để hiển thị, tệp lưu bằng GUID.</summary>
    public static string SafeName(string fileName)
    {
        var name = Path.GetFileName((fileName ?? "").Replace('\\', '/'));
        name = new string(name.Where(c => !char.IsControl(c)).ToArray()).Trim();
        if (name.Length == 0) name = "tep";
        return name.Length > 200 ? name[^200..] : name;
    }

    private static string? NormalizeFolder(string? folder)
    {
        if (string.IsNullOrWhiteSpace(folder)) return null;
        var f = new string(folder.Trim().Where(c => char.IsLetterOrDigit(c) || c is ' ' or '-' or '_').ToArray()).Trim();
        return f.Length == 0 ? null : f[..Math.Min(f.Length, 100)];
    }

    private MediaDto ToDto(MediaEntity m) => new(m.Id, storage.GetPublicUrl(m.StorageKey), m.FileName, m.MimeType, m.SizeBytes, m.Width, m.Height,
        m.Kind, m.Folder, m.AltText, m.CreatedAt);
}
