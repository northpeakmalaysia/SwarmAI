namespace FieldPulse.Core.DTOs;

public class DashboardMetricsDto
{
    public int TotalCustomers { get; set; }
    public int ActiveCustomers { get; set; }
    public int TotalTechnicians { get; set; }
    public int ActiveTechnicians { get; set; }
    public int TotalJobs { get; set; }
    public int PendingJobs { get; set; }
    public int InProgressJobs { get; set; }
    public int CompletedJobs { get; set; }
    public int OverdueJobs { get; set; }
    public int TotalInvoices { get; set; }
    public decimal TotalInvoiceAmount { get; set; }
    public decimal PaidInvoiceAmount { get; set; }
    public decimal OutstandingInvoiceAmount { get; set; }
    public int DraftInvoices { get; set; }
    public int SentInvoices { get; set; }
    public int PaidInvoices { get; set; }
    public int OverdueInvoices { get; set; }
    public List<WeeklyJobCountDto> JobsThisWeek { get; set; } = [];
    public List<WeeklyInvoiceTotalDto> InvoicesThisWeek { get; set; } = [];
}

public class WeeklyJobCountDto
{
    public string Day { get; set; } = string.Empty;
    public int Count { get; set; }
}

public class WeeklyInvoiceTotalDto
{
    public string Day { get; set; } = string.Empty;
    public decimal Total { get; set; }
}
