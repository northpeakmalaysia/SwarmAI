/**
 * Shared types for API Keys & Integrations settings
 */

// =============================================================================
// AI Provider Types
// =============================================================================

export type AIProviderType = 'openrouter' | 'anthropic' | 'google' | 'ollama' | 'openai-compatible' | 'cli-claude' | 'cli-gemini' | 'cli-opencode' | 'local-agent' | 'groq' | 'openai-whisper'

export type AIProviderStatus = 'connected' | 'failed' | 'not_tested'

export interface AIProvider {
  id: string
  name: string
  type: AIProviderType
  baseUrl: string
  hasApiKey: boolean
  budgetLimit: number | null
  budgetUsed: number
  isDefault: boolean
  isActive: boolean
  lastTested: string | null
  status: AIProviderStatus
  modelCount: number
}

export type ModelCapability = 'chat' | 'vision' | 'tool_use' | 'code'

export interface AIModel {
  id: string
  providerId: string
  modelId: string
  name: string
  capabilities: ModelCapability[]
  inputPrice: number | null  // per 1M tokens
  outputPrice: number | null // per 1M tokens
  contextLength: number | null
  isDefault: boolean
  isFree?: boolean
}

// Capability icon mapping
export const CAPABILITY_ICONS: Record<ModelCapability, string> = {
  chat: '💬',
  vision: '👁',
  tool_use: '🔧',
  code: '📝'
}

// =============================================================================
// HTTP API Key Types
// =============================================================================

export type ApiKeyScope = 'full' | 'read' | 'write' | 'admin' | 'agents' | 'flows' | 'messages'

export interface HttpApiKey {
  id: string
  name: string
  keyPrefix: string
  scopes: ApiKeyScope[]
  rateLimitRpm: number
  ipWhitelist: string[] | null
  expiresAt: string | null
  lastUsedAt: string | null
  lastUsedIp: string | null
  requestCount24h: number
  createdAt: string
}

// Scope descriptions for UI
export const SCOPE_DESCRIPTIONS: Record<ApiKeyScope, string> = {
  full: 'Full access to all API endpoints',
  read: 'Read-only access to resources',
  write: 'Create and update resources',
  admin: 'Administrative operations',
  agents: 'Agent management operations',
  flows: 'Flow management operations',
  messages: 'Message operations'
}

// =============================================================================
// Webhook Types
// =============================================================================

export type WebhookEvent =
  | 'message.received'
  | 'message.sent'
  | 'agent.status_changed'
  | 'flow.started'
  | 'flow.completed'
  | 'flow.failed'
  | 'handoff.created'
  | 'handoff.completed'

export type WebhookRetryStrategy = 'fixed' | 'exponential'

export interface WebhookConfig {
  enabled: boolean
  url: string
  secret: string
  events: WebhookEvent[]
  maxRetries: number
  retryStrategy: WebhookRetryStrategy
  timeoutSeconds: number
}

export interface WebhookLog {
  id: string
  event: string
  endpointUrl: string
  status: number | null
  responseTimeMs: number | null
  attemptNumber: number
  maxAttempts: number
  requestPayload: string
  responseBody: string | null
  errorMessage: string | null
  createdAt: string
}

// Webhook event descriptions for UI
export const WEBHOOK_EVENT_DESCRIPTIONS: Record<WebhookEvent, { label: string; description: string }> = {
  'message.received': {
    label: 'Message Received',
    description: 'When a new message arrives'
  },
  'message.sent': {
    label: 'Message Sent',
    description: 'When a message is sent'
  },
  'agent.status_changed': {
    label: 'Agent Status Changed',
    description: 'When agent goes online/offline'
  },
  'flow.started': {
    label: 'Flow Started',
    description: 'When a flow begins execution'
  },
  'flow.completed': {
    label: 'Flow Completed',
    description: 'When a flow completes successfully'
  },
  'flow.failed': {
    label: 'Flow Failed',
    description: 'When a flow fails with an error'
  },
  'handoff.created': {
    label: 'Handoff Created',
    description: 'When a handoff is initiated'
  },
  'handoff.completed': {
    label: 'Handoff Completed',
    description: 'When a handoff is accepted'
  }
}
