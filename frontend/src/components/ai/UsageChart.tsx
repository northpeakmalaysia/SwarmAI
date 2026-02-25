import React, { useState, useMemo, useEffect } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Calendar,
  Filter,
  Download,
  RefreshCw,
} from 'lucide-react';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { useAIStore } from '../../stores/aiStore';
import { cn } from '../../lib/utils';

/**
 * Date range options
 */
type DateRange = '7d' | '30d' | '90d';

interface DateRangeOption {
  value: DateRange;
  label: string;
  days: number;
}

const dateRangeOptions: DateRangeOption[] = [
  { value: '7d', label: '7 Days', days: 7 },
  { value: '30d', label: '30 Days', days: 30 },
  { value: '90d', label: '90 Days', days: 90 },
];

/**
 * Token type toggle
 */
type TokenType = 'total' | 'input' | 'output';

/**
 * Chart data point
 */
interface ChartDataPoint {
  date: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  displayDate: string;
}

/**
 * Generate mock usage data for demonstration
 */
const generateMockData = (days: number): ChartDataPoint[] => {
  const data: ChartDataPoint[] = [];
  const now = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);

    // Generate random but realistic-looking data
    const baseInput = 50000 + Math.random() * 100000;
    const baseOutput = baseInput * (0.3 + Math.random() * 0.4);

    // Add some variance for weekdays vs weekends
    const dayOfWeek = date.getDay();
    const weekendMultiplier = dayOfWeek === 0 || dayOfWeek === 6 ? 0.6 : 1;

    const inputTokens = Math.round(baseInput * weekendMultiplier);
    const outputTokens = Math.round(baseOutput * weekendMultiplier);

    data.push({
      date: date.toISOString().split('T')[0],
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      displayDate: date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      }),
    });
  }

  return data;
};

/**
 * Format number with K/M suffix
 */
const formatTokens = (num: number): string => {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`;
  }
  return num.toString();
};

/**
 * Simple SVG Line Chart Component
 */
interface LineChartProps {
  data: ChartDataPoint[];
  tokenType: TokenType;
  height?: number;
}

const LineChart: React.FC<LineChartProps> = ({
  data,
  tokenType,
  height = 300,
}) => {
  const padding = { top: 20, right: 20, bottom: 40, left: 60 };
  const width = 800;
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // Get values based on token type
  const values = useMemo(() => {
    return data.map((d) => {
      switch (tokenType) {
        case 'input':
          return d.inputTokens;
        case 'output':
          return d.outputTokens;
        default:
          return d.totalTokens;
      }
    });
  }, [data, tokenType]);

  // Calculate scales
  const maxValue = Math.max(...values, 1);
  const minValue = 0;
  const valueRange = maxValue - minValue;

  // Generate Y-axis ticks
  const yTicks = useMemo(() => {
    const tickCount = 5;
    const ticks: number[] = [];
    for (let i = 0; i <= tickCount; i++) {
      ticks.push(minValue + (valueRange * i) / tickCount);
    }
    return ticks;
  }, [minValue, valueRange]);

  // Generate path
  const linePath = useMemo(() => {
    if (data.length === 0) return '';

    const points = data.map((_, i) => {
      const x = padding.left + (i / (data.length - 1)) * chartWidth;
      const y =
        padding.top +
        chartHeight -
        ((values[i] - minValue) / valueRange) * chartHeight;
      return `${x},${y}`;
    });

    return `M ${points.join(' L ')}`;
  }, [data, values, chartWidth, chartHeight, minValue, valueRange, padding]);

  // Generate area path
  const areaPath = useMemo(() => {
    if (data.length === 0) return '';

    const points = data.map((_, i) => {
      const x = padding.left + (i / (data.length - 1)) * chartWidth;
      const y =
        padding.top +
        chartHeight -
        ((values[i] - minValue) / valueRange) * chartHeight;
      return `${x},${y}`;
    });

    const bottomLeft = `${padding.left},${padding.top + chartHeight}`;
    const bottomRight = `${padding.left + chartWidth},${padding.top + chartHeight}`;

    return `M ${bottomLeft} L ${points.join(' L ')} L ${bottomRight} Z`;
  }, [data, values, chartWidth, chartHeight, minValue, valueRange, padding]);

  // Get color based on token type
  const getColor = () => {
    switch (tokenType) {
      case 'input':
        return { stroke: '#38bdf8', fill: 'url(#inputGradient)' };
      case 'output':
        return { stroke: '#a78bfa', fill: 'url(#outputGradient)' };
      default:
        return { stroke: '#34d399', fill: 'url(#totalGradient)' };
    }
  };

  const colors = getColor();

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full h-auto"
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Gradients */}
      <defs>
        <linearGradient id="inputGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="outputGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#a78bfa" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="totalGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#34d399" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Grid lines */}
      {yTicks.map((tick, i) => {
        const y =
          padding.top +
          chartHeight -
          ((tick - minValue) / valueRange) * chartHeight;
        return (
          <g key={i}>
            <line
              x1={padding.left}
              y1={y}
              x2={padding.left + chartWidth}
              y2={y}
              stroke="#334155"
              strokeDasharray="4,4"
            />
            <text
              x={padding.left - 10}
              y={y}
              textAnchor="end"
              dominantBaseline="middle"
              className="text-xs fill-gray-500"
            >
              {formatTokens(tick)}
            </text>
          </g>
        );
      })}

      {/* X-axis labels */}
      {data.map((d, i) => {
        // Show labels for every nth point based on data length
        const showLabel =
          data.length <= 7 ||
          i === 0 ||
          i === data.length - 1 ||
          i % Math.ceil(data.length / 7) === 0;

        if (!showLabel) return null;

        const x = padding.left + (i / (data.length - 1)) * chartWidth;
        return (
          <text
            key={i}
            x={x}
            y={height - 10}
            textAnchor="middle"
            className="text-xs fill-gray-500"
          >
            {d.displayDate}
          </text>
        );
      })}

      {/* Area fill */}
      <path d={areaPath} fill={colors.fill} />

      {/* Line */}
      <path
        d={linePath}
        fill="none"
        stroke={colors.stroke}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Data points */}
      {data.map((d, i) => {
        const x = padding.left + (i / (data.length - 1)) * chartWidth;
        const y =
          padding.top +
          chartHeight -
          ((values[i] - minValue) / valueRange) * chartHeight;

        // Only show points for certain intervals on larger datasets
        const showPoint = data.length <= 14 || i % Math.ceil(data.length / 14) === 0;

        if (!showPoint) return null;

        return (
          <g key={i}>
            <circle
              cx={x}
              cy={y}
              r="4"
              fill="#1e293b"
              stroke={colors.stroke}
              strokeWidth="2"
              className="cursor-pointer hover:r-6 transition-all"
            />
            <title>
              {d.displayDate}: {formatTokens(values[i])} tokens
            </title>
          </g>
        );
      })}
    </svg>
  );
};

/**
 * UsageChart Component
 *
 * Displays a line chart showing token usage over time with filtering options.
 */
export const UsageChart: React.FC = () => {
  const { usage, fetchUsage, loading } = useAIStore();

  const [dateRange, setDateRange] = useState<DateRange>('30d');
  const [tokenType, setTokenType] = useState<TokenType>('total');
  const [providerFilter, setProviderFilter] = useState<string>('all');

  // Get date range configuration
  const dateRangeConfig = dateRangeOptions.find((o) => o.value === dateRange);

  // Generate mock data based on date range
  const chartData = useMemo(() => {
    return generateMockData(dateRangeConfig?.days || 30);
  }, [dateRangeConfig]);

  // Calculate summary statistics
  const stats = useMemo(() => {
    const totalInput = chartData.reduce((sum, d) => sum + d.inputTokens, 0);
    const totalOutput = chartData.reduce((sum, d) => sum + d.outputTokens, 0);
    const total = totalInput + totalOutput;

    // Calculate trend (compare last 7 days to previous 7 days)
    const recent = chartData.slice(-7);
    const previous = chartData.slice(-14, -7);

    const recentTotal = recent.reduce((sum, d) => sum + d.totalTokens, 0);
    const previousTotal = previous.reduce((sum, d) => sum + d.totalTokens, 0);

    const trend =
      previousTotal > 0
        ? ((recentTotal - previousTotal) / previousTotal) * 100
        : 0;

    const avgDaily = total / chartData.length;

    return {
      totalInput,
      totalOutput,
      total,
      trend,
      avgDaily,
    };
  }, [chartData]);

  // Fetch usage data on mount and when date range changes
  useEffect(() => {
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(
      Date.now() - (dateRangeConfig?.days || 30) * 24 * 60 * 60 * 1000
    )
      .toISOString()
      .split('T')[0];

    fetchUsage(startDate, endDate);
  }, [dateRange, fetchUsage, dateRangeConfig]);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card variant="bordered" className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-400">Total Tokens</span>
            <div
              className={cn(
                'flex items-center gap-1 text-sm',
                stats.trend >= 0 ? 'text-emerald-400' : 'text-red-400'
              )}
            >
              {stats.trend >= 0 ? (
                <TrendingUp className="w-4 h-4" />
              ) : (
                <TrendingDown className="w-4 h-4" />
              )}
              {Math.abs(stats.trend).toFixed(1)}%
            </div>
          </div>
          <div className="text-2xl font-bold text-white">
            {formatTokens(stats.total)}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            Last {dateRangeConfig?.days} days
          </div>
        </Card>

        <Card variant="bordered" className="p-4">
          <div className="text-sm text-gray-400 mb-2">Input Tokens</div>
          <div className="text-2xl font-bold text-sky-400">
            {formatTokens(stats.totalInput)}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {((stats.totalInput / stats.total) * 100).toFixed(1)}% of total
          </div>
        </Card>

        <Card variant="bordered" className="p-4">
          <div className="text-sm text-gray-400 mb-2">Output Tokens</div>
          <div className="text-2xl font-bold text-purple-400">
            {formatTokens(stats.totalOutput)}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {((stats.totalOutput / stats.total) * 100).toFixed(1)}% of total
          </div>
        </Card>

        <Card variant="bordered" className="p-4">
          <div className="text-sm text-gray-400 mb-2">Daily Average</div>
          <div className="text-2xl font-bold text-white">
            {formatTokens(stats.avgDaily)}
          </div>
          <div className="text-xs text-gray-500 mt-1">tokens per day</div>
        </Card>
      </div>

      {/* Chart Section */}
      <Card variant="bordered" noPadding>
        {/* Chart Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 border-b border-slate-700">
          <div>
            <h3 className="font-semibold text-white">Token Usage Over Time</h3>
            <p className="text-sm text-gray-400">
              Track your AI token consumption
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Token Type Toggle */}
            <div className="flex bg-slate-800 rounded-lg p-1 border border-slate-700">
              {(['total', 'input', 'output'] as TokenType[]).map((type) => (
                <button
                  key={type}
                  onClick={() => setTokenType(type)}
                  className={cn(
                    'px-3 py-1 rounded-md text-sm capitalize transition-colors',
                    tokenType === type
                      ? 'bg-slate-700 text-white'
                      : 'text-gray-400 hover:text-white'
                  )}
                >
                  {type}
                </button>
              ))}
            </div>

            {/* Date Range Toggle */}
            <div className="flex bg-slate-800 rounded-lg p-1 border border-slate-700">
              {dateRangeOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setDateRange(option.value)}
                  className={cn(
                    'px-3 py-1 rounded-md text-sm transition-colors',
                    dateRange === option.value
                      ? 'bg-slate-700 text-white'
                      : 'text-gray-400 hover:text-white'
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>

            {/* Refresh Button */}
            <Button
              variant="ghost"
              size="sm"
              loading={loading}
              icon={<RefreshCw className="w-4 h-4" />}
              onClick={() => {
                const endDate = new Date().toISOString().split('T')[0];
                const startDate = new Date(
                  Date.now() -
                    (dateRangeConfig?.days || 30) * 24 * 60 * 60 * 1000
                )
                  .toISOString()
                  .split('T')[0];
                fetchUsage(startDate, endDate);
              }}
            >
              Refresh
            </Button>
          </div>
        </div>

        {/* Chart */}
        <div className="p-4">
          {loading && chartData.length === 0 ? (
            <div className="flex items-center justify-center h-[300px]">
              <div className="flex items-center gap-3 text-gray-400">
                <RefreshCw className="w-5 h-5 animate-spin" />
                <span>Loading usage data...</span>
              </div>
            </div>
          ) : (
            <LineChart data={chartData} tokenType={tokenType} height={300} />
          )}
        </div>

        {/* Chart Legend */}
        <div className="flex items-center justify-center gap-6 p-4 border-t border-slate-700">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'w-3 h-3 rounded-full',
                tokenType === 'input'
                  ? 'bg-sky-400'
                  : tokenType === 'output'
                  ? 'bg-purple-400'
                  : 'bg-emerald-400'
              )}
            />
            <span className="text-sm text-gray-400 capitalize">
              {tokenType} Tokens
            </span>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default UsageChart;
