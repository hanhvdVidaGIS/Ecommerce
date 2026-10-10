using Ccp.Application.Abstractions;
using Ccp.Application.Config;
using Ccp.Application.Sales;
using Ccp.Domain.Enums;
using Ccp.Domain.Security;
using Microsoft.EntityFrameworkCore;

namespace Ccp.Application.Dashboard;

public sealed record DashboardKpi(decimal Revenue, decimal PreviousRevenue, int Orders, int PreviousOrders, decimal AverageOrderValue, decimal PreviousAverageOrderValue,
    int NewCustomers, int PreviousNewCustomers);
public sealed record DashboardPoint(DateOnly Date, decimal Revenue, int Orders);
public sealed record DashboardStatusCount(OrderStatus Status, int Count);
public sealed record DashboardTopProduct(Guid? ProductId, string Name, int Quantity, decimal Revenue);
public sealed record DashboardLowStock(Guid VariantId, Guid ProductId, string ProductName, string Sku, string? VariantLabel, int Stock);
public sealed record DashboardAlerts(int PendingOrders, int AwaitingTransfer, int LowStockCount, int PendingReviews);
public sealed record DashboardDto(DateOnly From, DateOnly To, int Days, string TimeZone, DashboardKpi Kpi, IReadOnlyList<DashboardPoint> Series,
    IReadOnlyList<DashboardStatusCount> Statuses, IReadOnlyList<DashboardTopProduct> TopProducts, IReadOnlyList<AdminOrderListItemDto> RecentOrders,
    IReadOnlyList<DashboardLowStock> LowStock, DashboardAlerts Alerts);

/// <summary>
/// Số liệu tổng quan. "Doanh thu" là tổng giá trị các đơn chưa huỷ và chưa hoàn tiền theo ngày đặt (doanh thu ghi nhận), tính theo múi giờ của cửa hàng.
/// Kỳ so sánh là khoảng ngày liền trước có cùng độ dài.
/// </summary>
public class DashboardService(IAppDbContext db, ICurrentUser user, TimeProvider clock)
{
    public const int MaxDays = 366;
    public const int LowStockThreshold = 5;
    private static readonly OrderStatus[] Excluded = [OrderStatus.Cancelled, OrderStatus.Refunded];
    private const int MaxOrdersScanned = 200_000;

    public async Task<DashboardDto> GetAsync(int days, CancellationToken ct = default)
    {
        days = Math.Clamp(days, 1, MaxDays);
        var tzId = await db.WebsiteSettings.AsNoTracking().Where(x => x.Key == SettingKeys.Timezone).Select(x => x.Value).FirstOrDefaultAsync(ct);
        if (string.IsNullOrWhiteSpace(tzId)) tzId = "Asia/Ho_Chi_Minh";
        var zone = StoreTime.Zone(tzId);
        var today = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(clock.GetUtcNow().UtcDateTime, zone));
        var from = today.AddDays(-(days - 1));
        var prevFrom = from.AddDays(-days);

        var fromUtc = StoreTime.StartOfDayUtc(prevFrom, zone);
        var toUtc = StoreTime.StartOfDayUtc(today.AddDays(1), zone);
        var splitUtc = StoreTime.StartOfDayUtc(from, zone);

        var rows = await db.Orders.AsNoTracking().Where(o => o.PlacedAt >= fromUtc && o.PlacedAt < toUtc && !Excluded.Contains(o.Status))
            .OrderByDescending(o => o.PlacedAt).Take(MaxOrdersScanned).Select(o => new { o.PlacedAt, o.GrandTotal }).ToListAsync(ct);
        var current = rows.Where(r => r.PlacedAt >= splitUtc).ToList();
        var previous = rows.Where(r => r.PlacedAt < splitUtc).ToList();

        var byDay = current.GroupBy(r => DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(r.PlacedAt, DateTimeKind.Utc), zone)))
            .ToDictionary(g => g.Key, g => (Revenue: g.Sum(x => x.GrandTotal), Orders: g.Count()));
        var series = Enumerable.Range(0, days).Select(i => from.AddDays(i)).Select(d => byDay.TryGetValue(d, out var v) ? new DashboardPoint(d, v.Revenue, v.Orders) : new DashboardPoint(d, 0, 0)).ToList();

        var customerRole = RoleDefaults.Customer;
        var newCustomers = await db.Users.AsNoTracking().Where(u => u.CreatedAt >= splitUtc && u.CreatedAt < toUtc && u.UserRoles.All(r => r.Role!.Code == customerRole)).CountAsync(ct);
        var prevCustomers = await db.Users.AsNoTracking().Where(u => u.CreatedAt >= fromUtc && u.CreatedAt < splitUtc && u.UserRoles.All(r => r.Role!.Code == customerRole)).CountAsync(ct);

        var revenue = current.Sum(r => r.GrandTotal);
        var prevRevenue = previous.Sum(r => r.GrandTotal);
        var kpi = new DashboardKpi(revenue, prevRevenue, current.Count, previous.Count,
            current.Count == 0 ? 0 : Math.Round(revenue / current.Count, 0), previous.Count == 0 ? 0 : Math.Round(prevRevenue / previous.Count, 0), newCustomers, prevCustomers);

        var statuses = await db.Orders.AsNoTracking().Where(o => o.PlacedAt >= splitUtc && o.PlacedAt < toUtc).GroupBy(o => o.Status)
            .Select(g => new DashboardStatusCount(g.Key, g.Count())).ToListAsync(ct);

        var top = await db.OrderItems.AsNoTracking().Where(i => i.Order!.PlacedAt >= splitUtc && i.Order.PlacedAt < toUtc && !Excluded.Contains(i.Order.Status))
            .GroupBy(i => i.ProductName).Select(g => new { Name = g.Key, Qty = g.Sum(i => i.Quantity), Revenue = g.Sum(i => i.LineTotal), Variant = g.Select(i => i.VariantId).FirstOrDefault() })
            .OrderByDescending(x => x.Revenue).Take(5).ToListAsync(ct);
        var variantIds = top.Where(t => t.Variant != null).Select(t => t.Variant!.Value).ToList();
        var productOf = await db.ProductVariants.IgnoreQueryFilters().AsNoTracking().Where(v => variantIds.Contains(v.Id)).ToDictionaryAsync(v => v.Id, v => v.ProductId, ct);
        var topProducts = top.Select(t => new DashboardTopProduct(t.Variant is { } vid && productOf.TryGetValue(vid, out var pid) ? pid : null, t.Name, t.Qty, t.Revenue)).ToList();

        var recent = await db.Orders.AsNoTracking().OrderByDescending(o => o.PlacedAt).Take(8)
            .Select(o => new AdminOrderListItemDto(o.Id, o.OrderNumber, o.Status, o.PaymentStatus, o.PlacedAt, o.CustomerName, o.Phone, o.GrandTotal, o.Items.Sum(i => i.Quantity),
                o.Payments.Select(p => (PaymentMethod?)p.Method).FirstOrDefault())).ToListAsync(ct);

        var lowQuery = db.ProductVariants.AsNoTracking().Where(v => v.IsActive && v.StockQuantity <= LowStockThreshold && v.Product!.Status == ProductStatus.Active);
        var lowStock = await lowQuery.OrderBy(v => v.StockQuantity).ThenBy(v => v.Product!.Name).Take(8)
            .Select(v => new { v.Id, v.ProductId, ProductName = v.Product!.Name, v.Sku, v.StockQuantity }).ToListAsync(ct);

        var alerts = new DashboardAlerts(
            await db.Orders.CountAsync(o => o.Status == OrderStatus.Pending, ct),
            await db.Orders.CountAsync(o => !Excluded.Contains(o.Status) && o.PaymentStatus == PaymentStatus.Unpaid && o.Payments.Any(p => p.Method == PaymentMethod.BankTransfer), ct),
            await lowQuery.CountAsync(ct),
            user.HasPermission(Permissions.ReviewModerate) ? await db.Reviews.CountAsync(r => r.Status == ReviewStatus.Pending, ct) : 0);

        return new DashboardDto(from, today, days, zone.Id, kpi, series, statuses.OrderBy(s => s.Status).ToList(), topProducts, recent,
            lowStock.Select(l => new DashboardLowStock(l.Id, l.ProductId, l.ProductName, l.Sku, null, l.StockQuantity)).ToList(), alerts);
    }
}

/// <summary>Múi giờ của cửa hàng. Máy chủ thiếu dữ liệu múi giờ (một số image tối giản) thì dùng độ lệch cố định cho Asia/Ho_Chi_Minh, còn lại UTC.</summary>
public static class StoreTime
{
    public static TimeZoneInfo Zone(string id)
    {
        try { return TimeZoneInfo.FindSystemTimeZoneById(id); }
        catch (Exception ex) when (ex is TimeZoneNotFoundException or InvalidTimeZoneException)
        {
            return id is "Asia/Ho_Chi_Minh" or "Asia/Saigon" or "Asia/Bangkok" or "SE Asia Standard Time"
                ? TimeZoneInfo.CreateCustomTimeZone(id, TimeSpan.FromHours(7), id, id)
                : TimeZoneInfo.Utc;
        }
    }

    public static DateTime StartOfDayUtc(DateOnly day, TimeZoneInfo zone) =>
        TimeZoneInfo.ConvertTimeToUtc(DateTime.SpecifyKind(day.ToDateTime(TimeOnly.MinValue), DateTimeKind.Unspecified), zone);
}
