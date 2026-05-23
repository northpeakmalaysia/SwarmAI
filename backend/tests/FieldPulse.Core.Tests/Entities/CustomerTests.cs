using FieldPulse.Core.Entities;
using FluentAssertions;
using Xunit;

namespace FieldPulse.Core.Tests.Entities;

public class CustomerTests
{
    [Fact]
    public void Constructor_DefaultValues_IsActiveIsTrue()
    {
        // Arrange & Act
        var customer = new Customer();

        // Assert
        customer.IsActive.Should().BeTrue();
    }

    [Fact]
    public void Constructor_DefaultValues_NameIsEmpty()
    {
        // Arrange & Act
        var customer = new Customer();

        // Assert
        customer.Name.Should().BeEmpty();
    }

    [Fact]
    public void Constructor_DefaultValues_JobsAndInvoicesAreEmpty()
    {
        // Arrange & Act
        var customer = new Customer();

        // Assert
        customer.Jobs.Should().BeEmpty();
        customer.Invoices.Should().BeEmpty();
    }
}
