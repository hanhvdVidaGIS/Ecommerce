using System.Net;
using Ccp.Tests.Infrastructure;

namespace Ccp.Tests;

public sealed class LowLimitApiFactory : ApiFactory
{
    protected override int AuthPerMinute => 3;
    protected override int CheckoutPerMinute => 3;
}

public class RateLimitTests(LowLimitApiFactory factory) : IClassFixture<LowLimitApiFactory>
{
    [Fact]
    public async Task Auth_endpoints_return_429_in_standard_envelope_after_threshold()
    {
        var client = factory.NewClient();
        for (var i = 0; i < 3; i++)
            Assert.Equal(HttpStatusCode.Unauthorized, (await client.LoginAsync("nobody@test.local", "WrongPass123")).Status);

        var limited = await client.LoginAsync("nobody@test.local", "WrongPass123");

        Assert.Equal(HttpStatusCode.TooManyRequests, limited.Status);
        Assert.False(limited.Success);
        Assert.Equal("rate_limited", limited.ErrorCode);
    }

    [Fact]
    public async Task Order_tracking_and_checkout_share_a_per_ip_limit_so_order_numbers_cannot_be_guessed_quickly()
    {
        var client = factory.NewClient();
        for (var i = 0; i < 3; i++)
            Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsync("/api/orders/track", new { orderNumber = "OD000000-AAAAA", phone = "0901234567" })).Status);

        var limited = await client.PostAsync("/api/orders/track", new { orderNumber = "OD000000-AAAAA", phone = "0901234567" });
        Assert.Equal(HttpStatusCode.TooManyRequests, limited.Status);
        Assert.Equal("rate_limited", limited.ErrorCode);
        Assert.Equal(HttpStatusCode.TooManyRequests, (await client.PostAsync("/api/orders/checkout", new { })).Status);
    }

    [Fact]
    public async Task Health_endpoint_is_not_rate_limited_by_auth_policy()
    {
        var client = factory.NewClient();
        for (var i = 0; i < 10; i++) Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/health")).Status);
    }
}
