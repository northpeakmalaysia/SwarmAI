using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;

namespace FieldPulse.Api.Tests;

public class IntegrationTestBase : IClassFixture<CustomWebApplicationFactory>
{
    protected readonly HttpClient _client;
    protected readonly CustomWebApplicationFactory _factory;

    public IntegrationTestBase(CustomWebApplicationFactory factory)
    {
        _factory = factory;
        _client = factory.CreateClient();

        using var scope = factory.Services.CreateScope();
        var store = scope.ServiceProvider.GetRequiredService<Infrastructure.InMemoryStore>();
        store.ClearAll();
    }
}
