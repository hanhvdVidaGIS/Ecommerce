using Ccp.Application.Abstractions;
using Ccp.Domain.Entities;
using FluentValidation;
using Microsoft.EntityFrameworkCore;

namespace Ccp.Application.Content;

public sealed record SubscribeRequest(string Email);

public sealed class SubscribeRequestValidator : AbstractValidator<SubscribeRequest>
{
    public SubscribeRequestValidator() => RuleFor(x => x.Email).NotEmpty().EmailAddress().MaximumLength(255).WithMessage("Email không hợp lệ.");
}

/// <summary>Đăng ký nhận tin. Luôn trả về thành công dù email đã đăng ký, để không lộ email nào đã có trong danh sách.</summary>
public class NewsletterService(IAppDbContext db)
{
    public async Task SubscribeAsync(string email, CancellationToken ct = default)
    {
        var key = email.Trim().ToLowerInvariant();
        var existing = await db.NewsletterSubscribers.SingleOrDefaultAsync(s => s.Email == key, ct);
        if (existing is null) db.NewsletterSubscribers.Add(new NewsletterSubscriber { Email = key });
        else if (!existing.IsActive) existing.IsActive = true; // đăng ký lại sau khi đã huỷ
        else return;
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException)
        {
            // Hai yêu cầu cùng email đến cùng lúc: chỉ mục duy nhất từ chối yêu cầu sau; kết quả vẫn là "đã đăng ký".
        }
    }
}
