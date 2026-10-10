using System.Net;
using Ccp.Tests.Infrastructure;

namespace Ccp.Tests;

[Collection(ApiCollection.Name)]
public class HealthTests(ApiFactory factory)
{
    [Fact]
    public async Task Health_returns_ok_with_status_field()
    {
        var response = await factory.NewClient().GetAsync("/health");

        Assert.Equal(HttpStatusCode.OK, response.Status);
        Assert.Equal("ok", response.Body.GetProperty("status").GetString());
    }

    [Fact]
    public async Task Unknown_route_returns_not_found()
    {
        var response = await factory.NewClient().GetAsync("/khong-ton-tai");

        Assert.Equal(HttpStatusCode.NotFound, response.Status);
    }
}
