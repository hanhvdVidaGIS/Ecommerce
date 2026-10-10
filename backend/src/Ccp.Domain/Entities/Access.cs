using Ccp.Domain.Common;

namespace Ccp.Domain.Entities;

public class User : SoftDeletableEntity
{
    public string Email { get; set; } = "";
    public string? PhoneNumber { get; set; }
    public string PasswordHash { get; set; } = "";
    public string FullName { get; set; } = "";
    /// <summary>false: tài khoản bị khoá.</summary>
    public bool IsActive { get; set; } = true;
    public DateTime? LockoutEnd { get; set; }
    public int FailedLoginCount { get; set; }
    public bool EmailConfirmed { get; set; }
    public List<UserRole> UserRoles { get; set; } = [];
}

public class Role : AuditableEntity
{
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    public bool IsSystem { get; set; }
    public List<RolePermission> RolePermissions { get; set; } = [];
}

public class Permission : Entity
{
    public string Code { get; set; } = "";
    public string Group { get; set; } = "";
    public string? Description { get; set; }
}

public class UserRole
{
    public Guid UserId { get; set; }
    public User? User { get; set; }
    public Guid RoleId { get; set; }
    public Role? Role { get; set; }
}

public class RolePermission
{
    public Guid RoleId { get; set; }
    public Role? Role { get; set; }
    public Guid PermissionId { get; set; }
    public Permission? Permission { get; set; }
}

public class RefreshToken : Entity
{
    public Guid UserId { get; set; }
    public User? User { get; set; }
    public string TokenHash { get; set; } = "";
    public DateTime CreatedAt { get; set; }
    public DateTime ExpiresAt { get; set; }
    public DateTime? RevokedAt { get; set; }
    public string? ReplacedByHash { get; set; }
    public string? CreatedByIp { get; set; }
}

public class AuditLog : Entity
{
    public Guid? UserId { get; set; }
    public string Action { get; set; } = "";
    public string EntityType { get; set; } = "";
    public string? EntityId { get; set; }
    /// <summary>jsonb</summary>
    public string? Changes { get; set; }
    public DateTime At { get; set; }
    public string? Ip { get; set; }
}
