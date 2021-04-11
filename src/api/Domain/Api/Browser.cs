using System.Net;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Net.Http.Headers;

namespace Sponsorkit.Domain.Api
{
    public class Browser
    {
        public class Request {}
        
        [Function("BrowserGet")]
        public HttpResponseData Run(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "browser/{beneficiary}/{reference}")] 
            HttpRequestData request,
            string beneficiary,
            string reference)
        {
            var response = request.CreateResponse(HttpStatusCode.Redirect);
            response.Headers.Add(HeaderNames.Location, $"/{beneficiary}?reference={reference}");

            return response;
        }
    }
}
