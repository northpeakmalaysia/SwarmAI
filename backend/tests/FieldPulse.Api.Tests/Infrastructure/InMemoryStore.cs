using System.Collections;
using FieldPulse.Core.Entities;

namespace FieldPulse.Api.Tests.Infrastructure;

public class InMemoryStore
{
    private readonly Dictionary<Type, IList> _store = new();

    public List<T> GetList<T>() where T : BaseEntity
    {
        var type = typeof(T);
        if (!_store.ContainsKey(type))
            _store[type] = new List<T>();
        return (List<T>)_store[type];
    }

    public void ClearAll()
    {
        _store.Clear();
    }
}
