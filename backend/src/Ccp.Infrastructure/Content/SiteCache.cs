using System.Net.Http.Json;
using Ccp.Application.Abstractions;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace Ccp.Infrastructure.Content;

public sealed class SiteCache(IMemoryCache cache, IHttpClientFactory httpFactory, IConfiguration configuration, ILogger<SiteCache> logger) : ISiteCache
{
    private static readonly TimeSpan Ttl = TimeSpan.FromMinutes(5);
    private static CancellationTokenSource _generation = new();
    private static readonly object Gate = new();

    public async Task<T> GetOrCreateAsync<T>(string key, Func<Task<T>> factory)
    {
        var result = await cache.GetOrCreateAsync($"site:{key}", entry =>
        {
            entry.AbsoluteExpirationRelativeToNow = Ttl;
            entry.AddExpirationToken(new Microsoft.Extensions.Primitives.CancellationChangeToken(_generation.Token));
            return factory();
        });
        return result!;
    }

    public void InvalidateAll()
    {
        lock (Gate)
        {
            var old = _generation;
            _generation = new CancellationTokenSource();
            old.Cancel();
            old.Dispose();
        }
        _ = NotifyStorefrontAsync();
    }

    /// <summary>Làm mới đệm của Storefront (Next.js revalidateTag). Lỗi chỉ ghi nhật ký, không làm hỏng thao tác lưu.</summary>
    private async Task NotifyStorefrontAsync()
    {
        var url = configuration["Storefront:RevalidateUrl"];
        var secret = configuration["Storefront:RevalidateSecret"];
        if (string.IsNullOrWhiteSpace(url) || string.IsNullOrWhiteSpace(secret)) return;
        try
        {
            using var req = new HttpRequestMessage(HttpMethod.Post, url);
            req.Headers.Add("X-Revalidate-Secret", secret);
            req.Content = JsonContent.Create(new { tag = "site-config" });
            using var res = await httpFactory.CreateClient().SendAsync(req);
            if (!res.IsSuccessStatusCode) logger.LogWarning("Storefront revalidate trả về {Status}", (int)res.StatusCode);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Không gọi được Storefront revalidate");
        }
    }
}
