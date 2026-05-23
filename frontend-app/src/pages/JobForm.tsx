import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { ArrowLeft, Save } from 'lucide-react'
import { getJob, createJob, updateJob, getCustomers, getTechnicians } from '../services/api'
import type { JobStatus, CreateJobRequest, UpdateJobRequest } from '../types'

const jobStatuses: JobStatus[] = ['Pending', 'Scheduled', 'InProgress', 'Completed', 'Cancelled']

export default function JobForm() {
  const { id } = useParams<{ id?: string }>()
  const navigate = useNavigate()
  const isEdit = Boolean(id)

  const [form, setForm] = useState<{
    title: string
    description: string
    scheduledDate: string
    estimatedCost: string
    actualCost: string
    notes: string
    customerId: string
    technicianId: string
    status: JobStatus
    startedAt: string
    completedAt: string
  }>({
    title: '',
    description: '',
    scheduledDate: '',
    estimatedCost: '',
    actualCost: '',
    notes: '',
    customerId: '',
    technicianId: '',
    status: 'Pending',
    startedAt: '',
    completedAt: '',
  })

  const [errors, setErrors] = useState<Record<string, string>>({})

  const { data: job, isLoading } = useQuery({
    queryKey: ['job', id],
    queryFn: () => getJob(id!),
    enabled: isEdit,
  })

  const { data: customers } = useQuery({
    queryKey: ['customers'],
    queryFn: getCustomers,
  })

  const { data: technicians } = useQuery({
    queryKey: ['technicians'],
    queryFn: getTechnicians,
  })

  useEffect(() => {
    if (job) {
      setForm({
        title: job.title,
        description: job.description || '',
        scheduledDate: job.scheduledDate.split('T')[0],
        estimatedCost: job.estimatedCost?.toString() || '',
        actualCost: job.actualCost?.toString() || '',
        notes: job.notes || '',
        customerId: job.customerId,
        technicianId: job.technicianId || '',
        status: job.status,
        startedAt: job.startedAt ? job.startedAt.split('T')[0] : '',
        completedAt: job.completedAt ? job.completedAt.split('T')[0] : '',
      })
    }
  }, [job])

  const createMutation = useMutation({
    mutationFn: createJob,
    onSuccess: () => navigate('/jobs'),
  })

  const updateMutation = useMutation({
    mutationFn: (data: UpdateJobRequest) => updateJob(id!, data),
    onSuccess: () => navigate('/jobs'),
  })

  const validate = () => {
    const next: Record<string, string> = {}
    if (!form.title.trim()) next.title = 'Title is required'
    if (!form.scheduledDate) next.scheduledDate = 'Scheduled date is required'
    if (!form.customerId) next.customerId = 'Customer is required'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return

    const customerName = customers?.find((c) => c.id === form.customerId)?.name || ''
    const technician = technicians?.find((t) => t.id === form.technicianId)
    const technicianName = technician ? `${technician.firstName} ${technician.lastName}` : undefined

    const basePayload: CreateJobRequest = {
      title: form.title,
      description: form.description || undefined,
      scheduledDate: new Date(form.scheduledDate).toISOString(),
      estimatedCost: form.estimatedCost ? Number(form.estimatedCost) : undefined,
      notes: form.notes || undefined,
      customerId: form.customerId,
      customerName,
      technicianId: form.technicianId || undefined,
      technicianName,
    }

    if (isEdit) {
      const payload: UpdateJobRequest = {
        ...basePayload,
        status: form.status,
        startedAt: form.startedAt ? new Date(form.startedAt).toISOString() : undefined,
        completedAt: form.completedAt ? new Date(form.completedAt).toISOString() : undefined,
        actualCost: form.actualCost ? Number(form.actualCost) : undefined,
      }
      updateMutation.mutate(payload)
    } else {
      createMutation.mutate(basePayload)
    }
  }

  if (isEdit && isLoading) return <div className="p-6">Loading...</div>

  return (
    <div className="p-6 max-w-2xl">
      <button
        onClick={() => navigate('/jobs')}
        className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Jobs
      </button>

      <h1 className="text-2xl font-bold mb-6">{isEdit ? 'Edit Job' : 'New Job'}</h1>

      <form onSubmit={handleSubmit} className="space-y-4 bg-white border rounded-lg p-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
          <input
            type="text"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="w-full border rounded-md px-3 py-2 text-sm"
          />
          {errors.title && <p className="text-sm text-red-600 mt-1">{errors.title}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={3}
            className="w-full border rounded-md px-3 py-2 text-sm"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Scheduled Date *</label>
            <input
              type="date"
              value={form.scheduledDate}
              onChange={(e) => setForm({ ...form, scheduledDate: e.target.value })}
              className="w-full border rounded-md px-3 py-2 text-sm"
            />
            {errors.scheduledDate && <p className="text-sm text-red-600 mt-1">{errors.scheduledDate}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Estimated Cost</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.estimatedCost}
              onChange={(e) => setForm({ ...form, estimatedCost: e.target.value })}
              className="w-full border rounded-md px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Customer *</label>
          <select
            value={form.customerId}
            onChange={(e) => setForm({ ...form, customerId: e.target.value })}
            className="w-full border rounded-md px-3 py-2 text-sm"
          >
            <option value="">Select a customer</option>
            {customers?.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {errors.customerId && <p className="text-sm text-red-600 mt-1">{errors.customerId}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Technician</label>
          <select
            value={form.technicianId}
            onChange={(e) => setForm({ ...form, technicianId: e.target.value })}
            className="w-full border rounded-md px-3 py-2 text-sm"
          >
            <option value="">Select a technician</option>
            {technicians?.map((t) => (
              <option key={t.id} value={t.id}>{t.firstName} {t.lastName}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={3}
            className="w-full border rounded-md px-3 py-2 text-sm"
          />
        </div>

        {isEdit && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as JobStatus })}
                className="w-full border rounded-md px-3 py-2 text-sm"
              >
                {jobStatuses.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Started At</label>
                <input
                  type="date"
                  value={form.startedAt}
                  onChange={(e) => setForm({ ...form, startedAt: e.target.value })}
                  className="w-full border rounded-md px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Completed At</label>
                <input
                  type="date"
                  value={form.completedAt}
                  onChange={(e) => setForm({ ...form, completedAt: e.target.value })}
                  className="w-full border rounded-md px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Actual Cost</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.actualCost}
                onChange={(e) => setForm({ ...form, actualCost: e.target.value })}
                className="w-full border rounded-md px-3 py-2 text-sm"
              />
            </div>
          </>
        )}

        <div className="pt-2">
          <button
            type="submit"
            disabled={createMutation.isPending || updateMutation.isPending}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            <Save className="w-4 h-4" />
            {createMutation.isPending || updateMutation.isPending
              ? 'Saving...'
              : isEdit
                ? 'Update Job'
                : 'Create Job'}
          </button>
        </div>
      </form>
    </div>
  )
}
