using System.ComponentModel.DataAnnotations;

namespace Sakinah.Shared.Options;

public class SmtpOptions
{
    public const string SectionName = "Smtp";

    [Required]
    public string Host { get; set; } = string.Empty;

    [Range(1, 65535)]
    public int Port { get; set; } = 587;

    public string? Username { get; set; }
    public string? Password { get; set; }
    public bool EnableSsl { get; set; } = true;

    [Required]
    public string FromAddress { get; set; } = string.Empty;

    public string FromName { get; set; } = string.Empty;
}
