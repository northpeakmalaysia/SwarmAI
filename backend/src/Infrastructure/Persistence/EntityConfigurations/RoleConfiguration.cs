using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Sakinah.Core.Entities;

namespace Sakinah.Infrastructure.Persistence.EntityConfigurations;

public class RoleConfiguration : IEntityTypeConfiguration<Role>
{
    public void Configure(EntityTypeBuilder<Role> builder)
    {
        builder.HasKey(r => r.Id);
        builder.Property(r => r.Name).HasMaxLength(100).IsRequired();
        builder.Property(r => r.Description).HasMaxLength(500);
        builder.HasMany(r => r.Permissions).WithMany(p => p.Roles)
            .UsingEntity(j => j.ToTable("RolePermissions"));
        builder.HasIndex(r => r.Name).IsUnique();
    }
}
