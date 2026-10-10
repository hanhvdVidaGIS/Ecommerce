using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore;

namespace Ccp.Application.Common;

public sealed record PagedResult<T>(IReadOnlyList<T> Items, int Page, int PageSize, int Total);

public class PageRequest
{
    public const int MaxPageSize = 100;
    private int _page = 1;
    private int _pageSize = 20;

    public int Page { get => _page; set => _page = Math.Max(1, value); }
    public int PageSize { get => _pageSize; set => _pageSize = Math.Clamp(value, 1, MaxPageSize); }
    /// <summary>Dạng "tên:asc" hoặc "tên:desc"; chỉ nhận trường nằm trong danh sách cho phép của từng điểm cuối.</summary>
    public string? Sort { get; set; }
    public string? Q { get; set; }
}

public static class QueryableExtensions
{
    /// <summary>
    /// Sắp xếp theo danh sách trường cho phép. Trường lạ bị từ chối bằng lỗi 400 thay vì ghép vào truy vấn.
    /// </summary>
    public static IQueryable<T> ApplySort<T>(this IQueryable<T> query, string? sort,
        IReadOnlyDictionary<string, Expression<Func<T, object?>>> allowed, string defaultSort)
    {
        var spec = string.IsNullOrWhiteSpace(sort) ? defaultSort : sort;
        var parts = spec.Split(':', StringSplitOptions.TrimEntries);
        var desc = parts.Length > 1 && parts[1].Equals("desc", StringComparison.OrdinalIgnoreCase);
        if (parts.Length > 2 || (parts.Length == 2 && !desc && !parts[1].Equals("asc", StringComparison.OrdinalIgnoreCase)))
            throw AppException.Validation("Tham số sort không hợp lệ.", new ErrorDetail("sort", "Dạng đúng: <trường>:asc|desc."));

        var key = allowed.Keys.FirstOrDefault(k => k.Equals(parts[0], StringComparison.OrdinalIgnoreCase));
        if (key is null)
            throw AppException.Validation("Tham số sort không hợp lệ.",
                new ErrorDetail("sort", $"Trường được phép: {string.Join(", ", allowed.Keys)}."));

        return desc ? query.OrderByDescending(allowed[key]) : query.OrderBy(allowed[key]);
    }

    public static async Task<PagedResult<T>> ToPagedAsync<T>(this IQueryable<T> query, PageRequest request, CancellationToken ct = default)
    {
        var total = await query.CountAsync(ct);
        var items = await query.Skip((request.Page - 1) * request.PageSize).Take(request.PageSize).ToListAsync(ct);
        return new PagedResult<T>(items, request.Page, request.PageSize, total);
    }
}
