/**
 * ExecutionMonitor — Phase 4: Real-Time Execution Visibility
 *
 * Shows live execution state for an agent:
 * - Status badge (Thinking / Executing Tool / Paused / Idle)
 * - Iteration progress bar
 * - Current thought preview
 * - Token usage counter
 */

import React from 'react';
import { useAgenticMonitorStore } from '@/stores/agenticMonitorStore';
import { formatTime } from '@/utils/dateFormat';

interface ExecutionMonitorProps {
  agentId: string;
}

const statusColors: Record<string, string> = {
  idle: 'bg-gray-500',
  thinking: 'bg-blue-500 animate-pulse',
  executing_tool: 'bg-yellow-500 animate-pulse',
  paused: 'bg-orange-500',
  completed: 'bg-green-500',
  error: 'bg-red-500',
};

const statusLabels: Record<string, string> = {
  idle: 'Idle',
  thinking: 'Thinking...',
  executing_tool: 'Executing Tool',
  paused: 'Paused',
  completed: 'Completed',
  error: 'Error',
};

export const ExecutionMonitor: React.FC<ExecutionMonitorProps> = ({ agentId }) => {
  const execution = useAgenticMonitorStore((s) => s.executions[agentId]);

  if (!execution || execution.status === 'idle') {
    return (
      <div className="p-4 bg-gray-800 rounded-lg border border-gray-700">
        <div className="flex items-center gap-2 text-gray-400">
          <div className="w-2 h-2 rounded-full bg-gray-500" />
          <span className="text-sm">No active execution</span>
        </div>
      </div>
    );
  }

  const progress = execution.maxIterations > 0
    ? (execution.currentIteration / execution.maxIterations) * 100
    : 0;

  return (
    <div className="p-4 bg-gray-800 rounded-lg border border-gray-700 space-y-3">
      {/* Status Badge */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${statusColors[execution.status] || 'bg-gray-500'}`} />
          <span className="text-sm font-medium text-white">
            {statusLabels[execution.status] || execution.status}
          </span>
          {execution.tier && (
            <span className="px-1.5 py-0.5 text-xs rounded bg-gray-700 text-gray-300">
              {execution.tier}
            </span>
          )}
        </div>
        {execution.startedAt && (
          <span className="text-xs text-gray-500">
            Started {formatTime(execution.startedAt)}
          </span>
        )}
      </div>

      {/* Iteration Progress */}
      {execution.maxIterations > 0 && (
        <div>
          <div className="flex justify-between text-xs text-gray-400 mb-1">
            <span>Iteration {execution.currentIteration} / {execution.maxIterations}</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-1.5">
            <div
              className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${Math.min(progress, 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Current Tool */}
      {execution.currentTool && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-yellow-400">&#9881;</span>
          <span className="text-gray-300">
            Executing: <code className="text-yellow-300">{execution.currentTool}</code>
          </span>
        </div>
      )}

      {/* Current Thought */}
      {execution.currentThought && (
        <div className="text-sm text-gray-400 bg-gray-900 rounded p-2 max-h-20 overflow-y-auto">
          {execution.currentThought.substring(0, 200)}
          {execution.currentThought.length > 200 && '...'}
        </div>
      )}

      {/* Token Counter */}
      {execution.tokensUsed > 0 && (
        <div className="text-xs text-gray-500">
          Tokens used: {execution.tokensUsed.toLocaleString()}
        </div>
      )}
    </div>
  );
};

export default ExecutionMonitor;
