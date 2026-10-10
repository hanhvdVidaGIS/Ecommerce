using Ccp.Api.Http;
using Ccp.Api.Security;
using Ccp.Application.Access;
using Ccp.Domain.Security;
using Microsoft.AspNetCore.Mvc;

namespace Ccp.Api.Controllers;

[Route("api/admin/users")]
public class AdminUsersController(UserAdminService service) : ApiControllerBase
{
    [HttpGet, HasPermission(Permissions.UserManage)]
    public async Task<ApiResponse<IReadOnlyList<AdminUserDto>>> List([FromQuery] UserQuery query, CancellationToken ct) => Paged(await service.ListAsync(query, ct));

    [HttpGet("{id:guid}"), HasPermission(Permissions.UserManage)]
    public async Task<ApiResponse<AdminUserDto>> Get(Guid id, CancellationToken ct) => Ok(await service.GetAsync(id, ct));

    [HttpPost, HasPermission(Permissions.UserManage)]
    public async Task<ApiResponse<AdminUserDto>> Create(CreateUserRequest request, CancellationToken ct) => Ok(await service.CreateAsync(request, ct));

    [HttpPut("{id:guid}"), HasPermission(Permissions.UserManage)]
    public async Task<ApiResponse<AdminUserDto>> Update(Guid id, UpdateUserRequest request, CancellationToken ct) => Ok(await service.UpdateAsync(id, request, ct));

    [HttpPost("{id:guid}/reset-password"), HasPermission(Permissions.UserManage)]
    public async Task<ApiResponse<object>> ResetPassword(Guid id, ResetUserPasswordRequest request, CancellationToken ct)
    {
        await service.ResetPasswordAsync(id, request, ct);
        return Done();
    }

    [HttpDelete("{id:guid}"), HasPermission(Permissions.UserManage)]
    public async Task<ApiResponse<object>> Delete(Guid id, CancellationToken ct)
    {
        await service.DeleteAsync(id, ct);
        return Done();
    }
}

[Route("api/admin/roles")]
public class AdminRolesController(RoleService service) : ApiControllerBase
{
    [HttpGet, HasPermission(Permissions.RoleManage)]
    public async Task<ApiResponse<IReadOnlyList<RoleListItemDto>>> List(CancellationToken ct) => Ok(await service.ListAsync(ct));

    [HttpGet("{id:guid}"), HasPermission(Permissions.RoleManage)]
    public async Task<ApiResponse<RoleDetailDto>> Get(Guid id, CancellationToken ct) => Ok(await service.GetAsync(id, ct));

    [HttpPost, HasPermission(Permissions.RoleManage)]
    public async Task<ApiResponse<RoleDetailDto>> Create(CreateRoleRequest request, CancellationToken ct) => Ok(await service.CreateAsync(request, ct));

    /// <summary>Đổi quyền cần thêm Permission.Manage; quyền chỉ dành cho Super Admin bị từ chối ở tầng Application.</summary>
    [HttpPut("{id:guid}"), HasPermission(Permissions.RoleManage), HasPermission(Permissions.PermissionManage)]
    public async Task<ApiResponse<RoleDetailDto>> Update(Guid id, UpdateRoleRequest request, CancellationToken ct) => Ok(await service.UpdateAsync(id, request, ct));

    [HttpDelete("{id:guid}"), HasPermission(Permissions.RoleManage)]
    public async Task<ApiResponse<object>> Delete(Guid id, CancellationToken ct)
    {
        await service.DeleteAsync(id, ct);
        return Done();
    }
}

[Route("api/admin/permissions")]
public class AdminPermissionsController : ApiControllerBase
{
    [HttpGet, HasPermission(Permissions.PermissionManage)]
    public ApiResponse<IReadOnlyList<PermissionDto>> List() => Ok(RoleService.AllPermissions());
}

[Route("api/admin/audit-logs")]
public class AdminAuditLogsController(AuditQueryService service) : ApiControllerBase
{
    [HttpGet, HasPermission(Permissions.UserManage)]
    public async Task<ApiResponse<IReadOnlyList<AuditLogDto>>> List([FromQuery] AuditQuery query, CancellationToken ct) => Paged(await service.ListAsync(query, ct));
}
