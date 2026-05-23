using FieldPulse.Core.Entities;
using FieldPulse.Core.Enums;
using FluentAssertions;
using Xunit;

namespace FieldPulse.Core.Tests.Entities;

public class JobTests
{
    [Fact]
    public void Constructor_DefaultValues_StatusIsPending()
    {
        // Arrange & Act
        var job = new Job();

        // Assert
        job.Status.Should().Be(JobStatus.Pending);
    }

    [Fact]
    public void Constructor_CustomerId_IsEmptyGuidByDefault()
    {
        // Arrange & Act
        var job = new Job();

        // Assert
        job.CustomerId.Should().Be(Guid.Empty);
    }

    [Fact]
    public void Constructor_ScheduledDate_DefaultsToDateTimeMinValue()
    {
        // Arrange & Act
        var job = new Job();

        // Assert
        job.ScheduledDate.Should().Be(DateTime.MinValue);
    }
}
