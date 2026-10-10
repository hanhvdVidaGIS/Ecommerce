using Ccp.Application.Abstractions;
using Ccp.Application.Common;
using Ccp.Domain.Entities;
using Ccp.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Ccp.Application.Sales;

/// <summary>Danh mục đơn vị hành chính hai cấp (tỉnh/thành phố, phường/xã/đặc khu).</summary>
public class AddressService(IAppDbContext db)
{
    public async Task<IReadOnlyList<AddressUnitDto>> ProvincesAsync(CancellationToken ct = default) =>
        await db.AddressUnits.AsNoTracking().Where(a => a.Level == AddressLevel.Province).OrderBy(a => a.Name).Select(a => new AddressUnitDto(a.Code, a.Name)).ToListAsync(ct);

    public async Task<IReadOnlyList<AddressUnitDto>> WardsAsync(string provinceCode, CancellationToken ct = default)
    {
        if (!await db.AddressUnits.AnyAsync(a => a.Code == provinceCode && a.Level == AddressLevel.Province, ct)) throw AppException.NotFound("tỉnh/thành phố");
        return await db.AddressUnits.AsNoTracking().Where(a => a.Level == AddressLevel.Ward && a.ParentCode == provinceCode).OrderBy(a => a.Name).Select(a => new AddressUnitDto(a.Code, a.Name)).ToListAsync(ct);
    }

    /// <summary>Kiểm tra phường/xã thuộc đúng tỉnh và trả về tên của cả hai (để lưu ảnh chụp vào đơn hàng).</summary>
    public async Task<(string Province, string Ward)> ResolveAsync(string provinceCode, string wardCode, CancellationToken ct = default)
    {
        var units = await db.AddressUnits.AsNoTracking().Where(a => a.Code == provinceCode || a.Code == wardCode).ToListAsync(ct);
        var province = units.SingleOrDefault(a => a.Code == provinceCode && a.Level == AddressLevel.Province);
        var ward = units.SingleOrDefault(a => a.Code == wardCode && a.Level == AddressLevel.Ward);
        if (province is null) throw AppException.Validation("Tỉnh/thành phố không hợp lệ.", new ErrorDetail("provinceCode", "Không tồn tại."));
        if (ward is null || ward.ParentCode != province.Code)
            throw AppException.Validation("Phường/xã không thuộc tỉnh/thành phố đã chọn.", new ErrorDetail("wardCode", "Không thuộc tỉnh/thành phố."));
        return (province.Name, ward.Name);
    }
}

public class ShippingService(IAppDbContext db)
{
    /// <summary>
    /// Chọn mức phí khớp nhất: ưu tiên mức riêng của tỉnh hơn mức mặc định, rồi ngưỡng đơn tối thiểu cao hơn, rồi thứ tự nhỏ hơn.
    /// Miễn phí khi tạm tính đạt ngưỡng FreeShipThreshold. Không có mức nào đang bật thì phí bằng 0.
    /// </summary>
    public async Task<ShippingQuoteDto> QuoteAsync(string? provinceCode, decimal subtotal, CancellationToken ct = default)
    {
        var rates = await db.ShippingRates.AsNoTracking().Where(r => r.IsActive && (r.ProvinceCode == null || r.ProvinceCode == provinceCode)).ToListAsync(ct);
        var rate = rates.Where(r => r.MinOrderAmount is null || subtotal >= r.MinOrderAmount)
            .OrderByDescending(r => r.ProvinceCode != null).ThenByDescending(r => r.MinOrderAmount ?? 0).ThenBy(r => r.SortOrder).FirstOrDefault();
        if (rate is null) return new ShippingQuoteDto(0, null, null, null);

        var free = rate.FreeShipThreshold is { } t && subtotal >= t;
        var remaining = rate.FreeShipThreshold is { } th && !free ? th - subtotal : (decimal?)null;
        return new ShippingQuoteDto(free ? 0 : rate.Fee, rate.Name, rate.FreeShipThreshold, remaining);
    }
}

public sealed record CouponEvaluation(Coupon? Coupon, decimal Discount, bool FreeShipping, string? ErrorCode, string? Error)
{
    public bool IsValid => Coupon is not null && Error is null;
}

public class CouponEvaluator(IAppDbContext db, TimeProvider clock)
{
    public static string NormalizeCode(string code) => code.Trim().ToUpperInvariant();

    public async Task<CouponEvaluation> EvaluateAsync(string? code, decimal subtotal, Guid? userId, string? email, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(code)) return new CouponEvaluation(null, 0, false, null, null);
        var normalized = NormalizeCode(code);
        var coupon = await db.Coupons.AsNoTracking().SingleOrDefaultAsync(c => c.Code.ToUpper() == normalized, ct);
        CouponEvaluation Fail(string errorCode, string message) => new(coupon, 0, false, errorCode, message);

        if (coupon is null || !coupon.IsActive) return Fail("coupon_invalid", "Mã giảm giá không tồn tại hoặc đã ngừng áp dụng.");
        var now = clock.GetUtcNow().UtcDateTime;
        if (coupon.StartAt is { } s && now < s) return Fail("coupon_not_started", "Mã giảm giá chưa đến thời gian áp dụng.");
        if (coupon.EndAt is { } e && now > e) return Fail("coupon_expired", "Mã giảm giá đã hết hạn.");
        if (coupon.MinOrderAmount is { } min && subtotal < min) return Fail("coupon_min_order", $"Đơn hàng cần đạt tối thiểu {min:N0} để dùng mã này.");
        if (coupon.UsageLimit is { } limit && coupon.UsedCount >= limit) return Fail("coupon_exhausted", "Mã giảm giá đã hết lượt sử dụng.");
        if (coupon.PerUserLimit is { } perUser && (userId is not null || !string.IsNullOrWhiteSpace(email)))
        {
            var mail = email?.Trim().ToLowerInvariant();
            var used = await db.Orders.AsNoTracking().CountAsync(o => o.CouponCode == coupon.Code && o.Status != OrderStatus.Cancelled && o.Status != OrderStatus.Refunded
                && ((userId != null && o.UserId == userId) || (mail != null && o.Email != null && o.Email.ToLower() == mail)), ct);
            if (used >= perUser) return Fail("coupon_user_limit", "Bạn đã dùng hết lượt cho mã giảm giá này.");
        }

        var discount = coupon.Type switch
        {
            CouponType.Percent => Math.Round(subtotal * coupon.Value / 100m, 0, MidpointRounding.AwayFromZero),
            CouponType.FixedAmount => coupon.Value,
            _ => 0m,
        };
        if (coupon.Type == CouponType.Percent && coupon.MaxDiscount is { } cap) discount = Math.Min(discount, cap);
        discount = Math.Clamp(discount, 0, subtotal);
        return new CouponEvaluation(coupon, discount, coupon.Type == CouponType.FreeShipping, null, null);
    }
}
