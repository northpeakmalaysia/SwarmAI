/**
 * Node Definitions
 *
 * Centralized definitions for all FlowBuilder nodes including:
 * - Node metadata (type, label, category, icon, color)
 * - Property schemas with types, defaults, validation
 * - Variable picker support
 * - Dynamic property configuration
 *
 * Based on WhatsBots pattern for convenient node configuration.
 */

/**
 * Field types for node properties
 */
const FIELD_TYPES = {
  TEXT: 'text',           // Single line text input
  TEXTAREA: 'textarea',   // Multi-line text input
  NUMBER: 'number',       // Number input with min/max
  SELECT: 'select',       // Dropdown selection
  MULTISELECT: 'multiselect', // Multiple selection
  CHECKBOX: 'checkbox',   // Boolean checkbox
  JSON: 'json',           // JSON editor
  ARRAY: 'array',         // Array of items
  VARIABLE: 'variable',   // Variable picker
  MODEL: 'model',         // AI model selector
  PROVIDER: 'provider',   // AI provider selector
  CONTACT: 'contact',     // Contact picker
  FILE: 'file',           // File upload
  COLOR: 'color',         // Color picker
  DATETIME: 'datetime',   // Date/time picker
  CRON: 'cron',           // Cron expression
};

/**
 * Node categories for grouping
 */
const NODE_CATEGORIES = {
  TRIGGER: 'trigger',
  AI: 'ai',
  LOGIC: 'logic',
  MESSAGING: 'messaging',
  WEB: 'web',
  DATA: 'data',
  FILE: 'file',
  SWARM: 'swarm',
  AGENTIC: 'agentic',
};

/**
 * Category colors (Tailwind classes)
 */
const CATEGORY_COLORS = {
  [NODE_CATEGORIES.TRIGGER]: 'amber',
  [NODE_CATEGORIES.AI]: 'violet',
  [NODE_CATEGORIES.LOGIC]: 'blue',
  [NODE_CATEGORIES.MESSAGING]: 'emerald',
  [NODE_CATEGORIES.WEB]: 'cyan',
  [NODE_CATEGORIES.DATA]: 'orange',
  [NODE_CATEGORIES.FILE]: 'slate',
  [NODE_CATEGORIES.SWARM]: 'pink',
  [NODE_CATEGORIES.AGENTIC]: 'rose',
};

/**
 * Property definition schema
 * @typedef {Object} PropertyDef
 * @property {string} type - Field type (FIELD_TYPES)
 * @property {string} label - Display label
 * @property {string} [description] - Help text
 * @property {*} [default] - Default value
 * @property {boolean} [required] - Is required
 * @property {boolean} [showVariablePicker] - Show variable picker button
 * @property {string} [placeholder] - Placeholder text
 * @property {Array} [options] - Options for select/multiselect
 * @property {number} [min] - Min value for number
 * @property {number} [max] - Max value for number
 * @property {number} [step] - Step for number
 * @property {number} [rows] - Rows for textarea
 * @property {Object} [conditionalDisplay] - Show/hide based on other fields
 * @property {Function} [validate] - Custom validation function
 */

/**
 * Node definition schema
 * @typedef {Object} NodeDefinition
 * @property {string} type - Unique node type identifier
 * @property {string} label - Display name
 * @property {string} description - Node description
 * @property {string} icon - Lucide icon name
 * @property {string} category - Node category
 * @property {string} color - Tailwind color class
 * @property {Object} properties - Property definitions
 * @property {Object} outputs - Output handles configuration
 * @property {Function} getDefaultConfig - Returns default configuration
 */

/**
 * Node Definitions
 */
const NODE_DEFINITIONS = {
  // ============================================================
  // TRIGGER NODES
  // ============================================================

  'trigger:manual': {
    type: 'trigger:manual',
    label: 'Manual Trigger',
    description: 'Manually trigger this flow via API or UI',
    icon: 'Play',
    category: NODE_CATEGORIES.TRIGGER,
    color: CATEGORY_COLORS.trigger,
    properties: {
      description: {
        type: FIELD_TYPES.TEXT,
        label: 'Description',
        description: 'Optional description for this trigger',
        placeholder: 'Click to run this flow',
        showVariablePicker: false,
      },
    },
    outputs: {
      default: { label: 'Next', type: 'default' },
    },
    getDefaultConfig: () => ({
      description: '',
    }),
  },

  'trigger:schedule': {
    type: 'trigger:schedule',
    label: 'Schedule Trigger',
    description: 'Trigger flow on a schedule using cron expression',
    icon: 'Clock',
    category: NODE_CATEGORIES.TRIGGER,
    color: CATEGORY_COLORS.trigger,
    properties: {
      cronExpression: {
        type: FIELD_TYPES.CRON,
        label: 'Cron Expression',
        description: 'Cron schedule (e.g., "0 9 * * *" for daily at 9am)',
        required: true,
        placeholder: '0 9 * * *',
      },
      timezone: {
        type: FIELD_TYPES.SELECT,
        label: 'Timezone',
        description: 'Timezone for the schedule',
        default: 'Asia/Kuala_Lumpur',
        options: [
          { value: 'Asia/Kuala_Lumpur', label: 'Malaysia (GMT+8)' },
          { value: 'Asia/Singapore', label: 'Singapore (GMT+8)' },
          { value: 'UTC', label: 'UTC' },
          { value: 'America/New_York', label: 'New York (EST)' },
          { value: 'Europe/London', label: 'London (GMT)' },
        ],
      },
      enabled: {
        type: FIELD_TYPES.CHECKBOX,
        label: 'Enabled',
        description: 'Enable or disable this schedule',
        default: true,
      },
    },
    outputs: {
      default: { label: 'On Schedule', type: 'default' },
    },
    getDefaultConfig: () => ({
      cronExpression: '0 9 * * *',
      timezone: 'Asia/Kuala_Lumpur',
      enabled: true,
    }),
  },

  'trigger:webhook': {
    type: 'trigger:webhook',
    label: 'Webhook Trigger',
    description: 'Trigger flow when HTTP webhook is called',
    icon: 'Webhook',
    category: NODE_CATEGORIES.TRIGGER,
    color: CATEGORY_COLORS.trigger,
    properties: {
      path: {
        type: FIELD_TYPES.TEXT,
        label: 'Webhook Path',
        description: 'URL path for the webhook (auto-generated if empty)',
        placeholder: '/webhook/my-flow',
      },
      method: {
        type: FIELD_TYPES.SELECT,
        label: 'HTTP Method',
        default: 'POST',
        options: [
          { value: 'GET', label: 'GET' },
          { value: 'POST', label: 'POST' },
          { value: 'PUT', label: 'PUT' },
          { value: 'DELETE', label: 'DELETE' },
        ],
      },
      authToken: {
        type: FIELD_TYPES.TEXT,
        label: 'Auth Token',
        description: 'Optional authentication token',
        placeholder: 'Bearer token or API key',
      },
    },
    outputs: {
      default: { label: 'On Request', type: 'default' },
    },
    getDefaultConfig: () => ({
      path: '',
      method: 'POST',
      authToken: '',
    }),
  },

  'trigger:message': {
    type: 'trigger:message',
    label: 'Message Trigger',
    description: 'Trigger when a message matches a pattern',
    icon: 'MessageSquare',
    category: NODE_CATEGORIES.TRIGGER,
    color: CATEGORY_COLORS.trigger,
    properties: {
      pattern: {
        type: FIELD_TYPES.TEXT,
        label: 'Pattern',
        description: 'Text pattern to match',
        required: true,
        placeholder: 'hello',
      },
      patternType: {
        type: FIELD_TYPES.SELECT,
        label: 'Pattern Type',
        default: 'contains',
        options: [
          { value: 'exact', label: 'Exact Match' },
          { value: 'contains', label: 'Contains' },
          { value: 'startsWith', label: 'Starts With' },
          { value: 'endsWith', label: 'Ends With' },
          { value: 'regex', label: 'Regular Expression' },
        ],
      },
      caseSensitive: {
        type: FIELD_TYPES.CHECKBOX,
        label: 'Case Sensitive',
        default: false,
      },
      fromGroups: {
        type: FIELD_TYPES.CHECKBOX,
        label: 'From Groups',
        description: 'Include messages from groups',
        default: true,
      },
      fromPrivate: {
        type: FIELD_TYPES.CHECKBOX,
        label: 'From Private',
        description: 'Include private messages',
        default: true,
      },
    },
    outputs: {
      default: { label: 'On Match', type: 'default' },
    },
    getDefaultConfig: () => ({
      pattern: '',
      patternType: 'contains',
      caseSensitive: false,
      fromGroups: true,
      fromPrivate: true,
    }),
  },

  // ============================================================
  // AI NODES
  // ============================================================

  'ai:chatCompletion': {
    type: 'ai:chatCompletion',
    label: 'AI Chat',
    description: 'Get AI-generated response using configured provider',
    icon: 'Bot',
    category: NODE_CATEGORIES.AI,
    color: CATEGORY_COLORS.ai,
    properties: {
      prompt: {
        type: FIELD_TYPES.TEXTAREA,
        label: 'Prompt',
        description: 'The message or question to send to AI',
        required: true,
        rows: 4,
        showVariablePicker: true,
        placeholder: '{{input.message}}',
      },
      systemPrompt: {
        type: FIELD_TYPES.TEXTAREA,
        label: 'System Prompt',
        description: 'Instructions for how the AI should behave',
        rows: 3,
        showVariablePicker: true,
        placeholder: 'You are a helpful assistant...',
      },
      model: {
        type: FIELD_TYPES.MODEL,
        label: 'Model',
        description: 'AI model to use (leave empty for auto-selection)',
      },
      providerId: {
        type: FIELD_TYPES.PROVIDER,
        label: 'Provider',
        description: 'AI provider (leave empty for auto-selection)',
      },
      temperature: {
        type: FIELD_TYPES.NUMBER,
        label: 'Temperature',
        description: 'Creativity level (0 = focused, 2 = creative)',
        default: 0.7,
        min: 0,
        max: 2,
        step: 0.1,
      },
      maxTokens: {
        type: FIELD_TYPES.NUMBER,
        label: 'Max Tokens',
        description: 'Maximum response length',
        default: 2000,
        min: 1,
        max: 100000,
        step: 100,
      },
    },
    outputs: {
      default: { label: 'Response', type: 'default' },
    },
    getDefaultConfig: () => ({
      prompt: '{{input.message}}',
      systemPrompt: '',
      model: '',
      providerId: '',
      temperature: 0.7,
      maxTokens: 2000,
    }),
  },

  'ai:router': {
    type: 'ai:router',
    label: 'AI Router',
    description: 'Intelligent router that classifies intent and selects appropriate tools',
    icon: 'Brain',
    category: NODE_CATEGORIES.AI,
    color: CATEGORY_COLORS.ai,
    properties: {
      message: {
        type: FIELD_TYPES.TEXTAREA,
        label: 'Message',
        description: 'User message to classify and route',
        required: true,
        rows: 3,
        showVariablePicker: true,
        placeholder: '{{input.message}}',
      },
      customInstructions: {
        type: FIELD_TYPES.TEXTAREA,
        label: 'Custom Instructions',
        description: 'Additional instructions for classification',
        rows: 3,
        showVariablePicker: true,
        placeholder: 'Focus on customer support queries...',
      },
      enabledTools: {
        type: FIELD_TYPES.MULTISELECT,
        label: 'Enabled Tools',
        description: 'Select which tools are available (empty = all)',
        options: [], // Populated dynamically from SystemToolsRegistry
      },
      disabledTools: {
        type: FIELD_TYPES.MULTISELECT,
        label: 'Disabled Tools',
        description: 'Tools to exclude from routing',
        options: [],
      },
      confidenceThreshold: {
        type: FIELD_TYPES.NUMBER,
        label: 'Confidence Threshold',
        description: 'Minimum confidence for tool execution (below = clarify)',
        default: 0.7,
        min: 0,
        max: 1,
        step: 0.05,
      },
      executeTools: {
        type: FIELD_TYPES.CHECKBOX,
        label: 'Execute Tools',
        description: 'Execute selected tools (false = classify only)',
        default: true,
      },
      maxChainLength: {
        type: FIELD_TYPES.NUMBER,
        label: 'Max Chain Length',
        description: 'Maximum tools in a chain',
        default: 3,
        min: 1,
        max: 10,
        step: 1,
      },
      routeToNodes: {
        type: FIELD_TYPES.CHECKBOX,
        label: 'Route to Nodes',
        description: 'Route to connected nodes based on tool',
        default: false,
      },
    },
    outputs: {
      default: { label: 'Result', type: 'default' },
      clarify: { label: 'Clarify', type: 'conditional' },
    },
    getDefaultConfig: () => ({
      message: '{{input.message}}',
      customInstructions: '',
      enabledTools: [],
      disabledTools: [],
      confidenceThreshold: 0.7,
      executeTools: true,
      maxChainLength: 3,
      routeToNodes: false,
    }),
  },

  'ai:ragQuery': {
    type: 'ai:ragQuery',
    label: 'RAG Query',
    description: 'Query knowledge base and generate contextual response',
    icon: 'Database',
    category: NODE_CATEGORIES.AI,
    color: CATEGORY_COLORS.ai,
    properties: {
      query: {
        type: FIELD_TYPES.TEXTAREA,
        label: 'Query',
        description: 'Search query or question',
        required: true,
        rows: 2,
        showVariablePicker: true,
        placeholder: '{{input.message}}',
      },
      libraryId: {
        type: FIELD_TYPES.SELECT,
        label: 'Knowledge Library',
        description: 'Library to search (empty = all)',
        options: [], // Populated dynamically
      },
      topK: {
        type: FIELD_TYPES.NUMBER,
        label: 'Top K Results',
        description: 'Number of relevant chunks to retrieve',
        default: 5,
        min: 1,
        max: 20,
        step: 1,
      },
      generateResponse: {
        type: FIELD_TYPES.CHECKBOX,
        label: 'Generate AI Response',
        description: 'Generate response using retrieved context',
        default: true,
      },
      systemPrompt: {
        type: FIELD_TYPES.TEXTAREA,
        label: 'System Prompt',
        description: 'Instructions for response generation',
        rows: 3,
        showVariablePicker: true,
        conditionalDisplay: { field: 'generateResponse', value: true },
      },
    },
    outputs: {
      default: { label: 'Response', type: 'default' },
    },
    getDefaultConfig: () => ({
      query: '{{input.message}}',
      libraryId: '',
      topK: 5,
      generateResponse: true,
      systemPrompt: '',
    }),
  },

  // ============================================================
  // LOGIC NODES
  // ============================================================

  'logic:condition': {
    type: 'logic:condition',
    label: 'Condition',
    description: 'Branch flow based on a condition',
    icon: 'GitBranch',
    category: NODE_CATEGORIES.LOGIC,
    color: CATEGORY_COLORS.logic,
    properties: {
      leftValue: {
        type: FIELD_TYPES.TEXT,
        label: 'Left Value',
        description: 'Value to compare (use {{variables}})',
        required: true,
        showVariablePicker: true,
        placeholder: '{{input.type}}',
      },
      operator: {
        type: FIELD_TYPES.SELECT,
        label: 'Operator',
        required: true,
        default: 'equals',
        options: [
          { value: 'equals', label: 'Equals (==)' },
          { value: 'strictEquals', label: 'Strict Equals (===)' },
          { value: 'notEquals', label: 'Not Equals (!=)' },
          { value: 'greaterThan', label: 'Greater Than (>)' },
          { value: 'greaterThanOrEqual', label: 'Greater Than or Equal (>=)' },
          { value: 'lessThan', label: 'Less Than (<)' },
          { value: 'lessThanOrEqual', label: 'Less Than or Equal (<=)' },
          { value: 'contains', label: 'Contains' },
          { value: 'notContains', label: 'Does Not Contain' },
          { value: 'startsWith', label: 'Starts With' },
          { value: 'endsWith', label: 'Ends With' },
          { value: 'matches', label: 'Matches Regex' },
          { value: 'isEmpty', label: 'Is Empty' },
          { value: 'isNotEmpty', label: 'Is Not Empty' },
          { value: 'isTrue', label: 'Is True' },
          { value: 'isFalse', label: 'Is False' },
        ],
      },
      rightValue: {
        type: FIELD_TYPES.TEXT,
        label: 'Right Value',
        description: 'Value to compare against',
        showVariablePicker: true,
        placeholder: 'expected value',
        conditionalDisplay: {
          field: 'operator',
          notIn: ['isEmpty', 'isNotEmpty', 'isTrue', 'isFalse'],
        },
      },
    },
    outputs: {
      true: { label: 'True', type: 'conditional' },
      false: { label: 'False', type: 'conditional' },
    },
    getDefaultConfig: () => ({
      leftValue: '',
      operator: 'equals',
      rightValue: '',
    }),
  },

  'logic:switch': {
    type: 'logic:switch',
    label: 'Switch',
    description: 'Multi-way branching based on value matching',
    icon: 'GitMerge',
    category: NODE_CATEGORIES.LOGIC,
    color: CATEGORY_COLORS.logic,
    properties: {
      value: {
        type: FIELD_TYPES.TEXT,
        label: 'Value',
        description: 'Value to match against cases',
        required: true,
        showVariablePicker: true,
        placeholder: '{{input.action}}',
      },
      cases: {
        type: FIELD_TYPES.ARRAY,
        label: 'Cases',
        description: 'Possible values and their labels',
        itemSchema: {
          value: { type: FIELD_TYPES.TEXT, label: 'Case Value' },
          label: { type: FIELD_TYPES.TEXT, label: 'Label' },
        },
        default: [
          { value: 'option1', label: 'Option 1' },
          { value: 'option2', label: 'Option 2' },
        ],
      },
      defaultCase: {
        type: FIELD_TYPES.CHECKBOX,
        label: 'Include Default Case',
        description: 'Add a default branch for unmatched values',
        default: true,
      },
    },
    outputs: {
      // Dynamic based on cases
    },
    getDefaultConfig: () => ({
      value: '',
      cases: [
        { value: 'option1', label: 'Option 1' },
        { value: 'option2', label: 'Option 2' },
      ],
      defaultCase: true,
    }),
  },

  'logic:setVariable': {
    type: 'logic:setVariable',
    label: 'Set Variable',
    description: 'Set or update a flow variable',
    icon: 'Variable',
    category: NODE_CATEGORIES.LOGIC,
    color: CATEGORY_COLORS.logic,
    properties: {
      variableName: {
        type: FIELD_TYPES.TEXT,
        label: 'Variable Name',
        description: 'Name of the variable to set',
        required: true,
        placeholder: 'myVariable',
      },
      value: {
        type: FIELD_TYPES.TEXTAREA,
        label: 'Value',
        description: 'Value to assign (supports {{variables}})',
        required: true,
        rows: 2,
        showVariablePicker: true,
        placeholder: '{{input.data}}',
      },
      transformation: {
        type: FIELD_TYPES.SELECT,
        label: 'Transformation',
        description: 'Apply transformation to value',
        default: 'none',
        options: [
          { value: 'none', label: 'None' },
          { value: 'toString', label: 'To String' },
          { value: 'toNumber', label: 'To Number' },
          { value: 'toBoolean', label: 'To Boolean' },
          { value: 'toArray', label: 'To Array' },
          { value: 'parseJSON', label: 'Parse JSON' },
          { value: 'stringify', label: 'Stringify JSON' },
          { value: 'uppercase', label: 'Uppercase' },
          { value: 'lowercase', label: 'Lowercase' },
          { value: 'trim', label: 'Trim Whitespace' },
        ],
      },
    },
    outputs: {
      default: { label: 'Next', type: 'default' },
    },
    getDefaultConfig: () => ({
      variableName: '',
      value: '',
      transformation: 'none',
    }),
  },

  'logic:delay': {
    type: 'logic:delay',
    label: 'Delay',
    description: 'Pause flow execution for a duration',
    icon: 'Timer',
    category: NODE_CATEGORIES.LOGIC,
    color: CATEGORY_COLORS.logic,
    properties: {
      duration: {
        type: FIELD_TYPES.NUMBER,
        label: 'Duration',
        description: 'How long to wait',
        required: true,
        default: 1000,
        min: 1,
        max: 1800000, // 30 minutes
        step: 100,
      },
      unit: {
        type: FIELD_TYPES.SELECT,
        label: 'Unit',
        default: 'milliseconds',
        options: [
          { value: 'milliseconds', label: 'Milliseconds' },
          { value: 'seconds', label: 'Seconds' },
          { value: 'minutes', label: 'Minutes' },
        ],
      },
    },
    outputs: {
      default: { label: 'After Delay', type: 'default' },
    },
    getDefaultConfig: () => ({
      duration: 1000,
      unit: 'milliseconds',
    }),
  },

  // ============================================================
  // MESSAGING NODES
  // ============================================================

  'messaging:sendText': {
    type: 'messaging:sendText',
    label: 'Send Text',
    description: 'Send a text message via WhatsApp, Telegram, or Email',
    icon: 'Send',
    category: NODE_CATEGORIES.MESSAGING,
    color: CATEGORY_COLORS.messaging,
    properties: {
      channel: {
        type: FIELD_TYPES.SELECT,
        label: 'Channel',
        description: 'Message delivery channel',
        default: 'auto',
        options: [
          { value: 'auto', label: 'Auto-detect' },
          { value: 'whatsapp', label: 'WhatsApp' },
          { value: 'telegram', label: 'Telegram' },
          { value: 'email', label: 'Email' },
          { value: 'webhook', label: 'Webhook' },
        ],
      },
      recipient: {
        type: FIELD_TYPES.TEXT,
        label: 'Recipient',
        description: 'Phone number, chat ID, or email address',
        required: true,
        showVariablePicker: true,
        placeholder: '{{input.sender}}',
      },
      message: {
        type: FIELD_TYPES.TEXTAREA,
        label: 'Message',
        description: 'Message content',
        required: true,
        rows: 4,
        showVariablePicker: true,
        placeholder: 'Hello! This is your message...',
      },
      subject: {
        type: FIELD_TYPES.TEXT,
        label: 'Subject',
        description: 'Email subject (for email channel)',
        showVariablePicker: true,
        conditionalDisplay: { field: 'channel', value: 'email' },
      },
    },
    outputs: {
      default: { label: 'Sent', type: 'default' },
    },
    getDefaultConfig: () => ({
      channel: 'auto',
      recipient: '{{input.sender}}',
      message: '',
      subject: '',
    }),
  },

  // ============================================================
  // WEB NODES
  // ============================================================

  'web:httpRequest': {
    type: 'web:httpRequest',
    label: 'HTTP Request',
    description: 'Make an HTTP API request',
    icon: 'Globe',
    category: NODE_CATEGORIES.WEB,
    color: CATEGORY_COLORS.web,
    properties: {
      url: {
        type: FIELD_TYPES.TEXT,
        label: 'URL',
        description: 'Request URL',
        required: true,
        showVariablePicker: true,
        placeholder: 'https://api.example.com/endpoint',
      },
      method: {
        type: FIELD_TYPES.SELECT,
        label: 'Method',
        default: 'GET',
        options: [
          { value: 'GET', label: 'GET' },
          { value: 'POST', label: 'POST' },
          { value: 'PUT', label: 'PUT' },
          { value: 'PATCH', label: 'PATCH' },
          { value: 'DELETE', label: 'DELETE' },
        ],
      },
      headers: {
        type: FIELD_TYPES.JSON,
        label: 'Headers',
        description: 'HTTP headers as JSON',
        placeholder: '{"Authorization": "Bearer ..."}',
      },
      body: {
        type: FIELD_TYPES.JSON,
        label: 'Body',
        description: 'Request body (for POST/PUT/PATCH)',
        showVariablePicker: true,
        conditionalDisplay: {
          field: 'method',
          in: ['POST', 'PUT', 'PATCH'],
        },
      },
      responseType: {
        type: FIELD_TYPES.SELECT,
        label: 'Response Type',
        default: 'json',
        options: [
          { value: 'json', label: 'JSON' },
          { value: 'text', label: 'Text' },
          { value: 'binary', label: 'Binary (Base64)' },
        ],
      },
      timeout: {
        type: FIELD_TYPES.NUMBER,
        label: 'Timeout (ms)',
        default: 30000,
        min: 1000,
        max: 120000,
        step: 1000,
      },
    },
    outputs: {
      default: { label: 'Response', type: 'default' },
    },
    getDefaultConfig: () => ({
      url: '',
      method: 'GET',
      headers: '{}',
      body: '',
      responseType: 'json',
      timeout: 30000,
    }),
  },

  // ============================================================
  // AGENTIC NODES
  // ============================================================

  'agentic:customTool': {
    type: 'agentic:customTool',
    label: 'Custom Tool',
    description: 'Execute a custom Python tool',
    icon: 'Puzzle',
    category: NODE_CATEGORIES.AGENTIC,
    color: CATEGORY_COLORS.agentic,
    properties: {
      toolId: {
        type: FIELD_TYPES.SELECT,
        label: 'Tool',
        description: 'Select custom tool to execute',
        required: true,
        options: [], // Populated dynamically
      },
      inputs: {
        type: FIELD_TYPES.JSON,
        label: 'Inputs',
        description: 'Tool input parameters as JSON',
        showVariablePicker: true,
        placeholder: '{"param1": "{{input.value}}"}',
      },
    },
    outputs: {
      default: { label: 'Result', type: 'default' },
    },
    getDefaultConfig: () => ({
      toolId: '',
      inputs: '{}',
    }),
  },
};

/**
 * Available variables for Variable Picker
 */
const AVAILABLE_VARIABLES = {
  // Date/Time Variables
  datetime: [
    { name: 'time.date', description: 'Current date (YYYY-MM-DD)', example: '2026-01-31' },
    { name: 'time.time', description: 'Current time (HH:mm:ss)', example: '14:30:00' },
    { name: 'time.iso', description: 'ISO timestamp', example: '2026-01-31T14:30:00.000Z' },
    { name: 'time.timestamp', description: 'Unix timestamp', example: '1738334400' },
    { name: 'time.year', description: 'Current year', example: '2026' },
    { name: 'time.month', description: 'Current month (1-12)', example: '1' },
    { name: 'time.day', description: 'Current day (1-31)', example: '31' },
    { name: 'time.hour', description: 'Current hour (0-23)', example: '14' },
    { name: 'time.minute', description: 'Current minute (0-59)', example: '30' },
    { name: 'time.weekday', description: 'Day of week', example: 'Friday' },
  ],

  // Input Variables
  input: [
    { name: 'input.message', description: 'Input message content', example: 'Hello!' },
    { name: 'input.sender', description: 'Sender ID/phone', example: '60123456789' },
    { name: 'input.senderName', description: 'Sender display name', example: 'John Doe' },
    { name: 'input.chatId', description: 'Chat/conversation ID', example: '60123456789@c.us' },
    { name: 'input.messageId', description: 'Message ID', example: 'ABC123' },
    { name: 'input.isGroup', description: 'Is from group', example: 'false' },
    { name: 'input.groupName', description: 'Group name if from group', example: 'Team Chat' },
    { name: 'input.timestamp', description: 'Message timestamp', example: '1738334400' },
  ],

  // Media Variables
  media: [
    { name: 'input.hasMedia', description: 'Has media attachment', example: 'true' },
    { name: 'input.mediaType', description: 'Media type', example: 'image' },
    { name: 'input.mediaUrl', description: 'Media URL', example: 'data:image/jpeg;base64,...' },
    { name: 'input.mediaFilename', description: 'Media filename', example: 'photo.jpg' },
  ],

  // Node Output Variables
  nodes: [
    { name: 'node.{nodeId}.output', description: 'Output from specific node', example: '...' },
    { name: 'node.{nodeId}.content', description: 'Content field from node', example: '...' },
    { name: 'node.{nodeId}.data', description: 'Data from node output', example: '{}' },
  ],

  // Flow Variables
  flow: [
    { name: 'var.{name}', description: 'Custom flow variable', example: '...' },
    { name: 'variables.{name}', description: 'Alias for flow variable', example: '...' },
  ],

  // Environment
  env: [
    { name: 'env.NODE_ENV', description: 'Environment mode', example: 'production' },
    { name: 'env.TZ', description: 'Timezone', example: 'Asia/Kuala_Lumpur' },
  ],
};

/**
 * Get node definition by type
 * @param {string} type - Node type
 * @returns {NodeDefinition|undefined}
 */
function getNodeDefinition(type) {
  return NODE_DEFINITIONS[type];
}

/**
 * Get all node definitions
 * @returns {NodeDefinition[]}
 */
function getAllNodeDefinitions() {
  return Object.values(NODE_DEFINITIONS);
}

/**
 * Get nodes by category
 * @param {string} category - Category name
 * @returns {NodeDefinition[]}
 */
function getNodesByCategory(category) {
  return Object.values(NODE_DEFINITIONS).filter(n => n.category === category);
}

/**
 * Get default config for a node type
 * @param {string} type - Node type
 * @returns {Object}
 */
function getDefaultConfig(type) {
  const def = NODE_DEFINITIONS[type];
  if (def?.getDefaultConfig) {
    return def.getDefaultConfig();
  }
  return {};
}

/**
 * Validate node configuration
 * @param {string} type - Node type
 * @param {Object} config - Node configuration
 * @returns {{valid: boolean, errors: string[]}}
 */
function validateNodeConfig(type, config) {
  const def = NODE_DEFINITIONS[type];
  const errors = [];

  if (!def) {
    return { valid: false, errors: [`Unknown node type: ${type}`] };
  }

  for (const [propName, propDef] of Object.entries(def.properties || {})) {
    const value = config[propName];

    // Check required
    if (propDef.required && (value === undefined || value === null || value === '')) {
      errors.push(`${propDef.label || propName} is required`);
    }

    // Check number range
    if (propDef.type === FIELD_TYPES.NUMBER && value !== undefined) {
      const num = parseFloat(value);
      if (isNaN(num)) {
        errors.push(`${propDef.label || propName} must be a number`);
      } else {
        if (propDef.min !== undefined && num < propDef.min) {
          errors.push(`${propDef.label || propName} must be at least ${propDef.min}`);
        }
        if (propDef.max !== undefined && num > propDef.max) {
          errors.push(`${propDef.label || propName} must be at most ${propDef.max}`);
        }
      }
    }

    // Custom validation
    if (propDef.validate && value !== undefined) {
      const error = propDef.validate(value, config);
      if (error) {
        errors.push(error);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

module.exports = {
  NODE_DEFINITIONS,
  FIELD_TYPES,
  NODE_CATEGORIES,
  CATEGORY_COLORS,
  AVAILABLE_VARIABLES,
  getNodeDefinition,
  getAllNodeDefinitions,
  getNodesByCategory,
  getDefaultConfig,
  validateNodeConfig,
};
