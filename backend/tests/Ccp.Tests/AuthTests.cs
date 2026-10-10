using System.Net;
using System.Text.RegularExpressions;
using Ccp.Domain.Security;
using Ccp.Infrastructure.Persistence;
using Ccp.Tests.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Ccp.Tests;

[Collection(ApiCollection.Name)]
public class AuthTests(ApiFactory factory)
{
    private const string Password = "Passw0rdOK";
    private static string NewEmail() => $"u{Guid.NewGuid():N}@test.local";

    private async Task<(TestClient Client, string Email)> RegisterAsync()
    {
        var client = factory.NewClient();
        var email = NewEmail();
        var r = await client.PostAsync("/api/auth/register", new { email, password = Password, fullName = "Nguyễn Văn A" }, sendCsrf: false);
        Assert.Equal(HttpStatusCode.OK, r.Status);
        return (client, email);
    }

    [Fact]
    public async Task Register_sets_cookies_and_returns_customer_without_permissions()
    {
        var (client, email) = await RegisterAsync();

        Assert.True(client.Cookies.ContainsKey("ccp_at"));
        Assert.True(client.Cookies.ContainsKey("ccp_rt"));
        Assert.True(client.Cookies.ContainsKey("ccp_csrf"));
        var me = await client.GetAsync("/api/auth/me");
        Assert.True(me.Success);
        Assert.Equal(email, me.Data.GetProperty("email").GetString());
        Assert.Equal(new[] { "Customer" }, me.Data.GetProperty("roles").EnumerateArray().Select(x => x.GetString()!).ToArray());
        Assert.Empty(me.Data.GetProperty("permissions").EnumerateArray());
    }

    [Fact]
    public async Task Password_is_stored_hashed_never_plain()
    {
        var (_, email) = await RegisterAsync();
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<CcpDbContext>();
        var hash = await db.Users.Where(u => u.Email == email).Select(u => u.PasswordHash).SingleAsync();

        Assert.NotEqual(Password, hash);
        Assert.DoesNotContain(Password, hash);
        Assert.True(hash.Length > 40);
    }

    [Fact]
    public async Task Register_duplicate_email_is_conflict()
    {
        var (_, email) = await RegisterAsync();
        var r = await factory.NewClient().PostAsync("/api/auth/register", new { email = email.ToUpperInvariant(), password = Password, fullName = "B" }, false);

        Assert.Equal(HttpStatusCode.Conflict, r.Status);
        Assert.Equal("email_taken", r.ErrorCode);
    }

    [Theory]
    [InlineData("short1")]
    [InlineData("nodigitsatall")]
    [InlineData("12345678901")]
    public async Task Register_weak_password_is_rejected_with_field_detail(string weak)
    {
        var r = await factory.NewClient().PostAsync("/api/auth/register", new { email = NewEmail(), password = weak, fullName = "A" }, false);

        Assert.Equal(HttpStatusCode.BadRequest, r.Status);
        Assert.Equal("validation_failed", r.ErrorCode);
        Assert.Contains(r.Body.GetProperty("error").GetProperty("details").EnumerateArray(), d => d.GetProperty("field").GetString() == "password");
    }

    [Fact]
    public async Task Login_failure_is_identical_for_unknown_email_and_wrong_password()
    {
        var (_, email) = await RegisterAsync();
        var wrongPassword = await factory.NewClient().LoginAsync(email, "WrongPass123");
        var unknownEmail = await factory.NewClient().LoginAsync(NewEmail(), "WrongPass123");

        Assert.Equal(HttpStatusCode.Unauthorized, wrongPassword.Status);
        Assert.Equal(HttpStatusCode.Unauthorized, unknownEmail.Status);
        Assert.Equal("invalid_credentials", wrongPassword.ErrorCode);
        Assert.Equal(wrongPassword.ErrorCode, unknownEmail.ErrorCode);
        Assert.Equal(wrongPassword.Body.GetProperty("error").GetProperty("message").GetString(),
            unknownEmail.Body.GetProperty("error").GetProperty("message").GetString());
    }

    [Fact]
    public async Task Account_locks_after_five_failed_logins_even_with_correct_password()
    {
        var (_, email) = await RegisterAsync();
        var client = factory.NewClient();
        for (var i = 0; i < 5; i++) Assert.Equal("invalid_credentials", (await client.LoginAsync(email, "WrongPass123")).ErrorCode);

        var locked = await client.LoginAsync(email, Password);

        Assert.Equal((HttpStatusCode)423, locked.Status);
        Assert.Equal("account_locked", locked.ErrorCode);
    }

    [Fact]
    public async Task Super_admin_is_seeded_with_every_permission()
    {
        var admin = await factory.NewAdminClientAsync();
        var me = await admin.GetAsync("/api/auth/me");

        var granted = me.Data.GetProperty("permissions").EnumerateArray().Select(p => p.GetString()!).Order().ToList();
        Assert.Equal(Permissions.All.Select(p => p.Code).Order().ToList(), granted);
    }

    [Fact]
    public async Task Refresh_rotates_token_and_reuse_of_old_token_revokes_the_whole_session()
    {
        var (client, _) = await RegisterAsync();
        var oldRefresh = client.Cookies["ccp_rt"];

        var rotated = await client.PostAsync("/api/auth/refresh");
        Assert.True(rotated.Success);
        var newRefresh = client.Cookies["ccp_rt"];
        Assert.NotEqual(oldRefresh, newRefresh);

        // Kẻ trộm dùng lại token cũ
        var thief = factory.NewClient();
        thief.SetCookie("ccp_rt", oldRefresh);
        thief.SetCookie("ccp_csrf", "x");
        var reuse = await thief.PostAsync("/api/auth/refresh");
        Assert.Equal(HttpStatusCode.Unauthorized, reuse.Status);
        Assert.Equal("refresh_reuse", reuse.ErrorCode);

        // Token mới của người dùng thật cũng bị thu hồi
        var legit = await client.PostAsync("/api/auth/refresh");
        Assert.Equal(HttpStatusCode.Unauthorized, legit.Status);
    }

    [Fact]
    public async Task Cookie_request_without_csrf_header_is_rejected_and_with_header_succeeds()
    {
        var (client, _) = await RegisterAsync();

        var withoutHeader = await client.PostAsync("/api/auth/logout", sendCsrf: false);
        Assert.Equal(HttpStatusCode.Forbidden, withoutHeader.Status);
        Assert.Equal("csrf_failed", withoutHeader.ErrorCode);

        var wrongHeader = await SendWithCsrfAsync(client, "tampered");
        Assert.Equal("csrf_failed", wrongHeader.ErrorCode);

        var withHeader = await client.PostAsync("/api/auth/logout");
        Assert.True(withHeader.Success);
    }

    private static Task<ApiResult> SendWithCsrfAsync(TestClient client, string token) =>
        client.SendAsync(HttpMethod.Post, "/api/auth/logout", null, sendCsrf: false,
            headers: new Dictionary<string, string> { ["X-CSRF-Token"] = token });

    [Fact]
    public async Task Logout_revokes_refresh_token()
    {
        var (client, _) = await RegisterAsync();
        var refresh = client.Cookies["ccp_rt"];
        await client.PostAsync("/api/auth/logout");

        var replay = factory.NewClient();
        replay.SetCookie("ccp_rt", refresh);
        replay.SetCookie("ccp_csrf", "x");
        var r = await replay.PostAsync("/api/auth/refresh");
        Assert.Equal(HttpStatusCode.Unauthorized, r.Status);
    }

    [Fact]
    public async Task Me_without_login_is_401_in_standard_envelope()
    {
        var r = await factory.NewClient().GetAsync("/api/auth/me");

        Assert.Equal(HttpStatusCode.Unauthorized, r.Status);
        Assert.False(r.Success);
        Assert.Equal("unauthorized", r.ErrorCode);
    }

    [Fact]
    public async Task Forgot_password_gives_same_response_for_known_and_unknown_email_and_reset_works_once()
    {
        var (_, email) = await RegisterAsync();
        var known = await factory.NewClient().PostAsync("/api/auth/forgot-password", new { email }, false);
        var unknown = await factory.NewClient().PostAsync("/api/auth/forgot-password", new { email = NewEmail() }, false);
        Assert.Equal(known.Status, unknown.Status);
        Assert.Equal(known.Body.ToString(), unknown.Body.ToString());

        var mail = factory.Email.Sent.Last(m => m.To == email);
        var token = Uri.UnescapeDataString(Regex.Match(mail.Body, @"token=([^""]+)""").Groups[1].Value);
        Assert.False(string.IsNullOrEmpty(token));

        var reset = await factory.NewClient().PostAsync("/api/auth/reset-password", new { token, newPassword = "BrandNew123" }, false);
        Assert.True(reset.Success);
        Assert.True((await factory.NewClient().LoginAsync(email, "BrandNew123")).Success);
        Assert.Equal("invalid_credentials", (await factory.NewClient().LoginAsync(email, Password)).ErrorCode);

        var again = await factory.NewClient().PostAsync("/api/auth/reset-password", new { token, newPassword = "AnotherOne123" }, false);
        Assert.Equal("invalid_reset_token", again.ErrorCode);
    }

    [Fact]
    public async Task Reset_password_rejects_forged_and_access_tokens()
    {
        var forged = await factory.NewClient().PostAsync("/api/auth/reset-password", new { token = "not.a.jwt", newPassword = "BrandNew123" }, false);
        Assert.Equal("invalid_reset_token", forged.ErrorCode);

        // Access token hợp lệ nhưng sai mục đích (audience khác) không dùng được để đặt lại mật khẩu.
        var (client, _) = await RegisterAsync();
        var access = client.Cookies["ccp_at"];
        var misuse = await factory.NewClient().PostAsync("/api/auth/reset-password", new { token = access, newPassword = "BrandNew123" }, false);
        Assert.Equal("invalid_reset_token", misuse.ErrorCode);
    }

    [Fact]
    public async Task Security_headers_are_present()
    {
        using var http = factory.CreateClient();
        var res = await http.GetAsync("/health");

        Assert.Equal("nosniff", res.Headers.GetValues("X-Content-Type-Options").Single());
        Assert.Equal("DENY", res.Headers.GetValues("X-Frame-Options").Single());
    }
}
