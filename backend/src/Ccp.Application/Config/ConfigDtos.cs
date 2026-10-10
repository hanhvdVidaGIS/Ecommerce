using System.Text.Json;
using Ccp.Application.Common;

namespace Ccp.Application.Config;

public sealed record SettingDto(string Key, string Group, string Label, string Type, string Control, bool IsPublic, string Value, string Default);

public sealed record UpdateSettingsRequest(Dictionary<string, string?> Values);

public sealed record BusinessTypeInfoDto(string Code, string Name);

public sealed record MenuItemDto(Guid Id, string Title, string TargetType, string? Slug, string? Url, IReadOnlyList<MenuItemDto> Children);
public sealed record MenuDto(string Code, string Name, IReadOnlyList<MenuItemDto> Items);

public sealed record HomepageSectionDto(Guid Id, string Type, string? Title, string? Subtitle, JsonElement Config, int SortOrder);

public sealed record PublicBannerDto(Guid Id, string Title, string? Subtitle, MediaRefDto? DesktopImage, MediaRefDto? MobileImage,
    string? ButtonText, string? ButtonUrl, string Placement, int SortOrder);

/// <summary>Toàn bộ cấu hình công khai mà Storefront cần để dựng giao diện; không chứa khoá không công khai.</summary>
public sealed record SiteConfigDto(
    IReadOnlyDictionary<string, string> Settings,
    IReadOnlyDictionary<string, MediaRefDto?> Media,
    BusinessTypeInfoDto BusinessType,
    IReadOnlyList<MenuDto> Menus,
    IReadOnlyList<HomepageSectionDto> HomepageSections,
    IReadOnlyList<PublicBannerDto> Banners);

public sealed record BusinessTypeListItemDto(string Code, string Name, string? Description, bool IsSystem, bool IsCurrent,
    int AttributeCount, int CategoryCount);

public sealed record ApplyPresetResult(
    string BusinessType, bool DryRun, bool LabelsApplied,
    int AttributesCreated, int AttributesExisting, int ValuesCreated, int CategoriesCreated, int CategoriesExisting);
