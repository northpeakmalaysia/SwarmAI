# Features PRD: AI Integration & External Services

## Document Version
- **Version:** 2.0
- **Last Updated:** January 2026
- **Author:** SwarmAI Development Team

---

## Table of Contents
1. [OpenRouter Integration](#1-openrouter-integration)
2. [Claude CLI Integration](#2-claude-cli-integration)
3. [Gemini CLI Integration](#3-gemini-cli-integration)
4. [Local AI Integration (Ollama/LM Studio)](#4-local-ai-integration-ollama--lm-studio)
5. [RAG System Implementation](#5-rag-system-implementation)
6. [Email Integration (SMTP/IMAP/AWS SES)](#6-email-integration-smtpimapaws-ses)
7. [AI Router & Usage Tracking](#7-ai-router--usage-tracking)
8. [Swarm Intelligence Integration](#8-swarm-intelligence-integration)
9. [MCP (Model Context Protocol) Integration](#9-mcp-model-context-protocol-integration)
10. [Multimodal Capabilities](#10-multimodal-capabilities)
11. [FlowBuilder Swarm Nodes](#11-flowbuilder-swarm-nodes)
12. [Configuration Reference](#12-configuration-reference)

---

## 1. OpenRouter Integration

### 1.1 Overview
OpenRouter serves as the primary AI model gateway, providing access to 200+ models from multiple providers (OpenAI, Anthropic, Google, Meta, DeepSeek, etc.) through a unified API.

### 1.2 Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌───────────────────┐
│   FlowBuilder   │────▶│  service_tools   │────▶│    OpenRouter     │
│   AI Nodes      │     │  .cjs            │     │    API v1         │
└─────────────────┘     └──────────────────┘     └───────────────────┘
        │                        │                        │
        │                        ▼                        ▼
        │               ┌──────────────────┐     ┌───────────────────┐
        └──────────────▶│  aiRouterUsage   │     │   AI Providers    │
                        │  Service.cjs     │     │ (OpenAI, Claude,  │
                        └──────────────────┘     │  Gemini, etc.)    │
                                                 └───────────────────┘
```

### 1.3 Primary Files
| File | Purpose |
|------|---------|
| `server/service_tools.cjs` | Core OpenRouter API functions |
| `server/aiApiSettings.json` | API configuration storage |
| `server/services/aiRouterUsageService.cjs` | Usage tracking & rate limiting |
| `src/components/automation/FlowBuilder/config/AiRouterConfigForm.tsx` | UI model selector |

### 1.4 Configuration

#### Environment Variables
```bash
# Required
OPENROUTER_API_KEY=sk-or-v1-xxxxxxxxxxxxxxxxxxxx

# Optional (defaults shown)
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_MODEL=google/gemma-2-9b-it:free
```

#### aiApiSettings.json
```json
{
  "openrouter": {
    "apiUrl": "https://openrouter.ai/api/v1",
    "defaultModel": "google/gemma-2-9b-it:free",
    "fallbackModels": [
      "meta-llama/llama-3.2-3b-instruct:free",
      "mistralai/mistral-7b-instruct:free"
    ],
    "timeout": 30000,
    "maxRetries": 3
  }
}
```

### 1.5 Core Functions

#### List Available Models
```javascript
// server/service_tools.cjs
async function openrouterListModels(apiUrl, apiKey) {
  const response = await fetch(`${apiUrl}/models`, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://swarmagent.local',
      'X-Title': 'SwarmAgent'
    }
  });
  return response.json();
}
```

#### Send Prompt
```javascript
// server/service_tools.cjs
async function openrouterSendPrompt({
  apiUrl,
  apiKey,
  userApiKey,     // Priority: userApiKey > apiKey > env
  model,
  prompt,
  options = {},
  systemPrompt
}) {
  const effectiveKey = userApiKey || apiKey || process.env.OPENROUTER_API_KEY;

  const body = {
    model: model,
    messages: [
      { role: 'system', content: systemPrompt || 'You are a helpful assistant.' },
      { role: 'user', content: prompt }
    ],
    temperature: options.temperature || 0.7,
    max_tokens: options.max_tokens || 1000
  };

  const response = await fetch(`${apiUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${effectiveKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://swarmagent.local',
      'X-Title': 'SwarmAgent'
    },
    body: JSON.stringify(body)
  });

  return response.json();
}
```

### 1.6 Model Pricing (Fallback Values)
```javascript
const DEFAULT_PRICING = {
  'deepseek/deepseek-chat': { input: 0.14, output: 0.28 },
  'google/gemini-2.0-flash': { input: 0.10, output: 0.40 },
  'anthropic/claude-3-haiku': { input: 0.25, output: 1.25 },
  'anthropic/claude-sonnet-4': { input: 3.00, output: 15.00 },
  'openai/gpt-4o-mini': { input: 0.15, output: 0.60 },
  'meta-llama/llama-3.1-70b-instruct': { input: 0.35, output: 0.40 }
};
// Prices per 1M tokens
```

### 1.7 Rate Limiting
| User Type | Requests/Min | Requests/Hr | Requests/Day | Daily Budget |
|-----------|--------------|-------------|--------------|--------------|
| Default | 20 | 200 | 1,000 | $10 |
| Authenticated | 100 | 1,000 | 5,000 | $50 |

### 1.8 FlowBuilder Integration
- Dynamic model dropdown with 200+ models
- Searchable model selector with real-time filtering
- System prompt customization
- Temperature and max_tokens controls
- Provider fallback chains

---

## 2. Claude CLI Integration

### 2.1 Overview
Direct terminal access to Anthropic's Claude CLI for agentic coding tasks. Provides full terminal emulation with streaming output.

### 2.2 Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌───────────────────┐
│   Frontend      │────▶│  WebSocket       │────▶│  terminalService  │
│   Terminal UI   │◀────│  Server (3032)   │◀────│  .cjs             │
└─────────────────┘     └──────────────────┘     └───────────────────┘
                                                          │
                                                          ▼
                                                 ┌───────────────────┐
                                                 │   node-pty        │
                                                 │   (PTY Session)   │
                                                 └───────────────────┘
                                                          │
                                                          ▼
                                                 ┌───────────────────┐
                                                 │   Claude CLI      │
                                                 │   (via cliuser)   │
                                                 └───────────────────┘
```

### 2.3 Primary Files
| File | Purpose |
|------|---------|
| `server/services/terminalService.cjs` | PTY session management |
| `server/routes/terminalRoutes.cjs` | REST API endpoints |
| `src/hooks/useCliAiStream.ts` | Frontend WebSocket hook |

### 2.4 Configuration

#### Environment Variables
```bash
# Required
ANTHROPIC_API_KEY=sk-ant-api03-xxxxxxxxxxxxxxxxxxxx

# Terminal Environment (auto-configured)
TERM=xterm-256color
COLORTERM=truecolor
FORCE_COLOR=1
```

### 2.5 Terminal Types
```javascript
const TERMINAL_TYPES = {
  'claude': {
    command: 'su -l cliuser -c "cd /usr/src/app && claude"',
    description: 'Claude Code CLI'
  },
  'claude-bypass': {
    command: 'su -l cliuser -c "cd /usr/src/app && claude --dangerously-skip-permissions"',
    description: 'Claude CLI (skip permissions)'
  }
};
```

### 2.6 Session Management
```javascript
// Session limits
const MAX_SESSIONS = 5;           // Max concurrent sessions
const SESSION_TIMEOUT = 30 * 60 * 1000;  // 30 minutes
const OUTPUT_BUFFER_SIZE = 1000;  // Last 1000 entries

// Terminal dimensions
const DEFAULT_COLS = 120;
const DEFAULT_ROWS = 40;
```

### 2.7 API Endpoints

#### Create Session
```http
POST /api/terminal/sessions
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "type": "claude",
  "cols": 120,
  "rows": 40
}
```

#### List Sessions
```http
GET /api/terminal/sessions
Authorization: Bearer <jwt_token>
```

#### Get Session Buffer
```http
GET /api/terminal/sessions/:id/buffer
Authorization: Bearer <jwt_token>
```

#### Resize Terminal
```http
POST /api/terminal/sessions/:id/resize
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "cols": 150,
  "rows": 50
}
```

#### Close Session
```http
DELETE /api/terminal/sessions/:id
Authorization: Bearer <jwt_token>
```

### 2.8 WebSocket Protocol

#### Connection
```javascript
// Frontend hook: useCliAiStream.ts
const ws = new WebSocket(`ws://localhost:3032?browserId=${browserId}`);

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  switch (data.type) {
    case 'cliAiStarted':
      // Session started
      break;
    case 'cliAiChunk':
      // Output chunk received
      terminal.write(data.content);
      break;
    case 'cliAiComplete':
      // Command completed
      break;
    case 'cliAiError':
      // Error occurred
      break;
    case 'cliAiAborted':
      // Session aborted
      break;
  }
};
```

#### Send Input
```javascript
ws.send(JSON.stringify({
  type: 'terminalInput',
  sessionId: sessionId,
  input: userInput
}));
```

### 2.9 Security
- **Superadmin only**: Requires superadmin role
- **Non-root execution**: Runs as `cliuser` for security
- **JWT authentication**: Required for all endpoints
- **Per-user isolation**: Sessions bound to user ID

---

## 3. Gemini CLI Integration

### 3.1 Overview
Direct terminal access to Google's Gemini CLI for AI-assisted tasks. Shares infrastructure with Claude CLI.

### 3.2 Configuration

#### Environment Variables
```bash
# Required
GOOGLE_API_KEY=AIzaSyxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### 3.3 Terminal Type
```javascript
const TERMINAL_TYPES = {
  'gemini': {
    command: 'su -l cliuser -c "cd /usr/src/app && gemini"',
    description: 'Gemini CLI'
  }
};
```

### 3.4 API Usage
Same API endpoints and WebSocket protocol as Claude CLI. Only the terminal type differs.

```http
POST /api/terminal/sessions
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "type": "gemini",
  "cols": 120,
  "rows": 40
}
```

### 3.5 Status Check
```javascript
// Frontend hook: useCliAiStatus.ts
const { isAvailable, providers } = useCliAiStatus();

// providers = ['claude', 'gemini'] if both configured
```

---

## 4. Local AI Integration (Ollama / LM Studio)

### 4.1 Overview
Support for local LLM inference using Ollama or LM Studio (OpenAI-compatible API). Primarily used for RAG embeddings but can be extended for chat.

### 4.2 Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌───────────────────┐
│   RAG Service   │────▶│  embeddingService│────▶│   Ollama          │
│                 │     │  .cjs            │     │   (port 11434)    │
└─────────────────┘     └──────────────────┘     └───────────────────┘
                                │
                                │                ┌───────────────────┐
                                └───────────────▶│   LM Studio       │
                                                 │   (port 1234)     │
                                                 └───────────────────┘
```

### 4.3 Primary Files
| File | Purpose |
|------|---------|
| `server/services/rag/embeddingService.cjs` | Embedding generation |
| `server/services/rag/embeddingProviderConfig.cjs` | Provider configuration |

### 4.4 Configuration

#### Environment Variables
```bash
# Ollama Configuration
OLLAMA_BASE_URL=http://host.docker.internal:11434
OLLAMA_MODEL=llama2

# LM Studio Configuration (OpenAI-compatible)
LMSTUDIO_BASE_URL=http://host.docker.internal:1234
LMSTUDIO_EMBEDDING_MODEL=nomic-embed-text-v1.5

# Default Embedding Provider
DEFAULT_EMBEDDING_PROVIDER=ollama
DEFAULT_EMBEDDING_MODEL=nomic-embed-text
```

### 4.5 Ollama Integration

#### API Endpoint
```
POST http://host.docker.internal:11434/api/embeddings
```

#### Request Format
```javascript
// server/services/rag/embeddingService.cjs
async function _callOllama(texts, model) {
  const embeddings = [];

  // Ollama processes one text at a time
  for (const text of texts) {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model,
        prompt: text
      })
    });

    const data = await response.json();
    embeddings.push(normalizeL2(data.embedding));
  }

  return embeddings;
}
```

#### Available Models
| Model | Dimensions | Notes |
|-------|------------|-------|
| `nomic-embed-text` | 768 | **Recommended** - Best balance |
| `mxbai-embed-large` | 1024 | Higher quality, slower |
| `all-minilm` | 384 | Fastest, lower quality |

### 4.6 LM Studio Integration (OpenAI-Compatible)

#### API Endpoint
```
POST http://host.docker.internal:1234/v1/embeddings
```

#### Request Format
```javascript
// server/services/rag/embeddingService.cjs
async function _callLMStudio(texts, model) {
  const response = await fetch(`${LMSTUDIO_BASE_URL}/v1/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: model,
      input: texts  // Supports batch input
    })
  });

  const data = await response.json();
  return data.data.map(item => normalizeL2(item.embedding));
}
```

#### Available Models
| Model | Dimensions | Notes |
|-------|------------|-------|
| `nomic-embed-text-v1.5` | 768 | **Recommended** - Best balance |
| `mxbai-embed-large-v1` | 1024 | Higher quality |
| `bge-large-en-v1.5` | 1024 | Good for English |
| `all-minilm-l6-v2` | 384 | Fastest |

### 4.7 L2 Normalization
```javascript
function normalizeL2(embedding) {
  const magnitude = Math.sqrt(
    embedding.reduce((sum, val) => sum + val * val, 0)
  );
  return embedding.map(val => val / magnitude);
}
```

### 4.8 Docker Network Access
```yaml
# docker-compose-secure.yml
services:
  backend:
    extra_hosts:
      - "host.docker.internal:host-gateway"
```

### 4.9 Caching
- **Redis cache**: Embeddings cached with configurable TTL
- **Default TTL**: 1 hour
- **Key format**: `embedding:{provider}:{model}:{text_hash}`

---

## 5. RAG System Implementation

### 5.1 Overview
Retrieval-Augmented Generation (RAG) system using Qdrant vector database for semantic search and document retrieval.

### 5.2 Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌───────────────────┐
│   Document      │────▶│  ingestionService│────▶│  embeddingService │
│   Upload        │     │  .cjs            │     │  .cjs             │
└─────────────────┘     └──────────────────┘     └───────────────────┘
                                │                         │
                                ▼                         ▼
                        ┌──────────────────┐     ┌───────────────────┐
                        │   SQLite DB      │     │   Qdrant          │
                        │   (metadata)     │     │   (vectors)       │
                        └──────────────────┘     └───────────────────┘
                                                          │
┌─────────────────┐     ┌──────────────────┐              │
│   User Query    │────▶│  ragQueryService │◀─────────────┘
│                 │     │  .cjs            │
└─────────────────┘     └──────────────────┘
```

### 5.3 Primary Files
| File | Purpose |
|------|---------|
| `server/services/rag/qdrantClient.cjs` | Qdrant vector DB client |
| `server/services/rag/ragQueryService.cjs` | Query processing |
| `server/services/rag/ingestionService.cjs` | Document ingestion |
| `server/services/rag/embeddingService.cjs` | Embedding generation |
| `server/services/rag/embeddingSubscriptionService.cjs` | API key management |
| `server/services/ragIntegrationService.cjs` | FlowBuilder integration |

### 5.4 Configuration

#### Environment Variables
```bash
# Qdrant Configuration
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=                    # Optional, for Qdrant Cloud

# Encryption (for API key storage)
ENCRYPTION_KEY=64-character-hex-string-32-bytes-required

# Default Embedding Settings
DEFAULT_EMBEDDING_PROVIDER=ollama
DEFAULT_EMBEDDING_MODEL=nomic-embed-text
```

### 5.5 Database Schema

#### SQLite (Per-User)
Location: `/data/users/{userId}/rag/rag.db`

```sql
-- User Documents Table
CREATE TABLE user_documents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  original_name TEXT,
  mime_type TEXT,
  size INTEGER,
  category TEXT,
  metadata TEXT,          -- JSON
  chunk_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Document Chunks Table
CREATE TABLE document_chunks (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  metadata TEXT,          -- JSON
  vector_id TEXT,         -- Qdrant point ID
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (document_id) REFERENCES user_documents(id)
);

-- Embedding Subscriptions Table
CREATE TABLE user_embedding_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  api_key_encrypted TEXT,  -- AES-256-GCM encrypted
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 5.6 Qdrant Collection Management

#### Collection Naming
```javascript
function getCollectionName(userId) {
  const sanitized = userId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `rag_${sanitized}`;
}
```

#### Collection Creation
```javascript
// server/services/rag/qdrantClient.cjs
async function createCollection(userId, vectorSize = 768) {
  const collectionName = getCollectionName(userId);

  await qdrantClient.createCollection(collectionName, {
    vectors: {
      size: vectorSize,
      distance: 'Cosine'
    }
  });
}
```

### 5.7 Embedding Providers

| Provider | Free | Models | Dimensions | Cost |
|----------|------|--------|------------|------|
| **Ollama** | Yes | nomic-embed-text, mxbai-embed-large, all-minilm | 384-1024 | Free |
| **LM Studio** | Yes | nomic-embed-text-v1.5, mxbai-embed-large-v1 | 384-1024 | Free |
| **OpenAI** | No | text-embedding-3-small, text-embedding-3-large | 1536, 3072 | $$$ |
| **Cohere** | No | embed-english-v3.0, embed-multilingual-v3.0 | 384-1024 | $$ |
| **Voyage AI** | No | voyage-2, voyage-large-2 | 1024-1536 | $$ |
| **Jina AI** | No | jina-embeddings-v2-base-en, v2-large-en | 768-1024 | $$ |

### 5.8 Document Ingestion

```javascript
// server/services/rag/ingestionService.cjs
async function ingestDocument(userId, file, options = {}) {
  const { category, metadata } = options;

  // 1. Parse document content
  const content = await parseDocument(file);

  // 2. Chunk content
  const chunks = chunkText(content, {
    chunkSize: 500,
    overlap: 50
  });

  // 3. Generate embeddings
  const embeddings = await embeddingService.generateEmbeddings(chunks);

  // 4. Store in Qdrant
  const points = chunks.map((chunk, i) => ({
    id: generateUUID(),
    vector: embeddings[i],
    payload: {
      content: chunk,
      category: category,
      chunk_index: i,
      document_id: documentId,
      ...metadata
    }
  }));

  await qdrantClient.upsert(getCollectionName(userId), { points });

  // 5. Store metadata in SQLite
  await db.run(`INSERT INTO user_documents ...`);
  await db.run(`INSERT INTO document_chunks ...`);

  return { documentId, chunkCount: chunks.length };
}
```

### 5.9 Query Service

#### Query Modes
| Mode | Description |
|------|-------------|
| `smart` | Auto-classify query to find best category |
| `direct` | Search specific category |
| `field` | Extract query from dynamic field |

#### Search Function
```javascript
// server/services/rag/ragQueryService.cjs
async function search(userId, query, options = {}) {
  const {
    limit = 5,
    scoreThreshold = 0.5,
    category = null,
    mode = 'smart'
  } = options;

  // 1. Generate query embedding
  const queryEmbedding = await embeddingService.generateEmbedding(query);

  // 2. Build filter
  const filter = category ? {
    must: [{ key: 'category', match: { value: category } }]
  } : undefined;

  // 3. Search Qdrant
  const results = await qdrantClient.search(getCollectionName(userId), {
    vector: queryEmbedding,
    limit: limit,
    filter: filter,
    score_threshold: scoreThreshold,
    with_payload: true
  });

  return results.map(r => ({
    score: r.score,
    content: r.payload.content,
    category: r.payload.category,
    metadata: r.payload
  }));
}
```

### 5.10 Smart Classification
```javascript
async function classifyQuery(query, categories) {
  const response = await openrouterSendPrompt({
    model: 'deepseek/deepseek-chat',
    systemPrompt: `Classify the following query into one of these categories: ${categories.join(', ')}. Respond with only the category name.`,
    prompt: query
  });

  return response.choices[0].message.content.trim();
}
```

### 5.11 FlowBuilder RAG Node
```javascript
// Node Configuration
{
  type: 'rag_query',
  config: {
    mode: 'smart',           // smart | direct | field
    category: '',            // For direct mode
    queryField: 'message',   // For field mode
    limit: 5,
    scoreThreshold: 0.5,
    outputVariable: 'ragResults'
  }
}
```

---

## 6. Email Integration (SMTP/IMAP/AWS SES)

### 6.1 Overview
Full email platform support including sending (SMTP), receiving (IMAP polling), and AWS SES for scalable transactional email.

### 6.2 Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌───────────────────┐
│   Email Agent   │────▶│   emailClient    │────▶│   SMTP Server     │
│   Config        │     │   .cjs           │     │   (Send)          │
└─────────────────┘     └──────────────────┘     └───────────────────┘
                                │
                                ▼
                        ┌──────────────────┐     ┌───────────────────┐
                        │  emailPolling    │────▶│   IMAP Server     │
                        │  Service.cjs     │     │   (Receive)       │
                        └──────────────────┘     └───────────────────┘
                                │
                                ▼
                        ┌──────────────────┐
                        │  Unified Message │
                        │  Router          │
                        └──────────────────┘
```

### 6.3 Primary Files
| File | Purpose |
|------|---------|
| `server/platforms/emailClient.cjs` | Email platform client |
| `server/services/emailService.cjs` | Email sending service |
| `server/services/emailPollingService.cjs` | IMAP polling service |
| `server/services/emailAccountService.cjs` | Account management |
| `server/services/emailSyncService.cjs` | Email sync service |

### 6.4 Configuration

#### Environment Variables
```bash
# SMTP Configuration (General)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false           # true for port 465
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=app-specific-password
EMAIL_FROM=noreply@swarmagent.local

# AWS SES Configuration
SMTP_HOST=email-smtp.us-east-1.amazonaws.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=AKIAXXXXXXXXXXXXXXXX
SMTP_PASSWORD=aws-smtp-password
AWS_SES_FROM_EMAIL=noreply@yourdomain.com

# IMAP Configuration (Receiving)
IMAP_HOST=imap.gmail.com
IMAP_PORT=993
IMAP_TLS=true
IMAP_USER=your-email@gmail.com
IMAP_PASSWORD=app-specific-password

# Polling Settings
EMAIL_POLL_INTERVAL=60      # seconds
```

### 6.5 AWS SES Setup

#### 1. Create IAM User for SMTP
```
IAM Console → Users → Add User
- Name: ses-smtp-user
- Access type: Programmatic access
- Attach policy: AmazonSESFullAccess
```

#### 2. Generate SMTP Credentials
```
SES Console → SMTP Settings → Create SMTP credentials
- Note: SMTP password is different from IAM secret key
```

#### 3. Verify Domain/Email
```
SES Console → Identities → Verify a new identity
- Domain verification (recommended) or
- Email address verification
```

#### 4. Move Out of Sandbox (Production)
```
SES Console → Account dashboard → Request production access
```

### 6.6 Agent Email Configuration
```json
// data/agents/{agentId}/profile.json
{
  "platform": "email",
  "emailConfig": {
    "smtp": {
      "host": "email-smtp.us-east-1.amazonaws.com",
      "port": 587,
      "secure": false,
      "auth": {
        "user": "AKIAXXXXXXXXXXXXXXXX",
        "pass": "encrypted-password"
      }
    },
    "imap": {
      "host": "imap.gmail.com",
      "port": 993,
      "tls": true,
      "auth": {
        "user": "your-email@gmail.com",
        "pass": "encrypted-password"
      }
    },
    "fromEmail": "noreply@yourdomain.com",
    "fromName": "SwarmAgent",
    "pollInterval": 60
  }
}
```

### 6.7 Sending Email

```javascript
// server/services/emailService.cjs
const nodemailer = require('nodemailer');

async function sendEmail(agentId, options) {
  const config = await getEmailConfig(agentId);

  const transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: {
      user: config.smtp.auth.user,
      pass: decrypt(config.smtp.auth.pass)
    }
  });

  const mailOptions = {
    from: `"${config.fromName}" <${config.fromEmail}>`,
    to: options.to,
    cc: options.cc,
    bcc: options.bcc,
    subject: options.subject,
    text: options.text,
    html: options.html,
    attachments: options.attachments
  };

  return transporter.sendMail(mailOptions);
}
```

### 6.8 Receiving Email (IMAP Polling)

```javascript
// server/services/emailPollingService.cjs
const Imap = require('imap');
const { simpleParser } = require('mailparser');

class EmailPollingService {
  constructor(agentId, config) {
    this.agentId = agentId;
    this.config = config;
    this.processedUIDs = new Set();
  }

  startPolling() {
    this.pollInterval = setInterval(
      () => this.checkNewEmails(),
      this.config.pollInterval * 1000
    );
  }

  async checkNewEmails() {
    const imap = new Imap({
      user: this.config.imap.auth.user,
      password: decrypt(this.config.imap.auth.pass),
      host: this.config.imap.host,
      port: this.config.imap.port,
      tls: this.config.imap.tls
    });

    imap.once('ready', () => {
      imap.openBox('INBOX', false, (err, box) => {
        imap.search(['UNSEEN'], (err, uids) => {
          const newUIDs = uids.filter(uid => !this.processedUIDs.has(uid));

          if (newUIDs.length === 0) {
            imap.end();
            return;
          }

          const fetch = imap.fetch(newUIDs, { bodies: '' });

          fetch.on('message', (msg, seqno) => {
            msg.on('body', (stream) => {
              simpleParser(stream, (err, parsed) => {
                this.processEmail(parsed);
              });
            });
          });

          fetch.once('end', () => {
            newUIDs.forEach(uid => this.processedUIDs.add(uid));
            imap.end();
          });
        });
      });
    });

    imap.connect();
  }

  processEmail(parsed) {
    const message = {
      platform: 'email',
      from: parsed.from.value[0].address,
      to: parsed.to.value[0].address,
      subject: parsed.subject,
      body: parsed.text || parsed.html,
      attachments: parsed.attachments,
      timestamp: parsed.date
    };

    // Route through unified message router
    unifiedMessageRouter.handleIncoming(this.agentId, message);
  }
}
```

### 6.9 FlowBuilder Email Nodes

#### Send Email Node
```javascript
{
  type: 'email_send',
  config: {
    to: '{{recipientEmail}}',
    cc: '',
    bcc: '',
    subject: '{{emailSubject}}',
    body: '{{emailBody}}',
    isHtml: false,
    attachments: []
  }
}
```

#### Email Trigger Node
```javascript
{
  type: 'email_received',
  config: {
    fromFilter: '*@example.com',
    subjectFilter: 'Support:*',
    matchType: 'contains'     // exact | contains | regex
  }
}
```

### 6.10 Attachment Handling
```javascript
// Supported attachment types
const ALLOWED_MIME_TYPES = [
  'image/*',
  'video/mp4',
  'audio/mpeg',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.*'
];

const MAX_ATTACHMENT_SIZE = 100 * 1024 * 1024; // 100MB
```

---

## 7. AI Router & Usage Tracking

### 7.1 Overview
Centralized AI request routing with usage tracking, rate limiting, and cost management.

### 7.2 Primary Files
| File | Purpose |
|------|---------|
| `server/services/aiRouterUsageService.cjs` | Usage tracking & rate limiting |
| `server/services/aiRouterAnalyticsService.cjs` | Analytics & reporting |

### 7.3 Rate Limiting Configuration

```javascript
const RATE_LIMITS = {
  default: {
    requestsPerMinute: 20,
    requestsPerHour: 200,
    requestsPerDay: 1000,
    dailyBudget: 10.00  // USD
  },
  authenticated: {
    requestsPerMinute: 100,
    requestsPerHour: 1000,
    requestsPerDay: 5000,
    dailyBudget: 50.00  // USD
  }
};
```

### 7.4 Usage Tracking

```javascript
// server/services/aiRouterUsageService.cjs
class AIRouterUsageService {
  async trackUsage(userId, request, response) {
    const usage = {
      userId,
      model: request.model,
      provider: this.getProvider(request.model),
      inputTokens: response.usage?.prompt_tokens || this.estimateTokens(request.prompt),
      outputTokens: response.usage?.completion_tokens || this.estimateTokens(response.content),
      cost: this.calculateCost(request.model, response.usage),
      timestamp: Date.now()
    };

    await this.redis.lpush(`usage:${userId}`, JSON.stringify(usage));
    await this.updateRateLimits(userId, usage);

    return usage;
  }

  calculateCost(model, usage) {
    const pricing = this.getPricing(model);
    const inputCost = (usage.prompt_tokens / 1000000) * pricing.input;
    const outputCost = (usage.completion_tokens / 1000000) * pricing.output;
    return inputCost + outputCost;
  }
}
```

### 7.5 Intent Caching

```javascript
const INTENT_CACHE_CONFIG = {
  minConfidenceForCache: 0.80,
  defaultConfidenceForLookup: 0.85,
  ttlMinutes: 60
};

async function getCachedIntent(query) {
  const key = `intent:${hashQuery(query)}`;
  const cached = await redis.get(key);

  if (cached && cached.confidence >= INTENT_CACHE_CONFIG.defaultConfidenceForLookup) {
    return cached;
  }

  return null;
}
```

### 7.6 Analytics Dashboard Data

```javascript
// server/services/aiRouterAnalyticsService.cjs
async function getUsageAnalytics(userId, period = '7d') {
  return {
    totalRequests: await this.getTotalRequests(userId, period),
    totalCost: await this.getTotalCost(userId, period),
    byModel: await this.getUsageByModel(userId, period),
    byDay: await this.getUsageByDay(userId, period),
    topQueries: await this.getTopQueries(userId, period)
  };
}
```

---

## 8. Swarm Intelligence Integration

### 8.1 Overview
SwarmAI introduces a revolutionary multi-agent collaboration system where agents work together like a hive mind. The swarm intelligence layer enables agents to share context, hand off conversations, collaborate on complex tasks, and collectively learn from interactions.

### 8.2 Swarm Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    SWARM ORCHESTRATOR                            │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              COORDINATION LAYER                          │    │
│  │  - Agent Discovery    - Load Balancing                  │    │
│  │  - Task Distribution  - Consensus Management            │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│           ┌──────────────────┼──────────────────┐               │
│           ▼                  ▼                  ▼               │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐        │
│  │   Agent A    │   │   Agent B    │   │   Agent C    │        │
│  │  (WhatsApp)  │◄──┤  (Telegram)  │──►│   (Email)    │        │
│  │   Expert:    │   │   Expert:    │   │   Expert:    │        │
│  │   Sales      │   │   Support    │   │   Technical  │        │
│  └──────────────┘   └──────────────┘   └──────────────┘        │
│         │                   │                   │               │
│         └───────────────────┴───────────────────┘               │
│                             │                                    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              COLLECTIVE MEMORY                           │    │
│  │  Shared context, learned patterns, knowledge sync       │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

### 8.3 Agent Collaboration Patterns

#### 8.3.1 Handoff Pattern
Transfer conversation between agents based on expertise, capacity, or availability.

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

#### 8.3.2 Collaboration Pattern
Multiple agents work together on complex tasks.

```typescript
interface SwarmCollaboration {
  collaborationId: string;
  initiatorAgentId: string;
  participantAgents: string[];
  task: {
    type: 'complex_query' | 'multi_step_workflow' | 'knowledge_synthesis';
    description: string;
    deadline?: Date;
  };
  consensusRequired: boolean;
  votingThreshold: number;
}
```

#### 8.3.3 Broadcast Pattern
One agent broadcasts information to all or selected agents.

```typescript
interface SwarmBroadcast {
  sourceAgentId: string;
  targetScope: 'all' | 'department' | 'skill' | 'selected';
  targetFilter?: string[];
  message: {
    type: 'alert' | 'update' | 'request' | 'knowledge';
    content: any;
    priority: 'low' | 'medium' | 'high';
    expiresAt?: Date;
  };
}
```

### 8.4 Agent Discovery & Registration

```typescript
interface SwarmRegistry {
  agents: Map<string, AgentCapability>;
  lastHeartbeat: Map<string, Date>;
  loadMetrics: Map<string, LoadMetrics>;
}

interface AgentCapability {
  agentId: string;
  name: string;
  status: 'online' | 'busy' | 'away' | 'offline';
  capabilities: {
    languages: string[];
    specializations: string[];
    platforms: string[];
    maxConcurrentChats: number;
  };
  currentLoad: number;
  averageResponseTime: number;
  satisfactionScore: number;
}
```

### 8.5 Dynamic Load Balancing

| Strategy | Description | Use Case |
|----------|-------------|----------|
| **Round Robin** | Distribute evenly across available agents | General distribution |
| **Weighted** | Factor in agent skill level and performance | Quality-focused |
| **Expertise-Based** | Route based on required specialization | Complex queries |
| **Availability** | Consider working hours and current load | 24/7 coverage |
| **Sticky Session** | Keep customer with same agent | Relationship building |

```typescript
interface LoadBalancingConfig {
  strategy: 'round_robin' | 'weighted' | 'expertise' | 'availability' | 'sticky';
  weights?: {
    performance: number;
    availability: number;
    expertise: number;
  };
  stickyDuration?: number; // minutes
  overflowBehavior: 'queue' | 'handoff' | 'reject';
}
```

### 8.6 Consensus Mechanisms

For decisions requiring multiple agent agreement:

```typescript
interface ConsensusRequest {
  requestId: string;
  initiatorAgentId: string;
  participants: string[];
  decision: {
    type: 'approve' | 'classify' | 'recommend';
    options: string[];
    context: any;
  };
  votingMethod: 'majority' | 'unanimous' | 'weighted';
  timeout: number; // seconds
}

interface ConsensusVote {
  requestId: string;
  agentId: string;
  vote: string;
  confidence: number;
  reasoning?: string;
  timestamp: Date;
}
```

### 8.7 Collective Learning Pipeline

```
┌─────────────────────────────────────────────────────────────┐
│                COLLECTIVE LEARNING PIPELINE                   │
│                                                               │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐       │
│  │   CAPTURE   │───►│   VALIDATE  │───►│  PROPAGATE  │       │
│  │  Successful │    │  Pattern    │    │  To Swarm   │       │
│  │  Patterns   │    │  Quality    │    │  Members    │       │
│  └─────────────┘    └─────────────┘    └─────────────┘       │
│                                                               │
│  Pattern Types:                                               │
│  • Intent → Response mappings                                 │
│  • Escalation triggers                                        │
│  • Resolution strategies                                      │
│  • Customer sentiment handling                                │
└─────────────────────────────────────────────────────────────┘
```

```typescript
interface CollectiveLearning {
  enabled: boolean;
  captureThreshold: number;
  validationRequired: boolean;
  validatorAgents: string[];
  propagationDelay: number;
  learningTypes: ('response' | 'escalation' | 'resolution' | 'sentiment')[];
}
```

### 8.8 Agent Reputation System

```typescript
interface AgentReputation {
  agentId: string;
  overallScore: number; // 0-100

  metrics: {
    responseQuality: number;
    resolutionRate: number;
    customerSatisfaction: number;
    handoffSuccess: number;
    collaborationScore: number;
    learningContribution: number;
  };

  badges: AgentBadge[];
  history: ReputationEvent[];
}

interface AgentBadge {
  type: 'expert' | 'reliable' | 'fast' | 'helpful' | 'mentor';
  earnedAt: Date;
  domain?: string;
}
```

### 8.9 Swarm Health Monitoring

| Metric | Description | Alert Threshold |
|--------|-------------|-----------------|
| **Swarm Connectivity** | % of agents online and responsive | < 80% |
| **Average Load** | Mean load across all agents | > 85% |
| **Collaboration Rate** | % of queries involving multiple agents | Trend monitoring |
| **Consensus Success** | % of consensus requests resolved | < 90% |
| **Knowledge Sync** | Lag in collective knowledge propagation | > 5 minutes |
| **Handoff Latency** | Time to complete agent handoffs | > 10 seconds |

---

## 9. MCP (Model Context Protocol) Integration

### 9.1 Overview
SwarmAI integrates the Model Context Protocol (MCP) for extensible tool usage, enabling agents to interact with external services and perform complex operations.

### 9.2 MCP Architecture

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
│  └─────────────────────┬───────────────────────────────┘    │
│                        │                                     │
│         ┌──────────────┼──────────────┐                     │
│         ▼              ▼              ▼                     │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐        │
│  │  MCP Server  │ │  MCP Server  │ │  MCP Server  │        │
│  │  (Database)  │ │  (Calendar)  │ │   (Custom)   │        │
│  └──────────────┘ └──────────────┘ └──────────────┘        │
└─────────────────────────────────────────────────────────────────┘
```

### 9.3 MCP Configuration

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

### 9.4 Built-in MCP Servers

| Server | Capabilities | Description |
|--------|-------------|-------------|
| **database** | query, insert, update | SQL database operations |
| **calendar** | read, create, update | Google/Outlook calendar |
| **email** | send, search, read | Email operations |
| **filesystem** | read, write, list | File system access |
| **browser** | navigate, screenshot, extract | Web browser automation |
| **slack** | post, read, react | Slack integration |

### 9.5 Custom MCP Server Template

```javascript
// server/mcp/custom-server-template.cjs
const { MCPServer } = require('@modelcontextprotocol/server');

class CustomMCPServer extends MCPServer {
  constructor() {
    super({
      name: 'custom-server',
      version: '1.0.0',
      capabilities: ['tools', 'resources']
    });

    this.registerTool('custom_action', {
      description: 'Perform custom action',
      inputSchema: {
        type: 'object',
        properties: {
          param: { type: 'string' }
        },
        required: ['param']
      }
    }, async (params) => {
      // Implementation
      return { result: 'success' };
    });
  }
}
```

### 9.6 FlowBuilder MCP Integration

```javascript
// MCP Tool Node Configuration
{
  type: 'mcp_tool',
  config: {
    server: 'database',
    tool: 'query',
    parameters: {
      sql: '{{queryString}}',
      database: 'customers'
    },
    timeout: 30000,
    outputVariable: 'queryResults'
  }
}
```

---

## 10. Multimodal Capabilities

### 10.1 Overview
SwarmAI supports multimodal AI interactions including vision, audio, and document processing for rich conversational experiences.

### 10.2 Multimodal Architecture

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

### 10.3 Multimodal Configuration

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

### 10.4 Vision Processing

#### Supported Providers
| Provider | Models | Capabilities |
|----------|--------|-------------|
| **OpenAI** | GPT-4 Vision, GPT-4o | Image analysis, OCR, diagram understanding |
| **Anthropic** | Claude 3 Sonnet/Opus | Detailed image analysis, visual reasoning |
| **Google** | Gemini Pro Vision | Image search, visual Q&A |
| **Local** | LLaVA, Stable Diffusion | Offline image processing |

#### Vision Node Configuration
```javascript
{
  type: 'analyze_image',
  config: {
    provider: 'anthropic',
    model: 'claude-3-sonnet',
    prompt: 'Describe this image in detail',
    extractText: true,
    detectObjects: true,
    outputVariable: 'imageAnalysis'
  }
}
```

### 10.5 Audio Processing

#### Speech-to-Text
```javascript
{
  type: 'transcribe_audio',
  config: {
    provider: 'whisper',
    model: 'whisper-1',
    language: 'auto',
    outputVariable: 'transcript'
  }
}
```

#### Text-to-Speech
```javascript
{
  type: 'text_to_speech',
  config: {
    provider: 'elevenlabs',
    voice: 'rachel',
    text: '{{responseText}}',
    outputFormat: 'mp3',
    outputVariable: 'audioUrl'
  }
}
```

### 10.6 Document Processing

| Document Type | Processing | Output |
|---------------|------------|--------|
| **PDF** | OCR + Text extraction | Structured text, tables |
| **DOCX** | Direct parsing | Text, formatting, images |
| **XLSX** | Table extraction | JSON data, formulas |
| **Images** | OCR + Vision | Text, visual description |

### 10.7 FlowBuilder Multimodal Nodes

| Node | Description | Inputs | Outputs |
|------|-------------|--------|---------|
| **Analyze Image** | Extract info from images | Image URL/Base64 | Description, objects, text |
| **Transcribe Audio** | Convert speech to text | Audio file/URL | Transcript, language |
| **Text to Speech** | Generate audio from text | Text, voice | Audio file |
| **Parse Document** | Extract content from docs | PDF/DOCX | Structured content |
| **Image Generation** | Create images from prompts | Text prompt | Image URL |

---

## 11. FlowBuilder Swarm Nodes

### 11.1 Overview
New FlowBuilder nodes specifically designed for swarm intelligence operations.

### 11.2 Swarm Node Categories

#### 11.2.1 Collaboration Nodes

| Node | Description | Configuration |
|------|-------------|---------------|
| **Agent Handoff** | Transfer conversation to another agent | targetAgent, reason, context |
| **Swarm Broadcast** | Send message to multiple agents | scope, message, priority |
| **Request Collaboration** | Request help from specialist agents | task, participants, timeout |
| **Consensus Vote** | Initiate multi-agent voting | options, votingMethod, threshold |

#### 11.2.2 Discovery Nodes

| Node | Description | Configuration |
|------|-------------|---------------|
| **Find Agent** | Find agent by capability | skills, availability, load |
| **Agent Status** | Check agent availability | agentId, metrics |
| **Swarm Health** | Get swarm metrics | metricTypes |

#### 11.2.3 Learning Nodes

| Node | Description | Configuration |
|------|-------------|---------------|
| **Share Pattern** | Share successful pattern with swarm | patternType, pattern |
| **Query Patterns** | Search collective knowledge | query, patternType |
| **Update Reputation** | Adjust agent reputation | agentId, metric, delta |

### 11.3 Agent Handoff Node

```typescript
interface HandoffNodeConfig {
  // Target selection
  targetMode: 'specific' | 'capability' | 'least_busy';
  targetAgentId?: string;
  requiredCapabilities?: string[];

  // Context transfer
  includeHistory: boolean;
  historyLength: number;
  customContext?: Record<string, any>;

  // Handoff settings
  priority: 'low' | 'medium' | 'high' | 'urgent';
  timeout: number;
  fallbackAction: 'queue' | 'return' | 'escalate';

  // Notification
  notifyCustomer: boolean;
  notificationMessage?: string;
}
```

### 11.4 Swarm Broadcast Node

```typescript
interface BroadcastNodeConfig {
  // Target scope
  scope: 'all' | 'department' | 'skill' | 'selected';
  departments?: string[];
  skills?: string[];
  agentIds?: string[];

  // Message
  messageType: 'alert' | 'update' | 'request' | 'knowledge';
  content: string;
  priority: 'low' | 'medium' | 'high';

  // Settings
  requireAck: boolean;
  expiresIn?: number; // seconds
}
```

### 11.5 Consensus Vote Node

```typescript
interface ConsensusNodeConfig {
  // Decision
  decisionType: 'approve' | 'classify' | 'recommend';
  options: string[];
  contextData: Record<string, any>;

  // Participants
  participantMode: 'all' | 'specialists' | 'selected';
  requiredSpecializations?: string[];
  minParticipants: number;

  // Voting
  votingMethod: 'majority' | 'unanimous' | 'weighted';
  timeout: number;

  // Output
  outputVariable: string;
}
```

### 11.6 Cross-Agent Flow Call

```typescript
interface CrossAgentCallConfig {
  // Target
  targetAgentId: string;
  flowId: string;

  // Input
  inputMapping: Record<string, string>;

  // Settings
  async: boolean;
  timeout: number;
  waitForResult: boolean;

  // Output
  outputVariable: string;
}
```

### 11.7 Example: Intelligent Routing Flow

```
┌─────────────────┐
│ Message Trigger │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  AI Classify    │
│  Intent         │
└────────┬────────┘
         │
         ▼
┌─────────────────┐      ┌─────────────────┐
│   Condition:    │──►   │  Find Agent     │
│   Complex?      │ Yes  │  (Specialist)   │
└────────┬────────┘      └────────┬────────┘
         │ No                     │
         ▼                        ▼
┌─────────────────┐      ┌─────────────────┐
│  AI Response    │      │  Agent Handoff  │
│  (Self-handle)  │      │  + Context      │
└────────┬────────┘      └────────┬────────┘
         │                        │
         └────────────┬───────────┘
                      ▼
              ┌─────────────────┐
              │  Send Response  │
              └─────────────────┘
```

---

## 12. Configuration Reference

### 12.1 Complete Environment Variables

```bash
# ===========================================
# SERVER CONFIGURATION
# ===========================================
PORT=3031
WS_PORT=3032
FRONTEND_PORT=3033
NODE_ENV=production

# ===========================================
# REDIS CONFIGURATION
# ===========================================
REDIS_HOST=localhost
REDIS_PORT=6380
REDIS_PASSWORD=your-redis-password
REDIS_DB=1

# ===========================================
# AI PROVIDERS
# ===========================================

# OpenRouter (Primary)
OPENROUTER_API_KEY=sk-or-v1-xxxxxxxxxxxxxxxxxxxx
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_MODEL=google/gemma-2-9b-it:free

# Claude CLI
ANTHROPIC_API_KEY=sk-ant-api03-xxxxxxxxxxxxxxxxxxxx

# Gemini CLI
GOOGLE_API_KEY=AIzaSyxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# ===========================================
# LOCAL AI (OLLAMA / LM STUDIO)
# ===========================================

# Ollama
OLLAMA_BASE_URL=http://host.docker.internal:11434
OLLAMA_MODEL=llama2

# LM Studio (OpenAI-compatible)
LMSTUDIO_BASE_URL=http://host.docker.internal:1234
LMSTUDIO_EMBEDDING_MODEL=nomic-embed-text-v1.5

# ===========================================
# RAG SYSTEM
# ===========================================

# Qdrant Vector Database
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=                    # Optional, for Qdrant Cloud

# Encryption Key (32 bytes = 64 hex chars)
ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef

# Default Embedding Provider
DEFAULT_EMBEDDING_PROVIDER=ollama
DEFAULT_EMBEDDING_MODEL=nomic-embed-text

# ===========================================
# EMAIL CONFIGURATION
# ===========================================

# SMTP (Sending)
SMTP_HOST=smtp.gmail.com           # or email-smtp.us-east-1.amazonaws.com for AWS SES
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
EMAIL_FROM=noreply@yourdomain.com

# IMAP (Receiving)
IMAP_HOST=imap.gmail.com
IMAP_PORT=993
IMAP_TLS=true
IMAP_USER=your-email@gmail.com
IMAP_PASSWORD=your-app-password

# Polling
EMAIL_POLL_INTERVAL=60

# ===========================================
# AWS SES (Optional, instead of Gmail SMTP)
# ===========================================
AWS_SES_FROM_EMAIL=noreply@yourdomain.com
# Use SMTP credentials from SES Console, not IAM credentials

# ===========================================
# SECURITY
# ===========================================
JWT_SECRET=your-jwt-secret-key
JWT_REFRESH_SECRET=your-refresh-secret-key

# ===========================================
# WHATSAPP WEB.JS WORKAROUND
# ===========================================
DISABLE_SEND_SEEN=true             # Prevents markedUnread error
```

### 12.2 Docker Ports Reference

| Service | Internal Port | External Port | Purpose |
|---------|--------------|---------------|---------|
| Backend API | 3031 | 127.0.0.1:3031 | REST API |
| WebSocket | 3032 | 127.0.0.1:3032 | Real-time events |
| Frontend | 3033 | 127.0.0.1:3033 | React UI |
| Redis | 6379 | 127.0.0.1:6380 | Cache & sessions |
| Qdrant | 6333 | 127.0.0.1:6333 | Vector database |
| Ollama | 11434 | host.docker.internal:11434 | Local LLM |
| LM Studio | 1234 | host.docker.internal:1234 | Local LLM |

### 12.3 Model Recommendations

| Use Case | Recommended Model | Provider | Cost |
|----------|-------------------|----------|------|
| Chat (Free) | google/gemma-2-9b-it:free | OpenRouter | Free |
| Chat (Quality) | deepseek/deepseek-chat | OpenRouter | $0.14-0.28/M |
| Chat (Best) | anthropic/claude-sonnet-4 | OpenRouter | $3-15/M |
| Embeddings (Free) | nomic-embed-text | Ollama | Free |
| Embeddings (Quality) | text-embedding-3-large | OpenAI | Paid |
| Classification | deepseek/deepseek-chat | OpenRouter | $0.14-0.28/M |

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 2.0 | Jan 2026 | Added Swarm Intelligence, MCP Integration, Multimodal Capabilities, FlowBuilder Swarm Nodes |
| 1.0 | Jan 2026 | Initial release |

---

*This document is part of the SwarmAI Multi-Agent Messaging Platform technical documentation.*
