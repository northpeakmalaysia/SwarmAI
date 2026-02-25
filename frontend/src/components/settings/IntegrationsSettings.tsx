import React from 'react';
import { Cloud, Key, Webhook, AlertTriangle, Wrench, Plug, Zap, Database, Eye, Mic } from 'lucide-react';
import { Tabs } from '../common/Tabs';
import { AIProvidersTab } from './apikeys/AIProvidersTab';
import { HttpApiKeysTab } from './apikeys/HttpApiKeysTab';
import { WebhooksTab } from './apikeys/WebhooksTab';
import { ToolApiKeysTab } from './apikeys/ToolApiKeysTab';
import { MCPToolsTab } from './apikeys/MCPToolsTab';
import { SystemToolsTab } from './apikeys/SystemToolsTab';
import { EmbeddingSettingsTab } from './apikeys/EmbeddingSettingsTab';
import { OcrVisionSettingsTab } from './apikeys/OcrVisionSettingsTab';
import { VoiceTranscriptionSettingsTab } from './apikeys/VoiceTranscriptionSettingsTab';

/**
 * IntegrationsSettings Component
 *
 * Consolidated integrations tab that combines:
 * - AI Providers (user's own API keys with full model management)
 * - HTTP API Keys (for external integrations)
 * - Webhooks (HTTP webhook endpoints)
 *
 * Users MUST manage their own AI API keys - system does not provide defaults.
 * Only Ollama (local) is available without API keys.
 */
export const IntegrationsSettings: React.FC = () => {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Integrations</h2>
          <p className="text-sm text-gray-400">
            Manage your AI providers, tool API keys, MCP tools, and webhooks
          </p>
        </div>
      </div>

      {/* Important Notice */}
      <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="text-amber-200 font-medium">AI Keys Required</p>
            <p className="text-amber-200/70 mt-1">
              You must configure your own AI provider API keys to use AI features.
              Only <strong>Ollama</strong> (local models) is available without an API key.
            </p>
          </div>
        </div>
      </div>

      {/* Sub-tabs */}
      <Tabs defaultValue="ai-providers">
        <Tabs.List>
          <Tabs.Trigger value="ai-providers" icon={<Cloud className="w-4 h-4" />}>
            AI Providers
          </Tabs.Trigger>
          <Tabs.Trigger value="embeddings" icon={<Database className="w-4 h-4" />}>
            Embeddings
          </Tabs.Trigger>
          <Tabs.Trigger value="ocr-vision" icon={<Eye className="w-4 h-4" />}>
            OCR & Vision
          </Tabs.Trigger>
          <Tabs.Trigger value="voice-transcription" icon={<Mic className="w-4 h-4" />}>
            Voice Transcription
          </Tabs.Trigger>
          <Tabs.Trigger value="system-tools" icon={<Zap className="w-4 h-4" />}>
            System Tools
          </Tabs.Trigger>
          <Tabs.Trigger value="tool-api-keys" icon={<Wrench className="w-4 h-4" />}>
            Tool API Keys
          </Tabs.Trigger>
          <Tabs.Trigger value="mcp-tools" icon={<Plug className="w-4 h-4" />}>
            MCP Tools
          </Tabs.Trigger>
          <Tabs.Trigger value="http-api-keys" icon={<Key className="w-4 h-4" />}>
            HTTP API Keys
          </Tabs.Trigger>
          <Tabs.Trigger value="webhooks" icon={<Webhook className="w-4 h-4" />}>
            Webhooks
          </Tabs.Trigger>
        </Tabs.List>

        <div className="mt-6">
          <Tabs.Content value="ai-providers">
            <AIProvidersTab />
          </Tabs.Content>
          <Tabs.Content value="embeddings">
            <EmbeddingSettingsTab />
          </Tabs.Content>
          <Tabs.Content value="ocr-vision">
            <OcrVisionSettingsTab />
          </Tabs.Content>
          <Tabs.Content value="voice-transcription">
            <VoiceTranscriptionSettingsTab />
          </Tabs.Content>
          <Tabs.Content value="system-tools">
            <SystemToolsTab />
          </Tabs.Content>
          <Tabs.Content value="tool-api-keys">
            <ToolApiKeysTab />
          </Tabs.Content>
          <Tabs.Content value="mcp-tools">
            <MCPToolsTab />
          </Tabs.Content>
          <Tabs.Content value="http-api-keys">
            <HttpApiKeysTab />
          </Tabs.Content>
          <Tabs.Content value="webhooks">
            <WebhooksTab />
          </Tabs.Content>
        </div>
      </Tabs>
    </div>
  );
};

export default IntegrationsSettings;
