using System.Diagnostics.CodeAnalysis;
using Destructurama.Attributed;

namespace Sponsorkit.Domain.Controllers.Api.Signup.FromGitHub.Encryption
{
    [ExcludeFromCodeCoverage]
    public class EncryptionOptions
    {
        [NotLogged]
        public string? Pepper { get; set; }
    }
}
