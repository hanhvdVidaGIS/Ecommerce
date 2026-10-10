using System.Security.Cryptography;
using Ccp.Application.Abstractions;
using Ccp.Application.Common;
using Ccp.Application.Config;
using Ccp.Domain.Entities;
using Ccp.Domain.Enums;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace Ccp.Application.Sales;

public class CheckoutService(IAppDbContext db, CartService carts, AddressService addresses, ShippingService shipping, CouponEvaluator coupons, PaymentGatewayRegistry gateways,
    OrderMapper mapper, IStorageService storage, IEmailSender email, ICurrentUser user, TimeProvider clock, ILogger<CheckoutService> logger)
{
    private const string OrderNumberAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    public async Task<OrderDto> PlaceOrderAsync(CartOwner owner, CheckoutRequest req, CancellationToken ct = default)
    {
        var cart = owner.IsEmpty ? null : await FindCartAsync(owner, ct);
        if (cart is null || cart.Items.Count == 0) throw new AppException("cart_empty", "Giỏ hàng đang trống.", 400);

        var enabled = await gateways.EnabledAsync(ct);
        if (!enabled.Contains(req.PaymentMethod))
            throw AppException.Validation("Phương thức thanh toán này hiện không khả dụng.", new ErrorDetail("paymentMethod", "Không khả dụng."));
        var phone = PhoneRules.Normalize(req.Phone)!;
        var (provinceName, wardName) = await addresses.ResolveAsync(req.ProvinceCode, req.WardCode, ct);

        // Đọc lại giá và tồn kho từ cơ sở dữ liệu: giá trong giỏ chỉ để hiển thị, không bao giờ là căn cứ tính tiền.
        var ids = cart.Items.Select(i => i.VariantId).ToList();
        var variants = await db.ProductVariants.AsNoTracking().Include(v => v.Product).ThenInclude(p => p!.PrimaryCategory)
            .Include(v => v.OptionValues).ThenInclude(o => o.Value).Include(v => v.OptionValues).ThenInclude(o => o.Attribute)
            .Where(v => ids.Contains(v.Id)).ToDictionaryAsync(v => v.Id, ct);

        var problems = new List<ErrorDetail>();
        var lines = new List<(CartItem Item, ProductVariant Variant)>();
        for (var i = 0; i < cart.Items.Count; i++)
        {
            var item = cart.Items[i];
            if (!variants.TryGetValue(item.VariantId, out var v) || v.Product is null || !v.IsActive || v.Product.Status != ProductStatus.Active
                || (v.Product.PrimaryCategory is { IsActive: false }))
            { problems.Add(new ErrorDetail($"items[{i}]", "Sản phẩm không còn được bán.")); continue; }
            if (v.StockQuantity < item.Quantity)
            { problems.Add(new ErrorDetail($"items[{i}]", v.StockQuantity <= 0 ? $"{v.Product.Name} đã hết hàng." : $"{v.Product.Name} chỉ còn {v.StockQuantity} sản phẩm.")); continue; }
            lines.Add((item, v));
        }
        if (problems.Count > 0) throw new AppException("stock_changed", "Một số sản phẩm trong giỏ không còn đủ để đặt. Vui lòng kiểm tra lại giỏ hàng.", 409, problems);

        var subtotal = lines.Sum(l => l.Variant.EffectivePrice * l.Item.Quantity);
        var eval = await coupons.EvaluateAsync(cart.CouponCode, subtotal, user.UserId, req.Email, ct);
        if (cart.CouponCode is not null && !eval.IsValid)
            throw new AppException(eval.ErrorCode ?? "coupon_invalid", eval.Error ?? "Mã giảm giá không hợp lệ.", 400, [new ErrorDetail("couponCode", eval.Error ?? "Không hợp lệ.")]);
        var quote = await shipping.QuoteAsync(req.ProvinceCode, subtotal, ct);
        var fee = eval.FreeShipping ? 0 : quote.Fee;
        var discount = eval.IsValid ? eval.Discount : 0;

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        try
        {
            // Trừ tồn kho nguyên tử: chỉ trừ khi còn đủ. Sắp theo mã để hai đơn đồng thời không khoá chéo nhau.
            foreach (var (item, v) in lines.OrderBy(l => l.Variant.Id))
            {
                var vid = v.Id; var qty = item.Quantity;
                var affected = await db.ProductVariants.Where(x => x.Id == vid && x.IsActive && x.StockQuantity >= qty)
                    .ExecuteUpdateAsync(s => s.SetProperty(x => x.StockQuantity, x => x.StockQuantity - qty), ct);
                if (affected == 0)
                    throw new AppException("out_of_stock", $"{v.Product!.Name} vừa hết hàng hoặc không đủ số lượng.", 409, [new ErrorDetail("items", $"{v.Product.Name} không đủ số lượng.")]);
            }
            if (eval.IsValid && eval.Coupon is { } c)
            {
                var cid = c.Id;
                var used = await db.Coupons.Where(x => x.Id == cid && (x.UsageLimit == null || x.UsedCount < x.UsageLimit)).ExecuteUpdateAsync(s => s.SetProperty(x => x.UsedCount, x => x.UsedCount + 1), ct);
                if (used == 0) throw new AppException("coupon_exhausted", "Mã giảm giá vừa hết lượt sử dụng.", 409, [new ErrorDetail("couponCode", "Hết lượt sử dụng.")]);
            }

            var now = clock.GetUtcNow().UtcDateTime;
            var order = new Order
            {
                UserId = user.UserId, CustomerName = req.CustomerName.Trim(), Phone = phone, Email = string.IsNullOrWhiteSpace(req.Email) ? null : req.Email.Trim().ToLowerInvariant(),
                ShippingAddress = req.AddressLine.Trim(), ProvinceCode = req.ProvinceCode, WardCode = req.WardCode, ProvinceName = provinceName, WardName = wardName,
                Note = string.IsNullOrWhiteSpace(req.Note) ? null : req.Note.Trim(), Subtotal = subtotal, DiscountTotal = discount, ShippingFee = fee,
                GrandTotal = Math.Max(0, subtotal - discount) + fee, CouponCode = eval.IsValid ? eval.Coupon!.Code : null, Status = OrderStatus.Pending, PaymentStatus = PaymentStatus.Unpaid, PlacedAt = now,
            };
            var imageIds = lines.Select(l => l.Variant.ProductId).Distinct().ToList();
            var firstImages = await db.ProductImages.AsNoTracking().Where(i => imageIds.Contains(i.ProductId)).OrderByDescending(i => i.IsPrimary).ThenBy(i => i.SortOrder)
                .Select(i => new { i.ProductId, i.Media!.StorageKey }).ToListAsync(ct);
            var keyByProduct = firstImages.GroupBy(i => i.ProductId).ToDictionary(g => g.Key, g => g.First().StorageKey);
            foreach (var (item, v) in lines)
            {
                var label = string.Join(" / ", v.OptionValues.OrderBy(o => o.Attribute!.SortOrder).Select(o => o.Value!.Label));
                order.Items.Add(new OrderItem
                {
                    OrderId = order.Id, VariantId = v.Id, ProductName = v.Product!.Name, VariantName = label.Length == 0 ? null : label, Sku = v.Sku, UnitPrice = v.EffectivePrice,
                    Quantity = item.Quantity, LineTotal = v.EffectivePrice * item.Quantity, ImageUrl = keyByProduct.TryGetValue(v.ProductId, out var key) ? storage.GetPublicUrl(key) : null,
                });
            }
            order.History.Add(new OrderStatusHistory { OrderId = order.Id, FromStatus = null, ToStatus = OrderStatus.Pending, Note = "Khách đặt hàng", ChangedBy = user.UserId, ChangedAt = now });

            var gateway = gateways.Get(req.PaymentMethod);
            var payment = new Payment { OrderId = order.Id, Method = gateway.Method, Provider = gateway.Provider, Amount = order.GrandTotal, Status = PaymentStatus.Unpaid };
            order.Payments.Add(payment);
            await gateway.InitiateAsync(order, payment, ct);

            await SaveWithUniqueNumberAsync(order, ct);

            // Xoá giỏ trong cùng giao dịch: đặt lại cùng giỏ sẽ gặp "cart_empty", không tạo đơn thứ hai.
            var trackedCart = await db.Carts.Include(c => c.Items).SingleAsync(c => c.Id == cart.Id, ct);
            db.CartItems.RemoveRange(trackedCart.Items);
            trackedCart.CouponCode = null;
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);

            await NotifyAsync(order, ct);
            return await mapper.ToDtoAsync(order, ct);
        }
        catch
        {
            await tx.RollbackAsync(ct);
            throw;
        }
    }

    private async Task<Cart?> FindCartAsync(CartOwner owner, CancellationToken ct)
    {
        var query = db.Carts.AsNoTracking().Include(c => c.Items);
        return owner.UserId is { } uid
            ? await query.FirstOrDefaultAsync(c => c.UserId == uid, ct)
            : await query.FirstOrDefaultAsync(c => c.SessionToken == owner.SessionToken && c.UserId == null, ct);
    }

    /// <summary>
    /// Mã đơn dạng ODyyMMdd-XXXXX (32^5 ≈ 33 triệu mã mỗi ngày). Kiểm tra trùng trước khi lưu; nếu hai đơn cùng sinh một mã
    /// trong cùng một khoảnh khắc thì chỉ mục duy nhất của cơ sở dữ liệu từ chối đơn sau (409), không bao giờ có hai đơn cùng mã.
    /// </summary>
    private async Task SaveWithUniqueNumberAsync(Order order, CancellationToken ct)
    {
        for (var attempt = 0; attempt < 10; attempt++)
        {
            var number = NewOrderNumber(order.PlacedAt);
            if (await db.Orders.IgnoreQueryFilters().AnyAsync(o => o.OrderNumber == number, ct)) continue;
            order.OrderNumber = number;
            db.Orders.Add(order);
            await db.SaveChangesAsync(ct);
            return;
        }
        throw new AppException("order_number_failed", "Không tạo được mã đơn hàng, vui lòng thử lại.", 503);
    }

    public static string NewOrderNumber(DateTime utc)
    {
        var local = utc.AddHours(7); // múi giờ cửa hàng mặc định (GMT+7) cho phần ngày của mã
        var chars = new char[5];
        for (var i = 0; i < chars.Length; i++) chars[i] = OrderNumberAlphabet[RandomNumberGenerator.GetInt32(OrderNumberAlphabet.Length)];
        return $"OD{local:yyMMdd}-{new string(chars)}";
    }

    private async Task NotifyAsync(Order order, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(order.Email)) return;
        try
        {
            await email.SendAsync(order.Email, $"Xác nhận đơn hàng {order.OrderNumber}",
                $"<p>Cảm ơn {System.Net.WebUtility.HtmlEncode(order.CustomerName)} đã đặt hàng.</p><p>Mã đơn: <b>{order.OrderNumber}</b>. Tổng thanh toán: <b>{order.GrandTotal:N0}</b>.</p>", ct);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Không gửi được email xác nhận đơn {Order}", order.OrderNumber); // không làm hỏng đơn đã đặt
        }
    }
}
