using System;
using System.IO;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.WebJobs;
using Microsoft.Azure.WebJobs.Extensions.Http;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;

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
