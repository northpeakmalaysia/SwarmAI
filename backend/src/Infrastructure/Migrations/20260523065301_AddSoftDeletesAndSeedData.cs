using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace FieldPulse.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddSoftDeletesAndSeedData : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "DeletedAt",
                table: "Users",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsDeleted",
                table: "Users",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTime>(
                name: "DeletedAt",
                table: "Technicians",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsDeleted",
                table: "Technicians",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTime>(
                name: "DeletedAt",
                table: "Roles",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsDeleted",
                table: "Roles",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTime>(
                name: "DeletedAt",
                table: "Permissions",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsDeleted",
                table: "Permissions",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTime>(
                name: "DeletedAt",
                table: "Jobs",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsDeleted",
                table: "Jobs",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTime>(
                name: "DeletedAt",
                table: "Invoices",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsDeleted",
                table: "Invoices",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTime>(
                name: "DeletedAt",
                table: "Customers",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsDeleted",
                table: "Customers",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTime>(
                name: "DeletedAt",
                table: "AuditLogs",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsDeleted",
                table: "AuditLogs",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.InsertData(
                table: "Customers",
                columns: new[] { "Id", "Address", "City", "CreatedAt", "DeletedAt", "Email", "IsActive", "IsDeleted", "Name", "Notes", "Phone", "PostalCode", "UpdatedAt" },
                values: new object[,]
                {
                    { new Guid("11111111-1111-1111-1111-111111111111"), "123 Industrial Blvd", "Detroit", new DateTime(2026, 2, 22, 6, 53, 1, 174, DateTimeKind.Utc).AddTicks(6385), null, "contact@acme.com", true, false, "Acme Corporation", "Key account - quarterly reviews", "+1-555-0101", "48201", new DateTime(2026, 5, 13, 6, 53, 1, 174, DateTimeKind.Utc).AddTicks(6385) },
                    { new Guid("22222222-2222-2222-2222-222222222222"), "456 Rural Route 7", "Springfield", new DateTime(2026, 3, 24, 6, 53, 1, 174, DateTimeKind.Utc).AddTicks(6385), null, "smith@farms.local", true, false, "Smith Family Farms", "Agricultural equipment maintenance", "+1-555-0202", "62701", new DateTime(2026, 5, 18, 6, 53, 1, 174, DateTimeKind.Utc).AddTicks(6385) },
                    { new Guid("33333333-3333-3333-3333-333333333333"), "789 Downtown Plaza", "Chicago", new DateTime(2026, 4, 23, 6, 53, 1, 174, DateTimeKind.Utc).AddTicks(6385), null, "ops@metropm.com", true, false, "Metro Property Management", null, "+1-555-0303", "60601", new DateTime(2026, 5, 21, 6, 53, 1, 174, DateTimeKind.Utc).AddTicks(6385) }
                });

            migrationBuilder.InsertData(
                table: "Invoices",
                columns: new[] { "Id", "Amount", "CreatedAt", "CustomerEmail", "CustomerId", "CustomerName", "DeletedAt", "Description", "DueDate", "IsDeleted", "PaidAt", "Status", "UpdatedAt" },
                values: new object[,]
                {
                    { new Guid("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"), 2450.00m, new DateTime(2026, 5, 18, 6, 53, 1, 174, DateTimeKind.Utc).AddTicks(6385), "contact@acme.com", null, "Acme Corporation", null, "AC Unit Replacement - Invoice", new DateTime(2026, 5, 21, 6, 53, 1, 174, DateTimeKind.Utc).AddTicks(6385), false, new DateTime(2026, 5, 22, 6, 53, 1, 174, DateTimeKind.Utc).AddTicks(6385), 2, new DateTime(2026, 5, 22, 6, 53, 1, 174, DateTimeKind.Utc).AddTicks(6385) },
                    { new Guid("cccccccc-cccc-cccc-cccc-cccccccccccc"), 900.00m, new DateTime(2026, 5, 22, 6, 53, 1, 174, DateTimeKind.Utc).AddTicks(6385), "smith@farms.local", null, "Smith Family Farms", null, "Electrical Panel Upgrade - Deposit", new DateTime(2026, 6, 6, 6, 53, 1, 174, DateTimeKind.Utc).AddTicks(6385), false, null, 1, new DateTime(2026, 5, 22, 6, 53, 1, 174, DateTimeKind.Utc).AddTicks(6385) },
                    { new Guid("dddddddd-dddd-dddd-dddd-dddddddddddd"), 450.00m, new DateTime(2026, 5, 23, 6, 53, 1, 174, DateTimeKind.Utc).AddTicks(6385), "ops@metropm.com", null, "Metro Property Management", null, "Annual Maintenance Contract - Q2", new DateTime(2026, 6, 22, 6, 53, 1, 174, DateTimeKind.Utc).AddTicks(6385), false, null, 0, new DateTime(2026, 5, 23, 6, 53, 1, 174, DateTimeKind.Utc).AddTicks(6385) }
                });

            migrationBuilder.InsertData(
                table: "Technicians",
                columns: new[] { "Id", "CreatedAt", "DeletedAt", "Email", "FirstName", "IsDeleted", "LastName", "Phone", "Specialization", "Status", "UpdatedAt" },
                values: new object[,]
                {
                    { new Guid("44444444-4444-4444-4444-444444444444"), new DateTime(2026, 1, 23, 6, 53, 1, 174, DateTimeKind.Utc).AddTicks(6385), null, "john.miller@FieldPulse.local", "John", false, "Miller", "+1-555-0404", "HVAC", 0, new DateTime(2026, 5, 13, 6, 53, 1, 174, DateTimeKind.Utc).AddTicks(6385) },
                    { new Guid("55555555-5555-5555-5555-555555555555"), new DateTime(2026, 2, 22, 6, 53, 1, 174, DateTimeKind.Utc).AddTicks(6385), null, "sarah.chen@FieldPulse.local", "Sarah", false, "Chen", "+1-555-0505", "Electrical", 0, new DateTime(2026, 5, 18, 6, 53, 1, 174, DateTimeKind.Utc).AddTicks(6385) },
                    { new Guid("66666666-6666-6666-6666-666666666666"), new DateTime(2025, 11, 24, 6, 53, 1, 174, DateTimeKind.Utc).AddTicks(6385), null, "marcus.j@FieldPulse.local", "Marcus", false, "Johnson", "+1-555-0606", "Plumbing", 1, new DateTime(2026, 5, 22, 6, 53, 1, 174, DateTimeKind.Utc).AddTicks(6385) }
                });

            migrationBuilder.InsertData(
                table: "Jobs",
                columns: new[] { "Id", "ActualCost", "CompletedAt", "CreatedAt", "CustomerId", "DeletedAt", "Description", "EstimatedCost", "IsDeleted", "Notes", "ScheduledDate", "StartedAt", "Status", "TechnicianId", "Title", "UpdatedAt" },
                values: new object[,]
                {
                    { new Guid("77777777-7777-7777-7777-777777777777"), 2450.00m, new DateTime(2026, 5, 18, 20, 53, 1, 174, DateTimeKind.Utc).AddTicks(6385), new DateTime(2026, 5, 13, 6, 53, 1, 174, DateTimeKind.Utc).AddTicks(6385), new Guid("11111111-1111-1111-1111-111111111111"), null, "Replace old AC unit with new energy-efficient model", 2500.00m, false, "Customer very satisfied", new DateTime(2026, 5, 18, 6, 53, 1, 174, DateTimeKind.Utc).AddTicks(6385), new DateTime(2026, 5, 18, 15, 53, 1, 174, DateTimeKind.Utc).AddTicks(6385), 3, new Guid("44444444-4444-4444-4444-444444444444"), "AC Unit Replacement", new DateTime(2026, 5, 18, 6, 53, 1, 174, DateTimeKind.Utc).AddTicks(6385) },
                    { new Guid("88888888-8888-8888-8888-888888888888"), null, null, new DateTime(2026, 5, 20, 6, 53, 1, 174, DateTimeKind.Utc).AddTicks(6385), new Guid("22222222-2222-2222-2222-222222222222"), null, "Upgrade main panel from 100A to 200A", 1800.00m, false, "Waiting for city inspection", new DateTime(2026, 5, 23, 6, 53, 1, 174, DateTimeKind.Utc).AddTicks(6385), new DateTime(2026, 5, 23, 14, 53, 1, 174, DateTimeKind.Utc).AddTicks(6385), 2, new Guid("55555555-5555-5555-5555-555555555555"), "Electrical Panel Upgrade", new DateTime(2026, 5, 23, 6, 53, 1, 174, DateTimeKind.Utc).AddTicks(6385) },
                    { new Guid("99999999-9999-9999-9999-999999999999"), null, null, new DateTime(2026, 5, 22, 6, 53, 1, 174, DateTimeKind.Utc).AddTicks(6385), new Guid("33333333-3333-3333-3333-333333333333"), null, "Q2 preventive maintenance visit", 450.00m, false, null, new DateTime(2026, 5, 26, 6, 53, 1, 174, DateTimeKind.Utc).AddTicks(6385), null, 1, new Guid("44444444-4444-4444-4444-444444444444"), "Annual Maintenance Contract", new DateTime(2026, 5, 22, 6, 53, 1, 174, DateTimeKind.Utc).AddTicks(6385) },
                    { new Guid("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"), null, null, new DateTime(2026, 5, 23, 6, 53, 1, 174, DateTimeKind.Utc).AddTicks(6385), new Guid("22222222-2222-2222-2222-222222222222"), null, "Burst pipe in basement - emergency call", 800.00m, false, "After hours - urgent", new DateTime(2026, 5, 24, 6, 53, 1, 174, DateTimeKind.Utc).AddTicks(6385), null, 0, null, "Emergency Pipe Repair", new DateTime(2026, 5, 23, 6, 53, 1, 174, DateTimeKind.Utc).AddTicks(6385) }
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DeleteData(
                table: "Invoices",
                keyColumn: "Id",
                keyValue: new Guid("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"));

            migrationBuilder.DeleteData(
                table: "Invoices",
                keyColumn: "Id",
                keyValue: new Guid("cccccccc-cccc-cccc-cccc-cccccccccccc"));

            migrationBuilder.DeleteData(
                table: "Invoices",
                keyColumn: "Id",
                keyValue: new Guid("dddddddd-dddd-dddd-dddd-dddddddddddd"));

            migrationBuilder.DeleteData(
                table: "Jobs",
                keyColumn: "Id",
                keyValue: new Guid("77777777-7777-7777-7777-777777777777"));

            migrationBuilder.DeleteData(
                table: "Jobs",
                keyColumn: "Id",
                keyValue: new Guid("88888888-8888-8888-8888-888888888888"));

            migrationBuilder.DeleteData(
                table: "Jobs",
                keyColumn: "Id",
                keyValue: new Guid("99999999-9999-9999-9999-999999999999"));

            migrationBuilder.DeleteData(
                table: "Jobs",
                keyColumn: "Id",
                keyValue: new Guid("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"));

            migrationBuilder.DeleteData(
                table: "Technicians",
                keyColumn: "Id",
                keyValue: new Guid("66666666-6666-6666-6666-666666666666"));

            migrationBuilder.DeleteData(
                table: "Customers",
                keyColumn: "Id",
                keyValue: new Guid("11111111-1111-1111-1111-111111111111"));

            migrationBuilder.DeleteData(
                table: "Customers",
                keyColumn: "Id",
                keyValue: new Guid("22222222-2222-2222-2222-222222222222"));

            migrationBuilder.DeleteData(
                table: "Customers",
                keyColumn: "Id",
                keyValue: new Guid("33333333-3333-3333-3333-333333333333"));

            migrationBuilder.DeleteData(
                table: "Technicians",
                keyColumn: "Id",
                keyValue: new Guid("44444444-4444-4444-4444-444444444444"));

            migrationBuilder.DeleteData(
                table: "Technicians",
                keyColumn: "Id",
                keyValue: new Guid("55555555-5555-5555-5555-555555555555"));

            migrationBuilder.DropColumn(
                name: "DeletedAt",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "IsDeleted",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "DeletedAt",
                table: "Technicians");

            migrationBuilder.DropColumn(
                name: "IsDeleted",
                table: "Technicians");

            migrationBuilder.DropColumn(
                name: "DeletedAt",
                table: "Roles");

            migrationBuilder.DropColumn(
                name: "IsDeleted",
                table: "Roles");

            migrationBuilder.DropColumn(
                name: "DeletedAt",
                table: "Permissions");

            migrationBuilder.DropColumn(
                name: "IsDeleted",
                table: "Permissions");

            migrationBuilder.DropColumn(
                name: "DeletedAt",
                table: "Jobs");

            migrationBuilder.DropColumn(
                name: "IsDeleted",
                table: "Jobs");

            migrationBuilder.DropColumn(
                name: "DeletedAt",
                table: "Invoices");

            migrationBuilder.DropColumn(
                name: "IsDeleted",
                table: "Invoices");

            migrationBuilder.DropColumn(
                name: "DeletedAt",
                table: "Customers");

            migrationBuilder.DropColumn(
                name: "IsDeleted",
                table: "Customers");

            migrationBuilder.DropColumn(
                name: "DeletedAt",
                table: "AuditLogs");

            migrationBuilder.DropColumn(
                name: "IsDeleted",
                table: "AuditLogs");
        }
    }
}
