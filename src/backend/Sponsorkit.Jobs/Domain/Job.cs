namespace Sponsorkit.Jobs.Domain;

public abstract class Job<TResult> : IJob<TResult> where TResult : class
{
    public abstract string Identifier { get; }

    public abstract Task<TResult> ExecuteAsync(CancellationToken cancellationToken = default);

    async Task<object> IJob.ExecuteAsync(CancellationToken cancellationToken)
    {
        return await ExecuteAsync(cancellationToken);
    }
}