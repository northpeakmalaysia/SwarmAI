/**
 * Field Renderer Component
 *
 * Dynamically renders the appropriate field component based on field definition.
 * Handles conditional visibility and validation.
 */

import React, { useMemo, useCallback } from 'react'
import type { FieldDefinition, FieldType } from './types'

// Import all field components
import { TextField } from './TextField'
import { TextareaField } from './TextareaField'
import { NumberField } from './NumberField'
import { SelectField } from './SelectField'
import { MultiSelectField } from './MultiSelectField'
import { BooleanField } from './BooleanField'
import { JsonField } from './JsonField'
import { SliderField } from './SliderField'
import { TemplateField } from './TemplateField'
import { CodeField } from './CodeField'
import { ColorField } from './ColorField'
import { DateTimeField } from './DateTimeField'
import { CronField } from './CronField'
import { ArrayField } from './ArrayField'
import { KeyValueField } from './KeyValueField'
import { VariablePickerField } from './VariablePickerField'
import { ConditionBuilderField } from './ConditionBuilderField'
import { MappingField } from './MappingField'
import { ModelField } from './ModelField'
import { ProviderField } from './ProviderField'
import { MCPToolField } from './MCPToolField'
import { AgentSelectorField } from './AgentSelectorField'
import { ContactPickerField } from './ContactPickerField'

interface FieldRendererProps {
  /** Field definition */
  field: FieldDefinition
  /** Current field value */
  value: any
  /** Value change handler */
  onChange: (value: any) => void
  /** All form values (for conditional visibility) */
  formValues?: Record<string, any>
  /** Custom field components */
  customFields?: Record<string, React.ComponentType<any>>
  /** Whether field is disabled */
  disabled?: boolean
  /** Custom class name */
  className?: string
}

/**
 * Check if a field should be visible based on showWhen/hideWhen conditions
 */
function evaluateCondition(
  condition: FieldDefinition['showWhen'],
  formValues: Record<string, any>
): boolean {
  if (!condition) return true

  const { field, operator, value } = condition
  const fieldValue = formValues[field]

  switch (operator) {
    case 'equals':
      return fieldValue === value
    case 'notEquals':
      return fieldValue !== value
    case 'contains':
      return Array.isArray(fieldValue)
        ? fieldValue.includes(value)
        : String(fieldValue).includes(String(value))
    case 'notContains':
      return Array.isArray(fieldValue)
        ? !fieldValue.includes(value)
        : !String(fieldValue).includes(String(value))
    case 'greaterThan':
      return Number(fieldValue) > Number(value)
    case 'lessThan':
      return Number(fieldValue) < Number(value)
    case 'isEmpty':
      return (
        fieldValue === undefined ||
        fieldValue === null ||
        fieldValue === '' ||
        (Array.isArray(fieldValue) && fieldValue.length === 0) ||
        (typeof fieldValue === 'object' && Object.keys(fieldValue).length === 0)
      )
    case 'isNotEmpty':
      return !(
        fieldValue === undefined ||
        fieldValue === null ||
        fieldValue === '' ||
        (Array.isArray(fieldValue) && fieldValue.length === 0) ||
        (typeof fieldValue === 'object' && Object.keys(fieldValue).length === 0)
      )
    case 'in':
      return Array.isArray(value) && value.includes(fieldValue)
    case 'notIn':
      return Array.isArray(value) && !value.includes(fieldValue)
    default:
      return true
  }
}

/**
 * Map field type to component
 */
const fieldComponents: Record<FieldType, React.ComponentType<any> | null> = {
  text: TextField,
  textarea: TextareaField,
  number: NumberField,
  select: SelectField,
  multiselect: MultiSelectField,
  boolean: BooleanField,
  toggle: BooleanField,
  checkbox: BooleanField,
  json: JsonField,
  slider: SliderField,
  template: TemplateField,
  code: CodeField,
  color: ColorField,
  date: DateTimeField,
  time: DateTimeField,
  datetime: DateTimeField,
  cron: CronField,
  array: ArrayField,
  keyvalue: KeyValueField,
  variable: VariablePickerField,
  condition: ConditionBuilderField,
  mapping: MappingField,
  model: ModelField,
  provider: ProviderField,
  mcp_tool: MCPToolField,
  agentSelector: AgentSelectorField,
  contactPicker: ContactPickerField,
  object: null, // Handled like group
  tags: null, // TODO: Implement TagsField
  file: null, // TODO: Implement FileField
  custom: null, // Handled separately
  group: null, // Container type, no direct rendering
  divider: null, // UI element, no direct rendering
}

export const FieldRenderer: React.FC<FieldRendererProps> = ({
  field,
  value,
  onChange,
  formValues = {},
  customFields = {},
  disabled,
  className,
}) => {
  // Check visibility conditions
  const isVisible = useMemo(() => {
    // Check showWhen
    if (field.showWhen) {
      if (!evaluateCondition(field.showWhen, formValues)) {
        return false
      }
    }

    // Check hideWhen
    if (field.hideWhen) {
      if (evaluateCondition(field.hideWhen, formValues)) {
        return false
      }
    }

    return true
  }, [field.showWhen, field.hideWhen, formValues])

  // Validate value
  const error = useMemo(() => {
    if (!field.validation) return undefined

    const { validation } = field

    // Required check
    if (validation.required) {
      const isEmpty =
        value === undefined ||
        value === null ||
        value === '' ||
        (Array.isArray(value) && value.length === 0)
      if (isEmpty) {
        return validation.required === true ? 'This field is required' : validation.required
      }
    }

    // Min length
    if (validation.minLength !== undefined) {
      const len = typeof value === 'string' ? value.length : Array.isArray(value) ? value.length : 0
      if (len < validation.minLength) {
        return `Minimum ${validation.minLength} characters required`
      }
    }

    // Max length
    if (validation.maxLength !== undefined) {
      const len = typeof value === 'string' ? value.length : Array.isArray(value) ? value.length : 0
      if (len > validation.maxLength) {
        return `Maximum ${validation.maxLength} characters allowed`
      }
    }

    // Min value
    if (validation.min !== undefined && typeof value === 'number') {
      if (value < validation.min) {
        return `Minimum value is ${validation.min}`
      }
    }

    // Max value
    if (validation.max !== undefined && typeof value === 'number') {
      if (value > validation.max) {
        return `Maximum value is ${validation.max}`
      }
    }

    // Pattern
    if (validation.pattern && typeof value === 'string') {
      const regex = new RegExp(validation.pattern)
      if (!regex.test(value)) {
        return validation.patternMessage || 'Invalid format'
      }
    }

    // Custom validator
    if (validation.custom) {
      const result = validation.custom(value, formValues)
      if (result !== true) {
        return typeof result === 'string' ? result : 'Invalid value'
      }
    }

    return undefined
  }, [value, field.validation, formValues])

  // Handle special field types
  const renderField = useCallback(() => {
    if (!isVisible) return null

    const baseProps = {
      name: field.name,
      label: field.label,
      value: value ?? field.defaultValue,
      onChange,
      placeholder: field.placeholder,
      helpText: field.helpText,
      error,
      disabled: disabled || field.disabled,
      required: field.validation?.required !== undefined,
      className,
    }

    // Handle custom field type
    if (field.type === 'custom') {
      const CustomComponent = customFields[field.customType || '']
      if (CustomComponent) {
        return <CustomComponent {...baseProps} {...field.props} />
      }
      console.warn(`Custom field type "${field.customType}" not found`)
      return null
    }

    // Handle divider
    if (field.type === 'divider') {
      return (
        <div className="py-2">
          <div className="border-t border-slate-700" />
          {field.label && (
            <span className="text-[10px] text-slate-500 -mt-2 bg-slate-800 px-2 relative">
              {field.label}
            </span>
          )}
        </div>
      )
    }

    // Handle group
    if (field.type === 'group') {
      return (
        <fieldset className="space-y-3 p-3 border border-slate-700 rounded-lg">
          {field.label && (
            <legend className="text-xs font-medium text-slate-300 px-2">{field.label}</legend>
          )}
          {field.children?.map((childField) => (
            <FieldRenderer
              key={childField.name}
              field={childField}
              value={formValues[childField.name]}
              onChange={(newValue) => {
                // Notify parent about nested value change
                const updatedValues = { ...formValues, [childField.name]: newValue }
                onChange(updatedValues)
              }}
              formValues={formValues}
              customFields={customFields}
              disabled={disabled}
            />
          ))}
        </fieldset>
      )
    }

    // Get component for field type
    const Component = fieldComponents[field.type]
    if (!Component) {
      console.warn(`Unknown field type: ${field.type}`)
      return null
    }

    // Map specific props based on field type
    const typeSpecificProps: Record<string, any> = {}

    switch (field.type) {
      case 'select':
      case 'multiselect':
        typeSpecificProps.options = field.options || []
        break

      case 'toggle':
        typeSpecificProps.variant = 'toggle'
        break

      case 'checkbox':
        typeSpecificProps.variant = 'checkbox'
        break

      case 'date':
        typeSpecificProps.variant = 'date'
        break

      case 'time':
        typeSpecificProps.variant = 'time'
        break

      case 'datetime':
        typeSpecificProps.variant = 'datetime'
        break

      case 'slider':
        typeSpecificProps.min = field.validation?.min
        typeSpecificProps.max = field.validation?.max
        break

      case 'number':
        typeSpecificProps.min = field.validation?.min
        typeSpecificProps.max = field.validation?.max
        break

      case 'code':
        typeSpecificProps.language = field.language || 'javascript'
        break

      case 'array':
        typeSpecificProps.itemSchema = field.itemSchema
        typeSpecificProps.minItems = field.validation?.min
        typeSpecificProps.maxItems = field.validation?.max
        break

      case 'condition':
        typeSpecificProps.availableFields = field.availableFields
        break

      case 'mapping':
        typeSpecificProps.sourceFields = field.sourceFields
        typeSpecificProps.targetFields = field.targetFields
        break

      case 'agentSelector':
        typeSpecificProps.filterByPlatform = field.filterByPlatform
        typeSpecificProps.connectedOnly = field.connectedOnly
        break

      case 'contactPicker':
        // Get agentId from referenced field
        typeSpecificProps.agentId = field.agentIdField
          ? formValues[field.agentIdField]
          : field.props?.agentId
        // Get platform from referenced field
        typeSpecificProps.platform = field.platformField
          ? formValues[field.platformField]
          : field.props?.platform
        typeSpecificProps.multiple = field.multiple !== false
        typeSpecificProps.maxSelections = field.maxSelections
        break
    }

    return <Component {...baseProps} {...typeSpecificProps} {...field.props} />
  }, [
    isVisible,
    field,
    value,
    onChange,
    error,
    disabled,
    className,
    customFields,
    formValues,
  ])

  return renderField()
}

/**
 * Render a group of fields
 */
interface FieldGroupRendererProps {
  fields: FieldDefinition[]
  values: Record<string, any>
  onChange: (name: string, value: any) => void
  customFields?: Record<string, React.ComponentType<any>>
  disabled?: boolean
  className?: string
}

export const FieldGroupRenderer: React.FC<FieldGroupRendererProps> = ({
  fields,
  values,
  onChange,
  customFields,
  disabled,
  className,
}) => {
  return (
    <div className={className}>
      {fields.map((field) => (
        <FieldRenderer
          key={field.name}
          field={field}
          value={values[field.name]}
          onChange={(newValue) => onChange(field.name, newValue)}
          formValues={values}
          customFields={customFields}
          disabled={disabled}
        />
      ))}
    </div>
  )
}

export default FieldRenderer
