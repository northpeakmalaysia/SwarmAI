import React, { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import {
  Send,
  Globe,
  Mail,
  Variable,
  Timer,
  GitBranch,
  Shuffle,
  MessageSquare
} from 'lucide-react';
import { cn } from '../../../lib/utils';

export interface ActionNodeData {
  label: string;
  subtype: 'send_message' | 'http_request' | 'send_email' | 'set_variable' | 'delay' | 'condition' | 'transform';
  description?: string;
  config?: Record<string, unknown>;
  status?: 'idle' | 'running' | 'success' | 'error';
}

const subtypeConfig: Record<ActionNodeData['subtype'], { icon: React.ElementType; label: string; color: string }> = {
  send_message: { icon: MessageSquare, label: 'Send Message', color: 'emerald' },
  http_request: { icon: Globe, label: 'HTTP Request', color: 'blue' },
  send_email: { icon: Mail, label: 'Send Email', color: 'rose' },
  set_variable: { icon: Variable, label: 'Set Variable', color: 'purple' },
  delay: { icon: Timer, label: 'Delay', color: 'orange' },
  condition: { icon: GitBranch, label: 'Condition', color: 'yellow' },
  transform: { icon: Shuffle, label: 'Transform', color: 'pink' },
};

const colorClasses: Record<string, { bg: string; border: string; borderSelected: string; text: string; shadow: string }> = {
  emerald: {
    bg: 'bg-emerald-500/20',
    border: 'border-emerald-500/50',
    borderSelected: 'border-emerald-500',
    text: 'text-emerald-400',
    shadow: 'shadow-emerald-500/30',
  },
  blue: {
    bg: 'bg-blue-500/20',
    border: 'border-blue-500/50',
    borderSelected: 'border-blue-500',
    text: 'text-blue-400',
    shadow: 'shadow-blue-500/30',
  },
  rose: {
    bg: 'bg-rose-500/20',
    border: 'border-rose-500/50',
    borderSelected: 'border-rose-500',
    text: 'text-rose-400',
    shadow: 'shadow-rose-500/30',
  },
  purple: {
    bg: 'bg-purple-500/20',
    border: 'border-purple-500/50',
    borderSelected: 'border-purple-500',
    text: 'text-purple-400',
    shadow: 'shadow-purple-500/30',
  },
  orange: {
    bg: 'bg-orange-500/20',
    border: 'border-orange-500/50',
    borderSelected: 'border-orange-500',
    text: 'text-orange-400',
    shadow: 'shadow-orange-500/30',
  },
  yellow: {
    bg: 'bg-yellow-500/20',
    border: 'border-yellow-500/50',
    borderSelected: 'border-yellow-500',
    text: 'text-yellow-400',
    shadow: 'shadow-yellow-500/30',
  },
  pink: {
    bg: 'bg-pink-500/20',
    border: 'border-pink-500/50',
    borderSelected: 'border-pink-500',
    text: 'text-pink-400',
    shadow: 'shadow-pink-500/30',
  },
};

const statusColors = {
  idle: 'bg-gray-500',
  running: 'bg-blue-500 animate-pulse',
  success: 'bg-green-500',
  error: 'bg-red-500',
};

const ActionNode: React.FC<NodeProps> = ({ data, selected }) => {
  const nodeData = data as unknown as ActionNodeData;
  const config = subtypeConfig[nodeData.subtype] || subtypeConfig.send_message;
  const colors = colorClasses[config.color] || colorClasses.blue;
  const Icon = config.icon;
  const isCondition = nodeData.subtype === 'condition';

  return (
    <div
      className={cn(
        'flow-node bg-slate-800 border-2 rounded-lg p-3 min-w-[180px] max-w-[220px]',
        'transition-all duration-200 cursor-grab active:cursor-grabbing',
        'hover:translate-y-[-2px] hover:shadow-lg',
        selected
          ? `${colors.borderSelected} shadow-lg ${colors.shadow}`
          : `${colors.border} hover:${colors.borderSelected}`
      )}
    >
      {/* Input Handle */}
      <Handle
        type="target"
        position={Position.Top}
        className={cn(
          '!w-3 !h-3 !border-2 hover:!scale-125 transition-transform',
          `!bg-slate-600 !border-slate-400`
        )}
      />

      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <div className={cn('w-8 h-8 rounded flex items-center justify-center flex-shrink-0', colors.bg)}>
          <Icon className={cn('w-4 h-4', colors.text)} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-white font-medium text-sm truncate">
            {nodeData.label || config.label}
          </div>
          <div className={cn('text-xs flex items-center gap-1', colors.text)}>
            <Send className="w-3 h-3" />
            Action
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
      {isCondition ? (
        <>
          <Handle
            type="source"
            position={Position.Bottom}
            id="true"
            style={{ left: '30%' }}
            className={cn(
              '!w-3 !h-3 !border-2 hover:!scale-125 transition-transform',
              '!bg-green-500 !border-green-300'
            )}
          />
          <Handle
            type="source"
            position={Position.Bottom}
            id="false"
            style={{ left: '70%' }}
            className={cn(
              '!w-3 !h-3 !border-2 hover:!scale-125 transition-transform',
              '!bg-red-500 !border-red-300'
            )}
          />
          <div className="flex justify-between px-4 mt-2 text-[10px]">
            <span className="text-green-400">True</span>
            <span className="text-red-400">False</span>
          </div>
        </>
      ) : (
        <Handle
          type="source"
          position={Position.Bottom}
          className={cn(
            '!w-3 !h-3 !border-2 hover:!scale-125 transition-transform',
            `!bg-slate-500 !border-slate-300`
          )}
        />
      )}
    </div>
  );
};

export default memo(ActionNode);
