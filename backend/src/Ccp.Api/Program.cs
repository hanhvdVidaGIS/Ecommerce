using System.Threading.RateLimiting;
using Ccp.Api.Controllers;
using Ccp.Api.Http;
using Ccp.Api.Security;
using Ccp.Api.Startup;
using Ccp.Application;
using Ccp.Application.Abstractions;
using Ccp.Infrastructure;
using Ccp.Infrastructure.Security;
using Ccp.Infrastructure.Storage;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Options;
using Serilog;
using System.Text.Json.Serialization;

DotEnvLoader.LoadIfDevelopment();

var builder = WebApplication.CreateBuilder(args);
// ExceptionHandlerMiddleware ghi mọi ngoại lệ ở mức Error kể cả lỗi nghiệp vụ đã được xử lý (401/409...).
// GlobalExceptionHandler tự ghi nhật ký đúng mức, nên tắt dòng ghi trùng của middleware.
builder.Host.UseSerilog((ctx, cfg) => cfg
    .ReadFrom.Configuration(ctx.Configuration)
    .MinimumLevel.Override("Microsoft.AspNetCore.Diagnostics.ExceptionHandlerMiddleware", Serilog.Events.LogEventLevel.Fatal)
    .WriteTo.Console());

builder.Services.AddApplication(builder.Configuration);
builder.Services.AddInfrastructure(builder.Configuration, builder.Environment.IsDevelopment());

builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<ICurrentUser, CurrentUser>();
builder.Services.AddSingleton<CookieSettings>();

builder.Services.AddControllers(o => o.Filters.Add<ValidationFilter>())
    .ConfigureApiBehaviorOptions(o => o.InvalidModelStateResponseFactory = ApiBehavior.InvalidModelState);
builder.Services.ConfigureHttpJsonOptions(o => o.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));
builder.Services.Configure<Microsoft.AspNetCore.Mvc.JsonOptions>(o => o.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter()));
builder.Services.AddExceptionHandler<GlobalExceptionHandler>();
builder.Services.AddProblemDetails();

// Xác thực: JWT đọc từ cookie HttpOnly (hoặc tiêu đề Authorization cho công cụ/kiểm thử).
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer();
builder.Services.AddOptions<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme)
    .Configure<IOptions<JwtOptions>>((o, jwt) =>
    {
        o.MapInboundClaims = false;
        o.TokenValidationParameters = new()
        {
            ValidateIssuer = true, ValidIssuer = jwt.Value.Issuer,
            ValidateAudience = true, ValidAudience = JwtOptions.AccessAudience,
            ValidateIssuerSigningKey = true, IssuerSigningKey = jwt.Value.SigningKey,
            ValidateLifetime = true, ClockSkew = TimeSpan.FromSeconds(30),
            ValidAlgorithms = [Microsoft.IdentityModel.Tokens.SecurityAlgorithms.HmacSha256],
            NameClaimType = "sub", RoleClaimType = "role",
        };
        o.Events = new JwtBearerEvents
        {
            OnMessageReceived = ctx =>
            {
                if (string.IsNullOrEmpty(ctx.Token) && ctx.Request.Cookies.TryGetValue(CookieNames.Access, out var cookie))
                    ctx.Token = cookie;
                return Task.CompletedTask;
            },
        };
    });
builder.Services.AddAuthorization();
builder.Services.AddSingleton<IAuthorizationPolicyProvider, PermissionPolicyProvider>();
builder.Services.AddSingleton<IAuthorizationHandler, PermissionHandler>();
builder.Services.AddSingleton<IAuthorizationMiddlewareResultHandler, ApiAuthorizationResultHandler>();

// Giới hạn tần suất theo IP: chặt hơn cho đăng nhập/đăng ký/quên mật khẩu.
var authPerMinute = builder.Configuration.GetValue("RateLimit:AuthPerMinute", 10);
var checkoutPerMinute = builder.Configuration.GetValue("RateLimit:CheckoutPerMinute", 20);
var globalPerMinute = builder.Configuration.GetValue("RateLimit:GlobalPerMinute", 3000);
builder.Services.AddRateLimiter(o =>
{
    o.OnRejected = async (ctx, ct) => await ResponseWriter.WriteAsync(ctx.HttpContext, 429, "rate_limited", "Quá nhiều yêu cầu. Vui lòng thử lại sau ít phút.");
    o.AddPolicy(RateLimitPolicies.Auth, http => RateLimitPartition.GetFixedWindowLimiter(
        $"auth:{http.Connection.RemoteIpAddress}", _ => new FixedWindowRateLimiterOptions { PermitLimit = authPerMinute, Window = TimeSpan.FromMinutes(1) }));
    o.AddPolicy(RateLimitPolicies.Checkout, http => RateLimitPartition.GetFixedWindowLimiter(
        $"checkout:{http.Connection.RemoteIpAddress}", _ => new FixedWindowRateLimiterOptions { PermitLimit = checkoutPerMinute, Window = TimeSpan.FromMinutes(1) }));
    o.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(http => RateLimitPartition.GetFixedWindowLimiter(
        $"global:{http.Connection.RemoteIpAddress}", _ => new FixedWindowRateLimiterOptions { PermitLimit = globalPerMinute, Window = TimeSpan.FromMinutes(1) }));
});

if (builder.Configuration.GetValue("ForwardedHeaders:Enabled", false))
    builder.Services.Configure<ForwardedHeadersOptions>(o =>
    {
        o.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
        o.KnownNetworks.Clear();
        o.KnownProxies.Clear();
    });

builder.Services.AddOpenApi();

var app = builder.Build();

if (builder.Configuration.GetValue("ForwardedHeaders:Enabled", false)) app.UseForwardedHeaders();
app.UseSerilogRequestLogging();
app.UseExceptionHandler();
app.Use(async (ctx, next) =>
{
    ctx.Response.Headers["X-Content-Type-Options"] = "nosniff";
    ctx.Response.Headers["X-Frame-Options"] = "DENY";
    ctx.Response.Headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
    ctx.Response.Headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'";
    await next();
});

// Tệp tải lên (kho Local) phục vụ qua /uploads; kho S3/R2/Azure dùng URL của nhà cung cấp.
var storage = app.Services.GetRequiredService<IOptions<StorageOptions>>().Value;
var uploadsRoot = Path.GetFullPath(storage.LocalPath);
Directory.CreateDirectory(uploadsRoot);
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new PhysicalFileProvider(uploadsRoot),
    RequestPath = storage.PublicBaseUrl.StartsWith('/') ? storage.PublicBaseUrl : "/uploads",
    ServeUnknownFileTypes = false,
    OnPrepareResponse = ctx => ctx.Context.Response.Headers["Cache-Control"] = "public, max-age=31536000, immutable",
});

if (app.Environment.IsDevelopment()) app.MapOpenApi();

app.UseRateLimiter();
app.UseAuthentication();
app.UseMiddleware<CsrfMiddleware>();
app.UseAuthorization();

app.MapControllers();
app.MapGet("/health", () => Results.Ok(new { status = "ok" })).DisableRateLimiting();

await DbInitializer.InitializeAsync(app);
app.Run();

public partial class Program { }
