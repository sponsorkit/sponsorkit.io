using Destructurama.Attributed;

namespace Sponsorkit.Infrastructure.Options
{
    public class SqlOptions
    {
        [NotLogged]
        public string ConnectionString { get; init; } = null!;
    }
}