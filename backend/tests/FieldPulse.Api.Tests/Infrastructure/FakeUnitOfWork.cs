using FieldPulse.Core.Interfaces;

namespace FieldPulse.Api.Tests.Infrastructure;

public class FakeUnitOfWork : IUnitOfWork
{
    public Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
        => Task.FromResult(1);

    public void Dispose()
    {
        GC.SuppressFinalize(this);
    }
}
