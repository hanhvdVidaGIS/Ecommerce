using Ccp.Api.Http;
using Ccp.Api.Security;
using Ccp.Application.Catalog;
using Ccp.Application.Common;
using Ccp.Domain.Security;
using Microsoft.AspNetCore.Mvc;

namespace Ccp.Api.Controllers;

[Route("api/admin/categories")]
public class AdminCategoriesController(CategoryService service) : ApiControllerBase
{
    /// <summary>Danh sách phẳng đã sắp theo cây (Depth, Path); giao diện dựng cây từ ParentId.</summary>
    [HttpGet, HasPermission(Permissions.CategoryView)]
    public async Task<ApiResponse<IReadOnlyList<CategoryListItemDto>>> List(CancellationToken ct) => Ok(await service.ListAsync(ct));

    [HttpGet("{id:guid}"), HasPermission(Permissions.CategoryView)]
    public async Task<ApiResponse<CategoryDetailDto>> Get(Guid id, CancellationToken ct) => Ok(await service.GetAsync(id, ct));

    [HttpPost, HasPermission(Permissions.CategoryCreate)]
    public async Task<ApiResponse<CategoryDetailDto>> Create(SaveCategoryRequest request, CancellationToken ct) => Ok(await service.CreateAsync(request, ct));

    [HttpPut("{id:guid}"), HasPermission(Permissions.CategoryUpdate)]
    public async Task<ApiResponse<CategoryDetailDto>> Update(Guid id, SaveCategoryRequest request, CancellationToken ct) => Ok(await service.UpdateAsync(id, request, ct));

    [HttpPost("reorder"), HasPermission(Permissions.CategoryUpdate)]
    public async Task<ApiResponse<object>> Reorder(List<ReorderItem> items, CancellationToken ct)
    {
        await service.ReorderAsync(items, ct);
        return Done();
    }

    [HttpDelete("{id:guid}"), HasPermission(Permissions.CategoryDelete)]
    public async Task<ApiResponse<object>> Delete(Guid id, CancellationToken ct)
    {
        await service.DeleteAsync(id, ct);
        return Done();
    }
}

[Route("api/admin/brands")]
public class AdminBrandsController(BrandService service) : ApiControllerBase
{
    [HttpGet, HasPermission(Permissions.BrandView)]
    public async Task<ApiResponse<IReadOnlyList<BrandDto>>> List([FromQuery] PageRequest query, CancellationToken ct) => Paged(await service.ListAsync(query, ct));

    [HttpGet("{id:guid}"), HasPermission(Permissions.BrandView)]
    public async Task<ApiResponse<BrandDto>> Get(Guid id, CancellationToken ct) => Ok(await service.GetAsync(id, ct));

    [HttpPost, HasPermission(Permissions.BrandManage)]
    public async Task<ApiResponse<BrandDto>> Create(SaveBrandRequest request, CancellationToken ct) => Ok(await service.CreateAsync(request, ct));

    [HttpPut("{id:guid}"), HasPermission(Permissions.BrandManage)]
    public async Task<ApiResponse<BrandDto>> Update(Guid id, SaveBrandRequest request, CancellationToken ct) => Ok(await service.UpdateAsync(id, request, ct));

    [HttpDelete("{id:guid}"), HasPermission(Permissions.BrandManage)]
    public async Task<ApiResponse<object>> Delete(Guid id, CancellationToken ct)
    {
        await service.DeleteAsync(id, ct);
        return Done();
    }
}

[Route("api/admin/attributes")]
public class AdminAttributesController(AttributeService service) : ApiControllerBase
{
    [HttpGet, HasPermission(Permissions.AttributeView)]
    public async Task<ApiResponse<IReadOnlyList<AttributeListItemDto>>> List([FromQuery] string? q, CancellationToken ct) => Ok(await service.ListAsync(q, ct));

    [HttpGet("{id:guid}"), HasPermission(Permissions.AttributeView)]
    public async Task<ApiResponse<AttributeDetailDto>> Get(Guid id, CancellationToken ct) => Ok(await service.GetAsync(id, ct));

    [HttpPost, HasPermission(Permissions.AttributeManage)]
    public async Task<ApiResponse<AttributeDetailDto>> Create(SaveAttributeRequest request, CancellationToken ct) => Ok(await service.CreateAsync(request, ct));

    [HttpPut("{id:guid}"), HasPermission(Permissions.AttributeManage)]
    public async Task<ApiResponse<AttributeDetailDto>> Update(Guid id, SaveAttributeRequest request, CancellationToken ct) => Ok(await service.UpdateAsync(id, request, ct));

    [HttpDelete("{id:guid}"), HasPermission(Permissions.AttributeManage)]
    public async Task<ApiResponse<object>> Delete(Guid id, CancellationToken ct)
    {
        await service.DeleteAsync(id, ct);
        return Done();
    }

    /// <summary>Thay toàn bộ danh sách danh mục áp dụng thuộc tính (áp dụng cho cả cây con).</summary>
    [HttpPut("{id:guid}/categories"), HasPermission(Permissions.AttributeManage)]
    public async Task<ApiResponse<AttributeDetailDto>> SetCategories(Guid id, SetAttributeCategoriesRequest request, CancellationToken ct) =>
        Ok(await service.SetCategoriesAsync(id, request, ct));

    [HttpPost("{id:guid}/values"), HasPermission(Permissions.AttributeManage)]
    public async Task<ApiResponse<AttributeValueDto>> CreateValue(Guid id, SaveAttributeValueRequest request, CancellationToken ct) =>
        Ok(await service.CreateValueAsync(id, request, ct));

    [HttpPut("{id:guid}/values/{valueId:guid}"), HasPermission(Permissions.AttributeManage)]
    public async Task<ApiResponse<AttributeValueDto>> UpdateValue(Guid id, Guid valueId, SaveAttributeValueRequest request, CancellationToken ct) =>
        Ok(await service.UpdateValueAsync(id, valueId, request, ct));

    [HttpDelete("{id:guid}/values/{valueId:guid}"), HasPermission(Permissions.AttributeManage)]
    public async Task<ApiResponse<object>> DeleteValue(Guid id, Guid valueId, CancellationToken ct)
    {
        await service.DeleteValueAsync(id, valueId, ct);
        return Done();
    }
}

[Route("api/admin/products")]
public class AdminProductsController(ProductService service) : ApiControllerBase
{
    [HttpGet, HasPermission(Permissions.ProductView)]
    public async Task<ApiResponse<IReadOnlyList<ProductListItemDto>>> List([FromQuery] ProductQuery query, CancellationToken ct) => Paged(await service.ListAsync(query, ct));

    [HttpGet("{id:guid}"), HasPermission(Permissions.ProductView)]
    public async Task<ApiResponse<ProductDetailDto>> Get(Guid id, CancellationToken ct) => Ok(await service.GetAsync(id, ct));

    [HttpPost, HasPermission(Permissions.ProductCreate)]
    public async Task<ApiResponse<ProductDetailDto>> Create(SaveProductRequest request, CancellationToken ct) => Ok(await service.CreateAsync(request, ct));

    [HttpPut("{id:guid}"), HasPermission(Permissions.ProductUpdate)]
    public async Task<ApiResponse<ProductDetailDto>> Update(Guid id, SaveProductRequest request, CancellationToken ct) => Ok(await service.UpdateAsync(id, request, ct));

    /// <summary>Bật/tắt nhanh cờ nổi bật, bán chạy, mới và trạng thái.</summary>
    [HttpPut("{id:guid}/flags"), HasPermission(Permissions.ProductUpdate)]
    public async Task<ApiResponse<ProductDetailDto>> Flags(Guid id, UpdateProductFlagsRequest request, CancellationToken ct) => Ok(await service.UpdateFlagsAsync(id, request, ct));

    [HttpDelete("{id:guid}"), HasPermission(Permissions.ProductDelete)]
    public async Task<ApiResponse<object>> Delete(Guid id, CancellationToken ct)
    {
        await service.DeleteAsync(id, ct);
        return Done();
    }

    /// <summary>Xem trước các biến thể sinh từ tích Descartes của các giá trị tuỳ chọn; không ghi dữ liệu.</summary>
    [HttpPost("generate-variants"), HasPermission(Permissions.ProductView)]
    public async Task<ApiResponse<IReadOnlyList<GeneratedVariantDto>>> Generate(GenerateVariantsRequest request, CancellationToken ct) =>
        Ok(await service.GenerateVariantsAsync(request, ct));
}
