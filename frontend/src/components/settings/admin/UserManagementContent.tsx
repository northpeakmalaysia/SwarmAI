import React, { useEffect, useState } from 'react';
import {
  Search,
  Filter,
  Shield,
  ShieldAlert,
  UserX,
  UserCheck,
  ChevronLeft,
  ChevronRight,
  Mail,
  Calendar,
  Bot,
  MessageSquare,
  CreditCard,
  X,
} from 'lucide-react';
import { useAdminStore, AdminUser } from '../../../stores/adminStore';
import { formatDate } from '../../../utils/dateFormat';

/**
 * UserManagementContent Component
 *
 * Embedded user management panel for Settings page.
 * Manages users: list, search, filter, view details, update roles, suspend/activate.
 */
export default function UserManagementContent() {
  const {
    users,
    selectedUser,
    pagination,
    filters,
    loading,
    error,
    fetchUsers,
    fetchUserDetails,
    updateUser,
    suspendUser,
    activateUser,
    updateUserSubscription,
    setFilters,
    setPage,
    clearSelectedUser,
    clearError,
  } = useAdminStore();

  const [showUserModal, setShowUserModal] = useState(false);
  const [actionUserId, setActionUserId] = useState<string | null>(null);
  const [suspendReason, setSuspendReason] = useState('');
  const [showSuspendModal, setShowSuspendModal] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers, pagination.page, filters]);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilters({ search: e.target.value });
  };

  const handleRoleFilter = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilters({ role: e.target.value });
  };

  const handleStatusFilter = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilters({ status: e.target.value });
  };

  const handleViewUser = async (userId: string) => {
    await fetchUserDetails(userId);
    setShowUserModal(true);
  };

  const handleCloseModal = () => {
    setShowUserModal(false);
    clearSelectedUser();
  };

  const handleSuspendClick = (userId: string) => {
    setActionUserId(userId);
    setShowSuspendModal(true);
  };

  const handleConfirmSuspend = async () => {
    if (!actionUserId) return;
    try {
      await suspendUser(actionUserId, suspendReason);
      setShowSuspendModal(false);
      setSuspendReason('');
      setActionUserId(null);
    } catch {
      // Error handled in store
    }
  };

  const handleActivate = async (userId: string) => {
    try {
      await activateUser(userId);
    } catch {
      // Error handled in store
    }
  };

  const handleUpdateRole = async (userId: string, role: 'user' | 'admin') => {
    try {
      await updateUser(userId, { role });
    } catch {
      // Error handled in store
    }
  };

  const handleToggleSuperuser = async (userId: string, isSuperuser: boolean) => {
    try {
      await updateUser(userId, { isSuperuser });
    } catch {
      // Error handled in store
    }
  };

  const handleUpdateSubscription = async (userId: string, plan: string) => {
    try {
      await updateUserSubscription(userId, { plan });
    } catch {
      // Error handled in store
    }
  };

  const getRoleBadge = (user: AdminUser) => {
    if (user.isSuperuser) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-red-500/20 text-red-400">
          <ShieldAlert className="w-3 h-3" />
          Superadmin
        </span>
      );
    }
    if (user.role === 'admin') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-purple-500/20 text-purple-400">
          <Shield className="w-3 h-3" />
          Admin
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-dark-600 text-dark-300">
        User
      </span>
    );
  };

  const getStatusBadge = (user: AdminUser) => {
    if (user.isSuspended) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-red-500/20 text-red-400">
          <UserX className="w-3 h-3" />
          Suspended
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-green-500/20 text-green-400">
        <UserCheck className="w-3 h-3" />
        Active
      </span>
    );
  };

  const getPlanBadge = (plan?: string) => {
    const colors: Record<string, string> = {
      free: 'bg-dark-600 text-dark-300',
      starter: 'bg-blue-500/20 text-blue-400',
      pro: 'bg-purple-500/20 text-purple-400',
      enterprise: 'bg-yellow-500/20 text-yellow-400',
    };
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${colors[plan || 'free'] || colors.free}`}>
        {plan || 'free'}
      </span>
    );
  };

  return (
    <div>
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 mb-6">
          <p className="text-red-400">{error}</p>
          <button type="button" onClick={clearError} className="text-sm text-red-300 hover:text-red-200 mt-2">
            Dismiss
          </button>
        </div>
      )}

      {/* Search and Filters */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        {/* Search */}
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-400" />
          <input
            type="text"
            placeholder="Search by email or name..."
            value={filters.search}
            onChange={handleSearch}
            className="input-field w-full pl-10"
          />
        </div>

        {/* Role Filter */}
        <div className="flex items-center gap-2">
          <Filter className="w-5 h-5 text-dark-400" />
          <select
            value={filters.role}
            onChange={handleRoleFilter}
            className="input-field"
          >
            <option value="">All Roles</option>
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
        </div>

        {/* Status Filter */}
        <select
          value={filters.status}
          onChange={handleStatusFilter}
          className="input-field"
        >
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
        </select>
      </div>

      {/* Users Table */}
      <div className="overflow-x-auto -mx-6">
        <table className="w-full min-w-[700px]">
          <thead>
            <tr className="border-b border-dark-700">
              <th className="text-left py-3 px-6 text-dark-400 font-medium text-sm">User</th>
              <th className="text-left py-3 px-4 text-dark-400 font-medium text-sm">Role</th>
              <th className="text-left py-3 px-4 text-dark-400 font-medium text-sm">Status</th>
              <th className="text-left py-3 px-4 text-dark-400 font-medium text-sm">Plan</th>
              <th className="text-left py-3 px-4 text-dark-400 font-medium text-sm">Agents</th>
              <th className="text-left py-3 px-4 text-dark-400 font-medium text-sm">Joined</th>
              <th className="text-right py-3 px-6 text-dark-400 font-medium text-sm">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && users.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-dark-400">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-500 mx-auto" />
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-dark-400">
                  No users found
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.id} className="border-b border-dark-800 hover:bg-dark-800/50">
                  <td className="py-3 px-6">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary-500/20 flex items-center justify-center">
                        {user.avatar ? (
                          <img src={user.avatar} alt="" className="w-8 h-8 rounded-full" />
                        ) : (
                          <span className="text-primary-400 text-sm font-medium">
                            {(user.name || user.email).charAt(0).toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div>
                        <div className="text-white font-medium">{user.name || 'No name'}</div>
                        <div className="text-dark-400 text-sm">{user.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4">{getRoleBadge(user)}</td>
                  <td className="py-3 px-4">{getStatusBadge(user)}</td>
                  <td className="py-3 px-4">{getPlanBadge(user.subscriptionPlan)}</td>
                  <td className="py-3 px-4 text-dark-300">{user.agentCount || 0}</td>
                  <td className="py-3 px-4 text-dark-400 text-sm">
                    {formatDate(user.createdAt)}
                  </td>
                  <td className="py-3 px-6 text-right">
                    <div className="relative inline-block">
                      <button
                        type="button"
                        onClick={() => handleViewUser(user.id)}
                        className="btn-ghost text-sm"
                      >
                        View
                      </button>
                      {user.isSuspended ? (
                        <button
                          type="button"
                          onClick={() => handleActivate(user.id)}
                          className="btn-ghost text-sm text-green-400 ml-2"
                        >
                          Activate
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleSuspendClick(user.id)}
                          className="btn-ghost text-sm text-red-400 ml-2"
                        >
                          Suspend
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between pt-4 mt-4 border-t border-dark-700">
          <div className="text-sm text-dark-400">
            Showing {((pagination.page - 1) * pagination.limit) + 1} to{' '}
            {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} users
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage(pagination.page - 1)}
              disabled={pagination.page === 1}
              className="btn-ghost p-2 disabled:opacity-50"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="text-dark-300">
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage(pagination.page + 1)}
              disabled={pagination.page === pagination.totalPages}
              className="btn-ghost p-2 disabled:opacity-50"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* User Detail Modal */}
      {showUserModal && selectedUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-dark-800 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-dark-700">
              <h2 className="text-lg font-medium text-white">User Details</h2>
              <button type="button" onClick={handleCloseModal} className="text-dark-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-6">
              {/* User Info */}
              <div className="flex items-start gap-4">
                <div className="w-16 h-16 rounded-full bg-primary-500/20 flex items-center justify-center">
                  {selectedUser.avatar ? (
                    <img src={selectedUser.avatar} alt="" className="w-16 h-16 rounded-full" />
                  ) : (
                    <span className="text-primary-400 text-2xl font-medium">
                      {(selectedUser.name || selectedUser.email).charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-medium text-white">{selectedUser.name || 'No name'}</h3>
                  <div className="flex items-center gap-2 text-dark-400 mt-1">
                    <Mail className="w-4 h-4" />
                    {selectedUser.email}
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    {getRoleBadge(selectedUser)}
                    {getStatusBadge(selectedUser)}
                    {getPlanBadge(selectedUser.subscription?.plan)}
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-dark-700 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-dark-400 text-sm">
                    <Bot className="w-4 h-4" />
                    Agents
                  </div>
                  <div className="text-2xl font-bold text-white mt-1">{selectedUser.stats?.agents || 0}</div>
                </div>
                <div className="bg-dark-700 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-dark-400 text-sm">
                    <MessageSquare className="w-4 h-4" />
                    Messages
                  </div>
                  <div className="text-2xl font-bold text-white mt-1">{selectedUser.stats?.messages || 0}</div>
                </div>
                <div className="bg-dark-700 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-dark-400 text-sm">
                    <Calendar className="w-4 h-4" />
                    Joined
                  </div>
                  <div className="text-sm font-medium text-white mt-1">
                    {formatDate(selectedUser.createdAt)}
                  </div>
                </div>
                <div className="bg-dark-700 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-dark-400 text-sm">
                    <CreditCard className="w-4 h-4" />
                    AI Cost
                  </div>
                  <div className="text-2xl font-bold text-white mt-1">
                    ${(selectedUser.aiUsage?.totalCost || 0).toFixed(2)}
                  </div>
                </div>
              </div>

              {/* Role Management */}
              <div className="border-t border-dark-700 pt-4">
                <h4 className="text-sm font-medium text-dark-200 mb-3">Role Management</h4>
                <div className="flex items-center gap-4">
                  <select
                    value={selectedUser.role}
                    onChange={(e) => handleUpdateRole(selectedUser.id, e.target.value as 'user' | 'admin')}
                    className="input-field"
                  >
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                  </select>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedUser.isSuperuser}
                      onChange={(e) => handleToggleSuperuser(selectedUser.id, e.target.checked)}
                      className="rounded border-dark-600 bg-dark-700 text-primary-500 focus:ring-primary-500"
                    />
                    <span className="text-dark-300">Superadmin</span>
                  </label>
                </div>
              </div>

              {/* Subscription Management */}
              <div className="border-t border-dark-700 pt-4">
                <h4 className="text-sm font-medium text-dark-200 mb-3">Subscription Override</h4>
                <select
                  value={selectedUser.subscription?.plan || 'free'}
                  onChange={(e) => handleUpdateSubscription(selectedUser.id, e.target.value)}
                  className="input-field"
                >
                  <option value="free">Free</option>
                  <option value="starter">Starter</option>
                  <option value="pro">Pro</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Suspend Modal */}
      {showSuspendModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-dark-800 rounded-lg max-w-md w-full">
            <div className="p-4 border-b border-dark-700">
              <h2 className="text-lg font-medium text-white">Suspend User</h2>
            </div>
            <div className="p-4">
              <label className="block text-sm font-medium text-dark-200 mb-2">
                Reason for suspension (optional)
              </label>
              <textarea
                value={suspendReason}
                onChange={(e) => setSuspendReason(e.target.value)}
                placeholder="Enter reason..."
                className="input-field w-full h-24 resize-none"
              />
            </div>
            <div className="flex items-center justify-end gap-3 p-4 border-t border-dark-700">
              <button
                type="button"
                onClick={() => {
                  setShowSuspendModal(false);
                  setSuspendReason('');
                  setActionUserId(null);
                }}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmSuspend}
                className="btn-primary bg-red-500 hover:bg-red-600"
              >
                Suspend User
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
