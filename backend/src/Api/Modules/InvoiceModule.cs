using FieldPulse.Core.DTOs;
using FieldPulse.Core.Entities;
using FieldPulse.Core.Enums;
using FieldPulse.Core.Interfaces;
using Microsoft.AspNetCore.Mvc;

namespace FieldPulse.Api.Modules;

public static class InvoiceModule
{
    public static IEndpointRouteBuilder MapInvoiceRoutes(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/invoices")
            .WithTags("Invoices")
            .WithOpenApi();

        // GET /api/invoices
        group.MapGet("/", async (
            IRepository<Invoice> repo,
            CancellationToken ct) =>
        {
            var invoices = await repo.GetAllAsync(ct);
            return Results.Ok(invoices.Select(MapToDto));
        });

        // GET /api/invoices/{id}
        group.MapGet("/{id:guid}", async (
            Guid id,
            IRepository<Invoice> repo,
            CancellationToken ct) =>
        {
            var invoice = await repo.GetByIdAsync(id, ct);
            return invoice is not null ? Results.Ok(MapToDto(invoice)) : Results.NotFound();
        });

        // POST /api/invoices
        group.MapPost("/", async (
            [FromBody] CreateInvoiceRequest request,
            IRepository<Invoice> repo,
            IUnitOfWork uow,
            CancellationToken ct) =>
        {
            var invoice = new Invoice
            {
                CustomerName = request.CustomerName,
                CustomerEmail = request.CustomerEmail,
                Description = request.Description,
                Amount = request.Amount,
                DueDate = request.DueDate,
                Status = InvoiceStatus.Draft,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };

            await repo.AddAsync(invoice, ct);
            await uow.SaveChangesAsync(ct);
            return Results.Created($"/api/invoices/{invoice.Id}", MapToDto(invoice));
        });

        // PUT /api/invoices/{id}
        group.MapPut("/{id:guid}", async (
            Guid id,
            [FromBody] UpdateInvoiceRequest request,
            IRepository<Invoice> repo,
            IUnitOfWork uow,
            CancellationToken ct) =>
        {
            var invoice = await repo.GetByIdAsync(id, ct);
            if (invoice is null) return Results.NotFound();

            invoice.CustomerName = request.CustomerName;
            invoice.CustomerEmail = request.CustomerEmail;
            invoice.Description = request.Description;
            invoice.Amount = request.Amount;
            invoice.Status = request.Status;
            invoice.DueDate = request.DueDate;
            invoice.PaidAt = request.PaidAt;
            invoice.UpdatedAt = DateTime.UtcNow;

            await repo.UpdateAsync(invoice, ct);
            await uow.SaveChangesAsync(ct);
            return Results.NoContent();
        });

        // DELETE /api/invoices/{id}
        group.MapDelete("/{id:guid}", async (
            Guid id,
            IRepository<Invoice> repo,
            IUnitOfWork uow,
            CancellationToken ct) =>
        {
            var invoice = await repo.GetByIdAsync(id, ct);
            if (invoice is null) return Results.NotFound();

            await repo.DeleteAsync(invoice, ct);
            await uow.SaveChangesAsync(ct);
            return Results.NoContent();
        });

        return app;
    }

    private static InvoiceDto MapToDto(Invoice invoice) => new()
    {
        Id = invoice.Id,
        CustomerName = invoice.CustomerName,
        CustomerEmail = invoice.CustomerEmail,
        Description = invoice.Description,
        Amount = invoice.Amount,
        Status = invoice.Status,
        DueDate = invoice.DueDate,
        PaidAt = invoice.PaidAt,
        CreatedAt = invoice.CreatedAt,
        UpdatedAt = invoice.UpdatedAt
    };
}
