using FieldPulse.Core.Entities;
using FieldPulse.Core.Enums;
using Microsoft.EntityFrameworkCore;

namespace FieldPulse.Infrastructure.Persistence;

public static class SeedData
{
    public static void Seed(this ModelBuilder modelBuilder)
    {
        var now = DateTime.UtcNow;

        var customers = new List<Customer>
        {
            new()
            {
                Id = Guid.Parse("11111111-1111-1111-1111-111111111111"),
                Name = "Acme Corporation",
                Email = "contact@acme.com",
                Phone = "+1-555-0101",
                Address = "123 Industrial Blvd",
                City = "Detroit",
                PostalCode = "48201",
                Notes = "Key account - quarterly reviews",
                IsActive = true,
                CreatedAt = now.AddDays(-90),
                UpdatedAt = now.AddDays(-10)
            },
            new()
            {
                Id = Guid.Parse("22222222-2222-2222-2222-222222222222"),
                Name = "Smith Family Farms",
                Email = "smith@farms.local",
                Phone = "+1-555-0202",
                Address = "456 Rural Route 7",
                City = "Springfield",
                PostalCode = "62701",
                Notes = "Agricultural equipment maintenance",
                IsActive = true,
                CreatedAt = now.AddDays(-60),
                UpdatedAt = now.AddDays(-5)
            },
            new()
            {
                Id = Guid.Parse("33333333-3333-3333-3333-333333333333"),
                Name = "Metro Property Management",
                Email = "ops@metropm.com",
                Phone = "+1-555-0303",
                Address = "789 Downtown Plaza",
                City = "Chicago",
                PostalCode = "60601",
                IsActive = true,
                CreatedAt = now.AddDays(-30),
                UpdatedAt = now.AddDays(-2)
            }
        };

        var technicians = new List<Technician>
        {
            new()
            {
                Id = Guid.Parse("44444444-4444-4444-4444-444444444444"),
                FirstName = "John",
                LastName = "Miller",
                Email = "john.miller@FieldPulse.local",
                Phone = "+1-555-0404",
                Status = TechnicianStatus.Active,
                Specialization = "HVAC",
                CreatedAt = now.AddDays(-120),
                UpdatedAt = now.AddDays(-10)
            },
            new()
            {
                Id = Guid.Parse("55555555-5555-5555-5555-555555555555"),
                FirstName = "Sarah",
                LastName = "Chen",
                Email = "sarah.chen@FieldPulse.local",
                Phone = "+1-555-0505",
                Status = TechnicianStatus.Active,
                Specialization = "Electrical",
                CreatedAt = now.AddDays(-90),
                UpdatedAt = now.AddDays(-5)
            },
            new()
            {
                Id = Guid.Parse("66666666-6666-6666-6666-666666666666"),
                FirstName = "Marcus",
                LastName = "Johnson",
                Email = "marcus.j@FieldPulse.local",
                Phone = "+1-555-0606",
                Status = TechnicianStatus.OnLeave,
                Specialization = "Plumbing",
                CreatedAt = now.AddDays(-180),
                UpdatedAt = now.AddDays(-1)
            }
        };

        var jobs = new List<Job>
        {
            new()
            {
                Id = Guid.Parse("77777777-7777-7777-7777-777777777777"),
                Title = "AC Unit Replacement",
                Description = "Replace old AC unit with new energy-efficient model",
                Status = JobStatus.Completed,
                ScheduledDate = now.AddDays(-5),
                StartedAt = now.AddDays(-5).AddHours(9),
                CompletedAt = now.AddDays(-5).AddHours(14),
                EstimatedCost = 2500.00m,
                ActualCost = 2450.00m,
                Notes = "Customer very satisfied",
                CustomerId = customers[0].Id,
                TechnicianId = technicians[0].Id,
                CreatedAt = now.AddDays(-10),
                UpdatedAt = now.AddDays(-5)
            },
            new()
            {
                Id = Guid.Parse("88888888-8888-8888-8888-888888888888"),
                Title = "Electrical Panel Upgrade",
                Description = "Upgrade main panel from 100A to 200A",
                Status = JobStatus.InProgress,
                ScheduledDate = now,
                StartedAt = now.AddHours(8),
                EstimatedCost = 1800.00m,
                Notes = "Waiting for city inspection",
                CustomerId = customers[1].Id,
                TechnicianId = technicians[1].Id,
                CreatedAt = now.AddDays(-3),
                UpdatedAt = now
            },
            new()
            {
                Id = Guid.Parse("99999999-9999-9999-9999-999999999999"),
                Title = "Annual Maintenance Contract",
                Description = "Q2 preventive maintenance visit",
                Status = JobStatus.Scheduled,
                ScheduledDate = now.AddDays(3),
                EstimatedCost = 450.00m,
                CustomerId = customers[2].Id,
                TechnicianId = technicians[0].Id,
                CreatedAt = now.AddDays(-1),
                UpdatedAt = now.AddDays(-1)
            },
            new()
            {
                Id = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"),
                Title = "Emergency Pipe Repair",
                Description = "Burst pipe in basement - emergency call",
                Status = JobStatus.Pending,
                ScheduledDate = now.AddDays(1),
                EstimatedCost = 800.00m,
                Notes = "After hours - urgent",
                CustomerId = customers[1].Id,
                CreatedAt = now,
                UpdatedAt = now
            }
        };

        var invoices = new List<Invoice>
        {
            new()
            {
                Id = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"),
                CustomerName = customers[0].Name,
                CustomerEmail = customers[0].Email,
                Description = "AC Unit Replacement - Invoice",
                Amount = 2450.00m,
                Status = InvoiceStatus.Paid,
                DueDate = now.AddDays(-2),
                PaidAt = now.AddDays(-1),
                CreatedAt = now.AddDays(-5),
                UpdatedAt = now.AddDays(-1)
            },
            new()
            {
                Id = Guid.Parse("cccccccc-cccc-cccc-cccc-cccccccccccc"),
                CustomerName = customers[1].Name,
                CustomerEmail = customers[1].Email,
                Description = "Electrical Panel Upgrade - Deposit",
                Amount = 900.00m,
                Status = InvoiceStatus.Sent,
                DueDate = now.AddDays(14),
                CreatedAt = now.AddDays(-1),
                UpdatedAt = now.AddDays(-1)
            },
            new()
            {
                Id = Guid.Parse("dddddddd-dddd-dddd-dddd-dddddddddddd"),
                CustomerName = customers[2].Name,
                CustomerEmail = customers[2].Email,
                Description = "Annual Maintenance Contract - Q2",
                Amount = 450.00m,
                Status = InvoiceStatus.Draft,
                DueDate = now.AddDays(30),
                CreatedAt = now,
                UpdatedAt = now
            }
        };

        modelBuilder.Entity<Customer>().HasData(customers);
        modelBuilder.Entity<Technician>().HasData(technicians);
        modelBuilder.Entity<Job>().HasData(jobs);
        modelBuilder.Entity<Invoice>().HasData(invoices);
    }
}
