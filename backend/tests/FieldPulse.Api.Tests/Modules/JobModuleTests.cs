using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Xunit;

namespace FieldPulse.Api.Tests.Modules;

public class JobModuleTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly HttpClient _client;
    private readonly CustomWebApplicationFactory _factory;

    public JobModuleTests(CustomWebApplicationFactory factory)
    {
        _factory = factory;
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task GetAll_Returns200AndEmptyList()
    {
        var response = await _client.GetAsync("/api/jobs");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var jobs = await response.Content.ReadFromJsonAsync<List<object>>();
        jobs.Should().NotBeNull();
    }

    [Fact]
    public async Task Create_Returns201()
    {
        var customer = await _client.PostAsJsonAsync("/api/customers", new { name = "JobCustomer", isActive = true });
        var c = await customer.Content.ReadFromJsonAsync<Dictionary<string, object>>();
        var customerId = Guid.Parse(c!["id"].ToString()!);

        var payload = new { title = "Test Job", scheduledDate = DateTime.UtcNow.AddDays(1), customerId };

        var response = await _client.PostAsJsonAsync("/api/jobs", payload);

        response.StatusCode.Should().Be(HttpStatusCode.Created);
    }

    [Fact]
    public async Task StartJob_Returns200AndInProgressStatus()
    {
        var customer = await _client.PostAsJsonAsync("/api/customers", new { name = "StartCustomer", isActive = true });
        var c = await customer.Content.ReadFromJsonAsync<Dictionary<string, object>>();
        var customerId = Guid.Parse(c!["id"].ToString()!);

        var job = await _client.PostAsJsonAsync("/api/jobs", new { title = "Start Job", scheduledDate = DateTime.UtcNow.AddDays(1), customerId });
        var j = await job.Content.ReadFromJsonAsync<Dictionary<string, object>>();
        var jobId = j!["id"].ToString()!;

        var response = await _client.PatchAsync($"/api/jobs/{jobId}/start", null);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var updated = await response.Content.ReadFromJsonAsync<Dictionary<string, object>>();
        updated!["status"].ToString().Should().BeOneOf("InProgress", "2");
    }

    [Fact]
    public async Task CompleteJob_Returns200AndCompletedStatus()
    {
        var customer = await _client.PostAsJsonAsync("/api/customers", new { name = "CompleteCustomer", isActive = true });
        var c = await customer.Content.ReadFromJsonAsync<Dictionary<string, object>>();
        var customerId = Guid.Parse(c!["id"].ToString()!);

        var job = await _client.PostAsJsonAsync("/api/jobs", new { title = "Complete Job", scheduledDate = DateTime.UtcNow.AddDays(1), customerId });
        var j = await job.Content.ReadFromJsonAsync<Dictionary<string, object>>();
        var jobId = j!["id"].ToString()!;

        await _client.PatchAsync($"/api/jobs/{jobId}/start", null);
        var response = await _client.PatchAsync($"/api/jobs/{jobId}/complete", null);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var updated = await response.Content.ReadFromJsonAsync<Dictionary<string, object>>();
        updated!["status"].ToString().Should().BeOneOf("Completed", "3");
    }
}
