using System.Threading.Tasks;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Sponsorkit.Infrastructure;

namespace Sponsorkit.Domain.Api.Browser.BrowserGet
{
    public class Function
    {
        [Function(nameof(BrowserGet))]
        public HttpResponseData Run(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "browser/{beneficiary}/{reference}")] 
            HttpRequestData request,
            string beneficiary,
            string reference)
        {
            return request.CreateRedirectResponse(
                $"/{beneficiary}?reference={reference}");
        }
    }
}
