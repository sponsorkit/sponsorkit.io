using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Sponsorkit.Migrations
{
    public partial class AddedCompletedDate : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "ExpiredAt",
                table: "BountyClaimRequests",
                newName: "CompletedAt");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "CompletedAt",
                table: "BountyClaimRequests",
                newName: "ExpiredAt");
        }
    }
}
