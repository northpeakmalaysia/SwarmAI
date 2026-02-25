import React, { useEffect, useState, useCallback } from 'react';
import {
  MonitorSmartphone,
  Wifi,
  WifiOff,
  Wrench,
  Blocks,
  Apple,
  Terminal,
  Monitor,
  Play,
  Loader2,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';
import { useLocalAgentStore, LocalAgent, ToolInfo, McpToolInfo } from '../../stores/localAgentStore';
import { Link } from 'react-router-dom';

export interface LocalAgentsTabPanelProps {
  className?: string;
}

/** Relative time display */
function TimeAgo({ date }: { date: string | null }) {
  if (!date) return <span className="text-gray-500">Never</span>;
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return <span className="text-green-400">Just now</span>;
  if (mins < 60) return <span className="text-gray-400">{mins}m ago</span>;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return <span className="text-gray-400">{hrs}h ago</span>;
  return <span className="text-gray-500">{Math.floor(hrs / 24)}d ago</span>;
}

/** OS icon */
function OsIcon({ os }: { os: string | null }) {
  if (!os) return <Monitor className="w-4 h-4 text-gray-500" />;
  const lower = os.toLowerCase();
  if (lower.includes('darwin') || lower.includes('mac')) return <Apple className="w-4 h-4 text-gray-400" />;
  if (lower.includes('linux')) return <Terminal className="w-4 h-4 text-gray-400" />;
  return <Monitor className="w-4 h-4 text-gray-400" />;
}

/** Tool registry grid */
function ToolGrid({ tools }: { tools: Record<string, ToolInfo> }) {
  const installed = Object.entries(tools).filter(([, v]) => v.installed);
  if (installed.length === 0) return <p className="text-gray-500 text-xs">No tools detected</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {installed.map(([name, info]) => (
        <span key={name} className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-700/50 rounded text-xs text-gray-300">
          <CheckCircle2 className="w-3 h-3 text-green-400" />
          {name}
          {info.version && <span className="text-gray-500">v{info.version}</span>}
        </span>
      ))}
    </div>
  );
}

/** MCP tools grouped by server */
function McpToolsList({ tools }: { tools: McpToolInfo[] }) {
  if (!tools || tools.length === 0) return <p className="text-gray-500 text-xs">No MCP servers</p>;
  const byServer: Record<string, McpToolInfo[]> = {};
  for (const t of tools) {
    const srv = t.server || 'unknown';
    if (!byServer[srv]) byServer[srv] = [];
    byServer[srv].push(t);
  }
  return (
    <div className="space-y-2">
      {Object.entries(byServer).map(([server, srvTools]) => (
        <div key={server}>
          <div className="flex items-center gap-1.5 mb-1">
            <Blocks className="w-3.5 h-3.5 text-purple-400" />
            <span className="text-xs font-medium text-gray-300">{server}</span>
            <Badge variant="default" className="text-[10px] px-1.5 py-0">{srvTools.length} tools</Badge>
          </div>
          <div className="flex flex-wrap gap-1 ml-5">
            {srvTools.slice(0, 8).map(t => (
              <span key={t.name} className="px-1.5 py-0.5 bg-purple-900/20 border border-purple-800/30 rounded text-[10px] text-purple-300">{t.name}</span>
            ))}
            {srvTools.length > 8 && (
              <span className="px-1.5 py-0.5 text-[10px] text-gray-500">+{srvTools.length - 8} more</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Single agent card with expandable details */
function AgentRow({ agent }: { agent: LocalAgent }) {
  const [expanded, setExpanded] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const { sendCommand } = useLocalAgentStore();

  const installedToolCount = Object.values(agent.toolRegistry || {}).filter(t => t.installed).length;
  const mcpToolCount = (agent.mcpTools || []).length;

  const handleTest = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setTesting(true);
    setTestResult(null);
    try {
      const result = await sendCommand(agent.id, 'systemInfo') as Record<string, unknown>;
      setTestResult(`${result.cpuModel} | ${result.freeMemoryMB}MB free | Node ${result.nodeVersion}`);
      if (!expanded) setExpanded(true);
    } catch (err) {
      setTestResult(`Error: ${err instanceof Error ? err.message : 'Failed'}`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className={cn(
      'border rounded-lg transition-colors',
      agent.isOnline ? 'border-gray-700 bg-gray-800/50' : 'border-gray-800 bg-gray-900/30 opacity-60'
    )}>
      {/* Header row */}
      <div
        className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-gray-800/70 rounded-t-lg"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}

        {agent.isOnline
          ? <Wifi className="w-4 h-4 text-green-400" />
          : <WifiOff className="w-4 h-4 text-gray-600" />
        }

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm text-gray-200 truncate">{agent.name}</span>
            <Badge variant={agent.isOnline ? 'success' : 'default'} className="text-[10px] px-1.5 py-0">
              {agent.isOnline ? 'Online' : 'Offline'}
            </Badge>
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
            <span className="flex items-center gap-1"><OsIcon os={agent.osType} />{agent.hostname || 'Unknown'}</span>
            {installedToolCount > 0 && (
              <span className="flex items-center gap-1"><Wrench className="w-3 h-3" />{installedToolCount}</span>
            )}
            {mcpToolCount > 0 && (
              <span className="flex items-center gap-1"><Blocks className="w-3 h-3" />{mcpToolCount}</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-gray-500">
          <TimeAgo date={agent.lastHeartbeatAt || agent.lastConnectedAt} />
          {agent.isOnline && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={handleTest}
              disabled={testing}
            >
              {testing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
              Test
            </Button>
          )}
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="px-4 pb-3 pt-1 border-t border-gray-700/50 space-y-3">
          {testResult && (
            <div className={cn(
              'text-xs px-2 py-1.5 rounded',
              testResult.startsWith('Error') ? 'bg-red-900/20 text-red-400' : 'bg-green-900/20 text-green-400'
            )}>
              {testResult}
            </div>
          )}

          {/* Capabilities */}
          {agent.capabilities && agent.capabilities.length > 0 && (
            <div>
              <h5 className="text-xs font-medium text-gray-400 mb-1">Commands</h5>
              <div className="flex flex-wrap gap-1">
                {agent.capabilities.map(cap => (
                  <span key={cap} className="px-1.5 py-0.5 bg-blue-900/20 border border-blue-800/30 rounded text-[10px] text-blue-300">{cap}</span>
                ))}
              </div>
            </div>
          )}

          {/* Dev Tools */}
          {agent.toolRegistry && Object.keys(agent.toolRegistry).length > 0 && (
            <div>
              <h5 className="text-xs font-medium text-gray-400 mb-1 flex items-center gap-1">
                <Wrench className="w-3 h-3" /> Dev Tools
              </h5>
              <ToolGrid tools={agent.toolRegistry} />
            </div>
          )}

          {/* MCP Tools */}
          {agent.mcpTools && agent.mcpTools.length > 0 && (
            <div>
              <h5 className="text-xs font-medium text-gray-400 mb-1 flex items-center gap-1">
                <Blocks className="w-3 h-3" /> MCP Servers
              </h5>
              <McpToolsList tools={agent.mcpTools} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Main panel for the Agentic profile "Local Agents" tab */
const LocalAgentsTabPanel: React.FC<LocalAgentsTabPanelProps> = ({ className }) => {
  const { agents, isLoading, error, fetchAgents } = useLocalAgentStore();

  const { initSocketListeners } = useLocalAgentStore();

  useEffect(() => {
    fetchAgents();
    const cleanupSocket = initSocketListeners();
    // Reduced polling to 60s (WebSocket handles real-time)
    const interval = setInterval(fetchAgents, 60000);
    return () => {
      clearInterval(interval);
      cleanupSocket();
    };
  }, [fetchAgents, initSocketListeners]);

  const onlineCount = agents.filter(a => a.isOnline).length;

  if (isLoading && agents.length === 0) {
    return (
      <div className={cn('flex items-center justify-center py-12', className)}>
        <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
        <span className="ml-2 text-gray-500 text-sm">Loading local agents...</span>
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MonitorSmartphone className="w-5 h-5 text-blue-400" />
          <h3 className="text-base font-semibold text-gray-200">Connected Devices</h3>
          {agents.length > 0 && (
            <Badge variant={onlineCount > 0 ? 'success' : 'default'} className="text-xs">
              {onlineCount} / {agents.length} online
            </Badge>
          )}
        </div>
        <Link to="/local-agents" className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300">
          Manage <ExternalLink className="w-3 h-3" />
        </Link>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-2 bg-red-900/20 border border-red-800/30 rounded text-xs text-red-400">
          <XCircle className="w-4 h-4" /> {error}
        </div>
      )}

      {/* Agent list */}
      {agents.length === 0 ? (
        <div className="text-center py-8 space-y-2">
          <MonitorSmartphone className="w-10 h-10 text-gray-600 mx-auto" />
          <p className="text-gray-400 text-sm">No local agents registered</p>
          <p className="text-gray-500 text-xs">
            Install the CLI on your device to connect it to this AI agent.
          </p>
          <Link to="/local-agents" className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 mt-2">
            Setup Instructions <ExternalLink className="w-3 h-3" />
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {agents.map(agent => (
            <AgentRow key={agent.id} agent={agent} />
          ))}
        </div>
      )}
    </div>
  );
};

export default LocalAgentsTabPanel;
