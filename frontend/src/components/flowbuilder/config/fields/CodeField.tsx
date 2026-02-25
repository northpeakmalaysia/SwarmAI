/**
 * Code Field Component
 *
 * Simple code editor with syntax highlighting indication.
 * For a full-featured editor, integrate Monaco or CodeMirror.
 */

import React, { useState } from 'react'
import { Info, AlertCircle, Copy, Check, Maximize2, Minimize2 } from 'lucide-react'
import { cn } from '../../../../lib/utils'
import type { BaseFieldProps } from './types'

interface CodeFieldProps extends BaseFieldProps<string> {
  language?: 'javascript' | 'json' | 'python' | 'sql' | 'html' | 'css' | 'markdown'
  rows?: number
  showLineNumbers?: boolean
}

export const CodeField: React.FC<CodeFieldProps> = ({
  name,
  label,
  value,
  onChange,
  placeholder,
  helpText,
  error,
  disabled,
  required,
  className,
  language = 'javascript',
  rows = 6,
  showLineNumbers = true,
}) => {
  const [copied, setCopied] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)

  const lines = (value || '').split('\n')
  const lineCount = lines.length

  const copyToClipboard = async () => {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Handle Tab key for indentation
    if (e.key === 'Tab') {
      e.preventDefault()
      const target = e.target as HTMLTextAreaElement
      const start = target.selectionStart
      const end = target.selectionEnd
      const newValue = value?.substring(0, start) + '  ' + value?.substring(end)
      onChange(newValue || '')
      // Restore cursor position
      setTimeout(() => {
        target.selectionStart = target.selectionEnd = start + 2
      }, 0)
    }
  }

  const languageColors: Record<string, string> = {
    javascript: 'text-yellow-400',
    json: 'text-green-400',
    python: 'text-blue-400',
    sql: 'text-purple-400',
    html: 'text-orange-400',
    css: 'text-pink-400',
    markdown: 'text-cyan-400',
  }

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-center justify-between">
        <label htmlFor={name} className="block text-xs font-medium text-slate-300">
          {label}
          {required && <span className="text-red-400 ml-1">*</span>}
        </label>

        <div className="flex items-center gap-1">
          <span className={cn('text-[10px] font-medium uppercase', languageColors[language])}>
            {language}
          </span>
          <button
            type="button"
            onClick={copyToClipboard}
            className="p-1 text-slate-400 hover:text-white transition-colors rounded"
            title="Copy code"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 text-slate-400 hover:text-white transition-colors rounded"
            title={isExpanded ? 'Collapse' : 'Expand'}
          >
            {isExpanded ? (
              <Minimize2 className="w-3.5 h-3.5" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      <div
        className={cn(
          'relative rounded-lg border border-slate-600 overflow-hidden',
          'bg-slate-900',
          error && 'border-red-500/50'
        )}
      >
        <div className="flex">
          {showLineNumbers && (
            <div className="flex-shrink-0 bg-slate-800/50 text-slate-500 text-xs font-mono select-none border-r border-slate-700">
              {Array.from({ length: Math.max(lineCount, isExpanded ? rows * 2 : rows) }).map((_, i) => (
                <div key={i} className="px-2 py-0 leading-5 text-right" style={{ minWidth: '2.5rem' }}>
                  {i + 1}
                </div>
              ))}
            </div>
          )}

          <textarea
            id={name}
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            rows={isExpanded ? rows * 2 : rows}
            spellCheck={false}
            className={cn(
              'flex-1 px-3 py-0 bg-transparent text-slate-100',
              'font-mono text-xs leading-5',
              'placeholder-slate-600 focus:outline-none',
              'resize-none',
              disabled && 'opacity-50 cursor-not-allowed'
            )}
            style={{ tabSize: 2 }}
          />
        </div>
      </div>

      <div className="flex items-start justify-between text-xs">
        {error ? (
          <p className="flex items-start text-red-400">
            <AlertCircle className="w-3 h-3 mr-1 mt-0.5 flex-shrink-0" />
            {error}
          </p>
        ) : helpText ? (
          <p className="flex items-start text-slate-500">
            <Info className="w-3 h-3 mr-1 mt-0.5 flex-shrink-0" />
            {helpText}
          </p>
        ) : (
          <span />
        )}
        <span className="text-slate-500">
          {lineCount} line{lineCount !== 1 ? 's' : ''}
        </span>
      </div>
    </div>
  )
}
