# SwarmAI Multi-Agent Messaging Platform
## Product Requirements Document (PRD)

**Version:** 2.0
**Date:** 2026-01-20
**Status:** Reference Documentation for System Recreation

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Product Vision & Goals](#2-product-vision--goals)
3. [Target Users & Use Cases](#3-target-users--use-cases)
4. [System Architecture Overview](#4-system-architecture-overview)
5. [Core Features](#5-core-features)
6. [Platform Support](#6-platform-support)
7. [Swarm Intelligence Features](#7-swarm-intelligence-features)
8. [Multi-Agent Management](#8-multi-agent-management)
9. [FlowBuilder Automation Engine](#9-flowbuilder-automation-engine)
10. [AI & Intelligence Layer](#10-ai--intelligence-layer)
11. [Knowledge Management (RAG)](#11-knowledge-management-rag)
12. [Data Architecture](#12-data-architecture)
13. [API Specifications](#13-api-specifications)
14. [Frontend Components](#14-frontend-components)
15. [Security & Authentication](#15-security--authentication)
16. [Subscription & Licensing](#16-subscription--licensing)
17. [Deployment Architecture](#17-deployment-architecture)
18. [Non-Functional Requirements](#18-non-functional-requirements)
19. [Appendix](#19-appendix)

---

## 1. Executive Summary

### 1.1 Product Overview

SwarmAI is a **Swarm Intelligence Multi-Agent Messaging Platform** that consolidates communication across WhatsApp, Telegram (Bot & User accounts), and Email into a unified, collaborative AI ecosystem. Inspired by swarm intelligence principles, it enables multiple autonomous agents to work together, share knowledge, and collectively optimize communication workflows. The platform combines:

- **Swarm Intelligence** - Multiple agents collaborate, share context, and distribute workload dynamically
- **AI-Powered Responses** - Intelligent routing to specialized language models with MCP integration
- **Visual Workflow Automation** - No-code FlowBuilder with 160+ action nodes
- **Knowledge Management** - RAG (Retrieval Augmented Generation) with semantic search and collective learning
- **Multi-Platform Support** - WhatsApp, Telegram Bot, Telegram User, Email
- **Multimodal AI** - Vision, audio processing, and tool-use capabilities
- **Enterprise Features** - Subscription management, team collaboration, audit trails

### 1.2 Problem Statement

Businesses managing customer communications across multiple platforms face:
- Fragmented tools requiring manual context switching
- Inconsistent response quality across channels
- Inability to automate complex multi-step workflows
- Knowledge silos preventing efficient information retrieval
- Scalability challenges as message volume grows
- **Single-agent bottlenecks** limiting throughput and availability
- **No collaboration** between agents handling related inquiries
- **Static routing** that doesn't adapt to agent performance or availability

### 1.3 Solution

A unified swarm platform where autonomous "agents" form collaborative networks to handle messaging across platforms with:
- **Swarm Orchestration** - Agents dynamically form groups, share context, and collaborate on complex tasks
- **Auto-Discovery** - Agents automatically find and connect with other agents based on capabilities
- **Collective Learning** - Agents share insights from successful interactions to improve overall performance
- **Load Distribution** - Incoming messages distributed across capable agents based on availability and expertise
- Consistent automation logic regardless of source platform
- AI-enhanced responses with knowledge base integration
- Visual workflow builder accessible to non-technical users
- Centralized analytics and monitoring with swarm health dashboards

---

## 2. Product Vision & Goals

### 2.1 Vision Statement

> Empower businesses with swarm intelligence - where autonomous AI agents collaborate, learn collectively, and adapt together to deliver exceptional customer experiences across all messaging platforms.

### 2.2 Strategic Goals

| Goal | Description | Success Metric |
|------|-------------|----------------|
| **Unified Communications** | Single platform for all messaging channels | Support 4+ platforms |
| **Swarm Intelligence** | Agents collaborate and share knowledge dynamically | Agent collaboration rate >60% |
| **No-Code Automation** | Business users create workflows without coding | 160+ node types |
| **AI-First Design** | Intelligent responses powered by LLMs with MCP | Intent routing accuracy >90% |
| **Collective Learning** | Agents improve from shared experiences | Response quality improvement >15%/month |
| **Knowledge-Enhanced** | Semantic search over business knowledge | RAG query latency <2s |
| **Multimodal Capabilities** | Vision, audio, and tool-use support | Full multimodal coverage |
| **Enterprise-Ready** | Security, compliance, scalability | SOC2-compatible architecture |

### 2.3 Design Principles

1. **Swarm-First Architecture** - Agents designed to collaborate, not work in isolation
2. **Platform Agnostic** - Same workflow runs on any supported platform
3. **Agent Specialization** - Each agent can develop expertise in specific domains
4. **Collective Intelligence** - Knowledge and learnings shared across the swarm
5. **Dynamic Load Balancing** - Work distributed based on capability and availability
6. **Progressive Complexity** - Simple for beginners, powerful for experts
7. **Real-Time First** - Instant updates via WebSocket with swarm state sync
8. **API-First** - Every feature accessible via REST API
9. **MCP Native** - Model Context Protocol for extensible tool integration

---

## 3. Target Users & Use Cases

### 3.1 User Personas

#### Persona 1: Customer Support Manager
- **Role:** Manages support team using WhatsApp/Telegram
- **Needs:** Automated FAQs, escalation routing, knowledge base integration
- **Technical Level:** Low - prefers visual tools

#### Persona 2: Marketing Automation Specialist
- **Role:** Creates promotional campaigns across channels
- **Needs:** Scheduled broadcasts, personalized responses, analytics
- **Technical Level:** Medium - comfortable with logic flows

#### Persona 3: Developer/Integrator
- **Role:** Integrates messaging into existing systems
- **Needs:** APIs, webhooks, n8n integration, custom workflows
- **Technical Level:** High - prefers code and APIs

#### Persona 4: Small Business Owner
- **Role:** Handles all customer communication personally
- **Needs:** Simple auto-replies, appointment booking, order tracking
- **Technical Level:** Low - needs guided setup

### 3.2 Primary Use Cases

| Use Case | Description | Key Features Used |
|----------|-------------|-------------------|
| **Customer Support** | Automated FAQ, ticket routing, live handoff | FlowBuilder, AI Router, RAG |
| **Lead Generation** | Capture leads, qualify, route to sales | Message triggers, conditions |
| **Order Management** | Track orders, send updates, handle returns | Webhooks, HTTP nodes |
| **Appointment Booking** | Schedule, remind, reschedule appointments | Scheduler, reminders |
| **Marketing Campaigns** | Broadcast promotions, segment audiences | Scheduled triggers, loops |
| **Internal Communication** | Team notifications, status updates | Cross-agent calls, email |

---

## 4. System Architecture Overview

### 4.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         FRONTEND LAYER                               │
│  React 18 + TypeScript + Vite + Tailwind CSS                        │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐       │
│  │Dashboard│ │Messages │ │FlowBuild│ │   RAG   │ │Settings │       │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘       │
└────────────────────────────┬────────────────────────────────────────┘
                             │ REST API (3031) + WebSocket (3032)
┌────────────────────────────┴────────────────────────────────────────┐
│                         BACKEND LAYER                                │
│  Node.js + Express + CommonJS                                        │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    API GATEWAY                               │    │
│  │  Authentication │ Rate Limiting │ Routing │ Validation      │    │
│  └─────────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    SERVICE LAYER                             │    │
│  │ ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐    │    │
│  │ │  Agent    │ │Automation │ │    AI     │ │    RAG    │    │    │
│  │ │ Manager   │ │  Service  │ │  Router   │ │  Service  │    │    │
│  │ └───────────┘ └───────────┘ └───────────┘ └───────────┘    │    │
│  │ ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐    │    │
│  │ │   Email   │ │ Cross-Agt │ │Subscription│ │   Data    │    │    │
│  │ │  Service  │ │  Service  │ │  Service  │ │  Service  │    │    │
│  │ └───────────┘ └───────────┘ └───────────┘ └───────────┘    │    │
│  └─────────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                  PLATFORM CLIENTS                            │    │
│  │ ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐    │    │
│  │ │ WhatsApp  │ │ Telegram  │ │ Telegram  │ │   Email   │    │    │
│  │ │  Client   │ │Bot Client │ │User Client│ │  Client   │    │    │
│  │ └───────────┘ └───────────┘ └───────────┘ └───────────┘    │    │
│  └─────────────────────────────────────────────────────────────┘    │
└────────────────────────────┬────────────────────────────────────────┘
                             │
┌────────────────────────────┴────────────────────────────────────────┐
│                         DATA LAYER                                   │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐           │
│  │   SQLite    │     │    Redis    │     │   Qdrant    │           │
│  │ (Persistent)│     │   (Cache)   │     │  (Vectors)  │           │
│  └─────────────┘     └─────────────┘     └─────────────┘           │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.2 Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Frontend** | React 18, TypeScript, Vite | SPA with real-time updates |
| **Styling** | Tailwind CSS, Lucide Icons | Dark theme UI |
| **Flow Editor** | React Flow | Visual node-based editor |
| **Backend** | Node.js, Express | API server |
| **Module Format** | CommonJS (.cjs) | Node.js compatibility |
| **Database** | Better-SQLite3 | Persistent storage |
| **Cache** | Redis (ioredis) | Session, queues, pub/sub |
| **Vector DB** | Qdrant | RAG embeddings |
| **Real-Time** | Socket.IO | WebSocket communication |
| **WhatsApp** | whatsapp-web.js | WhatsApp Web protocol |
| **Telegram Bot** | node-telegram-bot-api | Bot API |
| **Telegram User** | telegram (MTProto) | User account API |
| **Email** | nodemailer, imap | SMTP/IMAP |

### 4.3 Communication Patterns

```
┌──────────────┐                    ┌──────────────┐
│   Frontend   │◄──── REST API ────►│   Backend    │
│              │◄──── WebSocket ───►│              │
└──────────────┘                    └──────────────┘
                                           │
                    ┌──────────────────────┼──────────────────────┐
                    ▼                      ▼                      ▼
           ┌──────────────┐       ┌──────────────┐       ┌──────────────┐
           │   WhatsApp   │       │   Telegram   │       │    Email     │
           │    Server    │       │    Server    │       │    Server    │
           └──────────────┘       └──────────────┘       └──────────────┘
```

---

## 5. Core Features

### 5.1 Feature Matrix

| Feature | Free | Pro | Enterprise |
|---------|------|-----|------------|
| Agents | 1 | Unlimited | Custom |
| Platforms | WhatsApp only | All | All + Custom |
| FlowBuilder | Basic nodes | All 160+ nodes | All + Custom |
| AI Responses | None | All providers | All + Custom |
| RAG Knowledge | None | 5 libraries | Unlimited |
| Auto-Responses | 10 | Unlimited | Unlimited |
| API Access | None | Full | Full + SLA |
| Team Sharing | None | Yes | Yes + RBAC |
| Support | Community | Email | Priority |

### 5.2 Feature Descriptions

#### 5.2.1 Multi-Agent Management
- Create multiple autonomous messaging agents
- Each agent manages one platform account
- Independent configuration per agent
- Agent sharing between users
- Status monitoring (connected/disconnected/connecting)

#### 5.2.2 Visual Flow Builder
- Drag-and-drop workflow creation
- 160+ node types across 13 categories
- Condition-based branching
- Loop and iteration support
- SubFlow composition
- Cross-agent communication
- Real-time execution preview

#### 5.2.3 AI Integration
- Multi-provider support (OpenRouter, Ollama, A1111)
- Intent-based model routing
- Cost tracking and budgets
- Conversation context management
- Streaming responses

#### 5.2.4 RAG Knowledge System
- Semantic document search
- Multi-source ingestion (upload, web, GitHub)
- Library organization
- Automatic message indexing
- Context injection for AI

#### 5.2.5 Real-Time Communication
- WebSocket for instant updates
- Live message streaming
- Flow execution progress
- Agent status changes
- Typing indicators

---

## 6. Platform Support

### 6.1 WhatsApp Integration

**Library:** whatsapp-web.js (Puppeteer-based)

**Authentication:**
- QR code scanning
- Session persistence
- Auto-reconnect

**Capabilities:**
| Feature | Supported |
|---------|-----------|
| Send text messages | Yes |
| Send media (image/video/audio/document) | Yes |
| Send location | Yes |
| Send contact | Yes |
| Send buttons | Yes (deprecated by WA) |
| Send list messages | Yes |
| Send polls | Yes |
| Receive messages | Yes |
| Message reactions | Yes |
| Message forwarding | Yes |
| Message deletion | Yes |
| Message editing | Yes |
| Read receipts | Yes |
| Typing indicators | Yes |
| Group management | Yes |
| Contact management | Yes |
| Status/Stories | Yes (view only) |

**Known Limitations:**
- No official API (uses reverse-engineered protocol)
- Session requires periodic re-authentication
- Rate limiting by WhatsApp
- `markedUnread` error (workaround implemented)

### 6.2 Telegram Bot Integration

**Library:** node-telegram-bot-api

**Authentication:**
- Bot token from BotFather

**Capabilities:**
| Feature | Supported |
|---------|-----------|
| Send text messages | Yes |
| Send media | Yes |
| Inline keyboards | Yes |
| Reply keyboards | Yes |
| Callback queries | Yes |
| Inline queries | Yes |
| Channel posting | Yes |
| Group management | Yes |
| User banning/restricting | Yes |
| Pinning messages | Yes |
| Polls | Yes |
| Stickers | Yes |

### 6.3 Telegram User Integration

**Library:** telegram (MTProto via GramJS)

**Authentication:**
- Phone number + OTP
- Two-factor authentication support
- Session string persistence

**Capabilities:**
- Full personal account access
- Private chat messaging
- Group participation
- Channel management
- Media handling

### 6.4 Email Integration

**Libraries:** nodemailer (SMTP), imap (IMAP)

**Authentication:**
- IMAP/SMTP credentials
- OAuth2 support (planned)
- Encrypted credential storage

**Capabilities:**
| Feature | Supported |
|---------|-----------|
| Send emails | Yes |
| Receive emails | Yes |
| Attachments | Yes |
| HTML content | Yes |
| Multiple accounts | Yes |
| Background sync | Yes |
| Folder management | Planned |

### 6.5 Unified Message Schema

All platforms convert to unified schema:

```typescript
interface UnifiedMessage {
  id: string;
  platform: 'whatsapp' | 'telegram-bot' | 'telegram-user' | 'email';
  direction: 'incoming' | 'outgoing';

  sender: {
    id: string;
    name: string;
    phone?: string;
    email?: string;
    username?: string;
  };

  chat: {
    id: string;
    type: 'private' | 'group' | 'channel';
    name?: string;
  };

  content: {
    text?: string;
    media?: MediaAttachment[];
    location?: { latitude: number; longitude: number };
    contact?: { phone: string; name: string };
    poll?: { question: string; options: string[] };
  };

  metadata: {
    timestamp: number;
    isForwarded: boolean;
    isReply: boolean;
    replyTo?: string;
    quotedMessage?: object;
  };

  platformData: object; // Original platform-specific data
}
```

---

## 7. Swarm Intelligence Features

### 7.1 Swarm Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SWARM ORCHESTRATOR                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │   Agent     │  │   Agent     │  │   Agent     │  │   Agent     │        │
│  │ Discovery   │  │   Health    │  │    Load     │  │  Consensus  │        │
│  │  Service    │  │  Monitor    │  │  Balancer   │  │   Engine    │        │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘        │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │
        ┌────────────────────────┼────────────────────────────────┐
        │                        │                                │
        ▼                        ▼                                ▼
┌───────────────┐        ┌───────────────┐                ┌───────────────┐
│   AGENT A     │◄──────►│   AGENT B     │◄──────────────►│   AGENT C     │
│  (WhatsApp)   │        │  (Telegram)   │                │   (Email)     │
│               │        │               │                │               │
│ Specialization│        │ Specialization│                │ Specialization│
│ • Sales       │        │ • Support     │                │ • Marketing   │
│ • Lead Gen    │        │ • Technical   │                │ • Newsletters │
│               │        │               │                │               │
│ Reputation: 92│        │ Reputation: 88│                │ Reputation: 95│
└───────┬───────┘        └───────┬───────┘                └───────┬───────┘
        │                        │                                │
        └────────────────────────┼────────────────────────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │   SHARED KNOWLEDGE      │
                    │   • Collective Memory   │
                    │   • Learned Patterns    │
                    │   • Best Responses      │
                    └─────────────────────────┘
```

### 7.2 Agent Collaboration Patterns

#### 7.2.1 Handoff Pattern
When an agent encounters a query outside its expertise, it hands off to a specialized agent.

```typescript
interface AgentHandoff {
  sourceAgentId: string;
  targetAgentId: string;
  reason: 'expertise' | 'capacity' | 'availability' | 'language';
  context: {
    conversationHistory: Message[];
    customerProfile: object;
    intentClassification: string;
  };
  priority: 'low' | 'medium' | 'high' | 'urgent';
}
```

#### 7.2.2 Collaboration Pattern
Multiple agents work together on complex queries requiring diverse expertise.

```typescript
interface SwarmCollaboration {
  collaborationId: string;
  initiatorAgentId: string;
  participantAgents: string[];
  task: {
    type: 'complex_query' | 'multi_step_workflow' | 'knowledge_synthesis';
    description: string;
    requiredCapabilities: string[];
  };
  contributions: Map<string, AgentContribution>;
  consensusRequired: boolean;
  timeout: number;
}
```

#### 7.2.3 Broadcast Pattern
One agent shares information with all agents in the swarm.

```typescript
interface SwarmBroadcast {
  sourceAgentId: string;
  messageType: 'alert' | 'knowledge_update' | 'policy_change' | 'learning';
  payload: object;
  priority: 'background' | 'normal' | 'important' | 'critical';
  expiresAt?: Date;
}
```

### 7.3 Agent Discovery & Registration

```typescript
interface AgentCapabilityProfile {
  agentId: string;

  // Specialization
  specializations: AgentSpecialization[];

  // Languages
  languages: {
    code: string;      // ISO 639-1
    proficiency: number; // 0-100
  }[];

  // Availability
  availability: {
    status: 'available' | 'busy' | 'away' | 'offline';
    currentLoad: number;      // 0-100%
    maxConcurrentChats: number;
    workingHours?: WorkingHours;
  };

  // Performance metrics
  performance: {
    averageResponseTime: number;  // ms
    resolutionRate: number;       // 0-100%
    customerSatisfaction: number; // 0-5
    handoffRate: number;          // 0-100%
  };

  // Updated timestamp
  lastHeartbeat: Date;
}

interface AgentSpecialization {
  domain: string;           // e.g., 'sales', 'support', 'billing'
  subDomains: string[];     // e.g., ['pricing', 'discounts', 'enterprise']
  confidence: number;       // 0-100
  trainedModels?: string[]; // Custom fine-tuned models
}
```

### 7.4 Dynamic Load Balancing

```
┌─────────────────────────────────────────────────────────────────┐
│                     LOAD BALANCER                                │
│                                                                  │
│  Incoming Message ──► Analyze Intent ──► Score Agents ──► Route │
│                                                                  │
│  Scoring Factors:                                                │
│  ┌─────────────────┬─────────────────┬─────────────────┐        │
│  │ Expertise Match │ Current Load    │ Response Time   │        │
│  │     (40%)       │     (30%)       │     (20%)       │        │
│  ├─────────────────┴─────────────────┴─────────────────┤        │
│  │            Customer Preference (10%)                 │        │
│  └─────────────────────────────────────────────────────┘        │
└─────────────────────────────────────────────────────────────────┘
```

**Load Balancing Strategies:**

| Strategy | Description | Use Case |
|----------|-------------|----------|
| **Round Robin** | Distribute evenly across agents | General traffic |
| **Weighted** | Route based on agent capacity | Mixed agent capabilities |
| **Least Connections** | Route to least busy agent | High-volume scenarios |
| **Expertise-Based** | Route to most qualified agent | Specialized queries |
| **Sticky Session** | Keep customer with same agent | Relationship building |
| **Failover** | Automatic reroute on agent failure | High availability |

### 7.5 Consensus Mechanisms

For decisions requiring agreement from multiple agents:

```typescript
interface ConsensusRequest {
  requestId: string;
  initiatorId: string;

  // Decision context
  decision: {
    type: 'response_approval' | 'escalation' | 'policy_exception' | 'knowledge_update';
    context: object;
    options: ConsensusOption[];
  };

  // Voting configuration
  votingConfig: {
    requiredParticipants: string[] | 'all' | 'majority';
    votingThreshold: number;      // Percentage needed to pass
    timeout: number;              // ms
    tieBreaker: 'initiator' | 'random' | 'highest_reputation';
  };

  // Results
  votes: Map<string, Vote>;
  status: 'pending' | 'passed' | 'rejected' | 'timeout';
}
```

### 7.6 Collective Learning

```
┌─────────────────────────────────────────────────────────────────┐
│                   COLLECTIVE LEARNING PIPELINE                   │
│                                                                  │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐           │
│  │ Interaction │──►│  Evaluate   │──►│   Share     │           │
│  │   Logged    │   │   Outcome   │   │  Learning   │           │
│  └─────────────┘   └─────────────┘   └──────┬──────┘           │
│                                              │                   │
│                    ┌─────────────────────────▼──────────────┐   │
│                    │         LEARNING TYPES                 │   │
│                    │  • Successful response patterns        │   │
│                    │  • Effective escalation triggers       │   │
│                    │  • Customer sentiment indicators       │   │
│                    │  • Intent classification improvements  │   │
│                    └─────────────────────────┬──────────────┘   │
│                                              │                   │
│  ┌─────────────┐   ┌─────────────┐   ┌──────▼──────┐           │
│  │   Update    │◄──│  Validate   │◄──│  Aggregate  │           │
│  │   Agents    │   │  Learning   │   │   Insights  │           │
│  └─────────────┘   └─────────────┘   └─────────────┘           │
└─────────────────────────────────────────────────────────────────┘
```

```typescript
interface CollectiveLearning {
  learningId: string;
  sourceAgentId: string;

  // What was learned
  learning: {
    type: 'pattern' | 'response' | 'routing' | 'sentiment';
    category: string;
    content: object;
    confidence: number;
  };

  // Validation
  validation: {
    successfulApplications: number;
    failedApplications: number;
    averageOutcomeScore: number;
  };

  // Distribution
  sharedWith: string[];       // Agent IDs
  adoptionRate: number;       // Percentage of agents using this
}
```

### 7.7 Agent Reputation System

```typescript
interface AgentReputation {
  agentId: string;

  // Overall score (0-100)
  overallScore: number;

  // Component scores
  components: {
    responseQuality: number;      // Based on customer feedback
    resolutionSpeed: number;      // Time to resolve
    collaborationScore: number;   // Effectiveness in swarm tasks
    reliabilityScore: number;     // Uptime and consistency
    learningContribution: number; // Valuable insights shared
  };

  // History
  history: ReputationEvent[];

  // Badges/achievements
  badges: ('top_performer' | 'fast_responder' | 'knowledge_leader' | 'team_player')[];
}
```

### 7.8 Swarm Health Dashboard

**Monitored Metrics:**

| Metric | Description | Alert Threshold |
|--------|-------------|-----------------|
| **Swarm Connectivity** | % of agents online and responsive | < 80% |
| **Average Load** | Mean load across all agents | > 85% |
| **Collaboration Rate** | % of queries involving multiple agents | Trend monitoring |
| **Consensus Success** | % of consensus requests resolved | < 90% |
| **Knowledge Sync** | Lag in collective knowledge propagation | > 5 minutes |
| **Handoff Latency** | Time to complete agent handoffs | > 10 seconds |

---

## 8. Multi-Agent Management

### 8.1 Agent Lifecycle

```
┌─────────┐    ┌─────────────┐    ┌──────────┐    ┌────────────┐    ┌────────┐
│ Created │───►│Authenticating│───►│  Ready   │───►│ Swarming   │───►│Archived│
└─────────┘    └─────────────┘    └──────────┘    └────────────┘    └────────┘
                     │                  │               │
                     ▼                  ▼               ▼
              ┌─────────────┐    ┌────────────┐  ┌────────────┐
              │   Failed    │    │Disconnected│  │  Isolated  │
              └─────────────┘    └────────────┘  └────────────┘
```

**States:**
- **Created** - Agent record exists, not authenticated
- **Authenticating** - Waiting for QR code/credentials
- **Ready** - Connected and operational (standalone mode)
- **Swarming** - Connected and participating in swarm collaboration
- **Isolated** - Temporarily removed from swarm (maintenance/testing)
- **Disconnected** - Temporarily offline
- **Failed** - Authentication failed
- **Archived** - Inactive for 7+ days

### 8.2 Agent Data Model

```typescript
interface Agent {
  agentId: string;           // Unique identifier (agent-{timestamp})
  name: string;              // Display name
  phoneNumber?: string;      // WhatsApp/Telegram phone
  platform: Platform;        // whatsapp | telegram-bot | telegram-user | email
  platformConfig: object;    // Platform-specific settings

  // Profile
  role?: string;
  department?: string;
  skills?: string[];

  // Swarm Configuration
  swarmConfig: {
    enabled: boolean;                    // Participate in swarm
    autoJoinSwarm: boolean;              // Auto-join on connect
    specializations: string[];           // Domain expertise
    acceptHandoffs: boolean;             // Accept work from other agents
    maxHandoffQueue: number;             // Max pending handoffs
    collaborationMode: 'active' | 'passive' | 'isolated';
  };

  // Reputation (from swarm interactions)
  reputation: {
    score: number;                       // 0-100
    totalInteractions: number;
    successfulHandoffs: number;
    contributedLearnings: number;
  };

  // Settings
  autoReconnect: boolean;
  maxConcurrentChats: number;
  workingHours?: WorkingHours;
  kbOnlyMode: boolean;       // Respond only with knowledge base

  // Security
  password?: string;         // Bcrypt hashed
  browserId: string;         // Owner browser session
  ownerId: string;           // Owner user ID
  supervisors?: string[];    // Supervisor user IDs

  // Status
  status: AgentStatus;
  swarmStatus: 'connected' | 'disconnected' | 'isolated';
  lastSeen?: Date;
  activeChats: number;
  messageCount: number;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}
```

### 8.3 Agent Isolation

**Browser ID Filtering:**
- Each browser session gets unique ID
- Agents filtered by browser ID on all queries
- Prevents cross-session data leakage

**Data Segregation:**
```
data/
├── agents.db              # Central agent profiles
├── subscriptions.db       # Billing data
└── agents/
    ├── agent-{id1}/
    │   ├── profile.json
    │   ├── session/       # Platform session
    │   └── media/         # Downloaded media
    └── agent-{id2}/
        └── ...
```

### 8.4 Agent Sharing

**Permission Levels:**
- **View** - See messages and flows
- **Send** - Send messages on behalf of agent
- **Manage** - Full control (edit, delete, configure)
- **Swarm Admin** - Manage agent's swarm participation and handoff rules

**Sharing Model:**
```typescript
interface AgentShare {
  agentId: string;
  sharedWith: string;      // User ID
  permission: 'view' | 'send' | 'manage' | 'swarm_admin';
  sharedAt: Date;
  sharedBy: string;        // Sharer user ID
}
```

---

## 9. FlowBuilder Automation Engine

### 9.1 Flow Structure

```typescript
interface Flow {
  id: string;
  name: string;
  description?: string;
  active: boolean;

  // Trigger configuration
  trigger: {
    type: TriggerType;
    config: TriggerConfig;
  };

  // Visual representation
  nodes: FlowNode[];
  edges: FlowEdge[];
  viewport: { x: number; y: number; zoom: number };

  // Metadata
  metadata: {
    createdAt: string;
    updatedAt: string;
    lastRunAt?: string;
    runCount: number;
    lastStatus?: 'success' | 'error';
  };
}
```

### 9.2 Node Categories

#### 8.2.1 Triggers (6 types)

| Node | Description | Config |
|------|-------------|--------|
| **Message Trigger** | Incoming message matching pattern | pattern, patternType, source |
| **Time Trigger** | Cron-based scheduling | cronExpression, timezone |
| **Webhook Trigger** | HTTP POST endpoint | path, method, headers |
| **Event Trigger** | System/custom events | eventType, filters |
| **Email Trigger** | Incoming email | account, filters |
| **Cross-Agent Trigger** | Call from another agent | accessControl, inputSchema |

#### 8.2.2 Actions - WhatsApp (11 types)

| Node | Description |
|------|-------------|
| **Send Message** | Text message with optional mentions |
| **Send Media** | Image/video/audio/document |
| **Send Location** | GPS coordinates with name |
| **Send Contact** | vCard contact |
| **Send Buttons** | Interactive buttons (deprecated) |
| **Send List** | List message with sections |
| **Send Poll** | Poll with options |
| **React Message** | Add emoji reaction |
| **Forward Message** | Forward to another chat |
| **Delete Message** | Delete for everyone |
| **Edit Message** | Edit sent message |

#### 8.2.3 Actions - Telegram (35+ types)

**Messaging:**
- Send Message, Media, Sticker, Document
- Send Location, Venue, Contact, Poll
- Edit Message, Delete Message
- Pin/Unpin Message

**Interactive:**
- Inline Keyboard, Reply Keyboard
- Remove Keyboard, Answer Callback
- Answer Inline Query

**Administration:**
- Ban User, Kick User, Restrict User
- Promote Admin, Demote Admin
- Get Chat Info, Get Chat Members

#### 8.2.4 Control Flow (6 types)

| Node | Description |
|------|-------------|
| **Condition** | If/else branching |
| **Switch** | Multi-way branching |
| **Loop** | Iterate over array |
| **Delay** | Pause execution |
| **SubFlow** | Call another flow |
| **Cross-Agent Call** | Call flow on different agent |

#### 8.2.5 AI Nodes (7 types)

| Node | Description |
|------|-------------|
| **AI Response** | Generate response using LLM |
| **AI Router** | Route to model by intent |
| **AI Extract** | Extract structured data |
| **AI Intent** | Classify message intent |
| **AI Translate** | Translate text |
| **Transcribe Audio** | Speech to text |
| **Text to Speech** | Text to audio |

#### 8.2.6 Data Nodes (15 types)

| Node | Description |
|------|-------------|
| **Set Variable** | Define custom variable |
| **JSON Merge** | Combine JSON objects |
| **JSON Path** | Extract JSON value |
| **JSON Stringify** | Convert to string |
| **String Split** | Split string to array |
| **String Template** | Template substitution |
| **Regex Extract** | Extract with regex |
| **Regex Replace** | Replace with regex |
| **Base64 Encode/Decode** | Encoding |
| **URL Encode/Decode** | URL encoding |

### 9.3 Variable System

**Built-in Variables:**
```javascript
// Trigger context
{{triggerMessage}}        // Original message text
{{triggerSender}}         // Sender info object
{{triggerChatId}}         // Chat ID
{{triggerTimestamp}}      // Message timestamp
{{triggerPlatform}}       // Platform name

// Flow context
{{flowId}}                // Current flow ID
{{flowName}}              // Flow name
{{executionId}}           // Unique execution ID

// Agent context
{{agentId}}               // Current agent ID
{{agentName}}             // Agent name
{{agentPhone}}            // Agent phone number
```

**Node Output Variables:**
```javascript
// Access previous node outputs
{{results.nodeId.field}}  // Specific field
{{results.nodeId}}        // Entire output

// Examples
{{results.aiResponse.text}}
{{results.fetchData.body.name}}
{{results.condition.matched}}
```

**Variable Resolution:**
```javascript
// Supports nested paths
{{user.profile.name}}

// Array indexing
{{items[0].title}}

// Default values
{{user.name || "Guest"}}
```

### 9.4 Execution Engine

**Execution Flow:**
```
1. Trigger fires (message/schedule/webhook/event)
2. Create execution context with trigger data
3. Execute nodes in topological order
4. For each node:
   a. Resolve input variables
   b. Execute node action
   c. Store output in results
   d. Determine next nodes (edges)
5. Handle errors (catch, retry, fallback)
6. Log execution history
7. Emit completion event
```

**Error Handling:**
- Node-level try/catch
- Configurable retry (count, delay, backoff)
- Fallback flow execution
- Error notification via webhook

**Execution Limits:**
- Timeout: 5 minutes default (configurable)
- Max nodes per execution: 500
- Max loop iterations: 1000
- Max concurrent executions per agent: 10

---

## 10. AI & Intelligence Layer

### 10.1 AI Router Architecture

```
┌─────────────┐
│   Message   │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────┐
│         INTENT CLASSIFIER           │
│  ┌──────────────────────────────┐   │
│  │ Check intent cache (24h TTL) │   │
│  └──────────────┬───────────────┘   │
│                 │ miss              │
│  ┌──────────────▼───────────────┐   │
│  │   Classify with classifier   │   │
│  │   model (fast, cheap)        │   │
│  └──────────────┬───────────────┘   │
│                 │                   │
│  ┌──────────────▼───────────────┐   │
│  │   Cache high-confidence      │   │
│  │   classifications            │   │
│  └──────────────────────────────┘   │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│         CATEGORY MAPPING            │
│  intent → model/provider selection  │
│                                     │
│  "technical" → claude-3-sonnet      │
│  "sales" → gpt-4o                   │
│  "general" → deepseek-chat          │
│  "code" → claude-3-opus             │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│         MODEL EXECUTION             │
│  - Build prompt with context        │
│  - Include RAG results if enabled   │
│  - Stream response                  │
│  - Track cost                       │
└─────────────────────────────────────┘
```

### 10.2 Supported AI Providers

**OpenRouter (Primary):**
```typescript
interface OpenRouterConfig {
  apiKey: string;
  baseUrl: string;  // https://openrouter.ai/api/v1
  defaultModel: string;

  // Rate limits
  requestsPerMinute: number;
  tokensPerMinute: number;

  // Cost tracking
  budgetLimit?: number;
  alertThreshold?: number;
}
```

**Available Models (40+):**
- DeepSeek Chat (free tier)
- Gemini 2.0 Flash
- Claude 3 (Haiku, Sonnet, Opus)
- GPT-4o, GPT-4o-mini
- Llama 3.1 (8B, 70B, 405B)
- Mistral models
- And more...

**Local Providers:**
```typescript
interface OllamaConfig {
  baseUrl: string;  // http://localhost:11434
  models: string[];  // Available local models
}

interface A1111Config {
  baseUrl: string;  // Stable Diffusion API
  models: ['clip', 'deepbooru'];  // Image analysis
}
```

### 10.3 AI Response Configuration

```typescript
interface AIResponseConfig {
  // Model selection
  provider: 'openrouter' | 'ollama' | 'a1111';
  model: string;

  // Prompt engineering
  systemPrompt?: string;
  userPromptTemplate?: string;
  includeHistory: boolean;
  historyLength: number;

  // RAG integration
  enableRAG: boolean;
  ragLibraries?: string[];
  ragTopK: number;

  // Generation parameters
  temperature: number;       // 0.0 - 2.0
  maxTokens: number;
  topP: number;
  frequencyPenalty: number;
  presencePenalty: number;

  // Output
  outputVariable: string;
  streaming: boolean;
}
```

### 10.4 Cost Tracking

```typescript
interface AIUsageLog {
  id: number;
  agentId: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalCost: number;      // USD
  timestamp: Date;
  intentCategory?: string;
  flowId?: string;
}

// Cost calculation
const costPerMillionTokens = {
  'deepseek/deepseek-chat': { input: 0.14, output: 0.28 },
  'anthropic/claude-3-sonnet': { input: 3.0, output: 15.0 },
  'openai/gpt-4o': { input: 5.0, output: 15.0 },
  // ...
};
```

### 10.5 MCP (Model Context Protocol) Integration

SwarmAI integrates the Model Context Protocol (MCP) for extensible tool usage, enabling agents to interact with external services and perform complex operations.

```
┌─────────────────────────────────────────────────────────────────┐
│                      MCP ARCHITECTURE                            │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    MCP HOST (SwarmAI)                    │    │
│  │  ┌───────────┐  ┌───────────┐  ┌───────────┐           │    │
│  │  │  Agent A  │  │  Agent B  │  │  Agent C  │           │    │
│  │  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘           │    │
│  │        │              │              │                  │    │
│  │        └──────────────┼──────────────┘                  │    │
│  │                       ▼                                  │    │
│  │  ┌─────────────────────────────────────────────────┐    │    │
│  │  │              MCP CLIENT MANAGER                  │    │    │
│  │  │  - Server discovery & connection                 │    │    │
│  │  │  - Tool capability caching                       │    │    │
│  │  │  - Request routing & load balancing             │    │    │
│  │  └─────────────────────┬───────────────────────────┘    │    │
│  └─────────────────────────┼───────────────────────────────┘    │
│                            │                                     │
│           ┌────────────────┼────────────────┐                   │
│           ▼                ▼                ▼                   │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐            │
│  │  MCP Server  │ │  MCP Server  │ │  MCP Server  │            │
│  │  (Database)  │ │  (Calendar)  │ │   (Custom)   │            │
│  └──────────────┘ └──────────────┘ └──────────────┘            │
└─────────────────────────────────────────────────────────────────┘
```

**MCP Configuration:**

```typescript
interface MCPConfig {
  // Server definitions
  servers: MCPServerConfig[];

  // Global settings
  settings: {
    toolTimeout: number;        // ms
    maxConcurrentCalls: number;
    retryPolicy: RetryPolicy;
  };

  // Agent-specific permissions
  agentPermissions: Map<string, MCPPermission[]>;
}

interface MCPServerConfig {
  name: string;
  transport: 'stdio' | 'http' | 'websocket';
  command?: string;           // For stdio transport
  url?: string;               // For http/websocket
  env?: Record<string, string>;
  capabilities: string[];     // Enabled capabilities
}

interface MCPPermission {
  serverId: string;
  tools: string[] | '*';      // Allowed tools
  resources: string[] | '*';  // Allowed resources
  rateLimit?: {
    maxCalls: number;
    windowMs: number;
  };
}
```

**Built-in MCP Servers:**

| Server | Capabilities | Description |
|--------|-------------|-------------|
| **database** | query, insert, update | SQL database operations |
| **calendar** | read, create, update | Google/Outlook calendar |
| **email** | send, search, read | Email operations |
| **filesystem** | read, write, list | File system access |
| **browser** | navigate, screenshot, extract | Web browser automation |
| **slack** | post, read, react | Slack integration |

### 10.6 Multimodal Capabilities

SwarmAI supports multimodal AI interactions including vision, audio, and document processing.

```typescript
interface MultimodalConfig {
  // Vision capabilities
  vision: {
    enabled: boolean;
    providers: ('openai' | 'anthropic' | 'google' | 'local')[];
    maxImageSize: number;      // bytes
    supportedFormats: string[]; // ['jpg', 'png', 'gif', 'webp']
    autoProcess: boolean;      // Process images in incoming messages
  };

  // Audio capabilities
  audio: {
    enabled: boolean;
    speechToText: {
      provider: 'whisper' | 'google' | 'azure';
      model: string;
      languages: string[];
    };
    textToSpeech: {
      provider: 'elevenlabs' | 'google' | 'azure';
      defaultVoice: string;
      outputFormat: 'mp3' | 'ogg' | 'wav';
    };
  };

  // Document understanding
  documents: {
    enabled: boolean;
    pdfOCR: boolean;
    tableExtraction: boolean;
    diagramUnderstanding: boolean;
  };
}
```

**Multimodal Pipeline:**

```
┌─────────────────────────────────────────────────────────────────┐
│                   MULTIMODAL PROCESSING                          │
│                                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │    IMAGE    │  │    AUDIO    │  │   DOCUMENT  │             │
│  │   INPUT     │  │   INPUT     │  │    INPUT    │             │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘             │
│         │                │                │                     │
│         ▼                ▼                ▼                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │   Vision    │  │   Whisper   │  │    OCR +    │             │
│  │    Model    │  │   (STT)     │  │   Parser    │             │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘             │
│         │                │                │                     │
│         └────────────────┼────────────────┘                     │
│                          ▼                                      │
│  ┌───────────────────────────────────────────────────────┐     │
│  │              UNIFIED CONTEXT BUILDER                   │     │
│  │  Combines text, vision descriptions, transcripts,      │     │
│  │  and document content into coherent AI prompt         │     │
│  └───────────────────────────────────────────────────────┘     │
│                          │                                      │
│                          ▼                                      │
│  ┌───────────────────────────────────────────────────────┐     │
│  │              MULTIMODAL AI RESPONSE                    │     │
│  │  Generates response using full multimodal context      │     │
│  └───────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
```

**FlowBuilder Multimodal Nodes:**

| Node | Description | Inputs | Outputs |
|------|-------------|--------|---------|
| **Analyze Image** | Extract info from images | Image URL/Base64 | Description, objects, text |
| **Transcribe Audio** | Convert speech to text | Audio file/URL | Transcript, language |
| **Text to Speech** | Generate audio from text | Text, voice | Audio file |
| **Parse Document** | Extract content from docs | PDF/DOCX | Structured content |
| **Image Generation** | Create images from prompts | Text prompt | Image URL |

### 10.7 Swarm AI Coordination

AI capabilities enhanced for swarm operations:

```typescript
interface SwarmAIConfig {
  // Collaborative reasoning
  collaboration: {
    enabled: boolean;
    multiAgentReasoning: boolean;     // Multiple agents contribute to response
    consensusThreshold: number;        // Agreement level needed
    specialistRouting: boolean;        // Route to specialist agents
  };

  // Shared context
  sharedContext: {
    enabled: boolean;
    contextScope: 'conversation' | 'session' | 'global';
    maxSharedTokens: number;
    privacyFilters: string[];          // Fields to exclude from sharing
  };

  // Learning propagation
  learningPropagation: {
    enabled: boolean;
    autoShare: boolean;                // Auto-share successful patterns
    validationRequired: boolean;       // Require validation before adoption
    propagationDelay: number;          // ms before sharing
  };
}
```

---

## 11. Knowledge Management (RAG)

### 11.1 RAG Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     INGESTION PIPELINE                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │  Upload  │  │   Web    │  │  GitHub  │  │  Manual  │    │
│  │  Files   │  │  Scrape  │  │  Import  │  │   Q&A    │    │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘    │
│       │             │             │             │           │
│       └─────────────┴──────┬──────┴─────────────┘           │
│                            ▼                                 │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              DOCUMENT PARSER                         │    │
│  │  PDF → text | DOCX → text | HTML → text | etc.      │    │
│  └─────────────────────────┬───────────────────────────┘    │
│                            ▼                                 │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              TEXT CHUNKER                            │    │
│  │  Split into semantic chunks (500-1000 tokens)       │    │
│  └─────────────────────────┬───────────────────────────┘    │
│                            ▼                                 │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              EMBEDDING GENERATOR                     │    │
│  │  OpenRouter / Local embedding model                 │    │
│  └─────────────────────────┬───────────────────────────┘    │
│                            ▼                                 │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              VECTOR STORAGE                          │    │
│  │  Qdrant: Store vectors + metadata                   │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                     QUERY PIPELINE                           │
│  ┌──────────┐                                               │
│  │  Query   │                                               │
│  └────┬─────┘                                               │
│       ▼                                                      │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              QUERY EMBEDDING                         │    │
│  │  Same model as ingestion                            │    │
│  └─────────────────────────┬───────────────────────────┘    │
│                            ▼                                 │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              SIMILARITY SEARCH                       │    │
│  │  Qdrant: Find top-K similar chunks                  │    │
│  └─────────────────────────┬───────────────────────────┘    │
│                            ▼                                 │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              RESULT RANKING                          │    │
│  │  Score threshold, deduplication, reranking          │    │
│  └─────────────────────────┬───────────────────────────┘    │
│                            ▼                                 │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              CONTEXT INJECTION                       │    │
│  │  Add to AI prompt as context                        │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### 11.2 Library Data Model

```typescript
interface RAGLibrary {
  id: string;
  userId: string;
  name: string;
  description?: string;

  // Organization
  folders: RAGFolder[];

  // Settings
  embeddingProvider: string;
  embeddingModel: string;
  chunkSize: number;
  chunkOverlap: number;

  // Statistics
  documentCount: number;
  chunkCount: number;
  totalSize: number;  // bytes

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

interface RAGDocument {
  id: string;
  libraryId: string;
  folderId?: string;

  // Source
  fileName: string;
  fileType: string;
  fileSize: number;
  sourceType: 'upload' | 'web' | 'github' | 'manual';
  sourceUrl?: string;

  // Processing
  status: 'pending' | 'processing' | 'indexed' | 'failed';
  chunkCount: number;
  errorMessage?: string;

  // Metadata
  metadata: Record<string, any>;

  // Timestamps
  indexedAt?: Date;
  expiresAt?: Date;
}
```

### 11.3 Ingestion Sources

**File Upload:**
- Supported: PDF, DOCX, XLSX, TXT, CSV, MD
- OCR for scanned PDFs (Tesseract)
- Max file size: 50MB

**Web Scraping:**
- Single page or domain crawl
- Depth limit: 3 levels
- Rate limiting: 1 req/sec
- Respects robots.txt

**GitHub Import:**
- Public/private repositories
- Selective file patterns
- Branch selection
- Token authentication

**Manual Q&A:**
- Direct question-answer pairs
- Bulk import via CSV
- Markdown formatting

### 11.4 RAG Query Node

```typescript
interface RAGQueryConfig {
  // Query source
  queryMode: 'smart' | 'direct' | 'field';
  queryField?: string;  // Variable for query text

  // Library selection
  libraries: string[];  // Library IDs

  // Search parameters
  topK: number;         // Number of results (1-20)
  scoreThreshold: number; // Minimum similarity (0-1)

  // Output
  outputVariable: string;
  includeMetadata: boolean;
  includeScores: boolean;
}
```

---

## 12. Data Architecture

### 12.1 Database Schema

#### agents.db (Central Database)

```sql
-- Agent profiles
CREATE TABLE agent_profiles (
  agent_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone_number TEXT,
  platform TEXT NOT NULL,
  platform_config TEXT,  -- JSON
  role TEXT,
  department TEXT,
  skills TEXT,  -- JSON array
  max_concurrent_chats INTEGER DEFAULT 5,
  auto_reconnect INTEGER DEFAULT 1,
  browser_id TEXT,
  owner_id TEXT,
  supervisors TEXT,  -- JSON array
  working_hours TEXT,  -- JSON
  status TEXT DEFAULT 'disconnected',
  kb_only_mode INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Messages
CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,
  phone_number TEXT,
  chat_id TEXT NOT NULL,
  sender TEXT NOT NULL,
  message_text TEXT,
  message_type TEXT DEFAULT 'text',
  media_url TEXT,
  platform TEXT,
  timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
  indexed_for_rag INTEGER DEFAULT 0,
  FOREIGN KEY (agent_id) REFERENCES agent_profiles(agent_id)
);

-- Contacts
CREATE TABLE contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,
  contact_number TEXT NOT NULL,
  contact_name TEXT,
  tags TEXT,  -- JSON array
  notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(agent_id, contact_number)
);

-- Auto-responses
CREATE TABLE auto_responses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,
  keyword TEXT NOT NULL,
  pattern_type TEXT DEFAULT 'contains',
  response_text TEXT NOT NULL,
  response_media TEXT,
  enabled INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Automation flows
CREATE TABLE automation_flows (
  id TEXT PRIMARY KEY,
  phone_number TEXT NOT NULL,
  agent_id TEXT,
  name TEXT NOT NULL,
  description TEXT,
  active INTEGER DEFAULT 1,
  trigger_type TEXT,
  trigger_config TEXT,  -- JSON
  nodes TEXT,  -- JSON array
  edges TEXT,  -- JSON array
  viewport TEXT,  -- JSON
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  last_run_at TEXT,
  run_count INTEGER DEFAULT 0,
  last_status TEXT
);

-- Automation executions
CREATE TABLE automation_executions (
  id TEXT PRIMARY KEY,
  flow_id TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
  duration INTEGER,
  is_manual INTEGER DEFAULT 0,
  success INTEGER,
  error TEXT,
  node_results TEXT,  -- JSON
  FOREIGN KEY (flow_id) REFERENCES automation_flows(id)
);

-- AI usage tracking
CREATE TABLE ai_usage_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  total_cost REAL,
  intent_category TEXT,
  flow_id TEXT,
  timestamp TEXT DEFAULT CURRENT_TIMESTAMP
);
```

#### subscriptions.db

```sql
-- Subscriptions
CREATE TABLE subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL UNIQUE,
  plan TEXT NOT NULL DEFAULT 'free',
  status TEXT DEFAULT 'active',
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  agent_slots INTEGER DEFAULT 1,
  current_period_start TEXT,
  current_period_end TEXT,
  cancel_at_period_end INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Payments
CREATE TABLE payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subscription_id INTEGER,
  amount REAL,
  currency TEXT DEFAULT 'USD',
  status TEXT,
  stripe_payment_id TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (subscription_id) REFERENCES subscriptions(id)
);
```

#### rag.db (Per-User)

```sql
-- Libraries
CREATE TABLE libraries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  embedding_provider TEXT DEFAULT 'openrouter',
  embedding_model TEXT DEFAULT 'text-embedding-3-small',
  chunk_size INTEGER DEFAULT 500,
  chunk_overlap INTEGER DEFAULT 50,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Documents
CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  library_id TEXT NOT NULL,
  folder_id TEXT,
  file_name TEXT NOT NULL,
  file_type TEXT,
  file_size INTEGER,
  source_type TEXT NOT NULL,
  source_url TEXT,
  status TEXT DEFAULT 'pending',
  chunk_count INTEGER DEFAULT 0,
  error_message TEXT,
  metadata TEXT,  -- JSON
  indexed_at TEXT,
  expires_at TEXT,
  FOREIGN KEY (library_id) REFERENCES libraries(id)
);

-- Folders
CREATE TABLE folders (
  id TEXT PRIMARY KEY,
  library_id TEXT NOT NULL,
  parent_id TEXT,
  name TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (library_id) REFERENCES libraries(id)
);
```

### 12.2 Redis Data Structures

```
# Session management
session:{browserId}           → JSON (user session data)
session:{browserId}:agents    → SET (agent IDs)

# Message queues
queue:{agentId}:incoming      → LIST (pending messages)
queue:{agentId}:outgoing      → LIST (messages to send)

# Cross-agent communication
crossagent:{agentId}:calls    → LIST (pending calls)
crossagent:{callId}:response  → STRING (call response, TTL 60s)
crossagent:{agentId}:triggers → HASH (registered triggers)

# Rate limiting
ratelimit:{agentId}:minute    → INT (request count, TTL 60s)
ratelimit:{agentId}:hour      → INT (request count, TTL 3600s)

# AI Router cache
intent:{hash}                 → JSON (cached classification, TTL 24h)

# Flow execution
execution:{executionId}       → JSON (execution state)
execution:{executionId}:nodes → HASH (node results)

# Real-time updates
pubsub:agent:{agentId}        → Channel (status updates)
pubsub:user:{userId}          → Channel (notifications)
```

### 12.3 Qdrant Collections

```
# RAG document embeddings
collection: rag_{userId}_{libraryId}
├── vector: float[1536]  (embedding dimension)
├── payload:
│   ├── documentId: string
│   ├── chunkIndex: int
│   ├── text: string
│   ├── metadata: object
│   └── timestamp: int
```

---

## 13. API Specifications

### 13.1 API Overview

**Base URL:** `http://localhost:3031/api`

**Authentication:**
- JWT in httpOnly cookie (browser)
- API Key in `X-API-Key` header (programmatic)

**Response Format:**
```typescript
// Success
{
  success: true,
  data: T,
  message?: string
}

// Error
{
  success: false,
  error: string,
  code?: string,
  details?: object
}
```

### 13.2 Core Endpoints

#### Agent Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/agents` | List all agents for user |
| POST | `/agents` | Create new agent |
| GET | `/agents/:id` | Get agent details |
| PUT | `/agents/:id` | Update agent |
| DELETE | `/agents/:id` | Delete agent |
| POST | `/agents/:id/connect` | Start authentication |
| GET | `/agents/:id/qr` | Get QR code (WhatsApp) |
| POST | `/agents/:id/disconnect` | Disconnect agent |

#### Messaging

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/agents/:id/messages` | List messages |
| POST | `/agents/:id/messages/send` | Send message |
| GET | `/agents/:id/chats` | List chats |
| GET | `/agents/:id/chats/:chatId/history` | Chat history |

#### Automation

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/agents/:id/automation/flows` | List flows |
| POST | `/agents/:id/automation/flows` | Create flow |
| GET | `/agents/:id/automation/flows/:flowId` | Get flow |
| PUT | `/agents/:id/automation/flows/:flowId` | Update flow |
| DELETE | `/agents/:id/automation/flows/:flowId` | Delete flow |
| POST | `/agents/:id/automation/flows/:flowId/toggle` | Enable/disable |
| POST | `/agents/:id/automation/flows/:flowId/execute` | Manual run |

#### RAG

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/rag/libraries` | List libraries |
| POST | `/rag/libraries` | Create library |
| GET | `/rag/documents` | List documents |
| POST | `/rag/documents/upload` | Upload files |
| POST | `/rag/import/web` | Web scrape |
| POST | `/rag/search` | Query documents |

### 13.3 WebSocket Events

**Connection:** `ws://localhost:3032`

**Client → Server:**
```javascript
// Subscribe to agent updates
socket.emit('subscribe', { agentId: 'agent-123' });

// Send message
socket.emit('sendMessage', {
  agentId: 'agent-123',
  chatId: '1234567890@c.us',
  message: 'Hello'
});
```

**Server → Client:**
```javascript
// Agent status change
socket.on('agentStatus', { agentId, status, timestamp });

// New message
socket.on('message', { agentId, chatId, message });

// QR code generated
socket.on('qr', { agentId, qrCode });

// Flow execution update
socket.on('flowExecution', { executionId, status, nodeId, result });
```

---

## 14. Frontend Components

### 14.1 Component Hierarchy

```
App
├── Layout
│   ├── Sidebar
│   │   ├── Logo
│   │   ├── Navigation
│   │   └── UserMenu
│   └── MainContent
│       ├── Dashboard
│       │   ├── AgentCards
│       │   ├── QuickStats
│       │   └── RecentActivity
│       ├── Messages
│       │   ├── ChatList
│       │   ├── ChatWindow
│       │   │   ├── MessageList
│       │   │   └── MessageInput
│       │   └── ContactInfo
│       ├── FlowBuilder
│       │   ├── FlowSidebar (node palette)
│       │   ├── FlowCanvas (React Flow)
│       │   └── NodeConfigPanel
│       ├── RAG
│       │   ├── LibraryList
│       │   ├── DocumentGrid
│       │   └── IngestionModal
│       └── Settings
│           ├── ProfileSettings
│           ├── AISettings
│           └── SubscriptionSettings
└── Modals
    ├── CreateAgentModal
    ├── QRCodeModal
    └── ConfirmDialog
```

### 14.2 Key Components

| Component | Purpose | Key Features |
|-----------|---------|--------------|
| `AgentCard` | Display agent info | Status indicator, quick actions |
| `ChatWindow` | Messaging interface | Real-time updates, media preview |
| `FlowCanvas` | Flow editor | Drag-drop, zoom, pan |
| `NodeConfigPanel` | Node settings | Dynamic form based on type |
| `LibraryList` | RAG library navigation | Folder tree, search |
| `DocumentGrid` | Document display | Thumbnails, metadata |

### 14.3 State Management

```typescript
// Using React Context + hooks
interface AppState {
  // Auth
  user: User | null;
  isAuthenticated: boolean;

  // Agents
  agents: Agent[];
  currentAgent: Agent | null;

  // Messages
  chats: Chat[];
  messages: Map<string, Message[]>;

  // Flows
  flows: Flow[];
  selectedFlow: Flow | null;
  editingNodes: Node[];
  editingEdges: Edge[];

  // RAG
  libraries: Library[];
  documents: Document[];

  // UI
  sidebarOpen: boolean;
  activeTab: string;
  notifications: Notification[];
}
```

---

## 15. Security & Authentication

### 15.1 Authentication Flow

```
┌─────────┐         ┌─────────┐         ┌─────────┐
│ Browser │         │  Server │         │   DB    │
└────┬────┘         └────┬────┘         └────┬────┘
     │                   │                   │
     │ POST /auth/login  │                   │
     │ {email, password} │                   │
     │──────────────────►│                   │
     │                   │ Verify credentials│
     │                   │──────────────────►│
     │                   │◄──────────────────│
     │                   │                   │
     │                   │ Generate JWT      │
     │                   │ Set httpOnly cookie
     │ 200 OK            │                   │
     │ Set-Cookie: token │                   │
     │◄──────────────────│                   │
     │                   │                   │
     │ GET /api/agents   │                   │
     │ Cookie: token     │                   │
     │──────────────────►│                   │
     │                   │ Verify JWT        │
     │                   │ Extract user      │
     │ 200 OK            │                   │
     │ {agents: [...]}   │                   │
     │◄──────────────────│                   │
```

### 15.2 Security Measures

| Measure | Implementation |
|---------|---------------|
| **Password Hashing** | bcrypt (12 rounds) |
| **Session Tokens** | JWT with httpOnly cookies |
| **API Keys** | UUID v4, stored hashed |
| **Rate Limiting** | Token bucket (100 req/min) |
| **Input Validation** | Express-validator schemas |
| **SQL Injection** | Parameterized queries |
| **XSS Prevention** | Content-Security-Policy |
| **CORS** | Whitelist allowed origins |
| **Credential Encryption** | AES-256 for email creds |

### 15.3 Master User System

```typescript
interface MasterUserConfig {
  // Phone numbers with elevated access
  masterNumbers: string[];

  // Command prefix
  commandPrefix: '/';

  // Available commands
  commands: {
    '/send': 'Send message to any chat',
    '/status': 'Get agent status',
    '/groups': 'List all groups',
    '/broadcast': 'Send to multiple chats',
    '/help': 'Show available commands'
  };
}
```

---

## 16. Subscription & Licensing

### 16.1 Plan Tiers

| Feature | Free | Pro ($29/mo) | Enterprise |
|---------|------|--------------|------------|
| Agents | 1 | Unlimited | Custom |
| Agent Slots | - | $10/slot/mo | Included |
| Platforms | WhatsApp | All | All + Custom |
| Auto-Responses | 10 | Unlimited | Unlimited |
| FlowBuilder | Basic | All nodes | All + Custom |
| AI Integration | No | Yes | Yes |
| RAG Libraries | No | 5 | Unlimited |
| API Access | No | Yes | Yes + SLA |
| Support | Community | Email | Priority |

### 16.2 Billing Integration

**Payment Provider:** Stripe

**Billing Cycle:**
- Monthly subscription
- Usage-based add-ons (agent slots)
- Prorated upgrades/downgrades

**Stripe Objects:**
```typescript
// Customer
stripe.customers.create({
  email: user.email,
  metadata: { userId: user.id }
});

// Subscription
stripe.subscriptions.create({
  customer: stripeCustomerId,
  items: [{ price: planPriceId }],
  payment_behavior: 'default_incomplete'
});

// Metered usage (AI tokens)
stripe.subscriptionItems.createUsageRecord(
  subscriptionItemId,
  { quantity: tokenCount }
);
```

### 16.3 Feature Gating

```typescript
// Middleware for subscription checks
function requireSubscription(feature: string) {
  return async (req, res, next) => {
    const subscription = await getSubscription(req.user.id);

    if (!canAccess(subscription, feature)) {
      return res.status(403).json({
        error: 'Subscription required',
        feature,
        upgradeUrl: '/settings/subscription'
      });
    }

    next();
  };
}

// Usage
app.post('/api/ai/generate',
  requireSubscription('ai'),
  aiGenerateHandler
);
```

---

## 17. Deployment Architecture

### 17.1 Docker Compose

```yaml
version: '3.8'

services:
  frontend:
    build:
      context: .
      dockerfile: Dockerfile.frontend
    ports:
      - "127.0.0.1:3033:80"
    depends_on:
      - backend

  backend:
    build:
      context: .
      dockerfile: Dockerfile.backend
    ports:
      - "127.0.0.1:3031:3031"
      - "127.0.0.1:3032:3032"
    environment:
      - NODE_ENV=production
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - QDRANT_URL=http://qdrant:6334
    volumes:
      - ./data:/usr/src/app/data
    depends_on:
      - redis
      - qdrant

  redis:
    image: redis:7-alpine
    ports:
      - "127.0.0.1:6380:6379"
    volumes:
      - redis-data:/data

  qdrant:
    image: qdrant/qdrant
    ports:
      - "127.0.0.1:6333:6333"
    volumes:
      - qdrant-data:/qdrant/storage

volumes:
  redis-data:
  qdrant-data:
```

### 17.2 Environment Variables

```bash
# Server
PORT=3031
WS_PORT=3032
NODE_ENV=production

# Database
REDIS_HOST=redis
REDIS_PORT=6379
QDRANT_URL=http://qdrant:6334

# AI Providers
OPENROUTER_API_KEY=sk-or-...
OLLAMA_BASE_URL=http://localhost:11434

# Authentication
JWT_SECRET=your-secret-key
ENCRYPTION_KEY=32-byte-hex-key

# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Security
MASTER_NUMBERS=1234567890,0987654321
ALLOWED_ORIGINS=http://localhost:3033
```

### 17.3 Production Considerations

**Horizontal Scaling:**
- Stateless backend (use Redis for session)
- Load balancer with sticky sessions for WebSocket
- Separate WebSocket server instances

**High Availability:**
- Redis Sentinel for failover
- Database replication
- Health check endpoints

**Monitoring:**
- Prometheus metrics endpoint
- Structured logging (JSON)
- Error tracking (Sentry)

### 17.4 Kubernetes Deployment

For enterprise deployments, SwarmAI supports Kubernetes orchestration:

```yaml
# swarm-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: swarmai-backend
  labels:
    app: swarmai
    component: backend
spec:
  replicas: 3
  selector:
    matchLabels:
      app: swarmai
      component: backend
  template:
    metadata:
      labels:
        app: swarmai
        component: backend
    spec:
      containers:
      - name: backend
        image: swarmai/backend:latest
        ports:
        - containerPort: 3031
          name: http
        - containerPort: 3032
          name: websocket
        env:
        - name: REDIS_HOST
          valueFrom:
            configMapKeyRef:
              name: swarmai-config
              key: redis-host
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "2Gi"
            cpu: "2000m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3031
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 3031
          initialDelaySeconds: 5
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: swarmai-backend
spec:
  selector:
    app: swarmai
    component: backend
  ports:
  - name: http
    port: 3031
    targetPort: 3031
  - name: websocket
    port: 3032
    targetPort: 3032
  type: ClusterIP
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: swarmai-backend-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: swarmai-backend
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

**Kubernetes Architecture:**

```
┌─────────────────────────────────────────────────────────────────┐
│                      KUBERNETES CLUSTER                          │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐     │
│  │                    INGRESS CONTROLLER                   │     │
│  │           (NGINX / Traefik / Kong)                     │     │
│  └─────────────────────────┬──────────────────────────────┘     │
│                            │                                     │
│           ┌────────────────┼────────────────┐                   │
│           ▼                ▼                ▼                   │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐            │
│  │   Frontend   │ │   Backend    │ │  WebSocket   │            │
│  │   Service    │ │   Service    │ │   Service    │            │
│  │   (3 pods)   │ │   (3 pods)   │ │   (3 pods)   │            │
│  └──────────────┘ └──────────────┘ └──────────────┘            │
│                            │                                     │
│           ┌────────────────┼────────────────┐                   │
│           ▼                ▼                ▼                   │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐            │
│  │    Redis     │ │   Qdrant     │ │  PostgreSQL  │            │
│  │  (Sentinel)  │ │  (Cluster)   │ │  (HA Proxy)  │            │
│  └──────────────┘ └──────────────┘ └──────────────┘            │
└─────────────────────────────────────────────────────────────────┘
```

### 17.5 Event-Driven Architecture

For high-scale deployments, SwarmAI supports event-driven patterns with message queues:

```
┌─────────────────────────────────────────────────────────────────┐
│                   EVENT-DRIVEN ARCHITECTURE                      │
│                                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │  WhatsApp   │  │  Telegram   │  │    Email    │             │
│  │  Connector  │  │  Connector  │  │  Connector  │             │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘             │
│         │                │                │                     │
│         └────────────────┼────────────────┘                     │
│                          ▼                                      │
│  ┌───────────────────────────────────────────────────────┐     │
│  │              MESSAGE BROKER (RabbitMQ/Kafka)           │     │
│  │  ┌─────────────────────────────────────────────────┐   │     │
│  │  │                    EXCHANGES                     │   │     │
│  │  │  incoming.messages │ outgoing.messages │ events │   │     │
│  │  └─────────────────────────────────────────────────┘   │     │
│  └───────────────────────────────────────────────────────┘     │
│                          │                                      │
│         ┌────────────────┼────────────────┐                    │
│         ▼                ▼                ▼                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │
│  │   Message   │  │    Flow     │  │     AI      │            │
│  │  Processor  │  │   Executor  │  │   Router    │            │
│  │   Workers   │  │   Workers   │  │   Workers   │            │
│  └─────────────┘  └─────────────┘  └─────────────┘            │
│                          │                                      │
│                          ▼                                      │
│  ┌───────────────────────────────────────────────────────┐     │
│  │              EVENT STORE (for event sourcing)          │     │
│  │  - Message history │ Flow executions │ Agent actions  │     │
│  └───────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
```

**Message Queue Configuration:**

```typescript
interface MessageQueueConfig {
  // Broker settings
  broker: {
    type: 'rabbitmq' | 'kafka' | 'redis-streams';
    url: string;
    options: BrokerOptions;
  };

  // Queue definitions
  queues: {
    incoming: {
      name: string;
      prefetch: number;
      retryPolicy: RetryPolicy;
    };
    outgoing: {
      name: string;
      priority: boolean;
    };
    flows: {
      name: string;
      concurrency: number;
    };
    ai: {
      name: string;
      rateLimit: RateLimit;
    };
  };

  // Dead letter handling
  deadLetter: {
    enabled: boolean;
    queue: string;
    maxRetries: number;
  };
}
```

### 17.6 Microservices Option

For enterprise deployments requiring service isolation:

```
┌─────────────────────────────────────────────────────────────────┐
│                    MICROSERVICES ARCHITECTURE                    │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐     │
│  │                     API GATEWAY                         │     │
│  │  - Authentication │ Rate Limiting │ Load Balancing     │     │
│  └─────────────────────────┬──────────────────────────────┘     │
│                            │                                     │
│  ┌─────────────────────────┼──────────────────────────────┐     │
│  │                         │                               │     │
│  │    ┌────────────────────┼────────────────────┐         │     │
│  │    ▼                    ▼                    ▼         │     │
│  │  ┌──────────┐     ┌──────────┐     ┌──────────┐       │     │
│  │  │  Agent   │     │ Messaging│     │   Flow   │       │     │
│  │  │ Service  │     │ Service  │     │  Service │       │     │
│  │  └──────────┘     └──────────┘     └──────────┘       │     │
│  │                                                        │     │
│  │    ┌────────────────────┼────────────────────┐         │     │
│  │    ▼                    ▼                    ▼         │     │
│  │  ┌──────────┐     ┌──────────┐     ┌──────────┐       │     │
│  │  │    AI    │     │   RAG    │     │  Swarm   │       │     │
│  │  │ Service  │     │ Service  │     │Orchestrator      │     │
│  │  └──────────┘     └──────────┘     └──────────┘       │     │
│  │                                                        │     │
│  └────────────────────────────────────────────────────────┘     │
│                            │                                     │
│  ┌─────────────────────────┼──────────────────────────────┐     │
│  │           SHARED INFRASTRUCTURE                         │     │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐ │     │
│  │  │  Redis   │  │  Qdrant  │  │PostgreSQL│  │ Kafka  │ │     │
│  │  └──────────┘  └──────────┘  └──────────┘  └────────┘ │     │
│  └────────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
```

**Service Communication:**

| Pattern | Use Case | Technology |
|---------|----------|------------|
| **Sync Request/Response** | API calls, queries | gRPC / REST |
| **Async Messaging** | Event distribution | RabbitMQ / Kafka |
| **Pub/Sub** | Real-time updates | Redis Pub/Sub |
| **Service Discovery** | Dynamic service location | Consul / Kubernetes DNS |

---

## 18. Non-Functional Requirements

### 18.1 Performance

| Metric | Target |
|--------|--------|
| API response time (p95) | < 200ms |
| WebSocket latency | < 50ms |
| Flow execution time | < 5s for simple flows |
| RAG query time | < 2s |
| Concurrent connections | 1000+ |
| Messages per second | 100+ |

### 18.2 Scalability

| Dimension | Current | Target |
|-----------|---------|--------|
| Agents per instance | 50 | 200 |
| Messages per day | 10,000 | 100,000 |
| RAG documents per user | 1,000 | 10,000 |
| Concurrent WebSocket | 500 | 5,000 |

### 18.3 Reliability

| Metric | Target |
|--------|--------|
| Uptime | 99.9% |
| Data durability | 99.999% |
| Recovery time | < 1 hour |
| Backup frequency | Daily |

### 18.4 Security

| Requirement | Implementation |
|-------------|---------------|
| Data at rest encryption | SQLite encryption (planned) |
| Data in transit encryption | TLS 1.3 |
| Authentication | JWT + API Keys |
| Authorization | RBAC |
| Audit logging | All admin actions |
| PII handling | Masking in logs |

---

## 19. Appendix

### 19.1 Glossary

| Term | Definition |
|------|------------|
| **Agent** | Autonomous entity managing one messaging account, capable of participating in swarm operations |
| **Swarm** | A collaborative network of agents that share knowledge, distribute workload, and coordinate responses |
| **Swarm Orchestrator** | Central component managing agent discovery, load balancing, and coordination |
| **Agent Handoff** | Transfer of a conversation from one agent to another based on expertise or availability |
| **Collective Learning** | Process where agents share successful patterns and insights with the swarm |
| **Agent Reputation** | Score reflecting an agent's performance, reliability, and collaboration effectiveness |
| **Consensus** | Agreement mechanism for decisions requiring input from multiple agents |
| **Flow** | Visual workflow automation with nodes and edges |
| **Node** | Individual action in a flow |
| **Trigger** | Event that starts a flow |
| **RAG** | Retrieval-Augmented Generation - AI responses enhanced with knowledge base content |
| **Library** | Collection of knowledge documents for RAG |
| **Intent** | Classified purpose of a message used for routing |
| **Cross-Agent Call** | One agent invoking another's flow |
| **MCP** | Model Context Protocol - Standard for AI tool integration |
| **Multimodal** | AI processing of multiple input types (text, image, audio, documents) |
| **Load Balancing** | Distribution of incoming messages across agents based on capacity and expertise |
| **Agent Specialization** | Domain expertise areas where an agent excels |
| **Swarming State** | Agent status indicating active participation in swarm collaboration |

### 19.2 References

**Platform Libraries:**
- [whatsapp-web.js Documentation](https://docs.wwebjs.dev/)
- [Telegram Bot API](https://core.telegram.org/bots/api)
- [GramJS (MTProto)](https://gram.js.org/)

**AI & ML:**
- [OpenRouter API](https://openrouter.ai/docs)
- [Anthropic Claude API](https://docs.anthropic.com/)
- [Model Context Protocol (MCP)](https://modelcontextprotocol.io/)
- [OpenAI Whisper](https://github.com/openai/whisper)

**Infrastructure:**
- [Qdrant Vector Database](https://qdrant.tech/documentation/)
- [Redis Documentation](https://redis.io/docs/)
- [RabbitMQ](https://www.rabbitmq.com/documentation.html)
- [Apache Kafka](https://kafka.apache.org/documentation/)

**Frontend:**
- [React Flow](https://reactflow.dev/)
- [React 18 Documentation](https://react.dev/)
- [Tailwind CSS](https://tailwindcss.com/docs)

**Deployment:**
- [Docker Documentation](https://docs.docker.com/)
- [Kubernetes Documentation](https://kubernetes.io/docs/)

### 19.3 Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-01-20 | Initial PRD based on current implementation (WhatsBots) |
| 2.0 | 2026-01-20 | **Major Update - Rebranded to SwarmAI** |
| | | - Renamed product from WhatsBots to SwarmAI |
| | | - Added Swarm Intelligence Features (Section 7) |
| | | - Enhanced Multi-Agent Management with swarm capabilities |
| | | - Added MCP (Model Context Protocol) integration |
| | | - Added Multimodal AI capabilities (vision, audio, documents) |
| | | - Added Swarm AI Coordination features |
| | | - Added Kubernetes deployment option |
| | | - Added Event-Driven Architecture support |
| | | - Added Microservices architecture option |
| | | - Expanded Glossary with swarm terminology |
| | | - Updated References with new technologies |

---

**Document maintained by:** SwarmAI Development Team
**Last updated:** 2026-01-20
**Product:** SwarmAI Multi-Agent Messaging Platform v2.0
