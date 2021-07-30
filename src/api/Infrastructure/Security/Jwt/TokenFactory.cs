using System;
using System.Diagnostics;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.IdentityModel.Tokens;

namespace Sponsorkit.Infrastructure.Security.Jwt
{
    public class TokenGenerator
    {
        public TokenGenerator()
        {
            
        }
        
        public string GenerateJwtTokenForUser(Claim[] claims)
        {
            var tokenHandler = new JwtSecurityTokenHandler();
            var tokenDescriptor = new SecurityTokenDescriptor
            {
                Subject = new ClaimsIdentity(claims),
                Expires = Debugger.IsAttached ? 
                    DateTime.UtcNow.AddHours(24) : 
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
}