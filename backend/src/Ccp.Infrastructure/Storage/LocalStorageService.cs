using Ccp.Application.Abstractions;
using Microsoft.Extensions.Options;

namespace Ccp.Infrastructure.Storage;

public sealed class StorageOptions
{
    /// <summary>Thư mục gốc lưu tệp (tương đối với thư mục chạy hoặc tuyệt đối).</summary>
    public string LocalPath { get; set; } = "uploads";
    /// <summary>Tiền tố URL công khai; có thể là đường dẫn tương đối (/uploads) hoặc địa chỉ CDN.</summary>
    public string PublicBaseUrl { get; set; } = "/uploads";
}

public sealed class LocalStorageService : IStorageService
{
    private readonly string _root;
    private readonly string _publicBase;

    public LocalStorageService(IOptions<StorageOptions> options)
    {
        _root = Path.GetFullPath(options.Value.LocalPath);
        _publicBase = options.Value.PublicBaseUrl.TrimEnd('/');
        Directory.CreateDirectory(_root);
    }

    public string Provider => "local";

    public async Task<StoredFile> SaveAsync(string key, Stream content, string contentType, CancellationToken ct = default)
    {
        var path = ResolvePath(key);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        await using var file = new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.None);
        await content.CopyToAsync(file, ct);
        return new StoredFile(key, Provider, file.Length);
    }

    public Task DeleteAsync(string key, CancellationToken ct = default)
    {
        var path = ResolvePath(key);
        if (File.Exists(path)) File.Delete(path);
        return Task.CompletedTask;
    }

    public Task<Stream?> OpenReadAsync(string key, CancellationToken ct = default)
    {
        var path = ResolvePath(key);
        return Task.FromResult<Stream?>(File.Exists(path) ? new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read) : null);
    }

    public string GetPublicUrl(string key) => $"{_publicBase}/{key.TrimStart('/')}";

    /// <summary>Khoá chỉ gồm các đoạn tên thường; chặn mọi cách thoát khỏi thư mục gốc.</summary>
    private string ResolvePath(string key)
    {
        if (string.IsNullOrWhiteSpace(key) || key.Contains("..") || key.Contains('\\') || Path.IsPathRooted(key) || key.StartsWith('/'))
            throw new ArgumentException("Khoá tệp không hợp lệ.", nameof(key));
        var full = Path.GetFullPath(Path.Combine(_root, key));
        if (!full.StartsWith(_root + Path.DirectorySeparatorChar, StringComparison.Ordinal))
            throw new ArgumentException("Khoá tệp nằm ngoài thư mục lưu trữ.", nameof(key));
        return full;
    }
}
