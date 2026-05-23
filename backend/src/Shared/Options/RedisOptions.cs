using System.ComponentModel.DataAnnotations;

namespace FieldPulse.Shared.Options;

public class RedisOptions
{
    public const string SectionName = "Redis";

    [Required]
    public string ConnectionString { get; set; } = string.Empty;

    public int DefaultExpirationMinutes { get; set; } = 30;
}
