namespace FieldPulse.Core.Exceptions;

public class ValidationException : DomainException
{
    public IReadOnlyDictionary<string, string[]> Errors { get; }

    public ValidationException(IDictionary<string, string[]> errors)
        : base("One or more validation errors occurred.")
    {
        Errors = errors.AsReadOnly();
    }

    public ValidationException(string propertyName, string errorMessage)
        : base($"Validation failed for '{propertyName}'.")
    {
        Errors = new Dictionary<string, string[]> { [propertyName] = [errorMessage] }.AsReadOnly();
    }
}
