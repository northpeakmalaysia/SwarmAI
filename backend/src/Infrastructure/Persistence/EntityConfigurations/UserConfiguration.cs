using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Sakinah.Core.Entities;

namespace Sakinah.Infrastructure.Persistence.EntityConfigurations;

public class UserConfiguration : IEntityTypeConfiguration<User>
{
    public void Configure(EntityTypeBuilder<User> builder)
    {
        builder.HasKey(u => u.Id);
        builder.Property(u => u.FirstName).HasMaxLength(100).IsRequired();
        builder.Property(u => u.LastName).HasMaxLength(100).IsRequired();
        builder.OwnsOne(u => u.Email, email =>
        {
            email.Property(e => e.Value).HasColumnName("Email").HasMaxLength(256).IsRequired();
        });
        builder.Property(u => u.PasswordHash).IsRequired();
        builder.Property(u => u.Status).HasConversion<string>().HasMaxLength(50);
        builder.HasMany(u => u.Roles).WithMany(r => r.Users)
            .UsingEntity(j => j.ToTable("UserRoles"));
        builder.HasIndex(u => u.Email.Value).IsUnique();
    }
}
