using Ccp.Api.Http;
using Ccp.Api.Security;
using Ccp.Application.Common;
using Ccp.Application.Content;
using Ccp.Domain.Security;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Ccp.Api.Controllers;

[Route("api/admin/banners")]
public class AdminBannersController(BannerService service) : ApiControllerBase
{
    [HttpGet, HasPermission(Permissions.BannerManage)]
    public async Task<ApiResponse<IReadOnlyList<BannerDto>>> List([FromQuery] BannerQuery query, CancellationToken ct) => Paged(await service.ListAsync(query, ct));

    [HttpGet("{id:guid}"), HasPermission(Permissions.BannerManage)]
    public async Task<ApiResponse<BannerDto>> Get(Guid id, CancellationToken ct) => Ok(await service.GetAsync(id, ct));

    [HttpPost, HasPermission(Permissions.BannerManage)]
    public async Task<ApiResponse<BannerDto>> Create(SaveBannerRequest request, CancellationToken ct) => Ok(await service.CreateAsync(request, ct));

    [HttpPut("{id:guid}"), HasPermission(Permissions.BannerManage)]
    public async Task<ApiResponse<BannerDto>> Update(Guid id, SaveBannerRequest request, CancellationToken ct) => Ok(await service.UpdateAsync(id, request, ct));

    [HttpPost("reorder"), HasPermission(Permissions.BannerManage)]
    public async Task<ApiResponse<object>> Reorder(List<SortItem> items, CancellationToken ct)
    {
        await service.ReorderAsync(items, ct);
        return Done();
    }

    [HttpDelete("{id:guid}"), HasPermission(Permissions.BannerManage)]
    public async Task<ApiResponse<object>> Delete(Guid id, CancellationToken ct)
    {
        await service.DeleteAsync(id, ct);
        return Done();
    }
}

[Route("api/admin/homepage-sections")]
public class AdminHomepageSectionsController(HomepageSectionService service) : ApiControllerBase
{
    [HttpGet, HasPermission(Permissions.HomepageSectionManage)]
    public async Task<ApiResponse<IReadOnlyList<HomepageSectionAdminDto>>> List(CancellationToken ct) => Ok(await service.ListAsync(ct));

    [HttpGet("{id:guid}"), HasPermission(Permissions.HomepageSectionManage)]
    public async Task<ApiResponse<HomepageSectionAdminDto>> Get(Guid id, CancellationToken ct) => Ok(await service.GetAsync(id, ct));

    [HttpPost, HasPermission(Permissions.HomepageSectionManage)]
    public async Task<ApiResponse<HomepageSectionAdminDto>> Create(SaveHomepageSectionRequest request, CancellationToken ct) => Ok(await service.CreateAsync(request, ct));

    [HttpPut("{id:guid}"), HasPermission(Permissions.HomepageSectionManage)]
    public async Task<ApiResponse<HomepageSectionAdminDto>> Update(Guid id, SaveHomepageSectionRequest request, CancellationToken ct) => Ok(await service.UpdateAsync(id, request, ct));

    [HttpPost("reorder"), HasPermission(Permissions.HomepageSectionManage)]
    public async Task<ApiResponse<object>> Reorder(List<SortItem> items, CancellationToken ct)
    {
        await service.ReorderAsync(items, ct);
        return Done();
    }

    [HttpDelete("{id:guid}"), HasPermission(Permissions.HomepageSectionManage)]
    public async Task<ApiResponse<object>> Delete(Guid id, CancellationToken ct)
    {
        await service.DeleteAsync(id, ct);
        return Done();
    }
}

[Route("api/admin/menus")]
public class AdminMenusController(MenuService service) : ApiControllerBase
{
    [HttpGet, HasPermission(Permissions.MenuManage)]
    public async Task<ApiResponse<IReadOnlyList<MenuListItemDto>>> List(CancellationToken ct) => Ok(await service.ListAsync(ct));

    [HttpGet("{id:guid}"), HasPermission(Permissions.MenuManage)]
    public async Task<ApiResponse<MenuAdminDto>> Get(Guid id, CancellationToken ct) => Ok(await service.GetAsync(id, ct));

    [HttpPost, HasPermission(Permissions.MenuManage)]
    public async Task<ApiResponse<MenuAdminDto>> Create(CreateMenuRequest request, CancellationToken ct) => Ok(await service.CreateAsync(request, ct));

    /// <summary>Lưu toàn bộ cây mục của menu trong một lần.</summary>
    [HttpPut("{id:guid}"), HasPermission(Permissions.MenuManage)]
    public async Task<ApiResponse<MenuAdminDto>> Save(Guid id, SaveMenuRequest request, CancellationToken ct) => Ok(await service.SaveAsync(id, request, ct));

    [HttpDelete("{id:guid}"), HasPermission(Permissions.MenuManage)]
    public async Task<ApiResponse<object>> Delete(Guid id, CancellationToken ct)
    {
        await service.DeleteAsync(id, ct);
        return Done();
    }
}

[Route("api/admin/pages")]
public class AdminPagesController(PageService service) : ApiControllerBase
{
    [HttpGet, HasPermission(Permissions.PageManage)]
    public async Task<ApiResponse<IReadOnlyList<PageListItemDto>>> List([FromQuery] PageQuery query, CancellationToken ct) => Paged(await service.ListAsync(query, ct));

    [HttpGet("{id:guid}"), HasPermission(Permissions.PageManage)]
    public async Task<ApiResponse<PageDto>> Get(Guid id, CancellationToken ct) => Ok(await service.GetAsync(id, ct));

    [HttpPost, HasPermission(Permissions.PageManage)]
    public async Task<ApiResponse<PageDto>> Create(SavePageRequest request, CancellationToken ct) => Ok(await service.CreateAsync(request, ct));

    [HttpPut("{id:guid}"), HasPermission(Permissions.PageManage)]
    public async Task<ApiResponse<PageDto>> Update(Guid id, SavePageRequest request, CancellationToken ct) => Ok(await service.UpdateAsync(id, request, ct));

    [HttpDelete("{id:guid}"), HasPermission(Permissions.PageManage)]
    public async Task<ApiResponse<object>> Delete(Guid id, CancellationToken ct)
    {
        await service.DeleteAsync(id, ct);
        return Done();
    }
}

[Route("api/public/pages")]
public class PublicPagesController(PageService service) : ApiControllerBase
{
    [HttpGet("{slug}"), AllowAnonymous]
    public async Task<ApiResponse<PageDto>> Get(string slug, CancellationToken ct) => Ok(await service.GetPublishedBySlugAsync(slug, ct));
}

[Route("api/admin/posts")]
public class AdminPostsController(PostService service) : ApiControllerBase
{
    [HttpGet, HasPermission(Permissions.PostManage)]
    public async Task<ApiResponse<IReadOnlyList<PostListItemDto>>> List([FromQuery] PostQuery query, CancellationToken ct) => Paged(await service.ListAsync(query, ct));

    [HttpGet("{id:guid}"), HasPermission(Permissions.PostManage)]
    public async Task<ApiResponse<PostDto>> Get(Guid id, CancellationToken ct) => Ok(await service.GetAsync(id, ct));

    [HttpPost, HasPermission(Permissions.PostManage)]
    public async Task<ApiResponse<PostDto>> Create(SavePostRequest request, CancellationToken ct) => Ok(await service.CreateAsync(request, ct));

    [HttpPut("{id:guid}"), HasPermission(Permissions.PostManage)]
    public async Task<ApiResponse<PostDto>> Update(Guid id, SavePostRequest request, CancellationToken ct) => Ok(await service.UpdateAsync(id, request, ct));

    [HttpDelete("{id:guid}"), HasPermission(Permissions.PostManage)]
    public async Task<ApiResponse<object>> Delete(Guid id, CancellationToken ct)
    {
        await service.DeleteAsync(id, ct);
        return Done();
    }
}

[Route("api/public/posts")]
public class PublicPostsController(PostService service) : ApiControllerBase
{
    [HttpGet, AllowAnonymous]
    public async Task<ApiResponse<IReadOnlyList<PublicPostCardDto>>> List([FromQuery] PageRequest query, CancellationToken ct) => Paged(await service.PublicListAsync(query, ct)); // tên tham số phải khác "page": trùng khoá query thì binder bỏ qua page/pageSize

    [HttpGet("latest"), AllowAnonymous]
    public async Task<ApiResponse<IReadOnlyList<PublicPostCardDto>>> Latest([FromQuery] int limit = 3, CancellationToken ct = default) => Ok(await service.LatestAsync(limit, ct));

    [HttpGet("{slug}"), AllowAnonymous]
    public async Task<ApiResponse<PublicPostDto>> Get(string slug, CancellationToken ct) => Ok(await service.PublicGetAsync(slug, ct));
}

[Route("api/admin/meta")]
public class MetaController : ApiControllerBase
{
    /// <summary>Danh mục enum và hằng số cho giao diện quản trị; lấy từ mã nguồn nên không phải sao chép ở Admin.</summary>
    [HttpGet, Authorize]
    public ApiResponse<MetaDto> Get() => Ok(MetaService.Build());
}
