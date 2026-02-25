import React, { useState, useEffect, useCallback } from 'react';
import {
  User,
  Bot,
  Heart,
  FileText,
  Save,
  RefreshCw,
  Eye,
  Code,
  ChevronDown,
  ChevronUp,
  Sparkles,
  AlertCircle,
  Check,
  Copy,
  Download,
  Upload,
  LayoutTemplate,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { Tabs } from '../common/Tabs';
import { Modal } from '../common/Modal';
import toast from 'react-hot-toast';
import api from '../../services/api';

export interface PersonalityPanelProps {
  agenticId: string;
  className?: string;
}

interface Personality {
  soul: string;
  agents: string;
  user: string;
  identity: string;
  hasCustom: {
    soul: boolean;
    agents: boolean;
    user: boolean;
    identity: boolean;
  };
}

interface Preset {
  id: string;
  name: string;
  emoji: string;
  description: string;
}

interface FileConfig {
  key: keyof Omit<Personality, 'hasCustom'>;
  name: string;
  icon: React.ReactNode;
  description: string;
  color: string;
}

const FILE_CONFIGS: FileConfig[] = [
  {
    key: 'identity',
    name: 'IDENTITY.md',
    icon: <Bot className="w-4 h-4" />,
    description: "Agent's name, emoji, and vibe",
    color: 'text-purple-400',
  },
  {
    key: 'soul',
    name: 'SOUL.md',
    icon: <Heart className="w-4 h-4" />,
    description: 'Persona, tone, and boundaries',
    color: 'text-pink-400',
  },
  {
    key: 'agents',
    name: 'AGENTS.md',
    icon: <FileText className="w-4 h-4" />,
    description: 'Operating instructions and rules',
    color: 'text-sky-400',
  },
  {
    key: 'user',
    name: 'USER.md',
    icon: <User className="w-4 h-4" />,
    description: 'User context and preferences',
    color: 'text-emerald-400',
  },
];

export const PersonalityPanel: React.FC<PersonalityPanelProps> = ({
  agenticId,
  className,
}) => {
  const [personality, setPersonality] = useState<Personality | null>(null);
  const [editedContent, setEditedContent] = useState<Record<string, string>>({});
  const [activeFile, setActiveFile] = useState<string>('identity');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState<string>('');
  const [hasChanges, setHasChanges] = useState<Record<string, boolean>>({});
  const [presets, setPresets] = useState<Preset[]>([]);
  const [showPresets, setShowPresets] = useState(false);
  const [applyingPreset, setApplyingPreset] = useState<string | null>(null);

  // AI Generate state
  const [aiContext, setAiContext] = useState<Record<string, unknown> | null>(null);
  const [isLoadingContext, setIsLoadingContext] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [guidanceText, setGuidanceText] = useState('');
  const [generateLanguage, setGenerateLanguage] = useState('English');

  // Fetch personality
  const fetchPersonality = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await api.get(`/agentic/profiles/${agenticId}/personality`);
      setPersonality(response.data);
      setEditedContent({
        soul: response.data.soul,
        agents: response.data.agents,
        user: response.data.user,
        identity: response.data.identity,
      });
      setHasChanges({});
    } catch (error) {
      console.error('Failed to fetch personality:', error);
      toast.error('Failed to load personality configuration');
    } finally {
      setIsLoading(false);
    }
  }, [agenticId]);

  // Fetch system prompt preview
  const fetchSystemPrompt = useCallback(async () => {
    try {
      const response = await api.get(`/agentic/profiles/${agenticId}/personality/system-prompt`);
      setSystemPrompt(response.data.systemPrompt);
    } catch (error) {
      console.error('Failed to fetch system prompt:', error);
    }
  }, [agenticId]);

  // Fetch presets
  const fetchPresets = useCallback(async () => {
    try {
      const response = await api.get('/agentic/personality/presets');
      setPresets(response.data.presets || []);
    } catch (error) {
      console.error('Failed to fetch presets:', error);
    }
  }, []);

  useEffect(() => {
    fetchPersonality();
    fetchPresets();
  }, [fetchPersonality, fetchPresets]);

  // Apply preset
  const handleApplyPreset = async (presetId: string) => {
    if (!confirm(`Apply the "${presets.find(p => p.id === presetId)?.name}" preset? This will replace all personality files.`)) return;

    try {
      setApplyingPreset(presetId);
      await api.post(`/agentic/profiles/${agenticId}/personality/apply-preset`, { presetId });
      toast.success('Preset applied successfully');
      setShowPresets(false);
      fetchPersonality();
    } catch (error) {
      console.error('Failed to apply preset:', error);
      toast.error('Failed to apply preset');
    } finally {
      setApplyingPreset(null);
    }
  };

  // Handle content change
  const handleContentChange = (key: string, value: string) => {
    setEditedContent((prev) => ({ ...prev, [key]: value }));
    setHasChanges((prev) => ({
      ...prev,
      [key]: value !== personality?.[key as keyof Omit<Personality, 'hasCustom'>],
    }));
  };

  // Save single file
  const handleSaveFile = async (fileKey: string) => {
    try {
      setIsSaving(true);
      await api.put(`/agentic/profiles/${agenticId}/personality/${fileKey}`, {
        content: editedContent[fileKey],
      });
      toast.success(`${fileKey.toUpperCase()}.md saved`);
      setHasChanges((prev) => ({ ...prev, [fileKey]: false }));
      fetchPersonality();
    } catch (error) {
      console.error('Failed to save file:', error);
      toast.error('Failed to save file');
    } finally {
      setIsSaving(false);
    }
  };

  // Save all files
  const handleSaveAll = async () => {
    try {
      setIsSaving(true);
      await api.put(`/agentic/profiles/${agenticId}/personality`, editedContent);
      toast.success('All personality files saved');
      setHasChanges({});
      fetchPersonality();
    } catch (error) {
      console.error('Failed to save personality:', error);
      toast.error('Failed to save personality');
    } finally {
      setIsSaving(false);
    }
  };

  // Reset single file to default
  const handleResetFile = async (fileKey: string) => {
    if (!confirm(`Reset ${fileKey.toUpperCase()}.md to default? Your changes will be lost.`)) return;

    try {
      setIsSaving(true);
      await api.delete(`/agentic/profiles/${agenticId}/personality/${fileKey}`);
      toast.success(`${fileKey.toUpperCase()}.md reset to default`);
      fetchPersonality();
    } catch (error) {
      console.error('Failed to reset file:', error);
      toast.error('Failed to reset file');
    } finally {
      setIsSaving(false);
    }
  };

  // Reset all files
  const handleResetAll = async () => {
    if (!confirm('Reset ALL personality files to defaults? Your changes will be lost.')) return;

    try {
      setIsSaving(true);
      await api.post(`/agentic/profiles/${agenticId}/personality/reset`);
      toast.success('All personality files reset to defaults');
      fetchPersonality();
    } catch (error) {
      console.error('Failed to reset personality:', error);
      toast.error('Failed to reset personality');
    } finally {
      setIsSaving(false);
    }
  };

  // Open AI Generate modal and fetch context
  const handleOpenGenerateModal = async () => {
    setShowGenerateModal(true);
    setIsLoadingContext(true);
    setAiContext(null);
    try {
      const response = await api.get(`/agentic/profiles/${agenticId}/personality/ai-context`);
      setAiContext(response.data);
    } catch (error) {
      console.error('Failed to fetch AI context:', error);
      toast.error('Failed to load agent data');
    } finally {
      setIsLoadingContext(false);
    }
  };

  // AI Generate handler
  const handleAIGenerate = async () => {
    try {
      setIsGenerating(true);
      await api.post(
        `/agentic/profiles/${agenticId}/personality/ai-generate`,
        { guidance: guidanceText, language: generateLanguage },
        { timeout: 60000 }
      );
      toast.success('Personality generated by AI!');
      setShowGenerateModal(false);
      setGuidanceText('');
      fetchPersonality();
    } catch (error: unknown) {
      console.error('Failed to AI-generate personality:', error);
      const message = (error as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to generate personality with AI';
      toast.error(message);
    } finally {
      setIsGenerating(false);
    }
  };

  // Sync to workspace
  const handleSyncWorkspace = async () => {
    try {
      setIsSaving(true);
      await api.post(`/agentic/profiles/${agenticId}/personality/sync-workspace`);
      toast.success('Personality files synced to workspace');
    } catch (error: unknown) {
      console.error('Failed to sync to workspace:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to sync to workspace';
      toast.error(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  // Copy system prompt
  const handleCopySystemPrompt = () => {
    navigator.clipboard.writeText(systemPrompt);
    toast.success('System prompt copied to clipboard');
  };

  // Show preview modal
  const handleShowPreview = () => {
    fetchSystemPrompt();
    setShowPreview(true);
  };

  const anyChanges = Object.values(hasChanges).some(Boolean);
  const activeConfig = FILE_CONFIGS.find((f) => f.key === activeFile);

  if (isLoading) {
    return (
      <div className={cn('flex items-center justify-center h-64', className)}>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-swarm-primary" />
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-lg font-semibold text-white flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-400" />
            Personality Configuration
          </h4>
          <p className="text-sm text-gray-400 mt-1">
            Markdown files for agent identity and behavior
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowPresets(!showPresets)}
            icon={<LayoutTemplate className="w-4 h-4" />}
          >
            Presets
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleShowPreview}
            icon={<Eye className="w-4 h-4" />}
          >
            Preview
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleOpenGenerateModal}
            icon={<Sparkles className="w-4 h-4" />}
          >
            Generate
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSyncWorkspace}
            disabled={isSaving}
            icon={<Upload className="w-4 h-4" />}
          >
            Sync
          </Button>
          {anyChanges && (
            <Button
              variant="primary"
              size="sm"
              onClick={handleSaveAll}
              disabled={isSaving}
              icon={<Save className="w-4 h-4" />}
            >
              Save All
            </Button>
          )}
        </div>
      </div>

      {/* Preset Selector */}
      {showPresets && presets.length > 0 && (
        <div className="p-4 bg-swarm-dark/80 rounded-xl border border-swarm-border/20">
          <div className="flex items-center justify-between mb-3">
            <h5 className="text-sm font-medium text-gray-300 flex items-center gap-2">
              <LayoutTemplate className="w-4 h-4 text-purple-400" />
              Choose a Preset
            </h5>
            <button onClick={() => setShowPresets(false)} className="text-gray-500 hover:text-gray-300 text-xs">
              Hide
            </button>
          </div>
          <p className="text-xs text-gray-500 mb-3">
            Pick a starting point that matches your use case. You can customize everything after applying.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {presets.map((preset) => (
              <button
                key={preset.id}
                onClick={() => handleApplyPreset(preset.id)}
                disabled={applyingPreset !== null}
                className={cn(
                  'flex items-start gap-3 p-3 rounded-lg border text-left transition-all',
                  'bg-swarm-darker border-swarm-border/20 hover:border-swarm-primary/50 hover:bg-swarm-primary/10',
                  applyingPreset === preset.id && 'border-swarm-primary bg-swarm-primary/20'
                )}
              >
                <span className="text-2xl flex-shrink-0 mt-0.5">{preset.emoji}</span>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-white">{preset.name}</div>
                  <div className="text-xs text-gray-500 mt-0.5 line-clamp-2">{preset.description}</div>
                </div>
                {applyingPreset === preset.id && (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-swarm-primary flex-shrink-0" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* File Tabs */}
      <div className="flex gap-2 flex-wrap">
        {FILE_CONFIGS.map((config) => (
          <button
            key={config.key}
            onClick={() => setActiveFile(config.key)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg border transition-all',
              activeFile === config.key
                ? 'bg-swarm-primary/20 border-swarm-primary text-white'
                : 'bg-swarm-darker border-swarm-border/30 text-gray-400 hover:text-white hover:border-swarm-border/50'
            )}
          >
            <span className={config.color}>{config.icon}</span>
            <span className="text-sm font-medium">{config.name}</span>
            {hasChanges[config.key] && (
              <Badge variant="warning" size="sm" dot>
                Modified
              </Badge>
            )}
            {personality?.hasCustom[config.key] && !hasChanges[config.key] && (
              <Badge variant="success" size="sm">
                Custom
              </Badge>
            )}
          </button>
        ))}
      </div>

      {/* Editor */}
      <div className="bg-swarm-darker rounded-xl border border-swarm-border/20 overflow-hidden">
        {/* Editor Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-swarm-border/20">
          <div className="flex items-center gap-2">
            <span className={activeConfig?.color}>{activeConfig?.icon}</span>
            <span className="font-medium text-white">{activeConfig?.name}</span>
            <span className="text-sm text-gray-500">- {activeConfig?.description}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleResetFile(activeFile)}
              disabled={isSaving || !personality?.hasCustom[activeFile as keyof Omit<Personality, 'hasCustom'>]}
              icon={<RefreshCw className="w-3 h-3" />}
            >
              Reset
            </Button>
            <Button
              variant={hasChanges[activeFile] ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => handleSaveFile(activeFile)}
              disabled={isSaving || !hasChanges[activeFile]}
              icon={<Save className="w-3 h-3" />}
            >
              Save
            </Button>
          </div>
        </div>

        {/* Editor Content */}
        <div className="relative">
          <textarea
            value={editedContent[activeFile] || ''}
            onChange={(e) => handleContentChange(activeFile, e.target.value)}
            className={cn(
              'w-full min-h-[400px] p-4 bg-transparent text-white font-mono text-sm',
              'focus:outline-none resize-y',
              'placeholder-gray-600'
            )}
            placeholder={`# ${activeConfig?.name}\n\nStart writing your ${activeFile} configuration...`}
            spellCheck={false}
          />
          <div className="absolute bottom-2 right-4 text-xs text-gray-600">
            {editedContent[activeFile]?.length || 0} chars
          </div>
        </div>
      </div>

      {/* Quick Tips */}
      <div className="p-4 bg-swarm-dark/50 rounded-lg border border-swarm-border/10">
        <h5 className="text-sm font-medium text-gray-300 mb-2">Quick Tips</h5>
        <ul className="text-xs text-gray-500 space-y-1">
          <li>
            <strong>IDENTITY.md</strong>: Define name, emoji (e.g., ), and vibe
          </li>
          <li>
            <strong>SOUL.md</strong>: Set personality traits, tone, and hard boundaries
          </li>
          <li>
            <strong>AGENTS.md</strong>: Write operating rules and tool usage guidelines
          </li>
          <li>
            <strong>USER.md</strong>: Describe the user context and preferences
          </li>
        </ul>
      </div>

      {/* Preview Modal */}
      <Modal
        open={showPreview}
        onClose={() => setShowPreview(false)}
        title="System Prompt Preview"
        size="lg"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-400">
            This is the combined system prompt generated from your personality files.
          </p>
          <div className="relative">
            <pre className="bg-swarm-darker p-4 rounded-lg text-sm text-gray-300 overflow-auto max-h-[400px] font-mono whitespace-pre-wrap">
              {systemPrompt || 'Loading...'}
            </pre>
            <Button
              variant="ghost"
              size="sm"
              className="absolute top-2 right-2"
              onClick={handleCopySystemPrompt}
              icon={<Copy className="w-4 h-4" />}
            >
              Copy
            </Button>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowPreview(false)}>
              Close
            </Button>
          </div>
        </div>
      </Modal>

      {/* AI Generate Modal */}
      <Modal
        open={showGenerateModal}
        onClose={() => !isGenerating && setShowGenerateModal(false)}
        title="Generate Personality with AI"
        size="lg"
      >
        <div className="space-y-4">
          {isLoadingContext ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-swarm-primary" />
              <span className="ml-3 text-gray-400">Loading agent data...</span>
            </div>
          ) : aiContext ? (
            <>
              <p className="text-sm text-gray-400">
                AI will analyze this agent's existing data and generate personality files that match its role and capabilities. The more data configured, the richer the personality.
              </p>

              {/* Data Sources Summary */}
              <div className="p-4 bg-swarm-dark/80 rounded-xl border border-swarm-border/20">
                <h5 className="text-sm font-medium text-gray-300 mb-3 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-sky-400" />
                  Data Sources
                </h5>
                <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-sm">
                  <ContextItem
                    label="Profile"
                    value={`${(aiContext.profile as Record<string, string>)?.name} - ${(aiContext.profile as Record<string, string>)?.role}`}
                    available={true}
                  />
                  <ContextItem
                    label="Description"
                    value={(aiContext.profile as Record<string, string>)?.description ? 'Configured' : 'Not set'}
                    available={!!(aiContext.profile as Record<string, string>)?.description}
                  />
                  <ContextItem
                    label="System Prompt"
                    value={(aiContext.profile as Record<string, boolean>)?.hasSystemPrompt ? 'Configured' : 'Not set'}
                    available={!!(aiContext.profile as Record<string, boolean>)?.hasSystemPrompt}
                  />
                  <ContextItem
                    label="Background"
                    value={aiContext.hasBackground ? (aiContext.background as Record<string, string>)?.companyName || 'Configured' : 'Not set'}
                    available={!!aiContext.hasBackground}
                  />
                  <ContextItem
                    label="Goals"
                    value={`${aiContext.goalsCount} active`}
                    available={(aiContext.goalsCount as number) > 0}
                  />
                  <ContextItem
                    label="Skills"
                    value={`${aiContext.skillsCount} assigned`}
                    available={(aiContext.skillsCount as number) > 0}
                  />
                  <ContextItem
                    label="Team Members"
                    value={`${aiContext.teamMembersCount} members`}
                    available={(aiContext.teamMembersCount as number) > 0}
                  />
                  <ContextItem
                    label="Schedules"
                    value={`${aiContext.schedulesCount} active`}
                    available={(aiContext.schedulesCount as number) > 0}
                  />
                  <ContextItem
                    label="Monitoring"
                    value={`${aiContext.monitoringCount} sources`}
                    available={(aiContext.monitoringCount as number) > 0}
                  />
                </div>
              </div>

              {/* Language */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">Output Language</label>
                <select
                  title="Language"
                  value={generateLanguage}
                  onChange={(e) => setGenerateLanguage(e.target.value)}
                  className="w-full px-3 py-2 bg-swarm-dark border border-swarm-border/30 rounded-lg text-white text-sm"
                >
                  <option value="English">English</option>
                  <option value="Bahasa Indonesia">Bahasa Indonesia</option>
                  <option value="Bahasa Melayu">Bahasa Melayu</option>
                  <option value="Chinese">Chinese</option>
                  <option value="Japanese">Japanese</option>
                  <option value="Korean">Korean</option>
                  <option value="Spanish">Spanish</option>
                  <option value="French">French</option>
                  <option value="German">German</option>
                  <option value="Portuguese">Portuguese</option>
                  <option value="Arabic">Arabic</option>
                  <option value="Hindi">Hindi</option>
                  <option value="Thai">Thai</option>
                  <option value="Vietnamese">Vietnamese</option>
                </select>
              </div>

              {/* Optional Guidance */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Guidance (optional) - steer the AI's output
                </label>
                <textarea
                  value={guidanceText}
                  onChange={(e) => setGuidanceText(e.target.value)}
                  placeholder="e.g., Make it more formal, Focus on customer support capabilities, Add humor..."
                  className="w-full px-3 py-2 bg-swarm-dark border border-swarm-border/30 rounded-lg text-white text-sm min-h-[80px] resize-y placeholder-gray-600"
                  maxLength={500}
                />
                <div className="text-xs text-gray-600 text-right mt-1">
                  {guidanceText.length}/500
                </div>
              </div>
            </>
          ) : (
            <div className="py-4 text-center">
              <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
              <p className="text-sm text-red-400">Failed to load agent context. Please close and try again.</p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4 border-t border-swarm-border/20">
            <Button variant="ghost" onClick={() => setShowGenerateModal(false)} disabled={isGenerating}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleAIGenerate}
              disabled={isGenerating || isLoadingContext || !aiContext}
              icon={isGenerating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            >
              {isGenerating ? 'Generating...' : 'Generate with AI'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

// Helper component for context data source items
const ContextItem = ({ label, value, available }: { label: string; value: string; available: boolean }) => (
  <div className="flex items-center gap-2 py-0.5">
    {available ? (
      <Check className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
    ) : (
      <AlertCircle className="w-3.5 h-3.5 text-gray-600 flex-shrink-0" />
    )}
    <span className={cn('text-xs', available ? 'text-gray-300' : 'text-gray-600')}>
      <strong>{label}:</strong> {value}
    </span>
  </div>
);

export default PersonalityPanel;
