import { create } from 'zustand';
import api from '../services/api';
import { extractErrorMessage } from '../lib/utils';

/**
 * Failover Entry - represents a provider+model pair in a failover chain
 */
export interface FailoverEntry {
  provider: string;       // e.g., 'ollama', 'openrouter', 'cli-claude'
  model: string | null;   // e.g., 'qwen3:4b', 'meta-llama/llama-3.3-8b:free'
  isPrimary?: boolean;    // Optional flag to mark the primary entry
}

/**
 * Classifier Entry - a provider+model pair in the classifier chain
 * Provider can be an AI provider name or 'local' for keyword-based classification
 */
export interface ClassifierEntry {
  provider: string;       // e.g., 'MidAI', 'WS00XS / Ollama', or 'local'
  model: string | null;   // e.g., 'qwen3:4b' (null for 'local' type)
}

/**
 * Tier Failover Config - failover chain per tier
 */
export type TierFailoverConfig = Record<string, FailoverEntry[]>;

/**
 * Valid tier names
 */
export type TierName = 'trivial' | 'simple' | 'moderate' | 'complex' | 'critical';

/**
 * SuperBrain Settings Interface
 */
export interface SuperBrainSettings {
  // Translation Settings
  translationLanguage: string;
  translationProvider: string; // Provider for translation (system = use task routing)
  translationModel: string | null;
  autoTranslate: boolean;
  showOriginalWithTranslation: boolean;

  // Rephrase Settings
  rephraseProvider: string; // Provider for rephrase (system = use task routing)
  rephraseModel: string | null;
  rephraseStyle: string;

  // Task Classification Preferences (Provider per tier)
  // These are used when customFailoverChain is not set
  trivialTierProvider: string;
  simpleTierProvider: string;
  moderateTierProvider: string;
  complexTierProvider: string;
  criticalTierProvider: string;

  // Model per tier (specific model for each classification)
  // These are used when customFailoverChain is not set
  trivialTierModel: string | null;
  simpleTierModel: string | null;
  moderateTierModel: string | null;
  complexTierModel: string | null;
  criticalTierModel: string | null;

  // Custom Failover Chain (per-tier array of provider+model pairs)
  // When set, overrides the individual tier provider/model settings
  customFailoverChain: TierFailoverConfig | null;

  // Reasoning Budget (per-tier iteration limits)
  // When set, overrides the hardcoded defaults in AgentReasoningLoop
  reasoningBudgets: Record<string, { maxIterations: number; maxToolCalls: number }> | null;

  // Tool Access Control Settings
  autoSendMode: 'allowed' | 'restricted';
  enabledTools: string[] | null; // null = all tools enabled
  toolConfidenceThreshold: number;
  aiRouterMode: 'full' | 'classify_only' | 'disabled';

  // AI Task Classifier Settings
  classifierMode: 'local' | 'ai';          // 'local' = keyword-based, 'ai' = AI model
  classifierChain: ClassifierEntry[] | null; // Unlimited failover chain of {provider, model} entries

  // Content Analysis Settings
  ocrEnabled?: boolean;
  ocrAutoExtract?: boolean;
  visionEnabled?: boolean;
  docAutoExtract?: boolean;
  docAutoSummarize?: boolean;
}

/**
 * Supported Language
 */
export interface SupportedLanguage {
  code: string;
  name: string;
}

/**
 * Rephrase Style
 */
export interface RephraseStyles {
  [key: string]: string;
}

/**
 * Provider Tiers
 */
export interface ProviderTiers {
  trivial: string[];
  simple: string[];
  moderate: string[];
  complex: string[];
  critical: string[];
}

/**
 * Available Model
 */
export interface AvailableModel {
  id: string;
  name: string;
  provider: string;
  providerId?: string;
  providerType: string;
  isFree: boolean;
}

/**
 * Provider Model (for provider-specific model lists)
 */
export interface ProviderModel {
  id: string;
  name: string;
  isFree: boolean;
}

/**
 * Available Provider (user-configured + system CLI)
 */
export interface AvailableProvider {
  id: string;           // e.g., 'ollama', 'openrouter', 'cli-claude', 'local-agent'
  dbId?: string;        // Database ID for user-configured providers
  name: string;         // Display name
  type: 'api' | 'cli' | 'local-agent';
  providerType: string; // Underlying type (ollama, openrouter, claude, gemini, opencode, local-agent)
  isConfigured: boolean;
  isAuthenticated: boolean;
  isOnline?: boolean;   // For local-agent type — indicates agent WebSocket connectivity
  isDefault?: boolean;
  localAgentId?: string; // For local-agent type — linked local agent ID
  models: ProviderModel[];
  lastTested?: string;
  authenticatedAt?: string;
  requiresSuperadmin?: boolean;
}

/**
 * System Tool
 */
export interface SystemTool {
  id: string;
  name: string;
  description: string;
  category: string;
  requiresAuth: boolean;
  requiredParams: string[];
  examples: string[];
  enabled: boolean;
  isMessagingTool: boolean;
  restricted: boolean;
}

/**
 * Tool Category Group
 */
export interface ToolsByCategory {
  [category: string]: SystemTool[];
}

/**
 * AI Router Modes
 */
export interface AIRouterModes {
  [mode: string]: string;
}

/**
 * SuperBrain Store State
 */
interface SuperBrainStoreState {
  // State
  settings: SuperBrainSettings | null;
  rephraseStyles: RephraseStyles;
  supportedLanguages: SupportedLanguage[];
  providerTiers: ProviderTiers;
  availableModels: AvailableModel[];
  freeModels: AvailableModel[];
  paidModels: AvailableModel[];
  // Tool Access
  tools: SystemTool[];
  toolsByCategory: ToolsByCategory;
  toolCategories: string[];
  messagingToolIds: string[];
  aiRouterModes: AIRouterModes;
  autoSendModes: Record<string, string>;
  // Providers (dynamic)
  availableProviders: AvailableProvider[];
  loadingProviders: boolean;
  // Loading/Error
  loading: boolean;
  error: string | null;

  // Actions
  fetchSettings: () => Promise<void>;
  updateSettings: (updates: Partial<SuperBrainSettings>) => Promise<void>;
  resetSettings: () => Promise<void>;
  fetchAvailableModels: (providerId?: string) => Promise<void>;
  fetchAvailableProviders: () => Promise<void>;
  fetchProviderModels: (providerId: string, refresh?: boolean) => Promise<ProviderModel[]>;
  getProviderById: (providerId: string) => AvailableProvider | undefined;
  fetchTools: () => Promise<void>;
  updateToolSettings: (updates: {
    enabledTools?: string[] | null;
    autoSendMode?: 'allowed' | 'restricted';
    toolConfidenceThreshold?: number;
    aiRouterMode?: 'full' | 'classify_only' | 'disabled';
  }) => Promise<void>;
  clearError: () => void;
}

const DEFAULT_SETTINGS: SuperBrainSettings = {
  translationLanguage: 'en',
  translationProvider: 'system',
  translationModel: null,
  autoTranslate: false,
  showOriginalWithTranslation: true,
  rephraseProvider: 'system',
  rephraseModel: null,
  rephraseStyle: 'professional',
  // Provider per tier (user selects models via Task Routing UI)
  trivialTierProvider: 'ollama',
  simpleTierProvider: 'openrouter',
  moderateTierProvider: 'openrouter',
  complexTierProvider: 'openrouter',
  criticalTierProvider: 'cli-claude',
  // Model per tier
  trivialTierModel: null,
  simpleTierModel: null,
  moderateTierModel: null,
  complexTierModel: null,
  criticalTierModel: null,
  // Custom failover chain (Advanced section)
  customFailoverChain: null,
  // Reasoning Budget
  reasoningBudgets: null,
  // AI Task Classifier
  classifierMode: 'local',
  classifierChain: null,
  // Tool Access Control
  autoSendMode: 'restricted',
  enabledTools: null,
  toolConfidenceThreshold: 0.7,
  aiRouterMode: 'full',
};

export const useSuperBrainStore = create<SuperBrainStoreState>((set, get) => ({
  // Initial State
  settings: null,
  rephraseStyles: {},
  supportedLanguages: [],
  providerTiers: {
    trivial: [],
    simple: [],
    moderate: [],
    complex: [],
    critical: [],
  },
  availableModels: [],
  freeModels: [],
  paidModels: [],
  // Tool Access
  tools: [],
  toolsByCategory: {},
  toolCategories: [],
  messagingToolIds: [],
  aiRouterModes: {},
  autoSendModes: {},
  // Providers (dynamic)
  availableProviders: [],
  loadingProviders: false,
  // Loading/Error
  loading: false,
  error: null,

  /**
   * Fetch SuperBrain settings
   */
  fetchSettings: async () => {
    set({ loading: true, error: null });
    try {
      const response = await api.get('/superbrain/settings');
      const data = response.data;

      set({
        settings: data.settings || DEFAULT_SETTINGS,
        rephraseStyles: data.rephraseStyles || {},
        supportedLanguages: data.supportedLanguages || [],
        providerTiers: data.providerTiers || {
          trivial: [],
          simple: [],
          moderate: [],
          complex: [],
          critical: [],
        },
        loading: false,
      });
    } catch (error: unknown) {
      const message = extractErrorMessage(error, 'Failed to fetch SuperBrain settings');
      set({ error: message, loading: false });
    }
  },

  /**
   * Update SuperBrain settings
   */
  updateSettings: async (updates) => {
    set({ loading: true, error: null });
    try {
      const response = await api.patch('/superbrain/settings', updates);
      const data = response.data;

      set({
        settings: data.settings || DEFAULT_SETTINGS,
        rephraseStyles: data.rephraseStyles || {},
        supportedLanguages: data.supportedLanguages || [],
        loading: false,
      });
    } catch (error: unknown) {
      const message = extractErrorMessage(error, 'Failed to update SuperBrain settings');
      set({ error: message, loading: false });
      throw error;
    }
  },

  /**
   * Reset settings to defaults
   */
  resetSettings: async () => {
    set({ loading: true, error: null });
    try {
      const response = await api.post('/superbrain/settings/reset');
      const data = response.data;

      set({
        settings: data.settings || DEFAULT_SETTINGS,
        rephraseStyles: data.rephraseStyles || {},
        supportedLanguages: data.supportedLanguages || [],
        loading: false,
      });
    } catch (error: unknown) {
      const message = extractErrorMessage(error, 'Failed to reset SuperBrain settings');
      set({ error: message, loading: false });
      throw error;
    }
  },

  /**
   * Fetch available models for translation/rephrase
   * @param providerId - Optional provider ID to filter models
   */
  fetchAvailableModels: async (providerId?: string) => {
    set({ loading: true, error: null });
    try {
      const params = providerId ? { providerId } : {};
      const response = await api.get('/superbrain/models/available', { params });
      const data = response.data;

      set({
        availableModels: data.models || [],
        freeModels: data.freeModels || [],
        paidModels: data.paidModels || [],
        loading: false,
      });
    } catch (error: unknown) {
      const message = extractErrorMessage(error, 'Failed to fetch available models');
      set({ error: message, loading: false });
    }
  },

  /**
   * Fetch all available providers (user-configured + system CLI)
   */
  fetchAvailableProviders: async () => {
    set({ loadingProviders: true, error: null });
    try {
      const response = await api.get('/superbrain/providers/available');
      const data = response.data;

      set({
        availableProviders: data.providers || [],
        loadingProviders: false,
      });
    } catch (error: unknown) {
      const message = extractErrorMessage(error, 'Failed to fetch providers');
      set({ error: message, loadingProviders: false });
    }
  },

  /**
   * Fetch models for a specific provider
   * @param providerId - Provider ID
   * @param refresh - Force refresh/discovery
   * @returns Array of provider models
   */
  fetchProviderModels: async (providerId: string, refresh = false): Promise<ProviderModel[]> => {
    try {
      const response = await api.get(`/superbrain/providers/${encodeURIComponent(providerId)}/models`, {
        params: refresh ? { refresh: 'true' } : {},
      });
      return response.data.models || [];
    } catch (error: unknown) {
      console.error(`Failed to fetch models for provider ${providerId}:`, error);
      return [];
    }
  },

  /**
   * Get provider by ID from cached providers
   * @param providerId - Provider ID
   * @returns Provider or undefined
   */
  getProviderById: (providerId: string): AvailableProvider | undefined => {
    const state = get();
    return state.availableProviders.find(p => p.id === providerId);
  },

  /**
   * Fetch available tools
   */
  fetchTools: async () => {
    set({ loading: true, error: null });
    try {
      const response = await api.get('/superbrain/tools');
      const data = response.data;

      set({
        tools: data.tools || [],
        toolsByCategory: data.byCategory || {},
        toolCategories: data.categories || [],
        messagingToolIds: data.messagingToolIds || [],
        aiRouterModes: data.aiRouterModes || {},
        loading: false,
      });
    } catch (error: unknown) {
      const message = extractErrorMessage(error, 'Failed to fetch tools');
      set({ error: message, loading: false });
    }
  },

  /**
   * Update tool access settings
   */
  updateToolSettings: async (updates) => {
    set({ loading: true, error: null });
    try {
      const response = await api.patch('/superbrain/tools', updates);
      const data = response.data;

      // Update settings with the new tool settings
      set((state) => ({
        settings: data.settings || state.settings,
        loading: false,
      }));

      // Refetch tools to update enabled status
      const toolsResponse = await api.get('/superbrain/tools');
      set({
        tools: toolsResponse.data.tools || [],
        toolsByCategory: toolsResponse.data.byCategory || {},
      });
    } catch (error: unknown) {
      const message = extractErrorMessage(error, 'Failed to update tool settings');
      set({ error: message, loading: false });
      throw error;
    }
  },

  /**
   * Clear error state
   */
  clearError: () => {
    set({ error: null });
  },
}));
