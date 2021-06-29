using System.Threading;
using System.Threading.Tasks;

namespace Sponsorkit.Domain.Controllers.Webhooks.Stripe.Handlers
{
    public interface IWebhookEventHandler
    {
        bool CanHandle(string type);

        Task HandleAsync(object data, CancellationToken cancellationToken);
    }

}