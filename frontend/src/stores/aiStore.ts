import { create } from 'zustand';
import api from '../services/api';
import { extractErrorMessage } from '../lib/utils';
import { AIProvider, AIUsage, AIUsageSummary } from '../types';

/**
 * Model from OpenRouter API
 */
export interface AIModel {
  id: string;
  name: string;
  provider: string;
  contextLength?: number;
  modality?: string;
  isFree?: boolean;
  pricingPrompt?: number;
  pricingCompletion?: number;
}

/**
 * Model provider info
 */
export interface ModelProvider {
  provider: string;
  modelCount: number;
}

/**
 * AI Store State Interface
 * Manages AI providers, models and usage tracking
 */
interface AIStoreState {
  // State
  providers: AIProvider[];
  models: AIModel[];
  modelProviders: ModelProvider[];
  modelsLoading: boolean;
  modelsLoaded: boolean;
  providersLoading: boolean;
  providersLoaded: boolean;
  usage: AIUsage[];
  usageSummary: AIUsageSummary | null;
  loading: boolean;
  error: string | null;

  // Provider Actions
  fetchProviders: () => Promise<void>;
  addProvider: (provider: Omit<AIProvider, 'id' | 'userId' | 'budgetUsed' | 'createdAt' | 'updatedAt'>) => Promise<AIProvider>;
  updateProvider: (id: string, updates: Partial<AIProvider>) => Promise<AIProvider>;
  deleteProvider: (id: string) => Promise<void>;
  testProvider: (id: string) => Promise<boolean>;
  syncCLIProvider: (id: string) => Promise<{ success: boolean; authenticated: boolean; models: string[]; message: string }>;
  setDefaultProvider: (id: string) => Promise<void>;

  // Model Actions
  fetchModels: () => Promise<void>;
  fetchModelProviders: () => Promise<void>;

  // Usage Actions
  fetchUsage: (startDate: string, endDate: string) => Promise<void>;
  fetchUsageSummary: (startDate: string, endDate: string) => Promise<void>;

  // Utility Actions
  clearError: () => void;
}

export const useAIStore = create<AIStoreState>((set, get) => ({
  // Initial State
  providers: [],
  models: [],
  modelProviders: [],
  modelsLoading: false,
  modelsLoaded: false,
  providersLoading: false,
  providersLoaded: false,
  usage: [],
  usageSummary: null,
  loading: false,
  error: null,

  /**
   * Fetch all AI providers for the current user
   */
  fetchProviders: async () => {
    set({ loading: true, error: null });
    try {
      const response = await api.get('/ai/providers');
      // Backend returns { providers: [...] }
      const providers = response.data?.providers || response.data?.data || [];
      set({ providers: Array.isArray(providers) ? providers : [], loading: false });
    } catch (error: unknown) {
      const message = extractErrorMessage(error, 'Failed to fetch providers');
      set({ error: message, loading: false, providers: [] });
    }
  },

  /**
   * Add a new AI provider
   */
  addProvider: async (providerData) => {
    set({ loading: true, error: null });
    try {
      const response = await api.post('/ai/providers', providerData);
      // Backend returns { provider: {...} }
      const newProvider = response.data?.provider || response.data?.data || response.data;
      set((state) => ({
        providers: [...state.providers, newProvider],
        loading: false,
      }));
      return newProvider;
    } catch (error: unknown) {
      const message = extractErrorMessage(error, 'Failed to add provider');
      set({ error: message, loading: false });
      throw error;
    }
  },

  /**
   * Update an existing AI provider
   */
  updateProvider: async (id, updates) => {
    set({ loading: true, error: null });
    try {
      const response = await api.put(`/ai/providers/${id}`, updates);
      // Backend returns { provider: {...} }
      const updatedProvider = response.data?.provider || response.data?.data || response.data;
      set((state) => ({
        providers: state.providers.map((p) => (p.id === id ? updatedProvider : p)),
        loading: false,
      }));
      return updatedProvider;
    } catch (error: unknown) {
      const message = extractErrorMessage(error, 'Failed to update provider');
      set({ error: message, loading: false });
      throw error;
    }
  },

  /**
   * Delete an AI provider
   */
  deleteProvider: async (id) => {
    set({ loading: true, error: null });
    try {
      await api.delete(`/ai/providers/${id}`);
      set((state) => ({
        providers: state.providers.filter((p) => p.id !== id),
        loading: false,
      }));
    } catch (error: unknown) {
      const message = extractErrorMessage(error, 'Failed to delete provider');
      set({ error: message, loading: false });
      throw error;
    }
  },

  /**
   * Test an AI provider connection
   * Returns true if the provider is working correctly
   * Also refreshes the provider list to get auto-discovered models
   */
  testProvider: async (id) => {
    set({ loading: true, error: null });
    try {
      const response = await api.post(`/ai/providers/${id}/test`);
      const success = response.data.success === true;

      // If test succeeded, refresh providers to get updated models
      if (success) {
        const providersResponse = await api.get('/ai/providers');
        set({
          providers: providersResponse.data?.providers || providersResponse.data || [],
          loading: false,
        });
      } else {
        set({ loading: false });
      }

      return success;
    } catch (error: unknown) {
      const message = extractErrorMessage(error, 'Provider test failed');
      set({ error: message, loading: false });
      return false;
    }
  },

  /**
   * Sync CLI provider - verifies auth and discovers models
   * Returns detailed info about CLI state and discovered models
   */
  syncCLIProvider: async (id) => {
    set({ loading: true, error: null });
    try {
      const response = await api.post(`/ai/providers/${id}/test`);
      const { success, authenticated, models = [], message, modelCount } = response.data;

      // Refresh providers to get updated models
      const providersResponse = await api.get('/ai/providers');
      set({
        providers: providersResponse.data?.providers || providersResponse.data || [],
        loading: false,
      });

      return {
        success: success === true,
        authenticated: authenticated === true,
        models: models || [],
        message: message || (success ? `Synced ${modelCount || 0} models` : 'Sync failed'),
      };
    } catch (error: unknown) {
      const message = extractErrorMessage(error, 'CLI sync failed');
      set({ error: message, loading: false });
      return {
        success: false,
        authenticated: false,
        models: [],
        message,
      };
    }
  },

  /**
   * Set a provider as the default
   */
  setDefaultProvider: async (id) => {
    set({ loading: true, error: null });
    try {
      await api.post(`/ai/providers/${id}/set-default`);
      set((state) => ({
        providers: state.providers.map((p) => ({
          ...p,
          isDefault: p.id === id,
        })),
        loading: false,
      }));
    } catch (error: unknown) {
      const message = extractErrorMessage(error, 'Failed to set default provider');
      set({ error: message, loading: false });
      throw error;
    }
  },

  /**
   * Fetch all available AI models (cached - only fetches once)
   */
  fetchModels: async () => {
    const { modelsLoaded, modelsLoading } = get();
    // Skip if already loaded or loading
    if (modelsLoaded || modelsLoading) return;

    set({ modelsLoading: true });
    try {
      const response = await api.get('/ai/models');
      const modelsData = response.data?.data || response.data?.models || [];
      set({
        models: Array.isArray(modelsData) ? modelsData : [],
        modelsLoading: false,
        modelsLoaded: true,
      });
    } catch (error: unknown) {
      console.error('Failed to fetch models:', error);
      set({ modelsLoading: false, models: [] });
    }
  },

  /**
   * Fetch model providers with counts (cached - only fetches once)
   */
  fetchModelProviders: async () => {
    const { providersLoaded, providersLoading } = get();
    // Skip if already loaded or currently loading
    if (providersLoaded || providersLoading) return;

    set({ providersLoading: true });
    try {
      const response = await api.get('/ai/models/providers');
      const providersData = response.data?.data || response.data || [];
      set({
        modelProviders: Array.isArray(providersData) ? providersData : [],
        providersLoading: false,
        providersLoaded: true,
      });
    } catch (error: unknown) {
      console.error('Failed to fetch model providers:', error);
      set({ modelProviders: [], providersLoading: false });
    }
  },

  /**
   * Fetch AI usage records within a date range
   */
  fetchUsage: async (startDate, endDate) => {
    set({ loading: true, error: null });
    try {
      const response = await api.get('/ai/usage', {
        params: { startDate, endDate },
      });
      set({ usage: response.data, loading: false });
    } catch (error: unknown) {
      const message = extractErrorMessage(error, 'Failed to fetch usage');
      set({ error: message, loading: false });
    }
  },

  /**
   * Fetch AI usage summary within a date range
   */
  fetchUsageSummary: async (startDate, endDate) => {
    set({ loading: true, error: null });
    try {
      const response = await api.get('/ai/usage/summary', {
        params: { startDate, endDate },
      });
      set({ usageSummary: response.data, loading: false });
    } catch (error: unknown) {
      const message = extractErrorMessage(error, 'Failed to fetch usage summary');
      set({ error: message, loading: false });
    }
  },

  /**
   * Clear any error state
   */
  clearError: () => set({ error: null }),
}));
