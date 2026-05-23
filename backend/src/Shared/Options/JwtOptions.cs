using System.ComponentModel.DataAnnotations;

namespace Sakinah.Shared.Options;

public class JwtOptions
{
    public const string SectionName = "Jwt";

    [Required]
    public string Secret { get; set; } = string.Empty;

    [Required]
    public string Issuer { get; set; } = string.Empty;

    [Required]
    public string Audience { get; set; } = string.Empty;

    [Range(1, int.MaxValue)]
    public int ExpirationMinutes { get; set; } = 60;

    [Range(1, int.MaxValue)]
    public int RefreshTokenExpirationDays { get; set; } = 7;
}
