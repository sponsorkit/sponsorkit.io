using MediatR;

namespace Sponsorkit.BusinessLogic.Domain.Mediatr;

public record BackgroundEndpointErrorEvent(Exception Exception) : INotification;