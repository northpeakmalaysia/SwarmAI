import { useEffect, useRef } from 'react';
import { Terminal, Square, Loader2 } from 'lucide-react';
import { useLocalAgentStore } from '../../stores/localAgentStore';

interface CommandTerminalViewProps {
  agentId: string;
  commandId: string;
  className?: string;
}

/**
 * Live terminal view for streaming command output.
 * Shows real-time stdout/stderr chunks as they arrive via WebSocket.
 */
export default function CommandTerminalView({ agentId, commandId, className }: CommandTerminalViewProps) {
  const { streamingOutputs, sendCommand } = useLocalAgentStore();
  const output = streamingOutputs[commandId];
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new output
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [output?.chunks.length]);

  const handleKill = async () => {
    try {
      await sendCommand(agentId, 'kill', { commandId });
    } catch {
      // Best effort
    }
  };

  if (!output) {
    return null;
  }

  const fullOutput = output.chunks.join('');

  return (
    <div className={`bg-gray-950 border border-gray-700 rounded-lg overflow-hidden ${className || ''}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-gray-900 border-b border-gray-800">
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <Terminal className="w-3.5 h-3.5" />
          <span>Live Output</span>
          {output.isRunning && (
            <Loader2 className="w-3 h-3 animate-spin text-cyan-400" />
          )}
        </div>
        {output.isRunning && (
          <button
            onClick={handleKill}
            className="flex items-center gap-1 px-2 py-0.5 text-xs text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded transition-colors"
            title="Kill process"
          >
            <Square className="w-3 h-3" />
            Kill
          </button>
        )}
      </div>

      {/* Output */}
      <div
        ref={containerRef}
        className="p-3 font-mono text-xs text-green-300 whitespace-pre-wrap overflow-auto max-h-64 leading-relaxed"
      >
        {fullOutput || <span className="text-gray-600">Waiting for output...</span>}
      </div>
    </div>
  );
}
