using FieldPulse.Core.Enums;

namespace FieldPulse.Core.DTOs;

public class UpdateInvoiceRequest
{
    public string CustomerName { get; set; } = string.Empty;
    public string? CustomerEmail { get; set; }
    public string? Description { get; set; }
    public decimal Amount { get; set; }
    public InvoiceStatus Status { get; set; }
    public DateTime DueDate { get; set; }
    public DateTime? PaidAt { get; set; }
}
