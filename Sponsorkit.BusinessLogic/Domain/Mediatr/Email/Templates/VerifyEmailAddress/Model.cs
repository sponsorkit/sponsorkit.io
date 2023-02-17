namespace Sponsorkit.BusinessLogic.Domain.Mediatr.Email.Templates.VerifyEmailAddress;

public record Model(string VerificationUrl) : IMailModel;