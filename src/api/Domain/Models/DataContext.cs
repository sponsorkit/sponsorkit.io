using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Sponsorkit.Infrastructure;

namespace Sponsorkit.Domain.Models
{
    public class DataContext : DbContext
    {
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