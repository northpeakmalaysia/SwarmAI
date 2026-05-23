using FieldPulse.Core.DTOs;
using FieldPulse.Core.Entities;
using FieldPulse.Core.Enums;
using FieldPulse.Core.Interfaces;

namespace FieldPulse.Api.Modules;

public static class DashboardModule
{
    public static IEndpointRouteBuilder MapDashboardRoutes(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/dashboard")
            .WithTags("Dashboard");

        group.MapGet("/metrics", async (
            IRepository<Customer> customerRepo,
            IRepository<Technician> techRepo,
            IRepository<Job> jobRepo,
            IRepository<Invoice> invoiceRepo,
            CancellationToken ct) =>
        {
            var customers = await customerRepo.GetAllAsync(ct);
            var techs = await techRepo.GetAllAsync(ct);
            var jobs = await jobRepo.GetAllAsync(ct);
            var invoices = await invoiceRepo.GetAllAsync(ct);

            var today = DateTime.UtcNow.Date;
            var weekStart = today.AddDays(-6);

            var jobsThisWeek = jobs
                .Where(j => j.CreatedAt >= weekStart)
                .GroupBy(j => j.CreatedAt.ToString("ddd"))
                .Select(g => new WeeklyJobCountDto { Day = g.Key, Count = g.Count() })
                .ToList();

            var invoicesThisWeek = invoices
                .Where(i => i.CreatedAt >= weekStart)
                .GroupBy(i => i.CreatedAt.ToString("ddd"))
                .Select(g => new WeeklyInvoiceTotalDto { Day = g.Key, Total = g.Sum(x => x.Amount) })
                .ToList();

            var metrics = new DashboardMetricsDto
            {
                TotalCustomers = customers.Count,
                ActiveCustomers = customers.Count(c => c.IsActive),
                TotalTechnicians = techs.Count,
                ActiveTechnicians = techs.Count(t => t.Status == TechnicianStatus.Active),
                TotalJobs = jobs.Count,
                PendingJobs = jobs.Count(j => j.Status == JobStatus.Pending),
                InProgressJobs = jobs.Count(j => j.Status == JobStatus.InProgress),
                CompletedJobs = jobs.Count(j => j.Status == JobStatus.Completed),
                OverdueJobs = jobs.Count(j => j.Status != JobStatus.Completed && j.ScheduledDate < DateTime.UtcNow),
                TotalInvoices = invoices.Count,
                TotalInvoiceAmount = invoices.Sum(i => i.Amount),
                PaidInvoiceAmount = invoices.Where(i => i.Status == InvoiceStatus.Paid).Sum(i => i.Amount),
                OutstandingInvoiceAmount = invoices.Where(i => i.Status != InvoiceStatus.Paid && i.Status != InvoiceStatus.Cancelled).Sum(i => i.Amount),
                DraftInvoices = invoices.Count(i => i.Status == InvoiceStatus.Draft),
                SentInvoices = invoices.Count(i => i.Status == InvoiceStatus.Sent),
                PaidInvoices = invoices.Count(i => i.Status == InvoiceStatus.Paid),
                OverdueInvoices = invoices.Count(i => i.Status == InvoiceStatus.Overdue),
                JobsThisWeek = jobsThisWeek,
                InvoicesThisWeek = invoicesThisWeek,
            };

            return Results.Ok(metrics);
        });

        return app;
    }
}
