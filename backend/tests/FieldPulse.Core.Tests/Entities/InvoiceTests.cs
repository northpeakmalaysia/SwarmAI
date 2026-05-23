using FieldPulse.Core.Entities;
using FieldPulse.Core.Enums;
using FluentAssertions;
using Xunit;

namespace FieldPulse.Core.Tests.Entities;

public class InvoiceTests
{
    [Fact]
    public void Constructor_DefaultValues_StatusIsDraft()
    {
        // Arrange & Act
        var invoice = new Invoice();

        // Assert
        invoice.Status.Should().Be(InvoiceStatus.Draft);
    }

    [Fact]
    public void Constructor_DefaultValues_CreatedAtIsSet()
    {
        // Arrange
        var before = DateTime.UtcNow.AddSeconds(-1);

        // Act
        var invoice = new Invoice();

        // Assert
        var after = DateTime.UtcNow.AddSeconds(1);
        invoice.CreatedAt.Should().BeOnOrAfter(before).And.BeOnOrBefore(after);
    }

    [Fact]
    public void Constructor_DefaultValues_AmountIsZero()
    {
        // Arrange & Act
        var invoice = new Invoice();

        // Assert
        invoice.Amount.Should().Be(0m);
    }
}
