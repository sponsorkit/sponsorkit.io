using System;
using System.Collections.Generic;
using System.IO;
using System.Security.Claims;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;

namespace Sponsorkit.Tests.TestHelpers.Azure
{
    public class HttpRequestDataMock : HttpRequestData
    {
        private readonly FunctionContext functionContext;

        public HttpRequestDataMock(FunctionContext functionContext) : base(functionContext)
        {
            this.functionContext = functionContext;
        }

        public override HttpResponseData CreateResponse()
        {
            return new HttpResponseDataMock(
                functionContext);
        }

        public override Stream Body { get; }
        public override HttpHeadersCollection Headers { get; }
        public override IReadOnlyCollection<IHttpCookie> Cookies { get; }
        public override Uri Url { get; }
        public override IEnumerable<ClaimsIdentity> Identities { get; }
        public override string Method { get; }
    }
}