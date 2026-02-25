/**
 * Tool API Key Store
 *
 * Manages state for tool API keys (Brave Search, Serper, etc.)
 * Used in Settings > Integrations > Tool API Keys
 */

import { create } from 'zustand';
import api from '../services/api';
import { extractErrorMessage } from '../lib/utils';

// Types
export interface ToolApiKey {
  id: string;
  toolId: string;
  provider: string;
  apiKeyMasked: string;
  priority: number;
  isActive: boolean;
  lastUsedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ToolProvider {
  id: string;
  name: string;
  keyRequired: boolean;
  description: string;
  docsUrl: string | null;
}

export interface TestResult {
  success: boolean;
  message?: string;
  error?: string;
}

interface ToolApiKeyState {
  // Data
  keys: Record<string, ToolApiKey[]>; // toolId -> keys
  providers: Record<string, ToolProvider[]>; // toolId -> providers

  // Loading states
  loading: boolean;
  testing: string | null; // Key ID being tested

  // Error
  error: string | null;

  // Actions
  fetchKeys: () => Promise<void>;
  fetchProviders: () => Promise<void>;
  fetchKeysForTool: (toolId: string) => Promise<void>;
  addKey: (toolId: string, provider: string, apiKey: string, priority?: number) => Promise<void>;
  updateKey: (id: string, updates: { apiKey?: string; priority?: number; isActive?: boolean }) => Promise<void>;
  deleteKey: (id: string) => Promise<void>;
  testKey: (id: string) => Promise<TestResult>;
  reorderKeys: (toolId: string, orderedIds: string[]) => Promise<void>;
  clearError: () => void;
}

export const useToolApiKeyStore = create<ToolApiKeyState>((set, get) => ({
  // Initial state
  keys: {},
  providers: {},
  loading: false,
  testing: null,
  error: null,

  // Fetch all keys for user
  fetchKeys: async () => {
    set({ loading: true, error: null });
    try {
      const response = await api.get('/tool-api-keys');
      set({ keys: response.data.keys || {}, loading: false });
    } catch (error: unknown) {
      set({
        error: extractErrorMessage(error, 'Failed to fetch API keys'),
        loading: false,
      });
    }
  },

  // Fetch provider list
  fetchProviders: async () => {
    try {
      const response = await api.get('/tool-api-keys/providers');
      set({ providers: response.data.providers || {} });
    } catch (error: unknown) {
      console.error('Failed to fetch providers:', error);
    }
  },

  // Fetch keys for specific tool
  fetchKeysForTool: async (toolId: string) => {
    set({ loading: true, error: null });
    try {
      const response = await api.get(`/tool-api-keys/${toolId}`);
      const currentKeys = get().keys;
      set({
        keys: {
          ...currentKeys,
          [toolId]: response.data.keys || [],
        },
        loading: false,
      });
    } catch (error: unknown) {
      set({
        error: extractErrorMessage(error, 'Failed to fetch keys'),
        loading: false,
      });
    }
  },

  // Add new key
  addKey: async (toolId: string, provider: string, apiKey: string, priority = 1) => {
    set({ loading: true, error: null });
    try {
      const response = await api.post('/tool-api-keys', {
        toolId,
        provider,
        apiKey,
        priority,
      });

      // Refresh keys
      await get().fetchKeys();

      set({ loading: false });
    } catch (error: unknown) {
      set({
        error: extractErrorMessage(error, 'Failed to add API key'),
        loading: false,
      });
      throw error;
    }
  },

  // Update key
  updateKey: async (id: string, updates: { apiKey?: string; priority?: number; isActive?: boolean }) => {
    set({ loading: true, error: null });
    try {
      await api.patch(`/tool-api-keys/${id}`, updates);

      // Refresh keys
      await get().fetchKeys();

      set({ loading: false });
    } catch (error: unknown) {
      set({
        error: extractErrorMessage(error, 'Failed to update API key'),
        loading: false,
      });
      throw error;
    }
  },

  // Delete key
  deleteKey: async (id: string) => {
    set({ loading: true, error: null });
    try {
      await api.delete(`/tool-api-keys/${id}`);

      // Refresh keys
      await get().fetchKeys();

      set({ loading: false });
    } catch (error: unknown) {
      set({
        error: extractErrorMessage(error, 'Failed to delete API key'),
        loading: false,
      });
      throw error;
    }
  },

  // Test key
  testKey: async (id: string): Promise<TestResult> => {
    set({ testing: id, error: null });
    try {
      const response = await api.post(`/tool-api-keys/${id}/test`);
      set({ testing: null });

      return {
        success: response.data.success,
        message: response.data.message,
      };
    } catch (error: unknown) {
      set({ testing: null });

      return {
        success: false,
        error: extractErrorMessage(error, 'Test failed'),
      };
    }
  },

  // Reorder keys (drag-drop)
  reorderKeys: async (toolId: string, orderedIds: string[]) => {
    try {
      await api.post('/tool-api-keys/reorder', {
        toolId,
        orderedIds,
      });

      // Refresh keys
      await get().fetchKeys();
    } catch (error: unknown) {
      set({
        error: extractErrorMessage(error, 'Failed to reorder keys'),
      });
    }
  },

  // Clear error
  clearError: () => set({ error: null }),
}));

export default useToolApiKeyStore;
