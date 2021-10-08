using System;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.IdentityModel.Tokens;
using Sponsorkit.Infrastructure.Options;

namespace Sponsorkit.Infrastructure.Security.Jwt
{
    public static class JwtValidator
    {
        public static TokenValidationParameters GetValidationParameters(
            JwtOptions jwtOptions,
            bool? validateLifetime = null)
        {
            return new()
            {
                ValidateIssuerSigningKey = true,
                ValidAudience = "sponsorkit.io",
                ValidateAudience = true,
                ValidateActor = false,
                ValidateIssuer = false,
                ValidateLifetime = validateLifetime ?? true,
                ValidateTokenReplay = false,
                IssuerSigningKey = new SymmetricSecurityKey(
                    Encoding.UTF8.GetBytes(jwtOptions.PrivateKey)),
                ClockSkew = validateLifetime == false ? 
                    TimeSpan.FromDays(365 * 10) :
                    TimeSpan.FromMinutes(5)
            };
        }

        public static ClaimsPrincipal? GetClaimsPrincipal(
            string token,
            TokenValidationParameters parameters)
        {
            var handler = new JwtSecurityTokenHandler();

            try
            {
                return handler.ValidateToken(
                    token,
                    parameters,
                    out _);
            }
            catch (SecurityTokenException)
            {
                return null;
            }
            catch (ArgumentException)
            {
                return null;
            }
        }
    }
}