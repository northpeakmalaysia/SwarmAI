using FluentAssertions;
using FieldPulse.Core.Entities;
using FieldPulse.Core.Enums;
using Xunit;

namespace FieldPulse.Core.Tests.Entities;

public class JobTests
{
    [Fact]
    public void Constructor_Defaults_StatusIsPending()
    {
        var job = new Job();

        job.Status.Should().Be(JobStatus.Pending);
    }

    [Fact]
    public void Constructor_Defaults_IsDeletedIsFalse()
    {
        var job = new Job();

        job.IsDeleted.Should().BeFalse();
    }

    [Fact]
    public void Constructor_Defaults_CustomerIdIsEmptyGuid()
    {
        var job = new Job();

        job.CustomerId.Should().Be(Guid.Empty);
    }
}
