using System.Diagnostics;

namespace FieldPulse.Api.Middleware;

public class RequestTimingMiddleware : IMiddleware
{
    private readonly ILogger<RequestTimingMiddleware> _logger;

    public RequestTimingMiddleware(ILogger<RequestTimingMiddleware> logger)
    {
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context, RequestDelegate next)
    {
        var stopwatch = Stopwatch.StartNew();
        _logger.LogInformation("Handling request {Method} {Path}", context.Request.Method, context.Request.Path);

        await next(context);

        stopwatch.Stop();
        _logger.LogInformation(
            "Handled request {Method} {Path} in {ElapsedMs}ms — Status {StatusCode}",
            context.Request.Method,
            context.Request.Path,
            stopwatch.ElapsedMilliseconds,
            context.Response.StatusCode);
    }
}
