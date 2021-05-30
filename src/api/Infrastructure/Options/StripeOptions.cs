using System.Diagnostics.CodeAnalysis;
using Destructurama.Attributed;

namespace Sponsorkit.Infrastructure.Options
{
    [ExcludeFromCodeCoverage]
    public class StripeOptions
    {
        [NotLogged]
        public string? SecretKey { get; init; }

        [NotLogged]
        public string? PublishableKey { get; init; }
    }
}
