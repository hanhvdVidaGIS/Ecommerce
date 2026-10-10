using Ccp.Application.Access;
using Ccp.Application.Auth;
using Ccp.Application.Catalog;
using Ccp.Application.Common;
using Ccp.Application.Config;
using Ccp.Application.Content;
using Ccp.Application.MediaLibrary;
using Ccp.Application.Sales;
using FluentValidation;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Ccp.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddApplication(this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<AuthOptions>(configuration.GetSection("Auth"));
        services.Configure<MediaOptions>(configuration.GetSection("Media"));
        services.AddValidatorsFromAssembly(typeof(DependencyInjection).Assembly, includeInternalTypes: true);
        services.AddScoped<AuthService>();
        services.AddScoped<Common.MediaResolver>();
        services.AddScoped<SettingsService>();
        services.AddScoped<SiteConfigService>();
        services.AddScoped<BusinessTypeService>();
        services.AddScoped<MediaService>();
        services.AddScoped<CategoryService>();
        services.AddScoped<BrandService>();
        services.AddScoped<AttributeService>();
        services.AddScoped<ProductService>();
        services.AddScoped<Storefront.PublicCatalogService>();
        services.AddScoped<Storefront.SitemapService>();
        services.AddScoped<BannerService>();
        services.AddScoped<HomepageSectionService>();
        services.AddScoped<MenuService>();
        services.AddScoped<PageService>();
        services.AddScoped<PostService>();
        services.AddScoped<NewsletterService>();
        services.AddScoped<UserAdminService>();
        services.AddScoped<RoleService>();
        services.AddScoped<AuditQueryService>();
        services.AddScoped<AuditService>();
        services.AddScoped<AddressService>();
        services.AddScoped<ShippingService>();
        services.AddScoped<CouponEvaluator>();
        services.AddScoped<CartService>();
        services.AddScoped<IPaymentGateway, CodGateway>();
        services.AddScoped<BankTransferGateway>();
        services.AddScoped<IPaymentGateway>(sp => sp.GetRequiredService<BankTransferGateway>());
        services.AddScoped<PaymentGatewayRegistry>();
        services.AddScoped<OrderMapper>();
        services.AddScoped<OrderWorkflowService>();
        services.AddScoped<CheckoutService>();
        services.AddScoped<CustomerOrderService>();
        services.AddScoped<AdminOrderService>();
        services.AddScoped<CouponService>();
        services.AddScoped<ShippingRateService>();
        services.AddScoped<CustomerAdminService>();
        services.AddScoped<Dashboard.DashboardService>();
        services.AddScoped<Reviews.ReviewService>();
        services.AddScoped<AccountService>();
        return services;
    }
}
