import type { Invoice, CreateInvoiceRequest, UpdateInvoiceRequest } from '../types'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api'

export async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  })

  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`)
  }

  return response.json() as Promise<T>
}

export async function getInvoices(): Promise<Invoice[]> {
  return fetchApi<Invoice[]>('/invoices')
}

export async function getInvoice(id: string): Promise<Invoice> {
  return fetchApi<Invoice>(`/invoices/${id}`)
}

export async function createInvoice(data: CreateInvoiceRequest): Promise<Invoice> {
  return fetchApi<Invoice>('/invoices', { method: 'POST', body: JSON.stringify(data) })
}

export async function updateInvoice(id: string, data: UpdateInvoiceRequest): Promise<void> {
  return fetchApi<void>(`/invoices/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}

export async function deleteInvoice(id: string): Promise<void> {
  return fetchApi<void>(`/invoices/${id}`, { method: 'DELETE' })
}
