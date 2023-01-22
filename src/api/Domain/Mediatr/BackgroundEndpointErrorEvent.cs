using System;
using MediatR;

namespace Sponsorkit.Domain.Mediatr;

public record BackgroundEndpointErrorEvent(Exception Exception) : INotification;