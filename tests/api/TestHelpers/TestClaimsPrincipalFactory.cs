using System;
using System.Security.Claims;

namespace Sponsorkit.Tests.TestHelpers
{
    public class TestClaimsPrincipalFactory
    {
        public static ClaimsPrincipal CreateWithUserId(Guid id)
        {
            return new ClaimsPrincipal(
                new ClaimsIdentity(
                    new[]
                    {
                        new Claim(ClaimTypes.NameIdentifier, id.ToString())
                    }));
        }
    }
}