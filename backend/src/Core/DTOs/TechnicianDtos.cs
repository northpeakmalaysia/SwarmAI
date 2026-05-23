using FieldPulse.Core.Enums;

namespace FieldPulse.Core.DTOs;

public class CreateTechnicianRequest
{
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string? Email { get; set; }
    public string? Phone { get; set; }
    public string? Specialization { get; set; }
}

public class UpdateTechnicianRequest
{
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string? Email { get; set; }
    public string? Phone { get; set; }
    public TechnicianStatus Status { get; set; } = TechnicianStatus.Active;
    public string? Specialization { get; set; }
}

public class TechnicianDto
{
    public Guid Id { get; set; }
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string? Email { get; set; }
    public string? Phone { get; set; }
    public TechnicianStatus Status { get; set; }
    public string? Specialization { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }
}
