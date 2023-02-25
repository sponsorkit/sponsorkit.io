using System.Diagnostics;
using Flurl;

namespace Sponsorkit.BusinessLogic.Domain.Helpers;

public class LinkHelper
{
    public static string GetApiUrl(string relativePath)
    {
        var baseUrl = Debugger.IsAttached ? "http://localhost:5000" : "https://api.sponsorkit.io";
        return baseUrl + relativePath;
    }
        
    public static string GetWebUrl(string relativePath)
    {
        var baseUrl = Debugger.IsAttached ? "http://localhost:3000" : "https://sponsorkit.io";
        return baseUrl + relativePath;
    }
        
    public static string GetApiLandingPageRedirectUrl(string relativePath, Guid broadcastId)
    {
        return GetApiUrl($"{relativePath}?broadcastId={broadcastId}");
    }
        
    public static string GetLandingPageUrl(string relativePath, Guid broadcastId)
    {
        return GetWebUrl($"{relativePath}?broadcastId={broadcastId}");
    }
        
    public static string GetStripeConnectActivateUrl(Guid broadcastId)
    {
        return GetLandingPageUrl($"/landing/stripe-connect/activate", broadcastId);
    }

    public static string GetBountyLink(
        string ownerName,
        string repositoryName,
        int number)
    {
        return GetWebUrl($"/bounties/view?owner={Url.Encode(ownerName)}&repo={Url.Encode(repositoryName)}&number={number}");
    }
}