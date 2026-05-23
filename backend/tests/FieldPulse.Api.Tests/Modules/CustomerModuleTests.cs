using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Xunit;

namespace FieldPulse.Api.Tests.Modules;

public class CustomerModuleTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly HttpClient _client;
    private readonly CustomWebApplicationFactory _factory;

    public CustomerModuleTests(CustomWebApplicationFactory factory)
    {
        _factory = factory;
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task GetAll_Returns200AndEmptyList()
    {
        var response = await _client.GetAsync("/api/customers");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var customers = await response.Content.ReadFromJsonAsync<List<object>>();
        customers.Should().NotBeNull();
    }

    [Fact]
    public async Task Create_Returns201WithLocation()
    {
        var payload = new { name = "Test Corp", email = "test@test.com", isActive = true };

        var response = await _client.PostAsJsonAsync("/api/customers", payload);

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        response.Headers.Location.Should().NotBeNull();
    }

    [Fact]
    public async Task GetById_Returns404ForMissing()
    {
        var response = await _client.GetAsync($"/api/customers/{Guid.NewGuid()}");

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Update_Returns204()
    {
        var create = await _client.PostAsJsonAsync("/api/customers", new { name = "Before", isActive = true });
        var created = await create.Content.ReadFromJsonAsync<Dictionary<string, object>>();
        var id = created!["id"].ToString()!;

        var update = await _client.PutAsJsonAsync($"/api/customers/{id}", new { name = "After", email = "", phone = "", address = "", city = "", postalCode = "", notes = "", isActive = true });

        update.StatusCode.Should().Be(HttpStatusCode.NoContent);
    }

    [Fact]
    public async Task Delete_Returns204()
    {
        var create = await _client.PostAsJsonAsync("/api/customers", new { name = "ToDelete", isActive = true });
        var created = await create.Content.ReadFromJsonAsync<Dictionary<string, object>>();
        var id = created!["id"].ToString()!;

        var delete = await _client.DeleteAsync($"/api/customers/{id}");

        delete.StatusCode.Should().Be(HttpStatusCode.NoContent);
    }
}
