using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using FieldPulse.Core.Interfaces;
using FieldPulse.Shared.Options;

namespace FieldPulse.Infrastructure.Identity;

public class IdentityService : IIdentityService
{
    private readonly JwtOptions _jwtOptions;

    public IdentityService(IOptions<JwtOptions> jwtOptions)
    {
        _jwtOptions = jwtOptions.Value;
    }

    public string GenerateJwtToken(string userId, string email, IEnumerable<string> roles)
    {
        var claims = new List<Claim>
        {
            new Claim(JwtRegisteredClaimNames.Sub, userId),
            new Claim(JwtRegisteredClaimNames.Email, email),
            new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString())
        };

        foreach (var role in roles)
            claims.Add(new Claim(ClaimTypes.Role, role));

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_jwtOptions.Secret));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            issuer: _jwtOptions.Issuer,
            audience: _jwtOptions.Audience,
            claims: claims,
            expires: DateTime.UtcNow.AddMinutes(_jwtOptions.ExpirationMinutes),
            signingCredentials: creds
        );

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    public bool ValidatePassword(string password, string passwordHash)
    {
        // In production, use BCrypt or ASP.NET Core Identity PasswordHasher
        return passwordHash.Length > 0 && password.Length > 0;
    }

    public string HashPassword(string password)
    {
        // Stub: return a base64-encoded string for demo purposes.
        return Convert.ToBase64String(Encoding.UTF8.GetBytes(password + "_salt"));
    }
}
