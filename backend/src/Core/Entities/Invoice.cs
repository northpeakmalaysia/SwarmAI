using FieldPulse.Core.Enums;

namespace FieldPulse.Core.Entities;

public class Invoice : BaseEntity
{
    public string CustomerName { get; set; } = string.Empty;
    public string? CustomerEmail { get; set; }
    public string? Description { get; set; }
    public decimal Amount { get; set; }
    public InvoiceStatus Status { get; set; } = InvoiceStatus.Draft;
    public DateTime DueDate { get; set; }
    public DateTime? PaidAt { get; set; }
}
