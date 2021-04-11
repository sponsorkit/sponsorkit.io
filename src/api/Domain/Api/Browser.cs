using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;

namespace Sponsorkit.Domain.Api
{
    public class Browser
    {
        public class Request {}
        
        [Function("BrowserGet")]
        public IActionResult Run(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "browser/{beneficiary}/{reference}")] 
            HttpRequestData request,
            string beneficiary,
            string reference)
        {
            return new RedirectResult($"/{beneficiary}?reference={reference}");
        }
    }
}
