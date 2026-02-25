/**
 * ExecutionHistoryPanel — Phase 7: Historical Execution Replay
 *
 * Shows paginated list of past reasoning loop executions with
 * trigger badge, timestamp, iterations, tokens, action counts.
 * Click to expand for full details.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Clock, ChevronDown, ChevronRight, Zap, Brain, CheckCircle, XCircle, RefreshCw } from 'lucide-react';
import api from '@/services/api';
import { formatDateTime } from '@/utils/dateFormat';

interface Execution {
  id: string;
  trigger: string;
  timestamp: string;
  iterations: number;
  tokensUsed: number;
  actionCount: number;
  successCount: number;
  failCount: number;
  mode: string;
  finalThought: string;
  details: string;
}

interface ExecutionHistoryPanelProps {
  agentId: string;
}

const triggerColors: Record<string, string> = {
  wake_up: 'bg-green-500/20 text-green-300',
  event: 'bg-blue-500/20 text-blue-300',
  schedule: 'bg-purple-500/20 text-purple-300',
  periodic_think: 'bg-yellow-500/20 text-yellow-300',
  incoming_message: 'bg-cyan-500/20 text-cyan-300',
  plan_step: 'bg-orange-500/20 text-orange-300',
  default: 'bg-gray-500/20 text-gray-300',
};

export const ExecutionHistoryPanel: React.FC<ExecutionHistoryPanelProps> = ({ agentId }) => {
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const limit = 15;

  const fetchHistory = useCallback(async (newOffset = 0) => {
    setLoading(true);
    try {
      const { data } = await api.get(`/agentic/profiles/${agentId}/execution-history`, {
        params: { limit, offset: newOffset },
      });
      if (newOffset === 0) {
        setExecutions(data.executions || []);
      } else {
        setExecutions(prev => [...prev, ...(data.executions || [])]);
      }
      setTotal(data.total || 0);
      setOffset(newOffset);
    } catch (err) {
      console.error('Failed to load execution history:', err);
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    fetchHistory(0);
  }, [fetchHistory]);

  if (loading && executions.length === 0) {
    return (
      <div className="p-6 text-center text-gray-500">
        <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />
        Loading execution history...
      </div>
    );
  }

  if (executions.length === 0) {
    return (
      <div className="p-6 text-center text-gray-500">
        <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p>No execution history yet.</p>
        <p className="text-xs mt-1">Reasoning cycles will appear here after they run.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1 mb-3">
        <span className="text-xs text-gray-500">{total} total executions</span>
        <button
          onClick={() => fetchHistory(0)}
          className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
        >
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      </div>

      {executions.map((exec) => {
        const isExpanded = expandedId === exec.id;
        const triggerClass = triggerColors[exec.trigger] || triggerColors.default;

        return (
          <div
            key={exec.id}
            className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden"
          >
            <button
              onClick={() => setExpandedId(isExpanded ? null : exec.id)}
              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-750 transition-colors text-left"
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 text-gray-500 flex-shrink-0" />
              ) : (
                <ChevronRight className="w-4 h-4 text-gray-500 flex-shrink-0" />
              )}

              <span className={`px-2 py-0.5 rounded text-xs font-medium ${triggerClass}`}>
                {exec.trigger}
              </span>

              <span className="text-xs text-gray-500 flex-shrink-0">
                {formatDateTime(exec.timestamp)}
              </span>

              <span className="flex-1" />

              <span className="flex items-center gap-1 text-xs text-gray-400">
                <Brain className="w-3 h-3" /> {exec.iterations}
              </span>
              <span className="flex items-center gap-1 text-xs text-green-400">
                <CheckCircle className="w-3 h-3" /> {exec.successCount}
              </span>
              {exec.failCount > 0 && (
                <span className="flex items-center gap-1 text-xs text-red-400">
                  <XCircle className="w-3 h-3" /> {exec.failCount}
                </span>
              )}
              <span className="flex items-center gap-1 text-xs text-gray-500">
                <Zap className="w-3 h-3" /> {exec.tokensUsed.toLocaleString()}
              </span>
            </button>

            {isExpanded && (
              <div className="px-4 pb-3 border-t border-gray-700 space-y-2">
                <div className="grid grid-cols-4 gap-2 pt-2 text-xs">
                  <div className="bg-gray-900 rounded p-2 text-center">
                    <div className="text-gray-500">Iterations</div>
                    <div className="text-white font-bold">{exec.iterations}</div>
                  </div>
                  <div className="bg-gray-900 rounded p-2 text-center">
                    <div className="text-gray-500">Actions</div>
                    <div className="text-white font-bold">{exec.actionCount}</div>
                  </div>
                  <div className="bg-gray-900 rounded p-2 text-center">
                    <div className="text-gray-500">Tokens</div>
                    <div className="text-white font-bold">{exec.tokensUsed.toLocaleString()}</div>
                  </div>
                  <div className="bg-gray-900 rounded p-2 text-center">
                    <div className="text-gray-500">Mode</div>
                    <div className="text-white font-bold capitalize">{exec.mode}</div>
                  </div>
                </div>

                {exec.finalThought && (
                  <div className="text-xs text-gray-400 bg-gray-900 rounded p-2">
                    <span className="text-gray-500 font-medium">Final thought: </span>
                    {exec.finalThought.substring(0, 300)}
                    {exec.finalThought.length > 300 ? '...' : ''}
                  </div>
                )}

                {exec.details && (
                  <div className="text-xs text-gray-500 bg-gray-900 rounded p-2">
                    {exec.details.substring(0, 200)}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {executions.length < total && (
        <button
          onClick={() => fetchHistory(offset + limit)}
          disabled={loading}
          className="w-full py-2 text-sm text-blue-400 hover:text-blue-300 disabled:opacity-50"
        >
          {loading ? 'Loading...' : `Load more (${executions.length}/${total})`}
        </button>
      )}
    </div>
  );
};

export default ExecutionHistoryPanel;
