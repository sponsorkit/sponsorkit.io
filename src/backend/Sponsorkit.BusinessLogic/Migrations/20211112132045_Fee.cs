using Microsoft.EntityFrameworkCore.Migrations;

namespace Sponsorkit.Migrations
{
    public partial class Fee : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AmountInHundreds",
                table: "Bounties");

            migrationBuilder.AddColumn<long>(
                name: "FeeInHundreds",
                table: "Payments",
                type: "bigint",
                nullable: false,
                defaultValue: 0L);

            migrationBuilder.Sql("UPDATE \"Payments\" SET \"FeeInHundreds\"=\"AmountInHundreds\" / 100 * 10 WHERE \"FeeInHundreds\"=0");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "FeeInHundreds",
                table: "Payments");

            migrationBuilder.AddColumn<long>(
                name: "AmountInHundreds",
                table: "Bounties",
                type: "bigint",
                nullable: false,
                defaultValue: 0L);
        }
    }
}
