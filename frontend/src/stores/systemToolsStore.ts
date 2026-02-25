/**
 * System Tools Store
 *
 * Manages state for system tools display and configuration.
 * Fetches tool definitions from AI Router and integrates with Tool API Keys.
 */

import { create } from 'zustand';
import api from '../services/api';
import { extractErrorMessage } from '../lib/utils';

// Types
export interface ToolParameter {
  type: string;
  description: string;
  optional?: boolean;
  default?: any;
}

export interface SystemTool {
  id: string;
  name: string;
  description: string;
  category: string;
  parameters: Record<string, ToolParameter>;
  requiredParams: string[];
  optionalParams?: string[];
  examples: string[];
  requiresAuth: boolean;
}

export interface ToolCategory {
  id: string;
  name: string;
  description?: string;
  tools: SystemTool[];
}

export interface ToolProvider {
  id: string;
  name: string;
  keyRequired: boolean;
  description: string;
  docsUrl: string | null;
}

interface SystemToolsState {
  // Data
  tools: SystemTool[];
  categories: ToolCategory[];
  providers: Record<string, ToolProvider[]>; // toolId -> providers

  // Loading states
  loading: boolean;
  error: string | null;

  // Selected
  selectedCategory: string | null;
  selectedTool: string | null;

  // Actions
  fetchTools: () => Promise<void>;
  fetchProviders: () => Promise<void>;
  setSelectedCategory: (category: string | null) => void;
  setSelectedTool: (toolId: string | null) => void;
  clearError: () => void;
}

// Category descriptions
const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  messaging: 'Send messages via WhatsApp, Telegram, Email, or generate AI responses',
  web: 'Search the internet, fetch web pages, and make HTTP API requests',
  ai: 'AI-powered processing including chat, classification, extraction, translation, and summarization',
  file: 'Read and generate PDF and Excel files',
  vision: 'Extract text from images using OCR (Optical Character Recognition)',
  scheduling: 'Create, list, and manage reminders and scheduled tasks',
  data: 'Transform and manipulate data with JSON parsing, regex, and templates',
  flow: 'Trigger and manage FlowBuilder workflows',
  rag: 'Search and query the knowledge base using RAG (Retrieval Augmented Generation)',
  swarm: 'Coordinate with other agents in the swarm - handoffs and broadcasts',
};

export const useSystemToolsStore = create<SystemToolsState>((set, get) => ({
  // Initial state
  tools: [],
  categories: [],
  providers: {},
  loading: false,
  error: null,
  selectedCategory: null,
  selectedTool: null,

  // Fetch all tools grouped by category
  fetchTools: async () => {
    set({ loading: true, error: null });
    try {
      const response = await api.get('/ai/router/tools/categories');
      const categoriesData = response.data?.categories || [];

      // Add descriptions to categories
      const categories = categoriesData.map((cat: any) => ({
        ...cat,
        description: CATEGORY_DESCRIPTIONS[cat.id] || '',
      }));

      // Flatten tools for easy lookup
      const tools: SystemTool[] = [];
      for (const cat of categoriesData) {
        for (const tool of cat.tools || []) {
          tools.push({ ...tool, category: cat.id });
        }
      }

      set({ categories, tools, loading: false });
    } catch (error: unknown) {
      console.error('Failed to fetch system tools:', error);
      set({
        error: extractErrorMessage(error, 'Failed to fetch system tools'),
        loading: false,
      });
    }
  },

  // Fetch tool providers (tools that need API keys)
  fetchProviders: async () => {
    try {
      const response = await api.get('/tool-api-keys/providers');
      set({ providers: response.data?.providers || {} });
    } catch (error: unknown) {
      console.error('Failed to fetch tool providers:', error);
      // Don't set error - providers are optional
    }
  },

  setSelectedCategory: (category: string | null) => {
    set({ selectedCategory: category });
  },

  setSelectedTool: (toolId: string | null) => {
    set({ selectedTool: toolId });
  },

  clearError: () => set({ error: null }),
}));

export default useSystemToolsStore;
