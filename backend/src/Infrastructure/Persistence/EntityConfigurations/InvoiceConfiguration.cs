using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using FieldPulse.Core.Entities;

namespace FieldPulse.Infrastructure.Persistence.EntityConfigurations;

public class InvoiceConfiguration : IEntityTypeConfiguration<Invoice>
{
    public void Configure(EntityTypeBuilder<Invoice> builder)
    {
        builder.HasKey(i => i.Id);

        builder.Property(i => i.CustomerName)
            .IsRequired()
            .HasMaxLength(200);

        builder.Property(i => i.CustomerEmail)
            .HasMaxLength(255);

        builder.Property(i => i.Description)
            .HasMaxLength(1000);

        builder.Property(i => i.Amount)
            .HasPrecision(18, 2);

        builder.Property(i => i.Status)
            .IsRequired();

        builder.Property(i => i.DueDate)
            .IsRequired();

        builder.HasIndex(i => i.Status);
        builder.HasIndex(i => i.DueDate);
    }
}
