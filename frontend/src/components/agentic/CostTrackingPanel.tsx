import React, { useState, useEffect, useCallback } from 'react';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Zap,
  RefreshCw,
  AlertTriangle,
  Settings,
  Calendar,
  BarChart3,
  PieChart,
  Clock,
  Save,
  RotateCcw,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { Badge } from '../common/Badge';
import { Modal } from '../common/Modal';
import { Tabs } from '../common/Tabs';
import { useAuthStore } from '../../stores/authStore';
import { formatRelativeTime } from '@/utils/dateFormat';

export interface CostTrackingPanelProps {
  agenticId: string;
  className?: string;
}

interface UsageSummary {
  period: string;
  totals: {
    requestCount: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    totalCost: number;
  };
  byModel: Array<{
    provider: string;
    model: string;
    request_count: number;
    total_tokens: number;
    total_cost: number;
  }>;
  byType: Array<{
    request_type: string;
    request_count: number;
    total_tokens: number;
    total_cost: number;
  }>;
  dailyBreakdown: Array<{
    date: string;
    request_count: number;
    total_tokens: number;
    total_cost: number;
  }>;
  budget: {
    daily: number;
    used: number;
    remaining: number;
    percentUsed: number;
  };
}

interface UsageLog {
  id: string;
  requestType: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  createdAt: string;
}

const formatCost = (cost: number): string => {
  if (cost === 0) return '$0.00';
  if (cost < 0.01) return `$${cost.toFixed(6)}`;
  if (cost < 1) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(2)}`;
};

const formatTokens = (tokens: number): string => {
  if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(2)}M`;
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}K`;
  return tokens.toString();
};

/**
 * CostTrackingPanel - Track AI usage costs and tokens
 */
export const CostTrackingPanel: React.FC<CostTrackingPanelProps> = ({
  agenticId,
  className,
}) => {
  const { token } = useAuthStore();
  const [isLoading, setIsLoading] = useState(true);
  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('day');
  const [activeTab, setActiveTab] = useState('overview');

  // Data
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [logs, setLogs] = useState<UsageLog[]>([]);

  // Budget edit modal
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [newBudget, setNewBudget] = useState('');
  const [isSavingBudget, setIsSavingBudget] = useState(false);

  // Fetch usage summary
  const fetchSummary = useCallback(async () => {
    try {
      setIsLoading(true);

      const response = await fetch(
        `/api/agentic/profiles/${agenticId}/usage?period=${period}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!response.ok) throw new Error('Failed to fetch usage');

      const data = await response.json();
      setSummary(data.usage || data);
    } catch (err) {
      console.error('Failed to fetch usage:', err);
    } finally {
      setIsLoading(false);
    }
  }, [agenticId, token, period]);

  // Fetch usage logs
  const fetchLogs = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/agentic/profiles/${agenticId}/usage/logs?limit=30`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!response.ok) return;

      const data = await response.json();
      setLogs(data.logs || []);
    } catch (err) {
      console.error('Failed to fetch logs:', err);
    }
  }, [agenticId, token]);

  useEffect(() => {
    fetchSummary();
    fetchLogs();
  }, [fetchSummary, fetchLogs]);

  // Save budget
  const handleSaveBudget = async () => {
    const budgetValue = parseFloat(newBudget);
    if (isNaN(budgetValue) || budgetValue < 0) return;

    try {
      setIsSavingBudget(true);

      const response = await fetch(`/api/agentic/profiles/${agenticId}/budget`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ dailyBudget: budgetValue }),
      });

      if (!response.ok) throw new Error('Failed to update budget');

      setShowBudgetModal(false);
      fetchSummary();
    } catch (err) {
      console.error('Failed to save budget:', err);
    } finally {
      setIsSavingBudget(false);
    }
  };

  // Reset daily budget
  const handleResetBudget = async () => {
    try {
      const response = await fetch(`/api/agentic/profiles/${agenticId}/budget/reset`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error('Failed to reset budget');

      fetchSummary();
    } catch (err) {
      console.error('Failed to reset budget:', err);
    }
  };

  // Budget percentage color
  const getBudgetColor = (percent: number) => {
    if (percent >= 100) return 'text-red-400';
    if (percent >= 80) return 'text-orange-400';
    if (percent >= 50) return 'text-yellow-400';
    return 'text-emerald-400';
  };

  // Budget bar color
  const getBudgetBarColor = (percent: number) => {
    if (percent >= 100) return 'bg-red-500';
    if (percent >= 80) return 'bg-orange-500';
    if (percent >= 50) return 'bg-yellow-500';
    return 'bg-emerald-500';
  };

  if (isLoading && !summary) {
    return (
      <div className={cn('flex items-center justify-center py-12', className)}>
        <RefreshCw className="w-6 h-6 text-gray-400 animate-spin" />
      </div>
    );
  }

  const budgetPercent = summary?.budget.percentUsed || 0;

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-emerald-400" />
          <h3 className="font-medium text-white">Cost & Token Tracking</h3>
        </div>

        <div className="flex items-center gap-2">
          {/* Period selector */}
          <div className="flex rounded-lg bg-swarm-darker/50 border border-swarm-border/20 p-0.5">
            {(['day', 'week', 'month'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={cn(
                  'px-3 py-1 text-sm rounded-md transition-colors',
                  period === p
                    ? 'bg-sky-500/20 text-sky-400'
                    : 'text-gray-400 hover:text-white'
                )}
              >
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>

          <Button variant="ghost" size="sm" onClick={fetchSummary}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Budget Progress */}
      <div className="p-4 bg-swarm-darker/50 rounded-xl border border-swarm-border/20">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400">Daily Budget</span>
            {budgetPercent >= 80 && (
              <Badge variant="warning" size="sm">
                {budgetPercent >= 100 ? 'Exceeded' : 'Warning'}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setNewBudget(summary?.budget.daily.toString() || '10');
                setShowBudgetModal(true);
              }}
            >
              <Settings className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleResetBudget}
              className="text-gray-400 hover:text-yellow-400"
            >
              <RotateCcw className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="flex items-baseline gap-2 mb-2">
          <span className={cn('text-2xl font-bold', getBudgetColor(budgetPercent))}>
            {formatCost(summary?.budget.used || 0)}
          </span>
          <span className="text-gray-500">
            / {formatCost(summary?.budget.daily || 10)}
          </span>
          <span className={cn('text-sm ml-auto', getBudgetColor(budgetPercent))}>
            {budgetPercent.toFixed(1)}%
          </span>
        </div>

        <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
          <div
            className={cn('h-full transition-all', getBudgetBarColor(budgetPercent))}
            style={{ width: `${Math.min(100, budgetPercent)}%` }}
          />
        </div>

        <div className="flex justify-between mt-2 text-xs text-gray-500">
          <span>Remaining: {formatCost(summary?.budget.remaining || 0)}</span>
          <span>{summary?.totals.requestCount || 0} requests</span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-3">
        <div className="p-3 rounded-xl bg-swarm-darker/50 border border-swarm-border/20">
          <div className="flex items-center justify-between mb-1">
            <Zap className="w-4 h-4 text-yellow-400" />
            <TrendingUp className="w-3 h-3 text-emerald-400" />
          </div>
          <div className="text-lg font-bold text-white">
            {formatTokens(summary?.totals.totalTokens || 0)}
          </div>
          <div className="text-xs text-gray-400">Total Tokens</div>
        </div>

        <div className="p-3 rounded-xl bg-swarm-darker/50 border border-swarm-border/20">
          <div className="flex items-center justify-between mb-1">
            <TrendingDown className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-lg font-bold text-white">
            {formatTokens(summary?.totals.inputTokens || 0)}
          </div>
          <div className="text-xs text-gray-400">Input Tokens</div>
        </div>

        <div className="p-3 rounded-xl bg-swarm-darker/50 border border-swarm-border/20">
          <div className="flex items-center justify-between mb-1">
            <TrendingUp className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-lg font-bold text-white">
            {formatTokens(summary?.totals.outputTokens || 0)}
          </div>
          <div className="text-xs text-gray-400">Output Tokens</div>
        </div>

        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
          <div className="flex items-center justify-between mb-1">
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-lg font-bold text-emerald-400">
            {formatCost(summary?.totals.totalCost || 0)}
          </div>
          <div className="text-xs text-gray-400">Total Cost</div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <Tabs.List>
          <Tabs.Trigger value="overview" icon={<BarChart3 className="w-4 h-4" />}>
            Overview
          </Tabs.Trigger>
          <Tabs.Trigger value="by-model" icon={<PieChart className="w-4 h-4" />}>
            By Model
          </Tabs.Trigger>
          <Tabs.Trigger value="logs" icon={<Clock className="w-4 h-4" />}>
            Recent
          </Tabs.Trigger>
        </Tabs.List>

        {/* Overview Tab - Daily Breakdown */}
        <Tabs.Content value="overview" className="mt-4">
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-gray-400">Daily Breakdown (Last 7 Days)</h4>
            {summary?.dailyBreakdown.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No usage data for this period
              </div>
            ) : (
              <div className="space-y-2">
                {summary?.dailyBreakdown.map((day) => (
                  <div
                    key={day.date}
                    className="flex items-center justify-between p-3 bg-swarm-darker/30 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <Calendar className="w-4 h-4 text-gray-400" />
                      <span className="text-white">{day.date}</span>
                    </div>
                    <div className="flex items-center gap-6 text-sm">
                      <span className="text-gray-400">
                        {day.request_count} requests
                      </span>
                      <span className="text-gray-400">
                        {formatTokens(day.total_tokens)} tokens
                      </span>
                      <span className="text-emerald-400 font-medium">
                        {formatCost(day.total_cost)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Tabs.Content>

        {/* By Model Tab */}
        <Tabs.Content value="by-model" className="mt-4">
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-gray-400">Usage by Model</h4>
            {summary?.byModel.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No model usage data
              </div>
            ) : (
              <div className="space-y-2">
                {summary?.byModel.map((model, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-3 bg-swarm-darker/30 rounded-lg"
                  >
                    <div>
                      <div className="font-medium text-white">
                        {model.model || 'Unknown Model'}
                      </div>
                      <div className="text-xs text-gray-500">
                        {model.provider || 'Unknown Provider'}
                      </div>
                    </div>
                    <div className="flex items-center gap-6 text-sm">
                      <span className="text-gray-400">
                        {model.request_count} requests
                      </span>
                      <span className="text-gray-400">
                        {formatTokens(model.total_tokens)} tokens
                      </span>
                      <span className="text-emerald-400 font-medium">
                        {formatCost(model.total_cost)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {summary?.byType && summary.byType.length > 0 && (
              <>
                <h4 className="text-sm font-medium text-gray-400 mt-6">Usage by Request Type</h4>
                <div className="space-y-2">
                  {summary.byType.map((type, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-3 bg-swarm-darker/30 rounded-lg"
                    >
                      <span className="text-white capitalize">
                        {type.request_type.replace('_', ' ')}
                      </span>
                      <div className="flex items-center gap-6 text-sm">
                        <span className="text-gray-400">
                          {type.request_count} requests
                        </span>
                        <span className="text-emerald-400 font-medium">
                          {formatCost(type.total_cost)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </Tabs.Content>

        {/* Recent Logs Tab */}
        <Tabs.Content value="logs" className="mt-4">
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-gray-400">Recent Usage</h4>
            {logs.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No recent usage logs
              </div>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {logs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-center justify-between p-3 bg-swarm-darker/30 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <Zap className="w-4 h-4 text-yellow-400" />
                      <div>
                        <div className="text-white text-sm">
                          {log.model || 'Unknown'}
                        </div>
                        <div className="text-xs text-gray-500">
                          {log.requestType} • {formatRelativeTime(log.createdAt)}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-gray-400">
                        {formatTokens(log.totalTokens)}
                      </span>
                      <span className="text-emerald-400">
                        {formatCost(log.costUsd)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Tabs.Content>
      </Tabs>

      {/* Budget Edit Modal */}
      <Modal
        open={showBudgetModal}
        onClose={() => setShowBudgetModal(false)}
        title="Edit Daily Budget"
        size="sm"
      >
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Daily Budget (USD)
            </label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={newBudget}
              onChange={(e) => setNewBudget(e.target.value)}
              placeholder="10.00"
            />
            <p className="text-xs text-gray-500 mt-1">
              Set the maximum daily spending limit for this agent
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-swarm-border/20">
            <Button variant="ghost" onClick={() => setShowBudgetModal(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSaveBudget}
              loading={isSavingBudget}
              icon={<Save className="w-4 h-4" />}
            >
              Save
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

CostTrackingPanel.displayName = 'CostTrackingPanel';

export default CostTrackingPanel;
