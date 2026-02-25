import React, { useState, useCallback, useEffect } from 'react';
import {
  Bot,
  Terminal,
  Settings,
  CheckCircle,
  AlertCircle,
  Loader2,
  Copy,
  RefreshCw,
  Zap,
  Brain,
  Wrench,
  Database,
  FolderOpen,
  FileText,
  UserCircle2,
  Sparkles,
  Users,
  ShieldAlert,
  UserCog,
  MessageSquare,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import api from '../../services/api';
import type { AgenticAIPlatformConfig, CustomTool, PersonaOption, PersonaConfig, PersonaDomain } from '../../types/frontend';

export interface AgenticAIConfigPanelProps {
  /** Agent ID for workspace creation */
  agentId?: string;
  /** Agent name for workspace creation */
  agentName?: string;
  /** Initial configuration */
  initialConfig?: Partial<AgenticAIPlatformConfig>;
  /** Callback when configuration is complete */
  onComplete: (config: AgenticAIPlatformConfig) => void;
  /** Additional className */
  className?: string;
}

type CliType = 'claude' | 'gemini' | 'opencode' | 'bash';
type AutonomyLevel = 'supervised' | 'semi-autonomous' | 'autonomous';

interface CliOption {
  type: CliType;
  name: string;
  description: string;
  icon: React.ReactNode;
  installed?: boolean;
}

const CLI_OPTIONS: CliOption[] = [
  {
    type: 'claude',
    name: 'Claude CLI',
    description: 'Anthropic\'s Claude Code CLI agent',
    icon: <Bot className="w-5 h-5" />,
  },
  {
    type: 'gemini',
    name: 'Gemini CLI',
    description: 'Google\'s Gemini CLI agent',
    icon: <Bot className="w-5 h-5" />,
  },
  {
    type: 'opencode',
    name: 'OpenCode',
    description: 'Open-source coding assistant',
    icon: <Terminal className="w-5 h-5" />,
  },
  {
    type: 'bash',
    name: 'Shell',
    description: 'Direct shell/bash execution',
    icon: <Terminal className="w-5 h-5" />,
  },
];

const CAPABILITIES = [
  { id: 'code_execution', label: 'Code Execution', description: 'Execute code and scripts' },
  { id: 'file_operations', label: 'File Operations', description: 'Read/write files in workspace' },
  { id: 'web_search', label: 'Web Search', description: 'Search the web for information' },
  { id: 'api_calls', label: 'API Calls', description: 'Make HTTP requests to external APIs' },
  { id: 'rag_access', label: 'RAG Access', description: 'Query and update knowledge base' },
  { id: 'tool_creation', label: 'Tool Creation', description: 'Create custom Python tools' },
  { id: 'swarm_communication', label: 'Swarm Communication', description: 'Communicate with other agents' },
  { id: 'flow_execution', label: 'Flow Execution', description: 'Trigger and execute flows' },
];

// Actions that can require approval based on autonomy level
const APPROVAL_ACTIONS = [
  { id: 'send_message', label: 'Send Messages', description: 'WhatsApp, Telegram, Email' },
  { id: 'create_agent', label: 'Create Agents', description: 'Spawn sub-agents' },
  { id: 'delete_file', label: 'Delete Files', description: 'Remove files in workspace' },
  { id: 'external_api', label: 'External API', description: 'Call third-party APIs' },
  { id: 'financial', label: 'Financial Actions', description: 'Any cost-incurring actions' },
  { id: 'data_export', label: 'Data Export', description: 'Export or share data' },
];

const MASTER_CONTACT_CHANNELS: { id: 'email' | 'whatsapp' | 'telegram'; label: string }[] = [
  { id: 'email', label: 'Email' },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'telegram', label: 'Telegram' },
];

const NOTIFY_EVENTS = [
  { id: 'approval_needed', label: 'Approval Needed' },
  { id: 'daily_report', label: 'Daily Report' },
  { id: 'critical_error', label: 'Critical Errors' },
  { id: 'budget_warning', label: 'Budget Warnings' },
  { id: 'task_completed', label: 'Task Completed' },
];

interface ContactOption {
  id: string;
  name: string;
  channel?: string;
}

/**
 * AgenticAIConfigPanel - Configuration panel for Agentic AI platform
 * Allows users to configure CLI type, autonomy level, capabilities, and custom tools
 */
export const AgenticAIConfigPanel: React.FC<AgenticAIConfigPanelProps> = ({
  agentId,
  agentName,
  initialConfig,
  onComplete,
  className,
}) => {
  // Configuration state
  const [cliType, setCliType] = useState<CliType>(initialConfig?.cliType || 'claude');
  const [autonomyLevel, setAutonomyLevel] = useState<AutonomyLevel>(initialConfig?.autonomyLevel || 'semi-autonomous');
  const [capabilities, setCapabilities] = useState<string[]>(
    initialConfig?.capabilities || ['code_execution', 'file_operations', 'rag_access']
  );
  const [customToolsEnabled, setCustomToolsEnabled] = useState(initialConfig?.customToolsEnabled ?? true);
  const [selfImprovementEnabled, setSelfImprovementEnabled] = useState(initialConfig?.selfImprovementEnabled ?? true);
  const [ragAutoUpdateEnabled, setRagAutoUpdateEnabled] = useState(initialConfig?.ragAutoUpdateEnabled ?? true);
  const [maxConcurrentTasks, setMaxConcurrentTasks] = useState(initialConfig?.maxConcurrentTasks?.toString() || '3');
  const [taskTimeout, setTaskTimeout] = useState(initialConfig?.taskTimeout?.toString() || '30000');

  // Workspace info (read-only, from backend)
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [workspacePath, setWorkspacePath] = useState(initialConfig?.workspacePath || '');
  const [contextFilePath, setContextFilePath] = useState(initialConfig?.contextFilePath || '');
  const [customTools, setCustomTools] = useState<CustomTool[]>([]);

  // Persona configuration state
  const [personaEnabled, setPersonaEnabled] = useState(initialConfig?.personaConfig?.enabled ?? true);
  const [personaAutoCreate, setPersonaAutoCreate] = useState(initialConfig?.personaConfig?.autoCreate ?? true);
  const [personaAutoSelect, setPersonaAutoSelect] = useState(initialConfig?.personaConfig?.autoSelect ?? true);
  const [defaultPersonaId, setDefaultPersonaId] = useState<string | undefined>(initialConfig?.personaConfig?.defaultPersonaId);
  const [availablePersonas, setAvailablePersonas] = useState<PersonaOption[]>([]);
  const [isLoadingPersonas, setIsLoadingPersonas] = useState(false);

  // Agentic Profile configuration state (PRD fields)
  const [profileRole, setProfileRole] = useState(initialConfig?.profileRole || '');
  const [systemPrompt, setSystemPrompt] = useState(initialConfig?.systemPrompt || '');
  const [requireApprovalFor, setRequireApprovalFor] = useState<string[]>(
    initialConfig?.requireApprovalFor || []
  );
  const [masterContactId, setMasterContactId] = useState<string | null>(initialConfig?.masterContactId || null);
  const [masterContactChannel, setMasterContactChannel] = useState(initialConfig?.masterContactChannel || 'email');
  const [notifyOn, setNotifyOn] = useState<string[]>(
    initialConfig?.notifyOn || ['approval_needed', 'daily_report', 'critical_error']
  );
  const [availableContacts, setAvailableContacts] = useState<ContactOption[]>([]);
  const [isLoadingContacts, setIsLoadingContacts] = useState(false);

  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingWorkspace, setIsLoadingWorkspace] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [cliAvailability, setCliAvailability] = useState<Record<string, boolean>>({});
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Check CLI availability on mount
  useEffect(() => {
    const checkAvailability = async () => {
      try {
        const response = await api.get('/terminal/types');
        if (response.data?.types) {
          const availability: Record<string, boolean> = {};
          response.data.types.forEach((t: { type: string; installed: boolean }) => {
            availability[t.type] = t.installed;
          });
          setCliAvailability(availability);
        }
      } catch {
        // Default all to available if check fails
        setCliAvailability({ claude: true, gemini: true, opencode: true, bash: true });
      }
    };
    checkAvailability();
  }, []);

  // Load workspace info, personas, and contacts if agentId exists
  useEffect(() => {
    if (agentId) {
      loadWorkspaceInfo();
      loadPersonas();
    }
    loadContacts(); // Always load contacts for master contact selection
  }, [agentId]);

  const loadContacts = async () => {
    setIsLoadingContacts(true);
    try {
      const response = await api.get('/contacts?limit=100');
      if (response.data?.contacts) {
        const contacts: ContactOption[] = response.data.contacts.map((c: { id: string; displayName?: string; display_name?: string; email?: string; phone?: string }) => ({
          id: c.id,
          name: c.displayName || c.display_name || c.email || c.phone || 'Unknown',
          channel: c.email ? 'email' : c.phone ? 'whatsapp' : undefined,
        }));
        setAvailableContacts(contacts);
      }
    } catch {
      // Contacts fetch failed, continue without them
      setAvailableContacts([]);
    } finally {
      setIsLoadingContacts(false);
    }
  };

  const loadPersonas = async () => {
    if (!agentId) return;

    setIsLoadingPersonas(true);
    try {
      const response = await api.get(`/agentic/personas/agent/${agentId}`);
      if (response.data?.personas) {
        const personas: PersonaOption[] = response.data.personas.map((p: PersonaOption) => ({
          id: p.id,
          name: p.name,
          domain: p.domain,
          isActive: p.isActive,
          isDefault: p.isDefault,
        }));
        setAvailablePersonas(personas);

        // Set default persona if one exists
        const defaultP = personas.find((p: PersonaOption) => p.isDefault);
        if (defaultP && !defaultPersonaId) {
          setDefaultPersonaId(defaultP.id);
        }
      }
    } catch {
      // No personas exist yet, that's fine
      setAvailablePersonas([]);
    } finally {
      setIsLoadingPersonas(false);
    }
  };

  const loadWorkspaceInfo = async () => {
    if (!agentId) return;

    setIsLoadingWorkspace(true);
    try {
      const response = await api.get(`/agentic/workspaces/agent/${agentId}`);
      if (response.data?.workspace) {
        const workspace = response.data.workspace;
        setWorkspaceId(workspace.id);
        setWorkspacePath(workspace.workspacePath || '');
        setContextFilePath(workspace.contextFilePath || '');
        setCliType(workspace.cliType || 'claude');
        setAutonomyLevel(workspace.autonomyLevel || 'semi-autonomous');
        setCapabilities(workspace.capabilities || ['code_execution', 'file_operations', 'rag_access']);
        setCustomToolsEnabled(workspace.customToolsEnabled ?? true);
        setSelfImprovementEnabled(workspace.selfImprovementEnabled ?? true);
        setRagAutoUpdateEnabled(workspace.ragAutoUpdateEnabled ?? true);
        // Load custom tools for workspace
        if (workspace.id) {
          try {
            const toolsResponse = await api.get(`/agentic/tools/workspace/${workspace.id}`);
            setCustomTools(toolsResponse.data?.tools || []);
          } catch {
            // Tools fetch failed, continue without them
          }
        }
      }
    } catch {
      // Workspace doesn't exist yet, will be created on save
      setWorkspaceId(null);
    } finally {
      setIsLoadingWorkspace(false);
    }
  };

  const copyToClipboard = useCallback(async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setError('Failed to copy to clipboard');
    }
  }, []);

  const toggleCapability = (capId: string) => {
    setCapabilities(prev =>
      prev.includes(capId)
        ? prev.filter(c => c !== capId)
        : [...prev, capId]
    );
  };

  const handleSubmit = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Validate CLI is available
      if (cliType !== 'bash' && cliAvailability[cliType] === false) {
        setError(`${cliType} CLI is not installed on the server`);
        setIsLoading(false);
        return;
      }

      const personaConfig: PersonaConfig = {
        enabled: personaEnabled,
        autoCreate: personaAutoCreate,
        autoSelect: personaAutoSelect,
        defaultPersonaId: defaultPersonaId,
      };

      // Build approval list - all actions for supervised, selected for semi-autonomous
      const effectiveApprovalFor = autonomyLevel === 'supervised'
        ? APPROVAL_ACTIONS.map(a => a.id)
        : autonomyLevel === 'autonomous'
          ? []
          : requireApprovalFor;

      const config: AgenticAIPlatformConfig = {
        cliType,
        autonomyLevel,
        workspacePath,
        contextFilePath,
        capabilities,
        customToolsEnabled,
        selfImprovementEnabled,
        ragAutoUpdateEnabled,
        maxConcurrentTasks: parseInt(maxConcurrentTasks, 10) || 3,
        taskTimeout: parseInt(taskTimeout, 10) || 30000,
        personaConfig,
        // New profile fields
        profileRole,
        systemPrompt,
        requireApprovalFor: effectiveApprovalFor,
        masterContactId,
        masterContactChannel,
        notifyOn,
      };

      // If agentId exists, create workspace and update agentic profile via API
      if (agentId) {
        // Create/update workspace
        const createPayload = {
          agentId,
          agentName: agentName || `Agent ${agentId}`,
          cliType,
          autonomyLevel,
          capabilities,
          customToolsEnabled,
          selfImprovementEnabled,
          ragAutoUpdateEnabled,
          personaConfig,
        };

        const response = await api.post('/agentic/workspaces', createPayload);
        if (response.data?.workspace) {
          const workspace = response.data.workspace;
          setWorkspaceId(workspace.id);
          config.workspacePath = workspace.workspacePath;
          config.contextFilePath = workspace.contextFilePath;
          setWorkspacePath(workspace.workspacePath || '');
          setContextFilePath(workspace.contextFilePath || '');
        }

        // Update or create agentic profile linked to this agent
        try {
          // First check if profile exists for this agent
          const profileResponse = await api.get(`/agentic/profiles/by-agent/${agentId}`);
          const existingProfile = profileResponse.data?.profile;

          const profileData = {
            name: agentName || `Agent ${agentId}`,
            role: profileRole || 'Agentic AI Agent',
            description: systemPrompt ? systemPrompt.substring(0, 200) : 'Autonomous AI agent',
            autonomyLevel,
            systemPrompt,
            requireApprovalFor: JSON.stringify(effectiveApprovalFor),
            masterContactId,
            masterContactChannel,
            notifyOn: JSON.stringify(notifyOn),
          };

          if (existingProfile?.id) {
            // Update existing profile
            await api.put(`/agentic/profiles/${existingProfile.id}`, profileData);
          } else {
            // Create new profile linked to agent
            await api.post('/agentic/profiles', {
              ...profileData,
              agentId,
            });
          }
        } catch (profileErr) {
          // Profile update failed - log but don't block the main flow
          console.warn('Failed to update agentic profile:', profileErr);
        }
      }

      onComplete(config);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to configure Agentic AI';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const regenerateContextFile = async () => {
    if (!workspaceId) {
      setError('No workspace found. Please save configuration first.');
      return;
    }

    setIsLoading(true);
    try {
      const response = await api.post(`/agentic/workspaces/${workspaceId}/regenerate-context`);
      if (response.data?.contextFilePath) {
        setContextFilePath(response.data.contextFilePath);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to regenerate context file';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-3 rounded-full bg-purple-500/20">
          <Bot className="w-6 h-6 text-purple-400" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-white">Agentic AI Configuration</h3>
          <p className="text-sm text-gray-400">Configure autonomous AI agent execution</p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
          <AlertCircle className="w-5 h-5 text-red-400" />
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* CLI Type Selection */}
      <div className="space-y-3">
        <label className="text-sm font-medium text-gray-300">CLI Agent Type</label>
        <div className="grid grid-cols-2 gap-3">
          {CLI_OPTIONS.map((option) => {
            const isAvailable = cliAvailability[option.type] !== false;
            return (
              <button
                key={option.type}
                type="button"
                onClick={() => isAvailable && setCliType(option.type)}
                disabled={!isAvailable}
                className={cn(
                  'p-4 rounded-lg border text-left transition-all',
                  cliType === option.type
                    ? 'bg-purple-500/20 border-purple-500/50'
                    : isAvailable
                      ? 'bg-slate-800/50 border-slate-600 hover:border-slate-500'
                      : 'bg-slate-800/30 border-slate-700 opacity-50 cursor-not-allowed'
                )}
              >
                <div className="flex items-center gap-3 mb-2">
                  <span className={cliType === option.type ? 'text-purple-400' : 'text-gray-400'}>
                    {option.icon}
                  </span>
                  <span className={cn('font-medium', cliType === option.type ? 'text-purple-300' : 'text-white')}>
                    {option.name}
                  </span>
                  {!isAvailable && (
                    <span className="text-xs text-red-400 ml-auto">Not installed</span>
                  )}
                </div>
                <p className="text-xs text-gray-500">{option.description}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Profile Role */}
      <div className="space-y-3">
        <label className="text-sm font-medium text-gray-300 flex items-center gap-2">
          <UserCog className="w-4 h-4 text-purple-400" />
          Profile Role
        </label>
        <Input
          value={profileRole}
          onChange={(e) => setProfileRole(e.target.value)}
          placeholder="e.g., General Manager, Support Agent, Research Assistant"
          className="bg-slate-800/50 border-slate-600"
        />
        <p className="text-xs text-gray-500">
          Define the agent's role in your organization hierarchy
        </p>
      </div>

      {/* System Prompt */}
      <div className="space-y-3">
        <label className="text-sm font-medium text-gray-300 flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-purple-400" />
          System Prompt
        </label>
        <textarea
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          placeholder="You are an AI assistant specialized in..."
          rows={4}
          className={cn(
            'w-full px-3 py-2 bg-slate-800/50 border border-slate-600 rounded-lg',
            'text-white placeholder-gray-500',
            'focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50',
            'resize-none'
          )}
        />
        <p className="text-xs text-gray-500">
          Base personality and instructions for the AI agent
        </p>
      </div>

      {/* Autonomy Level */}
      <div className="space-y-3">
        <label className="text-sm font-medium text-gray-300">Autonomy Level</label>
        <div className="grid grid-cols-3 gap-3">
          <button
            type="button"
            onClick={() => setAutonomyLevel('supervised')}
            className={cn(
              'p-4 rounded-lg border text-left transition-all',
              autonomyLevel === 'supervised'
                ? 'bg-emerald-500/20 border-emerald-500/50'
                : 'bg-slate-800/50 border-slate-600 hover:border-slate-500'
            )}
          >
            <div className="flex items-center gap-2 mb-2">
              <Settings className={cn('w-5 h-5', autonomyLevel === 'supervised' ? 'text-emerald-400' : 'text-gray-400')} />
              <span className={cn('font-medium text-sm', autonomyLevel === 'supervised' ? 'text-emerald-300' : 'text-white')}>
                Supervised
              </span>
            </div>
            <p className="text-xs text-gray-500">All actions require approval</p>
          </button>

          <button
            type="button"
            onClick={() => setAutonomyLevel('semi-autonomous')}
            className={cn(
              'p-4 rounded-lg border text-left transition-all',
              autonomyLevel === 'semi-autonomous'
                ? 'bg-amber-500/20 border-amber-500/50'
                : 'bg-slate-800/50 border-slate-600 hover:border-slate-500'
            )}
          >
            <div className="flex items-center gap-2 mb-2">
              <Settings className={cn('w-5 h-5', autonomyLevel === 'semi-autonomous' ? 'text-amber-400' : 'text-gray-400')} />
              <span className={cn('font-medium text-sm', autonomyLevel === 'semi-autonomous' ? 'text-amber-300' : 'text-white')}>
                Semi-Auto
              </span>
            </div>
            <p className="text-xs text-gray-500">Routine auto, critical escalated</p>
          </button>

          <button
            type="button"
            onClick={() => setAutonomyLevel('autonomous')}
            className={cn(
              'p-4 rounded-lg border text-left transition-all',
              autonomyLevel === 'autonomous'
                ? 'bg-red-500/20 border-red-500/50'
                : 'bg-slate-800/50 border-slate-600 hover:border-slate-500'
            )}
          >
            <div className="flex items-center gap-2 mb-2">
              <Zap className={cn('w-5 h-5', autonomyLevel === 'autonomous' ? 'text-red-400' : 'text-gray-400')} />
              <span className={cn('font-medium text-sm', autonomyLevel === 'autonomous' ? 'text-red-300' : 'text-white')}>
                Autonomous
              </span>
            </div>
            <p className="text-xs text-gray-500">Full autonomy with limits</p>
          </button>
        </div>
      </div>

      {/* Require Approval For - conditional based on autonomy level */}
      {autonomyLevel !== 'autonomous' && (
        <div className="space-y-3">
          <label className="text-sm font-medium text-gray-300 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-400" />
            Require Approval For
          </label>
          <p className="text-xs text-gray-500">
            {autonomyLevel === 'supervised'
              ? 'All actions require approval in supervised mode'
              : 'Select actions that need approval before execution'}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {APPROVAL_ACTIONS.map((action) => (
              <label
                key={action.id}
                className={cn(
                  'flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all',
                  autonomyLevel === 'supervised' || requireApprovalFor.includes(action.id)
                    ? 'bg-amber-500/10 border-amber-500/30'
                    : 'bg-slate-800/30 border-slate-700 hover:border-slate-600'
                )}
              >
                <input
                  type="checkbox"
                  checked={autonomyLevel === 'supervised' || requireApprovalFor.includes(action.id)}
                  disabled={autonomyLevel === 'supervised'}
                  onChange={() => {
                    if (autonomyLevel !== 'supervised') {
                      setRequireApprovalFor(prev =>
                        prev.includes(action.id)
                          ? prev.filter(a => a !== action.id)
                          : [...prev, action.id]
                      );
                    }
                  }}
                  className="mt-0.5 w-4 h-4 rounded border-slate-600 bg-slate-800 text-amber-500 focus:ring-amber-500"
                />
                <div>
                  <span className={cn(
                    'text-sm font-medium',
                    autonomyLevel === 'supervised' || requireApprovalFor.includes(action.id)
                      ? 'text-amber-300'
                      : 'text-white'
                  )}>
                    {action.label}
                  </span>
                  <p className="text-xs text-gray-500">{action.description}</p>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Master Contact Configuration */}
      <div className="space-y-3">
        <label className="text-sm font-medium text-gray-300 flex items-center gap-2">
          <UserCog className="w-4 h-4 text-sky-400" />
          Master Contact (Superior)
        </label>
        <p className="text-xs text-gray-500">
          Contact who receives approval requests and reports
        </p>

        <div className="space-y-3 p-4 bg-slate-800/30 border border-slate-700 rounded-lg">
          {/* Contact Selection */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Select Contact</label>
            {isLoadingContacts ? (
              <div className="flex items-center gap-2 text-gray-400 p-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Loading contacts...</span>
              </div>
            ) : (
              <select
                value={masterContactId || ''}
                onChange={(e) => setMasterContactId(e.target.value || null)}
                aria-label="Select master contact"
                className="w-full p-2 bg-slate-800 border border-slate-600 rounded text-sm text-white focus:border-sky-500 focus:ring-sky-500"
              >
                <option value="">No master contact</option>
                {availableContacts.map((contact) => (
                  <option key={contact.id} value={contact.id}>
                    {contact.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Channel Selection */}
          {masterContactId && (
            <>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Notification Channel</label>
                <div className="flex gap-2">
                  {MASTER_CONTACT_CHANNELS.map((channel) => (
                    <button
                      key={channel.id}
                      type="button"
                      onClick={() => setMasterContactChannel(channel.id)}
                      className={cn(
                        'px-3 py-1.5 rounded text-sm transition-all',
                        masterContactChannel === channel.id
                          ? 'bg-sky-500/20 border border-sky-500/50 text-sky-300'
                          : 'bg-slate-700 border border-slate-600 text-gray-300 hover:border-slate-500'
                      )}
                    >
                      {channel.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Notify On Events */}
              <div>
                <label className="text-xs text-gray-500 mb-2 block">Notify On</label>
                <div className="flex flex-wrap gap-2">
                  {NOTIFY_EVENTS.map((event) => (
                    <label
                      key={event.id}
                      className={cn(
                        'flex items-center gap-2 px-3 py-1.5 rounded cursor-pointer transition-all',
                        notifyOn.includes(event.id)
                          ? 'bg-sky-500/20 border border-sky-500/30 text-sky-300'
                          : 'bg-slate-700 border border-slate-600 text-gray-300 hover:border-slate-500'
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={notifyOn.includes(event.id)}
                        onChange={() => {
                          setNotifyOn(prev =>
                            prev.includes(event.id)
                              ? prev.filter(e => e !== event.id)
                              : [...prev, event.id]
                          );
                        }}
                        className="w-3 h-3 rounded border-slate-600 bg-slate-800 text-sky-500 focus:ring-sky-500"
                      />
                      <span className="text-xs">{event.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Capabilities */}
      <div className="space-y-3">
        <label className="text-sm font-medium text-gray-300">Capabilities</label>
        <div className="grid grid-cols-2 gap-2">
          {CAPABILITIES.map((cap) => (
            <label
              key={cap.id}
              className={cn(
                'flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all',
                capabilities.includes(cap.id)
                  ? 'bg-sky-500/10 border-sky-500/30'
                  : 'bg-slate-800/30 border-slate-700 hover:border-slate-600'
              )}
            >
              <input
                type="checkbox"
                checked={capabilities.includes(cap.id)}
                onChange={() => toggleCapability(cap.id)}
                className="mt-0.5 w-4 h-4 rounded border-slate-600 bg-slate-800 text-sky-500 focus:ring-sky-500"
              />
              <div>
                <span className={cn('text-sm font-medium', capabilities.includes(cap.id) ? 'text-sky-300' : 'text-white')}>
                  {cap.label}
                </span>
                <p className="text-xs text-gray-500">{cap.description}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Features */}
      <div className="space-y-3">
        <label className="text-sm font-medium text-gray-300">Features</label>
        <div className="space-y-2">
          <label className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/30 border border-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={customToolsEnabled}
              onChange={(e) => setCustomToolsEnabled(e.target.checked)}
              className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-purple-500 focus:ring-purple-500"
            />
            <Wrench className="w-4 h-4 text-purple-400" />
            <div>
              <span className="text-sm font-medium text-white">Custom Tools</span>
              <p className="text-xs text-gray-500">Allow creation of Python tools in workspace</p>
            </div>
          </label>

          <label className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/30 border border-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={selfImprovementEnabled}
              onChange={(e) => setSelfImprovementEnabled(e.target.checked)}
              className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-purple-500 focus:ring-purple-500"
            />
            <Brain className="w-4 h-4 text-purple-400" />
            <div>
              <span className="text-sm font-medium text-white">Self-Improvement</span>
              <p className="text-xs text-gray-500">Learn from execution results and feedback</p>
            </div>
          </label>

          <label className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/30 border border-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={ragAutoUpdateEnabled}
              onChange={(e) => setRagAutoUpdateEnabled(e.target.checked)}
              className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-purple-500 focus:ring-purple-500"
            />
            <Database className="w-4 h-4 text-purple-400" />
            <div>
              <span className="text-sm font-medium text-white">Auto-Update RAG</span>
              <p className="text-xs text-gray-500">Automatically update knowledge base with learned information</p>
            </div>
          </label>
        </div>
      </div>

      {/* Persona System */}
      <div className="space-y-3">
        <label className="text-sm font-medium text-gray-300 flex items-center gap-2">
          <UserCircle2 className="w-4 h-4 text-purple-400" />
          Persona System
        </label>
        <p className="text-xs text-gray-500">
          Enable dynamic personalities that adapt to different task domains.
        </p>

        <div className="space-y-2">
          <label className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/30 border border-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={personaEnabled}
              onChange={(e) => setPersonaEnabled(e.target.checked)}
              className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-purple-500 focus:ring-purple-500"
            />
            <Users className="w-4 h-4 text-purple-400" />
            <div>
              <span className="text-sm font-medium text-white">Enable Persona System</span>
              <p className="text-xs text-gray-500">Use dynamic AI personalities for task execution</p>
            </div>
          </label>

          {personaEnabled && (
            <>
              <label className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/30 border border-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={personaAutoCreate}
                  onChange={(e) => setPersonaAutoCreate(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-purple-500 focus:ring-purple-500"
                />
                <Sparkles className="w-4 h-4 text-amber-400" />
                <div>
                  <span className="text-sm font-medium text-white">Auto-Create Personas</span>
                  <p className="text-xs text-gray-500">Automatically generate personas when no match is found</p>
                </div>
              </label>

              <label className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/30 border border-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={personaAutoSelect}
                  onChange={(e) => setPersonaAutoSelect(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-purple-500 focus:ring-purple-500"
                />
                <Brain className="w-4 h-4 text-emerald-400" />
                <div>
                  <span className="text-sm font-medium text-white">Auto-Select Personas</span>
                  <p className="text-xs text-gray-500">Automatically select best persona based on task domain</p>
                </div>
              </label>

              {/* Default Persona Selection */}
              <div className="p-3 rounded-lg bg-slate-800/30 border border-slate-700">
                <label className="text-xs text-gray-500 mb-2 block">Default Persona</label>
                {isLoadingPersonas ? (
                  <div className="flex items-center gap-2 text-gray-400">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm">Loading personas...</span>
                  </div>
                ) : availablePersonas.length > 0 ? (
                  <select
                    value={defaultPersonaId || ''}
                    onChange={(e) => setDefaultPersonaId(e.target.value || undefined)}
                    aria-label="Select default persona"
                    className="w-full p-2 bg-slate-800 border border-slate-600 rounded text-sm text-white focus:border-purple-500 focus:ring-purple-500"
                  >
                    <option value="">No default (auto-select)</option>
                    {availablePersonas.map((persona) => (
                      <option key={persona.id} value={persona.id}>
                        {persona.name} ({persona.domain.replace(/_/g, ' ')})
                        {persona.isDefault ? ' ★' : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-xs text-gray-500 italic">
                    No personas available yet. They will be created automatically when you execute tasks.
                  </p>
                )}
              </div>

              {/* Persona Stats */}
              {availablePersonas.length > 0 && (
                <div className="p-3 rounded-lg bg-slate-800/30 border border-slate-700">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs text-gray-500">Available Personas</label>
                    <span className="text-xs text-purple-400">{availablePersonas.length} personas</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {availablePersonas.slice(0, 5).map((persona) => (
                      <span
                        key={persona.id}
                        className={cn(
                          'px-2 py-0.5 rounded-full text-xs',
                          persona.isActive
                            ? 'bg-purple-500/20 text-purple-300'
                            : 'bg-slate-700 text-gray-400'
                        )}
                      >
                        {persona.name}
                      </span>
                    ))}
                    {availablePersonas.length > 5 && (
                      <span className="px-2 py-0.5 rounded-full text-xs bg-slate-700 text-gray-400">
                        +{availablePersonas.length - 5} more
                      </span>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Advanced Settings */}
      <div className="border-t border-slate-700 pt-4">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-white"
        >
          <Settings className="w-4 h-4" />
          Advanced Settings
          <span className="text-xs">{showAdvanced ? '▲' : '▼'}</span>
        </button>

        {showAdvanced && (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Max Concurrent Tasks"
                type="number"
                value={maxConcurrentTasks}
                onChange={(e) => setMaxConcurrentTasks(e.target.value)}
                min={1}
                max={10}
                helperText="Maximum parallel task executions"
              />
              <Input
                label="Task Timeout (ms)"
                type="number"
                value={taskTimeout}
                onChange={(e) => setTaskTimeout(e.target.value)}
                min={5000}
                max={300000}
                helperText="Timeout for individual tasks"
              />
            </div>
          </div>
        )}
      </div>

      {/* Workspace Info (if available) */}
      {agentId && (workspacePath || isLoadingWorkspace) && (
        <div className="border-t border-slate-700 pt-4 space-y-4">
          <h4 className="text-sm font-medium text-gray-300 flex items-center gap-2">
            <FolderOpen className="w-4 h-4" />
            Workspace Information
          </h4>

          {isLoadingWorkspace ? (
            <div className="flex items-center gap-2 text-gray-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Loading workspace info...</span>
            </div>
          ) : (
            <>
              {workspacePath && (
                <div className="space-y-2">
                  <label className="text-xs text-gray-500">Workspace Path</label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 p-2 bg-slate-800 border border-slate-600 rounded font-mono text-xs text-gray-300 overflow-x-auto">
                      {workspacePath}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(workspacePath, 'workspace')}
                      icon={copied === 'workspace' ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    />
                  </div>
                </div>
              )}

              {contextFilePath && (
                <div className="space-y-2">
                  <label className="text-xs text-gray-500 flex items-center gap-2">
                    <FileText className="w-3 h-3" />
                    Context File
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 p-2 bg-slate-800 border border-slate-600 rounded font-mono text-xs text-gray-300 overflow-x-auto">
                      {contextFilePath}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(contextFilePath, 'context')}
                      icon={copied === 'context' ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    />
                  </div>
                </div>
              )}

              {workspaceId && (
                <div className="space-y-2">
                  <label className="text-xs text-gray-500">Context File Management</label>
                  <div className="flex items-center gap-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={regenerateContextFile}
                      icon={<RefreshCw className="w-4 h-4" />}
                      loading={isLoading}
                    >
                      Regenerate Context File
                    </Button>
                  </div>
                  <p className="text-xs text-gray-500">
                    The context file contains API credentials and agent instructions.
                    Regenerate to create a new token if compromised.
                  </p>
                </div>
              )}

              {/* Custom Tools List */}
              {customTools.length > 0 && (
                <div className="space-y-2">
                  <label className="text-xs text-gray-500 flex items-center gap-2">
                    <Wrench className="w-3 h-3" />
                    Custom Tools ({customTools.length})
                  </label>
                  <div className="space-y-1">
                    {customTools.map((tool) => (
                      <div
                        key={tool.id}
                        className="flex items-center justify-between p-2 bg-slate-800/50 rounded text-sm"
                      >
                        <span className="text-gray-300">{tool.displayName || tool.name}</span>
                        <span className="text-xs text-gray-500">{tool.executionCount} runs</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Submit Button */}
      <Button
        onClick={handleSubmit}
        loading={isLoading}
        fullWidth
        icon={<CheckCircle className="w-4 h-4" />}
      >
        {agentId ? 'Save Configuration' : 'Configure Agentic AI'}
      </Button>
    </div>
  );
};

AgenticAIConfigPanel.displayName = 'AgenticAIConfigPanel';

export default AgenticAIConfigPanel;
