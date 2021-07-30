using System.Security.Claims;

namespace Sponsorkit.Infrastructure.Security.Jwt
{
    public interface ITokenFactory
    {
        string Create(Claim[] claims);
    }
}