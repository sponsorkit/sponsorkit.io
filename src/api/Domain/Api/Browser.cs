using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.WebJobs;
using Microsoft.Azure.WebJobs.Extensions.Http;

namespace Sponsorkit.Domain.Api
{
    public class Browser
    {
        public class Request {}
        
        [FunctionName("BrowserGet")]
        public IActionResult Run(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "browser/{beneficiary}/{reference}")] 
            Request request,
            string beneficiary,
            string reference)
        {
            return new RedirectResult($"/{beneficiary}?reference={reference}");
        }
    }
}
