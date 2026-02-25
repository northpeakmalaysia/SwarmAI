/**
 * Node Configuration Schemas
 *
 * Defines field schemas for all FlowBuilder node types.
 * Uses FieldDefinition format for dynamic rendering.
 *
 * =============================================================================
 * VARIABLE REFERENCE GUIDE
 * =============================================================================
 *
 * ACCESSING NODE OUTPUTS:
 * - {{node.NODE_ID.field}}     - Get specific field from a node by its ID
 * - {{previousOutput}}         - Get the last node's output (auto-extracts 'response' if available)
 * - {{results.NODE_ID}}        - Alternative syntax for node results
 *
 * TRIGGER INPUT VARIABLES (available in flows triggered by messages):
 * - {{input.message}}          - The message content
 * - {{input.from}}             - Sender ID/phone number
 * - {{input.conversationId}}   - Conversation ID
 * - {{input.platform}}         - Platform (whatsapp, telegram, email)
 * - {{input.contentType}}      - Content type (text, image, video, etc.)
 * - {{input.mediaUrl}}         - URL of media attachment (if any)
 *
 * TRIGGER SHORTHAND VARIABLES (WhatsBots style):
 * - {{triggerPhone}}           - Sender phone number
 * - {{triggerMessage}}         - Message content
 * - {{triggerSenderName}}      - Sender display name
 * - {{triggerChatId}}          - Chat/conversation ID
 * - {{triggerIsGroup}}         - Whether message is from a group
 * - {{triggerGroupName}}       - Group name (if group message)
 * - {{triggerHasMedia}}        - Whether message has media
 * - {{triggerMediaType}}       - Type of media attachment
 *
 * FLOW VARIABLES:
 * - {{var.variableName}}       - Get a flow variable set by Set Variable node
 * - {{variables.variableName}} - Alternative syntax
 *
 * LOOP VARIABLES (inside Loop node):
 * - {{item}}                   - Current item in forEach loop
 * - {{index}}                  - Current iteration index (0-based)
 * - {{var.item}}               - Alternative syntax for current item
 * - {{var.index}}              - Alternative syntax for index
 *
 * BUILT-IN VARIABLES:
 * - {{TODAY}}                  - Current date (dd-mm-yyyy)
 * - {{TIME}}                   - Current time (HH:mm:ss)
 * - {{DATETIME}}               - Current date and time
 * - {{TIMESTAMP}}              - Unix timestamp
 * - {{UUID}}                   - Generate unique ID
 * - {{RANDOM}}                 - Random number (0-999999)
 * - {{DAYNAME}}                - Day name (MONDAY, TUESDAY, etc.)
 * - {{MONTHNAME}}              - Month name (JANUARY, etc.)
 *
 * TIME FUNCTIONS:
 * - {{time.date}}              - Current date (YYYY-MM-DD)
 * - {{time.time}}              - Current time (HH:mm:ss)
 * - {{time.iso}}               - ISO 8601 timestamp
 * - {{time.year}}              - Current year
 * - {{time.month}}             - Current month (1-12)
 * - {{time.day}}               - Current day (1-31)
 * - {{time.hour}}              - Current hour (0-23)
 * - {{time.weekday}}           - Day name (Sunday, Monday, etc.)
 *
 * ENVIRONMENT VARIABLES (limited for security):
 * - {{env.NODE_ENV}}           - Node environment
 * - {{env.TZ}}                 - Timezone
 *
 * =============================================================================
 */

import type { FieldDefinition, NodeConfigSchema, NodeOutputDefinition } from './fields/types'

/**
 * Common output helper text templates
 */
const OUTPUT_HELP = {
  trigger: (nodeType: string) =>
    `To reference this trigger's data in later nodes, use:\n` +
    `• {{input.message}} - Message content\n` +
    `• {{input.from}} - Sender ID\n` +
    `• {{input.platform}} - Platform name`,

  ai: (nodeType: string) =>
    `To reference this node's output:\n` +
    `• {{node.NODE_ID.content}} - AI response text\n` +
    `• {{node.NODE_ID.model}} - Model used\n` +
    `• {{node.NODE_ID.provider}} - Provider used\n` +
    `• {{previousOutput}} - Shorthand for response`,

  messaging: (nodeType: string) =>
    `To reference this node's output:\n` +
    `• {{node.NODE_ID.messageId}} - Sent message ID\n` +
    `• {{node.NODE_ID.status}} - Send status\n` +
    `• {{node.NODE_ID.sentAt}} - Timestamp`,

  logic: (nodeType: string) =>
    `To reference this node's output:\n` +
    `• {{node.NODE_ID.result}} - Condition result\n` +
    `• {{node.NODE_ID.branch}} - Branch taken`,
}

/**
 * Trigger node schemas
 */
export const triggerSchemas: Record<string, NodeConfigSchema> = {
  manual: {
    nodeType: 'trigger:manual',
    title: 'Manual Trigger',
    description: 'Manually triggered flow execution',
    icon: 'Play',
    color: 'amber',
    category: 'trigger',
    fields: [
      {
        name: 'description',
        label: 'Description',
        type: 'text',
        placeholder: 'Describe this trigger',
        helpText: 'Optional description for this manual trigger',
      },
    ],
    outputs: [
      { name: 'triggeredAt', type: 'string', description: 'ISO timestamp when triggered' },
      { name: 'triggerType', type: 'string', description: 'Always "manual"' },
      { name: 'userId', type: 'string', description: 'User who triggered the flow' },
    ],
    outputsHelp: 'Use {{node.NODE_ID.triggeredAt}} to get when this flow was triggered.',
  },
  schedule: {
    nodeType: 'trigger:schedule',
    title: 'Schedule Trigger',
    description: 'Time-based scheduled execution',
    icon: 'Clock',
    color: 'amber',
    category: 'trigger',
    fields: [
      {
        name: 'schedule',
        label: 'Cron Expression',
        type: 'cron',
        placeholder: '0 9 * * *',
        helpText: 'e.g., 0 9 * * * (daily at 9 AM)',
        validation: { required: true },
      },
      {
        name: 'timezone',
        label: 'Timezone',
        type: 'select',
        defaultValue: 'UTC',
        options: [
          { value: 'UTC', label: 'UTC' },
          { value: 'America/New_York', label: 'Eastern Time' },
          { value: 'America/Los_Angeles', label: 'Pacific Time' },
          { value: 'Europe/London', label: 'London' },
          { value: 'Asia/Singapore', label: 'Singapore' },
          { value: 'Asia/Jakarta', label: 'Jakarta (WIB)' },
        ],
      },
    ],
    outputs: [
      { name: 'triggeredAt', type: 'string', description: 'ISO timestamp when scheduled trigger fired' },
      { name: 'triggerType', type: 'string', description: 'Always "schedule"' },
      { name: 'schedule', type: 'string', description: 'The cron expression' },
      { name: 'timezone', type: 'string', description: 'Timezone used' },
      { name: 'nextRun', type: 'string', description: 'Next scheduled run time' },
    ],
    outputsHelp: 'Use {{node.NODE_ID.triggeredAt}} to get the scheduled execution time.',
  },
  webhook: {
    nodeType: 'trigger:webhook',
    title: 'Webhook Trigger',
    description: 'HTTP webhook endpoint',
    icon: 'Globe',
    color: 'amber',
    category: 'trigger',
    fields: [
      {
        name: 'path',
        label: 'Webhook Path',
        type: 'text',
        placeholder: '/webhook/my-endpoint',
        validation: { required: true },
        helpText: 'URL path for this webhook (e.g., /my-webhook)',
      },
      {
        name: 'method',
        label: 'HTTP Method',
        type: 'select',
        defaultValue: 'POST',
        options: [
          { value: 'POST', label: 'POST' },
          { value: 'GET', label: 'GET' },
          { value: 'PUT', label: 'PUT' },
        ],
      },
      {
        name: 'secret',
        label: 'Secret',
        type: 'text',
        placeholder: 'Webhook secret for validation',
        helpText: 'Optional secret for webhook signature validation',
      },
    ],
    outputs: [
      { name: 'triggeredAt', type: 'string', description: 'ISO timestamp when webhook received' },
      { name: 'method', type: 'string', description: 'HTTP method (GET, POST, PUT, etc.)' },
      { name: 'headers', type: 'object', description: 'Request headers', example: '{{node.NODE_ID.headers.Authorization}}' },
      { name: 'query', type: 'object', description: 'URL query parameters', example: '{{node.NODE_ID.query.id}}' },
      { name: 'body', type: 'any', description: 'Request body (JSON parsed)', example: '{{node.NODE_ID.body.data}}' },
      { name: 'webhookPath', type: 'string', description: 'The webhook path that was called' },
      { name: 'authenticated', type: 'boolean', description: 'Whether auth succeeded' },
    ],
    outputsHelp:
      'Access webhook data:\n' +
      '• {{node.NODE_ID.body}} - Request body (JSON)\n' +
      '• {{node.NODE_ID.body.fieldName}} - Specific body field\n' +
      '• {{node.NODE_ID.query.paramName}} - Query parameter\n' +
      '• {{node.NODE_ID.headers.HeaderName}} - Request header',
  },
  message_received: {
    nodeType: 'trigger:message_received',
    title: 'Message Received',
    description: 'Triggered when a message is received',
    icon: 'MessageSquare',
    color: 'amber',
    category: 'trigger',
    fields: [
      {
        name: 'keywords',
        label: 'Keywords',
        type: 'text',
        placeholder: 'help, support, urgent',
        helpText: 'Comma-separated keywords to filter messages',
      },
      {
        name: 'conversationId',
        label: 'Conversation ID',
        type: 'text',
        helpText: 'Optional: Filter to specific conversation',
      },
    ],
    outputs: [
      { name: 'triggered', type: 'boolean', description: 'Always true when triggered' },
      { name: 'timestamp', type: 'string', description: 'When message was received' },
      { name: 'platform', type: 'string', description: 'Platform: whatsapp, telegram, email, etc.' },
      { name: 'message.id', type: 'string', description: 'Message ID' },
      { name: 'message.content', type: 'string', description: 'Message text content' },
      { name: 'message.from', type: 'string', description: 'Sender phone/ID' },
      { name: 'message.conversationId', type: 'string', description: 'Conversation ID' },
      { name: 'message.contentType', type: 'string', description: 'Content type (text, image, etc.)' },
      { name: 'message.mediaUrl', type: 'string', description: 'URL of media attachment' },
      { name: 'sender', type: 'string', description: 'Sender identifier' },
      { name: 'matchedFilters', type: 'array', description: 'Which filters matched' },
    ],
    outputsHelp:
      'Access message data in later nodes:\n' +
      '• {{input.message}} or {{triggerMessage}} - Message content\n' +
      '• {{input.from}} or {{triggerPhone}} - Sender phone\n' +
      '• {{input.platform}} - Platform name\n' +
      '• {{input.mediaUrl}} - Media URL (if any)\n' +
      '• {{node.NODE_ID.message.content}} - Full path syntax',
  },
}

/**
 * AI node schemas
 */
export const aiSchemas: Record<string, NodeConfigSchema> = {
  ai_response: {
    nodeType: 'ai:response',
    title: 'AI Response',
    description: 'Generate AI response using selected model',
    icon: 'Sparkles',
    color: 'violet',
    category: 'ai',
    fields: [
      {
        name: 'provider',
        label: 'Provider',
        type: 'provider',
        helpText:
          'Select provider:\n' +
          '• Task Routing - Auto-select based on task complexity\n' +
          '• Auto-select - Use default provider\n' +
          '• Or choose a specific configured provider',
      },
      {
        name: 'model',
        label: 'Model',
        type: 'model',
        placeholder: 'Select or enter model...',
        validation: { required: true },
      },
      {
        name: 'systemPrompt',
        label: 'System Prompt',
        type: 'textarea',
        placeholder: 'You are a helpful assistant...',
        rows: 3,
      },
      {
        name: 'userMessage',
        label: 'User Message',
        type: 'variable',
        placeholder: '{{input.message}}',
        showVariablePicker: true,
        helpText: 'Use {{input.message}} for trigger message, or {{node.NODE_ID.content}} for previous AI output',
      },
    ],
    advanced: [
      {
        name: 'temperature',
        label: 'Temperature',
        type: 'slider',
        defaultValue: 0.7,
        validation: { min: 0, max: 2 },
        helpText: 'Controls randomness (0 = deterministic, 1 = creative)',
      },
      {
        name: 'maxTokens',
        label: 'Max Tokens',
        type: 'number',
        defaultValue: 4096,
        validation: { min: 1, max: 128000 },
      },
      {
        name: 'useMemory',
        label: 'Use Conversation Memory',
        type: 'boolean',
        defaultValue: true,
      },
      {
        name: 'saveToMemory',
        label: 'Save to Memory',
        type: 'boolean',
        defaultValue: true,
      },
    ],
    outputs: [
      { name: 'content', type: 'string', description: 'AI generated response text', example: '{{node.NODE_ID.content}}' },
      { name: 'model', type: 'string', description: 'Model that was used' },
      { name: 'provider', type: 'string', description: 'Provider that was used' },
      { name: 'tier', type: 'string', description: 'Task tier classification (if Task Routing used)' },
      { name: 'usage', type: 'object', description: 'Token usage stats' },
      { name: 'messages', type: 'number', description: 'Number of messages sent' },
      { name: 'completedAt', type: 'string', description: 'ISO timestamp' },
    ],
    outputsHelp:
      'Get AI response in later nodes:\n' +
      '• {{node.NODE_ID.content}} - The AI response text\n' +
      '• {{previousOutput}} - Shorthand (auto-extracts content)\n' +
      '• {{node.NODE_ID.model}} - Model used\n' +
      '• {{node.NODE_ID.provider}} - Provider used',
  },
  ai_classify: {
    nodeType: 'ai:classify',
    title: 'Classify Intent',
    description: 'Classify text into predefined categories',
    icon: 'Tag',
    color: 'violet',
    category: 'ai',
    fields: [
      {
        name: 'provider',
        label: 'Provider',
        type: 'provider',
        helpText: 'Select Task Routing for auto tier-based selection',
      },
      {
        name: 'model',
        label: 'Model',
        type: 'model',
        validation: { required: true },
      },
      {
        name: 'text',
        label: 'Text to Classify',
        type: 'variable',
        placeholder: '{{input.message}}',
        validation: { required: true },
        showVariablePicker: true,
        helpText: 'Text to analyze. Use {{input.message}} for trigger message.',
      },
      {
        name: 'categories',
        label: 'Categories',
        type: 'textarea',
        placeholder: 'support\nsales\nbilling\ngeneral',
        helpText: 'One category per line',
        validation: { required: true },
      },
    ],
    advanced: [
      {
        name: 'multiLabel',
        label: 'Allow Multiple Labels',
        type: 'boolean',
        defaultValue: false,
      },
      {
        name: 'returnConfidence',
        label: 'Return Confidence Scores',
        type: 'boolean',
        defaultValue: true,
      },
    ],
    outputs: [
      { name: 'text', type: 'string', description: 'Original text that was classified' },
      { name: 'intents', type: 'array', description: 'Array of {category, confidence, reasoning}' },
      { name: 'primaryIntent', type: 'object', description: 'Top intent with highest confidence' },
      { name: 'primaryIntent.category', type: 'string', description: 'Category name', example: '{{node.NODE_ID.primaryIntent.category}}' },
      { name: 'primaryIntent.confidence', type: 'number', description: 'Confidence score 0-1' },
      { name: 'allCategories', type: 'array', description: 'All available categories' },
      { name: 'entities', type: 'array', description: 'Extracted entities (if enabled)' },
      { name: 'classifiedAt', type: 'string', description: 'ISO timestamp' },
    ],
    outputsHelp:
      'Get classification results:\n' +
      '• {{node.NODE_ID.primaryIntent.category}} - Top category\n' +
      '• {{node.NODE_ID.primaryIntent.confidence}} - Confidence (0-1)\n' +
      '• {{node.NODE_ID.intents}} - All intents array\n' +
      'Use with Condition node to branch based on category.',
  },
  ai_translate: {
    nodeType: 'ai:translate',
    title: 'Translate',
    description: 'Translate text between languages',
    icon: 'Languages',
    color: 'violet',
    category: 'ai',
    fields: [
      {
        name: 'text',
        label: 'Text to Translate',
        type: 'variable',
        placeholder: '{{input.message}}',
        validation: { required: true },
        showVariablePicker: true,
        helpText: 'Text to translate. Use {{input.message}} or {{node.NODE_ID.content}}',
      },
      {
        name: 'sourceLang',
        label: 'Source Language',
        type: 'select',
        defaultValue: 'auto',
        options: [
          { value: 'auto', label: 'Auto-detect' },
          { value: 'en', label: 'English' },
          { value: 'es', label: 'Spanish' },
          { value: 'fr', label: 'French' },
          { value: 'de', label: 'German' },
          { value: 'zh', label: 'Chinese' },
          { value: 'ja', label: 'Japanese' },
          { value: 'id', label: 'Indonesian' },
          { value: 'ar', label: 'Arabic' },
          { value: 'ko', label: 'Korean' },
        ],
      },
      {
        name: 'targetLang',
        label: 'Target Language',
        type: 'select',
        validation: { required: true },
        options: [
          { value: 'en', label: 'English' },
          { value: 'es', label: 'Spanish' },
          { value: 'fr', label: 'French' },
          { value: 'de', label: 'German' },
          { value: 'zh', label: 'Chinese' },
          { value: 'ja', label: 'Japanese' },
          { value: 'id', label: 'Indonesian' },
          { value: 'ar', label: 'Arabic' },
          { value: 'ko', label: 'Korean' },
        ],
      },
    ],
    outputs: [
      { name: 'translatedText', type: 'string', description: 'Translated text', example: '{{node.NODE_ID.translatedText}}' },
      { name: 'originalText', type: 'string', description: 'Original text (if includeOriginal)' },
      { name: 'sourceLanguage', type: 'string', description: 'Detected or specified source language' },
      { name: 'targetLanguage', type: 'string', description: 'Target language' },
      { name: 'provider', type: 'string', description: 'AI provider used' },
      { name: 'model', type: 'string', description: 'AI model used' },
      { name: 'executedAt', type: 'string', description: 'ISO timestamp' },
    ],
    outputsHelp:
      'Get translated text:\n' +
      '• {{node.NODE_ID.translatedText}} - Translated result\n' +
      '• {{previousOutput}} - Shorthand for translation',
  },
  ai_summarize: {
    nodeType: 'ai:summarize',
    title: 'Summarize',
    description: 'Summarize text content',
    icon: 'FileText',
    color: 'violet',
    category: 'ai',
    fields: [
      {
        name: 'text',
        label: 'Text to Summarize',
        type: 'variable',
        placeholder: '{{input.content}}',
        validation: { required: true },
        showVariablePicker: true,
        helpText: 'Long text to summarize. Use {{input.message}} or {{node.NODE_ID.content}}',
      },
      {
        name: 'style',
        label: 'Summary Style',
        type: 'select',
        defaultValue: 'brief',
        options: [
          { value: 'brief', label: 'Brief (1-2 sentences)' },
          { value: 'detailed', label: 'Detailed (paragraph)' },
          { value: 'bullets', label: 'Bullet Points' },
          { value: 'executive', label: 'Executive Summary' },
        ],
      },
      {
        name: 'maxLength',
        label: 'Max Length (words)',
        type: 'number',
        defaultValue: 100,
      },
    ],
    outputs: [
      { name: 'summary', type: 'string', description: 'Generated summary text', example: '{{node.NODE_ID.summary}}' },
      { name: 'length', type: 'string', description: 'Summary length (short/medium/long)' },
      { name: 'format', type: 'string', description: 'Summary format (paragraph/bullets)' },
      { name: 'originalLength', type: 'number', description: 'Original text length in chars' },
      { name: 'summaryLength', type: 'number', description: 'Summary length in chars' },
      { name: 'compressionRatio', type: 'number', description: 'Compression ratio (0-100%)' },
      { name: 'executedAt', type: 'string', description: 'ISO timestamp' },
    ],
    outputsHelp:
      'Get summary:\n' +
      '• {{node.NODE_ID.summary}} - The summary text\n' +
      '• {{previousOutput}} - Shorthand for summary\n' +
      '• {{node.NODE_ID.compressionRatio}} - How much was compressed',
  },
}

/**
 * Logic node schemas
 */
export const logicSchemas: Record<string, NodeConfigSchema> = {
  condition: {
    nodeType: 'logic:condition',
    title: 'Condition',
    description: 'Branch based on conditions',
    icon: 'GitBranch',
    color: 'emerald',
    category: 'logic',
    fields: [
      {
        name: 'field',
        label: 'Field to Check',
        type: 'variable',
        placeholder: '{{node.previous.value}}',
        showVariablePicker: true,
        helpText:
          'Value to evaluate. Examples:\n' +
          '• {{node.NODE_ID.primaryIntent.category}} - Classification result\n' +
          '• {{input.platform}} - Message platform\n' +
          '• {{node.NODE_ID.content}} - AI response',
      },
      {
        name: 'operator',
        label: 'Operator',
        type: 'select',
        options: [
          { value: 'equals', label: 'Equals' },
          { value: 'not_equals', label: 'Not Equals' },
          { value: 'contains', label: 'Contains' },
          { value: 'not_contains', label: 'Not Contains' },
          { value: 'greater_than', label: 'Greater Than' },
          { value: 'less_than', label: 'Less Than' },
          { value: 'is_empty', label: 'Is Empty' },
          { value: 'is_not_empty', label: 'Is Not Empty' },
          { value: 'matches', label: 'Matches Regex' },
          { value: 'startsWith', label: 'Starts With' },
          { value: 'endsWith', label: 'Ends With' },
        ],
      },
      {
        name: 'value',
        label: 'Compare Value',
        type: 'variable',
        showVariablePicker: true,
        hideWhen: {
          field: 'operator',
          operator: 'in',
          value: ['is_empty', 'is_not_empty'],
        },
        helpText: 'Value to compare against. Can be static or variable.',
      },
    ],
    outputs: [
      { name: 'condition.left', type: 'any', description: 'Left value evaluated' },
      { name: 'condition.operator', type: 'string', description: 'Operator used' },
      { name: 'condition.right', type: 'any', description: 'Right value evaluated' },
      { name: 'result', type: 'boolean', description: 'Condition result (true/false)' },
      { name: 'branch', type: 'string', description: 'Branch taken ("true" or "false")' },
    ],
    outputsHelp:
      'Check condition result:\n' +
      '• {{node.NODE_ID.result}} - true or false\n' +
      '• {{node.NODE_ID.branch}} - "true" or "false"',
  },
  loop: {
    nodeType: 'logic:loop',
    title: 'Loop',
    description: 'Iterate over array items',
    icon: 'Repeat',
    color: 'emerald',
    category: 'logic',
    fields: [
      {
        name: 'items',
        label: 'Items Array',
        type: 'variable',
        placeholder: '{{node.previous.items}}',
        validation: { required: true },
        helpText:
          'Array to iterate over. Examples:\n' +
          '• {{node.NODE_ID.results}} - Query results\n' +
          '• {{var.contacts}} - Variable array',
        showVariablePicker: true,
      },
      {
        name: 'itemVariable',
        label: 'Item Variable Name',
        type: 'text',
        defaultValue: 'item',
        helpText: 'Access each item inside loop as {{item}} or {{var.item}}',
      },
      {
        name: 'indexVariable',
        label: 'Index Variable Name',
        type: 'text',
        defaultValue: 'index',
        helpText: 'Access current index as {{index}} or {{var.index}}',
      },
      {
        name: 'maxIterations',
        label: 'Max Iterations',
        type: 'number',
        defaultValue: 100,
        helpText: 'Prevent infinite loops (safety limit)',
      },
    ],
    outputs: [
      { name: 'loopType', type: 'string', description: 'Type of loop (forEach/while/count)' },
      { name: 'currentItem', type: 'any', description: 'Current/last item processed' },
      { name: 'currentIndex', type: 'number', description: 'Current/last iteration index (0-based)' },
      { name: 'totalIterations', type: 'number', description: 'Total iterations executed' },
      { name: 'completed', type: 'boolean', description: 'Whether loop completed successfully' },
      { name: 'items', type: 'number', description: 'Number of items in source array' },
    ],
    outputsHelp:
      'Inside loop body:\n' +
      '• {{item}} - Current item\n' +
      '• {{index}} - Current index (0-based)\n' +
      '\nAfter loop:\n' +
      '• {{node.NODE_ID.totalIterations}} - How many iterations ran\n' +
      '• {{node.NODE_ID.completed}} - Success status',
  },
  switch: {
    nodeType: 'logic:switch',
    title: 'Switch',
    description: 'Multi-way branch based on value',
    icon: 'Split',
    color: 'emerald',
    category: 'logic',
    fields: [
      {
        name: 'value',
        label: 'Value to Switch On',
        type: 'variable',
        placeholder: '{{node.previous.status}}',
        validation: { required: true },
        showVariablePicker: true,
        helpText:
          'Value to match against cases. Common examples:\n' +
          '• {{node.NODE_ID.primaryIntent.category}} - Intent category\n' +
          '• {{input.platform}} - Message platform',
      },
      {
        name: 'cases',
        label: 'Cases',
        type: 'json',
        placeholder: '{"approved": "branch_a", "rejected": "branch_b"}',
        validation: { required: true },
        helpText: 'Map values to branch outputs',
      },
      {
        name: 'defaultBranch',
        label: 'Default Branch',
        type: 'text',
        defaultValue: 'default',
        helpText: 'Branch when no case matches',
      },
    ],
    outputs: [
      { name: 'matchedCase', type: 'string', description: 'Which case matched' },
      { name: 'branch', type: 'string', description: 'Branch name to follow' },
      { name: 'value', type: 'any', description: 'The value that was evaluated' },
    ],
    outputsHelp: '• {{node.NODE_ID.matchedCase}} - The case that matched\n• {{node.NODE_ID.branch}} - Branch taken',
  },
  delay: {
    nodeType: 'logic:delay',
    title: 'Delay',
    description: 'Wait for specified duration',
    icon: 'Timer',
    color: 'emerald',
    category: 'logic',
    fields: [
      {
        name: 'duration',
        label: 'Duration',
        type: 'number',
        defaultValue: 1,
        validation: { required: true, min: 0 },
      },
      {
        name: 'unit',
        label: 'Unit',
        type: 'select',
        defaultValue: 'seconds',
        options: [
          { value: 'seconds', label: 'Seconds' },
          { value: 'minutes', label: 'Minutes' },
          { value: 'hours', label: 'Hours' },
        ],
      },
    ],
    outputs: [
      { name: 'delayedMs', type: 'number', description: 'Actual delay in milliseconds' },
      { name: 'startedAt', type: 'string', description: 'When delay started' },
      { name: 'completedAt', type: 'string', description: 'When delay completed' },
    ],
    outputsHelp: '• {{node.NODE_ID.delayedMs}} - Actual delay duration in ms',
  },
  set_variable: {
    nodeType: 'logic:set_variable',
    title: 'Set Variable',
    description: 'Store a value in a variable',
    icon: 'Variable',
    color: 'emerald',
    category: 'logic',
    fields: [
      {
        name: 'variableName',
        label: 'Variable Name',
        type: 'text',
        placeholder: 'myVariable',
        validation: { required: true },
        helpText: 'Name to reference as {{var.myVariable}} in later nodes',
      },
      {
        name: 'value',
        label: 'Value',
        type: 'variable',
        placeholder: '{{node.previous.output}}',
        showVariablePicker: true,
        helpText:
          'Value to store. Can be:\n' +
          '• Static value: "hello"\n' +
          '• Variable: {{node.NODE_ID.content}}\n' +
          '• Expression: {{input.message}}',
      },
    ],
    outputs: [
      { name: 'variableName', type: 'string', description: 'The variable name that was set' },
      { name: 'value', type: 'any', description: 'The value that was stored' },
      { name: 'previousValue', type: 'any', description: 'Previous value (if variable existed)' },
    ],
    outputsHelp:
      'After setting a variable:\n' +
      '• {{var.myVariable}} - Access the stored value\n' +
      '• {{variables.myVariable}} - Alternative syntax',
  },
}

/**
 * Action node schemas
 */
export const actionSchemas: Record<string, NodeConfigSchema> = {
  send_message: {
    nodeType: 'action:send_message',
    title: 'Send Message',
    description: 'Send a message to a conversation',
    icon: 'Send',
    color: 'blue',
    category: 'action',
    fields: [
      {
        name: 'conversationId',
        label: 'Conversation ID',
        type: 'variable',
        placeholder: '{{input.conversationId}}',
        showVariablePicker: true,
        helpText: 'Use {{input.conversationId}} to reply to trigger conversation',
      },
      {
        name: 'content',
        label: 'Message Content',
        type: 'textarea',
        placeholder: 'Enter message...',
        validation: { required: true },
        rows: 3,
        helpText:
          'Message to send. Examples:\n' +
          '• {{node.NODE_ID.content}} - AI response\n' +
          '• {{node.NODE_ID.translatedText}} - Translation\n' +
          '• {{previousOutput}} - Last node output',
      },
      {
        name: 'senderType',
        label: 'Sender Type',
        type: 'select',
        defaultValue: 'agent',
        options: [
          { value: 'system', label: 'System' },
          { value: 'agent', label: 'Agent' },
        ],
      },
    ],
    outputs: [
      { name: 'channel', type: 'string', description: 'Channel used (whatsapp, telegram, etc.)' },
      { name: 'recipient', type: 'string', description: 'Message recipient' },
      { name: 'messageId', type: 'string', description: 'Platform-specific message ID' },
      { name: 'status', type: 'string', description: 'Send status (sent, failed)' },
      { name: 'platform', type: 'string', description: 'Platform identifier' },
      { name: 'messageLength', type: 'number', description: 'Message length in chars' },
      { name: 'sentAt', type: 'string', description: 'ISO timestamp when sent' },
    ],
    outputsHelp:
      '• {{node.NODE_ID.messageId}} - Sent message ID\n' +
      '• {{node.NODE_ID.status}} - "sent" or "failed"\n' +
      '• {{node.NODE_ID.sentAt}} - Timestamp',
  },
  http_request: {
    nodeType: 'action:http_request',
    title: 'HTTP Request',
    description: 'Make an HTTP API request',
    icon: 'Globe',
    color: 'blue',
    category: 'action',
    fields: [
      {
        name: 'method',
        label: 'Method',
        type: 'select',
        defaultValue: 'GET',
        options: [
          { value: 'GET', label: 'GET' },
          { value: 'POST', label: 'POST' },
          { value: 'PUT', label: 'PUT' },
          { value: 'DELETE', label: 'DELETE' },
          { value: 'PATCH', label: 'PATCH' },
        ],
      },
      {
        name: 'url',
        label: 'URL',
        type: 'variable',
        placeholder: 'https://api.example.com/endpoint',
        validation: { required: true },
        showVariablePicker: true,
        helpText: 'API endpoint URL. Can include variables: https://api.example.com/users/{{var.userId}}',
      },
      {
        name: 'headers',
        label: 'Headers',
        type: 'json',
        placeholder: '{"Authorization": "Bearer {{var.token}}"}',
        helpText: 'Request headers as JSON. Variables supported.',
      },
      {
        name: 'body',
        label: 'Body',
        type: 'json',
        placeholder: '{"key": "value"}',
        showWhen: {
          field: 'method',
          operator: 'in',
          value: ['POST', 'PUT', 'PATCH'],
        },
        helpText: 'Request body as JSON. Use {{node.NODE_ID.content}} to send AI response.',
      },
    ],
    advanced: [
      {
        name: 'timeout',
        label: 'Timeout (ms)',
        type: 'number',
        defaultValue: 30000,
      },
    ],
    outputs: [
      { name: 'statusCode', type: 'number', description: 'HTTP response status code' },
      { name: 'headers', type: 'object', description: 'Response headers' },
      { name: 'body', type: 'any', description: 'Response body (parsed JSON if applicable)', example: '{{node.NODE_ID.body.data}}' },
      { name: 'success', type: 'boolean', description: 'Whether request succeeded (2xx status)' },
      { name: 'duration', type: 'number', description: 'Request duration in ms' },
    ],
    outputsHelp:
      'Access HTTP response:\n' +
      '• {{node.NODE_ID.body}} - Response body (parsed JSON)\n' +
      '• {{node.NODE_ID.body.fieldName}} - Specific field\n' +
      '• {{node.NODE_ID.statusCode}} - HTTP status code\n' +
      '• {{node.NODE_ID.success}} - true if 2xx',
  },
  subflow: {
    nodeType: 'action:subflow',
    title: 'Subflow',
    description: 'Execute another flow',
    icon: 'Workflow',
    color: 'blue',
    category: 'action',
    fields: [
      {
        name: 'flowId',
        label: 'Flow ID',
        type: 'text',
        validation: { required: true },
        placeholder: 'Enter flow ID to execute',
      },
      {
        name: 'input',
        label: 'Input Data',
        type: 'json',
        placeholder: '{"message": "{{input.message}}"}',
        helpText: 'Data to pass to the subflow. Available as {{input.*}} in subflow.',
      },
      {
        name: 'waitForCompletion',
        label: 'Wait for Completion',
        type: 'boolean',
        defaultValue: true,
      },
      {
        name: 'timeout',
        label: 'Timeout (ms)',
        type: 'number',
        defaultValue: 60000,
      },
    ],
    outputs: [
      { name: 'flowId', type: 'string', description: 'ID of subflow that was executed' },
      { name: 'executionId', type: 'string', description: 'Execution ID for tracking' },
      { name: 'result', type: 'any', description: 'Subflow result (if waitForCompletion)', example: '{{node.NODE_ID.result}}' },
      { name: 'status', type: 'string', description: 'Execution status' },
      { name: 'duration', type: 'number', description: 'Execution time in ms' },
    ],
    outputsHelp:
      '• {{node.NODE_ID.result}} - Subflow output data\n' +
      '• {{node.NODE_ID.status}} - completed/failed/timeout',
  },
}

/**
 * Swarm node schemas
 */
export const swarmSchemas: Record<string, NodeConfigSchema> = {
  agent_query: {
    nodeType: 'swarm:agent_query',
    title: 'Agent Query',
    description: 'Query a specific agent or find the best match',
    icon: 'Bot',
    color: 'cyan',
    category: 'swarm',
    fields: [
      {
        name: 'agentId',
        label: 'Agent ID',
        type: 'text',
        helpText: 'Leave empty to auto-select best agent',
      },
      {
        name: 'prompt',
        label: 'Query Prompt',
        type: 'variable',
        placeholder: '{{input.message}}',
        showVariablePicker: true,
        helpText: 'Question or task for the agent',
      },
      {
        name: 'preferBestMatch',
        label: 'Auto-select Best Agent',
        type: 'boolean',
        defaultValue: true,
      },
    ],
    outputs: [
      { name: 'agentId', type: 'string', description: 'ID of agent that responded' },
      { name: 'agentName', type: 'string', description: 'Name of agent' },
      { name: 'response', type: 'string', description: 'Agent response', example: '{{node.NODE_ID.response}}' },
      { name: 'confidence', type: 'number', description: 'Response confidence (0-1)' },
      { name: 'duration', type: 'number', description: 'Query duration in ms' },
    ],
    outputsHelp:
      '• {{node.NODE_ID.response}} - Agent response\n' +
      '• {{node.NODE_ID.agentName}} - Which agent responded\n' +
      '• {{previousOutput}} - Shorthand for response',
  },
  swarm_broadcast: {
    nodeType: 'swarm:broadcast',
    title: 'Broadcast',
    description: 'Broadcast message to multiple agents',
    icon: 'Radio',
    color: 'cyan',
    category: 'swarm',
    fields: [
      {
        name: 'message',
        label: 'Broadcast Message',
        type: 'variable',
        showVariablePicker: true,
        helpText: 'Message to broadcast to all selected agents',
      },
      {
        name: 'agentIds',
        label: 'Agent IDs',
        type: 'text',
        helpText: 'Comma-separated, or empty for all',
      },
      {
        name: 'priority',
        label: 'Priority',
        type: 'select',
        defaultValue: 'normal',
        options: [
          { value: 'low', label: 'Low' },
          { value: 'normal', label: 'Normal' },
          { value: 'high', label: 'High' },
          { value: 'urgent', label: 'Urgent' },
        ],
      },
    ],
    outputs: [
      { name: 'broadcastId', type: 'string', description: 'Broadcast message ID' },
      { name: 'agentCount', type: 'number', description: 'Number of agents reached' },
      { name: 'responses', type: 'array', description: 'Array of agent responses' },
      { name: 'broadcastedAt', type: 'string', description: 'ISO timestamp' },
    ],
    outputsHelp:
      '• {{node.NODE_ID.agentCount}} - How many agents received\n' +
      '• {{node.NODE_ID.responses}} - All responses array',
  },
  swarm_consensus: {
    nodeType: 'swarm:consensus',
    title: 'Consensus',
    description: 'Get consensus from multiple agents',
    icon: 'Vote',
    color: 'cyan',
    category: 'swarm',
    fields: [
      {
        name: 'question',
        label: 'Question for Voting',
        type: 'variable',
        showVariablePicker: true,
        helpText: 'Question for agents to vote on',
      },
      {
        name: 'options',
        label: 'Options',
        type: 'text',
        placeholder: 'approve, reject',
        helpText: 'Comma-separated voting options',
      },
      {
        name: 'agentIds',
        label: 'Voting Agents',
        type: 'text',
        helpText: 'Comma-separated agent IDs',
      },
      {
        name: 'threshold',
        label: 'Consensus Threshold (%)',
        type: 'number',
        defaultValue: 66,
        validation: { min: 1, max: 100 },
        helpText: 'Percentage of votes needed for consensus',
      },
      {
        name: 'timeout',
        label: 'Timeout (ms)',
        type: 'number',
        defaultValue: 60000,
      },
    ],
    outputs: [
      { name: 'consensus', type: 'boolean', description: 'Whether consensus was reached' },
      { name: 'winner', type: 'string', description: 'Winning option (if consensus)', example: '{{node.NODE_ID.winner}}' },
      { name: 'votes', type: 'object', description: 'Vote counts per option' },
      { name: 'voterCount', type: 'number', description: 'Number of agents that voted' },
      { name: 'threshold', type: 'number', description: 'Threshold used' },
      { name: 'percentage', type: 'number', description: 'Winning percentage' },
    ],
    outputsHelp:
      '• {{node.NODE_ID.consensus}} - true if consensus reached\n' +
      '• {{node.NODE_ID.winner}} - The winning option\n' +
      '• {{node.NODE_ID.percentage}} - Winning vote percentage',
  },
}

/**
 * MCP node schemas
 */
export const mcpSchemas: Record<string, NodeConfigSchema> = {
  mcp_tool: {
    nodeType: 'mcp:tool',
    title: 'MCP Tool',
    description: 'Call an MCP server tool',
    icon: 'Plug',
    color: 'pink',
    category: 'mcp',
    fields: [
      {
        name: 'mcpToolConfig',
        label: 'MCP Tool Configuration',
        type: 'mcp_tool',
        validation: { required: true },
        helpText: 'Select MCP server and tool to call',
      },
      {
        name: 'inputMapping',
        label: 'Input Mapping',
        type: 'json',
        placeholder: '{"query": "{{input.message}}", "limit": 100}',
        helpText: 'Map flow variables to tool inputs',
      },
      {
        name: 'outputVariable',
        label: 'Output Variable',
        type: 'text',
        defaultValue: 'mcpResult',
        helpText: 'Store result in {{var.mcpResult}}',
      },
      {
        name: 'timeout',
        label: 'Timeout (ms)',
        type: 'number',
        defaultValue: 30000,
      },
    ],
    outputs: [
      { name: 'result', type: 'any', description: 'Tool execution result', example: '{{node.NODE_ID.result}}' },
      { name: 'server', type: 'string', description: 'MCP server name' },
      { name: 'tool', type: 'string', description: 'Tool name that was called' },
      { name: 'success', type: 'boolean', description: 'Whether tool succeeded' },
      { name: 'duration', type: 'number', description: 'Execution time in ms' },
    ],
    outputsHelp:
      '• {{node.NODE_ID.result}} - Tool result data\n' +
      '• {{var.mcpResult}} - If outputVariable set\n' +
      '• {{node.NODE_ID.success}} - Success status',
  },
}

/**
 * All node schemas combined
 */
export const allNodeSchemas: Record<string, NodeConfigSchema> = {
  ...triggerSchemas,
  ...aiSchemas,
  ...logicSchemas,
  ...actionSchemas,
  ...swarmSchemas,
  ...mcpSchemas,
}

/**
 * Get schema for a node by its subtype
 */
export function getNodeSchema(subtype: string): NodeConfigSchema | undefined {
  return allNodeSchemas[subtype]
}

/**
 * Get all fields for a node (basic + advanced)
 */
export function getNodeFields(subtype: string): FieldDefinition[] {
  const schema = getNodeSchema(subtype)
  if (!schema) return []

  return [...(schema.fields || []), ...(schema.advanced || [])]
}

/**
 * Get output documentation for a node
 */
export function getNodeOutputs(subtype: string): NodeOutputDefinition[] | undefined {
  const schema = getNodeSchema(subtype)
  return schema?.outputs
}

/**
 * Get output help text for a node
 */
export function getNodeOutputsHelp(subtype: string): string | undefined {
  const schema = getNodeSchema(subtype)
  return schema?.outputsHelp
}
