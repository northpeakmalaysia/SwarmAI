using System.Text.RegularExpressions;

namespace Sakinah.Core.ValueObjects;

public partial class EmailAddress
{
    public string Value { get; }

    public EmailAddress(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
            throw new ArgumentException("Email cannot be empty.", nameof(value));

        if (!EmailRegex().IsMatch(value))
            throw new ArgumentException("Invalid email format.", nameof(value));

        Value = value.ToLowerInvariant();
    }

    public override string ToString() => Value;

    public override bool Equals(object? obj) => obj is EmailAddress other && Value == other.Value;

    public override int GetHashCode() => Value.GetHashCode(StringComparison.OrdinalIgnoreCase);

    [GeneratedRegex(@"^[^@\s]+@[^@\s]+\.[^@\s]+$", RegexOptions.Compiled)]
    private static partial Regex EmailRegex();
}
