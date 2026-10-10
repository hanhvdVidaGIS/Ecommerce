using System.Text.Json;
using Ccp.Application.Abstractions;
using Ccp.Application.Common;
using Ccp.Domain.Entities;
using Ccp.Domain.Enums;
using FluentValidation;
using Microsoft.EntityFrameworkCore;

namespace Ccp.Application.Content;

public sealed record HomepageSectionAdminDto(Guid Id, HomepageSectionType Type, string? Title, string? Subtitle, JsonElement Config, bool IsActive, int SortOrder);
public sealed record SaveHomepageSectionRequest(HomepageSectionType Type, string? Title, string? Subtitle, JsonElement? Config, bool IsActive, int SortOrder);

public sealed class SaveHomepageSectionRequestValidator : AbstractValidator<SaveHomepageSectionRequest>
{
    public SaveHomepageSectionRequestValidator()
    {
        RuleFor(x => x.Type).IsInEnum();
        RuleFor(x => x.Title).MaximumLength(200);
        RuleFor(x => x.Subtitle).MaximumLength(500);
        RuleFor(x => x.Config).Must(c => c is null || c.Value.ValueKind is JsonValueKind.Object or JsonValueKind.Undefined or JsonValueKind.Null)
            .WithMessage("Cấu hình section phải là một đối tượng JSON.");
    }
}

public class HomepageSectionService(IAppDbContext db, ISiteCache cache)
{
    private const int MaxConfigBytes = 20_000;

    public async Task<IReadOnlyList<HomepageSectionAdminDto>> ListAsync(CancellationToken ct = default) =>
        (await db.HomepageSections.AsNoTracking().OrderBy(s => s.SortOrder).ThenBy(s => s.CreatedAt).ToListAsync(ct)).Select(ToDto).ToList();

    public async Task<HomepageSectionAdminDto> GetAsync(Guid id, CancellationToken ct = default) =>
        ToDto(await db.HomepageSections.AsNoTracking().SingleOrDefaultAsync(s => s.Id == id, ct) ?? throw AppException.NotFound("section"));

    public async Task<HomepageSectionAdminDto> CreateAsync(SaveHomepageSectionRequest req, CancellationToken ct = default)
    {
        var section = new HomepageSection();
        Apply(section, req);
        db.HomepageSections.Add(section);
        await db.SaveChangesAsync(ct);
        cache.InvalidateAll();
        return ToDto(section);
    }

    public async Task<HomepageSectionAdminDto> UpdateAsync(Guid id, SaveHomepageSectionRequest req, CancellationToken ct = default)
    {
        var section = await db.HomepageSections.SingleOrDefaultAsync(s => s.Id == id, ct) ?? throw AppException.NotFound("section");
        Apply(section, req);
        await db.SaveChangesAsync(ct);
        cache.InvalidateAll();
        return ToDto(section);
    }

    public async Task DeleteAsync(Guid id, CancellationToken ct = default)
    {
        var section = await db.HomepageSections.SingleOrDefaultAsync(s => s.Id == id, ct) ?? throw AppException.NotFound("section");
        db.HomepageSections.Remove(section);
        await db.SaveChangesAsync(ct);
        cache.InvalidateAll();
    }

    /// <summary>Đặt thứ tự mới cho toàn bộ danh sách section (kéo-thả).</summary>
    public async Task ReorderAsync(IReadOnlyList<SortItem> items, CancellationToken ct = default)
    {
        var ids = items.Select(i => i.Id).ToList();
        var sections = await db.HomepageSections.Where(s => ids.Contains(s.Id)).ToListAsync(ct);
        if (sections.Count != ids.Distinct().Count()) throw AppException.NotFound("section");
        foreach (var item in items) sections.Single(s => s.Id == item.Id).SortOrder = item.SortOrder;
        await db.SaveChangesAsync(ct);
        cache.InvalidateAll();
    }

    private static void Apply(HomepageSection s, SaveHomepageSectionRequest req)
    {
        var json = req.Config is { ValueKind: JsonValueKind.Object } c ? c.GetRawText() : "{}";
        if (json.Length > MaxConfigBytes) throw AppException.Validation("Cấu hình section quá lớn.", new ErrorDetail("config", $"Tối đa {MaxConfigBytes} ký tự."));
        s.Type = req.Type;
        s.Title = string.IsNullOrWhiteSpace(req.Title) ? null : req.Title.Trim();
        s.Subtitle = string.IsNullOrWhiteSpace(req.Subtitle) ? null : req.Subtitle.Trim();
        s.ConfigJson = json;
        s.IsActive = req.IsActive;
        s.SortOrder = req.SortOrder;
    }

    private static HomepageSectionAdminDto ToDto(HomepageSection s)
    {
        using var doc = JsonDocument.Parse(string.IsNullOrWhiteSpace(s.ConfigJson) ? "{}" : s.ConfigJson);
        return new HomepageSectionAdminDto(s.Id, s.Type, s.Title, s.Subtitle, doc.RootElement.Clone(), s.IsActive, s.SortOrder);
    }
}
