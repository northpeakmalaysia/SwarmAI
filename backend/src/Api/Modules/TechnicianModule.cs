using FieldPulse.Core.DTOs;
using FieldPulse.Core.Entities;
using FieldPulse.Core.Enums;
using FieldPulse.Core.Interfaces;
using Microsoft.AspNetCore.Mvc;

namespace FieldPulse.Api.Modules;

public static class TechnicianModule
{
    public static IEndpointRouteBuilder MapTechnicianRoutes(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/technicians")
            .WithTags("Technicians");

        // GET /api/technicians
        group.MapGet("/", async (
            IRepository<Technician> repo,
            CancellationToken ct) =>
        {
            var techs = await repo.GetAllAsync(ct);
            return Results.Ok(techs.Select(MapToDto));
        });

        // GET /api/technicians/{id}
        group.MapGet("/{id:guid}", async (
            Guid id,
            IRepository<Technician> repo,
            CancellationToken ct) =>
        {
            var tech = await repo.GetByIdAsync(id, ct);
            return tech is not null ? Results.Ok(MapToDto(tech)) : Results.NotFound();
        });

        // POST /api/technicians
        group.MapPost("/", async (
            [FromBody] CreateTechnicianRequest request,
            IRepository<Technician> repo,
            IUnitOfWork uow,
            CancellationToken ct) =>
        {
            var tech = new Technician
            {
                FirstName = request.FirstName,
                LastName = request.LastName,
                Email = request.Email,
                Phone = request.Phone,
                Specialization = request.Specialization,
                Status = TechnicianStatus.Active,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };

            await repo.AddAsync(tech, ct);
            await uow.SaveChangesAsync(ct);
            return Results.Created($"/api/technicians/{tech.Id}", MapToDto(tech));
        });

        // PUT /api/technicians/{id}
        group.MapPut("/{id:guid}", async (
            Guid id,
            [FromBody] UpdateTechnicianRequest request,
            IRepository<Technician> repo,
            IUnitOfWork uow,
            CancellationToken ct) =>
        {
            var tech = await repo.GetByIdAsync(id, ct);
            if (tech is null) return Results.NotFound();

            tech.FirstName = request.FirstName;
            tech.LastName = request.LastName;
            tech.Email = request.Email;
            tech.Phone = request.Phone;
            tech.Status = request.Status;
            tech.Specialization = request.Specialization;
            tech.UpdatedAt = DateTime.UtcNow;

            await repo.UpdateAsync(tech, ct);
            await uow.SaveChangesAsync(ct);
            return Results.NoContent();
        });

        // DELETE /api/technicians/{id}
        group.MapDelete("/{id:guid}", async (
            Guid id,
            IRepository<Technician> repo,
            IUnitOfWork uow,
            CancellationToken ct) =>
        {
            var tech = await repo.GetByIdAsync(id, ct);
            if (tech is null) return Results.NotFound();

            await repo.DeleteAsync(tech, ct);
            await uow.SaveChangesAsync(ct);
            return Results.NoContent();
        });

        return app;
    }

    private static TechnicianDto MapToDto(Technician t) => new()
    {
        Id = t.Id,
        FirstName = t.FirstName,
        LastName = t.LastName,
        Email = t.Email,
        Phone = t.Phone,
        Status = t.Status,
        Specialization = t.Specialization,
        CreatedAt = t.CreatedAt,
        UpdatedAt = t.UpdatedAt
    };
}
