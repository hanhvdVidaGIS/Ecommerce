namespace Ccp.Application.Common;

public sealed record ErrorDetail(string Field, string Message);

/// <summary>Lỗi nghiệp vụ có mã ổn định; bộ xử lý ngoại lệ toàn cục chuyển thành phản hồi chuẩn.</summary>
public class AppException(string code, string message, int statusCode = 400, IReadOnlyList<ErrorDetail>? details = null)
    : Exception(message)
{
    public string Code { get; } = code;
    public int StatusCode { get; } = statusCode;
    public IReadOnlyList<ErrorDetail> Details { get; } = details ?? [];

    public static AppException Validation(string message, params ErrorDetail[] details) => new("validation_failed", message, 400, details);
    public static AppException NotFound(string what) => new("not_found", $"Không tìm thấy {what}.", 404);
    public static AppException Conflict(string message, string code = "conflict") => new(code, message, 409);
    public static AppException Unauthorized(string message = "Chưa đăng nhập hoặc phiên đã hết hạn.", string code = "unauthorized") => new(code, message, 401);
    public static AppException Forbidden(string message = "Bạn không có quyền thực hiện thao tác này.") => new("forbidden", message, 403);
}
