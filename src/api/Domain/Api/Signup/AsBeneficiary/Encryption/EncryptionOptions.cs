using System.Diagnostics.CodeAnalysis;
using Destructurama.Attributed;

namespace Sponsorkit.Domain.Api.Signup.AsBeneficiary.Encryption
{
    [ExcludeFromCodeCoverage]
    public class EncryptionOptions
    {
        [NotLogged]
        public string? Pepper { get; set; }
    }
}
