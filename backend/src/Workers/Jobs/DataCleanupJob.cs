using Microsoft.Extensions.Logging;

namespace Sakinah.Workers.Jobs;

public class DataCleanupJob
{
    private readonly ILogger<DataCleanupJob> _logger;

    public DataCleanupJob(ILogger<DataCleanupJob> logger)
    {
        _logger = logger;
    }

    public Task ExecuteAsync()
    {
        _logger.LogInformation("[DataCleanupJob] Running daily cleanup at {Time}", DateTime.UtcNow);
        // Stub: implement old audit log archiving, expired token cleanup, etc.
        return Task.CompletedTask;
    }
}
