using Ccp.Domain.Common;
using Ccp.Domain.Enums;

namespace Ccp.Domain.Entities;

public class Banner : SoftDeletableEntity
{
    public string Title { get; set; } = "";
    public string? Subtitle { get; set; }
    public Guid? DesktopMediaId { get; set; }
    public Media? DesktopMedia { get; set; }
    public Guid? MobileMediaId { get; set; }
    public Media? MobileMedia { get; set; }
    public string? ButtonText { get; set; }
    public string? ButtonUrl { get; set; }
    public DateTime? StartAt { get; set; }
    public DateTime? EndAt { get; set; }
    /// <summary>Vị trí hiển thị: hero, slider, promo.</summary>
    public string Placement { get; set; } = "hero";
    public PublishStatus Status { get; set; } = PublishStatus.Published;
    public int SortOrder { get; set; }
}

public class HomepageSection : SoftDeletableEntity
{
    public HomepageSectionType Type { get; set; }
    public string? Title { get; set; }
    public string? Subtitle { get; set; }
    /// <summary>jsonb: tham số riêng của từng loại section.</summary>
    public string ConfigJson { get; set; } = "{}";
    public bool IsActive { get; set; } = true;
    public int SortOrder { get; set; }
}

public class Page : SoftDeletableEntity
{
    public string Title { get; set; } = "";
    public string Slug { get; set; } = "";
    public string Content { get; set; } = "";
    public PublishStatus Status { get; set; } = PublishStatus.Draft;
    public SeoMeta Seo { get; set; } = new();
}

public class Post : SoftDeletableEntity
{
    public string Title { get; set; } = "";
    public string Slug { get; set; } = "";
    public string? Summary { get; set; }
    public string Content { get; set; } = "";
    public Guid? CoverMediaId { get; set; }
    public DateTime? PublishedAt { get; set; }
    public PublishStatus Status { get; set; } = PublishStatus.Draft;
    public SeoMeta Seo { get; set; } = new();
}

public class Media : SoftDeletableEntity
{
    public string StorageKey { get; set; } = "";
    public string Provider { get; set; } = "local";
    public string FileName { get; set; } = "";
    public string MimeType { get; set; } = "";
    public long SizeBytes { get; set; }
    public int? Width { get; set; }
    public int? Height { get; set; }
    /// <summary>image, video.</summary>
    public string Kind { get; set; } = "image";
    public string? Folder { get; set; }
    public string? AltText { get; set; }
}

public class NewsletterSubscriber : AuditableEntity
{
    public string Email { get; set; } = "";
    public DateTime? ConfirmedAt { get; set; }
    public bool IsActive { get; set; } = true;
}
