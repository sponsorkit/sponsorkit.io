using System.IO;
using System.Threading.Tasks;
using Microsoft.Azure.Functions.Worker.Http;
using JsonSerializer = System.Text.Json.JsonSerializer;

namespace Sponsorkit.Tests.TestHelpers.Azure
{
    public static class HttpResponseDataExtensions
    {
        public static async Task<TResponse> ToObject<TResponse>(this HttpResponseData response)
        {
            using var reader = new StreamReader(response.Body);
            var json = await reader.ReadToEndAsync();
            return JsonSerializer.Deserialize<TResponse>(json);
        }
    }
}