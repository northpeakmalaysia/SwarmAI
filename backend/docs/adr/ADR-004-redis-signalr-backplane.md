# ADR-004: Use Redis for Distributed Caching and SignalR Backplane

## Status
Accepted

## Context
As we scale to multiple Api instances, in-memory caching and in-process SignalR connections will not suffice. We need a distributed cache and a SignalR backplane.

## Decision
Use Redis for both distributed caching and SignalR backplane.
- **Caching:** `StackExchange.Redis` wrapped behind `ICacheService` in Core, implemented in Infrastructure as `RedisCacheService`.
- **SignalR:** `Microsoft.AspNetCore.SignalR.StackExchangeRedis` (or built-in Redis backplane) so notifications reach users connected to any Api instance.

## Consequences
- **Positive:** Horizontal scaling of Api instances becomes straightforward.
- **Positive:** Cache invalidation is explicit and testable via the `ICacheService` abstraction.
- **Negative:** Adds a runtime dependency on Redis. Local development will use Docker Compose or fall back to in-memory cache when Redis is unavailable.
- **Negative:** SignalR with Redis introduces slight latency compared to in-memory transport, acceptable for our use case.
