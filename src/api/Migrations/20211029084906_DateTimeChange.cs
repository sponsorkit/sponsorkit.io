using Microsoft.EntityFrameworkCore.Migrations;

namespace Sponsorkit.Migrations
{
    public partial class DateTimeChange : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "EmailVerifiedAtUtc",
                table: "Users",
                newName: "EmailVerifiedAt");

            migrationBuilder.RenameColumn(
                name: "CreatedAtUtc",
                table: "Users",
                newName: "CreatedAt");

            migrationBuilder.RenameColumn(
                name: "CreatedAtUtc",
                table: "Sponsorships",
                newName: "CreatedAt");

            migrationBuilder.RenameColumn(
                name: "TransferredToConnectedAccountAtUtc",
                table: "Payments",
                newName: "TransferredToConnectedAccountAt");

            migrationBuilder.RenameColumn(
                name: "FeePayedOutToPlatformBankAccountAtUtc",
                table: "Payments",
                newName: "FeePayedOutToPlatformBankAccountAt");

            migrationBuilder.RenameColumn(
                name: "CreatedAtUtc",
                table: "Payments",
                newName: "CreatedAt");

            migrationBuilder.RenameColumn(
                name: "VerdictAtUtc",
                table: "BountyClaimRequests",
                newName: "VerdictAt");

            migrationBuilder.RenameColumn(
                name: "ExpiredAtUtc",
                table: "BountyClaimRequests",
                newName: "ExpiredAt");

            migrationBuilder.RenameColumn(
                name: "CreatedAtUtc",
                table: "BountyClaimRequests",
                newName: "CreatedAt");

            migrationBuilder.RenameColumn(
                name: "CreatedAtUtc",
                table: "Bounties",
                newName: "CreatedAt");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "EmailVerifiedAt",
                table: "Users",
                newName: "EmailVerifiedAtUtc");

            migrationBuilder.RenameColumn(
                name: "CreatedAt",
                table: "Users",
                newName: "CreatedAtUtc");

            migrationBuilder.RenameColumn(
                name: "CreatedAt",
                table: "Sponsorships",
                newName: "CreatedAtUtc");

            migrationBuilder.RenameColumn(
                name: "TransferredToConnectedAccountAt",
                table: "Payments",
                newName: "TransferredToConnectedAccountAtUtc");

            migrationBuilder.RenameColumn(
                name: "FeePayedOutToPlatformBankAccountAt",
                table: "Payments",
                newName: "FeePayedOutToPlatformBankAccountAtUtc");

            migrationBuilder.RenameColumn(
                name: "CreatedAt",
                table: "Payments",
                newName: "CreatedAtUtc");

            migrationBuilder.RenameColumn(
                name: "VerdictAt",
                table: "BountyClaimRequests",
                newName: "VerdictAtUtc");

            migrationBuilder.RenameColumn(
                name: "ExpiredAt",
                table: "BountyClaimRequests",
                newName: "ExpiredAtUtc");

            migrationBuilder.RenameColumn(
                name: "CreatedAt",
                table: "BountyClaimRequests",
                newName: "CreatedAtUtc");

            migrationBuilder.RenameColumn(
                name: "CreatedAt",
                table: "Bounties",
                newName: "CreatedAtUtc");
        }
    }
}
