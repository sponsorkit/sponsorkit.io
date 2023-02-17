using System.Security.Claims;

namespace Sponsorkit.BusinessLogic.Infrastructure.AspNet;

public static class ClaimsPrincipalExtensions
{
    public static Guid? GetId(this ClaimsPrincipal? claimsPrincipal)
    {
        var userId = Get(
            claimsPrincipal,
            ClaimTypes.NameIdentifier);
        if (string.IsNullOrWhiteSpace(userId))
            return null;

        return new Guid(userId);
    }
        
    public static Guid GetRequiredId(this ClaimsPrincipal? claimsPrincipal)
    {
        return GetId(claimsPrincipal) ?? 
               throw new InvalidOperationException("No user ID could be found. Perhaps the user is anonymous?");
    }

    public static bool IsAnonymous(this ClaimsPrincipal? claimsPrincipal)
    {
        return GetId(claimsPrincipal) == null;
    }

    private static string? Get(
        this ClaimsPrincipal? claimsPrincipal,
        string name)
    {
        return claimsPrincipal?.Claims
            .SingleOrDefault(x => x.Type == name)
            ?.Value;
    }
}