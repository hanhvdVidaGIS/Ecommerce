using Ccp.Domain.Common;
using Ccp.Domain.Enums;

namespace Ccp.Domain.Entities;

public class Wishlist
{
    public Guid UserId { get; set; }
    public User? User { get; set; }
    public Guid ProductId { get; set; }
    public Product? Product { get; set; }
    public DateTime CreatedAt { get; set; }
}

public class Review : SoftDeletableEntity
{
    public Guid ProductId { get; set; }
    public Product? Product { get; set; }
    public Guid UserId { get; set; }
    public User? User { get; set; }
    public Guid? OrderItemId { get; set; }
    public int Rating { get; set; }
    public string? Title { get; set; }
    public string? Content { get; set; }
    public ReviewStatus Status { get; set; } = ReviewStatus.Pending;
}

public class CustomerAddress : AuditableEntity
{
    public Guid UserId { get; set; }
    public User? User { get; set; }
    public string ReceiverName { get; set; } = "";
    public string Phone { get; set; } = "";
    public string AddressLine { get; set; } = "";
    public string? ProvinceCode { get; set; }
    public string? WardCode { get; set; }
    public bool IsDefault { get; set; }
}

public class AddressUnit : Entity
{
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    public AddressLevel Level { get; set; }
    public string? ParentCode { get; set; }
    public DateOnly? EffectiveFrom { get; set; }
    public string? Source { get; set; }
}
