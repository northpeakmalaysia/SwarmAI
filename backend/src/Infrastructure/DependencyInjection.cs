using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Sakinah.Core.Interfaces;
using Sakinah.Infrastructure.Caching;
using Sakinah.Infrastructure.Email;
using Sakinah.Infrastructure.Identity;
using Sakinah.Infrastructure.Messaging;
using Sakinah.Infrastructure.Persistence;
using Sakinah.Infrastructure.Persistence.Repositories;
using Sakinah.Shared.Options;
using StackExchange.Redis;

namespace Sakinah.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructureServices(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        // Options
        services.Configure<DatabaseOptions>(configuration.GetSection(DatabaseOptions.SectionName));
        services.Configure<RedisOptions>(configuration.GetSection(RedisOptions.SectionName));
        services.Configure<SmtpOptions>(configuration.GetSection(SmtpOptions.SectionName));
        services.Configure<JwtOptions>(configuration.GetSection(JwtOptions.SectionName));

        // Database
        var dbOptions = configuration.GetSection(DatabaseOptions.SectionName).Get<DatabaseOptions>();
        services.AddDbContext<ApplicationDbContext>(options =>
        {
            options.UseNpgsql(dbOptions?.ConnectionString ?? "Host=localhost;Database=sakinah;Username=postgres;Password=postgres");
            if (dbOptions?.EnableSensitiveDataLogging == true)
                options.EnableSensitiveDataLogging();
            if (dbOptions?.EnableDetailedErrors == true)
                options.EnableDetailedErrors();
        });

        // Redis
        var redisOptions = configuration.GetSection(RedisOptions.SectionName).Get<RedisOptions>();
        if (!string.IsNullOrWhiteSpace(redisOptions?.ConnectionString))
        {
            services.AddSingleton<IConnectionMultiplexer>(
                ConnectionMultiplexer.Connect(redisOptions.ConnectionString));
        }

        // Services
        services.AddScoped(typeof(IRepository<>), typeof(EfRepository<>));
        services.AddScoped<IUnitOfWork, UnitOfWork>();
        services.AddScoped<ICacheService, RedisCacheService>();
        services.AddScoped<IEmailService, SmtpEmailService>();
        services.AddScoped<IIdentityService, IdentityService>();

        // SignalR
        services.AddSignalR();

        return services;
    }
}
