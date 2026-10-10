using System.Linq.Expressions;
using Ccp.Application.Abstractions;
using Ccp.Application.Auth;
using Ccp.Application.Common;
using Ccp.Domain.Entities;
using Ccp.Domain.Security;
using FluentValidation;
using Microsoft.EntityFrameworkCore;

namespace Ccp.Application.Access;

public sealed record AdminUserDto(Guid Id, string Email, string FullName, string? PhoneNumber, bool IsActive, IReadOnlyList<string> Roles, DateTime CreatedAt);
public sealed record CreateUserRequest(string Email, string Password, string FullName, string? PhoneNumber, IReadOnlyList<string> RoleCodes);
public sealed record UpdateUserRequest(string FullName, string? PhoneNumber, bool IsActive, IReadOnlyList<string> RoleCodes);
public sealed record ResetUserPasswordRequest(string NewPassword);

public sealed class UserQuery : PageRequest
{
    /// <summary>staff (mặc định): người dùng có vai trò khác Customer; customer: chỉ khách hàng; all: tất cả.</summary>
    public string Scope { get; set; } = "staff";
    public string? Role { get; set; }
    public bool? IsActive { get; set; }
}

public sealed record RoleListItemDto(Guid Id, string Code, string Name, bool IsSystem, int PermissionCount, int UserCount);
public sealed record RoleDetailDto(Guid Id, string Code, string Name, bool IsSystem, IReadOnlyList<string> PermissionCodes, int UserCount);
public sealed record CreateRoleRequest(string Code, string Name, IReadOnlyList<string>? PermissionCodes);
public sealed record UpdateRoleRequest(string Name, IReadOnlyList<string> PermissionCodes);
public sealed record PermissionDto(string Group, string Code, string Description, bool SuperAdminOnly);

public sealed class CreateUserRequestValidator : AbstractValidator<CreateUserRequest>
{
    public CreateUserRequestValidator()
    {
        RuleFor(x => x.Email).NotEmpty().EmailAddress().MaximumLength(255).WithMessage("Email không hợp lệ.");
        RuleFor(x => x.Password).StrongPassword();
        RuleFor(x => x.FullName).NotEmpty().MaximumLength(200);
        RuleFor(x => x.PhoneNumber).MaximumLength(30);
        RuleFor(x => x.RoleCodes).NotNull().Must(r => r is { Count: > 0 }).WithMessage("Chọn ít nhất một vai trò.");
    }
}

public sealed class UpdateUserRequestValidator : AbstractValidator<UpdateUserRequest>
{
    public UpdateUserRequestValidator()
    {
        RuleFor(x => x.FullName).NotEmpty().MaximumLength(200);
        RuleFor(x => x.PhoneNumber).MaximumLength(30);
        RuleFor(x => x.RoleCodes).NotNull().Must(r => r is { Count: > 0 }).WithMessage("Chọn ít nhất một vai trò.");
    }
}

public sealed class ResetUserPasswordRequestValidator : AbstractValidator<ResetUserPasswordRequest>
{
    public ResetUserPasswordRequestValidator() => RuleFor(x => x.NewPassword).StrongPassword();
}

public sealed class CreateRoleRequestValidator : AbstractValidator<CreateRoleRequest>
{
    public CreateRoleRequestValidator()
    {
        RuleFor(x => x.Code).NotEmpty().MaximumLength(50).Matches("^[A-Za-z][A-Za-z0-9]*$").WithMessage("Mã vai trò chỉ gồm chữ và số, bắt đầu bằng chữ.");
        RuleFor(x => x.Name).NotEmpty().MaximumLength(100);
    }
}

public sealed class UpdateRoleRequestValidator : AbstractValidator<UpdateRoleRequest>
{
    public UpdateRoleRequestValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(100);
        RuleFor(x => x.PermissionCodes).NotNull();
    }
}

public class UserAdminService(IAppDbContext db, IPasswordHasher hasher, ICurrentUser current, AuditService audit, TimeProvider clock)
{
    private static readonly IReadOnlyDictionary<string, Expression<Func<User, object?>>> Sorts = new Dictionary<string, Expression<Func<User, object?>>>
    {
        ["email"] = u => u.Email, ["fullName"] = u => u.FullName, ["createdAt"] = u => u.CreatedAt,
    };

    public async Task<PagedResult<AdminUserDto>> ListAsync(UserQuery q, CancellationToken ct = default)
    {
        var query = db.Users.AsNoTracking().AsQueryable();
        query = q.Scope switch
        {
            "customer" => query.Where(u => u.UserRoles.All(r => r.Role!.Code == RoleDefaults.Customer)),
            "all" => query,
            "staff" => query.Where(u => u.UserRoles.Any(r => r.Role!.Code != RoleDefaults.Customer)),
            _ => throw AppException.Validation("Scope không hợp lệ.", new ErrorDetail("scope", "Chọn staff, customer hoặc all.")),
        };
        if (!string.IsNullOrWhiteSpace(q.Role)) query = query.Where(u => u.UserRoles.Any(r => r.Role!.Code == q.Role));
        if (q.IsActive is not null) query = query.Where(u => u.IsActive == q.IsActive);
        if (!string.IsNullOrWhiteSpace(q.Q)) { var t = q.Q.Trim().ToLower(); query = query.Where(u => u.Email.Contains(t) || u.FullName.ToLower().Contains(t)); }
        var page = await query.ApplySort(q.Sort, Sorts, "createdAt:desc").Include(u => u.UserRoles).ThenInclude(r => r.Role).ToPagedAsync(q, ct);
        return new PagedResult<AdminUserDto>(page.Items.Select(ToDto).ToList(), page.Page, page.PageSize, page.Total);
    }

    public async Task<AdminUserDto> GetAsync(Guid id, CancellationToken ct = default) =>
        ToDto(await db.Users.AsNoTracking().Include(u => u.UserRoles).ThenInclude(r => r.Role).SingleOrDefaultAsync(u => u.Id == id, ct) ?? throw AppException.NotFound("người dùng"));

    public async Task<AdminUserDto> CreateAsync(CreateUserRequest req, CancellationToken ct = default)
    {
        var email = AuthService.NormalizeEmail(req.Email);
        if (await db.Users.AnyAsync(u => u.Email == email, ct)) throw AppException.Conflict("Email đã được sử dụng.", "email_taken");
        var roles = await ResolveRolesAsync(req.RoleCodes, ct);
        var user = new User { Email = email, FullName = req.FullName.Trim(), PhoneNumber = req.PhoneNumber?.Trim(), PasswordHash = hasher.Hash(req.Password), EmailConfirmed = true };
        foreach (var r in roles) user.UserRoles.Add(new UserRole { UserId = user.Id, RoleId = r.Id });
        db.Users.Add(user);
        audit.Log("user.create", nameof(User), user.Id.ToString(), new { email, roles = roles.Select(r => r.Code) });
        await db.SaveChangesAsync(ct);
        return await GetAsync(user.Id, ct);
    }

    public async Task<AdminUserDto> UpdateAsync(Guid id, UpdateUserRequest req, CancellationToken ct = default)
    {
        var user = await db.Users.Include(u => u.UserRoles).ThenInclude(r => r.Role).SingleOrDefaultAsync(u => u.Id == id, ct) ?? throw AppException.NotFound("người dùng");
        var roles = await ResolveRolesAsync(req.RoleCodes, ct);
        var wasSuper = user.UserRoles.Any(r => r.Role!.Code == RoleDefaults.SuperAdmin);
        var willBeSuper = roles.Any(r => r.Code == RoleDefaults.SuperAdmin);
        if (id == current.UserId && !req.IsActive) throw AppException.Validation("Không thể tự khoá tài khoản của chính mình.", new ErrorDetail("isActive", "Không hợp lệ."));
        if (wasSuper && (!willBeSuper || !req.IsActive)) await EnsureAnotherSuperAdminAsync(id, ct);

        var before = new { roles = user.UserRoles.Select(r => r.Role!.Code).Order().ToList(), user.IsActive };
        user.FullName = req.FullName.Trim(); user.PhoneNumber = string.IsNullOrWhiteSpace(req.PhoneNumber) ? null : req.PhoneNumber.Trim();
        var rolesChanged = !user.UserRoles.Select(r => r.RoleId).Order().SequenceEqual(roles.Select(r => r.Id).Order());
        if (rolesChanged)
        {
            var wantedIds = roles.Select(r => r.Id).ToHashSet();
            foreach (var gone in user.UserRoles.Where(ur => !wantedIds.Contains(ur.RoleId)).ToList())
            {
                user.UserRoles.Remove(gone);
                db.UserRoles.Remove(gone);
            }
            foreach (var r in roles.Where(r => user.UserRoles.All(ur => ur.RoleId != r.Id)))
                user.UserRoles.Add(new UserRole { UserId = user.Id, RoleId = r.Id });
        }
        var deactivated = user.IsActive && !req.IsActive;
        user.IsActive = req.IsActive;
        if (deactivated || rolesChanged) await RevokeSessionsAsync(id, ct); // buộc đăng nhập/làm mới lại để nhận quyền mới
        audit.Log("user.update", nameof(User), id.ToString(), new { before, after = new { roles = roles.Select(r => r.Code).Order().ToList(), req.IsActive } });
        await db.SaveChangesAsync(ct);
        return await GetAsync(id, ct);
    }

    public async Task ResetPasswordAsync(Guid id, ResetUserPasswordRequest req, CancellationToken ct = default)
    {
        var user = await db.Users.SingleOrDefaultAsync(u => u.Id == id, ct) ?? throw AppException.NotFound("người dùng");
        user.PasswordHash = hasher.Hash(req.NewPassword);
        user.FailedLoginCount = 0; user.LockoutEnd = null;
        await RevokeSessionsAsync(id, ct);
        audit.Log("user.password-reset", nameof(User), id.ToString());
        await db.SaveChangesAsync(ct);
    }

    public async Task DeleteAsync(Guid id, CancellationToken ct = default)
    {
        if (id == current.UserId) throw AppException.Validation("Không thể tự xoá tài khoản của chính mình.");
        var user = await db.Users.Include(u => u.UserRoles).ThenInclude(r => r.Role).SingleOrDefaultAsync(u => u.Id == id, ct) ?? throw AppException.NotFound("người dùng");
        if (user.UserRoles.Any(r => r.Role!.Code == RoleDefaults.SuperAdmin)) await EnsureAnotherSuperAdminAsync(id, ct);
        await RevokeSessionsAsync(id, ct);
        db.Users.Remove(user); // xoá mềm; email được giải phóng nhờ chỉ mục duy nhất một phần
        audit.Log("user.delete", nameof(User), id.ToString(), new { user.Email });
        await db.SaveChangesAsync(ct);
    }

    private async Task<List<Role>> ResolveRolesAsync(IReadOnlyList<string> codes, CancellationToken ct)
    {
        var distinct = codes.Distinct().ToList();
        var roles = await db.Roles.Where(r => distinct.Contains(r.Code)).ToListAsync(ct);
        if (roles.Count != distinct.Count)
            throw AppException.Validation("Có vai trò không tồn tại.", new ErrorDetail("roleCodes", $"Không tồn tại: {string.Join(", ", distinct.Except(roles.Select(r => r.Code)))}."));
        return roles;
    }

    private async Task EnsureAnotherSuperAdminAsync(Guid exceptUserId, CancellationToken ct)
    {
        var others = await db.UserRoles.CountAsync(ur => ur.Role!.Code == RoleDefaults.SuperAdmin && ur.UserId != exceptUserId && ur.User!.IsActive, ct);
        if (others == 0) throw AppException.Conflict("Phải còn ít nhất một Super Admin đang hoạt động.", "last_super_admin");
    }

    private async Task RevokeSessionsAsync(Guid userId, CancellationToken ct)
    {
        var now = clock.GetUtcNow().UtcDateTime;
        foreach (var t in await db.RefreshTokens.Where(t => t.UserId == userId && t.RevokedAt == null).ToListAsync(ct)) t.RevokedAt = now;
    }

    private static AdminUserDto ToDto(User u) => new(u.Id, u.Email, u.FullName, u.PhoneNumber, u.IsActive,
        u.UserRoles.Select(r => r.Role!.Code).Order().ToList(), u.CreatedAt);
}

public class RoleService(IAppDbContext db, AuditService audit)
{
    public async Task<IReadOnlyList<RoleListItemDto>> ListAsync(CancellationToken ct = default)
    {
        var users = await db.UserRoles.AsNoTracking().GroupBy(ur => ur.RoleId).Select(g => new { Id = g.Key, N = g.Count() }).ToDictionaryAsync(x => x.Id, x => x.N, ct);
        var perms = await db.RolePermissions.AsNoTracking().GroupBy(rp => rp.RoleId).Select(g => new { Id = g.Key, N = g.Count() }).ToDictionaryAsync(x => x.Id, x => x.N, ct);
        var roles = await db.Roles.AsNoTracking().OrderBy(r => r.Code).ToListAsync(ct);
        // SuperAdmin có mọi quyền theo định nghĩa, không phụ thuộc bảng RolePermission.
        return roles.Select(r => new RoleListItemDto(r.Id, r.Code, r.Name, r.IsSystem,
            r.Code == RoleDefaults.SuperAdmin ? Permissions.All.Count : perms.GetValueOrDefault(r.Id), users.GetValueOrDefault(r.Id))).ToList();
    }

    public async Task<RoleDetailDto> GetAsync(Guid id, CancellationToken ct = default)
    {
        var role = await db.Roles.AsNoTracking().SingleOrDefaultAsync(r => r.Id == id, ct) ?? throw AppException.NotFound("vai trò");
        var codes = role.Code == RoleDefaults.SuperAdmin
            ? Permissions.All.Select(p => p.Code).ToList()
            : await db.RolePermissions.AsNoTracking().Where(rp => rp.RoleId == id).Select(rp => rp.Permission!.Code).OrderBy(c => c).ToListAsync(ct);
        return new RoleDetailDto(role.Id, role.Code, role.Name, role.IsSystem, codes, await db.UserRoles.CountAsync(ur => ur.RoleId == id, ct));
    }

    public async Task<RoleDetailDto> CreateAsync(CreateRoleRequest req, CancellationToken ct = default)
    {
        if (await db.Roles.AnyAsync(r => r.Code == req.Code, ct)) throw AppException.Conflict("Mã vai trò đã tồn tại.", "code_taken");
        var role = new Role { Code = req.Code, Name = req.Name.Trim(), IsSystem = false };
        db.Roles.Add(role);
        await ApplyPermissionsAsync(role, req.PermissionCodes ?? [], ct);
        audit.Log("role.create", nameof(Role), role.Id.ToString(), new { role.Code, permissions = req.PermissionCodes });
        await db.SaveChangesAsync(ct);
        return await GetAsync(role.Id, ct);
    }

    public async Task<RoleDetailDto> UpdateAsync(Guid id, UpdateRoleRequest req, CancellationToken ct = default)
    {
        var role = await db.Roles.Include(r => r.RolePermissions).SingleOrDefaultAsync(r => r.Id == id, ct) ?? throw AppException.NotFound("vai trò");
        if (role.Code == RoleDefaults.SuperAdmin) throw AppException.Conflict("Vai trò Super Admin luôn có toàn bộ quyền và không chỉnh sửa được.", "immutable_role");
        var before = await db.RolePermissions.Where(rp => rp.RoleId == id).Select(rp => rp.Permission!.Code).OrderBy(c => c).ToListAsync(ct);
        role.Name = req.Name.Trim();
        await ApplyPermissionsAsync(role, req.PermissionCodes, ct);
        audit.Log("role.update", nameof(Role), id.ToString(), new { role.Code, before, after = req.PermissionCodes.Order() });
        await db.SaveChangesAsync(ct);
        return await GetAsync(id, ct);
    }

    public async Task DeleteAsync(Guid id, CancellationToken ct = default)
    {
        var role = await db.Roles.SingleOrDefaultAsync(r => r.Id == id, ct) ?? throw AppException.NotFound("vai trò");
        if (role.IsSystem) throw AppException.Conflict("Không xoá được vai trò hệ thống.", "system_role");
        if (await db.UserRoles.AnyAsync(ur => ur.RoleId == id, ct)) throw AppException.Conflict("Vai trò đang được gán cho người dùng.", "in_use");
        db.RolePermissions.RemoveRange(await db.RolePermissions.Where(rp => rp.RoleId == id).ToListAsync(ct));
        db.Roles.Remove(role);
        audit.Log("role.delete", nameof(Role), id.ToString(), new { role.Code });
        await db.SaveChangesAsync(ct);
    }

    public static IReadOnlyList<PermissionDto> AllPermissions() => Permissions.All.Select(p => new PermissionDto(p.Group, p.Code, p.Description, p.SuperAdminOnly)).ToList();

    /// <summary>
    /// Quyền chỉ dành cho Super Admin (User/Role/Permission) không được gán cho bất kỳ vai trò nào khác,
    /// kể cả khi người gọi là Super Admin: ràng buộc nằm ở đây, không chỉ ở giao diện.
    /// </summary>
    private async Task ApplyPermissionsAsync(Role role, IReadOnlyList<string> codes, CancellationToken ct)
    {
        var wanted = codes.Distinct().ToList();
        var unknown = wanted.Except(Permissions.All.Select(p => p.Code)).ToList();
        if (unknown.Count > 0) throw AppException.Validation("Có quyền không tồn tại.", new ErrorDetail("permissionCodes", $"Không tồn tại: {string.Join(", ", unknown)}."));
        var restricted = wanted.Where(c => Permissions.All.Single(p => p.Code == c).SuperAdminOnly).ToList();
        if (restricted.Count > 0)
            throw AppException.Validation("Quyền quản lý người dùng, vai trò, phân quyền chỉ dành cho Super Admin.",
                new ErrorDetail("permissionCodes", $"Không được gán: {string.Join(", ", restricted)}."));

        var dbPerms = await db.Permissions.Where(p => wanted.Contains(p.Code)).ToDictionaryAsync(p => p.Code, ct);
        var current = await db.RolePermissions.Where(rp => rp.RoleId == role.Id).ToListAsync(ct);
        db.RolePermissions.RemoveRange(current.Where(rp => !dbPerms.Values.Any(p => p.Id == rp.PermissionId)));
        foreach (var p in dbPerms.Values.Where(p => current.All(rp => rp.PermissionId != p.Id)))
            db.RolePermissions.Add(new RolePermission { RoleId = role.Id, PermissionId = p.Id });
    }
}

public sealed record AuditLogDto(Guid Id, Guid? UserId, string? UserEmail, string Action, string EntityType, string? EntityId, string? Changes, DateTime At, string? Ip);

public sealed class AuditQuery : PageRequest
{
    public string? EntityType { get; set; }
    public string? Action { get; set; }
}

public class AuditQueryService(IAppDbContext db)
{
    public async Task<PagedResult<AuditLogDto>> ListAsync(AuditQuery q, CancellationToken ct = default)
    {
        var query = db.AuditLogs.AsNoTracking().AsQueryable();
        if (!string.IsNullOrWhiteSpace(q.EntityType)) query = query.Where(a => a.EntityType == q.EntityType);
        if (!string.IsNullOrWhiteSpace(q.Action)) query = query.Where(a => a.Action == q.Action);
        var page = await query.OrderByDescending(a => a.At).ToPagedAsync(q, ct);
        var userIds = page.Items.Where(a => a.UserId != null).Select(a => a.UserId!.Value).Distinct().ToList();
        var emails = await db.Users.IgnoreQueryFilters().AsNoTracking().Where(u => userIds.Contains(u.Id)).ToDictionaryAsync(u => u.Id, u => u.Email, ct);
        return new PagedResult<AuditLogDto>(page.Items.Select(a => new AuditLogDto(a.Id, a.UserId, a.UserId is { } id ? emails.GetValueOrDefault(id) : null,
            a.Action, a.EntityType, a.EntityId, a.Changes, a.At, a.Ip)).ToList(), page.Page, page.PageSize, page.Total);
    }
}
