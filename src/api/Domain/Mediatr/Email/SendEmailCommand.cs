using System;
using System.Collections.Generic;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using Amazon.SimpleEmailV2;
using Amazon.SimpleEmailV2.Model;
using MediatR;
using RazorLight;

namespace Sponsorkit.Domain.Mediatr.Email
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
        string TemplateDirectory,
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
            var template = await System.IO.File.ReadAllTextAsync(
                Path.Combine(
                    "Domain",
                    "Mediatr",
                    "Email",
                    "Templates",
                    request.TemplateDirectory,
                    "Template.cshtml"),
                cancellationToken);

            var engine = new RazorLightEngineBuilder()
                .UseFileSystemProject(Environment.CurrentDirectory)
                .UseMemoryCachingProvider()
                .Build();

            var html = await engine.CompileRenderStringAsync(request.TemplateDirectory, template, request.Model);
            return html;
        }
    }
}