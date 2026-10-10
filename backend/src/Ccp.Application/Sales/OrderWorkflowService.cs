using Ccp.Application.Abstractions;
using Ccp.Application.Common;
using Ccp.Domain.Entities;
using Ccp.Domain.Enums;
using Ccp.Domain.Security;
using Microsoft.EntityFrameworkCore;

namespace Ccp.Application.Sales;

/// <summary>
/// Chuyển trạng thái đơn hàng theo máy trạng thái của Domain và áp các hệ quả: hoàn kho và hoàn lượt mã khi huỷ,
/// tăng số đã bán và ghi nhận thanh toán khi hoàn thành, đánh dấu hoàn tiền. Mọi thay đổi ghi lịch sử và nhật ký.
/// </summary>
public class OrderWorkflowService(IAppDbContext db, ICurrentUser user, AuditService audit, TimeProvider clock)
{
    /// <summary>Đơn phải được nạp kèm Items, Payments, History (có theo dõi thay đổi). Gọi trong giao dịch của người gọi.</summary>
    public async Task ChangeStatusAsync(Order order, OrderStatus to, string? note, Guid? byUserId, CancellationToken ct = default)
    {
        var from = order.Status;
        if (from == to) throw AppException.Conflict($"Đơn hàng đã ở trạng thái {to}.", "same_status");
        if (!OrderStateMachine.CanTransition(from, to))
            throw new AppException("invalid_transition", $"Không thể chuyển đơn từ {from} sang {to}.", 409,
                [new ErrorDetail("status", $"Trạng thái hợp lệ tiếp theo: {string.Join(", ", OrderStateMachine.NextOf(from))}.")]);
        if (to == OrderStatus.Refunded && !user.HasPermission(Permissions.OrderRefund) && byUserId is not null)
            throw AppException.Forbidden("Bạn không có quyền hoàn tiền đơn hàng.");

        var now = clock.GetUtcNow().UtcDateTime;
        switch (to)
        {
            case OrderStatus.Cancelled:
                await RestockAsync(order, ct);
                await ReleaseCouponAsync(order, ct);
                foreach (var p in order.Payments.Where(p => p.Status == PaymentStatus.Unpaid)) p.Status = PaymentStatus.Failed;
                if (order.PaymentStatus == PaymentStatus.Unpaid) order.PaymentStatus = PaymentStatus.Failed;
                break;
            case OrderStatus.Completed:
                await AddSoldAsync(order, ct);
                foreach (var p in order.Payments.Where(p => p.Status == PaymentStatus.Unpaid && p.Method == PaymentMethod.Cod)) { p.Status = PaymentStatus.Paid; p.PaidAt = now; }
                if (order.Payments.All(p => p.Status == PaymentStatus.Paid)) order.PaymentStatus = PaymentStatus.Paid;
                break;
            case OrderStatus.Refunded:
                foreach (var p in order.Payments.Where(p => p.Status == PaymentStatus.Paid)) p.Status = PaymentStatus.Refunded;
                order.PaymentStatus = PaymentStatus.Refunded;
                break;
        }

        order.Status = to;
        db.OrderStatusHistories.Add(new OrderStatusHistory { OrderId = order.Id, FromStatus = from, ToStatus = to, Note = string.IsNullOrWhiteSpace(note) ? null : note.Trim(), ChangedBy = byUserId, ChangedAt = now });
        audit.Log("order.status", nameof(Order), order.Id.ToString(), new { order.OrderNumber, from, to, note });
    }

    public void MarkPaid(Order order, Guid? byUserId)
    {
        if (order.Status is OrderStatus.Cancelled or OrderStatus.Refunded)
            throw AppException.Conflict("Đơn đã huỷ hoặc hoàn tiền nên không ghi nhận thanh toán.", "order_closed");
        var payment = order.Payments.FirstOrDefault(p => p.Status == PaymentStatus.Unpaid) ?? throw AppException.Conflict("Đơn hàng không còn khoản cần thanh toán.", "already_paid");
        payment.Status = PaymentStatus.Paid;
        payment.PaidAt = clock.GetUtcNow().UtcDateTime;
        if (order.Payments.All(p => p.Status == PaymentStatus.Paid)) order.PaymentStatus = PaymentStatus.Paid;
        audit.Log("order.paid", nameof(Order), order.Id.ToString(), new { order.OrderNumber, payment.Amount, byUserId });
    }

    private async Task RestockAsync(Order order, CancellationToken ct)
    {
        foreach (var item in order.Items.Where(i => i.VariantId is not null).OrderBy(i => i.VariantId))
        {
            var id = item.VariantId!.Value;
            var qty = item.Quantity;
            // IgnoreQueryFilters: biến thể đã xoá mềm sau khi đặt vẫn được hoàn kho để số liệu không lệch.
            await db.ProductVariants.IgnoreQueryFilters().Where(v => v.Id == id).ExecuteUpdateAsync(s => s.SetProperty(v => v.StockQuantity, v => v.StockQuantity + qty), ct);
        }
    }

    private async Task ReleaseCouponAsync(Order order, CancellationToken ct)
    {
        if (string.IsNullOrEmpty(order.CouponCode)) return;
        var code = order.CouponCode;
        await db.Coupons.IgnoreQueryFilters().Where(c => c.Code == code && c.UsedCount > 0).ExecuteUpdateAsync(s => s.SetProperty(c => c.UsedCount, c => c.UsedCount - 1), ct);
    }

    private async Task AddSoldAsync(Order order, CancellationToken ct)
    {
        foreach (var item in order.Items.Where(i => i.VariantId is not null))
        {
            var vid = item.VariantId!.Value;
            var qty = item.Quantity;
            var productId = await db.ProductVariants.IgnoreQueryFilters().Where(v => v.Id == vid).Select(v => (Guid?)v.ProductId).FirstOrDefaultAsync(ct);
            if (productId is null) continue;
            await db.Products.IgnoreQueryFilters().Where(p => p.Id == productId).ExecuteUpdateAsync(s => s.SetProperty(p => p.SoldCount, p => p.SoldCount + qty), ct);
        }
    }
}
