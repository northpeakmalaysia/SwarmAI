/**
 * RuntimeControlPanel — Phase 4: Real-Time Execution Visibility
 *
 * Provides Pause/Resume/Interrupt controls for running agent executions.
 * Shows rate limit status and execution state.
 */

import React, { useState, useCallback } from 'react';
import { useAgenticMonitorStore } from '@/stores/agenticMonitorStore';
import { formatTime } from '@/utils/dateFormat';

interface RuntimeControlPanelProps {
  agentId: string;
}

const API_BASE = import.meta.env.VITE_API_URL || '';

const getAuthHeaders = (): Record<string, string> => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
};

export const RuntimeControlPanel: React.FC<RuntimeControlPanelProps> = ({ agentId }) => {
  const execution = useAgenticMonitorStore((s) => s.executions[agentId]);
  const [isLoading, setIsLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sendControl = useCallback(async (action: 'pause' | 'resume' | 'interrupt') => {
    setIsLoading(action);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/agentic/profiles/${agentId}/control`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(data.error || `Failed to ${action}`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setIsLoading(null);
    }
  }, [agentId]);

  const status = execution?.status || 'idle';
  const isActive = status === 'thinking' || status === 'executing_tool';
  const isPaused = status === 'paused';

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
      <h3 className="text-sm font-medium text-white mb-3">Runtime Controls</h3>

      {/* Status indicator */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs text-gray-400">Status:</span>
        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
          isActive ? 'bg-blue-500/20 text-blue-300' :
          isPaused ? 'bg-orange-500/20 text-orange-300' :
          status === 'completed' ? 'bg-green-500/20 text-green-300' :
          status === 'error' ? 'bg-red-500/20 text-red-300' :
          'bg-gray-700 text-gray-400'
        }`}>
          {status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ')}
        </span>
      </div>

      {/* Control buttons */}
      <div className="flex gap-2">
        {/* Pause button (shown when active) */}
        <button
          onClick={() => sendControl('pause')}
          disabled={!isActive || isLoading !== null}
          className={`
            flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors
            ${isActive
              ? 'bg-orange-500/20 text-orange-300 hover:bg-orange-500/30 border border-orange-500/30'
              : 'bg-gray-700 text-gray-500 cursor-not-allowed border border-gray-600'
            }
          `}
        >
          {isLoading === 'pause' ? (
            <span className="flex items-center justify-center gap-1">
              <span className="animate-spin">&#9696;</span> Pausing...
            </span>
          ) : (
            <span className="flex items-center justify-center gap-1">
              &#x23F8; Pause
            </span>
          )}
        </button>

        {/* Resume button (shown when paused) */}
        <button
          onClick={() => sendControl('resume')}
          disabled={!isPaused || isLoading !== null}
          className={`
            flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors
            ${isPaused
              ? 'bg-green-500/20 text-green-300 hover:bg-green-500/30 border border-green-500/30'
              : 'bg-gray-700 text-gray-500 cursor-not-allowed border border-gray-600'
            }
          `}
        >
          {isLoading === 'resume' ? (
            <span className="flex items-center justify-center gap-1">
              <span className="animate-spin">&#9696;</span> Resuming...
            </span>
          ) : (
            <span className="flex items-center justify-center gap-1">
              &#x25B6; Resume
            </span>
          )}
        </button>

        {/* Interrupt button (shown when active or paused) */}
        <button
          onClick={() => sendControl('interrupt')}
          disabled={(!isActive && !isPaused) || isLoading !== null}
          className={`
            flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors
            ${isActive || isPaused
              ? 'bg-red-500/20 text-red-300 hover:bg-red-500/30 border border-red-500/30'
              : 'bg-gray-700 text-gray-500 cursor-not-allowed border border-gray-600'
            }
          `}
        >
          {isLoading === 'interrupt' ? (
            <span className="flex items-center justify-center gap-1">
              <span className="animate-spin">&#9696;</span> Stopping...
            </span>
          ) : (
            <span className="flex items-center justify-center gap-1">
              &#x23F9; Stop
            </span>
          )}
        </button>
      </div>

      {/* Error message */}
      {error && (
        <div className="mt-2 px-3 py-1.5 bg-red-500/10 border border-red-500/20 rounded text-xs text-red-400">
          {error}
        </div>
      )}

      {/* Execution info */}
      {execution && execution.status !== 'idle' && (
        <div className="mt-3 pt-3 border-t border-gray-700 grid grid-cols-2 gap-2 text-xs text-gray-500">
          {execution.tier && (
            <div>Tier: <span className="text-gray-300">{execution.tier}</span></div>
          )}
          {execution.trigger && (
            <div>Trigger: <span className="text-gray-300">{execution.trigger}</span></div>
          )}
          {execution.startedAt && (
            <div>Started: <span className="text-gray-300">{formatTime(execution.startedAt)}</span></div>
          )}
          {execution.currentIteration > 0 && (
            <div>Iteration: <span className="text-gray-300">{execution.currentIteration}/{execution.maxIterations}</span></div>
          )}
        </div>
      )}
    </div>
  );
};

export default RuntimeControlPanel;
