using Ccp.Api.Http;
using Ccp.Application.Abstractions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Authorization.Policy;
using Microsoft.Extensions.Options;

namespace Ccp.Api.Security;

/// <summary>Yêu cầu người dùng có quyền cụ thể, ví dụ [HasPermission("Product.Update")].</summary>
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method, AllowMultiple = true)]
public sealed class HasPermissionAttribute(string permission) : AuthorizeAttribute($"{PermissionPolicy.Prefix}{permission}");

public static class PermissionPolicy
{
    public const string Prefix = "perm:";
    public const string ClaimType = "perm";
}

public sealed record PermissionRequirement(string Permission) : IAuthorizationRequirement;

public sealed class PermissionHandler : AuthorizationHandler<PermissionRequirement>
{
    protected override Task HandleRequirementAsync(AuthorizationHandlerContext context, PermissionRequirement requirement)
    {
        if (context.User.HasClaim(PermissionPolicy.ClaimType, requirement.Permission)) context.Succeed(requirement);
        return Task.CompletedTask;
    }
}

public sealed class PermissionPolicyProvider(IOptions<AuthorizationOptions> options) : DefaultAuthorizationPolicyProvider(options)
{
    public override async Task<AuthorizationPolicy?> GetPolicyAsync(string policyName)
    {
        if (!policyName.StartsWith(PermissionPolicy.Prefix, StringComparison.Ordinal)) return await base.GetPolicyAsync(policyName);
        return new AuthorizationPolicyBuilder()
            .RequireAuthenticatedUser()
            .AddRequirements(new PermissionRequirement(policyName[PermissionPolicy.Prefix.Length..]))
            .Build();
    }
}

/// <summary>401/403 do cơ chế phân quyền trả về cũng theo khung phản hồi chuẩn.</summary>
public sealed class ApiAuthorizationResultHandler : IAuthorizationMiddlewareResultHandler
{
    private readonly AuthorizationMiddlewareResultHandler _default = new();

    public async Task HandleAsync(RequestDelegate next, HttpContext context, AuthorizationPolicy policy, PolicyAuthorizationResult result)
    {
        if (result.Challenged)
        {
            await ResponseWriter.WriteAsync(context, 401, "unauthorized", "Chưa đăng nhập hoặc phiên đã hết hạn.");
            return;
        }
        if (result.Forbidden)
        {
            await ResponseWriter.WriteAsync(context, 403, "forbidden", "Bạn không có quyền thực hiện thao tác này.");
            return;
        }
        await _default.HandleAsync(next, context, policy, result);
    }
}

public sealed class CurrentUser(IHttpContextAccessor accessor) : ICurrentUser
{
    private System.Security.Claims.ClaimsPrincipal? Principal => accessor.HttpContext?.User;

    public Guid? UserId => Guid.TryParse(Principal?.FindFirst("sub")?.Value, out var id) ? id : null;
    public bool IsAuthenticated => Principal?.Identity?.IsAuthenticated == true;
    public string? Ip => accessor.HttpContext?.Connection.RemoteIpAddress?.ToString();
    public bool HasPermission(string permission) => Principal?.HasClaim(PermissionPolicy.ClaimType, permission) == true;
}
