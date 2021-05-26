using System.IO;
using System.Net;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;

namespace Sponsorkit.Tests.TestHelpers.Azure
{
    public class HttpResponseDataMock : HttpResponseData
    {
        public HttpResponseDataMock(FunctionContext functionContext) : base(functionContext)
        {
            Headers = new HttpHeadersCollection();
        }

        public override HttpStatusCode StatusCode { get; set; }
        public override HttpHeadersCollection Headers { get; set; }
        public override Stream Body { get; set; }
        public override HttpCookies Cookies { get; }
    }
}