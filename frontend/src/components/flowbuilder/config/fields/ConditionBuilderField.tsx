/**
 * Condition Builder Field Component
 *
 * Visual builder for complex conditional expressions with AND/OR groups.
 */

import React, { useState, useCallback } from 'react'
import {
  Info,
  AlertCircle,
  Plus,
  Trash2,
  ChevronDown,
  GitBranch,
  Variable,
  Layers,
} from 'lucide-react'
import { cn } from '../../../../lib/utils'
import type { BaseFieldProps } from './types'

type Operator =
  | 'equals'
  | 'notEquals'
  | 'contains'
  | 'notContains'
  | 'startsWith'
  | 'endsWith'
  | 'greaterThan'
  | 'lessThan'
  | 'greaterOrEqual'
  | 'lessOrEqual'
  | 'isEmpty'
  | 'isNotEmpty'
  | 'matches'
  | 'in'
  | 'notIn'

interface Condition {
  id: string
  field: string
  operator: Operator
  value: string
}

interface ConditionGroup {
  id: string
  logic: 'AND' | 'OR'
  conditions: Condition[]
}

interface ConditionExpression {
  logic: 'AND' | 'OR'
  groups: ConditionGroup[]
}

interface ConditionBuilderFieldProps extends BaseFieldProps<ConditionExpression> {
  availableFields?: { value: string; label: string; type?: string }[]
  maxGroups?: number
  maxConditionsPerGroup?: number
}

const operators: { value: Operator; label: string; requiresValue: boolean }[] = [
  { value: 'equals', label: 'equals', requiresValue: true },
  { value: 'notEquals', label: 'not equals', requiresValue: true },
  { value: 'contains', label: 'contains', requiresValue: true },
  { value: 'notContains', label: 'not contains', requiresValue: true },
  { value: 'startsWith', label: 'starts with', requiresValue: true },
  { value: 'endsWith', label: 'ends with', requiresValue: true },
  { value: 'greaterThan', label: '>', requiresValue: true },
  { value: 'lessThan', label: '<', requiresValue: true },
  { value: 'greaterOrEqual', label: '>=', requiresValue: true },
  { value: 'lessOrEqual', label: '<=', requiresValue: true },
  { value: 'isEmpty', label: 'is empty', requiresValue: false },
  { value: 'isNotEmpty', label: 'is not empty', requiresValue: false },
  { value: 'matches', label: 'matches regex', requiresValue: true },
  { value: 'in', label: 'in list', requiresValue: true },
  { value: 'notIn', label: 'not in list', requiresValue: true },
]

const defaultValue: ConditionExpression = {
  logic: 'AND',
  groups: [
    {
      id: 'group-1',
      logic: 'AND',
      conditions: [{ id: 'cond-1', field: '', operator: 'equals', value: '' }],
    },
  ],
}

export const ConditionBuilderField: React.FC<ConditionBuilderFieldProps> = ({
  name,
  label,
  value = defaultValue,
  onChange,
  helpText,
  error,
  disabled,
  required,
  className,
  availableFields = [],
  maxGroups = 5,
  maxConditionsPerGroup = 10,
}) => {
  const [expandedGroups, setExpandedGroups] = useState<string[]>(
    value.groups.map((g) => g.id)
  )

  const generateId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

  const updateExpression = useCallback(
    (updates: Partial<ConditionExpression>) => {
      onChange({ ...value, ...updates })
    },
    [value, onChange]
  )

  const toggleGroupLogic = () => {
    updateExpression({ logic: value.logic === 'AND' ? 'OR' : 'AND' })
  }

  const addGroup = () => {
    if (value.groups.length >= maxGroups) return
    const newGroup: ConditionGroup = {
      id: `group-${generateId()}`,
      logic: 'AND',
      conditions: [{ id: `cond-${generateId()}`, field: '', operator: 'equals', value: '' }],
    }
    updateExpression({ groups: [...value.groups, newGroup] })
    setExpandedGroups((prev) => [...prev, newGroup.id])
  }

  const removeGroup = (groupId: string) => {
    if (value.groups.length <= 1) return
    updateExpression({ groups: value.groups.filter((g) => g.id !== groupId) })
  }

  const updateGroup = (groupId: string, updates: Partial<ConditionGroup>) => {
    updateExpression({
      groups: value.groups.map((g) => (g.id === groupId ? { ...g, ...updates } : g)),
    })
  }

  const addCondition = (groupId: string) => {
    const group = value.groups.find((g) => g.id === groupId)
    if (!group || group.conditions.length >= maxConditionsPerGroup) return

    const newCondition: Condition = {
      id: `cond-${generateId()}`,
      field: '',
      operator: 'equals',
      value: '',
    }

    updateGroup(groupId, { conditions: [...group.conditions, newCondition] })
  }

  const removeCondition = (groupId: string, conditionId: string) => {
    const group = value.groups.find((g) => g.id === groupId)
    if (!group || group.conditions.length <= 1) return

    updateGroup(groupId, {
      conditions: group.conditions.filter((c) => c.id !== conditionId),
    })
  }

  const updateCondition = (
    groupId: string,
    conditionId: string,
    updates: Partial<Condition>
  ) => {
    const group = value.groups.find((g) => g.id === groupId)
    if (!group) return

    updateGroup(groupId, {
      conditions: group.conditions.map((c) =>
        c.id === conditionId ? { ...c, ...updates } : c
      ),
    })
  }

  const toggleExpand = (groupId: string) => {
    setExpandedGroups((prev) =>
      prev.includes(groupId) ? prev.filter((id) => id !== groupId) : [...prev, groupId]
    )
  }

  const operatorRequiresValue = (op: Operator) => {
    return operators.find((o) => o.value === op)?.requiresValue ?? true
  }

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center justify-between">
        <label className="block text-xs font-medium text-slate-300">
          {label}
          {required && <span className="text-red-400 ml-1">*</span>}
        </label>

        {/* Top-level logic toggle */}
        <button
          type="button"
          onClick={toggleGroupLogic}
          disabled={disabled || value.groups.length < 2}
          className={cn(
            'flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors',
            value.logic === 'AND'
              ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
              : 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
            (disabled || value.groups.length < 2) && 'opacity-50 cursor-not-allowed'
          )}
        >
          <Layers className="w-3 h-3" />
          Groups: {value.logic}
        </button>
      </div>

      {/* Condition Groups */}
      <div className="space-y-3">
        {value.groups.map((group, groupIndex) => {
          const isExpanded = expandedGroups.includes(group.id)

          return (
            <div
              key={group.id}
              className={cn(
                'border rounded-lg overflow-hidden transition-colors',
                isExpanded
                  ? 'border-slate-600 bg-slate-800/30'
                  : 'border-slate-700 bg-slate-800/20'
              )}
            >
              {/* Group Header */}
              <div
                className={cn(
                  'flex items-center gap-2 px-3 py-2 cursor-pointer',
                  'hover:bg-slate-700/30 transition-colors'
                )}
                onClick={() => toggleExpand(group.id)}
              >
                <ChevronDown
                  className={cn(
                    'w-4 h-4 text-slate-400 transition-transform',
                    !isExpanded && '-rotate-90'
                  )}
                />
                <GitBranch className="w-4 h-4 text-indigo-400" />
                <span className="text-sm font-medium text-slate-200">
                  Group {groupIndex + 1}
                </span>
                <span className="text-xs text-slate-500">
                  ({group.conditions.length} condition
                  {group.conditions.length !== 1 ? 's' : ''})
                </span>

                <div className="flex-1" />

                {/* Group logic toggle */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    updateGroup(group.id, { logic: group.logic === 'AND' ? 'OR' : 'AND' })
                  }}
                  disabled={disabled || group.conditions.length < 2}
                  className={cn(
                    'px-2 py-0.5 rounded text-[10px] font-medium transition-colors',
                    group.logic === 'AND'
                      ? 'bg-blue-500/20 text-blue-400'
                      : 'bg-amber-500/20 text-amber-400',
                    (disabled || group.conditions.length < 2) && 'opacity-50'
                  )}
                >
                  {group.logic}
                </button>

                {/* Remove group */}
                {value.groups.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      removeGroup(group.id)
                    }}
                    disabled={disabled}
                    className={cn(
                      'p-1 text-slate-500 hover:text-red-400 rounded transition-colors',
                      disabled && 'opacity-50'
                    )}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Group Conditions */}
              {isExpanded && (
                <div className="px-3 pb-3 space-y-2">
                  {group.conditions.map((condition, condIndex) => (
                    <div key={condition.id} className="flex items-center gap-2">
                      {/* Condition index */}
                      <span className="w-4 text-[10px] text-slate-500 text-center">
                        {condIndex + 1}
                      </span>

                      {/* Field selector */}
                      <div className="relative flex-1">
                        <Variable className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500" />
                        {availableFields.length > 0 ? (
                          <select
                            value={condition.field}
                            onChange={(e) =>
                              updateCondition(group.id, condition.id, { field: e.target.value })
                            }
                            disabled={disabled}
                            className={cn(
                              'w-full pl-7 pr-2 py-1.5 bg-slate-700/50 border border-slate-600 rounded',
                              'text-sm text-slate-100 appearance-none',
                              'focus:outline-none focus:border-indigo-500',
                              disabled && 'opacity-50 cursor-not-allowed'
                            )}
                          >
                            <option value="">Select field...</option>
                            {availableFields.map((f) => (
                              <option key={f.value} value={f.value}>
                                {f.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="text"
                            value={condition.field}
                            onChange={(e) =>
                              updateCondition(group.id, condition.id, { field: e.target.value })
                            }
                            placeholder="Field or {{variable}}"
                            disabled={disabled}
                            className={cn(
                              'w-full pl-7 pr-2 py-1.5 bg-slate-700/50 border border-slate-600 rounded',
                              'text-sm text-slate-100 placeholder-slate-500',
                              'focus:outline-none focus:border-indigo-500',
                              disabled && 'opacity-50 cursor-not-allowed'
                            )}
                          />
                        )}
                      </div>

                      {/* Operator */}
                      <select
                        value={condition.operator}
                        onChange={(e) =>
                          updateCondition(group.id, condition.id, {
                            operator: e.target.value as Operator,
                          })
                        }
                        disabled={disabled}
                        className={cn(
                          'w-28 px-2 py-1.5 bg-slate-700/50 border border-slate-600 rounded',
                          'text-sm text-slate-100 appearance-none',
                          'focus:outline-none focus:border-indigo-500',
                          disabled && 'opacity-50 cursor-not-allowed'
                        )}
                      >
                        {operators.map((op) => (
                          <option key={op.value} value={op.value}>
                            {op.label}
                          </option>
                        ))}
                      </select>

                      {/* Value */}
                      {operatorRequiresValue(condition.operator) && (
                        <input
                          type="text"
                          value={condition.value}
                          onChange={(e) =>
                            updateCondition(group.id, condition.id, { value: e.target.value })
                          }
                          placeholder="Value..."
                          disabled={disabled}
                          className={cn(
                            'flex-1 px-2 py-1.5 bg-slate-700/50 border border-slate-600 rounded',
                            'text-sm text-slate-100 placeholder-slate-500',
                            'focus:outline-none focus:border-indigo-500',
                            disabled && 'opacity-50 cursor-not-allowed'
                          )}
                        />
                      )}

                      {/* Remove condition */}
                      {group.conditions.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeCondition(group.id, condition.id)}
                          disabled={disabled}
                          className={cn(
                            'p-1 text-slate-500 hover:text-red-400 rounded transition-colors',
                            disabled && 'opacity-50'
                          )}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}

                  {/* Add condition button */}
                  {group.conditions.length < maxConditionsPerGroup && (
                    <button
                      type="button"
                      onClick={() => addCondition(group.id)}
                      disabled={disabled}
                      className={cn(
                        'flex items-center gap-1 px-2 py-1 text-xs text-slate-400',
                        'hover:text-indigo-400 transition-colors',
                        disabled && 'opacity-50 cursor-not-allowed'
                      )}
                    >
                      <Plus className="w-3 h-3" />
                      Add condition
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Add group button */}
      {value.groups.length < maxGroups && (
        <button
          type="button"
          onClick={addGroup}
          disabled={disabled}
          className={cn(
            'w-full flex items-center justify-center gap-2 px-3 py-2',
            'border border-dashed border-slate-600 rounded-lg',
            'text-sm text-slate-400 hover:text-indigo-400 hover:border-indigo-500/50 hover:bg-indigo-500/5',
            'transition-colors',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
        >
          <Plus className="w-4 h-4" />
          Add Group
        </button>
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
