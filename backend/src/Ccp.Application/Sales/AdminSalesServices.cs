using Ccp.Application.Abstractions;
using Ccp.Application.Common;
using Ccp.Domain.Entities;
using Ccp.Domain.Enums;
using Ccp.Domain.Security;
using FluentValidation;
using Microsoft.EntityFrameworkCore;

namespace Ccp.Application.Sales;

// ---------- mã giảm giá ----------
public sealed record CouponDto(Guid Id, string Code, CouponType Type, decimal Value, decimal? MinOrderAmount, decimal? MaxDiscount, int? UsageLimit, int UsedCount, int? PerUserLimit,
    DateTime? StartAt, DateTime? EndAt, bool IsActive, string State);

public sealed record SaveCouponRequest(string Code, CouponType Type, decimal Value, decimal? MinOrderAmount, decimal? MaxDiscount, int? UsageLimit, int? PerUserLimit,
    DateTime? StartAt, DateTime? EndAt, bool IsActive);

public sealed class CouponQuery : PageRequest
{
    public bool? Active { get; set; }
}

public sealed class SaveCouponRequestValidator : AbstractValidator<SaveCouponRequest>
{
    public SaveCouponRequestValidator()
    {
        RuleFor(x => x.Code).NotEmpty().MaximumLength(50).Matches("^[A-Za-z0-9_-]+$").WithMessage("Mã gồm chữ, số, gạch ngang, gạch dưới.");
        RuleFor(x => x.Type).IsInEnum();
        RuleFor(x => x.Value).GreaterThan(0).When(x => x.Type != CouponType.FreeShipping).WithMessage("Giá trị phải lớn hơn 0.");
        RuleFor(x => x.Value).LessThanOrEqualTo(100).When(x => x.Type == CouponType.Percent).WithMessage("Phần trăm tối đa 100.");
        RuleFor(x => x.Value).LessThanOrEqualTo(1_000_000_000).WithMessage("Giá trị quá lớn.");
        RuleFor(x => x.MinOrderAmount).GreaterThanOrEqualTo(0).When(x => x.MinOrderAmount.HasValue);
        RuleFor(x => x.MaxDiscount).GreaterThan(0).When(x => x.MaxDiscount.HasValue);
        RuleFor(x => x.UsageLimit).GreaterThan(0).When(x => x.UsageLimit.HasValue);
        RuleFor(x => x.PerUserLimit).GreaterThan(0).When(x => x.PerUserLimit.HasValue);
        RuleFor(x => x.EndAt).GreaterThan(x => x.StartAt).When(x => x.StartAt.HasValue && x.EndAt.HasValue).WithMessage("Ngày kết thúc phải sau ngày bắt đầu.");
    }
}

public class CouponService(IAppDbContext db, AuditService audit, TimeProvider clock)
{
    private static readonly IReadOnlyDictionary<string, System.Linq.Expressions.Expression<Func<Coupon, object?>>> Sorts = new Dictionary<string, System.Linq.Expressions.Expression<Func<Coupon, object?>>>
    {
        ["code"] = c => c.Code, ["createdAt"] = c => c.CreatedAt, ["usedCount"] = c => c.UsedCount, ["endAt"] = c => c.EndAt,
    };

    public async Task<PagedResult<CouponDto>> ListAsync(CouponQuery q, CancellationToken ct = default)
    {
        var query = db.Coupons.AsNoTracking().AsQueryable();
        if (q.Active is { } a) query = query.Where(c => c.IsActive == a);
        if (!string.IsNullOrWhiteSpace(q.Q)) { var like = SearchText.LikePattern(SearchText.Fold(q.Q)); query = query.Where(c => EF.Functions.Like(c.Code.ToLower(), like, "\\")); }
        var page = await query.ApplySort(q.Sort, Sorts, "createdAt:desc").ToPagedAsync(q, ct);
        var now = clock.GetUtcNow().UtcDateTime;
        return new PagedResult<CouponDto>(page.Items.Select(c => ToDto(c, now)).ToList(), page.Page, page.PageSize, page.Total);
    }

    public async Task<CouponDto> GetAsync(Guid id, CancellationToken ct = default) =>
        ToDto(await db.Coupons.AsNoTracking().SingleOrDefaultAsync(c => c.Id == id, ct) ?? throw AppException.NotFound("mã giảm giá"), clock.GetUtcNow().UtcDateTime);

    public async Task<CouponDto> CreateAsync(SaveCouponRequest req, CancellationToken ct = default)
    {
        var code = CouponEvaluator.NormalizeCode(req.Code);
        if (await db.Coupons.AnyAsync(c => c.Code.ToUpper() == code, ct)) throw new AppException("code_taken", "Mã giảm giá đã tồn tại.", 409, [new ErrorDetail("code", "Đã tồn tại.")]);
        var coupon = new Coupon { Code = code };
        Apply(coupon, req);
        db.Coupons.Add(coupon);
        audit.Log("coupon.create", nameof(Coupon), coupon.Id.ToString(), new { code });
        await db.SaveChangesAsync(ct);
        return ToDto(coupon, clock.GetUtcNow().UtcDateTime);
    }

    public async Task<CouponDto> UpdateAsync(Guid id, SaveCouponRequest req, CancellationToken ct = default)
    {
        var coupon = await db.Coupons.SingleOrDefaultAsync(c => c.Id == id, ct) ?? throw AppException.NotFound("mã giảm giá");
        var code = CouponEvaluator.NormalizeCode(req.Code);
        // Đổi mã khi đã có đơn dùng mã này sẽ làm lệch thống kê và giới hạn theo người dùng (so khớp theo mã đã lưu trên đơn).
        if (!string.Equals(coupon.Code, code, StringComparison.OrdinalIgnoreCase) && coupon.UsedCount > 0)
            throw new AppException("code_locked", "Mã đã được sử dụng nên không đổi được. Hãy tắt mã này và tạo mã mới.", 409, [new ErrorDetail("code", "Không đổi được.")]);
        if (await db.Coupons.AnyAsync(c => c.Id != id && c.Code.ToUpper() == code, ct)) throw new AppException("code_taken", "Mã giảm giá đã tồn tại.", 409, [new ErrorDetail("code", "Đã tồn tại.")]);
        if (req.UsageLimit is { } limit && limit < coupon.UsedCount)
            throw AppException.Validation("Giới hạn lượt dùng không được nhỏ hơn số lượt đã dùng.", new ErrorDetail("usageLimit", $"Đã dùng {coupon.UsedCount} lượt."));
        coupon.Code = code;
        Apply(coupon, req);
        audit.Log("coupon.update", nameof(Coupon), coupon.Id.ToString(), new { code, req.IsActive });
        await db.SaveChangesAsync(ct);
        return ToDto(coupon, clock.GetUtcNow().UtcDateTime);
    }

    public async Task DeleteAsync(Guid id, CancellationToken ct = default)
    {
        var coupon = await db.Coupons.SingleOrDefaultAsync(c => c.Id == id, ct) ?? throw AppException.NotFound("mã giảm giá");
        coupon.IsDeleted = true; // xoá mềm: đơn cũ vẫn giữ mã đã dùng
        coupon.IsActive = false;
        audit.Log("coupon.delete", nameof(Coupon), id.ToString(), new { coupon.Code });
        await db.SaveChangesAsync(ct);
    }

    private static void Apply(Coupon c, SaveCouponRequest r)
    {
        c.Type = r.Type;
        c.Value = r.Type == CouponType.FreeShipping ? 0 : r.Value;
        c.MinOrderAmount = r.MinOrderAmount;
        c.MaxDiscount = r.Type == CouponType.Percent ? r.MaxDiscount : null;
        c.UsageLimit = r.UsageLimit;
        c.PerUserLimit = r.PerUserLimit;
        c.StartAt = r.StartAt?.ToUniversalTime();
        c.EndAt = r.EndAt?.ToUniversalTime();
        c.IsActive = r.IsActive;
    }

    /// <summary>State: disabled | scheduled | expired | exhausted | running.</summary>
    private static CouponDto ToDto(Coupon c, DateTime now)
    {
        var state = !c.IsActive ? "disabled" : c.StartAt > now ? "scheduled" : c.EndAt < now ? "expired" : c.UsageLimit is { } l && c.UsedCount >= l ? "exhausted" : "running";
        return new CouponDto(c.Id, c.Code, c.Type, c.Value, c.MinOrderAmount, c.MaxDiscount, c.UsageLimit, c.UsedCount, c.PerUserLimit, c.StartAt, c.EndAt, c.IsActive, state);
    }
}

// ---------- phí vận chuyển ----------
public sealed record ShippingRateDto(Guid Id, string Name, string? ProvinceCode, string? ProvinceName, decimal? MinOrderAmount, decimal Fee, decimal? FreeShipThreshold, bool IsActive, int SortOrder);
public sealed record SaveShippingRateRequest(string Name, string? ProvinceCode, decimal? MinOrderAmount, decimal Fee, decimal? FreeShipThreshold, bool IsActive, int SortOrder);

public sealed class SaveShippingRateRequestValidator : AbstractValidator<SaveShippingRateRequest>
{
    public SaveShippingRateRequestValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(200);
        RuleFor(x => x.ProvinceCode).MaximumLength(20);
        RuleFor(x => x.Fee).InclusiveBetween(0, 100_000_000);
        RuleFor(x => x.MinOrderAmount).GreaterThanOrEqualTo(0).When(x => x.MinOrderAmount.HasValue);
        RuleFor(x => x.FreeShipThreshold).GreaterThan(0).When(x => x.FreeShipThreshold.HasValue);
        RuleFor(x => x.SortOrder).InclusiveBetween(0, 10_000);
    }
}

public class ShippingRateService(IAppDbContext db, AuditService audit)
{
    public async Task<IReadOnlyList<ShippingRateDto>> ListAsync(CancellationToken ct = default)
    {
        var names = await db.AddressUnits.AsNoTracking().Where(a => a.Level == AddressLevel.Province).ToDictionaryAsync(a => a.Code, a => a.Name, ct);
        var rows = await db.ShippingRates.AsNoTracking().OrderBy(r => r.SortOrder).ThenBy(r => r.Name).ToListAsync(ct);
        return rows.Select(r => ToDto(r, names)).ToList();
    }

    public async Task<ShippingRateDto> CreateAsync(SaveShippingRateRequest req, CancellationToken ct = default)
    {
        var province = await CheckProvinceAsync(req.ProvinceCode, ct);
        var rate = new ShippingRate();
        Apply(rate, req);
        db.ShippingRates.Add(rate);
        audit.Log("shipping.create", nameof(ShippingRate), rate.Id.ToString(), new { req.Name, req.Fee });
        await db.SaveChangesAsync(ct);
        return ToDto(rate, province);
    }

    public async Task<ShippingRateDto> UpdateAsync(Guid id, SaveShippingRateRequest req, CancellationToken ct = default)
    {
        var rate = await db.ShippingRates.SingleOrDefaultAsync(r => r.Id == id, ct) ?? throw AppException.NotFound("mức phí vận chuyển");
        var province = await CheckProvinceAsync(req.ProvinceCode, ct);
        Apply(rate, req);
        audit.Log("shipping.update", nameof(ShippingRate), id.ToString(), new { req.Name, req.Fee });
        await db.SaveChangesAsync(ct);
        return ToDto(rate, province);
    }

    public async Task DeleteAsync(Guid id, CancellationToken ct = default)
    {
        var rate = await db.ShippingRates.SingleOrDefaultAsync(r => r.Id == id, ct) ?? throw AppException.NotFound("mức phí vận chuyển");
        rate.IsDeleted = true;
        audit.Log("shipping.delete", nameof(ShippingRate), id.ToString(), new { rate.Name });
        await db.SaveChangesAsync(ct);
    }

    private async Task<Dictionary<string, string>> CheckProvinceAsync(string? code, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(code)) return [];
        var name = await db.AddressUnits.AsNoTracking().Where(a => a.Code == code && a.Level == AddressLevel.Province).Select(a => a.Name).FirstOrDefaultAsync(ct)
            ?? throw AppException.Validation("Tỉnh/thành phố không hợp lệ.", new ErrorDetail("provinceCode", "Không tồn tại."));
        return new Dictionary<string, string> { [code] = name };
    }

    private static void Apply(ShippingRate r, SaveShippingRateRequest q)
    {
        r.Name = q.Name.Trim();
        r.ProvinceCode = string.IsNullOrWhiteSpace(q.ProvinceCode) ? null : q.ProvinceCode;
        r.MinOrderAmount = q.MinOrderAmount;
        r.Fee = q.Fee;
        r.FreeShipThreshold = q.FreeShipThreshold;
        r.IsActive = q.IsActive;
        r.SortOrder = q.SortOrder;
    }

    private static ShippingRateDto ToDto(ShippingRate r, IReadOnlyDictionary<string, string> names) =>
        new(r.Id, r.Name, r.ProvinceCode, r.ProvinceCode is null ? null : names.GetValueOrDefault(r.ProvinceCode), r.MinOrderAmount, r.Fee, r.FreeShipThreshold, r.IsActive, r.SortOrder);
}

// ---------- khách hàng (quản trị) ----------
public sealed record CustomerListItemDto(Guid Id, string FullName, string Email, string? Phone, bool IsActive, DateTime CreatedAt, int OrderCount, decimal TotalSpent);
public sealed record CustomerDetailDto(Guid Id, string FullName, string Email, string? Phone, bool IsActive, DateTime CreatedAt, int OrderCount, decimal TotalSpent,
    IReadOnlyList<CustomerAddressDto> Addresses, IReadOnlyList<OrderListItemDto> RecentOrders);
public sealed record SetCustomerActiveRequest(bool IsActive);

public class CustomerQuery : PageRequest
{
    public bool? Active { get; set; }
}

public class CustomerAdminService(IAppDbContext db, AuditService audit, ICurrentUser user)
{
    private static readonly OrderStatus[] Revenue = [OrderStatus.Pending, OrderStatus.Confirmed, OrderStatus.Processing, OrderStatus.Shipping, OrderStatus.Completed];

    private IReadOnlyDictionary<string, System.Linq.Expressions.Expression<Func<User, object?>>> Sorts => new Dictionary<string, System.Linq.Expressions.Expression<Func<User, object?>>>
    {
        ["createdAt"] = u => u.CreatedAt, ["fullName"] = u => u.FullName,
        ["orderCount"] = u => db.Orders.Count(o => o.UserId == u.Id),
        ["totalSpent"] = u => db.Orders.Where(o => o.UserId == u.Id && Revenue.Contains(o.Status)).Sum(o => (decimal?)o.GrandTotal) ?? 0,
    };

    private IQueryable<User> Customers() => db.Users.AsNoTracking().Where(u => u.UserRoles.All(r => r.Role!.Code == RoleDefaults.Customer));

    public async Task<PagedResult<CustomerListItemDto>> ListAsync(CustomerQuery q, CancellationToken ct = default)
    {
        var users = Customers();
        if (q.Active is { } a) users = users.Where(u => u.IsActive == a);
        if (!string.IsNullOrWhiteSpace(q.Q))
        {
            var like = SearchText.LikePattern(SearchText.Fold(q.Q));
            users = users.Where(u => EF.Functions.Like(SqlFunctions.Unaccent(u.FullName.ToLower()), like, "\\") || EF.Functions.Like(u.Email.ToLower(), like, "\\")
                || (u.PhoneNumber != null && EF.Functions.Like(u.PhoneNumber, like, "\\")));
        }
        users = users.ApplySort(q.Sort, Sorts, "createdAt:desc");
        var total = await users.CountAsync(ct);
        var rows = await users.Skip((q.Page - 1) * q.PageSize).Take(q.PageSize).Select(u => new CustomerListItemDto(u.Id, u.FullName, u.Email, u.PhoneNumber, u.IsActive, u.CreatedAt,
            db.Orders.Count(o => o.UserId == u.Id), db.Orders.Where(o => o.UserId == u.Id && Revenue.Contains(o.Status)).Sum(o => (decimal?)o.GrandTotal) ?? 0)).ToListAsync(ct);
        return new PagedResult<CustomerListItemDto>(rows, q.Page, q.PageSize, total);
    }

    public async Task<CustomerDetailDto> GetAsync(Guid id, CancellationToken ct = default)
    {
        var u = await Customers().SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw AppException.NotFound("khách hàng");
        var stats = await db.Orders.AsNoTracking().Where(o => o.UserId == id).GroupBy(o => 1)
            .Select(g => new { N = g.Count(), Sum = g.Where(o => Revenue.Contains(o.Status)).Sum(o => (decimal?)o.GrandTotal) ?? 0 }).FirstOrDefaultAsync(ct);
        var addresses = await db.CustomerAddresses.AsNoTracking().Where(a => a.UserId == id).OrderByDescending(a => a.IsDefault).ThenBy(a => a.CreatedAt).ToListAsync(ct);
        var recent = await db.Orders.AsNoTracking().Include(o => o.Items).Where(o => o.UserId == id).OrderByDescending(o => o.PlacedAt).Take(10).ToListAsync(ct);
        return new CustomerDetailDto(u.Id, u.FullName, u.Email, u.PhoneNumber, u.IsActive, u.CreatedAt, stats?.N ?? 0, stats?.Sum ?? 0,
            await AccountService.MapAddressesAsync(db, addresses, ct), recent.Select(OrderMapper.ToListItem).ToList());
    }

    public async Task SetActiveAsync(Guid id, bool active, CancellationToken ct = default)
    {
        var u = await db.Users.Include(x => x.UserRoles).ThenInclude(r => r.Role).SingleOrDefaultAsync(x => x.Id == id, ct) ?? throw AppException.NotFound("khách hàng");
        if (u.UserRoles.Any(r => r.Role!.Code != RoleDefaults.Customer)) throw AppException.Forbidden("Đây là tài khoản quản trị, hãy quản lý ở mục Người dùng.");
        if (u.Id == user.UserId) throw AppException.Forbidden("Không thể tự khoá tài khoản của mình.");
        u.IsActive = active;
        if (!active)
        {
            var now = DateTime.UtcNow;
            // Thu hồi phiên đăng nhập để khoá có hiệu lực ngay khi token truy cập hết hạn.
            await db.RefreshTokens.Where(t => t.UserId == id && t.RevokedAt == null).ExecuteUpdateAsync(s => s.SetProperty(t => t.RevokedAt, now));
        }
        audit.Log(active ? "customer.unlock" : "customer.lock", nameof(User), id.ToString());
        await db.SaveChangesAsync(ct);
    }
}

// ---------- tài khoản khách: địa chỉ và yêu thích ----------
public sealed record CustomerAddressDto(Guid Id, string ReceiverName, string Phone, string AddressLine, string? ProvinceCode, string? ProvinceName, string? WardCode, string? WardName, bool IsDefault);
public sealed record SaveAddressRequest(string ReceiverName, string Phone, string AddressLine, string ProvinceCode, string WardCode, bool IsDefault);

public sealed class SaveAddressRequestValidator : AbstractValidator<SaveAddressRequest>
{
    public SaveAddressRequestValidator()
    {
        RuleFor(x => x.ReceiverName).NotEmpty().MaximumLength(200);
        RuleFor(x => x.Phone).NotEmpty().Must(PhoneRules.IsValid).WithMessage("Số điện thoại không hợp lệ.");
        RuleFor(x => x.AddressLine).NotEmpty().MaximumLength(300);
        RuleFor(x => x.ProvinceCode).NotEmpty().MaximumLength(20);
        RuleFor(x => x.WardCode).NotEmpty().MaximumLength(20);
    }
}

public class AccountService(IAppDbContext db, AddressService addresses, Storefront.PublicCatalogService catalog, ICurrentUser user)
{
    public const int MaxAddresses = 10;
    public const int MaxWishlist = 200;
    private Guid Uid => user.UserId ?? throw AppException.Unauthorized();

    public static async Task<IReadOnlyList<CustomerAddressDto>> MapAddressesAsync(IAppDbContext db, IReadOnlyList<CustomerAddress> rows, CancellationToken ct)
    {
        var codes = rows.SelectMany(r => new[] { r.ProvinceCode, r.WardCode }).Where(c => c != null).Distinct().ToList();
        var names = await db.AddressUnits.AsNoTracking().Where(a => codes.Contains(a.Code)).ToDictionaryAsync(a => a.Code, a => a.Name, ct);
        string? Name(string? c) => c is null ? null : names.GetValueOrDefault(c);
        return rows.Select(r => new CustomerAddressDto(r.Id, r.ReceiverName, r.Phone, r.AddressLine, r.ProvinceCode, Name(r.ProvinceCode), r.WardCode, Name(r.WardCode), r.IsDefault)).ToList();
    }

    public async Task<IReadOnlyList<CustomerAddressDto>> ListAddressesAsync(CancellationToken ct = default)
    {
        var uid = Uid;
        var rows = await db.CustomerAddresses.AsNoTracking().Where(a => a.UserId == uid).OrderByDescending(a => a.IsDefault).ThenBy(a => a.CreatedAt).ToListAsync(ct);
        return await MapAddressesAsync(db, rows, ct);
    }

    public async Task<IReadOnlyList<CustomerAddressDto>> CreateAddressAsync(SaveAddressRequest req, CancellationToken ct = default)
    {
        var uid = Uid;
        await addresses.ResolveAsync(req.ProvinceCode, req.WardCode, ct);
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var count = await db.CustomerAddresses.CountAsync(a => a.UserId == uid, ct);
        if (count >= MaxAddresses) throw new AppException("address_limit", $"Tối đa {MaxAddresses} địa chỉ.", 409);
        var makeDefault = req.IsDefault || count == 0;
        if (makeDefault) await ClearDefaultAsync(uid, ct);
        db.CustomerAddresses.Add(new CustomerAddress { UserId = uid, ReceiverName = req.ReceiverName.Trim(), Phone = PhoneRules.Normalize(req.Phone)!, AddressLine = req.AddressLine.Trim(), ProvinceCode = req.ProvinceCode, WardCode = req.WardCode, IsDefault = makeDefault });
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return await ListAddressesAsync(ct);
    }

    public async Task<IReadOnlyList<CustomerAddressDto>> UpdateAddressAsync(Guid id, SaveAddressRequest req, CancellationToken ct = default)
    {
        var uid = Uid;
        await addresses.ResolveAsync(req.ProvinceCode, req.WardCode, ct);
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var a = await db.CustomerAddresses.SingleOrDefaultAsync(x => x.Id == id && x.UserId == uid, ct) ?? throw AppException.NotFound("địa chỉ");
        if (req.IsDefault && !a.IsDefault) await ClearDefaultAsync(uid, ct);
        a.ReceiverName = req.ReceiverName.Trim(); a.Phone = PhoneRules.Normalize(req.Phone)!; a.AddressLine = req.AddressLine.Trim();
        a.ProvinceCode = req.ProvinceCode; a.WardCode = req.WardCode;
        a.IsDefault = req.IsDefault || a.IsDefault; // bỏ chọn mặc định bằng cách chọn địa chỉ khác làm mặc định
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return await ListAddressesAsync(ct);
    }

    public async Task<IReadOnlyList<CustomerAddressDto>> DeleteAddressAsync(Guid id, CancellationToken ct = default)
    {
        var uid = Uid;
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var a = await db.CustomerAddresses.SingleOrDefaultAsync(x => x.Id == id && x.UserId == uid, ct) ?? throw AppException.NotFound("địa chỉ");
        db.CustomerAddresses.Remove(a);
        await db.SaveChangesAsync(ct);
        if (a.IsDefault)
        {
            var next = await db.CustomerAddresses.Where(x => x.UserId == uid).OrderBy(x => x.CreatedAt).FirstOrDefaultAsync(ct);
            if (next is not null) { next.IsDefault = true; await db.SaveChangesAsync(ct); }
        }
        await tx.CommitAsync(ct);
        return await ListAddressesAsync(ct);
    }

    // Chỉ mục duy nhất (user, is_default = true) yêu cầu bỏ mặc định cũ trước khi đặt mặc định mới.
    private async Task ClearDefaultAsync(Guid uid, CancellationToken ct) =>
        await db.CustomerAddresses.Where(x => x.UserId == uid && x.IsDefault).ExecuteUpdateAsync(s => s.SetProperty(x => x.IsDefault, false), ct);

    // ----- yêu thích -----
    public async Task<IReadOnlyList<Guid>> WishlistIdsAsync(CancellationToken ct = default)
    {
        var uid = Uid;
        return await db.Wishlists.AsNoTracking().Where(w => w.UserId == uid).OrderByDescending(w => w.CreatedAt).Select(w => w.ProductId).ToListAsync(ct);
    }

    public async Task<IReadOnlyList<Storefront.ProductCardDto>> WishlistAsync(CancellationToken ct = default) => await catalog.CardsByIdsAsync(await WishlistIdsAsync(ct), ct);

    public async Task AddWishlistAsync(Guid productId, CancellationToken ct = default)
    {
        var uid = Uid;
        if (!await db.Products.AnyAsync(p => p.Id == productId && p.Status == ProductStatus.Active, ct)) throw AppException.NotFound("sản phẩm");
        if (await db.Wishlists.AnyAsync(w => w.UserId == uid && w.ProductId == productId, ct)) return; // idempotent
        if (await db.Wishlists.CountAsync(w => w.UserId == uid, ct) >= MaxWishlist) throw new AppException("wishlist_limit", $"Danh sách yêu thích tối đa {MaxWishlist} sản phẩm.", 409);
        db.Wishlists.Add(new Wishlist { UserId = uid, ProductId = productId, CreatedAt = DateTime.UtcNow });
        await db.SaveChangesAsync(ct);
    }

    public async Task RemoveWishlistAsync(Guid productId, CancellationToken ct = default)
    {
        var uid = Uid;
        await db.Wishlists.Where(w => w.UserId == uid && w.ProductId == productId).ExecuteDeleteAsync(ct);
    }
}
