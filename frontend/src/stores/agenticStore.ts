import { create } from 'zustand';
import api from '../services/api';
import { extractErrorMessage } from '../lib/utils';

// ============================================================================
// Types
// ============================================================================

export type CliType = 'claude' | 'gemini' | 'opencode' | 'bash';
export type AutonomyLevel = 'semi' | 'full';

// ============================================================================
// Agentic Profile Types
// ============================================================================

export interface AgenticProfile {
  id: string;
  userId: string;
  /** @deprecated Per PRD, agentic_profiles IS the agent. Kept for backwards compatibility only. */
  agentId?: string | null;
  name: string;
  role: string;
  description: string;
  // System Configuration
  systemPrompt?: string;
  // AI Configuration
  aiProvider?: string;
  aiModel?: string;
  temperature?: number | null;
  maxTokens?: number | null;
  routingPreset?: string;
  // Autonomy Settings
  autonomyLevel: 'supervised' | 'semi-autonomous' | 'autonomous';
  // Workspace Settings (PRD refactor)
  cliType?: 'claude' | 'gemini' | 'opencode' | 'bash';
  workspaceAutonomyLevel?: 'semi' | 'full';
  // Hierarchy
  parentProfileId: string | null;
  hierarchyLevel: number;
  hierarchyPath?: string;
  profileType?: 'master' | 'sub';
  // Orchestration Settings
  canCreateChildren?: boolean;
  maxChildren?: number;
  maxHierarchyDepth?: number;
  childrenAutonomyCap?: 'supervised' | 'semi-autonomous' | 'autonomous';
  // Status & Limits
  status: 'active' | 'inactive' | 'paused' | 'deleted' | 'terminated';
  masterContactId: string | null;
  masterContactChannel?: string;
  // Timestamps
  createdAt: string;
  updatedAt: string;
}

export interface AgenticTeamMember {
  id: string;
  profileId?: string;
  agenticId: string;
  contactId: string;
  contactName: string;
  contactAvatar?: string | null;
  role: string;
  skills?: string[];
  department?: string;
  gender?: string | null;
  isAvailable?: boolean;
  timezone?: string;
  preferredChannel?: string;
  tasksCompleted?: number;
  rating?: number;
  canAssignTasks: boolean;
  permissions: Record<string, boolean>;
  createdAt: string;
  updatedAt?: string;
}

export interface AgenticApproval {
  id: string;
  agenticId: string;
  requesterId: string;
  actionType: string;
  payload: Record<string, any>;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  expiresAt: string | null;
}

export interface AgenticMemory {
  id: string;
  agenticId: string;
  content: string;
  type: 'conversation' | 'fact' | 'preference' | 'task';
  importance: number;
  sessionId: string | null;
  createdAt: string;
}

export interface ContactScope {
  scopeType: 'all' | 'whitelist' | 'blacklist';
  contacts: string[]; // contact IDs
  requireApprovalOutside: boolean;
}

export interface BackgroundInfo {
  companyName: string;
  address: string;
  details: Record<string, any>;
}

export interface AgenticWorkspace {
  id: string;
  userId: string;
  // PRD refactor: workspace links to profile_id (not agent_id)
  profileId?: string;
  profileName?: string;
  /** @deprecated Use profileId instead. Kept for backwards compatibility. */
  agentId?: string;
  agentName?: string;
  workspacePath: string;
  contextFilePath?: string;
  cliType: CliType;
  autonomyLevel: AutonomyLevel;
  capabilities?: string[];
  customToolsEnabled?: boolean;
  selfImprovementEnabled?: boolean;
  ragAutoUpdateEnabled?: boolean;
  isActive?: boolean;
  status?: 'idle' | 'active' | 'running' | 'error';
  lastExecutionAt?: string;
  executionCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface AgenticToken {
  id: string;
  userId: string;
  agentId: string;
  workspaceId: string;
  tokenPrefix: string;
  name?: string;
  scopes: string[];
  expiresAt: string;
  lastUsedAt?: string;
  isActive: boolean;
  createdAt: string;
}

export type ToolInputType = 'string' | 'number' | 'boolean' | 'object' | 'array';

export interface ToolInput {
  name: string;
  type: ToolInputType;
  required: boolean;
  description?: string;
  default?: unknown;
}

export interface ToolOutput {
  name: string;
  type: ToolInputType;
  description?: string;
}

export interface CustomTool {
  id: string;
  userId: string;
  workspaceId?: string;
  name: string;
  displayName: string;
  description: string;
  category: string;
  inputs: ToolInput[];
  outputs: ToolOutput[];
  scriptPath: string;
  isActive: boolean;
  executionCount: number;
  createdBy: 'user' | 'agent';
  createdAt: string;
  updatedAt: string;
}

export interface CreateWorkspaceInput {
  agentId: string;
  agentName: string;
  cliType: CliType;
  autonomyLevel: AutonomyLevel;
  capabilities?: string[];
  customToolsEnabled?: boolean;
  selfImprovementEnabled?: boolean;
  ragAutoUpdateEnabled?: boolean;
}

export interface CreateToolInput {
  workspaceId?: string;
  name: string;
  displayName: string;
  description: string;
  category?: string;
  inputs?: ToolInput[];
  outputs?: ToolOutput[];
  scriptCode: string;
}

export interface GenerateTokenInput {
  workspaceId: string;
  name?: string;
  scopes?: string[];
  expiresInDays?: number;
}

export interface TokenGenerationResult {
  token: string;
  tokenId: string;
  tokenPrefix: string;
  expiresAt: string;
}

export interface ToolExecutionResult {
  success: boolean;
  output?: unknown;
  error?: string;
  executionTime?: number;
}

// ============================================================================
// Store Interface
// ============================================================================

interface AgenticStoreState {
  // State
  workspaces: AgenticWorkspace[];
  selectedWorkspace: AgenticWorkspace | null;
  tokens: AgenticToken[];
  tools: CustomTool[];
  selectedTool: CustomTool | null;
  loading: boolean;
  error: string | null;

  // Profile State
  profiles: AgenticProfile[];
  selectedProfile: AgenticProfile | null;
  teamMembers: AgenticTeamMember[];
  approvals: AgenticApproval[];
  memories: AgenticMemory[];
  contactScope: ContactScope | null;
  background: BackgroundInfo | null;
  isLoadingProfiles: boolean;
  profilesError: string | null;

  // Workspace Actions
  fetchWorkspaces: () => Promise<void>;
  fetchWorkspaceById: (id: string) => Promise<AgenticWorkspace | null>;
  fetchWorkspaceByAgentId: (agentId: string) => Promise<AgenticWorkspace | null>;
  createWorkspace: (input: CreateWorkspaceInput) => Promise<AgenticWorkspace>;
  deleteWorkspace: (id: string) => Promise<void>;
  regenerateContextFile: (id: string) => Promise<string>;
  selectWorkspace: (workspace: AgenticWorkspace | null) => void;

  // Token Actions
  fetchTokens: () => Promise<void>;
  generateToken: (input: GenerateTokenInput) => Promise<TokenGenerationResult>;
  revokeToken: (tokenId: string) => Promise<void>;

  // Tool Actions
  fetchTools: () => Promise<void>;
  fetchWorkspaceTools: (workspaceId: string) => Promise<CustomTool[]>;
  fetchToolById: (id: string) => Promise<CustomTool | null>;
  createTool: (input: CreateToolInput) => Promise<CustomTool>;
  deleteTool: (id: string) => Promise<void>;
  testTool: (id: string, inputs: Record<string, unknown>) => Promise<ToolExecutionResult>;
  setToolActive: (id: string, isActive: boolean) => Promise<void>;
  selectTool: (tool: CustomTool | null) => void;

  // Profile CRUD Actions
  fetchProfiles: () => Promise<void>;
  createProfile: (data: Partial<AgenticProfile>) => Promise<AgenticProfile>;
  updateProfile: (id: string, data: Partial<AgenticProfile>) => Promise<void>;
  deleteProfile: (id: string) => Promise<void>;
  selectProfile: (profile: AgenticProfile | null) => void;

  // Sub-agents Actions
  createSubAgent: (parentId: string, data: Partial<AgenticProfile>) => Promise<AgenticProfile>;
  fetchHierarchy: (agenticId: string) => Promise<AgenticProfile[]>;

  // Team Actions
  fetchTeamMembers: (agenticId: string) => Promise<void>;
  addTeamMember: (agenticId: string, data: Partial<AgenticTeamMember>) => Promise<void>;
  removeTeamMember: (agenticId: string, memberId: string) => Promise<void>;

  // Approvals Actions
  fetchApprovals: (agenticId: string) => Promise<void>;
  approveAction: (agenticId: string, approvalId: string) => Promise<void>;
  rejectAction: (agenticId: string, approvalId: string) => Promise<void>;

  // Memory Actions
  fetchMemories: (agenticId: string) => Promise<void>;
  searchMemories: (agenticId: string, query: string) => Promise<AgenticMemory[]>;

  // Configuration Actions
  fetchContactScope: (agenticId: string) => Promise<void>;
  updateContactScope: (agenticId: string, scope: ContactScope) => Promise<void>;
  fetchBackground: (agenticId: string) => Promise<void>;
  updateBackground: (agenticId: string, background: BackgroundInfo) => Promise<void>;

  // Utility
  clearError: () => void;
  clearProfilesError: () => void;
}

// ============================================================================
// Store Implementation
// ============================================================================

export const useAgenticStore = create<AgenticStoreState>((set, get) => ({
  // Initial State
  workspaces: [],
  selectedWorkspace: null,
  tokens: [],
  tools: [],
  selectedTool: null,
  loading: false,
  error: null,

  // Profile Initial State
  profiles: [],
  selectedProfile: null,
  teamMembers: [],
  approvals: [],
  memories: [],
  contactScope: null,
  background: null,
  isLoadingProfiles: false,
  profilesError: null,

  // ============================================================================
  // Workspace Actions
  // ============================================================================

  fetchWorkspaces: async () => {
    set({ loading: true, error: null });
    try {
      const response = await api.get('/agentic/workspaces');
      set({ workspaces: response.data.workspaces, loading: false });
    } catch (error: unknown) {
      const message = extractErrorMessage(error, 'Failed to fetch workspaces');
      set({ error: message, loading: false });
    }
  },

  fetchWorkspaceById: async (id: string) => {
    set({ loading: true, error: null });
    try {
      const response = await api.get(`/agentic/workspaces/${id}`);
      set({ loading: false });
      return response.data.workspace as AgenticWorkspace;
    } catch (error: unknown) {
      const message = extractErrorMessage(error, 'Failed to fetch workspace');
      set({ error: message, loading: false });
      return null;
    }
  },

  fetchWorkspaceByAgentId: async (agentId: string) => {
    set({ loading: true, error: null });
    try {
      const response = await api.get(`/agentic/workspaces/agent/${agentId}`);
      set({ loading: false });
      return response.data.workspace as AgenticWorkspace | null;
    } catch (error: unknown) {
      const message = extractErrorMessage(error, 'Failed to fetch workspace');
      set({ error: message, loading: false });
      return null;
    }
  },

  createWorkspace: async (input: CreateWorkspaceInput) => {
    set({ loading: true, error: null });
    try {
      const response = await api.post('/agentic/workspaces', input);
      const workspace = response.data.workspace as AgenticWorkspace;
      set((state) => ({
        workspaces: [...state.workspaces, workspace],
        loading: false,
      }));
      return workspace;
    } catch (error: unknown) {
      const message = extractErrorMessage(error, 'Failed to create workspace');
      set({ error: message, loading: false });
      throw error;
    }
  },

  deleteWorkspace: async (id: string) => {
    set({ loading: true, error: null });
    try {
      await api.delete(`/agentic/workspaces/${id}`);
      set((state) => ({
        workspaces: state.workspaces.filter((w) => w.id !== id),
        selectedWorkspace: state.selectedWorkspace?.id === id ? null : state.selectedWorkspace,
        loading: false,
      }));
    } catch (error: unknown) {
      const message = extractErrorMessage(error, 'Failed to delete workspace');
      set({ error: message, loading: false });
      throw error;
    }
  },

  regenerateContextFile: async (id: string) => {
    set({ loading: true, error: null });
    try {
      const response = await api.post(`/agentic/workspaces/${id}/regenerate-context`);
      set({ loading: false });
      return response.data.contextFilePath as string;
    } catch (error: unknown) {
      const message = extractErrorMessage(error, 'Failed to regenerate context file');
      set({ error: message, loading: false });
      throw error;
    }
  },

  selectWorkspace: (workspace: AgenticWorkspace | null) => {
    set({ selectedWorkspace: workspace });
  },

  // ============================================================================
  // Token Actions
  // ============================================================================

  fetchTokens: async () => {
    set({ loading: true, error: null });
    try {
      const response = await api.get('/agentic/tokens');
      set({ tokens: response.data.tokens, loading: false });
    } catch (error: unknown) {
      const message = extractErrorMessage(error, 'Failed to fetch tokens');
      set({ error: message, loading: false });
    }
  },

  generateToken: async (input: GenerateTokenInput) => {
    set({ loading: true, error: null });
    try {
      const response = await api.post('/agentic/tokens', input);
      const result = response.data as TokenGenerationResult & { success: boolean };
      // Refresh tokens list
      await get().fetchTokens();
      set({ loading: false });
      return {
        token: result.token,
        tokenId: result.tokenId,
        tokenPrefix: result.tokenPrefix,
        expiresAt: result.expiresAt,
      };
    } catch (error: unknown) {
      const message = extractErrorMessage(error, 'Failed to generate token');
      set({ error: message, loading: false });
      throw error;
    }
  },

  revokeToken: async (tokenId: string) => {
    set({ loading: true, error: null });
    try {
      await api.delete(`/agentic/tokens/${tokenId}`);
      set((state) => ({
        tokens: state.tokens.filter((t) => t.id !== tokenId),
        loading: false,
      }));
    } catch (error: unknown) {
      const message = extractErrorMessage(error, 'Failed to revoke token');
      set({ error: message, loading: false });
      throw error;
    }
  },

  // ============================================================================
  // Tool Actions
  // ============================================================================

  fetchTools: async () => {
    set({ loading: true, error: null });
    try {
      const response = await api.get('/agentic/tools');
      set({ tools: response.data.tools, loading: false });
    } catch (error: unknown) {
      const message = extractErrorMessage(error, 'Failed to fetch tools');
      set({ error: message, loading: false });
    }
  },

  fetchWorkspaceTools: async (workspaceId: string) => {
    set({ loading: true, error: null });
    try {
      const response = await api.get(`/agentic/tools/workspace/${workspaceId}`);
      set({ loading: false });
      return response.data.tools as CustomTool[];
    } catch (error: unknown) {
      const message = extractErrorMessage(error, 'Failed to fetch workspace tools');
      set({ error: message, loading: false });
      return [];
    }
  },

  fetchToolById: async (id: string) => {
    set({ loading: true, error: null });
    try {
      const response = await api.get(`/agentic/tools/${id}`);
      set({ loading: false });
      return response.data.tool as CustomTool;
    } catch (error: unknown) {
      const message = extractErrorMessage(error, 'Failed to fetch tool');
      set({ error: message, loading: false });
      return null;
    }
  },

  createTool: async (input: CreateToolInput) => {
    set({ loading: true, error: null });
    try {
      const response = await api.post('/agentic/tools', input);
      const tool = response.data.tool as CustomTool;
      set((state) => ({
        tools: [...state.tools, tool],
        loading: false,
      }));
      return tool;
    } catch (error: unknown) {
      const message = extractErrorMessage(error, 'Failed to create tool');
      set({ error: message, loading: false });
      throw error;
    }
  },

  deleteTool: async (id: string) => {
    set({ loading: true, error: null });
    try {
      await api.delete(`/agentic/tools/${id}`);
      set((state) => ({
        tools: state.tools.filter((t) => t.id !== id),
        selectedTool: state.selectedTool?.id === id ? null : state.selectedTool,
        loading: false,
      }));
    } catch (error: unknown) {
      const message = extractErrorMessage(error, 'Failed to delete tool');
      set({ error: message, loading: false });
      throw error;
    }
  },

  testTool: async (id: string, inputs: Record<string, unknown>) => {
    set({ loading: true, error: null });
    try {
      const response = await api.post(`/agentic/tools/${id}/test`, { inputs });
      set({ loading: false });
      return response.data as ToolExecutionResult;
    } catch (error: unknown) {
      const message = extractErrorMessage(error, 'Failed to test tool');
      set({ error: message, loading: false });
      return { success: false, error: message };
    }
  },

  setToolActive: async (id: string, isActive: boolean) => {
    set({ loading: true, error: null });
    try {
      await api.patch(`/agentic/tools/${id}/active`, { isActive });
      set((state) => ({
        tools: state.tools.map((t) =>
          t.id === id ? { ...t, isActive } : t
        ),
        loading: false,
      }));
    } catch (error: unknown) {
      const message = extractErrorMessage(error, 'Failed to update tool status');
      set({ error: message, loading: false });
      throw error;
    }
  },

  selectTool: (tool: CustomTool | null) => {
    set({ selectedTool: tool });
  },

  // ============================================================================
  // Profile CRUD Actions
  // ============================================================================

  fetchProfiles: async () => {
    set({ isLoadingProfiles: true, profilesError: null });
    try {
      const response = await api.get('/agentic/profiles');
      set({ profiles: response.data.profiles || response.data, isLoadingProfiles: false });
    } catch (error: unknown) {
      const message = extractErrorMessage(error, 'Failed to fetch profiles');
      set({ profilesError: message, isLoadingProfiles: false });
    }
  },

  createProfile: async (data: Partial<AgenticProfile>) => {
    set({ isLoadingProfiles: true, profilesError: null });
    try {
      const response = await api.post('/agentic/profiles', data);
      const profile = response.data.profile || response.data;
      set((state) => ({
        profiles: [...state.profiles, profile],
        isLoadingProfiles: false,
      }));
      return profile;
    } catch (error: unknown) {
      const message = extractErrorMessage(error, 'Failed to create profile');
      set({ profilesError: message, isLoadingProfiles: false });
      throw error;
    }
  },

  updateProfile: async (id: string, data: Partial<AgenticProfile>) => {
    set({ isLoadingProfiles: true, profilesError: null });
    try {
      const response = await api.put(`/agentic/profiles/${id}`, data);
      const updatedProfile = response.data.profile || response.data;
      set((state) => ({
        profiles: state.profiles.map((p) => (p.id === id ? updatedProfile : p)),
        selectedProfile: state.selectedProfile?.id === id ? updatedProfile : state.selectedProfile,
        isLoadingProfiles: false,
      }));
    } catch (error: unknown) {
      const message = extractErrorMessage(error, 'Failed to update profile');
      set({ profilesError: message, isLoadingProfiles: false });
      throw error;
    }
  },

  deleteProfile: async (id: string) => {
    set({ isLoadingProfiles: true, profilesError: null });
    try {
      await api.delete(`/agentic/profiles/${id}`);
      set((state) => ({
        profiles: state.profiles.filter((p) => p.id !== id),
        selectedProfile: state.selectedProfile?.id === id ? null : state.selectedProfile,
        isLoadingProfiles: false,
      }));
    } catch (error: unknown) {
      const message = extractErrorMessage(error, 'Failed to delete profile');
      set({ profilesError: message, isLoadingProfiles: false });
      throw error;
    }
  },

  selectProfile: (profile: AgenticProfile | null) => {
    set({ selectedProfile: profile });
  },

  // ============================================================================
  // Sub-agents Actions
  // ============================================================================

  createSubAgent: async (parentId: string, data: Partial<AgenticProfile>) => {
    set({ isLoadingProfiles: true, profilesError: null });
    try {
      const response = await api.post(`/agentic/profiles/${parentId}/children`, data);
      const subAgent = response.data.profile || response.data;
      set((state) => ({
        profiles: [...state.profiles, subAgent],
        isLoadingProfiles: false,
      }));
      return subAgent;
    } catch (error: unknown) {
      const message = extractErrorMessage(error, 'Failed to create sub-agent');
      set({ profilesError: message, isLoadingProfiles: false });
      throw error;
    }
  },

  fetchHierarchy: async (agenticId: string) => {
    set({ isLoadingProfiles: true, profilesError: null });
    try {
      const response = await api.get(`/agentic/profiles/${agenticId}/hierarchy`);
      set({ isLoadingProfiles: false });
      return response.data.hierarchy || response.data;
    } catch (error: unknown) {
      const message = extractErrorMessage(error, 'Failed to fetch hierarchy');
      set({ profilesError: message, isLoadingProfiles: false });
      return [];
    }
  },

  // ============================================================================
  // Team Actions
  // ============================================================================

  fetchTeamMembers: async (agenticId: string) => {
    set({ isLoadingProfiles: true, profilesError: null });
    try {
      const response = await api.get(`/agentic/profiles/${agenticId}/team`);
      set({ teamMembers: response.data.members || response.data, isLoadingProfiles: false });
    } catch (error: unknown) {
      const message = extractErrorMessage(error, 'Failed to fetch team members');
      set({ profilesError: message, isLoadingProfiles: false });
    }
  },

  addTeamMember: async (agenticId: string, data: Partial<AgenticTeamMember>) => {
    set({ isLoadingProfiles: true, profilesError: null });
    try {
      const response = await api.post(`/agentic/profiles/${agenticId}/team`, data);
      const member = response.data.member || response.data;
      set((state) => ({
        teamMembers: [...state.teamMembers, member],
        isLoadingProfiles: false,
      }));
    } catch (error: unknown) {
      const message = extractErrorMessage(error, 'Failed to add team member');
      set({ profilesError: message, isLoadingProfiles: false });
      throw error;
    }
  },

  removeTeamMember: async (agenticId: string, memberId: string) => {
    set({ isLoadingProfiles: true, profilesError: null });
    try {
      await api.delete(`/agentic/profiles/${agenticId}/team/${memberId}`);
      set((state) => ({
        teamMembers: state.teamMembers.filter((m) => m.id !== memberId),
        isLoadingProfiles: false,
      }));
    } catch (error: unknown) {
      const message = extractErrorMessage(error, 'Failed to remove team member');
      set({ profilesError: message, isLoadingProfiles: false });
      throw error;
    }
  },

  // ============================================================================
  // Approvals Actions
  // ============================================================================

  fetchApprovals: async (agenticId: string) => {
    set({ isLoadingProfiles: true, profilesError: null });
    try {
      const response = await api.get(`/agentic/profiles/${agenticId}/approvals`);
      set({ approvals: response.data.approvals || response.data, isLoadingProfiles: false });
    } catch (error: unknown) {
      const message = extractErrorMessage(error, 'Failed to fetch approvals');
      set({ profilesError: message, isLoadingProfiles: false });
    }
  },

  approveAction: async (agenticId: string, approvalId: string) => {
    set({ isLoadingProfiles: true, profilesError: null });
    try {
      await api.post(`/agentic/profiles/${agenticId}/approvals/${approvalId}/approve`);
      set((state) => ({
        approvals: state.approvals.map((a) =>
          a.id === approvalId ? { ...a, status: 'approved' as const } : a
        ),
        isLoadingProfiles: false,
      }));
    } catch (error: unknown) {
      const message = extractErrorMessage(error, 'Failed to approve action');
      set({ profilesError: message, isLoadingProfiles: false });
      throw error;
    }
  },

  rejectAction: async (agenticId: string, approvalId: string) => {
    set({ isLoadingProfiles: true, profilesError: null });
    try {
      await api.post(`/agentic/profiles/${agenticId}/approvals/${approvalId}/reject`);
      set((state) => ({
        approvals: state.approvals.map((a) =>
          a.id === approvalId ? { ...a, status: 'rejected' as const } : a
        ),
        isLoadingProfiles: false,
      }));
    } catch (error: unknown) {
      const message = extractErrorMessage(error, 'Failed to reject action');
      set({ profilesError: message, isLoadingProfiles: false });
      throw error;
    }
  },

  // ============================================================================
  // Memory Actions
  // ============================================================================

  fetchMemories: async (agenticId: string) => {
    set({ isLoadingProfiles: true, profilesError: null });
    try {
      const response = await api.get(`/agentic/profiles/${agenticId}/memory`);
      set({ memories: response.data.memories || response.data, isLoadingProfiles: false });
    } catch (error: unknown) {
      const message = extractErrorMessage(error, 'Failed to fetch memories');
      set({ profilesError: message, isLoadingProfiles: false });
    }
  },

  searchMemories: async (agenticId: string, query: string) => {
    set({ isLoadingProfiles: true, profilesError: null });
    try {
      const response = await api.get(`/agentic/profiles/${agenticId}/memory/search`, {
        params: { query },
      });
      set({ isLoadingProfiles: false });
      return response.data.memories || response.data;
    } catch (error: unknown) {
      const message = extractErrorMessage(error, 'Failed to search memories');
      set({ profilesError: message, isLoadingProfiles: false });
      return [];
    }
  },

  // ============================================================================
  // Configuration Actions
  // ============================================================================

  fetchContactScope: async (agenticId: string) => {
    set({ isLoadingProfiles: true, profilesError: null });
    try {
      const response = await api.get(`/agentic/profiles/${agenticId}/contact-scope`);
      set({ contactScope: response.data.scope || response.data, isLoadingProfiles: false });
    } catch (error: unknown) {
      const message = extractErrorMessage(error, 'Failed to fetch contact scope');
      set({ profilesError: message, isLoadingProfiles: false });
    }
  },

  updateContactScope: async (agenticId: string, scope: ContactScope) => {
    set({ isLoadingProfiles: true, profilesError: null });
    try {
      await api.put(`/agentic/profiles/${agenticId}/contact-scope`, scope);
      set({ contactScope: scope, isLoadingProfiles: false });
    } catch (error: unknown) {
      const message = extractErrorMessage(error, 'Failed to update contact scope');
      set({ profilesError: message, isLoadingProfiles: false });
      throw error;
    }
  },

  fetchBackground: async (agenticId: string) => {
    set({ isLoadingProfiles: true, profilesError: null });
    try {
      const response = await api.get(`/agentic/profiles/${agenticId}/background`);
      set({ background: response.data.background || response.data, isLoadingProfiles: false });
    } catch (error: unknown) {
      const message = extractErrorMessage(error, 'Failed to fetch background');
      set({ profilesError: message, isLoadingProfiles: false });
    }
  },

  updateBackground: async (agenticId: string, background: BackgroundInfo) => {
    set({ isLoadingProfiles: true, profilesError: null });
    try {
      await api.put(`/agentic/profiles/${agenticId}/background`, background);
      set({ background, isLoadingProfiles: false });
    } catch (error: unknown) {
      const message = extractErrorMessage(error, 'Failed to update background');
      set({ profilesError: message, isLoadingProfiles: false });
      throw error;
    }
  },

  // ============================================================================
  // Utility
  // ============================================================================

  clearError: () => set({ error: null }),

  clearProfilesError: () => set({ profilesError: null }),
}));
