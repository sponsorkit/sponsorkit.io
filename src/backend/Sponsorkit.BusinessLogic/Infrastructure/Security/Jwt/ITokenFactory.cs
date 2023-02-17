using System.Security.Claims;

namespace Sponsorkit.BusinessLogic.Infrastructure.Security.Jwt;

public interface ITokenFactory
{
    string Create(IEnumerable<Claim> claims);
}