using Destructurama.Attributed;

namespace Sponsorkit.BusinessLogic.Infrastructure.Options;

public class SqlOptions
{
    [NotLogged]
    public string ConnectionString { get; set; } = null!;
}