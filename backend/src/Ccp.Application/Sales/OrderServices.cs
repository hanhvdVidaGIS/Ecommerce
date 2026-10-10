using Ccp.Application.Abstractions;
using Ccp.Application.Common;
using Ccp.Domain.Entities;
using Ccp.Domain.Enums;
using FluentValidation;
using Microsoft.EntityFrameworkCore;

namespace Ccp.Application.Sales;

/// <summary>Đơn hàng phía khách: xem đơn của tôi, tra cứu bằng mã đơn + số điện thoại, tự huỷ khi đơn còn chờ xác nhận.</summary>
public class CustomerOrderService(IAppDbContext db, OrderMapper mapper, OrderWorkflowService workflow, ICurrentUser user)
{
    public async Task<PagedResult<OrderListItemDto>> MineAsync(PageRequest page, CancellationToken ct = default)
    {
        var uid = user.UserId ?? throw AppException.Unauthorized();
        var query = db.Orders.AsNoTracking().Where(o => o.UserId == uid).OrderByDescending(o => o.PlacedAt).Include(o => o.Items);
        var total = await query.CountAsync(ct);
        var rows = await query.Skip((page.Page - 1) * page.PageSize).Take(page.PageSize).ToListAsync(ct);
        return new PagedResult<OrderListItemDto>(rows.Select(OrderMapper.ToListItem).ToList(), page.Page, page.PageSize, total);
    }

    public async Task<OrderDto> GetMineAsync(string orderNumber, CancellationToken ct = default)
    {
        var uid = user.UserId ?? throw AppException.Unauthorized();
        var order = await mapper.WithDetails(db.Orders.AsNoTracking()).FirstOrDefaultAsync(o => o.OrderNumber == orderNumber && o.UserId == uid, ct)
            ?? throw AppException.NotFound("đơn hàng");
        return await mapper.ToDtoAsync(order, ct);
    }

    /// <summary>Báo "không tìm thấy" cho cả hai trường hợp sai mã và sai số điện thoại để không lộ việc mã đơn có tồn tại.</summary>
    public async Task<OrderDto> TrackAsync(TrackOrderRequest req, CancellationToken ct = default)
    {
        var phone = PhoneRules.Normalize(req.Phone);
        var number = req.OrderNumber.Trim().ToUpperInvariant();
        var order = phone is null ? null : await mapper.WithDetails(db.Orders.AsNoTracking()).FirstOrDefaultAsync(o => o.OrderNumber == number && o.Phone == phone, ct);
        return order is null ? throw AppException.NotFound("đơn hàng với thông tin đã nhập") : await mapper.ToDtoAsync(order, ct);
    }

    public async Task<OrderDto> CancelMineAsync(string orderNumber, string? reason, CancellationToken ct = default)
    {
        var uid = user.UserId ?? throw AppException.Unauthorized();
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var order = await mapper.WithDetails(db.Orders).FirstOrDefaultAsync(o => o.OrderNumber == orderNumber && o.UserId == uid, ct) ?? throw AppException.NotFound("đơn hàng");
        if (order.Status != OrderStatus.Pending) throw new AppException("cannot_cancel", "Chỉ huỷ được đơn đang chờ xác nhận. Vui lòng liên hệ cửa hàng.", 409);
        await workflow.ChangeStatusAsync(order, OrderStatus.Cancelled, string.IsNullOrWhiteSpace(reason) ? "Khách huỷ đơn" : $"Khách huỷ đơn: {reason.Trim()}", uid, ct);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return await mapper.ToDtoAsync(order, ct);
    }
}

// ---------- quản trị đơn hàng ----------
public class OrderQuery : PageRequest
{
    public OrderStatus? Status { get; set; }
    public PaymentStatus? PaymentStatus { get; set; }
    public PaymentMethod? PaymentMethod { get; set; }
    public DateTime? From { get; set; }
    public DateTime? To { get; set; }
}

public sealed record AdminOrderListItemDto(Guid Id, string OrderNumber, OrderStatus Status, PaymentStatus PaymentStatus, DateTime PlacedAt, string CustomerName, string Phone, decimal GrandTotal, int ItemCount, PaymentMethod? PaymentMethod);
public sealed record ChangeOrderStatusRequest(OrderStatus Status, string? Note);
public sealed record OrderNoteRequest(string Note);

public sealed class ChangeOrderStatusRequestValidator : AbstractValidator<ChangeOrderStatusRequest>
{
    public ChangeOrderStatusRequestValidator()
    {
        RuleFor(x => x.Status).IsInEnum();
        RuleFor(x => x.Note).MaximumLength(500);
    }
}

public sealed class OrderNoteRequestValidator : AbstractValidator<OrderNoteRequest>
{
    public OrderNoteRequestValidator() => RuleFor(x => x.Note).NotEmpty().MaximumLength(500);
}

public class AdminOrderService(IAppDbContext db, OrderMapper mapper, OrderWorkflowService workflow, ICurrentUser user)
{
    private static readonly IReadOnlyDictionary<string, System.Linq.Expressions.Expression<Func<Order, object?>>> Sorts = new Dictionary<string, System.Linq.Expressions.Expression<Func<Order, object?>>>
    {
        ["placedAt"] = o => o.PlacedAt, ["total"] = o => o.GrandTotal, ["orderNumber"] = o => o.OrderNumber, ["status"] = o => o.Status,
    };

    public async Task<PagedResult<AdminOrderListItemDto>> ListAsync(OrderQuery q, CancellationToken ct = default)
    {
        var query = db.Orders.AsNoTracking().AsQueryable();
        if (q.Status is { } st) query = query.Where(o => o.Status == st);
        if (q.PaymentStatus is { } ps) query = query.Where(o => o.PaymentStatus == ps);
        if (q.PaymentMethod is { } pm) query = query.Where(o => o.Payments.Any(p => p.Method == pm));
        if (q.From is { } from) query = query.Where(o => o.PlacedAt >= from.ToUniversalTime());
        if (q.To is { } to) query = query.Where(o => o.PlacedAt < to.ToUniversalTime());
        if (!string.IsNullOrWhiteSpace(q.Q))
        {
            var like = SearchText.LikePattern(SearchText.Fold(q.Q));
            query = query.Where(o => EF.Functions.Like(o.OrderNumber.ToLower(), like, "\\") || EF.Functions.Like(o.Phone, like, "\\")
                || EF.Functions.Like(SqlFunctions.Unaccent(o.CustomerName.ToLower()), like, "\\"));
        }
        query = query.ApplySort(q.Sort, Sorts, "placedAt:desc");
        var total = await query.CountAsync(ct);
        var rows = await query.Skip((q.Page - 1) * q.PageSize).Take(q.PageSize)
            .Select(o => new AdminOrderListItemDto(o.Id, o.OrderNumber, o.Status, o.PaymentStatus, o.PlacedAt, o.CustomerName, o.Phone, o.GrandTotal, o.Items.Sum(i => i.Quantity),
                o.Payments.Select(p => (PaymentMethod?)p.Method).FirstOrDefault())).ToListAsync(ct);
        return new PagedResult<AdminOrderListItemDto>(rows, q.Page, q.PageSize, total);
    }

    public async Task<OrderDto> GetAsync(Guid id, CancellationToken ct = default)
    {
        var order = await mapper.WithDetails(db.Orders.AsNoTracking()).FirstOrDefaultAsync(o => o.Id == id, ct) ?? throw AppException.NotFound("đơn hàng");
        return await mapper.ToDtoAsync(order, ct);
    }

    public async Task<OrderDto> ChangeStatusAsync(Guid id, ChangeOrderStatusRequest req, CancellationToken ct = default)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var order = await mapper.WithDetails(db.Orders).FirstOrDefaultAsync(o => o.Id == id, ct) ?? throw AppException.NotFound("đơn hàng");
        await workflow.ChangeStatusAsync(order, req.Status, req.Note, user.UserId, ct);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return await mapper.ToDtoAsync(order, ct);
    }

    public async Task<OrderDto> MarkPaidAsync(Guid id, CancellationToken ct = default)
    {
        var order = await mapper.WithDetails(db.Orders).FirstOrDefaultAsync(o => o.Id == id, ct) ?? throw AppException.NotFound("đơn hàng");
        workflow.MarkPaid(order, user.UserId);
        await db.SaveChangesAsync(ct);
        return await mapper.ToDtoAsync(order, ct);
    }

    /// <summary>Ghi chú nội bộ được lưu vào lịch sử trạng thái (từ trạng thái hiện tại sang chính nó), không đổi trạng thái đơn.</summary>
    public async Task<OrderDto> AddNoteAsync(Guid id, OrderNoteRequest req, CancellationToken ct = default)
    {
        var order = await mapper.WithDetails(db.Orders).FirstOrDefaultAsync(o => o.Id == id, ct) ?? throw AppException.NotFound("đơn hàng");
        db.OrderStatusHistories.Add(new OrderStatusHistory { OrderId = order.Id, FromStatus = order.Status, ToStatus = order.Status, Note = req.Note.Trim(), ChangedBy = user.UserId, ChangedAt = DateTime.UtcNow });
        await db.SaveChangesAsync(ct);
        order = await mapper.WithDetails(db.Orders.AsNoTracking()).FirstAsync(o => o.Id == id, ct);
        return await mapper.ToDtoAsync(order, ct);
    }
}
