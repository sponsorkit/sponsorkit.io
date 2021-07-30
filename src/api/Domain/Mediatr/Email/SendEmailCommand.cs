using System.Threading;
using System.Threading.Tasks;
using MediatR;

namespace Sponsorkit.Domain.Mediatr
{
    public enum EmailSender
    {
        Sponsorkit,
        Bountyhunt
    }
    
    public record SendEmailCommand(
        EmailSender Sender,
        string To,
        string Subject,
        string HtmlBody) : IRequest;
    
    public class SendEmailCommandHandler : IRequestHandler<SendEmailCommand>
    {
        public Task<Unit> Handle(SendEmailCommand request, CancellationToken cancellationToken)
        {
            throw new System.NotImplementedException();
        }
    }
}