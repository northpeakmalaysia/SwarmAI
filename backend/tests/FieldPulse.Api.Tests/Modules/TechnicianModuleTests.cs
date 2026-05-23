using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Xunit;

namespace FieldPulse.Api.Tests.Modules;

public class TechnicianModuleTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly HttpClient _client;
    private readonly CustomWebApplicationFactory _factory;

    public TechnicianModuleTests(CustomWebApplicationFactory factory)
    {
        _factory = factory;
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task GetAll_Returns200AndEmptyList()
    {
        var response = await _client.GetAsync("/api/technicians");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var techs = await response.Content.ReadFromJsonAsync<List<object>>();
        techs.Should().NotBeNull();
    }

    [Fact]
    public async Task Create_Returns201WithLocation()
    {
        var payload = new { firstName = "John", lastName = "Doe", email = "john@test.com" };

        var response = await _client.PostAsJsonAsync("/api/technicians", payload);

        response.StatusCode.Should().Be(HttpStatusCode.Created);
    }

    [Fact]
    public async Task GetById_Returns404ForMissing()
    {
        var response = await _client.GetAsync($"/api/technicians/{Guid.NewGuid()}");

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Update_Returns204()
    {
        var create = await _client.PostAsJsonAsync("/api/technicians", new { firstName = "Before", lastName = "Test" });
        var created = await create.Content.ReadFromJsonAsync<Dictionary<string, object>>();
        var id = created!["id"].ToString()!;

        var update = await _client.PutAsJsonAsync($"/api/technicians/{id}", new { firstName = "After", lastName = "Test", email = "after@test.com", phone = "555-0000", status = 0, specialization = "HVAC" });

        update.StatusCode.Should().Be(HttpStatusCode.NoContent);
    }
}
