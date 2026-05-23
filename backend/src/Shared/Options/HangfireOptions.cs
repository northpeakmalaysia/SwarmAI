using System.ComponentModel.DataAnnotations;

namespace FieldPulse.Shared.Options;

public class HangfireOptions
{
    public const string SectionName = "Hangfire";

    [Required]
    public string ConnectionString { get; set; } = string.Empty;

    public int WorkerCount { get; set; } = 5;

    public int QueuePollIntervalSeconds { get; set; } = 15;
}
