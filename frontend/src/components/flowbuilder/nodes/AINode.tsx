import React, { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import {
  Sparkles,
  MessageCircle,
  Tags,
  FileSearch,
  FileText,
  Brain,
  Lightbulb
} from 'lucide-react';
import { cn } from '../../../lib/utils';

export interface AINodeData {
  label: string;
  subtype: 'ai_response' | 'ai_with_rag' | 'sentiment_analysis' | 'extract_entities' | 'summarize_memory' | 'ai_classify';
  description?: string;
  config?: Record<string, unknown>;
  status?: 'idle' | 'running' | 'success' | 'error';
  model?: string;
}

const subtypeConfig: Record<AINodeData['subtype'], { icon: React.ElementType; label: string }> = {
  ai_response: { icon: MessageCircle, label: 'AI Response' },
  ai_with_rag: { icon: FileSearch, label: 'AI + RAG' },
  sentiment_analysis: { icon: Lightbulb, label: 'Sentiment Analysis' },
  extract_entities: { icon: Tags, label: 'Extract Entities' },
  summarize_memory: { icon: FileText, label: 'Summarize' },
  ai_classify: { icon: Brain, label: 'Classify' },
};

const statusColors = {
  idle: 'bg-gray-500',
  running: 'bg-violet-500 animate-pulse',
  success: 'bg-green-500',
  error: 'bg-red-500',
};

const AINode: React.FC<NodeProps> = ({ data, selected }) => {
  const nodeData = data as unknown as AINodeData;
  const config = subtypeConfig[nodeData.subtype] || subtypeConfig.ai_response;
  const Icon = config.icon;

  return (
    <div
      className={cn(
        'flow-node bg-slate-800 border-2 rounded-lg p-3 min-w-[180px] max-w-[220px]',
        'transition-all duration-200 cursor-grab active:cursor-grabbing',
        'hover:translate-y-[-2px] hover:shadow-lg hover:shadow-violet-500/20',
        selected
          ? 'border-violet-500 shadow-lg shadow-violet-500/30'
          : 'border-violet-500/50 hover:border-violet-400'
      )}
    >
      {/* Input Handle */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-violet-600 !border-2 !border-violet-400 hover:!scale-125 transition-transform"
      />

      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <div className="w-8 h-8 rounded bg-violet-500/20 flex items-center justify-center flex-shrink-0 relative">
          <Icon className="w-4 h-4 text-violet-400" />
          <Sparkles className="w-3 h-3 text-violet-300 absolute -top-1 -right-1" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-white font-medium text-sm truncate">
            {nodeData.label || config.label}
          </div>
          <div className="text-xs text-violet-400/70 flex items-center gap-1">
            <Brain className="w-3 h-3" />
            AI
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

      {/* Model Badge */}
      {nodeData.model && (
        <div className="text-[10px] text-violet-300 bg-violet-500/10 rounded px-2 py-0.5 mb-2 truncate inline-block">
          {nodeData.model}
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

      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-violet-500 !border-2 !border-violet-300 hover:!scale-125 transition-transform"
      />
    </div>
  );
};

export default memo(AINode);
