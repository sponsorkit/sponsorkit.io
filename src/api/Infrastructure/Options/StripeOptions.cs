using System.Diagnostics.CodeAnalysis;
using Destructurama.Attributed;

namespace Sponsorkit.Infrastructure.Options
{
    [ExcludeFromCodeCoverage]
    public class StripeOptions
    {
        [NotLogged] public string SecretKey { get; set; } = null!;

        [NotLogged] public string PublishableKey { get; set; } = null!;

        [NotLogged] public string WebhookSecretKey { get; set; } = null!;
    }
}