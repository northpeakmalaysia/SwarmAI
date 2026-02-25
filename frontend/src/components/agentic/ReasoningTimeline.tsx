/**
 * ReasoningTimeline — Phase 4: Real-Time Execution Visibility
 *
 * Scrollable timeline of all reasoning events with expandable details.
 * Color-coded by type: thought=blue, tool=green/red, complete=gray, error=red.
 */

import React, { useState, useRef, useEffect } from 'react';
import { useAgenticMonitorStore, TimelineEvent } from '@/stores/agenticMonitorStore';
import { formatTime24h } from '@/utils/dateFormat';

interface ReasoningTimelineProps {
  agentId: string;
}

const eventIcons: Record<string, string> = {
  reasoning_start: '\u25B6',   // ▶
  thought: '\uD83D\uDCAD',     // 💭
  tool_start: '\u2699',        // ⚙
  tool_result: '\u2714',       // ✔
  complete: '\u2705',          // ✅
  error: '\u274C',             // ❌
  status_change: '\u26A0',    // ⚠
};

const eventColors: Record<string, string> = {
  reasoning_start: 'border-purple-500',
  thought: 'border-blue-500',
  tool_start: 'border-yellow-500',
  tool_result: 'border-green-500',
  complete: 'border-gray-500',
  error: 'border-red-500',
  status_change: 'border-orange-500',
};

const eventBgColors: Record<string, string> = {
  reasoning_start: 'bg-purple-500/10',
  thought: 'bg-blue-500/10',
  tool_start: 'bg-yellow-500/10',
  tool_result: 'bg-green-500/10',
  complete: 'bg-gray-500/10',
  error: 'bg-red-500/10',
  status_change: 'bg-orange-500/10',
};

const eventLabels: Record<string, string> = {
  reasoning_start: 'Reasoning Started',
  thought: 'Thought',
  tool_start: 'Tool Executing',
  tool_result: 'Tool Result',
  complete: 'Completed',
  error: 'Error',
  status_change: 'Status Changed',
};

// Helper to safely get string from unknown data
const str = (val: unknown): string => (val != null ? String(val) : '');
const num = (val: unknown): number => Number(val || 0);
const bool = (val: unknown): boolean => !!val;

const EventDetail: React.FC<{ event: TimelineEvent }> = ({ event }) => {
  const d = event.data as Record<string, unknown>;

  switch (event.type) {
    case 'reasoning_start':
      return (
        <div className="text-sm text-gray-300 space-y-1">
          {d.agentName ? <div>Agent: <span className="text-white font-medium">{str(d.agentName)}</span></div> : null}
          {d.trigger ? <div>Trigger: <span className="text-purple-300">{str(d.trigger)}</span></div> : null}
          {d.tier ? <div>Tier: <span className="text-purple-300">{str(d.tier)}</span></div> : null}
        </div>
      );

    case 'thought':
      return (
        <div className="text-sm">
          {d.iteration ? <div className="text-gray-500 text-xs mb-1">Iteration {str(d.iteration)}</div> : null}
          {d.thought ? (
            <div className="text-gray-300 bg-gray-900 rounded p-2 max-h-24 overflow-y-auto">
              {str(d.thought).substring(0, 300)}
              {str(d.thought).length > 300 ? '...' : null}
            </div>
          ) : null}
        </div>
      );

    case 'tool_start':
      return (
        <div className="text-sm space-y-1">
          <div className="text-yellow-300 font-mono">{str(d.toolName)}</div>
          {d.reasoning ? <div className="text-gray-400 text-xs">{str(d.reasoning).substring(0, 150)}</div> : null}
          {d.params ? (
            <details className="text-xs text-gray-500">
              <summary className="cursor-pointer hover:text-gray-400">Parameters</summary>
              <pre className="mt-1 p-1 bg-gray-900 rounded overflow-x-auto text-gray-400">
                {JSON.stringify(d.params, null, 2).substring(0, 500)}
              </pre>
            </details>
          ) : null}
        </div>
      );

    case 'tool_result': {
      const success = bool(d.success);
      return (
        <div className="text-sm space-y-1">
          <div className="flex items-center gap-2">
            <span className={`font-mono ${success ? 'text-green-400' : 'text-red-400'}`}>
              {str(d.toolName)}
            </span>
            <span className={`px-1.5 py-0.5 rounded text-xs ${success ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}`}>
              {success ? 'Success' : 'Failed'}
            </span>
          </div>
          {d.duration ? <div className="text-gray-500 text-xs">{str(d.duration)}ms</div> : null}
          {d.summary ? <div className="text-gray-400 text-xs">{str(d.summary).substring(0, 200)}</div> : null}
          {d.recoveryApplied ? (
            <div className="text-orange-400 text-xs flex items-center gap-1">
              {'🔄'} Recovery applied
              {d.attempts ? <span>(Attempts: {str(d.attempts)})</span> : null}
              {d.usedAlternativeTool ? <span>{'→'} Used: {str(d.usedAlternativeTool)}</span> : null}
            </div>
          ) : null}
        </div>
      );
    }

    case 'complete':
      return (
        <div className="text-sm space-y-1">
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="text-center p-1 bg-gray-900 rounded">
              <div className="text-gray-400">Iterations</div>
              <div className="text-white font-bold">{str(d.iterations || 0)}</div>
            </div>
            <div className="text-center p-1 bg-gray-900 rounded">
              <div className="text-gray-400">Actions</div>
              <div className="text-white font-bold">
                <span className="text-green-400">{str(d.successCount || 0)}</span>
                {'/'}
                <span className="text-red-400">{str(d.failCount || 0)}</span>
              </div>
            </div>
            <div className="text-center p-1 bg-gray-900 rounded">
              <div className="text-gray-400">Tokens</div>
              <div className="text-white font-bold">{num(d.tokensUsed).toLocaleString()}</div>
            </div>
          </div>
          {d.finalThought ? (
            <div className="text-gray-400 text-xs bg-gray-900 rounded p-2 mt-1">
              {str(d.finalThought).substring(0, 200)}
            </div>
          ) : null}
        </div>
      );

    case 'error':
      return (
        <div className="text-sm text-red-400 bg-red-500/10 rounded p-2">
          {str(d.error || 'Unknown error')}
        </div>
      );

    case 'status_change':
      return (
        <div className="text-sm text-orange-300">
          Status {'→'} <span className="font-medium">{str(d.status)}</span>
        </div>
      );

    default:
      return <div className="text-sm text-gray-500">Unknown event type</div>;
  }
};

export const ReasoningTimeline: React.FC<ReasoningTimelineProps> = ({ agentId }) => {
  const execution = useAgenticMonitorStore((s) => s.executions[agentId]);
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);

  const timeline = execution?.timeline || [];

  // Auto-scroll to bottom when new events arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [timeline.length]);

  const toggleEvent = (eventId: string) => {
    setExpandedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) {
        next.delete(eventId);
      } else {
        next.add(eventId);
      }
      return next;
    });
  };

  if (timeline.length === 0) {
    return (
      <div className="p-4 bg-gray-800 rounded-lg border border-gray-700">
        <div className="text-sm text-gray-500 text-center py-8">
          No reasoning events yet. Start a conversation to see the timeline.
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700">
      <div className="flex items-center justify-between p-3 border-b border-gray-700">
        <h3 className="text-sm font-medium text-white">Reasoning Timeline</h3>
        <span className="text-xs text-gray-500">{timeline.length} events</span>
      </div>

      <div
        ref={scrollRef}
        className="max-h-96 overflow-y-auto p-3 space-y-1"
      >
        {timeline.map((event) => {
          const isExpanded = expandedEvents.has(event.id);

          return (
            <div
              key={event.id}
              className={`
                border-l-2 ${eventColors[event.type] || 'border-gray-600'}
                ${eventBgColors[event.type] || 'bg-gray-800/50'}
                rounded-r-lg cursor-pointer transition-all duration-150
                hover:brightness-110
              `}
              onClick={() => toggleEvent(event.id)}
            >
              {/* Event header */}
              <div className="flex items-center gap-2 px-3 py-1.5">
                <span className="text-sm">{eventIcons[event.type] || '\u2022'}</span>
                <span className="text-xs font-medium text-gray-300 flex-1">
                  {eventLabels[event.type] || event.type}
                </span>
                <span className="text-xs text-gray-600">{formatTime24h(event.timestamp)}</span>
                <span className={`text-xs text-gray-600 transition-transform duration-150 ${isExpanded ? 'rotate-90' : ''}`}>
                  &#x25B8;
                </span>
              </div>

              {/* Expanded details */}
              {isExpanded && (
                <div className="px-3 pb-2 pt-1 border-t border-gray-700/50">
                  <EventDetail event={event} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ReasoningTimeline;
