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
                    Id = table.Column<Guid>(nullable: false),
                    Name = table.Column<string>(nullable: false),
                    StripeId = table.Column<string>(nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Users", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Identities",
                columns: table => new
                {
                    Id = table.Column<Guid>(nullable: false),
                    EncryptedEmail = table.Column<string>(nullable: false),
                    EncryptedPassword = table.Column<string>(nullable: true),
                    GitHubUserId = table.Column<string>(nullable: true),
                    OwnerId = table.Column<Guid>(nullable: false)
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

            migrationBuilder.CreateTable(
                name: "Repositories",
                columns: table => new
                {
                    Id = table.Column<Guid>(nullable: false),
                    GitHubId = table.Column<string>(nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(nullable: false),
                    OwnerId = table.Column<Guid>(nullable: true)
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
                name: "Sponsorships",
                columns: table => new
                {
                    Id = table.Column<Guid>(nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(nullable: false),
                    Reference = table.Column<string>(nullable: false),
                    MonthlyAmountInHundreds = table.Column<int>(nullable: true),
                    BeneficiaryId = table.Column<Guid>(nullable: false),
                    SponsorId = table.Column<Guid>(nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Sponsorships", x => x.Id);
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
                name: "Issues",
                columns: table => new
                {
                    Id = table.Column<Guid>(nullable: false),
                    GitHubId = table.Column<string>(nullable: false),
                    RepositoryId = table.Column<Guid>(nullable: false)
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
                name: "Bounties",
                columns: table => new
                {
                    Id = table.Column<Guid>(nullable: false),
                    AmountInHundreds = table.Column<int>(nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(nullable: false),
                    CreatorId = table.Column<Guid>(nullable: false),
                    AwardedToId = table.Column<Guid>(nullable: false),
                    IssueId = table.Column<Guid>(nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Bounties", x => x.Id);
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
                    table.ForeignKey(
                        name: "FK_Bounties_Issues_IssueId",
                        column: x => x.IssueId,
                        principalTable: "Issues",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Payments",
                columns: table => new
                {
                    Id = table.Column<Guid>(nullable: false),
                    BountyId = table.Column<Guid>(nullable: true),
                    SponsorshipId = table.Column<Guid>(nullable: true),
                    AmountInHundreds = table.Column<int>(nullable: false),
                    StripeId = table.Column<string>(nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(nullable: false)
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
                table: "Users",
                columns: new[] { "Id", "CreatedAtUtc", "Name", "StripeId" },
                values: new object[] { new Guid("681c2d58-7a3f-49fb-ada8-697c06708d32"), new DateTime(2021, 4, 11, 1, 28, 29, 327, DateTimeKind.Utc).AddTicks(2006), "the-beneficiary", "foo" });

            migrationBuilder.InsertData(
                table: "Users",
                columns: new[] { "Id", "CreatedAtUtc", "Name", "StripeId" },
                values: new object[] { new Guid("9f64c8d0-d69a-4f52-a257-1332f51f4e4d"), new DateTime(2021, 4, 11, 1, 28, 29, 327, DateTimeKind.Utc).AddTicks(2377), "the-sponsor", "foo" });

            migrationBuilder.InsertData(
                table: "Sponsorships",
                columns: new[] { "Id", "BeneficiaryId", "CreatedAtUtc", "MonthlyAmountInHundreds", "Reference", "SponsorId" },
                values: new object[] { new Guid("43029511-840f-472d-aec5-3ae45787308b"), new Guid("681c2d58-7a3f-49fb-ada8-697c06708d32"), new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), null, "sponsorship-foo", new Guid("9f64c8d0-d69a-4f52-a257-1332f51f4e4d") });

            migrationBuilder.InsertData(
                table: "Payments",
                columns: new[] { "Id", "AmountInHundreds", "BountyId", "CreatedAtUtc", "SponsorshipId", "StripeId" },
                values: new object[] { new Guid("8d5d4bc2-8b18-45c0-b48e-5d81773c2eb3"), 100, null, new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new Guid("43029511-840f-472d-aec5-3ae45787308b"), "foo" });

            migrationBuilder.InsertData(
                table: "Payments",
                columns: new[] { "Id", "AmountInHundreds", "BountyId", "CreatedAtUtc", "SponsorshipId", "StripeId" },
                values: new object[] { new Guid("b5e19f7a-2dff-4da2-9801-19a4fc8fe460"), 250, null, new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new Guid("43029511-840f-472d-aec5-3ae45787308b"), "foo" });

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
                name: "IX_Identities_OwnerId",
                table: "Identities",
                column: "OwnerId");

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
                name: "Identities");

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
