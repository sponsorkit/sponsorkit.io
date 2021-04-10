using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Sponsorkit.Infrastructure;

#pragma warning disable 8618

namespace Sponsorkit.Domain.Models
{
    public class DataContext : DbContext
    {
        public DbSet<Bounty> Bounties { get; set; }
        public DbSet<Identity> Identities { get; set; }
        public DbSet<Issue> Issues { get; set; }
        public DbSet<Payment> Payments { get; set; }
        public DbSet<Repository> Repositories { get; set; }
        public DbSet<Sponsorship> Sponsorships { get; set; }
        public DbSet<User> Users { get; set; }
        
        private readonly IOptions<CosmosOptions> _options;

        public DataContext(
            IOptions<CosmosOptions> options)
        {
            _options = options;
        }
        
        protected override void OnConfiguring(DbContextOptionsBuilder optionsBuilder)
        {
            optionsBuilder.UseCosmos(
                _options.Value.AccountEndpoint,
                _options.Value.AccountKey);
        }
    }
}