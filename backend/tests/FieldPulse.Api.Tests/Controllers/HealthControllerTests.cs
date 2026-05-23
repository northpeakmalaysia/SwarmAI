using System.Net;
using FluentAssertions;
using Xunit;

namespace FieldPulse.Api.Tests.Controllers;

public class HealthControllerTests : IntegrationTestBase
{
    public HealthControllerTests(CustomWebApplicationFactory factory) : base(factory) { }

    [Fact]
    public async Task Get_Status_ShouldReturnOk()
    {
        // Arrange
        var request = "/api/health";

        // Act
        var response = await _client.GetAsync(request);

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }
}
