# FieldPulse Backend — xUnit Test Project Setup

## Plan
- [x] Create `tests/FieldPulse.Core.Tests` xUnit project (net10.0) — DONE
- [x] Create Core.Tests domain logic tests — DONE
- [ ] Create `tests/FieldPulse.Api.Tests` xUnit project (net10.0)
- [ ] Add required NuGet packages to Api.Tests project
- [ ] Add project references (Api.Tests → Api, Core)
- [ ] Create Api.Tests integration tests:
  - [ ] `IntegrationTestBase.cs` — WebApplicationFactory base class
  - [ ] `Controllers/HealthControllerTests.cs` — GET /api/health → 200
  - [ ] `Modules/CustomerModuleTests.cs` — CRUD operations
  - [ ] `Modules/TechnicianModuleTests.cs` — CRUD operations
  - [ ] `Modules/JobModuleTests.cs` — CRUD + start/complete actions
  - [ ] `Modules/DashboardModuleTests.cs` — GET /api/dashboard/metrics
  - [ ] `Modules/InvoiceModuleTests.cs` — CRUD operations
- [ ] Wire Api.Tests into `FieldPulse.slnx` under `/tests/` folder
- [ ] Build solution with 0 errors
- [ ] Run `dotnet test` and report results

## Status
In Progress — creating Api.Tests integration tests
