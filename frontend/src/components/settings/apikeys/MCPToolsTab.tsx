/**
 * MCP Tools Tab
 *
 * Manage MCP (Model Context Protocol) servers and their tools.
 * Allows connecting to external tool providers via MCP protocol.
 */

import React, { useState, useEffect } from 'react';
import {
  Plus,
  Trash2,
  RefreshCw,
  Power,
  PowerOff,
  Loader2,
  ExternalLink,
  Server,
  Wrench,
  AlertCircle,
  Settings,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { Button } from '../../common/Button';
import { Input } from '../../common/Input';
import { Badge } from '../../common/Badge';
import { Modal } from '../../common/Modal';
import { useMCPStore } from '@/stores/mcpStore';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import { formatDateTime } from '@/utils/dateFormat';

export const MCPToolsTab: React.FC = () => {
  const {
    servers,
    isLoading: loading,
    error,
    fetchServers,
    createServer,
    deleteServer,
    connectServer,
    disconnectServer,
  } = useMCPStore();

  const [showAddModal, setShowAddModal] = useState(false);

  // Fetch servers on mount
  useEffect(() => {
    fetchServers();
  }, [fetchServers]);

  // Show error toast
  useEffect(() => {
    if (error) {
      toast.error(error);
    }
  }, [error]);

  const handleConnect = async (serverId: string) => {
    try {
      await connectServer(serverId);
      toast.success('Server connected');
    } catch (e: any) {
      toast.error(e.message || 'Failed to connect');
    }
  };

  const handleDisconnect = async (serverId: string) => {
    try {
      await disconnectServer(serverId);
      toast.success('Server disconnected');
    } catch (e: any) {
      toast.error(e.message || 'Failed to disconnect');
    }
  };

  const handleDelete = async (serverId: string) => {
    if (confirm('Are you sure you want to delete this MCP server?')) {
      try {
        await deleteServer(serverId);
        toast.success('Server deleted');
      } catch (e: any) {
        toast.error(e.message || 'Failed to delete');
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">MCP Tools</h3>
          <p className="text-sm text-gray-400 mt-1">
            Connect to external tool providers via the Model Context Protocol (MCP).
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowAddModal(true)}
          className="gap-1"
        >
          <Plus className="w-4 h-4" />
          Add Server
        </Button>
      </div>

      {/* Info banner */}
      <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
        <div className="flex items-start gap-3">
          <Server className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="text-blue-200 font-medium">What is MCP?</p>
            <p className="text-blue-200/70 mt-1">
              MCP (Model Context Protocol) allows AI agents to connect to external tools
              and services. Add servers to extend agent capabilities with custom tools.
            </p>
            <a
              href="https://modelcontextprotocol.io/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 mt-2"
            >
              Learn more <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>

      {/* Loading state */}
      {loading && servers.length === 0 && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
          <span className="ml-2 text-gray-400">Loading servers...</span>
        </div>
      )}

      {/* Server list */}
      {servers.length > 0 ? (
        <div className="space-y-4">
          {servers.map(server => (
            <ServerCard
              key={server.id}
              server={server}
              onConnect={() => handleConnect(server.id)}
              onDisconnect={() => handleDisconnect(server.id)}
              onDelete={() => handleDelete(server.id)}
            />
          ))}
        </div>
      ) : !loading ? (
        <div className="text-center py-12 bg-slate-800/50 rounded-lg border border-slate-700">
          <Server className="w-12 h-12 mx-auto mb-4 text-gray-500" />
          <p className="text-gray-400 mb-2">No MCP servers configured</p>
          <p className="text-sm text-gray-500 mb-4">
            Add an MCP server to extend agent capabilities with custom tools.
          </p>
          <Button variant="outline" onClick={() => setShowAddModal(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add Your First Server
          </Button>
        </div>
      ) : null}

      {/* Add Server Modal */}
      {showAddModal && (
        <AddServerModal
          onClose={() => setShowAddModal(false)}
          onAdd={async (name, type, config) => {
            try {
              await createServer({ name, transport: type as any, isActive: true, ...config });
              toast.success('Server added successfully');
              setShowAddModal(false);
            } catch (e: any) {
              toast.error(e.message || 'Failed to add server');
            }
          }}
        />
      )}
    </div>
  );
};

// Server Card Component
interface ServerCardProps {
  server: {
    id: string;
    name: string;
    transport: 'stdio' | 'http' | 'websocket';
    isConnected?: boolean;
    command?: string;
    args?: string[];
    url?: string;
    tools?: string;
    connectedAt?: string;
  };
  onConnect: () => void;
  onDisconnect: () => void;
  onDelete: () => void;
}

const ServerCard: React.FC<ServerCardProps> = ({
  server,
  onConnect,
  onDisconnect,
  onDelete,
}) => {
  const isConnected = server.isConnected === true;
  const tools = server.tools ? JSON.parse(server.tools) : [];

  return (
    <div className="bg-slate-800/50 rounded-lg border border-slate-700 overflow-hidden">
      {/* Header */}
      <div className="p-4 flex items-center justify-between border-b border-slate-700/50">
        <div className="flex items-center gap-3">
          <div className={cn(
            'w-10 h-10 rounded-lg flex items-center justify-center',
            isConnected ? 'bg-green-500/20' : 'bg-slate-700'
          )}>
            <Server className={cn(
              'w-5 h-5',
              isConnected ? 'text-green-400' : 'text-gray-400'
            )} />
          </div>
          <div>
            <h4 className="font-semibold text-white">{server.name}</h4>
            <div className="flex items-center gap-2 mt-0.5">
              <Badge variant={isConnected ? 'success' : 'default'} size="sm">
                {isConnected ? 'Connected' : 'Disconnected'}
              </Badge>
              <span className="text-xs text-gray-500">{server.transport}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isConnected ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={onDisconnect}
              className="text-orange-400 hover:text-orange-300"
            >
              <PowerOff className="w-4 h-4 mr-1" />
              Disconnect
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={onConnect}
              className="text-green-400 hover:text-green-300"
            >
              <Power className="w-4 h-4 mr-1" />
              Connect
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            className="text-red-400 hover:text-red-300"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Tools */}
      {tools.length > 0 && (
        <div className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Wrench className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-400">
              {tools.length} tool{tools.length !== 1 ? 's' : ''} available
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {tools.slice(0, 5).map((tool: string, i: number) => (
              <Badge key={i} variant="default" size="sm">
                {tool}
              </Badge>
            ))}
            {tools.length > 5 && (
              <Badge variant="default" size="sm">
                +{tools.length - 5} more
              </Badge>
            )}
          </div>
        </div>
      )}

      {/* Connection info */}
      {server.connectedAt && (
        <div className="px-4 pb-4 text-xs text-gray-500">
          Connected: {formatDateTime(server.connectedAt)}
        </div>
      )}
    </div>
  );
};

// Add Server Modal Component
interface AddServerModalProps {
  onClose: () => void;
  onAdd: (name: string, type: string, config: Record<string, any>) => Promise<void>;
}

const AddServerModal: React.FC<AddServerModalProps> = ({ onClose, onAdd }) => {
  const [name, setName] = useState('');
  const [type, setType] = useState<'stdio' | 'sse'>('stdio');
  const [command, setCommand] = useState('');
  const [args, setArgs] = useState('');
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;

    setLoading(true);
    try {
      const config = type === 'stdio'
        ? { command, args: args ? args.split(' ') : [] }
        : { url };
      await onAdd(name, type, config);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Add MCP Server" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Name */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Server Name
          </label>
          <Input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="My MCP Server"
          />
        </div>

        {/* Type */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Transport Type
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setType('stdio')}
              className={cn(
                'p-3 rounded-lg border text-left transition-all',
                type === 'stdio'
                  ? 'border-blue-500 bg-blue-500/10'
                  : 'border-slate-600 bg-slate-700/50 hover:border-slate-500'
              )}
            >
              <span className="font-medium text-white">stdio</span>
              <p className="text-xs text-gray-400 mt-1">Local command</p>
            </button>
            <button
              type="button"
              onClick={() => setType('sse')}
              className={cn(
                'p-3 rounded-lg border text-left transition-all',
                type === 'sse'
                  ? 'border-blue-500 bg-blue-500/10'
                  : 'border-slate-600 bg-slate-700/50 hover:border-slate-500'
              )}
            >
              <span className="font-medium text-white">SSE</span>
              <p className="text-xs text-gray-400 mt-1">HTTP endpoint</p>
            </button>
          </div>
        </div>

        {/* Config based on type */}
        {type === 'stdio' ? (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Command
              </label>
              <Input
                value={command}
                onChange={e => setCommand(e.target.value)}
                placeholder="npx -y @modelcontextprotocol/server-memory"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Arguments (space-separated)
              </label>
              <Input
                value={args}
                onChange={e => setArgs(e.target.value)}
                placeholder="--port 8080"
              />
            </div>
          </>
        ) : (
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Server URL
            </label>
            <Input
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="http://localhost:8080/sse"
            />
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!name || loading}>
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Adding...
              </>
            ) : (
              'Add Server'
            )}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default MCPToolsTab;
