using System.Diagnostics.CodeAnalysis;
using Destructurama.Attributed;

namespace Sponsorkit.BusinessLogic.Infrastructure.Options;

[ExcludeFromCodeCoverage]
public class StripeOptions
{
    [NotLogged] public string? SecretKey { get; set; }

    [NotLogged] public string? PublishableKey { get; set; }

    [NotLogged] public string? WebhookSecretKey { get; set; }

    [NotLogged] public string? VerifiedConnectAccountId { get; set; }
}