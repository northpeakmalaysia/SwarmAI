import React, { useEffect } from 'react';
import {
  Bot,
  MessageSquare,
  Workflow,
  Database,
  Sparkles,
  HardDrive,
  AlertTriangle,
  TrendingUp,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import { useSubscriptionStore } from '../../stores/subscriptionStore';
import { Card, CardHeader, CardBody } from '../common/Card';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { cn } from '../../lib/utils';
import { Subscription } from '../../types';

/**
 * Usage key type - matches the subscription usage object keys
 */
type UsageKey = keyof Subscription['usage'];

/**
 * Feature limit key type - matches the subscription features object keys
 */
type FeatureKey = keyof Subscription['features'];

/**
 * Usage resource definition
 */
interface UsageResource {
  key: UsageKey;
  name: string;
  icon: React.ReactNode;
  limitKey: FeatureKey;
  formatValue?: (value: number) => string;
  unit?: string;
}

/**
 * Usage resources configuration
 */
const usageResources: UsageResource[] = [
  {
    key: 'agents',
    name: 'Agent Slots',
    icon: <Bot className="w-5 h-5" />,
    limitKey: 'maxAgents',
    unit: 'agents',
  },
  {
    key: 'messages',
    name: 'Messages This Month',
    icon: <MessageSquare className="w-5 h-5" />,
    limitKey: 'maxMessagesPerMonth',
    formatValue: (v) => v.toLocaleString(),
    unit: 'messages',
  },
  {
    key: 'flows',
    name: 'Active Flows',
    icon: <Workflow className="w-5 h-5" />,
    limitKey: 'maxFlows',
    unit: 'flows',
  },
  {
    key: 'ragDocuments',
    name: 'RAG Documents',
    icon: <Database className="w-5 h-5" />,
    limitKey: 'ragDocuments',
    unit: 'documents',
  },
  {
    key: 'aiTokens',
    name: 'AI Tokens Used',
    icon: <Sparkles className="w-5 h-5" />,
    limitKey: 'aiTokensPerMonth',
    formatValue: (v) => {
      if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
      if (v >= 1000) return `${(v / 1000).toFixed(1)}K`;
      return v.toString();
    },
    unit: 'tokens',
  },
  {
    key: 'storage',
    name: 'Storage Used',
    icon: <HardDrive className="w-5 h-5" />,
    limitKey: 'maxStorageGb',
    formatValue: (v) => {
      if (v >= 1) return `${v.toFixed(1)} GB`;
      return `${(v * 1024).toFixed(0)} MB`;
    },
    unit: 'GB',
  },
];

/**
 * Progress bar component
 */
interface ProgressBarProps {
  percentage: number;
  className?: string;
}

const ProgressBar: React.FC<ProgressBarProps> = ({ percentage, className }) => {
  const getColorClass = () => {
    if (percentage >= 90) return 'bg-red-500';
    if (percentage >= 75) return 'bg-amber-500';
    return 'bg-sky-500';
  };

  return (
    <div className={cn('h-2 bg-slate-700 rounded-full overflow-hidden', className)}>
      <div
        className={cn('h-full rounded-full transition-all duration-500', getColorClass())}
        style={{ width: `${Math.min(100, percentage)}%` }}
      />
    </div>
  );
};

/**
 * UsageStats Component
 *
 * Displays current resource usage against plan limits
 * with progress bars and warning indicators.
 */
export const UsageStats: React.FC = () => {
  const { subscription, loading, fetchSubscription, getUsagePercentage } = useSubscriptionStore();

  // Fetch subscription data on mount
  useEffect(() => {
    fetchSubscription();
  }, [fetchSubscription]);

  const getUsageValue = (resource: UsageResource): { used: number; limit: number | 'Unlimited' } => {
    if (!subscription) return { used: 0, limit: 0 };

    const used = subscription.usage?.[resource.key] ?? 0;
    const limitValue = subscription.features?.[resource.limitKey];

    // Check for unlimited (handle boolean and numeric cases)
    if (typeof limitValue === 'boolean') {
      return { used, limit: limitValue ? 'Unlimited' : 0 };
    }

    if (limitValue === -1 || limitValue === null || limitValue === undefined) {
      return { used, limit: 'Unlimited' };
    }

    return { used, limit: limitValue as number };
  };

  const formatLimit = (resource: UsageResource, limit: number | 'Unlimited'): string => {
    if (limit === 'Unlimited') return 'Unlimited';
    if (resource.formatValue) return resource.formatValue(limit);
    return limit.toLocaleString();
  };

  const formatUsed = (resource: UsageResource, used: number): string => {
    if (resource.formatValue) return resource.formatValue(used);
    return used.toLocaleString();
  };

  if (loading && !subscription) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-sky-500 animate-spin" />
      </div>
    );
  }

  // Calculate warnings
  const warnings = usageResources.filter((resource) => {
    const percentage = getUsagePercentage(resource.key);
    return percentage >= 75;
  });

  return (
    <div className="space-y-6">
      {/* Warning Banner */}
      {warnings.length > 0 && (
        <div className="p-4 bg-amber-500/10 rounded-lg border border-amber-500/30">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-amber-400 font-medium">
                Approaching usage limits
              </p>
              <p className="text-sm text-amber-300/80 mt-1">
                You are approaching or have exceeded limits on:{' '}
                {warnings.map((w) => w.name).join(', ')}.
                Consider upgrading your plan for increased capacity.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Overview Card */}
      <Card variant="pressed-glow" glowColor="sky">
        <CardHeader
          title="Usage Overview"
          subtitle="Current resource usage for this billing period"
          action={
            <Button
              variant="ghost"
              size="sm"
              icon={<RefreshCw className="w-4 h-4" />}
              onClick={() => fetchSubscription()}
              loading={loading}
            >
              Refresh
            </Button>
          }
        />
        <CardBody>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {usageResources.map((resource) => {
              const { used, limit } = getUsageValue(resource);
              const percentage = limit === 'Unlimited' ? 0 : getUsagePercentage(resource.key);
              const isWarning = percentage >= 75;
              const isCritical = percentage >= 90;

              return (
                <div
                  key={resource.key}
                  className={cn(
                    'p-4 rounded-lg border transition-colors',
                    isCritical
                      ? 'bg-red-500/5 border-red-500/30'
                      : isWarning
                      ? 'bg-amber-500/5 border-amber-500/30'
                      : 'bg-slate-800/50 border-slate-700'
                  )}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div
                        className={cn(
                          'w-8 h-8 rounded-lg flex items-center justify-center',
                          isCritical
                            ? 'bg-red-500/20 text-red-400'
                            : isWarning
                            ? 'bg-amber-500/20 text-amber-400'
                            : 'bg-slate-700 text-gray-400'
                        )}
                      >
                        {resource.icon}
                      </div>
                      <span className="text-gray-300 font-medium">{resource.name}</span>
                    </div>
                    {isCritical && (
                      <Badge variant="error" size="sm">
                        Critical
                      </Badge>
                    )}
                    {isWarning && !isCritical && (
                      <Badge variant="warning" size="sm">
                        Warning
                      </Badge>
                    )}
                  </div>

                  <div className="mb-2">
                    <span className="text-2xl font-bold text-white">
                      {formatUsed(resource, used)}
                    </span>
                    <span className="text-gray-400 ml-1">
                      / {formatLimit(resource, limit)}
                    </span>
                  </div>

                  {limit !== 'Unlimited' && (
                    <>
                      <ProgressBar percentage={percentage} />
                      <div className="flex justify-between mt-2 text-xs text-gray-500">
                        <span>{percentage}% used</span>
                        <span>
                          {(limit as number) - used > 0
                            ? `${formatUsed(resource, (limit as number) - used)} remaining`
                            : 'Limit reached'}
                        </span>
                      </div>
                    </>
                  )}

                  {limit === 'Unlimited' && (
                    <div className="text-sm text-emerald-400 flex items-center gap-1">
                      <TrendingUp className="w-4 h-4" />
                      No limit on your plan
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardBody>
      </Card>

      {/* Usage Details Card */}
      <Card variant="pressed">
        <CardHeader
          title="Detailed Usage"
          subtitle="Complete breakdown of your resource consumption"
        />
        <CardBody noPadding>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left py-3 px-4 text-gray-400 font-medium">Resource</th>
                  <th className="text-center py-3 px-4 text-gray-400 font-medium">Used</th>
                  <th className="text-center py-3 px-4 text-gray-400 font-medium">Limit</th>
                  <th className="text-center py-3 px-4 text-gray-400 font-medium">Usage</th>
                  <th className="text-center py-3 px-4 text-gray-400 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {usageResources.map((resource) => {
                  const { used, limit } = getUsageValue(resource);
                  const percentage = limit === 'Unlimited' ? 0 : getUsagePercentage(resource.key);
                  const isWarning = percentage >= 75;
                  const isCritical = percentage >= 90;

                  return (
                    <tr key={resource.key} className="border-b border-slate-700/50">
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-2">
                          <span className="text-gray-400">{resource.icon}</span>
                          <span className="text-white">{resource.name}</span>
                        </div>
                      </td>
                      <td className="text-center py-4 px-4 text-white font-medium">
                        {formatUsed(resource, used)}
                      </td>
                      <td className="text-center py-4 px-4 text-gray-300">
                        {formatLimit(resource, limit)}
                      </td>
                      <td className="text-center py-4 px-4">
                        {limit === 'Unlimited' ? (
                          <span className="text-emerald-400">N/A</span>
                        ) : (
                          <div className="flex items-center justify-center gap-2">
                            <div className="w-24">
                              <ProgressBar percentage={percentage} />
                            </div>
                            <span className="text-gray-400 text-sm w-12">{percentage}%</span>
                          </div>
                        )}
                      </td>
                      <td className="text-center py-4 px-4">
                        {limit === 'Unlimited' ? (
                          <Badge variant="success" size="sm">Unlimited</Badge>
                        ) : isCritical ? (
                          <Badge variant="error" size="sm">Critical</Badge>
                        ) : isWarning ? (
                          <Badge variant="warning" size="sm">Warning</Badge>
                        ) : (
                          <Badge variant="success" size="sm">OK</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      {/* Tips Card */}
      <Card variant="pressed">
        <CardHeader title="Tips for Managing Usage" />
        <CardBody>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-start gap-3 p-3 bg-slate-800/50 rounded-lg">
              <div className="w-8 h-8 rounded-lg bg-sky-500/20 flex items-center justify-center text-sky-400 flex-shrink-0">
                <Bot className="w-4 h-4" />
              </div>
              <div>
                <p className="text-white font-medium text-sm">Optimize Agent Usage</p>
                <p className="text-gray-400 text-xs mt-1">
                  Deactivate unused agents to free up slots for new ones.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 bg-slate-800/50 rounded-lg">
              <div className="w-8 h-8 rounded-lg bg-sky-500/20 flex items-center justify-center text-sky-400 flex-shrink-0">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <p className="text-white font-medium text-sm">Reduce Token Usage</p>
                <p className="text-gray-400 text-xs mt-1">
                  Use shorter system prompts and enable RAG to reduce AI token consumption.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 bg-slate-800/50 rounded-lg">
              <div className="w-8 h-8 rounded-lg bg-sky-500/20 flex items-center justify-center text-sky-400 flex-shrink-0">
                <Database className="w-4 h-4" />
              </div>
              <div>
                <p className="text-white font-medium text-sm">Manage RAG Documents</p>
                <p className="text-gray-400 text-xs mt-1">
                  Remove outdated documents and consolidate similar content.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 bg-slate-800/50 rounded-lg">
              <div className="w-8 h-8 rounded-lg bg-sky-500/20 flex items-center justify-center text-sky-400 flex-shrink-0">
                <TrendingUp className="w-4 h-4" />
              </div>
              <div>
                <p className="text-white font-medium text-sm">Upgrade for More</p>
                <p className="text-gray-400 text-xs mt-1">
                  Need more capacity? Upgrade your plan for increased limits.
                </p>
              </div>
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
};

export default UsageStats;
