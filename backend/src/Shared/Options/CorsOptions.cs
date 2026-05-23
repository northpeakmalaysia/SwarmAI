using System.ComponentModel.DataAnnotations;

namespace Sakinah.Shared.Options;

public class CorsOptions
{
    public const string SectionName = "Cors";

    [Required]
    public string[] AllowedOrigins { get; set; } = [];

    public string[] AllowedHeaders { get; set; } = ["Content-Type", "Authorization"];
    public string[] AllowedMethods { get; set; } = ["GET", "POST", "PUT", "DELETE", "PATCH"];
    public bool AllowCredentials { get; set; } = true;
}
