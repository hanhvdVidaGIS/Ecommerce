using Ccp.Application.Common;
using Microsoft.AspNetCore.Mvc;

namespace Ccp.Api.Http;

[ApiController]
public abstract class ApiControllerBase : ControllerBase
{
    protected static ApiResponse<T> Ok<T>(T data) => ApiResponse.Ok(data);
    protected static ApiResponse<IReadOnlyList<T>> Paged<T>(PagedResult<T> page) => ApiResponse.Page(page);
    protected static ApiResponse<object> Done() => ApiResponse.Empty();
}
