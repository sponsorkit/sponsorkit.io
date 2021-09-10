using System;
using System.Data;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;

#pragma warning disable 8618

namespace Sponsorkit.Domain.Models.Context
{
    public class DataContext : DbContext
    {
        public DbSet<Bounty> Bounties { get; set; }
        public DbSet<Issue> Issues { get; set; }
        public DbSet<Payment> Payments { get; set; }
        public DbSet<Repository> Repositories { get; set; }
        public DbSet<Sponsorship> Sponsorships { get; set; }
        public DbSet<User> Users { get; set; }
        public DbSet<BountyClaimRequest> BountyClaimRequests { get; set; }
        public DbSet<PullRequest> PullRequests { get; set; }

        public DataContext(DbContextOptions<DataContext> options) : base(options)
        {
        }

        public async Task ExecuteInTransactionAsync(
            Func<Task> action,
            IsolationLevel? isolationLevel = null)
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
            IsolationLevel? isolationLevel = null)
        {
            if (Database.CurrentTransaction != null)
                return await action();

            var strategy = Database.CreateExecutionStrategy();
            return await strategy.ExecuteAsync(async () =>
            {
                await using var transaction = await Database.BeginTransactionAsync(
                    isolationLevel ?? IsolationLevel.Serializable);

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

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            modelBuilder.ApplyConfigurationsFromAssembly(typeof(DataContext).Assembly);
        }
    }
}