# SwarmAI Platform Overview

## What is SwarmAI?

SwarmAI is a **Multi-Agent Messaging Platform with Swarm Intelligence** that enables AI agents to collaborate, share knowledge, and handle communications through intelligent orchestration.

## Core Capabilities

### 1. Multi-Agent System
- Create and manage multiple AI agents with different specializations
- Agents can collaborate, handoff tasks, and reach consensus
- Each agent has independent configuration (provider, model, personality)

### 2. SuperBrain AI Router
- Intelligent task classification (trivial → simple → moderate → complex → critical)
- Automatic provider selection and failover
- Multi-provider support: OpenRouter, Ollama, Claude CLI, Gemini CLI, OpenCode CLI
- Optimized cost vs. quality routing

### 3. FlowBuilder Automation
- Visual workflow designer for no-code automation
- 40+ node types (triggers, AI, logic, messaging, swarm)
- Support for variables, conditions, loops, and error handling
- Real-time execution monitoring

### 4. RAG Knowledge Management
- Document upload and vector storage (Qdrant)
- Semantic search and retrieval
- Multi-library organization
- Support for PDF, TXT, DOCX, MD formats

### 5. Agentic AI Platform
- Autonomous agents with CLI execution (Claude, Gemini, OpenCode)
- Workspace isolation per agent
- Custom Python tools with sandboxed execution
- Self-improvement capabilities

### 6. Multi-Platform Messaging
- **WhatsApp**: Web.js and Business API support
- **Telegram**: Bot API integration
- **Email**: IMAP/SMTP with intelligent parsing
- **Webhooks**: Custom integrations

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    SwarmAI Platform                      │
├─────────────────────────────────────────────────────────┤
│  Frontend Dashboard (React 18 + Tailwind)               │
│  ├── Agent Management                                    │
│  ├── FlowBuilder Designer                               │
│  ├── Knowledge Libraries                                │
│  └── Conversations                                       │
├─────────────────────────────────────────────────────────┤
│  Backend Services (Express.js)                          │
│  ├── SuperBrain Router ─── Task Classifier              │
│  ├── AI Providers ────────┬ OpenRouter                  │
│  │                        ├ Ollama                      │
│  │                        ├ Claude CLI                  │
│  │                        ├ Gemini CLI                  │
│  │                        └ OpenCode CLI                │
│  ├── FlowBuilder Engine ── Node Executors               │
│  ├── RAG Pipeline ──────── Document Processing          │
│  ├── Swarm Orchestrator ── Agent Collaboration          │
│  └── Platform Clients ───┬ WhatsApp                     │
│                          ├ Telegram                     │
│                          └ Email                        │
├─────────────────────────────────────────────────────────┤
│  Storage Layer                                          │
│  ├── SQLite (Agents, Flows, Messages)                  │
│  ├── Qdrant (Vector Store)                             │
│  └── Redis (Sessions, Cache)                           │
└─────────────────────────────────────────────────────────┘
```

## Key Use Cases

### For Businesses
- **Customer Support**: 24/7 automated responses across WhatsApp, Telegram, Email
- **Lead Qualification**: Intelligent conversation flows with handoff to human agents
- **Internal Automation**: Document Q&A, meeting summaries, task routing

### For Developers
- **AI Orchestration**: Build complex multi-agent workflows
- **Custom Integrations**: Connect SwarmAI to your existing systems
- **Rapid Prototyping**: Test AI agents without infrastructure setup

### For Power Users
- **Personal Assistant**: Manage emails, messages, and tasks
- **Knowledge Management**: Build searchable knowledge bases from documents
- **Workflow Automation**: Create custom automation flows without coding

## Technology Stack

| Component | Technology |
|-----------|-----------|
| **Backend** | Node.js + Express.js (CommonJS) |
| **Frontend** | React 18 + Vite + Tailwind CSS |
| **Databases** | SQLite (better-sqlite3, WAL mode) |
| **Vector Store** | Qdrant (Docker) |
| **Cache** | Redis (Docker) |
| **AI Providers** | OpenRouter, Ollama, Claude CLI, Gemini CLI, OpenCode CLI |
| **Messaging** | WhatsApp Web.js, Telegram Bot API, Nodemailer |
| **Authentication** | JWT, Magic Links, Passkeys (WebAuthn) |

## Deployment

### Local Development
```bash
# Start dependencies
docker compose up -d

# Start backend + frontend
npm run dev
```

### Production (Docker)
```bash
docker compose up -d --build
```

Production URL: `https://agents.northpeak.app`

## Ports

| Service | Port |
|---------|------|
| API Server | 3031 |
| WebSocket | 3032 |
| Frontend | 3202 |
| Redis | 6380 |
| Qdrant | 6333 |

## Getting Started

1. **Users**: Start with [User Quick Start Guide](quickstart-user.md)
2. **Developers**: Begin with [Developer Quick Start Guide](quickstart-developer.md)
3. **Administrators**: See [Installation Guide](installation.md)

## Next Steps

- [Create Your First Agent](../02-user-guides/creating-agents.md)
- [Build a Flow](../02-user-guides/flowbuilder-basics.md)
- [Upload Knowledge](../02-user-guides/rag-knowledge.md)
- [Explore API](../06-api-reference/authentication.md)

---

**Related Topics**: Architecture, Installation, Quick Start, Features
