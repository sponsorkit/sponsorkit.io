namespace Sponsorkit.Jobs.Domain;

public interface IJob
{
    string Identifier { get; }
    
    Task ExecuteAsync(CancellationToken cancellationToken);
}