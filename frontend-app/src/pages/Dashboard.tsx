export default function Dashboard() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Dashboard</h1>
      <p className="text-gray-600">Welcome to the admin dashboard.</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
        <div className="bg-white border rounded-lg p-4 shadow-sm">
          <h3 className="font-semibold text-lg">Total Users</h3>
          <p className="text-3xl font-bold text-primary mt-2">1,234</p>
        </div>
        <div className="bg-white border rounded-lg p-4 shadow-sm">
          <h3 className="font-semibold text-lg">Revenue</h3>
          <p className="text-3xl font-bold text-primary mt-2">$45,678</p>
        </div>
        <div className="bg-white border rounded-lg p-4 shadow-sm">
          <h3 className="font-semibold text-lg">Orders</h3>
          <p className="text-3xl font-bold text-primary mt-2">892</p>
        </div>
      </div>
    </div>
  )
}
