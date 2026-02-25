<p align="center">
  <img src="docs/icons/icon.png" alt="SwarmAI Logo" width="120" height="120" />
</p>

<h1 align="center">SwarmAI</h1>

<p align="center">
  <strong>Multi-Agent Messaging Platform with Swarm Intelligence</strong>
</p>

<p align="center">
  <a href="#features">Features</a> &bull;
  <a href="#architecture">Architecture</a> &bull;
  <a href="#quick-start">Quick Start</a> &bull;
  <a href="#deployment">Deployment</a> &bull;
  <a href="#documentation">Documentation</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen" alt="Node.js" />
  <img src="https://img.shields.io/badge/react-18-blue" alt="React 18" />
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License" />
  <img src="https://img.shields.io/badge/status-production-brightgreen" alt="Status" />
</p>

---

SwarmAI enables AI agents to collaborate, share knowledge, and handle communications across multiple platforms through agent orchestration, visual workflow automation (FlowBuilder), and RAG-based knowledge management.

## Features

### Multi-Platform Messaging
Connect and manage conversations across **6 platforms** from a unified inbox:
- **WhatsApp** (Web.js) & **WhatsApp Business** (Meta Graph API)
- **Telegram Bot** & **Telegram User** (MTProto)
- **Email** (SMTP/IMAP)
- **HTTP API / Webhooks**

### Swarm Intelligence
Coordinate multiple AI agents working together with:
- Agent handoff and task delegation
- Collaborative decision-making and consensus
- Agent reputation and trust scoring
- Load balancing (5 strategies)
- Automatic agent discovery

### FlowBuilder Automation
Visual workflow editor with **72+ nodes** across 13 categories:
- **Triggers** &mdash; Schedule, Webhook, Manual, Message-based
- **AI** &mdash; Chat completion, Intent classification, Summarization, RAG queries, Translation
- **Logic** &mdash; Conditions, Switches, Loops, Error handling, Variables
- **Messaging** &mdash; Send to WhatsApp, Telegram, Email, Webhooks
- **Agentic** &mdash; Custom tools, Autonomous tasks, Self-improvement
- **Data Ops** &mdash; JSON transform, CSV parse, Database queries
- **File Ops** &mdash; Read, Write, Convert, Template rendering

### SuperBrain AI Router
Intelligent request routing across multiple AI providers:
- **5 providers** &mdash; OpenRouter (500+ models), Ollama (local), Claude CLI, Gemini CLI, OpenCode CLI
- **Task classification** &mdash; Trivial, Simple, Moderate, Complex, Critical
- **Custom failover chains** per task tier with automatic fallback
- Cost tracking and usage analytics

### RAG Knowledge Management
Full document pipeline with semantic search:
- Ingest from upload, web, GitHub, or manual entry
- Support for PDF, DOCX, XLSX, images, and plain text
- Smart chunking with configurable overlap
- Qdrant vector database for fast similarity search
- Per-library collections and access control

### Agentic AI Platform
Autonomous AI agents with secure code execution:
- Isolated workspace per agent per user
- Secure Python sandbox with timeout and output limits
- Custom tool creation (Python-based)
- Skills system with XP progression (18 default skills across 5 categories)
- CLI integration (Claude, Gemini, OpenCode)

### Contact Management
Unified contact database across all platforms:
- Multi-platform identifier linking (phone, email, Telegram, WhatsApp)
- Activity tracking and conversation history
- Favorites, blocking, tagging, and deduplication
- WhatsApp contact sync

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (:3202)                      │
│              React 18 + Vite + Tailwind CSS             │
│              13 Zustand stores + Socket.io              │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│                  Backend (:3210)                         │
│             Express.js + Socket.io (CommonJS)           │
│                                                         │
│  ┌─────────────┐ ┌──────────────┐ ┌──────────────────┐ │
│  │  SuperBrain  │ │  FlowBuilder │ │    Platforms     │ │
│  │  AI Router   │ │    Engine    │ │  WA/TG/Email     │ │
│  └──────┬──────┘ └──────────────┘ └──────────────────┘ │
│         │                                               │
│  ┌──────▼──────┐ ┌──────────────┐ ┌──────────────────┐ │
│  │  Providers   │ │    Swarm     │ │    Agentic       │ │
│  │ OR/Ollama/CLI│ │ Intelligence │ │  Workspaces      │ │
│  └─────────────┘ └──────────────┘ └──────────────────┘ │
└───────┬──────────────────┬──────────────────┬───────────┘
        │                  │                  │
   ┌────▼────┐       ┌────▼────┐        ┌───▼────┐
   │ SQLite  │       │  Redis  │        │ Qdrant │
   │  (WAL)  │       │ (:6380) │        │(:6333) │
   └─────────┘       └─────────┘        └────────┘
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS, Zustand, Radix UI, Recharts |
| **Backend** | Node.js, Express.js (CommonJS), Socket.io, node-pty |
| **Databases** | SQLite (better-sqlite3, WAL mode), Redis, Qdrant |
| **AI** | OpenRouter, Ollama, Claude CLI, Gemini CLI, OpenCode CLI |
| **Platforms** | whatsapp-web.js, Telegraf, Nodemailer/IMAP |
| **Infrastructure** | Docker Compose, Nginx, Turbo monorepo |

## Quick Start

### Prerequisites

- **Node.js** >= 18.0.0
- **Docker** & Docker Compose
- **Redis** (included in Docker)
- **Qdrant** (included in Docker)

### 1. Clone & Install

```bash
git clone https://github.com/your-org/swarm-ai.git
cd swarm-ai
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your settings:

```env
# Required
JWT_SECRET=your-64-character-secret-key
REDIS_URL=redis://:yourpassword@localhost:6380
QDRANT_URL=http://localhost:6333
ENCRYPTION_KEY=your-32-character-encryption-key

# AI Providers (at least one)
OPENROUTER_API_KEY=sk-or-...

# Email (optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@email.com
SMTP_PASS=your-app-password
```

### 3. Start with Docker (Recommended)

```bash
docker compose up -d --build
```

The application will be available at:
- **Frontend**: http://localhost:3202
- **API**: http://localhost:3210
- **API Docs**: http://localhost:3210/api/docs

### 4. Alternative: Local Development

```bash
# Start dependencies
docker compose up -d redis qdrant

# Start all services (Turbo)
npm run dev

# Or individually
cd server && node index.cjs    # Backend on :3210
cd frontend && npm run dev     # Frontend on :3202
```

## API Overview

SwarmAI exposes **190+ REST endpoints** organized by domain:

| Route | Endpoints | Purpose |
|-------|-----------|---------|
| `/api/auth` | 16 | Registration, login, magic links, passkeys (WebAuthn) |
| `/api/agents` | 7 | Agent CRUD, activation, platform assignment |
| `/api/conversations` | 7 | Message threads, conversation management |
| `/api/messages` | - | Real-time messaging |
| `/api/swarm` | 30+ | Orchestration, handoff, consensus, collaboration |
| `/api/flows` | 20 | FlowBuilder CRUD, execution, scheduling |
| `/api/knowledge` | 17 | RAG documents, libraries, semantic search |
| `/api/ai` | 24 | Providers, models, MCP, chat, classification |
| `/api/superbrain` | - | User AI preferences, task routing config |
| `/api/platforms` | 9 | WhatsApp, Telegram, Email setup |
| `/api/contacts` | 28 | Contact CRUD, dedup, tags, sync |
| `/api/agentic` | 25 | Workspaces, tokens, tools, skills, execution |
| `/api/settings` | 18 | Data retention, API keys, webhooks |
| `/api/subscription` | 8 | Plans, usage, limits |
| `/api/admin` | - | Superadmin user management |

### Authentication

Three authentication methods supported:
- **Email/Password** &mdash; Standard JWT-based auth
- **Magic Links** &mdash; Passwordless email login
- **Passkeys (WebAuthn)** &mdash; Hardware security key support

```bash
# Quick API test (localhost only)
curl -H "Authorization: Bearer swarm-test-bypass-2026" \
  http://localhost:3210/api/agents
```

### WebSocket Events

**61 real-time events** across categories:
- Message events (13) &mdash; New messages, typing indicators, AI responses
- Flow events (11) &mdash; Execution progress, node updates
- Swarm events (14) &mdash; Handoff, consensus, collaboration
- Agentic events (10) &mdash; Task updates, skill learning
- Terminal events (10) &mdash; CLI session management

## Subscription Tiers

| Tier | Agents | Flows | AI Tokens/mo | Price |
|------|--------|-------|-------------|-------|
| **Free** | 1 | 3 | 50K | $0 |
| **Starter** | 3 | 10 | 500K | $9.99/mo |
| **Pro** | 10 | 50 | 2.5M | $29.99/mo |
| **Enterprise** | 100 | 500 | 10M | $99.99/mo |

## Project Structure

```
swarm-ai/
├── server/                       # Express.js backend (CommonJS)
│   ├── index.cjs                # Entry point
│   ├── routes/                  # 16 API route modules
│   ├── services/
│   │   ├── ai/                  # SuperBrain router, providers, workspace
│   │   ├── swarm/               # 7 swarm intelligence services
│   │   ├── flow/                # FlowBuilder engine + 72 nodes
│   │   ├── rag/                 # Document pipeline
│   │   └── agentic/             # Python sandbox, tool permissions
│   ├── platforms/               # WhatsApp, Telegram, Email clients
│   ├── data/                    # Runtime data (SQLite, sessions, workspaces)
│   └── scripts/                 # Database migrations (12 scripts)
│
├── frontend/                    # React 18 + Vite
│   └── src/
│       ├── pages/               # 15 route pages
│       ├── components/          # UI components (Radix UI)
│       ├── stores/              # 13 Zustand stores
│       ├── services/            # API client layer
│       └── hooks/               # Custom React hooks
│
├── docs/                        # Documentation
│   ├── PRD.md                   # Product requirements
│   ├── Features-prd.md          # Feature specifications
│   ├── IMPLEMENTATION-STATUS.md # Progress tracking
│   └── user-guide/              # 8 user guides
│
├── docker-compose.yml           # Full stack deployment
├── package.json                 # Turbo monorepo config
└── CLAUDE.md                    # Development instructions
```

## Deployment

### Docker Compose (Production)

```bash
# Build and start all services
docker compose up -d --build

# Rebuild backend after code changes
docker compose build --no-cache backend && docker compose up -d backend

# Rebuild frontend
cd frontend && npm run build
docker compose build --no-cache frontend && docker compose up -d frontend

# View logs
docker compose logs -f backend
```

### Production Architecture

```
Internet → Nginx (SSL/TLS)
              ├── Frontend :3202  (static React build)
              └── API :3210      (Express + Socket.io)

Internal:
  ├── Redis :6380   (sessions, cache)
  ├── Qdrant :6333  (vector storage)
  └── SQLite        (application data)
```

### Persistent Volumes

| Volume | Purpose |
|--------|---------|
| `server/data` | SQLite databases, sessions, agent workspaces |
| `redis_data` | Session cache, rate limiting |
| `qdrant_data` | Vector embeddings |
| `cli_credentials` | Claude/Gemini/OpenCode auth tokens |

### Required Environment Variables

| Variable | Description |
|----------|-------------|
| `JWT_SECRET` | 64-character session signing key |
| `REDIS_URL` | Redis connection string |
| `QDRANT_URL` | Qdrant vector DB URL |
| `ENCRYPTION_KEY` | Platform credential encryption key |
| `OPENROUTER_API_KEY` | OpenRouter API access |

### Optional Environment Variables

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Claude API (direct) |
| `OLLAMA_URL` | Local Ollama instance |
| `SMTP_HOST/PORT/USER/PASS` | Email sending |
| `TEST_BYPASS_TOKEN` | Dev-only auth bypass |

## Development

```bash
# Install dependencies
npm install

# Run all services (Turbo)
npm run dev

# Run tests (Vitest)
npm run test

# Lint
npm run lint

# Build
npm run build

# Initialize database
npm run db:init
```

### CLI Authentication (Docker)

For agentic AI features, authenticate CLI tools inside the container:

```bash
# Login to Claude CLI
docker compose exec -u cliuser backend claude auth login

# Login to Gemini CLI
docker compose exec -u cliuser backend gemini auth login

# Copy credentials for persistence
docker exec swarm-backend bash /app/scripts/copy-cli-credentials.sh
```

## Security

- **Workspace isolation** &mdash; Each user/agent gets a sandboxed workspace
- **Multi-tenant** &mdash; All DB queries scoped by `user_id`
- **Python sandbox** &mdash; Blocked: `subprocess`, `os.system`, `socket`, `eval`, `exec`
- **Rate limiting** &mdash; Tiered per subscription plan
- **Encrypted credentials** &mdash; Platform tokens encrypted at rest
- **CORS** &mdash; Configurable origin whitelist
- **JWT + Refresh tokens** &mdash; 7-day access, 30-day refresh

## Documentation

| Document | Description |
|----------|-------------|
| [Product Requirements](docs/PRD.md) | Full product specification |
| [Feature Specs](docs/Features-prd.md) | Detailed feature documentation |
| [Implementation Status](docs/IMPLEMENTATION-STATUS.md) | Current progress tracking |
| [User Guide](docs/user-guide/) | 8 guides covering all features |
| [FlowBuilder Guide](docs/flowbuilder/) | Visual workflow documentation |
| [RAG Guide](docs/rag-knowledge-base/) | Knowledge management docs |
| [API Docs](http://localhost:3210/api/docs) | Interactive OpenAPI/Swagger |

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

---

<p align="center">
  Built with Node.js, React, and a swarm of AI agents.
</p>
