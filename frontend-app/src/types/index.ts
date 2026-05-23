export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
}

export interface ApiResponse<T> {
  data: T;
  status: number;
  message?: string;
}

export type InvoiceStatus = 'Draft' | 'Sent' | 'Paid' | 'Overdue' | 'Cancelled';

export interface Invoice {
  id: string;
  customerName: string;
  customerEmail?: string;
  description?: string;
  amount: number;
  status: InvoiceStatus;
  dueDate: string;
  paidAt?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface CreateInvoiceRequest {
  customerName: string;
  customerEmail?: string;
  description?: string;
  amount: number;
  dueDate: string;
}

export interface UpdateInvoiceRequest {
  customerName: string;
  customerEmail?: string;
  description?: string;
  amount: number;
  status: InvoiceStatus;
  dueDate: string;
  paidAt?: string;
}

export type JobStatus = 'Pending' | 'Scheduled' | 'InProgress' | 'Completed' | 'Cancelled';

export interface Customer {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  notes?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface CreateCustomerRequest {
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  notes?: string;
  isActive: boolean;
}

export interface UpdateCustomerRequest {
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  notes?: string;
  isActive: boolean;
}

export interface Technician {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  status: 'Active' | 'OnLeave' | 'Inactive';
  specialization?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface CreateTechnicianRequest {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  status: 'Active' | 'OnLeave' | 'Inactive';
  specialization?: string;
}

export interface UpdateTechnicianRequest {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  status: 'Active' | 'OnLeave' | 'Inactive';
  specialization?: string;
}

export interface Job {
  id: string;
  title: string;
  description?: string;
  status: JobStatus;
  scheduledDate: string;
  startedAt?: string;
  completedAt?: string;
  estimatedCost?: number;
  actualCost?: number;
  notes?: string;
  customerId: string;
  customerName: string;
  technicianId?: string;
  technicianName?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface CreateJobRequest {
  title: string;
  description?: string;
  scheduledDate: string;
  estimatedCost?: number;
  notes?: string;
  customerId: string;
  customerName: string;
  technicianId?: string;
  technicianName?: string;
}

export interface UpdateJobRequest {
  title: string;
  description?: string;
  status: JobStatus;
  scheduledDate: string;
  startedAt?: string;
  completedAt?: string;
  estimatedCost?: number;
  actualCost?: number;
  notes?: string;
  customerId: string;
  customerName: string;
  technicianId?: string;
  technicianName?: string;
}

export interface DashboardMetricsDto {
  totalCustomers: number;
  activeCustomers: number;
  totalTechnicians: number;
  activeTechnicians: number;
  totalJobs: number;
  pendingJobs: number;
  inProgressJobs: number;
  completedJobs: number;
  overdueJobs: number;
  totalInvoices: number;
  totalInvoiceAmount: number;
  paidInvoiceAmount: number;
  outstandingInvoiceAmount: number;
  draftInvoices: number;
  sentInvoices: number;
  paidInvoices: number;
  overdueInvoices: number;
  jobsThisWeek: { day: string; count: number }[];
  invoicesThisWeek: { day: string; total: number }[];
}
