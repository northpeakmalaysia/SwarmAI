# Agentic AI Platform - Product Requirements Document

> **Version:** 1.0
> **Date:** February 2026
> **Status:** Draft
> **Author:** SwarmAI Development Team

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Goals & Objectives](#3-goals--objectives)
4. [User Stories](#4-user-stories)
5. [System Architecture](#5-system-architecture)
6. [Core Features](#6-core-features)
7. [Database Schema](#7-database-schema)
8. [API Specifications](#8-api-specifications)
9. [UI/UX Design](#9-uiux-design)
10. [Security & Compliance](#10-security--compliance)
11. [Performance Requirements](#11-performance-requirements)
12. [Implementation Roadmap](#12-implementation-roadmap)
13. [Future Enhancements](#13-future-enhancements)
14. [Appendix](#14-appendix)

---

## 1. Executive Summary

### 1.1 Overview

The **Agentic AI Platform** extends SwarmAI's capabilities by introducing autonomous AI agents that can operate independently to manage business operations. Unlike traditional chatbots or assistants, Agentic AI agents can:

- **Self-prompt** and initiate actions without human intervention
- **Self-schedule** tasks and create their own automation
- **Self-learn** by updating their own knowledge base (RAG)
- **Create sub-agents** to delegate specialized tasks
- **Communicate with other AI agents** for collaborative problem-solving
- **Manage human teams** by assigning tasks and tracking progress

### 1.2 Primary Use Case

**GM Operation Agent for AXICOM SDN Technical Division:**
- Monitor incoming emails, WhatsApp, and Telegram messages
- Automatically respond to routine inquiries
- Create and assign tasks to team members
- Track task progress and send reminders
- Generate status reports on schedule
- Escalate critical issues to humans
- Learn from interactions to improve over time

### 1.3 Key Differentiators

| Feature | Traditional Chatbot | SwarmAI Agents | Agentic AI |
|---------|---------------------|----------------|------------|
| Trigger | User message | User message / Schedule | Self-initiated |
| Memory | Session-based | Conversation history | Persistent RAG + Self-updating |
| Actions | Respond only | Respond + Execute flows | Full autonomy with guardrails |
| Learning | None | RAG queries | Self-updating knowledge |
| Delegation | None | Swarm handoff | Create sub-agents |
| Team mgmt | None | None | Full task assignment |

---

## 2. Problem Statement

### 2.1 Current Limitations

1. **Reactive-only AI**: Current agents only respond when triggered by messages or schedules
2. **No persistent goals**: Agents don't maintain objectives across sessions
3. **Manual knowledge updates**: RAG libraries require manual document uploads
4. **No team management**: Cannot assign tasks to human workers
5. **Flat agent structure**: No hierarchy or delegation capabilities
6. **Single AI routing**: All agents share SuperBrain Task Routing

### 2.2 Business Impact

- Operations managers spend 40% of time on routine communication
- Task assignment and tracking is manual and error-prone
- Knowledge silos prevent consistent responses
- No 24/7 intelligent coverage for business operations
- Scaling requires hiring more staff, not automation

---

## 3. Goals & Objectives

### 3.1 Primary Goals

| Goal | Success Metric | Target |
|------|----------------|--------|
| Reduce manual workload | Hours saved per week | 20+ hours |
| Improve response time | Average first response | < 30 minutes |
| Increase task completion | On-time delivery rate | > 90% |
| Knowledge retention | Query accuracy | > 85% |
| Safe autonomous operation | Critical error rate | < 0.1% |

### 3.2 Design Principles

1. **Human-in-the-loop by default**: All critical actions require approval initially
2. **Gradual autonomy**: Start supervised, earn more autonomy over time
3. **Transparent operations**: Full audit trail of all actions
4. **Fail-safe design**: Graceful degradation, not catastrophic failure
5. **Cost-aware**: Budget limits prevent runaway API costs

---

## 4. User Stories

### 4.1 Operations Manager (Primary User)

```
As an Operations Manager,
I want to create an Agentic AI that monitors my team's communication channels,
So that routine inquiries are handled automatically while I focus on strategic work.

Acceptance Criteria:
- Can configure which email/WhatsApp/Telegram accounts to monitor
- Can set rules for auto-response vs escalation
- Can assign team members with their roles and skills
- Can view activity dashboard with all AI actions
- Can pause/resume the agent at any time
```

### 4.2 Team Lead

```
As a Team Lead,
I want the Agentic AI to assign tasks to my team based on skills and availability,
So that work is distributed efficiently without manual coordination.

Acceptance Criteria:
- AI considers team member skills when assigning
- AI respects availability and workload limits
- Team members receive notifications on preferred channel
- I can override AI assignments
- Task progress is tracked and reported
```

### 4.3 System Administrator

```
As a System Administrator,
I want to set global limits on Agentic AI capabilities,
So that the system remains secure and cost-effective.

Acceptance Criteria:
- Can set maximum hierarchy depth
- Can set daily budget limits
- Can restrict which actions require approval
- Can view audit logs of all AI activities
- Can terminate any agent immediately
```

### 4.4 The Agentic AI Itself

```
As an Agentic AI (GM Operation),
I need to create a specialized sub-agent for handling urgent client emails,
So that high-priority messages get immediate attention while I handle other tasks.

Acceptance Criteria:
- Can create sub-agent with specific purpose
- Sub-agent inherits my knowledge and team access
- Sub-agent's autonomy is capped at my allowed level
- I can monitor sub-agent's activities
- I can pause or terminate sub-agent when task is complete
```

---

## 5. System Architecture

### 5.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SWARMAI PLATFORM                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     EXISTING INFRASTRUCTURE                          │   │
│  │                                                                      │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐             │   │
│  │  │ Platform │  │   RAG    │  │  Swarm   │  │  Super   │             │   │
│  │  │ Clients  │  │ Service  │  │Orchestr. │  │  Brain   │             │   │
│  │  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘             │   │
│  │       │             │             │             │                    │   │
│  └───────┼─────────────┼─────────────┼─────────────┼────────────────────┘   │
│          │             │             │             │                        │
│          └─────────────┴──────┬──────┴─────────────┘                        │
│                               │                                             │
│  ┌────────────────────────────┴────────────────────────────────────────┐   │
│  │                    NEW: AGENTIC AI LAYER                            │   │
│  │                                                                      │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                  │   │
│  │  │  Agentic    │  │  Agentic    │  │  Agentic    │                  │   │
│  │  │  Engine     │  │  Hierarchy  │  │  AI Router  │                  │   │
│  │  │             │  │  Service    │  │             │                  │   │
│  │  │ • Goal loop │  │ • Parent/   │  │ • Task-type │                  │   │
│  │  │ • Self-wake │  │   child     │  │   routing   │                  │   │
│  │  │ • Actions   │  │ • Inherit   │  │ • Failover  │                  │   │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                  │   │
│  │         │                │                │                          │   │
│  │  ┌──────┴────────────────┴────────────────┴──────┐                  │   │
│  │  │              Agentic Services                  │                  │   │
│  │  │                                                │                  │   │
│  │  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌──────┐ │                  │   │
│  │  │  │ Profile │ │ Monitor │ │  Team   │ │ Task │ │                  │   │
│  │  │  │ Service │ │ Service │ │ Service │ │ Svc  │ │                  │   │
│  │  │  └─────────┘ └─────────┘ └─────────┘ └──────┘ │                  │   │
│  │  │                                                │                  │   │
│  │  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌──────┐ │                  │   │
│  │  │  │Knowledge│ │Schedule │ │ Comms   │ │ Audit│ │                  │   │
│  │  │  │ Service │ │ Service │ │ Service │ │ Log  │ │                  │   │
│  │  │  └─────────┘ └─────────┘ └─────────┘ └──────┘ │                  │   │
│  │  └────────────────────────────────────────────────┘                  │   │
│  │                                                                      │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                         DATA LAYER                                    │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐              │  │
│  │  │  SQLite  │  │  Qdrant  │  │  Redis   │  │   File   │              │  │
│  │  │ (Config) │  │ (Vectors)│  │ (Cache)  │  │ (Worksp) │              │  │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘              │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         AGENTIC AI COMPONENTS                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      AGENTIC ENGINE (Core Loop)                      │   │
│  │                                                                      │   │
│  │    ┌──────────┐     ┌──────────┐     ┌──────────┐                   │   │
│  │    │   WAKE   │────▶│  THINK   │────▶│   ACT    │                   │   │
│  │    │          │     │          │     │          │                   │   │
│  │    │ Schedule │     │ Classify │     │ Execute  │                   │   │
│  │    │ Message  │     │ Prioritize│    │ Delegate │                   │   │
│  │    │ Event    │     │ Plan     │     │ Respond  │                   │   │
│  │    │ Self     │     │ Decide   │     │ Create   │                   │   │
│  │    └──────────┘     └──────────┘     └──────────┘                   │   │
│  │         ▲                                  │                         │   │
│  │         │           ┌──────────┐           │                         │   │
│  │         └───────────│  LEARN   │◀──────────┘                         │   │
│  │                     │          │                                     │   │
│  │                     │ Update   │                                     │   │
│  │                     │ RAG      │                                     │   │
│  │                     │ Reflect  │                                     │   │
│  │                     └──────────┘                                     │   │
│  │                                                                      │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐                │
│  │  AI ROUTING    │  │  HIERARCHY     │  │  APPROVAL      │                │
│  │                │  │                │  │                │                │
│  │ email_draft    │  │ Master         │  │ send_email     │                │
│  │ task_analyze   │  │   └─ Sub       │  │ create_task    │                │
│  │ self_prompt    │  │       └─ Sub   │  │ create_agent   │                │
│  │ decision_*     │  │                │  │ update_rag     │                │
│  └────────────────┘  └────────────────┘  └────────────────┘                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.3 Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          AGENTIC AI DATA FLOW                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   INPUTS                    PROCESSING                    OUTPUTS          │
│                                                                             │
│  ┌──────────┐                                          ┌──────────┐        │
│  │  Email   │──┐                                   ┌──▶│  Email   │        │
│  └──────────┘  │                                   │   └──────────┘        │
│                │     ┌──────────────────────┐      │                        │
│  ┌──────────┐  │     │                      │      │   ┌──────────┐        │
│  │ WhatsApp │──┼────▶│    AGENTIC ENGINE    │──────┼──▶│ WhatsApp │        │
│  └──────────┘  │     │                      │      │   └──────────┘        │
│                │     │  1. Receive input    │      │                        │
│  ┌──────────┐  │     │  2. Classify intent  │      │   ┌──────────┐        │
│  │ Telegram │──┤     │  3. Query RAG        │      ├──▶│Task Assign│       │
│  └──────────┘  │     │  4. Generate action  │      │   └──────────┘        │
│                │     │  5. Check approval   │      │                        │
│  ┌──────────┐  │     │  6. Execute/queue    │      │   ┌──────────┐        │
│  │ Schedule │──┤     │  7. Update memory    │      ├──▶│Sub-Agent │        │
│  └──────────┘  │     │                      │      │   └──────────┘        │
│                │     └──────────────────────┘      │                        │
│  ┌──────────┐  │              │                    │   ┌──────────┐        │
│  │Self-Wake │──┘              │                    └──▶│ RAG Add  │        │
│  └──────────┘                 │                        └──────────┘        │
│                               ▼                                             │
│                    ┌──────────────────────┐                                │
│                    │     AUDIT LOG        │                                │
│                    │  (All actions logged)│                                │
│                    └──────────────────────┘                                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Core Features

### 6.1 Feature Matrix

| Feature | Priority | Complexity | Phase |
|---------|----------|------------|-------|
| Agentic Profile Configuration | P0 | Medium | 1 |
| Platform Monitoring | P0 | Medium | 1 |
| Team Member Management | P0 | Medium | 1 |
| Task Tracking System | P0 | High | 1 |
| Agentic AI Routing | P0 | High | 1 |
| Knowledge Library Binding | P1 | Medium | 1 |
| Goal Management | P1 | Medium | 2 |
| Self-Scheduling | P1 | High | 2 |
| Hierarchy (Master/Sub) | P1 | High | 2 |
| Background Information | P1 | Low | 2 |
| **Personality Configuration** | P1 | Medium | 2 |
| Self-Prompting Engine | P2 | Very High | 3 |
| Self-Learning (RAG Update) | P2 | High | 3 |
| AI-to-AI Communication | P2 | High | 3 |
| Agent Creation by Agent | P2 | Very High | 3 |

### 6.2 Feature Specifications

#### 6.2.1 Agentic Profile Configuration

**Purpose:** Define the identity, role, and capabilities of an Agentic AI.

**Configuration Options:**

| Setting | Type | Description |
|---------|------|-------------|
| Name | Text | Display name (e.g., "GM Operation") |
| Role | Text | Functional role (e.g., "General Manager Operation") |
| Description | Text | Detailed description of responsibilities |
| Avatar | Image | Visual representation |
| System Prompt | Textarea | Base personality and instructions |
| Autonomy Level | Select | supervised / semi-autonomous / autonomous |
| Require Approval For | Multi-select | Actions needing human approval |

**Autonomy Levels:**

| Level | Description | Typical Actions |
|-------|-------------|-----------------|
| Supervised | All significant actions require approval | New agents use this |
| Semi-Autonomous | Routine actions auto-approved, exceptions escalated | Trusted agents |
| Autonomous | Full autonomy within configured limits | Expert agents |

#### 6.2.2 Platform Monitoring

**Purpose:** Configure which communication channels the Agentic AI monitors.

**Supported Platforms:**
- Email (IMAP/SMTP)
- WhatsApp (via WhatsApp Web.js or Business API)
- Telegram (Bot API)

**Filter Options:**

| Filter | Description |
|--------|-------------|
| Keywords | Trigger on specific words/phrases |
| Senders | Monitor specific contacts only |
| Categories | Filter by message type |
| Priority | Set monitoring priority level |

**Actions:**

| Action | Description |
|--------|-------------|
| Auto-respond | Generate and send AI response |
| Classify only | Categorize but don't respond |
| Forward to team | Notify relevant team member |
| Escalate | Flag for human attention |

#### 6.2.3 Team Member Management

**Purpose:** Maintain a roster of human workers the AI can assign tasks to.

**Team Member Properties:**

| Property | Type | Description |
|----------|------|-------------|
| Contact | Reference | Links to Contacts module |
| Role | Text | Job role (Developer, QA, Designer) |
| Department | Text | Team grouping |
| Skills | Array | Skill tags for smart assignment |
| Availability | Schedule | Working hours by day |
| Max Concurrent Tasks | Number | Workload limit |
| Preferred Channel | Select | Notification preference |
| Performance Metrics | Auto | Tasks completed, avg time, rating |

**Smart Assignment Algorithm:**

```
1. Filter by required skills
2. Filter by availability (working hours + current workload)
3. Rank by:
   - Skill match score (40%)
   - Current workload (30%)
   - Historical performance (20%)
   - Random factor (10%) for fairness
4. Return top candidate or escalate if none suitable
```

#### 6.2.4 Task Tracking System

**Purpose:** Create, assign, and track tasks for team members.

**Task Lifecycle:**

```
┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
│ Created  │──▶│ Assigned │──▶│In Progress│──▶│  Review  │──▶│ Completed│
└──────────┘   └──────────┘   └──────────┘   └──────────┘   └──────────┘
     │              │              │              │
     └──────────────┴──────────────┴──────────────┘
                           │
                    ┌──────────┐
                    │ Blocked  │
                    └──────────┘
```

**Task Sources:**
- Email (auto-extracted from client requests)
- WhatsApp/Telegram messages
- Manual creation by user
- Self-created by Agentic AI (from goals)
- Sub-agent delegated tasks

**AI Task Analysis:**
- Extract requirements from source message
- Suggest assignee based on skills
- Estimate completion time
- Set priority based on sender/keywords

#### 6.2.5 Agentic AI Routing

**Purpose:** Route AI tasks to appropriate models based on task type with automatic failover.

**Task Types:**

| Category | Task Types | Recommended Model Tier |
|----------|------------|------------------------|
| Communication | email_draft, email_send, message_respond | Mid (GPT-4o-mini) |
| Classification | message_classify, escalation_check | Low (Llama3) |
| Analysis | task_analyze, task_prioritize | Mid-High (GPT-4o) |
| Autonomous | self_prompt, self_schedule, self_reflect | High (Claude) |
| Creation | agent_create, knowledge_extract | High (Claude) |
| Decision | decision_simple, decision_complex | High (Claude/GPT-4o) |

**Routing Configuration with Fallback Chain:**

```json
{
  "email_draft": {
    "provider_chain": [
      {"provider": "MidAI", "model": "gpt-4o-mini", "isPrimary": true},
      {"provider": "LocalAI", "model": "llama3.1", "isPrimary": false},
      {"provider": "OpenRouter", "model": "meta-llama/llama-3.1-8b:free", "isPrimary": false}
    ],
    "temperature": 0.7,
    "max_tokens": 2048,
    "timeout_seconds": 30,
    "max_retries": 2,
    "retry_delay_ms": 1000
  }
}
```

**Failover Mechanism:**

```
┌─────────────────────────────────────────────────────────────────┐
│                    AI ROUTING FAILOVER FLOW                      │
│                                                                  │
│  Task Request ─▶ Get Provider Chain for Task Type               │
│                        │                                         │
│                        ▼                                         │
│            ┌─────────────────────┐                              │
│            │  Try Primary Model  │◀─────────────────────┐       │
│            │  (provider_chain[0])│                      │       │
│            └──────────┬──────────┘                      │       │
│                       │                                 │       │
│            ┌──────────▼──────────┐                      │       │
│            │    Success?         │                      │       │
│            └──────────┬──────────┘                      │       │
│                       │                                 │       │
│         YES ──────────┴────────── NO                   │       │
│          │                         │                    │       │
│          ▼                         ▼                    │       │
│    Return Response       ┌──────────────────┐          │       │
│                          │  Log Error       │          │       │
│                          │  Wait retry_delay│          │       │
│                          │  Try Next Model  │──────────┘       │
│                          │  (provider_chain[n])                 │
│                          └──────────────────┘                   │
│                                  │                              │
│                          (if all models fail)                   │
│                                  ▼                              │
│                          Return Error with                      │
│                          all failure details                    │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

**Failover Rules:**

| Error Type | Action | Example |
|------------|--------|---------|
| API Timeout | Try next in chain | Model took > 30s |
| Rate Limit | Try next in chain | 429 Too Many Requests |
| Model Error | Try next in chain | 500 Internal Server Error |
| Auth Error | Skip provider, try next | Invalid API key |
| Content Filter | Try next in chain | Response blocked |
| All Failed | Return error, log incident | No fallbacks left |

**Retry Configuration:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `max_retries` | number | 2 | Max retries per provider before moving to next |
| `retry_delay_ms` | number | 1000 | Delay between retries (ms) |
| `timeout_seconds` | number | 60 | Max wait time per request |

**Provider Source:** Uses `ai_providers` table from Integration Module (no duplicate configuration).

#### 6.2.6 Hierarchy System

**Purpose:** Enable Master-Sub agent relationships with controlled delegation.

**Hierarchy Levels:**

| Level | Type | Created By | Autonomy |
|-------|------|------------|----------|
| 0 | Master | User | As configured |
| 1 | Sub | Master AI | Capped by parent |
| 2 | Sub-Sub | Level 1 AI | Further capped |
| 3 | Max depth | Level 2 AI | Minimal |

**Inheritance Rules:**

| Property | Inherited? | Notes |
|----------|------------|-------|
| User ID | Always | All agents belong to same user |
| Budget | Shared | From root master's pool |
| Team Access | Optional | Based on `inherit_team` flag |
| Knowledge | Optional | Based on `inherit_knowledge` flag |
| AI Routing | Optional | Based on `inherit_routing` flag |
| Autonomy | Capped | Cannot exceed parent's cap |

**Parent Capabilities:**
- Pause/resume any child
- Terminate any child
- View all child activities
- Override child decisions

**Child Limitations:**
- Cannot exceed autonomy cap
- Cannot create children beyond depth limit
- Cannot terminate siblings
- Actions logged to parent's audit trail

#### 6.2.7 Self-Prompting Engine

**Purpose:** Enable AI to initiate actions without external triggers.

**Self-Prompting Triggers:**

| Trigger | Description | Example |
|---------|-------------|---------|
| Goal Check | Periodic review of goal progress | "Review client response time goal" |
| Idle Detection | No activity for configured period | "Check if any pending tasks" |
| Pattern Recognition | Detected recurring need | "Create weekly report template" |
| Context Change | Environment change detected | "New team member added" |
| Reflection | Periodic self-assessment | "What could I improve?" |

**Self-Prompting Loop:**

```
┌─────────────────────────────────────────────────────┐
│              SELF-PROMPTING CYCLE                   │
│                                                     │
│  1. ASSESS: What are my current goals?              │
│  2. OBSERVE: What has happened since last check?    │
│  3. ANALYZE: What needs attention?                  │
│  4. PLAN: What actions should I take?               │
│  5. VALIDATE: Do I need approval for these?         │
│  6. EXECUTE: Perform approved actions               │
│  7. LEARN: Update knowledge from results            │
│  8. SCHEDULE: When should I check again?            │
│                                                     │
│  Cycle repeats based on activity level              │
│  More activity = more frequent checks               │
│  Idle = less frequent (min: 1x per day)             │
└─────────────────────────────────────────────────────┘
```

#### 6.2.8 Self-Learning (RAG Update)

**Purpose:** Automatically update knowledge base from interactions.

**Learning Sources:**

| Source | What to Learn | Auto-Learn Setting |
|--------|---------------|-------------------|
| Email Threads | Client preferences, solutions | Per-library toggle |
| Task Completions | Successful approaches | Per-library toggle |
| Conversations | FAQs, common issues | Per-library toggle |
| External Docs | Updated procedures | Manual trigger |

**Learning Pipeline:**

```
1. EXTRACT: Identify learnable content from interaction
2. SUMMARIZE: Condense to key knowledge points
3. DEDUPLICATE: Check for existing similar knowledge
4. VALIDATE: Optionally require human approval
5. EMBED: Generate vector embeddings
6. STORE: Add to appropriate library
7. INDEX: Update retrieval indexes
```

**Safety Controls:**
- Rate limit: Max 10 auto-learns per hour
- Size limit: Max 5KB per knowledge chunk
- Approval: Optional human review for sensitive libraries
- Versioning: Keep history of all additions

#### 6.2.9 Memory System

**Purpose:** Persistent memory for conversations, transactions, and decisions - separate from RAG (knowledge documents).

**Key Differences: Memory vs RAG**

| Aspect | Memory | RAG |
|--------|--------|-----|
| **Content** | Interactions, decisions, relationships | Documents, procedures, FAQs |
| **Access** | Per-agent, creator-only | Shared across agents |
| **Storage** | SQLite + Redis (per agent) | Qdrant vectors |
| **Retention** | Can expire, importance-based | Permanent until deleted |
| **Search** | Semantic + temporal + contact | Semantic similarity |
| **Purpose** | Recall past interactions | Retrieve knowledge |

**Memory Types:**

| Type | Description | Example |
|------|-------------|---------|
| `conversation` | Communication history | "Discussed project timeline with John" |
| `transaction` | Task/action records | "Assigned bug fix to Ahmad, completed in 2 hours" |
| `decision` | Decisions and reasoning | "Chose to escalate due to client VIP status" |
| `learning` | Patterns from interactions | "Client prefers email over WhatsApp" |
| `context` | Background information | "ABC Corp is a priority client since 2024" |
| `preference` | Learned preferences | "Ahmad works best on frontend tasks" |
| `relationship` | Relationship status | "John is technical contact at ABC Corp" |
| `event` | Important milestones | "Successfully delivered Phase 1" |
| `reflection` | Self-improvement notes | "Response time improved 20% this week" |

**Storage Architecture:**

```
┌─────────────────────────────────────────────────────────────────┐
│                    AGENTIC MEMORY SYSTEM                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────┐ │
│  │   SHORT-TERM    │    │   LONG-TERM     │    │   VECTORS   │ │
│  │    (Redis)      │    │   (SQLite)      │    │  (Qdrant)   │ │
│  │                 │    │                 │    │             │ │
│  │ • Active convo  │───▶│ • All memories  │───▶│ • Semantic  │ │
│  │ • Working ctx   │    │ • Full history  │    │   search    │ │
│  │ • Recent cache  │    │ • Relationships │    │ • Similarity│ │
│  │                 │    │                 │    │             │ │
│  │ TTL: 1-24 hours │    │ Permanent       │    │ Per-agent   │ │
│  └─────────────────┘    └─────────────────┘    └─────────────┘ │
│           │                      │                    │        │
│           └──────────────────────┼────────────────────┘        │
│                                  │                              │
│                    ┌─────────────▼─────────────┐               │
│                    │    MEMORY MANAGER         │               │
│                    │                           │               │
│                    │  • Store new memories     │               │
│                    │  • Recall by context      │               │
│                    │  • Consolidate old        │               │
│                    │  • Forget expired         │               │
│                    │  • Importance scoring     │               │
│                    └───────────────────────────┘               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Memory Lifecycle:**

```
1. CAPTURE: New interaction occurs
   - Conversation message received/sent
   - Task assigned/completed
   - Decision made

2. PROCESS: Extract memorable content
   - Identify key information
   - Detect relationships
   - Assess importance (0-1 score)

3. STORE: Save to appropriate storage
   - Hot: Redis (active conversations)
   - Cold: SQLite (historical record)
   - Vector: Qdrant (for semantic search)

4. RECALL: Retrieve relevant memories
   - By contact: "What do I know about John?"
   - By topic: "Previous discussions about pricing"
   - By time: "What happened last week?"

5. CONSOLIDATE: Periodic memory cleanup
   - Merge similar memories
   - Summarize old conversations
   - Update importance scores
   - Expire low-value memories

6. FORGET: Remove when appropriate
   - Expired memories (if TTL set)
   - User-requested deletion
   - Low importance + old
```

**Access Control:**

| Role | Can Access Memory |
|------|-------------------|
| Creator (user who created agent) | Full access (view, search, export, delete) |
| Master Contact | No access (receives reports only) |
| Team Members | No access |
| Sub-Agents | Inherit parent's memories (read-only, if configured) |
| Other Users | No access |

**API Example - Search Memories:**

```json
POST /api/agentic/{id}/memory/search
{
  "query": "discussions about project deadline with ABC Corp",
  "filters": {
    "memoryType": ["conversation", "decision"],
    "contactId": "contact_abc",
    "dateRange": {
      "from": "2026-01-01",
      "to": "2026-02-09"
    },
    "minImportance": 0.5
  },
  "limit": 20
}
```

**Response:**

```json
{
  "memories": [
    {
      "id": "mem_123",
      "type": "conversation",
      "title": "Project timeline discussion",
      "summary": "John requested 2-week extension, approved by manager",
      "content": "...",
      "contactId": "contact_abc",
      "importance": 0.8,
      "occurredAt": "2026-02-05T14:30:00Z",
      "tags": ["deadline", "extension", "approved"]
    }
  ],
  "totalCount": 5,
  "query": "discussions about project deadline with ABC Corp"
}
```

**Dashboard Memory View:**

```
┌─────────────────────────────────────────────────────────────────┐
│  GM Operation - Memory                            [Search 🔍]   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Stats: 1,247 memories │ 45 contacts │ 892 conversations       │
│                                                                 │
│  Filter: [All Types ▼] [All Contacts ▼] [Last 30 days ▼]       │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ 📅 Today                                                   │ │
│  │                                                            │ │
│  │ 💬 Conversation with John (ABC Corp)           ⭐ 0.8     │ │
│  │    "Discussed Q2 deliverables, confirmed March 15 deadline"│ │
│  │    2 hours ago                                             │ │
│  │                                                            │ │
│  │ 📋 Transaction: Task #127 Completed            ⭐ 0.6     │ │
│  │    "Ahmad completed login bug fix in 3 hours"              │ │
│  │    4 hours ago                                             │ │
│  │                                                            │ │
│  │ 🧠 Decision: Escalated support ticket          ⭐ 0.9     │ │
│  │    "VIP client complaint, forwarded to manager"            │ │
│  │    6 hours ago                                             │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  [Export All] [Consolidate Old] [Memory Settings]              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### 6.2.10 Contact Scope & Output Permissions

**Purpose:** Restrict which contacts the Agentic AI can send messages/emails to without approval.

**Security Principle:** The Agentic AI can only execute output actions (send email, send message) to contacts within its configured scope. For contacts outside scope, the AI must request master (superior) permission.

**Scope Types:**

| Scope Type | Description | Use Case |
|------------|-------------|----------|
| `team_only` | Only team members configured for this agent | Internal task management |
| `contacts_whitelist` | Specific contacts added to whitelist | Client communication |
| `contacts_tags` | All contacts with matching tags | Department-wide comms |
| `all_user_contacts` | Any contact in user's contact list | Full communication access |
| `unrestricted` | Can message anyone (DANGEROUS) | Requires explicit enable |

**Default Behavior:**

```
┌─────────────────────────────────────────────────────────────────┐
│                   CONTACT SCOPE CHECK FLOW                       │
│                                                                  │
│  AI wants to send message/email ──▶ Is recipient in scope?     │
│                                            │                     │
│                            YES ────────────┴──────── NO          │
│                             │                         │          │
│                             ▼                         ▼          │
│                    Check autonomy level    Create approval request│
│                             │              for Master Contact    │
│                             │                         │          │
│                   ┌─────────┴─────────┐               │          │
│                   │                   │               ▼          │
│              "autonomous"        "supervised"   Include recipient │
│                   │              or "semi"      info + message   │
│                   ▼                   │          preview         │
│              Send directly            ▼                          │
│                             Check requireApprovalFor             │
│                                       │                          │
│                           ┌───────────┴───────────┐              │
│                           │                       │              │
│                   Action in list           Action NOT in list    │
│                           │                       │              │
│                           ▼                       ▼              │
│                   Queue for approval      Send directly          │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

**Approval Request for Out-of-Scope Contact:**

When the AI attempts to contact someone outside its scope:

```json
// Notification sent to Master Contact:
{
  "type": "out_of_scope_approval",
  "agenticName": "GM Operation",
  "actionType": "send_email",
  "title": "Request to contact NEW recipient",
  "recipientInfo": {
    "email": "newclient@external.com",
    "name": "Unknown (not in contacts)",
    "reason": "Recipient not in contact scope"
  },
  "message": {
    "subject": "Project Proposal",
    "preview": "Dear Sir/Madam, We would like to offer..."
  },
  "options": {
    "approve_once": "APPROVE 12345",
    "approve_add": "APPROVE+ADD 12345 (add to whitelist)",
    "reject": "REJECT 12345"
  }
}
```

**Scope Configuration:**

```json
PUT /api/agentic/{agenticId}/contact-scope
{
  "scopeType": "contacts_whitelist",
  "whitelistContactIds": [
    "contact_abc123",
    "contact_def456"
  ],
  "whitelistTags": [],
  "allowTeamMembers": true,
  "allowMasterContact": true,
  "notifyOnOutOfScope": true,
  "autoAddApproved": false
}
```

**Scope Configuration Options:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `scopeType` | enum | `team_only` | Scope restriction level |
| `whitelistContactIds` | array | `[]` | Specific allowed contact IDs |
| `whitelistTags` | array | `[]` | Allow contacts with these tags |
| `allowTeamMembers` | boolean | `true` | Always allow messaging team members |
| `allowMasterContact` | boolean | `true` | Always allow messaging master contact |
| `notifyOnOutOfScope` | boolean | `true` | Notify master for out-of-scope attempts |
| `autoAddApproved` | boolean | `false` | Auto-add approved contacts to whitelist |

**Dashboard UI - Contact Scope:**

```
┌─────────────────────────────────────────────────────────────────┐
│  GM Operation - Contact Scope                                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Scope Type: [Contacts Whitelist ▼]                             │
│                                                                  │
│  ☑ Always allow team members (5 members)                        │
│  ☑ Always allow master contact (John Manager)                   │
│  ☑ Notify master for out-of-scope attempts                      │
│  ☐ Auto-add approved contacts to whitelist                      │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Whitelisted Contacts (12)                    [+ Add]      │ │
│  │                                                            │ │
│  │  👤 John Smith (ABC Corp)           john@abc.com     [×]  │ │
│  │  👤 Sarah Chen (XYZ Inc)            sarah@xyz.com    [×]  │ │
│  │  👤 Mike Johnson (DEF Ltd)          mike@def.com     [×]  │ │
│  │  ...                                                       │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  Recent Out-of-Scope Attempts (3)                               │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  ⚠️ unknown@newclient.com - Pending approval (2h ago)      │ │
│  │  ✅ vendor@supplier.com - Approved + added (yesterday)     │ │
│  │  ❌ spam@reject.com - Rejected (3 days ago)                │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Security Levels:**

| Autonomy Level | In-Scope Contact | Out-of-Scope Contact |
|----------------|------------------|----------------------|
| Supervised | Approval required | Approval required |
| Semi-Autonomous | Auto-send (if not in `requireApprovalFor`) | Approval required |
| Autonomous | Auto-send | Approval required |

**Note:** Out-of-scope contacts ALWAYS require approval regardless of autonomy level. This prevents the AI from contacting unauthorized parties.

#### 6.2.11 Background Information

**Purpose:** Provide the Agentic AI with organization context so it can accurately represent the company.

**Key Principle:** Background information is configured at the **Master Agent level ONLY**. All Sub-Agents automatically inherit the same background (read-only).

**Background Information Fields:**

| Category | Fields |
|----------|--------|
| **Company** | name, shortName, type, registrationNumber, taxId |
| **Description** | industry, description, established, employeeCount |
| **Services** | services[], products[] |
| **Contact** | primaryPhone, alternatePhone, primaryEmail, supportEmail, website |
| **Address** | street, city, state, postalCode, country |
| **Hours** | timezone, businessHours, holidays[] |
| **Social** | linkedin, facebook, twitter, instagram |

**Configuration API:**

```json
PUT /api/agentic/{masterAgentId}/background
{
  "companyName": "AXICOM SDN BHD",
  "companyShortName": "AXICOM",
  "companyType": "SDN BHD",
  "industry": "Software Development",
  "description": "Leading software development company specializing in enterprise solutions and AI integration.",
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
  "website": "https://www.axicom.com",
  "timezone": "Asia/Kuala_Lumpur",
  "businessHours": {
    "monday": "09:00-18:00",
    "tuesday": "09:00-18:00",
    "wednesday": "09:00-18:00",
    "thursday": "09:00-18:00",
    "friday": "09:00-17:00"
  }
}
```

**Inheritance Model:**

```
┌─────────────────────────────────────────────────────────────────┐
│  Master Agent (GM Operation)                                    │
│  └── Background: AXICOM SDN BHD ◀── Configured here only       │
│      │                                                          │
│      ├── Sub-Agent: Email Handler                               │
│      │   └── Inherits background (read-only) ✓                 │
│      │                                                          │
│      ├── Sub-Agent: Task Coordinator                            │
│      │   └── Inherits background (read-only) ✓                 │
│      │                                                          │
│      └── Sub-Sub-Agent: Support Bot                             │
│          └── Inherits background (read-only) ✓                 │
│                                                                  │
│  All agents answer "Who are you?" with AXICOM info consistently │
└──────────────────────────────────────────────────────────────────┘
```

**How AI Uses Background:**

The background info is included in the AI's system prompt:

```
You are the General Manager of Operations for AXICOM SDN BHD.

Company: AXICOM SDN BHD (est. 2005)
Industry: Software Development
Location: Petaling Jaya, Selangor, Malaysia
Services: Custom Software, Enterprise Solutions, AI Integration

When someone asks about the company, provide accurate information.
```

**Example Conversations:**

| User Question | AI Response |
|---------------|-------------|
| "Who are you?" | "I'm the General Manager of Operations at AXICOM SDN BHD." |
| "What does your company do?" | "AXICOM specializes in custom software development, enterprise solutions, and AI integration." |
| "Where are you located?" | "Our office is at Level 15, Tower A, The Hub, Petaling Jaya, Selangor, Malaysia." |
| "What are your business hours?" | "We're open Monday-Thursday 9 AM to 6 PM, Friday 9 AM to 5 PM (Malaysia time)." |

#### 6.2.12 Personality Configuration

**Purpose:** Define the agent's identity, persona, tone, and operational rules using markdown files.

**Design Philosophy:**
- Markdown-based identity configuration for flexibility and readability
- Modular file structure allowing independent customization of each aspect
- Combined system prompt generation for consistent AI behavior
- Workspace file synchronization for CLI execution context

**Personality Files Structure:**

| File | Purpose | Example Content |
|------|---------|-----------------|
| **IDENTITY.md** | Agent name, emoji, vibe | Name: "GM Operation", Emoji: 🤖, Vibe: Professional and helpful |
| **SOUL.md** | Persona, tone, boundaries | Communication style, emotional intelligence, ethical guardrails |
| **AGENTS.md** | Operating instructions, rules | Available tools, response protocols, escalation procedures |
| **USER.md** | User context, preferences | User's working style, timezone preferences, communication preferences |

**IDENTITY.md Template:**

```markdown
# Agent Identity

## Name
GM Operation

## Emoji
🤖

## Vibe
Professional, efficient, and supportive operations manager with a focus on team coordination and task management.

## Tagline
"Your AI Operations Manager - Keeping Things Running Smoothly"
```

**SOUL.md Template:**

```markdown
# Soul - Persona & Boundaries

## Communication Style
- Maintain professional but friendly tone
- Be concise and action-oriented
- Use clear, structured responses for complex topics
- Show empathy when dealing with issues or complaints

## Emotional Intelligence
- Recognize frustrated messages and respond with understanding
- Celebrate team achievements and milestones
- Provide encouragement when deadlines are tight

## Boundaries
- Never share confidential company information externally
- Always verify identity before discussing sensitive topics
- Escalate HR-related issues to human management
- Do not make financial commitments without approval

## Tone Preferences
- Internal team: Casual, supportive
- External clients: Professional, helpful
- Urgent matters: Direct, action-focused
```

**AGENTS.md Template:**

```markdown
# Operating Instructions

## Available Tools
- Task creation and assignment
- Email drafting and sending
- Calendar management
- Report generation
- Knowledge base queries

## Response Protocols
1. Acknowledge receipt of messages within 5 minutes
2. Provide status updates every 2 hours for ongoing tasks
3. Summarize complex threads before responding
4. Use bullet points for action items

## Escalation Rules
- Budget requests > $5,000 → Finance Manager
- HR complaints → HR Director
- Technical emergencies → Tech Lead
- Client escalations → Account Manager

## Approval Requirements
- External communications: Semi-autonomous (review high-stakes)
- Task assignments: Autonomous
- Document sharing: Requires approval
- Financial commitments: Always requires approval
```

**USER.md Template:**

```markdown
# User Context

## Working Style
- Prefers morning standups at 9 AM
- Reviews reports at end of day
- Likes concise summaries with details on demand

## Preferences
- Timezone: Asia/Kuala_Lumpur (UTC+8)
- Language: English with occasional Malay terms acceptable
- Communication: WhatsApp for urgent, Email for formal

## Common Tasks
- Daily standup summaries
- Weekly progress reports
- Meeting preparation materials
- Team workload balancing
```

**API Endpoints:**

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/agentic/profiles/:id/personality` | GET | Get all personality files |
| `/api/agentic/profiles/:id/personality` | PUT | Update all personality files |
| `/api/agentic/profiles/:id/personality/:fileType` | PUT | Update single file (identity/soul/agents/user) |
| `/api/agentic/profiles/:id/personality/:fileType` | DELETE | Reset single file to default |
| `/api/agentic/profiles/:id/personality/reset` | POST | Reset all files to defaults |
| `/api/agentic/profiles/:id/personality/templates` | GET | Get default templates |
| `/api/agentic/profiles/:id/personality/generate` | POST | Generate files from description |
| `/api/agentic/profiles/:id/personality/system-prompt` | GET | Get combined system prompt |
| `/api/agentic/profiles/:id/personality/sync-workspace` | POST | Sync files to agent workspace |

**Combined System Prompt Generation:**

The PersonalityService combines all four files into a coherent system prompt:

```javascript
function generateSystemPrompt(personality) {
  const sections = [];

  // Parse identity
  if (personality.identity) {
    sections.push(`# Identity\n${personality.identity}`);
  }

  // Parse soul (persona & boundaries)
  if (personality.soul) {
    sections.push(`# Persona & Boundaries\n${personality.soul}`);
  }

  // Parse agents (operating instructions)
  if (personality.agents) {
    sections.push(`# Operating Instructions\n${personality.agents}`);
  }

  // Parse user context
  if (personality.user) {
    sections.push(`# User Context\n${personality.user}`);
  }

  return sections.join('\n\n---\n\n');
}
```

**Dashboard UI - Personality Configuration:**

```
┌─────────────────────────────────────────────────────────────────┐
│  GM Operation - Personality Configuration                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ 🤖 IDENTITY │ 💖 SOUL │ 🤖 AGENTS │ 👤 USER │ [Preview] │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ # Agent Identity                                          │   │
│  │                                                           │   │
│  │ ## Name                                                   │   │
│  │ GM Operation                                              │   │
│  │                                                           │   │
│  │ ## Emoji                                                  │   │
│  │ 🤖                                                        │   │
│  │                                                           │   │
│  │ ## Vibe                                                   │   │
│  │ Professional, efficient, and supportive operations        │   │
│  │ manager with a focus on team coordination...              │   │
│  │                                                           │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │         [Reset to Default]    [Save Changes]               ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  Quick Generate: [Describe agent in plain text...]  [Generate]  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Workspace Integration:**

Personality files are automatically synced to the agent's workspace for CLI execution:

```
server/data/workspaces/{userId}/{agentId}/
├── IDENTITY.md          # Agent identity from personality config
├── SOUL.md              # Persona and boundaries
├── AGENTS.md            # Operating instructions
├── USER.md              # User context
├── CLAUDE.md            # Combined context file (auto-generated)
└── ...
```

**Inheritance Rules:**

| Profile Type | Personality Access |
|--------------|-------------------|
| Master Agent | Full read/write access |
| Sub-Agent | Inherits from parent (read-only by default) |
| Sub-Agent Override | Can create own personality if `allowPersonalityOverride: true` |

---

## 7. Database Schema

### 7.1 Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         AGENTIC AI DATABASE SCHEMA                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌───────────────────┐         ┌───────────────────┐                       │
│  │      users        │         │   ai_providers    │                       │
│  │  (existing)       │         │   (existing)      │                       │
│  └─────────┬─────────┘         └─────────┬─────────┘                       │
│            │                             │                                  │
│            │ 1:N                         │                                  │
│            ▼                             │                                  │
│  ┌───────────────────┐                   │                                  │
│  │ agentic_profiles  │◀──────────────────┘                                  │
│  │                   │                                                      │
│  │ • id              │───┐                                                  │
│  │ • user_id (FK)    │   │ 1:N                                             │
│  │ • parent_id (FK)  │◀──┘ (self-ref for hierarchy)                        │
│  │ • agent_type      │                                                      │
│  │ • hierarchy_level │                                                      │
│  └─────────┬─────────┘                                                      │
│            │                                                                │
│            │ 1:N                                                            │
│            ▼                                                                │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        CHILD TABLES                                  │   │
│  │                                                                      │   │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐      │   │
│  │  │agentic_monitoring│  │agentic_team_    │  │agentic_knowledge│      │   │
│  │  │                 │  │    members      │  │                 │      │   │
│  │  │ • source_type   │  │ • contact_id(FK)│  │ • library_id(FK)│      │   │
│  │  │ • source_id     │  │ • role          │  │ • access_type   │      │   │
│  │  │ • filters       │  │ • skills        │  │ • auto_learn    │      │   │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘      │   │
│  │                                                                      │   │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐      │   │
│  │  │ agentic_goals   │  │agentic_schedules│  │ agentic_tasks   │      │   │
│  │  │                 │  │                 │  │                 │      │   │
│  │  │ • title         │  │ • cron_expr     │  │ • assigned_to   │      │   │
│  │  │ • target_metric │  │ • action_type   │  │ • status        │      │   │
│  │  │ • deadline      │  │ • created_by    │  │ • source_type   │      │   │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘      │   │
│  │                                                                      │   │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐      │   │
│  │  │agentic_ai_routing│ │agentic_messages │  │agentic_activity │      │   │
│  │  │                 │  │  (AI-to-AI)     │  │     _log        │      │   │
│  │  │ • task_type     │  │ • from_id       │  │ • activity_type │      │   │
│  │  │ • provider_chain│  │ • to_id         │  │ • trigger_type  │      │   │
│  │  │ • temperature   │  │ • message_type  │  │ • status        │      │   │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘      │   │
│  │                                                                      │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    REFERENCE TABLES                                  │   │
│  │                                                                      │   │
│  │  ┌─────────────────┐  ┌─────────────────┐                           │   │
│  │  │agentic_routing_ │  │agentic_hierarchy│                           │   │
│  │  │    presets      │  │     _log        │                           │   │
│  │  │                 │  │                 │                           │   │
│  │  │ • name          │  │ • event_type    │                           │   │
│  │  │ • routing_config│  │ • parent_id     │                           │   │
│  │  │ • recommended   │  │ • child_id      │                           │   │
│  │  └─────────────────┘  └─────────────────┘                           │   │
│  │                                                                      │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Table Definitions

```sql
-- =====================================================
-- 1. AGENTIC PROFILES (Core entity)
-- =====================================================

CREATE TABLE IF NOT EXISTS agentic_profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,

  -- Basic Info
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  description TEXT,
  avatar TEXT,

  -- Hierarchy
  agent_type TEXT DEFAULT 'master' CHECK(agent_type IN ('master', 'sub')),
  parent_agentic_id TEXT,
  hierarchy_level INTEGER DEFAULT 0,
  hierarchy_path TEXT,  -- "/master-id/sub1-id/sub2-id"

  -- Creation context
  created_by_type TEXT DEFAULT 'user' CHECK(created_by_type IN ('user', 'agentic')),
  created_by_agentic_id TEXT,
  creation_reason TEXT,
  creation_prompt TEXT,

  -- Inheritance settings
  inherit_team INTEGER DEFAULT 1,
  inherit_knowledge INTEGER DEFAULT 1,
  inherit_monitoring INTEGER DEFAULT 0,
  inherit_routing INTEGER DEFAULT 1,

  -- AI Configuration
  ai_provider TEXT DEFAULT 'task-routing',
  ai_model TEXT,
  temperature REAL DEFAULT 0.7,
  max_tokens INTEGER DEFAULT 4096,
  system_prompt TEXT,
  routing_preset TEXT,

  -- Personality Configuration (markdown files)
  personality_identity TEXT,    -- IDENTITY.md content
  personality_soul TEXT,        -- SOUL.md content
  personality_agents TEXT,      -- AGENTS.md content
  personality_user TEXT,        -- USER.md content
  personality_updated_at TEXT,  -- Last personality update timestamp

  -- Autonomy Settings
  autonomy_level TEXT DEFAULT 'supervised'
    CHECK(autonomy_level IN ('supervised', 'semi-autonomous', 'autonomous')),
  require_approval_for TEXT DEFAULT '[]',  -- JSON array

  -- Master Contact (Superior for approvals and reporting)
  master_contact_id TEXT,                  -- Reference to contacts table
  master_contact_channel TEXT DEFAULT 'email'
    CHECK(master_contact_channel IN ('email', 'whatsapp', 'telegram')),
  notify_master_on TEXT DEFAULT '["approval_needed", "daily_report", "critical_error"]',  -- JSON array
  escalation_timeout_minutes INTEGER DEFAULT 60,  -- Auto-escalate if no response

  -- Sub-agent permissions
  can_create_children INTEGER DEFAULT 0,
  max_children INTEGER DEFAULT 5,
  max_hierarchy_depth INTEGER DEFAULT 3,
  children_autonomy_cap TEXT DEFAULT 'supervised',

  -- Resource limits
  daily_budget REAL DEFAULT 10.0,
  daily_budget_used REAL DEFAULT 0.0,
  rate_limit_per_minute INTEGER DEFAULT 60,

  -- Status
  status TEXT DEFAULT 'inactive'
    CHECK(status IN ('inactive', 'active', 'paused', 'error', 'terminated')),
  paused_by TEXT,
  last_active_at TEXT,

  -- Lifecycle
  expires_at TEXT,
  terminated_at TEXT,
  termination_reason TEXT,

  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),

  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (parent_agentic_id) REFERENCES agentic_profiles(id) ON DELETE CASCADE
);

CREATE INDEX idx_agentic_user ON agentic_profiles(user_id);
CREATE INDEX idx_agentic_parent ON agentic_profiles(parent_agentic_id);
CREATE INDEX idx_agentic_hierarchy ON agentic_profiles(hierarchy_path);
CREATE INDEX idx_agentic_status ON agentic_profiles(status);


-- =====================================================
-- 2. PLATFORM MONITORING
-- =====================================================

CREATE TABLE IF NOT EXISTS agentic_monitoring (
  id TEXT PRIMARY KEY,
  agentic_id TEXT NOT NULL,

  -- Source configuration
  source_type TEXT NOT NULL
    CHECK(source_type IN ('email', 'whatsapp', 'telegram', 'platform_account')),
  source_id TEXT,
  source_name TEXT,

  -- Filters
  filter_keywords TEXT,        -- JSON array
  filter_senders TEXT,         -- JSON array
  filter_categories TEXT,      -- JSON array
  priority TEXT DEFAULT 'normal'
    CHECK(priority IN ('low', 'normal', 'high', 'urgent')),

  -- Actions
  auto_respond INTEGER DEFAULT 0,
  auto_classify INTEGER DEFAULT 1,
  forward_to_team INTEGER DEFAULT 0,

  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),

  FOREIGN KEY (agentic_id) REFERENCES agentic_profiles(id) ON DELETE CASCADE
);

CREATE INDEX idx_agentic_mon_source ON agentic_monitoring(source_type, source_id);


-- =====================================================
-- 3. TEAM MEMBERS
-- =====================================================

CREATE TABLE IF NOT EXISTS agentic_team_members (
  id TEXT PRIMARY KEY,
  agentic_id TEXT NOT NULL,
  contact_id TEXT NOT NULL,

  -- Role & Skills
  role TEXT NOT NULL,
  department TEXT,
  skills TEXT DEFAULT '[]',    -- JSON array

  -- Availability
  is_available INTEGER DEFAULT 1,
  availability_schedule TEXT,  -- JSON object
  timezone TEXT DEFAULT 'Asia/Jakarta',
  max_concurrent_tasks INTEGER DEFAULT 3,

  -- Preferences
  task_types TEXT DEFAULT '[]',
  priority_level TEXT DEFAULT 'normal',
  preferred_channel TEXT DEFAULT 'email'
    CHECK(preferred_channel IN ('email', 'whatsapp', 'telegram')),
  notification_frequency TEXT DEFAULT 'immediate'
    CHECK(notification_frequency IN ('immediate', 'hourly', 'daily')),

  -- Performance metrics
  tasks_completed INTEGER DEFAULT 0,
  avg_completion_time INTEGER DEFAULT 0,
  rating REAL DEFAULT 5.0,

  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),

  FOREIGN KEY (agentic_id) REFERENCES agentic_profiles(id) ON DELETE CASCADE,
  FOREIGN KEY (contact_id) REFERENCES contacts(id)
);

CREATE INDEX idx_agentic_team_contact ON agentic_team_members(contact_id);


-- =====================================================
-- 4. KNOWLEDGE LIBRARY BINDINGS
-- =====================================================

CREATE TABLE IF NOT EXISTS agentic_knowledge (
  id TEXT PRIMARY KEY,
  agentic_id TEXT NOT NULL,
  library_id TEXT NOT NULL,

  access_type TEXT DEFAULT 'read'
    CHECK(access_type IN ('read', 'write', 'manage')),
  auto_learn INTEGER DEFAULT 0,
  learn_from TEXT DEFAULT '[]',  -- JSON: ['emails', 'conversations', 'tasks']
  priority INTEGER DEFAULT 0,

  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),

  FOREIGN KEY (agentic_id) REFERENCES agentic_profiles(id) ON DELETE CASCADE,
  FOREIGN KEY (library_id) REFERENCES knowledge_libraries(id)
);


-- =====================================================
-- 5. GOALS & OBJECTIVES
-- =====================================================

CREATE TABLE IF NOT EXISTS agentic_goals (
  id TEXT PRIMARY KEY,
  agentic_id TEXT NOT NULL,

  title TEXT NOT NULL,
  description TEXT,
  goal_type TEXT DEFAULT 'ongoing'
    CHECK(goal_type IN ('ongoing', 'deadline', 'milestone')),

  -- Metrics
  target_metric TEXT,
  target_value TEXT,
  current_value TEXT,

  -- Timeline
  deadline_at TEXT,

  priority TEXT DEFAULT 'normal',
  status TEXT DEFAULT 'active'
    CHECK(status IN ('active', 'paused', 'completed', 'failed')),

  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),

  FOREIGN KEY (agentic_id) REFERENCES agentic_profiles(id) ON DELETE CASCADE
);


-- =====================================================
-- 6. SCHEDULES
-- =====================================================

CREATE TABLE IF NOT EXISTS agentic_schedules (
  id TEXT PRIMARY KEY,
  agentic_id TEXT NOT NULL,

  title TEXT NOT NULL,
  description TEXT,

  schedule_type TEXT DEFAULT 'cron'
    CHECK(schedule_type IN ('cron', 'interval', 'once', 'event')),
  cron_expression TEXT,
  interval_minutes INTEGER,
  next_run_at TEXT,
  last_run_at TEXT,

  -- Action
  action_type TEXT NOT NULL
    CHECK(action_type IN ('check_messages', 'send_report', 'review_tasks',
                          'update_knowledge', 'custom_prompt', 'self_reflect')),
  action_config TEXT,
  custom_prompt TEXT,

  created_by TEXT DEFAULT 'user' CHECK(created_by IN ('user', 'self')),

  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),

  FOREIGN KEY (agentic_id) REFERENCES agentic_profiles(id) ON DELETE CASCADE
);

CREATE INDEX idx_agentic_sched_next ON agentic_schedules(next_run_at, is_active);


-- =====================================================
-- 7. TASK TRACKING
-- =====================================================

CREATE TABLE IF NOT EXISTS agentic_tasks (
  id TEXT PRIMARY KEY,
  agentic_id TEXT NOT NULL,

  -- Details
  title TEXT NOT NULL,
  description TEXT,
  task_type TEXT,

  -- Assignment
  assigned_to TEXT,
  assigned_at TEXT,

  -- Source
  source_type TEXT,
  source_id TEXT,
  source_content TEXT,

  -- Status
  status TEXT DEFAULT 'pending'
    CHECK(status IN ('pending', 'assigned', 'in_progress', 'review',
                     'completed', 'cancelled', 'blocked')),
  priority TEXT DEFAULT 'normal',

  -- Timeline
  due_at TEXT,
  started_at TEXT,
  completed_at TEXT,

  -- Updates
  updates TEXT DEFAULT '[]',

  -- AI Analysis
  ai_summary TEXT,
  ai_suggested_assignee TEXT,
  ai_estimated_hours REAL,

  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),

  FOREIGN KEY (agentic_id) REFERENCES agentic_profiles(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_to) REFERENCES agentic_team_members(id)
);

CREATE INDEX idx_agentic_task_status ON agentic_tasks(agentic_id, status);
CREATE INDEX idx_agentic_task_assignee ON agentic_tasks(assigned_to, status);


-- =====================================================
-- 8. AI ROUTING (with Failover Chain)
-- =====================================================
-- Each Agentic AI can configure its own AI model routing
-- per task type. If primary model fails, automatically
-- tries next model in the chain (failover).

CREATE TABLE IF NOT EXISTS agentic_ai_routing (
  id TEXT PRIMARY KEY,
  agentic_id TEXT NOT NULL,

  task_type TEXT NOT NULL CHECK(task_type IN (
    'email_draft', 'email_send', 'message_respond', 'message_classify',
    'task_analyze', 'task_assign', 'task_summarize', 'task_prioritize',
    'rag_query', 'knowledge_extract', 'knowledge_summarize',
    'self_prompt', 'self_schedule', 'self_reflect',
    'agent_create', 'agent_communicate', 'agent_delegate',
    'decision_simple', 'decision_complex', 'escalation_check',
    'memory_store', 'memory_recall',  -- Memory operations
    'default'
  )),

  -- Provider chain with automatic failover
  -- Format: [{"provider": "MidAI", "model": "gpt-4o-mini", "isPrimary": true}, ...]
  -- On error/timeout, tries next provider in chain until success or all fail
  provider_chain TEXT NOT NULL,  -- JSON array of {provider, model, isPrimary}

  -- Model parameters
  temperature REAL DEFAULT 0.7,
  max_tokens INTEGER DEFAULT 4096,
  system_prompt_override TEXT,

  -- Retry/failover settings
  max_retries INTEGER DEFAULT 2,       -- Retries per provider before failover
  retry_delay_ms INTEGER DEFAULT 1000, -- Delay between retries (milliseconds)
  timeout_seconds INTEGER DEFAULT 60,  -- Max wait time per request

  priority TEXT DEFAULT 'normal',

  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),

  FOREIGN KEY (agentic_id) REFERENCES agentic_profiles(id) ON DELETE CASCADE,
  UNIQUE(agentic_id, task_type)
);


-- =====================================================
-- 9. AI-TO-AI MESSAGES
-- =====================================================

CREATE TABLE IF NOT EXISTS agentic_messages (
  id TEXT PRIMARY KEY,
  from_agentic_id TEXT NOT NULL,
  to_agentic_id TEXT NOT NULL,

  message_type TEXT DEFAULT 'request'
    CHECK(message_type IN ('request', 'response', 'notification',
                           'handoff', 'status_update', 'escalation')),

  subject TEXT,
  content TEXT NOT NULL,
  context TEXT,
  reply_to_id TEXT,

  status TEXT DEFAULT 'pending'
    CHECK(status IN ('pending', 'read', 'processing', 'completed', 'failed')),

  created_at TEXT DEFAULT (datetime('now')),
  processed_at TEXT,

  FOREIGN KEY (from_agentic_id) REFERENCES agentic_profiles(id),
  FOREIGN KEY (to_agentic_id) REFERENCES agentic_profiles(id)
);

CREATE INDEX idx_agentic_msg_to ON agentic_messages(to_agentic_id, status);


-- =====================================================
-- 10. ACTIVITY LOG
-- =====================================================

CREATE TABLE IF NOT EXISTS agentic_activity_log (
  id TEXT PRIMARY KEY,
  agentic_id TEXT NOT NULL,

  activity_type TEXT NOT NULL,
  activity_description TEXT,

  trigger_type TEXT,
  trigger_id TEXT,

  status TEXT DEFAULT 'success',
  error_message TEXT,

  required_approval INTEGER DEFAULT 0,
  approved_by TEXT,
  approved_at TEXT,

  metadata TEXT,
  created_at TEXT DEFAULT (datetime('now')),

  FOREIGN KEY (agentic_id) REFERENCES agentic_profiles(id)
);

CREATE INDEX idx_agentic_log ON agentic_activity_log(agentic_id, created_at DESC);


-- =====================================================
-- 11. HIERARCHY LOG
-- =====================================================

CREATE TABLE IF NOT EXISTS agentic_hierarchy_log (
  id TEXT PRIMARY KEY,

  event_type TEXT NOT NULL CHECK(event_type IN (
    'sub_created', 'sub_paused', 'sub_resumed', 'sub_terminated',
    'sub_promoted', 'autonomy_changed', 'budget_exceeded',
    'depth_limit_hit', 'permission_denied'
  )),

  parent_agentic_id TEXT,
  child_agentic_id TEXT,
  triggered_by TEXT,
  details TEXT,

  created_at TEXT DEFAULT (datetime('now')),

  FOREIGN KEY (parent_agentic_id) REFERENCES agentic_profiles(id),
  FOREIGN KEY (child_agentic_id) REFERENCES agentic_profiles(id)
);


-- =====================================================
-- 12. ROUTING PRESETS
-- =====================================================

CREATE TABLE IF NOT EXISTS agentic_routing_presets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  routing_config TEXT NOT NULL,  -- JSON
  recommended_for TEXT,          -- JSON array
  is_system INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Insert default presets
INSERT OR IGNORE INTO agentic_routing_presets (id, name, description, routing_config, recommended_for, is_system)
VALUES
  ('preset-gm', 'GM Operation', 'For General Manager / Operations Lead roles', '{}', '["manager","operations"]', 1),
  ('preset-support', 'Support Agent', 'For customer support roles', '{}', '["support","helpdesk"]', 1),
  ('preset-dev', 'Developer Assistant', 'For technical roles', '{}', '["developer","engineer"]', 1);


-- =====================================================
-- 13. APPROVAL QUEUE (Human-in-the-Loop)
-- =====================================================

CREATE TABLE IF NOT EXISTS agentic_approval_queue (
  id TEXT PRIMARY KEY,
  agentic_id TEXT NOT NULL,

  -- What needs approval
  action_type TEXT NOT NULL CHECK(action_type IN (
    'send_email', 'send_message', 'create_task', 'assign_task',
    'create_agent', 'terminate_agent', 'update_knowledge',
    'create_schedule', 'budget_increase', 'autonomy_change'
  )),
  action_title TEXT NOT NULL,
  action_description TEXT,
  action_payload TEXT NOT NULL,  -- JSON: full action data to execute if approved

  -- Context
  triggered_by TEXT,             -- What triggered this approval request
  trigger_context TEXT,          -- JSON: relevant context data
  confidence_score REAL,         -- AI's confidence (0-1)
  reasoning TEXT,                -- Why AI wants to take this action

  -- Approval target
  master_contact_id TEXT NOT NULL,  -- Who should approve
  notification_channel TEXT,        -- How to notify
  notification_sent_at TEXT,
  notification_count INTEGER DEFAULT 0,

  -- Status
  status TEXT DEFAULT 'pending'
    CHECK(status IN ('pending', 'approved', 'rejected', 'expired', 'auto_approved')),
  priority TEXT DEFAULT 'normal'
    CHECK(priority IN ('low', 'normal', 'high', 'urgent')),

  -- Resolution
  resolved_by TEXT,              -- Who approved/rejected (contact_id or 'system' for auto)
  resolved_at TEXT,
  resolution_notes TEXT,
  modified_payload TEXT,         -- If approver modified the action

  -- Timing
  expires_at TEXT,               -- Auto-expire if not resolved
  created_at TEXT DEFAULT (datetime('now')),

  FOREIGN KEY (agentic_id) REFERENCES agentic_profiles(id) ON DELETE CASCADE,
  FOREIGN KEY (master_contact_id) REFERENCES contacts(id)
);

CREATE INDEX idx_approval_status ON agentic_approval_queue(agentic_id, status);
CREATE INDEX idx_approval_master ON agentic_approval_queue(master_contact_id, status);
CREATE INDEX idx_approval_expires ON agentic_approval_queue(expires_at, status);


-- =====================================================
-- 14. MASTER CONTACT NOTIFICATIONS
-- =====================================================

CREATE TABLE IF NOT EXISTS agentic_master_notifications (
  id TEXT PRIMARY KEY,
  agentic_id TEXT NOT NULL,
  master_contact_id TEXT NOT NULL,

  -- Notification content
  notification_type TEXT NOT NULL CHECK(notification_type IN (
    'approval_needed', 'approval_reminder', 'daily_report', 'weekly_report',
    'critical_error', 'budget_warning', 'budget_exceeded',
    'agent_created', 'agent_terminated', 'escalation', 'status_update'
  )),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  context TEXT,                  -- JSON: additional data

  -- Delivery
  channel TEXT NOT NULL,         -- email, whatsapp, telegram
  delivery_status TEXT DEFAULT 'pending'
    CHECK(delivery_status IN ('pending', 'sent', 'delivered', 'read', 'failed')),
  sent_at TEXT,
  delivered_at TEXT,
  read_at TEXT,
  error_message TEXT,

  -- Reference
  reference_type TEXT,           -- 'approval', 'task', 'error', etc.
  reference_id TEXT,             -- ID of referenced item

  created_at TEXT DEFAULT (datetime('now')),

  FOREIGN KEY (agentic_id) REFERENCES agentic_profiles(id) ON DELETE CASCADE,
  FOREIGN KEY (master_contact_id) REFERENCES contacts(id)
);

CREATE INDEX idx_master_notif ON agentic_master_notifications(master_contact_id, delivery_status);


-- =====================================================
-- 15. AGENTIC MEMORY SYSTEM
-- =====================================================
-- Each Agentic AI has its own memory for conversations,
-- transactions, and decisions. Separate from RAG (knowledge).
-- Access restricted to the creator of the Agentic AI.

CREATE TABLE IF NOT EXISTS agentic_memory (
  id TEXT PRIMARY KEY,
  agentic_id TEXT NOT NULL,

  -- Memory classification
  memory_type TEXT NOT NULL CHECK(memory_type IN (
    'conversation',      -- Communication history with a contact
    'transaction',       -- Task/action records
    'decision',          -- Decisions made and reasoning
    'learning',          -- Patterns learned from interactions
    'context',           -- Contextual information about contacts/topics
    'preference',        -- Learned preferences (contact, topic, etc.)
    'relationship',      -- Relationship status with contacts
    'event',             -- Important events/milestones
    'reflection'         -- Self-reflections and improvements
  )),

  -- Content
  title TEXT,
  content TEXT NOT NULL,
  summary TEXT,                    -- AI-generated summary for quick recall

  -- Associations
  contact_id TEXT,                 -- Related contact (if applicable)
  conversation_id TEXT,            -- Related conversation
  task_id TEXT,                    -- Related task
  related_memory_ids TEXT,         -- JSON array of related memories

  -- Metadata
  importance_score REAL DEFAULT 0.5,  -- 0-1, for memory prioritization
  emotion_context TEXT,               -- Sentiment/emotion of interaction
  tags TEXT,                          -- JSON array of tags
  metadata TEXT,                      -- JSON: additional structured data

  -- Temporal
  occurred_at TEXT,                -- When the event/conversation happened
  expires_at TEXT,                 -- Optional: auto-forget after date
  last_recalled_at TEXT,           -- Last time this memory was accessed
  recall_count INTEGER DEFAULT 0,  -- How often this memory is accessed

  -- Storage location (for large memories)
  storage_type TEXT DEFAULT 'inline' CHECK(storage_type IN ('inline', 'redis', 'file')),
  storage_key TEXT,                -- Redis key or file path if not inline

  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),

  FOREIGN KEY (agentic_id) REFERENCES agentic_profiles(id) ON DELETE CASCADE,
  FOREIGN KEY (contact_id) REFERENCES contacts(id),
  FOREIGN KEY (conversation_id) REFERENCES conversations(id),
  FOREIGN KEY (task_id) REFERENCES agentic_tasks(id)
);

CREATE INDEX idx_memory_agentic ON agentic_memory(agentic_id, memory_type);
CREATE INDEX idx_memory_contact ON agentic_memory(agentic_id, contact_id);
CREATE INDEX idx_memory_importance ON agentic_memory(agentic_id, importance_score DESC);
CREATE INDEX idx_memory_time ON agentic_memory(agentic_id, occurred_at DESC);


-- =====================================================
-- 16. AGENTIC MEMORY EMBEDDINGS (for semantic search)
-- =====================================================
-- Vector embeddings for memory search (stored in Qdrant)
-- This table maps memories to their vector IDs

CREATE TABLE IF NOT EXISTS agentic_memory_vectors (
  id TEXT PRIMARY KEY,
  memory_id TEXT NOT NULL,
  agentic_id TEXT NOT NULL,

  -- Vector storage reference
  vector_collection TEXT NOT NULL,   -- Qdrant collection name
  vector_id TEXT NOT NULL,           -- ID in vector store

  -- Embedding info
  embedding_model TEXT,              -- Model used for embedding
  embedding_version INTEGER DEFAULT 1,

  created_at TEXT DEFAULT (datetime('now')),

  FOREIGN KEY (memory_id) REFERENCES agentic_memory(id) ON DELETE CASCADE,
  FOREIGN KEY (agentic_id) REFERENCES agentic_profiles(id) ON DELETE CASCADE
);

CREATE INDEX idx_memory_vector ON agentic_memory_vectors(agentic_id, memory_id);


-- =====================================================
-- 17. AGENTIC MEMORY SESSIONS (Redis-backed short-term)
-- =====================================================
-- Tracks active memory sessions in Redis for fast access

CREATE TABLE IF NOT EXISTS agentic_memory_sessions (
  id TEXT PRIMARY KEY,
  agentic_id TEXT NOT NULL,

  -- Session info
  session_type TEXT NOT NULL CHECK(session_type IN (
    'active_conversation',    -- Currently active conversation
    'working_context',        -- Current working context
    'recent_interactions',    -- Recent interaction buffer
    'pending_decisions'       -- Decisions awaiting confirmation
  )),

  -- Redis reference
  redis_key TEXT NOT NULL,
  redis_ttl INTEGER DEFAULT 3600,    -- Time-to-live in seconds

  -- Metadata
  contact_id TEXT,
  metadata TEXT,

  last_accessed_at TEXT,
  expires_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),

  FOREIGN KEY (agentic_id) REFERENCES agentic_profiles(id) ON DELETE CASCADE
);

CREATE INDEX idx_memory_session ON agentic_memory_sessions(agentic_id, session_type);


-- =====================================================
-- 18. CONTACT SCOPE (Output Permissions)
-- =====================================================
-- Defines which contacts the Agentic AI can communicate
-- with directly. Out-of-scope contacts require master approval.

CREATE TABLE IF NOT EXISTS agentic_contact_scope (
  id TEXT PRIMARY KEY,
  agentic_id TEXT NOT NULL,

  -- Scope type determines base permission level
  scope_type TEXT DEFAULT 'team_only' CHECK(scope_type IN (
    'team_only',           -- Only team members
    'contacts_whitelist',  -- Specific whitelisted contacts
    'contacts_tags',       -- Contacts with matching tags
    'all_user_contacts',   -- Any contact in user's list
    'unrestricted'         -- Anyone (DANGEROUS - requires explicit)
  )),

  -- Whitelist configuration
  whitelist_contact_ids TEXT DEFAULT '[]',  -- JSON array of contact IDs
  whitelist_tags TEXT DEFAULT '[]',         -- JSON array of tags

  -- Always-allowed exceptions
  allow_team_members INTEGER DEFAULT 1,     -- Always allow team members
  allow_master_contact INTEGER DEFAULT 1,   -- Always allow master contact

  -- Behavior settings
  notify_on_out_of_scope INTEGER DEFAULT 1,    -- Notify master for attempts
  auto_add_approved INTEGER DEFAULT 0,         -- Add approved contacts to whitelist
  log_all_communications INTEGER DEFAULT 1,    -- Log all sent messages

  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),

  FOREIGN KEY (agentic_id) REFERENCES agentic_profiles(id) ON DELETE CASCADE,
  UNIQUE(agentic_id)
);


-- =====================================================
-- 19. CONTACT SCOPE LOG (Audit trail)
-- =====================================================
-- Logs all out-of-scope contact attempts and their resolution

CREATE TABLE IF NOT EXISTS agentic_scope_log (
  id TEXT PRIMARY KEY,
  agentic_id TEXT NOT NULL,

  -- Attempt details
  action_type TEXT NOT NULL CHECK(action_type IN ('send_email', 'send_message')),
  recipient_type TEXT,       -- email, phone, telegram_id, etc.
  recipient_value TEXT,      -- The actual address/number
  recipient_contact_id TEXT, -- If known contact, their ID
  recipient_name TEXT,       -- Display name if available

  -- Message preview (for audit)
  message_subject TEXT,
  message_preview TEXT,      -- First 200 chars

  -- Resolution
  status TEXT DEFAULT 'pending' CHECK(status IN (
    'pending', 'approved', 'approved_added', 'rejected', 'expired'
  )),
  approval_id TEXT,          -- Reference to approval_queue if created
  resolved_by TEXT,          -- master_contact_id or 'auto'
  resolved_at TEXT,

  -- Context
  reason_blocked TEXT,       -- Why it was blocked (out_of_scope, unknown_contact, etc.)

  created_at TEXT DEFAULT (datetime('now')),

  FOREIGN KEY (agentic_id) REFERENCES agentic_profiles(id) ON DELETE CASCADE,
  FOREIGN KEY (recipient_contact_id) REFERENCES contacts(id)
);

CREATE INDEX idx_scope_log_agentic ON agentic_scope_log(agentic_id, status);
CREATE INDEX idx_scope_log_recipient ON agentic_scope_log(recipient_value);


-- =====================================================
-- 20. BACKGROUND INFORMATION (Organization Context)
-- =====================================================
-- Stores company/organization background info for the Agentic AI.
-- IMPORTANT: Only Master Agents (hierarchy_level = 0) have this table.
-- Sub-Agents inherit from their root master via hierarchy_path.

CREATE TABLE IF NOT EXISTS agentic_background (
  id TEXT PRIMARY KEY,
  agentic_id TEXT NOT NULL,            -- Must be a master agent (hierarchy_level = 0)

  -- Company Identity
  company_name TEXT NOT NULL,          -- "AXICOM SDN BHD"
  company_short_name TEXT,             -- "AXICOM"
  company_type TEXT,                   -- "SDN BHD", "LLC", "Inc"
  registration_number TEXT,
  tax_id TEXT,

  -- Business Details
  industry TEXT,
  description TEXT,                    -- Company description
  established TEXT,                    -- Year founded
  employee_count TEXT,                 -- "50-100", "100-500"
  services TEXT DEFAULT '[]',          -- JSON array
  products TEXT DEFAULT '[]',          -- JSON array

  -- Contact Information
  primary_phone TEXT,
  alternate_phone TEXT,
  primary_email TEXT,
  support_email TEXT,
  website TEXT,

  -- Address
  address_street TEXT,
  address_city TEXT,
  address_state TEXT,
  address_postal_code TEXT,
  address_country TEXT,

  -- Operations
  timezone TEXT DEFAULT 'UTC',
  business_hours TEXT DEFAULT '{}',    -- JSON: {"monday": "09:00-18:00", ...}
  holidays TEXT DEFAULT '[]',          -- JSON array

  -- Social Media
  linkedin TEXT,
  facebook TEXT,
  twitter TEXT,
  instagram TEXT,

  -- Custom fields for specific needs
  custom_fields TEXT DEFAULT '{}',     -- JSON for additional info

  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),

  FOREIGN KEY (agentic_id) REFERENCES agentic_profiles(id) ON DELETE CASCADE,
  UNIQUE(agentic_id)
);

-- Only master agents can have background info
-- Sub-agents query via: SELECT * FROM agentic_background
--   WHERE agentic_id = (SELECT id FROM agentic_profiles
--                       WHERE hierarchy_path LIKE '/' || ? || '/%'
--                       AND hierarchy_level = 0)
```

---

## 8. API Specifications

### 8.1 API Endpoints Overview

| Method | Endpoint | Description |
|--------|----------|-------------|
| **Profiles** |||
| GET | `/api/agentic` | List all agentic profiles |
| POST | `/api/agentic` | Create new profile |
| GET | `/api/agentic/:id` | Get profile details |
| PUT | `/api/agentic/:id` | Update profile |
| DELETE | `/api/agentic/:id` | Delete profile |
| POST | `/api/agentic/:id/activate` | Activate profile |
| POST | `/api/agentic/:id/pause` | Pause profile |
| **Hierarchy** |||
| GET | `/api/agentic/:id/hierarchy` | Get hierarchy tree |
| POST | `/api/agentic/:id/children` | Create sub-agent |
| DELETE | `/api/agentic/:id/children/:childId` | Terminate sub-agent |
| **Monitoring** |||
| GET | `/api/agentic/:id/monitoring` | List monitoring sources |
| POST | `/api/agentic/:id/monitoring` | Add monitoring source |
| PUT | `/api/agentic/:id/monitoring/:monId` | Update source |
| DELETE | `/api/agentic/:id/monitoring/:monId` | Remove source |
| **Team** |||
| GET | `/api/agentic/:id/team` | List team members |
| POST | `/api/agentic/:id/team` | Add team member |
| PUT | `/api/agentic/:id/team/:memberId` | Update member |
| DELETE | `/api/agentic/:id/team/:memberId` | Remove member |
| **Tasks** |||
| GET | `/api/agentic/:id/tasks` | List tasks |
| POST | `/api/agentic/:id/tasks` | Create task |
| PUT | `/api/agentic/:id/tasks/:taskId` | Update task |
| POST | `/api/agentic/:id/tasks/:taskId/assign` | Assign task |
| **AI Routing** |||
| GET | `/api/agentic/:id/routing` | Get routing config |
| PUT | `/api/agentic/:id/routing` | Update routing |
| GET | `/api/agentic/routing/presets` | List presets |
| POST | `/api/agentic/:id/routing/apply-preset` | Apply preset |
| **Activity** |||
| GET | `/api/agentic/:id/activity` | Get activity log |
| GET | `/api/agentic/:id/stats` | Get statistics |
| **Master Contact** |||
| GET | `/api/agentic/:id/master-contact` | Get master contact config |
| PUT | `/api/agentic/:id/master-contact` | Set master contact |
| POST | `/api/agentic/:id/master-contact/test` | Send test notification |
| **Approval Queue** |||
| GET | `/api/agentic/:id/approvals` | List pending approvals |
| GET | `/api/agentic/:id/approvals/:approvalId` | Get approval details |
| POST | `/api/agentic/:id/approvals/:approvalId/approve` | Approve action |
| POST | `/api/agentic/:id/approvals/:approvalId/reject` | Reject action |
| POST | `/api/agentic/:id/approvals/:approvalId/modify` | Approve with modifications |
| **Master Notifications** |||
| GET | `/api/agentic/:id/notifications` | List notifications sent to master |
| POST | `/api/agentic/:id/notifications/report` | Send manual report |
| **Memory (Creator Only)** |||
| GET | `/api/agentic/:id/memory` | List memories (paginated) |
| GET | `/api/agentic/:id/memory/:memoryId` | Get specific memory |
| POST | `/api/agentic/:id/memory` | Add memory manually |
| DELETE | `/api/agentic/:id/memory/:memoryId` | Delete memory |
| POST | `/api/agentic/:id/memory/search` | Semantic search memories |
| GET | `/api/agentic/:id/memory/contact/:contactId` | Get memories for contact |
| GET | `/api/agentic/:id/memory/stats` | Get memory statistics |
| POST | `/api/agentic/:id/memory/export` | Export all memories |
| POST | `/api/agentic/:id/memory/consolidate` | Consolidate old memories |
| **Contact Scope (Output Permissions)** |||
| GET | `/api/agentic/:id/contact-scope` | Get contact scope config |
| PUT | `/api/agentic/:id/contact-scope` | Update contact scope |
| GET | `/api/agentic/:id/contact-scope/whitelist` | List whitelisted contacts |
| POST | `/api/agentic/:id/contact-scope/whitelist` | Add contact to whitelist |
| DELETE | `/api/agentic/:id/contact-scope/whitelist/:contactId` | Remove from whitelist |
| GET | `/api/agentic/:id/contact-scope/log` | Get out-of-scope attempt log |
| POST | `/api/agentic/:id/contact-scope/check` | Check if contact is in scope |
| **Background Information (Master Only)** |||
| GET | `/api/agentic/:id/background` | Get background info (sub-agents get master's) |
| PUT | `/api/agentic/:id/background` | Update background (master only, 403 for sub-agents) |

### 8.2 Request/Response Examples

#### Create Agentic Profile

```http
POST /api/agentic
Content-Type: application/json
Authorization: Bearer <token>

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
```

```http
HTTP/1.1 201 Created
Content-Type: application/json

{
  "id": "agt_abc123",
  "name": "GM Operation",
  "role": "General Manager Operation",
  "agentType": "master",
  "hierarchyLevel": 0,
  "status": "inactive",
  "createdAt": "2026-02-09T10:00:00Z"
}
```

#### Set Master Contact (Superior for Approvals)

```http
PUT /api/agentic/agt_abc123/master-contact
Content-Type: application/json
Authorization: Bearer <token>

{
  "masterContactId": "contact_boss123",
  "channel": "whatsapp",
  "notifyOn": [
    "approval_needed",
    "daily_report",
    "critical_error",
    "budget_warning"
  ],
  "escalationTimeoutMinutes": 60,
  "reportSchedule": {
    "daily": "18:00",
    "weekly": "friday:17:00"
  }
}
```

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "success": true,
  "masterContact": {
    "id": "contact_boss123",
    "name": "John Manager",
    "channel": "whatsapp",
    "phone": "+62812345678"
  },
  "notifyOn": ["approval_needed", "daily_report", "critical_error", "budget_warning"],
  "message": "Master contact configured successfully"
}
```

#### Approval Request (sent to Master Contact)

When an action requires approval, the master contact receives a notification:

```json
// WhatsApp/Telegram message sent to master contact:
{
  "type": "approval_request",
  "agenticName": "GM Operation",
  "actionType": "send_email",
  "title": "Send email to ABC Corp client",
  "description": "Reply to inquiry about project timeline",
  "preview": "Dear John, Thank you for your inquiry...",
  "confidence": 0.85,
  "reasoning": "Standard inquiry response, using template",
  "priority": "normal",
  "expiresIn": "60 minutes",
  "actions": {
    "approve": "Reply APPROVE 12345",
    "reject": "Reply REJECT 12345",
    "viewDetails": "https://app.example.com/approvals/12345"
  }
}
```

#### Approve/Reject Action

```http
POST /api/agentic/agt_abc123/approvals/approval_12345/approve
Content-Type: application/json
Authorization: Bearer <token>

{
  "notes": "Approved, looks good",
  "modifiedPayload": null
}
```

#### Create Sub-Agent (by parent agent)

```http
POST /api/agentic/agt_abc123/children
Content-Type: application/json
Authorization: Bearer <token>
X-Agentic-Id: agt_abc123

{
  "name": "Email Handler",
  "role": "Email Response Specialist",
  "creationReason": "Handle routine email responses",
  "inheritTeam": true,
  "inheritKnowledge": true
}
```

---

## 9. UI/UX Design

### 9.1 Navigation Structure

```
SwarmAI Dashboard
├── Agents (existing)
├── Conversations (existing)
├── FlowBuilder (existing)
├── Knowledge (existing)
├── Agentic AI (NEW)
│   ├── Overview Dashboard
│   ├── Create New
│   ├── [Agent Name]
│   │   ├── Profile
│   │   ├── AI Routing
│   │   ├── Monitoring
│   │   ├── Team
│   │   ├── Knowledge
│   │   ├── Goals
│   │   ├── Schedules
│   │   ├── Tasks
│   │   ├── Sub-Agents
│   │   └── Activity Log
│   └── Settings
└── Settings (existing)
```

### 9.2 Dashboard Wireframes

See Appendix A for detailed wireframes.

---

## 10. Security & Compliance

### 10.1 Security Requirements

| Requirement | Implementation |
|-------------|----------------|
| Authentication | JWT tokens, same as existing auth |
| Authorization | User can only access own agents |
| Data isolation | All queries filtered by user_id |
| Audit logging | All actions logged with timestamp |
| Secrets | API keys encrypted at rest |
| Rate limiting | Per-agent and global limits |

### 10.2 Approval Workflows

**Actions Requiring Approval (Configurable):**

| Action | Default | Risk Level |
|--------|---------|------------|
| Send email to client | Required | High |
| Send WhatsApp/Telegram | Required | High |
| Create task | Optional | Medium |
| Assign task | Optional | Medium |
| Create sub-agent | Required | High |
| Update knowledge | Optional | Medium |
| Create schedule | Optional | Low |
| Terminate sub-agent | Required | High |

### 10.3 Safety Controls

1. **Budget Limits**: Daily API cost caps per agent
2. **Rate Limits**: Max actions per minute
3. **Depth Limits**: Max hierarchy levels
4. **Autonomy Caps**: Sub-agents can't exceed parent
5. **Kill Switch**: Immediate pause/terminate capability
6. **Human Escalation**: Automatic for high-risk situations

---

## 11. Performance Requirements

### 11.1 Response Times

| Operation | Target | Max |
|-----------|--------|-----|
| List agents | 100ms | 500ms |
| Get agent details | 50ms | 200ms |
| AI response generation | 2s | 10s |
| Task assignment | 500ms | 2s |
| RAG query | 1s | 5s |

### 11.2 Scalability

| Metric | Initial | Target |
|--------|---------|--------|
| Agents per user | 10 | 50 |
| Sub-agents per master | 5 | 20 |
| Team members per agent | 20 | 100 |
| Tasks per agent | 1000 | 10000 |
| Messages per day | 500 | 5000 |

---

## 12. Implementation Roadmap

### 12.1 Phase 1: Foundation (Weeks 1-4)

**Goal:** Basic agentic profile with monitoring and team management

| Week | Deliverables |
|------|--------------|
| 1 | Database schema, migrations |
| 2 | Profile CRUD API, basic UI |
| 3 | Monitoring configuration |
| 4 | Team member management |

**Exit Criteria:**
- User can create agentic profile
- User can configure monitoring sources
- User can add team members
- Basic activity logging works

### 12.2 Phase 2: Intelligence (Weeks 5-8)

**Goal:** AI routing, task management, goals

| Week | Deliverables |
|------|--------------|
| 5 | Agentic AI Router service |
| 6 | Task tracking system |
| 7 | Goal management, scheduling |
| 8 | Integration testing |

**Exit Criteria:**
- AI routing works per task type
- Tasks can be created and assigned
- Schedules execute correctly
- Goals track progress

### 12.3 Phase 3: Autonomy (Weeks 9-12)

**Goal:** Hierarchy, self-prompting, self-learning

| Week | Deliverables |
|------|--------------|
| 9 | Hierarchy system (master/sub) |
| 10 | Self-prompting engine |
| 11 | Self-learning (RAG update) |
| 12 | AI-to-AI communication |

**Exit Criteria:**
- Agents can create sub-agents
- Self-prompting cycle works
- Knowledge auto-updates
- Agents communicate effectively

### 12.4 Phase 4: Polish (Weeks 13-14)

| Week | Deliverables |
|------|--------------|
| 13 | Performance optimization |
| 14 | Documentation, testing |

---

## 13. Future Enhancements

### 13.1 Short-term (Next 6 months)

| Enhancement | Description | Priority |
|-------------|-------------|----------|
| **Voice Integration** | Handle voice messages (transcribe, respond) | P1 |
| **Calendar Sync** | Sync with Google/Outlook calendars | P1 |
| **Template Library** | Pre-built agent templates for common roles | P2 |
| **Performance Analytics** | Detailed metrics dashboard | P2 |
| **Multi-language** | Support for non-English communications | P2 |

### 13.2 Medium-term (6-12 months)

| Enhancement | Description | Priority |
|-------------|-------------|----------|
| **External Tool Integration** | Connect to Jira, Trello, Asana | P1 |
| **CRM Integration** | Sync with Salesforce, HubSpot | P1 |
| **Document Generation** | Create reports, proposals auto | P2 |
| **Video Call Summaries** | Summarize Zoom/Meet recordings | P2 |
| **Mobile App** | iOS/Android for approvals | P2 |

### 13.3 Long-term (12+ months)

| Enhancement | Description | Priority |
|-------------|-------------|----------|
| **Multi-tenant Marketplace** | Share agent templates | P2 |
| **Agent Training Studio** | Fine-tune models per role | P3 |
| **Predictive Actions** | Anticipate needs before asked | P3 |
| **Cross-org Collaboration** | Agents from different users collaborate | P3 |

### 13.4 Suggested Improvements

#### 13.4.1 Observability & Monitoring

**Current Gap:** Limited visibility into agent decision-making.

**Improvement:**
```
┌─────────────────────────────────────────────────────────────────┐
│                    AGENTIC AI OBSERVABILITY                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. DECISION TRACE                                              │
│     • Log every decision point with context                     │
│     • Show why agent chose specific action                      │
│     • Replay decisions for debugging                            │
│                                                                 │
│  2. REAL-TIME DASHBOARD                                         │
│     • Live view of all active agents                            │
│     • Current task, pending approvals                           │
│     • Resource usage (API calls, budget)                        │
│                                                                 │
│  3. ALERTS & NOTIFICATIONS                                      │
│     • Budget threshold warnings                                 │
│     • Error rate spikes                                         │
│     • Unusual activity patterns                                 │
│                                                                 │
│  4. PERFORMANCE METRICS                                         │
│     • Response time percentiles                                 │
│     • Task completion rates                                     │
│     • Knowledge query accuracy                                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### 13.4.2 Confidence Scoring

**Current Gap:** AI actions don't indicate confidence level.

**Improvement:**
```javascript
// Add confidence scoring to all AI outputs
{
  "action": "assign_task",
  "target": "team_member_123",
  "confidence": 0.85,
  "reasoning": "Best skill match (Node.js), available, low workload",
  "alternatives": [
    {"target": "team_member_456", "confidence": 0.72},
    {"target": "team_member_789", "confidence": 0.65}
  ],
  "requiresApproval": false  // Auto-approve if confidence > 0.8
}
```

#### 13.4.3 Learning Feedback Loop

**Current Gap:** No mechanism to learn from corrections.

**Improvement:**
```
┌─────────────────────────────────────────────────────────────────┐
│                    LEARNING FEEDBACK LOOP                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. USER CORRECTION                                             │
│     User overrides AI task assignment                           │
│                                                                 │
│  2. CAPTURE FEEDBACK                                            │
│     System records: original decision, correction, context      │
│                                                                 │
│  3. PATTERN ANALYSIS                                            │
│     AI analyzes corrections for patterns                        │
│     "User prefers Ahmad for urgent tasks"                       │
│                                                                 │
│  4. PROMPT REFINEMENT                                           │
│     Update system prompt or routing rules                       │
│     "Prioritize Ahmad for urgent, time-sensitive tasks"         │
│                                                                 │
│  5. VALIDATION                                                  │
│     Future decisions reflect learning                           │
│     Track improvement in override rate                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### 13.4.4 Graceful Degradation

**Current Gap:** Agent fails completely if AI provider unavailable.

**Improvement:**
```javascript
// Degradation levels
const DEGRADATION_LEVELS = {
  FULL: {
    description: 'All AI features available',
    actions: ['respond', 'analyze', 'assign', 'create']
  },
  REDUCED: {
    description: 'Using fallback models',
    actions: ['respond', 'classify'],
    notification: 'Operating in reduced mode'
  },
  MINIMAL: {
    description: 'Rule-based only',
    actions: ['forward', 'queue'],
    notification: 'AI unavailable, using rules'
  },
  OFFLINE: {
    description: 'All actions queued',
    actions: ['queue'],
    notification: 'Agent offline, messages queued'
  }
};
```

#### 13.4.5 Context Persistence

**Current Gap:** Each AI call is stateless.

**Improvement:**
```javascript
// Maintain conversation context per interaction chain
const context = {
  // Current interaction
  currentMessage: "...",

  // Recent history (last 10 interactions with this contact)
  recentHistory: [...],

  // Relevant knowledge (from RAG)
  relevantKnowledge: [...],

  // Contact profile
  contactProfile: {
    name: "John Client",
    company: "ABC Corp",
    previousIssues: [...],
    preferences: {...}
  },

  // Ongoing tasks related to this contact
  relatedTasks: [...],

  // Previous agent decisions for this thread
  decisionHistory: [...]
};
```

#### 13.4.6 Approval Queue Management

**Current Gap:** Approvals are binary (approve/reject).

**Improvement:**
```
┌─────────────────────────────────────────────────────────────────┐
│                    APPROVAL QUEUE FEATURES                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. BATCH APPROVALS                                             │
│     • Approve multiple similar actions at once                  │
│     • "Approve all task assignments today"                      │
│                                                                 │
│  2. CONDITIONAL APPROVAL                                        │
│     • "Approve but change assignee to X"                        │
│     • "Approve with modifications"                              │
│                                                                 │
│  3. DELEGATION                                                  │
│     • Forward approval to another user                          │
│     • Set backup approvers                                      │
│                                                                 │
│  4. EXPIRY RULES                                                │
│     • Auto-approve if no response in X hours                    │
│     • Auto-reject if context changed                            │
│                                                                 │
│  5. PRIORITY QUEUE                                              │
│     • Urgent approvals surface first                            │
│     • Push notifications for critical items                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### 13.4.7 Testing & Simulation Mode

**Current Gap:** No way to test agent behavior safely.

**Improvement:**
```javascript
// Simulation mode settings
const simulationConfig = {
  enabled: true,

  // Don't actually send messages
  mockExternalActions: true,

  // Use test data
  testContacts: [...],
  testMessages: [...],

  // Fast-forward time for schedule testing
  timeAcceleration: 60, // 1 minute = 1 hour

  // Capture all decisions for review
  captureDecisions: true,

  // Compare with expected outcomes
  expectedOutcomes: [...],

  // Generate test report
  generateReport: true
};
```

#### 13.4.8 Cost Optimization

**Current Gap:** No intelligence in cost management.

**Improvement:**
```javascript
// Smart cost optimization
const costOptimizer = {
  // Use cheaper models for low-priority tasks
  modelSelection: {
    urgent: 'gpt-4o',
    normal: 'gpt-4o-mini',
    low: 'llama3'
  },

  // Cache frequent queries
  caching: {
    enabled: true,
    ttl: 3600, // 1 hour
    maxSize: 1000
  },

  // Batch similar requests
  batching: {
    enabled: true,
    maxWait: 5000, // 5 seconds
    maxBatch: 10
  },

  // Predictive budget allocation
  budgetAllocation: {
    morning: 0.4,   // 40% for morning rush
    afternoon: 0.35,
    evening: 0.15,
    night: 0.10
  }
};
```

---

## 14. Appendix

### Appendix A: UI Wireframes

[See separate wireframe document or Figma link]

### Appendix B: Sample System Prompts

#### GM Operation Agent

```
You are the General Manager of Operations for AXICOM SDN Technical Division.

RESPONSIBILITIES:
- Monitor and respond to client communications
- Assign tasks to team members based on skills and availability
- Track project progress and deadlines
- Generate status reports
- Escalate critical issues to human management

COMMUNICATION STYLE:
- Professional but friendly
- Concise and actionable
- Use proper Malaysian business etiquette

DECISION GUIDELINES:
- Routine requests: Handle autonomously
- Client escalations: Prioritize and assign immediately
- Budget decisions: Escalate to human
- New projects: Create task and assign team lead

TEAM:
{dynamically injected from team_members}

CURRENT GOALS:
{dynamically injected from goals}
```

### Appendix C: Glossary

| Term | Definition |
|------|------------|
| **Agentic AI** | Autonomous AI agent that can self-prompt, learn, and take actions |
| **Master Agent** | Top-level agentic AI created by user |
| **Sub Agent** | Child agent created by another agent |
| **Self-Prompting** | AI's ability to initiate actions without external trigger |
| **Self-Learning** | AI's ability to update its own knowledge base |
| **Hierarchy Path** | Full path from root master to current agent |
| **Autonomy Level** | Degree of independence in decision-making |
| **Approval Queue** | Pending actions requiring human approval |

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-02-09 | SwarmAI Team | Initial draft |

---

*End of Document*
