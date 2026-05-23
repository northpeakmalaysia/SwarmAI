import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Users from './pages/Users'
import Settings from './pages/Settings'
import Invoices from './pages/Invoices'
import InvoiceForm from './pages/InvoiceForm'
import Customers from './pages/Customers'
import CustomerForm from './pages/CustomerForm'
import Technicians from './pages/Technicians'
import TechnicianForm from './pages/TechnicianForm'
import Jobs from './pages/Jobs'
import JobForm from './pages/JobForm'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/users" element={<Users />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/invoices" element={<Invoices />} />
        <Route path="/invoices/new" element={<InvoiceForm />} />
        <Route path="/invoices/:id/edit" element={<InvoiceForm />} />
        <Route path="/customers" element={<Customers />} />
        <Route path="/customers/new" element={<CustomerForm />} />
        <Route path="/customers/:id/edit" element={<CustomerForm />} />
        <Route path="/technicians" element={<Technicians />} />
        <Route path="/technicians/new" element={<TechnicianForm />} />
        <Route path="/technicians/:id/edit" element={<TechnicianForm />} />
        <Route path="/jobs" element={<Jobs />} />
        <Route path="/jobs/new" element={<JobForm />} />
        <Route path="/jobs/:id/edit" element={<JobForm />} />
      </Route>
    </Routes>
  )
}
