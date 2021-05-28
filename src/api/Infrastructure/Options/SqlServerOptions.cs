using Destructurama.Attributed;

namespace Sponsorkit.Infrastructure.Options
{
    public class SqlServerOptions
    {
        [NotLogged]
        public string ConnectionString { get; set; } = null!;
    }
}