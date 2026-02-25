/**
 * FTP Ingestion Modal
 *
 * Modal for creating and configuring FTP/SFTP sources for Knowledge Base sync
 */

import { useState, useEffect } from 'react'
import {
  Server,
  Lock,
  Key,
  FolderOpen,
  FileText,
  Clock,
  Eye,
  EyeOff,
  Loader2,
  CheckCircle2,
  XCircle,
  HelpCircle,
  ChevronRight,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { Modal } from '../common'
import { useFTPStore, FTPSource } from '../../stores/ftpStore'

interface FTPIngestionModalProps {
  open: boolean
  onClose: () => void
  libraryId: string
  source?: FTPSource | null // For editing existing source
}

const COMMON_CRON_EXPRESSIONS = [
  { label: 'Every hour', value: '0 * * * *' },
  { label: 'Every 2 hours', value: '0 */2 * * *' },
  { label: 'Every 6 hours', value: '0 */6 * * *' },
  { label: 'Every 12 hours', value: '0 */12 * * *' },
  { label: 'Daily at midnight', value: '0 0 * * *' },
  { label: 'Daily at 6 AM', value: '0 6 * * *' },
  { label: 'Weekdays at 9 AM', value: '0 9 * * 1-5' },
  { label: 'Weekly (Sunday)', value: '0 0 * * 0' },
  { label: 'Monthly (1st)', value: '0 0 1 * *' },
]

export function FTPIngestionModal({ open, onClose, libraryId, source }: FTPIngestionModalProps) {
  const { createSource, updateSource, testConnection, isLoading } = useFTPStore()
  const editSourceId = source?.id

  // Form state
  const [protocol, setProtocol] = useState<'ftp' | 'sftp'>('sftp')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [host, setHost] = useState('')
  const [port, setPort] = useState(protocol === 'sftp' ? 22 : 21)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [privateKey, setPrivateKey] = useState('')
  const [passphrase, setPassphrase] = useState('')
  const [remotePath, setRemotePath] = useState('/')
  const [recursive, setRecursive] = useState(true)
  const [filePatterns, setFilePatterns] = useState('*.pdf,*.docx,*.txt,*.md,*.json,*.csv')
  const [excludePatterns, setExcludePatterns] = useState('')

  // Schedule state
  const [scheduleEnabled, setScheduleEnabled] = useState(false)
  const [cronExpression, setCronExpression] = useState('0 */6 * * *')
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone)

  // UI state
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showPrivateKey, setShowPrivateKey] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [isTesting, setIsTesting] = useState(false)

  // Populate form when editing existing source
  useEffect(() => {
    if (source && open) {
      setProtocol(source.protocol)
      setName(source.name)
      setDescription(source.description || '')
      setHost(source.host)
      setPort(source.port)
      setUsername(source.username)
      setRemotePath(source.remotePath)
      setRecursive(source.recursive)
      setFilePatterns(source.filePatterns || '*.pdf,*.docx,*.txt,*.md,*.json,*.csv')
      setExcludePatterns(source.excludePatterns || '')
      setScheduleEnabled(source.scheduleEnabled)
      setCronExpression(source.cronExpression || '0 */6 * * *')
      setTimezone(source.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone)
      // Don't populate password/privateKey for security reasons
      setPassword('')
      setPrivateKey('')
      setPassphrase('')
    } else if (!open) {
      // Reset form when modal closes
      setProtocol('sftp')
      setName('')
      setDescription('')
      setHost('')
      setPort(22)
      setUsername('')
      setPassword('')
      setPrivateKey('')
      setPassphrase('')
      setRemotePath('/')
      setRecursive(true)
      setFilePatterns('*.pdf,*.docx,*.txt,*.md,*.json,*.csv')
      setExcludePatterns('')
      setScheduleEnabled(false)
      setCronExpression('0 */6 * * *')
      setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone)
      setTestResult(null)
    }
  }, [source, open])

  // Update port when protocol changes
  const handleProtocolChange = (newProtocol: 'ftp' | 'sftp') => {
    setProtocol(newProtocol)
    if (newProtocol === 'sftp' && port === 21) {
      setPort(22)
    } else if (newProtocol === 'ftp' && port === 22) {
      setPort(21)
    }
  }

  // Test connection handler
  const handleTestConnection = async () => {
    if (!host || !username) {
      toast.error('Host and username are required')
      return
    }

    setIsTesting(true)
    setTestResult(null)

    try {
      const result = await testConnection({
        protocol,
        host,
        port,
        username,
        password: password || undefined,
        privateKey: privateKey || undefined,
        passphrase: passphrase || undefined,
        remotePath,
      })

      setTestResult({
        success: result.success,
        message: result.success
          ? `Connected successfully! Found ${result.details?.filesFound ?? 0} files matching patterns.`
          : result.details?.error || result.message || 'Connection failed',
      })
    } catch {
      setTestResult({
        success: false,
        message: 'Connection test failed',
      })
    } finally {
      setIsTesting(false)
    }
  }

  // Submit handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!name.trim() || !host.trim() || !username.trim()) {
      toast.error('Name, host, and username are required')
      return
    }

    if (!password && !privateKey && protocol === 'sftp') {
      toast.error('Password or private key is required for SFTP')
      return
    }

    try {
      const sourceData = {
        libraryId,
        name: name.trim(),
        description: description.trim() || undefined,
        protocol,
        host: host.trim(),
        port,
        username: username.trim(),
        password: password || undefined,
        privateKey: privateKey || undefined,
        passphrase: passphrase || undefined,
        remotePath: remotePath.trim() || '/',
        recursive,
        filePatterns: filePatterns.split(',').map(p => p.trim()).filter(Boolean),
        excludePatterns: excludePatterns ? excludePatterns.split(',').map(p => p.trim()).filter(Boolean) : undefined,
        scheduleEnabled,
        cronExpression: scheduleEnabled ? cronExpression : undefined,
        timezone,
      }

      if (editSourceId) {
        await updateSource(editSourceId, sourceData)
        toast.success('FTP source updated successfully')
      } else {
        await createSource(sourceData)
        toast.success('FTP source created successfully')
      }

      onClose()
    } catch {
      toast.error(editSourceId ? 'Failed to update FTP source' : 'Failed to create FTP source')
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editSourceId ? 'Edit FTP Source' : 'Add FTP/SFTP Source'} size="lg">
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Protocol Tabs */}
        <div className="flex gap-2 p-1 bg-slate-800 rounded-lg">
          <button
            type="button"
            onClick={() => handleProtocolChange('sftp')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-md transition-colors ${
              protocol === 'sftp' ? 'bg-primary-500 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            <Lock className="w-4 h-4" />
            SFTP (Secure)
          </button>
          <button
            type="button"
            onClick={() => handleProtocolChange('ftp')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-md transition-colors ${
              protocol === 'ftp' ? 'bg-primary-500 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            <Server className="w-4 h-4" />
            FTP
          </button>
        </div>

        {/* Basic Info */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Company Documents Server"
              className="input w-full"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              className="input w-full"
            />
          </div>
        </div>

        {/* Connection Details */}
        <div className="space-y-4 p-4 bg-slate-800/50 rounded-lg border border-slate-700">
          <h3 className="text-sm font-medium text-white flex items-center gap-2">
            <Server className="w-4 h-4 text-primary-400" />
            Connection Details
          </h3>

          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-300 mb-1">Host *</label>
              <input
                type="text"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="ftp.example.com"
                className="input w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Port</label>
              <input
                type="number"
                value={port}
                onChange={(e) => setPort(Number(e.target.value))}
                className="input w-full"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Username *</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="username"
              className="input w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Password {protocol === 'sftp' && '(or use private key)'}
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="input w-full pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {protocol === 'sftp' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  <span className="flex items-center gap-2">
                    <Key className="w-4 h-4" />
                    Private Key (optional)
                  </span>
                </label>
                <div className="relative">
                  <textarea
                    value={privateKey}
                    onChange={(e) => setPrivateKey(e.target.value)}
                    placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;...&#10;-----END OPENSSH PRIVATE KEY-----"
                    className={`input w-full h-24 resize-none font-mono text-xs ${showPrivateKey ? '' : 'text-security-disc'}`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPrivateKey(!showPrivateKey)}
                    className="absolute right-3 top-3 text-gray-500 hover:text-white"
                  >
                    {showPrivateKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {privateKey && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Key Passphrase</label>
                  <input
                    type="password"
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                    placeholder="Enter passphrase if key is encrypted"
                    className="input w-full"
                  />
                </div>
              )}
            </>
          )}
        </div>

        {/* Remote Path & File Patterns */}
        <div className="space-y-4 p-4 bg-slate-800/50 rounded-lg border border-slate-700">
          <h3 className="text-sm font-medium text-white flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-primary-400" />
            File Selection
          </h3>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Remote Path</label>
            <input
              type="text"
              value={remotePath}
              onChange={(e) => setRemotePath(e.target.value)}
              placeholder="/"
              className="input w-full"
            />
            <p className="text-xs text-gray-500 mt-1">Starting directory on the remote server</p>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="recursive"
              checked={recursive}
              onChange={(e) => setRecursive(e.target.checked)}
              className="w-4 h-4 rounded border-gray-600 bg-slate-700 text-primary-500 focus:ring-primary-500"
            />
            <label htmlFor="recursive" className="text-sm text-gray-300">
              Include subdirectories (recursive sync)
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              <span className="flex items-center gap-2">
                <FileText className="w-4 h-4" />
                File Patterns (include)
              </span>
            </label>
            <input
              type="text"
              value={filePatterns}
              onChange={(e) => setFilePatterns(e.target.value)}
              placeholder="*.pdf,*.docx,*.txt"
              className="input w-full"
            />
            <p className="text-xs text-gray-500 mt-1">Comma-separated glob patterns</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Exclude Patterns (optional)</label>
            <input
              type="text"
              value={excludePatterns}
              onChange={(e) => setExcludePatterns(e.target.value)}
              placeholder="*.tmp,*.bak,temp/*"
              className="input w-full"
            />
          </div>
        </div>

        {/* Schedule */}
        <div className="space-y-4 p-4 bg-slate-800/50 rounded-lg border border-slate-700">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary-400" />
              Scheduled Sync
            </h3>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={scheduleEnabled}
                onChange={(e) => setScheduleEnabled(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-500"></div>
            </label>
          </div>

          {scheduleEnabled && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Schedule</label>
                <select
                  value={cronExpression}
                  onChange={(e) => setCronExpression(e.target.value)}
                  className="input w-full"
                >
                  {COMMON_CRON_EXPRESSIONS.map((expr) => (
                    <option key={expr.value} value={expr.value}>
                      {expr.label} ({expr.value})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Timezone</label>
                <input
                  type="text"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="input w-full"
                />
              </div>
            </>
          )}
        </div>

        {/* Test Connection Result */}
        {testResult && (
          <div className={`p-4 rounded-lg border flex items-start gap-3 ${
            testResult.success
              ? 'bg-green-500/10 border-green-500/30'
              : 'bg-red-500/10 border-red-500/30'
          }`}>
            {testResult.success ? (
              <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
            ) : (
              <XCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            )}
            <p className={`text-sm ${testResult.success ? 'text-green-400' : 'text-red-400'}`}>
              {testResult.message}
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-between items-center pt-4 border-t border-slate-700">
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={isTesting || !host || !username}
            className="btn-secondary flex items-center gap-2"
          >
            {isTesting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Server className="w-4 h-4" />
            )}
            Test Connection
          </button>

          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={isLoading} className="btn-primary">
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {editSourceId ? 'Update Source' : 'Create Source'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  )
}

export default FTPIngestionModal
