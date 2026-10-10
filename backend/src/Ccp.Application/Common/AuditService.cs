using System.Text.Json;
using Ccp.Application.Abstractions;
using Ccp.Domain.Entities;

namespace Ccp.Application.Common;

/// <summary>
/// Ghi nhật ký thao tác quản trị nhạy cảm (cấu hình, quyền, người dùng, giá). Chỉ thêm bản ghi vào ngữ cảnh;
/// bản ghi được lưu cùng lệnh SaveChanges của thao tác chính nên hai việc thành công hoặc thất bại cùng nhau.
/// </summary>
public class AuditService(IAppDbContext db, ICurrentUser user, TimeProvider clock)
{
    public void Log(string action, string entityType, string? entityId = null, object? changes = null)
    {
        db.AuditLogs.Add(new AuditLog
        {
            UserId = user.UserId, Action = action, EntityType = entityType, EntityId = entityId,
            Changes = changes is null ? null : JsonSerializer.Serialize(changes, new JsonSerializerOptions(JsonSerializerDefaults.Web)),
            At = clock.GetUtcNow().UtcDateTime, Ip = user.Ip,
        });
    }
}
