import React, { useState, useEffect, useCallback } from 'react';
import {
  FileText,
  Search,
  Filter,
  Download,
  Trash2,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  X,
  AlertCircle,
  AlertTriangle,
  Info,
  Bug,
  Clock,
  Server,
  Bot,
  Zap,
  Webhook,
  Copy,
  Check,
} from 'lucide-react';
import { Card, CardHeader, CardBody } from '../common/Card';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { cn } from '../../lib/utils';
import toast from 'react-hot-toast';
import {
  useAdminStore,
  SystemLogEntry,
  LogStats,
} from '../../stores/adminStore';
import { formatTime24h, formatShortDate, formatDateTime } from '@/utils/dateFormat';

/**
 * Log level badge component
 */
const LevelBadge: React.FC<{ level: string }> = ({ level }) => {
  const config = {
    error: { variant: 'error', icon: AlertCircle, label: 'Error' },
    warn: { variant: 'warning', icon: AlertTriangle, label: 'Warning' },
    info: { variant: 'info', icon: Info, label: 'Info' },
    debug: { variant: 'default', icon: Bug, label: 'Debug' },
  };

  const { variant, icon: Icon, label } = config[level as keyof typeof config] || config.info;

  return (
    <Badge variant={variant as 'error' | 'warning' | 'info' | 'default'} className="flex items-center gap-1">
      <Icon className="w-3 h-3" />
      {label}
    </Badge>
  );
};

/**
 * Log type icon component
 */
const TypeIcon: React.FC<{ type: string; className?: string }> = ({ type, className }) => {
  const icons = {
    system: Server,
    agent: Bot,
    api: Zap,
    superbrain: Zap,
    webhook: Webhook,
  };
  const Icon = icons[type as keyof typeof icons] || FileText;
  return <Icon className={cn('w-4 h-4', className)} />;
};

/**
 * Statistics card component
 */
const StatCard: React.FC<{
  label: string;
  value: number | string;
  icon: React.ReactNode;
  variant?: 'default' | 'error' | 'warning' | 'success';
}> = ({ label, value, icon, variant = 'default' }) => {
  const variantClasses = {
    default: 'bg-dark-800 border-dark-700',
    error: 'bg-red-500/10 border-red-500/30',
    warning: 'bg-yellow-500/10 border-yellow-500/30',
    success: 'bg-green-500/10 border-green-500/30',
  };

  return (
    <div className={cn('rounded-lg border p-4', variantClasses[variant])}>
      <div className="flex items-center justify-between">
        <div className="text-dark-400">{icon}</div>
        <span className="text-2xl font-bold text-white">{value}</span>
      </div>
      <p className="text-sm text-dark-400 mt-1">{label}</p>
    </div>
  );
};

/**
 * Log detail modal component
 */
const LogDetailModal: React.FC<{
  log: SystemLogEntry | null;
  onClose: () => void;
}> = ({ log, onClose }) => {
  const [copied, setCopied] = useState(false);

  if (!log) return null;

  // Extract metadata fields with type safety
  const meta = log.metadata || {};
  const functionName = meta.function ? String(meta.function) : null;
  const fileName = meta.file ? String(meta.file) : null;
  const lineNumber = meta.line ? String(meta.line) : '?';
  const errorName = meta.errorName ? String(meta.errorName) : null;
  const errorMessage = meta.errorMessage ? String(meta.errorMessage) : null;
  const errorStack = meta.errorStack ? String(meta.errorStack) : null;

  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(log, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-dark-800 rounded-lg border border-dark-700 max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-dark-700">
          <h3 className="text-lg font-medium text-white">Log Details</h3>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
        <div className="p-4 overflow-y-auto flex-1">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-dark-400">Timestamp</label>
                <p className="text-white">{formatDateTime(log.timestamp)}</p>
              </div>
              <div>
                <label className="text-sm text-dark-400">Level</label>
                <div className="mt-1">
                  <LevelBadge level={log.level} />
                </div>
              </div>
              <div>
                <label className="text-sm text-dark-400">Type</label>
                <p className="text-white capitalize">{log.type}</p>
              </div>
              <div>
                <label className="text-sm text-dark-400">Source</label>
                <p className="text-white">{log.source}</p>
              </div>
              {functionName && (
                <div>
                  <label className="text-sm text-dark-400">Function</label>
                  <p className="text-white font-mono text-sm">{functionName}()</p>
                </div>
              )}
              {fileName && (
                <div>
                  <label className="text-sm text-dark-400">File</label>
                  <p className="text-white font-mono text-sm">{fileName}:{lineNumber}</p>
                </div>
              )}
            </div>

            <div>
              <label className="text-sm text-dark-400">Message</label>
              <p className="text-white mt-1 bg-dark-900 rounded p-3">{log.message}</p>
            </div>

            {/* Error Details */}
            {(errorName || errorMessage) && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                <label className="text-sm text-red-400 font-medium">Error Details</label>
                {errorName && (
                  <p className="text-red-300 mt-1">
                    <span className="text-red-400">Type:</span> {errorName}
                  </p>
                )}
                {errorMessage && (
                  <p className="text-red-300 mt-1">
                    <span className="text-red-400">Message:</span> {errorMessage}
                  </p>
                )}
                {errorStack && (
                  <details className="mt-2">
                    <summary className="text-red-400 cursor-pointer text-sm">Stack Trace</summary>
                    <pre className="text-red-300/80 text-xs mt-1 overflow-x-auto whitespace-pre-wrap">
                      {errorStack}
                    </pre>
                  </details>
                )}
              </div>
            )}

            {log.metadata && Object.keys(log.metadata).length > 0 && (
              <div>
                <label className="text-sm text-dark-400">Metadata</label>
                <pre className="text-dark-300 text-sm mt-1 bg-dark-900 rounded p-3 overflow-x-auto">
                  {JSON.stringify(log.metadata, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
        <div className="flex justify-end p-4 border-t border-dark-700">
          <Button variant="secondary" size="sm" onClick={handleCopy}>
            {copied ? (
              <>
                <Check className="w-4 h-4 mr-2" />
                Copied
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 mr-2" />
                Copy JSON
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

/**
 * SystemLogsSettings Component
 *
 * Displays system logs with filtering, search, and export functionality.
 */
export const SystemLogsSettings: React.FC = () => {
  const {
    logs,
    logStats,
    logFilters,
    logPagination,
    logsLoading,
    error,
    fetchLogs,
    fetchLogStats,
    setLogFilters,
    setLogPage,
    exportLogs,
    cleanupLogs,
    clearError,
  } = useAdminStore();

  const [selectedLog, setSelectedLog] = useState<SystemLogEntry | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [localSearch, setLocalSearch] = useState('');

  // Initial fetch
  useEffect(() => {
    fetchLogs();
    fetchLogStats();
  }, [fetchLogs, fetchLogStats]);

  // Refresh when filters or page change
  useEffect(() => {
    fetchLogs();
  }, [logFilters, logPagination.page, fetchLogs]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchLogs();
      fetchLogStats();
    }, 5000);

    return () => clearInterval(interval);
  }, [autoRefresh, fetchLogs, fetchLogStats]);

  // Handle search with debounce
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (localSearch !== logFilters.search) {
        setLogFilters({ search: localSearch });
      }
    }, 300);

    return () => clearTimeout(timeout);
  }, [localSearch, logFilters.search, setLogFilters]);

  const handleRefresh = useCallback(() => {
    fetchLogs();
    fetchLogStats();
    toast.success('Logs refreshed');
  }, [fetchLogs, fetchLogStats]);

  const handleExport = async (format: 'json' | 'csv') => {
    try {
      await exportLogs(format);
      toast.success(`Logs exported as ${format.toUpperCase()}`);
    } catch {
      toast.error('Failed to export logs');
    }
  };

  const handleCleanup = async () => {
    if (!confirm('Are you sure you want to delete logs older than 7 days? This action cannot be undone.')) {
      return;
    }

    try {
      await cleanupLogs(7);
      toast.success('Old logs cleaned up successfully');
    } catch {
      toast.error('Failed to cleanup logs');
    }
  };

  const formatTime = (timestamp: string) => {
    return formatTime24h(timestamp);
  };

  const formatDate = (timestamp: string) => {
    return formatShortDate(timestamp);
  };

  return (
    <div className="space-y-6">
      {/* Error Banner */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 flex items-center justify-between">
          <p className="text-red-400">{error}</p>
          <button onClick={clearError} className="text-red-300 hover:text-red-200">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Statistics */}
      {logStats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="Total Logs"
            value={logStats.summary.total.toLocaleString()}
            icon={<FileText className="w-5 h-5" />}
          />
          <StatCard
            label="Errors"
            value={logStats.summary.errors.toLocaleString()}
            icon={<AlertCircle className="w-5 h-5 text-red-400" />}
            variant="error"
          />
          <StatCard
            label="API Requests"
            value={logStats.summary.apiRequests.toLocaleString()}
            icon={<Zap className="w-5 h-5 text-primary-400" />}
          />
          <StatCard
            label="Warnings"
            value={logStats.summary.warnings.toLocaleString()}
            icon={<AlertTriangle className="w-5 h-5 text-yellow-400" />}
            variant="warning"
          />
        </div>
      )}

      {/* Toolbar */}
      <Card variant="bordered">
        <CardBody className="py-3">
          <div className="flex flex-wrap items-center gap-3">
            {/* Type Tabs */}
            <div className="flex items-center bg-dark-800 rounded-lg p-1">
              {['all', 'api', 'error', 'agent', 'system'].map((type) => (
                <button
                  key={type}
                  onClick={() => setLogFilters({ type })}
                  className={cn(
                    'px-3 py-1.5 text-sm rounded-md transition-colors capitalize',
                    logFilters.type === type
                      ? 'bg-primary-600 text-white'
                      : 'text-dark-400 hover:text-white hover:bg-dark-700'
                  )}
                >
                  {type === 'api' ? 'API' : type}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-400" />
                <input
                  type="text"
                  placeholder="Search logs..."
                  value={localSearch}
                  onChange={(e) => setLocalSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-dark-800 border border-dark-600 rounded-lg text-white placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>

            {/* Filter Toggle */}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter className="w-4 h-4 mr-2" />
              Filters
            </Button>

            {/* Auto-refresh */}
            <Button
              variant={autoRefresh ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setAutoRefresh(!autoRefresh)}
            >
              <RefreshCw className={cn('w-4 h-4 mr-2', autoRefresh && 'animate-spin')} />
              {autoRefresh ? 'Auto' : 'Manual'}
            </Button>

            {/* Refresh */}
            <Button variant="secondary" size="sm" onClick={handleRefresh} disabled={logsLoading}>
              <RefreshCw className={cn('w-4 h-4', logsLoading && 'animate-spin')} />
            </Button>

            {/* Export */}
            <div className="relative group">
              <Button variant="secondary" size="sm">
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>
              <div className="absolute right-0 top-full mt-1 bg-dark-800 border border-dark-600 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                <button
                  onClick={() => handleExport('json')}
                  className="block w-full px-4 py-2 text-sm text-left text-dark-200 hover:bg-dark-700"
                >
                  Export as JSON
                </button>
                <button
                  onClick={() => handleExport('csv')}
                  className="block w-full px-4 py-2 text-sm text-left text-dark-200 hover:bg-dark-700"
                >
                  Export as CSV
                </button>
              </div>
            </div>

            {/* Cleanup */}
            <Button variant="ghost" size="sm" onClick={handleCleanup}>
              <Trash2 className="w-4 h-4 text-red-400" />
            </Button>
          </div>

          {/* Expanded Filters */}
          {showFilters && (
            <div className="mt-4 pt-4 border-t border-dark-700 grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="text-sm text-dark-400 mb-1 block">Level</label>
                <select
                  value={logFilters.level}
                  onChange={(e) => setLogFilters({ level: e.target.value })}
                  className="w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-white"
                >
                  <option value="">All Levels</option>
                  <option value="error">Error</option>
                  <option value="warn">Warning</option>
                  <option value="info">Info</option>
                  <option value="debug">Debug</option>
                </select>
              </div>
              <div>
                <label className="text-sm text-dark-400 mb-1 block">Provider</label>
                <input
                  type="text"
                  placeholder="e.g., openrouter"
                  value={logFilters.provider}
                  onChange={(e) => setLogFilters({ provider: e.target.value })}
                  className="w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-white placeholder-dark-500"
                />
              </div>
              <div>
                <label className="text-sm text-dark-400 mb-1 block">Start Date</label>
                <input
                  type="datetime-local"
                  value={logFilters.startDate}
                  onChange={(e) => setLogFilters({ startDate: e.target.value })}
                  className="w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-white"
                />
              </div>
              <div>
                <label className="text-sm text-dark-400 mb-1 block">End Date</label>
                <input
                  type="datetime-local"
                  value={logFilters.endDate}
                  onChange={(e) => setLogFilters({ endDate: e.target.value })}
                  className="w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-white"
                />
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Logs Table */}
      <Card variant="bordered">
        <CardBody className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-dark-700">
                  <th className="text-left px-4 py-3 text-sm font-medium text-dark-400">Time</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-dark-400">Level</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-dark-400">Source</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-dark-400">Message</th>
                </tr>
              </thead>
              <tbody>
                {logsLoading && logs.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center">
                      <RefreshCw className="w-6 h-6 animate-spin mx-auto text-dark-400" />
                      <p className="text-dark-400 mt-2">Loading logs...</p>
                    </td>
                  </tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center">
                      <FileText className="w-8 h-8 mx-auto text-dark-500 mb-2" />
                      <p className="text-dark-400">No logs found</p>
                      <p className="text-dark-500 text-sm mt-1">Try adjusting your filters</p>
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr
                      key={log.id}
                      onClick={() => setSelectedLog(log)}
                      className={cn(
                        'border-b border-dark-800 hover:bg-dark-800/50 cursor-pointer transition-colors',
                        log.level === 'error' && 'bg-red-500/5',
                        log.level === 'warn' && 'bg-yellow-500/5'
                      )}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 text-dark-300">
                          <Clock className="w-4 h-4 text-dark-500" />
                          <div>
                            <div className="text-sm">{formatTime(log.timestamp)}</div>
                            <div className="text-xs text-dark-500">{formatDate(log.timestamp)}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <LevelBadge level={log.level} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <TypeIcon type={log.type} className="text-dark-400" />
                          <span className="text-dark-200 text-sm truncate max-w-[150px]">
                            {log.source}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-dark-300 text-sm truncate max-w-[400px]">{log.message}</p>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {logPagination.totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-dark-700">
              <div className="text-sm text-dark-400">
                Showing {((logPagination.page - 1) * logPagination.limit) + 1} -{' '}
                {Math.min(logPagination.page * logPagination.limit, logPagination.total)} of{' '}
                {logPagination.total.toLocaleString()} logs
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setLogPage(logPagination.page - 1)}
                  disabled={logPagination.page === 1}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-dark-300 px-2">
                  Page {logPagination.page} of {logPagination.totalPages}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setLogPage(logPagination.page + 1)}
                  disabled={!logPagination.hasMore}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Log Detail Modal */}
      <LogDetailModal log={selectedLog} onClose={() => setSelectedLog(null)} />
    </div>
  );
};

export default SystemLogsSettings;
