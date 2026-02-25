/**
 * SuperBrain Log Filters
 *
 * Filter controls for SuperBrain activity logs.
 */

import React from 'react';
import { Filter, RefreshCw, Trash2 } from 'lucide-react';
import { SuperBrainLogFilters as FilterType } from '@/stores/superbrainLogStore';

interface Props {
  filters: FilterType;
  onFilterChange: (filters: Partial<FilterType>) => void;
  autoScroll: boolean;
  onAutoScrollChange: (enabled: boolean) => void;
  onRefresh: () => void;
  onClear: () => void;
  isLoading?: boolean;
  total?: number;
}

const PROVIDERS = [
  { value: '', label: 'All Providers' },
  { value: 'ollama', label: 'Ollama' },
  { value: 'openrouter', label: 'OpenRouter' },
  { value: 'cli-claude', label: 'Claude CLI' },
  { value: 'cli-gemini', label: 'Gemini CLI' },
  { value: 'cli-opencode', label: 'OpenCode CLI' },
];

const TIERS = [
  { value: '', label: 'All Tiers' },
  { value: 'trivial', label: 'Trivial' },
  { value: 'simple', label: 'Simple' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'complex', label: 'Complex' },
  { value: 'critical', label: 'Critical' },
];

const INTENTS = [
  { value: '', label: 'All Intents' },
  { value: 'SKIP', label: 'Skip' },
  { value: 'PASSIVE', label: 'Passive' },
  { value: 'ACTIVE', label: 'Active' },
];

export const SuperBrainLogFilters: React.FC<Props> = ({
  filters,
  onFilterChange,
  autoScroll,
  onAutoScrollChange,
  onRefresh,
  onClear,
  isLoading,
  total = 0,
}) => {
  return (
    <div className="flex flex-wrap items-center gap-3 p-3 bg-slate-800/50 rounded-lg border border-slate-700">
      {/* Filter Icon */}
      <div className="flex items-center gap-2 text-gray-400">
        <Filter className="w-4 h-4" />
        <span className="text-sm hidden sm:inline">Filters:</span>
      </div>

      {/* Status filter */}
      <select
        value={filters.status}
        onChange={(e) => onFilterChange({ status: e.target.value as FilterType['status'] })}
        className="px-2 py-1.5 bg-slate-700 border border-slate-600 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-sky-500"
      >
        <option value="all">All Status</option>
        <option value="success">Success</option>
        <option value="error">Error</option>
      </select>

      {/* Provider filter */}
      <select
        value={filters.provider || ''}
        onChange={(e) => onFilterChange({ provider: e.target.value || null })}
        className="px-2 py-1.5 bg-slate-700 border border-slate-600 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-sky-500"
      >
        {PROVIDERS.map(p => (
          <option key={p.value} value={p.value}>{p.label}</option>
        ))}
      </select>

      {/* Tier filter */}
      <select
        value={filters.tier || ''}
        onChange={(e) => onFilterChange({ tier: e.target.value || null })}
        className="px-2 py-1.5 bg-slate-700 border border-slate-600 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-sky-500"
      >
        {TIERS.map(t => (
          <option key={t.value} value={t.value}>{t.label}</option>
        ))}
      </select>

      {/* Intent filter */}
      <select
        value={filters.intent || ''}
        onChange={(e) => onFilterChange({ intent: e.target.value || null })}
        className="px-2 py-1.5 bg-slate-700 border border-slate-600 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-sky-500"
      >
        {INTENTS.map(i => (
          <option key={i.value} value={i.value}>{i.label}</option>
        ))}
      </select>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Total count */}
      <span className="text-sm text-gray-400 hidden sm:inline">
        {total} {total === 1 ? 'log' : 'logs'}
      </span>

      {/* Auto-scroll toggle */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={autoScroll}
          onChange={(e) => onAutoScrollChange(e.target.checked)}
          className="rounded bg-slate-700 border-slate-600 text-sky-500 focus:ring-sky-500"
        />
        <span className="text-sm text-gray-400">Auto-scroll</span>
      </label>

      {/* Refresh button */}
      <button
        onClick={onRefresh}
        disabled={isLoading}
        className="p-1.5 text-gray-400 hover:text-white hover:bg-slate-700 rounded transition-colors disabled:opacity-50"
        title="Refresh logs"
      >
        <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
      </button>

      {/* Clear button */}
      <button
        onClick={onClear}
        className="p-1.5 text-gray-400 hover:text-rose-400 hover:bg-slate-700 rounded transition-colors"
        title="Clear all logs"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
};

export default SuperBrainLogFilters;
