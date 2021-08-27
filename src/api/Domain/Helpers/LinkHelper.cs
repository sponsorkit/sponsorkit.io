using System.Diagnostics;

namespace Sponsorkit.Domain.Helpers
{
    public class LinkHelper
    {
        public static string GetApiUrl(string relativePath)
        {
            var baseUrl = Debugger.IsAttached ? "http://localhost:5000" : "https://api.sponsorkit.io";
            return baseUrl + relativePath;
        }
        
        public static string GetWebUrl(string relativePath)
        {
            var baseUrl = Debugger.IsAttached ? "http://localhost:8000" : "https://sponsorkit.io";
            return baseUrl + relativePath;
        }
    }
}