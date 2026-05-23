using FieldPulse.Core.ValueObjects;
using FluentAssertions;
using Xunit;

namespace FieldPulse.Core.Tests.ValueObjects;

public class EmailAddressTests
{
    [Theory]
    [InlineData("user@example.com")]
    [InlineData("test.name@domain.co.uk")]
    [InlineData("user+tag@example.org")]
    public void Constructor_ValidEmail_SetsValue(string email)
    {
        // Arrange & Act
        var emailAddress = new EmailAddress(email);

        // Assert
        emailAddress.Value.Should().Be(email.ToLowerInvariant());
    }

    [Theory]
    [InlineData("invalid-email")]
    [InlineData("@nodomain.com")]
    [InlineData("missing@domain")]
    [InlineData("spaces in@email.com")]
    public void Constructor_InvalidEmail_ThrowsArgumentException(string email)
    {
        // Arrange & Act
        Action act = () => new EmailAddress(email);

        // Assert
        act.Should().Throw<ArgumentException>();
    }

    [Fact]
    public void Constructor_EmptyEmail_ThrowsArgumentException()
    {
        // Arrange & Act
        Action act = () => new EmailAddress("");

        // Assert
        act.Should().Throw<ArgumentException>().WithMessage("*Email cannot be empty.*");
    }

    [Fact]
    public void Constructor_NullEmail_ThrowsArgumentException()
    {
        // Arrange & Act
        Action act = () => new EmailAddress(null!);

        // Assert
        act.Should().Throw<ArgumentException>();
    }

    [Fact]
    public void Equals_SameValue_ReturnsTrue()
    {
        // Arrange
        var email1 = new EmailAddress("user@example.com");
        var email2 = new EmailAddress("USER@EXAMPLE.COM");

        // Act & Assert
        email1.Equals(email2).Should().BeTrue();
    }

    [Fact]
    public void Equals_DifferentValue_ReturnsFalse()
    {
        // Arrange
        var email1 = new EmailAddress("user1@example.com");
        var email2 = new EmailAddress("user2@example.com");

        // Act & Assert
        email1.Equals(email2).Should().BeFalse();
    }
}
