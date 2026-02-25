import { useState, useEffect, useRef, useCallback } from 'react';
import {
  AlertTriangle,
  CheckCircle,
  XCircle,
  Info,
  RefreshCw,
  Zap,
  ChevronRight,
  X
} from 'lucide-react';
import { clsx } from 'clsx';
import { api } from '../../services/api';
import { useNavigate } from 'react-router-dom';
import { Button } from '../common/Button';
import { formatTime } from '../../utils/dateFormat';

interface HealthIssue {
  id: string;
  type: 'error' | 'warning' | 'info';
  category: string;
  title: string;
  description: string;
  accountId?: string;
  agentId?: string;
  platform?: string;
}

interface HealthAction {
  id: string;
  issueId: string;
  label: string;
  description: string;
  endpoint?: string;
  method?: string;
  body?: Record<string, unknown>;
  navigateTo?: string;
  autoHeal: boolean;
}

interface HealthData {
  health: {
    status: 'healthy' | 'degraded' | 'critical' | 'attention';
    color: 'green' | 'yellow' | 'red' | 'blue';
    label: string;
  };
  summary: {
    totalAgents: number;
    activeAgents: number;
    connectedPlatforms: number;
    totalPlatforms: number;
    errorCount: number;
    warningCount: number;
    infoCount: number;
  };
  issues: HealthIssue[];
  actions: HealthAction[];
  lastChecked: string;
}

const healthColors = {
  green: 'bg-green-500',
  yellow: 'bg-yellow-500',
  red: 'bg-red-500',
  blue: 'bg-blue-500',
  gray: 'bg-gray-500'
};

const issueIcons = {
  error: XCircle,
  warning: AlertTriangle,
  info: Info
};

const issueColors = {
  error: 'text-red-400 bg-red-500/10 border-red-500/30',
  warning: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
  info: 'text-blue-400 bg-blue-500/10 border-blue-500/30'
};

export default function SwarmHealthIndicator() {
  const navigate = useNavigate();
  const [healthData, setHealthData] = useState<HealthData | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isAutoHealing, setIsAutoHealing] = useState(false);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const fetchHealth = useCallback(async () => {
    try {
      const data = await api.get<HealthData>('/dashboard/health');
      setHealthData(data);
    } catch (error) {
      console.error('Failed to fetch health:', error);
    }
  }, []);

  // Fetch health on mount and every 30 seconds
  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 30000);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const handleRefresh = async () => {
    setIsLoading(true);
    await fetchHealth();
    setIsLoading(false);
  };

  const handleAutoHeal = async () => {
    setIsAutoHealing(true);
    try {
      await api.post('/dashboard/health/auto-heal');
      await fetchHealth();
    } catch (error) {
      console.error('Auto-heal failed:', error);
    } finally {
      setIsAutoHealing(false);
    }
  };

  const handleAction = async (action: HealthAction) => {
    if (action.navigateTo) {
      setIsOpen(false);
      navigate(action.navigateTo);
      return;
    }

    if (action.endpoint) {
      setActionInProgress(action.id);
      try {
        if (action.method === 'POST') {
          await api.post(action.endpoint, action.body);
        } else if (action.method === 'PATCH') {
          await api.patch(action.endpoint, action.body);
        }
        await fetchHealth();
      } catch (error) {
        console.error('Action failed:', error);
      } finally {
        setActionInProgress(null);
      }
    }
  };

  const color = healthData?.health.color || 'gray';
  const label = healthData?.health.label || 'Loading...';
  const hasIssues = (healthData?.issues.length || 0) > 0;
  const autoHealableCount = healthData?.actions.filter(a => a.autoHeal).length || 0;

  return (
    <div className="relative" ref={popoverRef}>
      {/* Status Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={clsx(
          'flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all',
          'hover:bg-swarm-dark/80',
          hasIssues
            ? 'bg-swarm-dark border-swarm-border cursor-pointer'
            : 'bg-swarm-dark border-swarm-border',
          isOpen && 'ring-2 ring-primary-500/50'
        )}
      >
        <div className={clsx(
          'w-2 h-2 rounded-full',
          healthColors[color],
          color !== 'gray' && 'animate-pulse'
        )} />
        <span className="text-sm text-gray-400 hidden md:inline">Swarm</span>
        <span className="text-sm text-gray-300">{healthData?.health.status === 'healthy' ? 'Online' : label}</span>
        {healthData?.summary && (
          <span className="text-xs text-gray-500 hidden lg:inline">
            ({healthData.summary.activeAgents}/{healthData.summary.totalAgents})
          </span>
        )}
      </button>

      {/* Popover */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-96 bg-swarm-card border border-swarm-border rounded-xl shadow-2xl z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-swarm-border bg-swarm-dark/50">
            <div className="flex items-center gap-2">
              <div className={clsx('w-3 h-3 rounded-full', healthColors[color])} />
              <h3 className="font-semibold text-white">Swarm Health</h3>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleRefresh}
                disabled={isLoading}
                className="p-1.5 text-gray-400 hover:text-white hover:bg-swarm-dark rounded-lg transition-colors"
              >
                <RefreshCw className={clsx('w-4 h-4', isLoading && 'animate-spin')} />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 text-gray-400 hover:text-white hover:bg-swarm-dark rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Summary */}
          <div className="px-4 py-3 border-b border-swarm-border">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Agents</span>
                <span className="text-gray-300">
                  {healthData?.summary.activeAgents || 0}/{healthData?.summary.totalAgents || 0} active
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Platforms</span>
                <span className="text-gray-300">
                  {healthData?.summary.connectedPlatforms || 0}/{healthData?.summary.totalPlatforms || 0} connected
                </span>
              </div>
            </div>
          </div>

          {/* Issues List */}
          <div className="max-h-64 overflow-y-auto">
            {!healthData?.issues.length ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <CheckCircle className="w-12 h-12 text-green-400 mb-3" />
                <p className="text-white font-medium">All Systems Operational</p>
                <p className="text-sm text-gray-500 mt-1">No issues detected</p>
              </div>
            ) : (
              <div className="divide-y divide-swarm-border">
                {healthData.issues.map((issue) => {
                  const Icon = issueIcons[issue.type];
                  const action = healthData.actions.find(a => a.issueId === issue.id);

                  return (
                    <div key={issue.id} className="px-4 py-3">
                      <div className="flex items-start gap-3">
                        <div className={clsx(
                          'p-1.5 rounded-lg border',
                          issueColors[issue.type]
                        )}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-white">{issue.title}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{issue.description}</p>

                          {action && (
                            <button
                              onClick={() => handleAction(action)}
                              disabled={actionInProgress === action.id}
                              className={clsx(
                                'mt-2 flex items-center gap-1 text-xs font-medium transition-colors',
                                issue.type === 'error' && 'text-red-400 hover:text-red-300',
                                issue.type === 'warning' && 'text-yellow-400 hover:text-yellow-300',
                                issue.type === 'info' && 'text-blue-400 hover:text-blue-300',
                                actionInProgress === action.id && 'opacity-50'
                              )}
                            >
                              {actionInProgress === action.id ? (
                                <RefreshCw className="w-3 h-3 animate-spin" />
                              ) : (
                                <ChevronRight className="w-3 h-3" />
                              )}
                              {action.label}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Auto-heal Footer */}
          {autoHealableCount > 0 && (
            <div className="px-4 py-3 border-t border-swarm-border bg-swarm-dark/30">
              <Button
                onClick={handleAutoHeal}
                loading={isAutoHealing}
                variant="primary"
                size="sm"
                className="w-full"
                icon={<Zap className="w-4 h-4" />}
              >
                Auto-Heal {autoHealableCount} Issue{autoHealableCount > 1 ? 's' : ''}
              </Button>
              <p className="text-xs text-gray-500 text-center mt-2">
                Automatically reset error states and reconnect
              </p>
            </div>
          )}

          {/* Last checked */}
          {healthData?.lastChecked && (
            <div className="px-4 py-2 border-t border-swarm-border bg-swarm-dark/50">
              <p className="text-xs text-gray-500 text-center">
                Last checked: {formatTime(healthData.lastChecked)}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
