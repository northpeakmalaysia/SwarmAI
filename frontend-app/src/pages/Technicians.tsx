import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Wrench, Plus, Pencil, Trash2 } from 'lucide-react'
import { getTechnicians, deleteTechnician } from '../services/api'

const statusStyles: Record<string, string> = {
  Active: 'bg-green-100 text-green-800',
  OnLeave: 'bg-yellow-100 text-yellow-800',
  Inactive: 'bg-gray-100 text-gray-800',
}

export default function Technicians() {
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState<'All' | 'Active' | 'OnLeave' | 'Inactive'>('All')

  const { data: technicians, isLoading } = useQuery({
    queryKey: ['technicians'],
    queryFn: getTechnicians,
  })

  const deleteMutation = useMutation({
    mutationFn: deleteTechnician,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['technicians'] })
    },
  })

  const filtered =
    filter === 'All'
      ? technicians
      : technicians?.filter((t) => t.status === filter)

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this technician?')) {
      deleteMutation.mutate(id)
    }
  }

  if (isLoading) return <div className="p-6">Loading...</div>

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Wrench className="w-6 h-6" />
          Technicians
        </h1>
        <Link
          to="/technicians/new"
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Technician
        </Link>
      </div>

      <div className="mb-4 flex items-center gap-2">
        <span className="text-sm text-gray-600">Filter:</span>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as 'All' | 'Active' | 'OnLeave' | 'Inactive')}
          className="border rounded-md px-3 py-1 text-sm"
        >
          <option value="All">All</option>
          <option value="Active">Active</option>
          <option value="OnLeave">On Leave</option>
          <option value="Inactive">Inactive</option>
        </select>
      </div>

      <div className="bg-white border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Name</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Email</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Phone</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Specialization</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Status</th>
              <th className="px-4 py-3 text-right text-sm font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered?.map((technician) => (
              <tr key={technician.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm">{technician.firstName} {technician.lastName}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{technician.email || '-'}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{technician.phone || '-'}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{technician.specialization || '-'}</td>
                <td className="px-4 py-3 text-sm">
                  <span
                    className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${statusStyles[technician.status]}`}
                  >
                    {technician.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-right">
                  <div className="inline-flex items-center gap-2">
                    <Link
                      to={`/technicians/${technician.id}/edit`}
                      className="p-1 text-gray-500 hover:text-blue-600 transition-colors"
                      title="Edit"
                    >
                      <Pencil className="w-4 h-4" />
                    </Link>
                    <button
                      onClick={() => handleDelete(technician.id)}
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
                  No technicians found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
