using Octokit;

namespace Sponsorkit.BusinessLogic.Infrastructure.GitHub;

public static class GitHubClientExtensions
{
    public static async Task<TResponse?> TransformNotFoundErrorToNullResult<TResponse>(
        this IGitHubClient client,
        Func<IGitHubClient, Task<TResponse>> task)
        where TResponse : class
    {
        try
        {
            return await task(client);
        }
        catch (NotFoundException)
        {
            return null;
        }
    }
    
    public static async Task<TResponse> RetryOnRateLimitExceeded<TResponse>(
        this IGitHubClient client,
        Func<IGitHubClient, Task<TResponse>> task)
    {
        while (true)
        {
            try
            {
                return await task(client);
            }
            catch (RateLimitExceededException ex)
            {
                var retryAfterTimeSpan = GetRetryAfterTimespanFromHeaders(ex.HttpResponse.Headers);

                Console.WriteLine($"Waiting for rate limit to reset: {retryAfterTimeSpan}");
                await Task.Delay(retryAfterTimeSpan);
            }
            catch (SecondaryRateLimitExceededException ex)
            {
                var retryAfterTimeSpan = GetRetryAfterTimespanFromHeaders(ex.HttpResponse.Headers);
                Console.WriteLine($"Waiting for rate limit to reset: {retryAfterTimeSpan}");
                
                await Task.Delay(retryAfterTimeSpan);
            }
        }
    }

    private static TimeSpan GetRetryAfterTimespanFromHeaders(IReadOnlyDictionary<string,string> httpResponseHeaders)
    {
        if(httpResponseHeaders.ContainsKey("Retry-After"))
            return TimeSpan.FromSeconds(int.Parse(httpResponseHeaders["Retry-After"]));
        
        var resetTimeEpochSeconds = int.Parse(httpResponseHeaders["X-RateLimit-Reset"]);
        var resetTime = DateTimeOffset.FromUnixTimeSeconds(resetTimeEpochSeconds);
                
        var retryAfterTimeSpan = resetTime - DateTimeOffset.Now;
        return retryAfterTimeSpan;
    }
}