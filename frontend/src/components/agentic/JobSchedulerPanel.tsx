import React, { useState, useEffect, useCallback } from 'react';
import {
  Clock,
  Play,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  RefreshCw,
  Calendar,
  Timer,
  Zap,
  ChevronRight,
  ChevronDown,
  Filter,
  Search,
  BarChart3,
  FileText,
  Bot,
  Brain,
  Mail,
  FileCheck,
  Database,
  Sparkles,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { Input } from '../common/Input';
import { Modal } from '../common/Modal';
import toast from 'react-hot-toast';
import api from '../../services/api';
import { formatDateTime, formatRelativeTime } from '@/utils/dateFormat';

// Types
interface JobHistory {
  id: string;
  scheduleId: string;
  scheduleTitle?: string;
  agenticId: string;
  actionType: string;
  scheduledAt: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  status: 'pending' | 'running' | 'success' | 'failed' | 'skipped' | 'cancelled';
  errorMessage?: string;
  retryCount: number;
  inputData: Record<string, unknown>;
  outputData: Record<string, unknown>;
  resultSummary?: string;
  tokensUsed: number;
  aiProvider?: string;
  aiModel?: string;
  createdAt: string;
}

interface JobStats {
  total: number;
  success: number;
  failed: number;
  running: number;
  successRate: number;
  avgDurationMs: number;
  totalTokensUsed: number;
  byActionType: {
    actionType: string;
    total: number;
    success: number;
    failed: number;
    successRate: number;
  }[];
  recentActivity: { hour: string; count: number }[];
}

interface Schedule {
  id: string;
  title: string;
  description?: string;
  scheduleType: 'cron' | 'interval' | 'once' | 'event';
  cronExpression?: string;
  intervalMinutes?: number;
  nextRunAt?: string;
  lastRunAt?: string;
  actionType: string;
  isActive: boolean;
}

export interface JobSchedulerPanelProps {
  agenticId: string;
  className?: string;
}

// Status configurations
const statusConfig: Record<string, { icon: React.ElementType; color: string; bgColor: string; label: string }> = {
  pending: { icon: Clock, color: 'text-yellow-400', bgColor: 'bg-yellow-400/10', label: 'Pending' },
  running: { icon: Loader2, color: 'text-blue-400', bgColor: 'bg-blue-400/10', label: 'Running' },
  success: { icon: CheckCircle, color: 'text-green-400', bgColor: 'bg-green-400/10', label: 'Success' },
  failed: { icon: XCircle, color: 'text-red-400', bgColor: 'bg-red-400/10', label: 'Failed' },
  skipped: { icon: AlertCircle, color: 'text-gray-400', bgColor: 'bg-gray-400/10', label: 'Skipped' },
  cancelled: { icon: XCircle, color: 'text-orange-400', bgColor: 'bg-orange-400/10', label: 'Cancelled' },
};

// Action type configurations
const actionTypeConfig: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  check_messages: { icon: Mail, color: 'text-blue-400', label: 'Check Messages' },
  send_report: { icon: FileText, color: 'text-green-400', label: 'Send Report' },
  review_tasks: { icon: FileCheck, color: 'text-purple-400', label: 'Review Tasks' },
  update_knowledge: { icon: Database, color: 'text-orange-400', label: 'Update Knowledge' },
  custom_prompt: { icon: Brain, color: 'text-pink-400', label: 'Custom Prompt' },
  self_reflect: { icon: Sparkles, color: 'text-yellow-400', label: 'Self Reflect' },
};

// Helper functions
const formatDuration = (ms?: number): string => {
  if (!ms) return '-';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
};

/**
 * JobSchedulerPanel - View scheduled tasks, job history, and execution results
 */
export const JobSchedulerPanel: React.FC<JobSchedulerPanelProps> = ({
  agenticId,
  className,
}) => {
  const [activeTab, setActiveTab] = useState<'history' | 'stats'>('history');
  const [jobs, setJobs] = useState<JobHistory[]>([]);
  const [stats, setStats] = useState<JobStats | null>(null);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState<JobHistory | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [triggeringSchedule, setTriggeringSchedule] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Fetch job history
  const fetchJobs = useCallback(async () => {
    try {
      setIsLoading(true);
      const params: Record<string, string | number> = {
        page,
        pageSize: 20,
      };
      if (statusFilter !== 'all') params.status = statusFilter;
      if (actionFilter !== 'all') params.actionType = actionFilter;

      const response = await api.get(`/agentic/profiles/${agenticId}/jobs`, { params });
      setJobs(response.data.jobs || []);
      setTotalPages(response.data.totalPages || 1);
    } catch (error) {
      console.error('Failed to fetch job history:', error);
      toast.error('Failed to load job history');
    } finally {
      setIsLoading(false);
    }
  }, [agenticId, page, statusFilter, actionFilter]);

  // Fetch stats
  const fetchStats = useCallback(async () => {
    try {
      const response = await api.get(`/agentic/profiles/${agenticId}/jobs/stats`);
      setStats(response.data.stats || response.data);
    } catch (error) {
      console.error('Failed to fetch job stats:', error);
    }
  }, [agenticId]);

  // Fetch schedules
  const fetchSchedules = useCallback(async () => {
    try {
      const response = await api.get(`/agentic/profiles/${agenticId}/schedules`);
      setSchedules(response.data.schedules || []);
    } catch (error) {
      console.error('Failed to fetch schedules:', error);
    }
  }, [agenticId]);

  useEffect(() => {
    fetchJobs();
    fetchStats();
    fetchSchedules();
  }, [fetchJobs, fetchStats, fetchSchedules]);

  // Trigger schedule manually
  const handleTriggerSchedule = async (scheduleId: string) => {
    setTriggeringSchedule(scheduleId);
    try {
      await api.post(`/agentic/profiles/${agenticId}/schedules/${scheduleId}/trigger`);
      toast.success('Schedule triggered successfully');
      // Refresh data after a short delay
      setTimeout(() => {
        fetchJobs();
        fetchStats();
        fetchSchedules();
      }, 1000);
    } catch (error: unknown) {
      console.error('Failed to trigger schedule:', error);
      const errorMessage = (error as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to trigger schedule';
      toast.error(errorMessage);
    } finally {
      setTriggeringSchedule(null);
    }
  };

  // View job details
  const handleViewDetails = async (jobId: string) => {
    try {
      const response = await api.get(`/agentic/profiles/${agenticId}/jobs/${jobId}`);
      setSelectedJob(response.data);
      setShowDetailsModal(true);
    } catch (error) {
      console.error('Failed to fetch job details:', error);
      toast.error('Failed to load job details');
    }
  };

  // Filter jobs by search query
  const filteredJobs = jobs.filter((job) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      job.scheduleTitle?.toLowerCase().includes(query) ||
      job.actionType.toLowerCase().includes(query) ||
      job.resultSummary?.toLowerCase().includes(query)
    );
  });

  return (
    <div className={cn('space-y-4', className)}>
      {/* Stats Summary */}
      {stats && (
        <div className="grid grid-cols-4 gap-3">
          <div className="p-3 bg-swarm-darker rounded-lg border border-swarm-border/20">
            <div className="text-2xl font-bold text-white">{stats.total}</div>
            <div className="text-xs text-gray-400">Total Jobs</div>
          </div>
          <div className="p-3 bg-swarm-darker rounded-lg border border-swarm-border/20">
            <div className="text-2xl font-bold text-green-400">{stats.successRate}%</div>
            <div className="text-xs text-gray-400">Success Rate</div>
          </div>
          <div className="p-3 bg-swarm-darker rounded-lg border border-swarm-border/20">
            <div className="text-2xl font-bold text-blue-400">{formatDuration(stats.avgDurationMs)}</div>
            <div className="text-xs text-gray-400">Avg Duration</div>
          </div>
          <div className="p-3 bg-swarm-darker rounded-lg border border-swarm-border/20">
            <div className="text-2xl font-bold text-purple-400">{(stats.totalTokensUsed ?? 0).toLocaleString()}</div>
            <div className="text-xs text-gray-400">Tokens Used</div>
          </div>
        </div>
      )}

      {/* Upcoming Schedules */}
      {schedules.filter(s => s.isActive && s.nextRunAt).length > 0 && (
        <div className="p-4 bg-swarm-darker rounded-lg border border-swarm-border/20">
          <h5 className="text-sm font-medium text-gray-300 mb-3 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-sky-400" />
            Upcoming Scheduled Jobs
          </h5>
          <div className="space-y-2">
            {schedules
              .filter(s => s.isActive && s.nextRunAt)
              .sort((a, b) => new Date(a.nextRunAt!).getTime() - new Date(b.nextRunAt!).getTime())
              .slice(0, 3)
              .map((schedule) => {
                const actionConfig = actionTypeConfig[schedule.actionType] || actionTypeConfig.custom_prompt;
                const ActionIcon = actionConfig.icon;
                return (
                  <div
                    key={schedule.id}
                    className="flex items-center justify-between p-2 bg-swarm-dark rounded-lg"
                  >
                    <div className="flex items-center gap-2">
                      <ActionIcon className={cn('w-4 h-4', actionConfig.color)} />
                      <span className="text-sm text-white">{schedule.title}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">
                        {formatDateTime(schedule.nextRunAt)}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleTriggerSchedule(schedule.id)}
                        loading={triggeringSchedule === schedule.id}
                        icon={<Play className="w-3 h-3" />}
                        title="Run now"
                      />
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-swarm-border/20 pb-2">
        <button
          onClick={() => setActiveTab('history')}
          className={cn(
            'px-3 py-1.5 text-sm rounded-lg transition-colors',
            activeTab === 'history'
              ? 'bg-sky-500/20 text-sky-400'
              : 'text-gray-400 hover:text-white hover:bg-swarm-dark'
          )}
        >
          <Clock className="w-4 h-4 inline-block mr-1" />
          Job History
        </button>
        <button
          onClick={() => setActiveTab('stats')}
          className={cn(
            'px-3 py-1.5 text-sm rounded-lg transition-colors',
            activeTab === 'stats'
              ? 'bg-sky-500/20 text-sky-400'
              : 'text-gray-400 hover:text-white hover:bg-swarm-dark'
          )}
        >
          <BarChart3 className="w-4 h-4 inline-block mr-1" />
          Statistics
        </button>
        <div className="flex-1" />
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            fetchJobs();
            fetchStats();
          }}
          icon={<RefreshCw className="w-4 h-4" />}
        >
          Refresh
        </Button>
      </div>

      {/* History Tab */}
      {activeTab === 'history' && (
        <div className="space-y-3">
          {/* Filters */}
          <div className="flex items-center gap-2">
            <div className="flex-1 relative">
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search jobs..."
                className="pr-10"
              />
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 bg-swarm-dark border border-swarm-border/30 rounded-lg text-gray-300"
              title="Filter by status"
              aria-label="Filter by status"
            >
              <option value="all">All Status</option>
              {Object.entries(statusConfig).map(([key, config]) => (
                <option key={key} value={key}>{config.label}</option>
              ))}
            </select>
            <select
              value={actionFilter}
              onChange={(e) => {
                setActionFilter(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 bg-swarm-dark border border-swarm-border/30 rounded-lg text-gray-300"
              title="Filter by action type"
              aria-label="Filter by action type"
            >
              <option value="all">All Actions</option>
              {Object.entries(actionTypeConfig).map(([key, config]) => (
                <option key={key} value={key}>{config.label}</option>
              ))}
            </select>
          </div>

          {/* Job List */}
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500" />
            </div>
          ) : filteredJobs.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No job history found</p>
              <p className="text-xs mt-1">Jobs will appear here when schedules are executed</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredJobs.map((job) => {
                const statusCfg = statusConfig[job.status] || statusConfig.pending;
                const StatusIcon = statusCfg.icon;
                const actionCfg = actionTypeConfig[job.actionType] || actionTypeConfig.custom_prompt;
                const ActionIcon = actionCfg.icon;

                return (
                  <div
                    key={job.id}
                    onClick={() => handleViewDetails(job.id)}
                    className="p-3 bg-swarm-darker rounded-lg border border-swarm-border/20 hover:border-swarm-border/40 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={cn('p-2 rounded-lg', statusCfg.bgColor)}>
                          <StatusIcon className={cn('w-4 h-4', statusCfg.color, job.status === 'running' && 'animate-spin')} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <ActionIcon className={cn('w-4 h-4', actionCfg.color)} />
                            <span className="font-medium text-white text-sm">
                              {job.scheduleTitle || actionCfg.label}
                            </span>
                          </div>
                          <div className="text-xs text-gray-400 mt-0.5">
                            {job.resultSummary || `${actionCfg.label} execution`}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-gray-400">
                        <span>{formatRelativeTime(job.completedAt || job.startedAt)}</span>
                        {job.durationMs && (
                          <span className="flex items-center gap-1">
                            <Timer className="w-3 h-3" />
                            {formatDuration(job.durationMs)}
                          </span>
                        )}
                        {job.tokensUsed > 0 && (
                          <span className="flex items-center gap-1">
                            <Zap className="w-3 h-3 text-yellow-400" />
                            {job.tokensUsed}
                          </span>
                        )}
                        <ChevronRight className="w-4 h-4" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                Previous
              </Button>
              <span className="text-sm text-gray-400">
                Page {page} of {totalPages}
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                Next
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Stats Tab */}
      {activeTab === 'stats' && stats && (
        <div className="space-y-4">
          {/* Status breakdown */}
          <div className="p-4 bg-swarm-darker rounded-lg border border-swarm-border/20">
            <h5 className="text-sm font-medium text-gray-300 mb-3">Execution Status</h5>
            <div className="grid grid-cols-4 gap-3">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-400">{stats.success}</div>
                <div className="text-xs text-gray-400">Success</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-400">{stats.failed}</div>
                <div className="text-xs text-gray-400">Failed</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-400">{stats.running}</div>
                <div className="text-xs text-gray-400">Running</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-400">{stats.total - stats.success - stats.failed - stats.running}</div>
                <div className="text-xs text-gray-400">Other</div>
              </div>
            </div>
          </div>

          {/* By action type */}
          {stats.byActionType.length > 0 && (
            <div className="p-4 bg-swarm-darker rounded-lg border border-swarm-border/20">
              <h5 className="text-sm font-medium text-gray-300 mb-3">By Action Type</h5>
              <div className="space-y-2">
                {stats.byActionType.map((item) => {
                  const actionCfg = actionTypeConfig[item.actionType] || actionTypeConfig.custom_prompt;
                  const ActionIcon = actionCfg.icon;
                  return (
                    <div key={item.actionType} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ActionIcon className={cn('w-4 h-4', actionCfg.color)} />
                        <span className="text-sm text-gray-300">{actionCfg.label}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-gray-400">{item.total} runs</span>
                        <div className="w-20 h-2 bg-swarm-dark rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-green-500 to-green-400"
                            style={{ width: `${item.successRate}%` }}
                          />
                        </div>
                        <span className="text-sm text-gray-400 w-12 text-right">{item.successRate}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Recent activity chart (simple bar representation) */}
          {stats.recentActivity.length > 0 && (
            <div className="p-4 bg-swarm-darker rounded-lg border border-swarm-border/20">
              <h5 className="text-sm font-medium text-gray-300 mb-3">Last 24 Hours Activity</h5>
              <div className="flex items-end gap-1 h-20">
                {stats.recentActivity.map((item, idx) => {
                  const maxCount = Math.max(...stats.recentActivity.map(a => a.count), 1);
                  const height = (item.count / maxCount) * 100;
                  return (
                    <div
                      key={idx}
                      className="flex-1 bg-sky-500/50 rounded-t transition-all hover:bg-sky-500"
                      style={{ height: `${Math.max(height, 2)}%` }}
                      title={`${item.hour}:00 - ${item.count} jobs`}
                    />
                  );
                })}
              </div>
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>24h ago</span>
                <span>Now</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Job Details Modal */}
      <Modal
        open={showDetailsModal}
        onClose={() => {
          setShowDetailsModal(false);
          setSelectedJob(null);
        }}
        title="Job Execution Details"
        size="lg"
      >
        {selectedJob && (
          <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center gap-3">
              {(() => {
                const statusCfg = statusConfig[selectedJob.status] || statusConfig.pending;
                const StatusIcon = statusCfg.icon;
                return (
                  <div className={cn('p-3 rounded-lg', statusCfg.bgColor)}>
                    <StatusIcon className={cn('w-6 h-6', statusCfg.color)} />
                  </div>
                );
              })()}
              <div>
                <h3 className="text-lg font-medium text-white">
                  {selectedJob.scheduleTitle || actionTypeConfig[selectedJob.actionType]?.label || 'Job Execution'}
                </h3>
                <Badge
                  variant={selectedJob.status === 'success' ? 'success' : selectedJob.status === 'failed' ? 'error' : 'default'}
                >
                  {statusConfig[selectedJob.status]?.label || selectedJob.status}
                </Badge>
              </div>
            </div>

            {/* Timing */}
            <div className="grid grid-cols-2 gap-4 p-4 bg-swarm-dark rounded-lg">
              <div>
                <span className="text-xs text-gray-400">Scheduled At</span>
                <p className="text-sm text-white">{formatDateTime(selectedJob.scheduledAt)}</p>
              </div>
              <div>
                <span className="text-xs text-gray-400">Started At</span>
                <p className="text-sm text-white">{formatDateTime(selectedJob.startedAt)}</p>
              </div>
              <div>
                <span className="text-xs text-gray-400">Completed At</span>
                <p className="text-sm text-white">{formatDateTime(selectedJob.completedAt)}</p>
              </div>
              <div>
                <span className="text-xs text-gray-400">Duration</span>
                <p className="text-sm text-white">{formatDuration(selectedJob.durationMs)}</p>
              </div>
            </div>

            {/* Result Summary */}
            {selectedJob.resultSummary && (
              <div className="p-4 bg-swarm-dark rounded-lg">
                <span className="text-xs text-gray-400">Result Summary</span>
                <p className="text-sm text-white mt-1">{selectedJob.resultSummary}</p>
              </div>
            )}

            {/* Error Message */}
            {selectedJob.errorMessage && (
              <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                <span className="text-xs text-red-400">Error</span>
                <p className="text-sm text-red-300 mt-1">{selectedJob.errorMessage}</p>
              </div>
            )}

            {/* AI Info */}
            {(selectedJob.aiProvider || selectedJob.tokensUsed > 0) && (
              <div className="grid grid-cols-3 gap-4 p-4 bg-swarm-dark rounded-lg">
                <div>
                  <span className="text-xs text-gray-400">AI Provider</span>
                  <p className="text-sm text-white">{selectedJob.aiProvider || '-'}</p>
                </div>
                <div>
                  <span className="text-xs text-gray-400">Model</span>
                  <p className="text-sm text-white">{selectedJob.aiModel || '-'}</p>
                </div>
                <div>
                  <span className="text-xs text-gray-400">Tokens Used</span>
                  <p className="text-sm text-white">{selectedJob.tokensUsed.toLocaleString()}</p>
                </div>
              </div>
            )}

            {/* Output Data */}
            {selectedJob.outputData && Object.keys(selectedJob.outputData).length > 0 && (
              <div className="p-4 bg-swarm-dark rounded-lg">
                <span className="text-xs text-gray-400">Output Data</span>
                <pre className="text-xs text-gray-300 mt-2 overflow-auto max-h-40 bg-swarm-darker p-2 rounded">
                  {JSON.stringify(selectedJob.outputData, null, 2)}
                </pre>
              </div>
            )}

            {/* Close Button */}
            <div className="flex justify-end pt-4 border-t border-swarm-border/20">
              <Button variant="ghost" onClick={() => setShowDetailsModal(false)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default JobSchedulerPanel;
