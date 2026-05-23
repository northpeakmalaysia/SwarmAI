import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { ArrowLeft, Save } from 'lucide-react'
import { getInvoice, createInvoice, updateInvoice } from '../services/api'
import type { InvoiceStatus, CreateInvoiceRequest, UpdateInvoiceRequest } from '../types'

const invoiceStatuses: InvoiceStatus[] = ['Draft', 'Sent', 'Paid', 'Overdue', 'Cancelled']

export default function InvoiceForm() {
  const { id } = useParams<{ id?: string }>()
  const navigate = useNavigate()
  const isEdit = Boolean(id)

  const [form, setForm] = useState<{
    customerName: string
    customerEmail: string
    description: string
    amount: string
    dueDate: string
    status: InvoiceStatus
    paidAt: string
  }>({
    customerName: '',
    customerEmail: '',
    description: '',
    amount: '',
    dueDate: '',
    status: 'Draft',
    paidAt: '',
  })

  const [errors, setErrors] = useState<Record<string, string>>({})

  const { data: invoice, isLoading } = useQuery({
    queryKey: ['invoice', id],
    queryFn: () => getInvoice(id!),
    enabled: isEdit,
  })

  useEffect(() => {
    if (invoice) {
      setForm({
        customerName: invoice.customerName,
        customerEmail: invoice.customerEmail || '',
        description: invoice.description || '',
        amount: invoice.amount.toString(),
        dueDate: invoice.dueDate.split('T')[0],
        status: invoice.status,
        paidAt: invoice.paidAt ? invoice.paidAt.split('T')[0] : '',
      })
    }
  }, [invoice])

  const createMutation = useMutation({
    mutationFn: createInvoice,
    onSuccess: () => navigate('/invoices'),
  })

  const updateMutation = useMutation({
    mutationFn: (data: UpdateInvoiceRequest) => updateInvoice(id!, data),
    onSuccess: () => navigate('/invoices'),
  })

  const validate = () => {
    const next: Record<string, string> = {}
    if (!form.customerName.trim()) next.customerName = 'Customer name is required'
    if (!form.amount || Number(form.amount) <= 0) next.amount = 'Amount must be greater than 0'
    if (!form.dueDate) next.dueDate = 'Due date is required'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return

    const payload = {
      customerName: form.customerName,
      customerEmail: form.customerEmail || undefined,
      description: form.description || undefined,
      amount: Number(form.amount),
      dueDate: new Date(form.dueDate).toISOString(),
    }

    if (isEdit) {
      const updatePayload: UpdateInvoiceRequest = {
        ...payload,
        status: form.status,
        paidAt: form.paidAt ? new Date(form.paidAt).toISOString() : undefined,
      }
      updateMutation.mutate(updatePayload)
    } else {
      createMutation.mutate(payload as CreateInvoiceRequest)
    }
  }

  if (isEdit && isLoading) return <div className="p-6">Loading...</div>

  return (
    <div className="p-6 max-w-2xl">
      <button
        onClick={() => navigate('/invoices')}
        className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Invoices
      </button>

      <h1 className="text-2xl font-bold mb-6">{isEdit ? 'Edit Invoice' : 'New Invoice'}</h1>

      <form onSubmit={handleSubmit} className="space-y-4 bg-white border rounded-lg p-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Customer Name *</label>
          <input
            type="text"
            value={form.customerName}
            onChange={(e) => setForm({ ...form, customerName: e.target.value })}
            className="w-full border rounded-md px-3 py-2 text-sm"
          />
          {errors.customerName && <p className="text-sm text-red-600 mt-1">{errors.customerName}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Customer Email</label>
          <input
            type="email"
            value={form.customerEmail}
            onChange={(e) => setForm({ ...form, customerEmail: e.target.value })}
            className="w-full border rounded-md px-3 py-2 text-sm"
          />
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Amount *</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              className="w-full border rounded-md px-3 py-2 text-sm"
            />
            {errors.amount && <p className="text-sm text-red-600 mt-1">{errors.amount}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Due Date *</label>
            <input
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
              className="w-full border rounded-md px-3 py-2 text-sm"
            />
            {errors.dueDate && <p className="text-sm text-red-600 mt-1">{errors.dueDate}</p>}
          </div>
        </div>

        {isEdit && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as InvoiceStatus })}
                className="w-full border rounded-md px-3 py-2 text-sm"
              >
                {invoiceStatuses.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Paid At</label>
              <input
                type="date"
                value={form.paidAt}
                onChange={(e) => setForm({ ...form, paidAt: e.target.value })}
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
                ? 'Update Invoice'
                : 'Create Invoice'}
          </button>
        </div>
      </form>
    </div>
  )
}
