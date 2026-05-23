using System.Text.Json;
using Microsoft.Extensions.Logging;
using Sakinah.Core.Interfaces;
using StackExchange.Redis;

namespace Sakinah.Infrastructure.Caching;

public class RedisCacheService : ICacheService
{
    private readonly IDatabase _db;
    private readonly ILogger<RedisCacheService> _logger;

    public RedisCacheService(IConnectionMultiplexer multiplexer, ILogger<RedisCacheService> logger)
    {
        _db = multiplexer.GetDatabase();
        _logger = logger;
    }

    public async Task<T?> GetAsync<T>(string key, CancellationToken cancellationToken = default)
    {
        var value = await _db.StringGetAsync(key);
        if (value.IsNullOrEmpty)
        {
            _logger.LogDebug("Cache miss for key {Key}", key);
            return default;
        }

        _logger.LogDebug("Cache hit for key {Key}", key);
        return JsonSerializer.Deserialize<T>(value.ToString());
    }

    public async Task SetAsync<T>(string key, T value, TimeSpan? expiration = null, CancellationToken cancellationToken = default)
    {
        var json = JsonSerializer.Serialize(value);
        await _db.StringSetAsync(key, json);
        if (expiration.HasValue)
            await _db.KeyExpireAsync(key, expiration.Value);
        _logger.LogDebug("Cache set for key {Key}", key);
    }

    public async Task RemoveAsync(string key, CancellationToken cancellationToken = default)
    {
        await _db.KeyDeleteAsync(key);
        _logger.LogDebug("Cache removed for key {Key}", key);
    }

    public async Task<bool> ExistsAsync(string key, CancellationToken cancellationToken = default)
        => await _db.KeyExistsAsync(key);
}
