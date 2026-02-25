/**
 * FlowSchemaRAG Service
 *
 * Self-updating RAG service for FlowBuilder node schemas.
 * On startup, checks and updates the knowledge library with current node schemas.
 * This allows AI to query RAG for node information instead of using a large static prompt.
 *
 * Structure:
 * - SWARM AI (parent library)
 *   └── FlowBuilder Schema (folder) - Node schemas for AI flow generation
 *   └── System Tools Schema (folder) - Future: System tools documentation
 *   └── ... (future folders)
 */

const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('../database.cjs');
const { logger } = require('../logger.cjs');
const { getRetrievalService } = require('../rag/RetrievalService.cjs');

// System user ID for schema library (uses admin or creates system user)
const SYSTEM_USER_ID = 'system';

// Parent library for all SWARM AI system schemas
const PARENT_LIBRARY_NAME = 'SWARM AI';
const PARENT_LIBRARY_DESCRIPTION = 'System-managed knowledge base for SwarmAI components';

// Folder for FlowBuilder schemas
const FOLDER_NAME = 'FlowBuilder Schema';
const FOLDER_DESCRIPTION = 'Auto-updated node schemas for AI flow generation';

// Schema format version - increment to force resync when formatSchemaDocument changes
const SCHEMA_FORMAT_VERSION = 5;

/**
 * Node schema definitions
 * This is the source of truth for FlowBuilder node configurations
 */
const NODE_SCHEMAS = {
  // ==================== TRIGGERS ====================
  'trigger:manual': {
    title: 'Manual Trigger',
    description: 'Manually triggered flow execution. Use as the default trigger for test flows.',
    category: 'trigger',
    config: {
      fields: [
        { name: 'description', type: 'text', required: false, help: 'Optional description' }
      ]
    },
    outputs: [
      { name: 'triggeredAt', type: 'string', description: 'ISO timestamp when triggered' },
      { name: 'triggerType', type: 'string', description: 'Always "manual"' },
      { name: 'userId', type: 'string', description: 'User who triggered the flow' }
    ],
    variableAccess: '{{node.NODE_ID.triggeredAt}}'
  },

  'trigger:schedule': {
    title: 'Schedule Trigger',
    description: 'Time-based scheduled execution using cron expressions.',
    category: 'trigger',
    config: {
      fields: [
        { name: 'schedule', type: 'cron', required: true, help: 'Cron expression (e.g., "0 9 * * *" for daily at 9 AM)' },
        { name: 'timezone', type: 'select', required: false, default: 'UTC', options: ['UTC', 'America/New_York', 'America/Los_Angeles', 'Europe/London', 'Asia/Singapore', 'Asia/Jakarta'] }
      ]
    },
    outputs: [
      { name: 'triggeredAt', type: 'string', description: 'ISO timestamp when scheduled trigger fired' },
      { name: 'schedule', type: 'string', description: 'The cron expression used' },
      { name: 'timezone', type: 'string', description: 'Timezone used' },
      { name: 'nextRun', type: 'string', description: 'Next scheduled run time' }
    ],
    variableAccess: '{{node.NODE_ID.triggeredAt}}, {{node.NODE_ID.nextRun}}'
  },

  'trigger:webhook': {
    title: 'Webhook Trigger',
    description: 'HTTP webhook endpoint that triggers the flow when called.',
    category: 'trigger',
    config: {
      fields: [
        { name: 'path', type: 'text', required: true, help: 'URL path (e.g., /my-webhook)' },
        { name: 'method', type: 'select', required: false, default: 'POST', options: ['POST', 'GET', 'PUT'] },
        { name: 'secret', type: 'text', required: false, help: 'Optional secret for signature validation' }
      ]
    },
    outputs: [
      { name: 'triggeredAt', type: 'string', description: 'ISO timestamp when webhook received' },
      { name: 'method', type: 'string', description: 'HTTP method (GET, POST, PUT)' },
      { name: 'headers', type: 'object', description: 'Request headers' },
      { name: 'query', type: 'object', description: 'URL query parameters' },
      { name: 'body', type: 'any', description: 'Request body (JSON parsed)' },
      { name: 'webhookPath', type: 'string', description: 'The webhook path called' }
    ],
    variableAccess: '{{node.NODE_ID.body}}, {{node.NODE_ID.body.fieldName}}, {{node.NODE_ID.query.param}}, {{node.NODE_ID.headers.Authorization}}'
  },

  'trigger:message_received': {
    title: 'Message Received',
    description: 'Triggered when a message is received from WhatsApp, Telegram, or Email.',
    category: 'trigger',
    config: {
      fields: [
        { name: 'keywords', type: 'text', required: false, help: 'Comma-separated keywords to filter messages' },
        { name: 'conversationId', type: 'text', required: false, help: 'Filter to specific conversation' }
      ]
    },
    outputs: [
      { name: 'triggered', type: 'boolean', description: 'Always true when triggered' },
      { name: 'timestamp', type: 'string', description: 'When message was received' },
      { name: 'platform', type: 'string', description: 'Platform: whatsapp, telegram, email' },
      { name: 'message.content', type: 'string', description: 'Message text content' },
      { name: 'message.from', type: 'string', description: 'Sender phone/ID' },
      { name: 'message.conversationId', type: 'string', description: 'Conversation ID' },
      { name: 'sender', type: 'string', description: 'Sender identifier' }
    ],
    variableAccess: '{{input.message}}, {{input.from}}, {{input.platform}}, {{input.conversationId}}, {{triggerMessage}}, {{triggerPhone}}',
    shorthandVariables: {
      '{{input.message}}': 'Message content',
      '{{input.from}}': 'Sender phone/ID',
      '{{input.platform}}': 'Platform name',
      '{{triggerMessage}}': 'Shorthand for message content',
      '{{triggerPhone}}': 'Shorthand for sender phone'
    }
  },

  'trigger:email_received': {
    title: 'Email Received',
    description: 'Triggered when a new email is received. Can filter by sender, subject, or folder.',
    category: 'trigger',
    config: {
      fields: [
        { name: 'folder', type: 'text', required: false, default: 'INBOX', help: 'Email folder to monitor' },
        { name: 'fromFilter', type: 'text', required: false, help: 'Filter by sender email address' },
        { name: 'subjectFilter', type: 'text', required: false, help: 'Filter by subject keywords' }
      ]
    },
    outputs: [
      { name: 'triggered', type: 'boolean', description: 'Always true when triggered' },
      { name: 'timestamp', type: 'string', description: 'When email was received' },
      { name: 'from', type: 'string', description: 'Sender email address' },
      { name: 'to', type: 'string', description: 'Recipient email address' },
      { name: 'subject', type: 'string', description: 'Email subject line' },
      { name: 'body', type: 'string', description: 'Email body content (text)' },
      { name: 'htmlBody', type: 'string', description: 'Email body content (HTML)' },
      { name: 'attachments', type: 'array', description: 'Array of attachment metadata' }
    ],
    variableAccess: '{{input.from}}, {{input.subject}}, {{input.body}}'
  },

  'trigger:event': {
    title: 'Event Trigger',
    description: 'Triggered by a system event (agent status change, swarm activity, etc.).',
    category: 'trigger',
    config: {
      fields: [
        { name: 'eventType', type: 'select', required: true, options: ['agent_status', 'swarm_task', 'conversation_created', 'custom'], help: 'Type of event to listen for' },
        { name: 'eventName', type: 'text', required: false, help: 'Custom event name (for custom event type)' },
        { name: 'filter', type: 'json', required: false, help: 'JSON filter criteria for event data' }
      ]
    },
    outputs: [
      { name: 'triggered', type: 'boolean', description: 'Always true when triggered' },
      { name: 'timestamp', type: 'string', description: 'When event occurred' },
      { name: 'eventType', type: 'string', description: 'Type of event that triggered' },
      { name: 'eventName', type: 'string', description: 'Event name' },
      { name: 'eventData', type: 'object', description: 'Full event payload data' }
    ],
    variableAccess: '{{input.eventType}}, {{input.eventData}}'
  },

  // ==================== AI NODES ====================
  'ai:response': {
    title: 'AI Response',
    description: 'Generate AI response using selected model. Main node for AI conversations.',
    category: 'ai',
    config: {
      fields: [
        { name: 'provider', type: 'provider', required: false, help: 'Task Routing (auto), Auto-select, or specific provider' },
        { name: 'model', type: 'model', required: true, help: 'AI model to use' },
        { name: 'systemPrompt', type: 'textarea', required: false, help: 'System instructions for the AI' },
        { name: 'userMessage', type: 'variable', required: true, help: 'Use {{input.message}} or {{node.NODE_ID.content}}' },
        { name: 'temperature', type: 'slider', required: false, default: 0.7, min: 0, max: 2, help: '0 = deterministic, 1 = creative' },
        { name: 'maxTokens', type: 'number', required: false, default: 4096 },
        { name: 'useMemory', type: 'boolean', required: false, default: true },
        { name: 'saveToMemory', type: 'boolean', required: false, default: true }
      ]
    },
    outputs: [
      { name: 'content', type: 'string', description: 'AI generated response text' },
      { name: 'model', type: 'string', description: 'Model that was used' },
      { name: 'provider', type: 'string', description: 'Provider that was used' },
      { name: 'tier', type: 'string', description: 'Task tier (if Task Routing)' },
      { name: 'usage', type: 'object', description: 'Token usage stats' }
    ],
    variableAccess: '{{node.NODE_ID.content}}, {{previousOutput}}'
  },

  'ai:rag_query': {
    title: 'RAG Query (Knowledge Base)',
    description: 'Query a knowledge base using RAG (Retrieval-Augmented Generation) before generating AI response. Use this when you need to include knowledge base information in your AI response.',
    category: 'ai',
    config: {
      fields: [
        { name: 'provider', type: 'provider', required: false, help: 'AI provider for generating response' },
        { name: 'model', type: 'model', required: false, help: 'AI model to use' },
        { name: 'libraryId', type: 'text', required: false, help: 'Knowledge library ID to query (leave empty to search all user libraries)' },
        { name: 'query', type: 'variable', required: true, help: 'Query text, e.g., {{input.message}}' },
        { name: 'systemPrompt', type: 'textarea', required: false, help: 'System instructions for the AI' },
        { name: 'maxResults', type: 'number', required: false, default: 5, help: 'Maximum number of RAG results to retrieve' },
        { name: 'minScore', type: 'number', required: false, default: 0.5, help: 'Minimum similarity score (0-1)' },
        { name: 'includeContext', type: 'boolean', required: false, default: true, help: 'Include RAG context in AI response' }
      ]
    },
    outputs: [
      { name: 'content', type: 'string', description: 'AI generated response with RAG context' },
      { name: 'ragResults', type: 'array', description: 'Array of retrieved documents from knowledge base' },
      { name: 'ragCount', type: 'number', description: 'Number of RAG results found' },
      { name: 'hasContext', type: 'boolean', description: 'Whether RAG context was found' },
      { name: 'model', type: 'string', description: 'Model used for response' }
    ],
    variableAccess: '{{node.NODE_ID.content}}, {{node.NODE_ID.ragResults}}, {{node.NODE_ID.hasContext}}'
  },

  'ai:classify': {
    title: 'Classify Intent',
    description: 'Classify text into predefined categories with confidence scores.',
    category: 'ai',
    config: {
      fields: [
        { name: 'provider', type: 'provider', required: false },
        { name: 'model', type: 'model', required: true },
        { name: 'text', type: 'variable', required: true, help: 'Text to classify, e.g., {{input.message}}' },
        { name: 'categories', type: 'textarea', required: true, help: 'One category per line: support\\nsales\\nbilling' },
        { name: 'multiLabel', type: 'boolean', required: false, default: false },
        { name: 'returnConfidence', type: 'boolean', required: false, default: true }
      ]
    },
    outputs: [
      { name: 'text', type: 'string', description: 'Original text classified' },
      { name: 'intents', type: 'array', description: 'Array of {category, confidence, reasoning}' },
      { name: 'primaryIntent.category', type: 'string', description: 'Top category' },
      { name: 'primaryIntent.confidence', type: 'number', description: 'Confidence 0-1' },
      { name: 'allCategories', type: 'array', description: 'All available categories' }
    ],
    variableAccess: '{{node.NODE_ID.primaryIntent.category}}, {{node.NODE_ID.primaryIntent.confidence}}'
  },

  'ai:translate': {
    title: 'Translate',
    description: 'Translate text between languages.',
    category: 'ai',
    config: {
      fields: [
        { name: 'text', type: 'variable', required: true, help: 'Text to translate' },
        { name: 'sourceLang', type: 'select', required: false, default: 'auto', options: ['auto', 'en', 'es', 'fr', 'de', 'zh', 'ja', 'id', 'ar', 'ko'] },
        { name: 'targetLang', type: 'select', required: true, options: ['en', 'es', 'fr', 'de', 'zh', 'ja', 'id', 'ar', 'ko'] }
      ]
    },
    outputs: [
      { name: 'translatedText', type: 'string', description: 'Translated text' },
      { name: 'originalText', type: 'string', description: 'Original text' },
      { name: 'sourceLanguage', type: 'string', description: 'Detected/specified source' },
      { name: 'targetLanguage', type: 'string', description: 'Target language' }
    ],
    variableAccess: '{{node.NODE_ID.translatedText}}'
  },

  'ai:summarize': {
    title: 'Summarize',
    description: 'Summarize text content in various styles.',
    category: 'ai',
    config: {
      fields: [
        { name: 'text', type: 'variable', required: true, help: 'Text to summarize' },
        { name: 'style', type: 'select', required: false, default: 'brief', options: ['brief', 'detailed', 'bullets', 'executive'] },
        { name: 'maxLength', type: 'number', required: false, default: 100, help: 'Max words' }
      ]
    },
    outputs: [
      { name: 'summary', type: 'string', description: 'Generated summary' },
      { name: 'length', type: 'string', description: 'Summary length' },
      { name: 'compressionRatio', type: 'number', description: 'Compression ratio 0-100%' }
    ],
    variableAccess: '{{node.NODE_ID.summary}}'
  },

  'ai:rephrase': {
    title: 'Rephrase',
    description: 'Rephrase text in different styles (professional, casual, concise, detailed, friendly, formal).',
    category: 'ai',
    config: {
      fields: [
        { name: 'text', type: 'variable', required: true, help: 'Text to rephrase, e.g., {{input.message}}' },
        { name: 'style', type: 'select', required: true, options: ['professional', 'casual', 'concise', 'detailed', 'friendly', 'formal'] },
        { name: 'preserveTone', type: 'boolean', required: false, default: false, help: 'Try to preserve original emotional tone' }
      ]
    },
    outputs: [
      { name: 'rephrasedText', type: 'string', description: 'Rephrased text in requested style' },
      { name: 'originalText', type: 'string', description: 'Original input text' },
      { name: 'style', type: 'string', description: 'Style used for rephrasing' }
    ],
    variableAccess: '{{node.NODE_ID.rephrasedText}}'
  },

  'ai:superbrain': {
    title: 'SuperBrain',
    description: 'Route AI request through SuperBrain with automatic task classification and provider selection. Best for complex requests needing intelligent routing.',
    category: 'ai',
    config: {
      fields: [
        { name: 'message', type: 'variable', required: true, help: 'Message to process, e.g., {{input.message}}' },
        { name: 'systemPrompt', type: 'textarea', required: false, help: 'System instructions for the AI' },
        { name: 'useTaskRouting', type: 'boolean', required: false, default: true, help: 'Use automatic task classification for provider selection' },
        { name: 'conversationId', type: 'text', required: false, help: 'Conversation ID for memory context' }
      ]
    },
    outputs: [
      { name: 'content', type: 'string', description: 'AI generated response' },
      { name: 'provider', type: 'string', description: 'Provider used' },
      { name: 'model', type: 'string', description: 'Model used' },
      { name: 'tier', type: 'string', description: 'Task classification tier (trivial/simple/moderate/complex/critical)' },
      { name: 'usage', type: 'object', description: 'Token usage statistics' }
    ],
    variableAccess: '{{node.NODE_ID.content}}, {{node.NODE_ID.tier}}'
  },

  'ai:sentiment': {
    title: 'Sentiment Analysis',
    description: 'Analyze the emotional tone and sentiment of text (positive, negative, neutral).',
    category: 'ai',
    config: {
      fields: [
        { name: 'text', type: 'variable', required: true, help: 'Text to analyze, e.g., {{input.message}}' },
        { name: 'detailed', type: 'boolean', required: false, default: false, help: 'Return detailed emotion breakdown' }
      ]
    },
    outputs: [
      { name: 'sentiment', type: 'string', description: 'Overall sentiment: positive, negative, neutral' },
      { name: 'score', type: 'number', description: 'Sentiment score from -1 (negative) to 1 (positive)' },
      { name: 'confidence', type: 'number', description: 'Confidence level 0-1' },
      { name: 'emotions', type: 'object', description: 'Detailed emotion scores (if detailed=true)' }
    ],
    variableAccess: '{{node.NODE_ID.sentiment}}, {{node.NODE_ID.score}}'
  },

  'ai:extract_entities': {
    title: 'Extract Entities',
    description: 'Extract named entities from text (names, places, organizations, dates, etc.).',
    category: 'ai',
    config: {
      fields: [
        { name: 'text', type: 'variable', required: true, help: 'Text to analyze, e.g., {{input.message}}' },
        { name: 'entityTypes', type: 'text', required: false, help: 'Comma-separated entity types: PERSON,ORG,LOCATION,DATE,MONEY,PRODUCT' }
      ]
    },
    outputs: [
      { name: 'entities', type: 'array', description: 'Array of {text, type, start, end}' },
      { name: 'entityCount', type: 'number', description: 'Total entities found' },
      { name: 'byType', type: 'object', description: 'Entities grouped by type' }
    ],
    variableAccess: '{{node.NODE_ID.entities}}, {{node.NODE_ID.byType.PERSON}}'
  },

  'ai:summarize_memory': {
    title: 'Summarize Memory',
    description: 'Summarize conversation history and memory for context compression.',
    category: 'ai',
    config: {
      fields: [
        { name: 'conversationId', type: 'variable', required: true, help: 'Conversation ID to summarize' },
        { name: 'maxMessages', type: 'number', required: false, default: 50, help: 'Maximum messages to include' },
        { name: 'style', type: 'select', required: false, default: 'brief', options: ['brief', 'detailed', 'key_points'] }
      ]
    },
    outputs: [
      { name: 'summary', type: 'string', description: 'Conversation summary' },
      { name: 'messageCount', type: 'number', description: 'Number of messages summarized' },
      { name: 'keyTopics', type: 'array', description: 'Key topics discussed' }
    ],
    variableAccess: '{{node.NODE_ID.summary}}, {{node.NODE_ID.keyTopics}}'
  },

  'ai:router': {
    title: 'AI Router',
    description: 'Intelligently route requests to the best AI provider based on task type and cost.',
    category: 'ai',
    config: {
      fields: [
        { name: 'message', type: 'variable', required: true, help: 'Message to route' },
        { name: 'preferCost', type: 'select', required: false, default: 'balanced', options: ['cheapest', 'balanced', 'best_quality'], help: 'Cost/quality preference' },
        { name: 'taskHint', type: 'select', required: false, options: ['chat', 'code', 'analysis', 'creative', 'translation'], help: 'Hint for task type' }
      ]
    },
    outputs: [
      { name: 'content', type: 'string', description: 'AI generated response' },
      { name: 'selectedProvider', type: 'string', description: 'Provider that was selected' },
      { name: 'selectedModel', type: 'string', description: 'Model that was selected' },
      { name: 'routingReason', type: 'string', description: 'Why this provider was chosen' }
    ],
    variableAccess: '{{node.NODE_ID.content}}, {{node.NODE_ID.selectedProvider}}'
  },

  'ai:claude_cli': {
    title: 'Claude CLI',
    description: 'Execute tasks using Claude Code CLI for agentic code operations.',
    category: 'ai',
    config: {
      fields: [
        { name: 'prompt', type: 'textarea', required: true, help: 'Task or prompt for Claude CLI' },
        { name: 'workspaceId', type: 'text', required: false, help: 'Workspace ID for file operations' },
        { name: 'timeout', type: 'number', required: false, default: 120000, help: 'Timeout in milliseconds' },
        { name: 'maxTokens', type: 'number', required: false, default: 4096, help: 'Max output tokens' }
      ]
    },
    outputs: [
      { name: 'content', type: 'string', description: 'CLI response content' },
      { name: 'exitCode', type: 'number', description: 'CLI exit code' },
      { name: 'success', type: 'boolean', description: 'Whether execution succeeded' },
      { name: 'filesModified', type: 'array', description: 'List of files modified' }
    ],
    variableAccess: '{{node.NODE_ID.content}}, {{node.NODE_ID.success}}'
  },

  'ai:gemini_cli': {
    title: 'Gemini CLI',
    description: 'Execute tasks using Google Gemini CLI for AI operations.',
    category: 'ai',
    config: {
      fields: [
        { name: 'prompt', type: 'textarea', required: true, help: 'Task or prompt for Gemini CLI' },
        { name: 'workspaceId', type: 'text', required: false, help: 'Workspace ID for file operations' },
        { name: 'timeout', type: 'number', required: false, default: 120000, help: 'Timeout in milliseconds' }
      ]
    },
    outputs: [
      { name: 'content', type: 'string', description: 'CLI response content' },
      { name: 'exitCode', type: 'number', description: 'CLI exit code' },
      { name: 'success', type: 'boolean', description: 'Whether execution succeeded' }
    ],
    variableAccess: '{{node.NODE_ID.content}}, {{node.NODE_ID.success}}'
  },

  'ai:opencode_cli': {
    title: 'OpenCode CLI',
    description: 'Execute tasks using OpenCode CLI for multi-provider AI operations.',
    category: 'ai',
    config: {
      fields: [
        { name: 'prompt', type: 'textarea', required: true, help: 'Task or prompt for OpenCode CLI' },
        { name: 'workspaceId', type: 'text', required: false, help: 'Workspace ID for file operations' },
        { name: 'provider', type: 'text', required: false, help: 'Preferred provider (optional)' },
        { name: 'timeout', type: 'number', required: false, default: 120000, help: 'Timeout in milliseconds' }
      ]
    },
    outputs: [
      { name: 'content', type: 'string', description: 'CLI response content' },
      { name: 'exitCode', type: 'number', description: 'CLI exit code' },
      { name: 'success', type: 'boolean', description: 'Whether execution succeeded' }
    ],
    variableAccess: '{{node.NODE_ID.content}}, {{node.NODE_ID.success}}'
  },

  // ==================== LOGIC NODES ====================
  'logic:condition': {
    title: 'Condition',
    description: 'Branch flow based on conditions. Creates two output branches: true and false.',
    category: 'logic',
    config: {
      fields: [
        { name: 'field', type: 'variable', required: true, help: 'Value to check, e.g., {{node.NODE_ID.primaryIntent.category}}' },
        { name: 'operator', type: 'select', required: true, options: ['equals', 'not_equals', 'contains', 'not_contains', 'greater_than', 'less_than', 'is_empty', 'is_not_empty', 'startsWith', 'endsWith', 'matches'] },
        { name: 'value', type: 'variable', required: false, help: 'Value to compare against (not needed for is_empty/is_not_empty)' }
      ]
    },
    outputs: [
      { name: 'result', type: 'boolean', description: 'Condition result' },
      { name: 'branch', type: 'string', description: 'Branch taken: "true" or "false"' }
    ],
    variableAccess: '{{node.NODE_ID.result}}, {{node.NODE_ID.branch}}',
    edgeNotes: 'Creates edges with sourceHandle="true" and sourceHandle="false"'
  },

  'logic:loop': {
    title: 'Loop',
    description: 'Iterate over array items. Access current item with {{item}} and index with {{index}}.',
    category: 'logic',
    config: {
      fields: [
        { name: 'items', type: 'variable', required: true, help: 'Array to iterate, e.g., {{node.NODE_ID.results}}' },
        { name: 'itemVariable', type: 'text', required: false, default: 'item', help: 'Access as {{item}}' },
        { name: 'indexVariable', type: 'text', required: false, default: 'index', help: 'Access as {{index}}' },
        { name: 'maxIterations', type: 'number', required: false, default: 100, help: 'Safety limit' }
      ]
    },
    outputs: [
      { name: 'currentItem', type: 'any', description: 'Current/last item' },
      { name: 'currentIndex', type: 'number', description: 'Current/last index' },
      { name: 'totalIterations', type: 'number', description: 'Total iterations ran' },
      { name: 'completed', type: 'boolean', description: 'Whether loop completed' }
    ],
    variableAccess: 'Inside loop: {{item}}, {{index}}. After: {{node.NODE_ID.totalIterations}}'
  },

  'logic:switch': {
    title: 'Switch',
    description: 'Multi-way branch based on value matching.',
    category: 'logic',
    config: {
      fields: [
        { name: 'value', type: 'variable', required: true, help: 'Value to match, e.g., {{node.NODE_ID.primaryIntent.category}}' },
        { name: 'cases', type: 'json', required: true, help: '{"approved": "branch_a", "rejected": "branch_b"}' },
        { name: 'defaultBranch', type: 'text', required: false, default: 'default' }
      ]
    },
    outputs: [
      { name: 'matchedCase', type: 'string', description: 'Which case matched' },
      { name: 'branch', type: 'string', description: 'Branch name to follow' },
      { name: 'value', type: 'any', description: 'Evaluated value' }
    ],
    variableAccess: '{{node.NODE_ID.matchedCase}}, {{node.NODE_ID.branch}}'
  },

  'logic:delay': {
    title: 'Delay',
    description: 'Wait for specified duration before continuing.',
    category: 'logic',
    config: {
      fields: [
        { name: 'duration', type: 'number', required: true, default: 1 },
        { name: 'unit', type: 'select', required: false, default: 'seconds', options: ['seconds', 'minutes', 'hours'] }
      ]
    },
    outputs: [
      { name: 'delayedMs', type: 'number', description: 'Actual delay in milliseconds' },
      { name: 'completedAt', type: 'string', description: 'When delay completed' }
    ],
    variableAccess: '{{node.NODE_ID.delayedMs}}'
  },

  'logic:set_variable': {
    title: 'Set Variable',
    description: 'Store a value in a flow variable for later use.',
    category: 'logic',
    config: {
      fields: [
        { name: 'variableName', type: 'text', required: true, help: 'Name to reference as {{var.myVariable}}' },
        { name: 'value', type: 'variable', required: true, help: 'Value to store, can be static or variable' }
      ]
    },
    outputs: [
      { name: 'variableName', type: 'string', description: 'The variable name set' },
      { name: 'value', type: 'any', description: 'The value stored' }
    ],
    variableAccess: 'Access later with {{var.myVariable}} or {{variables.myVariable}}'
  },

  'logic:error_handler': {
    title: 'Error Handler',
    description: 'Catch and handle errors from connected nodes. Provides fallback path when errors occur.',
    category: 'logic',
    config: {
      fields: [
        { name: 'catchAll', type: 'boolean', required: false, default: true, help: 'Catch all error types' },
        { name: 'errorTypes', type: 'text', required: false, help: 'Comma-separated error types to catch (if not catchAll)' },
        { name: 'fallbackValue', type: 'variable', required: false, help: 'Default value to use on error' },
        { name: 'logError', type: 'boolean', required: false, default: true, help: 'Log error details' }
      ]
    },
    outputs: [
      { name: 'error', type: 'object', description: 'Error object with message, code, stack' },
      { name: 'errorMessage', type: 'string', description: 'Error message' },
      { name: 'errorCode', type: 'string', description: 'Error code if available' },
      { name: 'hasError', type: 'boolean', description: 'Whether an error occurred' },
      { name: 'fallbackValue', type: 'any', description: 'The fallback value used' }
    ],
    variableAccess: '{{node.NODE_ID.errorMessage}}, {{node.NODE_ID.hasError}}'
  },

  'logic:parallel': {
    title: 'Parallel',
    description: 'Execute multiple branches in parallel. All connected nodes run simultaneously.',
    category: 'logic',
    config: {
      fields: [
        { name: 'waitForAll', type: 'boolean', required: false, default: true, help: 'Wait for all branches to complete' },
        { name: 'timeout', type: 'number', required: false, default: 30000, help: 'Timeout in milliseconds' },
        { name: 'continueOnError', type: 'boolean', required: false, default: false, help: 'Continue even if some branches fail' }
      ]
    },
    outputs: [
      { name: 'results', type: 'array', description: 'Array of results from all branches' },
      { name: 'completedCount', type: 'number', description: 'Number of branches that completed' },
      { name: 'failedCount', type: 'number', description: 'Number of branches that failed' },
      { name: 'allSucceeded', type: 'boolean', description: 'Whether all branches succeeded' }
    ],
    variableAccess: '{{node.NODE_ID.results}}, {{node.NODE_ID.allSucceeded}}'
  },

  'logic:merge': {
    title: 'Merge',
    description: 'Merge multiple parallel branches back into a single flow. Waits for all or any incoming branches.',
    category: 'logic',
    config: {
      fields: [
        { name: 'mode', type: 'select', required: false, default: 'all', options: ['all', 'any', 'first'], help: 'all=wait for all, any=wait for any one, first=take first result' },
        { name: 'timeout', type: 'number', required: false, default: 30000, help: 'Timeout in milliseconds' }
      ]
    },
    outputs: [
      { name: 'mergedResults', type: 'array', description: 'Array of all merged results' },
      { name: 'branchCount', type: 'number', description: 'Number of branches merged' },
      { name: 'firstResult', type: 'any', description: 'First result received' }
    ],
    variableAccess: '{{node.NODE_ID.mergedResults}}, {{node.NODE_ID.firstResult}}'
  },

  'logic:retry': {
    title: 'Retry',
    description: 'Retry a failed operation with configurable attempts and backoff.',
    category: 'logic',
    config: {
      fields: [
        { name: 'maxAttempts', type: 'number', required: false, default: 3, help: 'Maximum retry attempts' },
        { name: 'delayMs', type: 'number', required: false, default: 1000, help: 'Delay between retries (milliseconds)' },
        { name: 'backoffMultiplier', type: 'number', required: false, default: 2, help: 'Multiply delay by this on each retry' },
        { name: 'retryOn', type: 'text', required: false, help: 'Comma-separated error codes to retry on (empty = all errors)' }
      ]
    },
    outputs: [
      { name: 'result', type: 'any', description: 'Result from successful attempt' },
      { name: 'attemptCount', type: 'number', description: 'Number of attempts made' },
      { name: 'succeeded', type: 'boolean', description: 'Whether operation eventually succeeded' },
      { name: 'lastError', type: 'object', description: 'Last error if all retries failed' }
    ],
    variableAccess: '{{node.NODE_ID.result}}, {{node.NODE_ID.attemptCount}}'
  },

  // ==================== ACTION NODES ====================
  'action:send_message': {
    title: 'Send Message',
    description: 'Send a message to a conversation (WhatsApp, Telegram, Email).',
    category: 'action',
    config: {
      fields: [
        { name: 'conversationId', type: 'variable', required: false, help: 'Use {{input.conversationId}} to reply to trigger' },
        { name: 'content', type: 'textarea', required: true, help: 'Message content, supports variables like {{node.NODE_ID.content}}' },
        { name: 'senderType', type: 'select', required: false, default: 'agent', options: ['system', 'agent'] }
      ]
    },
    outputs: [
      { name: 'channel', type: 'string', description: 'Channel used' },
      { name: 'recipient', type: 'string', description: 'Message recipient' },
      { name: 'messageId', type: 'string', description: 'Platform message ID' },
      { name: 'status', type: 'string', description: 'sent or failed' },
      { name: 'sentAt', type: 'string', description: 'ISO timestamp' }
    ],
    variableAccess: '{{node.NODE_ID.messageId}}, {{node.NODE_ID.status}}'
  },

  'action:http_request': {
    title: 'HTTP Request',
    description: 'Make an HTTP API request to external services.',
    category: 'action',
    config: {
      fields: [
        { name: 'method', type: 'select', required: false, default: 'GET', options: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] },
        { name: 'url', type: 'variable', required: true, help: 'API endpoint, supports variables' },
        { name: 'headers', type: 'json', required: false, help: '{"Authorization": "Bearer {{var.token}}"}' },
        { name: 'body', type: 'json', required: false, help: 'Request body for POST/PUT/PATCH' },
        { name: 'timeout', type: 'number', required: false, default: 30000 }
      ]
    },
    outputs: [
      { name: 'statusCode', type: 'number', description: 'HTTP status code' },
      { name: 'headers', type: 'object', description: 'Response headers' },
      { name: 'body', type: 'any', description: 'Response body (JSON parsed)' },
      { name: 'success', type: 'boolean', description: 'true if 2xx status' },
      { name: 'duration', type: 'number', description: 'Request duration ms' }
    ],
    variableAccess: '{{node.NODE_ID.body}}, {{node.NODE_ID.body.data}}, {{node.NODE_ID.statusCode}}'
  },

  'action:subflow': {
    title: 'Subflow',
    description: 'Execute another flow as a subflow.',
    category: 'action',
    config: {
      fields: [
        { name: 'flowId', type: 'text', required: true, help: 'ID of flow to execute' },
        { name: 'input', type: 'json', required: false, help: '{"message": "{{input.message}}"}' },
        { name: 'waitForCompletion', type: 'boolean', required: false, default: true },
        { name: 'timeout', type: 'number', required: false, default: 60000 }
      ]
    },
    outputs: [
      { name: 'flowId', type: 'string', description: 'Executed flow ID' },
      { name: 'executionId', type: 'string', description: 'Execution ID' },
      { name: 'result', type: 'any', description: 'Subflow result' },
      { name: 'status', type: 'string', description: 'completed/failed/timeout' }
    ],
    variableAccess: '{{node.NODE_ID.result}}, {{node.NODE_ID.status}}'
  },

  'action:send_email': {
    title: 'Send Email',
    description: 'Send an email message via configured SMTP.',
    category: 'action',
    config: {
      fields: [
        { name: 'to', type: 'variable', required: true, help: 'Recipient email address' },
        { name: 'subject', type: 'variable', required: true, help: 'Email subject line' },
        { name: 'body', type: 'textarea', required: true, help: 'Email body (supports HTML)' },
        { name: 'cc', type: 'text', required: false, help: 'CC recipients (comma-separated)' },
        { name: 'bcc', type: 'text', required: false, help: 'BCC recipients (comma-separated)' },
        { name: 'isHtml', type: 'boolean', required: false, default: true, help: 'Send as HTML email' }
      ]
    },
    outputs: [
      { name: 'messageId', type: 'string', description: 'Sent message ID' },
      { name: 'status', type: 'string', description: 'sent/failed' },
      { name: 'sentAt', type: 'string', description: 'Timestamp when sent' }
    ],
    variableAccess: '{{node.NODE_ID.messageId}}, {{node.NODE_ID.status}}'
  },

  'action:transform': {
    title: 'Transform',
    description: 'Transform and manipulate data using expressions.',
    category: 'action',
    config: {
      fields: [
        { name: 'input', type: 'variable', required: true, help: 'Input data to transform' },
        { name: 'expression', type: 'textarea', required: true, help: 'Transformation expression (JSONPath, template, or code)' },
        { name: 'outputFormat', type: 'select', required: false, default: 'auto', options: ['auto', 'json', 'string', 'array'] }
      ]
    },
    outputs: [
      { name: 'result', type: 'any', description: 'Transformed result' },
      { name: 'originalType', type: 'string', description: 'Original data type' },
      { name: 'resultType', type: 'string', description: 'Result data type' }
    ],
    variableAccess: '{{node.NODE_ID.result}}'
  },

  'action:wait_for_event': {
    title: 'Wait for Event',
    description: 'Pause flow execution until a specific event occurs.',
    category: 'action',
    config: {
      fields: [
        { name: 'eventType', type: 'select', required: true, options: ['message', 'webhook', 'timer', 'custom'], help: 'Type of event to wait for' },
        { name: 'eventName', type: 'text', required: false, help: 'Custom event name' },
        { name: 'timeout', type: 'number', required: false, default: 300000, help: 'Timeout in milliseconds (default: 5 minutes)' },
        { name: 'filter', type: 'json', required: false, help: 'Event filter criteria' }
      ]
    },
    outputs: [
      { name: 'event', type: 'object', description: 'Received event data' },
      { name: 'timedOut', type: 'boolean', description: 'Whether wait timed out' },
      { name: 'waitDuration', type: 'number', description: 'How long waited in milliseconds' }
    ],
    variableAccess: '{{node.NODE_ID.event}}, {{node.NODE_ID.timedOut}}'
  },

  // ==================== FILE OPERATION NODES ====================
  'action:file_read': {
    title: 'Read File',
    description: 'Read contents of a file from the workspace.',
    category: 'action',
    config: {
      fields: [
        { name: 'path', type: 'variable', required: true, help: 'File path relative to workspace' },
        { name: 'encoding', type: 'select', required: false, default: 'utf8', options: ['utf8', 'base64', 'binary'] }
      ]
    },
    outputs: [
      { name: 'content', type: 'string', description: 'File content' },
      { name: 'size', type: 'number', description: 'File size in bytes' },
      { name: 'exists', type: 'boolean', description: 'Whether file exists' },
      { name: 'mimeType', type: 'string', description: 'Detected MIME type' }
    ],
    variableAccess: '{{node.NODE_ID.content}}, {{node.NODE_ID.exists}}'
  },

  'action:file_write': {
    title: 'Write File',
    description: 'Write content to a file in the workspace.',
    category: 'action',
    config: {
      fields: [
        { name: 'path', type: 'variable', required: true, help: 'File path relative to workspace' },
        { name: 'content', type: 'textarea', required: true, help: 'Content to write' },
        { name: 'encoding', type: 'select', required: false, default: 'utf8', options: ['utf8', 'base64', 'binary'] },
        { name: 'append', type: 'boolean', required: false, default: false, help: 'Append to existing file' }
      ]
    },
    outputs: [
      { name: 'path', type: 'string', description: 'Written file path' },
      { name: 'size', type: 'number', description: 'Written bytes' },
      { name: 'success', type: 'boolean', description: 'Whether write succeeded' }
    ],
    variableAccess: '{{node.NODE_ID.path}}, {{node.NODE_ID.success}}'
  },

  'action:file_list': {
    title: 'List Files',
    description: 'List files in a directory.',
    category: 'action',
    config: {
      fields: [
        { name: 'path', type: 'variable', required: true, help: 'Directory path relative to workspace' },
        { name: 'pattern', type: 'text', required: false, help: 'Glob pattern to filter (e.g., *.txt)' },
        { name: 'recursive', type: 'boolean', required: false, default: false, help: 'Include subdirectories' }
      ]
    },
    outputs: [
      { name: 'files', type: 'array', description: 'Array of file info objects' },
      { name: 'count', type: 'number', description: 'Number of files found' },
      { name: 'totalSize', type: 'number', description: 'Total size in bytes' }
    ],
    variableAccess: '{{node.NODE_ID.files}}, {{node.NODE_ID.count}}'
  },

  'action:file_delete': {
    title: 'Delete File',
    description: 'Delete a file from the workspace.',
    category: 'action',
    config: {
      fields: [
        { name: 'path', type: 'variable', required: true, help: 'File path relative to workspace' },
        { name: 'force', type: 'boolean', required: false, default: false, help: 'Delete even if file is in use' }
      ]
    },
    outputs: [
      { name: 'deleted', type: 'boolean', description: 'Whether file was deleted' },
      { name: 'path', type: 'string', description: 'Deleted file path' }
    ],
    variableAccess: '{{node.NODE_ID.deleted}}'
  },

  // ==================== WEB OPERATION NODES ====================
  'action:web_fetch': {
    title: 'Web Fetch',
    description: 'Fetch content from a URL and extract text/data.',
    category: 'action',
    config: {
      fields: [
        { name: 'url', type: 'variable', required: true, help: 'URL to fetch' },
        { name: 'method', type: 'select', required: false, default: 'GET', options: ['GET', 'POST'] },
        { name: 'headers', type: 'json', required: false, help: 'Request headers' },
        { name: 'extractText', type: 'boolean', required: false, default: true, help: 'Extract readable text from HTML' }
      ]
    },
    outputs: [
      { name: 'content', type: 'string', description: 'Page content (text or HTML)' },
      { name: 'statusCode', type: 'number', description: 'HTTP status code' },
      { name: 'title', type: 'string', description: 'Page title (if HTML)' },
      { name: 'success', type: 'boolean', description: 'Whether fetch succeeded' }
    ],
    variableAccess: '{{node.NODE_ID.content}}, {{node.NODE_ID.title}}'
  },

  'action:web_scrape': {
    title: 'Web Scrape',
    description: 'Extract structured data from a webpage using selectors.',
    category: 'action',
    config: {
      fields: [
        { name: 'url', type: 'variable', required: true, help: 'URL to scrape' },
        { name: 'selectors', type: 'json', required: true, help: '{"title": "h1", "items": ".item-class"}' },
        { name: 'waitFor', type: 'text', required: false, help: 'CSS selector to wait for before scraping' },
        { name: 'timeout', type: 'number', required: false, default: 30000 }
      ]
    },
    outputs: [
      { name: 'data', type: 'object', description: 'Extracted data matching selectors' },
      { name: 'success', type: 'boolean', description: 'Whether scrape succeeded' },
      { name: 'url', type: 'string', description: 'Final URL (after redirects)' }
    ],
    variableAccess: '{{node.NODE_ID.data}}, {{node.NODE_ID.data.title}}'
  },

  // ==================== DATA TRANSFORM NODES ====================
  'action:data_transform': {
    title: 'Data Transform',
    description: 'Transform data using JSONPath or JMESPath expressions.',
    category: 'action',
    config: {
      fields: [
        { name: 'input', type: 'variable', required: true, help: 'Input data to transform' },
        { name: 'expression', type: 'textarea', required: true, help: 'JSONPath/JMESPath expression' },
        { name: 'expressionType', type: 'select', required: false, default: 'jsonpath', options: ['jsonpath', 'jmespath', 'template'] }
      ]
    },
    outputs: [
      { name: 'result', type: 'any', description: 'Transformed result' },
      { name: 'success', type: 'boolean', description: 'Whether transform succeeded' }
    ],
    variableAccess: '{{node.NODE_ID.result}}'
  },

  'action:data_validate': {
    title: 'Data Validate',
    description: 'Validate data against a JSON schema.',
    category: 'action',
    config: {
      fields: [
        { name: 'data', type: 'variable', required: true, help: 'Data to validate' },
        { name: 'schema', type: 'json', required: true, help: 'JSON schema for validation' },
        { name: 'strict', type: 'boolean', required: false, default: true, help: 'Fail on additional properties' }
      ]
    },
    outputs: [
      { name: 'valid', type: 'boolean', description: 'Whether data is valid' },
      { name: 'errors', type: 'array', description: 'Array of validation errors' },
      { name: 'errorCount', type: 'number', description: 'Number of errors' }
    ],
    variableAccess: '{{node.NODE_ID.valid}}, {{node.NODE_ID.errors}}'
  },

  // ==================== SCHEDULER NODES ====================
  'action:scheduler_create': {
    title: 'Create Schedule',
    description: 'Create a new scheduled task.',
    category: 'action',
    config: {
      fields: [
        { name: 'name', type: 'text', required: true, help: 'Schedule name' },
        { name: 'schedule', type: 'text', required: true, help: 'Cron expression (e.g., "0 9 * * *" for daily 9AM)' },
        { name: 'flowId', type: 'text', required: true, help: 'Flow to execute on schedule' },
        { name: 'input', type: 'json', required: false, help: 'Input data for scheduled flow' },
        { name: 'timezone', type: 'text', required: false, default: 'UTC' }
      ]
    },
    outputs: [
      { name: 'scheduleId', type: 'string', description: 'Created schedule ID' },
      { name: 'nextRun', type: 'string', description: 'Next scheduled execution time' },
      { name: 'success', type: 'boolean', description: 'Whether creation succeeded' }
    ],
    variableAccess: '{{node.NODE_ID.scheduleId}}, {{node.NODE_ID.nextRun}}'
  },

  'action:scheduler_list': {
    title: 'List Schedules',
    description: 'List all scheduled tasks.',
    category: 'action',
    config: {
      fields: [
        { name: 'status', type: 'select', required: false, default: 'all', options: ['all', 'active', 'paused'], help: 'Filter by status' }
      ]
    },
    outputs: [
      { name: 'schedules', type: 'array', description: 'Array of schedule objects' },
      { name: 'count', type: 'number', description: 'Number of schedules' }
    ],
    variableAccess: '{{node.NODE_ID.schedules}}, {{node.NODE_ID.count}}'
  },

  'action:scheduler_update': {
    title: 'Update Schedule',
    description: 'Update an existing scheduled task.',
    category: 'action',
    config: {
      fields: [
        { name: 'scheduleId', type: 'variable', required: true, help: 'Schedule ID to update' },
        { name: 'schedule', type: 'text', required: false, help: 'New cron expression' },
        { name: 'enabled', type: 'boolean', required: false, help: 'Enable or disable schedule' },
        { name: 'input', type: 'json', required: false, help: 'New input data' }
      ]
    },
    outputs: [
      { name: 'updated', type: 'boolean', description: 'Whether update succeeded' },
      { name: 'schedule', type: 'object', description: 'Updated schedule object' }
    ],
    variableAccess: '{{node.NODE_ID.updated}}, {{node.NODE_ID.schedule}}'
  },

  'action:scheduler_delete': {
    title: 'Delete Schedule',
    description: 'Delete a scheduled task.',
    category: 'action',
    config: {
      fields: [
        { name: 'scheduleId', type: 'variable', required: true, help: 'Schedule ID to delete' }
      ]
    },
    outputs: [
      { name: 'deleted', type: 'boolean', description: 'Whether deletion succeeded' }
    ],
    variableAccess: '{{node.NODE_ID.deleted}}'
  },

  'action:scheduler_get_next': {
    title: 'Get Next Execution',
    description: 'Get the next scheduled execution time.',
    category: 'action',
    config: {
      fields: [
        { name: 'scheduleId', type: 'variable', required: true, help: 'Schedule ID to check' }
      ]
    },
    outputs: [
      { name: 'nextRun', type: 'string', description: 'Next execution time (ISO)' },
      { name: 'countdown', type: 'number', description: 'Milliseconds until next run' },
      { name: 'exists', type: 'boolean', description: 'Whether schedule exists' }
    ],
    variableAccess: '{{node.NODE_ID.nextRun}}, {{node.NODE_ID.countdown}}'
  },

  // ==================== MESSAGING NODES ====================
  'messaging:send_whatsapp': {
    title: 'Send WhatsApp',
    description: 'Send a message specifically via WhatsApp.',
    category: 'messaging',
    config: {
      fields: [
        { name: 'to', type: 'variable', required: true, help: 'WhatsApp phone number with country code, e.g., {{input.from}}' },
        { name: 'content', type: 'textarea', required: true, help: 'Message content' },
        { name: 'conversationId', type: 'variable', required: false, help: 'Conversation ID for reply context' }
      ]
    },
    outputs: [
      { name: 'messageId', type: 'string', description: 'WhatsApp message ID' },
      { name: 'status', type: 'string', description: 'sent/failed' },
      { name: 'timestamp', type: 'string', description: 'When message was sent' }
    ],
    variableAccess: '{{node.NODE_ID.messageId}}, {{node.NODE_ID.status}}'
  },

  'messaging:send_telegram': {
    title: 'Send Telegram',
    description: 'Send a message specifically via Telegram.',
    category: 'messaging',
    config: {
      fields: [
        { name: 'chatId', type: 'variable', required: true, help: 'Telegram chat ID, e.g., {{input.from}}' },
        { name: 'content', type: 'textarea', required: true, help: 'Message content' },
        { name: 'parseMode', type: 'select', required: false, default: 'HTML', options: ['HTML', 'Markdown', 'MarkdownV2'] }
      ]
    },
    outputs: [
      { name: 'messageId', type: 'string', description: 'Telegram message ID' },
      { name: 'status', type: 'string', description: 'sent/failed' },
      { name: 'chatId', type: 'string', description: 'Chat ID message was sent to' }
    ],
    variableAccess: '{{node.NODE_ID.messageId}}, {{node.NODE_ID.status}}'
  },

  'messaging:send_media': {
    title: 'Send Media',
    description: 'Send media (image, video, document, audio) to a conversation.',
    category: 'messaging',
    config: {
      fields: [
        { name: 'conversationId', type: 'variable', required: true, help: 'Conversation ID, e.g., {{input.conversationId}}' },
        { name: 'mediaUrl', type: 'variable', required: true, help: 'URL of media file to send' },
        { name: 'mediaType', type: 'select', required: false, default: 'image', options: ['image', 'video', 'document', 'audio'] },
        { name: 'caption', type: 'textarea', required: false, help: 'Optional caption for the media' }
      ]
    },
    outputs: [
      { name: 'messageId', type: 'string', description: 'Platform message ID' },
      { name: 'status', type: 'string', description: 'sent/failed' },
      { name: 'mediaType', type: 'string', description: 'Type of media sent' }
    ],
    variableAccess: '{{node.NODE_ID.messageId}}, {{node.NODE_ID.status}}'
  },

  'messaging:wait_for_reply': {
    title: 'Wait for Reply',
    description: 'Wait for a user reply before continuing the flow. Useful for interactive conversations.',
    category: 'messaging',
    config: {
      fields: [
        { name: 'conversationId', type: 'variable', required: true, help: 'Conversation ID to wait for reply from' },
        { name: 'timeout', type: 'number', required: false, default: 300000, help: 'Timeout in milliseconds (default: 5 minutes)' },
        { name: 'validationPattern', type: 'text', required: false, help: 'Regex pattern to validate reply (optional)' }
      ]
    },
    outputs: [
      { name: 'reply', type: 'string', description: 'User reply content' },
      { name: 'replyFrom', type: 'string', description: 'Sender ID of reply' },
      { name: 'timedOut', type: 'boolean', description: 'Whether wait timed out' },
      { name: 'isValid', type: 'boolean', description: 'Whether reply matched validation pattern' }
    ],
    variableAccess: '{{node.NODE_ID.reply}}, {{node.NODE_ID.timedOut}}'
  },

  // ==================== DATA NODES ====================
  'data:query': {
    title: 'Data Query',
    description: 'Query data from database or external source.',
    category: 'data',
    config: {
      fields: [
        { name: 'source', type: 'select', required: true, options: ['database', 'api', 'knowledge'], help: 'Data source type' },
        { name: 'query', type: 'variable', required: true, help: 'Query string or API endpoint' },
        { name: 'parameters', type: 'json', required: false, help: '{"param1": "{{value}}"}' },
        { name: 'limit', type: 'number', required: false, default: 100, help: 'Maximum results to return' }
      ]
    },
    outputs: [
      { name: 'results', type: 'array', description: 'Query results array' },
      { name: 'count', type: 'number', description: 'Number of results' },
      { name: 'hasMore', type: 'boolean', description: 'Whether more results exist' }
    ],
    variableAccess: '{{node.NODE_ID.results}}, {{node.NODE_ID.count}}'
  },

  'data:insert': {
    title: 'Data Insert',
    description: 'Insert new data into database or external source.',
    category: 'data',
    config: {
      fields: [
        { name: 'target', type: 'text', required: true, help: 'Table or collection name' },
        { name: 'data', type: 'json', required: true, help: '{"field1": "{{value}}", "field2": "value2"}' },
        { name: 'returnInserted', type: 'boolean', required: false, default: true, help: 'Return the inserted record' }
      ]
    },
    outputs: [
      { name: 'insertedId', type: 'string', description: 'ID of inserted record' },
      { name: 'inserted', type: 'object', description: 'Inserted record data' },
      { name: 'success', type: 'boolean', description: 'Whether insert succeeded' }
    ],
    variableAccess: '{{node.NODE_ID.insertedId}}, {{node.NODE_ID.inserted}}'
  },

  'data:update': {
    title: 'Data Update',
    description: 'Update existing data in database or external source.',
    category: 'data',
    config: {
      fields: [
        { name: 'target', type: 'text', required: true, help: 'Table or collection name' },
        { name: 'filter', type: 'json', required: true, help: '{"id": "{{recordId}}"}' },
        { name: 'data', type: 'json', required: true, help: '{"field1": "{{newValue}}"}' },
        { name: 'upsert', type: 'boolean', required: false, default: false, help: 'Insert if not found' }
      ]
    },
    outputs: [
      { name: 'modifiedCount', type: 'number', description: 'Number of records modified' },
      { name: 'updated', type: 'object', description: 'Updated record data' },
      { name: 'success', type: 'boolean', description: 'Whether update succeeded' }
    ],
    variableAccess: '{{node.NODE_ID.modifiedCount}}, {{node.NODE_ID.updated}}'
  },

  // ==================== SWARM NODES ====================
  'swarm:agent_query': {
    title: 'Agent Query',
    description: 'Query a specific agent or auto-select the best matching agent.',
    category: 'swarm',
    config: {
      fields: [
        { name: 'agentId', type: 'text', required: false, help: 'Leave empty to auto-select' },
        { name: 'prompt', type: 'variable', required: true, help: 'Question or task for agent' },
        { name: 'preferBestMatch', type: 'boolean', required: false, default: true }
      ]
    },
    outputs: [
      { name: 'agentId', type: 'string', description: 'Agent that responded' },
      { name: 'agentName', type: 'string', description: 'Agent name' },
      { name: 'response', type: 'string', description: 'Agent response' },
      { name: 'confidence', type: 'number', description: 'Response confidence 0-1' }
    ],
    variableAccess: '{{node.NODE_ID.response}}, {{node.NODE_ID.agentName}}'
  },

  'swarm:broadcast': {
    title: 'Broadcast',
    description: 'Broadcast message to multiple agents.',
    category: 'swarm',
    config: {
      fields: [
        { name: 'message', type: 'variable', required: true },
        { name: 'agentIds', type: 'text', required: false, help: 'Comma-separated, empty for all' },
        { name: 'priority', type: 'select', required: false, default: 'normal', options: ['low', 'normal', 'high', 'urgent'] }
      ]
    },
    outputs: [
      { name: 'broadcastId', type: 'string', description: 'Broadcast ID' },
      { name: 'agentCount', type: 'number', description: 'Agents reached' },
      { name: 'responses', type: 'array', description: 'Agent responses' }
    ],
    variableAccess: '{{node.NODE_ID.responses}}, {{node.NODE_ID.agentCount}}'
  },

  'swarm:consensus': {
    title: 'Consensus',
    description: 'Get consensus from multiple agents through voting.',
    category: 'swarm',
    config: {
      fields: [
        { name: 'question', type: 'variable', required: true },
        { name: 'options', type: 'text', required: true, help: 'Comma-separated: approve, reject' },
        { name: 'agentIds', type: 'text', required: false, help: 'Comma-separated agent IDs' },
        { name: 'threshold', type: 'number', required: false, default: 66, help: 'Percentage needed' },
        { name: 'timeout', type: 'number', required: false, default: 60000 }
      ]
    },
    outputs: [
      { name: 'consensus', type: 'boolean', description: 'Whether consensus reached' },
      { name: 'winner', type: 'string', description: 'Winning option' },
      { name: 'votes', type: 'object', description: 'Vote counts per option' },
      { name: 'percentage', type: 'number', description: 'Winning percentage' }
    ],
    variableAccess: '{{node.NODE_ID.consensus}}, {{node.NODE_ID.winner}}'
  },

  'swarm:agent_handoff': {
    title: 'Agent Handoff',
    description: 'Transfer conversation to another agent with context preservation.',
    category: 'swarm',
    config: {
      fields: [
        { name: 'targetAgentId', type: 'text', required: true, help: 'Agent ID to hand off to' },
        { name: 'context', type: 'json', required: false, help: 'Context data to pass to target agent' },
        { name: 'message', type: 'variable', required: false, help: 'Message to include with handoff' },
        { name: 'preserveHistory', type: 'boolean', required: false, default: true, help: 'Include conversation history' }
      ]
    },
    outputs: [
      { name: 'handoffId', type: 'string', description: 'Handoff transaction ID' },
      { name: 'targetAgentId', type: 'string', description: 'Agent that received handoff' },
      { name: 'targetAgentName', type: 'string', description: 'Name of target agent' },
      { name: 'success', type: 'boolean', description: 'Whether handoff succeeded' }
    ],
    variableAccess: '{{node.NODE_ID.handoffId}}, {{node.NODE_ID.success}}'
  },

  'swarm:task': {
    title: 'Swarm Task',
    description: 'Create a collaborative task for the swarm to work on together.',
    category: 'swarm',
    config: {
      fields: [
        { name: 'task', type: 'textarea', required: true, help: 'Task description for the swarm' },
        { name: 'agentIds', type: 'text', required: false, help: 'Comma-separated agent IDs (empty = all)' },
        { name: 'priority', type: 'select', required: false, default: 'normal', options: ['low', 'normal', 'high', 'urgent'] },
        { name: 'deadline', type: 'number', required: false, help: 'Deadline in milliseconds from now' }
      ]
    },
    outputs: [
      { name: 'taskId', type: 'string', description: 'Created task ID' },
      { name: 'assignedAgents', type: 'array', description: 'Agents assigned to task' },
      { name: 'status', type: 'string', description: 'Task status' }
    ],
    variableAccess: '{{node.NODE_ID.taskId}}, {{node.NODE_ID.status}}'
  },

  'swarm:find_agent': {
    title: 'Find Agent',
    description: 'Find the best agent for a given task or capability.',
    category: 'swarm',
    config: {
      fields: [
        { name: 'capability', type: 'text', required: true, help: 'Required capability or task description' },
        { name: 'minScore', type: 'number', required: false, default: 0.5, help: 'Minimum match score (0-1)' },
        { name: 'excludeAgents', type: 'text', required: false, help: 'Comma-separated agent IDs to exclude' },
        { name: 'limit', type: 'number', required: false, default: 1, help: 'Number of agents to return' }
      ]
    },
    outputs: [
      { name: 'agents', type: 'array', description: 'Matched agents with scores' },
      { name: 'bestMatch', type: 'object', description: 'Best matching agent' },
      { name: 'bestMatchId', type: 'string', description: 'Best matching agent ID' },
      { name: 'found', type: 'boolean', description: 'Whether any agent was found' }
    ],
    variableAccess: '{{node.NODE_ID.bestMatchId}}, {{node.NODE_ID.found}}'
  },

  'swarm:status': {
    title: 'Swarm Status',
    description: 'Get current status of swarm, agents, or specific tasks.',
    category: 'swarm',
    config: {
      fields: [
        { name: 'type', type: 'select', required: false, default: 'swarm', options: ['swarm', 'agent', 'task'], help: 'What to check status of' },
        { name: 'targetId', type: 'text', required: false, help: 'Agent ID or Task ID (required for agent/task type)' }
      ]
    },
    outputs: [
      { name: 'status', type: 'object', description: 'Full status object' },
      { name: 'activeAgents', type: 'number', description: 'Number of active agents (swarm status)' },
      { name: 'pendingTasks', type: 'number', description: 'Number of pending tasks' },
      { name: 'isHealthy', type: 'boolean', description: 'Overall health status' }
    ],
    variableAccess: '{{node.NODE_ID.status}}, {{node.NODE_ID.isHealthy}}'
  },

  // ==================== MCP NODES ====================
  'mcp:tool': {
    title: 'MCP Tool',
    description: 'Call an MCP (Model Context Protocol) server tool.',
    category: 'mcp',
    config: {
      fields: [
        { name: 'mcpToolConfig', type: 'mcp_tool', required: true, help: 'Select MCP server and tool' },
        { name: 'inputMapping', type: 'json', required: false, help: '{"query": "{{input.message}}"}' },
        { name: 'outputVariable', type: 'text', required: false, default: 'mcpResult', help: 'Store as {{var.mcpResult}}' },
        { name: 'timeout', type: 'number', required: false, default: 30000 }
      ]
    },
    outputs: [
      { name: 'result', type: 'any', description: 'Tool execution result' },
      { name: 'server', type: 'string', description: 'MCP server name' },
      { name: 'tool', type: 'string', description: 'Tool name called' },
      { name: 'success', type: 'boolean', description: 'Whether succeeded' }
    ],
    variableAccess: '{{node.NODE_ID.result}}, {{var.mcpResult}}'
  },

  'mcp:resource': {
    title: 'MCP Resource',
    description: 'Read a resource from an MCP server (database, file, API data, etc.).',
    category: 'mcp',
    config: {
      fields: [
        { name: 'server', type: 'text', required: true, help: 'MCP server name' },
        { name: 'resourceUri', type: 'variable', required: true, help: 'Resource URI to read' },
        { name: 'outputVariable', type: 'text', required: false, default: 'mcpResource', help: 'Store as {{var.mcpResource}}' }
      ]
    },
    outputs: [
      { name: 'content', type: 'any', description: 'Resource content' },
      { name: 'mimeType', type: 'string', description: 'Content MIME type' },
      { name: 'server', type: 'string', description: 'MCP server name' },
      { name: 'success', type: 'boolean', description: 'Whether read succeeded' }
    ],
    variableAccess: '{{node.NODE_ID.content}}, {{var.mcpResource}}'
  }
};

/**
 * Variable reference documentation
 */
const VARIABLE_REFERENCE = {
  title: 'Variable Reference Guide',
  content: `
# FlowBuilder Variable Reference

## Node Output Access
- {{node.NODE_ID.fieldName}} - Access specific output from any node
- {{previousOutput}} - Auto-extracts 'content' or 'response' from previous node
- {{results.NODE_ID}} - Alternative syntax for node results

## Trigger Input Variables (message-triggered flows)
- {{input.message}} - Message content
- {{input.from}} - Sender ID/phone
- {{input.conversationId}} - Conversation ID
- {{input.platform}} - Platform (whatsapp, telegram, email)
- {{input.contentType}} - Content type (text, image, etc.)
- {{input.mediaUrl}} - Media attachment URL

## Shorthand Variables (WhatsBots style)
- {{triggerPhone}} - Sender phone
- {{triggerMessage}} - Message content
- {{triggerSenderName}} - Sender display name
- {{triggerChatId}} - Chat/conversation ID
- {{triggerIsGroup}} - Whether from a group
- {{triggerGroupName}} - Group name
- {{triggerHasMedia}} - Has media attachment
- {{triggerMediaType}} - Type of media

## Flow Variables
- {{var.variableName}} - Get variable set by Set Variable node
- {{variables.variableName}} - Alternative syntax

## Loop Variables (inside Loop node)
- {{item}} - Current item in forEach loop
- {{index}} - Current iteration index (0-based)

## Built-in Variables
- {{TODAY}} - Current date (dd-mm-yyyy)
- {{TIME}} - Current time (HH:mm:ss)
- {{DATETIME}} - Current date and time
- {{TIMESTAMP}} - Unix timestamp
- {{UUID}} - Generate unique ID
- {{RANDOM}} - Random number (0-999999)
- {{DAYNAME}} - Day name (MONDAY, etc.)
- {{MONTHNAME}} - Month name (JANUARY, etc.)

## Time Functions
- {{time.date}} - YYYY-MM-DD
- {{time.time}} - HH:mm:ss
- {{time.iso}} - ISO 8601 timestamp
- {{time.year}}, {{time.month}}, {{time.day}}, {{time.hour}}
- {{time.weekday}} - Day name
`
};

class FlowSchemaRAG {
  constructor() {
    this.libraryId = null;
    this.folderId = null;
    this.initialized = false;
    this.lastSyncStats = {
      created: 0,
      updated: 0,
      unchanged: 0,
      lastSyncAt: null
    };
  }

  /**
   * Initialize the FlowBuilder Schema folder within SWARM AI library
   * Called on server startup
   *
   * Structure: SWARM AI (library) -> FlowBuilder Schema (folder)
   */
  async initialize() {
    if (this.initialized) return;

    try {
      const db = getDatabase();

      // Ensure system user exists
      this.ensureSystemUser(db);

      // Find or create the parent "SWARM AI" library
      let library = db.prepare(`
        SELECT id FROM knowledge_libraries
        WHERE name = ? AND user_id = ?
      `).get(PARENT_LIBRARY_NAME, SYSTEM_USER_ID);

      if (!library) {
        this.libraryId = uuidv4();
        db.prepare(`
          INSERT INTO knowledge_libraries (id, user_id, name, description, created_at, updated_at)
          VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
        `).run(this.libraryId, SYSTEM_USER_ID, PARENT_LIBRARY_NAME, PARENT_LIBRARY_DESCRIPTION);
        logger.info(`[FlowSchemaRAG] Created parent library: ${PARENT_LIBRARY_NAME}`);
      } else {
        this.libraryId = library.id;
      }

      // Find or create the "FlowBuilder Schema" folder
      let folder = db.prepare(`
        SELECT id FROM knowledge_folders
        WHERE library_id = ? AND name = ? AND parent_id IS NULL
      `).get(this.libraryId, FOLDER_NAME);

      if (!folder) {
        this.folderId = uuidv4();
        db.prepare(`
          INSERT INTO knowledge_folders (id, library_id, parent_id, name, created_at)
          VALUES (?, ?, NULL, ?, datetime('now'))
        `).run(this.folderId, this.libraryId, FOLDER_NAME);
        logger.info(`[FlowSchemaRAG] Created folder: ${PARENT_LIBRARY_NAME} -> ${FOLDER_NAME}`);
      } else {
        this.folderId = folder.id;
      }

      // Update schemas
      await this.updateSchemas();

      this.initialized = true;
      logger.info(`[FlowSchemaRAG] Initialized: ${PARENT_LIBRARY_NAME} -> ${FOLDER_NAME} (folder: ${this.folderId})`);

    } catch (error) {
      logger.error(`[FlowSchemaRAG] Failed to initialize: ${error.message}`);
    }
  }

  /**
   * Ensure system user exists
   */
  ensureSystemUser(db) {
    const existing = db.prepare('SELECT id FROM users WHERE id = ?').get(SYSTEM_USER_ID);
    if (!existing) {
      db.prepare(`
        INSERT INTO users (id, email, password_hash, name, role, created_at, updated_at)
        VALUES (?, 'system@internal', '', 'System', 'admin', datetime('now'), datetime('now'))
      `).run(SYSTEM_USER_ID);
      logger.info('[FlowSchemaRAG] Created system user');
    }
  }

  /**
   * Calculate hash for schema to detect changes
   * Includes SCHEMA_FORMAT_VERSION to force resync when document format changes
   */
  calculateSchemaHash(schema) {
    const hashInput = JSON.stringify({ ...schema, _formatVersion: SCHEMA_FORMAT_VERSION });
    return crypto.createHash('md5').update(hashInput).digest('hex');
  }

  /**
   * Update schemas in the knowledge library
   */
  async updateSchemas() {
    const db = getDatabase();
    const retrieval = getRetrievalService();

    let updated = 0;
    let created = 0;

    // Process each node schema
    for (const [nodeType, schema] of Object.entries(NODE_SCHEMAS)) {
      const docTitle = `Node: ${schema.title} (${nodeType})`;
      const content = this.formatSchemaDocument(nodeType, schema);
      const hash = this.calculateSchemaHash(schema);

      // Check if document exists and if it needs updating (query by folder_id for isolation)
      const existing = db.prepare(`
        SELECT id, metadata FROM knowledge_documents
        WHERE library_id = ? AND folder_id = ? AND title = ?
      `).get(this.libraryId, this.folderId, docTitle);

      if (existing) {
        const existingMeta = JSON.parse(existing.metadata || '{}');
        if (existingMeta.schemaHash === hash) {
          continue; // No changes
        }
        // Delete old document and re-ingest
        db.prepare('DELETE FROM knowledge_documents WHERE id = ?').run(existing.id);
        updated++;
      } else {
        created++;
      }

      // Ingest document with folderId for proper organization
      await retrieval.ingestDocument({
        title: docTitle,
        content,
        folderId: this.folderId, // Associate with FlowBuilder Schema folder
        sourceType: 'system',
        metadata: {
          nodeType,
          category: schema.category,
          schemaHash: hash,
          autoGenerated: true
        }
      }, this.libraryId, {
        userId: SYSTEM_USER_ID,
        chunkStrategy: 'paragraph',
        chunkSize: 800
      });
    }

    // Add variable reference document
    await this.updateVariableReference(db, retrieval);

    // Track sync stats
    const unchanged = Object.keys(NODE_SCHEMAS).length - created - updated;
    this.lastSyncStats = {
      created,
      updated,
      unchanged,
      totalSchemas: Object.keys(NODE_SCHEMAS).length + 1, // +1 for variable reference
      lastSyncAt: new Date().toISOString()
    };

    if (created > 0 || updated > 0) {
      logger.info(`[FlowSchemaRAG] Schema sync: ${created} created, ${updated} updated`);
    }
  }

  /**
   * Update variable reference document
   */
  async updateVariableReference(db, retrieval) {
    const docTitle = 'FlowBuilder Variable Reference';
    const hash = this.calculateSchemaHash(VARIABLE_REFERENCE);

    const existing = db.prepare(`
      SELECT id, metadata FROM knowledge_documents
      WHERE library_id = ? AND folder_id = ? AND title = ?
    `).get(this.libraryId, this.folderId, docTitle);

    if (existing) {
      const existingMeta = JSON.parse(existing.metadata || '{}');
      if (existingMeta.schemaHash === hash) {
        return; // No changes
      }
      db.prepare('DELETE FROM knowledge_documents WHERE id = ?').run(existing.id);
    }

    await retrieval.ingestDocument({
      title: docTitle,
      content: VARIABLE_REFERENCE.content,
      folderId: this.folderId, // Associate with FlowBuilder Schema folder
      sourceType: 'system',
      metadata: {
        type: 'variable_reference',
        schemaHash: hash,
        autoGenerated: true
      }
    }, this.libraryId, {
      userId: SYSTEM_USER_ID,
      chunkStrategy: 'paragraph',
      chunkSize: 800
    });
  }

  /**
   * Get the correct subtype for executor mapping
   * Maps FlowSchemaRAG keys to frontend subtypes
   */
  getExecutorSubtype(nodeType) {
    const subtypeMap = {
      // Triggers - subtype matches key suffix
      'trigger:manual': 'manual',
      'trigger:schedule': 'schedule',
      'trigger:webhook': 'webhook',
      'trigger:message_received': 'message_received',
      'trigger:email_received': 'email_received',
      'trigger:event': 'event',
      // AI nodes - use ai_ prefix for executor compatibility
      'ai:response': 'ai_response',
      'ai:rag_query': 'ai_with_rag',
      'ai:classify': 'ai_classify',
      'ai:translate': 'ai_translate',
      'ai:summarize': 'ai_summarize',
      'ai:rephrase': 'ai_rephrase',
      'ai:superbrain': 'superbrain',
      'ai:sentiment': 'sentiment_analysis',
      'ai:extract_entities': 'extract_entities',
      'ai:summarize_memory': 'summarize_memory',
      'ai:router': 'ai_router',
      'ai:claude_cli': 'ai_claude_cli',
      'ai:gemini_cli': 'ai_gemini_cli',
      'ai:opencode_cli': 'ai_opencode_cli',
      // Logic - subtype matches key suffix
      'logic:condition': 'condition',
      'logic:loop': 'loop',
      'logic:switch': 'switch',
      'logic:delay': 'delay',
      'logic:set_variable': 'set_variable',
      'logic:error_handler': 'error_handler',
      'logic:parallel': 'parallel',
      'logic:merge': 'merge',
      'logic:retry': 'retry',
      // Actions - basic
      'action:send_message': 'send_message',
      'action:http_request': 'http_request',
      'action:subflow': 'subflow',
      'action:send_email': 'send_email',
      'action:transform': 'transform',
      'action:wait_for_event': 'wait_for_event',
      // Actions - file operations
      'action:file_read': 'file_read',
      'action:file_write': 'file_write',
      'action:file_list': 'file_list',
      'action:file_delete': 'file_delete',
      // Actions - web operations
      'action:web_fetch': 'web_fetch',
      'action:web_scrape': 'web_scrape',
      // Actions - data operations
      'action:data_transform': 'data_transform',
      'action:data_validate': 'data_validate',
      // Actions - scheduler
      'action:scheduler_create': 'scheduler_create',
      'action:scheduler_list': 'scheduler_list',
      'action:scheduler_update': 'scheduler_update',
      'action:scheduler_delete': 'scheduler_delete',
      'action:scheduler_get_next': 'scheduler_get_next',
      // Messaging - platform specific
      'messaging:send_whatsapp': 'send_whatsapp',
      'messaging:send_telegram': 'send_telegram',
      'messaging:send_media': 'send_media',
      'messaging:wait_for_reply': 'wait_for_reply',
      // Data
      'data:query': 'data_query',
      'data:insert': 'data_insert',
      'data:update': 'data_update',
      // Swarm
      'swarm:agent_query': 'agent_query',
      'swarm:broadcast': 'swarm_broadcast',
      'swarm:consensus': 'swarm_consensus',
      'swarm:agent_handoff': 'agent_handoff',
      'swarm:task': 'swarm_task',
      'swarm:find_agent': 'find_agent',
      'swarm:status': 'swarm_status',
      // MCP
      'mcp:tool': 'mcp_tool',
      'mcp:resource': 'mcp_resource'
    };
    return subtypeMap[nodeType] || nodeType.split(':')[1];
  }

  /**
   * Format schema as readable document
   */
  formatSchemaDocument(nodeType, schema) {
    let doc = `# ${schema.title}\n\n`;
    doc += `**Type:** ${nodeType}\n`;
    doc += `**Category:** ${schema.category}\n\n`;
    doc += `## Description\n${schema.description}\n\n`;

    // Add CRITICAL JSON format section
    const subtype = this.getExecutorSubtype(nodeType);
    doc += `## CRITICAL: JSON Node Format\n`;
    doc += `When generating flows, use this EXACT format:\n`;
    doc += `\`\`\`json\n`;
    doc += `{\n`;
    doc += `  "id": "${schema.category}_1",\n`;
    doc += `  "type": "${schema.category}",\n`;
    doc += `  "position": { "x": 250, "y": 50 },\n`;
    doc += `  "data": {\n`;
    doc += `    "label": "${schema.title}",\n`;
    doc += `    "subtype": "${subtype}",\n`;
    doc += `    "config": {\n`;
    // Add example config with required fields
    const requiredFields = schema.config.fields.filter(f => f.required);
    if (requiredFields.length > 0) {
      const configExamples = requiredFields.map(f => {
        let exampleValue = f.help || 'value';
        if (f.type === 'variable') exampleValue = '{{input.message}}';
        if (f.type === 'number') exampleValue = f.default || 100;
        if (f.type === 'boolean') exampleValue = f.default !== undefined ? f.default : true;
        if (f.type === 'select' && f.options) exampleValue = f.options[0];
        if (typeof exampleValue === 'string') exampleValue = `"${exampleValue}"`;
        return `      "${f.name}": ${exampleValue}`;
      });
      doc += configExamples.join(',\n') + '\n';
    }
    doc += `    }\n`;
    doc += `  }\n`;
    doc += `}\n`;
    doc += `\`\`\`\n\n`;

    doc += `## Configuration Fields\n`;
    for (const field of schema.config.fields) {
      doc += `- **${field.name}** (${field.type})`;
      if (field.required) doc += ' [REQUIRED]';
      if (field.default !== undefined) doc += ` [default: ${field.default}]`;
      doc += `\n`;
      if (field.help) doc += `  ${field.help}\n`;
      if (field.options) doc += `  Options: ${field.options.join(', ')}\n`;
    }

    doc += `\n## Outputs\n`;
    for (const output of schema.outputs) {
      doc += `- **${output.name}** (${output.type}): ${output.description}\n`;
    }

    doc += `\n## Variable Access\n${schema.variableAccess}\n`;

    if (schema.shorthandVariables) {
      doc += `\n## Shorthand Variables\n`;
      for (const [varName, desc] of Object.entries(schema.shorthandVariables)) {
        doc += `- ${varName}: ${desc}\n`;
      }
    }

    if (schema.edgeNotes) {
      doc += `\n## Edge Notes\n${schema.edgeNotes}\n`;
    }

    return doc;
  }

  /**
   * Query RAG for node schemas relevant to a prompt
   * @param {string} prompt - User's flow generation prompt
   * @param {number} limit - Max results
   * @returns {Promise<Array>} Relevant schema documents
   */
  async querySchemas(prompt, limit = 5) {
    if (!this.initialized || !this.libraryId) {
      await this.initialize();
    }

    const retrieval = getRetrievalService();

    const { chunks } = await retrieval.retrieve(prompt, {
      libraryIds: [this.libraryId],
      topK: limit,
      minScore: 0.3
    });

    return chunks.map(r => ({
      content: r.text,
      score: r.score,
      nodeType: r.metadata?.nodeType,
      category: r.metadata?.category
    }));
  }

  /**
   * Get the library ID
   */
  getLibraryId() {
    return this.libraryId;
  }

  /**
   * Get the folder ID
   */
  getFolderId() {
    return this.folderId;
  }

  /**
   * Get all node schemas (for non-RAG use cases)
   */
  getNodeSchemas() {
    return NODE_SCHEMAS;
  }

  /**
   * Get status information for superadmin visibility
   */
  getStatus() {
    const db = getDatabase();

    // Get document count from folder (not entire library)
    let documentCount = 0;
    let chunkCount = 0;
    let libraryInfo = null;
    let folderInfo = null;

    if (this.libraryId && this.folderId) {
      // Count documents in the FlowBuilder Schema folder only
      const docStats = db.prepare(`
        SELECT COUNT(*) as count FROM knowledge_documents
        WHERE library_id = ? AND folder_id = ?
      `).get(this.libraryId, this.folderId);
      documentCount = docStats?.count || 0;

      // Sum chunk_count from documents in the FlowBuilder Schema folder
      // (chunks are stored in Qdrant, not SQLite - we track count in documents table)
      const chunkStats = db.prepare(`
        SELECT COALESCE(SUM(chunk_count), 0) as count FROM knowledge_documents
        WHERE library_id = ? AND folder_id = ?
      `).get(this.libraryId, this.folderId);
      chunkCount = chunkStats?.count || 0;

      libraryInfo = db.prepare(`
        SELECT id, name, description, created_at, updated_at
        FROM knowledge_libraries WHERE id = ?
      `).get(this.libraryId);

      folderInfo = db.prepare(`
        SELECT id, name, created_at
        FROM knowledge_folders WHERE id = ?
      `).get(this.folderId);
    }

    // Get node schema categories breakdown
    const categories = {};
    for (const [nodeType, schema] of Object.entries(NODE_SCHEMAS)) {
      const cat = schema.category;
      if (!categories[cat]) {
        categories[cat] = [];
      }
      categories[cat].push({
        type: nodeType,
        title: schema.title
      });
    }

    return {
      initialized: this.initialized,
      libraryId: this.libraryId,
      folderId: this.folderId,
      libraryInfo,
      folderInfo,
      lastSyncStats: this.lastSyncStats,
      currentStats: {
        totalNodeSchemas: Object.keys(NODE_SCHEMAS).length,
        documentsInFolder: documentCount,
        chunksInFolder: chunkCount,
        categories: Object.keys(categories).length
      },
      schemasByCategory: categories,
      systemUserId: SYSTEM_USER_ID,
      libraryName: PARENT_LIBRARY_NAME,
      folderName: FOLDER_NAME
    };
  }

  /**
   * Force re-sync all schemas (for superadmin use)
   * Only clears documents in the FlowBuilder Schema folder, not the entire SWARM AI library
   */
  async forceResync() {
    const db = getDatabase();

    // Delete only documents in the FlowBuilder Schema folder (preserve other folders)
    if (this.libraryId && this.folderId) {
      db.prepare(`
        DELETE FROM knowledge_documents WHERE library_id = ? AND folder_id = ?
      `).run(this.libraryId, this.folderId);

      logger.info(`[FlowSchemaRAG] Cleared folder "${FOLDER_NAME}" for force resync`);
    }

    // Re-update all schemas
    await this.updateSchemas();

    return this.lastSyncStats;
  }
}

// Singleton instance
let instance = null;

function getFlowSchemaRAG() {
  if (!instance) {
    instance = new FlowSchemaRAG();
  }
  return instance;
}

module.exports = {
  FlowSchemaRAG,
  getFlowSchemaRAG,
  NODE_SCHEMAS,
  VARIABLE_REFERENCE,
  // Export constants for future folders in SWARM AI library
  PARENT_LIBRARY_NAME,
  PARENT_LIBRARY_DESCRIPTION,
  FOLDER_NAME,
  SYSTEM_USER_ID
};
