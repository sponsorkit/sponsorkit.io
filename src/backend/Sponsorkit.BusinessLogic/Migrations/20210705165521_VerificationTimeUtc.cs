using System;
using Microsoft.EntityFrameworkCore.Migrations;

namespace Sponsorkit.Migrations
{
    public partial class VerificationTimeUtc : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "EmailVerifiedAtUtc",
                table: "Users",
                type: "timestamp with time zone",
                nullable: true);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "EmailVerifiedAtUtc",
                table: "Users");
        }
    }
}
