/**
 * Data Source Modal
 *
 * Unified modal for creating/editing database and API data sources.
 * Uses MCP tools for data access and integrates with RAG knowledge base.
 */

import React, { useState, useEffect, useCallback } from 'react'
import {
  X,
  Database,
  Globe,
  Server,
  Save,
  TestTube,
  Clock,
  AlertCircle,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Info,
  Loader2,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { Button, Input } from '../common'
import MCPToolConfig, { MCPToolConfigValue } from '../flowbuilder/MCPToolConfig'
import { useDataSourceStore, DataSource } from '../../stores/dataSourceStore'

export interface DataSourceModalProps {
  isOpen: boolean
  onClose: () => void
  libraryId: string
  source?: DataSource | null // For editing existing source
  onSuccess?: (source: DataSource) => void
}

type SourceType = 'database' | 'api'
type ChangeMode = 'full' | 'timestamp' | 'id' | 'hash'

interface FormData {
  name: string
  description: string
  sourceType: SourceType
  mcpToolConfig: MCPToolConfigValue
  extractionQuery: string
  dataPath: string
  contentFields: string[]
  titleField: string
  idField: string
  metadataFields: string[]
  changeMode: ChangeMode
  changeField: string
  scheduleEnabled: boolean
  cronExpression: string
  timezone: string
}

const defaultFormData: FormData = {
  name: '',
  description: '',
  sourceType: 'database',
  mcpToolConfig: { serverId: '', toolName: '' },
  extractionQuery: '',
  dataPath: '$',
  contentFields: [],
  titleField: '',
  idField: '',
  metadataFields: [],
  changeMode: 'full',
  changeField: '',
  scheduleEnabled: false,
  cronExpression: '0 0 * * *',
  timezone: 'UTC',
}

const changeModeOptions = [
  { value: 'full', label: 'Full Sync', description: 'Replace all data each sync' },
  { value: 'timestamp', label: 'Timestamp-based', description: 'Detect changes using timestamp field' },
  { value: 'id', label: 'ID-based', description: 'Track IDs to detect new/deleted items' },
  { value: 'hash', label: 'Content Hash', description: 'Compare content hash for changes' },
]

const cronPresets = [
  { value: '0 * * * *', label: 'Every hour' },
  { value: '0 */6 * * *', label: 'Every 6 hours' },
  { value: '0 0 * * *', label: 'Daily at midnight' },
  { value: '0 0 * * 0', label: 'Weekly (Sundays)' },
  { value: '0 0 1 * *', label: 'Monthly (1st day)' },
]

const DataSourceModal: React.FC<DataSourceModalProps> = ({
  isOpen,
  onClose,
  libraryId,
  source,
  onSuccess,
}) => {
  const { createSource, updateSource, isLoading, error, clearError } = useDataSourceStore()

  const [formData, setFormData] = useState<FormData>(defaultFormData)
  const [contentFieldsInput, setContentFieldsInput] = useState('')
  const [metadataFieldsInput, setMetadataFieldsInput] = useState('')
  const [expandedSections, setExpandedSections] = useState({
    basic: true,
    mcp: true,
    extraction: false,
    fieldMapping: false,
    changeDetection: false,
    schedule: false,
  })
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [isTesting, setIsTesting] = useState(false)

  // Initialize form with existing source data
  useEffect(() => {
    if (source) {
      setFormData({
        name: source.name,
        description: source.description || '',
        sourceType: source.sourceType,
        mcpToolConfig: source.mcpToolConfig,
        extractionQuery: source.extractionQuery || '',
        dataPath: source.dataPath,
        contentFields: source.contentFields,
        titleField: source.titleField || '',
        idField: source.idField || '',
        metadataFields: source.metadataFields || [],
        changeMode: source.changeMode,
        changeField: source.changeField || '',
        scheduleEnabled: source.scheduleEnabled,
        cronExpression: source.cronExpression || '0 0 * * *',
        timezone: source.timezone,
      })
      setContentFieldsInput(source.contentFields.join(', '))
      setMetadataFieldsInput((source.metadataFields || []).join(', '))
    } else {
      setFormData(defaultFormData)
      setContentFieldsInput('')
      setMetadataFieldsInput('')
    }
    setTestResult(null)
    clearError()
  }, [source, isOpen, clearError])

  const handleFieldChange = useCallback((field: keyof FormData, value: unknown) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }, [])

  const handleContentFieldsChange = useCallback((value: string) => {
    setContentFieldsInput(value)
    const fields = value.split(',').map((f) => f.trim()).filter(Boolean)
    setFormData((prev) => ({ ...prev, contentFields: fields }))
  }, [])

  const handleMetadataFieldsChange = useCallback((value: string) => {
    setMetadataFieldsInput(value)
    const fields = value.split(',').map((f) => f.trim()).filter(Boolean)
    setFormData((prev) => ({ ...prev, metadataFields: fields }))
  }, [])

  const toggleSection = useCallback((section: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }))
  }, [])

  const handleTest = async () => {
    if (!formData.mcpToolConfig.serverId || !formData.mcpToolConfig.toolName) {
      setTestResult({ success: false, message: 'Please select an MCP server and tool first' })
      return
    }

    setIsTesting(true)
    setTestResult(null)

    try {
      // Test by calling the MCP tool with extraction query
      const response = await fetch(`/api/ai/mcp/tools/${encodeURIComponent(formData.mcpToolConfig.toolName)}/call`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          ...formData.mcpToolConfig.defaultArgs,
          query: formData.extractionQuery,
          limit: 5, // Test with limited results
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to test connection')
      }

      const result = await response.json()
      const rowCount = result.data?.rows?.length || result.data?.length || 0
      setTestResult({
        success: true,
        message: `Connection successful! Retrieved ${rowCount} sample items.`,
      })
    } catch (err) {
      setTestResult({
        success: false,
        message: (err as Error).message,
      })
    } finally {
      setIsTesting(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.name.trim()) {
      setTestResult({ success: false, message: 'Name is required' })
      return
    }

    if (!formData.mcpToolConfig.serverId || !formData.mcpToolConfig.toolName) {
      setTestResult({ success: false, message: 'MCP server and tool are required' })
      return
    }

    if (formData.contentFields.length === 0) {
      setTestResult({ success: false, message: 'At least one content field is required' })
      return
    }

    try {
      const data = {
        ...formData,
        libraryId,
      }

      let result: DataSource
      if (source) {
        result = await updateSource(source.id, data)
      } else {
        result = await createSource(data)
      }

      onSuccess?.(result)
      onClose()
    } catch (err) {
      // Error is handled by store
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-slate-900 rounded-2xl border border-slate-700 shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <div className="flex items-center gap-3">
            {formData.sourceType === 'database' ? (
              <Database className="w-6 h-6 text-emerald-400" />
            ) : (
              <Globe className="w-6 h-6 text-blue-400" />
            )}
            <h2 className="text-xl font-semibold text-white">
              {source ? 'Edit Data Source' : 'Create Data Source'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="overflow-y-auto max-h-[calc(90vh-140px)]">
          <div className="p-6 space-y-6">
            {/* Error/Test Result */}
            {(error || testResult) && (
              <div
                className={cn(
                  'flex items-start gap-2 p-3 rounded-lg border text-sm',
                  testResult?.success
                    ? 'bg-emerald-900/30 border-emerald-700 text-emerald-300'
                    : 'bg-red-900/30 border-red-700 text-red-300'
                )}
              >
                {testResult?.success ? (
                  <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                )}
                <span>{testResult?.message || error}</span>
              </div>
            )}

            {/* Basic Settings */}
            <Section
              title="Basic Settings"
              icon={<Info className="w-4 h-4" />}
              expanded={expandedSections.basic}
              onToggle={() => toggleSection('basic')}
            >
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-300">
                    Source Type
                  </label>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => handleFieldChange('sourceType', 'database')}
                      className={cn(
                        'flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border transition-colors',
                        formData.sourceType === 'database'
                          ? 'bg-emerald-900/30 border-emerald-500 text-emerald-400'
                          : 'bg-slate-800/50 border-slate-600 text-gray-400 hover:border-slate-500'
                      )}
                    >
                      <Database className="w-5 h-5" />
                      <span>Database</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleFieldChange('sourceType', 'api')}
                      className={cn(
                        'flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border transition-colors',
                        formData.sourceType === 'api'
                          ? 'bg-blue-900/30 border-blue-500 text-blue-400'
                          : 'bg-slate-800/50 border-slate-600 text-gray-400 hover:border-slate-500'
                      )}
                    >
                      <Globe className="w-5 h-5" />
                      <span>API</span>
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-300">
                    Name <span className="text-red-400">*</span>
                  </label>
                  <Input
                    value={formData.name}
                    onChange={(e) => handleFieldChange('name', e.target.value)}
                    placeholder="e.g., Product Catalog, Customer Support API"
                    size="sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-300">
                    Description
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => handleFieldChange('description', e.target.value)}
                    placeholder="Describe what this data source contains..."
                    className={cn(
                      'w-full rounded-lg border bg-slate-800/50 text-white placeholder-gray-500',
                      'border-slate-600 focus:border-sky-500 focus:ring-1 focus:ring-sky-500/50',
                      'p-2.5 text-sm min-h-[60px] resize-y'
                    )}
                  />
                </div>
              </div>
            </Section>

            {/* MCP Configuration */}
            <Section
              title="MCP Connection"
              icon={<Server className="w-4 h-4" />}
              expanded={expandedSections.mcp}
              onToggle={() => toggleSection('mcp')}
            >
              <div className="space-y-4">
                <MCPToolConfig
                  value={formData.mcpToolConfig}
                  onChange={(config) => handleFieldChange('mcpToolConfig', config)}
                  showVariableHints={false}
                />
              </div>
            </Section>

            {/* Data Extraction */}
            <Section
              title="Data Extraction"
              icon={<Database className="w-4 h-4" />}
              expanded={expandedSections.extraction}
              onToggle={() => toggleSection('extraction')}
            >
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-300">
                    Extraction Query
                  </label>
                  <textarea
                    value={formData.extractionQuery}
                    onChange={(e) => handleFieldChange('extractionQuery', e.target.value)}
                    placeholder={
                      formData.sourceType === 'database'
                        ? 'SELECT * FROM products WHERE active = 1'
                        : 'https://api.example.com/products'
                    }
                    className={cn(
                      'w-full rounded-lg border bg-slate-900 text-white placeholder-gray-500 font-mono',
                      'border-slate-600 focus:border-sky-500 focus:ring-1 focus:ring-sky-500/50',
                      'p-3 text-xs min-h-[80px] resize-y'
                    )}
                  />
                  <p className="text-xs text-gray-500">
                    {formData.sourceType === 'database'
                      ? 'SQL query to extract data (SELECT only)'
                      : 'API endpoint URL to fetch data'}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-300">
                    Data Path (JSONPath)
                  </label>
                  <Input
                    value={formData.dataPath}
                    onChange={(e) => handleFieldChange('dataPath', e.target.value)}
                    placeholder="$.data.items or $ for root"
                    size="sm"
                  />
                  <p className="text-xs text-gray-500">
                    JSONPath to extract array of items from response
                  </p>
                </div>

                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleTest}
                    disabled={isTesting || !formData.mcpToolConfig.toolName}
                  >
                    {isTesting ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <TestTube className="w-4 h-4 mr-2" />
                    )}
                    Test Connection
                  </Button>
                </div>
              </div>
            </Section>

            {/* Field Mapping */}
            <Section
              title="Field Mapping"
              icon={<Info className="w-4 h-4" />}
              expanded={expandedSections.fieldMapping}
              onToggle={() => toggleSection('fieldMapping')}
            >
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-300">
                    Content Fields <span className="text-red-400">*</span>
                  </label>
                  <Input
                    value={contentFieldsInput}
                    onChange={(e) => handleContentFieldsChange(e.target.value)}
                    placeholder="title, description, body (comma-separated)"
                    size="sm"
                  />
                  <p className="text-xs text-gray-500">
                    Fields to use as document content (will be concatenated)
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-gray-300">
                      Title Field
                    </label>
                    <Input
                      value={formData.titleField}
                      onChange={(e) => handleFieldChange('titleField', e.target.value)}
                      placeholder="title"
                      size="sm"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-gray-300">
                      ID Field
                    </label>
                    <Input
                      value={formData.idField}
                      onChange={(e) => handleFieldChange('idField', e.target.value)}
                      placeholder="id"
                      size="sm"
                    />
                    <p className="text-xs text-gray-500">
                      Unique identifier for change detection
                    </p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-300">
                    Metadata Fields
                  </label>
                  <Input
                    value={metadataFieldsInput}
                    onChange={(e) => handleMetadataFieldsChange(e.target.value)}
                    placeholder="category, author, created_at (comma-separated)"
                    size="sm"
                  />
                  <p className="text-xs text-gray-500">
                    Additional fields to store as document metadata
                  </p>
                </div>
              </div>
            </Section>

            {/* Change Detection */}
            <Section
              title="Change Detection"
              icon={<Clock className="w-4 h-4" />}
              expanded={expandedSections.changeDetection}
              onToggle={() => toggleSection('changeDetection')}
            >
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-300">
                    Change Detection Mode
                  </label>
                  <div className="space-y-2">
                    {changeModeOptions.map((option) => (
                      <label
                        key={option.value}
                        className={cn(
                          'flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
                          formData.changeMode === option.value
                            ? 'bg-sky-900/20 border-sky-500'
                            : 'bg-slate-800/30 border-slate-700 hover:border-slate-600'
                        )}
                      >
                        <input
                          type="radio"
                          name="changeMode"
                          value={option.value}
                          checked={formData.changeMode === option.value}
                          onChange={() => handleFieldChange('changeMode', option.value as ChangeMode)}
                          className="mt-1 text-sky-500"
                        />
                        <div>
                          <div className="text-sm font-medium text-white">{option.label}</div>
                          <div className="text-xs text-gray-500">{option.description}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                {(formData.changeMode === 'timestamp') && (
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-gray-300">
                      Timestamp Field
                    </label>
                    <Input
                      value={formData.changeField}
                      onChange={(e) => handleFieldChange('changeField', e.target.value)}
                      placeholder="updated_at"
                      size="sm"
                    />
                  </div>
                )}
              </div>
            </Section>

            {/* Schedule */}
            <Section
              title="Sync Schedule"
              icon={<Clock className="w-4 h-4" />}
              expanded={expandedSections.schedule}
              onToggle={() => toggleSection('schedule')}
            >
              <div className="space-y-4">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.scheduleEnabled}
                    onChange={(e) => handleFieldChange('scheduleEnabled', e.target.checked)}
                    className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-sky-500 focus:ring-sky-500/50"
                  />
                  <span className="text-sm text-gray-300">Enable automatic sync</span>
                </label>

                {formData.scheduleEnabled && (
                  <>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-gray-300">
                        Schedule
                      </label>
                      <select
                        value={formData.cronExpression}
                        onChange={(e) => handleFieldChange('cronExpression', e.target.value)}
                        className={cn(
                          'w-full rounded-lg border bg-slate-800/50 text-white',
                          'border-slate-600 focus:border-sky-500 focus:ring-1 focus:ring-sky-500/50',
                          'p-2.5 text-sm'
                        )}
                      >
                        {cronPresets.map((preset) => (
                          <option key={preset.value} value={preset.value}>
                            {preset.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-gray-300">
                        Timezone
                      </label>
                      <Input
                        value={formData.timezone}
                        onChange={(e) => handleFieldChange('timezone', e.target.value)}
                        placeholder="UTC"
                        size="sm"
                      />
                    </div>
                  </>
                )}
              </div>
            </Section>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-700">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              {source ? 'Update Source' : 'Create Source'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Collapsible Section Component
interface SectionProps {
  title: string
  icon: React.ReactNode
  expanded: boolean
  onToggle: () => void
  children: React.ReactNode
}

const Section: React.FC<SectionProps> = ({ title, icon, expanded, onToggle, children }) => (
  <div className="border border-slate-700 rounded-lg overflow-hidden">
    <button
      type="button"
      onClick={onToggle}
      className="w-full flex items-center gap-3 px-4 py-3 bg-slate-800/50 hover:bg-slate-800 transition-colors"
    >
      {expanded ? (
        <ChevronDown className="w-4 h-4 text-gray-400" />
      ) : (
        <ChevronRight className="w-4 h-4 text-gray-400" />
      )}
      <span className="text-gray-400">{icon}</span>
      <span className="text-sm font-medium text-white">{title}</span>
    </button>
    {expanded && <div className="p-4 space-y-4 bg-slate-800/20">{children}</div>}
  </div>
)

export default DataSourceModal
