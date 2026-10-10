namespace Ccp.Application.Abstractions;

/// <summary>
/// Bộ đệm cho dữ liệu công khai của website (site-config, menu...). Mọi thao tác ghi cấu hình gọi
/// InvalidateAll, đồng thời báo cho Storefront làm mới đệm của nó (nếu có cấu hình).
/// </summary>
public interface ISiteCache
{
    Task<T> GetOrCreateAsync<T>(string key, Func<Task<T>> factory);
    void InvalidateAll();
}
