import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Plus,
  Bot,
  Search,
  Filter,
  Grid3X3,
  List,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import { useAgentStore, Agent } from '../stores/agentStore';
import { websocket } from '../services/websocket';
import { api } from '../services/api';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { Badge } from '../components/common/Badge';
import { ConfirmDialog, Modal } from '../components/common';
import {
  AgentCard,
  AgentData,
  CreateAgentModal,
  AgentSettingsModal,
  AgentConfiguration,
  Platform,
  PlatformConfig,
  AgentStatus,
  PlatformSetupWizard,
  OrphanedSessionsPanel,
} from '../components/agents';
import toast from 'react-hot-toast';

/**
 * Filter options
 */
type StatusFilter = 'all' | 'online' | 'offline' | 'busy';
type PlatformFilter = 'all' | Platform;
type ViewMode = 'grid' | 'list';

/**
 * Convert Agent store type to AgentData for AgentCard
 */
const toAgentData = (agent: Agent): AgentData => {
  // Map agent store status to AgentStatus
  const statusMap: Record<string, AgentStatus> = {
    idle: 'idle',
    busy: 'busy',
    offline: 'offline',
  };

  // Map backend platform to frontend Platform type
  // Note: 'agentic-ai' removed - Agentic AI agents are created exclusively in the Agentic module
  const platformMap: Record<string, Platform> = {
    'whatsapp': 'whatsapp',
    'whatsapp-business': 'whatsapp-business',
    'telegram-bot': 'telegram-bot',
    'telegram-user': 'telegram-user',
    'email': 'email',
    'http-api': 'http-api',
  };

  return {
    id: agent.id,
    name: agent.name,
    description: agent.description,
    status: statusMap[agent.status] || 'offline',
    skills: agent.skills,
    model: agent.model,
    avatar: agent.avatar,
    platform: agent.platform ? platformMap[agent.platform] : undefined,
    // Contact identifiers from platform metadata
    phoneNumber: agent.phoneNumber,
    email: agent.email,
    telegramUsername: agent.telegramUsername,
    reputation: {
      score: 0, // No reputation data available - defaults to 0 until earned
      totalInteractions: 0,
    },
    lastActiveAt: agent.updatedAt,
  };
};

/**
 * AgentsPage - Main agent management page
 */
export default function AgentsPage() {
  const {
    agents,
    isLoading,
    fetchAgents,
    createAgent,
    updateAgent,
    deleteAgent,
    activateAgent,
    deactivateAgent,
    reconnectPlatform,
  } = useAgentStore();

  // UI State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; id: string | null }>({
    open: false,
    id: null,
  });
  const [isDeleting, setIsDeleting] = useState(false);
  const [reconnectModal, setReconnectModal] = useState<{ open: boolean; agent: Agent | null }>({
    open: false,
    agent: null,
  });
  const [editModal, setEditModal] = useState<{ open: boolean; agent: Agent | null }>({
    open: false,
    agent: null,
  });
  const [pendingQRData, setPendingQRData] = useState<string | null>(null);
  const [reconnectConfig, setReconnectConfig] = useState<Partial<PlatformConfig> | undefined>(undefined);

  // Fetch existing platform config when reconnect modal opens (for pre-filling email/telegram settings)
  useEffect(() => {
    if (!reconnectModal.open || !reconnectModal.agent) {
      setReconnectConfig(undefined);
      return;
    }
    const agent = reconnectModal.agent;
    const accountId = agent.platformAccountId;
    if (!accountId) return;

    if (agent.platform === 'email') {
      api.get(`/platforms/email/${accountId}`)
        .then((res: any) => {
          const data = res.data;
          setReconnectConfig({
            email: data.email || '',
            imapHost: data.imapHost || '',
            imapPort: data.imapPort || 993,
            smtpHost: data.smtpHost || '',
            smtpPort: data.smtpPort || 587,
            useTLS: true,
          });
        })
        .catch(() => { /* Ignore - form will just be empty */ });
    }
  }, [reconnectModal.open, reconnectModal.agent]);

  // Orphaned sessions state
  const [orphanedCount, setOrphanedCount] = useState(0);
  const [showOrphanedModal, setShowOrphanedModal] = useState(false);

  // Fetch orphaned sessions count
  const fetchOrphanedCount = useCallback(async () => {
    try {
      const response = await api.get<{ count: number }>('/platforms/orphaned-sessions');
      setOrphanedCount(response?.count || 0);
    } catch (err) {
      // Silently fail - not critical
      console.error('Failed to fetch orphaned sessions count:', err);
    }
  }, []);

  // Fetch agents and orphaned count on mount
  useEffect(() => {
    fetchAgents();
    fetchOrphanedCount();
  }, [fetchAgents, fetchOrphanedCount]);

  // Check for pending QR codes after agents load - auto-open modal if found
  useEffect(() => {
    const checkPendingQR = async () => {
      if (agents.length === 0) return;

      try {
        // Fetch platform accounts to check for qr_pending status
        interface PlatformAccount {
          id: string;
          platform: string;
          status: string;
          agentId: string;
        }
        const response = await api.get<{ accounts: PlatformAccount[] }>('/platforms');
        const accounts = response?.accounts || [];

        // Find any platform with qr_pending status
        const pendingPlatform = accounts.find(
          (p) => p.status === 'qr_pending' && p.platform === 'whatsapp'
        );

        if (pendingPlatform) {
          console.log('[AgentsPage] Found pending QR for platform:', pendingPlatform.id);

          // Find the agent for this platform
          const agent = agents.find((a) => a.id === pendingPlatform.agentId);
          if (agent && !reconnectModal.open) {
            console.log('[AgentsPage] Auto-opening QR modal for agent:', agent.name);

            // Fetch the QR code
            try {
              const qrResponse = await api.get<{ qrCode?: string; status?: string }>(
                `/platforms/${agent.id}/whatsapp/qr`
              );
              if (qrResponse?.qrCode) {
                setPendingQRData(qrResponse.qrCode);
              }
            } catch {
              // QR fetch failed, modal will use polling fallback
            }

            setReconnectModal({ open: true, agent });
          }
        }
      } catch (err) {
        console.error('[AgentsPage] Failed to check pending QR:', err);
      }
    };

    // Check after a short delay to let WebSocket connect first
    const timeoutId = setTimeout(checkPendingQR, 2000);
    return () => clearTimeout(timeoutId);
  }, [agents, reconnectModal.open]);

  // Listen for QR code events and auto-popup the modal
  useEffect(() => {
    const unsubscribe = websocket.subscribe<{
      data?: {
        agentId: string;
        status: string;
        qrData?: string;
      };
      agentId?: string;
      status?: string;
      qrData?: string;
    }>('agent:qr', (event) => {
      // Handle both wrapped and unwrapped formats
      const data = event.data || event;
      console.log('[AgentsPage] Received agent:qr event:', data);

      if (data.qrData && data.status === 'ready') {
        // Find the agent for this QR
        const agent = agents.find(a => a.id === data.agentId);
        if (agent) {
          console.log('[AgentsPage] Auto-opening QR modal for agent:', agent.name);
          setPendingQRData(data.qrData);
          setReconnectModal({ open: true, agent });
        }
      }
    });

    return () => unsubscribe();
  }, [agents]);

  // Listen for real-time agent status updates via WebSocket
  useEffect(() => {
    // Listen for platform status changes (connected/disconnected/qr_pending/error)
    const unsubscribePlatform = websocket.subscribe<{
      data?: {
        agentId: string;
        platform: string;
        connected: boolean;
        status: string;
      };
      agentId?: string;
      platform?: string;
      connected?: boolean;
      status?: string;
    }>('agent:platform_status', (event) => {
      const data = event.data || event;
      console.log('[AgentsPage] Received agent:platform_status event:', data);

      // Refresh agents list to get updated status
      fetchAgents();
    });

    // Listen for agent status changes (idle/busy/offline)
    const unsubscribeStatus = websocket.subscribe<{
      data?: {
        agentId: string;
        status: string;
      };
      agentId?: string;
      status?: string;
    }>('agent:status_changed', (event) => {
      const data = event.data || event;
      console.log('[AgentsPage] Received agent:status_changed event:', data);

      // Refresh agents list to get updated status
      fetchAgents();
    });

    return () => {
      unsubscribePlatform();
      unsubscribeStatus();
    };
  }, [fetchAgents]);

  /**
   * Filter agents based on search and filters
   */
  const filteredAgents = useMemo(() => {
    // Defensive check: ensure agents is always an array
    if (!Array.isArray(agents)) {
      console.warn('AgentsPage: agents is not an array', agents);
      return [];
    }
    return agents.filter((agent) => {
      // Search filter
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch =
        !searchQuery ||
        agent.name.toLowerCase().includes(searchLower) ||
        agent.description.toLowerCase().includes(searchLower) ||
        agent.skills.some((skill) => skill.toLowerCase().includes(searchLower));

      // Status filter
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'online' && agent.status === 'idle') ||
        (statusFilter === 'offline' && agent.status === 'offline') ||
        (statusFilter === 'busy' && agent.status === 'busy');

      return matchesSearch && matchesStatus;
    });
  }, [agents, searchQuery, statusFilter]);

  /**
   * Handle create agent
   */
  const handleCreateAgent = useCallback(
    async (config: AgentConfiguration) => {
      try {
        await createAgent({
          name: config.name,
          description: config.description,
          systemPrompt: config.systemPrompt,
          model: config.model,
          provider: config.provider,
          temperature: config.temperature,
          maxTokens: config.maxTokens,
          skills: config.skills,
        });
        toast.success('Agent created successfully');
      } catch {
        toast.error('Failed to create agent');
        throw new Error('Failed to create agent');
      }
    },
    [createAgent]
  );

  /**
   * Handle start agent - for platform agents, open reconnect modal
   */
  const handleStartAgent = useCallback(
    async (id: string) => {
      const agent = agents.find(a => a.id === id);

      // If agent has a platform that requires connection (WhatsApp, Telegram), open reconnect modal
      if (agent?.platform && ['whatsapp', 'whatsapp-business', 'telegram-bot', 'telegram-user', 'email'].includes(agent.platform)) {
        setReconnectModal({ open: true, agent });
        return;
      }

      // Regular agent activation
      try {
        await activateAgent(id);
        toast.success('Agent activated');
      } catch {
        toast.error('Failed to activate agent');
      }
    },
    [activateAgent, agents]
  );

  /**
   * Handle reconnect completion
   */
  const handleReconnectComplete = useCallback(async () => {
    const agentId = reconnectModal.agent?.id;

    // Close dialog first for better UX
    setReconnectModal({ open: false, agent: null });

    // Auto-activate agent after platform connects
    if (agentId) {
      try {
        await activateAgent(agentId);
        toast.success('Platform connected and agent activated');
      } catch (error) {
        console.error('Failed to auto-activate agent:', error);
        toast.error('Platform connected but agent activation failed');
      }
    } else {
      toast.success('Platform connected successfully');
    }

    fetchAgents();
  }, [reconnectModal.agent, activateAgent, fetchAgents]);

  /**
   * Handle stop agent
   */
  const handleStopAgent = useCallback(
    async (id: string) => {
      try {
        await deactivateAgent(id);
        toast.success('Agent deactivated');
      } catch {
        toast.error('Failed to deactivate agent');
      }
    },
    [deactivateAgent]
  );

  /**
   * Handle delete agent click - opens confirm dialog
   */
  const handleDeleteAgentClick = useCallback((id: string) => {
    setDeleteDialog({ open: true, id });
  }, []);

  /**
   * Handle delete agent confirm
   */
  const handleDeleteAgentConfirm = useCallback(async () => {
    if (!deleteDialog.id) return;
    setIsDeleting(true);
    try {
      await deleteAgent(deleteDialog.id);
      toast.success('Agent deleted');
      setDeleteDialog({ open: false, id: null });
    } catch {
      toast.error('Failed to delete agent');
    } finally {
      setIsDeleting(false);
    }
  }, [deleteDialog.id, deleteAgent]);

  /**
   * Handle configure agent
   */
  const handleConfigureAgent = useCallback((agent: Agent) => {
    setEditModal({ open: true, agent });
  }, []);

  /**
   * Get stats
   */
  const stats = useMemo(() => {
    // Defensive check: ensure agents is always an array
    const agentList = Array.isArray(agents) ? agents : [];
    return {
      total: agentList.length,
      online: agentList.filter((a) => a.status === 'idle').length,
      busy: agentList.filter((a) => a.status === 'busy').length,
      offline: agentList.filter((a) => a.status === 'offline').length,
    };
  }, [agents]);

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header-actions">
        <div>
          <h1 className="page-title">Agents</h1>
          <p className="text-gray-400 text-sm mt-1">
            Manage your AI agents across multiple platforms
          </p>
        </div>

        <Button
          onClick={() => setShowCreateModal(true)}
          icon={<Plus className="w-4 h-4" />}
        >
          Create Agent
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
        <div className="bg-swarm-dark rounded-2xl p-4 border border-swarm-border/30 shadow-neu-pressed hover:shadow-neu-pressed-glow transition-all duration-300">
          <div className="text-2xl font-bold text-white">{stats.total}</div>
          <div className="text-sm text-gray-400 mt-1">Total Agents</div>
        </div>
        <div className="bg-swarm-dark rounded-2xl p-4 border border-swarm-border/30 shadow-neu-pressed-glow-emerald">
          <div className="text-2xl font-bold text-emerald-400">{stats.online}</div>
          <div className="text-sm text-gray-400 mt-1">Online</div>
        </div>
        <div className="bg-swarm-dark rounded-2xl p-4 border border-swarm-border/30 shadow-neu-pressed-glow-amber">
          <div className="text-2xl font-bold text-amber-400">{stats.busy}</div>
          <div className="text-sm text-gray-400 mt-1">Busy</div>
        </div>
        <div className="bg-swarm-dark rounded-2xl p-4 border border-swarm-border/30 shadow-neu-pressed">
          <div className="text-2xl font-bold text-gray-400">{stats.offline}</div>
          <div className="text-sm text-gray-400 mt-1">Offline</div>
        </div>
      </div>

      {/* Orphaned Sessions Warning */}
      {orphanedCount > 0 && (
        <div className="mt-6 p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            <div>
              <span className="text-amber-400 font-medium">
                {orphanedCount} orphaned session{orphanedCount > 1 ? 's' : ''} detected
              </span>
              <p className="text-sm text-gray-400 mt-0.5">
                These may cause connection errors after container rebuilds
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowOrphanedModal(true)}
            className="text-amber-400 hover:text-amber-300"
          >
            Clean Up
          </Button>
        </div>
      )}

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mt-6">
        <div className="flex-1">
          <Input
            placeholder="Search agents by name, description, or skills..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            iconLeft={<Search className="w-4 h-4" />}
          />
        </div>

        <div className="flex gap-2">
          {/* Filter toggle */}
          <Button
            variant={showFilters ? 'secondary' : 'ghost'}
            onClick={() => setShowFilters(!showFilters)}
            icon={<Filter className="w-4 h-4" />}
          >
            Filters
          </Button>

          {/* View mode toggle */}
          <div className="flex bg-swarm-dark rounded-lg p-1 border border-swarm-border/30 shadow-neu-pressed-sm">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-md transition-colors ${
                viewMode === 'grid'
                  ? 'bg-swarm-border text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
              title="Grid view"
            >
              <Grid3X3 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-md transition-colors ${
                viewMode === 'list'
                  ? 'bg-swarm-border text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
              title="List view"
            >
              <List className="w-4 h-4" />
            </button>
          </div>

          {/* Refresh */}
          <Button
            variant="ghost"
            onClick={() => fetchAgents()}
            loading={isLoading}
            icon={<RefreshCw className="w-4 h-4" />}
            title="Refresh"
          />
        </div>
      </div>

      {/* Filter bar */}
      {showFilters && (
        <div className="flex flex-wrap gap-2 p-4 mt-4 bg-swarm-dark border border-swarm-border/30 rounded-xl shadow-neu-pressed-sm">
          <span className="text-sm text-gray-400 mr-2">Status:</span>
          {(['all', 'online', 'busy', 'offline'] as StatusFilter[]).map((status) => (
            <Badge
              key={status}
              variant={statusFilter === status ? 'info' : 'default'}
              className="cursor-pointer"
              onClick={() => setStatusFilter(status)}
            >
              {status === 'all' ? 'All' : status.charAt(0).toUpperCase() + status.slice(1)}
            </Badge>
          ))}
        </div>
      )}

      {/* Agents Grid/List */}
      {isLoading && agents.length === 0 ? (
        <div className="flex items-center justify-center py-16 mt-6">
          <div className="flex items-center gap-3 text-gray-400">
            <RefreshCw className="w-5 h-5 animate-spin" />
            <span>Loading agents...</span>
          </div>
        </div>
      ) : filteredAgents.length > 0 ? (
        <div
          className={`mt-6 ${
            viewMode === 'grid'
              ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'
              : 'flex flex-col gap-4'
          }`}
        >
          {filteredAgents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={toAgentData(agent)}
              onStart={() => handleStartAgent(agent.id)}
              onStop={() => handleStopAgent(agent.id)}
              onConfigure={() => handleConfigureAgent(agent)}
              onDelete={() => handleDeleteAgentClick(agent.id)}
            />
          ))}
        </div>
      ) : (
        /* Empty state */
        <div className="bg-swarm-dark rounded-2xl border border-swarm-border/30 shadow-neu-pressed mt-6 py-16 px-4">
          <div className="flex flex-col items-center justify-center">
            <div className="w-20 h-20 rounded-full bg-swarm-darker flex items-center justify-center mb-6 shadow-neu-pressed-sm">
              <Bot className="w-10 h-10 text-gray-600" />
            </div>

            {searchQuery || statusFilter !== 'all' ? (
              <>
                <h3 className="text-lg font-semibold text-white mb-2">No agents found</h3>
                <p className="text-gray-400 text-center mb-6 max-w-md">
                  No agents match your current search or filter criteria.
                  Try adjusting your search or clearing filters.
                </p>
                <div className="flex gap-3">
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setSearchQuery('');
                      setStatusFilter('all');
                    }}
                  >
                    Clear Filters
                  </Button>
                </div>
              </>
            ) : (
              <>
                <h3 className="text-lg font-semibold text-white mb-2">No agents yet</h3>
                <p className="text-gray-400 text-center mb-6 max-w-md">
                  Create your first AI agent to start handling conversations
                  across WhatsApp, Telegram, and Email.
                </p>
                <Button
                  onClick={() => setShowCreateModal(true)}
                  icon={<Plus className="w-4 h-4" />}
                >
                  Create Your First Agent
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Create Agent Modal */}
      <CreateAgentModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreate={handleCreateAgent}
        onAgentCreated={() => fetchAgents()}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deleteDialog.open}
        onClose={() => setDeleteDialog({ open: false, id: null })}
        onConfirm={handleDeleteAgentConfirm}
        title="Delete Agent"
        message="Are you sure you want to delete this agent? This action cannot be undone."
        confirmText="Delete"
        variant="danger"
        loading={isDeleting}
      />

      {/* Reconnect Platform Modal */}
      <Modal
        open={reconnectModal.open}
        onClose={() => {
          setReconnectModal({ open: false, agent: null });
          setPendingQRData(null);
        }}
        title={`Reconnect ${reconnectModal.agent?.name || 'Agent'}`}
        size="md"
      >
        {reconnectModal.agent?.platform && (
          <PlatformSetupWizard
            platform={reconnectModal.agent.platform as Platform}
            agentId={reconnectModal.agent.id}
            initialConfig={reconnectConfig}
            initialQRData={pendingQRData || undefined}
            onComplete={handleReconnectComplete}
            onBack={() => {
              setReconnectModal({ open: false, agent: null });
              setPendingQRData(null);
            }}
          />
        )}
      </Modal>

      {/* Edit Agent Modal */}
      <AgentSettingsModal
        open={editModal.open}
        agent={editModal.agent}
        onClose={() => setEditModal({ open: false, agent: null })}
        onUpdate={async (id, updates) => {
          const result = await updateAgent(id, updates);
          toast.success('Agent updated successfully');
          return result;
        }}
      />

      {/* Orphaned Sessions Modal */}
      <Modal
        open={showOrphanedModal}
        onClose={() => setShowOrphanedModal(false)}
        title="Orphaned Sessions"
        size="lg"
      >
        <OrphanedSessionsPanel
          onComplete={() => {
            setShowOrphanedModal(false);
            fetchOrphanedCount();
          }}
        />
      </Modal>
    </div>
  );
}
