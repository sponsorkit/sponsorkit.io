using System.Threading.Tasks;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Sponsorkit.Infrastructure;

namespace Sponsorkit.Domain.Api
{
    public class Health
    {
        [Function(nameof(Health))]
        public async Task<HttpResponseData> Run(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "health")] 
            HttpRequestData request,
            string beneficiary,
            string reference)
        {
            return await request.CreateOkResponseAsync();
        }
    }
}
