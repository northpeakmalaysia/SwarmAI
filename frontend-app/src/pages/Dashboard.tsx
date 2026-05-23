import { useQuery } from '@tanstack/react-query'
import {
  LayoutDashboard,
  Users,
  Wrench,
  ClipboardList,
  FileText,
  DollarSign,
  CheckCircle,
  Clock,
  AlertTriangle,
} from 'lucide-react'
import { getDashboardMetrics } from '../services/api'

export default function Dashboard() {
  const { data: metrics, isLoading } = useQuery({
    queryKey: ['dashboard', 'metrics'],
    queryFn: getDashboardMetrics,
  })

  if (isLoading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">Dashboard</h1>
        <p className="text-gray-600">Loading metrics...</p>
      </div>
    )
  }

  if (!metrics) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">Dashboard</h1>
        <p className="text-gray-600">Failed to load metrics.</p>
      </div>
    )
  }

  const topCards = [
    {
      label: 'Total Customers',
      value: metrics.totalCustomers.toLocaleString(),
      icon: Users,
      color: 'text-blue-600',
    },
    {
      label: 'Active Technicians',
      value: metrics.activeTechnicians.toLocaleString(),
      icon: Wrench,
      color: 'text-green-600',
    },
    {
      label: 'Pending Jobs',
      value: metrics.pendingJobs.toLocaleString(),
      icon: Clock,
      color: 'text-yellow-600',
    },
    {
      label: 'Outstanding Invoices',
      value: `$${metrics.outstandingInvoiceAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      icon: DollarSign,
      color: 'text-red-600',
    },
  ]

  const secondCards = [
    {
      label: 'Completed Jobs',
      value: metrics.completedJobs.toLocaleString(),
      icon: CheckCircle,
      color: 'text-green-600',
    },
    {
      label: 'In Progress Jobs',
      value: metrics.inProgressJobs.toLocaleString(),
      icon: ClipboardList,
      color: 'text-blue-600',
    },
    {
      label: 'Paid Invoices',
      value: metrics.paidInvoices.toLocaleString(),
      icon: FileText,
      color: 'text-green-600',
    },
    {
      label: 'Overdue Invoices',
      value: metrics.overdueInvoices.toLocaleString(),
      icon: AlertTriangle,
      color: 'text-red-600',
    },
  ]

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4 flex items-center gap-2">
        <LayoutDashboard className="w-6 h-6" />
        Dashboard
      </h1>

      {/* Top row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        {topCards.map((card) => {
          const Icon = card.icon
          return (
            <div key={card.label} className="bg-white border rounded-lg p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-600">{card.label}</span>
                <Icon className={`w-5 h-5 ${card.color}`} />
              </div>
              <p className="text-2xl font-bold text-gray-900">{card.value}</p>
            </div>
          )
        })}
      </div>

      {/* Second row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {secondCards.map((card) => {
          const Icon = card.icon
          return (
            <div key={card.label} className="bg-white border rounded-lg p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-600">{card.label}</span>
                <Icon className={`w-5 h-5 ${card.color}`} />
              </div>
              <p className="text-2xl font-bold text-gray-900">{card.value}</p>
            </div>
          )
        })}
      </div>

      {/* Third row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border rounded-lg p-4 shadow-sm">
          <h2 className="text-lg font-semibold mb-3">Jobs This Week</h2>
          <div className="space-y-2">
            {metrics.jobsThisWeek.map((item) => (
              <div key={item.day} className="flex items-center justify-between py-2 border-b last:border-0">
                <span className="text-sm text-gray-700">{item.day}</span>
                <span className="text-sm font-medium">{item.count} jobs</span>
              </div>
            ))}
            {metrics.jobsThisWeek.length === 0 && (
              <p className="text-sm text-gray-500">No jobs this week.</p>
            )}
          </div>
        </div>

        <div className="bg-white border rounded-lg p-4 shadow-sm">
          <h2 className="text-lg font-semibold mb-3">Invoices This Week</h2>
          <div className="space-y-2">
            {metrics.invoicesThisWeek.map((item) => (
              <div key={item.day} className="flex items-center justify-between py-2 border-b last:border-0">
                <span className="text-sm text-gray-700">{item.day}</span>
                <span className="text-sm font-medium">${item.total.toFixed(2)}</span>
              </div>
            ))}
            {metrics.invoicesThisWeek.length === 0 && (
              <p className="text-sm text-gray-500">No invoices this week.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
