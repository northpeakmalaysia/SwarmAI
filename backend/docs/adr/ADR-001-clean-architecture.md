# ADR-001: Adopt Clean Architecture with Vertical Slices

## Status
Accepted

## Context
The Sakinah platform needs a backend that can evolve quickly, support multiple frontends (web, mobile), and remain testable as the domain grows. We evaluated Onion Architecture, Ports & Adapters, and Clean Architecture. All are valid; Clean Architecture provides the clearest dependency rule (dependencies point inward) and the best community tooling for .NET.

## Decision
We will structure the backend using Clean Architecture with the following projects:
- **Core** — domain entities, interfaces, value objects, exceptions, DTOs. No external dependencies.
- **Infrastructure** — EF Core, Redis, email, SignalR, identity implementations. References Core only.
- **Api** — ASP.NET Core host, controllers, middleware, health checks. References Core and Infrastructure.
- **Workers** — Hangfire background job host. References Core, Infrastructure, and Shared.
- **Shared** — cross-cutting utilities, strongly-typed options. Referenced by Infrastructure, Api, and Workers.

## Consequences
- **Positive:** Testability is high because Core has no external dependencies. Swapping PostgreSQL for another database only touches Infrastructure.
- **Positive:** New developers can locate code quickly (entities in Core, persistence in Infrastructure).
- **Negative:** Slightly more projects than a minimal API. Build times are still negligible for our size.
- **Risk:** Developers may accidentally reference Infrastructure from Core. We will enforce this via CI build checks and peer review.
