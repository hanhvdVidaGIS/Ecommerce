namespace Ccp.Domain.Common;

public abstract class Entity
{
    public Guid Id { get; set; } = Guid.CreateVersion7();
}

public abstract class AuditableEntity : Entity
{
    public DateTime CreatedAt { get; set; }
    public Guid? CreatedBy { get; set; }
    public DateTime? UpdatedAt { get; set; }
    public Guid? UpdatedBy { get; set; }
}

public interface ISoftDelete
{
    bool IsDeleted { get; set; }
    DateTime? DeletedAt { get; set; }
}

public abstract class SoftDeletableEntity : AuditableEntity, ISoftDelete
{
    public bool IsDeleted { get; set; }
    public DateTime? DeletedAt { get; set; }
}

/// <summary>Thông tin SEO, ánh xạ thành cột của Product, Category, Page, Post.</summary>
public class SeoMeta
{
    public string? MetaTitle { get; set; }
    public string? MetaDescription { get; set; }
    public string? Keywords { get; set; }
    public Guid? OgImageMediaId { get; set; }
    public string? CanonicalUrl { get; set; }
    public bool NoIndex { get; set; }
}
