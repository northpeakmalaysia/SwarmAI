/**
 * Database Ingestion Modal
 *
 * Modal for creating/editing database connections for RAG ingestion.
 * Supports SQL Server with connection testing, table browsing, and query preview.
 */

import React, { useState, useEffect, useCallback } from 'react'
import {
  X,
  Database,
  TestTube,
  Save,
  Clock,
  AlertCircle,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Info,
  Loader2,
  Table,
  Eye,
  RefreshCw,
  Lock,
  Unlock,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { Button, Input } from '../common'
import {
  useDatabaseSourceStore,
  type DatabaseSource,
  type DatabaseTable,
  type DatabaseColumn,
} from '../../stores/databaseSourceStore'
import toast from 'react-hot-toast'

export interface DatabaseIngestionModalProps {
  isOpen: boolean
  onClose: () => void
  libraryId: string
  source?: DatabaseSource | null
  onSuccess?: (source: DatabaseSource) => void
}

interface FormData {
  name: string
  dbType: 'sqlserver' | 'postgres' | 'mysql'
  host: string
  port: number
  databaseName: string
  username: string
  password: string
  encrypt: boolean
  trustServerCertificate: boolean
  extractionQuery: string
  contentFields: string[]
  titleField: string
  idField: string
  metadataFields: string[]
  scheduleEnabled: boolean
  cronExpression: string
}

const defaultFormData: FormData = {
  name: '',
  dbType: 'sqlserver',
  host: '',
  port: 1433,
  databaseName: '',
  username: '',
  password: '',
  encrypt: true,
  trustServerCertificate: false,
  extractionQuery: '',
  contentFields: [],
  titleField: '',
  idField: '',
  metadataFields: [],
  scheduleEnabled: false,
  cronExpression: '0 0 * * *',
}

const cronPresets = [
  { value: '0 * * * *', label: 'Every hour' },
  { value: '0 */6 * * *', label: 'Every 6 hours' },
  { value: '0 0 * * *', label: 'Daily at midnight' },
  { value: '0 0 * * 0', label: 'Weekly (Sundays)' },
  { value: '0 0 1 * *', label: 'Monthly (1st day)' },
]

const DatabaseIngestionModal: React.FC<DatabaseIngestionModalProps> = ({
  isOpen,
  onClose,
  libraryId,
  source,
  onSuccess,
}) => {
  const {
    createSource,
    updateSource,
    testConnection,
    getTables,
    getColumns,
    previewQuery,
    isLoading,
    isTesting,
    error,
    clearError,
  } = useDatabaseSourceStore()

  const [formData, setFormData] = useState<FormData>(defaultFormData)
  const [contentFieldsInput, setContentFieldsInput] = useState('')
  const [metadataFieldsInput, setMetadataFieldsInput] = useState('')
  const [expandedSections, setExpandedSections] = useState({
    connection: true,
    extraction: false,
    fieldMapping: false,
    schedule: false,
  })
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [tables, setTables] = useState<DatabaseTable[]>([])
  const [columns, setColumns] = useState<DatabaseColumn[]>([])
  const [selectedTable, setSelectedTable] = useState<string>('')
  const [previewData, setPreviewData] = useState<{ rows: unknown[]; columns: unknown[] } | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [isLoadingTables, setIsLoadingTables] = useState(false)
  const [isLoadingColumns, setIsLoadingColumns] = useState(false)
  const [isLoadingPreview, setIsLoadingPreview] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  // Initialize form with existing source data
  useEffect(() => {
    if (source) {
      setFormData({
        name: source.name,
        dbType: source.dbType || 'sqlserver',
        host: source.host,
        port: source.port || 1433,
        databaseName: source.databaseName,
        username: source.username,
        password: '', // Never pre-fill password
        encrypt: source.encrypt !== false,
        trustServerCertificate: source.trustServerCertificate === true,
        extractionQuery: source.extractionQuery || '',
        contentFields: source.contentFields || [],
        titleField: source.titleField || '',
        idField: source.idField || '',
        metadataFields: source.metadataFields || [],
        scheduleEnabled: source.scheduleEnabled,
        cronExpression: source.cronExpression || '0 0 * * *',
      })
      setContentFieldsInput((source.contentFields || []).join(', '))
      setMetadataFieldsInput((source.metadataFields || []).join(', '))
    } else {
      setFormData(defaultFormData)
      setContentFieldsInput('')
      setMetadataFieldsInput('')
    }
    setTestResult(null)
    setTables([])
    setColumns([])
    setSelectedTable('')
    setPreviewData(null)
    setShowPreview(false)
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

  const handleTestConnection = async () => {
    if (!formData.host || !formData.databaseName || !formData.username) {
      setTestResult({ success: false, message: 'Host, database name, and username are required' })
      return
    }

    try {
      const result = await testConnection({
        host: formData.host,
        port: formData.port,
        databaseName: formData.databaseName,
        username: formData.username,
        password: formData.password,
        dbType: formData.dbType,
        encrypt: formData.encrypt,
        trustServerCertificate: formData.trustServerCertificate,
      })
      setTestResult(result)

      if (result.success) {
        toast.success('Connection successful!')
      }
    } catch (err) {
      setTestResult({ success: false, message: (err as Error).message })
    }
  }

  const handleLoadTables = async () => {
    if (!source?.id) {
      toast.error('Please save the source first to browse tables')
      return
    }

    setIsLoadingTables(true)
    try {
      const tableList = await getTables(source.id)
      setTables(tableList)
      toast.success(`Found ${tableList.length} tables`)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setIsLoadingTables(false)
    }
  }

  const handleTableSelect = async (tableName: string) => {
    setSelectedTable(tableName)

    if (!source?.id) return

    setIsLoadingColumns(true)
    try {
      const columnList = await getColumns(source.id, tableName)
      setColumns(columnList)

      // Generate SELECT query for the table
      const query = `SELECT * FROM [dbo].[${tableName}]`
      handleFieldChange('extractionQuery', query)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setIsLoadingColumns(false)
    }
  }

  const handlePreview = async () => {
    if (!source?.id || !formData.extractionQuery) {
      toast.error('Please save the source and enter a query first')
      return
    }

    setIsLoadingPreview(true)
    try {
      const result = await previewQuery(source.id, formData.extractionQuery, 10)
      setPreviewData(result)
      setShowPreview(true)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setIsLoadingPreview(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.name.trim()) {
      toast.error('Name is required')
      return
    }

    if (!formData.host || !formData.databaseName || !formData.username) {
      toast.error('Host, database name, and username are required')
      return
    }

    try {
      const data = {
        ...formData,
        libraryId,
        password: formData.password || undefined, // Don't send empty password
      }

      let result: DatabaseSource
      if (source) {
        result = await updateSource(source.id, data)
        toast.success('Database source updated')
      } else {
        result = await createSource(data)
        toast.success('Database source created')
      }

      onSuccess?.(result)
      onClose()
    } catch (err) {
      toast.error((err as Error).message)
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
            <Database className="w-6 h-6 text-emerald-400" />
            <h2 className="text-xl font-semibold text-white">
              {source ? 'Edit Database Source' : 'Connect Database'}
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

            {/* Connection Settings */}
            <Section
              title="Connection Settings"
              icon={<Database className="w-4 h-4" />}
              expanded={expandedSections.connection}
              onToggle={() => toggleSection('connection')}
            >
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-300">
                    Source Name <span className="text-red-400">*</span>
                  </label>
                  <Input
                    value={formData.name}
                    onChange={(e) => handleFieldChange('name', e.target.value)}
                    placeholder="e.g., ITRACK Production DB"
                    size="sm"
                  />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-2 space-y-1.5">
                    <label className="text-sm font-medium text-gray-300">
                      Host <span className="text-red-400">*</span>
                    </label>
                    <Input
                      value={formData.host}
                      onChange={(e) => handleFieldChange('host', e.target.value)}
                      placeholder="e.g., 192.168.1.100"
                      size="sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-gray-300">Port</label>
                    <Input
                      type="number"
                      value={formData.port}
                      onChange={(e) => handleFieldChange('port', parseInt(e.target.value) || 1433)}
                      placeholder="1433"
                      size="sm"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-300">
                    Database Name <span className="text-red-400">*</span>
                  </label>
                  <Input
                    value={formData.databaseName}
                    onChange={(e) => handleFieldChange('databaseName', e.target.value)}
                    placeholder="e.g., ITRACK_SNS"
                    size="sm"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-gray-300">
                      Username <span className="text-red-400">*</span>
                    </label>
                    <Input
                      value={formData.username}
                      onChange={(e) => handleFieldChange('username', e.target.value)}
                      placeholder="sa"
                      size="sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-gray-300">Password</label>
                    <div className="relative">
                      <Input
                        type={showPassword ? 'text' : 'password'}
                        value={formData.password}
                        onChange={(e) => handleFieldChange('password', e.target.value)}
                        placeholder={source ? '(unchanged)' : ''}
                        size="sm"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                      >
                        {showPassword ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex gap-6">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.encrypt}
                      onChange={(e) => handleFieldChange('encrypt', e.target.checked)}
                      className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-sky-500"
                    />
                    <span className="text-sm text-gray-300">Encrypt Connection</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.trustServerCertificate}
                      onChange={(e) => handleFieldChange('trustServerCertificate', e.target.checked)}
                      className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-sky-500"
                    />
                    <span className="text-sm text-gray-300">Trust Server Certificate</span>
                  </label>
                </div>

                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleTestConnection}
                    disabled={isTesting}
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

            {/* Data Extraction */}
            <Section
              title="Data Extraction"
              icon={<Table className="w-4 h-4" />}
              expanded={expandedSections.extraction}
              onToggle={() => toggleSection('extraction')}
            >
              <div className="space-y-4">
                {source && (
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleLoadTables}
                      disabled={isLoadingTables}
                    >
                      {isLoadingTables ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <RefreshCw className="w-4 h-4 mr-2" />
                      )}
                      Load Tables
                    </Button>
                    {tables.length > 0 && (
                      <select
                        value={selectedTable}
                        onChange={(e) => handleTableSelect(e.target.value)}
                        className="flex-1 rounded-lg border bg-slate-800/50 text-white border-slate-600 p-2 text-sm"
                      >
                        <option value="">Select a table...</option>
                        {tables.map((t) => (
                          <option key={`${t.schema}.${t.name}`} value={t.name}>
                            {t.schema}.{t.name} ({t.rowCount} rows)
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}

                {columns.length > 0 && (
                  <div className="p-3 bg-slate-800/50 rounded-lg">
                    <p className="text-xs text-gray-400 mb-2">Available columns:</p>
                    <div className="flex flex-wrap gap-1">
                      {columns.map((col) => (
                        <span
                          key={col.name}
                          className={cn(
                            'px-2 py-0.5 text-xs rounded',
                            col.isPrimaryKey
                              ? 'bg-yellow-500/20 text-yellow-400'
                              : 'bg-slate-700 text-gray-300'
                          )}
                        >
                          {col.name}
                          <span className="text-gray-500 ml-1">({col.type})</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-300">
                    Extraction Query (SQL)
                  </label>
                  <textarea
                    value={formData.extractionQuery}
                    onChange={(e) => handleFieldChange('extractionQuery', e.target.value)}
                    placeholder="SELECT * FROM [dbo].[Products] WHERE Active = 1"
                    className={cn(
                      'w-full rounded-lg border bg-slate-900 text-white placeholder-gray-500 font-mono',
                      'border-slate-600 focus:border-sky-500 focus:ring-1 focus:ring-sky-500/50',
                      'p-3 text-xs min-h-[100px] resize-y'
                    )}
                  />
                  <p className="text-xs text-gray-500">
                    Only SELECT queries are allowed. Results will be ingested as documents.
                  </p>
                </div>

                {source && formData.extractionQuery && (
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handlePreview}
                      disabled={isLoadingPreview}
                    >
                      {isLoadingPreview ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Eye className="w-4 h-4 mr-2" />
                      )}
                      Preview Results
                    </Button>
                  </div>
                )}

                {showPreview && previewData && (
                  <div className="p-3 bg-slate-800/50 rounded-lg max-h-60 overflow-auto">
                    <p className="text-xs text-gray-400 mb-2">
                      Preview ({previewData.rows.length} rows):
                    </p>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-slate-600">
                          {(previewData.columns as { name: string }[]).slice(0, 5).map((col) => (
                            <th key={col.name} className="text-left p-1 text-gray-400">
                              {col.name}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(previewData.rows as Record<string, unknown>[]).slice(0, 5).map((row, i) => (
                          <tr key={i} className="border-b border-slate-700">
                            {(previewData.columns as { name: string }[]).slice(0, 5).map((col) => (
                              <td key={col.name} className="p-1 text-gray-300 truncate max-w-[150px]">
                                {String(row[col.name] ?? '')}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
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
                    Fields to combine as document content (will be concatenated)
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-gray-300">Title Field</label>
                    <Input
                      value={formData.titleField}
                      onChange={(e) => handleFieldChange('titleField', e.target.value)}
                      placeholder="name"
                      size="sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-gray-300">ID Field</label>
                    <Input
                      value={formData.idField}
                      onChange={(e) => handleFieldChange('idField', e.target.value)}
                      placeholder="id"
                      size="sm"
                    />
                    <p className="text-xs text-gray-500">For change detection</p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-300">Metadata Fields</label>
                  <Input
                    value={metadataFieldsInput}
                    onChange={(e) => handleMetadataFieldsChange(e.target.value)}
                    placeholder="category, created_at, author (comma-separated)"
                    size="sm"
                  />
                  <p className="text-xs text-gray-500">
                    Additional fields to store as document metadata
                  </p>
                </div>
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
                    className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-sky-500"
                  />
                  <span className="text-sm text-gray-300">Enable automatic sync</span>
                </label>

                {formData.scheduleEnabled && (
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-gray-300">Schedule</label>
                    <select
                      value={formData.cronExpression}
                      onChange={(e) => handleFieldChange('cronExpression', e.target.value)}
                      className="w-full rounded-lg border bg-slate-800/50 text-white border-slate-600 p-2.5 text-sm"
                    >
                      {cronPresets.map((preset) => (
                        <option key={preset.value} value={preset.value}>
                          {preset.label}
                        </option>
                      ))}
                    </select>
                  </div>
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

export default DatabaseIngestionModal
