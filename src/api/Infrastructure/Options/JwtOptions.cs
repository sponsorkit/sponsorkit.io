using Destructurama.Attributed;

namespace Sponsorkit.Infrastructure.Options
{
    public class JwtOptions
    {
        [NotLogged] public string JwtPrivateKey { get; set; } = null!;
    }
}