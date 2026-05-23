# FieldPulse Backend — xUnit Test Project Setup

## Plan
- [ ] Create `tests/FieldPulse.Core.Tests` xUnit project (net10.0)
- [ ] Create `tests/FieldPulse.Api.Tests` xUnit project (net10.0)
- [ ] Add required NuGet packages to both projects
- [ ] Add project references (Core.Tests → Core; Api.Tests → Api, Core)
- [ ] Create Core.Tests domain logic tests:
  - [ ] `Entities/InvoiceTests.cs` — defaults, status, amount
  - [ ] `Entities/JobTests.cs` — defaults, CustomerId
  - [ ] `Entities/CustomerTests.cs` — IsActive, Name required
  - [ ] `ValueObjects/EmailAddressTests.cs` — valid/invalid parsing
- [ ] Create Api.Tests integration tests:
  - [ ] `Controllers/HealthControllerTests.cs` — GET /api/health → 200
  - [ ] `Modules/InvoiceModuleTests.cs` — GET list, POST create, GET 404
- [ ] Wire both test projects into `FieldPulse.slnx` under `/tests/` folder
- [ ] Build solution with 0 errors
- [ ] Run `dotnet test` and report results

## Status
In Progress — executing via Claude Code CLI
