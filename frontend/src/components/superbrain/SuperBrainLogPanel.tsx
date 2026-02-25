/**
 * SuperBrain Log Panel
 *
 * Main panel component for SuperBrain activity logging.
 * Combines stats, filters, log list, and detail view.
 */

import React, { useEffect, useRef, useCallback } from 'react';
import { AlertTriangle, Database } from 'lucide-react';
import { useSuperBrainLogStore } from '@/stores/superbrainLogStore';
import { websocket } from '@/services/websocket';
import { SuperBrainLogStats } from './SuperBrainLogStats';
import { SuperBrainLogFilters } from './SuperBrainLogFilters';
import { SuperBrainLogList } from './SuperBrainLogList';
import { SuperBrainLogDetail } from './SuperBrainLogDetail';
import type { SuperBrainLogEntry } from '@/stores/superbrainLogStore';

export const SuperBrainLogPanel: React.FC = () => {
  const {
    logs,
    stats,
    selectedLog,
    filters,
    isLoading,
    isLoadingStats,
    hasMore,
    total,
    autoScroll,
    isAvailable,
    ttlHours,
    fetchLogs,
    fetchStats,
    fetchLogStatus,
    addLogEntry,
    setFilters,
    setAutoScroll,
    selectLog,
    clearLogs,
  } = useSuperBrainLogStore();

  const listRef = useRef<HTMLDivElement>(null);

  // Initial fetch
  useEffect(() => {
    fetchLogStatus();
    fetchLogs(true);
    fetchStats();
  }, [fetchLogs, fetchStats, fetchLogStatus]);

  // WebSocket subscription for real-time logs
  useEffect(() => {
    const unsubscribe = websocket.subscribe<SuperBrainLogEntry>(
      'superbrain:log:new',
      (data: SuperBrainLogEntry) => {
        addLogEntry(data);

        // Refresh stats periodically (debounced via store)
        fetchStats();

        // Auto-scroll to top if enabled
        if (autoScroll && listRef.current) {
          listRef.current.scrollTop = 0;
        }
      }
    );

    return () => unsubscribe();
  }, [autoScroll, addLogEntry, fetchStats]);

  // Load more on scroll
  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
      const nearBottom = scrollHeight - scrollTop - clientHeight < 100;

      if (nearBottom && hasMore && !isLoading) {
        fetchLogs(false);
      }
    },
    [hasMore, isLoading, fetchLogs]
  );

  // Handle refresh
  const handleRefresh = useCallback(() => {
    fetchLogs(true);
    fetchStats();
  }, [fetchLogs, fetchStats]);

  // Handle clear
  const handleClear = useCallback(async () => {
    if (window.confirm('Are you sure you want to clear all logs?')) {
      await clearLogs();
    }
  }, [clearLogs]);

  // Handle log selection
  const handleSelectLog = useCallback(
    (log: SuperBrainLogEntry) => {
      selectLog(log);
    },
    [selectLog]
  );

  // Service unavailable state
  if (!isAvailable) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center">
        <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-full mb-4">
          <Database className="w-12 h-12 text-amber-400" />
        </div>
        <h3 className="text-lg font-semibold text-white mb-2">
          Log Service Unavailable
        </h3>
        <p className="text-gray-400 max-w-md mb-4">
          The SuperBrain activity log service requires Redis to be running.
          Logs are stored temporarily with a {ttlHours}-hour TTL.
        </p>
        <button
          type="button"
          onClick={handleRefresh}
          className="px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white rounded-lg transition-colors"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col gap-4 p-4">
      {/* Stats Summary */}
      <SuperBrainLogStats stats={stats} isLoading={isLoadingStats} ttlHours={ttlHours} />

      {/* Filters */}
      <SuperBrainLogFilters
        filters={filters}
        onFilterChange={setFilters}
        autoScroll={autoScroll}
        onAutoScrollChange={setAutoScroll}
        onRefresh={handleRefresh}
        onClear={handleClear}
        isLoading={isLoading}
        total={total}
      />

      {/* Main content area */}
      <div className="flex-1 flex gap-4 min-h-0">
        {/* Log list */}
        <div
          ref={listRef}
          className="w-1/2 overflow-y-auto bg-slate-900/50 border border-slate-700 rounded-lg"
          onScroll={handleScroll}
        >
          <SuperBrainLogList
            logs={logs}
            selectedId={selectedLog?.id || null}
            onSelect={handleSelectLog}
            isLoading={isLoading}
          />
        </div>

        {/* Detail panel */}
        <div className="w-1/2 overflow-y-auto bg-slate-900/50 border border-slate-700 rounded-lg">
          {selectedLog ? (
            <SuperBrainLogDetail log={selectedLog} />
          ) : (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center">
              <AlertTriangle className="w-8 h-8 text-gray-600 mb-3" />
              <p className="text-gray-400">Select a log entry to view details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SuperBrainLogPanel;
