import React from 'react'
import { Bot, Key, Webhook } from 'lucide-react'
import { Tabs } from '../../common/Tabs'
import { WebhooksTab } from './WebhooksTab'
import { AIProvidersTab } from './AIProvidersTab'
import { HttpApiKeysTab } from './HttpApiKeysTab'

/**
 * ApiKeysContainer Component
 *
 * Container component for API Keys & Integrations settings.
 * Provides sub-tab navigation between AI Providers, HTTP API Keys, and Webhooks.
 */
export const ApiKeysContainer: React.FC = () => {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">API Keys & Integrations</h2>
          <p className="text-sm text-gray-400">
            Manage AI providers, HTTP API keys, and webhooks
          </p>
        </div>
      </div>

      {/* Sub-tabs */}
      <Tabs defaultValue="ai-providers">
        <Tabs.List>
          <Tabs.Trigger value="ai-providers" icon={<Bot className="w-4 h-4" />}>
            AI Providers
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
          <Tabs.Content value="http-api-keys">
            <HttpApiKeysTab />
          </Tabs.Content>
          <Tabs.Content value="webhooks">
            <WebhooksTab />
          </Tabs.Content>
        </div>
      </Tabs>
    </div>
  )
}

export default ApiKeysContainer
