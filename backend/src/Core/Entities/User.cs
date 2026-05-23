using FieldPulse.Core.Enums;
using FieldPulse.Core.ValueObjects;

namespace FieldPulse.Core.Entities;

public class User : BaseEntity
{
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public EmailAddress Email { get; set; } = null!;
    public string PasswordHash { get; set; } = string.Empty;
    public UserStatus Status { get; set; } = UserStatus.Active;
    public ICollection<Role> Roles { get; set; } = [];
}
