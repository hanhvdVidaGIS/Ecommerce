using Ccp.Application.Common;

namespace Ccp.Api.Http;

public sealed record PageMeta(int Page, int PageSize, int Total);

public sealed record ApiError(string Code, string Message, IReadOnlyList<ErrorDetail>? Details = null);

/// <summary>Khung phản hồi thống nhất của mọi điểm cuối.</summary>
public sealed record ApiResponse<T>(bool Success, T? Data, PageMeta? Meta, ApiError? Error)
{
    public static ApiResponse<T> Ok(T data) => new(true, data, null, null);
}

public static class ApiResponse
{
    public static ApiResponse<T> Ok<T>(T data) => ApiResponse<T>.Ok(data);

    public static ApiResponse<IReadOnlyList<T>> Page<T>(PagedResult<T> page) =>
        new(true, page.Items, new PageMeta(page.Page, page.PageSize, page.Total), null);

    public static ApiResponse<object> Fail(string code, string message, IReadOnlyList<ErrorDetail>? details = null) =>
        new(false, null, null, new ApiError(code, message, details));

    public static ApiResponse<object> Empty() => new(true, null, null, null);
}
