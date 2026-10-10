using System.Text.Json;
using Ccp.Application.Common;

namespace Ccp.Tests;

/// <summary>Cùng bộ vector với Admin (admin/src/lib/utils.test.ts): hai nơi tạo slug phải cho kết quả giống nhau.</summary>
public class SlugVectorTests
{
    private static JsonElement Cases()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !File.Exists(Path.Combine(dir.FullName, "docs", "slug-vectors.json"))) dir = dir.Parent;
        return JsonDocument.Parse(File.ReadAllText(Path.Combine(dir!.FullName, "docs", "slug-vectors.json"))).RootElement.GetProperty("cases").Clone();
    }

    [Fact]
    public void Backend_slugger_matches_every_shared_vector()
    {
        var cases = Cases().EnumerateArray().ToList();
        Assert.True(cases.Count >= 8);
        foreach (var c in cases)
            Assert.Equal(c.GetProperty("slug").GetString(), Slugger.Slugify(c.GetProperty("input").GetString()!));
    }
}
