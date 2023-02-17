using Destructurama.Attributed;

namespace Sponsorkit.BusinessLogic.Infrastructure.Options;

public class JwtOptions
{
    [NotLogged] public string PrivateKey { get; set; } = null!;
}