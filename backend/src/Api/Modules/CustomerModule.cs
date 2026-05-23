using FieldPulse.Core.DTOs;
using FieldPulse.Core.Entities;
using FieldPulse.Core.Interfaces;
using Microsoft.AspNetCore.Mvc;

namespace FieldPulse.Api.Modules;

public static class CustomerModule
{
    public static IEndpointRouteBuilder MapCustomerRoutes(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/customers")
            .WithTags("Customers");

        // GET /api/customers
        group.MapGet("/", async (
            IRepository<Customer> repo,
            CancellationToken ct) =>
        {
            var customers = await repo.GetAllAsync(ct);
            return Results.Ok(customers.Select(MapToDto));
        });

        // GET /api/customers/{id}
        group.MapGet("/{id:guid}", async (
            Guid id,
            IRepository<Customer> repo,
            CancellationToken ct) =>
        {
            var customer = await repo.GetByIdAsync(id, ct);
            return customer is not null ? Results.Ok(MapToDto(customer)) : Results.NotFound();
        });

        // POST /api/customers
        group.MapPost("/", async (
            [FromBody] CreateCustomerRequest request,
            IRepository<Customer> repo,
            IUnitOfWork uow,
            CancellationToken ct) =>
        {
            var customer = new Customer
            {
                Name = request.Name,
                Email = request.Email,
                Phone = request.Phone,
                Address = request.Address,
                City = request.City,
                PostalCode = request.PostalCode,
                Notes = request.Notes,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };

            await repo.AddAsync(customer, ct);
            await uow.SaveChangesAsync(ct);
            return Results.Created($"/api/customers/{customer.Id}", MapToDto(customer));
        });

        // PUT /api/customers/{id}
        group.MapPut("/{id:guid}", async (
            Guid id,
            [FromBody] UpdateCustomerRequest request,
            IRepository<Customer> repo,
            IUnitOfWork uow,
            CancellationToken ct) =>
        {
            var customer = await repo.GetByIdAsync(id, ct);
            if (customer is null) return Results.NotFound();

            customer.Name = request.Name;
            customer.Email = request.Email;
            customer.Phone = request.Phone;
            customer.Address = request.Address;
            customer.City = request.City;
            customer.PostalCode = request.PostalCode;
            customer.Notes = request.Notes;
            customer.IsActive = request.IsActive;
            customer.UpdatedAt = DateTime.UtcNow;

            await repo.UpdateAsync(customer, ct);
            await uow.SaveChangesAsync(ct);
            return Results.NoContent();
        });

        // DELETE /api/customers/{id}
        group.MapDelete("/{id:guid}", async (
            Guid id,
            IRepository<Customer> repo,
            IUnitOfWork uow,
            CancellationToken ct) =>
        {
            var customer = await repo.GetByIdAsync(id, ct);
            if (customer is null) return Results.NotFound();

            await repo.DeleteAsync(customer, ct);
            await uow.SaveChangesAsync(ct);
            return Results.NoContent();
        });

        return app;
    }

    private static CustomerDto MapToDto(Customer c) => new()
    {
        Id = c.Id,
        Name = c.Name,
        Email = c.Email,
        Phone = c.Phone,
        Address = c.Address,
        City = c.City,
        PostalCode = c.PostalCode,
        Notes = c.Notes,
        IsActive = c.IsActive,
        CreatedAt = c.CreatedAt,
        UpdatedAt = c.UpdatedAt
    };
}
