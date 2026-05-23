# ADR-002: Use Entity Framework Core with PostgreSQL

## Status
Accepted

## Context
We need an ORM for relational data access. Raw ADO.NET is too verbose; Dapper is fast but lacks migrations and change tracking. EF Core provides migrations, LINQ translation, and strong tooling in .NET 8/10.

## Decision
Use Entity Framework Core with the Npgsql PostgreSQL provider.
- Migrations will be stored in `FieldPulse.Infrastructure/Persistence/Migrations/`.
- All entities will be configured using Fluent API in `EntityConfigurations/`.
- `ApplicationDbContext` will expose `DbSet<T>` for each aggregate root.

## Consequences
- **Positive:** Strongly-typed queries, automatic migration generation, excellent PostgreSQL JSON support for future extensibility.
- **Positive:** `DbContextFactory` enables design-time tooling without a running web host.
- **Negative:** EF Core can generate inefficient SQL for complex queries. We will monitor query plans and fall back to raw SQL or Dapper for hot paths if needed.
