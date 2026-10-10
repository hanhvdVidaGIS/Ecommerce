using Ccp.Tests.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Ccp.Tests;

[Collection(ApiCollection.Name)]
public class MigrationTests(ApiFactory factory)
{
    [Fact]
    public async Task Model_has_no_changes_missing_from_migrations()
    {
        // Nếu ai đó đổi thực thể/cấu hình mà quên tạo migration, test này báo ngay thay vì để lỗi lộ ra ở môi trường khác.
        var pending = await factory.WithDbAsync(db => Task.FromResult(db.Database.HasPendingModelChanges()));
        Assert.False(pending, "Mô hình EF khác với migration. Chạy: dotnet ef migrations add <Tên> --project backend/src/Ccp.Infrastructure");
    }

    [Fact]
    public async Task All_migrations_are_applied_to_a_fresh_database()
    {
        var (applied, pending) = await factory.WithDbAsync(async db =>
            ((await db.Database.GetAppliedMigrationsAsync()).ToList(), (await db.Database.GetPendingMigrationsAsync()).ToList()));
        Assert.NotEmpty(applied);
        Assert.Empty(pending);
    }

    [Fact]
    public async Task Soft_delete_unique_indexes_exist_as_partial_indexes()
    {
        // Đối chiếu trực tiếp với catalog PostgreSQL: các chỉ mục duy nhất của thực thể xoá mềm phải là chỉ mục một phần.
        var defs = await factory.WithDbAsync(async db =>
        {
            var conn = db.Database.GetDbConnection();
            await conn.OpenAsync();
            await using var cmd = conn.CreateCommand();
            cmd.CommandText = "select indexname || ' :: ' || indexdef from pg_indexes where schemaname='public' and left(indexname,3) <> 'pk_' and indexdef like 'CREATE UNIQUE INDEX%' and tablename in ('products','categories','brands','product_variants','product_attributes','coupons','pages','users')";
            var list = new List<string>();
            await using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync()) list.Add(reader.GetString(0));
            return list;
        });
        Assert.True(defs.Count >= 8, $"Chỉ thấy {defs.Count} chỉ mục duy nhất");
        Assert.All(defs, d => Assert.Contains("WHERE (is_deleted = false)", d));
    }
}
