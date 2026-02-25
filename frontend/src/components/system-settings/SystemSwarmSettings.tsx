import React, { useState, useEffect } from 'react';
import {
  Server,
  Users,
  Zap,
  Clock,
  AlertTriangle,
  Save,
  RefreshCw,
  Activity,
  Share2,
  Sparkles,
  Brain,
  Database,
  FileText,
  FolderTree,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { Card, CardHeader, CardBody } from '../common/Card';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { Badge } from '../common/Badge';
import { cn } from '../../lib/utils';
import toast from 'react-hot-toast';
import api from '../../services/api';
import { formatDate, formatDateTime } from '../../utils/dateFormat';

/**
 * Swarm configuration interface
 */
interface SwarmConfig {
  maxAgentsPerUser: number;
  maxConcurrentTasks: number;
  handoffTimeout: number; // minutes
  consensusThreshold: number; // percentage
  autoAssignTasks: boolean;
  enableCollaboration: boolean;
  taskRetryLimit: number;
  idleAgentTimeout: number; // minutes
  // AI Flow Generator settings
  flowGeneratorAiName: string;
}

const DEFAULT_CONFIG: SwarmConfig = {
  maxAgentsPerUser: 10,
  maxConcurrentTasks: 5,
  handoffTimeout: 30,
  consensusThreshold: 60,
  autoAssignTasks: true,
  enableCollaboration: true,
  taskRetryLimit: 3,
  idleAgentTimeout: 60,
  flowGeneratorAiName: 'Athena',
};

/**
 * FlowSchemaRAG status interface
 */
interface FlowSchemaRAGStatus {
  initialized: boolean;
  libraryId: string;
  folderId: string;
  libraryInfo: {
    id: string;
    name: string;
    description: string;
    created_at: string;
    updated_at: string;
  } | null;
  folderInfo: {
    id: string;
    name: string;
    created_at: string;
  } | null;
  lastSyncStats: {
    updated: number;
    created: number;
    timestamp: string;
  } | null;
  currentStats: {
    totalNodeSchemas: number;
    documentsInFolder: number;
    chunksInFolder: number;
    categories: number;
  };
  schemasByCategory: Record<string, Array<{ type: string; title: string }>>;
  libraryName: string;
  folderName: string;
}

/**
 * SystemSwarmSettings Component
 *
 * Manages system-wide swarm configuration:
 * - Agent limits per user
 * - Task concurrency limits
 * - Handoff and consensus settings
 * - Collaboration features
 */
export const SystemSwarmSettings: React.FC = () => {
  const [config, setConfig] = useState<SwarmConfig>(DEFAULT_CONFIG);
  const [originalConfig, setOriginalConfig] = useState<SwarmConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  // FlowSchemaRAG state
  const [ragStatus, setRagStatus] = useState<FlowSchemaRAGStatus | null>(null);
  const [ragLoading, setRagLoading] = useState(false);
  const [ragResyncing, setRagResyncing] = useState(false);
  const [showRagDetails, setShowRagDetails] = useState(false);

  useEffect(() => {
    fetchConfig();
    fetchRagStatus();
  }, []);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const response = await api.get('/swarm/config');
      const fetchedConfig = { ...DEFAULT_CONFIG, ...response.data.config };
      setConfig(fetchedConfig);
      setOriginalConfig(fetchedConfig);
    } catch (error) {
      console.error('Failed to fetch swarm config:', error);
      // Use defaults if fetch fails
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (key: keyof SwarmConfig, value: number | boolean | string) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
    setIsDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put('/swarm/config', { config });
      setOriginalConfig(config);
      setIsDirty(false);
      toast.success('Swarm configuration saved');
    } catch (error) {
      console.error('Failed to save swarm config:', error);
      toast.error('Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setConfig(originalConfig);
    setIsDirty(false);
  };

  // Fetch FlowSchemaRAG status
  const fetchRagStatus = async () => {
    setRagLoading(true);
    try {
      const response = await api.get('/superbrain/admin/schema-rag/status');
      if (response.data?.status) {
        setRagStatus(response.data.status);
      }
    } catch (error) {
      console.error('Failed to fetch RAG status:', error);
      // Non-critical, just log
    } finally {
      setRagLoading(false);
    }
  };

  // Force resync FlowSchemaRAG
  const handleResyncRag = async () => {
    setRagResyncing(true);
    try {
      await api.post('/superbrain/admin/schema-rag/resync');
      toast.success('FlowBuilder schemas resynced successfully');
      // Refresh status
      await fetchRagStatus();
    } catch (error) {
      console.error('Failed to resync RAG:', error);
      toast.error('Failed to resync schemas');
    } finally {
      setRagResyncing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-6 h-6 text-gray-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Info Banner */}
      <Card variant="bordered" className="border-sky-500/50 bg-sky-500/10">
        <CardBody className="py-3">
          <div className="flex items-center gap-3">
            <Activity className="w-5 h-5 text-sky-400 flex-shrink-0" />
            <div className="text-sm text-sky-200">
              <strong>Swarm Configuration:</strong> These settings control how agents collaborate and handle tasks across the system.
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Agent Limits */}
      <Card variant="pressed">
        <CardHeader
          title="Agent Limits"
          subtitle="Control the number of agents and tasks"
        />
        <CardBody>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Max Agents Per User
              </label>
              <Input
                type="number"
                min={1}
                max={100}
                value={config.maxAgentsPerUser}
                onChange={(e) => handleChange('maxAgentsPerUser', parseInt(e.target.value) || 1)}
              />
              <p className="text-xs text-gray-500 mt-1">
                Maximum number of agents a single user can create
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Max Concurrent Tasks
              </label>
              <Input
                type="number"
                min={1}
                max={50}
                value={config.maxConcurrentTasks}
                onChange={(e) => handleChange('maxConcurrentTasks', parseInt(e.target.value) || 1)}
              />
              <p className="text-xs text-gray-500 mt-1">
                Maximum tasks running simultaneously per agent
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Task Retry Limit
              </label>
              <Input
                type="number"
                min={0}
                max={10}
                value={config.taskRetryLimit}
                onChange={(e) => handleChange('taskRetryLimit', parseInt(e.target.value) || 0)}
              />
              <p className="text-xs text-gray-500 mt-1">
                Number of times to retry a failed task
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Idle Agent Timeout (minutes)
              </label>
              <Input
                type="number"
                min={5}
                max={1440}
                value={config.idleAgentTimeout}
                onChange={(e) => handleChange('idleAgentTimeout', parseInt(e.target.value) || 60)}
              />
              <p className="text-xs text-gray-500 mt-1">
                Time before idle agents are marked inactive
              </p>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Handoff & Consensus */}
      <Card variant="pressed">
        <CardHeader
          title="Handoff & Consensus"
          subtitle="Configure agent collaboration settings"
        />
        <CardBody>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Handoff Timeout (minutes)
              </label>
              <Input
                type="number"
                min={5}
                max={120}
                value={config.handoffTimeout}
                onChange={(e) => handleChange('handoffTimeout', parseInt(e.target.value) || 30)}
              />
              <p className="text-xs text-gray-500 mt-1">
                Time limit for another agent to accept a handoff
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Consensus Threshold (%)
              </label>
              <Input
                type="number"
                min={50}
                max={100}
                value={config.consensusThreshold}
                onChange={(e) => handleChange('consensusThreshold', parseInt(e.target.value) || 60)}
              />
              <p className="text-xs text-gray-500 mt-1">
                Percentage of agents required for consensus decisions
              </p>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* AI Flow Generator */}
      <Card variant="pressed">
        <CardHeader
          title="AI Flow Generator"
          subtitle="Configure the AI assistant for flow generation"
        />
        <CardBody>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                AI Assistant Name
              </label>
              <Input
                type="text"
                maxLength={50}
                value={config.flowGeneratorAiName}
                onChange={(e) => handleChange('flowGeneratorAiName', e.target.value)}
                placeholder="Athena"
              />
              <p className="text-xs text-gray-500 mt-1">
                Name displayed for the AI Flow Generator assistant (default: Athena)
              </p>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* FlowSchemaRAG Knowledge Base */}
      <Card variant="pressed">
        <CardHeader
          title="FlowBuilder Knowledge Base"
          subtitle="AI-accessible schema documentation for flow generation"
        />
        <CardBody>
          {ragLoading ? (
            <div className="flex items-center justify-center py-6">
              <RefreshCw className="w-5 h-5 text-gray-400 animate-spin" />
            </div>
          ) : ragStatus ? (
            <div className="space-y-4">
              {/* Status Overview */}
              <div className="flex items-center gap-4 p-4 rounded-lg bg-slate-800/50 border border-slate-700">
                <div className={cn(
                  'w-10 h-10 rounded-lg flex items-center justify-center',
                  ragStatus.initialized ? 'bg-green-500/20' : 'bg-red-500/20'
                )}>
                  {ragStatus.initialized ? (
                    <CheckCircle className="w-5 h-5 text-green-400" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-400" />
                  )}
                </div>
                <div className="flex-1">
                  <h4 className="font-medium text-white">
                    {ragStatus.initialized ? 'Knowledge Base Active' : 'Not Initialized'}
                  </h4>
                  <p className="text-sm text-gray-400">
                    {ragStatus.libraryName} → {ragStatus.folderName}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<RefreshCw className={cn('w-4 h-4', ragResyncing && 'animate-spin')} />}
                  onClick={handleResyncRag}
                  loading={ragResyncing}
                >
                  Resync
                </Button>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-700">
                  <div className="flex items-center gap-2 text-violet-400 mb-1">
                    <Brain className="w-4 h-4" />
                    <span className="text-xs font-medium">Node Schemas</span>
                  </div>
                  <p className="text-xl font-bold text-white">
                    {ragStatus.currentStats.totalNodeSchemas}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-700">
                  <div className="flex items-center gap-2 text-cyan-400 mb-1">
                    <FileText className="w-4 h-4" />
                    <span className="text-xs font-medium">Documents</span>
                  </div>
                  <p className="text-xl font-bold text-white">
                    {ragStatus.currentStats.documentsInFolder}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-700">
                  <div className="flex items-center gap-2 text-amber-400 mb-1">
                    <Database className="w-4 h-4" />
                    <span className="text-xs font-medium">Chunks</span>
                  </div>
                  <p className="text-xl font-bold text-white">
                    {ragStatus.currentStats.chunksInFolder}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-700">
                  <div className="flex items-center gap-2 text-green-400 mb-1">
                    <FolderTree className="w-4 h-4" />
                    <span className="text-xs font-medium">Categories</span>
                  </div>
                  <p className="text-xl font-bold text-white">
                    {ragStatus.currentStats.categories}
                  </p>
                </div>
              </div>

              {/* Expandable Details */}
              <button
                onClick={() => setShowRagDetails(!showRagDetails)}
                className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors"
              >
                <span>{showRagDetails ? 'Hide' : 'Show'} Details</span>
                <span className={cn('transition-transform', showRagDetails && 'rotate-180')}>▼</span>
              </button>

              {showRagDetails && (
                <div className="space-y-3 pt-2">
                  {/* Library & Folder Info */}
                  <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-700">
                    <h5 className="text-sm font-medium text-gray-300 mb-2">Storage Details</h5>
                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div>
                        <span className="text-gray-500">Library ID:</span>
                        <p className="text-gray-300 font-mono truncate">{ragStatus.libraryId}</p>
                      </div>
                      <div>
                        <span className="text-gray-500">Folder ID:</span>
                        <p className="text-gray-300 font-mono truncate">{ragStatus.folderId}</p>
                      </div>
                      {ragStatus.libraryInfo && (
                        <div>
                          <span className="text-gray-500">Created:</span>
                          <p className="text-gray-300">
                            {formatDate(ragStatus.libraryInfo.created_at)}
                          </p>
                        </div>
                      )}
                      {ragStatus.lastSyncStats && (
                        <div>
                          <span className="text-gray-500">Last Sync:</span>
                          <p className="text-gray-300">
                            {formatDateTime(ragStatus.lastSyncStats.timestamp)}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Schemas by Category */}
                  <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-700">
                    <h5 className="text-sm font-medium text-gray-300 mb-2">Schemas by Category</h5>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(ragStatus.schemasByCategory || {}).map(([category, schemas]) => (
                        <span
                          key={category}
                          className="px-2 py-1 rounded-full bg-slate-700 text-xs text-gray-300"
                          title={schemas.map(s => s.title).join(', ')}
                        >
                          {category}: {schemas.length}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-6 text-gray-500">
              <Brain className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>Failed to load knowledge base status</p>
              <Button
                variant="ghost"
                size="sm"
                className="mt-2"
                onClick={fetchRagStatus}
              >
                Retry
              </Button>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Feature Toggles */}
      <Card variant="pressed">
        <CardHeader
          title="Feature Toggles"
          subtitle="Enable or disable swarm features"
        />
        <CardBody>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-lg bg-slate-800/50 border border-slate-700">
              <div>
                <h4 className="font-medium text-white">Auto-Assign Tasks</h4>
                <p className="text-sm text-gray-400 mt-1">
                  Automatically assign incoming tasks to available agents
                </p>
              </div>
              <button
                onClick={() => handleChange('autoAssignTasks', !config.autoAssignTasks)}
                className={cn(
                  'relative w-12 h-6 rounded-full transition-colors',
                  config.autoAssignTasks ? 'bg-sky-500' : 'bg-slate-600'
                )}
              >
                <span
                  className={cn(
                    'absolute top-1 w-4 h-4 rounded-full bg-white transition-transform',
                    config.autoAssignTasks ? 'translate-x-7' : 'translate-x-1'
                  )}
                />
              </button>
            </div>

            <div className="flex items-center justify-between p-4 rounded-lg bg-slate-800/50 border border-slate-700">
              <div>
                <h4 className="font-medium text-white">Enable Collaboration</h4>
                <p className="text-sm text-gray-400 mt-1">
                  Allow agents to work together on complex tasks
                </p>
              </div>
              <button
                onClick={() => handleChange('enableCollaboration', !config.enableCollaboration)}
                className={cn(
                  'relative w-12 h-6 rounded-full transition-colors',
                  config.enableCollaboration ? 'bg-sky-500' : 'bg-slate-600'
                )}
              >
                <span
                  className={cn(
                    'absolute top-1 w-4 h-4 rounded-full bg-white transition-transform',
                    config.enableCollaboration ? 'translate-x-7' : 'translate-x-1'
                  )}
                />
              </button>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end gap-3">
        {isDirty && (
          <Button variant="ghost" onClick={handleReset}>
            Reset
          </Button>
        )}
        <Button
          variant="primary"
          icon={<Save className="w-4 h-4" />}
          onClick={handleSave}
          loading={saving}
          disabled={!isDirty}
        >
          Save Changes
        </Button>
      </div>
    </div>
  );
};

export default SystemSwarmSettings;
