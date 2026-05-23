using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Xunit;

namespace FieldPulse.Api.Tests.Modules;

public class DashboardModuleTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly HttpClient _client;
    private readonly CustomWebApplicationFactory _factory;

    public DashboardModuleTests(CustomWebApplicationFactory factory)
    {
        _factory = factory;
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task GetMetrics_Returns200WithExpectedFields()
    {
        var response = await _client.GetAsync("/api/dashboard/metrics");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var metrics = await response.Content.ReadFromJsonAsync<Dictionary<string, object>>();
        metrics.Should().ContainKeys("totalCustomers", "totalTechnicians", "totalJobs", "totalInvoices", "jobsThisWeek", "invoicesThisWeek");
    }
}
