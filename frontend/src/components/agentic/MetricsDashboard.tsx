/**
 * MetricsDashboard — Phase 7: Metrics Visualization
 *
 * Uses recharts (already installed) for charts.
 * Period toggle: 24h / 7d / 30d
 * Row 1: Total Cycles, Avg Iterations, Total Tokens, Recovery Rate
 * Row 2: Tool Success Rate (PieChart), Daily Activity (LineChart)
 * Row 3: Skill Levels (BarChart), Collaboration Count
 */

import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Activity, Brain, Zap, Shield, Users } from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import api from '@/services/api';

interface Metrics {
  period: string;
  totalCycles: number;
  avgIterations: number;
  totalTokens: number;
  recoveryRate: number;
  toolSuccessRate: number;
  dailyActivity: { date: string; count: number }[];
  skillLevels: { name: string; category: string; level: number; xp: number }[];
  collaborationCount: number;
}

interface MetricsDashboardProps {
  agentId: string;
}

const PERIODS = ['24h', '7d', '30d'] as const;

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

const StatCard: React.FC<{ label: string; value: string | number; icon: React.ReactNode; color?: string }> = ({
  label, value, icon, color = 'text-white',
}) => (
  <div className="bg-gray-900 rounded-lg p-3 text-center">
    <div className="flex items-center justify-center gap-1.5 text-gray-500 text-xs mb-1">
      {icon} {label}
    </div>
    <div className={`text-lg font-bold ${color}`}>{value}</div>
  </div>
);

export const MetricsDashboard: React.FC<MetricsDashboardProps> = ({ agentId }) => {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [period, setPeriod] = useState<typeof PERIODS[number]>('7d');
  const [loading, setLoading] = useState(false);

  const fetchMetrics = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/agentic/profiles/${agentId}/metrics`, {
        params: { period },
      });
      setMetrics(data);
    } catch (err) {
      console.error('Failed to load metrics:', err);
    } finally {
      setLoading(false);
    }
  }, [agentId, period]);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  if (loading && !metrics) {
    return (
      <div className="p-6 text-center text-gray-500">
        <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />
        Loading metrics...
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="p-6 text-center text-gray-500">
        <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p>No metrics data available.</p>
      </div>
    );
  }

  const pieData = [
    { name: 'Success', value: metrics.toolSuccessRate },
    { name: 'Failure', value: 100 - metrics.toolSuccessRate },
  ];

  return (
    <div className="space-y-4">
      {/* Period toggle */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 bg-gray-900 rounded-lg p-1">
          {PERIODS.map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                period === p ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
        <button
          onClick={fetchMetrics}
          className="text-xs text-gray-500 hover:text-gray-400 flex items-center gap-1"
          disabled={loading}
        >
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* Row 1: Stat cards */}
      <div className="grid grid-cols-4 gap-2">
        <StatCard
          label="Cycles" value={metrics.totalCycles}
          icon={<Activity className="w-3 h-3" />}
        />
        <StatCard
          label="Avg Iter" value={metrics.avgIterations}
          icon={<Brain className="w-3 h-3" />}
        />
        <StatCard
          label="Tokens" value={metrics.totalTokens.toLocaleString()}
          icon={<Zap className="w-3 h-3" />}
        />
        <StatCard
          label="Recovery" value={`${metrics.recoveryRate}%`}
          icon={<Shield className="w-3 h-3" />}
          color={metrics.recoveryRate > 50 ? 'text-green-400' : 'text-yellow-400'}
        />
      </div>

      {/* Row 2: Charts */}
      <div className="grid grid-cols-2 gap-3">
        {/* Tool Success Rate Pie */}
        <div className="bg-gray-900 rounded-lg p-3">
          <div className="text-xs text-gray-500 mb-2">Tool Success Rate</div>
          <ResponsiveContainer width="100%" height={120}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%" cy="50%"
                innerRadius={30} outerRadius={50}
                dataKey="value"
                strokeWidth={0}
              >
                <Cell fill="#10b981" />
                <Cell fill="#374151" />
              </Pie>
              <Tooltip
                contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px', fontSize: '12px' }}
                formatter={(value: number) => [`${value}%`]}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="text-center text-lg font-bold text-green-400">{metrics.toolSuccessRate}%</div>
        </div>

        {/* Daily Activity Line */}
        <div className="bg-gray-900 rounded-lg p-3">
          <div className="text-xs text-gray-500 mb-2">Daily Activity</div>
          {metrics.dailyActivity.length > 0 ? (
            <ResponsiveContainer width="100%" height={140}>
              <LineChart data={metrics.dailyActivity}>
                <XAxis
                  dataKey="date" tick={{ fontSize: 10, fill: '#6b7280' }}
                  tickFormatter={(d: string) => d.substring(5)}
                />
                <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} width={25} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px', fontSize: '12px' }}
                />
                <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[140px] flex items-center justify-center text-gray-600 text-xs">
              No activity in this period
            </div>
          )}
        </div>
      </div>

      {/* Row 3: Skills + Collaboration */}
      <div className="grid grid-cols-2 gap-3">
        {/* Skill Levels Bar */}
        <div className="bg-gray-900 rounded-lg p-3">
          <div className="text-xs text-gray-500 mb-2">Skill Levels</div>
          {metrics.skillLevels.length > 0 ? (
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={metrics.skillLevels.slice(0, 8)} layout="vertical">
                <XAxis type="number" domain={[0, 4]} tick={{ fontSize: 10, fill: '#6b7280' }} />
                <YAxis
                  type="category" dataKey="name" width={80}
                  tick={{ fontSize: 9, fill: '#9ca3af' }}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px', fontSize: '12px' }}
                  formatter={(value: number) => [`Level ${value}`]}
                />
                <Bar dataKey="level" radius={[0, 4, 4, 0]}>
                  {metrics.skillLevels.slice(0, 8).map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[140px] flex items-center justify-center text-gray-600 text-xs">
              No skills acquired
            </div>
          )}
        </div>

        {/* Collaboration stat */}
        <div className="bg-gray-900 rounded-lg p-3 flex flex-col items-center justify-center">
          <Users className="w-8 h-8 text-purple-400 mb-2" />
          <div className="text-2xl font-bold text-white">{metrics.collaborationCount}</div>
          <div className="text-xs text-gray-500">Collaborations</div>
          <div className="text-[10px] text-gray-600 mt-1">in the last {period}</div>
        </div>
      </div>
    </div>
  );
};

export default MetricsDashboard;
