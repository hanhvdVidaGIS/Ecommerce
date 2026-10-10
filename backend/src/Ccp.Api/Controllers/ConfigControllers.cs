using Ccp.Api.Http;
using Ccp.Api.Security;
using Ccp.Application.Config;
using Ccp.Domain.Security;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Ccp.Api.Controllers;

[Route("api/public")]
public class PublicConfigController(SiteConfigService siteConfig) : ApiControllerBase
{
    /// <summary>Cấu hình công khai cho Storefront: nhận diện, màu, nhãn, menu, section trang chủ, banner.</summary>
    [HttpGet("site-config"), AllowAnonymous]
    public async Task<ApiResponse<SiteConfigDto>> SiteConfig(CancellationToken ct) => Ok(await siteConfig.GetAsync(ct));
}

[Route("api/admin/settings")]
public class AdminSettingsController(SettingsService settings) : ApiControllerBase
{
    [HttpGet, HasPermission(Permissions.WebsiteConfigView)]
    public async Task<ApiResponse<IReadOnlyList<SettingDto>>> List(CancellationToken ct) => Ok(await settings.GetAllAsync(ct));

    /// <summary>Quyền theo từng nhóm khoá được kiểm tra trong service (store → StoreConfig.Update, còn lại → WebsiteConfig.Update).</summary>
    [HttpPut, Authorize]
    public async Task<ApiResponse<IReadOnlyList<SettingDto>>> Update(UpdateSettingsRequest request, CancellationToken ct) =>
        Ok(await settings.UpdateAsync(request, ct));

    [HttpGet("fonts"), HasPermission(Permissions.WebsiteConfigView)]
    public ApiResponse<IReadOnlyList<string>> Fonts() => Ok(SettingDefinitions.AllowedFonts);
}

[Route("api/admin/business-types")]
public class AdminBusinessTypesController(BusinessTypeService service) : ApiControllerBase
{
    [HttpGet, HasPermission(Permissions.WebsiteConfigView)]
    public async Task<ApiResponse<IReadOnlyList<BusinessTypeListItemDto>>> List(CancellationToken ct) => Ok(await service.ListAsync(ct));

    [HttpGet("{code}/preset"), HasPermission(Permissions.WebsiteConfigView)]
    public async Task<ApiResponse<BusinessTypePreset>> Preset(string code, CancellationToken ct) => Ok(await service.GetPresetAsync(code, ct));

    /// <summary>dryRun=true chỉ trả về phạm vi ảnh hưởng. Chỉ thêm dữ liệu, không xoá hay sửa dữ liệu đang có.</summary>
    [HttpPost("{code}/apply"), HasPermission(Permissions.StoreConfigUpdate)]
    public async Task<ApiResponse<ApplyPresetResult>> Apply(string code, [FromQuery] bool dryRun = false, [FromQuery] bool applyLabels = true,
        CancellationToken ct = default) => Ok(await service.ApplyAsync(code, applyLabels, dryRun, ct));
}
