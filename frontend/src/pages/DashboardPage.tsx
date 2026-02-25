import { useEffect, useMemo, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bot,
  Share2,
  MessageSquare,
  GitBranch,
  Coins,
  Plus,
  RefreshCw,
  Brain,
  LayoutDashboard,
} from 'lucide-react';
import { useDashboardStore } from '../stores/dashboardStore';
import { SuperBrainLogPanel } from '../components/superbrain';
import { useAgentStore } from '../stores/agentStore';
import { useSwarmUpdates } from '../hooks/useSwarmUpdates';
import { useAgentStatus } from '../hooks/useAgentStatus';
import { websocket } from '../services/websocket';
import api from '../services/api';
import {
  StatCard,
  AgentCard,
  SwarmHealthPanel,
  RecentHandoffs,
  CollectiveLearnings,
  FlowVisualization,
  SchedulerPanel,
  DeliveryQueuePanel,
  PlatformHealthPanel,
  type AgentCardData,
  type Handoff,
  type Learning,
} from '../components/dashboard';

// Color palette for agents based on index
const agentColorPalette = ['emerald', 'sky', 'rose', 'amber', 'purple', 'blue'];

type TabValue = 'overview' | 'superbrain-log';

export default function DashboardPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabValue>('overview');
  const {
    agents: dashboardAgents,
    stats,
    swarmHealth,
    recentHandoffs: apiHandoffs,
    isLoading,
    fetchDashboardStats,
  } = useDashboardStore();
  const { activateAgent } = useAgentStore();

  // Memoized refresh callback for realtime updates
  const handleRealtimeUpdate = useCallback(() => {
    console.log('[Dashboard] Realtime update triggered, refreshing stats...');
    fetchDashboardStats();
  }, [fetchDashboardStats]);

  // Subscribe to swarm updates (tasks, handoffs, consensus, collaboration)
  useSwarmUpdates({
    onTaskUpdate: handleRealtimeUpdate,
    onTaskCreated: handleRealtimeUpdate,
    onHandoff: handleRealtimeUpdate,
    onCollaboration: (collaboration) => {
      if (collaboration.type === 'started' || collaboration.type === 'completed') {
        handleRealtimeUpdate();
      }
    },
  });

  // Subscribe to agent status updates
  useAgentStatus();

  // Subscribe to dashboard-specific events
  useEffect(() => {
    // Subscribe to agent status changes to update dashboard counts
    const unsubscribeAgentStatus = websocket.subscribe<{
      agentId: string;
      status: string;
      previousStatus?: string;
    }>('agent:status_changed', (data) => {
      console.log('[Dashboard] Agent status changed:', data.agentId, data.status);
      handleRealtimeUpdate();
    });

    // Subscribe to agent created events
    const unsubscribeAgentCreated = websocket.subscribe<{
      agentId: string;
      name: string;
    }>('agent:created', (data) => {
      console.log('[Dashboard] Agent created:', data.agentId, data.name);
      handleRealtimeUpdate();
    });

    // Subscribe to agent deleted events
    const unsubscribeAgentDeleted = websocket.subscribe<{
      agentId: string;
    }>('agent:deleted', (data) => {
      console.log('[Dashboard] Agent deleted:', data.agentId);
      handleRealtimeUpdate();
    });

    // Subscribe to new messages for message count updates
    const unsubscribeMessage = websocket.subscribe<{
      conversationId: string;
      agentId: string;
    }>('message:new', () => {
      console.log('[Dashboard] New message received, refreshing stats...');
      handleRealtimeUpdate();
    });

    // Subscribe to flow execution updates
    const unsubscribeFlowUpdate = websocket.subscribe<{
      executionId: string;
      status: string;
    }>('flow:execution_update', () => {
      console.log('[Dashboard] Flow execution update, refreshing stats...');
      handleRealtimeUpdate();
    });

    // Subscribe to platform status changes (WhatsApp, Telegram connection status)
    const unsubscribePlatformStatus = websocket.subscribe<{
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
      console.log('[Dashboard] Platform status changed:', data.agentId, data.status);
      handleRealtimeUpdate();
    });

    return () => {
      unsubscribeAgentStatus();
      unsubscribeAgentCreated();
      unsubscribeAgentDeleted();
      unsubscribeMessage();
      unsubscribeFlowUpdate();
      unsubscribePlatformStatus();
    };
  }, [handleRealtimeUpdate]);

  // Initial data fetch
  useEffect(() => {
    fetchDashboardStats();
  }, [fetchDashboardStats]);

  // Transform dashboard agents to AgentCardData format with real data
  const agentCards: AgentCardData[] = useMemo(() => {
    // Ensure dashboardAgents is an array (API might return object or undefined)
    const agentsArray = Array.isArray(dashboardAgents) ? dashboardAgents : [];
    return agentsArray.slice(0, 4).map((agent) => {
      // Determine platform from agent systemPrompt
      let platform: AgentCardData['platform'] = 'other';
      const prompt = agent.systemPrompt?.toLowerCase() || '';
      if (prompt.includes('whatsapp')) {
        platform = 'whatsapp';
      } else if (prompt.includes('telegram')) {
        platform = 'telegram';
      } else if (prompt.includes('email')) {
        platform = 'email';
      } else if (prompt.includes('slack')) {
        platform = 'slack';
      }

      return {
        id: agent.id,
        name: agent.name,
        platform,
        contact: agent.model || 'AI Agent',
        status: agent.status === 'offline' ? 'offline' : agent.status === 'busy' ? 'swarming' : 'idle',
        messageCount: agent.messageCount, // Real data from API
        chatCount: agent.conversationCount, // Real data from API
        skills: agent.skills.length > 0 ? agent.skills : ['General'],
        reputationScore: agent.reputationScore, // Real data from API
        lastSeen: agent.status === 'offline' ? 'offline' : undefined,
        // Platform info for sync functionality
        platformAccountId: agent.platformAccountId,
        platformStatus: agent.platformStatus,
      };
    });
  }, [dashboardAgents]);

  // Transform API handoffs to component format with colors
  const recentHandoffs: Handoff[] = useMemo(() => {
    if (!apiHandoffs || apiHandoffs.length === 0) return [];

    // Create a map of agent IDs to colors
    const agentColorMap = new Map<string, string>();
    let colorIndex = 0;

    return apiHandoffs.map((handoff) => {
      // Assign colors to agents if not already assigned
      if (!agentColorMap.has(handoff.fromAgent.id)) {
        agentColorMap.set(handoff.fromAgent.id, agentColorPalette[colorIndex % agentColorPalette.length]);
        colorIndex++;
      }
      if (!agentColorMap.has(handoff.toAgent.id)) {
        agentColorMap.set(handoff.toAgent.id, agentColorPalette[colorIndex % agentColorPalette.length]);
        colorIndex++;
      }

      return {
        id: handoff.id,
        fromAgent: {
          name: handoff.fromAgent.name,
          color: agentColorMap.get(handoff.fromAgent.id) || 'emerald',
        },
        toAgent: {
          name: handoff.toAgent.name,
          color: agentColorMap.get(handoff.toAgent.id) || 'sky',
        },
        timestamp: handoff.timestamp,
      };
    });
  }, [apiHandoffs]);

  // Collective Learnings - feature not yet implemented in backend
  // Show empty state until the feature is built
  const learnings: Learning[] = [];

  // Format AI cost display
  const formatCost = (cost: number) => {
    if (cost === 0) return '$0.00';
    if (cost < 0.01) return `$${cost.toFixed(4)}`;
    return `$${cost.toFixed(2)}`;
  };

  const handleRefresh = () => {
    fetchDashboardStats();
  };

  const handleReconnect = async (agentId: string) => {
    try {
      await activateAgent(agentId);
      fetchDashboardStats(); // Refresh dashboard after reconnect
    } catch (error) {
      console.error('Failed to reconnect agent:', error);
    }
  };

  const handleSync = async (platformAccountId: string) => {
    try {
      const response = await api.post(`/platforms/${platformAccountId}/sync`);
      console.log('[Dashboard] Sync completed:', response.data);
      fetchDashboardStats(); // Refresh dashboard after sync
    } catch (error) {
      console.error('Failed to sync platform:', error);
    }
  };

  return (
    <div className="page-container">
      {/* Header with tabs */}
      <div className="page-header-actions">
        <div className="flex items-center gap-4">
          {/* Tab Buttons */}
          <div className="flex bg-swarm-card rounded-lg p-1 border border-swarm-border">
            <button
              type="button"
              onClick={() => setActiveTab('overview')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${
                activeTab === 'overview'
                  ? 'bg-swarm-primary text-white'
                  : 'text-gray-400 hover:text-white hover:bg-swarm-border/50'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              Dashboard
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('superbrain-log')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${
                activeTab === 'superbrain-log'
                  ? 'bg-swarm-primary text-white'
                  : 'text-gray-400 hover:text-white hover:bg-swarm-border/50'
              }`}
            >
              <Brain className="w-4 h-4" />
              SuperBrain Log
            </button>
          </div>
        </div>
        {activeTab === 'overview' && (
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isLoading}
            className="px-3 py-1.5 bg-swarm-card hover:bg-swarm-border rounded-lg text-sm font-medium transition-colors flex items-center gap-2 text-gray-300 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        )}
      </div>

      {/* SuperBrain Log Tab */}
      {activeTab === 'superbrain-log' && (
        <div className="h-[calc(100vh-12rem)] -mx-3 sm:-mx-4 md:-mx-6 -mb-3 sm:-mb-4 md:-mb-6">
          <SuperBrainLogPanel />
        </div>
      )}

      {/* Dashboard Overview Tab */}
      {activeTab === 'overview' && (
        <>


      {/* Stats Row - 5 cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 page-section">
        <StatCard
          title="Total Agents"
          value={stats?.totalAgents || 0}
          subtitle={undefined}
          subtitleColor="emerald"
          icon={<Bot className="w-4 h-4" />}
          iconColor="text-swarm-primary"
        />
        <StatCard
          title="Swarming"
          value={stats?.activeAgents || 0}
          subtitle={stats && stats.totalAgents > 0
            ? `${Math.round((stats.activeAgents / stats.totalAgents) * 100)}% connected`
            : undefined
          }
          subtitleColor="gray"
          icon={<Share2 className="w-4 h-4" />}
          iconColor="text-swarm-secondary"
        />
        <StatCard
          title="Messages Today"
          value={stats?.messagesToday || 0}
          subtitle={undefined}
          subtitleColor="emerald"
          icon={<MessageSquare className="w-4 h-4" />}
          iconColor="text-swarm-accent"
        />
        <StatCard
          title="Active Flows"
          value={stats?.activeTasks || 0}
          subtitle={stats?.activeTasks && stats.activeTasks > 0
            ? `${stats.activeTasks} running now`
            : undefined
          }
          subtitleColor="gray"
          icon={<GitBranch className="w-4 h-4" />}
          iconColor="text-amber-400"
        />
        <StatCard
          title="AI Cost Today"
          value={formatCost(stats?.aiCostToday || 0)}
          subtitle={stats?.aiTokensToday
            ? `${stats.aiTokensToday.toLocaleString()} tokens`
            : undefined
          }
          subtitleColor="gray"
          icon={<Coins className="w-4 h-4" />}
          iconColor="text-yellow-400"
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid-standard grid-cols-1 lg:grid-cols-3">
        {/* Active Agents Section - 2 columns */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between section-title">
            <h2 className="text-lg font-semibold text-white m-0">Active Agents</h2>
            <button
              type="button"
              onClick={() => navigate('/agents')}
              className="px-3 py-1.5 bg-swarm-primary hover:bg-swarm-primary/80 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 text-white"
            >
              <Plus className="w-4 h-4" />
              New Agent
            </button>
          </div>

          {Array.isArray(dashboardAgents) && dashboardAgents.length > 0 ? (
            <div className="grid-compact grid-cols-1 md:grid-cols-2">
              {agentCards.map((agent) => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  onReconnect={() => handleReconnect(agent.id)}
                  onSync={agent.platformAccountId ? () => handleSync(agent.platformAccountId!) : undefined}
                />
              ))}
            </div>
          ) : (
            <div className="bg-swarm-card rounded-xl border border-swarm-border p-8 text-center">
              <Bot className="w-12 h-12 mx-auto mb-4 text-gray-500" />
              <h3 className="text-lg font-medium text-white mb-2">No agents created yet</h3>
              <p className="text-gray-400 mb-4">Create your first agent to start building your swarm</p>
              <button
                type="button"
                onClick={() => navigate('/agents')}
                className="px-4 py-2 bg-swarm-primary hover:bg-swarm-primary/80 rounded-lg text-sm font-medium transition-colors text-white"
              >
                Create Agent
              </button>
            </div>
          )}
        </div>

        {/* Swarm Health Panel - 1 column */}
        <div className="space-y-4">
          <SwarmHealthPanel
            connectivity={swarmHealth?.connectivity || 0}
            averageLoad={swarmHealth?.averageLoad || 0}
            collaborationRate={swarmHealth?.collaborationRate || 0}
            consensusSuccess={swarmHealth?.consensusSuccess || 0}
          />

          {/* Platform Health */}
          <PlatformHealthPanel />

          {/* Scheduled Flows */}
          <SchedulerPanel maxSchedules={3} />

          {/* Delivery Queue Status */}
          <DeliveryQueuePanel />

          {/* Recent Handoffs */}
          <div className="bg-swarm-dark rounded-2xl border border-swarm-border/30 p-4 shadow-neu-pressed-glow-amber">
            <RecentHandoffs handoffs={recentHandoffs} />
          </div>

          {/* Collective Learnings */}
          <div className="bg-swarm-dark rounded-2xl border border-swarm-border/30 p-4 shadow-neu-pressed-glow-emerald">
            <CollectiveLearnings learnings={learnings} />
          </div>

          {/* Live Flow Executions */}
          <FlowVisualization maxExecutions={3} />
        </div>
      </div>
        </>
      )}
    </div>
  );
}
