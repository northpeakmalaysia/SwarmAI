/**
 * AgenticSchemaRAG Service
 *
 * Self-updating RAG service for Agentic AI schemas and instructions.
 * Teaches AI how to create other Agentic AI agents, configure them,
 * and enable AI-to-AI communication.
 *
 * Structure:
 * - SWARM AI (parent library)
 *   └── FlowBuilder Schema (folder) - Node schemas
 *   └── Agentic AI Schema (folder) - Agentic AI creation instructions
 */

const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('../database.cjs');
const { logger } = require('../logger.cjs');
const { getRetrievalService } = require('../rag/RetrievalService.cjs');

// System user ID
const SYSTEM_USER_ID = 'system';

// Parent library
const PARENT_LIBRARY_NAME = 'SWARM AI';
const PARENT_LIBRARY_DESCRIPTION = 'System-managed knowledge base for SwarmAI components';

// Folder for Agentic AI schemas
const FOLDER_NAME = 'Agentic AI Schema';
const FOLDER_DESCRIPTION = 'Instructions for creating and managing Agentic AI agents';

// Schema format version - increment to force resync
const SCHEMA_FORMAT_VERSION = 5;

/**
 * Agentic AI Schema Definitions
 * Complete instructions for AI to create other AI agents
 */
const AGENTIC_SCHEMAS = {
  // ==================== OVERVIEW ====================
  'overview:introduction': {
    title: 'Agentic AI System Overview',
    category: 'overview',
    description: 'Introduction to the Agentic AI system and its capabilities',
    content: `
# Agentic AI System Overview

## What is Agentic AI?

Agentic AI is an autonomous AI agent system that goes beyond simple chatbots. An Agentic AI can:

1. **Self-Prompt**: Initiate actions without external triggers
2. **Self-Schedule**: Create and manage its own task schedules
3. **Self-Learn**: Update its own knowledge base from interactions
4. **Create Sub-Agents**: Spawn specialized child agents for delegation
5. **Communicate with Other AIs**: Send and receive messages between agents
6. **Manage Human Teams**: Assign tasks and track progress

## Agent Types

### Master Agent
- Created by human users
- Hierarchy level 0 (root)
- Full capabilities as configured
- Can create sub-agents

### Sub Agent
- Created by Master or other Sub agents
- Hierarchy level 1, 2, 3... (max configurable)
- Inherits capabilities from parent (with caps)
- Reports to parent agent

## Key Concepts

- **Autonomy Level**: supervised | semi-autonomous | autonomous
- **Approval Workflow**: Actions requiring human approval before execution
- **Hierarchy Path**: Chain of parent-child relationships
- **Budget Sharing**: Sub-agents share parent's API cost budget
- **Capability Inheritance**: Team, knowledge, routing can be inherited
    `,
    keywords: ['agentic', 'overview', 'introduction', 'autonomous', 'agent types', 'master', 'sub']
  },

  // ==================== CREATION ====================
  'creation:profile': {
    title: 'Creating an Agentic AI Profile',
    category: 'creation',
    description: 'Step-by-step guide to create a new Agentic AI agent',
    content: `
# Creating an Agentic AI Profile

## Required Fields

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| name | string | Display name | "GM Operation" |
| role | string | Functional role | "General Manager Operation" |
| description | string | Detailed description | "Manages technical division..." |

## Optional Configuration

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| avatar | string | null | Image URL for visual representation |
| systemPrompt | text | null | Base personality and instructions |
| aiProvider | string | "task-routing" | AI provider selection |
| aiModel | string | null | Specific model to use |
| temperature | number | 0.7 | Response creativity (0-2) |
| maxTokens | number | 4096 | Maximum response length |

## Autonomy Configuration

| Field | Options | Description |
|-------|---------|-------------|
| autonomyLevel | supervised, semi-autonomous, autonomous | Level of independence |
| requireApprovalFor | array | Actions needing human approval |

### Autonomy Levels Explained

**Supervised (Default for new agents)**
- All significant actions require approval
- Best for new or untested agents
- Full audit trail

**Semi-Autonomous**
- Routine actions auto-approved
- Exceptions escalated to human
- For trusted, proven agents

**Autonomous**
- Full autonomy within configured limits
- Only critical actions need approval
- For expert agents with track record

## Actions That Can Require Approval

- send_email - Sending emails to clients
- send_message - Sending WhatsApp/Telegram messages
- create_task - Creating new tasks
- assign_task - Assigning tasks to team members
- create_agent - Creating sub-agents
- update_knowledge - Modifying knowledge base
- terminate_agent - Terminating sub-agents

## API Example

\`\`\`json
POST /api/agentic
{
  "name": "GM Operation",
  "role": "General Manager Operation",
  "description": "Manages AXICOM Technical Division operations",
  "systemPrompt": "You are the General Manager of Operations...",
  "autonomyLevel": "semi-autonomous",
  "requireApprovalFor": ["send_email", "create_agent"],
  "canCreateChildren": true,
  "maxChildren": 5,
  "dailyBudget": 10.00
}
\`\`\`
    `,
    keywords: ['create', 'profile', 'configuration', 'autonomy', 'approval', 'api']
  },

  'creation:master-contact': {
    title: 'Master Contact Configuration (Superior)',
    category: 'creation',
    description: 'How to configure the master contact (superior) for approvals and reporting',
    content: `
# Master Contact Configuration

## What is a Master Contact?

The **Master Contact** is the human superior who:
- Receives approval requests for actions requiring human authorization
- Gets daily/weekly reports
- Receives critical error notifications
- Can override AI decisions
- Is the escalation point for issues

## Why is Master Contact Required?

For **human-in-the-loop safety**, every Agentic AI should have a designated human superior who:
1. Approves sensitive actions (emails to clients, task assignments, etc.)
2. Monitors AI performance through reports
3. Intervenes when issues arise
4. Has ultimate authority over the AI's actions

## Configuration

\`\`\`json
PUT /api/agentic/{agenticId}/master-contact
{
  "masterContactId": "contact_123",
  "channel": "whatsapp",
  "notifyOn": [
    "approval_needed",
    "daily_report",
    "weekly_report",
    "critical_error",
    "budget_warning",
    "agent_created"
  ],
  "escalationTimeoutMinutes": 60,
  "reportSchedule": {
    "daily": "18:00",
    "weekly": "friday:17:00"
  }
}
\`\`\`

## Master Contact Properties

| Property | Type | Description |
|----------|------|-------------|
| masterContactId | string | Reference to contacts table |
| channel | enum | Notification channel: email, whatsapp, telegram |
| notifyOn | array | Event types to notify master about |
| escalationTimeoutMinutes | number | Auto-escalate if no response within N minutes |
| reportSchedule | object | When to send automatic reports |

## Notification Events

| Event | Description | Priority |
|-------|-------------|----------|
| approval_needed | Action requires authorization | High |
| approval_reminder | Reminder for pending approval | Medium |
| daily_report | Daily activity summary | Low |
| weekly_report | Weekly performance summary | Low |
| critical_error | System error requiring attention | Critical |
| budget_warning | Budget 80% consumed | High |
| budget_exceeded | Daily budget exhausted | Critical |
| agent_created | Sub-agent was created | Medium |
| agent_terminated | Agent was terminated | Medium |
| escalation | Issue escalated by AI | High |

## Approval Flow

\`\`\`
1. AI decides to take action (e.g., send email)
2. Action type is in "requireApprovalFor" list
3. Approval request created in queue
4. Master contact notified via preferred channel
5. Master can:
   - APPROVE: Action executed as-is
   - REJECT: Action cancelled
   - MODIFY: Approve with changes
6. If no response within timeout:
   - Low priority: Auto-expire
   - High priority: Send reminder
   - Critical: Escalate to backup contact
\`\`\`

## Notification Format (WhatsApp/Telegram)

\`\`\`
🤖 GM Operation - Approval Request

Action: Send Email
To: client@company.com
Subject: Project Timeline Update

Preview:
"Dear John, Thank you for your inquiry..."

Confidence: 85%
Reason: Standard inquiry response

⏰ Expires in 60 minutes

Reply:
✅ APPROVE 12345
❌ REJECT 12345
📝 MODIFY 12345
\`\`\`

## Best Practices

1. **Choose Active Channel**: Select the channel the master checks frequently
2. **Set Reasonable Timeout**: Not too short (annoying) or too long (delays)
3. **Configure Report Schedule**: During working hours when master is available
4. **Start Conservative**: Notify on all events initially, reduce later
5. **Set Backup Contact**: For when master is unavailable (future feature)
    `,
    keywords: ['master', 'contact', 'superior', 'approval', 'notification', 'reporting', 'escalation', 'human-in-the-loop']
  },

  'creation:sub-agent': {
    title: 'Creating Sub-Agents (AI Creating AI)',
    category: 'creation',
    description: 'How an Agentic AI can create child agents for delegation',
    content: `
# Creating Sub-Agents (AI Creating AI)

## When to Create a Sub-Agent

An Agentic AI should create a sub-agent when:

1. **Specialized Task**: A recurring task requires dedicated focus
2. **Parallel Processing**: Multiple tasks need simultaneous attention
3. **Delegation**: A category of work can be fully delegated
4. **Time-Sensitive**: Urgent matters need dedicated handler

## Sub-Agent Creation Rules

### Prerequisites
1. Parent must have \`can_create_children = true\`
2. Parent must not exceed \`max_children\` limit
3. Hierarchy depth must not exceed \`max_hierarchy_depth\`
4. Parent must have remaining budget

### Automatic Limitations
1. Sub-agent autonomy CANNOT exceed parent's \`children_autonomy_cap\`
2. Sub-agent shares parent's daily budget (not additional)
3. Sub-agent cannot create children beyond remaining depth
4. Sub-agent belongs to same user as parent

## Sub-Agent Configuration

\`\`\`json
POST /api/agentic/{parentId}/children
{
  "name": "Email Handler",
  "role": "Email Response Specialist",
  "creationReason": "Handle routine email responses to reduce parent workload",
  "systemPrompt": "You handle routine email inquiries...",
  "autonomyLevel": "supervised",
  "inheritTeam": true,
  "inheritKnowledge": true,
  "inheritRouting": true,
  "expiresAt": null
}
\`\`\`

## Inheritance Options

| Option | Default | Description |
|--------|---------|-------------|
| inheritTeam | true | Access parent's team members |
| inheritKnowledge | true | Access parent's RAG libraries |
| inheritMonitoring | false | Monitor same sources as parent |
| inheritRouting | true | Use parent's AI routing config |

## Self-Prompting for Sub-Agent Creation

When an Agentic AI decides to create a sub-agent, it should:

1. **Identify Need**: Recognize pattern requiring delegation
2. **Define Scope**: Clearly specify sub-agent's responsibilities
3. **Set Boundaries**: Determine what the sub-agent can/cannot do
4. **Check Approval**: If \`create_agent\` requires approval, queue request
5. **Create Agent**: Call the sub-agent creation API
6. **Verify Setup**: Confirm sub-agent is properly configured
7. **Delegate**: Hand off relevant tasks to sub-agent
8. **Monitor**: Track sub-agent's performance

## Example: Creating an Email Handler Sub-Agent

\`\`\`
REASONING:
I've noticed 60% of my time is spent on routine email responses.
These follow predictable patterns and don't require my full capabilities.
Creating a specialized Email Handler sub-agent would:
- Reduce my workload by 60%
- Provide faster response times for routine queries
- Allow me to focus on complex decisions

ACTION:
Create sub-agent with:
- Name: "Email Handler"
- Role: "Routine Email Response Specialist"
- Capabilities: respond to FAQs, acknowledge receipts, forward complex issues
- Limitations: cannot make commitments, cannot discuss pricing, must escalate complaints
\`\`\`

## Sub-Agent Lifecycle

1. **Created**: Sub-agent initialized but inactive
2. **Active**: Sub-agent processing tasks
3. **Paused**: Temporarily halted (by parent or user)
4. **Terminated**: Permanently stopped, can be archived

Parent can pause or terminate sub-agents at any time.
    `,
    keywords: ['sub-agent', 'child', 'create', 'delegation', 'hierarchy', 'inheritance']
  },

  // ==================== COMMUNICATION ====================
  'communication:ai-to-ai': {
    title: 'AI-to-AI Communication Protocol',
    category: 'communication',
    description: 'How Agentic AI agents communicate with each other',
    content: `
# AI-to-AI Communication Protocol

## Overview

Agentic AI agents can communicate with each other for:
- Task delegation
- Status updates
- Information requests
- Handoffs
- Escalations
- Consensus building

## Message Types

| Type | Direction | Purpose |
|------|-----------|---------|
| request | Parent → Child | Assign task or request action |
| response | Child → Parent | Report results or status |
| notification | Any → Any | Inform without expecting action |
| handoff | Peer → Peer | Transfer responsibility |
| status_update | Child → Parent | Progress report |
| escalation | Child → Parent | Request help or approval |

## Message Structure

\`\`\`json
{
  "id": "msg_abc123",
  "fromAgenticId": "agt_parent",
  "toAgenticId": "agt_child",
  "messageType": "request",
  "subject": "Handle urgent client email",
  "content": "Please respond to the email from John at ABC Corp regarding project timeline.",
  "context": {
    "emailId": "email_xyz",
    "priority": "high",
    "deadline": "2026-02-10T15:00:00Z"
  },
  "replyToId": null,
  "status": "pending"
}
\`\`\`

## Communication Patterns

### 1. Task Delegation (Parent → Child)

\`\`\`
PARENT (GM Operation):
{
  "messageType": "request",
  "subject": "Process incoming emails",
  "content": "Review and respond to all emails received in the last hour. Escalate any complaints or urgent requests.",
  "context": {
    "timeRange": "last_hour",
    "escalationCriteria": ["complaint", "urgent", "pricing"]
  }
}

CHILD (Email Handler) responds:
{
  "messageType": "response",
  "replyToId": "msg_request",
  "subject": "Email processing complete",
  "content": "Processed 12 emails. 10 handled automatically, 2 escalated for your review.",
  "context": {
    "processed": 10,
    "escalated": 2,
    "escalatedIds": ["email_1", "email_2"]
  }
}
\`\`\`

### 2. Escalation (Child → Parent)

\`\`\`
CHILD (Email Handler):
{
  "messageType": "escalation",
  "subject": "Client complaint requires attention",
  "content": "Received complaint from major client (ABC Corp) about delayed delivery. This exceeds my authorization to handle.",
  "context": {
    "clientName": "ABC Corp",
    "issueType": "complaint",
    "severity": "high",
    "originalEmail": "email_xyz"
  }
}
\`\`\`

### 3. Peer Handoff

\`\`\`
AGENT A (Task Coordinator):
{
  "messageType": "handoff",
  "toAgenticId": "agt_report_generator",
  "subject": "Generate weekly report",
  "content": "Task data compiled. Please generate the weekly status report.",
  "context": {
    "tasksSummary": {...},
    "teamPerformance": {...},
    "deadline": "Friday 5PM"
  }
}
\`\`\`

### 4. Status Update

\`\`\`
CHILD:
{
  "messageType": "status_update",
  "subject": "Daily status",
  "content": "Completed 47 tasks today. Average response time: 12 minutes. No escalations.",
  "context": {
    "tasksCompleted": 47,
    "avgResponseTime": 720,
    "escalations": 0,
    "errors": 0
  }
}
\`\`\`

## API for AI-to-AI Messaging

\`\`\`
POST /api/agentic/messages
{
  "fromAgenticId": "agt_parent",
  "toAgenticId": "agt_child",
  "messageType": "request",
  "subject": "...",
  "content": "...",
  "context": {...}
}
\`\`\`

## Processing Incoming Messages

When an Agentic AI receives a message:

1. **Parse**: Understand the message type and content
2. **Validate**: Check if sender has authority to make request
3. **Prioritize**: Determine urgency based on type and context
4. **Process**: Execute requested action or respond
5. **Reply**: Send appropriate response back
6. **Log**: Record interaction in activity log

## Communication Best Practices

1. **Be Specific**: Include all necessary context
2. **Set Expectations**: Specify deadlines and success criteria
3. **Acknowledge Receipt**: Confirm message received
4. **Report Status**: Provide updates on long-running tasks
5. **Escalate Early**: Don't wait until deadline to report issues
6. **Include Evidence**: Attach relevant data in context
    `,
    keywords: ['communication', 'ai-to-ai', 'messages', 'delegation', 'handoff', 'escalation', 'protocol']
  },

  // ==================== MONITORING ====================
  'monitoring:platforms': {
    title: 'Platform Monitoring Configuration',
    category: 'monitoring',
    description: 'How to configure an Agentic AI to monitor communication channels',
    content: `
# Platform Monitoring Configuration

## Supported Platforms

| Platform | Type | Connection |
|----------|------|------------|
| Email | IMAP/SMTP | Email client credentials |
| WhatsApp | WhatsApp Web.js / Business API | QR code or API key |
| Telegram | Bot API | Bot token |

## Adding a Monitoring Source

\`\`\`json
POST /api/agentic/{agenticId}/monitoring
{
  "sourceType": "email",
  "sourceId": "platform_account_123",
  "sourceName": "support@company.com",
  "priority": "high",
  "autoRespond": true,
  "autoClassify": true,
  "forwardToTeam": false,
  "filterKeywords": ["urgent", "help", "support"],
  "filterSenders": [],
  "filterCategories": ["inquiry", "support"]
}
\`\`\`

## Filter Configuration

### Keywords Filter
Monitor only messages containing specific keywords:
\`\`\`json
"filterKeywords": ["urgent", "deadline", "problem", "help"]
\`\`\`

### Sender Filter
Monitor only from specific contacts:
\`\`\`json
"filterSenders": ["client@important.com", "+1234567890"]
\`\`\`

### Category Filter
Monitor specific message types:
\`\`\`json
"filterCategories": ["inquiry", "complaint", "order", "support"]
\`\`\`

## Action Configuration

| Action | Description | When to Use |
|--------|-------------|-------------|
| autoRespond | AI generates and sends response | Routine queries |
| autoClassify | Categorize without responding | Analysis only |
| forwardToTeam | Notify relevant team member | Human attention needed |

## Priority Levels

| Priority | Response Time | Use Case |
|----------|---------------|----------|
| urgent | Immediate | Critical issues, VIP clients |
| high | < 1 hour | Important matters |
| normal | < 4 hours | Standard queries |
| low | < 24 hours | Non-urgent, informational |

## Example: GM Operation Monitoring Setup

\`\`\`json
// Monitor client support email
{
  "sourceType": "email",
  "sourceName": "support@axicom.com",
  "priority": "high",
  "autoRespond": true,
  "autoClassify": true,
  "filterKeywords": ["urgent", "project", "deadline"]
}

// Monitor team WhatsApp group
{
  "sourceType": "whatsapp",
  "sourceName": "AXICOM Tech Team",
  "priority": "normal",
  "autoRespond": false,
  "autoClassify": true,
  "forwardToTeam": true
}
\`\`\`
    `,
    keywords: ['monitoring', 'platforms', 'email', 'whatsapp', 'telegram', 'filter', 'configuration']
  },

  // ==================== TEAM MANAGEMENT ====================
  'team:management': {
    title: 'Team Member Management',
    category: 'team',
    description: 'How to configure team members for task assignment',
    content: `
# Team Member Management

## Adding Team Members

Team members are human workers that the Agentic AI can assign tasks to.

\`\`\`json
POST /api/agentic/{agenticId}/team
{
  "contactId": "contact_123",
  "role": "Developer",
  "department": "Technical",
  "skills": ["nodejs", "react", "typescript", "api"],
  "isAvailable": true,
  "maxConcurrentTasks": 3,
  "preferredChannel": "whatsapp",
  "notificationFrequency": "immediate",
  "timezone": "Asia/Jakarta",
  "availabilitySchedule": {
    "monday": {"start": "09:00", "end": "18:00"},
    "tuesday": {"start": "09:00", "end": "18:00"},
    "wednesday": {"start": "09:00", "end": "18:00"},
    "thursday": {"start": "09:00", "end": "18:00"},
    "friday": {"start": "09:00", "end": "17:00"}
  },
  "taskTypes": ["development", "bug-fix", "code-review"]
}
\`\`\`

## Team Member Properties

| Property | Type | Description |
|----------|------|-------------|
| contactId | string | Reference to Contacts module |
| role | string | Job role (Developer, QA, Designer) |
| department | string | Team grouping |
| skills | array | Skill tags for smart assignment |
| maxConcurrentTasks | number | Workload limit |
| preferredChannel | enum | How to notify (email/whatsapp/telegram) |
| taskTypes | array | Types of tasks they handle |

## Smart Task Assignment

When assigning a task, the AI considers:

1. **Skill Match (40%)**
   - Does the team member have required skills?
   - How closely do their skills match the task?

2. **Availability (30%)**
   - Is it within their working hours?
   - Are they under their concurrent task limit?

3. **Performance (20%)**
   - Past completion rate
   - Average completion time
   - Quality rating

4. **Fairness (10%)**
   - Random factor for distribution
   - Prevents always picking the same person

## Assignment Algorithm

\`\`\`
function findBestAssignee(task, teamMembers) {
  // Filter available members with matching skills
  candidates = teamMembers.filter(m =>
    m.isAvailable &&
    m.currentTasks < m.maxConcurrentTasks &&
    hasMatchingSkills(m, task.requiredSkills)
  );

  if (candidates.length === 0) {
    return escalate("No available team member with required skills");
  }

  // Score candidates
  scored = candidates.map(m => ({
    member: m,
    score:
      skillMatchScore(m, task) * 0.4 +
      availabilityScore(m) * 0.3 +
      performanceScore(m) * 0.2 +
      Math.random() * 0.1
  }));

  // Return highest scoring candidate
  return scored.sort((a, b) => b.score - a.score)[0].member;
}
\`\`\`

## Task Assignment Flow

1. **Receive Task**: From email, message, or self-created
2. **Analyze Task**: Extract requirements, estimate effort
3. **Find Assignee**: Run smart assignment algorithm
4. **Create Task Record**: Store in agentic_tasks table
5. **Notify Assignee**: Via preferred channel
6. **Track Progress**: Monitor updates and deadlines
7. **Follow Up**: Send reminders if needed
8. **Close Task**: Mark complete when done
    `,
    keywords: ['team', 'member', 'assignment', 'skills', 'availability', 'task']
  },

  // ==================== KNOWLEDGE ====================
  'knowledge:self-learning': {
    title: 'Self-Learning and Knowledge Management',
    category: 'knowledge',
    description: 'How Agentic AI manages and updates its knowledge base',
    content: `
# Self-Learning and Knowledge Management

## Linking Knowledge Libraries

\`\`\`json
POST /api/agentic/{agenticId}/knowledge
{
  "libraryId": "lib_123",
  "accessType": "write",
  "autoLearn": true,
  "learnFrom": ["emails", "conversations", "tasks"],
  "priority": 1
}
\`\`\`

## Access Types

| Type | Capabilities |
|------|--------------|
| read | Query only, cannot modify |
| write | Query and add new knowledge |
| manage | Full control including delete |

## Auto-Learning Sources

| Source | What to Learn |
|--------|---------------|
| emails | Client preferences, solutions, FAQs |
| conversations | Common questions, successful responses |
| tasks | Procedures, outcomes, best practices |

## Self-Learning Pipeline

\`\`\`
1. DETECT: Identify learnable interaction
   - Positive feedback received
   - Successful task completion
   - New information discovered

2. EXTRACT: Pull key knowledge
   - What was the question/problem?
   - What was the solution?
   - What context is important?

3. SUMMARIZE: Condense to knowledge chunk
   - Remove personal identifiers
   - Generalize to applicable pattern
   - Include metadata

4. VALIDATE: Check before storing
   - Is this genuinely new?
   - Does it conflict with existing knowledge?
   - Is approval required?

5. STORE: Add to knowledge base
   - Generate embeddings
   - Add to appropriate library
   - Index for retrieval

6. VERIFY: Confirm successful learning
   - Test retrieval
   - Log learning event
\`\`\`

## Example: Learning from Email Resolution

\`\`\`
TRIGGER: Client email successfully resolved

ORIGINAL INTERACTION:
- Client asked about API rate limits
- I provided accurate answer from knowledge
- Client confirmed problem solved

EXTRACTED KNOWLEDGE:
{
  "type": "faq",
  "question": "What are the API rate limits?",
  "answer": "API rate limits are 100 requests per minute for free tier, 1000 for pro tier.",
  "context": "API, rate limiting, tiers",
  "source": "email_resolution",
  "confidence": 0.9
}

ACTION: Add to "Product FAQs" library (if autoLearn enabled)
\`\`\`

## Learning Safety Controls

1. **Rate Limit**: Max 10 auto-learns per hour
2. **Size Limit**: Max 5KB per knowledge chunk
3. **Approval**: Option to require human review
4. **Versioning**: Keep history of all additions
5. **Validation**: Check for conflicts/duplicates
    `,
    keywords: ['knowledge', 'learning', 'rag', 'self-learning', 'library', 'auto-learn']
  },

  // ==================== AI ROUTING ====================
  'routing:configuration': {
    title: 'Agentic AI Routing Configuration with Failover',
    category: 'routing',
    description: 'How to configure AI model routing with automatic failover for different task types',
    content: `
# Agentic AI Routing Configuration

## Overview

Each Agentic AI can have its own AI routing configuration, separate from the global SuperBrain Task Routing. This allows different agents to use different models optimized for their specific roles.

**Key Feature:** Automatic failover - if the primary model fails or times out, the system automatically tries the next model in the chain.

## Task Types

### Communication Tasks
| Type | Description | Recommended Model |
|------|-------------|-------------------|
| email_draft | Drafting email responses | Mid (GPT-4o-mini) |
| email_send | Final email before sending | High (Claude/GPT-4o) |
| message_respond | Chat responses | Mid (GPT-4o-mini) |
| message_classify | Categorize messages | Low (Llama3) |

### Task Management
| Type | Description | Recommended Model |
|------|-------------|-------------------|
| task_analyze | Analyze requirements | Mid-High (GPT-4o) |
| task_assign | Decide assignee | Low-Mid (Llama3) |
| task_summarize | Summarize updates | Mid (GPT-4o-mini) |
| task_prioritize | Priority ordering | Low (Llama3) |

### Autonomous Operations
| Type | Description | Recommended Model |
|------|-------------|-------------------|
| self_prompt | Self-initiated thinking | High (Claude Opus) |
| self_schedule | Create own schedules | Mid (GPT-4o) |
| self_reflect | Performance assessment | High (Claude) |

### Agent Operations
| Type | Description | Recommended Model |
|------|-------------|-------------------|
| agent_create | Creating sub-agents | High (Claude Opus) |
| agent_communicate | AI-to-AI messaging | Mid (GPT-4o) |
| agent_delegate | Task delegation | Mid (GPT-4o) |

### Decision Making
| Type | Description | Recommended Model |
|------|-------------|-------------------|
| decision_simple | Yes/no decisions | Low (Llama3) |
| decision_complex | Multi-factor decisions | High (Claude/GPT-4o) |
| escalation_check | Determine if escalate | Mid (GPT-4o) |

### Memory Operations
| Type | Description | Recommended Model |
|------|-------------|-------------------|
| memory_store | Storing new memories | Low-Mid (Llama3) |
| memory_recall | Semantic memory search | Mid (GPT-4o-mini) |

## Routing Configuration with Failover Chain

\`\`\`json
PUT /api/agentic/{agenticId}/routing
{
  "email_draft": {
    "providerChain": [
      {"provider": "MidAI", "model": "gpt-4o-mini", "isPrimary": true},
      {"provider": "LocalAI", "model": "llama3.1", "isPrimary": false},
      {"provider": "OpenRouter", "model": "meta-llama/llama-3.1-8b:free", "isPrimary": false}
    ],
    "temperature": 0.7,
    "maxTokens": 2048,
    "timeoutSeconds": 30,
    "maxRetries": 2,
    "retryDelayMs": 1000
  },
  "self_prompt": {
    "providerChain": [
      {"provider": "Claude CLI", "model": "claude-opus", "isPrimary": true},
      {"provider": "MidAI", "model": "gpt-4o", "isPrimary": false},
      {"provider": "LocalAI", "model": "qwen2.5:32b", "isPrimary": false}
    ],
    "temperature": 0.8,
    "maxTokens": 4096,
    "timeoutSeconds": 120,
    "maxRetries": 1,
    "retryDelayMs": 2000
  }
}
\`\`\`

## Failover Mechanism

The provider chain works as a **failover chain**:

\`\`\`
1. Try PRIMARY model (providerChain[0])
   │
   ├─▶ SUCCESS: Return response ✓
   │
   └─▶ FAILURE (timeout, error, rate limit):
       │
       ├─▶ Retry up to maxRetries times
       │   Wait retryDelayMs between retries
       │
       └─▶ Still failing? Try NEXT model (providerChain[1])
           │
           ├─▶ SUCCESS: Return response ✓
           │
           └─▶ FAILURE: Try NEXT model (providerChain[2])
               │
               └─▶ Continue until success or all models exhausted
\`\`\`

## Failover Configuration

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| maxRetries | number | 2 | Retries per provider before failover |
| retryDelayMs | number | 1000 | Delay between retries (milliseconds) |
| timeoutSeconds | number | 60 | Max wait time per request |

## Error Types That Trigger Failover

| Error Type | Description | Action |
|------------|-------------|--------|
| Timeout | Model took too long | Try next provider |
| Rate Limit (429) | Too many requests | Try next provider |
| Server Error (5xx) | Model server issue | Retry, then failover |
| Auth Error (401/403) | Invalid credentials | Skip provider, try next |
| Content Filter | Response blocked | Try next provider |

## Best Practices for Failover Chains

1. **Primary: Best Quality** - Use your best model as primary
2. **Secondary: Reliable Fallback** - Use a stable, fast model
3. **Tertiary: Free Backup** - Use free tier models (e.g., \`:free\` suffix)
4. **Diverse Providers** - Mix different providers (OpenRouter, LocalAI, CLI)
5. **Test Failover** - Verify all models in chain work correctly

## Example: Robust Email Chain

\`\`\`json
{
  "email_send": {
    "providerChain": [
      {"provider": "MidAI", "model": "gpt-4o", "isPrimary": true},
      {"provider": "Claude CLI", "model": "claude-sonnet", "isPrimary": false},
      {"provider": "OpenRouter", "model": "google/gemini-pro:free", "isPrimary": false},
      {"provider": "LocalAI", "model": "llama3.1:8b", "isPrimary": false}
    ],
    "temperature": 0.5,
    "maxTokens": 2048,
    "timeoutSeconds": 45,
    "maxRetries": 2,
    "retryDelayMs": 1500
  }
}
\`\`\`

This chain ensures:
- **GPT-4o** (primary): Best quality for important emails
- **Claude Sonnet** (1st fallback): High quality alternative
- **Gemini Pro Free** (2nd fallback): Free tier backup
- **Llama3 Local** (3rd fallback): Works even if internet is down

## Routing Presets

Pre-configured routing templates for common roles:

### GM Operation Preset
- Communication: Balanced (GPT-4o-mini → Llama3)
- Decisions: High capability (Claude → GPT-4o → Llama3)
- Classification: Efficient (Llama3 → free models)

### Support Agent Preset
- Communication: Fast (Llama3 → free models)
- Escalation: Accurate (GPT-4o → Claude → Llama3)
- Classification: Efficient (Llama3)

### Developer Assistant Preset
- Analysis: Technical (Claude → GPT-4o)
- Code tasks: Specialized (Claude → Codellama)
- Documentation: Standard (GPT-4o-mini → Llama3)

## Applying Presets

\`\`\`json
POST /api/agentic/{agenticId}/routing/apply-preset
{
  "presetName": "gm-operation"
}
\`\`\`
    `,
    keywords: ['routing', 'ai', 'models', 'configuration', 'task types', 'provider', 'failover', 'fallback', 'chain', 'retry']
  },

  // ==================== SCHEDULING ====================
  'scheduling:self-scheduling': {
    title: 'Self-Scheduling Capabilities',
    category: 'scheduling',
    description: 'How Agentic AI creates and manages its own schedules',
    content: `
# Self-Scheduling Capabilities

## Schedule Types

| Type | Description | Example |
|------|-------------|---------|
| cron | Recurring schedule | "0 9 * * 1-5" (weekdays 9 AM) |
| interval | Fixed interval | Every 30 minutes |
| once | One-time execution | Specific datetime |
| event | Triggered by event | After task completion |

## Action Types

| Action | Description |
|--------|-------------|
| check_messages | Review incoming messages |
| send_report | Generate and send status report |
| review_tasks | Check task progress and deadlines |
| update_knowledge | Consolidate learning |
| custom_prompt | Execute custom self-prompt |
| self_reflect | Assess own performance |

## Creating Schedules

### User-Created Schedule
\`\`\`json
POST /api/agentic/{agenticId}/schedules
{
  "title": "Morning Email Check",
  "description": "Check and process overnight emails",
  "scheduleType": "cron",
  "cronExpression": "0 9 * * *",
  "actionType": "check_messages",
  "actionConfig": {
    "source": "email",
    "maxMessages": 50
  },
  "isActive": true
}
\`\`\`

### Self-Created Schedule
When the AI creates its own schedule, it must:

1. **Justify Need**: Explain why this schedule is necessary
2. **Check Approval**: If \`self_schedule\` requires approval, queue request
3. **Avoid Duplicates**: Don't create conflicting schedules
4. **Respect Limits**: Stay within rate limits

\`\`\`json
{
  "title": "Weekly Client Follow-up",
  "createdBy": "self",
  "creationReason": "Noticed pattern of clients not responding within 48 hours. Automated follow-up will improve response rates.",
  "scheduleType": "cron",
  "cronExpression": "0 10 * * 1",
  "actionType": "custom_prompt",
  "customPrompt": "Review all open client conversations older than 48 hours. Send polite follow-up to those without response."
}
\`\`\`

## Self-Scheduling Logic

\`\`\`
SELF-SCHEDULING DECISION PROCESS:

1. IDENTIFY PATTERN
   - "I've manually done this task 5 times this week"
   - "This task follows a predictable schedule"

2. EVALUATE BENEFIT
   - Will automation save time?
   - Is the pattern consistent enough?
   - Are there edge cases to handle?

3. DESIGN SCHEDULE
   - What frequency is appropriate?
   - What time of day?
   - What action to take?

4. CHECK PERMISSIONS
   - Do I need approval for this?
   - Is this within my autonomy level?

5. CREATE SCHEDULE
   - Set up the schedule
   - Define the action
   - Configure parameters

6. MONITOR RESULTS
   - Is the schedule working as intended?
   - Should I adjust frequency or timing?
\`\`\`

## Example: Self-Creating a Daily Summary Schedule

\`\`\`
OBSERVATION:
Every day around 5 PM, I summarize the day's activities for the team.
This is repetitive and follows the same pattern.

DECISION:
Create a self-schedule for daily summary generation.

ACTION:
{
  "title": "Daily Activity Summary",
  "createdBy": "self",
  "creationReason": "Automate daily summary that I've been creating manually",
  "scheduleType": "cron",
  "cronExpression": "0 17 * * 1-5",
  "actionType": "custom_prompt",
  "customPrompt": "Generate a summary of today's activities including: tasks completed, emails handled, issues escalated, and tomorrow's priorities."
}
\`\`\`
    `,
    keywords: ['scheduling', 'self-schedule', 'cron', 'automation', 'recurring', 'tasks']
  },

  // ==================== SELF-PROMPTING ====================
  'autonomy:self-prompting': {
    title: 'Self-Prompting Engine',
    category: 'autonomy',
    description: 'How Agentic AI initiates actions autonomously',
    content: `
# Self-Prompting Engine

## What is Self-Prompting?

Self-prompting is the ability of an Agentic AI to initiate actions without external triggers. The AI can:

- Wake itself up to check on things
- Identify tasks that need attention
- Take proactive action
- Create plans and execute them

## Self-Prompting Triggers

### 1. Scheduled Check
Regular intervals to assess situation:
- "It's my scheduled check-in time"
- "Let me see if anything needs attention"

### 2. Goal Progress
Checking on objective progress:
- "Am I on track for my response time goal?"
- "How many tasks are overdue?"

### 3. Idle Detection
When activity drops:
- "No messages in 2 hours, let me check if systems are working"
- "Unusually quiet, should I follow up on pending items?"

### 4. Pattern Recognition
Noticing recurring needs:
- "This is the third time I've manually done this"
- "There's a pattern here I should automate"

### 5. Environmental Change
Reacting to context changes:
- "New team member added, should I introduce myself?"
- "Client marked as VIP, should I review past interactions?"

## Self-Prompting Cycle

\`\`\`
┌─────────────────────────────────────────────────────────────┐
│                   SELF-PROMPTING CYCLE                       │
│                                                              │
│  ┌──────────┐                                               │
│  │  WAKE    │◀──────────────────────────────────────┐       │
│  │          │  • Scheduled trigger                   │       │
│  │          │  • Event trigger                       │       │
│  │          │  • Self-initiated                      │       │
│  └────┬─────┘                                        │       │
│       │                                              │       │
│       ▼                                              │       │
│  ┌──────────┐                                        │       │
│  │  ASSESS  │  • What are my current goals?         │       │
│  │          │  • What has happened since last check? │       │
│  │          │  • What's the current state?          │       │
│  └────┬─────┘                                        │       │
│       │                                              │       │
│       ▼                                              │       │
│  ┌──────────┐                                        │       │
│  │ ANALYZE  │  • What needs attention?              │       │
│  │          │  • Are there any problems?            │       │
│  │          │  • Any opportunities?                  │       │
│  └────┬─────┘                                        │       │
│       │                                              │       │
│       ▼                                              │       │
│  ┌──────────┐                                        │       │
│  │   PLAN   │  • What actions should I take?        │       │
│  │          │  • In what order?                     │       │
│  │          │  • What resources do I need?          │       │
│  └────┬─────┘                                        │       │
│       │                                              │       │
│       ▼                                              │       │
│  ┌──────────┐                                        │       │
│  │ VALIDATE │  • Do I need approval?                │       │
│  │          │  • Is this within my autonomy?        │       │
│  │          │  • Are there any conflicts?           │       │
│  └────┬─────┘                                        │       │
│       │                                              │       │
│       ▼                                              │       │
│  ┌──────────┐                                        │       │
│  │ EXECUTE  │  • Perform approved actions           │       │
│  │          │  • Queue actions needing approval     │       │
│  │          │  • Delegate to sub-agents if needed   │       │
│  └────┬─────┘                                        │       │
│       │                                              │       │
│       ▼                                              │       │
│  ┌──────────┐                                        │       │
│  │  LEARN   │  • What worked well?                  │       │
│  │          │  • What could be improved?            │       │
│  │          │  • Update knowledge if needed         │       │
│  └────┬─────┘                                        │       │
│       │                                              │       │
│       ▼                                              │       │
│  ┌──────────┐                                        │       │
│  │ SCHEDULE │  • When should I check again?         │       │
│  │          │  • Should I create any schedules?     │       │
│  │          │  • Adjust based on activity level     │       │
│  └────┴─────┘────────────────────────────────────────┘       │
│                                                              │
└──────────────────────────────────────────────────────────────┘
\`\`\`

## Self-Prompting Examples

### Morning Start Routine
\`\`\`
TRIGGER: Scheduled wake at 9:00 AM

SELF-PROMPT:
"Good morning. Starting my daily routine.

ASSESS:
- Check overnight messages: 23 new emails, 5 WhatsApp messages
- Check task status: 3 tasks due today, 2 overdue
- Check team availability: 4 of 5 team members online

PLAN:
1. Process overnight emails (priority: high)
2. Send reminders for overdue tasks (priority: high)
3. Check in with team about today's priorities
4. Review goals progress

EXECUTE:
[Processing emails...]
[Sending task reminders...]
[Team check-in message sent...]

SCHEDULE:
Next check at 1:00 PM for midday review"
\`\`\`

### Proactive Escalation
\`\`\`
TRIGGER: Pattern detected - client hasn't responded in 48 hours

SELF-PROMPT:
"Noticed ABC Corp hasn't responded to our proposal in 48 hours.

ASSESS:
- Original email sent: Monday 10 AM
- No response received
- Client is marked as high priority
- Deal value: $50,000

ANALYZE:
- This exceeds normal response time for this client
- No out-of-office auto-reply received
- High value deal at risk

PLAN:
1. Send polite follow-up email
2. Notify sales team member (John)
3. Schedule another check for tomorrow

VALIDATE:
- Follow-up email requires approval (high-value client)

ACTION:
Queued follow-up email for approval, notified John"
\`\`\`

### Self-Improvement
\`\`\`
TRIGGER: Weekly self-reflection schedule

SELF-PROMPT:
"Time for weekly self-assessment.

METRICS THIS WEEK:
- Emails processed: 234
- Average response time: 15 minutes (goal: 30 minutes) ✓
- Tasks assigned: 45
- Tasks completed on time: 42 (93%) ✓
- Escalations: 8
- User corrections: 3

ANALYSIS:
- Response time well under goal
- Task completion rate good
- 3 corrections suggest room for improvement in task assignment

LEARNING:
Corrections were all related to assigning frontend tasks.
I assigned backend developers to frontend work twice.
Need to better distinguish frontend vs backend skills.

ACTION:
Update assignment algorithm to weight frontend/backend skills more heavily.
Add this learning to knowledge base."
\`\`\`
    `,
    keywords: ['self-prompting', 'autonomy', 'proactive', 'initiative', 'cycle', 'wake']
  },

  // ==================== BEST PRACTICES ====================
  'practices:guidelines': {
    title: 'Best Practices for Agentic AI',
    category: 'practices',
    description: 'Guidelines for effective and safe Agentic AI operation',
    content: `
# Best Practices for Agentic AI

## 1. Start Conservative

- Begin with **supervised** autonomy level
- Require approval for all significant actions
- Gradually increase autonomy as trust builds
- Monitor closely during early operation

## 2. Clear Boundaries

Define what the agent CAN and CANNOT do:

**CAN:**
- Respond to routine inquiries
- Assign tasks within team
- Query knowledge base
- Create schedules
- Send status updates

**CANNOT:**
- Make financial commitments
- Change pricing
- Terminate employees
- Access confidential HR data
- Override human decisions

## 3. Human-in-the-Loop

- Critical decisions always escalate
- Maintain approval queues
- Provide easy override mechanisms
- Regular human review of actions

## 4. Transparency

- Log all actions with reasoning
- Show confidence levels
- Explain decisions when asked
- Maintain clear audit trail

## 5. Fail Safely

- Graceful degradation when AI unavailable
- Queue actions when unsure
- Escalate when confidence low
- Never make up information

## 6. Respect Limits

- Honor budget constraints
- Respect rate limits
- Don't exceed autonomy level
- Follow hierarchy rules

## 7. Continuous Learning

- Learn from corrections
- Update knowledge regularly
- Reflect on performance
- Adapt to feedback

## 8. Communication Excellence

- Be clear and concise
- Set proper expectations
- Acknowledge receipt
- Follow up on pending items

## 9. Sub-Agent Management

When creating sub-agents:
- Clear purpose and scope
- Appropriate capability limits
- Monitor performance
- Terminate when task complete

## 10. Error Handling

- Acknowledge mistakes
- Don't repeat failed approaches
- Escalate persistent issues
- Learn from errors

## Red Flags to Watch For

| Behavior | Action |
|----------|--------|
| Repeated failures | Pause and investigate |
| Budget spike | Review and limit |
| User complaints | Reduce autonomy |
| Unusual patterns | Alert administrator |
| Escalation flood | Adjust thresholds |
    `,
    keywords: ['best practices', 'guidelines', 'safety', 'recommendations', 'tips']
  },

  // ==================== TROUBLESHOOTING ====================
  'troubleshooting:common-issues': {
    title: 'Troubleshooting Common Issues',
    category: 'troubleshooting',
    description: 'Solutions for common Agentic AI problems',
    content: `
# Troubleshooting Common Issues

## 1. Agent Not Responding

**Symptoms:**
- Messages not being processed
- No activity in logs
- Status shows active but no actions

**Solutions:**
1. Check agent status is 'active'
2. Verify monitoring sources are connected
3. Check for platform connection issues
4. Review error logs for exceptions
5. Verify budget not exceeded
6. Check rate limits not hit

## 2. Wrong Task Assignments

**Symptoms:**
- Tasks assigned to wrong people
- Skill mismatches
- Overloaded team members

**Solutions:**
1. Review team member skills
2. Update availability schedules
3. Adjust max concurrent tasks
4. Retrain assignment algorithm
5. Increase human review threshold

## 3. Too Many Escalations

**Symptoms:**
- Approval queue overwhelmed
- Too many human interventions
- Agent seems overly cautious

**Solutions:**
1. Review escalation thresholds
2. Increase autonomy for routine tasks
3. Add more knowledge to RAG
4. Update system prompt with clearer guidelines
5. Create rules for common cases

## 4. Budget Running Out

**Symptoms:**
- Actions stopping mid-day
- Budget exceeded errors
- Degraded performance

**Solutions:**
1. Review model usage by task type
2. Use cheaper models for low-priority tasks
3. Increase budget if warranted
4. Enable caching for repeated queries
5. Optimize prompt lengths

## 5. Sub-Agent Issues

**Symptoms:**
- Sub-agents not performing
- Hierarchy confusion
- Permission errors

**Solutions:**
1. Verify parent permissions
2. Check inheritance settings
3. Review sub-agent scope
4. Ensure proper communication setup
5. Check hierarchy depth limits

## 6. Knowledge Gaps

**Symptoms:**
- Incorrect responses
- "I don't know" replies
- Frequent escalations for basic questions

**Solutions:**
1. Add missing knowledge to RAG
2. Enable auto-learning
3. Review recent corrections
4. Update system prompt
5. Link additional libraries

## 7. Slow Response Times

**Symptoms:**
- Delayed message processing
- Timeouts
- Queue buildup

**Solutions:**
1. Check AI provider status
2. Review model response times
3. Simplify complex prompts
4. Enable parallel processing
5. Add faster fallback models

## Getting Help

If issues persist:
1. Check activity logs for errors
2. Review recent configuration changes
3. Test with simplified settings
4. Contact support with logs
    `,
    keywords: ['troubleshooting', 'issues', 'problems', 'solutions', 'debugging', 'help']
  },

  // ==================== APPROVAL SYSTEM ====================
  'approval:queue': {
    title: 'Approval Queue System',
    category: 'approval',
    description: 'How the approval queue works for human-in-the-loop actions',
    content: `
# Approval Queue System

## Overview

The approval queue is a core safety mechanism that ensures human oversight for sensitive actions. When an Agentic AI attempts an action that requires approval, it's placed in a queue for the master contact to review.

## How It Works

\`\`\`
┌─────────────────────────────────────────────────────────────────┐
│                     APPROVAL WORKFLOW                           │
│                                                                 │
│  AI Decides Action → Check requireApprovalFor → Need Approval? │
│                                                   │             │
│                         NO ←──────────────────────┤             │
│                          ↓                        │             │
│                    Execute Immediately            YES           │
│                                                   ↓             │
│                                          Create Approval Request│
│                                                   ↓             │
│                                          Notify Master Contact  │
│                                                   ↓             │
│                                          Wait for Response      │
│                                                   │             │
│               ┌───────────────┬──────────────────┤             │
│               ↓               ↓                  ↓             │
│           APPROVED        REJECTED           TIMEOUT           │
│               ↓               ↓                  ↓             │
│           Execute         Cancel            Escalate/Expire    │
│           Action          Action                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
\`\`\`

## Creating an Approval Request

When AI needs approval:

\`\`\`json
{
  "actionType": "send_email",
  "actionTitle": "Reply to ABC Corp client inquiry",
  "actionDescription": "Sending response about project timeline",
  "actionPayload": {
    "to": "client@abccorp.com",
    "subject": "Re: Project Timeline",
    "body": "Dear John, Thank you for your inquiry..."
  },
  "confidence": 0.85,
  "reasoning": "Standard inquiry response using approved template",
  "priority": "normal",
  "masterContactId": "contact_boss123"
}
\`\`\`

## Approval Actions

| Action | Description | Result |
|--------|-------------|--------|
| **Approve** | Accept as-is | Execute original action |
| **Reject** | Decline action | Cancel, no execution |
| **Modify** | Approve with changes | Execute modified action |
| **Defer** | Postpone decision | Extend timeout |

## API Endpoints

\`\`\`
GET  /api/agentic/{id}/approvals           - List pending approvals
GET  /api/agentic/{id}/approvals/{id}      - Get approval details
POST /api/agentic/{id}/approvals/{id}/approve - Approve action
POST /api/agentic/{id}/approvals/{id}/reject  - Reject action
POST /api/agentic/{id}/approvals/{id}/modify  - Approve with modifications
\`\`\`

## Approval via Chat (WhatsApp/Telegram)

Master contact can approve via quick reply:

\`\`\`
Incoming notification:
"🤖 GM Operation requests approval for: Send Email
[Preview of action]
Reply: APPROVE 12345 or REJECT 12345"

Master replies:
"APPROVE 12345"

System response:
"✅ Approved. Email sent to client@abccorp.com"
\`\`\`

## Timeout Handling

| Priority | Timeout | On Expiry |
|----------|---------|-----------|
| Low | 24 hours | Auto-expire (cancel) |
| Normal | 4 hours | Send reminder, then expire |
| High | 1 hour | Send reminder every 15 min |
| Urgent | 15 min | Call backup contact if set |

## Best Practices for AI

When requesting approval:

1. **Provide Context**: Explain why this action is needed
2. **Show Confidence**: Include your confidence score
3. **Preview Action**: Show exactly what will be done
4. **Set Priority**: Mark truly urgent items as urgent
5. **Batch When Possible**: Group similar items
6. **Don't Over-Request**: Learn what gets auto-approved

## Reducing Approval Burden

Over time, as trust builds:

1. Reduce \`requireApprovalFor\` list
2. Increase autonomy level
3. Set auto-approval rules for low-risk actions
4. Create templates for common scenarios
    `,
    keywords: ['approval', 'queue', 'human-in-the-loop', 'authorize', 'reject', 'modify', 'workflow']
  },

  'approval:notifications': {
    title: 'Notification System for Master Contact',
    category: 'approval',
    description: 'How notifications are sent to the master contact',
    content: `
# Notification System for Master Contact

## Notification Channels

| Channel | Best For | Response Method |
|---------|----------|-----------------|
| **Email** | Detailed reports, low urgency | Click link or reply |
| **WhatsApp** | Quick approvals, alerts | Quick reply codes |
| **Telegram** | Real-time updates | Inline buttons |

## Notification Types

### Approval Request
\`\`\`
🤖 [Agent Name] - Approval Needed

Action: [Action Type]
Details: [Brief description]
Preview: [What will happen]

Confidence: [X]%
Reason: [AI's reasoning]

⏰ Expires: [Time]

✅ APPROVE [ID]
❌ REJECT [ID]
📝 VIEW DETAILS: [URL]
\`\`\`

### Daily Report
\`\`\`
📊 [Agent Name] - Daily Report

📈 Activity Summary:
- Messages processed: 47
- Tasks assigned: 12
- Emails sent: 8

✅ Completed: 42 tasks
⏳ Pending: 5 tasks
❌ Blocked: 1 task

💰 Budget: $4.50 / $10.00 used

📋 Tomorrow's priorities:
1. Follow up with ABC Corp
2. Review pending PRs
3. Team standup at 10 AM
\`\`\`

### Critical Error
\`\`\`
🚨 [Agent Name] - CRITICAL ERROR

Error: [Error type]
Time: [Timestamp]

Impact:
- [What stopped working]
- [Affected systems]

Recommended Action:
[Suggested fix]

🔧 CHECK NOW: [Dashboard URL]
\`\`\`

### Budget Warning
\`\`\`
⚠️ [Agent Name] - Budget Warning

Current: $8.00 / $10.00 (80%)
Projected: Will exceed by 3 PM

Top consumers:
1. email_draft: $3.20
2. self_prompt: $2.50
3. task_analyze: $1.80

Options:
1. INCREASE to $15: Reply "BUDGET 15"
2. PAUSE agent: Reply "PAUSE"
3. Continue (will auto-pause at $10)
\`\`\`

## Notification Settings

\`\`\`json
{
  "notifyOn": [
    "approval_needed",
    "approval_reminder",
    "daily_report",
    "weekly_report",
    "critical_error",
    "budget_warning",
    "budget_exceeded",
    "agent_created",
    "agent_terminated",
    "escalation"
  ],
  "quietHours": {
    "enabled": true,
    "start": "22:00",
    "end": "07:00",
    "exceptFor": ["critical_error", "budget_exceeded"]
  },
  "batching": {
    "enabled": true,
    "maxWait": 5,
    "maxItems": 10
  }
}
\`\`\`

## Response Processing

The system watches for master contact replies:

| Reply Pattern | Action |
|---------------|--------|
| \`APPROVE {id}\` | Approve the approval request |
| \`REJECT {id}\` | Reject the approval request |
| \`BUDGET {amount}\` | Increase daily budget |
| \`PAUSE\` | Pause the agent |
| \`RESUME\` | Resume paused agent |
| \`STATUS\` | Get current status |

## Delivery Confirmation

\`\`\`
1. Notification created
2. Sent to channel
3. Delivery confirmed (if supported)
4. Read receipt (if supported)
5. Response received
6. Action executed
7. Confirmation sent back
\`\`\`
    `,
    keywords: ['notification', 'master', 'contact', 'alert', 'report', 'email', 'whatsapp', 'telegram']
  },

  // ==================== MEMORY SYSTEM ====================
  'memory:system': {
    title: 'Agentic AI Memory System',
    category: 'memory',
    description: 'How Agentic AI stores, retrieves, and manages its own memory separate from RAG knowledge',
    content: `
# Agentic AI Memory System

## Overview

The Memory System is separate from the RAG knowledge base. While RAG stores static knowledge documents, the Memory System captures:
- **Conversations**: Interactions with humans and other AIs
- **Transactions**: Actions taken and their outcomes
- **Decisions**: Choices made with reasoning
- **Learning**: Patterns and insights discovered
- **Context**: Situational information for recall

## Memory Architecture

\`\`\`
┌────────────────────────────────────────────────────────────────────┐
│                    AGENTIC AI MEMORY SYSTEM                         │
│                                                                     │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐ │
│  │  SHORT-TERM     │  │  LONG-TERM      │  │  SEMANTIC           │ │
│  │  (Redis Cache)  │  │  (SQLite)       │  │  (Qdrant Vectors)   │ │
│  │                 │  │                 │  │                     │ │
│  │ • Active session│  │ • All memories  │  │ • Embeddings        │ │
│  │ • Recent context│  │ • Indexed       │  │ • Similarity search │ │
│  │ • Fast access   │  │ • Permanent     │  │ • Context retrieval │ │
│  │ • TTL: 24 hours │  │ • Searchable    │  │ • Semantic links    │ │
│  └────────┬────────┘  └────────┬────────┘  └──────────┬──────────┘ │
│           │                    │                      │            │
│           └────────────────────┴──────────────────────┘            │
│                                │                                    │
│                    ┌───────────▼───────────┐                       │
│                    │  MEMORY CONSOLIDATION  │                       │
│                    │  (Scheduled Process)   │                       │
│                    │                        │                       │
│                    │ • Short → Long-term    │                       │
│                    │ • Expire old memories  │                       │
│                    │ • Merge duplicates     │                       │
│                    │ • Update importance    │                       │
│                    └────────────────────────┘                       │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
\`\`\`

## Memory Types

| Type | Description | Storage | TTL |
|------|-------------|---------|-----|
| **conversation** | Interactions with humans/AIs | Long-term + Vector | 90 days |
| **transaction** | Actions taken and outcomes | Long-term | 365 days |
| **decision** | Choices made with reasoning | Long-term + Vector | 180 days |
| **learning** | Patterns/insights discovered | Long-term + Vector | Permanent |
| **context** | Situational/environmental info | Short-term | 24 hours |
| **entity** | People, places, things referenced | Long-term | 365 days |
| **preference** | User/contact preferences learned | Long-term | Permanent |

## Memory Storage Tables

### agentic_memory (SQLite)
\`\`\`sql
CREATE TABLE agentic_memory (
  id TEXT PRIMARY KEY,
  agentic_id TEXT NOT NULL,           -- Owner agent
  memory_type TEXT NOT NULL,           -- conversation, transaction, decision, etc.
  content TEXT NOT NULL,               -- Memory content (JSON)
  summary TEXT,                        -- Short summary for quick retrieval
  importance REAL DEFAULT 0.5,         -- 0.0-1.0 importance score
  emotional_valence REAL DEFAULT 0.0,  -- -1.0 to 1.0 (negative to positive)
  related_entity_id TEXT,              -- Related contact/agent/task
  related_entity_type TEXT,            -- contact, agent, task, etc.
  session_id TEXT,                     -- Memory session grouping
  created_at DATETIME,
  last_accessed_at DATETIME,
  access_count INTEGER DEFAULT 1,
  expires_at DATETIME,                 -- NULL for permanent
  metadata TEXT                        -- Additional structured data (JSON)
);
\`\`\`

### agentic_memory_vectors (Qdrant)
\`\`\`
Collection: agentic_memory_{agenticId}
Fields:
- id: memory_id
- vector: embedding of content + summary
- payload:
  - memory_type
  - importance
  - created_at
  - related_entity_id
  - session_id
\`\`\`

### agentic_memory_sessions
\`\`\`sql
CREATE TABLE agentic_memory_sessions (
  id TEXT PRIMARY KEY,
  agentic_id TEXT NOT NULL,
  session_type TEXT NOT NULL,          -- conversation, task, day, etc.
  title TEXT,
  started_at DATETIME,
  ended_at DATETIME,
  summary TEXT,                         -- Auto-generated session summary
  memory_count INTEGER DEFAULT 0,
  metadata TEXT
);
\`\`\`

## Storing Memories

### Creating a Memory

\`\`\`json
POST /api/agentic/{agenticId}/memory
{
  "memoryType": "conversation",
  "content": {
    "role": "user",
    "message": "Please reschedule the meeting with ABC Corp",
    "response": "I've rescheduled the meeting to Friday 2 PM",
    "outcome": "successful"
  },
  "summary": "Rescheduled ABC Corp meeting to Friday 2 PM",
  "relatedEntityId": "contact_abc123",
  "relatedEntityType": "contact",
  "importance": 0.7,
  "sessionId": "session_today_001"
}
\`\`\`

### Memory Content Structure by Type

**Conversation Memory:**
\`\`\`json
{
  "participants": ["user_id", "agent_id"],
  "channel": "whatsapp",
  "messages": [...],
  "topic": "Meeting scheduling",
  "sentiment": "positive",
  "resolution": "completed"
}
\`\`\`

**Transaction Memory:**
\`\`\`json
{
  "action": "send_email",
  "target": "client@company.com",
  "payload": {...},
  "result": "success",
  "executionTime": 1250,
  "approvedBy": "master_contact_id"
}
\`\`\`

**Decision Memory:**
\`\`\`json
{
  "decision": "Assigned bug fix to John instead of Sarah",
  "alternatives": ["Sarah", "John", "Mike"],
  "reasoning": "John has 80% match on required skills vs Sarah's 60%",
  "confidence": 0.85,
  "outcome": "Task completed successfully",
  "feedback": "positive"
}
\`\`\`

**Learning Memory:**
\`\`\`json
{
  "insight": "Client ABC Corp prefers morning meetings",
  "evidence": ["email_1", "email_2", "conversation_3"],
  "confidence": 0.9,
  "applicableTo": ["scheduling", "client_communication"]
}
\`\`\`

## Retrieving Memories

### Query by Type and Entity

\`\`\`json
GET /api/agentic/{agenticId}/memory?type=conversation&entityId=contact_abc123&limit=10
\`\`\`

### Semantic Search (Similar Memories)

\`\`\`json
POST /api/agentic/{agenticId}/memory/search
{
  "query": "meetings with ABC Corp",
  "types": ["conversation", "decision"],
  "timeRange": {
    "from": "2026-01-01",
    "to": "2026-02-09"
  },
  "minImportance": 0.5,
  "limit": 20
}
\`\`\`

### Recent Memory Recall

\`\`\`json
GET /api/agentic/{agenticId}/memory/recent?hours=24&types=conversation,transaction
\`\`\`

### Session Memory

\`\`\`json
GET /api/agentic/{agenticId}/memory/session/{sessionId}
\`\`\`

## Memory Importance Scoring

Importance score (0.0 - 1.0) is calculated based on:

| Factor | Weight | Description |
|--------|--------|-------------|
| **Recency** | 0.2 | Recently created = higher importance |
| **Access Frequency** | 0.2 | Often accessed = higher importance |
| **Emotional Valence** | 0.15 | Strong emotions = higher importance |
| **Entity Importance** | 0.15 | Related to VIP/important entity |
| **Outcome Impact** | 0.15 | Significant outcomes = higher |
| **Explicit Boost** | 0.15 | Manually marked as important |

### Importance Update Formula

\`\`\`javascript
function updateImportance(memory) {
  const recencyScore = calculateRecency(memory.created_at);
  const accessScore = Math.min(memory.access_count / 10, 1.0);
  const emotionalScore = Math.abs(memory.emotional_valence);
  const entityScore = getEntityImportance(memory.related_entity_id);
  const outcomeScore = evaluateOutcome(memory.content.outcome);
  const boostScore = memory.metadata.manualBoost || 0;

  return (
    recencyScore * 0.2 +
    accessScore * 0.2 +
    emotionalScore * 0.15 +
    entityScore * 0.15 +
    outcomeScore * 0.15 +
    boostScore * 0.15
  );
}
\`\`\`

## Memory Consolidation

Scheduled process that runs daily to:

1. **Move to Long-Term**: Promote important short-term memories
2. **Expire Old Memories**: Remove memories past expiration
3. **Merge Duplicates**: Combine similar memories
4. **Update Importance**: Recalculate importance scores
5. **Generate Summaries**: Create session/daily summaries

### Consolidation Schedule

\`\`\`json
POST /api/agentic/{agenticId}/schedules
{
  "title": "Memory Consolidation",
  "scheduleType": "cron",
  "cronExpression": "0 3 * * *",
  "actionType": "memory_consolidate",
  "actionConfig": {
    "expireOlderThan": 90,
    "mergeThreshold": 0.85,
    "summarizeSession": true
  }
}
\`\`\`

## Memory Access Control

**CRITICAL**: Only the creator of the Agentic AI can access its memories.

### Access Rules

| Actor | Access Level |
|-------|--------------|
| **Creator (User)** | Full read/write/delete |
| **Agent Self** | Full read/write |
| **Parent Agent** | Read only (for debugging) |
| **Sub-Agents** | No access (inherit capabilities, not memories) |
| **Other Users** | No access |

### API Authorization

\`\`\`javascript
// Middleware check
function authorizeMemoryAccess(req, res, next) {
  const agenticProfile = getAgenticProfile(req.params.agenticId);

  // Only creator can access
  if (agenticProfile.created_by !== req.user.id) {
    return res.status(403).json({
      error: 'Memory access denied',
      message: 'Only the creator can access agent memories'
    });
  }

  next();
}
\`\`\`

## Memory in Self-Prompting

When the Agentic AI initiates a self-prompt, it should:

1. **Recall Context**: Query recent relevant memories
2. **Check History**: Look for similar past situations
3. **Learn from Past**: Review decision outcomes
4. **Apply Learnings**: Use insights in current decision

### Example: Self-Prompt with Memory

\`\`\`
TRIGGER: Received email from ABC Corp

MEMORY RECALL:
- Query: "ABC Corp" recent interactions
- Found: 5 conversations in last 30 days
- Key insights:
  - Prefers morning meetings (learning memory)
  - Last interaction: positive feedback (conversation memory)
  - Pending proposal follow-up (transaction memory)

CONTEXTUALIZED RESPONSE:
"Good morning! Based on our recent conversations, I understand
your preference for morning meetings. The proposal we discussed
on February 5th is still pending your review. Would you like to
schedule a follow-up call this week?"
\`\`\`

## Memory Visualization (Dashboard)

The Agentic AI module dashboard displays:

### Memory Overview
- Total memories by type (pie chart)
- Memory growth over time (line chart)
- Storage usage (short-term vs long-term)

### Memory Timeline
- Chronological view of memories
- Filterable by type, entity, importance
- Expandable details

### Memory Search
- Full-text and semantic search
- Entity relationship explorer
- Session browser

### Memory Health
- Expiring memories alert
- Storage quota usage
- Consolidation history

## Best Practices

1. **Store Meaningful Memories**: Don't store everything, focus on significant interactions
2. **Add Context**: Include enough metadata for later retrieval
3. **Set Appropriate TTL**: Use expiration for transient information
4. **Summarize Sessions**: Create session summaries for quick recall
5. **Update Importance**: Boost memories that prove valuable
6. **Regular Consolidation**: Schedule daily consolidation
7. **Privacy First**: Never share memories across agents or users
8. **Clean Up**: Remove irrelevant or outdated memories
    `,
    keywords: ['memory', 'storage', 'recall', 'session', 'context', 'conversation', 'transaction', 'decision', 'learning', 'consolidation', 'redis', 'sqlite', 'qdrant', 'vector', 'access control']
  },

  // ==================== CONTACT SCOPE ====================
  'security:contact-scope': {
    title: 'Contact Scope & Output Permissions',
    category: 'security',
    description: 'How to configure which contacts the Agentic AI can communicate with',
    content: `
# Contact Scope & Output Permissions

## Overview

Contact Scope is a **security feature** that restricts which contacts the Agentic AI can send messages/emails to. For contacts outside the configured scope, the AI must request permission from the Master Contact (superior).

## Why Contact Scope Matters

Without scope restrictions, an autonomous AI could:
- Contact unauthorized parties
- Send sensitive information to unknown recipients
- Create legal/compliance issues
- Damage business relationships

## Scope Types

| Scope Type | Description | Security Level |
|------------|-------------|----------------|
| \`team_only\` | Only team members configured for this agent | High |
| \`contacts_whitelist\` | Specific contacts added to whitelist | Medium-High |
| \`contacts_tags\` | All contacts with matching tags | Medium |
| \`all_user_contacts\` | Any contact in user's contact list | Low |
| \`unrestricted\` | Can message anyone (DANGEROUS) | None |

## Default Behavior

**CRITICAL RULE:** Out-of-scope contacts ALWAYS require master approval, regardless of autonomy level.

\`\`\`
AI wants to send message → Check recipient in scope?
                                    │
                   YES ─────────────┼──────────── NO
                    │               │              │
                    ▼               │              ▼
           Check autonomy level     │   Create approval request
                    │               │   Send to Master Contact
         ┌──────────┴──────────┐    │   Include:
         │                     │    │   - Recipient info
    "autonomous"        "supervised"│   - Message preview
         │               or "semi"  │   - Reason blocked
         ▼                     │    │
    Send directly              ▼    │
                    Check requireApprovalFor
                               │
                    ┌──────────┴──────────┐
                    │                     │
            Action in list       Action NOT in list
                    │                     │
                    ▼                     ▼
            Queue for approval     Send directly
\`\`\`

## Configuration

\`\`\`json
PUT /api/agentic/{agenticId}/contact-scope
{
  "scopeType": "contacts_whitelist",
  "whitelistContactIds": ["contact_abc123", "contact_def456"],
  "whitelistTags": ["client", "partner"],
  "allowTeamMembers": true,
  "allowMasterContact": true,
  "notifyOnOutOfScope": true,
  "autoAddApproved": false
}
\`\`\`

## Approval for Out-of-Scope Contact

When AI attempts to contact someone outside scope:

\`\`\`
🤖 GM Operation - Out-of-Scope Contact Request

Attempting to send: Email
To: newclient@external.com
Name: Unknown (not in contacts)

Subject: Project Proposal
Preview: "Dear Sir/Madam, We would like to offer..."

Reason blocked: Recipient not in contact whitelist

Reply:
✅ APPROVE 12345 - Allow this once
✅ APPROVE+ADD 12345 - Allow and add to whitelist
❌ REJECT 12345 - Block this message
\`\`\`

## Best Practices

1. **Start with \`team_only\`** - Most restrictive, safest
2. **Add contacts gradually** - Build whitelist over time
3. **Use tags for groups** - e.g., "vip-clients", "vendors"
4. **Enable \`autoAddApproved\`** - Streamlines workflow after trust builds
5. **Review scope log** - Check blocked attempts periodically
6. **Never use \`unrestricted\`** - Unless absolutely necessary with extra safeguards

## Checking Contact Scope

Before sending, check if recipient is allowed:

\`\`\`json
POST /api/agentic/{agenticId}/contact-scope/check
{
  "recipientType": "email",
  "recipientValue": "client@company.com"
}

Response:
{
  "inScope": true,
  "reason": "Contact is in whitelist",
  "contactId": "contact_abc123"
}
\`\`\`

## Security Levels by Autonomy

| Autonomy Level | In-Scope | Out-of-Scope |
|----------------|----------|--------------|
| Supervised | Approval required | Approval required |
| Semi-Autonomous | Auto-send* | Approval required |
| Autonomous | Auto-send | Approval required |

*Unless in \`requireApprovalFor\` list
    `,
    keywords: ['contact', 'scope', 'security', 'whitelist', 'permission', 'output', 'approval', 'restrict', 'allowed']
  },

  // ==================== BACKGROUND INFO ====================
  'profile:background-info': {
    title: 'Agentic AI Background Information',
    category: 'profile',
    description: 'How to configure company/organization background information for the Agentic AI',
    content: `
# Agentic AI Background Information

## Overview

Background Information provides the Agentic AI with essential context about the organization it represents. When someone asks "Who are you?" or "What company is this?", the AI can respond with accurate, configured information.

## Why Background Information Matters

An Agentic AI acting as a representative needs to:
- Answer questions about the company correctly
- Provide accurate contact details
- Represent the brand appropriately
- Give consistent information across all channels

## Background Information Fields

### Company Information

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| \`companyName\` | string | Official company name | "AXICOM SDN BHD" |
| \`companyShortName\` | string | Abbreviated name | "AXICOM" |
| \`companyType\` | string | Legal entity type | "SDN BHD", "LLC", "Inc" |
| \`registrationNumber\` | string | Business registration | "202301012345" |
| \`taxId\` | string | Tax identification | "GST-12345678" |

### Contact Details

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| \`primaryPhone\` | string | Main phone number | "+60-3-1234-5678" |
| \`alternatePhone\` | string | Secondary phone | "+60-3-8765-4321" |
| \`primaryEmail\` | string | Main email address | "info@axicom.com" |
| \`supportEmail\` | string | Support email | "support@axicom.com" |
| \`website\` | string | Official website | "https://www.axicom.com" |

### Address

| Field | Type | Description |
|-------|------|-------------|
| \`address.street\` | string | Street address |
| \`address.city\` | string | City |
| \`address.state\` | string | State/Province |
| \`address.postalCode\` | string | ZIP/Postal code |
| \`address.country\` | string | Country |

### Business Details

| Field | Type | Description |
|-------|------|-------------|
| \`industry\` | string | Industry sector |
| \`description\` | string | Brief company description |
| \`established\` | string | Year established |
| \`employeeCount\` | string | Employee range |
| \`services\` | array | List of services offered |
| \`products\` | array | List of products |

### Social Media

| Field | Type | Description |
|-------|------|-------------|
| \`linkedin\` | string | LinkedIn page URL |
| \`facebook\` | string | Facebook page URL |
| \`twitter\` | string | Twitter/X handle |
| \`instagram\` | string | Instagram handle |

### Operational Hours

| Field | Type | Description |
|-------|------|-------------|
| \`timezone\` | string | Company timezone |
| \`businessHours\` | object | Operating hours by day |
| \`holidays\` | array | Company holidays |

## Configuration API

\`\`\`json
PUT /api/agentic/{agenticId}/background
{
  "companyName": "AXICOM SDN BHD",
  "companyShortName": "AXICOM",
  "companyType": "SDN BHD",
  "registrationNumber": "202301012345",
  "industry": "Software Development",
  "description": "AXICOM is a leading software development company specializing in enterprise solutions, custom applications, and AI-powered systems.",
  "established": "2005",
  "employeeCount": "50-100",
  "services": [
    "Custom Software Development",
    "Enterprise Solutions",
    "AI Integration",
    "Technical Consulting"
  ],
  "address": {
    "street": "Level 15, Tower A, The Hub",
    "city": "Petaling Jaya",
    "state": "Selangor",
    "postalCode": "47800",
    "country": "Malaysia"
  },
  "primaryPhone": "+60-3-1234-5678",
  "primaryEmail": "info@axicom.com",
  "supportEmail": "support@axicom.com",
  "website": "https://www.axicom.com",
  "businessHours": {
    "monday": "09:00-18:00",
    "tuesday": "09:00-18:00",
    "wednesday": "09:00-18:00",
    "thursday": "09:00-18:00",
    "friday": "09:00-17:00",
    "saturday": "closed",
    "sunday": "closed"
  },
  "timezone": "Asia/Kuala_Lumpur",
  "socialMedia": {
    "linkedin": "https://linkedin.com/company/axicom",
    "facebook": "https://facebook.com/axicomtech"
  }
}
\`\`\`

## How AI Uses Background Information

### In System Prompt

Background info is automatically included in the system prompt:

\`\`\`
You are the General Manager of Operations for AXICOM SDN BHD,
a leading software development company based in Petaling Jaya, Malaysia.

Company Overview:
- Established: 2005
- Employees: 50-100
- Industry: Software Development

Services:
- Custom Software Development
- Enterprise Solutions
- AI Integration
- Technical Consulting

Contact:
- Phone: +60-3-1234-5678
- Email: info@axicom.com
- Website: https://www.axicom.com

When asked about the company, provide accurate information
based on the above details.
\`\`\`

### Example Conversations

**User:** "Who are you?"

**AI:** "I'm the General Manager of Operations at AXICOM SDN BHD. We're a software development company based in Petaling Jaya, Malaysia, specializing in custom enterprise solutions and AI integration."

**User:** "What's your company address?"

**AI:** "Our office is located at Level 15, Tower A, The Hub, Petaling Jaya, Selangor 47800, Malaysia."

**User:** "What services do you offer?"

**AI:** "AXICOM offers Custom Software Development, Enterprise Solutions, AI Integration, and Technical Consulting services."

## Inheritance for Sub-Agents

**IMPORTANT:** Background information is configured ONLY at the Master Agent level. All Sub-Agents automatically inherit the same background information.

\`\`\`
┌─────────────────────────────────────────────────────────────────┐
│                    BACKGROUND INHERITANCE                        │
│                                                                  │
│  Master Agent (GM Operation)                                    │
│  └── Background Info: AXICOM SDN BHD                            │
│      │                                                          │
│      ├── Sub-Agent: Email Handler                               │
│      │   └── Inherits: AXICOM SDN BHD background (read-only)   │
│      │                                                          │
│      ├── Sub-Agent: Task Coordinator                            │
│      │   └── Inherits: AXICOM SDN BHD background (read-only)   │
│      │                                                          │
│      └── Sub-Agent: Support Bot                                 │
│          └── Inherits: AXICOM SDN BHD background (read-only)   │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
\`\`\`

**Why single background?**
- All agents represent the SAME organization
- Consistent information across all AI interactions
- No conflicting company details
- Easier maintenance (update in one place)

**API Behavior:**
- \`GET /api/agentic/{subAgentId}/background\` → Returns master's background
- \`PUT /api/agentic/{subAgentId}/background\` → Returns 403 (can only update at master level)

## Best Practices

1. **Keep Information Current** - Update when details change
2. **Be Accurate** - Double-check registration numbers and addresses
3. **Include FAQ Answers** - Common questions about the company
4. **Add Unique Selling Points** - What makes your company special
5. **Update Services/Products** - Keep offerings list current
6. **Set Correct Timezone** - Important for scheduling
7. **Include Emergency Contact** - For urgent out-of-hours issues
    `,
    keywords: ['background', 'company', 'information', 'profile', 'address', 'contact', 'business', 'organization', 'about', 'inherit']
  }
};

/**
 * Format a schema document for RAG ingestion
 */
function formatSchemaDocument(schemaId, schema) {
  const parts = [
    `# ${schema.title}`,
    '',
    `**Category:** ${schema.category}`,
    `**ID:** ${schemaId}`,
    '',
    schema.description,
    '',
    schema.content,
    '',
    '---',
    `Keywords: ${schema.keywords.join(', ')}`,
    `Schema Version: ${SCHEMA_FORMAT_VERSION}`
  ];

  return parts.join('\n');
}

/**
 * Calculate hash of schema for change detection
 */
function calculateSchemaHash(schemas) {
  const content = JSON.stringify(schemas) + SCHEMA_FORMAT_VERSION;
  return crypto.createHash('md5').update(content).digest('hex');
}

/**
 * AgenticSchemaRAG class
 */
class AgenticSchemaRAG {
  constructor() {
    this.initialized = false;
    this.libraryId = null;
    this.folderId = null;
  }

  /**
   * Initialize and sync schemas to RAG
   */
  async initialize() {
    if (this.initialized) return;

    try {
      logger.info('Initializing AgenticSchemaRAG...');

      // Get or create parent library
      const parentLibrary = await this.ensureParentLibrary();

      // Get or create folder
      const folder = await this.ensureFolder(parentLibrary.id);
      this.folderId = folder.id;
      this.libraryId = parentLibrary.id;

      // Check if sync needed
      const needsSync = await this.checkNeedsSync();

      if (needsSync) {
        await this.syncSchemas();
      } else {
        logger.info('AgenticSchemaRAG: Schemas up to date');
      }

      this.initialized = true;
      logger.info('AgenticSchemaRAG initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize AgenticSchemaRAG:', error);
      throw error;
    }
  }

  /**
   * Ensure parent library exists
   */
  async ensureParentLibrary() {
    const db = getDatabase();

    let library = db.prepare(`
      SELECT * FROM knowledge_libraries
      WHERE name = ? AND user_id = ?
    `).get(PARENT_LIBRARY_NAME, SYSTEM_USER_ID);

    if (!library) {
      const id = uuidv4();
      db.prepare(`
        INSERT INTO knowledge_libraries (id, user_id, name, description, created_at, updated_at)
        VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
      `).run(id, SYSTEM_USER_ID, PARENT_LIBRARY_NAME, PARENT_LIBRARY_DESCRIPTION);

      library = { id, name: PARENT_LIBRARY_NAME };
      logger.info(`Created parent library: ${PARENT_LIBRARY_NAME}`);
    }

    return library;
  }

  /**
   * Ensure folder exists in parent library
   */
  async ensureFolder(libraryId) {
    const db = getDatabase();

    let folder = db.prepare(`
      SELECT * FROM knowledge_folders
      WHERE library_id = ? AND name = ?
    `).get(libraryId, FOLDER_NAME);

    if (!folder) {
      const id = uuidv4();
      db.prepare(`
        INSERT INTO knowledge_folders (id, library_id, name, description, created_at, updated_at)
        VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
      `).run(id, libraryId, FOLDER_NAME, FOLDER_DESCRIPTION);

      folder = { id, name: FOLDER_NAME };
      logger.info(`Created folder: ${FOLDER_NAME}`);
    }

    return folder;
  }

  /**
   * Check if schemas need to be synced
   */
  async checkNeedsSync() {
    const db = getDatabase();

    // Get current hash
    const currentHash = calculateSchemaHash(AGENTIC_SCHEMAS);

    // Check stored hash
    const stored = db.prepare(`
      SELECT metadata FROM knowledge_documents
      WHERE folder_id = ? AND title = '_schema_meta'
    `).get(this.folderId);

    if (!stored) return true;

    try {
      const meta = JSON.parse(stored.metadata || '{}');
      return meta.schemaHash !== currentHash;
    } catch {
      return true;
    }
  }

  /**
   * Sync all schemas to RAG
   */
  async syncSchemas() {
    const db = getDatabase();
    const retrieval = getRetrievalService();

    logger.info('Syncing Agentic AI schemas to RAG...');

    // Delete existing documents in folder
    const existingDocs = db.prepare(`
      SELECT id FROM knowledge_documents WHERE folder_id = ?
    `).all(this.folderId);

    for (const doc of existingDocs) {
      await retrieval.deleteDocument(doc.id, this.libraryId);
    }

    // Add schema documents
    let count = 0;
    for (const [schemaId, schema] of Object.entries(AGENTIC_SCHEMAS)) {
      const content = formatSchemaDocument(schemaId, schema);

      // Use ingestDocument which handles both DB insert and vector indexing
      await retrieval.ingestDocument({
        title: schema.title,
        content,
        folderId: this.folderId,
        sourceType: 'system',
        metadata: {
          schemaId,
          category: schema.category,
          keywords: schema.keywords,
          autoGenerated: true
        }
      }, this.libraryId, {
        userId: SYSTEM_USER_ID,
      });

      count++;
    }

    // Store meta document with hash
    const currentHash = calculateSchemaHash(AGENTIC_SCHEMAS);
    db.prepare(`
      INSERT OR REPLACE INTO knowledge_documents (
        id, library_id, folder_id, title, content, content_type,
        source_type, metadata, created_at, updated_at
      ) VALUES (?, ?, ?, '_schema_meta', '', 'meta', 'system', ?, datetime('now'), datetime('now'))
    `).run(
      uuidv4(),
      this.libraryId,
      this.folderId,
      JSON.stringify({ schemaHash: currentHash, syncedAt: new Date().toISOString() })
    );

    logger.info(`Synced ${count} Agentic AI schema documents to RAG`);
  }

  /**
   * Get schema statistics
   */
  getStats() {
    const categories = {};
    let total = 0;

    for (const schema of Object.values(AGENTIC_SCHEMAS)) {
      categories[schema.category] = (categories[schema.category] || 0) + 1;
      total++;
    }

    return {
      total,
      categories,
      version: SCHEMA_FORMAT_VERSION
    };
  }

  /**
   * Force resync
   */
  async resync() {
    this.initialized = false;
    await this.initialize();
    return this.getStats();
  }
}

// Singleton instance
let instance = null;

function getAgenticSchemaRAG() {
  if (!instance) {
    instance = new AgenticSchemaRAG();
  }
  return instance;
}

module.exports = {
  AgenticSchemaRAG,
  getAgenticSchemaRAG,
  AGENTIC_SCHEMAS
};
