# Node Properties Implementation Comparison

## Executive Summary

This document analyzes the Node Properties/Configuration system in both FlowBuilder implementations, covering the config panel UI, validation approaches, field types, and variable management.

**Key Finding:** The old implementation has a comprehensive output variable documentation system (580+ lines) with specialized config forms per node category, while the current implementation has a cleaner field-driven architecture with type-safe validation but lacks detailed variable documentation.

---

## 1. Old Implementation Analysis (WhatsBots)

### Architecture Overview

**Location:** `D:\source\AI\WhatsBots\src\components\automation\FlowBuilder\config\`

**Key Files:**
- `NodeConfigPanel.tsx` (1032 lines) - Main config panel container
- `TriggerConfigForms.tsx` - Trigger-specific config forms
- `ActionConfigForms.tsx` - Action-specific config forms
- `ControlConfigForms.tsx` - Control node config forms
- `DataConfigForms.tsx` - Data transformation config forms
- `AIUnifiedConfigForms.tsx` - AI Unified nodes config forms
- `TelegramConditionConfigForms.tsx` - Telegram-specific conditionals

### Variable Documentation System

**Core Feature:** `getNodeVariables()` function (580+ lines)

```typescript
interface VariableDefinition {
  path: string;      // e.g., "response", "createdFiles[0].filePath"
  description: string;
}

const getNodeVariables = (nodeType: string): VariableDefinition[] => {
  const variableMap: Record<string, VariableDefinition[]> = {
    'trigger-message': [
      { path: '', description: 'Full trigger context object' },
      { path: 'triggerMessage', description: 'The incoming message text' },
      { path: 'triggerPhone', description: 'Sender phone number' },
      { path: 'triggerChatId', description: 'Chat ID (use for replies)' },
      { path: 'triggerPushName', description: 'Sender display name' },
      { path: 'triggerTimestamp', description: 'Message timestamp' },
      { path: 'isGroup', description: 'Whether message is from a group' },
      { path: 'hasMedia', description: 'Whether message contains media' },
      { path: 'mediaType', description: 'Type of media (image/video/audio/document)' },
      { path: 'mediaUrl', description: 'URL to download media (if hasMedia)' },
      // ... 150+ more node types documented
    ],
  };
  return variableMap[nodeType] || [{ path: '', description: 'Node output' }];
};
```

**Coverage:** 150+ node types with detailed output variable documentation

**Example Complex Node Output (AI Router):**

```typescript
'action-ai-router': [
  { path: '', description: 'Full router result' },
  { path: 'response', description: 'Tool execution response' },
  { path: 'matchedTool', description: 'Tool that was matched' },
  { path: 'executedTool', description: 'Tool that was actually executed' },
  { path: 'confidence', description: 'Routing confidence score (0-1)' },
  { path: 'reasoning', description: 'AI reasoning for tool selection' },
  { path: 'extractedParams', description: 'Parameters extracted from input' },
  { path: 'toolResult', description: 'Full result from executed tool' },
  { path: 'toolResult.results', description: 'Array of results (for search tools)' },
  { path: 'toolResult.results.length', description: 'Number of results returned' },
  { path: 'toolResult.results[0].url', description: 'URL of first search result' },
  { path: 'toolResult.results[0].title', description: 'Title of first search result' },
  { path: 'toolResult.results[0].description', description: 'Description of first result' },
  { path: 'toolResult.results[0].snippet', description: 'Snippet text of first result' },
  { path: 'createdFiles', description: 'Array of files created by CLI tools' },
  { path: 'createdFiles.length', description: 'Number of files created' },
  { path: 'createdFiles[0].filePath', description: 'Path to first created file' },
  { path: 'createdFiles[0].filename', description: 'Name of first created file' },
  { path: 'createdFiles[0].mediaType', description: 'Media type (image/document/audio)' },
  { path: 'createdFiles[0].mimeType', description: 'MIME type of file' },
  { path: 'createdFiles[0].size', description: 'File size in bytes' },
],
```

### Config Panel UI Architecture

**Main Container:** `NodeConfigPanel.tsx`

**Key Features:**

1. **Header with Category Styling**
   ```typescript
   const getNodeCategoryInfo = (nodeType: string) => {
     if (nodeType.startsWith('trigger-')) {
       return {
         category: 'trigger',
         color: 'green',
         bgColor: 'bg-green-500/20',
         borderColor: 'border-green-500/50',
         textColor: 'text-green-400',
         iconBgColor: 'bg-green-500/30'
       };
     }
     // ... similar for action, control, data categories
   };
   ```

2. **Expandable Available Variables Section**
   ```typescript
   const [variablesExpanded, setVariablesExpanded] = useState(false);

   <button onClick={() => setVariablesExpanded(!variablesExpanded)}>
     <span>Available Variables ({nodeVariables.length})</span>
     {variablesExpanded ? <ChevronUp /> : <ChevronDown />}
   </button>

   {variablesExpanded && (
     <div className="mt-3 space-y-2 max-h-64 overflow-y-auto">
       {nodeVariables.map((variable, index) => {
         const fullPath = getFullVariablePath(variable.path);
         return (
           <div className="group flex items-start gap-2 p-2">
             <code className="font-mono text-purple-300">{fullPath}</code>
             <span className="text-xs text-gray-400">{variable.description}</span>
             <button onClick={() => copyToClipboard(fullPath)}>Copy</button>
           </div>
         );
       })}
     </div>
   )}
   ```

3. **Copy-to-Clipboard Functionality**
   ```typescript
   const copyVariableRef = () => {
     copyToClipboard(`{{${node.id}}}`, 'varRef');
   };

   const getFullVariablePath = (varPath: string) => {
     if (varPath === '') return `{{${node.id}}}`;
     return `{{${node.id}.${varPath}}}`;
   };
   ```

4. **Delegated Config Forms per Category**
   ```typescript
   const renderConfigForm = () => {
     if (node.type.startsWith('trigger-')) {
       return <TriggerConfigForms nodeType={node.type} config={config} onConfigChange={onConfigChange} />;
     }
     if (node.type.startsWith('action-') || node.type.startsWith('ai-')) {
       return <ActionConfigForms nodeType={node.type} config={config} onConfigChange={onConfigChange} />;
     }
     if (node.type.startsWith('control-')) {
       return <ControlConfigForms nodeType={node.type} config={config} onConfigChange={onConfigChange} />;
     }
     if (node.type.startsWith('data-')) {
       return <DataConfigForms nodeType={node.type} config={config} onConfigChange={onConfigChange} />;
     }
     // ... AI Unified nodes
   };
   ```

### Specialized Config Forms

**TriggerConfigForms Example:**

```typescript
// Each trigger type has its own form
switch (nodeType) {
  case 'trigger-message':
    return (
      <div className="p-4 space-y-4">
        <FormField label="Platform" type="select" options={['WhatsApp', 'Telegram']} />
        <FormField label="Message Filter" type="text" placeholder="Optional regex pattern" />
        <FormField label="From Contact" type="text" placeholder="Optional sender filter" />
        <FormField label="Save Media" type="checkbox" />
      </div>
    );
  case 'trigger-schedule':
    return (
      <div className="p-4 space-y-4">
        <FormField label="Cron Expression" type="text" required />
        <FormField label="Timezone" type="select" options={timezones} />
      </div>
    );
  // ... 15+ trigger types
}
```

**ActionConfigForms Example:**

```typescript
// Platform-aware config forms
switch (nodeType) {
  case 'action-send-message':
    return (
      <div className="space-y-4">
        <FormField
          label="Recipient"
          type="variable"
          placeholder="{{triggerChatId}}"
          helperText="Use {{triggerChatId}} to reply to sender"
        />
        <FormField
          label="Message"
          type="textarea"
          placeholder="Your message here. Use {{variables}}"
          showVariablePicker={true}
        />
        {currentPlatform === 'whatsapp' && (
          <FormField label="Quote Message" type="checkbox" />
        )}
        {currentPlatform === 'telegram' && (
          <FormField label="Parse Mode" type="select" options={['None', 'Markdown', 'HTML']} />
        )}
      </div>
    );
  // ... 100+ action types
}
```

### Field Types and Components

**Available Field Types:**
- `text` - Single-line input
- `textarea` - Multi-line input
- `number` - Numeric input with validation
- `select` - Dropdown selection
- `checkbox` - Boolean toggle
- `variable` - Variable picker with suggestions
- `json` - JSON editor
- `file` - File path input
- `color` - Color picker
- `code` - Code editor with syntax highlighting

**Variable Picker Component:**

```typescript
const VariablePicker: React.FC<{ onSelect: (variable: string) => void }> = ({ onSelect }) => {
  return (
    <div className="variable-picker">
      <div className="category">
        <h4>Trigger Context</h4>
        <button onClick={() => onSelect('{{triggerMessage}}')}>Message</button>
        <button onClick={() => onSelect('{{triggerPhone}}')}>Phone</button>
      </div>
      <div className="category">
        <h4>Previous Nodes</h4>
        {/* List available previous nodes and their outputs */}
      </div>
      <div className="category">
        <h4>Flow Variables</h4>
        {/* List flow-level variables */}
      </div>
    </div>
  );
};
```

### Validation Approach

**Frontend-Only Validation:**

```typescript
// In ActionConfigForms.tsx
const validateConfig = (config: Record<string, any>): string[] => {
  const errors: string[] = [];

  // Required field validation
  if (!config.recipient) {
    errors.push('Recipient is required');
  }

  if (!config.message) {
    errors.push('Message text is required');
  }

  // Format validation
  if (config.cronExpression && !isValidCron(config.cronExpression)) {
    errors.push('Invalid cron expression');
  }

  // Range validation
  if (config.timeout && (config.timeout < 1000 || config.timeout > 300000)) {
    errors.push('Timeout must be between 1 and 300 seconds');
  }

  return errors;
};
```

**No Backend Schema Validation:**
- Validation only happens in UI before save
- No validation on flow execution
- No type enforcement for config values
- Risk of runtime errors from invalid configs

### Strengths

1. **Comprehensive Documentation:** 150+ nodes with detailed output variables
2. **User-Friendly:** Copy-to-clipboard, expandable sections, clear descriptions
3. **Specialized Forms:** Category-specific forms with optimized UX per node type
4. **Platform Awareness:** Forms adapt based on platform (WhatsApp vs Telegram)
5. **Variable Suggestions:** Inline variable picker with context-aware suggestions
6. **Visual Hierarchy:** Color-coded categories, clear visual grouping
7. **Permission-Based Fields:** Some fields only visible to superadmin
8. **Helper Text:** Extensive inline help text for complex fields

### Weaknesses

1. **No Backend Validation:** All validation in frontend only
2. **Tight Coupling:** Config forms tightly coupled to node types
3. **Code Duplication:** Similar forms repeated across different files
4. **Hard to Maintain:** Adding new nodes requires touching multiple files
5. **No Type Safety:** No TypeScript types for config schemas
6. **Frontend Bundle Size:** Large config forms bloat frontend bundle
7. **No Schema Versioning:** Can't handle config migrations
8. **Manual Variable Paths:** Developers manually maintain variable documentation

---

## 2. Current Implementation Analysis (SwarmAI)

### Architecture Overview

**Location:** `d:\source\AI\SwarmAI\`

**Key Files:**
- **Backend:** `server/services/flow/NodeDefinitions.cjs` (1031 lines)
- **Frontend:** `frontend/src/components/flowbuilder/NodeConfigPanel.tsx` (894 lines)

### Backend Schema System

**Property Definition Schema:**

```javascript
const FIELD_TYPES = {
  TEXT: 'text',
  TEXTAREA: 'textarea',
  NUMBER: 'number',
  SELECT: 'select',
  CHECKBOX: 'checkbox',
  JSON: 'json',
  VARIABLE: 'variable',
  MODEL: 'model',         // AI model selector
  PROVIDER: 'provider',   // AI provider selector
  MCP_TOOL: 'mcp_tool',  // Model Context Protocol tool picker
};

interface PropertyDef {
  type: FieldType;
  label: string;
  description: string;
  default?: any;
  required?: boolean;
  options?: Array<{value: string, label: string}>;
  showVariablePicker?: boolean;
  conditionalDisplay?: {
    field: string;
    value: any;
  };
  validate?: (value: any) => string | null;
  placeholder?: string;
  min?: number;
  max?: number;
}
```

**Example Node Definition:**

```javascript
const NODE_DEFINITIONS = {
  ai: {
    chat_completion: {
      label: 'Chat Completion',
      description: 'Generate AI response using chat model',
      category: 'ai',
      color: 'violet',
      icon: 'MessageCircle',
      properties: {
        model: {
          type: FIELD_TYPES.MODEL,
          label: 'AI Model',
          description: 'Select the AI model to use',
          required: true,
          default: 'auto',
        },
        prompt: {
          type: FIELD_TYPES.TEXTAREA,
          label: 'Prompt',
          description: 'Prompt template with variable support',
          required: true,
          placeholder: 'You are a helpful assistant. User: {{input.message}}',
          showVariablePicker: true,
        },
        temperature: {
          type: FIELD_TYPES.NUMBER,
          label: 'Temperature',
          description: 'Randomness (0-1)',
          default: 0.7,
          min: 0,
          max: 1,
          validate: (val) => {
            if (val < 0 || val > 1) return 'Temperature must be between 0 and 1';
            return null;
          },
        },
        maxTokens: {
          type: FIELD_TYPES.NUMBER,
          label: 'Max Tokens',
          description: 'Maximum tokens to generate',
          default: 1000,
          min: 1,
          max: 128000,
        },
        systemMessage: {
          type: FIELD_TYPES.TEXTAREA,
          label: 'System Message',
          description: 'Optional system message',
          placeholder: 'You are a helpful assistant',
          showVariablePicker: false,
        },
        useHistory: {
          type: FIELD_TYPES.CHECKBOX,
          label: 'Use Conversation History',
          description: 'Include previous messages as context',
          default: true,
        },
        historyLimit: {
          type: FIELD_TYPES.NUMBER,
          label: 'History Limit',
          description: 'Number of previous messages to include',
          default: 10,
          min: 1,
          max: 50,
          conditionalDisplay: {
            field: 'useHistory',
            value: true,
          },
        },
      },
      outputs: [
        'response',
        'model',
        'tokensUsed',
        'finishReason',
        'conversationId',
      ],
    },
  },
};
```

### Frontend Field-Driven Config Panel

**Location:** `frontend/src/components/flowbuilder/NodeConfigPanel.tsx`

**Architecture:**

```typescript
// Field configurations (50+ node subtypes)
const nodeFieldConfigs: Record<string, FieldConfig[]> = {
  // Trigger nodes
  manual: [
    { name: 'flowInputs', label: 'Flow Inputs (JSON)', type: 'json', defaultValue: {} },
  ],
  schedule: [
    { name: 'cronExpression', label: 'Cron Expression', type: 'text', required: true },
    { name: 'timezone', label: 'Timezone', type: 'select', options: timezones, defaultValue: 'UTC' },
    { name: 'enabled', label: 'Enable Immediately', type: 'boolean', defaultValue: true },
  ],

  // AI nodes
  chat_completion: [
    { name: 'model', label: 'AI Model', type: 'model', required: true },
    { name: 'prompt', label: 'Prompt', type: 'variable', required: true, placeholder: 'Enter your prompt...' },
    { name: 'temperature', label: 'Temperature (0-1)', type: 'number', defaultValue: 0.7 },
    { name: 'maxTokens', label: 'Max Tokens', type: 'number', defaultValue: 1000 },
    { name: 'systemMessage', label: 'System Message', type: 'textarea', placeholder: 'Optional system instructions' },
  ],

  // Logic nodes
  condition: [
    { name: 'leftValue', label: 'Left Value', type: 'variable', required: true, placeholder: '{{input.count}}' },
    { name: 'operator', label: 'Operator', type: 'select', options: operators, required: true },
    { name: 'rightValue', label: 'Right Value', type: 'variable', required: true, placeholder: '10' },
  ],

  // ... 50+ more node configurations
};
```

**Field Rendering:**

```typescript
const renderField = (field: FieldConfig) => {
  const value = config[field.name] ?? field.defaultValue ?? '';

  switch (field.type) {
    case 'textarea':
      return (
        <textarea
          value={String(value)}
          onChange={(e) => handleFieldChange(field.name, e.target.value)}
          placeholder={field.placeholder}
          className="w-full rounded-lg border bg-slate-800/50 text-white"
        />
      );

    case 'select':
      return (
        <select
          value={String(value)}
          onChange={(e) => handleFieldChange(field.name, e.target.value)}
          className="w-full rounded-lg border bg-slate-800/50 text-white"
        >
          <option value="">Select...</option>
          {field.options?.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      );

    case 'boolean':
      return (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => handleFieldChange(field.name, e.target.checked)}
            className="w-4 h-4 rounded"
          />
          <span className="text-sm text-gray-300">Enable</span>
        </label>
      );

    case 'json':
      return (
        <textarea
          value={typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
          onChange={(e) => {
            try {
              const parsed = JSON.parse(e.target.value);
              handleFieldChange(field.name, parsed);
            } catch {
              handleFieldChange(field.name, e.target.value);
            }
          }}
          className="w-full font-mono bg-slate-900 text-white"
        />
      );

    case 'variable':
      return (
        <div className="relative">
          <Input value={String(value)} onChange={(e) => handleFieldChange(field.name, e.target.value)} />
          <div className="mt-1 flex flex-wrap gap-1">
            {variableSuggestions.slice(0, 4).map((v) => (
              <button
                key={v}
                onClick={() => handleFieldChange(field.name, v)}
                className="text-[10px] px-1.5 py-0.5 bg-slate-700 text-gray-400 rounded"
              >
                {v.replace('{{', '').replace('}}', '')}
              </button>
            ))}
          </div>
        </div>
      );

    case 'model':
      return (
        <ModelSelectorField
          value={String(value)}
          onChange={(modelId) => handleFieldChange(field.name, modelId)}
          required={field.required}
        />
      );

    case 'provider':
      return (
        <ProviderSelectorField
          value={String(value || '')}
          onChange={(providerId) => handleFieldChange(field.name, providerId)}
          includeAutoSelect={true}
        />
      );

    case 'mcp_tool':
      return (
        <MCPToolConfig
          value={(value as MCPToolConfigValue) || { serverId: '', toolName: '' }}
          onChange={(mcpConfig) => handleFieldChange(field.name, mcpConfig)}
        />
      );

    default:
      return (
        <Input
          value={String(value)}
          onChange={(e) => handleFieldChange(field.name, e.target.value)}
        />
      );
  }
};
```

### Custom Field Components

**ModelSelectorField:**

```typescript
const ModelSelectorField: React.FC<{
  value: string;
  onChange: (modelId: string) => void;
  placeholder?: string;
  required?: boolean;
}> = ({ value, onChange, placeholder, required }) => {
  const [models, setModels] = useState<AIModel[]>([]);

  useEffect(() => {
    // Fetch available models from backend
    fetch('/api/ai/models').then(res => res.json()).then(setModels);
  }, []);

  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} required={required}>
      <option value="auto">Auto (Let SuperBrain choose)</option>
      <optgroup label="Free Models">
        {models.filter(m => m.isFree).map(m => (
          <option key={m.id} value={m.id}>
            {m.name} {m.contextLength ? `(${m.contextLength} tokens)` : ''}
          </option>
        ))}
      </optgroup>
      <optgroup label="Paid Models">
        {models.filter(m => !m.isFree).map(m => (
          <option key={m.id} value={m.id}>
            {m.name} {m.contextLength ? `(${m.contextLength} tokens)` : ''}
          </option>
        ))}
      </optgroup>
    </select>
  );
};
```

**MCPToolConfig:**

```typescript
const MCPToolConfig: React.FC<{
  value: MCPToolConfigValue;
  onChange: (config: MCPToolConfigValue) => void;
}> = ({ value, onChange }) => {
  const [servers, setServers] = useState<MCPServer[]>([]);
  const [tools, setTools] = useState<MCPTool[]>([]);

  // Fetch MCP servers
  useEffect(() => {
    fetch('/api/mcp/servers').then(res => res.json()).then(setServers);
  }, []);

  // Fetch tools for selected server
  useEffect(() => {
    if (value.serverId) {
      fetch(`/api/mcp/servers/${value.serverId}/tools`)
        .then(res => res.json())
        .then(setTools);
    }
  }, [value.serverId]);

  return (
    <div className="space-y-2">
      <select
        value={value.serverId}
        onChange={(e) => onChange({ serverId: e.target.value, toolName: '' })}
      >
        <option value="">Select MCP Server...</option>
        {servers.map(s => (
          <option key={s.id} value={s.id}>{s.name} - {s.description}</option>
        ))}
      </select>

      {value.serverId && (
        <select
          value={value.toolName}
          onChange={(e) => onChange({ ...value, toolName: e.target.value })}
        >
          <option value="">Select Tool...</option>
          {tools.map(t => (
            <option key={t.name} value={t.name}>{t.name} - {t.description}</option>
          ))}
        </select>
      )}
    </div>
  );
};
```

### Backend Validation System

**Validation Function:**

```javascript
function validateNodeConfig(nodeType, config) {
  const [category, subtype] = nodeType.split(':');
  const nodeDef = NODE_DEFINITIONS[category]?.[subtype];

  if (!nodeDef) {
    return { valid: false, errors: [`Unknown node type: ${nodeType}`] };
  }

  const errors = [];
  const properties = nodeDef.properties || {};

  // Check required fields
  for (const [key, propDef] of Object.entries(properties)) {
    if (propDef.required && !config[key]) {
      errors.push(`${propDef.label} is required`);
    }

    // Type-specific validation
    if (propDef.type === FIELD_TYPES.NUMBER && config[key] !== undefined) {
      const num = Number(config[key]);
      if (isNaN(num)) {
        errors.push(`${propDef.label} must be a number`);
      }
      if (propDef.min !== undefined && num < propDef.min) {
        errors.push(`${propDef.label} must be at least ${propDef.min}`);
      }
      if (propDef.max !== undefined && num > propDef.max) {
        errors.push(`${propDef.label} must be at most ${propDef.max}`);
      }
    }

    // JSON validation
    if (propDef.type === FIELD_TYPES.JSON && config[key] !== undefined) {
      if (typeof config[key] === 'string') {
        try {
          JSON.parse(config[key]);
        } catch (e) {
          errors.push(`${propDef.label} must be valid JSON`);
        }
      }
    }

    // Custom validation
    if (propDef.validate && config[key] !== undefined) {
      const error = propDef.validate(config[key]);
      if (error) {
        errors.push(error);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

module.exports = { validateNodeConfig };
```

**API Validation:**

```javascript
// In routes/flows.cjs
router.post('/flows/:flowId/validate', authenticateToken, async (req, res) => {
  const { flow } = req.body;

  const validationResults = [];

  for (const node of flow.nodes) {
    const result = validateNodeConfig(node.type, node.data.config);
    if (!result.valid) {
      validationResults.push({
        nodeId: node.id,
        nodeLabel: node.data.label,
        errors: result.errors,
      });
    }
  }

  res.json({
    valid: validationResults.length === 0,
    errors: validationResults,
  });
});
```

### Output Variables System

**Simple Array-Based Outputs:**

```javascript
const NODE_DEFINITIONS = {
  ai: {
    chat_completion: {
      // ... properties
      outputs: [
        'response',        // AI generated response
        'model',          // Model used
        'tokensUsed',     // Token count
        'finishReason',   // Completion reason
        'conversationId', // Conversation context
      ],
    },
  },
  messaging: {
    send_whatsapp: {
      // ... properties
      outputs: [
        'messageId',      // Sent message ID
        'timestamp',      // Send timestamp
        'status',         // Send status
        'recipient',      // Recipient chat ID
      ],
    },
  },
};
```

**Available Variables Documentation:**

```javascript
const AVAILABLE_VARIABLES = {
  datetime: {
    'time.now': 'Current timestamp (ISO 8601)',
    'time.date': 'Current date (YYYY-MM-DD)',
    'time.time': 'Current time (HH:MM:SS)',
    'time.unix': 'Unix timestamp',
  },
  input: {
    'input.message': 'Flow input: message text',
    'input.userId': 'Flow input: user ID',
    'input.conversationId': 'Flow input: conversation ID',
    'input.*': 'Any flow input field',
  },
  media: {
    'media.type': 'Media type (image, video, audio, document)',
    'media.url': 'Media download URL',
    'media.size': 'Media file size in bytes',
    'media.mimetype': 'Media MIME type',
  },
  node: {
    'node.{nodeId}.{output}': 'Output from specific node',
    'node.previous.output': 'Output from previous node',
  },
  flow: {
    'var.{name}': 'Flow-level variable',
  },
  env: {
    'env.NODE_ENV': 'Node environment',
    'env.API_URL': 'API base URL',
  },
};
```

**No Per-Node Output Documentation:**
- Only basic output keys listed, no descriptions
- No nested path documentation (e.g., `createdFiles[0].filePath`)
- No examples of complex output structures

### Strengths

1. **Backend Validation:** Validation on both frontend and backend
2. **Type Safety:** Schema-driven with type enforcement
3. **Conditional Fields:** Fields can show/hide based on other fields
4. **Custom Validation:** Per-field validation functions
5. **Clean Architecture:** Property definitions alongside node definitions
6. **Custom Field Types:** MODEL, PROVIDER, MCP_TOOL specialized components
7. **API-Driven:** Frontend fetches schemas from backend
8. **Versioning Support:** Can handle schema migrations
9. **Maintainability:** Adding nodes only requires updating NodeDefinitions.cjs

### Weaknesses

1. **Limited Variable Documentation:** No detailed per-node output documentation
2. **No Variable Browser:** No expandable "Available Variables" section like old implementation
3. **Generic Output Arrays:** Just string arrays, no descriptions or nested paths
4. **Fewer Field Configs:** Only 50+ subtypes vs 150+ in old implementation
5. **No Platform Awareness:** Forms don't adapt based on platform
6. **No Permission-Based Fields:** No superadmin-only field filtering
7. **Limited Helper Text:** Less inline help compared to old implementation
8. **No Variable Picker Component:** Just suggestion buttons, not full picker

---

## 3. Gap Analysis

### Missing Features in Current Implementation

**High Priority:**

1. **Detailed Output Variable Documentation**
   - Old: 580+ lines of variable definitions with nested paths
   - Current: Simple string arrays with no descriptions
   - Impact: Users don't know what variables are available

2. **Expandable Available Variables Section**
   - Old: Copy-to-clipboard variable browser with descriptions
   - Current: None
   - Impact: Poor discoverability of node outputs

3. **Platform-Aware Fields**
   - Old: Forms adapt for WhatsApp vs Telegram
   - Current: Generic forms for all platforms
   - Impact: Less intuitive UX, platform-specific features hidden

4. **Variable Picker Component**
   - Old: Full-featured picker with categories
   - Current: Just 4 quick suggestions
   - Impact: Harder to discover and use variables

**Medium Priority:**

5. **Permission-Based Field Visibility**
   - Old: Superadmin-only fields hidden from regular users
   - Current: No permission filtering
   - Impact: Cluttered UI for non-admin users

6. **Helper Text Coverage**
   - Old: Extensive inline help for complex fields
   - Current: Limited helper text
   - Impact: Less self-service, more support questions

7. **Code Editor Field Type**
   - Old: Syntax-highlighted code editor for JavaScript/Python
   - Current: Plain textarea
   - Impact: Harder to write complex transformations

**Low Priority:**

8. **Color Picker Field Type**
   - Old: Visual color picker for styling nodes
   - Current: Not needed yet
   - Impact: Minor UX improvement

### Advantages of Current Implementation

1. **Backend Validation:** Prevents invalid flows from executing
2. **Type Safety:** Schema-driven approach with type checking
3. **Conditional Display:** Fields show/hide based on config
4. **Custom Field Types:** MODEL, PROVIDER, MCP_TOOL components
5. **API-Driven Schema:** Frontend gets schema from backend
6. **Cleaner Code:** Single NodeDefinitions.cjs vs multiple form files
7. **Easier Maintenance:** Adding nodes requires fewer file changes

---

## 4. Recommendations

### Immediate Actions (Week 1-2)

**1. Add Detailed Output Documentation to NODE_DEFINITIONS**

```javascript
// In server/services/flow/NodeDefinitions.cjs
const NODE_DEFINITIONS = {
  ai: {
    chat_completion: {
      // ... existing properties
      outputs: {
        response: {
          path: 'response',
          type: 'string',
          description: 'AI generated response text',
          example: 'Hello! How can I help you today?',
        },
        model: {
          path: 'model',
          type: 'string',
          description: 'AI model used for generation',
          example: 'anthropic/claude-3.5-sonnet',
        },
        tokensUsed: {
          path: 'tokensUsed',
          type: 'number',
          description: 'Total tokens consumed (prompt + completion)',
          example: 156,
        },
        conversationHistory: {
          path: 'conversationHistory',
          type: 'array',
          description: 'Array of previous messages in conversation',
          children: {
            '[i].role': {
              path: 'conversationHistory[i].role',
              type: 'string',
              description: 'Message role (user/assistant/system)',
            },
            '[i].content': {
              path: 'conversationHistory[i].content',
              type: 'string',
              description: 'Message content',
            },
          },
        },
      },
    },
  },
};
```

**2. Create VariableExplorer Component**

```typescript
// frontend/src/components/flowbuilder/VariableExplorer.tsx
interface Variable {
  path: string;
  type: string;
  description: string;
  example?: string;
  children?: Record<string, Variable>;
}

const VariableExplorer: React.FC<{
  nodeId: string;
  outputs: Record<string, Variable>;
}> = ({ nodeId, outputs }) => {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState<string | null>(null);

  const copyToClipboard = (path: string) => {
    navigator.clipboard.writeText(`{{${nodeId}.${path}}}`);
    setCopied(path);
    setTimeout(() => setCopied(null), 2000);
  };

  const renderVariable = (key: string, variable: Variable, depth: number = 0) => {
    const fullPath = `{{${nodeId}.${variable.path}}}`;
    const hasChildren = variable.children && Object.keys(variable.children).length > 0;

    return (
      <div key={key} style={{ marginLeft: `${depth * 16}px` }} className="variable-item">
        {hasChildren && (
          <button onClick={() => setExpanded(prev => ({ ...prev, [key]: !prev[key] }))}>
            {expanded[key] ? <ChevronDown /> : <ChevronRight />}
          </button>
        )}
        <code className="font-mono text-purple-300">{fullPath}</code>
        <span className="text-xs text-gray-400">{variable.description}</span>
        <span className="text-xs text-gray-500">{variable.type}</span>
        {variable.example && (
          <span className="text-xs text-green-400">e.g., {variable.example}</span>
        )}
        <button onClick={() => copyToClipboard(variable.path)}>
          {copied === variable.path ? <Check /> : <Copy />}
        </button>

        {hasChildren && expanded[key] && (
          <div className="nested-variables">
            {Object.entries(variable.children).map(([childKey, childVar]) =>
              renderVariable(childKey, childVar, depth + 1)
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="variable-explorer">
      <div className="header">
        <h4>Available Variables ({Object.keys(outputs).length})</h4>
      </div>
      <div className="variables-list">
        {Object.entries(outputs).map(([key, variable]) => renderVariable(key, variable))}
      </div>
    </div>
  );
};

export default VariableExplorer;
```

**3. Add API Endpoint for Node Output Schema**

```javascript
// In server/routes/flows.cjs
router.get('/flows/nodes/:nodeType/outputs', authenticateToken, async (req, res) => {
  const { nodeType } = req.params;
  const [category, subtype] = nodeType.split(':');

  const nodeDef = NODE_DEFINITIONS[category]?.[subtype];

  if (!nodeDef) {
    return res.status(404).json({ error: 'Node type not found' });
  }

  res.json({
    nodeType,
    label: nodeDef.label,
    outputs: nodeDef.outputs || {},
  });
});
```

**4. Integrate VariableExplorer into NodeConfigPanel**

```typescript
// In NodeConfigPanel.tsx
<div className="border-t border-slate-700/50 mt-4">
  <button
    onClick={() => setShowVariables(!showVariables)}
    className="w-full flex items-center justify-between p-3 text-sm text-gray-400"
  >
    <span>Available Variables</span>
    {showVariables ? <ChevronUp /> : <ChevronDown />}
  </button>

  {showVariables && (
    <VariableExplorer nodeId={node.id} outputs={nodeOutputs} />
  )}
</div>
```

### Short-Term Enhancements (Week 3-4)

**5. Platform-Aware Field Configurations**

```javascript
// In NodeDefinitions.cjs
const NODE_DEFINITIONS = {
  messaging: {
    send_text: {
      properties: {
        message: {
          type: FIELD_TYPES.TEXTAREA,
          label: 'Message',
          required: true,
          showVariablePicker: true,
        },
        parseMode: {
          type: FIELD_TYPES.SELECT,
          label: 'Parse Mode',
          options: [
            { value: 'none', label: 'None' },
            { value: 'markdown', label: 'Markdown' },
            { value: 'html', label: 'HTML' },
          ],
          platformSpecific: {
            telegram: true,  // Only show for Telegram
            whatsapp: false,
          },
        },
        quoteMessage: {
          type: FIELD_TYPES.CHECKBOX,
          label: 'Quote/Reply to Message',
          platformSpecific: {
            whatsapp: true,  // Only show for WhatsApp
            telegram: false,
          },
        },
      },
    },
  },
};
```

**6. Enhanced Variable Picker Component**

```typescript
const VariablePicker: React.FC<{
  onSelect: (variable: string) => void;
  flowNodes: Node[];
  currentNodeId: string;
}> = ({ onSelect, flowNodes, currentNodeId }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [category, setCategory] = useState<'trigger' | 'nodes' | 'flow' | 'env' | 'time'>('nodes');

  const getPreviousNodes = () => {
    // Get nodes that execute before current node (topologically)
    return flowNodes.filter(n => n.id !== currentNodeId);
  };

  return (
    <div className="variable-picker">
      <div className="search">
        <Search />
        <input
          placeholder="Search variables..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="categories">
        <button onClick={() => setCategory('trigger')}>Trigger Context</button>
        <button onClick={() => setCategory('nodes')}>Previous Nodes</button>
        <button onClick={() => setCategory('flow')}>Flow Variables</button>
        <button onClick={() => setCategory('env')}>Environment</button>
        <button onClick={() => setCategory('time')}>Date/Time</button>
      </div>

      <div className="variables-list">
        {category === 'nodes' && getPreviousNodes().map(node => (
          <div key={node.id} className="node-variables">
            <h4>{node.data.label}</h4>
            {/* Fetch and display node outputs */}
          </div>
        ))}
        {/* Other categories... */}
      </div>
    </div>
  );
};
```

**7. Permission-Based Field Filtering**

```javascript
// In NodeDefinitions.cjs
const NODE_DEFINITIONS = {
  agentic: {
    custom_tool: {
      properties: {
        pythonCode: {
          type: FIELD_TYPES.CODE,
          label: 'Python Code',
          description: 'Custom Python tool implementation',
          required: true,
          requiredPermissions: ['superadmin'],  // Only superadmin can see
        },
        // ... other fields
      },
    },
  },
};

// In frontend NodeConfigPanel
const renderField = (field: FieldConfig) => {
  // Check permissions
  if (field.requiredPermissions && !hasPermissions(user, field.requiredPermissions)) {
    return null;  // Don't render field
  }

  // ... render field
};
```

### Long-Term Strategy (Month 2-3)

**8. Auto-Generate Documentation from Schema**

```javascript
// server/scripts/generate-node-docs.cjs
const generateNodeDocumentation = () => {
  const docs = [];

  for (const [category, nodes] of Object.entries(NODE_DEFINITIONS)) {
    for (const [subtype, nodeDef] of Object.entries(nodes)) {
      const doc = {
        type: `${category}:${subtype}`,
        label: nodeDef.label,
        description: nodeDef.description,
        category: nodeDef.category,
        properties: Object.entries(nodeDef.properties || {}).map(([key, prop]) => ({
          name: key,
          type: prop.type,
          label: prop.label,
          description: prop.description,
          required: prop.required || false,
          default: prop.default,
        })),
        outputs: nodeDef.outputs,
        examples: nodeDef.examples || [],
      };

      docs.push(doc);
    }
  }

  // Write to docs/nodes/README.md
  fs.writeFileSync('docs/nodes/README.md', generateMarkdown(docs));
};
```

**9. Interactive Node Playground**

```typescript
// Frontend component for testing node configurations
const NodePlayground: React.FC<{ nodeType: string }> = ({ nodeType }) => {
  const [config, setConfig] = useState({});
  const [testInput, setTestInput] = useState({});
  const [output, setOutput] = useState(null);
  const [loading, setLoading] = useState(false);

  const runTest = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/flows/nodes/test', {
        method: 'POST',
        body: JSON.stringify({ nodeType, config, input: testInput }),
      });
      const result = await response.json();
      setOutput(result);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="node-playground">
      <h3>Test {nodeType}</h3>

      <div className="config-section">
        <h4>Configuration</h4>
        <NodeConfigForm nodeType={nodeType} config={config} onChange={setConfig} />
      </div>

      <div className="input-section">
        <h4>Test Input (JSON)</h4>
        <textarea
          value={JSON.stringify(testInput, null, 2)}
          onChange={(e) => setTestInput(JSON.parse(e.target.value))}
        />
      </div>

      <button onClick={runTest} disabled={loading}>
        {loading ? 'Running...' : 'Run Test'}
      </button>

      {output && (
        <div className="output-section">
          <h4>Output</h4>
          <pre>{JSON.stringify(output, null, 2)}</pre>
        </div>
      )}
    </div>
  );
};
```

**10. Variable Transformation Helpers**

```javascript
// In NodeDefinitions.cjs - Add transformation helpers
const VARIABLE_TRANSFORMS = {
  uppercase: (value) => String(value).toUpperCase(),
  lowercase: (value) => String(value).toLowerCase(),
  trim: (value) => String(value).trim(),
  jsonParse: (value) => JSON.parse(value),
  jsonStringify: (value) => JSON.stringify(value),
  split: (value, separator) => String(value).split(separator),
  slice: (value, start, end) => String(value).slice(start, end),
  length: (value) => String(value).length,
  default: (value, defaultValue) => value || defaultValue,
};

// Usage in variables: {{node.id.output | uppercase}}
// Usage in variables: {{node.id.message | default:"No message"}}
```

---

## 5. Implementation Plan

### Phase 1: Variable Documentation (Week 1)

**Goal:** Add detailed output documentation to all nodes

**Tasks:**
1. Extend `outputs` schema in NodeDefinitions.cjs
   - Change from `string[]` to `Record<string, OutputDef>`
   - Add type, description, example for each output
   - Add nested children for complex outputs

2. Create API endpoint `/api/flows/nodes/:type/outputs`
   - Return full output schema with descriptions
   - Include nested path documentation

3. Add output documentation for 25 existing nodes
   - Trigger nodes (4)
   - AI nodes (5)
   - Logic nodes (7)
   - Messaging nodes (4)
   - Web nodes (2)
   - Agentic nodes (3)

**Deliverables:**
- [ ] Extended OutputDef schema
- [ ] API endpoint for output schema
- [ ] 25 nodes with full output documentation
- [ ] Unit tests for output schema validation

### Phase 2: Variable Explorer UI (Week 2)

**Goal:** Create user-friendly variable browser

**Tasks:**
1. Create VariableExplorer component
   - Expandable tree view for nested outputs
   - Copy-to-clipboard functionality
   - Type badges and examples
   - Search/filter functionality

2. Integrate into NodeConfigPanel
   - Expandable section at bottom of panel
   - Fetches output schema from API
   - Shows all previous node outputs

3. Add variable suggestions to variable fields
   - Context-aware suggestions based on flow
   - Previous node outputs
   - Flow variables
   - Environment variables

**Deliverables:**
- [ ] VariableExplorer component
- [ ] Integration with NodeConfigPanel
- [ ] Context-aware variable suggestions
- [ ] Unit tests for component

### Phase 3: Enhanced Field Types (Week 3)

**Goal:** Add missing field types from old implementation

**Tasks:**
1. Add CODE field type
   - Monaco Editor integration
   - Syntax highlighting for JavaScript/Python
   - Auto-complete and linting

2. Add platform-specific field display
   - Add `platformSpecific` property to PropertyDef
   - Filter fields based on current platform
   - Update NodeConfigPanel rendering logic

3. Add permission-based field filtering
   - Add `requiredPermissions` property
   - Check user permissions before rendering
   - Hide sensitive fields from non-admin users

4. Add more helper text
   - Review old implementation helper text
   - Add to all complex fields
   - Include examples in helper text

**Deliverables:**
- [ ] CODE field type with Monaco Editor
- [ ] Platform-specific field filtering
- [ ] Permission-based field visibility
- [ ] Enhanced helper text coverage

### Phase 4: Variable Picker Component (Week 4)

**Goal:** Implement full-featured variable picker

**Tasks:**
1. Create VariablePicker component
   - Category-based browsing (Trigger, Nodes, Flow, Env, Time)
   - Search functionality
   - Hierarchical variable display
   - Copy-to-clipboard

2. Integrate with variable field type
   - Show picker on click/focus
   - Insert variable at cursor position
   - Close on selection

3. Add variable transformation support
   - Pipe syntax: `{{var | transform}}`
   - Common transforms: uppercase, lowercase, trim, default
   - Chain transforms: `{{var | trim | uppercase}}`

**Deliverables:**
- [ ] VariablePicker component
- [ ] Integration with variable fields
- [ ] Variable transformation system
- [ ] Documentation for transforms

### Phase 5: Testing & Documentation (Week 5-6)

**Goal:** Comprehensive testing and user documentation

**Tasks:**
1. Unit tests for all new components
2. Integration tests for config panel
3. User documentation for variable system
4. Video tutorials for complex features
5. Migration guide from old implementation

**Deliverables:**
- [ ] 80%+ test coverage
- [ ] User guide: "Using Variables in FlowBuilder"
- [ ] Video: "Advanced Variable Techniques"
- [ ] Migration guide for existing flows

---

## 6. Success Metrics

| Metric | Current | Target | Timeline |
|--------|---------|--------|----------|
| Nodes with Output Docs | 0/25 | 25/25 | Week 1 |
| Variable Discoverability | Poor | Excellent | Week 2 |
| Platform-Specific Fields | 0 | 10+ | Week 3 |
| Permission Filtering | No | Yes | Week 3 |
| Variable Picker | No | Yes | Week 4 |
| User Satisfaction | N/A | 4.5/5 | Week 6 |
| Config Time per Node | ~2 min | ~1 min | Week 6 |

---

## 7. Risk Assessment

### High Risk

1. **Breaking Changes:** New output schema may break existing flows
   - **Mitigation:** Maintain backward compatibility, support both formats

2. **Performance:** Variable browser may slow UI with large flows
   - **Mitigation:** Virtual scrolling, lazy loading, debounced search

### Medium Risk

1. **Complexity:** Variable transformations add complexity
   - **Mitigation:** Start with simple transforms, thorough testing

2. **User Confusion:** Too many options may confuse users
   - **Mitigation:** Progressive disclosure, good defaults, clear docs

### Low Risk

1. **Maintenance:** More code to maintain
   - **Mitigation:** Clean architecture, good test coverage

---

**Document Status:** Draft v1.0
**Last Updated:** 2026-02-02
**Next Review:** After Phase 2 completion
