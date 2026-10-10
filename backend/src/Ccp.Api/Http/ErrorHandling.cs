using System.Text.Json;
using Ccp.Application.Common;
using FluentValidation;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Ccp.Api.Http;

public static class ResponseWriter
{
    public static Task WriteAsync(HttpContext ctx, int status, string code, string message, IReadOnlyList<ErrorDetail>? details = null)
    {
        ctx.Response.StatusCode = status;
        ctx.Response.ContentType = "application/json; charset=utf-8";
        return ctx.Response.WriteAsJsonAsync(ApiResponse.Fail(code, message, details), ctx.RequestServices.GetRequiredService<Microsoft.Extensions.Options.IOptions<Microsoft.AspNetCore.Http.Json.JsonOptions>>().Value.SerializerOptions);
    }
}

/// <summary>Chuyển mọi ngoại lệ chưa bắt thành phản hồi chuẩn; không để lộ chi tiết nội bộ ra ngoài.</summary>
public sealed class GlobalExceptionHandler(ILogger<GlobalExceptionHandler> logger) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext ctx, Exception ex, CancellationToken ct)
    {
        switch (ex)
        {
            case AppException app:
                if (app.StatusCode >= 500) logger.LogError(ex, "Lỗi nghiệp vụ {Code} tại {Method} {Path}", app.Code, ctx.Request.Method, ctx.Request.Path);
                else logger.LogInformation("{Code} ({Status}) tại {Method} {Path}", app.Code, app.StatusCode, ctx.Request.Method, ctx.Request.Path);
                await ResponseWriter.WriteAsync(ctx, app.StatusCode, app.Code, app.Message, app.Details);
                return true;
            case DbUpdateConcurrencyException:
                await ResponseWriter.WriteAsync(ctx, 409, "concurrency_conflict", "Dữ liệu vừa được người khác thay đổi. Tải lại và thử lại.");
                return true;
            case DbUpdateException { InnerException: PostgresException { SqlState: PostgresErrorCodes.UniqueViolation } }:
                await ResponseWriter.WriteAsync(ctx, 409, "duplicate", "Giá trị đã tồn tại (trùng mã, slug hoặc SKU).");
                return true;
            case DbUpdateException { InnerException: PostgresException { SqlState: PostgresErrorCodes.ForeignKeyViolation } }:
                await ResponseWriter.WriteAsync(ctx, 409, "in_use", "Không thể thực hiện vì dữ liệu đang được sử dụng ở nơi khác.");
                return true;
            case BadHttpRequestException:
            case JsonException:
                await ResponseWriter.WriteAsync(ctx, 400, "bad_request", "Yêu cầu không hợp lệ.");
                return true;
            default:
                logger.LogError(ex, "Lỗi không xử lý được tại {Method} {Path}", ctx.Request.Method, ctx.Request.Path);
                await ResponseWriter.WriteAsync(ctx, 500, "internal_error", "Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau.");
                return true;
        }
    }
}

/// <summary>Kiểm tra đầu vào bằng FluentValidation cho mọi tham số action có validator đăng ký.</summary>
public sealed class ValidationFilter(IServiceProvider services) : IAsyncActionFilter
{
    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        var errors = new List<ErrorDetail>();
        foreach (var arg in context.ActionArguments.Values)
        {
            if (arg is null) continue;
            var validatorType = typeof(IValidator<>).MakeGenericType(arg.GetType());
            if (services.GetService(validatorType) is not IValidator validator) continue;
            var result = await validator.ValidateAsync(new ValidationContext<object>(arg), context.HttpContext.RequestAborted);
            errors.AddRange(result.Errors.Select(e => new ErrorDetail(ToCamel(e.PropertyName), e.ErrorMessage)));
        }
        if (errors.Count > 0) throw AppException.Validation("Dữ liệu không hợp lệ.", errors.ToArray());
        await next();
    }

    private static string ToCamel(string name) => string.Join('.', name.Split('.').Select(part => part.Length == 0 ? part : char.ToLowerInvariant(part[0]) + part[1..]));
}

public static class ApiBehavior
{
    /// <summary>Lỗi ràng buộc kiểu (JSON sai, sai kiểu dữ liệu) cũng trả về khung chuẩn.</summary>
    public static IActionResult InvalidModelState(ActionContext ctx)
    {
        var details = ctx.ModelState.Where(e => e.Value?.Errors.Count > 0)
            .SelectMany(e => e.Value!.Errors.Select(err => new ErrorDetail(e.Key.TrimStart('$', '.'), "Giá trị không hợp lệ.")))
            .ToList();
        return new BadRequestObjectResult(ApiResponse.Fail("validation_failed", "Dữ liệu không hợp lệ.", details));
    }
}
