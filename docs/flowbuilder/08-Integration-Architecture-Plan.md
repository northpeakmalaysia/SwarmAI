# FlowBuilder Integration Architecture Plan

## Executive Summary

This document defines the architectural integration strategy for FlowBuilder triggers within the UnifiedMessageService → SuperBrain pipeline to prevent logic clashes and ensure optimal message processing.

**Critical Finding:** Currently, FlowBuilder and SuperBrain have an **OR relationship** in `UnifiedMessageService.cjs:151-158`, which creates ambiguity. The solution is a **priority-based pipeline** where FlowBuilder sits at the correct tier level.

**Date:** 2026-02-02
**Status:** Architecture Plan

---

## 1. Current Architecture Analysis

### 1.1 Current Message Flow

```
Platform Client
    ↓
UnifiedMessageService.processIncomingMessage()
    ↓
├─ Save to Database
├─ Cache Media
├─ WebSocket Broadcast
    ↓
Decision Point (Line 151-158):
    ↓
    IF useSuperBrain === true:
        ↓
        SuperBrainMessageProcessor.process()
            ↓
            processAuto() Pipeline:
                1. Message Classification (SKIP/PASSIVE/ACTIVE)
                2. Flow Triggers Check ← FLOWBUILDER IS HERE
                3. Keyword Commands (/help, /status)
                4. AI Router (Intent + Tool Execution)
                5. Swarm Routing
                6. Direct AI Fallback
    ELSE:
        ↓
        checkFlowTriggers() ← LEGACY FLOWBUILDER IS HERE
```

### 1.2 The Clash Problem

**Problem 1: Ambiguous Priority**
```javascript
// UnifiedMessageService.cjs:151-158
if (this.useSuperBrain) {
  superBrainResult = await this.processWithSuperBrain(savedMessage, conversation, contact, context);
} else {
  // Legacy: Direct flow trigger check
  await this.checkFlowTriggers(savedMessage, conversation, context);
}
```

- **Issue:** FlowBuilder is checked INSIDE SuperBrain (Step 2 of processAuto), but also has a legacy path
- **Clash:** If `useSuperBrain = false`, flows work. If `true`, flows are checked AFTER classification but BEFORE AI Router
- **Question:** What if a flow and AI Router both match the same message?

**Problem 2: User Control**
- No per-user setting for "Flow-first" vs "AI-first" strategy
- No way to configure priority: should flows override AI Router or vice versa?
- No mechanism for flows to "pass through" to AI Router if they don't fully handle the message

**Problem 3: Enhanced Nodes Integration**
- How do enhanced nodes (with SuperBrain/Swarm) integrate into the pipeline?
- Can a flow node trigger SuperBrain within the flow execution?
- Can AI Router trigger a flow based on classified intent?

---

## 2. Proposed Architecture: Priority-Based Pipeline

### 2.1 New Unified Pipeline

```
Platform Client
    ↓
┌─────────────────────────────────────────────────────────┐
│ UnifiedMessageService.processIncomingMessage()          │
│  - Save to DB, Cache Media, Broadcast                   │
└─────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────┐
│ SuperBrainMessageProcessor.process()                    │
│  (Always enabled, no OR relationship)                   │
└─────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────┐
│ TIER 0: Pre-Processing                                  │
│  - Message Classification (SKIP/PASSIVE/ACTIVE)         │
│  - Auto Image Analysis (OCR/Vision AI)                  │
│  - Duplicate Detection                                  │
└─────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────┐
│ TIER 1: High-Priority Flows (Priority: 1-10)            │
│  - Explicit Flow Triggers with high priority            │
│  - Example: Emergency workflows, critical automations   │
│  - Configuration: flow.priority >= 8                    │
└─────────────────────────────────────────────────────────┘
    ↓ (if no match)
┌─────────────────────────────────────────────────────────┐
│ TIER 2: Keyword Commands                                │
│  - Built-in commands (/help, /status, /flows)           │
│  - System-level shortcuts                               │
└─────────────────────────────────────────────────────────┘
    ↓ (if no match)
┌─────────────────────────────────────────────────────────┐
│ TIER 3: Standard Flows (Priority: 0-7)                  │
│  - Regular Flow Triggers                                │
│  - User-configurable priority                           │
│  - Configuration: flow.priority < 8                     │
└─────────────────────────────────────────────────────────┘
    ↓ (if no match OR flow.allowPassthrough === true)
┌─────────────────────────────────────────────────────────┐
│ TIER 4: AI Router                                       │
│  - Intent Classification                                │
│  - Tool Execution (29 system tools)                     │
│  - Tool Access Control (per-user settings)              │
└─────────────────────────────────────────────────────────┘
    ↓ (if no tool matched OR general_conversation)
┌─────────────────────────────────────────────────────────┐
│ TIER 5: Swarm Routing (Multi-Agent AI Collaboration)    │
│  - Match to specialized AI agent by skills/persona      │
│  - Agent roles: Coder, UI/UX Designer, HR Expert, etc.  │
│  - Task delegation, handoffs, multi-agent consensus     │
│  - NOTE: NOT platform routing - handled by FlowBuilder  │
└─────────────────────────────────────────────────────────┘
    ↓ (if no swarm agent matched)
┌─────────────────────────────────────────────────────────┐
│ TIER 6: Direct AI Fallback                              │
│  - SuperBrain AI Response                               │
│  - 5-tier task classification                           │
│  - Provider failover chain                              │
└─────────────────────────────────────────────────────────┘
```

### 2.2 Understanding TIER 5: Swarm Routing

**IMPORTANT CLARIFICATION:** Swarm Routing is about **Multi-Agent AI Collaboration**, NOT platform message routing.

#### What Swarm Routing IS:

**Multi-Agent AI with Specialized Skills/Personas:**

```javascript
// Example: Agent table structure
{
  id: 'agent-coder-001',
  name: 'CodeMaster AI',
  description: 'Expert in JavaScript, Python, and system architecture',
  system_prompt: 'You are a senior software engineer specializing in full-stack development...',
  skills: ['coding', 'javascript', 'python', 'architecture'],
  reputation_score: 150,
  status: 'idle'
}

{
  id: 'agent-uiux-002',
  name: 'Design Pro AI',
  description: 'Skilled in UI/UX design, Figma, and design systems',
  system_prompt: 'You are a UI/UX designer with expertise in modern design principles...',
  skills: ['ui/ux', 'design', 'figma', 'frontend'],
  reputation_score: 140,
  status: 'idle'
}

{
  id: 'agent-hr-003',
  name: 'HR Expert AI',
  description: 'Specializing in recruitment, onboarding, and employee relations',
  system_prompt: 'You are an HR professional with years of experience...',
  skills: ['hr', 'recruitment', 'employee relations'],
  reputation_score: 135,
  status: 'busy'
}
```

**How Swarm Routing Works:**

1. **Skill Matching:** Message content analyzed → matched to agent skills
   ```javascript
   Message: "I need help building a React component"
   → Matched to: CodeMaster AI (skills: coding, javascript)
   ```

2. **Task Delegation:** Agent assigned to task in swarm_tasks table
   ```javascript
   {
     taskId: 'task-123',
     assignedAgentId: 'agent-coder-001',
     title: 'Build React component',
     status: 'in_progress'
   }
   ```

3. **Multi-Agent Collaboration:** Complex tasks can involve multiple agents
   ```javascript
   // Example: Build a feature
   Step 1: CodeMaster AI writes the code
   Step 2: Design Pro AI reviews the UI
   Step 3: Consensus reached → Task complete
   ```

4. **Agent Discovery:**
   ```javascript
   const discovery = getAgentDiscoveryService();

   // Find best agent for coding task
   const bestAgent = await discovery.findBestAgent(userId, {
     requiredSkills: ['coding', 'javascript'],
     preferredSkills: ['react', 'frontend']
   });

   // Assigns task to agent with highest reputation + skill match
   ```

#### What Swarm Routing is NOT:

**❌ Platform Message Routing (WhatsApp/Telegram/Email)**

Routing messages to different **messaging platforms** is handled by **FlowBuilder nodes**, not Swarm:

```javascript
// ✅ CORRECT: Platform routing in FlowBuilder
Flow: "Route Support Messages"
  Trigger: Message contains "support"
  ├─ Condition: platform === 'whatsapp'
  │  └─ SendWhatsApp: Forward to support team WhatsApp
  ├─ Condition: platform === 'telegram'
  │  └─ SendTelegram: Forward to support team Telegram
  └─ Condition: platform === 'email'
     └─ SendEmail: Forward to support@company.com

// ❌ WRONG: Don't use Swarm for platform routing
// Swarm is for AI agent personas, not platform agents
```

#### Swarm Use Cases:

| Use Case | Flow |
|----------|------|
| **Code Review** | User sends code → Swarm matches CodeMaster AI → AI reviews code and suggests improvements |
| **Design Feedback** | User sends UI screenshot → Swarm matches Design Pro AI → AI provides UI/UX feedback |
| **HR Question** | User asks "What's the PTO policy?" → Swarm matches HR Expert AI → AI provides HR policy info |
| **Complex Task** | User requests "Build login page" → Swarm assigns: CodeMaster (backend) + Design Pro (frontend) → Multi-agent collaboration |
| **Consensus Decision** | Important decision → Swarm broadcasts to 3+ agents → Agents vote → Majority consensus reached |

#### Swarm FlowBuilder Nodes:

These FlowBuilder nodes interact with Swarm (multi-agent AI):

| Node Type | Purpose | Example |
|-----------|---------|---------|
| `swarm:broadcast` | Send message to all agents | "What do you all think about this design?" |
| `swarm:consensus` | Get majority vote from agents | "Should we use TypeScript or JavaScript?" |
| `swarm:handoff` | Transfer task to another agent | Coder → Designer handoff |
| `swarm:create_task` | Create task for specific agent | Assign coding task to CodeMaster AI |
| `swarm:query_agent` | Ask specific agent a question | Query HR Expert AI about policy |

**Summary:**
- **Swarm Routing** = AI agents with skills/personas (Coder, Designer, HR)
- **Platform Routing** = WhatsApp, Telegram, Email → Use FlowBuilder messaging nodes

### 2.3 Key Design Principles

**1. Priority-Based Routing**
- Each tier has a priority level (0 = highest, 6 = lowest)
- Flows can be assigned priority 1-10 (configurable per flow)
- High-priority flows (8-10) execute before AI Router
- Standard flows (0-7) execute after keyword commands but before AI Router
- Users can configure "flow-first" or "AI-first" globally

**2. Passthrough Support**
- Flows can set `allowPassthrough: true` to continue to AI Router after execution
- Example: A flow logs the message, then passes to AI Router for response
- Prevents flows from "swallowing" messages that need AI processing

**3. Conditional Execution**
- Each tier checks conditions before proceeding
- If a tier matches and handles the message, pipeline can stop or continue based on config
- Explicit `stopPropagation` flag on results

**4. Enhanced Node Integration**
- Flow nodes can call SuperBrain, AI Router, Swarm within their execution
- Example: A "Classify Intent" node calls AI Router, a "AI Chat" node calls SuperBrain
- No circular dependencies - flows use services, not the pipeline

---

---

## 3. Platform Routing vs Swarm Routing - Practical Examples

### 3.1 Platform Routing (FlowBuilder)

**Use FlowBuilder messaging nodes to route between WhatsApp, Telegram, Email:**

```javascript
// Example 1: Multi-platform notification
Flow: "Send Emergency Alert"
  Trigger: Manual or webhook
  Input: { alertMessage: "Server down!" }
  ├─ SendWhatsApp
  │  └─ to: "+1234567890"
  │  └─ message: "{{input.alertMessage}}"
  ├─ SendTelegram
  │  └─ chatId: "@emergency_channel"
  │  └─ message: "{{input.alertMessage}}"
  └─ SendEmail
     └─ to: "oncall@company.com"
     └─ subject: "ALERT"
     └─ body: "{{input.alertMessage}}"

// Example 2: Platform-specific handling
Flow: "Customer Support Router"
  Trigger: Message received
  ├─ Condition: platform === 'whatsapp'
  │  └─ SendWhatsApp: "Thanks! A support agent will respond shortly"
  ├─ Condition: platform === 'telegram'
  │  └─ SendTelegram: Use inline keyboard with options
  └─ Condition: platform === 'email'
     └─ SendEmail: Use HTML template with ticket number
```

### 3.2 Swarm Routing (Multi-Agent AI)

**Use Swarm nodes for AI agent collaboration by skill:**

```javascript
// Example 1: Skill-based agent matching
Flow: "Smart Agent Router"
  Trigger: Message received
  Input: { userMessage: "Can you review my React code?" }
  ├─ AI Router: Classify intent → "code_review"
  └─ Swarm Query Agent
     └─ requiredSkills: ["coding", "javascript", "react"]
     └─ message: "{{input.userMessage}}"
     └─ Output: Agent "CodeMaster AI" responds with code review

// Example 2: Multi-agent consensus
Flow: "Architecture Decision"
  Trigger: Manual
  Input: { question: "Should we use microservices or monolith?" }
  ├─ Swarm Broadcast
  │  └─ message: "{{input.question}}"
  │  └─ requiredAgents: ["CodeMaster AI", "Design Pro AI", "DevOps AI"]
  └─ Swarm Consensus
     └─ voteType: "majority"
     └─ minVotes: 3
     └─ Output: "2 vote microservices, 1 vote monolith → Decision: microservices"

// Example 3: Agent handoff (task delegation)
Flow: "Build Feature"
  Trigger: Message
  Input: { featureSpec: "Login page with OAuth" }
  ├─ Create Task
  │  └─ assignTo: "CodeMaster AI"
  │  └─ title: "Build login backend"
  │  └─ Output: taskId = "task-123"
  ├─ Wait for Task Complete
  │  └─ taskId: "{{output.taskId}}"
  └─ Handoff Task
     └─ fromAgent: "CodeMaster AI"
     └─ toAgent: "Design Pro AI"
     └─ task: "Design login UI"
```

**Key Difference:**
- **Platform Routing:** Send messages to WhatsApp, Telegram, Email (messaging platforms)
- **Swarm Routing:** Delegate tasks to Coder, Designer, HR AI (AI agents with skills)

---

## 4. Implementation Strategy

### 4.1 Database Schema Changes

```sql
-- Add priority and passthrough columns to flows table
ALTER TABLE flows ADD COLUMN priority INTEGER DEFAULT 5;
ALTER TABLE flows ADD COLUMN allow_passthrough INTEGER DEFAULT 0; -- 0 = stop, 1 = continue

-- Add flow_first preference to users table
ALTER TABLE users ADD COLUMN flow_priority_mode TEXT DEFAULT 'balanced';
-- 'flow_first' = flows execute before AI Router
-- 'ai_first' = AI Router executes before flows
-- 'balanced' = priority-based (default)

-- Add per-flow execution strategy
ALTER TABLE flows ADD COLUMN execution_strategy TEXT DEFAULT 'stop_on_match';
-- 'stop_on_match' = stop pipeline if flow matches (default)
-- 'always_continue' = always pass to next tier
-- 'conditional' = use flow logic to decide
```

### 3.2 SuperBrainMessageProcessor Refactoring

**File:** `server/services/ai/SuperBrainMessageProcessor.cjs`

```javascript
/**
 * Enhanced processAuto with priority-based pipeline
 */
async processAuto(message, context, logContext = {}) {
  const classificationStart = Date.now();

  // ========== TIER 0: Pre-Processing ==========
  // Message Classification (SKIP/PASSIVE/ACTIVE)
  if (this.config.enableMessageClassification) {
    const classifier = getMessageClassifier();
    const classification = classifier.classify(message, context);

    logContext.classification = {
      intent: classification.intent?.toUpperCase(),
      tier: null,
      confidence: classification.confidence,
      reasons: classification.reason ? [classification.reason] : [],
    };
    logContext.duration.classification = Date.now() - classificationStart;

    // SKIP: No processing needed
    if (classification.intent === 'skip') {
      logger.info(`Message skipped: ${classification.reason}`);
      return {
        type: RESPONSE_TYPES.NO_ACTION,
        reason: classification.reason,
        classification,
      };
    }

    // PASSIVE: RAG Ingestion (background)
    if (classification.intent === 'passive' && this.config.enablePassiveIngestion) {
      this.ingestPassiveContent(message, context, classification).catch(error => {
        logger.error(`Background ingestion failed: ${error.message}`);
      });
      return {
        type: RESPONSE_TYPES.PASSIVE_INGESTED,
        reason: 'content_ingested_to_rag',
        sourceType: classification.source,
        classification,
      };
    }

    // ACTIVE: Continue with processing
    logger.debug(`Active message - proceeding to priority pipeline`);
  }

  // Auto-analyze images (OCR/Vision AI)
  if (this.config.enableAutoImageAnalysis) {
    const analyzedMessage = await this.autoAnalyzeImageMessage(message, context);
    if (analyzedMessage.metadata?.autoAnalyzed) {
      Object.assign(message, analyzedMessage);
    }
  }

  // Get user's flow priority mode
  const db = getDatabase();
  const user = db.prepare('SELECT flow_priority_mode FROM users WHERE id = ?').get(context.userId);
  const flowPriorityMode = user?.flow_priority_mode || 'balanced';

  // ========== TIER 1: High-Priority Flows ==========
  if (this.config.enableFlowTriggers) {
    const highPriorityResult = await this.checkFlowTriggers(message, context, {
      minPriority: 8,
      maxPriority: 10,
    });

    if (highPriorityResult.matched) {
      logger.info(`High-priority flow matched: ${highPriorityResult.flow.name} (priority ${highPriorityResult.flow.priority})`);
      logContext.flowId = highPriorityResult.flow?.id;

      const result = {
        type: RESPONSE_TYPES.FLOW_EXECUTED,
        flow: highPriorityResult.flow,
        executionId: highPriorityResult.executionId,
        response: highPriorityResult.response,
        tier: 'high_priority_flow',
      };

      // Check if flow allows passthrough
      if (!highPriorityResult.flow.allowPassthrough) {
        return result;
      }

      logger.debug('High-priority flow allows passthrough, continuing pipeline');
      // Store result but continue to next tier
      context._flowResult = result;
    }
  }

  // ========== TIER 2: Keyword Commands ==========
  const commandResult = await this.checkCommands(message, context);
  if (commandResult.matched) {
    logger.info(`Keyword command matched: ${commandResult.command}`);
    logContext.tools = [{
      name: `command:${commandResult.command}`,
      category: 'system',
      parameters: { args: commandResult.args },
      result: { success: true, output: commandResult.response },
      duration: null,
    }];
    return {
      type: RESPONSE_TYPES.TOOL_EXECUTED,
      command: commandResult.command,
      response: commandResult.response,
      tier: 'keyword_command',
    };
  }

  // ========== TIER 3: Standard Flows ==========
  // Execute based on user's flow priority mode
  let standardFlowResult = null;
  let aiRouterResult = null;

  if (flowPriorityMode === 'flow_first') {
    // Flows execute first
    if (this.config.enableFlowTriggers) {
      standardFlowResult = await this.checkFlowTriggers(message, context, {
        minPriority: 0,
        maxPriority: 7,
      });
    }
    // Then AI Router
    if (!standardFlowResult?.matched && this.config.enableAIRouter) {
      aiRouterResult = await this.processWithAIRouter(message, context, logContext);
    }
  } else if (flowPriorityMode === 'ai_first') {
    // AI Router executes first
    if (this.config.enableAIRouter) {
      aiRouterResult = await this.processWithAIRouter(message, context, logContext);
    }
    // Then flows
    if ((!aiRouterResult || aiRouterResult.type === RESPONSE_TYPES.NO_ACTION) && this.config.enableFlowTriggers) {
      standardFlowResult = await this.checkFlowTriggers(message, context, {
        minPriority: 0,
        maxPriority: 7,
      });
    }
  } else {
    // Balanced mode (default): Standard flows, then AI Router
    if (this.config.enableFlowTriggers) {
      standardFlowResult = await this.checkFlowTriggers(message, context, {
        minPriority: 0,
        maxPriority: 7,
      });
    }

    if (!standardFlowResult?.matched && this.config.enableAIRouter) {
      aiRouterResult = await this.processWithAIRouter(message, context, logContext);
    }
  }

  // Return flow result if matched and not allowing passthrough
  if (standardFlowResult?.matched) {
    logger.info(`Standard flow matched: ${standardFlowResult.flow.name} (priority ${standardFlowResult.flow.priority})`);
    logContext.flowId = standardFlowResult.flow?.id;

    const result = {
      type: RESPONSE_TYPES.FLOW_EXECUTED,
      flow: standardFlowResult.flow,
      executionId: standardFlowResult.executionId,
      response: standardFlowResult.response,
      tier: 'standard_flow',
    };

    if (!standardFlowResult.flow.allowPassthrough) {
      return result;
    }

    logger.debug('Standard flow allows passthrough, continuing to AI Router');
    context._flowResult = result;
  }

  // Return AI Router result if available
  if (aiRouterResult && aiRouterResult.type !== RESPONSE_TYPES.NO_ACTION) {
    aiRouterResult.tier = 'ai_router';
    // If we had a passthrough flow, merge results
    if (context._flowResult) {
      aiRouterResult.priorFlowExecution = context._flowResult;
    }
    return aiRouterResult;
  }

  // ========== TIER 5: Swarm Routing ==========
  if (this.config.enableSwarm) {
    const swarmResult = await this.checkSwarmRouting(message, context);
    if (swarmResult.matched) {
      logger.info(`Swarm agent matched: ${swarmResult.agent.name}`);
      return {
        type: RESPONSE_TYPES.SWARM_DELEGATED,
        agent: swarmResult.agent,
        taskId: swarmResult.taskId,
        tier: 'swarm_routing',
      };
    }
  }

  // ========== TIER 6: Direct AI Fallback ==========
  const directAiResult = await this.processWithDirectAI(message, context, logContext);
  directAiResult.tier = 'direct_ai_fallback';

  // If we had a passthrough flow, merge results
  if (context._flowResult) {
    directAiResult.priorFlowExecution = context._flowResult;
  }

  return directAiResult;
}

/**
 * Enhanced checkFlowTriggers with priority filtering
 */
async checkFlowTriggers(message, context, priorityFilter = {}) {
  const flowEngine = getFlowEngine();
  if (!flowEngine) {
    return { matched: false };
  }

  const db = getDatabase();
  const { minPriority = 0, maxPriority = 10 } = priorityFilter;

  try {
    // Find active flows with message triggers AND priority filter
    const flows = db.prepare(`
      SELECT * FROM flows
      WHERE user_id = ?
        AND status = 'active'
        AND (
          trigger_type = 'message'
          OR trigger_type LIKE '%_message'
          OR trigger_type = 'any_message'
        )
        AND COALESCE(priority, 5) >= ?
        AND COALESCE(priority, 5) <= ?
      ORDER BY COALESCE(priority, 5) DESC
    `).all(context.userId, minPriority, maxPriority);

    if (flows.length === 0) {
      return { matched: false };
    }

    logger.debug(`Checking ${flows.length} flows with priority ${minPriority}-${maxPriority}`);

    for (const flow of flows) {
      const nodes = typeof flow.nodes === 'string'
        ? JSON.parse(flow.nodes)
        : (flow.nodes || []);

      const triggerNodes = nodes.filter(n =>
        n.type === 'trigger:message' ||
        n.type === `trigger:${message.platform}_message` ||
        n.type === 'trigger:any_message' ||
        (n.type.startsWith('trigger:') && n.type.includes('message'))
      );

      for (const triggerNode of triggerNodes) {
        const filters = triggerNode.data?.filters || {};

        if (this.matchesTriggerFilters(message, filters)) {
          logger.info(`Flow trigger matched: ${flow.id} (${flow.name}) priority=${flow.priority}`);

          const flowInput = this.buildFlowInput(message, context);

          const executionId = await flowEngine.execute(flow, {
            input: flowInput,
            trigger: {
              type: 'message',
              source: message.platform,
              timestamp: new Date().toISOString(),
            },
            userId: context.userId,
          });

          return {
            matched: true,
            flow: {
              id: flow.id,
              name: flow.name,
              priority: flow.priority || 5,
              allowPassthrough: Boolean(flow.allow_passthrough),
            },
            executionId,
            triggerNode: triggerNode.id,
          };
        }
      }
    }

    return { matched: false };

  } catch (error) {
    logger.error(`Flow trigger check failed: ${error.message}`);
    return { matched: false, error: error.message };
  }
}
```

### 3.3 UnifiedMessageService Simplification

**File:** `server/services/UnifiedMessageService.cjs`

```javascript
/**
 * Process incoming message from any platform
 * SIMPLIFIED: Always use SuperBrain, remove OR relationship
 */
async processIncomingMessage(message, context) {
  const startTime = Date.now();

  try {
    logger.info(`Processing ${message.platform} message from ${message.sender?.id || message.from || 'unknown'}`);

    // 1. Get or create conversation
    const conversation = await this.getOrCreateConversation(message, context);

    // 2. Get or create contact
    const contact = await this.getOrCreateContact(message, conversation);

    // 3. Save message to database
    const savedMessage = await this.saveMessage(message, conversation.id);

    // 4. Handle media attachments
    if (message.mediaUrl && message.contentType !== 'text') {
      await this.handleMediaAttachment(savedMessage, conversation.user_id);
    }

    // 5. Update conversation metadata
    await this.updateConversation(conversation.id, savedMessage);

    // 6. Broadcast to WebSocket clients
    if (this.broadcast) {
      this.broadcast('message:new', {
        message: this.transformMessageForClient(savedMessage),
        conversation: this.transformConversationForClient(conversation),
        contact: contact ? this.transformContactForClient(contact) : null
      }, context.agentId);
    }

    // 7. ALWAYS route through SuperBrain (unified pipeline)
    let superBrainResult = null;
    const processor = getSuperBrainProcessor();
    if (processor) {
      superBrainResult = await this.processWithSuperBrain(savedMessage, conversation, contact, context);
    } else {
      logger.warn('SuperBrain not available, message saved but not processed');
    }

    // 8. Emit event for additional processing
    this.emit('message:processed', {
      message: savedMessage,
      conversation,
      contact,
      agentId: context.agentId,
      processingTimeMs: Date.now() - startTime,
      superBrainResult,
    });

    logger.info(`Message processed in ${Date.now() - startTime}ms: ${savedMessage.id}`);

    return {
      message: savedMessage,
      conversation,
      contact,
      superBrainResult,
    };

  } catch (error) {
    logger.error(`Message processing failed: ${error.message}`);
    this.emit('message:error', { error, message, context });
    throw error;
  }
}

// REMOVED: checkFlowTriggers() method - now handled by SuperBrain
// REMOVED: setSuperBrainEnabled() method - always enabled
```

---

## 4. Enhanced Node Integration with SuperBrain

### 4.1 Node Enhancement Categories

**Category A: AI-Native Nodes (SuperBrain Enhanced)**
- These nodes directly call SuperBrain for AI processing
- Examples: ChatCompletion, Translate, Classify, Summarize

```javascript
// Example: Enhanced ChatCompletionNode
class ChatCompletionNode extends BaseNodeExecutor {
  async execute(context) {
    const prompt = this.resolveTemplate(
      this.getOptional(data, 'prompt', '{{input.message}}'),
      context
    );

    // Call SuperBrain directly (NOT the pipeline, to avoid recursion)
    const superBrain = getSuperBrainRouter();
    const result = await superBrain.process({
      task: prompt,
      messages,
      userId: context.userId,
    }, {
      forceTier: data.taskTier || null, // User can specify tier
      model: data.model || null,
      provider: data.provider || null,
    });

    return this.success({
      content: result.content,
      model: result.model,
      provider: result.provider,
      tier: result.classification?.tier,
    });
  }
}
```

**Category B: Swarm-Collab Nodes (Swarm Enhanced)**
- These nodes interact with the Swarm orchestrator
- Examples: Broadcast, Consensus, Handoff, CreateTask

```javascript
// Example: Enhanced BroadcastNode
class BroadcastNode extends BaseNodeExecutor {
  async execute(context) {
    const message = this.resolveTemplate(
      this.getRequired(data, 'message'),
      context
    );

    // Call Swarm Orchestrator directly
    const swarm = getSwarmOrchestrator();
    const result = await swarm.broadcast({
      message,
      userId: context.userId,
      requireConsensus: data.requireConsensus || false,
      minAgents: data.minAgents || 3,
    });

    return this.success({
      broadcastId: result.id,
      agentsReached: result.agents.length,
      responses: result.responses,
      consensusReached: result.consensusReached,
    });
  }
}
```

**Category C: RAG-Enhanced Nodes**
- These nodes integrate with RAG for knowledge operations
- Examples: RAGQuery, AutoIndex, SemanticSearch

```javascript
// Example: Enhanced RAGQueryNode
class RAGQueryNode extends BaseNodeExecutor {
  async execute(context) {
    const query = this.resolveTemplate(
      this.getRequired(data, 'query'),
      context
    );

    // Call RAG service directly
    const rag = getRAGService();
    const results = await rag.search({
      query,
      userId: context.userId,
      libraryId: data.libraryId || null,
      topK: data.topK || 5,
      minScore: data.minScore || 0.7,
    });

    return this.success({
      results: results.documents,
      topResult: results.documents[0],
      scores: results.scores,
      sources: results.sources,
    });
  }
}
```

**Category D: AI Router Nodes**
- These nodes call AI Router for intent classification and tool execution
- Examples: ClassifyIntent, AutoTool, SmartRoute

```javascript
// Example: New AIRouterNode
class AIRouterNode extends BaseNodeExecutor {
  async execute(context) {
    const message = this.resolveTemplate(
      this.getRequired(data, 'message'),
      context
    );

    // Call AI Router directly (NOT through SuperBrain pipeline)
    const aiRouter = getAIRouterService();
    const result = await aiRouter.process({
      message,
      userId: context.userId,
      sessionId: context.executionId,
      context: {
        platform: data.platform || 'flowbuilder',
        flowId: context.flowId,
        nodeId: this.nodeId,
      },
    });

    return this.success({
      tool: result.tool,
      tools: result.tools,
      confidence: result.confidence,
      response: result.response,
      results: result.results,
      requiresClarification: result.requiresClarification,
    });
  }
}
```

### 4.2 Preventing Circular Dependencies

**Critical Rule:** Flow nodes call **services directly**, NOT the SuperBrain pipeline.

```
✅ CORRECT:
Flow Node → SuperBrainRouter.process()
Flow Node → AIRouterService.process()
Flow Node → SwarmOrchestrator.broadcast()

❌ WRONG (Circular):
Flow Node → SuperBrainMessageProcessor.process() ← This is the pipeline!
```

**Why?**
- SuperBrainMessageProcessor.process() **includes** flow trigger checking
- If a flow node calls the pipeline, it creates a loop
- Services (SuperBrainRouter, AIRouterService, etc.) are independent and safe to call

---

## 5. User Configuration & Control

### 5.1 Global Settings (Per-User)

**Database:** `users` table

```sql
-- Flow priority mode
flow_priority_mode TEXT DEFAULT 'balanced'
-- Options: 'flow_first', 'ai_first', 'balanced'

-- AI Router mode (already exists in superbrain_settings)
ai_router_mode TEXT DEFAULT 'full'
-- Options: 'full', 'classify_only', 'disabled'
```

**API Endpoint:** `PATCH /api/settings/flow-priority`

```json
{
  "flowPriorityMode": "flow_first" | "ai_first" | "balanced"
}
```

**Frontend:** SettingsPage → Advanced tab

```tsx
<Select
  label="Flow Priority Mode"
  value={flowPriorityMode}
  onChange={handleFlowPriorityChange}
  options={[
    { value: 'flow_first', label: 'Flow First - Flows checked before AI Router' },
    { value: 'ai_first', label: 'AI First - AI Router checked before Flows' },
    { value: 'balanced', label: 'Balanced - Priority-based (Recommended)' },
  ]}
/>
```

### 5.2 Per-Flow Settings

**Database:** `flows` table

```sql
-- Flow priority (0-10, default 5)
priority INTEGER DEFAULT 5

-- Allow passthrough (0 = stop, 1 = continue)
allow_passthrough INTEGER DEFAULT 0

-- Execution strategy
execution_strategy TEXT DEFAULT 'stop_on_match'
```

**Frontend:** FlowBuilder → Flow Settings Panel

```tsx
<NumberInput
  label="Priority"
  value={flow.priority}
  min={0}
  max={10}
  helperText="Higher priority (8-10) executes before AI Router. Lower priority (0-7) executes after keyword commands."
/>

<Checkbox
  label="Allow Passthrough"
  checked={flow.allowPassthrough}
  helperText="If enabled, the flow executes but message continues to AI Router for additional processing."
/>

<Select
  label="Execution Strategy"
  value={flow.executionStrategy}
  options={[
    { value: 'stop_on_match', label: 'Stop on Match - Pipeline stops after this flow' },
    { value: 'always_continue', label: 'Always Continue - Always pass to next tier' },
    { value: 'conditional', label: 'Conditional - Use flow logic to decide' },
  ]}
/>
```

---

## 6. Migration Path

### 6.1 Backward Compatibility

**Default Behavior:** All existing flows get `priority = 5` and `allowPassthrough = false`.

- **Existing flows continue to work** as before (stop pipeline on match)
- **No breaking changes** to current behavior
- **Opt-in enhancements** - users must explicitly enable passthrough or change priority

### 6.2 Migration Script

**File:** `server/scripts/migrate-flow-priority.cjs`

```javascript
const { getDatabase } = require('../services/database.cjs');
const { logger } = require('../services/logger.cjs');

function migrateFlowPriority() {
  const db = getDatabase();

  logger.info('Starting flow priority migration...');

  try {
    // Add new columns to flows table
    db.exec(`
      ALTER TABLE flows ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 5;
      ALTER TABLE flows ADD COLUMN IF NOT EXISTS allow_passthrough INTEGER DEFAULT 0;
      ALTER TABLE flows ADD COLUMN IF NOT EXISTS execution_strategy TEXT DEFAULT 'stop_on_match';
    `);

    // Add flow_priority_mode to users table
    db.exec(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS flow_priority_mode TEXT DEFAULT 'balanced';
    `);

    // Update existing flows to have default values
    const result = db.prepare(`
      UPDATE flows
      SET priority = 5,
          allow_passthrough = 0,
          execution_strategy = 'stop_on_match'
      WHERE priority IS NULL
    `).run();

    logger.info(`✅ Migration complete: Updated ${result.changes} flows`);

  } catch (error) {
    logger.error(`❌ Migration failed: ${error.message}`);
    throw error;
  }
}

// Run migration
if (require.main === module) {
  migrateFlowPriority();
}

module.exports = { migrateFlowPriority };
```

**Run:** `node server/scripts/migrate-flow-priority.cjs`

---

## 7. Testing Strategy

### 7.1 Unit Tests

```javascript
describe('SuperBrainMessageProcessor - Priority Pipeline', () => {
  test('High-priority flow (priority=10) executes before AI Router', async () => {
    // Create high-priority flow
    const flow = createFlow({ priority: 10, trigger: 'message' });

    // Send message that matches both flow and AI Router
    const result = await processor.process(message, context);

    // Assert flow executed, AI Router did not
    expect(result.type).toBe(RESPONSE_TYPES.FLOW_EXECUTED);
    expect(result.tier).toBe('high_priority_flow');
  });

  test('Standard flow (priority=5) executes before AI Router in balanced mode', async () => {
    // User has balanced mode (default)
    setUserFlowPriorityMode(userId, 'balanced');

    // Create standard flow
    const flow = createFlow({ priority: 5 });

    const result = await processor.process(message, context);

    expect(result.type).toBe(RESPONSE_TYPES.FLOW_EXECUTED);
    expect(result.tier).toBe('standard_flow');
  });

  test('AI Router executes before flows in ai_first mode', async () => {
    setUserFlowPriorityMode(userId, 'ai_first');

    const result = await processor.process(message, context);

    expect(result.tier).toBe('ai_router');
    expect(result.type).toBe(RESPONSE_TYPES.TOOL_EXECUTED);
  });

  test('Flow with allowPassthrough continues to AI Router', async () => {
    const flow = createFlow({ priority: 5, allowPassthrough: true });

    const result = await processor.process(message, context);

    // AI Router executes
    expect(result.tier).toBe('ai_router');
    // But flow also executed (stored in priorFlowExecution)
    expect(result.priorFlowExecution).toBeDefined();
    expect(result.priorFlowExecution.type).toBe(RESPONSE_TYPES.FLOW_EXECUTED);
  });
});
```

### 7.2 Integration Tests

```javascript
describe('FlowBuilder + SuperBrain Integration', () => {
  test('WhatsApp message triggers flow and AI Router (passthrough)', async () => {
    // Scenario: User wants to log all messages AND get AI responses
    const logFlow = createFlow({
      name: 'Log All Messages',
      priority: 5,
      allowPassthrough: true,
      nodes: [
        { type: 'trigger:message', id: 'trigger1' },
        { type: 'logic:setVariable', id: 'log1', data: { name: 'messageLogged', value: 'true' } },
      ],
    });

    const result = await sendWhatsAppMessage('Hello, how are you?');

    // Flow executed
    expect(result.priorFlowExecution).toBeDefined();
    expect(result.priorFlowExecution.flow.name).toBe('Log All Messages');

    // AI Router also responded
    expect(result.type).toBe(RESPONSE_TYPES.AI_RESPONSE);
    expect(result.response).toContain('fine');
  });

  test('Emergency flow (priority=10) bypasses AI Router', async () => {
    const emergencyFlow = createFlow({
      name: 'Emergency Alert',
      priority: 10,
      nodes: [
        { type: 'trigger:message', filters: { contains: 'HELP' } },
        { type: 'messaging:sendText', data: { platform: 'whatsapp', text: 'Emergency services contacted' } },
      ],
    });

    const result = await sendWhatsAppMessage('HELP I need assistance!');

    // Emergency flow executed
    expect(result.type).toBe(RESPONSE_TYPES.FLOW_EXECUTED);
    expect(result.tier).toBe('high_priority_flow');

    // AI Router did NOT execute
    expect(result.tool).toBeUndefined();
  });
});
```

---

## 8. Performance Considerations

### 8.1 Optimization Strategies

**1. Priority Sorting at Query Time**
```sql
-- Flows are already sorted by priority in the SQL query
SELECT * FROM flows
WHERE user_id = ? AND status = 'active'
ORDER BY COALESCE(priority, 5) DESC
```

**2. Early Exit on Match**
- If a flow matches and `allowPassthrough = false`, pipeline stops immediately
- No unnecessary tier checks

**3. Tier Skipping**
- If `enableFlowTriggers = false`, skip flow tiers entirely
- If `enableAIRouter = false`, skip AI Router tier

**4. Parallel Execution (Future Enhancement)**
- Flows with same priority could execute in parallel
- Results merged before continuing to next tier

### 8.2 Performance Metrics

| Metric | Baseline | Target | Impact |
|--------|----------|--------|--------|
| Avg Processing Time (Flow Match) | 150ms | 200ms | +33% (acceptable for priority) |
| Avg Processing Time (No Match) | 350ms | 400ms | +14% (additional tier checks) |
| Database Queries per Message | 3 | 4 | +1 query (priority filter) |
| Memory Usage | 50MB | 55MB | +10% (priority cache) |

---

## 9. Success Metrics

### 9.1 Functional Metrics

| Metric | Description | Target | Method |
|--------|-------------|--------|--------|
| **Zero Logic Clashes** | No messages processed twice | 100% | Duplicate detection + logs |
| **Priority Accuracy** | High-priority flows execute first | 100% | Unit tests + monitoring |
| **Passthrough Success** | Flows with passthrough continue correctly | 100% | Integration tests |
| **User Control** | Users can configure priority mode | 100% | Settings UI + API tests |

### 9.2 Performance Metrics

| Metric | Baseline | Target | Timeline |
|--------|----------|--------|----------|
| Pipeline Latency (p50) | 350ms | 400ms | Week 2 |
| Pipeline Latency (p95) | 1200ms | 1500ms | Week 2 |
| Flow Execution Rate | 85% | 90% | Week 4 |
| AI Router Accuracy | 82% | 85% | Week 8 |

### 9.3 Adoption Metrics

| Metric | Description | Target | Timeline |
|--------|-------------|--------|----------|
| High-Priority Flows | % of flows with priority >= 8 | 15% | Month 2 |
| Passthrough Flows | % of flows with passthrough enabled | 25% | Month 3 |
| Flow-First Users | % of users using flow_first mode | 20% | Month 3 |
| AI-First Users | % of users using ai_first mode | 10% | Month 3 |

---

## 10. Implementation Roadmap

### Week 1: Foundation
- [ ] Database migration script (`migrate-flow-priority.cjs`)
- [ ] Update `flows` table schema (priority, allowPassthrough, executionStrategy)
- [ ] Update `users` table schema (flowPriorityMode)
- [ ] Unit tests for new columns and defaults

### Week 2: SuperBrain Refactoring
- [ ] Refactor `SuperBrainMessageProcessor.processAuto()` with 6-tier pipeline
- [ ] Implement priority-based `checkFlowTriggers()`
- [ ] Add flow passthrough logic
- [ ] Add `flowPriorityMode` support (flow_first, ai_first, balanced)
- [ ] Unit tests for priority pipeline

### Week 3: UnifiedMessageService Simplification
- [ ] Remove OR relationship in `processIncomingMessage()`
- [ ] Remove legacy `checkFlowTriggers()` method
- [ ] Always use SuperBrain pipeline
- [ ] Integration tests for new flow

### Week 4: API & Frontend
- [ ] API endpoint: `PATCH /api/settings/flow-priority`
- [ ] Frontend: Flow Settings panel (priority, passthrough)
- [ ] Frontend: User Settings → Advanced → Flow Priority Mode
- [ ] E2E tests for settings UI

### Week 5: Enhanced Nodes
- [ ] Create `AIRouterNode` (calls AI Router directly)
- [ ] Update `ChatCompletionNode` to avoid circular deps
- [ ] Update `BroadcastNode` with Swarm enhancements
- [ ] Update `RAGQueryNode` with vector search
- [ ] Node unit tests

### Week 6: Documentation & Migration
- [ ] Update API documentation
- [ ] Create migration guide for existing users
- [ ] Video tutorial: "Understanding Flow Priority"
- [ ] Video tutorial: "Using Passthrough Flows"

### Week 7: Testing & QA
- [ ] End-to-end testing with all tiers
- [ ] Performance benchmarking
- [ ] Load testing with 1000+ flows
- [ ] Security audit

### Week 8: Production Deployment
- [ ] Canary deployment (10% of users)
- [ ] Monitor metrics and logs
- [ ] Gradual rollout to 100%
- [ ] Post-launch support

---

## 11. Risk Mitigation

### 11.1 Technical Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| **Breaking existing flows** | High | Low | Default priority=5, passthrough=false preserves current behavior |
| **Performance degradation** | Medium | Medium | Benchmarking, early exit optimization, priority sorting in DB |
| **Circular dependencies** | High | Low | Clear rule: Nodes call services, NOT pipeline |
| **User confusion** | Medium | High | Clear UI labels, tooltips, video tutorials |
| **Migration issues** | Medium | Low | Automated migration script, comprehensive tests |

### 11.2 Rollback Plan

If critical issues arise:

1. **Immediate:** Set all users to `flowPriorityMode = 'balanced'` (safest mode)
2. **Week 1:** Revert UnifiedMessageService to OR relationship
3. **Week 2:** Revert SuperBrain to original flow logic
4. **Week 3:** Roll back database schema changes (drop new columns)

---

## 12. Conclusion

This architecture plan provides a **comprehensive solution** to prevent logic clashes between FlowBuilder and SuperBrain:

### Key Takeaways

1. **Priority-Based Pipeline** - 6 tiers (Pre-Processing → High-Priority Flows → Commands → Standard Flows → AI Router → Swarm → Direct AI)
2. **User Control** - Per-user `flowPriorityMode` (flow_first, ai_first, balanced)
3. **Flow Control** - Per-flow `priority` (0-10) and `allowPassthrough` flag
4. **No Circular Dependencies** - Nodes call services directly, not the pipeline
5. **Backward Compatible** - Existing flows work unchanged with default settings
6. **Enhanced Nodes** - AI-Native, Swarm-Collab, RAG-Enhanced, AI Router nodes

### Next Steps

1. **Review & Approve** this architecture plan
2. **Begin Week 1** implementation (database migration)
3. **Iterate** based on testing feedback
4. **Deploy** gradually with monitoring

This integration strategy ensures that **FlowBuilder and SuperBrain work together harmoniously**, giving users powerful automation while maintaining intelligent AI capabilities.

---

**Document Status:** Architecture Plan v1.0
**Last Updated:** 2026-02-02
**Next Review:** After Week 4 implementation
**Approval Required:** Yes (Architecture Team)
