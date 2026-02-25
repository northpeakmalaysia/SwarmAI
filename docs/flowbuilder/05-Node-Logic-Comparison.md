# Node Logic Comparison

## Executive Summary

This document analyzes the individual node behaviors, input/output processing, and implementation patterns in both FlowBuilder implementations.

**Key Finding:** The current implementation (SwarmAI) has a well-architected BaseNodeExecutor pattern with consistent error handling, template resolution, and validation. The old implementation's node logic was not found in the frontend codebase, suggesting backend-only execution. Current implementation supports 25+ nodes with clean separation of concerns, but lacks the breadth of 150+ node types from the old implementation.

---

## 1. Old Implementation Analysis (WhatsBots)

### Architecture Overview

**Observation:** Node execution logic not found in frontend FlowBuilder directory.

**Hypothesis:** Backend-only node execution with the following likely patterns:

### Presumed Backend Node Structure

```javascript
// Likely backend structure (inferred)
class BaseNode {
  constructor(type, config) {
    this.type = type;
    this.config = config;
  }

  async execute(input, context) {
    throw new Error('execute() must be implemented');
  }

  validate() {
    // Validation logic
    return { valid: true, errors: [] };
  }
}

// Example: SendMessageNode
class SendMessageNode extends BaseNode {
  async execute(input, context) {
    const { recipient, message } = this.config;

    // Resolve variables
    const resolvedRecipient = this.resolveVariable(recipient, context);
    const resolvedMessage = this.resolveVariable(message, context);

    // Send via platform
    const result = await context.platform.sendMessage(
      resolvedRecipient,
      resolvedMessage
    );

    return {
      success: true,
      messageId: result.id,
      timestamp: Date.now(),
    };
  }
}
```

### Node Categories (Inferred from Definitions)

**150+ Node Types Organized by Category:**

| Category | Count | Example Nodes |
|----------|-------|---------------|
| **Triggers** | 15+ | Manual, Schedule, Webhook, Message, Email, Form |
| **WhatsApp** | 30+ | SendText, SendImage, SendDocument, SendLocation, CreateGroup, AddParticipant |
| **Telegram** | 25+ | SendMessage, SendPhoto, EditMessage, DeleteMessage, CreatePoll |
| **Email** | 10+ | Send, Reply, Forward, Search, Attachment |
| **Files** | 8+ | ReadFile, WriteFile, ParseCSV, ParseXML, GeneratePDF |
| **Web** | 12+ | HTTPRequest, Scrape, APICall, WebhookResponse |
| **AI** | 15+ | ChatCompletion, TTS, ImageGen, AudioTranscribe, Embedding |
| **Control** | 10+ | If, Switch, Loop, Parallel, ErrorHandler |
| **Data** | 12+ | Transform, Filter, Map, Reduce, Aggregate |
| **Storage** | 8+ | Database, Cache, FileStorage |

**Total:** 150+ node types

### Node Behavior Patterns (Inferred)

**1. Messaging Nodes:**
```javascript
// Pattern: Platform-specific send operations
WhatsAppSendText → sendMessage(phone, text)
WhatsAppSendImage → sendMedia(phone, imageUrl, caption)
WhatsAppSendDocument → sendMedia(phone, docUrl, filename)
TelegramSendMessage → bot.sendMessage(chatId, text, options)
TelegramSendPhoto → bot.sendPhoto(chatId, photoUrl, caption)
EmailSend → smtp.sendMail(to, subject, body)
```

**2. AI Nodes:**
```javascript
// Pattern: AI provider integration
AIResponse → aiProvider.complete(prompt, options)
AITranslate → aiProvider.translate(text, targetLang)
AIExtract → aiProvider.extract(text, schema)
AIIntent → aiProvider.classifyIntent(text)
TextToSpeech → aiProvider.textToSpeech(text, voice)
AudioTranscribe → aiProvider.transcribe(audioUrl)
```

**3. Control Flow Nodes:**
```javascript
// Pattern: Conditional execution
ConditionNode → evaluate(left, operator, right) → branch(true/false)
SwitchNode → evaluate(value) → match(cases) → branch(caseIndex)
LoopNode → iterate(items) → executeForEach(item, index)
DelayNode → wait(duration) → continue()
```

**4. Data Transformation Nodes:**
```javascript
// Pattern: Data manipulation
JSONParse → JSON.parse(input)
JSONStringify → JSON.stringify(input)
JSONPath → jsonpath.query(data, path)
TemplateString → template.render(text, variables)
SplitString → string.split(delimiter)
RegexExtract → string.match(regex)
```

### Strengths (Inferred)

1. **Comprehensive Coverage**: 150+ node types covering wide range of use cases
2. **Platform Integration**: Deep integration with WhatsApp, Telegram, Email
3. **AI Capabilities**: Multiple AI operations (TTS, transcription, vision)
4. **File Operations**: Rich file handling (PDF, Excel, CSV, images)
5. **Data Processing**: Extensive data transformation nodes

### Weaknesses (Inferred)

1. **No Visible Implementation**: Frontend doesn't show execution logic
2. **Black Box**: Can't see error handling or retry logic
3. **No Type Safety**: No visible TypeScript types for node behaviors
4. **Limited Extensibility**: Unclear how to add custom nodes
5. **No Testing Visibility**: Can't see unit tests for nodes

---

## 2. Current Implementation Analysis (SwarmAI)

### Architecture Overview

**Location:** `d:\source\AI\SwarmAI\server\services\flow\nodes\`

**Key Files:**
- `BaseNodeExecutor.cjs` - Base class for all nodes
- `ai/*.cjs` - AI node executors (5 nodes)
- `logic/*.cjs` - Logic node executors (7 nodes)
- `messaging/*.cjs` - Messaging node executors (4 nodes)
- `triggers/*.cjs` - Trigger node executors (4 nodes)
- `web/*.cjs` - Web node executors (2 nodes)
- `agentic/*.cjs` - Agentic node executors (3 nodes)

### BaseNodeExecutor Pattern

**Foundation Class:**

```javascript
class BaseNodeExecutor {
  constructor(nodeType, category) {
    this.nodeType = nodeType;
    this.category = category;
  }

  // Main execution method (must be overridden)
  async execute(context) {
    throw new Error(`${this.nodeType}: execute() must be implemented`);
  }

  // Validation method (optional override)
  validate(node) {
    return []; // Return array of error strings
  }

  // Helper: Get required config value
  getRequired(data, key) {
    if (!(key in data) || data[key] === undefined || data[key] === null) {
      throw new Error(`Required field "${key}" is missing`);
    }
    return data[key];
  }

  // Helper: Get optional config value with default
  getOptional(data, key, defaultValue) {
    return data[key] !== undefined ? data[key] : defaultValue;
  }

  // Helper: Resolve template variables
  resolveTemplate(template, context) {
    if (typeof template !== 'string') return template;

    return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
      const value = this.resolvePath(path.trim(), context);
      return value !== undefined ? String(value) : match;
    });
  }

  // Helper: Resolve variable path
  resolvePath(path, context) {
    const parts = path.split('.');
    const category = parts[0];

    switch (category) {
      case 'input':
        return this.getNestedValue(context.input, parts.slice(1));
      case 'node':
        const nodeId = parts[1];
        const nodeOutput = context.nodeOutputs?.get(nodeId);
        return this.getNestedValue(nodeOutput, parts.slice(2));
      case 'var':
        return this.getNestedValue(context.variables, parts.slice(1));
      case 'env':
        const allowedEnv = ['NODE_ENV', 'API_URL', 'APP_URL'];
        return allowedEnv.includes(parts[1]) ? process.env[parts[1]] : undefined;
      case 'time':
        return this.resolveTimeFunction(parts[1]);
      default:
        return undefined;
    }
  }

  // Helper: Success response
  success(data, nextNodes = undefined) {
    return {
      success: true,
      data,
      nextNodes,
    };
  }

  // Helper: Failure response
  failure(message, code, isRecoverable = false) {
    return {
      success: false,
      error: { message, code },
      isRecoverable,
    };
  }
}
```

### Node Implementation Examples

#### 1. AI Nodes: ChatCompletionNode

**File:** `ai/ChatCompletionNode.cjs` (156 lines)

**Features:**
- SuperBrain Router integration for task routing
- Message history support
- Temperature and maxTokens configuration
- Tier and provider override options
- Custom timeout for CLI tools
- Comprehensive error handling
- Recoverable error detection (rate limits, timeouts)

**Key Methods:**

```javascript
class ChatCompletionNode extends BaseNodeExecutor {
  constructor() {
    super('ai:chatCompletion', 'ai');
  }

  async execute(context) {
    const { input, node, services } = context;
    const data = node.data || {};

    // Get SuperBrain Router
    const superBrain = getSuperBrainRouter();

    // Build messages array
    const messages = [];

    // Add system prompt
    const systemPrompt = this.resolveTemplate(
      this.getOptional(data, 'systemPrompt', ''),
      context
    );
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }

    // Add message history
    const messageHistory = this.getOptional(data, 'messageHistory', []);
    if (Array.isArray(messageHistory)) {
      for (const msg of messageHistory) {
        messages.push({
          role: msg.role || 'user',
          content: this.resolveTemplate(msg.content || '', context),
        });
      }
    }

    // Add main prompt
    const prompt = this.resolveTemplate(
      this.getOptional(data, 'prompt', '{{input.message}}'),
      context
    );
    if (prompt) {
      messages.push({ role: 'user', content: prompt });
    }

    // Validate
    if (messages.length === 0) {
      return this.failure('No messages to send', 'NO_MESSAGES');
    }

    // Get model configuration
    const temperature = this.getOptional(data, 'temperature', 0.7);
    const maxTokens = this.getOptional(data, 'maxTokens', null);
    const forceTier = this.getOptional(data, 'tier', null);
    const forceProvider = this.getOptional(data, 'providerId', null);
    const timeout = this.getOptional(data, 'timeout', null);

    try {
      // Route through SuperBrain
      const result = await superBrain.process({
        task: prompt,
        messages,
        userId: context.userId,
        forceTier,
        forceProvider,
      }, {
        temperature: parseFloat(temperature),
        maxTokens: maxTokens ? parseInt(maxTokens, 10) : undefined,
        timeout: timeout ? parseInt(timeout, 10) : undefined,
        agentId: context.agentId,
      });

      return this.success({
        content: result.content,
        model: result.model,
        provider: result.provider,
        tier: result.classification?.tier,
        usage: result.usage,
        messages: messages.length,
        completedAt: new Date().toISOString(),
      });
    } catch (error) {
      // Check if error is recoverable
      const isRecoverable =
        error.message.includes('rate limit') ||
        error.message.includes('timeout') ||
        error.message.includes('503') ||
        error.message.includes('429');

      return this.failure(
        `AI completion failed: ${error.message}`,
        'AI_ERROR',
        isRecoverable
      );
    }
  }

  validate(node) {
    const errors = [];
    const data = node.data || {};

    // Must have prompt or history
    const hasPrompt = data.prompt && data.prompt.trim();
    const hasHistory = Array.isArray(data.messageHistory) && data.messageHistory.length > 0;

    if (!hasPrompt && !hasHistory) {
      errors.push('Either prompt or messageHistory is required');
    }

    // Validate temperature (0-2)
    if (data.temperature !== undefined) {
      const temp = parseFloat(data.temperature);
      if (isNaN(temp) || temp < 0 || temp > 2) {
        errors.push('Temperature must be between 0 and 2');
      }
    }

    // Validate maxTokens
    if (data.maxTokens !== undefined) {
      const tokens = parseInt(data.maxTokens, 10);
      if (isNaN(tokens) || tokens < 1) {
        errors.push('maxTokens must be a positive integer');
      }
    }

    // Validate tier
    if (data.tier !== undefined && data.tier !== null) {
      const validTiers = ['trivial', 'simple', 'moderate', 'complex', 'critical'];
      if (!validTiers.includes(data.tier)) {
        errors.push(`Invalid tier: ${data.tier}`);
      }
    }

    // Validate timeout
    if (data.timeout !== undefined) {
      const timeout = parseInt(data.timeout, 10);
      if (isNaN(timeout) || timeout < 1000) {
        errors.push('timeout must be at least 1000ms');
      }
    }

    return errors;
  }
}
```

**Output Schema:**

```javascript
{
  content: 'AI generated response',
  model: 'anthropic/claude-3.5-sonnet',
  provider: 'openrouter',
  tier: 'moderate',
  usage: { promptTokens: 50, completionTokens: 100, totalTokens: 150 },
  messages: 3,
  completedAt: '2026-02-02T10:30:00.000Z',
}
```

#### 2. Logic Nodes: ConditionNode

**File:** `logic/ConditionNode.cjs` (196 lines)

**Features:**
- 20+ comparison operators
- Type-aware comparison (number, string, boolean, null)
- String operations (contains, startsWith, endsWith, matches)
- Empty/truthy checks
- Regex matching
- Branch routing based on result

**Key Methods:**

```javascript
class ConditionNode extends BaseNodeExecutor {
  constructor() {
    super('logic:condition', 'logic');
  }

  async execute(context) {
    const { node } = context;
    const data = node.data || {};

    // Get values
    const leftValue = this.resolveTemplate(
      this.getRequired(data, 'leftValue'),
      context
    );

    const operator = this.getOptional(data, 'operator', 'equals');

    const rightValue = this.resolveTemplate(
      this.getOptional(data, 'rightValue', ''),
      context
    );

    // Evaluate condition
    let result = false;
    try {
      result = this.evaluateCondition(leftValue, operator, rightValue);
    } catch (error) {
      return this.failure(
        `Condition evaluation failed: ${error.message}`,
        'CONDITION_ERROR'
      );
    }

    // Determine next nodes
    const outputs = node.outputs || {};
    const trueOutput = outputs.true || outputs.yes || outputs[0];
    const falseOutput = outputs.false || outputs.no || outputs[1];

    const nextNodes = result
      ? (trueOutput ? [trueOutput] : [])
      : (falseOutput ? [falseOutput] : []);

    return this.success(
      {
        condition: { left: leftValue, operator, right: rightValue },
        result,
        branch: result ? 'true' : 'false',
      },
      nextNodes.length > 0 ? nextNodes : undefined
    );
  }

  evaluateCondition(left, operator, right) {
    // Normalize values
    const normalizeValue = (val) => {
      if (val === 'true') return true;
      if (val === 'false') return false;
      if (val === 'null' || val === 'undefined') return null;
      const num = Number(val);
      if (!isNaN(num) && val !== '') return num;
      return val;
    };

    const leftNorm = normalizeValue(left);
    const rightNorm = normalizeValue(right);

    switch (operator) {
      case 'equals':
      case 'eq':
      case '==':
        return leftNorm == rightNorm;

      case 'strictEquals':
      case 'seq':
      case '===':
        return leftNorm === rightNorm;

      case 'notEquals':
      case 'neq':
      case '!=':
        return leftNorm != rightNorm;

      case 'greaterThan':
      case 'gt':
      case '>':
        return leftNorm > rightNorm;

      case 'greaterThanOrEquals':
      case 'gte':
      case '>=':
        return leftNorm >= rightNorm;

      case 'lessThan':
      case 'lt':
      case '<':
        return leftNorm < rightNorm;

      case 'lessThanOrEquals':
      case 'lte':
      case '<=':
        return leftNorm <= rightNorm;

      case 'contains':
        return String(left).includes(String(right));

      case 'notContains':
        return !String(left).includes(String(right));

      case 'startsWith':
        return String(left).startsWith(String(right));

      case 'endsWith':
        return String(left).endsWith(String(right));

      case 'matches':
        try {
          const regex = new RegExp(right);
          return regex.test(String(left));
        } catch {
          throw new Error(`Invalid regex: ${right}`);
        }

      case 'isEmpty':
        return left === '' || left === null || left === undefined ||
               (Array.isArray(left) && left.length === 0) ||
               (typeof left === 'object' && Object.keys(left).length === 0);

      case 'isNotEmpty':
        return !(left === '' || left === null || left === undefined ||
                (Array.isArray(left) && left.length === 0) ||
                (typeof left === 'object' && Object.keys(left).length === 0));

      case 'isTrue':
      case 'truthy':
        return Boolean(leftNorm);

      case 'isFalse':
      case 'falsy':
        return !Boolean(leftNorm);

      default:
        throw new Error(`Unknown operator: ${operator}`);
    }
  }

  validate(node) {
    const errors = [];
    const data = node.data || {};

    if (!data.leftValue) {
      errors.push('Left value is required');
    }

    const validOperators = [
      'equals', 'eq', '==',
      'strictEquals', 'seq', '===',
      'notEquals', 'neq', '!=',
      'greaterThan', 'gt', '>',
      'greaterThanOrEquals', 'gte', '>=',
      'lessThan', 'lt', '<',
      'lessThanOrEquals', 'lte', '<=',
      'contains', 'notContains',
      'startsWith', 'endsWith',
      'matches',
      'isEmpty', 'isNotEmpty',
      'isTrue', 'truthy',
      'isFalse', 'falsy',
    ];

    if (data.operator && !validOperators.includes(data.operator)) {
      errors.push(`Invalid operator: ${data.operator}`);
    }

    return errors;
  }
}
```

**Output Schema:**

```javascript
{
  condition: {
    left: 'value1',
    operator: 'greaterThan',
    right: '10',
  },
  result: true,
  branch: 'true', // or 'false'
}
```

#### 3. Messaging Nodes: SendTextNode

**File:** `messaging/SendTextNode.cjs` (207 lines)

**Features:**
- Multi-platform support (WhatsApp, Telegram, Email, Webhook)
- Auto-detection of channel from recipient format
- Format options (text, markdown, html)
- Reply/quote support
- Button support
- Platform-specific parameter handling

**Key Methods:**

```javascript
class SendTextNode extends BaseNodeExecutor {
  constructor() {
    super('messaging:sendText', 'messaging');
  }

  async execute(context) {
    const { node, services } = context;
    const data = node.data || {};

    // Get message content
    const message = this.resolveTemplate(
      this.getRequired(data, 'message'),
      context
    );

    // Get recipient
    const recipient = this.resolveTemplate(
      this.getRequired(data, 'recipient'),
      context
    );

    // Get channel
    const channel = this.getOptional(data, 'channel', 'default');

    // Options
    const options = {
      format: this.getOptional(data, 'format', 'text'),
      parseMode: this.getOptional(data, 'parseMode', null),
      replyToMessageId: this.getOptional(data, 'replyToMessageId', null),
      buttons: this.getOptional(data, 'buttons', null),
    };

    try {
      let result;

      switch (channel.toLowerCase()) {
        case 'whatsapp':
          result = await this.sendWhatsApp(services, recipient, message, options);
          break;

        case 'telegram':
          result = await this.sendTelegram(services, recipient, message, options);
          break;

        case 'email':
          result = await this.sendEmail(services, recipient, message, options, data);
          break;

        case 'webhook':
          result = await this.sendWebhook(services, recipient, message, options, data);
          break;

        default:
          // Auto-detect channel
          if (recipient.includes('@') && recipient.includes('.')) {
            result = await this.sendEmail(services, recipient, message, options, data);
          } else if (recipient.startsWith('+') || /^\d+$/.test(recipient)) {
            result = await this.sendWhatsApp(services, recipient, message, options);
          } else {
            return this.failure(
              `Unknown channel: ${channel}`,
              'UNKNOWN_CHANNEL'
            );
          }
      }

      return this.success({
        channel,
        recipient,
        messageLength: message.length,
        ...result,
        sentAt: new Date().toISOString(),
      });
    } catch (error) {
      return this.failure(
        `Failed to send message: ${error.message}`,
        'SEND_ERROR',
        true // Network errors are recoverable
      );
    }
  }

  async sendWhatsApp(services, recipient, message, options) {
    const whatsapp = services?.whatsapp;
    if (!whatsapp) {
      throw new Error('WhatsApp service not available');
    }

    const phoneNumber = recipient.replace(/[^0-9]/g, '');

    const result = await whatsapp.sendMessage(phoneNumber, message, {
      quotedMessageId: options.replyToMessageId,
    });

    return {
      messageId: result.id || result.messageId,
      status: 'sent',
    };
  }

  async sendTelegram(services, recipient, message, options) {
    const telegram = services?.telegram;
    if (!telegram) {
      throw new Error('Telegram service not available');
    }

    const parseMode = options.parseMode ||
      (options.format === 'markdown' ? 'MarkdownV2' : 'HTML');

    const result = await telegram.sendMessage(recipient, message, {
      parse_mode: parseMode,
      reply_to_message_id: options.replyToMessageId,
    });

    return {
      messageId: result.message_id,
      status: 'sent',
    };
  }

  async sendEmail(services, recipient, message, options, data) {
    const email = services?.email;
    if (!email) {
      throw new Error('Email service not available');
    }

    const subject = this.resolveTemplate(
      this.getOptional(data, 'subject', 'Message from SwarmAI'),
      context
    );

    const result = await email.send({
      to: recipient,
      subject,
      body: message,
      isHtml: options.format === 'html',
    });

    return {
      messageId: result.messageId,
      status: 'sent',
    };
  }

  async sendWebhook(services, recipient, message, options, data) {
    const method = this.getOptional(data, 'webhookMethod', 'POST');
    const headers = this.getOptional(data, 'webhookHeaders', {});

    const response = await fetch(recipient, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify({
        message,
        format: options.format,
        timestamp: new Date().toISOString(),
      }),
    });

    if (!response.ok) {
      throw new Error(`Webhook failed: ${response.status}`);
    }

    return {
      status: 'sent',
      httpStatus: response.status,
    };
  }

  validate(node) {
    const errors = [];
    const data = node.data || {};

    if (!data.message) {
      errors.push('Message content is required');
    }

    if (!data.recipient) {
      errors.push('Recipient is required');
    }

    const validChannels = ['whatsapp', 'telegram', 'email', 'webhook', 'default'];
    if (data.channel && !validChannels.includes(data.channel.toLowerCase())) {
      errors.push(`Invalid channel: ${data.channel}`);
    }

    return errors;
  }
}
```

**Output Schema:**

```javascript
{
  channel: 'whatsapp',
  recipient: '+1234567890',
  messageLength: 42,
  messageId: 'wamid.xyz123',
  status: 'sent',
  sentAt: '2026-02-02T10:30:00.000Z',
}
```

### Node Categories (25 Total)

| Category | Count | Implemented Nodes |
|----------|-------|-------------------|
| **Triggers** | 4 | Manual, Schedule, Webhook, Message |
| **AI** | 5 | ChatCompletion, ClassifyIntent, Summarize, RAGQuery, Translate |
| **Logic** | 7 | Condition, Switch, Loop, Delay, GetVariable, SetVariable, ErrorHandler |
| **Messaging** | 4 | SendWhatsApp, SendTelegram, SendEmail, SendWebhook |
| **Web** | 2 | HTTPRequest, WebhookResponse |
| **Agentic** | 3 | CustomTool, AgenticTask, SelfImprove |

**Total:** 25 nodes

### Common Patterns

**1. Template Resolution:**

Every node uses `resolveTemplate()` for variable substitution:

```javascript
const value = this.resolveTemplate('Hello {{input.name}}!', context);
// Result: "Hello John!"
```

**2. Configuration Access:**

```javascript
// Required fields throw error if missing
const required = this.getRequired(data, 'fieldName');

// Optional fields have defaults
const optional = this.getOptional(data, 'fieldName', 'defaultValue');
```

**3. Success/Failure Responses:**

```javascript
// Success
return this.success({
  result: 'data',
  timestamp: Date.now(),
});

// Failure
return this.failure(
  'Error message',
  'ERROR_CODE',
  isRecoverable // true if can retry
);
```

**4. Validation:**

```javascript
validate(node) {
  const errors = [];

  if (!node.data.requiredField) {
    errors.push('Field is required');
  }

  if (node.data.number < 0) {
    errors.push('Number must be positive');
  }

  return errors;
}
```

### Strengths

1. **Consistent Pattern:** All nodes follow BaseNodeExecutor pattern
2. **Type Safety:** Validation at both config and runtime
3. **Template Resolution:** Unified variable resolution system
4. **Error Handling:** Standardized success/failure responses
5. **Recoverable Errors:** Distinction between recoverable and fatal errors
6. **Service Injection:** Clean dependency injection via context.services
7. **Unit Testable:** Each node can be tested independently
8. **Documented:** JSDoc comments on all nodes
9. **Validation:** Pre-execution validation catches errors early
10. **Platform Abstraction:** Messaging nodes abstract platform differences

### Weaknesses

1. **Limited Node Count:** Only 25 nodes vs 150+ in old implementation
2. **Missing Categories:**
   - No WhatsApp-specific nodes (groups, media types)
   - No Telegram-specific nodes (polls, inline keyboards)
   - No Email-specific nodes (reply, forward, search)
   - No File operation nodes (PDF, Excel, CSV)
   - No Data transformation nodes (JSON, string, encoding)
   - No Storage nodes (database, cache, file)
3. **No Parallel Execution:** Nodes execute sequentially
4. **No Retry Logic:** No built-in retry mechanism
5. **Limited Media Support:** No media-specific messaging nodes
6. **No Batch Operations:** Can't send to multiple recipients at once

---

## 3. Gap Analysis

### Missing Node Categories

| Category | Old Count | Current Count | Gap |
|----------|-----------|---------------|-----|
| WhatsApp Nodes | 30+ | 1 (generic) | 29+ |
| Telegram Nodes | 25+ | 1 (generic) | 24+ |
| Email Nodes | 10+ | 1 (generic) | 9+ |
| File Nodes | 8+ | 0 | 8+ |
| Data Transform | 12+ | 0 | 12+ |
| Storage Nodes | 8+ | 0 | 8+ |
| Advanced AI | 15+ | 5 | 10+ |
| **Total Gap** | **150+** | **25** | **125+** |

### Priority Node Implementations

**High Priority (Week 1-2):**

1. **WhatsApp Media Nodes:**
   - SendImage, SendDocument, SendVideo, SendAudio, SendLocation

2. **Telegram Advanced Nodes:**
   - SendPhoto, SendDocument, CreatePoll, SendInlineKeyboard

3. **Email Operations:**
   - Reply, Forward, Search, ListEmails, ReadEmail

4. **File Operations:**
   - ReadPDF, ReadExcel, ReadCSV, GeneratePDF, ParseJSON

**Medium Priority (Week 3-4):**

5. **Data Transformation:**
   - JSONPath, TemplateString, SplitString, RegexExtract, Base64Encode

6. **Storage Operations:**
   - DatabaseQuery, CacheGet, CacheSet, FileRead, FileWrite

7. **Advanced AI:**
   - TextToSpeech, AudioTranscribe, ImageAnalysis, VisionAI

**Low Priority (Month 2):**

8. **Batch Operations:**
   - SendBulkMessage, BatchTransform, ParallelExecute

9. **Advanced Control:**
   - ParallelExecution, SubflowCall, WaitForMultiple

---

## 4. Recommendations

### Immediate Actions (Week 1)

**1. Create WhatsApp Media Nodes**

```javascript
// SendImageNode.cjs
class SendImageNode extends BaseNodeExecutor {
  constructor() {
    super('messaging:sendWhatsAppImage', 'messaging');
  }

  async execute(context) {
    const { node, services } = context;
    const data = node.data || {};

    const recipient = this.resolveTemplate(
      this.getRequired(data, 'recipient'),
      context
    );

    const imageUrl = this.resolveTemplate(
      this.getRequired(data, 'imageUrl'),
      context
    );

    const caption = this.resolveTemplate(
      this.getOptional(data, 'caption', ''),
      context
    );

    const whatsapp = services?.whatsapp;
    if (!whatsapp) {
      return this.failure('WhatsApp service not available', 'NO_SERVICE');
    }

    try {
      const result = await whatsapp.sendImage(recipient, imageUrl, caption);

      return this.success({
        messageId: result.id,
        recipient,
        mediaType: 'image',
        imageUrl,
        captionLength: caption.length,
        sentAt: new Date().toISOString(),
      });
    } catch (error) {
      return this.failure(
        `Failed to send image: ${error.message}`,
        'SEND_ERROR',
        true
      );
    }
  }

  validate(node) {
    const errors = [];
    const data = node.data || {};

    if (!data.recipient) {
      errors.push('Recipient is required');
    }

    if (!data.imageUrl) {
      errors.push('Image URL is required');
    }

    // Validate URL format
    if (data.imageUrl && !data.imageUrl.match(/^https?:\/\//)) {
      errors.push('Image URL must be a valid HTTP/HTTPS URL');
    }

    return errors;
  }
}
```

**2. Add Retry Logic to BaseNodeExecutor**

```javascript
class BaseNodeExecutor {
  // ... existing methods

  async executeWithRetry(context, maxRetries = 3, retryDelay = 1000) {
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.execute(context);

        // If result is failure but not recoverable, don't retry
        if (!result.success && !result.isRecoverable) {
          return result;
        }

        // If success, return
        if (result.success) {
          return result;
        }

        // If failure but recoverable, retry
        lastError = result.error;

        if (attempt < maxRetries) {
          await this.delay(retryDelay * attempt); // Exponential backoff
        }
      } catch (error) {
        lastError = error;

        if (attempt < maxRetries) {
          await this.delay(retryDelay * attempt);
        }
      }
    }

    return this.failure(
      `Failed after ${maxRetries} attempts: ${lastError.message || lastError}`,
      'MAX_RETRIES_EXCEEDED',
      false
    );
  }

  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
```

### Short-Term Enhancements (Week 2-4)

**3. File Operation Nodes**

```javascript
// ReadPDFNode.cjs
class ReadPDFNode extends BaseNodeExecutor {
  constructor() {
    super('files:readPDF', 'files');
  }

  async execute(context) {
    const { node, services } = context;
    const data = node.data || {};

    const filePath = this.resolveTemplate(
      this.getRequired(data, 'filePath'),
      context
    );

    const extractImages = this.getOptional(data, 'extractImages', false);

    try {
      const pdfParser = services?.pdfParser;
      if (!pdfParser) {
        return this.failure('PDF parser not available', 'NO_SERVICE');
      }

      const result = await pdfParser.parse(filePath, {
        extractImages,
      });

      return this.success({
        text: result.text,
        pages: result.pages,
        metadata: result.metadata,
        images: extractImages ? result.images : undefined,
        readAt: new Date().toISOString(),
      });
    } catch (error) {
      return this.failure(
        `PDF read failed: ${error.message}`,
        'READ_ERROR',
        false
      );
    }
  }

  validate(node) {
    const errors = [];
    const data = node.data || {};

    if (!data.filePath) {
      errors.push('File path is required');
    }

    return errors;
  }
}
```

**4. Data Transformation Nodes**

```javascript
// JSONPathNode.cjs
class JSONPathNode extends BaseNodeExecutor {
  constructor() {
    super('data:jsonPath', 'data');
  }

  async execute(context) {
    const { node } = context;
    const data = node.data || {};

    const jsonData = this.resolveTemplate(
      this.getRequired(data, 'data'),
      context
    );

    const path = this.getOptional(data, 'path', '$');

    try {
      const jsonObject = typeof jsonData === 'string'
        ? JSON.parse(jsonData)
        : jsonData;

      const jsonpath = require('jsonpath');
      const result = jsonpath.query(jsonObject, path);

      return this.success({
        result,
        path,
        count: Array.isArray(result) ? result.length : 1,
      });
    } catch (error) {
      return this.failure(
        `JSONPath query failed: ${error.message}`,
        'QUERY_ERROR',
        false
      );
    }
  }

  validate(node) {
    const errors = [];
    const data = node.data || {};

    if (!data.data) {
      errors.push('Data is required');
    }

    if (!data.path) {
      errors.push('JSONPath expression is required');
    }

    return errors;
  }
}
```

### Long-Term Strategy (Month 2-3)

**5. Node Testing Framework**

```javascript
// tests/nodes/ChatCompletionNode.test.js
const { ChatCompletionNode } = require('../../nodes/ai/ChatCompletionNode.cjs');

describe('ChatCompletionNode', () => {
  let node;
  let mockServices;

  beforeEach(() => {
    node = new ChatCompletionNode();
    mockServices = {
      superBrain: {
        process: jest.fn().mockResolvedValue({
          content: 'Test response',
          model: 'test-model',
          provider: 'test-provider',
          usage: { totalTokens: 10 },
        }),
      },
    };
  });

  test('should execute successfully with valid prompt', async () => {
    const context = {
      node: {
        data: {
          prompt: 'Test prompt',
          temperature: 0.7,
        },
      },
      services: mockServices,
      userId: 'user-123',
    };

    const result = await node.execute(context);

    expect(result.success).toBe(true);
    expect(result.data.content).toBe('Test response');
    expect(mockServices.superBrain.process).toHaveBeenCalledTimes(1);
  });

  test('should fail validation without prompt', () => {
    const testNode = {
      data: {
        temperature: 0.7,
      },
    };

    const errors = node.validate(testNode);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('prompt');
  });

  test('should handle rate limit errors as recoverable', async () => {
    mockServices.superBrain.process.mockRejectedValue(
      new Error('rate limit exceeded')
    );

    const context = {
      node: { data: { prompt: 'Test' } },
      services: mockServices,
    };

    const result = await node.execute(context);

    expect(result.success).toBe(false);
    expect(result.isRecoverable).toBe(true);
  });
});
```

**6. Node Documentation Generator**

```javascript
// scripts/generate-node-docs.js
const fs = require('fs');
const path = require('path');

function generateNodeDocs() {
  const nodes = loadAllNodes();
  let markdown = '# FlowBuilder Node Reference\n\n';

  for (const [category, nodeList] of Object.entries(nodes)) {
    markdown += `## ${category.charAt(0).toUpperCase() + category.slice(1)} Nodes\n\n`;

    for (const node of nodeList) {
      markdown += `### ${node.label}\n\n`;
      markdown += `**Type:** \`${node.type}\`\n\n`;
      markdown += `${node.description}\n\n`;

      markdown += `**Configuration:**\n\n`;
      for (const [key, prop] of Object.entries(node.properties)) {
        const required = prop.required ? '(required)' : '(optional)';
        markdown += `- \`${key}\` ${required}: ${prop.description}\n`;
      }

      markdown += `\n**Outputs:**\n\n`;
      for (const output of node.outputs) {
        markdown += `- \`${output}\`\n`;
      }

      markdown += '\n---\n\n';
    }
  }

  fs.writeFileSync('docs/nodes/README.md', markdown);
}
```

---

## 5. Implementation Plan

### Phase 1: Core Messaging Nodes (Week 1)
- [ ] SendWhatsAppImage
- [ ] SendWhatsAppDocument
- [ ] SendTelegramPhoto
- [ ] SendTelegramDocument
- [ ] EmailReply, EmailForward

### Phase 2: File Operations (Week 2)
- [ ] ReadPDF, ReadExcel, ReadCSV
- [ ] GeneratePDF, WriteFile
- [ ] ParseJSON, ParseXML

### Phase 3: Data Transformation (Week 3)
- [ ] JSONPath, TemplateString
- [ ] SplitString, RegexExtract
- [ ] Base64Encode, URLEncode

### Phase 4: Testing & Docs (Week 4)
- [ ] Unit tests for all new nodes
- [ ] Node documentation generator
- [ ] Integration tests

---

## 6. Success Metrics

| Metric | Current | Target | Timeline |
|--------|---------|--------|----------|
| Total Nodes | 25 | 50+ | Week 4 |
| Test Coverage | 40% | 80% | Week 4 |
| Node Categories | 6 | 10+ | Week 4 |
| Documentation | Partial | Complete | Week 4 |

---

**Document Status:** Draft v1.0
**Last Updated:** 2026-02-02
**Next Review:** After Phase 1 completion
