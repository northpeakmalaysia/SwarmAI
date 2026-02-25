import React, { useState } from 'react';
import {
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  FileText,
  Filter,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { useAgenticStore, AgenticApproval } from '../../stores/agenticStore';
import toast from 'react-hot-toast';
import { formatDateTime } from '@/utils/dateFormat';

export interface ApprovalQueueProps {
  /** Agentic profile ID */
  agenticId: string;
  /** Approvals to display */
  approvals: AgenticApproval[];
  /** Whether data is loading */
  isLoading?: boolean;
  /** Additional className */
  className?: string;
}

/**
 * Status badge configuration
 */
const statusConfig: Record<AgenticApproval['status'], { variant: 'warning' | 'success' | 'error'; label: string; icon: React.ReactNode }> = {
  pending: { variant: 'warning', label: 'Pending', icon: <Clock className="w-3 h-3" /> },
  approved: { variant: 'success', label: 'Approved', icon: <CheckCircle className="w-3 h-3" /> },
  rejected: { variant: 'error', label: 'Rejected', icon: <XCircle className="w-3 h-3" /> },
};

/**
 * Action type labels
 */
const actionTypeLabels: Record<string, string> = {
  send_message: 'Send Message',
  create_task: 'Create Task',
  access_data: 'Access Data',
  external_api: 'External API Call',
  modify_settings: 'Modify Settings',
  delete_record: 'Delete Record',
  financial: 'Financial Transaction',
};

/**
 * Check if approval is expired
 */
const isExpired = (expiresAt: string | null): boolean => {
  if (!expiresAt) return false;
  return new Date(expiresAt) < new Date();
};

/**
 * Get time remaining text
 */
const getTimeRemaining = (expiresAt: string | null): string => {
  if (!expiresAt) return 'No expiry';

  const now = new Date();
  const expiry = new Date(expiresAt);
  const diffMs = expiry.getTime() - now.getTime();

  if (diffMs <= 0) return 'Expired';

  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 60) return `${diffMins}m remaining`;
  if (diffHours < 24) return `${diffHours}h remaining`;
  return `${diffDays}d remaining`;
};

/**
 * ApprovalQueue - Displays and manages pending approvals for an agentic profile
 *
 * @example
 * ```tsx
 * <ApprovalQueue
 *   agenticId={profile.id}
 *   approvals={approvals}
 *   isLoading={isLoading}
 * />
 * ```
 */
export const ApprovalQueue: React.FC<ApprovalQueueProps> = ({
  agenticId,
  approvals,
  isLoading = false,
  className,
}) => {
  const { approveAction, rejectAction, fetchApprovals } = useAgenticStore();

  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Filter approvals
  const filteredApprovals = approvals.filter((approval) => {
    if (statusFilter === 'all') return true;
    return approval.status === statusFilter;
  });

  // Pending count
  const pendingCount = approvals.filter((a) => a.status === 'pending').length;

  // Handle approve
  const handleApprove = async (approvalId: string) => {
    setProcessingId(approvalId);
    try {
      await approveAction(agenticId, approvalId);
      toast.success('Action approved');
      fetchApprovals(agenticId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to approve';
      toast.error(message);
    } finally {
      setProcessingId(null);
    }
  };

  // Handle reject
  const handleReject = async (approvalId: string) => {
    setProcessingId(approvalId);
    try {
      await rejectAction(agenticId, approvalId);
      toast.success('Action rejected');
      fetchApprovals(agenticId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to reject';
      toast.error(message);
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-gray-400">
          Approval Queue
          {pendingCount > 0 && (
            <Badge variant="warning" size="sm" className="ml-2">
              {pendingCount} pending
            </Badge>
          )}
        </h4>

        {/* Status Filter */}
        <div className="flex items-center gap-1">
          <Filter className="w-4 h-4 text-gray-500 mr-1" />
          {(['all', 'pending', 'approved', 'rejected'] as const).map((status) => (
            <Button
              key={status}
              size="sm"
              variant={statusFilter === status ? 'secondary' : 'ghost'}
              onClick={() => setStatusFilter(status)}
              className={cn(
                'text-xs capitalize',
                statusFilter === status && 'bg-swarm-dark'
              )}
            >
              {status}
            </Button>
          ))}
        </div>
      </div>

      {/* Approvals List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500"></div>
        </div>
      ) : filteredApprovals.length > 0 ? (
        <div className="space-y-3 max-h-[400px] overflow-y-auto">
          {filteredApprovals.map((approval) => {
            const status = statusConfig[approval.status];
            const expired = approval.status === 'pending' && isExpired(approval.expiresAt);

            return (
              <div
                key={approval.id}
                className={cn(
                  'p-4 bg-swarm-darker rounded-lg border transition-colors',
                  approval.status === 'pending'
                    ? 'border-amber-500/30 hover:border-amber-500/50'
                    : 'border-swarm-border/20'
                )}
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Badge variant={status.variant} size="sm" dot>
                      {status.label}
                    </Badge>
                    <Badge variant="info" size="sm">
                      {actionTypeLabels[approval.actionType] || approval.actionType}
                    </Badge>
                    {expired && (
                      <Badge variant="error" size="sm">
                        Expired
                      </Badge>
                    )}
                  </div>
                  <span className="text-xs text-gray-500">
                    {formatDateTime(approval.createdAt)}
                  </span>
                </div>

                {/* Payload preview */}
                {approval.payload && Object.keys(approval.payload).length > 0 && (
                  <div className="mb-3 p-2 bg-swarm-dark rounded-lg">
                    <div className="flex items-center gap-1 text-xs text-gray-500 mb-1">
                      <FileText className="w-3 h-3" />
                      <span>Request Details</span>
                    </div>
                    <pre className="text-xs text-gray-400 overflow-x-auto">
                      {JSON.stringify(approval.payload, null, 2).substring(0, 200)}
                      {JSON.stringify(approval.payload).length > 200 && '...'}
                    </pre>
                  </div>
                )}

                {/* Footer */}
                <div className="flex items-center justify-between">
                  {/* Expiry info */}
                  <div className="flex items-center gap-1 text-xs">
                    {approval.expiresAt ? (
                      <span className={cn(
                        expired ? 'text-red-400' : 'text-gray-500'
                      )}>
                        <Clock className="w-3 h-3 inline mr-1" />
                        {getTimeRemaining(approval.expiresAt)}
                      </span>
                    ) : (
                      <span className="text-gray-500">No expiry set</span>
                    )}
                  </div>

                  {/* Actions */}
                  {approval.status === 'pending' && !expired && (
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleReject(approval.id)}
                        loading={processingId === approval.id}
                        className="text-red-400 hover:bg-red-500/10"
                        icon={<XCircle className="w-4 h-4" />}
                      >
                        Reject
                      </Button>
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => handleApprove(approval.id)}
                        loading={processingId === approval.id}
                        icon={<CheckCircle className="w-4 h-4" />}
                      >
                        Approve
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : approvals.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <CheckCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No approval requests</p>
          <p className="text-sm mt-1">Actions requiring approval will appear here</p>
        </div>
      ) : (
        <div className="text-center py-8 text-gray-500">
          <Filter className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No {statusFilter} approvals found</p>
        </div>
      )}

      {/* Quick stats */}
      {approvals.length > 0 && (
        <div className="flex items-center justify-center gap-4 pt-4 border-t border-swarm-border/20 text-xs">
          <span className="text-gray-500">
            <span className="text-amber-400 font-medium">
              {approvals.filter((a) => a.status === 'pending').length}
            </span>{' '}
            pending
          </span>
          <span className="text-gray-500">
            <span className="text-emerald-400 font-medium">
              {approvals.filter((a) => a.status === 'approved').length}
            </span>{' '}
            approved
          </span>
          <span className="text-gray-500">
            <span className="text-red-400 font-medium">
              {approvals.filter((a) => a.status === 'rejected').length}
            </span>{' '}
            rejected
          </span>
        </div>
      )}
    </div>
  );
};

ApprovalQueue.displayName = 'ApprovalQueue';

export default ApprovalQueue;
