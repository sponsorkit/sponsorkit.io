using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IdentityModel.Tokens.Jwt;
using System.Linq;
using System.Security.Claims;
using System.Text;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using Sponsorkit.Infrastructure.Options;

namespace Sponsorkit.Infrastructure.Security.Jwt;

public class TokenFactory : ITokenFactory
{
    private readonly IOptionsMonitor<JwtOptions> jwtOptionsMonitor;

    public TokenFactory(
        IOptionsMonitor<JwtOptions> jwtOptionsMonitor)
    {
        this.jwtOptionsMonitor = jwtOptionsMonitor;
    }
        
    public string Create(IEnumerable<Claim> claims)
    {
        var tokenHandler = new JwtSecurityTokenHandler();
        var tokenDescriptor = new SecurityTokenDescriptor
        {
            Subject = new ClaimsIdentity(claims.DistinctBy(x => x.Type)),
            Expires = Debugger.IsAttached ? 
                DateTime.UtcNow.AddSeconds(30) : 
                DateTime.UtcNow.AddMinutes(15),
            SigningCredentials = new SigningCredentials(
                new SymmetricSecurityKey(
                    Encoding.ASCII.GetBytes(jwtOptionsMonitor.CurrentValue.PrivateKey)),
                SecurityAlgorithms.HmacSha512Signature),
            Audience = "sponsorkit.io",
            Issuer = "sponsorkit.io"
        };

        var token = tokenHandler.CreateToken(tokenDescriptor);
        
        return tokenHandler.WriteToken(token);
    }
}