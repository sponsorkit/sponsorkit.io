using System.Reflection;
using Amazon.SimpleEmailV2;
using Amazon.SimpleEmailV2.Model;
using MediatR;
using Microsoft.CodeAnalysis;
using RazorLight;

namespace Sponsorkit.BusinessLogic.Domain.Mediatr.Email;

public enum EmailSender
{
    Sponsorkit,
    Bountyhunt
}

public enum TemplateDirectory
{
    BountyClaimRequest,
    VerifyEmailAddress
}
    
public record SendEmailCommand(
    EmailSender Sender,
    string To,
    string Subject,
    TemplateDirectory TemplateDirectory,
    IMailModel Model) : IRequest;
    
public class SendEmailCommandHandler : IRequestHandler<SendEmailCommand>
{
    private readonly IAmazonSimpleEmailServiceV2 simpleEmailService;

    public SendEmailCommandHandler(
        IAmazonSimpleEmailServiceV2 simpleEmailService)
    {
        this.simpleEmailService = simpleEmailService;
    }
        
    public async Task<Unit> Handle(SendEmailCommand request, CancellationToken cancellationToken)
    {
        var html = await RenderRazorEmailTemplateAsync(request, cancellationToken);
        await simpleEmailService.SendEmailAsync(
            new SendEmailRequest()
            {
                FromEmailAddress = request.Sender switch
                {
                    EmailSender.Bountyhunt => "info@bountyhunt.io",
                    EmailSender.Sponsorkit => "info@sponsorkit.io",
                    _ => throw new InvalidOperationException("Invalid e-mail sender.")
                },
                Destination = new Destination()
                {
                    ToAddresses = new List<string>()
                    {
                        request.To
                    }
                },
                Content = new EmailContent()
                {
                    Simple = new Message()
                    {
                        Subject = new Content()
                        {
                            Charset = "UTF-8",
                            Data = request.Subject
                        },
                        Body = new Body()
                        {
                            Html = new Content()
                            {
                                Charset = "UTF-8",
                                Data = html
                            }
                        }
                    }
                }
            },
            cancellationToken);

        return Unit.Value;
    }

    private static async Task<string> RenderRazorEmailTemplateAsync(SendEmailCommand request, CancellationToken cancellationToken)
    {
        var template = await File.ReadAllTextAsync(
            Path.Combine(
                AppDomain.CurrentDomain.BaseDirectory,
                "Domain",
                "Mediatr",
                "Email",
                "Templates",
                request.TemplateDirectory.ToString(),
                "Template.cshtml"),
            cancellationToken);

        var executingAssembly = Assembly.GetExecutingAssembly();
        var metadataReference = MetadataReference.CreateFromFile(executingAssembly.Location);

        var engine = new RazorLightEngineBuilder()
            .UseFileSystemProject(AppDomain.CurrentDomain.BaseDirectory)
            .AddMetadataReferences(metadataReference)
            .UseMemoryCachingProvider()
            .Build();

        var html = await engine.CompileRenderStringAsync(
            request.TemplateDirectory.ToString(), 
            template, 
            request.Model);
        return html;
    }
}