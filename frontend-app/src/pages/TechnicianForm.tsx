import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { ArrowLeft, Save } from 'lucide-react'
import { getTechnician, createTechnician, updateTechnician } from '../services/api'
import type { CreateTechnicianRequest, UpdateTechnicianRequest } from '../types'

export default function TechnicianForm() {
  const { id } = useParams<{ id?: string }>()
  const navigate = useNavigate()
  const isEdit = Boolean(id)

  const [form, setForm] = useState<{
    firstName: string
    lastName: string
    email: string
    phone: string
    status: 'Active' | 'OnLeave' | 'Inactive'
    specialization: string
  }>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    status: 'Active',
    specialization: '',
  })

  const [errors, setErrors] = useState<Record<string, string>>({})

  const { data: technician, isLoading } = useQuery({
    queryKey: ['technician', id],
    queryFn: () => getTechnician(id!),
    enabled: isEdit,
  })

  useEffect(() => {
    if (technician) {
      setForm({
        firstName: technician.firstName,
        lastName: technician.lastName,
        email: technician.email || '',
        phone: technician.phone || '',
        status: technician.status,
        specialization: technician.specialization || '',
      })
    }
  }, [technician])

  const createMutation = useMutation({
    mutationFn: createTechnician,
    onSuccess: () => navigate('/technicians'),
  })

  const updateMutation = useMutation({
    mutationFn: (data: UpdateTechnicianRequest) => updateTechnician(id!, data),
    onSuccess: () => navigate('/technicians'),
  })

  const validate = () => {
    const next: Record<string, string> = {}
    if (!form.firstName.trim()) next.firstName = 'First name is required'
    if (!form.lastName.trim()) next.lastName = 'Last name is required'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return

    const payload = {
      firstName: form.firstName,
      lastName: form.lastName,
      email: form.email || undefined,
      phone: form.phone || undefined,
      status: form.status,
      specialization: form.specialization || undefined,
    }

    if (isEdit) {
      updateMutation.mutate(payload as UpdateTechnicianRequest)
    } else {
      createMutation.mutate(payload as CreateTechnicianRequest)
    }
  }

  if (isEdit && isLoading) return <div className="p-6">Loading...</div>

  return (
    <div className="p-6 max-w-2xl">
      <button
        onClick={() => navigate('/technicians')}
        className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Technicians
      </button>

      <h1 className="text-2xl font-bold mb-6">{isEdit ? 'Edit Technician' : 'New Technician'}</h1>

      <form onSubmit={handleSubmit} className="space-y-4 bg-white border rounded-lg p-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
            <input
              type="text"
              value={form.firstName}
              onChange={(e) => setForm({ ...form, firstName: e.target.value })}
              className="w-full border rounded-md px-3 py-2 text-sm"
            />
            {errors.firstName && <p className="text-sm text-red-600 mt-1">{errors.firstName}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Last Name *</label>
            <input
              type="text"
              value={form.lastName}
              onChange={(e) => setForm({ ...form, lastName: e.target.value })}
              className="w-full border rounded-md px-3 py-2 text-sm"
            />
            {errors.lastName && <p className="text-sm text-red-600 mt-1">{errors.lastName}</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full border rounded-md px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="w-full border rounded-md px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as 'Active' | 'OnLeave' | 'Inactive' })}
              className="w-full border rounded-md px-3 py-2 text-sm"
            >
              <option value="Active">Active</option>
              <option value="OnLeave">On Leave</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Specialization</label>
            <input
              type="text"
              value={form.specialization}
              onChange={(e) => setForm({ ...form, specialization: e.target.value })}
              className="w-full border rounded-md px-3 py-2 text-sm"
            />
          </div>
        </div>

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
                ? 'Update Technician'
                : 'Create Technician'}
          </button>
        </div>
      </form>
    </div>
  )
}
