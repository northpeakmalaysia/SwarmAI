using FieldPulse.Core.Enums;

namespace FieldPulse.Core.Entities;

public class Technician : BaseEntity
{
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string? Email { get; set; }
    public string? Phone { get; set; }
    public TechnicianStatus Status { get; set; } = TechnicianStatus.Active;
    public string? Specialization { get; set; }
    public ICollection<Job> AssignedJobs { get; set; } = [];
}
