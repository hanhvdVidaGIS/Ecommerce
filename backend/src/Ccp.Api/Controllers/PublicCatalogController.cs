using Ccp.Api.Http;
using Ccp.Application.Common;
using Ccp.Application.Storefront;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Ccp.Api.Controllers;

/// <summary>
/// Bộ lọc dùng chung cho danh sách và bộ lọc khả dụng:
/// ?category=&amp;q=&amp;brand=a,b&amp;priceMin=&amp;priceMax=&amp;attr.&lt;mã thuộc tính&gt;=v1,v2&amp;flag=&amp;sort=&amp;page=&amp;pageSize=
/// </summary>
internal static class FilterBinder
{
    public static ProductFilter From(HttpRequest request)
    {
        var q = request.Query;
        decimal? Dec(string key) => decimal.TryParse(q[key], System.Globalization.NumberStyles.Number, System.Globalization.CultureInfo.InvariantCulture, out var d) ? d : null;
        int Int(string key, int def) => int.TryParse(q[key], out var i) ? i : def;
        static string[] Split(string? s) => (s ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).Take(20).ToArray();

        var f = new ProductFilter
        {
            Category = q["category"].FirstOrDefault(), Q = q["q"].FirstOrDefault(), Brands = Split(q["brand"].FirstOrDefault()),
            PriceMin = Dec("priceMin"), PriceMax = Dec("priceMax"), Flag = q["flag"].FirstOrDefault(), Sort = q["sort"].FirstOrDefault(),
            Page = Int("page", 1), PageSize = Int("pageSize", 24),
        };
        foreach (var key in q.Keys.Where(k => k.StartsWith("attr.", StringComparison.OrdinalIgnoreCase)).Take(20))
        {
            var values = Split(q[key].FirstOrDefault());
            if (values.Length > 0) f.Attrs[key[5..]] = values;
        }
        return f;
    }
}

[Route("api/public")]
public class PublicCatalogController(PublicCatalogService catalog) : ApiControllerBase
{
    [HttpGet("categories"), AllowAnonymous]
    public async Task<ApiResponse<IReadOnlyList<PublicCategoryDto>>> Categories(CancellationToken ct) => Ok(await catalog.CategoryTreeAsync(ct));

    [HttpGet("categories/{slug}"), AllowAnonymous]
    public async Task<ApiResponse<PublicCategoryDetailDto>> Category(string slug, CancellationToken ct) => Ok(await catalog.CategoryAsync(slug, ct));

    [HttpGet("brands"), AllowAnonymous]
    public async Task<ApiResponse<IReadOnlyList<PublicBrandDto>>> Brands(CancellationToken ct) => Ok(await catalog.BrandsAsync(ct));

    [HttpGet("products"), AllowAnonymous]
    public async Task<ApiResponse<IReadOnlyList<ProductCardDto>>> Products(CancellationToken ct) => Paged(await catalog.ListAsync(FilterBinder.From(Request), ct));

    [HttpGet("products/facets"), AllowAnonymous]
    public async Task<ApiResponse<FacetsDto>> Facets(CancellationToken ct) => Ok(await catalog.FacetsAsync(FilterBinder.From(Request), ct));

    [HttpGet("products/{slug}"), AllowAnonymous]
    public async Task<ApiResponse<PublicProductDto>> Product(string slug, CancellationToken ct) => Ok(await catalog.DetailAsync(slug, ct));

    [HttpGet("search/suggest"), AllowAnonymous]
    public async Task<ApiResponse<SearchSuggestionsDto>> Suggest([FromQuery] string? q, CancellationToken ct) => Ok(await catalog.SuggestAsync(q, ct));

    /// <summary>Danh sách địa chỉ cho sitemap.xml: sản phẩm đang bán, danh mục đang bật, trang đã xuất bản.</summary>
    [HttpGet("sitemap"), AllowAnonymous]
    public async Task<ApiResponse<SitemapDto>> Sitemap([FromServices] SitemapService sitemap, CancellationToken ct) => Ok(await sitemap.GetAsync(ct));

    /// <summary>Sản phẩm cho các section trang chủ: kind = new | bestseller | featured | sale.</summary>
    [HttpGet("home/products"), AllowAnonymous]
    public async Task<ApiResponse<IReadOnlyList<ProductCardDto>>> HomeProducts([FromQuery] string kind = "new", [FromQuery] int limit = 8, CancellationToken ct = default) =>
        Ok(await catalog.HomeProductsAsync(kind, limit, ct));
}
