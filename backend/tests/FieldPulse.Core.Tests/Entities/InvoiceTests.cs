using FluentAssertions;
using FieldPulse.Core.Entities;
using FieldPulse.Core.Enums;
using Xunit;

namespace FieldPulse.Core.Tests.Entities;

public class InvoiceTests
{
    [Fact]
    public void Constructor_Defaults_StatusIsDraft()
    {
        var invoice = new Invoice();

        invoice.Status.Should().Be(InvoiceStatus.Draft);
    }

    [Fact]
    public void Constructor_Defaults_CreatedAtIsSet()
    {
        var before = DateTime.UtcNow.AddSeconds(-1);
        var invoice = new Invoice();
        var after = DateTime.UtcNow.AddSeconds(1);

        invoice.CreatedAt.Should().BeAfter(before);
        invoice.CreatedAt.Should().BeBefore(after);
    }

    [Fact]
    public void Constructor_Defaults_AmountIsZero()
    {
        var invoice = new Invoice();

        invoice.Amount.Should().Be(0);
    }

    [Fact]
    public void Constructor_Defaults_IsDeletedIsFalse()
    {
        var invoice = new Invoice();

        invoice.IsDeleted.Should().BeFalse();
    }
}
