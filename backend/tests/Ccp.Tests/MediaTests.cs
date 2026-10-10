using System.Net;
using Ccp.Application.MediaLibrary;
using Ccp.Domain.Security;
using Ccp.Tests.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Ccp.Tests;

public sealed class SmallImageLimitFactory : ApiFactory
{
    protected override void ConfigureWebHost(Microsoft.AspNetCore.Hosting.IWebHostBuilder builder)
    {
        base.ConfigureWebHost(builder);
        builder.UseSetting("Media:MaxImageBytes", "2048");
    }
}

public class ImageInspectorTests
{
    [Fact]
    public void Detects_format_and_dimensions_from_real_bytes()
    {
        var png = ImageInspector.Detect(SampleFiles.Png());
        Assert.Equal((ImageFormat.Png, 1, 1), (png!.Value.Format, png.Value.Width, png.Value.Height));

        var gif = ImageInspector.Detect(SampleFiles.Gif());
        Assert.Equal((ImageFormat.Gif, 1, 1), (gif!.Value.Format, gif.Value.Width, gif.Value.Height));

        var jpg = ImageInspector.Detect(SampleFiles.Jpeg(320, 200));
        Assert.Equal((ImageFormat.Jpeg, 320, 200), (jpg!.Value.Format, jpg.Value.Width, jpg.Value.Height));

        var webp = ImageInspector.Detect(SampleFiles.Webp(640, 480));
        Assert.Equal((ImageFormat.Webp, 640, 480), (webp!.Value.Format, webp.Value.Width, webp.Value.Height));

        Assert.Equal(ImageFormat.Mp4, ImageInspector.Detect(SampleFiles.Mp4())!.Value.Format);
    }

    [Fact]
    public void Rejects_executables_svg_and_garbage()
    {
        Assert.Null(ImageInspector.Detect(SampleFiles.WindowsExecutable()));
        Assert.Null(ImageInspector.Detect(SampleFiles.Svg()));
        Assert.Null(ImageInspector.Detect([]));
        Assert.Null(ImageInspector.Detect([1, 2, 3]));
    }
}

[Collection(ApiCollection.Name)]
public class MediaTests(ApiFactory factory)
{
    private static string Url(ApiResult r, int index = 0) => r.Data.GetProperty("items")[index].GetProperty("url").GetString()!;
    private static Task<ApiResult> Upload(TestClient c, string? folder, params (string, string, byte[])[] files) =>
        c.SendAsync(HttpMethod.Post, "/api/admin/media", null, content: SampleFiles.Form(folder, files));

    [Fact]
    public async Task Upload_stores_file_under_guid_name_and_serves_it_back_with_nosniff()
    {
        var admin = await factory.NewAdminClientAsync();
        var r = await Upload(admin, "banner", ("logo thu.png", "image/png", SampleFiles.Png()));

        Assert.True(r.Success);
        var item = r.Data.GetProperty("items")[0];
        Assert.Equal(1, item.GetProperty("width").GetInt32());
        Assert.Equal("banner", item.GetProperty("folder").GetString());
        Assert.Empty(r.Data.GetProperty("errors").EnumerateArray());

        var key = Url(r).Replace("/uploads/", "");
        Assert.True(File.Exists(Path.Combine(factory.UploadsRoot, key)), "tệp phải nằm trong thư mục lưu trữ");
        Assert.DoesNotContain("logo", key);

        using var http = factory.CreateClient();
        var served = await http.GetAsync(Url(r));
        Assert.Equal(HttpStatusCode.OK, served.StatusCode);
        Assert.Equal(SampleFiles.Png(), await served.Content.ReadAsByteArrayAsync());
        Assert.Equal("nosniff", served.Headers.GetValues("X-Content-Type-Options").Single());
    }

    [Fact]
    public async Task Multiple_files_in_one_request_report_each_failure_separately()
    {
        var admin = await factory.NewAdminClientAsync();
        var r = await Upload(admin, null,
            ("ok.png", "image/png", SampleFiles.Png()),
            ("ok.gif", "image/gif", SampleFiles.Gif()),
            ("bad.exe.jpg", "image/jpeg", SampleFiles.WindowsExecutable()));

        Assert.Equal(2, r.Data.GetProperty("items").GetArrayLength());
        var errors = r.Data.GetProperty("errors");
        Assert.Equal(1, errors.GetArrayLength());
        Assert.Equal("bad.exe.jpg", errors[0].GetProperty("fileName").GetString());
    }

    [Theory]
    [InlineData("x.svg", "image/svg+xml", "svg")]
    [InlineData("x.html", "text/html", "html")]
    [InlineData("x.php", "image/png", "php")]
    [InlineData("x.exe", "application/octet-stream", "exe")]
    public async Task Disallowed_extensions_are_rejected_even_with_image_content(string name, string type, string _)
    {
        var admin = await factory.NewAdminClientAsync();
        var r = await Upload(admin, null, (name, type, SampleFiles.Png()));

        Assert.Empty(r.Data.GetProperty("items").EnumerateArray());
        Assert.Equal(1, r.Data.GetProperty("errors").GetArrayLength());
    }

    [Theory]
    [InlineData("a.jpg", "image/jpeg")]   // nội dung PNG nhưng khai là .jpg
    [InlineData("a.png", "image/jpeg")]   // Content-Type không khớp đuôi
    [InlineData("a.png", "text/plain")]
    public async Task Content_must_match_declared_extension_and_mime(string name, string type)
    {
        var admin = await factory.NewAdminClientAsync();
        var r = await Upload(admin, null, (name, type, SampleFiles.Png()));

        Assert.Empty(r.Data.GetProperty("items").EnumerateArray());
        Assert.Equal(1, r.Data.GetProperty("errors").GetArrayLength());
    }

    [Fact]
    public async Task Script_in_svg_disguised_as_png_is_rejected()
    {
        var admin = await factory.NewAdminClientAsync();
        var r = await Upload(admin, null, ("evil.png", "image/png", SampleFiles.Svg()));

        Assert.Empty(r.Data.GetProperty("items").EnumerateArray());
    }

    [Fact]
    public async Task Path_traversal_in_file_name_cannot_escape_the_upload_folder()
    {
        var admin = await factory.NewAdminClientAsync();
        var r = await Upload(admin, null, ("../../../evil.png", "image/png", SampleFiles.Png()));

        Assert.True(r.Success);
        Assert.Equal("evil.png", r.Data.GetProperty("items")[0].GetProperty("fileName").GetString());
        var key = Url(r).Replace("/uploads/", "");
        var full = Path.GetFullPath(Path.Combine(factory.UploadsRoot, key));
        Assert.StartsWith(Path.GetFullPath(factory.UploadsRoot), full);
        Assert.False(File.Exists(Path.Combine(factory.UploadsRoot, "..", "evil.png")));
    }

    [Fact]
    public async Task Empty_upload_request_is_rejected()
    {
        var admin = await factory.NewAdminClientAsync();
        var r = await admin.SendAsync(HttpMethod.Post, "/api/admin/media", null, content: SampleFiles.Form(null));

        Assert.Equal(HttpStatusCode.BadRequest, r.Status);
    }

    [Fact]
    public async Task Upload_requires_permission_and_csrf()
    {
        Assert.Equal(HttpStatusCode.Unauthorized, (await Upload(factory.NewClient(), null, ("a.png", "image/png", SampleFiles.Png()))).Status);

        var customer = await factory.LoginAsRoleAsync(RoleDefaults.Customer);
        Assert.Equal(HttpStatusCode.Forbidden, (await Upload(customer, null, ("a.png", "image/png", SampleFiles.Png()))).Status);

        var admin = await factory.NewAdminClientAsync();
        var noCsrf = await admin.SendAsync(HttpMethod.Post, "/api/admin/media", null, sendCsrf: false,
            content: SampleFiles.Form(null, ("a.png", "image/png", SampleFiles.Png())));
        Assert.Equal("csrf_failed", noCsrf.ErrorCode);
    }

    [Fact]
    public async Task Staff_can_upload_but_not_delete()
    {
        var staff = await factory.LoginAsRoleAsync(RoleDefaults.Staff);
        var up = await Upload(staff, null, ("a.png", "image/png", SampleFiles.Png()));
        Assert.True(up.Success);
        var id = up.Data.GetProperty("items")[0].GetProperty("id").GetString();

        Assert.Equal(HttpStatusCode.Forbidden, (await staff.DeleteAsync($"/api/admin/media/{id}")).Status);
    }

    [Fact]
    public async Task Media_in_use_cannot_be_deleted_until_released_then_file_is_removed()
    {
        var admin = await factory.NewAdminClientAsync();
        var up = await Upload(admin, null, ("logo.png", "image/png", SampleFiles.Png()));
        var id = up.Data.GetProperty("items")[0].GetProperty("id").GetString()!;
        var path = Path.Combine(factory.UploadsRoot, Url(up).Replace("/uploads/", ""));

        Assert.True((await admin.PutAsync("/api/admin/settings", new { values = new Dictionary<string, string> { ["general.logo"] = id } })).Success);
        var blocked = await admin.DeleteAsync($"/api/admin/media/{id}");
        Assert.Equal(HttpStatusCode.Conflict, blocked.Status);
        Assert.Equal("in_use", blocked.ErrorCode);
        Assert.True(File.Exists(path));

        var site = await factory.NewClient().GetAsync("/api/public/site-config");
        Assert.Equal(id, site.Data.GetProperty("media").GetProperty("general.logo").GetProperty("id").GetString());

        Assert.True((await admin.PutAsync("/api/admin/settings", new { values = new Dictionary<string, string> { ["general.logo"] = "" } })).Success);
        Assert.True((await admin.DeleteAsync($"/api/admin/media/{id}")).Success);
        Assert.False(File.Exists(path));
        Assert.Equal(HttpStatusCode.NotFound, (await admin.DeleteAsync($"/api/admin/media/{id}")).Status);
    }

    [Fact]
    public async Task List_filters_by_kind_search_folder_and_rejects_unknown_sort()
    {
        var admin = await factory.NewAdminClientAsync();
        var tag = Guid.NewGuid().ToString("N")[..8];
        await Upload(admin, $"f{tag}", ($"alpha-{tag}.png", "image/png", SampleFiles.Png()));
        await Upload(admin, $"f{tag}", ($"beta-{tag}.mp4", "video/mp4", SampleFiles.Mp4()));

        var all = await admin.GetAsync($"/api/admin/media?folder=f{tag}&sort=fileName:asc");
        Assert.Equal(["alpha", "beta"], all.Data.EnumerateArray().Select(x => x.GetProperty("fileName").GetString()!.Split('-')[0]).ToArray());
        Assert.Equal(2, all.Meta.GetProperty("total").GetInt32());

        var videos = await admin.GetAsync($"/api/admin/media?folder=f{tag}&kind=video");
        Assert.Equal(1, videos.Data.GetArrayLength());

        var search = await admin.GetAsync($"/api/admin/media?q=ALPHA-{tag}");
        Assert.Equal(1, search.Data.GetArrayLength());

        foreach (var bad in new[] { "password", "fileName;drop table media", "fileName:sideways", "createdAt:asc:x" })
        {
            var r = await admin.GetAsync($"/api/admin/media?sort={Uri.EscapeDataString(bad)}");
            Assert.Equal(HttpStatusCode.BadRequest, r.Status);
            Assert.Equal("validation_failed", r.ErrorCode);
        }

        var folders = await admin.GetAsync("/api/admin/media/folders");
        Assert.Contains($"f{tag}", folders.Data.EnumerateArray().Select(x => x.GetString()));
    }

    [Fact]
    public async Task Update_changes_alt_text_and_folder_only()
    {
        var admin = await factory.NewAdminClientAsync();
        var up = await Upload(admin, null, ("a.png", "image/png", SampleFiles.Png()));
        var id = up.Data.GetProperty("items")[0].GetProperty("id").GetString();

        var r = await admin.PutAsync($"/api/admin/media/{id}", new { altText = "Chai nước hoa", folder = "san pham" });

        Assert.True(r.Success);
        Assert.Equal("Chai nước hoa", r.Data.GetProperty("altText").GetString());
        Assert.Equal("san pham", r.Data.GetProperty("folder").GetString());
        Assert.Equal("a.png", r.Data.GetProperty("fileName").GetString());
    }
}

public class MediaLimitTests(SmallImageLimitFactory factory) : IClassFixture<SmallImageLimitFactory>
{
    [Fact]
    public async Task Oversized_image_is_rejected_with_a_size_message()
    {
        var admin = await factory.NewAdminClientAsync();
        var big = SampleFiles.Png().Concat(new byte[4096]).ToArray(); // PNG hợp lệ đầu tệp nhưng vượt giới hạn 2 KB
        var r = await admin.SendAsync(HttpMethod.Post, "/api/admin/media", null,
            content: SampleFiles.Form(null, ("big.png", "image/png", big)));

        Assert.Empty(r.Data.GetProperty("items").EnumerateArray());
        Assert.Contains("vượt quá giới hạn 2 KB", r.Data.GetProperty("errors")[0].GetProperty("message").GetString());
    }
}
