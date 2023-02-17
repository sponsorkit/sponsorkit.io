using Microsoft.EntityFrameworkCore.Migrations;

namespace Sponsorkit.Migrations
{
    public partial class TitleSnapshot : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "GitHub_TitleSnapshot",
                table: "Issues",
                type: "text",
                nullable: true);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "GitHub_TitleSnapshot",
                table: "Issues");
        }
    }
}
