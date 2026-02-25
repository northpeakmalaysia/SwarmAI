import React, { useState, useEffect, useMemo } from 'react';
import {
  Cloud,
  Cpu,
  BarChart3,
  DollarSign,
  RefreshCw,
  Settings,
} from 'lucide-react';
import { useAIStore } from '../stores/aiStore';
import { Tabs } from '../components/common/Tabs';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { ProviderList } from '../components/ai/ProviderList';
import { ModelSelector } from '../components/ai/ModelSelector';
import { UsageChart } from '../components/ai/UsageChart';
import { CostTracker } from '../components/ai/CostTracker';
import { cn } from '../lib/utils';

/**
 * Stat card for overview section
 */
interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  trend?: number;
  color?: 'default' | 'success' | 'warning' | 'info';
}

const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  icon,
  trend,
  color = 'default',
}) => {
  const colorStyles = {
    default: 'text-white',
    success: 'text-emerald-400',
    warning: 'text-amber-400',
    info: 'text-sky-400',
  };

  return (
    <Card variant="bordered" className="p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-gray-400">{label}</span>
        <span className="text-gray-500">{icon}</span>
      </div>
      <div className={cn('text-2xl font-bold', colorStyles[color])}>
        {value}
      </div>
      {trend !== undefined && (
        <div
          className={cn(
            'text-xs mt-1',
            trend >= 0 ? 'text-emerald-400' : 'text-red-400'
          )}
        >
          {trend >= 0 ? '+' : ''}
          {trend.toFixed(1)}% from last month
        </div>
      )}
    </Card>
  );
};

/**
 * Format number with K/M suffix
 */
const formatNumber = (num: number): string => {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`;
  }
  return num.toString();
};

/**
 * AISettingsPage Component
 *
 * Main page for AI provider configuration, model management,
 * usage tracking, and cost monitoring.
 *
 * Features:
 * - Overview statistics
 * - Provider management (add, edit, delete, test)
 * - Model browser with capabilities and pricing
 * - Usage charts with date filtering
 * - Cost tracking with budget alerts
 */
export default function AISettingsPage() {
  const {
    providers,
    usage,
    usageSummary,
    loading,
    fetchProviders,
    fetchUsage,
    fetchUsageSummary,
  } = useAIStore();

  const [activeTab, setActiveTab] = useState('providers');

  // Fetch data on mount
  useEffect(() => {
    fetchProviders();

    // Fetch usage data for last 30 days
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

    fetchUsage(startDate, endDate);
    fetchUsageSummary(startDate, endDate);
  }, [fetchProviders, fetchUsage, fetchUsageSummary]);

  // Calculate overview statistics
  const stats = useMemo(() => {
    // Count active providers
    const activeProviders = providers.filter((p) => p.isActive).length;

    // Count total models across all providers
    const totalModels = providers.reduce((sum, p) => sum + (p.models?.length || 0), 0);

    // Calculate tokens from usage summary - default to 0 if no real data
    const todayTokens = usageSummary?.byDate?.slice(-1)?.[0]?.tokens || 0;
    const monthTokens = usageSummary?.totalTokens || 0;

    // Calculate costs - default to 0 if no real data
    const monthCost = usageSummary?.totalCost || 0;

    return {
      providers: providers.length,
      activeProviders,
      totalModels, // No mock fallback - show real count
      todayTokens,
      monthTokens,
      monthCost,
    };
  }, [providers, usageSummary]);

  return (
    <div className="page-container stack-lg">
      {/* Header */}
      <div className="page-header-actions !mb-0">
        <div>
          <h1 className="page-title flex items-center gap-3">
            <Settings className="w-7 h-7 text-sky-400" />
            AI Settings
          </h1>
          <p className="page-subtitle">
            Configure AI providers, manage models, and track usage
          </p>
        </div>

        <Button
          variant="ghost"
          onClick={() => {
            fetchProviders();
            const endDate = new Date().toISOString().split('T')[0];
            const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
              .toISOString()
              .split('T')[0];
            fetchUsage(startDate, endDate);
            fetchUsageSummary(startDate, endDate);
          }}
          loading={loading}
          icon={<RefreshCw className="w-4 h-4" />}
        >
          Refresh
        </Button>
      </div>

      {/* Overview Stats */}
      <div className="stats-grid md:grid-cols-4">
        <StatCard
          label="Total Providers"
          value={stats.providers}
          icon={<Cloud className="w-4 h-4" />}
          color="info"
        />
        <StatCard
          label="Available Models"
          value={stats.totalModels}
          icon={<Cpu className="w-4 h-4" />}
        />
        <StatCard
          label="Tokens Today"
          value={formatNumber(stats.todayTokens)}
          icon={<BarChart3 className="w-4 h-4" />}
          color="success"
        />
        <StatCard
          label="Cost This Month"
          value={`$${stats.monthCost.toFixed(2)}`}
          icon={<DollarSign className="w-4 h-4" />}
          color="warning"
        />
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <Tabs.List>
          <Tabs.Trigger value="providers" icon={<Cloud className="w-4 h-4" />}>
            Providers
          </Tabs.Trigger>
          <Tabs.Trigger value="models" icon={<Cpu className="w-4 h-4" />}>
            Models
          </Tabs.Trigger>
          <Tabs.Trigger value="usage" icon={<BarChart3 className="w-4 h-4" />}>
            Usage
          </Tabs.Trigger>
          <Tabs.Trigger value="costs" icon={<DollarSign className="w-4 h-4" />}>
            Costs
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="providers">
          <ProviderList />
        </Tabs.Content>

        <Tabs.Content value="models">
          <ModelSelector showAllModels />
        </Tabs.Content>

        <Tabs.Content value="usage">
          <UsageChart />
        </Tabs.Content>

        <Tabs.Content value="costs">
          <CostTracker />
        </Tabs.Content>
      </Tabs>
    </div>
  );
}
