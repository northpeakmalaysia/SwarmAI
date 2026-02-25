/**
 * JSON Field Component
 *
 * Provides a JSON editor with syntax validation and formatting.
 */

import React, { useState, useEffect } from 'react'
import { Info, AlertCircle, Code, Check, X, Wand2 } from 'lucide-react'
import { cn } from '../../../../lib/utils'
import type { BaseFieldProps } from './types'

interface JsonFieldProps extends BaseFieldProps<object | string> {
  rows?: number
  allowInvalid?: boolean
  formatOnBlur?: boolean
}

export const JsonField: React.FC<JsonFieldProps> = ({
  name,
  label,
  value,
  onChange,
  placeholder = '{}',
  helpText,
  error: externalError,
  disabled,
  required,
  className,
  rows = 4,
  allowInvalid = true,
  formatOnBlur = true,
}) => {
  const [text, setText] = useState('')
  const [parseError, setParseError] = useState<string | null>(null)
  const [isValid, setIsValid] = useState(true)

  // Initialize text from value
  useEffect(() => {
    if (typeof value === 'string') {
      setText(value)
      try {
        JSON.parse(value)
        setIsValid(true)
        setParseError(null)
      } catch {
        setIsValid(false)
        setParseError('Invalid JSON')
      }
    } else if (value && typeof value === 'object') {
      setText(JSON.stringify(value, null, 2))
      setIsValid(true)
      setParseError(null)
    } else {
      setText('')
      setIsValid(true)
      setParseError(null)
    }
  }, [value])

  const handleChange = (newText: string) => {
    setText(newText)

    if (!newText.trim()) {
      setIsValid(true)
      setParseError(null)
      onChange({})
      return
    }

    try {
      const parsed = JSON.parse(newText)
      setIsValid(true)
      setParseError(null)
      onChange(parsed)
    } catch (e) {
      setIsValid(false)
      setParseError((e as Error).message.replace('JSON.parse: ', ''))
      if (allowInvalid) {
        onChange(newText)
      }
    }
  }

  const handleBlur = () => {
    if (formatOnBlur && isValid && text.trim()) {
      try {
        const parsed = JSON.parse(text)
        setText(JSON.stringify(parsed, null, 2))
      } catch {
        // Ignore
      }
    }
  }

  const formatJson = () => {
    if (!text.trim()) return

    try {
      const parsed = JSON.parse(text)
      const formatted = JSON.stringify(parsed, null, 2)
      setText(formatted)
      onChange(parsed)
      setIsValid(true)
      setParseError(null)
    } catch (e) {
      // If invalid, show error
      setParseError((e as Error).message.replace('JSON.parse: ', ''))
    }
  }

  const minifyJson = () => {
    if (!text.trim()) return

    try {
      const parsed = JSON.parse(text)
      const minified = JSON.stringify(parsed)
      setText(minified)
      onChange(parsed)
    } catch {
      // Ignore
    }
  }

  const error = externalError || parseError

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-center justify-between">
        <label htmlFor={name} className="block text-xs font-medium text-slate-300">
          {label}
          {required && <span className="text-red-400 ml-1">*</span>}
        </label>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={formatJson}
            className="p-1 text-slate-400 hover:text-indigo-400 transition-colors rounded"
            title="Format JSON"
          >
            <Wand2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={minifyJson}
            className="p-1 text-slate-400 hover:text-indigo-400 transition-colors rounded"
            title="Minify JSON"
          >
            <Code className="w-3.5 h-3.5" />
          </button>
          <div
            className={cn(
              'px-1.5 py-0.5 rounded text-xs flex items-center gap-1',
              isValid ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
            )}
          >
            {isValid ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
            <span>{isValid ? 'Valid' : 'Invalid'}</span>
          </div>
        </div>
      </div>

      <div className="relative">
        <textarea
          id={name}
          value={text}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={handleBlur}
          placeholder={placeholder}
          disabled={disabled}
          rows={rows}
          className={cn(
            'w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg',
            'font-mono text-xs text-slate-100',
            'placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30',
            'resize-y transition-colors',
            disabled && 'opacity-50 cursor-not-allowed',
            !isValid && 'border-red-500/50'
          )}
          spellCheck={false}
        />
      </div>

      {(helpText || error) && (
        <div className="text-xs">
          {error ? (
            <p className="flex items-start text-red-400">
              <AlertCircle className="w-3 h-3 mr-1 mt-0.5 flex-shrink-0" />
              {error}
            </p>
          ) : (
            <p className="flex items-start text-slate-500">
              <Info className="w-3 h-3 mr-1 mt-0.5 flex-shrink-0" />
              {helpText}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
