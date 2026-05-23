import type {
  Invoice,
  CreateInvoiceRequest,
  UpdateInvoiceRequest,
  Customer,
  Technician,
  Job,
  CreateCustomerRequest,
  UpdateCustomerRequest,
  CreateTechnicianRequest,
  UpdateTechnicianRequest,
  CreateJobRequest,
  UpdateJobRequest,
  DashboardMetricsDto,
} from '../types'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api'

let authToken: string | null = null

export function setAuthToken(token: string | null) {
  authToken = token
}

export async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
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

// Customers
export async function getCustomers(): Promise<Customer[]> {
  return fetchApi<Customer[]>('/customers')
}

export async function getCustomer(id: string): Promise<Customer> {
  return fetchApi<Customer>(`/customers/${id}`)
}

export async function createCustomer(data: CreateCustomerRequest): Promise<Customer> {
  return fetchApi<Customer>('/customers', { method: 'POST', body: JSON.stringify(data) })
}

export async function updateCustomer(id: string, data: UpdateCustomerRequest): Promise<void> {
  return fetchApi<void>(`/customers/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}

export async function deleteCustomer(id: string): Promise<void> {
  return fetchApi<void>(`/customers/${id}`, { method: 'DELETE' })
}

// Technicians
export async function getTechnicians(): Promise<Technician[]> {
  return fetchApi<Technician[]>('/technicians')
}

export async function getTechnician(id: string): Promise<Technician> {
  return fetchApi<Technician>(`/technicians/${id}`)
}

export async function createTechnician(data: CreateTechnicianRequest): Promise<Technician> {
  return fetchApi<Technician>('/technicians', { method: 'POST', body: JSON.stringify(data) })
}

export async function updateTechnician(id: string, data: UpdateTechnicianRequest): Promise<void> {
  return fetchApi<void>(`/technicians/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}

export async function deleteTechnician(id: string): Promise<void> {
  return fetchApi<void>(`/technicians/${id}`, { method: 'DELETE' })
}

// Jobs
export async function getJobs(): Promise<Job[]> {
  return fetchApi<Job[]>('/jobs')
}

export async function getJob(id: string): Promise<Job> {
  return fetchApi<Job>(`/jobs/${id}`)
}

export async function createJob(data: CreateJobRequest): Promise<Job> {
  return fetchApi<Job>('/jobs', { method: 'POST', body: JSON.stringify(data) })
}

export async function updateJob(id: string, data: UpdateJobRequest): Promise<void> {
  return fetchApi<void>(`/jobs/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}

export async function deleteJob(id: string): Promise<void> {
  return fetchApi<void>(`/jobs/${id}`, { method: 'DELETE' })
}

export async function getDashboardMetrics(): Promise<DashboardMetricsDto> {
  return fetchApi<DashboardMetricsDto>('/dashboard/metrics')
}
