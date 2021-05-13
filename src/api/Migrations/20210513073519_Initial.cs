using System;
using Microsoft.EntityFrameworkCore.Migrations;

namespace Sponsorkit.Migrations
{
    public partial class Initial : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Users",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    EncryptedEmail = table.Column<byte[]>(type: "varbinary(max)", nullable: false),
                    StripeCustomerId = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    StripeConnectId = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    GitHubId = table.Column<long>(type: "bigint", nullable: true),
                    EncryptedGitHubAccessToken = table.Column<byte[]>(type: "varbinary(max)", nullable: true),
                    CreatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Users", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Repositories",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    GitHubId = table.Column<long>(type: "bigint", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
                    OwnerId = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Repositories", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Repositories_Users_OwnerId",
                        column: x => x.OwnerId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "Issues",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    GitHubId = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    RepositoryId = table.Column<Guid>(type: "uniqueidentifier", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Issues", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Issues_Repositories_RepositoryId",
                        column: x => x.RepositoryId,
                        principalTable: "Repositories",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Sponsorships",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
                    RepositoryId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    MonthlyAmountInHundreds = table.Column<int>(type: "int", nullable: true),
                    Reference = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    BeneficiaryId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SponsorId = table.Column<Guid>(type: "uniqueidentifier", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Sponsorships", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Sponsorships_Repositories_SponsorId",
                        column: x => x.SponsorId,
                        principalTable: "Repositories",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_Sponsorships_Users_BeneficiaryId",
                        column: x => x.BeneficiaryId,
                        principalTable: "Users",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_Sponsorships_Users_SponsorId",
                        column: x => x.SponsorId,
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "Bounties",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    AmountInHundreds = table.Column<int>(type: "int", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatorId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    AwardedToId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    IssueId = table.Column<Guid>(type: "uniqueidentifier", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Bounties", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Bounties_Issues_IssueId",
                        column: x => x.IssueId,
                        principalTable: "Issues",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_Bounties_Users_AwardedToId",
                        column: x => x.AwardedToId,
                        principalTable: "Users",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_Bounties_Users_CreatorId",
                        column: x => x.CreatorId,
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "Payments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    BountyId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    SponsorshipId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    AmountInHundreds = table.Column<int>(type: "int", nullable: false),
                    StripeId = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Payments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Payments_Bounties_BountyId",
                        column: x => x.BountyId,
                        principalTable: "Bounties",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Payments_Sponsorships_SponsorshipId",
                        column: x => x.SponsorshipId,
                        principalTable: "Sponsorships",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.InsertData(
                table: "Repositories",
                columns: new[] { "Id", "CreatedAtUtc", "GitHubId", "OwnerId" },
                values: new object[] { new Guid("f2df9806-3801-4e8f-bf0a-93ed6383d209"), new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), 1337L, null });

            migrationBuilder.InsertData(
                table: "Users",
                columns: new[] { "Id", "CreatedAtUtc", "EncryptedEmail", "EncryptedGitHubAccessToken", "GitHubId", "StripeConnectId", "StripeCustomerId" },
                values: new object[] { new Guid("681c2d58-7a3f-49fb-ada8-697c06708d32"), new DateTime(2021, 5, 13, 7, 35, 19, 63, DateTimeKind.Utc).AddTicks(4244), new byte[0], null, 2824010L, null, "foo" });

            migrationBuilder.InsertData(
                table: "Users",
                columns: new[] { "Id", "CreatedAtUtc", "EncryptedEmail", "EncryptedGitHubAccessToken", "GitHubId", "StripeConnectId", "StripeCustomerId" },
                values: new object[] { new Guid("bce0dc8b-32da-4702-8569-2a80a09a8feb"), new DateTime(2021, 5, 13, 7, 35, 19, 63, DateTimeKind.Utc).AddTicks(5555), new byte[0], null, null, null, "foo" });

            migrationBuilder.InsertData(
                table: "Sponsorships",
                columns: new[] { "Id", "BeneficiaryId", "CreatedAtUtc", "MonthlyAmountInHundreds", "Reference", "RepositoryId", "SponsorId" },
                values: new object[] { new Guid("d6b85542-37b1-4c59-8154-86339f78eb14"), new Guid("681c2d58-7a3f-49fb-ada8-697c06708d32"), new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), null, "sponsorship-foo", new Guid("f2df9806-3801-4e8f-bf0a-93ed6383d209"), new Guid("bce0dc8b-32da-4702-8569-2a80a09a8feb") });

            migrationBuilder.InsertData(
                table: "Payments",
                columns: new[] { "Id", "AmountInHundreds", "BountyId", "CreatedAtUtc", "SponsorshipId", "StripeId" },
                values: new object[] { new Guid("4478c085-4209-4990-ae83-c62300b850c3"), 100, null, new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new Guid("d6b85542-37b1-4c59-8154-86339f78eb14"), "foo" });

            migrationBuilder.InsertData(
                table: "Payments",
                columns: new[] { "Id", "AmountInHundreds", "BountyId", "CreatedAtUtc", "SponsorshipId", "StripeId" },
                values: new object[] { new Guid("a536ae35-a1ad-47f7-8f67-0d9919482776"), 250, null, new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new Guid("d6b85542-37b1-4c59-8154-86339f78eb14"), "foo" });

            migrationBuilder.CreateIndex(
                name: "IX_Bounties_AwardedToId",
                table: "Bounties",
                column: "AwardedToId");

            migrationBuilder.CreateIndex(
                name: "IX_Bounties_CreatorId",
                table: "Bounties",
                column: "CreatorId");

            migrationBuilder.CreateIndex(
                name: "IX_Bounties_IssueId",
                table: "Bounties",
                column: "IssueId");

            migrationBuilder.CreateIndex(
                name: "IX_Issues_RepositoryId",
                table: "Issues",
                column: "RepositoryId");

            migrationBuilder.CreateIndex(
                name: "IX_Payments_BountyId",
                table: "Payments",
                column: "BountyId",
                unique: true,
                filter: "[BountyId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_Payments_SponsorshipId",
                table: "Payments",
                column: "SponsorshipId");

            migrationBuilder.CreateIndex(
                name: "IX_Repositories_OwnerId",
                table: "Repositories",
                column: "OwnerId");

            migrationBuilder.CreateIndex(
                name: "IX_Sponsorships_BeneficiaryId",
                table: "Sponsorships",
                column: "BeneficiaryId");

            migrationBuilder.CreateIndex(
                name: "IX_Sponsorships_SponsorId",
                table: "Sponsorships",
                column: "SponsorId");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Payments");

            migrationBuilder.DropTable(
                name: "Bounties");

            migrationBuilder.DropTable(
                name: "Sponsorships");

            migrationBuilder.DropTable(
                name: "Issues");

            migrationBuilder.DropTable(
                name: "Repositories");

            migrationBuilder.DropTable(
                name: "Users");
        }
    }
}
