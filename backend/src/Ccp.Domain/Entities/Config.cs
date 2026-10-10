using Ccp.Domain.Common;
using Ccp.Domain.Enums;

namespace Ccp.Domain.Entities;

public class WebsiteSetting : AuditableEntity
{
    public string Key { get; set; } = "";
    public string Value { get; set; } = "";
    public SettingValueType ValueType { get; set; }
    public string Group { get; set; } = "";
    /// <summary>false: không bao giờ xuất hiện ở API công khai.</summary>
    public bool IsPublic { get; set; }
}

public class BusinessType : AuditableEntity
{
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    public string? Description { get; set; }
    /// <summary>jsonb: nhãn, thuộc tính, danh mục gợi ý.</summary>
    public string PresetJson { get; set; } = "{}";
    public bool IsSystem { get; set; }
}

public class Menu : SoftDeletableEntity
{
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    public List<MenuItem> Items { get; set; } = [];
}

public class MenuItem : SoftDeletableEntity
{
    public Guid MenuId { get; set; }
    public Menu? Menu { get; set; }
    public Guid? ParentId { get; set; }
    public MenuItem? Parent { get; set; }
    public string Title { get; set; } = "";
    /// <summary>Category, Page hoặc Url.</summary>
    public string TargetType { get; set; } = "Url";
    public Guid? TargetId { get; set; }
    public string? Url { get; set; }
    public int SortOrder { get; set; }
    public bool IsActive { get; set; } = true;
}
