# Migrations

Run the following from the `backend/` directory:

```bash
dotnet ef migrations add InitialCreate --project src/Infrastructure --startup-project src/Api
dotnet ef database update --project src/Infrastructure --startup-project src/Api
```

Or using the Workers project as startup:

```bash
dotnet ef migrations add InitialCreate --project src/Infrastructure --startup-project src/Workers
```
