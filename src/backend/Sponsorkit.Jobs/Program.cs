using System.Text.Json;
using Amazon.Lambda.Core;
using Amazon.Lambda.RuntimeSupport;
using Amazon.Lambda.Serialization.SystemTextJson;
using Sponsorkit.Jobs;

#pragma warning disable ASP0000

await LambdaBootstrapBuilder
    .Create(
        (Func<JobRequest, ILambdaContext, Task>)JobsStartup.Handler, 
        new DefaultLambdaJsonSerializer(options => 
            options.PropertyNamingPolicy = JsonNamingPolicy.CamelCase))
    .Build()
    .RunAsync();