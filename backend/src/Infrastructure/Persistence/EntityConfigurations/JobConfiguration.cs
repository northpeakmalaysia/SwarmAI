using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using FieldPulse.Core.Entities;

namespace FieldPulse.Infrastructure.Persistence.EntityConfigurations;

public class JobConfiguration : IEntityTypeConfiguration<Job>
{
    public void Configure(EntityTypeBuilder<Job> builder)
    {
        builder.HasKey(j => j.Id);

        builder.Property(j => j.Title)
            .IsRequired()
            .HasMaxLength(200);

        builder.Property(j => j.Description)
            .HasMaxLength(2000);

        builder.Property(j => j.Status)
            .IsRequired();

        builder.Property(j => j.EstimatedCost)
            .HasPrecision(18, 2);

        builder.Property(j => j.ActualCost)
            .HasPrecision(18, 2);

        builder.HasOne(j => j.Customer)
            .WithMany(c => c.Jobs)
            .HasForeignKey(j => j.CustomerId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(j => j.Technician)
            .WithMany(t => t.AssignedJobs)
            .HasForeignKey(j => j.TechnicianId)
            .OnDelete(DeleteBehavior.SetNull);

        builder.HasIndex(j => j.Status);
        builder.HasIndex(j => j.ScheduledDate);
        builder.HasIndex(j => j.CustomerId);
        builder.HasIndex(j => j.TechnicianId);
    }
}
