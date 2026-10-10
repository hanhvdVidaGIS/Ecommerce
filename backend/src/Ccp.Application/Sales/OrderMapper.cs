using Ccp.Application.Abstractions;
using Ccp.Domain.Entities;
using Ccp.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Ccp.Application.Sales;

/// <summary>Chuyển Order thành DTO. Dùng chung cho khách (đơn của tôi, tra cứu) và quản trị.</summary>
public class OrderMapper(IAppDbContext db, BankTransferGateway bank)
{
    public async Task<OrderDto> ToDtoAsync(Order o, CancellationToken ct = default)
    {
        BankTransferInfoDto? bankInfo = null;
        var transfer = o.Payments.FirstOrDefault(p => p.Method == PaymentMethod.BankTransfer);
        if (transfer is { Status: PaymentStatus.Unpaid } && o.Status is not (OrderStatus.Cancelled or OrderStatus.Refunded)) bankInfo = await bank.InfoAsync(o.OrderNumber, ct);

        // Liên kết sản phẩm theo biến thể đã đặt (để giao diện dẫn tới trang sản phẩm). Sản phẩm đã xoá thì không có liên kết.
        var variantIds = o.Items.Where(i => i.VariantId != null).Select(i => i.VariantId!.Value).Distinct().ToList();
        var products = variantIds.Count == 0 ? new Dictionary<Guid, (Guid ProductId, string Slug)>()
            : (await db.ProductVariants.AsNoTracking().Where(v => variantIds.Contains(v.Id) && v.Product != null).Select(v => new { v.Id, ProductId = v.Product!.Id, v.Product.Slug }).ToListAsync(ct))
                .ToDictionary(x => x.Id, x => (x.ProductId, x.Slug));

        return new OrderDto(o.Id, o.OrderNumber, o.Status, o.PaymentStatus, o.PlacedAt, o.CustomerName, o.Phone, o.Email, o.ShippingAddress, o.WardName, o.ProvinceName, o.Note,
            o.Subtotal, o.DiscountTotal, o.ShippingFee, o.GrandTotal, o.CouponCode,
            o.Items.Select(i => new OrderItemDto(i.Id, i.ProductName, i.VariantName, i.Sku, i.UnitPrice, i.Quantity, i.LineTotal, i.ImageUrl,
                i.VariantId is { } vid && products.TryGetValue(vid, out var pr) ? pr.ProductId : null, i.VariantId is { } vid2 && products.TryGetValue(vid2, out var pr2) ? pr2.Slug : null)).ToList(),
            o.History.OrderBy(h => h.ChangedAt).Select(h => new OrderHistoryDto(h.FromStatus, h.ToStatus, h.Note, h.ChangedAt)).ToList(),
            o.Payments.Select(p => new OrderPaymentDto(p.Method, p.Provider, p.Amount, p.Status, p.PaidAt)).ToList(),
            bankInfo, OrderStateMachine.NextOf(o.Status), o.Status == OrderStatus.Pending);
    }

    public IQueryable<Order> WithDetails(IQueryable<Order> query) => query.Include(o => o.Items).Include(o => o.History).Include(o => o.Payments);

    public static OrderListItemDto ToListItem(Order o) => new(o.Id, o.OrderNumber, o.Status, o.PaymentStatus, o.PlacedAt, o.GrandTotal, o.Items.Sum(i => i.Quantity),
        o.Items.OrderBy(i => i.ProductName).Select(i => i.ProductName).FirstOrDefault(), o.Items.Select(i => i.ImageUrl).FirstOrDefault(i => i != null));
}
