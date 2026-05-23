using FieldPulse.Core.Interfaces;

namespace FieldPulse.Api.Tests.Infrastructure;

public class FakeEmailService : IEmailService
{
    public Task SendEmailAsync(string to, string subject, string body, bool isHtml = false, CancellationToken ct = default) => Task.CompletedTask;
    public Task SendTemplatedEmailAsync(string to, string templateName, object model, CancellationToken ct = default) => Task.CompletedTask;
}
