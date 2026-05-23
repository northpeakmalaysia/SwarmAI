using Hangfire;
using Hangfire.PostgreSql;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using FieldPulse.Workers.Jobs;
using Serilog;

var builder = Host.CreateApplicationBuilder(args);

// Serilog
Log.Logger = new LoggerConfiguration()
    .MinimumLevel.Information()
    .Enrich.FromLogContext()
    .WriteTo.Console()
    .WriteTo.File("logs/workers-.log", rollingInterval: RollingInterval.Day)
    .CreateLogger();

// Hangfire
var connectionString = builder.Configuration.GetConnectionString("DefaultConnection")
    ?? "Host=localhost;Database=FieldPulse;Username=postgres;Password=postgres";

builder.Services.AddHangfire(config =>
    config.SetDataCompatibilityLevel(CompatibilityLevel.Version_180)
          .UseSimpleAssemblyNameTypeSerializer()
          .UseRecommendedSerializerSettings()
          .UsePostgreSqlStorage(options => options.UseNpgsqlConnection(connectionString)));

builder.Services.AddHangfireServer(options =>
{
    options.WorkerCount = builder.Configuration.GetValue<int>("Hangfire:WorkerCount", 5);
    options.Queues = ["default"];
    options.SchedulePollingInterval = TimeSpan.FromSeconds(
        builder.Configuration.GetValue<int>("Hangfire:QueuePollIntervalSeconds", 15));
});

// Jobs
builder.Services.AddTransient<DataCleanupJob>();

var app = builder.Build();

// Schedule recurring jobs
var recurringJobManager = app.Services.GetRequiredService<IRecurringJobManager>();
recurringJobManager.AddOrUpdate<DataCleanupJob>(
    "data-cleanup",
    job => job.ExecuteAsync(),
    Cron.Daily);

app.Run();
