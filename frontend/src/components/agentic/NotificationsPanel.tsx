import React, { useEffect, useState, useCallback } from 'react';
import {
  Bell,
  BellRing,
  Check,
  CheckCircle,
  Clock,
  AlertTriangle,
  XCircle,
  Mail,
  MessageSquare,
  Phone,
  Filter,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Send,
  Eye,
  EyeOff,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import api from '../../services/api';
import { formatRelativeTime, formatDateTime } from '@/utils/dateFormat';

export interface NotificationsPanelProps {
  agenticId: string;
  className?: string;
}

interface Notification {
  id: string;
  agenticId: string;
  masterContactId: string;
  contactName?: string;
  notificationType: string;
  title: string;
  message: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  channel: 'email' | 'whatsapp' | 'telegram' | 'sms';
  deliveryStatus: 'pending' | 'sent' | 'delivered' | 'failed' | 'read';
  deliveryAttempts: number;
  deliveredAt?: string;
  readAt?: string;
  actionRequired: boolean;
  actionType?: string;
  referenceType?: string;
  referenceId?: string;
  createdAt: string;
}

interface NotificationStats {
  total: number;
  byType: Record<string, number>;
  byStatus: Record<string, number>;
  byChannel: Record<string, number>;
  unread: number;
  actionRequired: number;
}

const typeConfig: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  approval_needed: { icon: <Clock className="w-4 h-4" />, color: 'text-amber-400', label: 'Approval Needed' },
  approval_reminder: { icon: <Clock className="w-4 h-4" />, color: 'text-amber-300', label: 'Approval Reminder' },
  task_assigned: { icon: <Bell className="w-4 h-4" />, color: 'text-sky-400', label: 'Task Assigned' },
  task_completed: { icon: <CheckCircle className="w-4 h-4" />, color: 'text-emerald-400', label: 'Task Completed' },
  task_failed: { icon: <XCircle className="w-4 h-4" />, color: 'text-red-400', label: 'Task Failed' },
  budget_alert: { icon: <AlertTriangle className="w-4 h-4" />, color: 'text-red-400', label: 'Budget Alert' },
  budget_warning: { icon: <AlertTriangle className="w-4 h-4" />, color: 'text-amber-400', label: 'Budget Warning' },
  budget_exceeded: { icon: <AlertTriangle className="w-4 h-4" />, color: 'text-red-500', label: 'Budget Exceeded' },
  schedule_triggered: { icon: <Clock className="w-4 h-4" />, color: 'text-purple-400', label: 'Schedule Triggered' },
  critical_error: { icon: <XCircle className="w-4 h-4" />, color: 'text-red-500', label: 'Critical Error' },
  error_occurred: { icon: <XCircle className="w-4 h-4" />, color: 'text-red-400', label: 'Error Occurred' },
  new_email: { icon: <Mail className="w-4 h-4" />, color: 'text-cyan-400', label: 'New Email' },
  agent_status_change: { icon: <Bell className="w-4 h-4" />, color: 'text-blue-400', label: 'Agent Status' },
  platform_disconnect: { icon: <AlertTriangle className="w-4 h-4" />, color: 'text-orange-400', label: 'Platform Disconnect' },
  health_summary: { icon: <CheckCircle className="w-4 h-4" />, color: 'text-teal-400', label: 'Health Check' },
  status_change: { icon: <Bell className="w-4 h-4" />, color: 'text-gray-400', label: 'Status Change' },
  daily_report: { icon: <Mail className="w-4 h-4" />, color: 'text-blue-400', label: 'Daily Report' },
  weekly_report: { icon: <Mail className="w-4 h-4" />, color: 'text-indigo-400', label: 'Weekly Report' },
  startup: { icon: <CheckCircle className="w-4 h-4" />, color: 'text-green-400', label: 'Startup' },
  test: { icon: <Send className="w-4 h-4" />, color: 'text-gray-400', label: 'Test' },
};

const statusConfig: Record<string, { color: string; bgColor: string; label: string }> = {
  pending: { color: 'text-gray-400', bgColor: 'bg-gray-500/20', label: 'Pending' },
  sent: { color: 'text-sky-400', bgColor: 'bg-sky-500/20', label: 'Sent' },
  delivered: { color: 'text-emerald-400', bgColor: 'bg-emerald-500/20', label: 'Delivered' },
  failed: { color: 'text-red-400', bgColor: 'bg-red-500/20', label: 'Failed' },
  read: { color: 'text-purple-400', bgColor: 'bg-purple-500/20', label: 'Read' },
};

const channelIcons: Record<string, React.ReactNode> = {
  email: <Mail className="w-3 h-3" />,
  whatsapp: <MessageSquare className="w-3 h-3" />,
  telegram: <Send className="w-3 h-3" />,
  sms: <Phone className="w-3 h-3" />,
};

const priorityConfig: Record<string, { color: string; label: string }> = {
  low: { color: 'text-gray-400', label: 'Low' },
  normal: { color: 'text-blue-400', label: 'Normal' },
  high: { color: 'text-amber-400', label: 'High' },
  urgent: { color: 'text-red-400', label: 'Urgent' },
};

export const NotificationsPanel: React.FC<NotificationsPanelProps> = ({
  agenticId,
  className,
}) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [stats, setStats] = useState<NotificationStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);

  // Expanded notification
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchNotifications = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.append('limit', '100');
      if (typeFilter !== 'all') params.append('type', typeFilter);
      if (statusFilter !== 'all') params.append('status', statusFilter);

      const response = await api.get(
        `/agentic/profiles/${agenticId}/notifications?${params.toString()}`
      );

      const data = response.data;
      setNotifications(data.notifications || []);

      // Calculate stats from notifications
      const allNotifications = data.notifications || [];
      const byType: Record<string, number> = {};
      const byStatus: Record<string, number> = {};
      const byChannel: Record<string, number> = {};
      let unread = 0;
      let actionRequired = 0;

      allNotifications.forEach((n: Notification) => {
        byType[n.notificationType] = (byType[n.notificationType] || 0) + 1;
        byStatus[n.deliveryStatus] = (byStatus[n.deliveryStatus] || 0) + 1;
        byChannel[n.channel] = (byChannel[n.channel] || 0) + 1;
        if (!n.readAt) unread++;
        if (n.actionRequired) actionRequired++;
      });

      setStats({
        total: allNotifications.length,
        byType,
        byStatus,
        byChannel,
        unread,
        actionRequired,
      });
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load notifications');
    } finally {
      setIsLoading(false);
    }
  }, [agenticId, typeFilter, statusFilter]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const markAsRead = async (notificationId: string) => {
    try {
      await api.put(`/agentic/profiles/${agenticId}/notifications/${notificationId}/read`);
      setNotifications(prev =>
        prev.map(n => n.id === notificationId ? { ...n, readAt: new Date().toISOString(), deliveryStatus: 'read' } : n)
      );
    } catch (err) {
      console.error('Failed to mark as read:', err);
    }
  };

  const NotificationCard: React.FC<{ notification: Notification }> = ({ notification }) => {
    const type = typeConfig[notification.notificationType] || typeConfig.status_change;
    const status = statusConfig[notification.deliveryStatus] || statusConfig.pending;
    const priority = priorityConfig[notification.priority] || priorityConfig.normal;
    const isExpanded = expandedId === notification.id;
    const isUnread = !notification.readAt;

    return (
      <div
        className={cn(
          'p-3 rounded-xl border transition-all',
          isUnread
            ? 'bg-swarm-dark/80 border-sky-500/30'
            : 'bg-swarm-darker/50 border-swarm-border/20',
          isExpanded && 'ring-1 ring-sky-500/30'
        )}
      >
        <div className="flex items-start gap-3">
          {/* Type Icon */}
          <div className={cn('p-2 rounded-lg', status.bgColor)}>
            <span className={type.color}>{type.icon}</span>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h4 className={cn(
                    'font-medium truncate',
                    isUnread ? 'text-white' : 'text-gray-300'
                  )}>
                    {notification.title}
                  </h4>
                  {isUnread && (
                    <span className="w-2 h-2 rounded-full bg-sky-500 animate-pulse" />
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="default" size="sm" className={status.bgColor}>
                    <span className={status.color}>{status.label}</span>
                  </Badge>
                  <span className="text-xs text-gray-500 flex items-center gap-1">
                    {channelIcons[notification.channel]}
                    {notification.channel}
                  </span>
                  {notification.actionRequired && (
                    <Badge variant="warning" size="sm">Action Required</Badge>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">{formatRelativeTime(notification.createdAt)}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setExpandedId(isExpanded ? null : notification.id)}
                >
                  {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </Button>
              </div>
            </div>

            {/* Expanded Content */}
            {isExpanded && (
              <div className="mt-3 pt-3 border-t border-swarm-border/20 space-y-3">
                <div className="text-sm text-gray-300 whitespace-pre-wrap">
                  {notification.message}
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-gray-500">Type:</span>
                    <span className={cn('ml-2', type.color)}>{type.label}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Priority:</span>
                    <span className={cn('ml-2', priority.color)}>{priority.label}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Contact:</span>
                    <span className="ml-2 text-gray-300">{notification.contactName || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Attempts:</span>
                    <span className="ml-2 text-gray-300">{notification.deliveryAttempts}</span>
                  </div>
                  {notification.deliveredAt && (
                    <div className="col-span-2">
                      <span className="text-gray-500">Delivered:</span>
                      <span className="ml-2 text-gray-300">
                        {formatDateTime(notification.deliveredAt)}
                      </span>
                    </div>
                  )}
                </div>

                {isUnread && (
                  <div className="flex justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => markAsRead(notification.id)}
                      icon={<Eye className="w-4 h-4" />}
                    >
                      Mark as Read
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BellRing className="w-5 h-5 text-sky-400" />
          <h3 className="text-lg font-semibold text-white">Notifications</h3>
          {stats && stats.unread > 0 && (
            <Badge variant="info" size="sm">{stats.unread} unread</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            icon={<Filter className="w-4 h-4" />}
          >
            Filters
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchNotifications}
            icon={<RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />}
          />
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-4 gap-3">
          <div className="p-3 bg-swarm-darker/50 rounded-xl border border-swarm-border/20">
            <div className="flex items-center justify-between">
              <span className="text-2xl font-bold text-white">{stats.total}</span>
              <Bell className="w-5 h-5 text-gray-400" />
            </div>
            <span className="text-xs text-gray-400">Total</span>
          </div>
          <div className="p-3 bg-sky-500/10 rounded-xl border border-sky-500/20">
            <div className="flex items-center justify-between">
              <span className="text-2xl font-bold text-sky-400">{stats.unread}</span>
              <EyeOff className="w-5 h-5 text-sky-400" />
            </div>
            <span className="text-xs text-gray-400">Unread</span>
          </div>
          <div className="p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
            <div className="flex items-center justify-between">
              <span className="text-2xl font-bold text-emerald-400">
                {stats.byStatus['delivered'] || 0}
              </span>
              <CheckCircle className="w-5 h-5 text-emerald-400" />
            </div>
            <span className="text-xs text-gray-400">Delivered</span>
          </div>
          <div className="p-3 bg-amber-500/10 rounded-xl border border-amber-500/20">
            <div className="flex items-center justify-between">
              <span className="text-2xl font-bold text-amber-400">{stats.actionRequired}</span>
              <AlertTriangle className="w-5 h-5 text-amber-400" />
            </div>
            <span className="text-xs text-gray-400">Action Required</span>
          </div>
        </div>
      )}

      {/* Filters */}
      {showFilters && (
        <div className="flex flex-wrap gap-3 p-3 bg-swarm-darker/50 rounded-xl border border-swarm-border/20">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-1.5 text-sm bg-swarm-dark border border-swarm-border/30 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-sky-500/50"
          >
            <option value="all">All Types</option>
            <option value="approval_needed">Approval Needed</option>
            <option value="new_email">New Email</option>
            <option value="task_completed">Task Completed</option>
            <option value="task_failed">Task Failed</option>
            <option value="health_summary">Health Check</option>
            <option value="daily_report">Daily Report</option>
            <option value="critical_error">Critical Error</option>
            <option value="agent_status_change">Agent Status</option>
            <option value="platform_disconnect">Platform Disconnect</option>
            <option value="budget_warning">Budget Warning</option>
            <option value="startup">Startup</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 text-sm bg-swarm-dark border border-swarm-border/30 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-sky-500/50"
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="sent">Sent</option>
            <option value="delivered">Delivered</option>
            <option value="failed">Failed</option>
            <option value="read">Read</option>
          </select>
        </div>
      )}

      {/* Notification List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-6 h-6 text-gray-400 animate-spin" />
        </div>
      ) : error ? (
        <div className="text-center py-12">
          <XCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
          <p className="text-red-400">{error}</p>
          <Button variant="ghost" size="sm" onClick={fetchNotifications} className="mt-2">
            Retry
          </Button>
        </div>
      ) : notifications.length === 0 ? (
        <div className="text-center py-12">
          <Bell className="w-12 h-12 text-gray-500 mx-auto mb-3" />
          <p className="text-gray-400">No notifications yet</p>
          <p className="text-sm text-gray-500 mt-1">
            Notifications will appear here when your agent sends alerts
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((notification) => (
            <NotificationCard key={notification.id} notification={notification} />
          ))}
        </div>
      )}
    </div>
  );
};

NotificationsPanel.displayName = 'NotificationsPanel';

export default NotificationsPanel;
