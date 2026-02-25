# FlowBuilder Automation

FlowBuilder is SwarmAI's visual workflow automation system that lets you create complex AI-powered workflows without writing code.

## Overview

FlowBuilder uses a **node-based visual editor** where you:
1. Drag nodes from the library
2. Connect them to define execution flow
3. Configure each node's settings
4. Save and activate your flow

Flows run automatically based on triggers (schedule, webhook, message, manual).

## Core Concepts

### Nodes
Individual units of work (trigger, AI operation, logic, action)

### Connections
Links between nodes that determine execution order and data flow

### Variables
Dynamic values that flow between nodes: `{{input.field}}`, `{{node.id.output}}`, `{{var.name}}`

### Execution Context
Runtime data available during flow execution (user, agent, conversation, environment)

## Node Categories

### 1. Trigger Nodes

Start the flow based on events:

#### Manual Trigger
```yaml
Type: Manual
Use Case: Run on-demand from dashboard
Config: None
Output: { triggeredAt, triggeredBy }
```

#### Schedule Trigger
```yaml
Type: Schedule
Use Case: Run at specific times/intervals
Config:
  - cron: "0 9 * * *"  # Daily at 9 AM
  - timezone: "America/New_York"
Output: { executedAt, scheduleConfig }
```

**Cron Examples**:
- `0 9 * * *` - Daily at 9 AM
- `0 */6 * * *` - Every 6 hours
- `0 9 * * 1` - Every Monday at 9 AM
- `0 0 1 * *` - First day of month at midnight

#### Webhook Trigger
```yaml
Type: Webhook
Use Case: Trigger from external systems
Config:
  - webhookId: "unique-webhook-id"
  - secret: "optional-hmac-secret"
Output: { body, headers, query }
```

**Example**:
```bash
POST https://agents.northpeak.app/api/webhooks/unique-webhook-id
Content-Type: application/json
X-Webhook-Secret: your-secret

{"orderId": 12345, "status": "completed"}
```

#### Message Trigger
```yaml
Type: Message
Use Case: React to incoming messages
Config:
  - platform: "whatsapp" | "telegram" | "email"
  - filter: { contains: "help" }
Output: { message, sender, platform, conversationId }
```

### 2. AI Nodes

Perform AI operations:

#### Chat Completion
```yaml
Type: ChatCompletion
Use Case: Generate AI responses
Config:
  - provider: "openrouter" | "ollama" | "claude-cli"
  - model: "deepseek/deepseek-r1-0528"
  - prompt: "Summarize: {{input.text}}"
  - temperature: 0.7
  - maxTokens: 2048
Output: { content, usage }
```

#### Classify Intent
```yaml
Type: ClassifyIntent
Use Case: Categorize user messages
Config:
  - intents:
      - support: ["help", "issue", "problem"]
      - sales: ["buy", "price", "purchase"]
      - general: ["hello", "hi", "thanks"]
Output: { intent, confidence, matched }
```

#### Summarize
```yaml
Type: Summarize
Use Case: Create concise summaries
Config:
  - text: "{{node.fetchDoc.output}}"
  - maxLength: 200
  - style: "bullet-points" | "paragraph"
Output: { summary, originalLength, summaryLength }
```

#### RAG Query
```yaml
Type: RAGQuery
Use Case: Search knowledge base
Config:
  - libraryId: 1
  - query: "{{input.question}}"
  - topK: 3
Output: { results, sources }
```

#### Translate
```yaml
Type: Translate
Use Case: Language translation
Config:
  - text: "{{input.message}}"
  - targetLanguage: "es"
  - sourceLanguage: "auto"
Output: { translated, sourceLanguage, targetLanguage }
```

### 3. Logic Nodes

Control flow execution:

#### Condition
```yaml
Type: Condition
Use Case: Branch based on conditions
Config:
  - condition: "{{node.classify.intent}} == 'support'"
  - operator: "equals" | "contains" | "greater" | "less"
Output: { matched: true/false }
Connections: trueBranch, falseBranch
```

**Operators**:
- `equals`, `notEquals`
- `contains`, `notContains`
- `startsWith`, `endsWith`
- `greater`, `less`, `greaterOrEqual`, `lessOrEqual`
- `exists`, `notExists`

#### Switch
```yaml
Type: Switch
Use Case: Multi-way branching
Config:
  - variable: "{{node.classify.intent}}"
  - cases:
      - support: "Handle support"
      - sales: "Handle sales"
      - default: "Handle general"
Output: { matchedCase }
```

#### Loop
```yaml
Type: Loop
Use Case: Iterate over arrays
Config:
  - items: "{{node.getOrders.output}}"
  - maxIterations: 100
Output: { item, index, isLast }
```

#### Delay
```yaml
Type: Delay
Use Case: Wait before next action
Config:
  - duration: 5000  # milliseconds
  - unit: "ms" | "seconds" | "minutes"
Output: { delayedAt, duration }
```

#### Error Handler
```yaml
Type: ErrorHandler
Use Case: Catch and handle errors
Config:
  - retryCount: 3
  - retryDelay: 1000
  - fallbackAction: "log" | "notify" | "skip"
Output: { error, retryAttempt }
```

#### Variables
```yaml
Type: Variables
Use Case: Set/get variables
Config:
  - action: "set" | "get" | "delete"
  - name: "orderTotal"
  - value: "{{node.calculate.result}}"
Output: { name, value }
```

### 4. Messaging Nodes

Send messages:

#### Send Text (WhatsApp)
```yaml
Type: SendText
Use Case: Send WhatsApp message
Config:
  - platform: "whatsapp"
  - recipient: "+1234567890"
  - content: "Your order {{var.orderId}} is ready!"
Output: { messageId, sentAt }
```

#### Send Text (Telegram)
```yaml
Type: SendText
Use Case: Send Telegram message
Config:
  - platform: "telegram"
  - chatId: "123456789"
  - content: "{{node.summary.output}}"
  - parseMode: "Markdown" | "HTML"
Output: { messageId, sentAt }
```

#### Send Text (Email)
```yaml
Type: SendText
Use Case: Send email
Config:
  - platform: "email"
  - to: "user@example.com"
  - subject: "Daily Report"
  - body: "{{node.report.output}}"
  - html: true
Output: { messageId, sentAt }
```

#### Send Webhook
```yaml
Type: SendWebhook
Use Case: POST data to external API
Config:
  - url: "https://api.example.com/webhook"
  - method: "POST" | "PUT" | "PATCH"
  - headers:
      Content-Type: "application/json"
      Authorization: "Bearer {{env.API_KEY}}"
  - body: { "data": "{{node.result.output}}" }
Output: { status, response, sentAt }
```

### 5. Swarm Nodes

Multi-agent collaboration:

#### Agent Query
```yaml
Type: AgentQuery
Use Case: Ask another agent
Config:
  - agentId: 2
  - query: "{{input.question}}"
  - includeContext: true
Output: { response, agentName }
```

#### Broadcast
```yaml
Type: Broadcast
Use Case: Send to all agents
Config:
  - message: "{{input.announcement}}"
  - excludeAgents: [1, 3]
Output: { sentTo, responses }
```

#### Handoff
```yaml
Type: Handoff
Use Case: Transfer to specialist agent
Config:
  - targetAgentId: 5
  - reason: "Technical support required"
  - context: { ... }
Output: { handoffId, acceptedAt }
```

#### Consensus
```yaml
Type: Consensus
Use Case: Multi-agent voting
Config:
  - agentIds: [1, 2, 3, 4]
  - question: "Should we approve this request?"
  - threshold: 0.75  # 75% agreement
Output: { decision, votes, confidence }
```

### 6. Agentic Nodes

Advanced AI capabilities:

#### Custom Tool
```yaml
Type: CustomTool
Use Case: Execute custom Python tool
Config:
  - toolId: "my-calculator"
  - agentId: 1
  - input: { "a": 5, "b": 10 }
Output: { result, executionTime }
```

#### Agentic Task
```yaml
Type: AgenticTask
Use Case: Autonomous CLI agent task
Config:
  - agentId: 1
  - task: "Analyze this log file and find errors"
  - workspace: "/workspaces/agent-1"
  - timeout: 300000  # 5 minutes
Output: { result, filesCreated, logsPath }
```

#### Self Improve
```yaml
Type: SelfImprove
Use Case: Agent learning from feedback
Config:
  - agentId: 1
  - feedback: "{{input.userFeedback}}"
  - learningMode: "prompt" | "rag" | "both"
Output: { improved, changesApplied }
```

## Variable Resolution

FlowBuilder supports dynamic variables:

### Input Variables
```javascript
{{input.field}}           // Trigger input
{{input.message.content}} // Nested access
```

### Node Output
```javascript
{{node.nodeId.output}}          // Node result
{{node.classify.intent}}        // Specific field
{{node.loop.item.name}}         // Loop item
```

### Flow Variables
```javascript
{{var.orderTotal}}       // Set via Variables node
{{var.userId}}           // Persistent across nodes
```

### Environment Variables
```javascript
{{env.API_KEY}}          // From .env file
{{env.WEBHOOK_SECRET}}   // Secure secrets
```

### Context Variables
```javascript
{{context.userId}}           // Current user
{{context.agentId}}          // Current agent
{{context.conversationId}}   // Conversation
{{context.timestamp}}        // Execution time
```

## Flow Examples

### Example 1: Daily Summary Email

```
[Schedule Trigger: 9 AM daily]
    ↓
[RAG Query: Get yesterday's conversations]
    ↓
[Summarize: Create bullet-point summary]
    ↓
[Send Email: Send to manager@company.com]
```

**Configuration**:
```javascript
// Schedule Trigger
{ cron: "0 9 * * *", timezone: "UTC" }

// RAG Query
{
  libraryId: 1,
  query: "conversations from yesterday",
  topK: 20
}

// Summarize
{
  text: "{{node.ragQuery.results}}",
  style: "bullet-points",
  maxLength: 500
}

// Send Email
{
  to: "manager@company.com",
  subject: "Daily Summary - {{context.date}}",
  body: "{{node.summarize.summary}}",
  html: true
}
```

### Example 2: Customer Support Router

```
[Message Trigger: WhatsApp]
    ↓
[Classify Intent]
    ↓
[Switch]
    ├─ support → [Handoff: Support Agent]
    ├─ sales   → [Handoff: Sales Agent]
    └─ general → [Chat Completion: Answer directly]
```

**Configuration**:
```javascript
// Message Trigger
{ platform: "whatsapp" }

// Classify Intent
{
  intents: {
    support: ["help", "issue", "problem", "not working"],
    sales: ["buy", "price", "purchase", "cost"],
    general: ["hello", "hi", "thanks", "info"]
  }
}

// Switch
{ variable: "{{node.classify.intent}}" }

// Handoff (support branch)
{
  targetAgentId: 2,  // Support specialist
  reason: "Customer support required",
  context: { message: "{{input.message}}" }
}
```

### Example 3: Order Processing

```
[Webhook Trigger: /orders/new]
    ↓
[Condition: Check payment status]
    ├─ True → [Loop: Process items]
    │           ↓
    │        [Send Webhook: Update inventory]
    │           ↓
    │        [Send WhatsApp: Confirm to customer]
    └─ False → [Send Email: Payment failed notification]
```

**Configuration**:
```javascript
// Webhook Trigger
{ webhookId: "orders-new", secret: "..." }

// Condition
{
  condition: "{{input.payment.status}} == 'completed'",
  operator: "equals"
}

// Loop (true branch)
{ items: "{{input.order.items}}" }

// Send Webhook (inside loop)
{
  url: "https://inventory.example.com/api/reduce",
  method: "POST",
  body: {
    productId: "{{node.loop.item.productId}}",
    quantity: "{{node.loop.item.quantity}}"
  }
}

// Send WhatsApp
{
  recipient: "{{input.customer.phone}}",
  content: "Order {{input.orderId}} confirmed! Arriving in 2-3 days."
}
```

### Example 4: Multi-Agent Research

```
[Manual Trigger]
    ↓
[Agent Query: Research Agent]
    ↓
[Agent Query: Analysis Agent]
    ↓
[Consensus: 4 specialist agents vote]
    ↓
[Chat Completion: Synthesize final report]
    ↓
[Send Email: Deliver report]
```

## API Endpoints

### List Flows
```bash
GET /api/flows
Authorization: Bearer <token>
```

### Create Flow
```bash
POST /api/flows
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Daily Summary",
  "description": "Send daily conversation summary",
  "nodes": [...],
  "connections": [...]
}
```

### Execute Flow
```bash
POST /api/flows/:id/execute
Authorization: Bearer <token>
Content-Type: application/json

{
  "input": {
    "customField": "value"
  }
}
```

### Get Execution Logs
```bash
GET /api/flows/:id/executions
Authorization: Bearer <token>
```

## Debugging Flows

### Execution Logs

Every flow execution is logged:
```javascript
{
  "executionId": "exec-123",
  "flowId": 1,
  "status": "completed" | "failed" | "running",
  "startedAt": "2026-02-03T10:00:00Z",
  "completedAt": "2026-02-03T10:00:15Z",
  "nodes": [
    {
      "nodeId": "trigger-1",
      "status": "completed",
      "output": { ... },
      "duration": 50
    },
    {
      "nodeId": "chatGPT-1",
      "status": "completed",
      "output": { content: "..." },
      "duration": 1200
    }
  ],
  "error": null
}
```

### Test Mode

Run flows in test mode to see detailed output:
```bash
POST /api/flows/:id/test
{
  "input": { ... },
  "breakpoints": ["nodeId-3"]  # Pause at specific nodes
}
```

### Visual Debugger

Dashboard shows real-time execution:
- Green nodes: completed
- Blue nodes: running
- Red nodes: failed
- Gray nodes: pending

## Best Practices

### 1. Error Handling
Always wrap critical nodes in Error Handler:
```
[HTTP Request]
    ↓
[Error Handler: retry 3 times]
    ├─ Success → Continue
    └─ Failure → Send notification
```

### 2. Rate Limiting
Add Delay nodes between API calls:
```
[Loop: 100 items]
    ↓
[API Call]
    ↓
[Delay: 100ms]  ← Prevent rate limit
```

### 3. Variable Naming
Use clear, descriptive names:
```javascript
// Bad
{{var.x}}, {{var.temp}}, {{var.data}}

// Good
{{var.customerEmail}}, {{var.orderTotal}}, {{var.processingStatus}}
```

### 4. Modular Flows
Break complex flows into sub-flows:
```
[Main Flow]
    ↓
[Sub-Flow: Validate Order] → Reusable
    ↓
[Sub-Flow: Process Payment] → Reusable
    ↓
[Sub-Flow: Send Confirmation] → Reusable
```

### 5. Logging
Add logging nodes for debugging:
```
[Process Data]
    ↓
[Variables: Set "debugLog"]  ← Save intermediate results
    ↓
[Continue...]
```

## Troubleshooting

### Flow Not Triggering

**Schedule**: Check cron syntax, timezone
**Webhook**: Verify webhook URL, secret
**Message**: Check platform connection, filters

### Node Failing

1. Check node configuration
2. Verify variable references exist
3. Review execution logs
4. Test node in isolation

### Variables Not Resolving

1. Check variable syntax: `{{var.name}}`
2. Verify variable is set before use
3. Check for typos in variable names
4. Ensure node output structure matches

### Slow Execution

1. Reduce max tokens in AI nodes
2. Add parallel execution where possible
3. Cache repeated queries
4. Use faster AI models

## Related Topics

- [Creating Flows](../02-user-guides/flowbuilder-basics.md)
- [Node Reference](../06-api-reference/flow-nodes.md)
- [Webhook Integration](../05-integrations/webhooks.md)
- [Swarm Orchestration](swarm-intelligence.md)

---

**Keywords**: FlowBuilder, workflow automation, no-code, visual programming, nodes, triggers, AI automation
