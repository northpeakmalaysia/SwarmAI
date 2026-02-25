import React, { useState } from 'react';
import {
  Check,
  X,
  Zap,
  Users,
  MessageSquare,
  Database,
  Bot,
  Workflow,
  Sparkles,
  Shield,
  Headphones,
  ArrowRight,
  Loader2,
} from 'lucide-react';
import { useSubscriptionStore } from '../../stores/subscriptionStore';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { cn } from '../../lib/utils';
import toast from 'react-hot-toast';
import { SubscriptionPlan } from '../../types';

/**
 * Plan feature definition
 */
interface PlanFeature {
  name: string;
  icon: React.ReactNode;
  free: string | number | boolean;
  starter: string | number | boolean;
  pro: string | number | boolean;
  enterprise: string | number | boolean;
}

/**
 * Plan pricing definition
 */
interface PlanPricing {
  plan: SubscriptionPlan;
  name: string;
  price: string;
  priceDetail: string;
  description: string;
  highlighted?: boolean;
  badge?: string;
}

/**
 * Feature comparison data
 */
const features: PlanFeature[] = [
  {
    name: 'AI Agents',
    icon: <Bot className="w-4 h-4" />,
    free: 2,
    starter: 5,
    pro: 10,
    enterprise: 'Unlimited',
  },
  {
    name: 'Messages per Month',
    icon: <MessageSquare className="w-4 h-4" />,
    free: '1,000',
    starter: '5,000',
    pro: '10,000',
    enterprise: 'Unlimited',
  },
  {
    name: 'Flows',
    icon: <Workflow className="w-4 h-4" />,
    free: 3,
    starter: 10,
    pro: 'Unlimited',
    enterprise: 'Unlimited',
  },
  {
    name: 'RAG Documents',
    icon: <Database className="w-4 h-4" />,
    free: 10,
    starter: 50,
    pro: 500,
    enterprise: 'Unlimited',
  },
  {
    name: 'AI Tokens per Month',
    icon: <Sparkles className="w-4 h-4" />,
    free: '10K',
    starter: '100K',
    pro: '1M',
    enterprise: 'Unlimited',
  },
  {
    name: 'Swarm Collaboration',
    icon: <Users className="w-4 h-4" />,
    free: false,
    starter: true,
    pro: true,
    enterprise: true,
  },
  {
    name: 'API Access',
    icon: <Zap className="w-4 h-4" />,
    free: false,
    starter: true,
    pro: true,
    enterprise: true,
  },
  {
    name: 'Custom Branding',
    icon: <Sparkles className="w-4 h-4" />,
    free: false,
    starter: false,
    pro: true,
    enterprise: true,
  },
  {
    name: 'SSO',
    icon: <Shield className="w-4 h-4" />,
    free: false,
    starter: false,
    pro: false,
    enterprise: true,
  },
  {
    name: 'Priority Support',
    icon: <Headphones className="w-4 h-4" />,
    free: false,
    starter: false,
    pro: true,
    enterprise: true,
  },
];

/**
 * Plan pricing data
 */
const plans: PlanPricing[] = [
  {
    plan: 'free',
    name: 'Free',
    price: '$0',
    priceDetail: 'forever',
    description: 'Perfect for getting started',
  },
  {
    plan: 'starter',
    name: 'Starter',
    price: '$19',
    priceDetail: '/month',
    description: 'For small teams',
  },
  {
    plan: 'pro',
    name: 'Pro',
    price: '$49',
    priceDetail: '/month',
    description: 'For growing businesses',
    highlighted: true,
    badge: 'Most Popular',
  },
  {
    plan: 'enterprise',
    name: 'Enterprise',
    price: 'Custom',
    priceDetail: 'Contact us',
    description: 'For large organizations',
  },
];

/**
 * Props for PlanComparison component
 */
interface PlanComparisonProps {
  currentPlan?: SubscriptionPlan;
  onSelectPlan?: (plan: SubscriptionPlan) => void;
}

/**
 * PlanComparison Component
 *
 * Displays a feature comparison table for all subscription plans
 * with upgrade/downgrade functionality.
 */
export const PlanComparison: React.FC<PlanComparisonProps> = ({
  currentPlan = 'free',
  onSelectPlan,
}) => {
  const { createCheckoutSession, updatePlan } = useSubscriptionStore();
  const [loadingPlan, setLoadingPlan] = useState<SubscriptionPlan | null>(null);

  const handleSelectPlan = async (plan: SubscriptionPlan) => {
    if (plan === currentPlan) return;

    setLoadingPlan(plan);
    try {
      if (plan === 'free') {
        // Downgrade to free
        await updatePlan(plan);
        toast.success('Plan updated to Free');
        onSelectPlan?.(plan);
      } else if (plan === 'enterprise') {
        // Redirect to contact page for enterprise
        window.open('/contact?plan=enterprise', '_blank');
        onSelectPlan?.(plan);
      } else {
        // Create checkout session for paid plans
        const session = await createCheckoutSession(plan);
        // Redirect to Stripe checkout
        window.location.href = session.url;
      }
    } catch (error) {
      console.error('Plan selection error:', error);
      toast.error('Failed to update plan');
    } finally {
      setLoadingPlan(null);
    }
  };

  const getFeatureValue = (value: string | number | boolean) => {
    if (typeof value === 'boolean') {
      return value ? (
        <Check className="w-5 h-5 text-emerald-400" />
      ) : (
        <X className="w-5 h-5 text-gray-600" />
      );
    }
    return <span className="text-white font-medium">{value}</span>;
  };

  const getPlanButtonText = (plan: SubscriptionPlan) => {
    if (plan === currentPlan) return 'Current Plan';
    if (plan === 'enterprise') return 'Contact Sales';
    if (plans.findIndex(p => p.plan === plan) < plans.findIndex(p => p.plan === currentPlan)) {
      return 'Downgrade';
    }
    return 'Upgrade';
  };

  const getPlanButtonVariant = (plan: SubscriptionPlan): 'primary' | 'secondary' | 'outline' | 'ghost' => {
    if (plan === currentPlan) return 'ghost';
    if (plan === 'pro') return 'primary';
    return 'outline';
  };

  return (
    <div className="space-y-8">
      {/* Plan Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {plans.map((planInfo) => (
          <div
            key={planInfo.plan}
            className={cn(
              'relative rounded-xl p-6 transition-all duration-200',
              planInfo.highlighted
                ? 'bg-gradient-to-b from-sky-500/20 to-slate-800 border-2 border-sky-500'
                : 'bg-slate-800 border border-slate-700',
              currentPlan === planInfo.plan && 'ring-2 ring-emerald-500'
            )}
          >
            {/* Badge */}
            {planInfo.badge && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <Badge variant="info" className="whitespace-nowrap">
                  {planInfo.badge}
                </Badge>
              </div>
            )}

            {/* Current Plan Indicator */}
            {currentPlan === planInfo.plan && (
              <div className="absolute top-4 right-4">
                <Badge variant="success" size="sm">
                  Current
                </Badge>
              </div>
            )}

            <div className="text-center mb-6">
              <h3 className="text-lg font-bold text-white mb-1">{planInfo.name}</h3>
              <p className="text-sm text-gray-400">{planInfo.description}</p>
              <div className="mt-4">
                <span className="text-3xl font-bold text-white">{planInfo.price}</span>
                <span className="text-gray-400 ml-1">{planInfo.priceDetail}</span>
              </div>
            </div>

            <Button
              variant={getPlanButtonVariant(planInfo.plan)}
              fullWidth
              onClick={() => handleSelectPlan(planInfo.plan)}
              loading={loadingPlan === planInfo.plan}
              disabled={planInfo.plan === currentPlan || loadingPlan !== null}
              icon={planInfo.plan !== currentPlan && planInfo.plan !== 'enterprise' ? (
                <ArrowRight className="w-4 h-4" />
              ) : undefined}
            >
              {loadingPlan === planInfo.plan ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                getPlanButtonText(planInfo.plan)
              )}
            </Button>
          </div>
        ))}
      </div>

      {/* Feature Comparison Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-700">
              <th className="text-left py-4 px-4 text-gray-400 font-medium">Features</th>
              {plans.map((planInfo) => (
                <th
                  key={planInfo.plan}
                  className={cn(
                    'text-center py-4 px-4',
                    currentPlan === planInfo.plan ? 'text-emerald-400' : 'text-white'
                  )}
                >
                  {planInfo.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {features.map((feature, index) => (
              <tr
                key={feature.name}
                className={cn(
                  'border-b border-slate-700/50',
                  index % 2 === 0 ? 'bg-slate-800/30' : ''
                )}
              >
                <td className="py-4 px-4">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400">{feature.icon}</span>
                    <span className="text-gray-300">{feature.name}</span>
                  </div>
                </td>
                <td className="text-center py-4 px-4">{getFeatureValue(feature.free)}</td>
                <td className="text-center py-4 px-4">{getFeatureValue(feature.starter)}</td>
                <td className={cn(
                  'text-center py-4 px-4',
                  currentPlan === 'pro' && 'bg-emerald-500/5'
                )}>
                  {getFeatureValue(feature.pro)}
                </td>
                <td className="text-center py-4 px-4">{getFeatureValue(feature.enterprise)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Enterprise CTA */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-800/50 rounded-xl p-6 border border-slate-700">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div>
            <h4 className="text-lg font-semibold text-white">Need a custom solution?</h4>
            <p className="text-gray-400 mt-1">
              Contact our sales team for Enterprise pricing and custom features.
            </p>
          </div>
          <Button
            variant="outline"
            icon={<ArrowRight className="w-4 h-4" />}
            onClick={() => window.open('/contact?plan=enterprise', '_blank')}
          >
            Contact Sales
          </Button>
        </div>
      </div>
    </div>
  );
};

export default PlanComparison;
