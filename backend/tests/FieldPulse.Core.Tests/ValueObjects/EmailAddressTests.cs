using FluentAssertions;
using FieldPulse.Core.ValueObjects;
using Xunit;

namespace FieldPulse.Core.Tests.ValueObjects;

public class EmailAddressTests
{
    [Theory]
    [InlineData("user@example.com")]
    [InlineData("test+tag@domain.co.uk")]
    [InlineData("firstname.lastname@company.com")]
    public void Constructor_ValidEmail_SetsValue(string email)
    {
        var address = new EmailAddress(email);

        address.Value.Should().Be(email);
    }

    [Theory]
    [InlineData("")]
    [InlineData("invalid")]
    [InlineData("@nodomain.com")]
    [InlineData("spaces in@email.com")]
    public void Constructor_InvalidEmail_ThrowsArgumentException(string email)
    {
        Action act = () => new EmailAddress(email);

        act.Should().Throw<ArgumentException>();
    }
}
