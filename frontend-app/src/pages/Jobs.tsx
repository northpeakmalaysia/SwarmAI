import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ClipboardList, Plus, Pencil, Trash2, Play, CheckCircle } from 'lucide-react'
import { getJobs, updateJob, deleteJob } from '../services/api'
import type { JobStatus, Job } from '../types'

const statusStyles: Record<JobStatus, string> = {
  Pending: 'bg-gray-100 text-gray-800',
  Scheduled: 'bg-blue-100 text-blue-800',
  InProgress: 'bg-yellow-100 text-yellow-800',
  Completed: 'bg-green-100 text-green-800',
  Cancelled: 'bg-red-100 text-red-800',
}

export default function Jobs() {
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState<JobStatus | 'All'>('All')

  const { data: jobs, isLoading } = useQuery({
    queryKey: ['jobs'],
    queryFn: getJobs,
  })

  const deleteMutation = useMutation({
    mutationFn: deleteJob,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
    },
  })

  const startMutation = useMutation({
    mutationFn: async (job: Job) => {
      const payload = {
        title: job.title,
        description: job.description,
        status: 'InProgress' as JobStatus,
        scheduledDate: job.scheduledDate,
        startedAt: new Date().toISOString(),
        completedAt: job.completedAt,
        estimatedCost: job.estimatedCost,
        actualCost: job.actualCost,
        notes: job.notes,
        customerId: job.customerId,
        customerName: job.customerName,
        technicianId: job.technicianId,
        technicianName: job.technicianName,
      }
      return updateJob(job.id, payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
    },
  })

  const completeMutation = useMutation({
    mutationFn: async (job: Job) => {
      const payload = {
        title: job.title,
        description: job.description,
        status: 'Completed' as JobStatus,
        scheduledDate: job.scheduledDate,
        startedAt: job.startedAt,
        completedAt: new Date().toISOString(),
        estimatedCost: job.estimatedCost,
        actualCost: job.actualCost,
        notes: job.notes,
        customerId: job.customerId,
        customerName: job.customerName,
        technicianId: job.technicianId,
        technicianName: job.technicianName,
      }
      return updateJob(job.id, payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
    },
  })

  const filtered =
    filter === 'All'
      ? jobs
      : jobs?.filter((j) => j.status === filter)

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this job?')) {
      deleteMutation.mutate(id)
    }
  }

  if (isLoading) return <div className="p-6">Loading...</div>

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ClipboardList className="w-6 h-6" />
          Jobs
        </h1>
        <Link
          to="/jobs/new"
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Job
        </Link>
      </div>

      <div className="mb-4 flex items-center gap-2">
        <span className="text-sm text-gray-600">Filter:</span>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as JobStatus | 'All')}
          className="border rounded-md px-3 py-1 text-sm"
        >
          <option value="All">All</option>
          <option value="Pending">Pending</option>
          <option value="Scheduled">Scheduled</option>
          <option value="InProgress">In Progress</option>
          <option value="Completed">Completed</option>
          <option value="Cancelled">Cancelled</option>
        </select>
      </div>

      <div className="bg-white border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Title</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Customer</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Technician</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Status</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Scheduled Date</th>
              <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered?.map((job) => (
              <tr key={job.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm">{job.title}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{job.customerName}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{job.technicianName || '-'}</td>
                <td className="px-4 py-3 text-sm">
                  <span
                    className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${statusStyles[job.status]}`}
                  >
                    {job.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {new Date(job.scheduledDate).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-sm text-right">
                  <div className="inline-flex items-center gap-2">
                    {(job.status === 'Pending' || job.status === 'Scheduled') && (
                      <button
                        onClick={() => startMutation.mutate(job)}
                        className="p-1 text-gray-500 hover:text-green-600 transition-colors"
                        title="Start Job"
                      >
                        <Play className="w-4 h-4" />
                      </button>
                    )}
                    {job.status === 'InProgress' && (
                      <button
                        onClick={() => completeMutation.mutate(job)}
                        className="p-1 text-gray-500 hover:text-green-600 transition-colors"
                        title="Complete Job"
                      >
                        <CheckCircle className="w-4 h-4" />
                      </button>
                    )}
                    <Link
                      to={`/jobs/${job.id}/edit`}
                      className="p-1 text-gray-500 hover:text-blue-600 transition-colors"
                      title="Edit"
                    >
                      <Pencil className="w-4 h-4" />
                    </Link>
                    <button
                      onClick={() => handleDelete(job.id)}
                      className="p-1 text-gray-500 hover:text-red-600 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered?.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500">
                  No jobs found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
