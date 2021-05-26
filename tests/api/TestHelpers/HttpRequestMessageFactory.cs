using System;
using System.IO;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;

namespace Sponsorkit.Tests.TestHelpers
{
    public static class HttpRequestMessageFactory
    {
        public static HttpRequestMessage FromObject<T>(T obj)
        {
            var json = JsonSerializer.Serialize(obj);
            return new HttpRequestMessage()
            {
                Content = new StringContent(json, Encoding.UTF8, "application/json"),
                RequestUri = new Uri("https://example.com"),
            };
        }
    }
}