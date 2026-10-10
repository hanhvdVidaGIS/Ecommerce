namespace Ccp.Api.Startup;

/// <summary>
/// Chỉ cho môi trường phát triển: nạp tệp .env ở gốc kho mã vào biến môi trường (không ghi đè biến đã có),
/// để docker-compose và backend dùng chung một nguồn cấu hình.
/// </summary>
public static class DotEnvLoader
{
    public static void LoadIfDevelopment()
    {
        var environment = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT") ?? "Production";
        if (!environment.Equals("Development", StringComparison.OrdinalIgnoreCase)) return;

        var dir = new DirectoryInfo(Directory.GetCurrentDirectory());
        while (dir is not null && !File.Exists(Path.Combine(dir.FullName, ".env"))) dir = dir.Parent;
        if (dir is null) return;

        foreach (var raw in File.ReadAllLines(Path.Combine(dir.FullName, ".env")))
        {
            var line = raw.Trim();
            if (line.Length == 0 || line.StartsWith('#')) continue;
            var idx = line.IndexOf('=');
            if (idx <= 0) continue;
            var key = line[..idx].Trim();
            var value = line[(idx + 1)..].Trim().Trim('"');
            if (Environment.GetEnvironmentVariable(key) is null) Environment.SetEnvironmentVariable(key, value);
        }
    }
}
