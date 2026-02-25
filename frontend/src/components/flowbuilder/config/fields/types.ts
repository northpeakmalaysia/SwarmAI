/**
 * Field Type Definitions
 *
 * Common types and interfaces for all field components.
 */

export type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'select'
  | 'multiselect'
  | 'boolean'
  | 'toggle'
  | 'checkbox'
  | 'json'
  | 'template'
  | 'code'
  | 'slider'
  | 'color'
  | 'date'
  | 'time'
  | 'datetime'
  | 'cron'
  | 'array'
  | 'object'
  | 'keyvalue'
  | 'variable'
  | 'condition'
  | 'mapping'
  | 'tags'
  | 'file'
  | 'model'
  | 'provider'
  | 'mcp_tool'
  | 'agentSelector'
  | 'contactPicker'
  | 'custom'
  | 'group'
  | 'divider'

export interface FieldOption {
  value: string
  label: string
  description?: string
  icon?: string
  disabled?: boolean
  group?: string
  type?: string
}

export interface FieldValidation {
  required?: boolean | string
  min?: number
  max?: number
  minLength?: number
  maxLength?: number
  pattern?: string
  patternMessage?: string
  custom?: (value: any, formValues?: Record<string, any>) => boolean | string
}

export interface BaseFieldProps<T = any> {
  name: string
  label: string
  value: T
  onChange: (value: T) => void
  placeholder?: string
  helpText?: string
  error?: string
  disabled?: boolean
  required?: boolean
  className?: string
}

/**
 * Conditional visibility configuration
 */
export interface FieldCondition {
  field: string
  operator:
    | 'equals'
    | 'notEquals'
    | 'contains'
    | 'notContains'
    | 'greaterThan'
    | 'lessThan'
    | 'isEmpty'
    | 'isNotEmpty'
    | 'in'
    | 'notIn'
  value?: any
}

export interface FieldDefinition {
  name: string
  label: string
  type: FieldType
  placeholder?: string
  helpText?: string
  disabled?: boolean
  defaultValue?: any
  options?: FieldOption[]
  validation?: FieldValidation

  // Conditional visibility
  showWhen?: FieldCondition
  hideWhen?: FieldCondition

  // Type-specific options
  min?: number
  max?: number
  step?: number
  rows?: number
  language?: string
  itemSchema?: FieldDefinition
  keySchema?: FieldDefinition
  valueSchema?: FieldDefinition
  showVariablePicker?: boolean
  dynamic?: boolean
  group?: string

  // Group/container fields
  children?: FieldDefinition[]
  fields?: FieldDefinition[]

  // Custom field type
  customType?: string
  props?: Record<string, any>

  // Condition builder
  availableFields?: FieldOption[]

  // Mapping field
  sourceFields?: FieldOption[]
  targetFields?: FieldOption[]

  // Agent/Contact picker fields
  filterByPlatform?: string
  connectedOnly?: boolean
  agentIdField?: string  // Field name to get agentId from
  platformField?: string // Field name to get platform from
  multiple?: boolean
  maxSelections?: number
}

export interface FieldState {
  touched: boolean
  dirty: boolean
  error: string | null
}

/**
 * Output variable definition for nodes
 */
export interface NodeOutputDefinition {
  name: string
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'any'
  description: string
  example?: string
}

/**
 * Node configuration schema
 */
export interface NodeConfigSchema {
  nodeType: string
  title: string
  description?: string
  icon?: string
  color?: string
  category?: string
  fields: FieldDefinition[]
  advanced?: FieldDefinition[]
  /** Available output variables from this node */
  outputs?: NodeOutputDefinition[]
  /** Help text explaining how to reference this node's outputs */
  outputsHelp?: string
}
