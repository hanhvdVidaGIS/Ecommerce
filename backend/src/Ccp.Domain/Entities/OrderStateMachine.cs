using Ccp.Domain.Enums;

namespace Ccp.Domain.Entities;

/// <summary>Máy trạng thái đơn hàng (đề xuất, docs: Phụ lục B, Bảng B.2).</summary>
public static class OrderStateMachine
{
    private static readonly IReadOnlyDictionary<OrderStatus, OrderStatus[]> Transitions = new Dictionary<OrderStatus, OrderStatus[]>
    {
        [OrderStatus.Pending] = [OrderStatus.Confirmed, OrderStatus.Cancelled],
        [OrderStatus.Confirmed] = [OrderStatus.Processing, OrderStatus.Cancelled],
        [OrderStatus.Processing] = [OrderStatus.Shipping, OrderStatus.Cancelled],
        [OrderStatus.Shipping] = [OrderStatus.Completed, OrderStatus.Cancelled],
        [OrderStatus.Completed] = [OrderStatus.Refunded],
        [OrderStatus.Cancelled] = [OrderStatus.Refunded],
        [OrderStatus.Refunded] = [],
    };

    public static IReadOnlyList<OrderStatus> NextOf(OrderStatus from) => Transitions[from];

    public static bool CanTransition(OrderStatus from, OrderStatus to) => Transitions[from].Contains(to);
}
