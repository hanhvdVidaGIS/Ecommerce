using System.Text.RegularExpressions;

namespace Ccp.Tests;

/// <summary>
/// Yêu cầu cốt lõi: mã giao diện không được gắn cứng ngành hàng, tên website hay màu thương hiệu.
/// Test quét mã nguồn Admin (và Storefront khi có) tìm các chuỗi bị cấm.
/// </summary>
public class NoHardcodedBusinessContentTests
{
    internal sealed record Violation(string File, int Line, string Rule, string Text);

    private static readonly (string Name, Regex Pattern)[] Rules =
    [
        ("tên ngành hàng", new Regex(@"nước\s*hoa|nuoc\s*hoa|perfume|fragrance", RegexOptions.IgnoreCase | RegexOptions.Compiled)),
        ("tên website mẫu", new Regex(@"luxury|fashion\s*store|tech\s*world", RegexOptions.IgnoreCase | RegexOptions.Compiled)),
        ("mã màu cứng", new Regex(@"#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![0-9a-zA-Z-])", RegexOptions.Compiled)),
    ];

    // Ngoại lệ có chủ đích, mỗi dòng kèm lý do. Thêm ngoại lệ mới phải có lý do rõ ràng.
    private static readonly (string PathSuffix, string Rule, string Reason)[] Allowed =
    [
        ("lib/theme.ts", "mã màu cứng", "màu chữ dự phòng đen/trắng cho độ tương phản, không phải màu thương hiệu"),
        ("features/settings/SettingControl.tsx", "mã màu cứng", "giá trị khởi tạo của bảng chọn màu khi ô trống"),
        ("features/attributes/ValueFormModal.tsx", "mã màu cứng", "màu khởi tạo của bảng chọn màu khi tạo giá trị thuộc tính kiểu Color mới"),
    ];

    private static string? FindRepoRoot()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !File.Exists(Path.Combine(dir.FullName, "docs", "catalog.json"))) dir = dir.Parent;
        return dir?.FullName;
    }

    internal static IReadOnlyList<Violation> Scan(IEnumerable<(string File, string Content)> files)
    {
        var found = new List<Violation>();
        foreach (var (file, content) in files)
        {
            var lines = content.Split('\n');
            for (var i = 0; i < lines.Length; i++)
            {
                var line = lines[i];
                // Chú thích dòng không phải nội dung chạy; vẫn quét chuỗi và JSX.
                var code = line.TrimStart().StartsWith("//") || line.TrimStart().StartsWith("*") || line.TrimStart().StartsWith("/*") ? "" : line;
                foreach (var (name, pattern) in Rules)
                {
                    if (!pattern.IsMatch(code)) continue;
                    if (Allowed.Any(a => file.Replace('\\', '/').EndsWith(a.PathSuffix) && a.Rule == name)) continue;
                    found.Add(new Violation(file, i + 1, name, line.Trim()));
                }
            }
        }
        return found;
    }

    private static IEnumerable<(string File, string Content)> SourceFiles(string root, string relativeDir)
    {
        var dir = Path.Combine(root, relativeDir);
        if (!Directory.Exists(dir)) yield break;
        foreach (var file in Directory.EnumerateFiles(dir, "*.*", SearchOption.AllDirectories))
        {
            var rel = Path.GetRelativePath(root, file).Replace('\\', '/');
            if (rel.Contains("node_modules/") || rel.Contains(".next/") || rel.Contains("/dist/")) continue;
            if (!(file.EndsWith(".ts") || file.EndsWith(".tsx"))) continue;
            // Tệp sinh tự động và kiểm thử được loại trừ: tệp sinh phản chiếu OpenAPI, kiểm thử cần dữ liệu mẫu cụ thể.
            if (rel.EndsWith(".d.ts") || rel.EndsWith(".generated.ts") || rel.Contains(".test.")) continue;
            yield return (rel, File.ReadAllText(file));
        }
    }

    [Theory]
    [InlineData("admin/src")]
    [InlineData("storefront/src")]
    public void Frontend_source_has_no_hardcoded_business_content(string relativeDir)
    {
        var root = FindRepoRoot() ?? throw new InvalidOperationException("Không tìm thấy thư mục gốc kho mã");
        var files = SourceFiles(root, relativeDir).ToList();
        if (relativeDir.StartsWith("admin")) Assert.True(files.Count > 20, $"Chỉ quét được {files.Count} tệp trong {relativeDir}: đường dẫn quét có thể sai");

        var violations = Scan(files);
        Assert.True(violations.Count == 0,
            "Nội dung gắn cứng trong mã giao diện (phải lấy từ cấu hình/dữ liệu):\n" + string.Join("\n", violations.Select(v => $"  {v.File}:{v.Line} [{v.Rule}] {v.Text}")));
    }

    // ---- thử âm cho chính bộ quét (QT-7): nếu bộ quét hỏng thì các test trên đạt một cách vô nghĩa ----
    [Theory]
    [InlineData("const t = 'Nước hoa bán chạy'", "tên ngành hàng")]
    [InlineData("<h1>Best Perfume</h1>", "tên ngành hàng")]
    [InlineData("const name = 'Luxury Store'", "tên website mẫu")]
    [InlineData("className=\"bg-[#112233]\"", "mã màu cứng")]
    [InlineData("style={{ color: '#fff' }}", "mã màu cứng")]
    public void Scanner_detects_each_kind_of_forbidden_string(string line, string expectedRule)
    {
        var result = Scan([("admin/src/features/x/Page.tsx", line)]);
        Assert.Contains(result, v => v.Rule == expectedRule);
    }

    [Theory]
    [InlineData("const label = useLabels().product")]
    [InlineData("// Nước hoa chỉ xuất hiện trong chú thích")]
    [InlineData("className=\"bg-accent text-muted\"")]
    [InlineData("const id = 'abc#fffxyz'")]
    public void Scanner_ignores_legitimate_code(string line)
    {
        Assert.Empty(Scan([("admin/src/features/x/Page.tsx", line)]));
    }

    [Fact]
    public void Scanner_honours_the_documented_exceptions_only_for_their_rule_and_file()
    {
        Assert.Empty(Scan([("admin/src/lib/theme.ts", "return '#ffffff'")]));
        Assert.NotEmpty(Scan([("admin/src/lib/other.ts", "return '#ffffff'")]));
        Assert.NotEmpty(Scan([("admin/src/lib/theme.ts", "const x = 'nước hoa'")]));
    }
}
