using Microsoft.AspNetCore.Mvc;
using Sakinah.Core.DTOs;
using Sakinah.Core.Interfaces;

namespace Sakinah.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly IIdentityService _identityService;

    public AuthController(IIdentityService identityService)
    {
        _identityService = identityService;
    }

    [HttpPost("login")]
    public ActionResult<AuthResponse> Login([FromBody] LoginRequest request)
    {
        // Stub: in production, validate credentials against the database
        var token = _identityService.GenerateJwtToken(Guid.NewGuid().ToString(), request.Email, ["User"]);
        return Ok(new AuthResponse
        {
            Token = token,
            RefreshToken = Guid.NewGuid().ToString(),
            ExpiresAt = DateTime.UtcNow.AddHours(1),
            User = new UserDto
            {
                Id = Guid.NewGuid(),
                Email = request.Email,
                FirstName = "Stub",
                LastName = "User",
                Status = "Active",
                Roles = ["User"]
            }
        });
    }
}
