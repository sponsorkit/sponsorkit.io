using System.Net;
using System.Threading.Tasks;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Net.Http.Headers;

namespace Sponsorkit.Infrastructure
{
    public static class HttpRequestDataExtensions
    {
        private static async Task<HttpResponseData> CreateStatusCodeResponseAsync<T>(
            this HttpRequestData request,
            HttpStatusCode statusCode,
            T? content)
        {
            var response = request.CreateResponse(statusCode);
            if (!Equals(content, default(T)))
            {
                await response.WriteAsJsonAsync(content);
            }

            return response;
        }
        
        public static async Task<HttpResponseData> CreateOkResponseAsync<T>(
            this HttpRequestData request,
            T content)
        {
            return await CreateStatusCodeResponseAsync(
                request,
                HttpStatusCode.OK,
                content);
        }
        
        public static async Task<HttpResponseData> CreateOkResponseAsync(
            this HttpRequestData request)
        {
            return await CreateStatusCodeResponseAsync<object>(
                request,
                HttpStatusCode.OK,
                null);
        }
        
        public static async Task<HttpResponseData> CreateBadRequestResponseAsync<T>(
            this HttpRequestData request,
            T content)
        {
            return await CreateStatusCodeResponseAsync(
                request,
                HttpStatusCode.BadRequest,
                content);
        }

        public static HttpResponseData CreateRedirectResponseAsync(
            this HttpRequestData request,
            string location)
        {
            var response = request.CreateResponse(HttpStatusCode.Redirect);
            response.Headers.Add(HeaderNames.Location, location);

            return response;
        }
    }
}