using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using FieldPulse.Api.Tests.Infrastructure;
using FieldPulse.Core.Interfaces;

namespace FieldPulse.Api.Tests;

public class CustomWebApplicationFactory : WebApplicationFactory<Program>
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.ConfigureTestServices(services =>
        {
            // Remove Redis
            var redis = services.SingleOrDefault(d => d.ServiceType.FullName?.Contains("IConnectionMultiplexer") == true);
            if (redis != null) services.Remove(redis);

            // Remove DB context registrations
            var dbContextDescriptors = services.Where(d => d.ServiceType.Name.Contains("DbContext") || d.ImplementationType?.Name.Contains("DbContext") == true).ToList();
            foreach (var desc in dbContextDescriptors) services.Remove(desc);

            // Remove health checks that need real DB
            var healthChecks = services.Where(d => d.ServiceType == typeof(Microsoft.Extensions.Diagnostics.HealthChecks.IHealthCheck)).ToList();
            foreach (var desc in healthChecks) services.Remove(desc);

            // Replace repositories with in-memory
            var repoDescriptors = services.Where(d => d.ServiceType.IsGenericType && d.ServiceType.GetGenericTypeDefinition() == typeof(IRepository<>)).ToList();
            foreach (var desc in repoDescriptors) services.Remove(desc);

            services.AddSingleton<InMemoryStore>();
            services.AddScoped(typeof(IRepository<>), typeof(InMemoryRepository<>));

            // Replace unit of work
            var uowDescriptor = services.SingleOrDefault(d => d.ServiceType == typeof(IUnitOfWork));
            if (uowDescriptor != null) services.Remove(uowDescriptor);
            services.AddScoped<IUnitOfWork, FakeUnitOfWork>();

            // Replace cache
            var cacheDescriptor = services.SingleOrDefault(d => d.ServiceType == typeof(ICacheService));
            if (cacheDescriptor != null) services.Remove(cacheDescriptor);
            services.AddScoped<ICacheService, FakeCacheService>();

            // Replace email
            var emailDescriptor = services.SingleOrDefault(d => d.ServiceType == typeof(IEmailService));
            if (emailDescriptor != null) services.Remove(emailDescriptor);
            services.AddScoped<IEmailService, FakeEmailService>();
        });
    }
}
