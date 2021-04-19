using System;
using Microsoft.EntityFrameworkCore.Migrations;

namespace Sponsorkit.Migrations
{
    public partial class New : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DeleteData(
                table: "Payments",
                keyColumn: "Id",
                keyValue: new Guid("33cb5eab-e973-460a-a717-3f28fe5c4f03"));

            migrationBuilder.DeleteData(
                table: "Payments",
                keyColumn: "Id",
                keyValue: new Guid("89154013-4987-43e8-babd-272cf15f5de9"));

            migrationBuilder.DeleteData(
                table: "Sponsorships",
                keyColumn: "Id",
                keyValue: new Guid("12386280-96c0-44ba-b305-3eef7e4e86b1"));

            migrationBuilder.DeleteData(
                table: "Users",
                keyColumn: "Id",
                keyValue: new Guid("e64d3cdc-2de8-46dd-b721-227aee0f39e9"));

            migrationBuilder.AddColumn<Guid>(
                name: "RepositoryId",
                table: "Sponsorships",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.UpdateData(
                table: "Users",
                keyColumn: "Id",
                keyValue: new Guid("681c2d58-7a3f-49fb-ada8-697c06708d32"),
                columns: new[] { "CreatedAtUtc", "GitHubId" },
                values: new object[] { new DateTime(2021, 4, 19, 19, 42, 3, 230, DateTimeKind.Utc).AddTicks(1264), "ffMathy" });

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

            migrationBuilder.AddForeignKey(
                name: "FK_Sponsorships_Repositories_SponsorId",
                table: "Sponsorships",
                column: "SponsorId",
                principalTable: "Repositories",
                principalColumn: "Id");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Sponsorships_Repositories_SponsorId",
                table: "Sponsorships");

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
                name: "RepositoryId",
                table: "Sponsorships");

            migrationBuilder.UpdateData(
                table: "Users",
                keyColumn: "Id",
                keyValue: new Guid("681c2d58-7a3f-49fb-ada8-697c06708d32"),
                columns: new[] { "CreatedAtUtc", "GitHubId" },
                values: new object[] { new DateTime(2021, 4, 11, 11, 55, 50, 221, DateTimeKind.Utc).AddTicks(7950), null });

            migrationBuilder.InsertData(
                table: "Users",
                columns: new[] { "Id", "CreatedAtUtc", "GitHubId", "Name", "StripeId" },
                values: new object[] { new Guid("e64d3cdc-2de8-46dd-b721-227aee0f39e9"), new DateTime(2021, 4, 11, 11, 55, 50, 221, DateTimeKind.Utc).AddTicks(8205), null, "the-sponsor", "foo" });

            migrationBuilder.InsertData(
                table: "Sponsorships",
                columns: new[] { "Id", "BeneficiaryId", "CreatedAtUtc", "MonthlyAmountInHundreds", "Reference", "SponsorId" },
                values: new object[] { new Guid("12386280-96c0-44ba-b305-3eef7e4e86b1"), new Guid("681c2d58-7a3f-49fb-ada8-697c06708d32"), new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), null, "sponsorship-foo", new Guid("e64d3cdc-2de8-46dd-b721-227aee0f39e9") });

            migrationBuilder.InsertData(
                table: "Payments",
                columns: new[] { "Id", "AmountInHundreds", "BountyId", "CreatedAtUtc", "SponsorshipId", "StripeId" },
                values: new object[] { new Guid("89154013-4987-43e8-babd-272cf15f5de9"), 100, null, new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new Guid("12386280-96c0-44ba-b305-3eef7e4e86b1"), "foo" });

            migrationBuilder.InsertData(
                table: "Payments",
                columns: new[] { "Id", "AmountInHundreds", "BountyId", "CreatedAtUtc", "SponsorshipId", "StripeId" },
                values: new object[] { new Guid("33cb5eab-e973-460a-a717-3f28fe5c4f03"), 250, null, new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new Guid("12386280-96c0-44ba-b305-3eef7e4e86b1"), "foo" });
        }
    }
}
