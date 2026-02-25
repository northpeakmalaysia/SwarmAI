import { create } from 'zustand';
import api from '../services/api';
import { Subscription, SubscriptionPlan, Payment } from '../types';
import { extractErrorMessage } from '../lib/utils';

/**
 * Checkout session response from Stripe
 */
interface CheckoutSession {
  sessionId: string;
  url: string;
}

/**
 * Subscription Store State Interface
 * Manages subscription state and Stripe integration
 */
interface SubscriptionStoreState {
  // State
  subscription: Subscription | null;
  payments: Payment[];
  loading: boolean;
  error: string | null;

  // Subscription Actions
  fetchSubscription: () => Promise<void>;
  createCheckoutSession: (plan: SubscriptionPlan) => Promise<CheckoutSession>;
  cancelSubscription: () => Promise<void>;
  resumeSubscription: () => Promise<void>;
  addAgentSlot: (quantity?: number) => Promise<void>;
  updatePlan: (plan: SubscriptionPlan) => Promise<void>;

  // Payment Actions
  fetchPaymentHistory: () => Promise<void>;

  // Billing Portal
  openBillingPortal: () => Promise<string>;

  // Utility Actions
  clearError: () => void;
  checkFeatureAccess: (feature: keyof Subscription['features']) => boolean;
  getUsagePercentage: (resource: keyof Subscription['usage']) => number;
}

export const useSubscriptionStore = create<SubscriptionStoreState>((set, get) => ({
  // Initial State
  subscription: null,
  payments: [],
  loading: false,
  error: null,

  /**
   * Fetch the current user's subscription
   */
  fetchSubscription: async () => {
    set({ loading: true, error: null });
    try {
      const response = await api.get('/subscription');
      // Backend wraps the response in { subscription: ... }
      set({ subscription: response.data.subscription || response.data, loading: false });
    } catch (error: unknown) {
      set({ error: extractErrorMessage(error, 'Failed to fetch subscription'), loading: false });
    }
  },

  /**
   * Create a Stripe checkout session for a new subscription
   * Returns the session URL to redirect the user to
   */
  createCheckoutSession: async (plan) => {
    set({ loading: true, error: null });
    try {
      const response = await api.post('/subscription/checkout', { plan });
      set({ loading: false });
      return response.data as CheckoutSession;
    } catch (error: unknown) {
      set({ error: extractErrorMessage(error, 'Failed to create checkout session'), loading: false });
      throw error;
    }
  },

  /**
   * Cancel the current subscription
   * Subscription will remain active until the end of the billing period
   */
  cancelSubscription: async () => {
    set({ loading: true, error: null });
    try {
      const response = await api.post('/subscription/cancel');
      set({
        subscription: response.data,
        loading: false,
      });
    } catch (error: unknown) {
      set({ error: extractErrorMessage(error, 'Failed to cancel subscription'), loading: false });
      throw error;
    }
  },

  /**
   * Resume a cancelled subscription before the period ends
   */
  resumeSubscription: async () => {
    set({ loading: true, error: null });
    try {
      const response = await api.post('/subscription/resume');
      set({
        subscription: response.data,
        loading: false,
      });
    } catch (error: unknown) {
      set({ error: extractErrorMessage(error, 'Failed to resume subscription'), loading: false });
      throw error;
    }
  },

  /**
   * Add additional agent slots to the subscription
   */
  addAgentSlot: async (quantity = 1) => {
    set({ loading: true, error: null });
    try {
      const response = await api.post('/subscription/add-agent-slot', { quantity });
      set({
        subscription: response.data,
        loading: false,
      });
    } catch (error: unknown) {
      set({ error: extractErrorMessage(error, 'Failed to add agent slot'), loading: false });
      throw error;
    }
  },

  /**
   * Upgrade or downgrade the subscription plan
   */
  updatePlan: async (plan) => {
    set({ loading: true, error: null });
    try {
      const response = await api.post('/subscription/update-plan', { plan });
      set({
        subscription: response.data,
        loading: false,
      });
    } catch (error: unknown) {
      set({ error: extractErrorMessage(error, 'Failed to update plan'), loading: false });
      throw error;
    }
  },

  /**
   * Fetch payment history for the subscription
   */
  fetchPaymentHistory: async () => {
    set({ loading: true, error: null });
    try {
      const response = await api.get('/subscription/payments');
      set({ payments: response.data, loading: false });
    } catch (error: unknown) {
      set({ error: extractErrorMessage(error, 'Failed to fetch payment history'), loading: false });
    }
  },

  /**
   * Open the Stripe billing portal
   * Returns the portal URL to redirect the user to
   */
  openBillingPortal: async () => {
    set({ loading: true, error: null });
    try {
      const response = await api.post('/subscription/billing-portal');
      set({ loading: false });
      return response.data.url as string;
    } catch (error: unknown) {
      set({ error: extractErrorMessage(error, 'Failed to open billing portal'), loading: false });
      throw error;
    }
  },

  /**
   * Clear any error state
   */
  clearError: () => set({ error: null }),

  /**
   * Check if the current subscription has access to a feature
   */
  checkFeatureAccess: (feature) => {
    const { subscription } = get();
    if (!subscription || !subscription.features) {
      return false;
    }

    const featureValue = subscription.features[feature];

    // Boolean features
    if (typeof featureValue === 'boolean') {
      return featureValue;
    }

    // Numeric features (check if limit allows usage)
    if (typeof featureValue === 'number') {
      return featureValue > 0;
    }

    return false;
  },

  /**
   * Get the usage percentage for a resource
   * Returns a value between 0 and 100
   */
  getUsagePercentage: (resource) => {
    const { subscription } = get();
    if (!subscription || !subscription.usage || !subscription.features) {
      return 0;
    }

    const currentUsage = subscription.usage[resource];

    // Map usage keys to feature limit keys
    const limitMap: Record<keyof Subscription['usage'], keyof Subscription['features']> = {
      agents: 'maxAgents',
      flows: 'maxFlows',
      messages: 'maxMessagesPerMonth',
      storage: 'maxStorageGb',
      aiTokens: 'aiTokensPerMonth',
      ragDocuments: 'ragDocuments',
    };

    const limitKey = limitMap[resource];
    const limit = subscription.features[limitKey] as number;

    if (!limit || limit === 0) {
      return 0;
    }

    return Math.min(100, Math.round((currentUsage / limit) * 100));
  },
}));
