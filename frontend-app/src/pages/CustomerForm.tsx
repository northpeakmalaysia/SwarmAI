import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { ArrowLeft, Save } from 'lucide-react'
import { getCustomer, createCustomer, updateCustomer } from '../services/api'
import type { CreateCustomerRequest, UpdateCustomerRequest } from '../types'

export default function CustomerForm() {
  const { id } = useParams<{ id?: string }>()
  const navigate = useNavigate()
  const isEdit = Boolean(id)

  const [form, setForm] = useState<{
    name: string
    email: string
    phone: string
    address: string
    city: string
    postalCode: string
    notes: string
    isActive: boolean
  }>({
    name: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    postalCode: '',
    notes: '',
    isActive: true,
  })

  const [errors, setErrors] = useState<Record<string, string>>({})

  const { data: customer, isLoading } = useQuery({
    queryKey: ['customer', id],
    queryFn: () => getCustomer(id!),
    enabled: isEdit,
  })

  useEffect(() => {
    if (customer) {
      setForm({
        name: customer.name,
        email: customer.email || '',
        phone: customer.phone || '',
        address: customer.address || '',
        city: customer.city || '',
        postalCode: customer.postalCode || '',
        notes: customer.notes || '',
        isActive: customer.isActive,
      })
    }
  }, [customer])

  const createMutation = useMutation({
    mutationFn: createCustomer,
    onSuccess: () => navigate('/customers'),
  })

  const updateMutation = useMutation({
    mutationFn: (data: UpdateCustomerRequest) => updateCustomer(id!, data),
    onSuccess: () => navigate('/customers'),
  })

  const validate = () => {
    const next: Record<string, string> = {}
    if (!form.name.trim()) next.name = 'Name is required'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return

    const payload: CreateCustomerRequest = {
      name: form.name,
      email: form.email || undefined,
      phone: form.phone || undefined,
      address: form.address || undefined,
      city: form.city || undefined,
      postalCode: form.postalCode || undefined,
      notes: form.notes || undefined,
      isActive: form.isActive,
    }

    if (isEdit) {
      updateMutation.mutate(payload as UpdateCustomerRequest)
    } else {
      createMutation.mutate(payload as CreateCustomerRequest)
    }
  }

  if (isEdit && isLoading) return <div className="p-6">Loading...</div>

  return (
    <div className="p-6 max-w-2xl">
      <button
        onClick={() => navigate('/customers')}
        className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Customers
      </button>

      <h1 className="text-2xl font-bold mb-6">{isEdit ? 'Edit Customer' : 'New Customer'}</h1>

      <form onSubmit={handleSubmit} className="space-y-4 bg-white border rounded-lg p-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full border rounded-md px-3 py-2 text-sm"
          />
          {errors.name && <p className="text-sm text-red-600 mt-1">{errors.name}</p>}
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

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
          <input
            type="text"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            className="w-full border rounded-md px-3 py-2 text-sm"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
            <input
              type="text"
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
              className="w-full border rounded-md px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Postal Code</label>
            <input
              type="text"
              value={form.postalCode}
              onChange={(e) => setForm({ ...form, postalCode: e.target.value })}
              className="w-full border rounded-md px-3 py-2 text-sm"
            />
          </div>
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

        <div className="flex items-center gap-2">
          <input
            id="isActive"
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
            className="w-4 h-4"
          />
          <label htmlFor="isActive" className="text-sm font-medium text-gray-700">Is Active</label>
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
                ? 'Update Customer'
                : 'Create Customer'}
          </button>
        </div>
      </form>
    </div>
  )
}
