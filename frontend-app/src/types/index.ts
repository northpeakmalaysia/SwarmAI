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
