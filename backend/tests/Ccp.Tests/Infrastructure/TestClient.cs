using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Ccp.Tests.Infrastructure;

namespace Ccp.Tests.Infrastructure;

public sealed record ApiResult(HttpStatusCode Status, JsonElement Body)
{
    public bool Success => Body.ValueKind == JsonValueKind.Object && Body.TryGetProperty("success", out var s) && s.GetBoolean();
    public string? ErrorCode => Body.ValueKind == JsonValueKind.Object && Body.TryGetProperty("error", out var e) && e.ValueKind == JsonValueKind.Object
        ? e.GetProperty("code").GetString() : null;
    public JsonElement Data => Body.GetProperty("data");
    public JsonElement Meta => Body.GetProperty("meta");
}

/// <summary>
/// Client kiểm thử mô phỏng trình duyệt: giữ cookie, tự gắn tiêu đề CSRF cho yêu cầu ghi
/// (tắt bằng sendCsrf=false để thử âm).
/// </summary>
public sealed class TestClient(HttpClient http)
{
    private readonly Dictionary<string, string> _cookies = new();
    public IReadOnlyDictionary<string, string> Cookies => _cookies;

    public static JsonSerializerOptions Json { get; } = new(JsonSerializerDefaults.Web);

    public Task<ApiResult> GetAsync(string url) => SendAsync(HttpMethod.Get, url, null);
    public Task<ApiResult> PostAsync(string url, object? body = null, bool sendCsrf = true) => SendAsync(HttpMethod.Post, url, body, sendCsrf);
    public Task<ApiResult> PutAsync(string url, object? body = null, bool sendCsrf = true) => SendAsync(HttpMethod.Put, url, body, sendCsrf);
    public Task<ApiResult> DeleteAsync(string url, bool sendCsrf = true) => SendAsync(HttpMethod.Delete, url, null, sendCsrf);

    public async Task<ApiResult> SendAsync(HttpMethod method, string url, object? body, bool sendCsrf = true, HttpContent? content = null,
        IReadOnlyDictionary<string, string>? headers = null)
    {
        using var req = new HttpRequestMessage(method, url);
        if (content is not null) req.Content = content;
        else if (body is not null) req.Content = JsonContent.Create(body, options: Json);
        if (_cookies.Count > 0) req.Headers.Add("Cookie", string.Join("; ", _cookies.Select(c => $"{c.Key}={c.Value}")));
        if (sendCsrf && method != HttpMethod.Get && _cookies.TryGetValue("ccp_csrf", out var csrf)) req.Headers.Add("X-CSRF-Token", csrf);

        if (headers is not null) foreach (var (k, v) in headers) req.Headers.TryAddWithoutValidation(k, v);

        using var res = await http.SendAsync(req);
        CaptureCookies(res);
        var text = await res.Content.ReadAsStringAsync();
        var json = string.IsNullOrWhiteSpace(text) ? default : ParseOrDefault(text);
        return new ApiResult(res.StatusCode, json);
    }

    public void SetCookie(string name, string value) => _cookies[name] = value;
    public void RemoveCookie(string name) => _cookies.Remove(name);

    public async Task<ApiResult> LoginAsync(string email, string password)
    {
        var r = await PostAsync("/api/auth/login", new { email, password }, sendCsrf: false);
        return r;
    }

    public Task<ApiResult> LoginAdminAsync() => LoginAsync(TestSecrets.AdminEmail, TestSecrets.AdminPassword);

    private void CaptureCookies(HttpResponseMessage res)
    {
        if (!res.Headers.TryGetValues("Set-Cookie", out var values)) return;
        foreach (var header in values)
        {
            var first = header.Split(';')[0];
            var idx = first.IndexOf('=');
            if (idx <= 0) continue;
            var name = first[..idx]; var value = first[(idx + 1)..];
            if (header.Contains("expires=Thu, 01 Jan 1970", StringComparison.OrdinalIgnoreCase) || value.Length == 0) _cookies.Remove(name);
            else _cookies[name] = value;
        }
    }

    private static JsonElement ParseOrDefault(string text)
    {
        try { return JsonDocument.Parse(text).RootElement.Clone(); }
        catch (JsonException) { return default; }
    }
}
