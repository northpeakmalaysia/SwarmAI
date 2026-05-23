using FieldPulse.Core.DTOs;
using FieldPulse.Core.Entities;
using FieldPulse.Core.Enums;
using FieldPulse.Core.Interfaces;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace FieldPulse.Api.Modules;

public static class JobModule
{
    public static IEndpointRouteBuilder MapJobRoutes(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/jobs")
            .WithTags("Jobs");

        // GET /api/jobs
        group.MapGet("/", async (
            IRepository<Job> repo,
            CancellationToken ct) =>
        {
            var jobs = await repo.GetAllAsync(ct);
            return Results.Ok(jobs.Select(MapToDto));
        });

        // GET /api/jobs/{id}
        group.MapGet("/{id:guid}", async (
            Guid id,
            IRepository<Job> repo,
            CancellationToken ct) =>
        {
            var job = await repo.GetByIdAsync(id, ct);
            return job is not null ? Results.Ok(MapToDto(job)) : Results.NotFound();
        });

        // GET /api/jobs/customer/{customerId}
        group.MapGet("/customer/{customerId:guid}", async (
            Guid customerId,
            IRepository<Job> repo,
            CancellationToken ct) =>
        {
            var jobs = await repo.GetAllAsync(ct);
            var filtered = jobs.Where(j => j.CustomerId == customerId);
            return Results.Ok(filtered.Select(MapToDto));
        });

        // GET /api/jobs/technician/{technicianId}
        group.MapGet("/technician/{technicianId:guid}", async (
            Guid technicianId,
            IRepository<Job> repo,
            CancellationToken ct) =>
        {
            var jobs = await repo.GetAllAsync(ct);
            var filtered = jobs.Where(j => j.TechnicianId == technicianId);
            return Results.Ok(filtered.Select(MapToDto));
        });

        // POST /api/jobs
        group.MapPost("/", async (
            [FromBody] CreateJobRequest request,
            IRepository<Job> repo,
            IUnitOfWork uow,
            CancellationToken ct) =>
        {
            var job = new Job
            {
                Title = request.Title,
                Description = request.Description,
                ScheduledDate = request.ScheduledDate,
                EstimatedCost = request.EstimatedCost,
                Notes = request.Notes,
                CustomerId = request.CustomerId,
                TechnicianId = request.TechnicianId,
                Status = JobStatus.Pending,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };

            await repo.AddAsync(job, ct);
            await uow.SaveChangesAsync(ct);
            return Results.Created($"/api/jobs/{job.Id}", MapToDto(job));
        });

        // PUT /api/jobs/{id}
        group.MapPut("/{id:guid}", async (
            Guid id,
            [FromBody] UpdateJobRequest request,
            IRepository<Job> repo,
            IUnitOfWork uow,
            CancellationToken ct) =>
        {
            var job = await repo.GetByIdAsync(id, ct);
            if (job is null) return Results.NotFound();

            job.Title = request.Title;
            job.Description = request.Description;
            job.Status = request.Status;
            job.ScheduledDate = request.ScheduledDate;
            job.StartedAt = request.StartedAt;
            job.CompletedAt = request.CompletedAt;
            job.EstimatedCost = request.EstimatedCost;
            job.ActualCost = request.ActualCost;
            job.Notes = request.Notes;
            job.CustomerId = request.CustomerId;
            job.TechnicianId = request.TechnicianId;
            job.UpdatedAt = DateTime.UtcNow;

            await repo.UpdateAsync(job, ct);
            await uow.SaveChangesAsync(ct);
            return Results.NoContent();
        });

        // DELETE /api/jobs/{id}
        group.MapDelete("/{id:guid}", async (
            Guid id,
            IRepository<Job> repo,
            IUnitOfWork uow,
            CancellationToken ct) =>
        {
            var job = await repo.GetByIdAsync(id, ct);
            if (job is null) return Results.NotFound();

            await repo.DeleteAsync(job, ct);
            await uow.SaveChangesAsync(ct);
            return Results.NoContent();
        });

        // PATCH /api/jobs/{id}/start
        group.MapPatch("/{id:guid}/start", async (
            Guid id,
            IRepository<Job> repo,
            IUnitOfWork uow,
            CancellationToken ct) =>
        {
            var job = await repo.GetByIdAsync(id, ct);
            if (job is null) return Results.NotFound();

            job.Status = JobStatus.InProgress;
            job.StartedAt = DateTime.UtcNow;
            job.UpdatedAt = DateTime.UtcNow;

            await repo.UpdateAsync(job, ct);
            await uow.SaveChangesAsync(ct);
            return Results.Ok(MapToDto(job));
        });

        // PATCH /api/jobs/{id}/complete
        group.MapPatch("/{id:guid}/complete", async (
            Guid id,
            IRepository<Job> repo,
            IUnitOfWork uow,
            CancellationToken ct) =>
        {
            var job = await repo.GetByIdAsync(id, ct);
            if (job is null) return Results.NotFound();

            job.Status = JobStatus.Completed;
            job.CompletedAt = DateTime.UtcNow;
            job.UpdatedAt = DateTime.UtcNow;

            await repo.UpdateAsync(job, ct);
            await uow.SaveChangesAsync(ct);
            return Results.Ok(MapToDto(job));
        });

        return app;
    }

    private static JobDto MapToDto(Job j) => new()
    {
        Id = j.Id,
        Title = j.Title,
        Description = j.Description,
        Status = j.Status,
        ScheduledDate = j.ScheduledDate,
        StartedAt = j.StartedAt,
        CompletedAt = j.CompletedAt,
        EstimatedCost = j.EstimatedCost,
        ActualCost = j.ActualCost,
        Notes = j.Notes,
        CustomerId = j.CustomerId,
        CustomerName = j.Customer?.Name ?? "",
        TechnicianId = j.TechnicianId,
        TechnicianName = j.Technician is not null ? $"{j.Technician.FirstName} {j.Technician.LastName}" : null,
        CreatedAt = j.CreatedAt,
        UpdatedAt = j.UpdatedAt
    };
}
