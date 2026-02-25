import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  Calendar,
  ExternalLink,
  AlertTriangle,
  CheckCircle,
  ArrowUpRight,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { useSubscriptionStore } from '../../stores/subscriptionStore';
import { Card, CardHeader, CardBody, CardFooter } from '../common/Card';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { Modal } from '../common/Modal';
import { cn } from '../../lib/utils';
import toast from 'react-hot-toast';
import { SubscriptionPlan, SubscriptionStatus } from '../../types';
import PlanComparison from './PlanComparison';
import { formatDate } from '@/utils/dateFormat';

/**
 * Get plan display name
 */
const getPlanDisplayName = (plan: SubscriptionPlan): string => {
  const names: Record<SubscriptionPlan, string> = {
    free: 'Free',
    starter: 'Starter',
    pro: 'Pro',
    enterprise: 'Enterprise',
  };
  return names[plan] || plan;
};

/**
 * Get status badge variant
 */
const getStatusVariant = (status: SubscriptionStatus): 'success' | 'warning' | 'error' | 'info' => {
  const variants: Record<SubscriptionStatus, 'success' | 'warning' | 'error' | 'info'> = {
    active: 'success',
    trialing: 'info',
    past_due: 'warning',
    cancelled: 'error',
    paused: 'warning',
  };
  return variants[status] || 'info';
};

/**
 * Get plan badge variant
 */
const getPlanVariant = (plan: SubscriptionPlan): 'success' | 'warning' | 'info' | 'default' => {
  const variants: Record<SubscriptionPlan, 'success' | 'warning' | 'info' | 'default'> = {
    free: 'default',
    starter: 'info',
    pro: 'success',
    enterprise: 'warning',
  };
  return variants[plan] || 'default';
};

/**
 * SubscriptionSettings Component
 *
 * Displays and manages user subscription including current plan,
 * billing information, and upgrade/downgrade options.
 */
export const SubscriptionSettings: React.FC = () => {
  const {
    subscription,
    loading,
    error,
    fetchSubscription,
    cancelSubscription,
    resumeSubscription,
    openBillingPortal,
    clearError,
  } = useSubscriptionStore();

  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [resumeLoading, setResumeLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);

  // Fetch subscription on mount
  useEffect(() => {
    fetchSubscription();
  }, [fetchSubscription]);

  // Clear error on unmount
  useEffect(() => {
    return () => clearError();
  }, [clearError]);

  const handleCancelSubscription = async () => {
    setCancelLoading(true);
    try {
      await cancelSubscription();
      toast.success('Subscription cancelled. You will retain access until the end of your billing period.');
      setShowCancelModal(false);
    } catch (err) {
      console.error('Cancel subscription error:', err);
      toast.error('Failed to cancel subscription');
    } finally {
      setCancelLoading(false);
    }
  };

  const handleResumeSubscription = async () => {
    setResumeLoading(true);
    try {
      await resumeSubscription();
      toast.success('Subscription resumed successfully');
    } catch (err) {
      console.error('Resume subscription error:', err);
      toast.error('Failed to resume subscription');
    } finally {
      setResumeLoading(false);
    }
  };

  const handleOpenBillingPortal = async () => {
    setPortalLoading(true);
    try {
      const url = await openBillingPortal();
      window.open(url, '_blank');
    } catch (err) {
      console.error('Open billing portal error:', err);
      toast.error('Failed to open billing portal');
    } finally {
      setPortalLoading(false);
    }
  };

  if (loading && !subscription) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-sky-500 animate-spin" />
      </div>
    );
  }

  if (error && !subscription) {
    return (
      <div className="text-center py-12">
        <AlertTriangle className="w-12 h-12 text-amber-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-white mb-2">Failed to load subscription</h3>
        <p className="text-gray-400 mb-4">{error}</p>
        <Button variant="primary" onClick={fetchSubscription}>
          Try Again
        </Button>
      </div>
    );
  }

  const isCancelledButActive = subscription?.cancelAtPeriodEnd && subscription?.status === 'active';

  return (
    <div className="space-y-6">
      {/* Current Plan */}
      <Card>
        <CardHeader title="Current Plan" subtitle="Your active subscription details" />
        <CardBody>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={cn(
                'w-14 h-14 rounded-xl flex items-center justify-center',
                subscription?.plan === 'enterprise' ? 'bg-amber-500/20' :
                subscription?.plan === 'pro' ? 'bg-emerald-500/20' :
                subscription?.plan === 'starter' ? 'bg-sky-500/20' :
                'bg-slate-700'
              )}>
                <CreditCard className={cn(
                  'w-7 h-7',
                  subscription?.plan === 'enterprise' ? 'text-amber-400' :
                  subscription?.plan === 'pro' ? 'text-emerald-400' :
                  subscription?.plan === 'starter' ? 'text-sky-400' :
                  'text-gray-400'
                )} />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">
                  {getPlanDisplayName(subscription?.plan || 'free')} Plan
                </h3>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant={getStatusVariant(subscription?.status || 'active')}>
                    {subscription?.status?.replace('_', ' ').toUpperCase() || 'ACTIVE'}
                  </Badge>
                  {subscription?.trialEnd && new Date(subscription.trialEnd) > new Date() && (
                    <Badge variant="info" size="sm">
                      Trial ends {formatDate(subscription.trialEnd)}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
            <Badge
              variant={getPlanVariant(subscription?.plan || 'free')}
              size="md"
              className="text-lg px-4 py-2"
            >
              {getPlanDisplayName(subscription?.plan || 'free').toUpperCase()}
            </Badge>
          </div>

          {/* Cancellation Warning */}
          {isCancelledButActive && (
            <div className="mt-4 p-4 bg-amber-500/10 rounded-lg flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-amber-400 font-medium">
                  Your subscription is scheduled to cancel
                </p>
                <p className="text-sm text-amber-300/80 mt-1">
                  You will retain access until {formatDate(subscription?.currentPeriodEnd)}.
                  After that, your plan will be downgraded to Free.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  icon={<RefreshCw className="w-4 h-4" />}
                  onClick={handleResumeSubscription}
                  loading={resumeLoading}
                >
                  Resume Subscription
                </Button>
              </div>
            </div>
          )}

          {/* Agent Slots */}
          {subscription?.agentSlots && subscription.agentSlots > 0 && (
            <div className="mt-4 p-4 bg-slate-700/50 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white font-medium">Additional Agent Slots</p>
                  <p className="text-sm text-gray-400">
                    {subscription.agentSlots} extra slots added to your plan
                  </p>
                </div>
                <Badge variant="info">{subscription.agentSlots} slots</Badge>
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Billing Information */}
      <Card>
        <CardHeader title="Billing Information" subtitle="Manage your payment and billing details" />
        <CardBody>
          <div className="space-y-4">
            <div className="flex items-center justify-between py-3 border-b border-slate-700">
              <div className="flex items-center gap-3">
                <Calendar className="w-5 h-5 text-gray-400" />
                <span className="text-gray-300">Current Period</span>
              </div>
              <span className="text-white font-medium">
                {formatDate(subscription?.currentPeriodStart)} - {formatDate(subscription?.currentPeriodEnd)}
              </span>
            </div>

            <div className="flex items-center justify-between py-3 border-b border-slate-700">
              <div className="flex items-center gap-3">
                <Calendar className="w-5 h-5 text-gray-400" />
                <span className="text-gray-300">Next Billing Date</span>
              </div>
              <span className="text-white font-medium">
                {isCancelledButActive ? 'Cancelled' : formatDate(subscription?.currentPeriodEnd)}
              </span>
            </div>

            {subscription?.stripeSubscriptionId && (
              <div className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <CreditCard className="w-5 h-5 text-gray-400" />
                  <span className="text-gray-300">Payment Method</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  icon={<ExternalLink className="w-4 h-4" />}
                  onClick={handleOpenBillingPortal}
                  loading={portalLoading}
                >
                  Manage Billing
                </Button>
              </div>
            )}
          </div>
        </CardBody>
      </Card>

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        {subscription?.plan !== 'enterprise' && (
          <Button
            variant="primary"
            icon={<ArrowUpRight className="w-4 h-4" />}
            onClick={() => setShowUpgradeModal(true)}
          >
            Upgrade Plan
          </Button>
        )}

        {subscription?.stripeSubscriptionId && (
          <Button
            variant="outline"
            icon={<ExternalLink className="w-4 h-4" />}
            onClick={handleOpenBillingPortal}
            loading={portalLoading}
          >
            Payment History
          </Button>
        )}

        {subscription?.plan !== 'free' && !isCancelledButActive && (
          <Button
            variant="ghost"
            className="text-red-400 hover:text-red-300"
            onClick={() => setShowCancelModal(true)}
          >
            Cancel Subscription
          </Button>
        )}
      </div>

      {/* Cancel Confirmation Modal */}
      <Modal
        open={showCancelModal}
        onClose={() => setShowCancelModal(false)}
        title="Cancel Subscription"
        size="md"
      >
        <div className="space-y-4">
          <div className="p-4 bg-amber-500/10 rounded-lg flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-amber-400 font-medium">Are you sure you want to cancel?</p>
              <p className="text-sm text-amber-300/80 mt-1">
                You will retain access to your current plan features until{' '}
                {formatDate(subscription?.currentPeriodEnd)}. After that:
              </p>
            </div>
          </div>

          <ul className="space-y-2 text-gray-300 ml-4">
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
              Your plan will be downgraded to Free
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
              You may lose access to premium features
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
              Agent slots exceeding the Free limit will be deactivated
            </li>
          </ul>

          <div className="flex gap-3 mt-6">
            <Button
              variant="ghost"
              fullWidth
              onClick={() => setShowCancelModal(false)}
            >
              Keep Subscription
            </Button>
            <Button
              variant="danger"
              fullWidth
              onClick={handleCancelSubscription}
              loading={cancelLoading}
            >
              Cancel Subscription
            </Button>
          </div>
        </div>
      </Modal>

      {/* Upgrade Modal */}
      <Modal
        open={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        title="Upgrade Your Plan"
        size="xl"
      >
        <PlanComparison
          currentPlan={subscription?.plan || 'free'}
          onSelectPlan={() => setShowUpgradeModal(false)}
        />
      </Modal>
    </div>
  );
};

export default SubscriptionSettings;
