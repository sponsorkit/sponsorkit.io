namespace Sponsorkit.Jobs.Domain;

public interface IJob<TResult> : IJob
{
    new Task<TResult> ExecuteAsync(CancellationToken cancellationToken = default);
}

public interface IJob
{
    string Identifier { get; }

    Task<object> ExecuteAsync(CancellationToken cancellationToken = default);
}