using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using FieldPulse.Core.Interfaces;
using FieldPulse.Shared.Options;

namespace FieldPulse.Infrastructure.Email;

public class SmtpEmailService : IEmailService
{
    private readonly SmtpOptions _options;
    private readonly ILogger<SmtpEmailService> _logger;

    public SmtpEmailService(IOptions<SmtpOptions> options, ILogger<SmtpEmailService> logger)
    {
        _options = options.Value;
        _logger = logger;
    }

    public Task SendEmailAsync(string to, string subject, string body, bool isHtml = false, CancellationToken cancellationToken = default)
    {
        _logger.LogInformation(
            "[Email Stub] Sending email to {To} from {From} via {Host}:{Port} — Subject: '{Subject}'",
            to, _options.FromAddress, _options.Host, _options.Port, subject);
        // In production, use MailKit or System.Net.Mail.SmtpClient here.
        return Task.CompletedTask;
    }

    public Task SendTemplatedEmailAsync(string to, string templateName, object model, CancellationToken cancellationToken = default)
    {
        _logger.LogInformation("[Email Stub] Sending templated email '{TemplateName}' to {To}", templateName, to);
        return Task.CompletedTask;
    }
}
