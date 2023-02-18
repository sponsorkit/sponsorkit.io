using System.Text.Json;
using Amazon.Lambda.Core;
using Amazon.Lambda.RuntimeSupport;
using Amazon.Lambda.Serialization.SystemTextJson;

async Task Handler(JobRequest jobRequest, ILambdaContext context)
{
    await Task.Delay(1);
    Console.WriteLine($"Executing job: {jobRequest.Job}");
}

await LambdaBootstrapBuilder
    .Create(
        (Func<JobRequest, ILambdaContext, Task>)Handler, 
        new DefaultLambdaJsonSerializer(options => 
            options.PropertyNamingPolicy = JsonNamingPolicy.CamelCase))
    .Build()
    .RunAsync();

record JobRequest(string Job);