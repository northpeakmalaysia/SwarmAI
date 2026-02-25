import React, { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import {
  Users,
  Search,
  Radio,
  ArrowRightLeft,
  Vote,
  ListTodo,
  Activity,
  Network
} from 'lucide-react';
import { cn } from '../../../lib/utils';

export interface SwarmNodeData {
  label: string;
  subtype: 'agent_query' | 'swarm_broadcast' | 'agent_handoff' | 'swarm_consensus' | 'swarm_task' | 'find_agent' | 'swarm_status';
  description?: string;
  config?: Record<string, unknown>;
  status?: 'idle' | 'running' | 'success' | 'error';
  agentCount?: number;
}

const subtypeConfig: Record<SwarmNodeData['subtype'], { icon: React.ElementType; label: string }> = {
  agent_query: { icon: Search, label: 'Query Agent' },
  swarm_broadcast: { icon: Radio, label: 'Broadcast' },
  agent_handoff: { icon: ArrowRightLeft, label: 'Handoff' },
  swarm_consensus: { icon: Vote, label: 'Consensus' },
  swarm_task: { icon: ListTodo, label: 'Swarm Task' },
  find_agent: { icon: Search, label: 'Find Agent' },
  swarm_status: { icon: Activity, label: 'Swarm Status' },
};

const statusColors = {
  idle: 'bg-gray-500',
  running: 'bg-cyan-500 animate-pulse',
  success: 'bg-green-500',
  error: 'bg-red-500',
};

const SwarmNode: React.FC<NodeProps> = ({ data, selected }) => {
  const nodeData = data as unknown as SwarmNodeData;
  const config = subtypeConfig[nodeData.subtype] || subtypeConfig.agent_query;
  const Icon = config.icon;
  const isConsensus = nodeData.subtype === 'swarm_consensus';
  const isBroadcast = nodeData.subtype === 'swarm_broadcast';

  return (
    <div
      className={cn(
        'flow-node bg-slate-800 border-2 rounded-lg p-3 min-w-[180px] max-w-[220px]',
        'transition-all duration-200 cursor-grab active:cursor-grabbing',
        'hover:translate-y-[-2px] hover:shadow-lg hover:shadow-cyan-500/20',
        selected
          ? 'border-cyan-500 shadow-lg shadow-cyan-500/30'
          : 'border-cyan-500/50 hover:border-cyan-400'
      )}
    >
      {/* Input Handle */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-cyan-600 !border-2 !border-cyan-400 hover:!scale-125 transition-transform"
      />

      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <div className="w-8 h-8 rounded bg-cyan-500/20 flex items-center justify-center flex-shrink-0 relative">
          <Icon className="w-4 h-4 text-cyan-400" />
          {(isBroadcast || isConsensus) && (
            <Users className="w-3 h-3 text-cyan-300 absolute -top-1 -right-1" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-white font-medium text-sm truncate">
            {nodeData.label || config.label}
          </div>
          <div className="text-xs text-cyan-400/70 flex items-center gap-1">
            <Network className="w-3 h-3" />
            Swarm
          </div>
        </div>
        {nodeData.status && (
          <div
            className={cn(
              'w-2 h-2 rounded-full flex-shrink-0',
              statusColors[nodeData.status]
            )}
          />
        )}
      </div>

      {/* Subtype Label */}
      <div className="text-xs text-gray-400 mb-2 truncate">
        {config.label}
      </div>

      {/* Agent Count Badge */}
      {nodeData.agentCount !== undefined && nodeData.agentCount > 0 && (
        <div className="text-[10px] text-cyan-300 bg-cyan-500/10 rounded px-2 py-0.5 mb-2 inline-flex items-center gap-1">
          <Users className="w-3 h-3" />
          {nodeData.agentCount} agent{nodeData.agentCount > 1 ? 's' : ''}
        </div>
      )}

      {/* Config Preview */}
      {nodeData.config && Object.keys(nodeData.config).length > 0 && (
        <div className="text-[10px] text-gray-500 bg-slate-900/50 rounded px-2 py-1 truncate">
          {Object.entries(nodeData.config).slice(0, 2).map(([key, value]) => (
            <div key={key} className="truncate">
              {key}: {String(value).slice(0, 20)}
            </div>
          ))}
        </div>
      )}

      {/* Output Handle(s) */}
      {isConsensus ? (
        <>
          <Handle
            type="source"
            position={Position.Bottom}
            id="approved"
            style={{ left: '25%' }}
            className="!w-3 !h-3 !border-2 hover:!scale-125 transition-transform !bg-green-500 !border-green-300"
          />
          <Handle
            type="source"
            position={Position.Bottom}
            id="rejected"
            style={{ left: '50%' }}
            className="!w-3 !h-3 !border-2 hover:!scale-125 transition-transform !bg-red-500 !border-red-300"
          />
          <Handle
            type="source"
            position={Position.Bottom}
            id="no_consensus"
            style={{ left: '75%' }}
            className="!w-3 !h-3 !border-2 hover:!scale-125 transition-transform !bg-yellow-500 !border-yellow-300"
          />
          <div className="flex justify-between px-2 mt-2 text-[9px]">
            <span className="text-green-400">Yes</span>
            <span className="text-red-400">No</span>
            <span className="text-yellow-400">N/A</span>
          </div>
        </>
      ) : (
        <Handle
          type="source"
          position={Position.Bottom}
          className="!w-3 !h-3 !bg-cyan-500 !border-2 !border-cyan-300 hover:!scale-125 transition-transform"
        />
      )}
    </div>
  );
};

export default memo(SwarmNode);
