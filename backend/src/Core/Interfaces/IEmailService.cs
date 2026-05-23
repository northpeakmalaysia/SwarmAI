namespace Sakinah.Core.Interfaces;

public interface IEmailService
{
    Task SendEmailAsync(string to, string subject, string body, bool isHtml = false, CancellationToken cancellationToken = default);
    Task SendTemplatedEmailAsync(string to, string templateName, object model, CancellationToken cancellationToken = default);
}
