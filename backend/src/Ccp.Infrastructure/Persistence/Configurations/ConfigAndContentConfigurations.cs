using Ccp.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Ccp.Infrastructure.Persistence.Configurations;

internal static class ConfigExtensions
{
    public const string NotDeleted = "is_deleted = false";

    /// <summary>Ràng buộc duy nhất chỉ xét các bản ghi chưa xoá mềm, để dùng lại mã sau khi xoá.</summary>
    public static IndexBuilder<T> UniqueAmongActive<T>(this EntityTypeBuilder<T> b, System.Linq.Expressions.Expression<Func<T, object?>> columns)
        where T : class => b.HasIndex(columns).IsUnique().HasFilter(NotDeleted);
}

internal class WebsiteSettingConfig : IEntityTypeConfiguration<WebsiteSetting>
{
    public void Configure(EntityTypeBuilder<WebsiteSetting> b)
    {
        b.Property(x => x.Key).HasMaxLength(100).IsRequired();
        b.Property(x => x.Group).HasMaxLength(50).IsRequired();
        b.HasIndex(x => x.Key).IsUnique();
        b.HasIndex(x => x.Group);
    }
}

internal class BusinessTypeConfig : IEntityTypeConfiguration<BusinessType>
{
    public void Configure(EntityTypeBuilder<BusinessType> b)
    {
        b.Property(x => x.Code).HasMaxLength(50).IsRequired();
        b.Property(x => x.Name).HasMaxLength(100).IsRequired();
        b.Property(x => x.PresetJson).HasColumnType("jsonb");
        b.HasIndex(x => x.Code).IsUnique();
    }
}

internal class MenuConfig : IEntityTypeConfiguration<Menu>
{
    public void Configure(EntityTypeBuilder<Menu> b)
    {
        b.Property(x => x.Code).HasMaxLength(50).IsRequired();
        b.Property(x => x.Name).HasMaxLength(100).IsRequired();
        b.UniqueAmongActive(x => x.Code);
    }
}

internal class MenuItemConfig : IEntityTypeConfiguration<MenuItem>
{
    public void Configure(EntityTypeBuilder<MenuItem> b)
    {
        b.Property(x => x.Title).HasMaxLength(200).IsRequired();
        b.Property(x => x.TargetType).HasMaxLength(20).IsRequired();
        b.Property(x => x.Url).HasMaxLength(500);
        b.HasOne(x => x.Menu).WithMany(m => m.Items).HasForeignKey(x => x.MenuId).OnDelete(DeleteBehavior.Cascade);
        b.HasOne(x => x.Parent).WithMany().HasForeignKey(x => x.ParentId).OnDelete(DeleteBehavior.Restrict);
        b.HasIndex(x => new { x.MenuId, x.SortOrder });
    }
}

internal class BannerConfig : IEntityTypeConfiguration<Banner>
{
    public void Configure(EntityTypeBuilder<Banner> b)
    {
        b.Property(x => x.Title).HasMaxLength(200).IsRequired();
        b.Property(x => x.Subtitle).HasMaxLength(500);
        b.Property(x => x.ButtonText).HasMaxLength(100);
        b.Property(x => x.ButtonUrl).HasMaxLength(500);
        b.Property(x => x.Placement).HasMaxLength(30).IsRequired();
        b.Property(x => x.Status).HasConversion<string>().HasMaxLength(20);
        b.HasOne(x => x.DesktopMedia).WithMany().HasForeignKey(x => x.DesktopMediaId).OnDelete(DeleteBehavior.SetNull);
        b.HasOne(x => x.MobileMedia).WithMany().HasForeignKey(x => x.MobileMediaId).OnDelete(DeleteBehavior.SetNull);
        b.HasIndex(x => new { x.Placement, x.Status, x.SortOrder });
    }
}

internal class HomepageSectionConfig : IEntityTypeConfiguration<HomepageSection>
{
    public void Configure(EntityTypeBuilder<HomepageSection> b)
    {
        b.Property(x => x.Type).HasConversion<string>().HasMaxLength(40);
        b.Property(x => x.Title).HasMaxLength(200);
        b.Property(x => x.Subtitle).HasMaxLength(500);
        b.Property(x => x.ConfigJson).HasColumnType("jsonb");
        b.HasIndex(x => x.SortOrder);
    }
}

internal class PageConfig : IEntityTypeConfiguration<Page>
{
    public void Configure(EntityTypeBuilder<Page> b)
    {
        b.Property(x => x.Title).HasMaxLength(200).IsRequired();
        b.Property(x => x.Slug).HasMaxLength(200).IsRequired();
        b.Property(x => x.Status).HasConversion<string>().HasMaxLength(20);
        b.OwnsOne(x => x.Seo);
        b.UniqueAmongActive(x => x.Slug);
    }
}

internal class PostConfig : IEntityTypeConfiguration<Post>
{
    public void Configure(EntityTypeBuilder<Post> b)
    {
        b.Property(x => x.Title).HasMaxLength(200).IsRequired();
        b.Property(x => x.Slug).HasMaxLength(200).IsRequired();
        b.Property(x => x.Summary).HasMaxLength(1000);
        b.Property(x => x.Status).HasConversion<string>().HasMaxLength(20);
        b.OwnsOne(x => x.Seo);
        b.UniqueAmongActive(x => x.Slug);
        b.HasIndex(x => new { x.Status, x.PublishedAt });
    }
}

internal class MediaConfig : IEntityTypeConfiguration<Media>
{
    public void Configure(EntityTypeBuilder<Media> b)
    {
        b.Property(x => x.StorageKey).HasMaxLength(300).IsRequired();
        b.Property(x => x.Provider).HasMaxLength(30).IsRequired();
        b.Property(x => x.FileName).HasMaxLength(255).IsRequired();
        b.Property(x => x.MimeType).HasMaxLength(100).IsRequired();
        b.Property(x => x.Kind).HasMaxLength(20).IsRequired();
        b.Property(x => x.Folder).HasMaxLength(100);
        b.Property(x => x.AltText).HasMaxLength(300);
        b.UniqueAmongActive(x => new { x.Provider, x.StorageKey });
        b.HasIndex(x => new { x.Kind, x.Folder });
    }
}

internal class NewsletterSubscriberConfig : IEntityTypeConfiguration<NewsletterSubscriber>
{
    public void Configure(EntityTypeBuilder<NewsletterSubscriber> b)
    {
        b.Property(x => x.Email).HasMaxLength(255).IsRequired();
        b.HasIndex(x => x.Email).IsUnique();
    }
}
