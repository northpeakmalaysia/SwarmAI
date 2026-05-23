using FluentAssertions;
using FieldPulse.Core.Entities;
using Xunit;

namespace FieldPulse.Core.Tests.Entities;

public class CustomerTests
{
    [Fact]
    public void Constructor_Defaults_IsActiveIsTrue()
    {
        var customer = new Customer();

        customer.IsActive.Should().BeTrue();
    }

    [Fact]
    public void Constructor_Defaults_IsDeletedIsFalse()
    {
        var customer = new Customer();

        customer.IsDeleted.Should().BeFalse();
    }

    [Fact]
    public void Constructor_Defaults_NameIsEmpty()
    {
        var customer = new Customer();

        customer.Name.Should().BeEmpty();
    }
}
