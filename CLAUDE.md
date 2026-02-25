# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Project Overview

SwarmAI is a Multi-Agent Messaging Platform with Swarm Intelligence. It enables AI agents to collaborate, share knowledge, and handle communications via agent orchestration, visual workflow automation (FlowBuilder), and RAG-based knowledge management.

## Quick Reference

| Service | Port | Tech Stack |
|---------|------|------------|
| API Server | 3210 | Express.js (CommonJS) |
| WebSocket | 3210 | Socket.io (same port as API) |
| Frontend | 3202 | React 18 + Vite + Tailwind |
| Redis | 6380 | Session cache |
| Qdrant | 6333 | Vector storage |

**Monorepo Structure:**
- `server/` - Express.js API (CommonJS) - **ACTIVE BACKEND**
- `frontend/` - React 18 dashboard
- `Backup/backend/` - Legacy TypeScript (deprecated, reference only)

## Development Commands

```bash
# Docker Production (recommended for testing)
# Backend rebuild:
docker compose build --no-cache backend && docker compose up -d backend

# Frontend rebuild:
cd frontend && npm run build
docker compose build --no-cache frontend && docker compose up -d frontend

# Full stack:
docker compose up -d --build            # Build all services
docker compose restart backend          # Restart after code changes
docker compose logs -f backend          # View server logs

# Local development (alternative)
docker compose up -d redis qdrant       # Dependencies only
npm run dev                             # Backend + Frontend (Turbo)

# Individual (local)
cd server && node index.cjs             # Backend only
cd frontend && npm run dev              # Frontend only

# Testing
npm run test                            # All tests (Vitest)
cd server && npx vitest run path/to/test # Single test

# Build & Lint
npm run build && npm run lint
npm run db:init                         # Initialize SQLite
```

**Note:** Use Docker production for testing SwarmAI. Always rebuild with `--no-cache` after code changes.

## Test Bypass Token (Localhost Only)

```bash
curl -H "Authorization: Bearer swarm-test-bypass-2026" http://localhost:3210/api/...
```
Authenticates as admin user. Disabled in production. Set `TEST_BYPASS_TOKEN` env to customize.

## Architecture

### Core Services (`server/services/`)

**AI System (`server/services/ai/`):**
- `SuperBrainRouter.cjs` - Central intelligence router with task classification and failover
- `TaskClassifier.cjs` - Classifies tasks: trivial → simple → moderate → complex → critical
- `ProviderStrategy.cjs` - Provider selection and chaining
- `CLIAIProvider.cjs` - CLI execution (Claude, Gemini, OpenCode)
- `WorkspaceManager.cjs` - Agentic workspace management

**Providers (`server/services/ai/providers/`):**
- `OllamaProvider.cjs` - Local models (supports custom base_url)
- `OpenRouterProvider.cjs` - OpenRouter API (500+ models, free models have `:free` suffix)
- `CLIAIProvider.cjs` - CLI tools (claude, gemini, opencode)

**Other Services:**
- `database.cjs` - SQLite (better-sqlite3, WAL mode)
- `rateLimitService.cjs` - Tiered rate limiting
- `PythonSandbox.cjs` - Secure Python tool execution

**Platforms (`server/platforms/`):**
- `whatsappClient.cjs` - WhatsApp Web.js (QR auth)
- `whatsappBusinessClient.cjs` - WhatsApp Business API
- `telegramBotClient.cjs` - Telegram Bot API
- `emailClient.cjs` - IMAP/SMTP

### Frontend (`frontend/src/`)

**Zustand Stores (`stores/`):**
- `authStore`, `agentStore`, `swarmStore`, `messageStore`, `flowStore`
- `superbrainStore` - AI model preferences
- `adminStore` - User management (superadmin)

**Path alias:** `@/` → `frontend/src/`

### API Routes (`server/routes/`)

| Route | Purpose |
|-------|---------|
| `/api/auth` | Authentication (JWT, magic links, passkeys) |
| `/api/agents` | Agent CRUD |
| `/api/conversations`, `/api/messages` | Messaging |
| `/api/flows` | FlowBuilder workflows |
| `/api/knowledge` | RAG document management |
| `/api/ai` | AI providers, translate, rephrase |
| `/api/superbrain` | User AI settings |
| `/api/agentic` | Workspaces, tokens, custom tools, **skills system** |
| `/api/platforms` | WhatsApp/Telegram/Email |
| `/api/swarm` | Swarm orchestration |
| `/api/admin` | Superadmin only |

## SuperBrain AI System

Central intelligence that routes AI requests optimally.

### Task Routing Architecture

**Request Flow:**
```
Request → TaskClassifier → getProviderChain() → executeWithFailover()
              ↓                    ↓                      ↓
         tier: "simple"    [Provider1, ...]     Try each until success
```

**Task Classification** (`TaskClassifier.cjs`):
- `trivial` - greetings, yes/no questions
- `simple` - quick queries, translation, rephrasing
- `moderate` - standard conversations, analysis
- `complex` - code generation, deep reasoning
- `critical` - agentic tasks, autonomous operations

### AI Provider Storage

**Database Table: `ai_providers`**
| Column | Purpose |
|--------|---------|
| `id` | Unique provider ID |
| `name` | Display name (e.g., "MidAI", "LocalAI") |
| `type` | Provider type: `ollama`, `openrouter`, `cli-claude`, `cli-gemini`, `cli-opencode` |
| `api_key` | API credentials |
| `base_url` | Custom endpoint (e.g., `https://api.openai.com/v1`) |
| `models` | JSON array of available models |
| `is_default` | Default provider flag |

**Provider Type → API Endpoint:**
- `ollama` → Uses `base_url` or `http://localhost:11434`
- `openrouter` → Uses `https://openrouter.ai/api/v1` (hardcoded, `base_url` NOT used)
- `cli-claude` → Executes `claude` CLI command
- `cli-gemini` → Executes `gemini` CLI command
- `cli-opencode` → Executes `opencode` CLI command

### Task Routing Configuration

**Database Table: `superbrain_settings`**
```sql
-- Provider per tier (legacy individual settings)
trivial_tier_provider, simple_tier_provider, moderate_tier_provider, ...
trivial_tier_model, simple_tier_model, moderate_tier_model, ...

-- Custom failover chain (new format - takes priority)
custom_failover_chain TEXT  -- JSON
```

**Custom Failover Chain Format:**
```json
{
  "trivial": [
    { "provider": "MidAI", "model": "meta-llama/llama-3.1-405b:free", "isPrimary": true },
    { "provider": "MidAI", "model": "openai/gpt-oss-120b:free", "isPrimary": false }
  ],
  "simple": [...],
  "moderate": [...],
  "complex": [...],
  "critical": [...]
}
```

### Provider Resolution Flow

```
1. User configures Task Routing UI with provider "MidAI" + model
2. Saved to superbrain_settings.custom_failover_chain
3. On request:
   a. TaskClassifier determines tier (e.g., "moderate")
   b. getProviderChain() reads custom_failover_chain[tier]
   c. For each entry, lookup provider in ai_providers table
   d. Get provider.type to determine API endpoint
   e. Execute with failover until success
```

**Key Files:**
- `SuperBrainRouter.cjs:316-447` - `getProviderChain()` builds provider chain
- `SuperBrainRouter.cjs:663-878` - `executeOnProvider()` routes to correct API
- `SuperBrainRouter.cjs:470-498` - `getCustomProvider()` lookups from ai_providers
- `superbrain.cjs:796-899` - `/api/superbrain/providers/available` endpoint

### Message Processing

- `translateMessage()` - 20 languages
- `rephraseMessage()` - 6 styles (professional, casual, concise, detailed, friendly, formal)
- `transformMessage()` - URL/embed extraction

**Message Classification:** SKIP (ignore) → PASSIVE (RAG ingest) → ACTIVE (respond)

### User Settings

**`superbrain_settings` table:**
- Per-tier provider/model preferences (via `custom_failover_chain`)
- Auto-send mode: `restricted` | `allowed`
- AI router mode: `full` | `classify_only` | `disabled`

### Legacy Notes

**Deprecated:** `openrouter-free` / `openrouter-paid` provider IDs are legacy. The code accepts them for backwards compatibility but they route to the same `openrouter` handler. Free vs paid is now determined by model name (`:free` suffix).

## Agentic AI Platform

Autonomous AI agents with CLI-based execution:

**Workspace Structure:**
```
server/data/workspaces/{userId}/{agentId}/
├── CLAUDE.md          # Context file
├── custom/tools/      # Python tools
├── output/            # Task outputs
└── logs/              # History
```

**Python Sandbox Security:**
- Blocked: `subprocess`, `os.system`, `socket`, `pickle`, `eval`, `exec`
- File access: workspace only, write to `output/` only
- 30-second timeout, 1MB output limit

**CLI Types:** Claude (paid), Gemini (free), OpenCode (free, multi-provider)

### Skills System

Agent skills define capabilities that unlock tools and features. Skills can be upgraded through usage.

**Database Tables:**
- `agentic_skills_catalog` - Predefined skills (18 default skills across 5 categories)
- `agentic_agent_skills` - Skills assigned to specific agents
- `agentic_skill_history` - Skill learning/usage history

**Skill Categories:**
- `communication` - email_management, chat_response, report_writing, multilingual
- `analysis` - data_analysis, sentiment_analysis, trend_detection, document_parsing
- `automation` - task_scheduling, workflow_automation, rule_engine, triggers
- `integration` - api_integration, webhook_management, platform_sync
- `management` - team_coordination, resource_allocation, priority_management

**Skill Levels:** beginner (1) -> intermediate (2) -> advanced (3) -> expert (4)

**XP System:** Skills gain experience through usage. XP thresholds per level are defined in `xp_per_level` JSON array.

**Skill Inheritance:** Sub-agents can inherit skills from parent at level 1, or have specific skills assigned.

**API Endpoints:**
```
GET  /api/agentic/skills/catalog                    # List all available skills
GET  /api/agentic/profiles/:id/skills               # List agent's skills
POST /api/agentic/profiles/:id/skills               # Acquire new skill
PUT  /api/agentic/profiles/:id/skills/:skillId      # Upgrade skill / add XP
DELETE /api/agentic/profiles/:id/skills/:skillId    # Remove skill
POST /api/agentic/profiles/:id/skills/:skillId/use  # Record usage (adds XP)
GET  /api/agentic/profiles/:id/skills/recommendations # Get recommended skills
GET  /api/agentic/profiles/:id/skills/history       # Get skill history
```

**Migration:** Run `node server/scripts/migrate-agentic-skills.cjs` to create tables.

### Self-Healing System

Agents can detect, diagnose, fix, and verify issues in their own operation.

**Severity Levels:**
- `LOW` - Auto-fix (handled by RecoveryStrategies inline, no self-healing action)
- `MEDIUM` - Diagnose → backup → propose fix → self-test → apply
- `HIGH` - Diagnose → backup → propose fix → require master approval
- `CRITICAL` - Immediately notify master with full diagnostic log

**Key Files:**
- `SelfHealingService.cjs` - Core orchestration (diagnostics, backup, fix, rollback)
- `SelfHealingHook.cjs` - Event hook on `reasoning:end` (triggers on >40% error rate)
- `SelfPromptingEngine.cjs` - Periodic `health_check` trigger (every 6h default)

**Agent Tools:**
- `getMyErrorHistory` - Query own failures (SAFE, observation)
- `getMyHealthReport` - Aggregated health metrics (SAFE, observation)
- `diagnoseSelf` - Root cause analysis with severity (SAFE, observation)
- `proposeSelfFix` - Propose config change with backup (DANGEROUS, self_improvement)

**Fix Types:** `tool_config`, `system_prompt`, `retry_config`, `skill_adjustment`

**Database:** `agentic_self_healing_log` table tracks full lifecycle.
**Migration:** Run `node server/scripts/migrate-agentic-self-healing.cjs` to create tables.

## FlowBuilder Nodes

- **triggers/** - Manual, Schedule, Webhook, Message
- **ai/** - ChatCompletion, ClassifyIntent, Summarize, RAGQuery, Translate
- **logic/** - Condition, Switch, Loop, Delay, ErrorHandler, Variables
- **messaging/** - SendText (WhatsApp, Telegram, Email, Webhook)
- **swarm/** - Agent query, broadcast, handoff, consensus
- **agentic/** - CustomTool, AgenticTask, SelfImprove

**Variable Resolution:** `{{input.field}}`, `{{node.id.output}}`, `{{var.name}}`, `{{env.VAR}}`

## Key Patterns

### AI Provider Flow
```
Request → SuperBrainRouter.process()
              ↓
         TaskClassifier.classify() → tier (trivial/simple/moderate/complex/critical)
              ↓
         getProviderChain(tier) → reads superbrain_settings.custom_failover_chain
              ↓
         executeWithFailover() → loop through provider chain
              ↓
         executeOnProvider() → lookup ai_providers by name → get type → call API
              ↓
         Response (with provider, model, classification info)
```

### WebSocket Events
- `message:new`, `agent:status_changed`, `swarm:task_update`
- `agentic:tool_created/updated/deleted`

## Development Rules

### CRITICAL
1. **Backup before major changes** - `Backup/{filename}_v{version}.{ext}`
2. **Never delete DB data** - Ask before UPDATE/DELETE on production
3. **Read before editing** - Understand existing code first
4. **Use `server/`** - `backend/` folder is deprecated
5. **Timezone conversion** - ALL datetime/time display must use user's timezone from `authStore.user.preferences.timezone`. SQLite stores UTC via `datetime('now')`. API responses must append `Z` suffix to UTC timestamps. Frontend must use `toLocaleString` with `{ timeZone: userTimezone }`.

### Architecture
- **Server:** CommonJS (`.cjs`), relative imports
- **Frontend:** TypeScript, `@/` alias imports
- **Services:** Keep stateless, use DB/Redis for persistence
- Follow existing patterns in `server/routes/*.cjs` and `server/services/*/`

### Database
- Use migration scripts in `server/scripts/`
- Backup `.db` files before ALTER TABLE
- Test migrations on dev first

## GitHub Repository Security

**Repository:** `northpeakmalaysia/SwarmAI`

### Branch Protection Rules (main)

Configure at: `https://github.com/northpeakmalaysia/SwarmAI/settings/branches`

**Required protections on `main`:**
- Require pull request before merging (min 1 approval)
- Dismiss stale pull request approvals on new commits
- Block force pushes
- Block branch deletions
- Include administrators (apply rules to owners/admins too)

**Workflow:** All changes to `main` must go through a PR. No direct pushes.

### Push Protection & Secret Scanning

GitHub Push Protection is enabled — pushes containing detected secrets (API keys, tokens, passwords) are automatically blocked.

**Rules:**
1. **NEVER commit credentials files** — `docs/credentials-export.md` and similar files must stay gitignored
2. **`.gitignore` already excludes:** `docs/`, `.env`, `.env.local`, `.env.*.local`, `*.pem`, `*.cert`, `*.key`
3. **If push is blocked by secret scanning:**
   - Do NOT use the "allow secret" bypass URL
   - Remove the secret from the commit using `git rebase` or `git filter-branch`
   - Rotate the exposed credential immediately
4. **Store secrets in:** `.env` files (gitignored), Docker secrets, or environment variables — never in tracked files

### Git Workflow

- **Main branch:** `main` (protected)
- **Feature branches:** `feature/{name}` or `{name}` → PR to `main`
- **Push command:** `git push -u origin main` (NOT `master`)
- **Before pushing:** Always verify no secrets are tracked with `git ls-files | grep -i -E "(credential|secret|password|\.env$)"`

## Docker Deployment

**Production URL:** `https://agents.northpeak.app`

```bash
# Deploy
docker compose up -d --build

# Logs
docker compose logs -f server

# CLI Auth (first-time)
docker compose exec -u cliuser backend claude auth login
docker compose exec -u cliuser backend gemini auth login
docker compose exec -u cliuser backend opencode auth login
```

**Volumes (persist across rebuilds):**
- `server/data` - SQLite, sessions, workspaces
- `redis_data` - Cache
- `qdrant_data` - Vectors
- `cli_credentials` - CLI auth tokens

**Required Env Vars:** `JWT_SECRET`, `REDIS_PASSWORD`, `OPENROUTER_API_KEY`

### Production Architecture
```
Internet → Nginx (SSL) → Frontend :3202
                      → API + WebSocket :3210 (Socket.io)
Internal: Redis :6380, Qdrant :6333
```

## Multi-Tenant Security

- **Workspace isolation:** `server/data/workspaces/{userId}/{agentId}/`
- **DB queries:** All include `WHERE user_id = ?`
- **Vector store:** Collections namespaced by library ID
- **CLI execution:** Working directory validated, env secrets filtered

## Active Implementation Roadmap

**Current focus:** Agentic AI enhancement — making it reliable, responsive, and capable of device-level execution.

- **Roadmap:** [docs/AGENTIC-IMPLEMENTATION-ROADMAP.md](docs/AGENTIC-IMPLEMENTATION-ROADMAP.md) — **READ THIS FIRST** for task status
- **Design doc:** `E:\OpenClaw\OpenClaw_vs_SwarmAI_Comparison.md` — detailed specs (2400+ lines, read specific sections only)

**Phase 0 (DLQ):** DONE — built, needs live testing
**Phase 1 (Stop Silence):** NEXT — watchdog, guaranteed response, typing indicators
**Phase 2 (Soul):** SOON — personality, acknowledgment, proactive
**Phase 3 (Health):** LATER — per-platform monitoring
**Phase 5 (Local Agent):** AFTER Phase 1-2 — device-level CLI agent

### Message Flow Architecture

```
Platform Module → MessageRouter → UnifiedMessageService → SuperBrain (preprocess: OCR/Vision)
  → Agentic AI (+ sub-agents via OrchestratorEngine) → DLQ → Platform Module
  → FlowBuilder → DLQ → Platform Module
  → Swarm Module → DLQ → Platform Module
  → Direct AI → DLQ → Platform Module
```

- **Platform Module** = WhatsApp, Telegram, Email connections (NOT "Agent Module")
- **SuperBrain** = 3 roles: Preprocessor (OCR/Vision), Dispatcher (routing), AI Provider (model selection)
- **Agentic AI** = Autonomous reasoning loop, can self-create sub-agents
- **DLQ** = Delivery Queue with retry + dead letters (all outbound goes through this)

## Documentation

- [docs/PRD.md](docs/PRD.md) - Product Requirements
- [docs/Features-prd.md](docs/Features-prd.md) - Feature specs
- [docs/AGENTIC-IMPLEMENTATION-ROADMAP.md](docs/AGENTIC-IMPLEMENTATION-ROADMAP.md) - **Active roadmap (checkboxes)**
- [docs/IMPLEMENTATION-STATUS.md](docs/IMPLEMENTATION-STATUS.md) - Progress tracking
- [docs/SUPERBRAIN-MESSAGE-PROCESSING.md](docs/SUPERBRAIN-MESSAGE-PROCESSING.md) - Message APIs
- [docs/MIGRATION-PLAN.md](docs/MIGRATION-PLAN.md) - Backend migration

## File Structure

```
server/
├── index.cjs              # Entry point
├── routes/*.cjs           # API routes (21 files)
├── services/
│   ├── ai/                # SuperBrain, providers, workspace
│   ├── agentic/           # PythonSandbox
│   ├── flow/              # FlowBuilder engine
│   ├── swarm/             # Agent collaboration
│   ├── rag/               # Document pipeline
│   └── *.cjs              # Core services
├── platforms/             # WhatsApp, Telegram, Email
├── data/                  # Runtime (workspaces, sessions)
└── scripts/               # Migrations

frontend/src/
├── pages/                 # Route pages
├── components/            # UI components
├── stores/                # Zustand state
└── services/              # API clients
```
