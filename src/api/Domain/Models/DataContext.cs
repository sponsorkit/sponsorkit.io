﻿using System;
using System.Data;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Sponsorkit.Infrastructure;

#pragma warning disable 8618

namespace Sponsorkit.Domain.Models
{
    public class DataContext : DbContext
    {
        public DbSet<Bounty> Bounties { get; set; }
        public DbSet<Issue> Issues { get; set; }
        public DbSet<Payment> Payments { get; set; }
        public DbSet<Repository> Repositories { get; set; }
        public DbSet<Sponsorship> Sponsorships { get; set; }
        public DbSet<User> Users { get; set; }
        
        private readonly IOptions<SqlServerOptions> sqlServerOptions;

        public DataContext(
            IOptions<SqlServerOptions> sqlServerOptions) 
        {
            this.sqlServerOptions = sqlServerOptions;
        }

        public async Task ExecuteInTransactionAsync(
            Func<Task> action,
            IsolationLevel? isolationLevel = IsolationLevel.ReadUncommitted)
        {
            await ExecuteInTransactionAsync<object?>(
                async () =>
                {
                    await action();
                    return null;
                },
                isolationLevel);
        }

        public async Task<T> ExecuteInTransactionAsync<T>(
            Func<Task<T>> action,
            IsolationLevel? isolationLevel = IsolationLevel.ReadUncommitted)
        {
            if (this.Database.CurrentTransaction != null)
                return await action();

            var strategy = this.Database.CreateExecutionStrategy();
            return await strategy.ExecuteAsync(async () =>
            {
                await using var transaction = await this.Database.BeginTransactionAsync(
                    isolationLevel ?? IsolationLevel.ReadUncommitted);

                try
                {
                    var result = await action();
                    await transaction.CommitAsync();

                    return result;
                }
                catch
                {
                    await transaction.RollbackAsync();
                    throw;
                }
            });
        }
        
        protected override void OnConfiguring(DbContextOptionsBuilder optionsBuilder)
        {
            optionsBuilder.EnableSensitiveDataLogging();
            optionsBuilder.EnableDetailedErrors();

            var connectionString = sqlServerOptions.Value.ConnectionString;
            optionsBuilder.UseSqlServer(connectionString);
        }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            modelBuilder.Entity<Bounty>(entity =>
            {
                entity
                    .HasOne(x => x.Creator)
                    .WithMany(x => x.CreatedBounties)
                    .HasForeignKey(x => x.CreatorId)
                    .OnDelete(DeleteBehavior.NoAction);

                entity
                    .HasOne(x => x.AwardedTo)
                    .WithMany(x => x!.AwardedBounties)
                    .HasForeignKey(x => x.AwardedToId)
                    .OnDelete(DeleteBehavior.NoAction);
            });
            
            modelBuilder.Entity<Sponsorship>(entity =>
            {
                entity
                    .HasOne(x => x.Beneficiary)
                    .WithMany(x => x.AwardedSponsorships)
                    .HasForeignKey(x => x.BeneficiaryId)
                    .OnDelete(DeleteBehavior.NoAction);
                
                entity
                    .HasOne(x => x.Sponsor)
                    .WithMany(x => x.CreatedSponsorships)
                    .HasForeignKey(x => x.SponsorId)
                    .OnDelete(DeleteBehavior.NoAction);

                entity
                    .HasOne(x => x.Repository)
                    .WithMany(x => x!.Sponsorships)
                    .HasForeignKey(x => x.SponsorId)
                    .OnDelete(DeleteBehavior.NoAction);
            });

            ConfigureSeeding(modelBuilder);
        }

        private static void ConfigureSeeding(ModelBuilder modelBuilder)
        {
            var beneficiaryUserId = new Guid("681c2d58-7a3f-49fb-ada8-697c06708d32");
            var sponsorUserId = Guid.NewGuid();
            modelBuilder
                .Entity<User>()
                .HasData(
                    new User()
                    {
                        Id = beneficiaryUserId,
                        StripeCustomerId = "foo",
                        CreatedAtUtc = DateTime.UtcNow,
                        GitHubId = 2824010
                    },
                    new User()
                    {
                        Id = sponsorUserId,
                        CreatedAtUtc = DateTime.UtcNow
                    });

            var sponsorshipId = Guid.NewGuid();
            modelBuilder
                .Entity<Sponsorship>()
                .HasData(new Sponsorship()
                {
                    Id = sponsorshipId,
                    Reference = "sponsorship-foo",
                    SponsorId = sponsorUserId,
                    BeneficiaryId = beneficiaryUserId
                });

            modelBuilder
                .Entity<Payment>()
                .HasData(
                    new Payment()
                    {
                        Id = Guid.NewGuid(),
                        StripeId = "foo",
                        SponsorshipId = sponsorshipId,
                        AmountInHundreds = 1_00
                    },
                    new Payment()
                    {
                        Id = Guid.NewGuid(),
                        StripeId = "foo",
                        SponsorshipId = sponsorshipId,
                        AmountInHundreds = 2_50
                    });
        }
    }
}