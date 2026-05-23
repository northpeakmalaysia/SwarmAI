using System.Net;
using System.Net.Http.Json;
using FieldPulse.Core.DTOs;
using FluentAssertions;
using Xunit;

namespace FieldPulse.Api.Tests.Modules;

public class InvoiceModuleTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly HttpClient _client;

    public InvoiceModuleTests(CustomWebApplicationFactory factory)
    {
        // Start every test from a clean, empty in-memory store. xUnit re-runs this
        // constructor per test method, so this guarantees order-independent isolation.
        _client = factory.CreateClient();
    }

    [Fact]
    public async Task GetAll_Initially_ReturnsEmptyList()
    {
        // Arrange
        var request = "/api/invoices";

        // Act
        var response = await _client.GetAsync(request);

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var invoices = await response.Content.ReadFromJsonAsync<List<InvoiceDto>>();
        invoices.Should().BeEmpty();
    }

    [Fact]
    public async Task GetById_MissingInvoice_ReturnsNotFound()
    {
        // Arrange
        var id = Guid.NewGuid();
        var request = $"/api/invoices/{id}";

        // Act
        var response = await _client.GetAsync(request);

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Create_ValidInvoice_ReturnsCreated()
    {
        // Arrange
        var request = new CreateInvoiceRequest
        {
            CustomerName = "Test Customer",
            CustomerEmail = "test@example.com",
            Description = "Test invoice",
            Amount = 100.00m,
            DueDate = DateTime.UtcNow.AddDays(7)
        };

        // Act
        var response = await _client.PostAsJsonAsync("/api/invoices", request);

        // Assert
        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var invoice = await response.Content.ReadFromJsonAsync<InvoiceDto>();
        invoice.Should().NotBeNull();
        invoice!.CustomerName.Should().Be(request.CustomerName);
        invoice.Amount.Should().Be(request.Amount);
    }
}
