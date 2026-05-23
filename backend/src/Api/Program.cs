using System.Text;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.IdentityModel.Tokens;
using FieldPulse.Api;
using FieldPulse.Api.Modules;
using FieldPulse.Api.Middleware;
using FieldPulse.Infrastructure;
using FieldPulse.Shared.Options;
using Serilog;

var builder = WebApplication.CreateBuilder(args);

// Serilog
Log.Logger = new LoggerConfiguration()
    .MinimumLevel.Information()
    .Enrich.FromLogContext()
    .WriteTo.Console()
    .WriteTo.File("logs/api-.log", rollingInterval: RollingInterval.Day)
    .CreateLogger();

builder.Host.UseSerilog();

// Services
builder.Services.AddControllers()
    .AddJsonOptions(options =>
        options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter()));

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// CORS
var corsSection = builder.Configuration.GetSection("Cors");
var allowedOrigins = corsSection.GetSection("AllowedOrigins").Get<string[]>() ?? [];
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend", policy =>
    {
        policy.WithOrigins(allowedOrigins)
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});

// JWT Authentication
var jwtOptions = builder.Configuration.GetSection(JwtOptions.SectionName).Get<JwtOptions>();
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = jwtOptions?.Issuer,
            ValidAudience = jwtOptions?.Audience,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtOptions?.Secret ?? "fallback-secret-key-must-be-at-least-32-characters!")),
            ClockSkew = TimeSpan.Zero
        };
    });

builder.Services.AddAuthorization();

// Infrastructure (EF, Redis, Identity, Email, SignalR)
builder.Services.AddInfrastructureServices(builder.Configuration);

// Factory-activated middleware (implement IMiddleware) must be registered in DI,
// otherwise UseMiddleware<T> throws "No service for type ..." on the first request.
builder.Services.AddTransient<RequestTimingMiddleware>();
builder.Services.AddTransient<ExceptionHandlingMiddleware>();

// Health Checks
builder.Services.AddHealthChecks()
    .AddDbContextCheck<FieldPulse.Infrastructure.Persistence.ApplicationDbContext>("database")
    .AddCheck<MemoryHealthCheck>("memory");

var app = builder.Build();

// Middleware Pipeline
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseSerilogRequestLogging();
app.UseHttpsRedirection();
app.UseCors("AllowFrontend");
app.UseAuthentication();
app.UseAuthorization();

app.UseMiddleware<RequestTimingMiddleware>();
app.UseMiddleware<ExceptionHandlingMiddleware>();

app.MapControllers();
app.MapInvoiceRoutes();
app.MapCustomerRoutes();
app.MapTechnicianRoutes();
app.MapJobRoutes();
app.MapDashboardRoutes();
app.MapHealthChecks("/health", new HealthCheckOptions
{
    ResponseWriter = HealthCheckResponseWriter.WriteResponse
});
app.MapHub<FieldPulse.Infrastructure.Messaging.NotificationHub>("/hubs/notifications");

app.Run();

// Dummy health check for memory
public class MemoryHealthCheck : Microsoft.Extensions.Diagnostics.HealthChecks.IHealthCheck
{
    public Task<Microsoft.Extensions.Diagnostics.HealthChecks.HealthCheckResult> CheckHealthAsync(
        Microsoft.Extensions.Diagnostics.HealthChecks.HealthCheckContext context,
        CancellationToken cancellationToken = default)
    {
        var allocated = GC.GetTotalMemory(forceFullCollection: false);
        var threshold = 1024L * 1024 * 1024; // 1 GB
        var status = allocated < threshold
            ? Microsoft.Extensions.Diagnostics.HealthChecks.HealthStatus.Healthy
            : Microsoft.Extensions.Diagnostics.HealthChecks.HealthStatus.Degraded;

        return Task.FromResult(
            new Microsoft.Extensions.Diagnostics.HealthChecks.HealthCheckResult(
                status,
                data: new Dictionary<string, object>
                {
                    ["AllocatedBytes"] = allocated,
                    ["ThresholdBytes"] = threshold
                }));
    }
}

// Exposes the implicit Program entry point so WebApplicationFactory<Program>
// can bootstrap the real application pipeline for integration tests.
public partial class Program { }
