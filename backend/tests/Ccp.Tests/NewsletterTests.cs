using System.Net;
using Ccp.Tests.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Ccp.Tests;

[Collection(ApiCollection.Name)]
public class NewsletterTests(ApiFactory factory)
{
    [Fact]
    public async Task Subscribing_is_idempotent_case_insensitive_and_never_reveals_existing_emails()
    {
        var anon = factory.NewClient();
        var email = $"Tin-{Guid.NewGuid():N}@Test.Local";

        Assert.True((await anon.PostAsync("/api/public/newsletter", new { email })).Success);
        Assert.True((await anon.PostAsync("/api/public/newsletter", new { email = email.ToUpperInvariant() })).Success); // trả lời giống hệt dù đã có
        Assert.Equal(1, await factory.WithDbAsync(db => db.NewsletterSubscribers.CountAsync(s => s.Email == email.ToLowerInvariant())));
    }

    [Fact]
    public async Task Invalid_emails_are_rejected_and_unsubscribed_ones_are_reactivated()
    {
        var anon = factory.NewClient();
        foreach (var bad in new[] { "", "khong-phai-email", "a@", new string('a', 260) + "@x.com" })
            Assert.Equal(HttpStatusCode.BadRequest, (await anon.PostAsync("/api/public/newsletter", new { email = bad })).Status);

        var email = $"lai-{Guid.NewGuid():N}@test.local";
        await anon.PostAsync("/api/public/newsletter", new { email });
        await factory.WithDbAsync(db => db.NewsletterSubscribers.Where(s => s.Email == email).ExecuteUpdateAsync(s => s.SetProperty(x => x.IsActive, false)));
        Assert.True((await anon.PostAsync("/api/public/newsletter", new { email })).Success);
        Assert.True(await factory.WithDbAsync(db => db.NewsletterSubscribers.Where(s => s.Email == email).Select(s => s.IsActive).SingleAsync()));
    }
}
