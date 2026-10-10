using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Ccp.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class Phase2Storefront : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Tìm kiếm không dấu tiếng Việt: unaccent không "immutable" nên không dùng được trong chỉ mục;
            // bọc trong f_unaccent (IMMUTABLE) rồi tạo chỉ mục trigram trên giá trị đã bỏ dấu, viết thường.
            migrationBuilder.Sql("CREATE EXTENSION IF NOT EXISTS unaccent;");
            migrationBuilder.Sql("CREATE EXTENSION IF NOT EXISTS pg_trgm;");
            migrationBuilder.Sql(@"CREATE OR REPLACE FUNCTION public.f_unaccent(text) RETURNS text
                AS $$ SELECT public.unaccent('public.unaccent', $1) $$ LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT;");
            migrationBuilder.Sql("CREATE INDEX ix_products_search_trgm ON products USING gin (f_unaccent(lower(name)) gin_trgm_ops) WHERE is_deleted = false;");
            migrationBuilder.Sql("CREATE INDEX ix_product_variants_sku_trgm ON product_variants USING gin (f_unaccent(lower(sku)) gin_trgm_ops) WHERE is_deleted = false;");

            migrationBuilder.AddColumn<string>(
                name: "province_name",
                table: "orders",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ward_name",
                table: "orders",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("DROP INDEX IF EXISTS ix_product_variants_sku_trgm;");
            migrationBuilder.Sql("DROP INDEX IF EXISTS ix_products_search_trgm;");
            migrationBuilder.Sql("DROP FUNCTION IF EXISTS public.f_unaccent(text);");
            migrationBuilder.DropColumn(
                name: "province_name",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "ward_name",
                table: "orders");
        }
    }
}
