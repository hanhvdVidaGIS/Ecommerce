using Ccp.Api.Security;
using Ccp.Domain.Security;
using Ccp.Tests.Infrastructure;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc.Abstractions;
using Microsoft.AspNetCore.Mvc.Controllers;
using Microsoft.AspNetCore.Mvc.Infrastructure;
using Microsoft.Extensions.DependencyInjection;

namespace Ccp.Tests;

/// <summary>
/// Quét toàn bộ action đã đăng ký thay vì kiểm từng endpoint: một endpoint quản trị thêm sau này mà quên gắn quyền sẽ làm test hỏng.
/// </summary>
[Collection(ApiCollection.Name)]
public class EndpointSecurityTests(ApiFactory factory)
{
    private static string Route(ControllerActionDescriptor a) => (a.AttributeRouteInfo?.Template ?? "").ToLowerInvariant();

    private List<ControllerActionDescriptor> Actions() =>
        factory.Services.GetRequiredService<IActionDescriptorCollectionProvider>().ActionDescriptors.Items
            .OfType<ControllerActionDescriptor>().Where(a => a.AttributeRouteInfo?.Template is not null).ToList();

    [Fact]
    public void Test_discovers_the_controllers_it_is_supposed_to_check()
    {
        // Phép thử âm cho chính bộ quét: nếu không tìm thấy action nào thì các test dưới đây đạt một cách vô nghĩa.
        var routes = Actions().Select(Route).ToList();
        Assert.True(routes.Count(r => r.StartsWith("api/admin")) > 40, $"Chỉ tìm thấy {routes.Count(r => r.StartsWith("api/admin"))} action quản trị");
        Assert.Contains(routes, r => r.StartsWith("api/public"));
        Assert.Contains(routes, r => r.StartsWith("api/auth"));
    }

    [Fact]
    public void Every_admin_action_requires_authorization_and_is_not_anonymous()
    {
        var open = Actions().Where(a => Route(a).StartsWith("api/admin"))
            .Where(a => !a.EndpointMetadata.OfType<IAuthorizeData>().Any() || a.EndpointMetadata.OfType<IAllowAnonymous>().Any())
            .Select(a => $"{string.Join(",", a.ActionConstraints?.OfType<Microsoft.AspNetCore.Mvc.ActionConstraints.HttpMethodActionConstraint>().SelectMany(c => c.HttpMethods) ?? [])} {Route(a)}")
            .ToList();

        Assert.True(open.Count == 0, "Endpoint quản trị thiếu yêu cầu xác thực/quyền:\n" + string.Join("\n", open));
    }

    [Fact]
    public void Every_admin_action_other_than_meta_and_settings_update_names_a_permission_policy()
    {
        // Ngoại lệ có chủ đích: /meta (chỉ cần đăng nhập) và PUT /settings (quyền kiểm theo nhóm khoá trong service).
        var noPolicy = Actions().Where(a => Route(a).StartsWith("api/admin"))
            .Where(a => !a.EndpointMetadata.OfType<IAuthorizeData>().Any(d => d.Policy?.StartsWith(PermissionPolicy.Prefix) == true))
            .Select(a => Route(a)).Distinct().ToList();

        Assert.Equivalent(new[] { "api/admin/meta", "api/admin/settings" }, noPolicy, strict: false);
        Assert.All(noPolicy, r => Assert.Contains(r, new[] { "api/admin/meta", "api/admin/settings" }));
    }

    [Fact]
    public void Every_permission_named_in_a_policy_exists_in_the_permission_catalog()
    {
        var known = Permissions.All.Select(p => p.Code).ToHashSet();
        var named = Actions().SelectMany(a => a.EndpointMetadata.OfType<IAuthorizeData>())
            .Select(d => d.Policy).Where(p => p is not null && p.StartsWith(PermissionPolicy.Prefix)).Select(p => p![PermissionPolicy.Prefix.Length..]).Distinct().ToList();

        Assert.NotEmpty(named);
        Assert.DoesNotContain(named, n => !known.Contains(n));
    }

    [Fact]
    public void Every_permission_in_the_catalog_guards_at_least_one_endpoint_except_future_modules()
    {
        // Quyền chưa có endpoint tương ứng chỉ được phép thuộc module của giai đoạn sau (đánh giá, dashboard, bài viết).
        var future = new[] { "Review.", "Dashboard.", "Post." };
        // Quyền được thi hành bên trong service (theo dữ liệu), nên không xuất hiện ở thuộc tính endpoint.
        var enforcedInService = new[] { Permissions.ProductViewCost, Permissions.WebsiteConfigUpdate, Permissions.OrderRefund };
        var used = Actions().SelectMany(a => a.EndpointMetadata.OfType<IAuthorizeData>())
            .Select(d => d.Policy).Where(p => p is not null && p.StartsWith(PermissionPolicy.Prefix)).Select(p => p![PermissionPolicy.Prefix.Length..]).ToHashSet();

        var unused = Permissions.All.Select(p => p.Code).Where(c => !used.Contains(c) && !enforcedInService.Contains(c) && !future.Any(f => c.StartsWith(f))).ToList();
        Assert.True(unused.Count == 0, "Quyền chưa bảo vệ endpoint nào: " + string.Join(", ", unused));
    }

    [Fact]
    public async Task Anonymous_requests_to_every_parameterless_admin_get_are_rejected_with_401()
    {
        var anon = factory.NewClient();
        var gets = Actions().Where(a => Route(a).StartsWith("api/admin") && !Route(a).Contains('{')
            && (a.ActionConstraints?.OfType<Microsoft.AspNetCore.Mvc.ActionConstraints.HttpMethodActionConstraint>().Any(c => c.HttpMethods.Contains("GET")) ?? false))
            .Select(Route).Distinct().ToList();

        Assert.True(gets.Count >= 15, $"Chỉ tìm thấy {gets.Count} điểm cuối GET");
        foreach (var route in gets)
        {
            var r = await anon.GetAsync("/" + route);
            Assert.True(r.Status == System.Net.HttpStatusCode.Unauthorized, $"GET /{route} trả {(int)r.Status} thay vì 401");
        }
    }
}
