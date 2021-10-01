using System.Collections.Generic;
using System.Security.Claims;

namespace Sponsorkit.Infrastructure.Security.Jwt
{
    public interface ITokenFactory
    {
        string Create(IEnumerable<Claim> claims);
    }
}