# Quick Start Guide for Developers

Get SwarmAI running locally and make your first API call in 10 minutes.

## Prerequisites

- **Node.js**: v18+ (LTS recommended)
- **Docker**: For Redis and Qdrant
- **Git**: For cloning the repository
- **Code Editor**: VS Code recommended

## Step 1: Clone and Install

```bash
# Clone repository
git clone https://github.com/your-org/SwarmAI.git
cd SwarmAI

# Install dependencies
npm install

# Verify installation
npm run --version
```

## Step 2: Start Dependencies

```bash
# Start Redis + Qdrant via Docker Compose
docker compose up -d

# Verify services are running
docker ps
# Should show: swarmAI-redis, swarmAI-qdrant
```

### Manual Service Start (if needed)

**Redis**:
```bash
docker run -d --name swarmAI-redis \
  -p 6380:6379 \
  -e REDIS_PASSWORD=your_redis_password \
  redis:7-alpine redis-server --requirepass your_redis_password
```

**Qdrant**:
```bash
docker run -d --name swarmAI-qdrant \
  -p 6333:6333 \
  -v qdrant_data:/qdrant/storage \
  qdrant/qdrant:latest
```

## Step 3: Configure Environment

```bash
# Copy example environment file
cp .env.example .env

# Edit .env file
nano .env  # or use your preferred editor
```

### Required Environment Variables

```env
# Core
NODE_ENV=development
PORT=3031
FRONTEND_PORT=3202
JWT_SECRET=your-super-secret-jwt-key-change-this

# Database
DB_PATH=./server/data/swarmAI.db

# Redis
REDIS_HOST=localhost
REDIS_PORT=6380
REDIS_PASSWORD=your_redis_password

# Qdrant
QDRANT_URL=http://localhost:6333

# AI Providers (at least one required)
OPENROUTER_API_KEY=your_openrouter_key
OLLAMA_BASE_URL=http://localhost:11434

# Optional: CLI AI (for agentic AI)
CLAUDE_CLI_ENABLED=false
GEMINI_CLI_ENABLED=false
OPENCODE_CLI_ENABLED=false

# Testing (localhost only)
TEST_BYPASS_TOKEN=swarm-test-bypass-2026
```

### Get API Keys

1. **OpenRouter** (recommended): [openrouter.ai](https://openrouter.ai)
   - Sign up for free
   - Get API key from dashboard
   - Free models available (DeepSeek, Qwen)

2. **Ollama** (optional, local):
   ```bash
   # Install Ollama
   curl -fsSL https://ollama.ai/install.sh | sh

   # Pull a model
   ollama pull llama2
   ```

## Step 4: Initialize Database

```bash
# Run database initialization script
npm run db:init

# This creates:
# - server/data/swarmAI.db (main database)
# - All required tables and indexes
# - Default admin user (username: admin, password: admin)
```

## Step 5: Start Development Server

```bash
# Start both backend and frontend
npm run dev

# Or start individually:
# Backend only
cd server && node index.cjs

# Frontend only (in another terminal)
cd frontend && npm run dev
```

### Verify Services

- **Backend API**: [http://localhost:3031](http://localhost:3031)
- **Frontend**: [http://localhost:3202](http://localhost:3202)
- **WebSocket**: [ws://localhost:3032](ws://localhost:3032)

## Step 6: Make Your First API Call

### Authenticate

```bash
# Get authentication token
curl -X POST http://localhost:3031/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "admin"
  }'
```

Response:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": 1,
    "username": "admin",
    "role": "superadmin"
  }
}
```

Save the token for subsequent requests.

### Create an Agent

```bash
curl -X POST http://localhost:3031/api/agents \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Dev Assistant",
    "description": "API test agent",
    "provider": "openrouter",
    "model": "deepseek/deepseek-r1-0528",
    "systemPrompt": "You are a helpful coding assistant.",
    "temperature": 0.7,
    "maxTokens": 4096
  }'
```

Response:
```json
{
  "id": 1,
  "name": "Dev Assistant",
  "status": "active",
  "createdAt": "2026-02-03T10:00:00.000Z"
}
```

### Send a Message

```bash
curl -X POST http://localhost:3031/api/messages \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": 1,
    "content": "Hello! Can you help me debug a JavaScript function?",
    "role": "user"
  }'
```

Response:
```json
{
  "id": 1,
  "conversationId": 1,
  "agentId": 1,
  "content": "Of course! I'd be happy to help you debug. Please share the function code and describe the issue you're experiencing.",
  "role": "assistant",
  "timestamp": "2026-02-03T10:01:00.000Z"
}
```

## Step 7: Test with Bypass Token (Localhost Only)

For quick testing without authentication:

```bash
# List all agents (no auth required with bypass token)
curl -H "Authorization: Bearer swarm-test-bypass-2026" \
  http://localhost:3031/api/agents
```

**⚠️ Security Note**: Bypass token only works in development (`NODE_ENV=development`) and is disabled in production.

## Project Structure

```
SwarmAI/
├── server/                  # Backend (CommonJS)
│   ├── index.cjs           # Entry point
│   ├── routes/             # API routes (21 files)
│   ├── services/           # Business logic
│   │   ├── ai/            # SuperBrain, providers
│   │   ├── flow/          # FlowBuilder engine
│   │   ├── rag/           # RAG pipeline
│   │   ├── swarm/         # Swarm orchestration
│   │   └── *.cjs          # Core services
│   ├── platforms/         # WhatsApp, Telegram, Email
│   ├── data/              # Runtime data (SQLite, workspaces)
│   └── scripts/           # Maintenance scripts
│
├── frontend/              # React 18 + Vite
│   ├── src/
│   │   ├── pages/        # Route pages
│   │   ├── components/   # UI components
│   │   ├── stores/       # Zustand state management
│   │   └── services/     # API clients
│   └── public/
│
├── docs/                  # Documentation
├── docker-compose.yml     # Redis + Qdrant
├── package.json           # Root package (Turbo monorepo)
└── .env                   # Configuration
```

## Development Workflow

### Running Tests

```bash
# Run all tests
npm run test

# Run specific test file
cd server
npx vitest run services/ai/TaskClassifier.test.cjs

# Watch mode
npm run test:watch
```

### Linting & Formatting

```bash
# Lint code
npm run lint

# Fix lint issues
npm run lint:fix

# Format code (if Prettier is configured)
npm run format
```

### Database Migrations

```bash
# Create backup before migration
cp server/data/swarmAI.db server/data/swarmAI.db.backup

# Run migration script
node server/scripts/migrate-xxx.cjs

# Verify migration
sqlite3 server/data/swarmAI.db ".schema"
```

## Common Development Tasks

### Add a New API Endpoint

1. Create route file in `server/routes/`:
   ```javascript
   // server/routes/myFeature.cjs
   const express = require('express');
   const router = express.Router();
   const { authenticate } = require('../middleware/auth.cjs');

   router.get('/', authenticate, async (req, res) => {
     try {
       // Your logic here
       res.json({ success: true, data: [] });
     } catch (error) {
       res.status(500).json({ error: error.message });
     }
   });

   module.exports = router;
   ```

2. Register route in `server/index.cjs`:
   ```javascript
   const myFeatureRoutes = require('./routes/myFeature.cjs');
   app.use('/api/my-feature', myFeatureRoutes);
   ```

### Add a New FlowBuilder Node

1. Create node file in `server/services/flow/nodes/`:
   ```javascript
   // server/services/flow/nodes/custom/MyNode.cjs
   class MyNode {
     async execute(inputs, context) {
       // Node logic
       return { success: true, output: "result" };
     }
   }

   module.exports = MyNode;
   ```

2. Register in `server/services/flow/FlowEngine.cjs`

### Add a New AI Provider

1. Create provider in `server/services/ai/providers/`:
   ```javascript
   // server/services/ai/providers/MyProvider.cjs
   class MyProvider {
     constructor(config) {
       this.apiKey = config.apiKey;
     }

     async chat(messages, options) {
       // API call logic
       return { content: "response", usage: { tokens: 100 } };
     }
   }

   module.exports = MyProvider;
   ```

2. Register in `server/services/ai/SuperBrainRouter.cjs`

## Debugging

### Backend Debugging

```bash
# Enable debug logs
DEBUG=swarmAI:* node server/index.cjs

# Or use VS Code debugger (launch.json):
{
  "type": "node",
  "request": "launch",
  "name": "Debug Backend",
  "program": "${workspaceFolder}/server/index.cjs",
  "env": {
    "NODE_ENV": "development"
  }
}
```

### Frontend Debugging

Use React DevTools and browser console. Zustand DevTools available in dev mode.

### Database Debugging

```bash
# Open SQLite CLI
sqlite3 server/data/swarmAI.db

# Useful queries
.tables                          # List tables
.schema agents                   # Show table schema
SELECT * FROM agents LIMIT 10;   # View data
.quit                            # Exit
```

## Next Steps

- [Explore Architecture](../03-developer-guides/architecture.md)
- [API Reference](../06-api-reference/authentication.md)
- [Build Custom Integrations](../03-developer-guides/custom-integrations.md)
- [Contribute to SwarmAI](../03-developer-guides/contributing.md)

## Troubleshooting

### Port Already in Use

```bash
# Find process using port 3031
lsof -i :3031  # macOS/Linux
netstat -ano | findstr :3031  # Windows

# Kill process
kill -9 <PID>  # macOS/Linux
taskkill /PID <PID> /F  # Windows
```

### Docker Services Not Starting

```bash
# Check logs
docker compose logs redis
docker compose logs qdrant

# Restart services
docker compose restart

# Clean start
docker compose down -v
docker compose up -d
```

### Database Locked Error

SQLite WAL mode is enabled, but if you still get errors:

```bash
# Check for other processes
fuser server/data/swarmAI.db  # Linux
lsof server/data/swarmAI.db   # macOS

# Close connections and restart
```

---

**Estimated Time**: 10-15 minutes
**Difficulty**: Intermediate
**Prerequisites**: Node.js, Docker, Basic API knowledge
