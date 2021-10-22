using Microsoft.EntityFrameworkCore.Migrations;
using Octokit;
using Migration = Microsoft.EntityFrameworkCore.Migrations.Migration;

namespace Sponsorkit.Migrations
{
    public partial class TitleSnapshotNonNullable : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("UPDATE \"Issues\" SET \"GitHub_TitleSnapshot\"='' WHERE \"GitHub_TitleSnapshot\" IS NULL");
            
            migrationBuilder.AlterColumn<string>(
                name: "GitHub_TitleSnapshot",
                table: "Issues",
                type: "text",
                nullable: false,
                defaultValue: "",
                oldClrType: typeof(string),
                oldType: "text",
                oldNullable: true);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<string>(
                name: "GitHub_TitleSnapshot",
                table: "Issues",
                type: "text",
                nullable: true,
                oldClrType: typeof(string),
                oldType: "text");
        }
    }
}
