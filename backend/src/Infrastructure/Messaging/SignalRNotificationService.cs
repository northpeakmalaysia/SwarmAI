using Microsoft.Extensions.Logging;
using Sakinah.Core.Interfaces;

namespace Sakinah.Infrastructure.Messaging;

public class SignalRNotificationService : IEmailService
{
    // Stub: in a real implementation this would use IHubContext<NotificationHub>
    // and send push notifications rather than emails. For now we reuse IEmailService
    // interface as a placeholder to demonstrate Infrastructure wiring.
    private readonly ILogger<SignalRNotificationService> _logger;

    public SignalRNotificationService(ILogger<SignalRNotificationService> logger)
    {
        _logger = logger;
    }

    public Task SendEmailAsync(string to, string subject, string body, bool isHtml = false, CancellationToken cancellationToken = default)
    {
        _logger.LogInformation("[SignalR Stub] Would notify user {To} with subject '{Subject}'", to, subject);
        return Task.CompletedTask;
    }

    public Task SendTemplatedEmailAsync(string to, string templateName, object model, CancellationToken cancellationToken = default)
    {
        _logger.LogInformation("[SignalR Stub] Would send templated notification '{TemplateName}' to {To}", templateName, to);
        return Task.CompletedTask;
    }
}
