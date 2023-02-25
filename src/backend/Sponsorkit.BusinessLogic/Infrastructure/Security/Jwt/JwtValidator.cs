using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.IdentityModel.Tokens;
using Sponsorkit.BusinessLogic.Infrastructure.Options;

namespace Sponsorkit.BusinessLogic.Infrastructure.Security.Jwt;

public static class JwtValidator
{
    public static TokenValidationParameters GetValidationParameters(
        JwtOptions jwtOptions,
        TimeSpan expiration)
    {
        return new()
        {
            ValidateIssuerSigningKey = true,
            ValidAudience = "sponsorkit.io",
            ValidateAudience = true,
            ValidateActor = false,
            ValidateIssuer = false,
            ValidateLifetime = true,
            ValidateTokenReplay = false,
            IssuerSigningKey = new SymmetricSecurityKey(
                Encoding.UTF8.GetBytes(jwtOptions.PrivateKey)),
            ClockSkew = expiration
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