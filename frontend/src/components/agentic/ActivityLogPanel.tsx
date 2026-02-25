import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  RefreshCw,
  Filter,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  Clock,
  GitBranch,
  Shield,
  Bell,
  Search,
  Calendar,
  Download,
  MessageSquare,
  Zap,
  Settings,
  UserPlus,
  UserMinus,
  Target,
  Brain,
  Sparkles,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { Badge } from '../common/Badge';
import { Tabs } from '../common/Tabs';
import { useAuthStore } from '../../stores/authStore';
import { formatRelativeTime } from '../../utils/dateFormat';

export interface ActivityLogPanelProps {
  agenticId: string;
  className?: string;
}

interface ActivityLog {
  id: string;
  activityType: string;
  activityDescription?: string;
  triggerType?: string;
  triggerId?: string;
  status?: string;
  result?: string;
  requiredApproval: boolean;
  approvedBy?: string;
  approvedAt?: string;
  metadata: Record<string, any>;
  createdAt: string;
}

interface HierarchyLog {
  id: string;
  eventType: string;
  parentAgenticId?: string;
  parentName?: string;
  childAgenticId?: string;
  childName?: string;
  triggeredBy?: string;
  details: Record<string, any>;
  createdAt: string;
}

interface ScopeLog {
  id: string;
  actionType: string;
  recipientName?: string;
  recipientValue: string;
  status: 'allowed' | 'blocked' | 'pending_approval';
  reasonBlocked?: string;
  createdAt: string;
}

interface NotificationLog {
  id: string;
  contactName?: string;
  notificationType: string;
  channel: string;
  title: string;
  message?: string;
  priority: string;
  status: string;
  sentAt?: string;
  deliveredAt?: string;
  readAt?: string;
  createdAt: string;
}

const activityIcons: Record<string, React.ReactNode> = {
  message_sent: <MessageSquare className="w-4 h-4" />,
  message_received: <MessageSquare className="w-4 h-4" />,
  task_created: <Target className="w-4 h-4" />,
  task_completed: <CheckCircle2 className="w-4 h-4" />,
  memory_created: <Brain className="w-4 h-4" />,
  memory_updated: <Brain className="w-4 h-4" />,
  skill_acquired: <Sparkles className="w-4 h-4" />,
  skill_upgraded: <Sparkles className="w-4 h-4" />,
  team_member_added: <UserPlus className="w-4 h-4" />,
  team_member_removed: <UserMinus className="w-4 h-4" />,
  config_changed: <Settings className="w-4 h-4" />,
  default: <Zap className="w-4 h-4" />,
};

const hierarchyEventConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  sub_created: { label: 'Sub-Agent Created', color: 'text-emerald-400', icon: <UserPlus className="w-4 h-4" /> },
  sub_paused: { label: 'Sub-Agent Paused', color: 'text-yellow-400', icon: <Clock className="w-4 h-4" /> },
  sub_resumed: { label: 'Sub-Agent Resumed', color: 'text-blue-400', icon: <Activity className="w-4 h-4" /> },
  sub_terminated: { label: 'Sub-Agent Terminated', color: 'text-red-400', icon: <UserMinus className="w-4 h-4" /> },
  sub_promoted: { label: 'Sub-Agent Promoted', color: 'text-purple-400', icon: <ChevronRight className="w-4 h-4" /> },
  autonomy_changed: { label: 'Autonomy Changed', color: 'text-orange-400', icon: <Settings className="w-4 h-4" /> },
  budget_exceeded: { label: 'Budget Exceeded', color: 'text-red-400', icon: <AlertCircle className="w-4 h-4" /> },
  depth_limit_hit: { label: 'Depth Limit Hit', color: 'text-yellow-400', icon: <GitBranch className="w-4 h-4" /> },
  permission_denied: { label: 'Permission Denied', color: 'text-red-400', icon: <Shield className="w-4 h-4" /> },
};

/**
 * ActivityLogPanel - Comprehensive audit trail for agent activities
 */
export const ActivityLogPanel: React.FC<ActivityLogPanelProps> = ({
  agenticId,
  className,
}) => {
  const { token } = useAuthStore();
  const [activeTab, setActiveTab] = useState('activity');
  const [isLoading, setIsLoading] = useState(true);

  // Activity log state
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [activityTotal, setActivityTotal] = useState(0);

  // Hierarchy log state
  const [hierarchyLogs, setHierarchyLogs] = useState<HierarchyLog[]>([]);
  const [hierarchyTotal, setHierarchyTotal] = useState(0);

  // Scope log state
  const [scopeLogs, setScopeLogs] = useState<ScopeLog[]>([]);
  const [scopeTotal, setScopeTotal] = useState(0);
  const [scopeStats, setScopeStats] = useState({ allowed: 0, blocked: 0, pendingApproval: 0 });

  // Notification log state
  const [notificationLogs, setNotificationLogs] = useState<NotificationLog[]>([]);
  const [notificationTotal, setNotificationTotal] = useState(0);
  const [notificationStats, setNotificationStats] = useState({ sent: 0, delivered: 0, failed: 0 });

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Fetch activity logs
  const fetchActivityLogs = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/agentic/profiles/${agenticId}/activity-log?limit=50`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!response.ok) return;

      const data = await response.json();
      setActivityLogs(data.logs || []);
      setActivityTotal(data.total || 0);
    } catch {
      console.error('Failed to fetch activity logs');
    }
  }, [agenticId, token]);

  // Fetch hierarchy logs
  const fetchHierarchyLogs = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/agentic/profiles/${agenticId}/hierarchy-log?limit=50`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!response.ok) return;

      const data = await response.json();
      setHierarchyLogs(data.logs || []);
      setHierarchyTotal(data.total || 0);
    } catch {
      console.error('Failed to fetch hierarchy logs');
    }
  }, [agenticId, token]);

  // Fetch scope logs
  const fetchScopeLogs = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/agentic/profiles/${agenticId}/scope-log?limit=50`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!response.ok) return;

      const data = await response.json();
      setScopeLogs(data.logs || []);
      setScopeTotal(data.total || 0);
      setScopeStats(data.stats || { allowed: 0, blocked: 0, pendingApproval: 0 });
    } catch {
      console.error('Failed to fetch scope logs');
    }
  }, [agenticId, token]);

  // Fetch notification logs
  const fetchNotificationLogs = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/agentic/profiles/${agenticId}/notifications-log?limit=50`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!response.ok) return;

      const data = await response.json();
      setNotificationLogs(data.logs || []);
      setNotificationTotal(data.total || 0);
      setNotificationStats(data.stats || { sent: 0, delivered: 0, failed: 0 });
    } catch {
      console.error('Failed to fetch notification logs');
    }
  }, [agenticId, token]);

  // Initial fetch
  useEffect(() => {
    const fetchAll = async () => {
      setIsLoading(true);
      await Promise.all([
        fetchActivityLogs(),
        fetchHierarchyLogs(),
        fetchScopeLogs(),
        fetchNotificationLogs(),
      ]);
      setIsLoading(false);
    };
    fetchAll();
  }, [fetchActivityLogs, fetchHierarchyLogs, fetchScopeLogs, fetchNotificationLogs]);

  // Refresh handler
  const handleRefresh = () => {
    switch (activeTab) {
      case 'activity': fetchActivityLogs(); break;
      case 'hierarchy': fetchHierarchyLogs(); break;
      case 'scope': fetchScopeLogs(); break;
      case 'notifications': fetchNotificationLogs(); break;
    }
  };

  // Activity log item
  const ActivityLogItem: React.FC<{ log: ActivityLog }> = ({ log }) => (
    <div className="flex items-start gap-3 p-3 bg-swarm-darker/50 rounded-lg border border-swarm-border/20 hover:border-swarm-border/40 transition-colors">
      <div className="mt-0.5 text-gray-400">
        {activityIcons[log.activityType] || activityIcons.default}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-white capitalize">
            {log.activityType.replace(/_/g, ' ')}
          </span>
          {log.status && (
            <Badge
              variant={log.status === 'success' ? 'success' : log.status === 'failed' ? 'error' : 'default'}
              size="sm"
            >
              {log.status}
            </Badge>
          )}
          {log.requiredApproval && (
            <Badge variant="warning" size="sm">Approval Required</Badge>
          )}
        </div>
        {log.activityDescription && (
          <p className="text-sm text-gray-400 mt-1">{log.activityDescription}</p>
        )}
        <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatRelativeTime(log.createdAt)}
          </span>
          {log.triggerType && (
            <span>Trigger: {log.triggerType}</span>
          )}
        </div>
      </div>
    </div>
  );

  // Hierarchy log item
  const HierarchyLogItem: React.FC<{ log: HierarchyLog }> = ({ log }) => {
    const config = hierarchyEventConfig[log.eventType] || {
      label: log.eventType,
      color: 'text-gray-400',
      icon: <GitBranch className="w-4 h-4" />,
    };

    return (
      <div className="flex items-start gap-3 p-3 bg-swarm-darker/50 rounded-lg border border-swarm-border/20">
        <div className={cn('mt-0.5', config.color)}>
          {config.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn('font-medium', config.color)}>{config.label}</span>
          </div>
          <div className="text-sm text-gray-400 mt-1">
            {log.parentName && log.childName && (
              <span>
                {log.parentName} → {log.childName}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatRelativeTime(log.createdAt)}
            </span>
            {log.triggeredBy && (
              <span>By: {log.triggeredBy}</span>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Scope log item
  const ScopeLogItem: React.FC<{ log: ScopeLog }> = ({ log }) => (
    <div className="flex items-start gap-3 p-3 bg-swarm-darker/50 rounded-lg border border-swarm-border/20">
      <div className={cn(
        'mt-0.5',
        log.status === 'allowed' ? 'text-emerald-400' :
        log.status === 'blocked' ? 'text-red-400' :
        'text-yellow-400'
      )}>
        {log.status === 'allowed' ? <CheckCircle2 className="w-4 h-4" /> :
         log.status === 'blocked' ? <Shield className="w-4 h-4" /> :
         <Clock className="w-4 h-4" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-white">
            {log.recipientName || log.recipientValue}
          </span>
          <Badge
            variant={log.status === 'allowed' ? 'success' : log.status === 'blocked' ? 'error' : 'warning'}
            size="sm"
          >
            {log.status.replace('_', ' ')}
          </Badge>
        </div>
        <div className="text-sm text-gray-400 mt-1">
          {log.actionType.replace('_', ' ')}
          {log.reasonBlocked && (
            <span className="text-red-400"> - {log.reasonBlocked}</span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatRelativeTime(log.createdAt)}
          </span>
        </div>
      </div>
    </div>
  );

  // Notification log item
  const NotificationLogItem: React.FC<{ log: NotificationLog }> = ({ log }) => (
    <div className="flex items-start gap-3 p-3 bg-swarm-darker/50 rounded-lg border border-swarm-border/20">
      <div className={cn(
        'mt-0.5',
        log.status === 'delivered' || log.status === 'read' ? 'text-emerald-400' :
        log.status === 'failed' ? 'text-red-400' :
        'text-blue-400'
      )}>
        <Bell className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-white">{log.title}</span>
          <Badge
            variant={log.priority === 'urgent' ? 'error' : log.priority === 'high' ? 'warning' : 'default'}
            size="sm"
          >
            {log.priority}
          </Badge>
          <Badge
            variant={log.status === 'delivered' ? 'success' : log.status === 'failed' ? 'error' : 'default'}
            size="sm"
          >
            {log.status}
          </Badge>
        </div>
        <div className="text-sm text-gray-400 mt-1">
          To: {log.contactName || 'Unknown'} via {log.channel}
        </div>
        <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatRelativeTime(log.createdAt)}
          </span>
          {log.deliveredAt && (
            <span>Delivered: {formatRelativeTime(log.deliveredAt)}</span>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-sky-400" />
          <h3 className="font-medium text-white">Activity Audit Trail</h3>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className={cn(showFilters && 'bg-sky-500/20 text-sky-400')}
          >
            <Filter className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={handleRefresh}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <Tabs.List>
          <Tabs.Trigger value="activity" icon={<Zap className="w-4 h-4" />}>
            Activity ({activityTotal})
          </Tabs.Trigger>
          <Tabs.Trigger value="hierarchy" icon={<GitBranch className="w-4 h-4" />}>
            Hierarchy ({hierarchyTotal})
          </Tabs.Trigger>
          <Tabs.Trigger value="scope" icon={<Shield className="w-4 h-4" />}>
            Scope ({scopeTotal})
          </Tabs.Trigger>
          <Tabs.Trigger value="notifications" icon={<Bell className="w-4 h-4" />}>
            Notifications ({notificationTotal})
          </Tabs.Trigger>
        </Tabs.List>

        {/* Filters */}
        {showFilters && (
          <div className="mt-4 p-3 bg-swarm-darker/50 rounded-xl border border-swarm-border/20">
            <div className="flex items-center gap-3">
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search logs..."
                size="sm"
                iconLeft={<Search className="w-4 h-4" />}
                className="flex-1"
              />
            </div>
          </div>
        )}

        {/* Activity Tab */}
        <Tabs.Content value="activity" className="mt-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-6 h-6 text-gray-400 animate-spin" />
            </div>
          ) : activityLogs.length === 0 ? (
            <div className="text-center py-12">
              <Activity className="w-12 h-12 text-gray-500 mx-auto mb-3" />
              <p className="text-gray-400">No activity logs yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {activityLogs.map(log => (
                <ActivityLogItem key={log.id} log={log} />
              ))}
            </div>
          )}
        </Tabs.Content>

        {/* Hierarchy Tab */}
        <Tabs.Content value="hierarchy" className="mt-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-6 h-6 text-gray-400 animate-spin" />
            </div>
          ) : hierarchyLogs.length === 0 ? (
            <div className="text-center py-12">
              <GitBranch className="w-12 h-12 text-gray-500 mx-auto mb-3" />
              <p className="text-gray-400">No hierarchy changes recorded</p>
            </div>
          ) : (
            <div className="space-y-2">
              {hierarchyLogs.map(log => (
                <HierarchyLogItem key={log.id} log={log} />
              ))}
            </div>
          )}
        </Tabs.Content>

        {/* Scope Tab */}
        <Tabs.Content value="scope" className="mt-4">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <div className="text-lg font-bold text-emerald-400">{scopeStats.allowed}</div>
              <div className="text-xs text-gray-400">Allowed</div>
            </div>
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20">
              <div className="text-lg font-bold text-red-400">{scopeStats.blocked}</div>
              <div className="text-xs text-gray-400">Blocked</div>
            </div>
            <div className="p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
              <div className="text-lg font-bold text-yellow-400">{scopeStats.pendingApproval}</div>
              <div className="text-xs text-gray-400">Pending</div>
            </div>
          </div>

          {scopeLogs.length === 0 ? (
            <div className="text-center py-12">
              <Shield className="w-12 h-12 text-gray-500 mx-auto mb-3" />
              <p className="text-gray-400">No scope access attempts recorded</p>
            </div>
          ) : (
            <div className="space-y-2">
              {scopeLogs.map(log => (
                <ScopeLogItem key={log.id} log={log} />
              ))}
            </div>
          )}
        </Tabs.Content>

        {/* Notifications Tab */}
        <Tabs.Content value="notifications" className="mt-4">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
              <div className="text-lg font-bold text-blue-400">{notificationStats.sent}</div>
              <div className="text-xs text-gray-400">Sent</div>
            </div>
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <div className="text-lg font-bold text-emerald-400">{notificationStats.delivered}</div>
              <div className="text-xs text-gray-400">Delivered</div>
            </div>
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20">
              <div className="text-lg font-bold text-red-400">{notificationStats.failed}</div>
              <div className="text-xs text-gray-400">Failed</div>
            </div>
          </div>

          {notificationLogs.length === 0 ? (
            <div className="text-center py-12">
              <Bell className="w-12 h-12 text-gray-500 mx-auto mb-3" />
              <p className="text-gray-400">No notifications sent yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {notificationLogs.map(log => (
                <NotificationLogItem key={log.id} log={log} />
              ))}
            </div>
          )}
        </Tabs.Content>
      </Tabs>
    </div>
  );
};

ActivityLogPanel.displayName = 'ActivityLogPanel';

export default ActivityLogPanel;
