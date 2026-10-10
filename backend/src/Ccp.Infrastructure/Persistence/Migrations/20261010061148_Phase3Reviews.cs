using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Ccp.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class Phase3Reviews : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_reviews_user_id",
                table: "reviews");

            migrationBuilder.CreateIndex(
                name: "ix_reviews_user_id_product_id",
                table: "reviews",
                columns: new[] { "user_id", "product_id" },
                unique: true,
                filter: "is_deleted = false");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_reviews_user_id_product_id",
                table: "reviews");

            migrationBuilder.CreateIndex(
                name: "ix_reviews_user_id",
                table: "reviews",
                column: "user_id");
        }
    }
}
