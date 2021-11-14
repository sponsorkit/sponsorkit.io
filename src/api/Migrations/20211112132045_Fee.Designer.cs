﻿// <auto-generated />
using System;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;
using Sponsorkit.Domain.Models.Context;

namespace Sponsorkit.Migrations
{
    [DbContext(typeof(DataContext))]
    [Migration("20211112132045_Fee")]
    partial class Fee
    {
        protected override void BuildTargetModel(ModelBuilder modelBuilder)
        {
#pragma warning disable 612, 618
            modelBuilder
                .HasAnnotation("Relational:MaxIdentifierLength", 63)
                .HasAnnotation("ProductVersion", "5.0.11")
                .HasAnnotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn);

            modelBuilder.Entity("Sponsorkit.Domain.Models.Bounty", b =>
                {
                    b.Property<Guid>("Id")
                        .ValueGeneratedOnAdd()
                        .HasColumnType("uuid");

                    b.Property<Guid?>("AwardedToId")
                        .HasColumnType("uuid");

                    b.Property<DateTimeOffset>("CreatedAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<Guid>("CreatorId")
                        .HasColumnType("uuid");

                    b.Property<Guid>("IssueId")
                        .HasColumnType("uuid");

                    b.HasKey("Id");

                    b.HasIndex("AwardedToId");

                    b.HasIndex("IssueId");

                    b.HasIndex("CreatorId", "IssueId")
                        .IsUnique();

                    b.ToTable("Bounties");
                });

            modelBuilder.Entity("Sponsorkit.Domain.Models.BountyClaimRequest", b =>
                {
                    b.Property<Guid>("Id")
                        .ValueGeneratedOnAdd()
                        .HasColumnType("uuid");

                    b.Property<Guid>("BountyId")
                        .HasColumnType("uuid");

                    b.Property<DateTimeOffset>("CreatedAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<Guid>("CreatorId")
                        .HasColumnType("uuid");

                    b.Property<DateTimeOffset?>("ExpiredAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<Guid>("PullRequestId")
                        .HasColumnType("uuid");

                    b.Property<int>("Verdict")
                        .HasColumnType("integer");

                    b.Property<DateTimeOffset?>("VerdictAt")
                        .HasColumnType("timestamp with time zone");

                    b.HasKey("Id");

                    b.HasIndex("CreatorId");

                    b.HasIndex("PullRequestId");

                    b.HasIndex("BountyId", "CreatorId")
                        .IsUnique();

                    b.ToTable("BountyClaimRequests");
                });

            modelBuilder.Entity("Sponsorkit.Domain.Models.Issue", b =>
                {
                    b.Property<Guid>("Id")
                        .ValueGeneratedOnAdd()
                        .HasColumnType("uuid");

                    b.Property<Guid>("RepositoryId")
                        .HasColumnType("uuid");

                    b.HasKey("Id");

                    b.HasIndex("RepositoryId");

                    b.ToTable("Issues");
                });

            modelBuilder.Entity("Sponsorkit.Domain.Models.Payment", b =>
                {
                    b.Property<Guid>("Id")
                        .ValueGeneratedOnAdd()
                        .HasColumnType("uuid");

                    b.Property<long>("AmountInHundreds")
                        .HasColumnType("bigint");

                    b.Property<Guid?>("BountyId")
                        .HasColumnType("uuid");

                    b.Property<DateTimeOffset>("CreatedAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<long>("FeeInHundreds")
                        .HasColumnType("bigint");

                    b.Property<DateTimeOffset?>("FeePayedOutToPlatformBankAccountAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<Guid?>("SponsorshipId")
                        .HasColumnType("uuid");

                    b.Property<string>("StripeEventId")
                        .IsRequired()
                        .HasColumnType("text");

                    b.Property<string>("StripeId")
                        .IsRequired()
                        .HasColumnType("text");

                    b.Property<DateTimeOffset?>("TransferredToConnectedAccountAt")
                        .HasColumnType("timestamp with time zone");

                    b.HasKey("Id");

                    b.HasIndex("BountyId");

                    b.HasIndex("SponsorshipId");

                    b.HasIndex("StripeEventId")
                        .IsUnique();

                    b.HasIndex("StripeId")
                        .IsUnique();

                    b.ToTable("Payments");
                });

            modelBuilder.Entity("Sponsorkit.Domain.Models.PullRequest", b =>
                {
                    b.Property<Guid>("Id")
                        .ValueGeneratedOnAdd()
                        .HasColumnType("uuid");

                    b.Property<Guid>("RepositoryId")
                        .HasColumnType("uuid");

                    b.HasKey("Id");

                    b.HasIndex("RepositoryId");

                    b.ToTable("PullRequests");
                });

            modelBuilder.Entity("Sponsorkit.Domain.Models.Repository", b =>
                {
                    b.Property<Guid>("Id")
                        .ValueGeneratedOnAdd()
                        .HasColumnType("uuid");

                    b.Property<Guid?>("OwnerId")
                        .HasColumnType("uuid");

                    b.HasKey("Id");

                    b.HasIndex("OwnerId");

                    b.ToTable("Repositories");
                });

            modelBuilder.Entity("Sponsorkit.Domain.Models.Sponsorship", b =>
                {
                    b.Property<Guid>("Id")
                        .ValueGeneratedOnAdd()
                        .HasColumnType("uuid");

                    b.Property<Guid>("BeneficiaryId")
                        .HasColumnType("uuid");

                    b.Property<DateTimeOffset>("CreatedAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<long?>("MonthlyAmountInHundreds")
                        .HasColumnType("bigint");

                    b.Property<string>("Reference")
                        .IsRequired()
                        .HasColumnType("text");

                    b.Property<Guid?>("RepositoryId")
                        .HasColumnType("uuid");

                    b.Property<Guid>("SponsorId")
                        .HasColumnType("uuid");

                    b.HasKey("Id");

                    b.HasIndex("BeneficiaryId");

                    b.HasIndex("SponsorId");

                    b.ToTable("Sponsorships");
                });

            modelBuilder.Entity("Sponsorkit.Domain.Models.User", b =>
                {
                    b.Property<Guid>("Id")
                        .ValueGeneratedOnAdd()
                        .HasColumnType("uuid");

                    b.Property<DateTimeOffset>("CreatedAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<DateTimeOffset?>("EmailVerifiedAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<byte[]>("EncryptedEmail")
                        .IsRequired()
                        .HasColumnType("bytea");

                    b.Property<string>("StripeConnectId")
                        .HasColumnType("text");

                    b.Property<string>("StripeCustomerId")
                        .IsRequired()
                        .HasColumnType("text");

                    b.HasKey("Id");

                    b.ToTable("Users");
                });

            modelBuilder.Entity("Sponsorkit.Domain.Models.Bounty", b =>
                {
                    b.HasOne("Sponsorkit.Domain.Models.User", "AwardedTo")
                        .WithMany()
                        .HasForeignKey("AwardedToId");

                    b.HasOne("Sponsorkit.Domain.Models.User", "Creator")
                        .WithMany("CreatedBounties")
                        .HasForeignKey("CreatorId")
                        .OnDelete(DeleteBehavior.Restrict)
                        .IsRequired();

                    b.HasOne("Sponsorkit.Domain.Models.Issue", "Issue")
                        .WithMany("Bounties")
                        .HasForeignKey("IssueId")
                        .OnDelete(DeleteBehavior.Cascade)
                        .IsRequired();

                    b.Navigation("AwardedTo");

                    b.Navigation("Creator");

                    b.Navigation("Issue");
                });

            modelBuilder.Entity("Sponsorkit.Domain.Models.BountyClaimRequest", b =>
                {
                    b.HasOne("Sponsorkit.Domain.Models.Bounty", "Bounty")
                        .WithMany("ClaimRequests")
                        .HasForeignKey("BountyId")
                        .OnDelete(DeleteBehavior.Restrict)
                        .IsRequired();

                    b.HasOne("Sponsorkit.Domain.Models.User", "Creator")
                        .WithMany("BountyClaimRequests")
                        .HasForeignKey("CreatorId")
                        .OnDelete(DeleteBehavior.Restrict)
                        .IsRequired();

                    b.HasOne("Sponsorkit.Domain.Models.PullRequest", "PullRequest")
                        .WithMany()
                        .HasForeignKey("PullRequestId")
                        .OnDelete(DeleteBehavior.Cascade)
                        .IsRequired();

                    b.Navigation("Bounty");

                    b.Navigation("Creator");

                    b.Navigation("PullRequest");
                });

            modelBuilder.Entity("Sponsorkit.Domain.Models.Issue", b =>
                {
                    b.HasOne("Sponsorkit.Domain.Models.Repository", "Repository")
                        .WithMany("Issues")
                        .HasForeignKey("RepositoryId")
                        .OnDelete(DeleteBehavior.Cascade)
                        .IsRequired();

                    b.OwnsOne("Sponsorkit.Domain.Models.IssueGitHubInformation", "GitHub", b1 =>
                        {
                            b1.Property<Guid>("IssueId")
                                .HasColumnType("uuid");

                            b1.Property<long>("Id")
                                .HasColumnType("bigint");

                            b1.Property<int>("Number")
                                .HasColumnType("integer");

                            b1.Property<string>("TitleSnapshot")
                                .IsRequired()
                                .HasColumnType("text");

                            b1.HasKey("IssueId");

                            b1.ToTable("Issues");

                            b1.WithOwner()
                                .HasForeignKey("IssueId");
                        });

                    b.Navigation("GitHub")
                        .IsRequired();

                    b.Navigation("Repository");
                });

            modelBuilder.Entity("Sponsorkit.Domain.Models.Payment", b =>
                {
                    b.HasOne("Sponsorkit.Domain.Models.Bounty", "Bounty")
                        .WithMany("Payments")
                        .HasForeignKey("BountyId")
                        .OnDelete(DeleteBehavior.Restrict);

                    b.HasOne("Sponsorkit.Domain.Models.Sponsorship", "Sponsorship")
                        .WithMany("Payments")
                        .HasForeignKey("SponsorshipId");

                    b.Navigation("Bounty");

                    b.Navigation("Sponsorship");
                });

            modelBuilder.Entity("Sponsorkit.Domain.Models.PullRequest", b =>
                {
                    b.HasOne("Sponsorkit.Domain.Models.Repository", "Repository")
                        .WithMany("PullRequests")
                        .HasForeignKey("RepositoryId")
                        .OnDelete(DeleteBehavior.Restrict)
                        .IsRequired();

                    b.OwnsOne("Sponsorkit.Domain.Models.PullRequestGitHubInformation", "GitHub", b1 =>
                        {
                            b1.Property<Guid>("PullRequestId")
                                .HasColumnType("uuid");

                            b1.Property<long>("Id")
                                .HasColumnType("bigint");

                            b1.Property<int>("Number")
                                .HasColumnType("integer");

                            b1.HasKey("PullRequestId");

                            b1.ToTable("PullRequests");

                            b1.WithOwner()
                                .HasForeignKey("PullRequestId");
                        });

                    b.Navigation("GitHub")
                        .IsRequired();

                    b.Navigation("Repository");
                });

            modelBuilder.Entity("Sponsorkit.Domain.Models.Repository", b =>
                {
                    b.HasOne("Sponsorkit.Domain.Models.User", "Owner")
                        .WithMany("Repositories")
                        .HasForeignKey("OwnerId");

                    b.OwnsOne("Sponsorkit.Domain.Models.RepositoryGitHubInformation", "GitHub", b1 =>
                        {
                            b1.Property<Guid>("RepositoryId")
                                .HasColumnType("uuid");

                            b1.Property<long>("Id")
                                .HasColumnType("bigint");

                            b1.Property<string>("Name")
                                .IsRequired()
                                .HasColumnType("text");

                            b1.Property<string>("OwnerName")
                                .IsRequired()
                                .HasColumnType("text");

                            b1.HasKey("RepositoryId");

                            b1.ToTable("Repositories");

                            b1.WithOwner()
                                .HasForeignKey("RepositoryId");
                        });

                    b.Navigation("GitHub")
                        .IsRequired();

                    b.Navigation("Owner");
                });

            modelBuilder.Entity("Sponsorkit.Domain.Models.Sponsorship", b =>
                {
                    b.HasOne("Sponsorkit.Domain.Models.User", "Beneficiary")
                        .WithMany("AwardedSponsorships")
                        .HasForeignKey("BeneficiaryId")
                        .OnDelete(DeleteBehavior.Restrict)
                        .IsRequired();

                    b.HasOne("Sponsorkit.Domain.Models.Repository", "Repository")
                        .WithMany("Sponsorships")
                        .HasForeignKey("SponsorId")
                        .OnDelete(DeleteBehavior.Restrict)
                        .IsRequired();

                    b.HasOne("Sponsorkit.Domain.Models.User", "Sponsor")
                        .WithMany("CreatedSponsorships")
                        .HasForeignKey("SponsorId")
                        .OnDelete(DeleteBehavior.Restrict)
                        .IsRequired();

                    b.Navigation("Beneficiary");

                    b.Navigation("Repository");

                    b.Navigation("Sponsor");
                });

            modelBuilder.Entity("Sponsorkit.Domain.Models.User", b =>
                {
                    b.OwnsOne("Sponsorkit.Domain.Models.UserGitHubInformation", "GitHub", b1 =>
                        {
                            b1.Property<Guid>("UserId")
                                .HasColumnType("uuid");

                            b1.Property<byte[]>("EncryptedAccessToken")
                                .IsRequired()
                                .HasColumnType("bytea");

                            b1.Property<long>("Id")
                                .HasColumnType("bigint");

                            b1.Property<string>("Username")
                                .IsRequired()
                                .HasColumnType("text");

                            b1.HasKey("UserId");

                            b1.ToTable("Users");

                            b1.WithOwner()
                                .HasForeignKey("UserId");
                        });

                    b.Navigation("GitHub");
                });

            modelBuilder.Entity("Sponsorkit.Domain.Models.Bounty", b =>
                {
                    b.Navigation("ClaimRequests");

                    b.Navigation("Payments");
                });

            modelBuilder.Entity("Sponsorkit.Domain.Models.Issue", b =>
                {
                    b.Navigation("Bounties");
                });

            modelBuilder.Entity("Sponsorkit.Domain.Models.Repository", b =>
                {
                    b.Navigation("Issues");

                    b.Navigation("PullRequests");

                    b.Navigation("Sponsorships");
                });

            modelBuilder.Entity("Sponsorkit.Domain.Models.Sponsorship", b =>
                {
                    b.Navigation("Payments");
                });

            modelBuilder.Entity("Sponsorkit.Domain.Models.User", b =>
                {
                    b.Navigation("AwardedSponsorships");

                    b.Navigation("BountyClaimRequests");

                    b.Navigation("CreatedBounties");

                    b.Navigation("CreatedSponsorships");

                    b.Navigation("Repositories");
                });
#pragma warning restore 612, 618
        }
    }
}
