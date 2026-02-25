# API Overview

Complete REST API reference for SwarmAI platform.

## Base Information

**Base URLs**:
- Local Development: `http://localhost:3031/api`
- Production: `https://agents.northpeak.app/api`

**Authentication**: JWT Bearer token in `Authorization` header

**Content-Type**: `application/json`

**Response Format**: JSON

## Quick Reference

| Resource | Endpoints |
|----------|-----------|
| **Authentication** | `/auth/*` |
| **Users** | `/users/*` |
| **Agents** | `/agents/*` |
| **Conversations** | `/conversations/*` |
| **Messages** | `/messages/*` |
| **Flows** | `/flows/*` |
| **Knowledge** | `/knowledge/*` |
| **AI** | `/ai/*` |
| **SuperBrain** | `/superbrain/*` |
| **Agentic** | `/agentic/*` |
| **Platforms** | `/platforms/*` |
| **Swarm** | `/swarm/*` |
| **Admin** | `/admin/*` |

## Common Headers

```bash
# Required for all authenticated requests
Authorization: Bearer YOUR_JWT_TOKEN

# Required for POST/PUT/PATCH
Content-Type: application/json

# Optional: Request ID for tracking
X-Request-ID: unique-request-id

# Optional: API version
X-API-Version: 1.0
```

## Agents API

### List Agents

```bash
GET /agents
Authorization: Bearer <token>
```

**Query Parameters**:
- `status` (optional): Filter by status (`active`, `archived`)
- `page` (optional): Page number (default: 1)
- `limit` (optional): Results per page (default: 20)

**Response**:
```json
{
  "agents": [
    {
      "id": 1,
      "name": "Customer Support Bot",
      "description": "Handles customer inquiries",
      "provider": "openrouter",
      "model": "deepseek/deepseek-r1-0528",
      "status": "active",
      "createdAt": "2026-02-01T00:00:00.000Z",
      "messageCount": 150
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 5,
    "pages": 1
  }
}
```

### Create Agent

```bash
POST /agents
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Data Analyst",
  "description": "Analyzes data and generates insights",
  "provider": "openrouter",
  "model": "qwen/qwen-2.5-72b-instruct",
  "systemPrompt": "You are a data analyst...",
  "temperature": 0.7,
  "maxTokens": 4096,
  "skills": ["data-analysis", "visualization"]
}
```

### Update Agent

```bash
PUT /agents/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Updated Name",
  "systemPrompt": "Updated prompt..."
}
```

### Delete Agent

```bash
DELETE /agents/:id
Authorization: Bearer <token>
```

## Messages API

### Send Message

```bash
POST /messages
Authorization: Bearer <token>
Content-Type: application/json

{
  "agentId": 1,
  "content": "How do I integrate WhatsApp?",
  "conversationId": 123
}
```

**Response**:
```json
{
  "message": {
    "id": 456,
    "conversationId": 123,
    "agentId": 1,
    "role": "user",
    "content": "How do I integrate WhatsApp?",
    "timestamp": "2026-02-03T10:00:00.000Z"
  },
  "response": {
    "id": 457,
    "role": "assistant",
    "content": "To integrate WhatsApp, go to Settings > Platforms...",
    "timestamp": "2026-02-03T10:00:05.000Z"
  }
}
```

### List Messages

```bash
GET /messages?conversationId=123
Authorization: Bearer <token>
```

## Flows API

### Create Flow

```bash
POST /flows
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Daily Summary",
  "description": "Send daily conversation summary",
  "nodes": [
    {
      "id": "trigger-1",
      "type": "ScheduleTrigger",
      "config": { "cron": "0 9 * * *" }
    },
    {
      "id": "summarize-1",
      "type": "Summarize",
      "config": { "text": "{{input.text}}" }
    }
  ],
  "connections": [
    { "from": "trigger-1", "to": "summarize-1" }
  ]
}
```

### Execute Flow

```bash
POST /flows/:id/execute
Authorization: Bearer <token>
Content-Type: application/json

{
  "input": {
    "text": "Long text to summarize..."
  }
}
```

## Knowledge API

### Create Library

```bash
POST /knowledge/libraries
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Product Documentation",
  "description": "All product guides",
  "embedProvider": "openai",
  "embedModel": "text-embedding-3-small"
}
```

### Upload Document

```bash
POST /knowledge/libraries/:id/documents
Authorization: Bearer <token>
Content-Type: multipart/form-data

file: document.pdf
metadata: { "author": "John Doe", "version": "2.1" }
```

### Query Knowledge

```bash
POST /knowledge/libraries/:id/query
Authorization: Bearer <token>
Content-Type: application/json

{
  "query": "How to setup WhatsApp?",
  "topK": 3,
  "scoreThreshold": 0.7
}
```

## AI API

### Translate

```bash
POST /ai/translate
Authorization: Bearer <token>
Content-Type: application/json

{
  "text": "Hello, how are you?",
  "targetLanguage": "es"
}
```

**Response**:
```json
{
  "original": "Hello, how are you?",
  "translated": "Hola, ¿cómo estás?",
  "sourceLanguage": "en",
  "targetLanguage": "es"
}
```

### Rephrase

```bash
POST /ai/rephrase
Authorization: Bearer <token>
Content-Type: application/json

{
  "text": "I need this ASAP!",
  "style": "professional"
}
```

**Response**:
```json
{
  "original": "I need this ASAP!",
  "rephrased": "I would appreciate this at your earliest convenience.",
  "style": "professional"
}
```

## WebSocket API

**URL**: `ws://localhost:3032` or `wss://agents.northpeak.app`

**Authentication**: Include token in initial message

```javascript
const ws = new WebSocket('ws://localhost:3032');

ws.onopen = () => {
  // Authenticate
  ws.send(JSON.stringify({
    type: 'auth',
    token: 'YOUR_JWT_TOKEN'
  }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Event:', data.type, data.payload);
};
```

**Events**:
- `message:new` - New message received
- `agent:status_changed` - Agent status updated
- `swarm:task_update` - Swarm task progress
- `agentic:tool_created` - New tool added
- `flow:execution_started` - Flow execution began
- `flow:execution_completed` - Flow execution finished

## Pagination

Paginated endpoints accept:

```bash
GET /agents?page=2&limit=10
```

Response includes pagination metadata:
```json
{
  "data": [...],
  "pagination": {
    "page": 2,
    "limit": 10,
    "total": 45,
    "pages": 5,
    "hasNext": true,
    "hasPrev": true
  }
}
```

## Filtering & Sorting

```bash
# Filter
GET /agents?status=active&provider=openrouter

# Sort
GET /agents?sort=createdAt:desc

# Search
GET /agents?search=customer

# Combined
GET /agents?status=active&sort=name:asc&limit=5
```

## Rate Limiting

**Limits**:
- **Free Tier**: 100 requests/minute
- **Pro Tier**: 1000 requests/minute
- **Enterprise**: Custom limits

**Headers**:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1612345678
```

**Response** (429):
```json
{
  "error": "Rate limit exceeded",
  "retryAfter": 60
}
```

## Error Handling

**Standard Error Response**:
```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": {
    "field": "Additional context"
  }
}
```

**HTTP Status Codes**:
- `200` - Success
- `201` - Created
- `204` - No Content
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `409` - Conflict
- `422` - Validation Error
- `429` - Rate Limit
- `500` - Internal Server Error
- `503` - Service Unavailable

## Validation Errors

```json
{
  "success": false,
  "error": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": {
    "name": "Name is required",
    "email": "Invalid email format",
    "password": "Password must be at least 8 characters"
  }
}
```

## Batch Operations

**Batch Create Agents**:
```bash
POST /agents/batch
Authorization: Bearer <token>
Content-Type: application/json

{
  "agents": [
    { "name": "Agent 1", ... },
    { "name": "Agent 2", ... }
  ]
}
```

**Response**:
```json
{
  "created": 2,
  "failed": 0,
  "results": [
    { "id": 1, "status": "success" },
    { "id": 2, "status": "success" }
  ]
}
```

## Webhooks

**Register Webhook**:
```bash
POST /webhooks
Authorization: Bearer <token>
Content-Type: application/json

{
  "url": "https://example.com/webhook",
  "events": ["message:new", "agent:status_changed"],
  "secret": "webhook-secret"
}
```

**Webhook Payload**:
```json
{
  "event": "message:new",
  "timestamp": "2026-02-03T10:00:00.000Z",
  "data": {
    "messageId": 123,
    "agentId": 1,
    "content": "..."
  }
}
```

## API Versioning

**Header-based** (preferred):
```bash
curl -H "X-API-Version: 2.0" \
  http://localhost:3031/api/agents
```

**URL-based**:
```bash
curl http://localhost:3031/api/v2/agents
```

## SDK Examples

### JavaScript/TypeScript

```typescript
import { SwarmAI } from '@swarmAI/sdk';

const client = new SwarmAI({
  apiKey: 'YOUR_TOKEN',
  baseURL: 'http://localhost:3031'
});

// Create agent
const agent = await client.agents.create({
  name: 'My Agent',
  provider: 'openrouter',
  model: 'deepseek/deepseek-r1-0528'
});

// Send message
const response = await client.messages.send({
  agentId: agent.id,
  content: 'Hello!'
});
```

### Python

```python
from swarmAI import Client

client = Client(
    api_key='YOUR_TOKEN',
    base_url='http://localhost:3031'
)

# Create agent
agent = client.agents.create(
    name='My Agent',
    provider='openrouter',
    model='deepseek/deepseek-r1-0528'
)

# Send message
response = client.messages.send(
    agent_id=agent['id'],
    content='Hello!'
)
```

## Testing

**Test Endpoints**:
```bash
# Health check
GET /health

# API status
GET /status
```

**Response**:
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "uptime": 86400,
  "services": {
    "database": "healthy",
    "redis": "healthy",
    "qdrant": "healthy"
  }
}
```

## Related Topics

- [Authentication](authentication.md)
- [Agents API](agents-api.md)
- [Messages API](messages-api.md)
- [Flows API](flows-api.md)
- [Knowledge API](knowledge-api.md)

---

**Keywords**: API, REST, endpoints, HTTP, authentication, rate limiting, webhooks, pagination
