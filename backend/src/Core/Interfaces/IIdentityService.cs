namespace FieldPulse.Core.Interfaces;

public interface IIdentityService
{
    string GenerateJwtToken(string userId, string email, IEnumerable<string> roles);
    bool ValidatePassword(string password, string passwordHash);
    string HashPassword(string password);
}
