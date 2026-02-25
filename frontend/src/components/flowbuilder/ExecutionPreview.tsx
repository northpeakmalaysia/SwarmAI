import React, { useState, useEffect, useMemo } from 'react';
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Circle,
  Clock,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  Loader2
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../common';
import { formatTime } from '../../utils/dateFormat';

// Simplified FlowExecution type for component props
interface SimpleFlowExecution {
  id: string;
  flowId: string;
  status: 'running' | 'completed' | 'failed' | 'pending' | 'cancelled' | 'timeout';
  startedAt: string;
  completedAt?: string;
  error?: string;
  logs: string[];
  durationMs?: number;
}

interface NodeExecution {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
}

interface ExecutionPreviewProps {
  execution: SimpleFlowExecution | null;
  nodeExecutions?: NodeExecution[];
  currentStepIndex?: number;
  isPlaying?: boolean;
  onPlay?: () => void;
  onPause?: () => void;
  onStepForward?: () => void;
  onStepBack?: () => void;
  onReset?: () => void;
  onNodeClick?: (nodeId: string) => void;
  className?: string;
}

const statusConfig: Record<NodeExecution['status'], { icon: React.ElementType; color: string; bg: string }> = {
  pending: { icon: Circle, color: 'text-gray-400', bg: 'bg-gray-500/20' },
  running: { icon: Loader2, color: 'text-blue-400', bg: 'bg-blue-500/20' },
  completed: { icon: CheckCircle2, color: 'text-green-400', bg: 'bg-green-500/20' },
  failed: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/20' },
  skipped: { icon: Circle, color: 'text-gray-500', bg: 'bg-gray-500/10' },
};

interface ExecutionStepProps {
  step: NodeExecution;
  index: number;
  isActive: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  onClick: () => void;
}

const ExecutionStep: React.FC<ExecutionStepProps> = ({
  step,
  index,
  isActive,
  isExpanded,
  onToggle,
  onClick,
}) => {
  const config = statusConfig[step.status];
  const Icon = config.icon;
  const isRunning = step.status === 'running';

  return (
    <div
      className={cn(
        'border rounded-lg transition-all duration-200',
        isActive
          ? 'border-sky-500 bg-sky-500/10'
          : 'border-slate-700 hover:border-slate-600',
        step.status === 'failed' && 'border-red-500/50'
      )}
    >
      <button
        onClick={() => {
          onClick();
          onToggle();
        }}
        className="w-full flex items-center gap-3 p-3 text-left"
      >
        {/* Step Number */}
        <div
          className={cn(
            'w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0',
            isActive
              ? 'bg-sky-500 text-white'
              : step.status === 'completed'
              ? 'bg-green-500/20 text-green-400'
              : step.status === 'failed'
              ? 'bg-red-500/20 text-red-400'
              : 'bg-slate-700 text-gray-400'
          )}
        >
          {index + 1}
        </div>

        {/* Status Icon */}
        <div className={cn('flex-shrink-0', config.color)}>
          <Icon className={cn('w-5 h-5', isRunning && 'animate-spin')} />
        </div>

        {/* Node Info */}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-white truncate">
            {step.nodeName}
          </div>
          <div className="text-xs text-gray-500 flex items-center gap-2">
            <span className="capitalize">{step.nodeType}</span>
            {step.durationMs !== undefined && (
              <>
                <span>|</span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {step.durationMs}ms
                </span>
              </>
            )}
          </div>
        </div>

        {/* Expand Icon */}
        {(step.input || step.output || step.error) && (
          <div className="text-gray-500">
            {isExpanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </div>
        )}
      </button>

      {/* Expanded Details */}
      {isExpanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-slate-700 pt-2">
          {/* Error */}
          {step.error && (
            <div className="flex items-start gap-2 p-2 bg-red-500/10 border border-red-500/30 rounded text-sm">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <div className="text-red-300 text-xs break-all">{step.error}</div>
            </div>
          )}

          {/* Input */}
          {step.input && Object.keys(step.input).length > 0 && (
            <div>
              <div className="text-xs font-medium text-gray-400 mb-1">Input</div>
              <pre className="text-xs text-gray-300 bg-slate-900 rounded p-2 overflow-x-auto max-h-32">
                {JSON.stringify(step.input, null, 2)}
              </pre>
            </div>
          )}

          {/* Output */}
          {step.output && Object.keys(step.output).length > 0 && (
            <div>
              <div className="text-xs font-medium text-gray-400 mb-1">Output</div>
              <pre className="text-xs text-gray-300 bg-slate-900 rounded p-2 overflow-x-auto max-h-32">
                {JSON.stringify(step.output, null, 2)}
              </pre>
            </div>
          )}

          {/* Timestamps */}
          {(step.startedAt || step.completedAt) && (
            <div className="text-[10px] text-gray-600 flex gap-4">
              {step.startedAt && <span>Started: {formatTime(step.startedAt)}</span>}
              {step.completedAt && <span>Completed: {formatTime(step.completedAt)}</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const ExecutionPreview: React.FC<ExecutionPreviewProps> = ({
  execution,
  nodeExecutions = [],
  currentStepIndex = -1,
  isPlaying = false,
  onPlay,
  onPause,
  onStepForward,
  onStepBack,
  onReset,
  onNodeClick,
  className,
}) => {
  const [expandedSteps, setExpandedSteps] = useState<Record<number, boolean>>({});

  // Auto-expand failed steps
  useEffect(() => {
    const failedIndex = nodeExecutions.findIndex((s) => s.status === 'failed');
    if (failedIndex !== -1) {
      setExpandedSteps((prev) => ({ ...prev, [failedIndex]: true }));
    }
  }, [nodeExecutions]);

  // Calculate summary stats
  const stats = useMemo(() => {
    const completed = nodeExecutions.filter((s) => s.status === 'completed').length;
    const failed = nodeExecutions.filter((s) => s.status === 'failed').length;
    const running = nodeExecutions.filter((s) => s.status === 'running').length;
    const totalDuration = nodeExecutions.reduce((sum, s) => sum + (s.durationMs || 0), 0);

    return { completed, failed, running, totalDuration };
  }, [nodeExecutions]);

  const toggleStep = (index: number) => {
    setExpandedSteps((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

  if (!execution && nodeExecutions.length === 0) {
    return (
      <div className={cn('flex flex-col items-center justify-center py-8 text-gray-500', className)}>
        <Play className="w-12 h-12 mb-4 opacity-50" />
        <p className="text-sm">No execution data</p>
        <p className="text-xs text-gray-600 mt-1">Run the flow to see execution preview</p>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      <div className="flex-shrink-0 mb-4">
        <h3 className="text-lg font-semibold text-white mb-1">Execution Preview</h3>
        <div className="flex items-center gap-4 text-xs text-gray-400">
          {execution && (
            <>
              <span
                className={cn(
                  'px-2 py-0.5 rounded-full',
                  execution.status === 'completed'
                    ? 'bg-green-500/20 text-green-400'
                    : execution.status === 'failed'
                    ? 'bg-red-500/20 text-red-400'
                    : execution.status === 'running'
                    ? 'bg-blue-500/20 text-blue-400'
                    : 'bg-gray-500/20 text-gray-400'
                )}
              >
                {execution.status}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {execution.durationMs ? `${execution.durationMs}ms` : 'In progress'}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Playback Controls */}
      {(onPlay || onPause || onStepForward || onStepBack || onReset) && (
        <div className="flex-shrink-0 flex items-center justify-center gap-2 mb-4 p-2 bg-slate-800/50 rounded-lg border border-slate-700">
          <Button
            onClick={onStepBack}
            variant="ghost"
            size="sm"
            disabled={currentStepIndex <= 0}
            className="!p-2"
          >
            <SkipBack className="w-4 h-4" />
          </Button>

          {isPlaying ? (
            <Button onClick={onPause} variant="ghost" size="sm" className="!p-2">
              <Pause className="w-4 h-4" />
            </Button>
          ) : (
            <Button onClick={onPlay} variant="ghost" size="sm" className="!p-2">
              <Play className="w-4 h-4" />
            </Button>
          )}

          <Button
            onClick={onStepForward}
            variant="ghost"
            size="sm"
            disabled={currentStepIndex >= nodeExecutions.length - 1}
            className="!p-2"
          >
            <SkipForward className="w-4 h-4" />
          </Button>

          <div className="h-4 w-px bg-slate-700" />

          <Button onClick={onReset} variant="ghost" size="sm" className="!p-2">
            <RotateCcw className="w-4 h-4" />
          </Button>

          {/* Step Counter */}
          <div className="text-xs text-gray-500 ml-2">
            Step {currentStepIndex + 1} / {nodeExecutions.length}
          </div>
        </div>
      )}

      {/* Summary Stats */}
      {nodeExecutions.length > 0 && (
        <div className="flex-shrink-0 grid grid-cols-4 gap-2 mb-4">
          <div className="text-center p-2 bg-slate-800/50 rounded-lg border border-slate-700">
            <div className="text-lg font-semibold text-white">{nodeExecutions.length}</div>
            <div className="text-[10px] text-gray-500">Total</div>
          </div>
          <div className="text-center p-2 bg-green-500/10 rounded-lg border border-green-500/30">
            <div className="text-lg font-semibold text-green-400">{stats.completed}</div>
            <div className="text-[10px] text-green-500/70">Completed</div>
          </div>
          <div className="text-center p-2 bg-red-500/10 rounded-lg border border-red-500/30">
            <div className="text-lg font-semibold text-red-400">{stats.failed}</div>
            <div className="text-[10px] text-red-500/70">Failed</div>
          </div>
          <div className="text-center p-2 bg-blue-500/10 rounded-lg border border-blue-500/30">
            <div className="text-lg font-semibold text-blue-400">{stats.totalDuration}</div>
            <div className="text-[10px] text-blue-500/70">ms Total</div>
          </div>
        </div>
      )}

      {/* Execution Steps */}
      <div className="flex-1 overflow-y-auto space-y-2 -mx-2 px-2">
        {nodeExecutions.map((step, index) => (
          <ExecutionStep
            key={`${step.nodeId}-${index}`}
            step={step}
            index={index}
            isActive={index === currentStepIndex}
            isExpanded={expandedSteps[index] || false}
            onToggle={() => toggleStep(index)}
            onClick={() => onNodeClick?.(step.nodeId)}
          />
        ))}
      </div>

      {/* Execution Logs */}
      {execution?.logs && execution.logs.length > 0 && (
        <div className="flex-shrink-0 mt-4 pt-4 border-t border-slate-700">
          <div className="text-xs font-medium text-gray-400 mb-2">Logs</div>
          <div className="text-xs text-gray-500 bg-slate-900 rounded p-2 max-h-24 overflow-y-auto font-mono">
            {execution.logs.map((log, i) => (
              <div key={i} className="py-0.5">
                {log}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ExecutionPreview;
