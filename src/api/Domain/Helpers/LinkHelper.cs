using System.Diagnostics;
using Flurl;

namespace Sponsorkit.Domain.Helpers;

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

    public static string GetBountyLink(
        string OwnerName,
        string RepositoryName,
        int Number)
    {
        return GetWebUrl($"/bounties/view?owner={Url.Encode(OwnerName)}&repo={Url.Encode(RepositoryName)}&number={Number}");
    }
}