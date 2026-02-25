# Node Implementation Comparison

## Executive Summary

This document compares the node implementation architecture between the old proven FlowBuilder (WhatsBots) and the current implementation (SwarmAI). The analysis covers node structure, type systems, registration mechanisms, and cataloging approaches.

**Key Finding:** The old implementation has a comprehensive node catalog (150+ nodes) with frontend-focused architecture, while the current implementation has a cleaner backend-driven schema (20+ nodes) with superior validation but lacks breadth.

---

## 1. Old Implementation Analysis (WhatsBots)

### Architecture Overview

**Location:** `D:\source\AI\WhatsBots\src\components\automation\FlowBuilder\`

**Key Files:**
- `nodeDefinitions.ts` (1526 lines) - Comprehensive node catalog
- `nodeRegistry.ts` (120 lines) - Component mapping system
- `FlowBuilderView.tsx` (898 lines) - Main container

### Node Definition Structure

```typescript
interface NodeDefinition {
  type: string;           // Unique identifier (e.g., "trigger:manual")
  label: string;          // Display name
  description: string;    // User-facing description
  icon: string;          // Icon name from lucide-react
  category: string;      // Primary category
  subcategory?: string;  // Optional subcategory
  color: string;         // Visual color coding
  platform?: string[];   // Platform compatibility (whatsapp, telegram, etc.)
  permissions?: string[]; // Required permissions (e.g., superadmin)
}
```

### Node Categories (13 Total)

| Category | Count | Examples |
|----------|-------|----------|
| `triggers` | 15+ | Manual, Schedule, Webhook, Message, Email, Form |
| `whatsapp` | 30+ | SendText, SendImage, SendDocument, SendLocation, CreateGroup |
| `telegram` | 25+ | SendMessage, SendPhoto, EditMessage, DeleteMessage |
| `email` | 10+ | SendEmail, Reply, Forward, Search |
| `files` | 8+ | ReadFile, WriteFile, ParseCSV, GeneratePDF |
| `web` | 12+ | HTTP Request, Scrape, API Call, Webhook Response |
| `ai` | 15+ | ChatCompletion, TextToSpeech, ImageGen, Embedding |
| `scheduling` | 5+ | Delay, Schedule, Cron |
| `n8n` | 8+ | N8N workflow integration nodes |
| `control` | 10+ | If, Switch, Loop, Parallel, Error Handler |
| `data` | 12+ | Transform, Filter, Aggregate, Variable Get/Set |
| `storage` | 8+ | Database, Cache, File Storage |
| `ai-unified` | 10+ | RAG Query, Agent Call, Swarm Broadcast |

**Total Node Types:** 150+

### Node Registration System

**Component Mapping (`nodeRegistry.ts`):**

```typescript
const NODE_TYPE_COMPONENTS: Record<string, React.ComponentType<NodeProps>> = {
  trigger: TriggerNode,
  action: ActionNode,
  control: ControlNode,
  switch: SwitchNode,
  ai_router: AiRouterNode,
};

export function generateNodeTypes(): NodeTypes {
  const nodeTypes: NodeTypes = {};
  ALL_NODES.forEach(nodeDef => {
    const baseType = nodeDef.type.split(':')[0];
    const Component = NODE_TYPE_COMPONENTS[baseType] || ActionNode;
    nodeTypes[nodeDef.type] = Component;
  });
  return nodeTypes;
}
```

**Key Characteristics:**
- Simple 5-component system (Trigger, Action, Control, Switch, AiRouter)
- All nodes of same base type share the same React component
- Dynamic component assignment based on type prefix
- Frontend-only registration (no backend validation)

### Helper Functions

```typescript
// Retrieve node definition by type
export function getNodeDefinition(type: string): NodeDefinition | undefined {
  return ALL_NODES.find(node => node.type === type);
}

// Get nodes by category
export function getNodesByCategory(category: string): NodeDefinition[] {
  return ALL_NODES.filter(node => node.category === category);
}

// Search nodes (fuzzy search)
export function searchNodes(query: string): NodeDefinition[] {
  const lowerQuery = query.toLowerCase();
  return ALL_NODES.filter(node =>
    node.label.toLowerCase().includes(lowerQuery) ||
    node.description.toLowerCase().includes(lowerQuery) ||
    node.type.toLowerCase().includes(lowerQuery)
  );
}
```

### Strengths

1. **Comprehensive Catalog**: 150+ node types covering wide range of use cases
2. **Well-Organized Categories**: 13 categories with subcategories
3. **Platform Awareness**: Built-in platform compatibility metadata
4. **Permission System**: Superadmin-only nodes clearly marked
5. **Rich Metadata**: Each node has icon, description, color coding
6. **Search Functionality**: Built-in fuzzy search across nodes
7. **Simple Component Model**: Easy to add new node types

### Weaknesses

1. **Frontend-Only Schema**: No backend validation of node configurations
2. **No Property Definitions**: Node properties defined separately in config panel
3. **Tight Coupling**: NodeDefinitions tightly coupled to UI components
4. **No Validation Schema**: Runtime validation happens in config panel, not declaratively
5. **Hard to Extend**: Adding new nodes requires touching multiple files
6. **No Type Safety**: Node data types not enforced at definition level

---

## 2. Current Implementation Analysis (SwarmAI)

### Architecture Overview

**Location (Backend):** `d:\source\AI\SwarmAI\server\services\flow\NodeDefinitions.cjs`
**Location (Frontend):** `d:\source\AI\SwarmAI\frontend\src\components\flowbuilder\`

### Node Definition Structure

```javascript
const NODE_DEFINITIONS = {
  trigger: {
    manual: {
      label: 'Manual Trigger',
      description: 'Start flow manually from UI or API',
      category: 'trigger',
      color: 'amber',
      icon: 'Play',
      properties: {
        flowInputs: {
          type: FIELD_TYPES.JSON,
          label: 'Flow Inputs',
          description: 'JSON object of input variables',
          default: {},
          required: false,
          showVariablePicker: false,
        },
      },
      outputs: ['flowId', 'executionId', 'timestamp', 'inputs'],
    },
  },
  // ... more nodes
};
```

### Field Types System

```javascript
const FIELD_TYPES = {
  TEXT: 'text',           // Single-line input
  TEXTAREA: 'textarea',   // Multi-line input
  NUMBER: 'number',       // Numeric input
  SELECT: 'select',       // Dropdown selection
  CHECKBOX: 'checkbox',   // Boolean toggle
  JSON: 'json',          // JSON editor
  VARIABLE: 'variable',   // Variable picker
  MODEL: 'model',        // AI model selector
  PROVIDER: 'provider',   // AI provider selector
  MCP_TOOL: 'mcp_tool',  // MCP tool selector
};
```

### Property Definition Schema

```javascript
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

### Node Categories (6 Total)

| Category | Count | Examples |
|----------|-------|----------|
| `trigger` | 4 | Manual, Schedule, Webhook, Message |
| `ai` | 5 | ChatCompletion, ClassifyIntent, Summarize, RAGQuery, Translate |
| `logic` | 7 | Condition, Switch, Loop, Delay, GetVariable, SetVariable, ErrorHandler |
| `messaging` | 4 | SendWhatsApp, SendTelegram, SendEmail, SendWebhook |
| `web` | 2 | HTTPRequest, WebhookResponse |
| `agentic` | 3 | CustomTool, AgenticTask, SelfImprove |

**Total Node Types:** 25

### Node Registration System

**Backend Executor Registration (`FlowExecutionEngine.cjs`):**

```javascript
class FlowExecutionEngine extends EventEmitter {
  constructor(services = {}) {
    super();
    this.nodeExecutors = new Map();
    this.registerDefaultExecutors();
  }

  registerDefaultExecutors() {
    // Trigger nodes
    this.registerExecutor('trigger:manual', new ManualTriggerExecutor(this.services));
    this.registerExecutor('trigger:schedule', new ScheduleTriggerExecutor(this.services));

    // AI nodes
    this.registerExecutor('ai:chat_completion', new ChatCompletionExecutor(this.services));
    this.registerExecutor('ai:classify_intent', new ClassifyIntentExecutor(this.services));

    // Logic nodes
    this.registerExecutor('logic:condition', new ConditionExecutor(this.services));
    this.registerExecutor('logic:switch', new SwitchExecutor(this.services));

    // Messaging nodes
    this.registerExecutor('messaging:send_whatsapp', new SendWhatsAppExecutor(this.services));

    // Agentic nodes
    this.registerExecutor('agentic:custom_tool', new CustomToolExecutor(this.services));
  }

  registerExecutor(nodeType, executor) {
    this.nodeExecutors.set(nodeType, executor);
  }
}
```

**Frontend Component Mapping (`nodes/index.ts`):**

```typescript
export const nodeTypes = {
  trigger: TriggerNode,
  action: ActionNode,
  ai: AINode,
  swarm: SwarmNode,
};
```

### Validation System

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
```

### Strengths

1. **Backend-Driven Schema**: Node definitions live on backend with validation
2. **Type Safety**: Field types enforced with validation schema
3. **Property Definitions**: Properties defined alongside node definition
4. **Conditional Display**: Fields can be shown/hidden based on other field values
5. **Custom Validation**: Per-field validation functions
6. **Executor Pattern**: Clean separation between node definition and execution logic
7. **Variable Resolution**: Built-in `{{template}}` variable system
8. **Output Documentation**: Each node declares its output variables

### Weaknesses

1. **Limited Node Catalog**: Only 25 nodes vs 150+ in old implementation
2. **Missing Categories**: No dedicated WhatsApp, Telegram, Email, Files, Storage categories
3. **Fewer Integrations**: Missing N8N, advanced AI, file operations, data transformation
4. **No Platform Metadata**: No built-in platform compatibility tracking
5. **No Permission System**: Missing superadmin-only node filtering
6. **Basic Frontend Components**: Only 4 base components (Trigger, Action, AI, Swarm)

---

## 3. Gap Analysis

### Missing Node Types in Current Implementation

**High Priority (Core Functionality):**
- WhatsApp nodes (30+ missing): SendImage, SendDocument, SendLocation, CreateGroup, AddParticipant, etc.
- Telegram nodes (25+ missing): SendPhoto, SendDocument, EditMessage, DeleteMessage, etc.
- Email nodes (8+ missing): Reply, Forward, Search, Attachment handling
- File operations (8+ missing): ReadFile, WriteFile, ParseCSV, ParseXML, GeneratePDF
- Data transformation (10+ missing): Transform, Filter, Map, Reduce, Aggregate, Sort

**Medium Priority (Enhanced Features):**
- Advanced AI nodes: TextToSpeech, ImageGeneration, AudioTranscription, Embedding
- Web scraping and API nodes: Advanced HTTP, Pagination, Authentication
- Storage nodes: Database operations, Cache management, File storage
- Scheduling nodes: Advanced cron, recurring tasks, calendar integration

**Low Priority (Nice-to-Have):**
- N8N integration nodes (8 nodes)
- Advanced control flow: Parallel execution, Wait for multiple, Fork/Join
- Specialized data processing: CSV/XML/YAML parsing, Data validation

### Missing Features in Current Implementation

1. **No Node Search**: Old implementation has fuzzy search across 150+ nodes
2. **No Platform Filtering**: Can't filter WhatsApp-compatible vs Telegram-compatible nodes
3. **No Subcategories**: Old implementation groups nodes into subcategories for better organization
4. **No Permission-Based Filtering**: Can't hide superadmin-only nodes from regular users
5. **Limited Helper Functions**: Missing getNodeDefinition(), getNodesByCategory(), searchNodes()

### Architectural Improvements in Current Implementation

1. **Backend Validation**: Current implementation validates on backend, preventing invalid flows
2. **Property Schema**: Properties are first-class citizens with types and validation
3. **Output Documentation**: Each node declares what variables it outputs
4. **Conditional Fields**: Fields can show/hide based on other field values
5. **Variable Resolution**: Built-in {{template}} system for dynamic values
6. **Executor Pattern**: Clean separation of concerns between definition and execution

---

## 4. Recommendations

### Immediate Actions (Critical Path)

1. **Merge Node Catalogs**
   - Port 150+ node definitions from old implementation to new schema
   - Maintain backward compatibility with existing flows
   - Add property definitions for each ported node

2. **Implement Platform Metadata**
   ```javascript
   const NODE_DEFINITIONS = {
     trigger: {
       manual: {
         // ... existing properties
         platform: ['whatsapp', 'telegram', 'email', 'webhook'],
         permissions: [],  // Empty array = available to all users
       },
     },
   };
   ```

3. **Add Permission System**
   ```javascript
   // In NodeDefinitions.cjs
   function getAvailableNodes(userRole) {
     return Object.entries(NODE_DEFINITIONS)
       .filter(([category, nodes]) => {
         return Object.entries(nodes).filter(([subtype, nodeDef]) => {
           const requiredPerms = nodeDef.permissions || [];
           return requiredPerms.length === 0 || requiredPerms.includes(userRole);
         });
       });
   }
   ```

4. **Implement Node Search**
   ```javascript
   // In NodeDefinitions.cjs
   function searchNodes(query, filters = {}) {
     const lowerQuery = query.toLowerCase();
     const results = [];

     for (const [category, nodes] of Object.entries(NODE_DEFINITIONS)) {
       for (const [subtype, nodeDef] of Object.entries(nodes)) {
         // Filter by platform
         if (filters.platform && !nodeDef.platform?.includes(filters.platform)) {
           continue;
         }

         // Filter by permissions
         if (filters.userRole && nodeDef.permissions?.length > 0) {
           if (!nodeDef.permissions.includes(filters.userRole)) {
             continue;
           }
         }

         // Search in label, description, type
         const searchText = [
           nodeDef.label,
           nodeDef.description,
           `${category}:${subtype}`,
         ].join(' ').toLowerCase();

         if (searchText.includes(lowerQuery)) {
           results.push({
             type: `${category}:${subtype}`,
             ...nodeDef,
           });
         }
       }
     }

     return results;
   }
   ```

### Short-Term Enhancements (1-2 Weeks)

1. **Add Subcategories**
   ```javascript
   const NODE_DEFINITIONS = {
     messaging: {
       send_whatsapp_text: {
         label: 'Send Text',
         subcategory: 'WhatsApp',
         // ...
       },
       send_telegram_text: {
         label: 'Send Text',
         subcategory: 'Telegram',
         // ...
       },
     },
   };
   ```

2. **Implement Node Versioning**
   ```javascript
   const NODE_DEFINITIONS = {
     ai: {
       chat_completion: {
         version: '1.0.0',
         deprecated: false,
         migrations: {
           '0.9.0': (oldConfig) => {
             // Migrate old config to new format
             return { ...oldConfig, newField: 'default' };
           },
         },
       },
     },
   };
   ```

3. **Add Node Templates**
   ```javascript
   const NODE_TEMPLATES = {
     'whatsapp-welcome-flow': {
       name: 'WhatsApp Welcome Message',
       description: 'Send automated welcome message to new contacts',
       nodes: [
         { id: '1', type: 'trigger:message', config: { ... } },
         { id: '2', type: 'messaging:send_whatsapp', config: { ... } },
       ],
       edges: [
         { source: '1', target: '2' },
       ],
     },
   };
   ```

### Long-Term Strategy (1-3 Months)

1. **Node Marketplace**
   - Allow users to create and share custom node definitions
   - Community-contributed nodes with ratings and reviews
   - Versioned node packages with dependency management

2. **Visual Node Editor**
   - GUI for creating new node definitions without code
   - Property builder with drag-and-drop field configuration
   - Live preview of node appearance in FlowBuilder

3. **Advanced Node Features**
   - Nested flows (sub-flows as nodes)
   - Dynamic port generation (variable number of inputs/outputs)
   - Streaming outputs for long-running operations
   - Node telemetry and performance monitoring

4. **Developer Experience**
   - Node development SDK
   - Hot-reload for node development
   - Testing framework for node executors
   - Documentation generator from node definitions

---

## 5. Implementation Plan

### Phase 1: Foundation (Week 1-2)

**Goal:** Establish core infrastructure for comprehensive node catalog

**Tasks:**
1. Create `server/services/flow/NodeCatalog.cjs`
   - Port all 150+ node definitions from old implementation
   - Add platform metadata to each node
   - Add permission metadata to each node
   - Implement searchNodes(), getNodesByCategory(), getNodeDefinition()

2. Extend `NODE_DEFINITIONS` schema
   ```javascript
   const EXTENDED_NODE_SCHEMA = {
     type: String,        // Unique identifier
     label: String,       // Display name
     description: String, // User-facing description
     category: String,    // Primary category
     subcategory: String, // Optional subcategory
     icon: String,        // Icon name
     color: String,       // Visual color
     platform: [String],  // Compatibility
     permissions: [String], // Required permissions
     properties: Object,  // Property definitions
     outputs: [String],   // Output variables
     version: String,     // Node version
     deprecated: Boolean, // Deprecation flag
   };
   ```

3. Create API endpoint: `GET /api/flows/nodes/catalog`
   ```javascript
   router.get('/catalog', authenticateToken, async (req, res) => {
     const { search, category, platform, userRole } = req.query;

     const filters = {
       platform: platform || null,
       userRole: req.user.role,
     };

     let nodes = search
       ? searchNodes(search, filters)
       : getAllNodes(filters);

     if (category) {
       nodes = nodes.filter(n => n.category === category);
     }

     res.json({ nodes });
   });
   ```

4. Update frontend NodePalette
   - Fetch nodes from backend API instead of hardcoded list
   - Implement platform filter dropdown
   - Add permission-based filtering

**Deliverables:**
- [ ] NodeCatalog.cjs with 150+ nodes
- [ ] API endpoint for node catalog
- [ ] Updated NodePalette component
- [ ] Unit tests for searchNodes()

### Phase 2: Node Executors (Week 3-4)

**Goal:** Implement executors for high-priority missing nodes

**Priority Order:**
1. WhatsApp nodes (30+)
2. Telegram nodes (25+)
3. Email nodes (8+)
4. File operations (8+)
5. Data transformation (10+)

**Tasks:**
1. Create executor classes for each node type
   ```javascript
   // server/services/flow/nodes/messaging/SendWhatsAppImageExecutor.cjs
   class SendWhatsAppImageExecutor extends BaseNodeExecutor {
     async execute(node, context) {
       const { phoneNumber, imageUrl, caption } = node.config;

       // Resolve variables
       const resolvedPhone = this.resolveVariable(phoneNumber, context);
       const resolvedUrl = this.resolveVariable(imageUrl, context);
       const resolvedCaption = this.resolveVariable(caption, context);

       // Send image via WhatsApp service
       const result = await this.services.whatsapp.sendImage(
         resolvedPhone,
         resolvedUrl,
         resolvedCaption
       );

       return {
         messageId: result.id,
         timestamp: result.timestamp,
         status: 'sent',
       };
     }
   }
   ```

2. Register executors in FlowExecutionEngine
   ```javascript
   registerDefaultExecutors() {
     // WhatsApp
     this.registerExecutor('messaging:send_whatsapp_image', new SendWhatsAppImageExecutor(this.services));
     this.registerExecutor('messaging:send_whatsapp_document', new SendWhatsAppDocumentExecutor(this.services));
     // ... 28 more WhatsApp nodes

     // Telegram
     this.registerExecutor('messaging:send_telegram_photo', new SendTelegramPhotoExecutor(this.services));
     // ... 24 more Telegram nodes

     // Email
     this.registerExecutor('email:reply', new EmailReplyExecutor(this.services));
     // ... 7 more Email nodes

     // Files
     this.registerExecutor('files:read_file', new ReadFileExecutor(this.services));
     // ... 7 more File nodes

     // Data
     this.registerExecutor('data:transform', new TransformExecutor(this.services));
     // ... 9 more Data nodes
   }
   ```

3. Add property validation for each node
4. Create integration tests for each executor

**Deliverables:**
- [ ] 80+ new node executors
- [ ] Integration tests for each executor
- [ ] Error handling and logging
- [ ] Performance benchmarks

### Phase 3: Advanced Features (Week 5-6)

**Goal:** Implement advanced node features and UX improvements

**Tasks:**
1. Node versioning and migrations
2. Conditional field display in config panel
3. Variable autocomplete in config fields
4. Node templates and examples
5. Bulk node operations (copy, duplicate, delete)

**Deliverables:**
- [ ] Node versioning system
- [ ] Migration framework
- [ ] Enhanced config panel
- [ ] 20+ node templates

### Phase 4: Testing & Documentation (Week 7-8)

**Goal:** Comprehensive testing and documentation

**Tasks:**
1. Unit tests for all node executors (80%+ coverage)
2. Integration tests for common flows
3. Performance testing with large flows (100+ nodes)
4. API documentation for node catalog
5. User documentation for each node type
6. Video tutorials for complex nodes

**Deliverables:**
- [ ] 80%+ test coverage
- [ ] API documentation
- [ ] User guide with examples
- [ ] 10+ video tutorials

---

## 6. Success Metrics

### Quantitative Metrics

| Metric | Current | Target | Timeline |
|--------|---------|--------|----------|
| Total Node Types | 25 | 150+ | 4 weeks |
| Node Categories | 6 | 13 | 2 weeks |
| Test Coverage | 40% | 80% | 6 weeks |
| Node Search Latency | N/A | <100ms | 2 weeks |
| Executor Performance | Varies | <500ms avg | 4 weeks |

### Qualitative Metrics

- **Developer Experience:** Easy to add new nodes (< 30 min per node)
- **User Experience:** Intuitive node search and discovery
- **Reliability:** 99%+ successful flow executions
- **Documentation:** Every node has examples and guides
- **Maintainability:** Clean separation of concerns, testable code

---

## 7. Risk Assessment

### High Risk

1. **Breaking Changes:** Porting 150+ nodes may break existing flows
   - **Mitigation:** Implement backward compatibility layer, version flows

2. **Performance:** Large node catalog may slow down UI
   - **Mitigation:** Implement virtual scrolling, lazy loading, caching

3. **Validation Conflicts:** Old nodes may not fit new validation schema
   - **Mitigation:** Create migration scripts, manual review for critical nodes

### Medium Risk

1. **Integration Issues:** New executors may have bugs with platform clients
   - **Mitigation:** Comprehensive integration testing, staged rollout

2. **Inconsistent UX:** Ported nodes may have inconsistent config panels
   - **Mitigation:** UI review pass, design system enforcement

### Low Risk

1. **Documentation Debt:** 150+ nodes require documentation
   - **Mitigation:** Auto-generate docs from schema, community contributions

---

## 8. Appendix

### A. Node Type Mapping (Old → New)

| Old Type | New Type | Status |
|----------|----------|--------|
| `trigger:manual` | `trigger:manual` | ✅ Implemented |
| `trigger:schedule` | `trigger:schedule` | ✅ Implemented |
| `trigger:webhook` | `trigger:webhook` | ✅ Implemented |
| `trigger:message` | `trigger:message` | ✅ Implemented |
| `whatsapp:send_text` | `messaging:send_whatsapp` | ✅ Implemented |
| `whatsapp:send_image` | `messaging:send_whatsapp_image` | ❌ Missing |
| `telegram:send_message` | `messaging:send_telegram` | ✅ Implemented |
| `telegram:send_photo` | `messaging:send_telegram_photo` | ❌ Missing |
| `email:send` | `messaging:send_email` | ✅ Implemented |
| `email:reply` | `email:reply` | ❌ Missing |
| ... | ... | ... |

### B. Property Type Mapping

| Old Type | New Type | Notes |
|----------|----------|-------|
| `string` | `FIELD_TYPES.TEXT` | Direct mapping |
| `textarea` | `FIELD_TYPES.TEXTAREA` | Direct mapping |
| `number` | `FIELD_TYPES.NUMBER` | Added min/max validation |
| `dropdown` | `FIELD_TYPES.SELECT` | Added options array |
| `boolean` | `FIELD_TYPES.CHECKBOX` | Direct mapping |
| `json` | `FIELD_TYPES.JSON` | Added JSON validation |
| N/A | `FIELD_TYPES.VARIABLE` | New feature |
| N/A | `FIELD_TYPES.MODEL` | New feature |
| N/A | `FIELD_TYPES.PROVIDER` | New feature |

### C. Category Reorganization

**Old Categories (13):**
- triggers, whatsapp, telegram, email, files, web, ai, scheduling, n8n, control, data, storage, ai-unified

**New Categories (13):**
- trigger, messaging (WhatsApp + Telegram + Email), files, web, ai, scheduling, integration (N8N), logic (control), data, storage, agentic

**Rationale:** Consolidate platform-specific nodes into `messaging` category with subcategories for better organization.

---

**Document Status:** Draft v1.0
**Last Updated:** 2026-02-02
**Next Review:** After Phase 1 completion
