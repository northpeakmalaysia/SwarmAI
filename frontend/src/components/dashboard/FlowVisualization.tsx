import { useEffect, useState, useCallback } from 'react';
import { Activity, Zap, Circle, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { io, Socket } from 'socket.io-client';

// Flow execution status types
interface FlowExecutionNode {
  id: string;
  name: string;
  type: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt?: string;
  completedAt?: string;
}

interface FlowExecution {
  id: string;
  flowId: string;
  flowName: string;
  status: 'running' | 'completed' | 'failed';
  startedAt: string;
  nodes: FlowExecutionNode[];
  currentNodeId?: string;
}

interface FlowVisualizationProps {
  maxExecutions?: number;
}

// Node type to icon/color mapping
const nodeTypeConfig: Record<string, { color: string; bgColor: string }> = {
  trigger: { color: 'text-amber-400', bgColor: 'bg-amber-500/20' },
  ai: { color: 'text-purple-400', bgColor: 'bg-purple-500/20' },
  condition: { color: 'text-sky-400', bgColor: 'bg-sky-500/20' },
  action: { color: 'text-emerald-400', bgColor: 'bg-emerald-500/20' },
  swarm: { color: 'text-rose-400', bgColor: 'bg-rose-500/20' },
  default: { color: 'text-gray-400', bgColor: 'bg-gray-500/20' },
};

function getNodeConfig(type: string) {
  const category = type.toLowerCase();
  if (category.includes('trigger')) return nodeTypeConfig.trigger;
  if (category.includes('ai') || category.includes('chat') || category.includes('completion')) return nodeTypeConfig.ai;
  if (category.includes('condition') || category.includes('switch') || category.includes('loop')) return nodeTypeConfig.condition;
  if (category.includes('swarm') || category.includes('agent') || category.includes('handoff')) return nodeTypeConfig.swarm;
  return nodeTypeConfig.action;
}

function NodeStatusIcon({ status }: { status: FlowExecutionNode['status'] }) {
  switch (status) {
    case 'running':
      return <Loader2 className="w-3 h-3 animate-spin text-swarm-primary" />;
    case 'completed':
      return <CheckCircle className="w-3 h-3 text-emerald-400" />;
    case 'failed':
      return <XCircle className="w-3 h-3 text-rose-400" />;
    default:
      return <Circle className="w-3 h-3 text-gray-500" />;
  }
}

function FlowExecutionCard({ execution }: { execution: FlowExecution }) {
  const runningNode = execution.nodes.find(n => n.status === 'running');
  const completedCount = execution.nodes.filter(n => n.status === 'completed').length;
  const progress = (completedCount / execution.nodes.length) * 100;

  return (
    <div className="bg-swarm-dark rounded-xl p-3 shadow-neu-pressed-sm border border-swarm-border/30">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Zap className={`w-4 h-4 ${execution.status === 'running' ? 'text-amber-400 animate-pulse' : 'text-emerald-400'}`} />
          <span className="text-sm font-medium text-white truncate max-w-[150px]">
            {execution.flowName}
          </span>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full ${
          execution.status === 'running'
            ? 'bg-amber-500/20 text-amber-400'
            : execution.status === 'completed'
            ? 'bg-emerald-500/20 text-emerald-400'
            : 'bg-rose-500/20 text-rose-400'
        }`}>
          {execution.status}
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-swarm-darker rounded-full overflow-hidden mb-2">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            execution.status === 'running'
              ? 'bg-gradient-to-r from-swarm-primary to-swarm-secondary'
              : execution.status === 'completed'
              ? 'bg-emerald-500'
              : 'bg-rose-500'
          }`}
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Current node */}
      {runningNode && (
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <Loader2 className="w-3 h-3 animate-spin text-swarm-primary" />
          <span>Running: {runningNode.name}</span>
        </div>
      )}

      {/* Node list (collapsed) */}
      <div className="flex items-center gap-1 mt-2 flex-wrap">
        {execution.nodes.slice(0, 6).map((node) => {
          const config = getNodeConfig(node.type);
          return (
            <div
              key={node.id}
              className={`w-6 h-6 rounded flex items-center justify-center ${config.bgColor}`}
              title={`${node.name} (${node.status})`}
            >
              <NodeStatusIcon status={node.status} />
            </div>
          );
        })}
        {execution.nodes.length > 6 && (
          <span className="text-xs text-gray-500">+{execution.nodes.length - 6}</span>
        )}
      </div>
    </div>
  );
}

export function FlowVisualization({ maxExecutions = 3 }: FlowVisualizationProps) {
  const [executions, setExecutions] = useState<FlowExecution[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);

  // Connect to WebSocket
  useEffect(() => {
    const wsUrl = import.meta.env.VITE_WS_URL || window.location.origin;
    const newSocket = io(wsUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    newSocket.on('connect', () => {
      setIsConnected(true);
      console.log('Flow visualization connected to WebSocket');
    });

    newSocket.on('disconnect', () => {
      setIsConnected(false);
    });

    // Listen for flow execution events
    newSocket.on('flow:execution:started', (data: FlowExecution) => {
      setExecutions(prev => {
        const filtered = prev.filter(e => e.id !== data.id);
        return [data, ...filtered].slice(0, maxExecutions);
      });
    });

    newSocket.on('flow:execution:node:started', (data: { executionId: string; nodeId: string }) => {
      setExecutions(prev => prev.map(exec => {
        if (exec.id === data.executionId) {
          return {
            ...exec,
            currentNodeId: data.nodeId,
            nodes: exec.nodes.map(node =>
              node.id === data.nodeId
                ? { ...node, status: 'running' as const, startedAt: new Date().toISOString() }
                : node
            ),
          };
        }
        return exec;
      }));
    });

    newSocket.on('flow:execution:node:completed', (data: { executionId: string; nodeId: string; output?: unknown }) => {
      setExecutions(prev => prev.map(exec => {
        if (exec.id === data.executionId) {
          return {
            ...exec,
            nodes: exec.nodes.map(node =>
              node.id === data.nodeId
                ? { ...node, status: 'completed' as const, completedAt: new Date().toISOString() }
                : node
            ),
          };
        }
        return exec;
      }));
    });

    newSocket.on('flow:execution:node:failed', (data: { executionId: string; nodeId: string; error: string }) => {
      setExecutions(prev => prev.map(exec => {
        if (exec.id === data.executionId) {
          return {
            ...exec,
            nodes: exec.nodes.map(node =>
              node.id === data.nodeId
                ? { ...node, status: 'failed' as const }
                : node
            ),
          };
        }
        return exec;
      }));
    });

    newSocket.on('flow:execution:completed', (data: { executionId: string }) => {
      setExecutions(prev => prev.map(exec =>
        exec.id === data.executionId
          ? { ...exec, status: 'completed' as const }
          : exec
      ));
    });

    newSocket.on('flow:execution:failed', (data: { executionId: string; error: string }) => {
      setExecutions(prev => prev.map(exec =>
        exec.id === data.executionId
          ? { ...exec, status: 'failed' as const }
          : exec
      ));
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [maxExecutions]);

  // Simulate a demo execution for testing (remove in production)
  const simulateExecution = useCallback(() => {
    const demoExecution: FlowExecution = {
      id: `exec-${Date.now()}`,
      flowId: 'demo-flow',
      flowName: 'Customer Support Flow',
      status: 'running',
      startedAt: new Date().toISOString(),
      nodes: [
        { id: 'n1', name: 'Message Trigger', type: 'trigger', status: 'completed' },
        { id: 'n2', name: 'Classify Intent', type: 'ai', status: 'running' },
        { id: 'n3', name: 'Route to Agent', type: 'condition', status: 'pending' },
        { id: 'n4', name: 'Agent Response', type: 'swarm', status: 'pending' },
      ],
      currentNodeId: 'n2',
    };

    setExecutions(prev => [demoExecution, ...prev].slice(0, maxExecutions));

    // Simulate progress
    setTimeout(() => {
      setExecutions(prev => prev.map(exec =>
        exec.id === demoExecution.id
          ? {
              ...exec,
              nodes: exec.nodes.map(n =>
                n.id === 'n2' ? { ...n, status: 'completed' as const } :
                n.id === 'n3' ? { ...n, status: 'running' as const } : n
              ),
              currentNodeId: 'n3',
            }
          : exec
      ));
    }, 2000);

    setTimeout(() => {
      setExecutions(prev => prev.map(exec =>
        exec.id === demoExecution.id
          ? {
              ...exec,
              nodes: exec.nodes.map(n =>
                n.id === 'n3' ? { ...n, status: 'completed' as const } :
                n.id === 'n4' ? { ...n, status: 'running' as const } : n
              ),
              currentNodeId: 'n4',
            }
          : exec
      ));
    }, 4000);

    setTimeout(() => {
      setExecutions(prev => prev.map(exec =>
        exec.id === demoExecution.id
          ? {
              ...exec,
              status: 'completed' as const,
              nodes: exec.nodes.map(n => ({ ...n, status: 'completed' as const })),
            }
          : exec
      ));
    }, 6000);
  }, [maxExecutions]);

  return (
    <div className="bg-swarm-dark rounded-2xl border border-swarm-border/30 p-4 shadow-neu-pressed-glow-purple relative overflow-hidden">
      <div>
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-sm font-medium text-white flex items-center gap-2">
            <Activity className="w-4 h-4 text-swarm-primary" />
            Live Flow Executions
          </h4>
          <div className="flex items-center gap-2">
            {/* Connection status indicator */}
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400' : 'bg-gray-500'}`} />
            <span className="text-xs text-gray-500">
              {isConnected ? 'Live' : 'Offline'}
            </span>
          </div>
        </div>

        {/* Executions list */}
        {executions.length > 0 ? (
          <div className="space-y-3">
            {executions.map(execution => (
              <FlowExecutionCard key={execution.id} execution={execution} />
            ))}
          </div>
        ) : (
          <div className="text-center py-6">
            <Activity className="w-8 h-8 mx-auto mb-2 text-gray-600" />
            <p className="text-xs text-gray-500 mb-3">No active flow executions</p>
            {/* Demo button for testing */}
            <button
              onClick={simulateExecution}
              className="text-xs px-3 py-1.5 bg-swarm-dark hover:bg-swarm-border rounded-lg text-gray-400 transition-colors"
            >
              Simulate Demo Flow
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
