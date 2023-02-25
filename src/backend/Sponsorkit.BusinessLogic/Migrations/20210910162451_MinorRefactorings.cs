using System;
using Microsoft.EntityFrameworkCore.Migrations;

namespace Sponsorkit.Migrations
{
    public partial class MinorRefactorings : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_BountyClaimRequests_BountyId",
                table: "BountyClaimRequests");

            migrationBuilder.DropColumn(
                name: "GitHubPullRequestId",
                table: "BountyClaimRequests");

            migrationBuilder.RenameColumn(
                name: "GitHubId",
                table: "Repositories",
                newName: "GitHub_Id");

            migrationBuilder.RenameColumn(
                name: "GitHubId",
                table: "Issues",
                newName: "GitHub_Number");

            migrationBuilder.AddColumn<string>(
                name: "GitHub_Name",
                table: "Repositories",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "GitHub_OwnerName",
                table: "Repositories",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<long>(
                name: "GitHub_Id",
                table: "Issues",
                type: "bigint",
                nullable: false,
                defaultValue: 0L);

            migrationBuilder.AddColumn<Guid>(
                name: "PullRequestId",
                table: "BountyClaimRequests",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.CreateTable(
                name: "PullRequests",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    GitHub_Id = table.Column<long>(type: "bigint", nullable: false),
                    GitHub_Number = table.Column<long>(type: "bigint", nullable: false),
                    RepositoryId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PullRequests", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PullRequests_Repositories_RepositoryId",
                        column: x => x.RepositoryId,
                        principalTable: "Repositories",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_BountyClaimRequests_BountyId_CreatorId",
                table: "BountyClaimRequests",
                columns: new[] { "BountyId", "CreatorId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_BountyClaimRequests_PullRequestId",
                table: "BountyClaimRequests",
                column: "PullRequestId");

            migrationBuilder.CreateIndex(
                name: "IX_PullRequests_RepositoryId",
                table: "PullRequests",
                column: "RepositoryId");

            migrationBuilder.AddForeignKey(
                name: "FK_BountyClaimRequests_PullRequests_PullRequestId",
                table: "BountyClaimRequests",
                column: "PullRequestId",
                principalTable: "PullRequests",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_BountyClaimRequests_PullRequests_PullRequestId",
                table: "BountyClaimRequests");

            migrationBuilder.DropTable(
                name: "PullRequests");

            migrationBuilder.DropIndex(
                name: "IX_BountyClaimRequests_BountyId_CreatorId",
                table: "BountyClaimRequests");

            migrationBuilder.DropIndex(
                name: "IX_BountyClaimRequests_PullRequestId",
                table: "BountyClaimRequests");

            migrationBuilder.DropColumn(
                name: "GitHub_Name",
                table: "Repositories");

            migrationBuilder.DropColumn(
                name: "GitHub_OwnerName",
                table: "Repositories");

            migrationBuilder.DropColumn(
                name: "GitHub_Id",
                table: "Issues");

            migrationBuilder.DropColumn(
                name: "PullRequestId",
                table: "BountyClaimRequests");

            migrationBuilder.RenameColumn(
                name: "GitHub_Id",
                table: "Repositories",
                newName: "GitHubId");

            migrationBuilder.RenameColumn(
                name: "GitHub_Number",
                table: "Issues",
                newName: "GitHubId");

            migrationBuilder.AddColumn<long>(
                name: "GitHubPullRequestId",
                table: "BountyClaimRequests",
                type: "bigint",
                nullable: false,
                defaultValue: 0L);

            migrationBuilder.CreateIndex(
                name: "IX_BountyClaimRequests_BountyId",
                table: "BountyClaimRequests",
                column: "BountyId");
        }
    }
}
