# Backend .NET Clean Architecture — TODO

## Overview
Recreate the entire .NET Clean Architecture backend solution under `backend/` after a previous fabricated report.

## Projects
- `FieldPulse.Core` — Domain entities, interfaces, DTOs, enums, exceptions
- `FieldPulse.Infrastructure` — EF Core, Redis, SignalR, Email, Identity, Repositories
- `FieldPulse.Api` — ASP.NET Core host, controllers, middleware, health checks, Serilog
- `FieldPulse.Workers` — Hangfire background job host
- `FieldPulse.Shared` — Common utilities, strongly-typed options, shared constants

## Task Checklist

- [ ] 1. Scaffold solution and 5 projects with correct folder structure
- [ ] 2. Configure project references enforcing Clean Architecture boundaries
- [ ] 3. Write four Architecture Decision Records (ADRs) in `docs/adr/`
- [ ] 4. Implement Core domain layer (entities, interfaces, DTOs)
- [ ] 5. Implement Infrastructure layer (EF Core, Redis, SignalR, Email stubs)
- [ ] 6. Implement Api host (Program.cs, middleware, health checks, Serilog)
- [ ] 7. Implement Workers project (Hangfire host) and Shared options
- [ ] 8. Write global appsettings.json with strongly-typed options classes
- [ ] 9. Verify every file exists on disk before reporting completion

## Clean Architecture Rules
- Core has ZERO external dependencies (no NuGet packages except maybe MediatR contracts or similar abstractions).
- Infrastructure references Core only.
- Api references Core and Infrastructure.
- Workers references Core, Infrastructure, and Shared.
- Shared is referenced by Infrastructure, Api, and Workers (no reference to Core to avoid circularity; Shared contains pure cross-cutting utilities).

## ADRs Required
1. ADR-001: Use Clean Architecture with vertical slices
2. ADR-002: Use Entity Framework Core with PostgreSQL
3. ADR-003: Use Hangfire for background job processing
4. ADR-004: Use Redis for distributed caching and SignalR backplane

## Tech Stack
- .NET 8
- EF Core (Npgsql)
- Redis (StackExchange.Redis)
- SignalR
- Hangfire
- Serilog
- FluentValidation
- MediatR (optional, but good for Clean Architecture)
- xUnit (test stubs)
