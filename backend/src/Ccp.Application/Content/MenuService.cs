using Ccp.Application.Abstractions;
using Ccp.Application.Common;
using Ccp.Domain.Entities;
using FluentValidation;
using Microsoft.EntityFrameworkCore;

namespace Ccp.Application.Content;

public static class MenuTargetTypes
{
    public const string Category = "Category";
    public const string Page = "Page";
    public const string Url = "Url";
    public static readonly IReadOnlyList<string> All = [Category, Page, Url];
}

public sealed record MenuItemEditDto(Guid? Id, string Title, string TargetType, Guid? TargetId, string? Url, bool IsActive, IReadOnlyList<MenuItemEditDto>? Children);
public sealed record MenuAdminDto(Guid Id, string Code, string Name, IReadOnlyList<MenuItemEditDto> Items);
public sealed record MenuListItemDto(Guid Id, string Code, string Name, int ItemCount);
public sealed record CreateMenuRequest(string Code, string Name);
public sealed record SaveMenuRequest(string Name, IReadOnlyList<MenuItemEditDto> Items);

public sealed class CreateMenuRequestValidator : AbstractValidator<CreateMenuRequest>
{
    public CreateMenuRequestValidator()
    {
        RuleFor(x => x.Code).NotEmpty().MaximumLength(50).Matches("^[a-z][a-z0-9-]*$").WithMessage("Mã menu gồm chữ thường, số, gạch ngang.");
        RuleFor(x => x.Name).NotEmpty().MaximumLength(100);
    }
}

public sealed class SaveMenuRequestValidator : AbstractValidator<SaveMenuRequest>
{
    public SaveMenuRequestValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Items).NotNull();
    }
}

public class MenuService(IAppDbContext db, ISiteCache cache)
{
    public const int MaxDepth = 3;
    public const int MaxItems = 100;

    public async Task<IReadOnlyList<MenuListItemDto>> ListAsync(CancellationToken ct = default)
    {
        var counts = await db.MenuItems.AsNoTracking().GroupBy(i => i.MenuId).Select(g => new { Id = g.Key, N = g.Count() }).ToDictionaryAsync(x => x.Id, x => x.N, ct);
        return (await db.Menus.AsNoTracking().OrderBy(m => m.Code).ToListAsync(ct)).Select(m => new MenuListItemDto(m.Id, m.Code, m.Name, counts.GetValueOrDefault(m.Id))).ToList();
    }

    public async Task<MenuAdminDto> GetAsync(Guid id, CancellationToken ct = default)
    {
        var menu = await db.Menus.AsNoTracking().SingleOrDefaultAsync(m => m.Id == id, ct) ?? throw AppException.NotFound("menu");
        var items = await db.MenuItems.AsNoTracking().Where(i => i.MenuId == id).OrderBy(i => i.SortOrder).ToListAsync(ct);
        MenuItemEditDto Build(MenuItem i) => new(i.Id, i.Title, i.TargetType, i.TargetId, i.Url, i.IsActive, items.Where(c => c.ParentId == i.Id).Select(Build).ToList());
        return new MenuAdminDto(menu.Id, menu.Code, menu.Name, items.Where(i => i.ParentId == null).Select(Build).ToList());
    }

    public async Task<MenuAdminDto> CreateAsync(CreateMenuRequest req, CancellationToken ct = default)
    {
        if (await db.Menus.AnyAsync(m => m.Code == req.Code, ct)) throw AppException.Conflict("Mã menu đã tồn tại.", "code_taken");
        var menu = new Menu { Code = req.Code, Name = req.Name.Trim() };
        db.Menus.Add(menu);
        await db.SaveChangesAsync(ct);
        cache.InvalidateAll();
        return await GetAsync(menu.Id, ct);
    }

    /// <summary>Thay toàn bộ cây mục của menu. Mục có Id được giữ, mục không còn thì xoá, mục mới thì tạo.</summary>
    public async Task<MenuAdminDto> SaveAsync(Guid id, SaveMenuRequest req, CancellationToken ct = default)
    {
        var menu = await db.Menus.SingleOrDefaultAsync(m => m.Id == id, ct) ?? throw AppException.NotFound("menu");
        var existing = await db.MenuItems.Where(i => i.MenuId == id).ToListAsync(ct);
        await ValidateAsync(req.Items, ct);

        menu.Name = req.Name.Trim();
        var keep = new HashSet<Guid>();
        var created = new HashSet<Guid>();
        void Apply(IReadOnlyList<MenuItemEditDto> nodes, Guid? parentId)
        {
            var order = 0;
            foreach (var n in nodes)
            {
                order += 10;
                var item = n.Id is { } itemId ? existing.FirstOrDefault(e => e.Id == itemId) : null;
                if (n.Id is not null && item is null) throw AppException.Validation("Mục menu không thuộc menu này.", new ErrorDetail("items", "Mã mục không hợp lệ."));
                if (item is null) { item = new MenuItem { MenuId = id }; db.MenuItems.Add(item); existing.Add(item); created.Add(item.Id); }
                if (!keep.Add(item.Id)) throw AppException.Validation("Mục menu bị lặp.", new ErrorDetail("items", "Lặp mã mục."));
                item.Title = n.Title.Trim(); item.TargetType = n.TargetType; item.IsActive = n.IsActive; item.SortOrder = order; item.ParentId = parentId;
                item.TargetId = n.TargetType == MenuTargetTypes.Url ? null : n.TargetId;
                item.Url = n.TargetType == MenuTargetTypes.Url ? n.Url?.Trim() : null;
                Apply(n.Children ?? [], item.Id);
            }
        }
        Apply(req.Items, null);
        foreach (var gone in existing.Where(e => !keep.Contains(e.Id) && !created.Contains(e.Id)).ToList()) db.MenuItems.Remove(gone);
        await db.SaveChangesAsync(ct);
        cache.InvalidateAll();
        return await GetAsync(id, ct);
    }

    public async Task DeleteAsync(Guid id, CancellationToken ct = default)
    {
        var menu = await db.Menus.SingleOrDefaultAsync(m => m.Id == id, ct) ?? throw AppException.NotFound("menu");
        if (menu.Code is "header" or "footer") throw AppException.Conflict("Không xoá được menu hệ thống (header, footer).", "system_menu");
        db.MenuItems.RemoveRange(await db.MenuItems.Where(i => i.MenuId == id).ToListAsync(ct));
        db.Menus.Remove(menu);
        await db.SaveChangesAsync(ct);
        cache.InvalidateAll();
    }

    private async Task ValidateAsync(IReadOnlyList<MenuItemEditDto> roots, CancellationToken ct)
    {
        var flat = new List<(MenuItemEditDto Item, int Depth)>();
        void Walk(IReadOnlyList<MenuItemEditDto> nodes, int depth)
        {
            foreach (var n in nodes) { flat.Add((n, depth)); Walk(n.Children ?? [], depth + 1); }
        }
        Walk(roots, 1);
        if (flat.Count > MaxItems) throw AppException.Validation($"Menu tối đa {MaxItems} mục.", new ErrorDetail("items", "Quá nhiều mục."));
        if (flat.Any(f => f.Depth > MaxDepth)) throw AppException.Validation($"Menu tối đa {MaxDepth} cấp.", new ErrorDetail("items", "Quá sâu."));

        var errors = new List<ErrorDetail>();
        for (var i = 0; i < flat.Count; i++)
        {
            var n = flat[i].Item;
            var field = $"items[{i}]";
            if (string.IsNullOrWhiteSpace(n.Title) || n.Title.Length > 200) errors.Add(new ErrorDetail(field, "Tiêu đề bắt buộc (tối đa 200 ký tự)."));
            if (!MenuTargetTypes.All.Contains(n.TargetType)) { errors.Add(new ErrorDetail(field, "Loại liên kết không hợp lệ.")); continue; }
            if (n.TargetType == MenuTargetTypes.Url)
            {
                if (string.IsNullOrWhiteSpace(n.Url) || !LinkRules.IsSafe(n.Url)) errors.Add(new ErrorDetail(field, "Liên kết phải bắt đầu bằng / hoặc http(s)://."));
            }
            else if (n.TargetId is null) errors.Add(new ErrorDetail(field, "Cần chọn đối tượng liên kết."));
        }
        var categoryIds = flat.Where(f => f.Item.TargetType == MenuTargetTypes.Category && f.Item.TargetId != null).Select(f => f.Item.TargetId!.Value).Distinct().ToList();
        if (categoryIds.Count > 0 && await db.Categories.CountAsync(c => categoryIds.Contains(c.Id), ct) != categoryIds.Count) errors.Add(new ErrorDetail("items", "Có danh mục không tồn tại."));
        var pageIds = flat.Where(f => f.Item.TargetType == MenuTargetTypes.Page && f.Item.TargetId != null).Select(f => f.Item.TargetId!.Value).Distinct().ToList();
        if (pageIds.Count > 0 && await db.Pages.CountAsync(p => pageIds.Contains(p.Id), ct) != pageIds.Count) errors.Add(new ErrorDetail("items", "Có trang không tồn tại."));
        if (errors.Count > 0) throw AppException.Validation("Menu không hợp lệ.", errors.ToArray());
    }
}
