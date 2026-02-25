/**
 * Node Configuration Panel (Refactored)
 *
 * Uses FieldGroupRenderer for dynamic field rendering based on node schemas.
 * Supports all field types including model, provider, and MCP tool selectors.
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import type { Node } from '@xyflow/react'
import {
  X,
  Settings,
  Trash2,
  Copy,
  Play,
  ChevronDown,
  ChevronRight,
  Info,
  Zap,
  Send,
  Sparkles,
  Network,
  Plug,
  GitBranch,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { Button, Input } from '../common'
import { nodeDefinitions } from './nodes'
import { FieldGroupRenderer } from './config/fields'
import { getNodeSchema, getNodeFields } from './config/nodeSchemas'
import type { FieldDefinition } from './config/fields/types'
import TriggerConfigForms from './config/TriggerConfigForms'

interface NodeConfigPanelProps {
  node: Node | null
  onUpdate: (nodeId: string, data: Record<string, unknown>) => void
  onDelete?: (nodeId: string) => void
  onDuplicate?: (node: Node) => void
  onTest?: (node: Node) => Promise<void>
  onClose?: () => void
  variables?: string[] // Available variables for autocomplete
}

/**
 * Legacy field config format for backwards compatibility
 */
interface LegacyFieldConfig {
  name: string
  label: string
  type: string
  placeholder?: string
  helperText?: string
  options?: { value: string; label: string }[]
  required?: boolean
  defaultValue?: unknown
}

/**
 * Legacy node field configs (for nodes not yet migrated to schemas)
 */
const legacyFieldConfigs: Record<string, LegacyFieldConfig[]> = {
  // Email trigger
  email_received: [
    { name: 'fromFilter', label: 'From Filter', type: 'text', placeholder: '@example.com' },
    { name: 'subjectFilter', label: 'Subject Contains', type: 'text' },
  ],
  // Send email action
  send_email: [
    { name: 'to', label: 'To', type: 'variable', placeholder: '{{input.email}}' },
    { name: 'subject', label: 'Subject', type: 'variable' },
    { name: 'body', label: 'Body', type: 'textarea' },
    { name: 'html', label: 'HTML Body (optional)', type: 'textarea' },
  ],
  // AI with RAG
  ai_with_rag: [
    { name: 'provider', label: 'Provider', type: 'provider', helperText: 'Select a provider or auto-select' },
    { name: 'model', label: 'Model', type: 'model', placeholder: 'Select or enter model...', required: true },
    { name: 'systemPrompt', label: 'System Prompt', type: 'textarea' },
    { name: 'userMessage', label: 'User Message', type: 'variable' },
    { name: 'ragLimit', label: 'RAG Results Limit', type: 'number', defaultValue: 5 },
    { name: 'ragScoreThreshold', label: 'Min Relevance Score', type: 'number', defaultValue: 0.5 },
    { name: 'collectionId', label: 'Collection ID (optional)', type: 'text' },
  ],
  // Sentiment analysis
  sentiment_analysis: [
    { name: 'provider', label: 'Provider', type: 'provider' },
    { name: 'model', label: 'Model', type: 'model', required: true },
    { name: 'text', label: 'Text to Analyze', type: 'variable', placeholder: '{{input.message}}' },
  ],
  // Entity extraction
  extract_entities: [
    { name: 'provider', label: 'Provider', type: 'provider' },
    { name: 'model', label: 'Model', type: 'model', required: true },
    { name: 'text', label: 'Text to Analyze', type: 'variable' },
    { name: 'entityTypes', label: 'Entity Types (comma-separated)', type: 'text', placeholder: 'person, organization, location' },
  ],
  // CLI tools
  ai_claude_cli: [
    { name: 'prompt', label: 'Prompt', type: 'variable', placeholder: '{{input.message}}', required: true },
    { name: 'workingDirectory', label: 'Working Directory', type: 'text', placeholder: '/path/to/project' },
    { name: 'timeout', label: 'Timeout (seconds)', type: 'number', defaultValue: 300 },
  ],
  ai_gemini_cli: [
    { name: 'prompt', label: 'Prompt', type: 'variable', placeholder: '{{input.message}}', required: true },
    { name: 'workingDirectory', label: 'Working Directory', type: 'text', placeholder: '/path/to/project' },
    { name: 'timeout', label: 'Timeout (seconds)', type: 'number', defaultValue: 300 },
  ],
  // Agent handoff
  agent_handoff: [
    { name: 'fromAgentId', label: 'From Agent ID', type: 'variable' },
    { name: 'toAgentId', label: 'To Agent ID (optional)', type: 'text' },
    { name: 'reason', label: 'Handoff Reason', type: 'textarea' },
    { name: 'requiredSkills', label: 'Required Skills', type: 'text' },
  ],
  // Swarm task
  swarm_task: [
    { name: 'title', label: 'Task Title', type: 'variable' },
    { name: 'description', label: 'Task Description', type: 'textarea' },
    { name: 'type', label: 'Task Type', type: 'select', options: [
      { value: 'query', label: 'Query' },
      { value: 'action', label: 'Action' },
      { value: 'analysis', label: 'Analysis' },
      { value: 'collaboration', label: 'Collaboration' },
    ]},
    { name: 'agentCount', label: 'Agent Count', type: 'number', defaultValue: 2 },
    { name: 'skills', label: 'Required Skills', type: 'text' },
  ],
  // Transform node
  transform: [
    { name: 'input', label: 'Input Data', type: 'variable', placeholder: '{{node.previous.output}}', required: true },
    { name: 'expression', label: 'Transform Expression', type: 'textarea', placeholder: 'data.items.map(i => i.name).join(", ")', required: true, helperText: 'JavaScript expression' },
    { name: 'outputVariable', label: 'Output Variable', type: 'text', defaultValue: 'transformed' },
  ],
  // Wait for event
  wait_for_event: [
    { name: 'eventType', label: 'Event Type', type: 'select', options: [
      { value: 'message', label: 'Message Received' },
      { value: 'webhook', label: 'Webhook Trigger' },
      { value: 'schedule', label: 'Scheduled Time' },
      { value: 'agent_response', label: 'Agent Response' },
      { value: 'custom', label: 'Custom Event' },
    ], required: true },
    { name: 'eventFilter', label: 'Event Filter (optional)', type: 'json', placeholder: '{"conversationId": "{{var.conversationId}}"}' },
    { name: 'timeout', label: 'Timeout (ms)', type: 'number', defaultValue: 300000, helperText: '0 = no timeout' },
    { name: 'timeoutBranch', label: 'Timeout Branch', type: 'text', defaultValue: 'timeout' },
  ],
  // File operations
  file_read: [
    { name: 'filePath', label: 'File Path', type: 'variable', placeholder: '/path/to/file.txt', required: true },
    { name: 'encoding', label: 'Encoding', type: 'select', options: [
      { value: 'utf-8', label: 'UTF-8' },
      { value: 'ascii', label: 'ASCII' },
      { value: 'base64', label: 'Base64' },
    ], defaultValue: 'utf-8' },
    { name: 'parseJson', label: 'Parse as JSON', type: 'boolean', defaultValue: false },
  ],
  file_write: [
    { name: 'filePath', label: 'File Path', type: 'variable', placeholder: '/path/to/file.txt', required: true },
    { name: 'content', label: 'Content', type: 'variable', placeholder: '{{node.previous.output}}', required: true },
    { name: 'mode', label: 'Write Mode', type: 'select', options: [
      { value: 'write', label: 'Overwrite' },
      { value: 'append', label: 'Append' },
    ], defaultValue: 'write' },
  ],
  // Web operations
  web_fetch: [
    { name: 'url', label: 'URL', type: 'variable', placeholder: 'https://example.com/page', required: true },
    { name: 'method', label: 'Method', type: 'select', options: [
      { value: 'GET', label: 'GET' },
      { value: 'POST', label: 'POST' },
    ], defaultValue: 'GET' },
    { name: 'timeout', label: 'Timeout (ms)', type: 'number', defaultValue: 30000 },
    { name: 'extractText', label: 'Extract Text Content', type: 'boolean', defaultValue: true },
  ],
  web_scrape: [
    { name: 'url', label: 'URL', type: 'variable', placeholder: 'https://example.com/page', required: true },
    { name: 'selectors', label: 'CSS Selectors (JSON)', type: 'json', placeholder: '{"title": "h1", "content": ".main-content"}', required: true },
    { name: 'timeout', label: 'Timeout (ms)', type: 'number', defaultValue: 30000 },
    { name: 'javascript', label: 'Execute JavaScript', type: 'boolean', defaultValue: false },
  ],
  // MCP resource
  mcp_resource: [
    { name: 'mcpToolConfig', label: 'MCP Resource Configuration', type: 'mcp_tool', required: true },
    { name: 'resourceUri', label: 'Resource URI', type: 'variable', placeholder: '{{var.resourceUri}}', required: true },
    { name: 'outputVariable', label: 'Output Variable', type: 'text', defaultValue: 'resourceContent' },
  ],
}

/**
 * Convert legacy field config to FieldDefinition
 */
function convertLegacyField(field: LegacyFieldConfig): FieldDefinition {
  return {
    name: field.name,
    label: field.label,
    type: field.type as any,
    placeholder: field.placeholder,
    helpText: field.helperText,
    defaultValue: field.defaultValue,
    options: field.options?.map((o) => ({ value: o.value, label: o.label })),
    validation: field.required ? { required: true } : undefined,
  }
}

/**
 * Get category icon component
 */
function getCategoryIcon(category?: string) {
  switch (category) {
    case 'trigger':
      return <Zap className="w-4 h-4 text-amber-400" />
    case 'action':
      return <Send className="w-4 h-4 text-blue-400" />
    case 'ai':
      return <Sparkles className="w-4 h-4 text-violet-400" />
    case 'swarm':
      return <Network className="w-4 h-4 text-cyan-400" />
    case 'mcp':
      return <Plug className="w-4 h-4 text-pink-400" />
    case 'logic':
      return <GitBranch className="w-4 h-4 text-emerald-400" />
    default:
      return <Settings className="w-4 h-4 text-gray-400" />
  }
}

const NodeConfigPanel: React.FC<NodeConfigPanelProps> = ({
  node,
  onUpdate,
  onDelete,
  onDuplicate,
  onTest,
  onClose,
  variables = [],
}) => {
  const [config, setConfig] = useState<Record<string, unknown>>({})
  const [label, setLabel] = useState('')
  const [isTesting, setIsTesting] = useState(false)
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    basic: true,
    advanced: false,
  })

  // Get node definition
  const nodeData = node?.data as Record<string, unknown> | undefined
  const subtype = (nodeData?.subtype as string) || ''
  const nodeType = node?.type || ''

  const nodeDef = useMemo(() => {
    return nodeDefinitions.find((n) => n.type === nodeType && n.subtype === subtype)
  }, [nodeType, subtype])

  // Get schema-based fields or fall back to legacy
  const { basicFields, advancedFields, useLegacy } = useMemo(() => {
    const schema = getNodeSchema(subtype)
    if (schema) {
      return {
        basicFields: schema.fields || [],
        advancedFields: schema.advanced || [],
        useLegacy: false,
      }
    }

    // Fall back to legacy config
    const legacyFields = legacyFieldConfigs[subtype]
    if (legacyFields) {
      return {
        basicFields: legacyFields.map(convertLegacyField),
        advancedFields: [],
        useLegacy: true,
      }
    }

    return { basicFields: [], advancedFields: [], useLegacy: false }
  }, [subtype])

  // Use trigger config forms for trigger nodes
  const isTriggerNode = nodeDef?.category === 'trigger'

  // Initialize config from node data
  useEffect(() => {
    if (node && nodeData) {
      setLabel((nodeData.label as string) || nodeDef?.label || '')
      setConfig((nodeData.config as Record<string, unknown>) || {})
    }
  }, [node, nodeData, nodeDef])

  const handleFieldChange = useCallback((fieldName: string, value: unknown) => {
    setConfig((prev) => ({
      ...prev,
      [fieldName]: value,
    }))
  }, [])

  // Auto-sync changes to parent with debounce
  const syncTimerRef = useRef<NodeJS.Timeout | null>(null)
  const initialRenderRef = useRef(true)

  useEffect(() => {
    // Skip initial render to avoid overwriting with stale data
    if (initialRenderRef.current) {
      initialRenderRef.current = false
      return
    }

    if (!node) return

    // Clear existing timer
    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current)
    }

    // Debounce auto-sync (300ms)
    syncTimerRef.current = setTimeout(() => {
      onUpdate(node.id, {
        ...nodeData,
        label,
        config,
      })
    }, 300)

    return () => {
      if (syncTimerRef.current) {
        clearTimeout(syncTimerRef.current)
      }
    }
  }, [node, nodeData, label, config, onUpdate])

  const handleTest = useCallback(async () => {
    if (!node || !onTest) return

    setIsTesting(true)
    try {
      await onTest(node)
    } finally {
      setIsTesting(false)
    }
  }, [node, onTest])

  if (!node) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-500 p-4">
        <Settings className="w-12 h-12 mb-4 opacity-50" />
        <p className="text-center">Select a node to configure</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {getCategoryIcon(nodeDef?.category)}
          <h3 className="text-lg font-semibold text-white">Node Config</h3>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-white transition-colors"
            aria-label="Close panel"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto space-y-4 -mx-4 px-4">
        {/* Node Label */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-gray-300">Node Label</label>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={nodeDef?.label || 'Node label'}
            size="sm"
          />
        </div>

        {/* Node Info */}
        <div className="flex items-start gap-2 p-3 bg-slate-800/50 rounded-lg border border-slate-700">
          <Info className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-gray-400">
            <span className="text-gray-300 font-medium">{nodeDef?.label}</span>
            <p className="mt-0.5">{nodeDef?.description}</p>
          </div>
        </div>

        {/* Basic Configuration Fields */}
        {(basicFields.length > 0 || isTriggerNode) && (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() =>
                setExpandedSections((p) => ({ ...p, basic: !p.basic }))
              }
              className="w-full flex items-center gap-2 text-sm font-medium text-gray-300"
            >
              {expandedSections.basic ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
              Configuration
            </button>

            {expandedSections.basic && (
              <div className="space-y-4 pl-2 border-l-2 border-slate-700">
                {isTriggerNode ? (
                  <TriggerConfigForms
                    nodeType={subtype}
                    config={config as Record<string, unknown>}
                    onConfigChange={(newConfig) =>
                      setConfig(newConfig as Record<string, unknown>)
                    }
                  />
                ) : (
                  <FieldGroupRenderer
                    fields={basicFields}
                    values={config}
                    onChange={handleFieldChange}
                    className="space-y-4"
                  />
                )}
              </div>
            )}
          </div>
        )}

        {/* Advanced Configuration Fields */}
        {advancedFields.length > 0 && (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() =>
                setExpandedSections((p) => ({ ...p, advanced: !p.advanced }))
              }
              className="w-full flex items-center gap-2 text-sm font-medium text-gray-300"
            >
              {expandedSections.advanced ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
              Advanced Options
            </button>

            {expandedSections.advanced && (
              <div className="space-y-4 pl-2 border-l-2 border-slate-700">
                <FieldGroupRenderer
                  fields={advancedFields}
                  values={config}
                  onChange={handleFieldChange}
                  className="space-y-4"
                />
              </div>
            )}
          </div>
        )}

        {/* Node ID (read-only) */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-gray-500">Node ID</label>
          <div className="text-xs text-gray-600 font-mono bg-slate-900 rounded px-2 py-1.5 truncate">
            {node.id}
          </div>
        </div>
      </div>

      {/* Actions - changes auto-sync, so no Save button needed */}
      <div className="flex-shrink-0 pt-4 border-t border-slate-700 mt-4 space-y-2">
        <div className="flex gap-2">
          {onTest && (
            <Button
              onClick={handleTest}
              variant="outline"
              size="sm"
              loading={isTesting}
              icon={<Play className="w-4 h-4" />}
              fullWidth
            >
              Test
            </Button>
          )}
          {onDuplicate && (
            <Button
              onClick={() => onDuplicate(node)}
              variant="ghost"
              size="sm"
              icon={<Copy className="w-4 h-4" />}
              fullWidth={!onTest}
            >
              Duplicate
            </Button>
          )}
          {onDelete && (
            <Button
              onClick={() => onDelete(node.id)}
              variant="danger"
              size="sm"
              icon={<Trash2 className="w-4 h-4" />}
            >
              Delete
            </Button>
          )}
        </div>
        <p className="text-xs text-gray-500 text-center">
          Changes auto-save
        </p>
      </div>
    </div>
  )
}

export default NodeConfigPanel
