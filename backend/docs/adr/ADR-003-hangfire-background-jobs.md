# ADR-003: Use Hangfire for Background Job Processing

## Status
Accepted

## Context
The platform requires background jobs (data cleanup, email dispatch, report generation). We evaluated Quartz.NET, Azure Functions, AWS Lambda, and Hangfire.

## Decision
Use Hangfire hosted inside the `FieldPulse.Workers` console application.
- Storage backend: PostgreSQL via `Hangfire.PostgreSql`.
- Jobs will be defined as concrete classes implementing a simple `IJob<T>` pattern (or direct `BackgroundJob.Enqueue`).
- The Workers project runs as a separate process, keeping the Api process responsive.

## Consequences
- **Positive:** Simple dashboard out of the box, reliable retries, and cron-based scheduling.
- **Positive:** Uses the same PostgreSQL instance as the application, reducing infrastructure footprint.
- **Negative:** Hangfire tables will coexist with application tables; we will prefix them or use a separate schema.
- **Negative:** Workers process must be monitored separately from the Api (separate health endpoint or container).
