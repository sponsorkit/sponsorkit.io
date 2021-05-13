using System;
using Microsoft.EntityFrameworkCore.Migrations;

namespace Sponsorkit.Migrations
{
    public partial class MoreProperties : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Identities");

            migrationBuilder.DeleteData(
                table: "Payments",
                keyColumn: "Id",
                keyValue: new Guid("1561c526-28ff-464a-a5a4-262d35683bf8"));

            migrationBuilder.DeleteData(
                table: "Payments",
                keyColumn: "Id",
                keyValue: new Guid("4ae7be1e-3479-4d67-bba0-081841e36a4a"));

            migrationBuilder.DeleteData(
                table: "Sponsorships",
                keyColumn: "Id",
                keyValue: new Guid("0d1037c3-2134-47a6-a31f-a9a68f4270b6"));

            migrationBuilder.DeleteData(
                table: "Users",
                keyColumn: "Id",
                keyValue: new Guid("968ab86b-996f-4475-b277-fab13a3984d0"));

            migrationBuilder.DropColumn(
                name: "Name",
                table: "Users");

            migrationBuilder.RenameColumn(
                name: "StripeId",
                table: "Users",
                newName: "StripeCustomerId");

            migrationBuilder.AlterColumn<long>(
                name: "GitHubId",
                table: "Users",
                type: "bigint",
                nullable: true,
                oldClrType: typeof(string),
                oldType: "nvarchar(max)",
                oldNullable: true);

            migrationBuilder.AddColumn<byte[]>(
                name: "EncryptedEmail",
                table: "Users",
                type: "varbinary(max)",
                nullable: false,
                defaultValue: new byte[0]);

            migrationBuilder.AddColumn<byte[]>(
                name: "EncryptedGitHubAccessToken",
                table: "Users",
                type: "varbinary(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "StripeConnectId",
                table: "Users",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.UpdateData(
                table: "Users",
                keyColumn: "Id",
                keyValue: new Guid("681c2d58-7a3f-49fb-ada8-697c06708d32"),
                columns: new[] { "CreatedAtUtc", "EncryptedEmail", "GitHubId" },
                values: new object[] { new DateTime(2021, 5, 13, 7, 28, 45, 429, DateTimeKind.Utc).AddTicks(7971), new byte[0], 2824010L });

            migrationBuilder.InsertData(
                table: "Users",
                columns: new[] { "Id", "CreatedAtUtc", "EncryptedEmail", "EncryptedGitHubAccessToken", "GitHubId", "StripeConnectId", "StripeCustomerId" },
                values: new object[] { new Guid("9e154058-55ed-4e40-a87f-d49d9209f78c"), new DateTime(2021, 5, 13, 7, 28, 45, 429, DateTimeKind.Utc).AddTicks(8848), new byte[0], null, null, null, "foo" });

            migrationBuilder.InsertData(
                table: "Sponsorships",
                columns: new[] { "Id", "BeneficiaryId", "CreatedAtUtc", "MonthlyAmountInHundreds", "Reference", "RepositoryId", "SponsorId" },
                values: new object[] { new Guid("92ea5cc6-520e-413c-b926-2b6a636adc61"), new Guid("681c2d58-7a3f-49fb-ada8-697c06708d32"), new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), null, "sponsorship-foo", null, new Guid("9e154058-55ed-4e40-a87f-d49d9209f78c") });

            migrationBuilder.InsertData(
                table: "Payments",
                columns: new[] { "Id", "AmountInHundreds", "BountyId", "CreatedAtUtc", "SponsorshipId", "StripeId" },
                values: new object[] { new Guid("f16363e9-183b-4b4d-a975-6225a0a455bd"), 100, null, new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new Guid("92ea5cc6-520e-413c-b926-2b6a636adc61"), "foo" });

            migrationBuilder.InsertData(
                table: "Payments",
                columns: new[] { "Id", "AmountInHundreds", "BountyId", "CreatedAtUtc", "SponsorshipId", "StripeId" },
                values: new object[] { new Guid("6f9266b0-c23a-4417-a667-feb9582b7f21"), 250, null, new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new Guid("92ea5cc6-520e-413c-b926-2b6a636adc61"), "foo" });
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DeleteData(
                table: "Payments",
                keyColumn: "Id",
                keyValue: new Guid("6f9266b0-c23a-4417-a667-feb9582b7f21"));

            migrationBuilder.DeleteData(
                table: "Payments",
                keyColumn: "Id",
                keyValue: new Guid("f16363e9-183b-4b4d-a975-6225a0a455bd"));

            migrationBuilder.DeleteData(
                table: "Sponsorships",
                keyColumn: "Id",
                keyValue: new Guid("92ea5cc6-520e-413c-b926-2b6a636adc61"));

            migrationBuilder.DeleteData(
                table: "Users",
                keyColumn: "Id",
                keyValue: new Guid("9e154058-55ed-4e40-a87f-d49d9209f78c"));

            migrationBuilder.DropColumn(
                name: "EncryptedEmail",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "EncryptedGitHubAccessToken",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "StripeConnectId",
                table: "Users");

            migrationBuilder.RenameColumn(
                name: "StripeCustomerId",
                table: "Users",
                newName: "StripeId");

            migrationBuilder.AlterColumn<string>(
                name: "GitHubId",
                table: "Users",
                type: "nvarchar(max)",
                nullable: true,
                oldClrType: typeof(long),
                oldType: "bigint",
                oldNullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Name",
                table: "Users",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "");

            migrationBuilder.CreateTable(
                name: "Identities",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    EncryptedEmail = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    EncryptedPassword = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    GitHubUserId = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    OwnerId = table.Column<Guid>(type: "uniqueidentifier", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Identities", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Identities_Users_OwnerId",
                        column: x => x.OwnerId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.UpdateData(
                table: "Users",
                keyColumn: "Id",
                keyValue: new Guid("681c2d58-7a3f-49fb-ada8-697c06708d32"),
                columns: new[] { "CreatedAtUtc", "GitHubId", "Name" },
                values: new object[] { new DateTime(2021, 4, 19, 19, 42, 3, 230, DateTimeKind.Utc).AddTicks(1264), "ffMathy", "the-beneficiary" });

            migrationBuilder.InsertData(
                table: "Users",
                columns: new[] { "Id", "CreatedAtUtc", "GitHubId", "Name", "StripeId" },
                values: new object[] { new Guid("968ab86b-996f-4475-b277-fab13a3984d0"), new DateTime(2021, 4, 19, 19, 42, 3, 230, DateTimeKind.Utc).AddTicks(1926), null, "the-sponsor", "foo" });

            migrationBuilder.InsertData(
                table: "Sponsorships",
                columns: new[] { "Id", "BeneficiaryId", "CreatedAtUtc", "MonthlyAmountInHundreds", "Reference", "RepositoryId", "SponsorId" },
                values: new object[] { new Guid("0d1037c3-2134-47a6-a31f-a9a68f4270b6"), new Guid("681c2d58-7a3f-49fb-ada8-697c06708d32"), new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), null, "sponsorship-foo", null, new Guid("968ab86b-996f-4475-b277-fab13a3984d0") });

            migrationBuilder.InsertData(
                table: "Payments",
                columns: new[] { "Id", "AmountInHundreds", "BountyId", "CreatedAtUtc", "SponsorshipId", "StripeId" },
                values: new object[] { new Guid("1561c526-28ff-464a-a5a4-262d35683bf8"), 100, null, new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new Guid("0d1037c3-2134-47a6-a31f-a9a68f4270b6"), "foo" });

            migrationBuilder.InsertData(
                table: "Payments",
                columns: new[] { "Id", "AmountInHundreds", "BountyId", "CreatedAtUtc", "SponsorshipId", "StripeId" },
                values: new object[] { new Guid("4ae7be1e-3479-4d67-bba0-081841e36a4a"), 250, null, new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new Guid("0d1037c3-2134-47a6-a31f-a9a68f4270b6"), "foo" });

            migrationBuilder.CreateIndex(
                name: "IX_Identities_OwnerId",
                table: "Identities",
                column: "OwnerId");
        }
    }
}
