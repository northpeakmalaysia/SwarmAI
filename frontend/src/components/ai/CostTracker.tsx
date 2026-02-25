import React, { useState, useMemo, useEffect } from 'react';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Bell,
  PieChart,
  BarChart3,
  Calendar,
  RefreshCw,
  ChevronRight,
} from 'lucide-react';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { useAIStore } from '../../stores/aiStore';
import { cn } from '../../lib/utils';

/**
 * Time period options for cost tracking
 */
type TimePeriod = 'daily' | 'weekly' | 'monthly';

interface TimePeriodOption {
  value: TimePeriod;
  label: string;
}

const timePeriodOptions: TimePeriodOption[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

/**
 * Cost breakdown item
 */
interface CostBreakdownItem {
  id: string;
  name: string;
  cost: number;
  percentage: number;
  color: string;
  requests: number;
  tokens: number;
}

/**
 * Budget alert configuration
 */
interface BudgetAlert {
  threshold: number;
  type: 'warning' | 'critical';
  triggered: boolean;
}

/**
 * Color palette for providers/models
 */
const CHART_COLORS = [
  '#10b981', '#f97316', '#3b82f6', '#22c55e', '#ec4899',
  '#8b5cf6', '#06b6d4', '#eab308', '#ef4444', '#14b8a6',
];

/**
 * Convert a summary map (byProvider or byModel) to CostBreakdownItem[]
 */
function summaryMapToItems(
  map: Record<string, { tokens: number; cost: number; requests: number }> | undefined,
): CostBreakdownItem[] {
  if (!map) return [];
  const entries = Object.entries(map);
  const totalCost = entries.reduce((s, [, v]) => s + (v.cost || 0), 0);
  return entries.map(([key, val], i) => ({
    id: key,
    name: key || 'unknown',
    cost: val.cost || 0,
    percentage: totalCost > 0 ? Math.round(((val.cost || 0) / totalCost) * 100) : 0,
    color: CHART_COLORS[i % CHART_COLORS.length],
    requests: val.requests || 0,
    tokens: val.tokens || 0,
  }));
}

/**
 * Format currency
 */
const formatCurrency = (amount: number): string => {
  return `$${amount.toFixed(2)}`;
};

/**
 * Format large numbers
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
 * Simple horizontal bar chart for cost breakdown
 */
interface BarChartProps {
  data: CostBreakdownItem[];
  maxValue: number;
}

const HorizontalBarChart: React.FC<BarChartProps> = ({ data, maxValue }) => {
  return (
    <div className="space-y-3">
      {data.map((item) => (
        <div key={item.id} className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              <span className="text-gray-300">{item.name}</span>
            </div>
            <span className="text-white font-medium">
              {formatCurrency(item.cost)}
            </span>
          </div>
          <div className="relative h-2 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
              style={{
                width: `${maxValue > 0 ? (item.cost / maxValue) * 100 : 0}%`,
                backgroundColor: item.color,
              }}
            />
          </div>
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <span>{formatNumber(item.requests)} requests</span>
            <span>{formatNumber(item.tokens)} tokens</span>
          </div>
        </div>
      ))}
    </div>
  );
};

/**
 * Simple donut chart for percentage breakdown
 */
interface DonutChartProps {
  data: CostBreakdownItem[];
  size?: number;
}

const DonutChart: React.FC<DonutChartProps> = ({ data, size = 180 }) => {
  let currentAngle = -90; // Start from top

  const segments = data.map((item) => {
    const angle = (item.percentage / 100) * 360;
    const startAngle = currentAngle;
    const endAngle = currentAngle + angle;
    currentAngle = endAngle;

    // Calculate SVG arc path
    const startRad = (startAngle * Math.PI) / 180;
    const endRad = (endAngle * Math.PI) / 180;

    const outerRadius = size / 2 - 10;
    const innerRadius = outerRadius - 25;

    const x1 = size / 2 + outerRadius * Math.cos(startRad);
    const y1 = size / 2 + outerRadius * Math.sin(startRad);
    const x2 = size / 2 + outerRadius * Math.cos(endRad);
    const y2 = size / 2 + outerRadius * Math.sin(endRad);
    const x3 = size / 2 + innerRadius * Math.cos(endRad);
    const y3 = size / 2 + innerRadius * Math.sin(endRad);
    const x4 = size / 2 + innerRadius * Math.cos(startRad);
    const y4 = size / 2 + innerRadius * Math.sin(startRad);

    const largeArc = angle > 180 ? 1 : 0;

    const path = `
      M ${x1} ${y1}
      A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${x2} ${y2}
      L ${x3} ${y3}
      A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${x4} ${y4}
      Z
    `;

    return {
      ...item,
      path,
    };
  });

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-auto max-w-[180px]">
      {segments.map((segment) => (
        <path
          key={segment.id}
          d={segment.path}
          fill={segment.color}
          className="hover:opacity-80 transition-opacity cursor-pointer"
        >
          <title>
            {segment.name}: {formatCurrency(segment.cost)} ({segment.percentage}%)
          </title>
        </path>
      ))}
    </svg>
  );
};

/**
 * CostTracker Component
 *
 * Comprehensive cost tracking dashboard with breakdowns by provider and model,
 * budget alerts, and trend visualization.
 */
export const CostTracker: React.FC = () => {
  const { usageSummary, fetchUsageSummary, loading } = useAIStore();

  const [timePeriod, setTimePeriod] = useState<TimePeriod>('monthly');
  const [showByModel, setShowByModel] = useState(false);

  // Derive real data from usageSummary
  const providerCosts = useMemo(
    () => summaryMapToItems(usageSummary?.byProvider as any),
    [usageSummary],
  );

  const modelCosts = useMemo(
    () => summaryMapToItems(usageSummary?.byModel as any),
    [usageSummary],
  );

  const totalCost = usageSummary?.totalCost || 0;
  const totalTokens = usageSummary?.totalTokens || 0;
  const requestCount = usageSummary?.requestCount || 0;

  const maxProviderCost = useMemo(
    () => (providerCosts.length > 0 ? Math.max(...providerCosts.map((p) => p.cost)) : 1),
    [providerCosts],
  );

  const maxModelCost = useMemo(
    () => (modelCosts.length > 0 ? Math.max(...modelCosts.map((m) => m.cost)) : 1),
    [modelCosts],
  );

  // Budget alerts
  const budgetAlerts: BudgetAlert[] = useMemo(() => {
    return [
      { threshold: 80, type: 'warning', triggered: totalCost > 80 },
      { threshold: 100, type: 'critical', triggered: totalCost > 100 },
    ];
  }, [totalCost]);

  // Daily costs from usageSummary.byDate
  const dailyCosts = useMemo(
    () => ((usageSummary?.byDate as any[]) || []).map((d: any) => ({ date: d.date, cost: d.cost || 0 })),
    [usageSummary],
  );

  // Calculate trend: last 7 days vs prior 7 days
  const trend = useMemo(() => {
    const recent = dailyCosts.slice(-7).reduce((sum, d) => sum + d.cost, 0);
    const previous = dailyCosts.slice(-14, -7).reduce((sum, d) => sum + d.cost, 0);
    return previous > 0 ? ((recent - previous) / previous) * 100 : 0;
  }, [dailyCosts]);

  // Fetch usage summary
  useEffect(() => {
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];
    fetchUsageSummary(startDate, endDate);
  }, [fetchUsageSummary]);

  const hasData = providerCosts.length > 0 || modelCosts.length > 0 || dailyCosts.length > 0;

  return (
    <div className="space-y-6">
      {/* Budget Alerts */}
      {budgetAlerts.some((a) => a.triggered) && (
        <div className="space-y-2">
          {budgetAlerts
            .filter((a) => a.triggered)
            .map((alert, i) => (
              <div
                key={i}
                className={cn(
                  'flex items-center gap-3 p-3 rounded-lg border',
                  alert.type === 'critical'
                    ? 'bg-red-500/10 border-red-500/30 text-red-400'
                    : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                )}
              >
                <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                <div className="flex-1">
                  <span className="font-medium">
                    {alert.type === 'critical' ? 'Budget Exceeded!' : 'Budget Warning'}
                  </span>
                  <span className="ml-2 text-sm opacity-80">
                    You have exceeded {alert.threshold}% of your monthly budget.
                  </span>
                </div>
                <Button variant="ghost" size="sm">
                  <Bell className="w-4 h-4" />
                </Button>
              </div>
            ))}
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card variant="pressed" className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-400">Total Cost</span>
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-3xl font-bold text-white">
            {formatCurrency(totalCost)}
          </div>
          <div className="flex items-center gap-1 mt-2 text-sm">
            {trend >= 0 ? (
              <>
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                <span className="text-emerald-400">+{trend.toFixed(1)}%</span>
              </>
            ) : (
              <>
                <TrendingDown className="w-4 h-4 text-red-400" />
                <span className="text-red-400">{trend.toFixed(1)}%</span>
              </>
            )}
            <span className="text-gray-500">vs last week</span>
          </div>
        </Card>

        <Card variant="pressed" className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-400">Daily Average</span>
            <Calendar className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-3xl font-bold text-white">
            {formatCurrency(dailyCosts.length > 0 ? totalCost / dailyCosts.length : 0)}
          </div>
          <div className="text-sm text-gray-500 mt-2">Last 30 days</div>
        </Card>

        <Card variant="pressed" className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-400">Active Providers</span>
            <PieChart className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-3xl font-bold text-white">
            {providerCosts.length}
          </div>
          <div className="text-sm text-gray-500 mt-2">
            {providerCosts.filter((p) => p.cost === 0).length} free tier
          </div>
        </Card>

        <Card variant="pressed" className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-400">Total Requests</span>
            <BarChart3 className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-3xl font-bold text-white">
            {formatNumber(requestCount)}
          </div>
          <div className="text-sm text-gray-500 mt-2">
            {formatNumber(totalTokens)} tokens total
          </div>
        </Card>
      </div>

      {/* Empty State */}
      {!hasData && !loading && (
        <div className="text-center py-12 text-gray-500">
          <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No usage data yet. Data will appear once AI requests are processed.</p>
        </div>
      )}

      {/* Cost Breakdown Section */}
      {hasData && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* By Provider */}
            <Card variant="pressed-glow" glowColor="emerald" noPadding>
              <div className="p-4 border-b border-slate-700">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-white">Cost by Provider</h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowByModel(false)}
                    className={!showByModel ? 'text-sky-400' : ''}
                  >
                    View Details
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              </div>
              <div className="p-4">
                {providerCosts.length > 0 ? (
                  <>
                    <div className="flex items-center justify-center mb-6">
                      <DonutChart data={providerCosts} />
                    </div>
                    <HorizontalBarChart data={providerCosts} maxValue={maxProviderCost} />
                  </>
                ) : (
                  <p className="text-sm text-gray-500 text-center py-8">No provider data</p>
                )}
              </div>
            </Card>

            {/* By Model */}
            <Card variant="pressed-glow" glowColor="purple" noPadding>
              <div className="p-4 border-b border-slate-700">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-white">Cost by Model</h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowByModel(true)}
                    className={showByModel ? 'text-sky-400' : ''}
                  >
                    View Details
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              </div>
              <div className="p-4">
                {modelCosts.length > 0 ? (
                  <>
                    <div className="flex items-center justify-center mb-6">
                      <DonutChart data={modelCosts} />
                    </div>
                    <HorizontalBarChart data={modelCosts} maxValue={maxModelCost} />
                  </>
                ) : (
                  <p className="text-sm text-gray-500 text-center py-8">No model data</p>
                )}
              </div>
            </Card>
          </div>

          {/* Daily/Weekly/Monthly Trend */}
          {dailyCosts.length > 0 && (
            <Card variant="pressed-glow" glowColor="sky" noPadding>
              <div className="p-4 border-b border-slate-700">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="font-semibold text-white">Cost Trends</h3>
                    <p className="text-sm text-gray-400">
                      Track your spending patterns over time
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex bg-slate-800 rounded-lg p-1 border border-slate-700">
                      {timePeriodOptions.map((option) => (
                        <button
                          key={option.value}
                          onClick={() => setTimePeriod(option.value)}
                          className={cn(
                            'px-3 py-1 rounded-md text-sm transition-colors',
                            timePeriod === option.value
                              ? 'bg-slate-700 text-white'
                              : 'text-gray-400 hover:text-white'
                          )}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      loading={loading}
                      icon={<RefreshCw className="w-4 h-4" />}
                    />
                  </div>
                </div>
              </div>

              {/* Simple bar chart for daily costs */}
              <div className="p-4">
                <div className="flex items-end gap-1 h-[200px]">
                  {dailyCosts.map((day, i) => {
                    const maxCost = Math.max(...dailyCosts.map((d) => d.cost), 0.01);
                    const height = (day.cost / maxCost) * 100;

                    return (
                      <div
                        key={i}
                        className="flex-1 flex flex-col items-center gap-1"
                      >
                        <div className="relative w-full flex-1 flex items-end">
                          <div
                            className="w-full bg-gradient-to-t from-emerald-500/80 to-emerald-400/80 rounded-t hover:from-emerald-500 hover:to-emerald-400 transition-colors cursor-pointer"
                            style={{ height: `${height}%` }}
                            title={`${day.date}: ${formatCurrency(day.cost)}`}
                          />
                        </div>
                        {(i === 0 ||
                          i === dailyCosts.length - 1 ||
                          i % 7 === 0) && (
                          <span className="text-xs text-gray-500 whitespace-nowrap">
                            {day.date}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Summary footer */}
              <div className="px-4 py-3 border-t border-slate-700 bg-slate-800/30">
                <div className="flex flex-wrap items-center justify-between gap-4 text-sm">
                  <div className="flex items-center gap-6">
                    <div>
                      <span className="text-gray-400">Highest:</span>
                      <span className="text-white ml-2 font-medium">
                        {formatCurrency(Math.max(...dailyCosts.map((d) => d.cost), 0))}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-400">Lowest:</span>
                      <span className="text-white ml-2 font-medium">
                        {formatCurrency(Math.min(...dailyCosts.map((d) => d.cost), 0))}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-400">Average:</span>
                      <span className="text-white ml-2 font-medium">
                        {formatCurrency(
                          dailyCosts.length > 0
                            ? dailyCosts.reduce((s, d) => s + d.cost, 0) / dailyCosts.length
                            : 0
                        )}
                      </span>
                    </div>
                  </div>
                  <Badge variant="info" size="sm">
                    {dailyCosts.length} days
                  </Badge>
                </div>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
};

export default CostTracker;
