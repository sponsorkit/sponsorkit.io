using System.Diagnostics.CodeAnalysis;
using Destructurama.Attributed;

namespace Sponsorkit.Infrastructure.Security.Encryption
{
    [ExcludeFromCodeCoverage]
    public class EncryptionOptions
    {
        [NotLogged]
        public string? Pepper { get; set; }
    }
}
