using System;
using Microsoft.EntityFrameworkCore.Migrations;

namespace Sponsorkit.Migrations
{
    public partial class RemovalOfColumn : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CreatedAtUtc",
                table: "Repositories");

            migrationBuilder.AddColumn<DateTime>(
                name: "FeePayedOutToPlatformBankAccountAtUtc",
                table: "Payments",
                type: "timestamp without time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "TransferredToConnectedAccountAtUtc",
                table: "Payments",
                type: "timestamp without time zone",
                nullable: true);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "FeePayedOutToPlatformBankAccountAtUtc",
                table: "Payments");

            migrationBuilder.DropColumn(
                name: "TransferredToConnectedAccountAtUtc",
                table: "Payments");

            migrationBuilder.AddColumn<DateTime>(
                name: "CreatedAtUtc",
                table: "Repositories",
                type: "timestamp without time zone",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified));
        }
    }
}
