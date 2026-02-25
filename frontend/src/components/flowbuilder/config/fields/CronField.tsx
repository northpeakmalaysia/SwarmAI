/**
 * Cron Expression Field Component
 *
 * Helps build cron expressions with a visual interface.
 */

import React, { useState, useMemo } from 'react'
import { Info, AlertCircle, Clock, Calendar, HelpCircle } from 'lucide-react'
import { cn } from '../../../../lib/utils'
import type { BaseFieldProps } from './types'

interface CronFieldProps extends BaseFieldProps<string> {
  showPresets?: boolean
}

const presets = [
  { label: 'Every minute', value: '* * * * *' },
  { label: 'Every 5 minutes', value: '*/5 * * * *' },
  { label: 'Every 15 minutes', value: '*/15 * * * *' },
  { label: 'Every hour', value: '0 * * * *' },
  { label: 'Every 6 hours', value: '0 */6 * * *' },
  { label: 'Daily at midnight', value: '0 0 * * *' },
  { label: 'Daily at 9 AM', value: '0 9 * * *' },
  { label: 'Daily at 6 PM', value: '0 18 * * *' },
  { label: 'Weekly (Sunday midnight)', value: '0 0 * * 0' },
  { label: 'Weekly (Monday 9 AM)', value: '0 9 * * 1' },
  { label: 'Monthly (1st at midnight)', value: '0 0 1 * *' },
  { label: 'Weekdays at 9 AM', value: '0 9 * * 1-5' },
]

function describeCron(cron: string): string {
  if (!cron) return ''

  const parts = cron.split(' ')
  if (parts.length !== 5) return 'Invalid cron expression'

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts

  try {
    let description = 'Runs '

    // Minute
    if (minute === '*') {
      description += 'every minute'
    } else if (minute.startsWith('*/')) {
      description += `every ${minute.slice(2)} minutes`
    } else {
      description += `at minute ${minute}`
    }

    // Hour
    if (hour !== '*') {
      if (hour.startsWith('*/')) {
        description += `, every ${hour.slice(2)} hours`
      } else {
        const h = parseInt(hour)
        const period = h >= 12 ? 'PM' : 'AM'
        const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
        description += `, at ${h12}:${minute.padStart(2, '0')} ${period}`
      }
    }

    // Day of week
    if (dayOfWeek !== '*') {
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
      if (dayOfWeek === '1-5') {
        description += ', on weekdays'
      } else if (dayOfWeek === '0,6') {
        description += ', on weekends'
      } else {
        description += `, on ${days[parseInt(dayOfWeek)] || dayOfWeek}`
      }
    }

    // Day of month
    if (dayOfMonth !== '*') {
      description += `, on day ${dayOfMonth} of the month`
    }

    // Month
    if (month !== '*') {
      const months = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
      description += `, in ${months[parseInt(month)] || month}`
    }

    return description
  } catch {
    return 'Invalid cron expression'
  }
}

export const CronField: React.FC<CronFieldProps> = ({
  name,
  label,
  value,
  onChange,
  helpText,
  error,
  disabled,
  required,
  className,
  showPresets = true,
}) => {
  const [showHelp, setShowHelp] = useState(false)

  const description = useMemo(() => describeCron(value || ''), [value])
  const isValid = value && value.split(' ').length === 5

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-center justify-between">
        <label htmlFor={name} className="block text-xs font-medium text-slate-300">
          {label}
          {required && <span className="text-red-400 ml-1">*</span>}
        </label>
        <button
          type="button"
          onClick={() => setShowHelp(!showHelp)}
          className="p-1 text-slate-400 hover:text-white transition-colors rounded"
        >
          <HelpCircle className="w-3.5 h-3.5" />
        </button>
      </div>

      {showHelp && (
        <div className="p-3 bg-slate-800/50 border border-slate-700 rounded-lg text-xs text-slate-400 space-y-2">
          <p className="font-medium text-slate-300">Cron Format:</p>
          <code className="block bg-slate-900 px-2 py-1 rounded font-mono">
            minute hour day-of-month month day-of-week
          </code>
          <div className="grid grid-cols-5 gap-1 text-[10px]">
            <div>0-59</div>
            <div>0-23</div>
            <div>1-31</div>
            <div>1-12</div>
            <div>0-6 (Sun-Sat)</div>
          </div>
          <p className="text-[10px]">
            Use <code className="text-indigo-400">*</code> for any,{' '}
            <code className="text-indigo-400">*/n</code> for every n,{' '}
            <code className="text-indigo-400">n-m</code> for range
          </p>
        </div>
      )}

      <div className="relative">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
          <Clock className="w-4 h-4" />
        </div>
        <input
          id={name}
          type="text"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder="* * * * *"
          disabled={disabled}
          className={cn(
            'w-full pl-10 pr-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg',
            'font-mono text-sm text-slate-100',
            'placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30',
            'transition-colors',
            disabled && 'opacity-50 cursor-not-allowed',
            error && 'border-red-500',
            !isValid && value && 'border-amber-500/50'
          )}
        />
      </div>

      {/* Description */}
      {value && (
        <div
          className={cn(
            'px-3 py-2 rounded-lg text-xs',
            isValid ? 'bg-green-500/10 text-green-400' : 'bg-amber-500/10 text-amber-400'
          )}
        >
          <Calendar className="w-3 h-3 inline-block mr-1" />
          {description}
        </div>
      )}

      {/* Presets */}
      {showPresets && (
        <div className="space-y-1">
          <p className="text-[10px] text-slate-500 font-medium">Quick presets:</p>
          <div className="flex flex-wrap gap-1">
            {presets.slice(0, 6).map((preset) => (
              <button
                key={preset.value}
                type="button"
                onClick={() => onChange(preset.value)}
                disabled={disabled}
                className={cn(
                  'px-2 py-1 text-[10px] rounded border transition-colors',
                  value === preset.value
                    ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300'
                    : 'bg-slate-700/50 border-slate-600 text-slate-400 hover:text-white hover:bg-slate-600'
                )}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      )}

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
