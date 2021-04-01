using System;
using System.IO;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.WebJobs;
using Microsoft.Azure.WebJobs.Extensions.Http;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;

namespace Sponsorkit.Domain.Api.Browser
{
    public class Request {}
    public class Response {
        public string Token {get;set;}
    }

    public class Get
    {
        [FunctionName("BrowserGet")]
        public async Task<Response> Run(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", "post", Route = "browser/{token}")] 
            Request request,
            string token)
        {
            return new Response() {
                Token = token ?? "default-token"
            };
        }
    }
}
