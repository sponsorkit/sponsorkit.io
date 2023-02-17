using Microsoft.EntityFrameworkCore.Migrations;

namespace Sponsorkit.Migrations
{
    public partial class VerdictNonNullable : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("UPDATE \"BountyClaimRequests\" SET \"Verdict\"=0");
            
            migrationBuilder.AlterColumn<int>(
                name: "Verdict",
                table: "BountyClaimRequests",
                type: "integer",
                nullable: false,
                defaultValue: 0,
                oldClrType: typeof(int),
                oldType: "integer",
                oldNullable: true);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<int>(
                name: "Verdict",
                table: "BountyClaimRequests",
                type: "integer",
                nullable: true,
                oldClrType: typeof(int),
                oldType: "integer");
        }
    }
}
