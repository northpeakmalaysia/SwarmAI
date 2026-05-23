using System.Linq.Expressions;
using FieldPulse.Core.Entities;
using FieldPulse.Core.Interfaces;

namespace FieldPulse.Api.Tests.Infrastructure;

public class InMemoryRepository<T> : IRepository<T> where T : BaseEntity
{
    private readonly InMemoryStore _store;

    public InMemoryRepository(InMemoryStore store)
    {
        _store = store;
    }

    private List<T> Items => _store.GetList<T>();

    public Task<T?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default)
        => Task.FromResult(Items.FirstOrDefault(x => x.Id == id));

    public Task<IReadOnlyList<T>> GetAllAsync(CancellationToken cancellationToken = default)
        => Task.FromResult<IReadOnlyList<T>>(Items.ToList());

    public Task<IReadOnlyList<T>> FindAsync(Expression<Func<T, bool>> predicate, CancellationToken cancellationToken = default)
        => Task.FromResult<IReadOnlyList<T>>(Items.AsQueryable().Where(predicate).ToList());

    public Task<T> AddAsync(T entity, CancellationToken cancellationToken = default)
    {
        if (entity.Id == Guid.Empty) entity.Id = Guid.NewGuid();
        Items.Add(entity);
        return Task.FromResult(entity);
    }

    public Task UpdateAsync(T entity, CancellationToken cancellationToken = default)
    {
        var idx = Items.FindIndex(x => x.Id == entity.Id);
        if (idx >= 0) Items[idx] = entity;
        return Task.CompletedTask;
    }

    public Task DeleteAsync(T entity, CancellationToken cancellationToken = default)
    {
        Items.RemoveAll(x => x.Id == entity.Id);
        return Task.CompletedTask;
    }
}
