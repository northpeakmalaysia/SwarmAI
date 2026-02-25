import React, { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import {
  Zap,
  Clock,
  Webhook,
  Mail,
  MessageSquare,
  Calendar,
  Play
} from 'lucide-react';
import { cn } from '../../../lib/utils';

export interface TriggerNodeData {
  label: string;
  subtype: 'manual' | 'schedule' | 'webhook' | 'email_received' | 'message_received' | 'event';
  description?: string;
  config?: Record<string, unknown>;
  status?: 'idle' | 'running' | 'success' | 'error';
}

const subtypeConfig: Record<TriggerNodeData['subtype'], { icon: React.ElementType; label: string }> = {
  manual: { icon: Play, label: 'Manual Trigger' },
  schedule: { icon: Clock, label: 'Schedule' },
  webhook: { icon: Webhook, label: 'Webhook' },
  email_received: { icon: Mail, label: 'Email Received' },
  message_received: { icon: MessageSquare, label: 'Message Received' },
  event: { icon: Calendar, label: 'Event' },
};

const statusColors = {
  idle: 'bg-gray-500',
  running: 'bg-blue-500 animate-pulse',
  success: 'bg-green-500',
  error: 'bg-red-500',
};

const TriggerNode: React.FC<NodeProps> = ({ data, selected }) => {
  const nodeData = data as unknown as TriggerNodeData;
  const config = subtypeConfig[nodeData.subtype] || subtypeConfig.manual;
  const Icon = config.icon;

  return (
    <div
      className={cn(
        'flow-node bg-slate-800 border-2 rounded-lg p-3 min-w-[180px] max-w-[220px]',
        'transition-all duration-200 cursor-grab active:cursor-grabbing',
        'hover:translate-y-[-2px] hover:shadow-lg hover:shadow-amber-500/20',
        selected
          ? 'border-amber-500 shadow-lg shadow-amber-500/30'
          : 'border-amber-500/50 hover:border-amber-400'
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <div className="w-8 h-8 rounded bg-amber-500/20 flex items-center justify-center flex-shrink-0">
          <Icon className="w-4 h-4 text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-white font-medium text-sm truncate">
            {nodeData.label || config.label}
          </div>
          <div className="text-xs text-amber-400/70 flex items-center gap-1">
            <Zap className="w-3 h-3" />
            Trigger
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

      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-amber-500 !border-2 !border-amber-300 hover:!scale-125 transition-transform"
      />
    </div>
  );
};

export default memo(TriggerNode);
