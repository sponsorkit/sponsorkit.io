using System.IO;
using System.Text.Json;
using Microsoft.Azure.Functions.Worker.Http;
using NSubstitute;

namespace Sponsorkit.Tests.TestHelpers.Azure
{
    public static class HttpRequestMessageFactory
    {
        public static HttpRequestData Empty => 
            new HttpRequestDataMock(
                new FunctionContextMock());
        
        public static HttpRequestData FromObject<T>(T obj)
        {
            var json = JsonSerializer.Serialize(obj);
            
            var httpRequest = Substitute.ForPartsOf<HttpRequestData>();
            httpRequest.Body.Returns(_ =>
            {
                var stream = new MemoryStream();
                var writer = new StreamWriter(stream);
                writer.Write(json);

                return stream;
            });
            
            return httpRequest;
        }
    }
}