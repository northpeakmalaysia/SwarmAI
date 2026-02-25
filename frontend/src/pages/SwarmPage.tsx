import { useEffect, useState, useCallback } from 'react';
import { Network, Play, Pause, RefreshCw, Settings, Plus, Vote } from 'lucide-react';
import { useSwarmStore } from '../stores/swarmStore';
import { useAgentStore, type Agent } from '../stores/agentStore';
import { Card, CardHeader, CardBody } from '../components/common';
import {
  SwarmHealthMetrics,
  AgentStatusGrid,
  CollaborationGraph,
  HandoffQueue,
  ConsensusPanel,
  TaskList,
  SwarmVisualization,
  CreateTaskModal,
  CreateConsensusModal,
} from '../components/swarm';

type ViewMode = 'dashboard' | 'visualization';

export default function SwarmPage() {
  const { status, tasks, fetchStatus, fetchTasks, fetchConsensus } = useSwarmStore();
  const { agents, fetchAgents, selectAgent } = useAgentStore();
  const [isPaused, setIsPaused] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('dashboard');
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [showCreateConsensus, setShowCreateConsensus] = useState(false);

  useEffect(() => {
    fetchStatus();
    fetchTasks();
    fetchConsensus();
    fetchAgents();

    const interval = setInterval(() => {
      if (!isPaused) {
        fetchStatus();
        fetchTasks();
        fetchConsensus();
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [fetchStatus, fetchTasks, fetchConsensus, fetchAgents, isPaused]);

  const handleRefresh = useCallback(() => {
    fetchStatus();
    fetchTasks();
    fetchConsensus();
    fetchAgents();
  }, [fetchStatus, fetchTasks, fetchConsensus, fetchAgents]);

  const handleAgentClick = useCallback((agent: Agent) => {
    selectAgent(agent);
    // Could navigate to agent details or open a modal
  }, [selectAgent]);

  return (
    <div className="page-container-full overflow-auto">
      {/* Header */}
      <div className="page-header-actions">
        <div>
          <h1 className="page-title">Swarm Intelligence</h1>
          <p className="page-subtitle">
            Monitor and manage multi-agent collaboration
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* View mode toggle */}
          <div className="flex bg-slate-800 rounded-lg p-1">
            <button
              onClick={() => setViewMode('dashboard')}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                viewMode === 'dashboard'
                  ? 'bg-sky-500/20 text-sky-400'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Dashboard
            </button>
            <button
              onClick={() => setViewMode('visualization')}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                viewMode === 'visualization'
                  ? 'bg-sky-500/20 text-sky-400'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Visualization
            </button>
          </div>

          <button
            onClick={() => setIsPaused(!isPaused)}
            className="btn-secondary flex items-center gap-2"
          >
            {isPaused ? (
              <>
                <Play className="w-4 h-4" />
                Resume
              </>
            ) : (
              <>
                <Pause className="w-4 h-4" />
                Pause
              </>
            )}
          </button>
          <button
            type="button"
            onClick={handleRefresh}
            className="btn-ghost flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>

          {/* Create buttons */}
          <div className="flex gap-2 ml-2 pl-2 border-l border-slate-700">
            <button
              type="button"
              onClick={() => setShowCreateTask(true)}
              className="btn-primary flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              New Task
            </button>
            <button
              type="button"
              onClick={() => setShowCreateConsensus(true)}
              className="px-3 py-1.5 bg-purple-500 hover:bg-purple-600 text-white text-sm rounded-lg transition-colors flex items-center gap-2"
            >
              <Vote className="w-4 h-4" />
              New Vote
            </button>
          </div>
        </div>
      </div>

      {viewMode === 'dashboard' ? (
        /* Dashboard View */
        <div className="stack-lg">
          {/* Health Metrics */}
          <SwarmHealthMetrics />

          {/* Agent Status & Collaboration Network */}
          <div className="grid-standard grid-cols-1 lg:grid-cols-2">
            <Card noPadding>
              <CardHeader
                title="Agent Status"
                subtitle={`${agents.filter((a) => a.status !== 'offline').length} of ${agents.length} online`}
                action={
                  <button className="p-1.5 hover:bg-slate-700 rounded-lg transition-colors">
                    <Settings className="w-4 h-4 text-gray-400" />
                  </button>
                }
                className="px-4 pt-4"
              />
              <CardBody className="px-4 pb-4">
                <AgentStatusGrid onAgentClick={handleAgentClick} />
              </CardBody>
            </Card>

            <Card noPadding>
              <CardHeader
                title="Collaboration Network"
                subtitle="Agent interaction patterns"
                className="px-4 pt-4"
              />
              <CardBody noPadding className="h-[280px]">
                <CollaborationGraph />
              </CardBody>
            </Card>
          </div>

          {/* Handoffs, Consensus, Tasks */}
          <div className="grid-standard grid-cols-1 lg:grid-cols-3">
            <Card noPadding>
              <CardHeader
                title="Handoffs"
                subtitle="Agent transfers"
                className="px-4 pt-4"
              />
              <CardBody className="px-4 pb-4 max-h-[400px] overflow-y-auto">
                <HandoffQueue maxItems={4} />
              </CardBody>
            </Card>

            <Card noPadding>
              <CardHeader
                title="Consensus Votes"
                subtitle="Agent decisions"
                className="px-4 pt-4"
              />
              <CardBody className="px-4 pb-4 max-h-[400px] overflow-y-auto">
                <ConsensusPanel maxItems={3} />
              </CardBody>
            </Card>

            <Card noPadding>
              <CardHeader
                title="Active Tasks"
                subtitle={`${status?.activeTasks || 0} in progress`}
                className="px-4 pt-4"
              />
              <CardBody className="px-4 pb-4 max-h-[400px] overflow-y-auto">
                <TaskList maxItems={4} />
              </CardBody>
            </Card>
          </div>
        </div>
      ) : (
        /* Visualization View */
        <div className="flex-1 flex flex-col stack-lg">
          {/* Quick status cards */}
          <div className="stats-grid">
            <div className="card py-4">
              <div className="text-center">
                <p className="text-3xl font-bold text-primary-400">
                  {status?.activeAgents || 0}
                </p>
                <p className="text-sm text-gray-400">Active Agents</p>
              </div>
            </div>
            <div className="card py-4">
              <div className="text-center">
                <p className="text-3xl font-bold text-yellow-400">
                  {status?.activeTasks || 0}
                </p>
                <p className="text-sm text-gray-400">Active Tasks</p>
              </div>
            </div>
            <div className="card py-4">
              <div className="text-center">
                <p className="text-3xl font-bold text-green-400">
                  {status?.completedTasks || 0}
                </p>
                <p className="text-sm text-gray-400">Completed</p>
              </div>
            </div>
            <div className="card py-4">
              <div className="text-center">
                <p className="text-3xl font-bold text-purple-400">
                  {status?.collaborations || 0}
                </p>
                <p className="text-sm text-gray-400">Collaborations</p>
              </div>
            </div>
          </div>

          {/* Main visualization */}
          <div className="flex-1 card min-h-[500px]">
            {agents.length > 0 ? (
              <SwarmVisualization agents={agents} tasks={tasks} isPaused={isPaused} />
            ) : (
              <div className="h-full flex items-center justify-center">
                <div className="text-center">
                  <Network className="w-16 h-16 mx-auto text-gray-600 mb-4" />
                  <h3 className="text-lg font-medium text-gray-400">
                    No agents in swarm
                  </h3>
                  <p className="text-gray-500 mt-2">
                    Create agents to visualize the swarm network
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create Task Modal */}
      <CreateTaskModal
        open={showCreateTask}
        onClose={() => setShowCreateTask(false)}
        onCreated={() => {
          fetchTasks();
          fetchStatus();
        }}
      />

      {/* Create Consensus Modal */}
      <CreateConsensusModal
        open={showCreateConsensus}
        onClose={() => setShowCreateConsensus(false)}
        onCreated={() => {
          fetchConsensus();
        }}
      />
    </div>
  );
}
