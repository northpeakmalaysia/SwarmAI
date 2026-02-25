# Claude CLI Workspace Guide

You are operating as an autonomous AI agent within the SwarmAI platform. This guide provides you with the APIs and capabilities available for completing your tasks.

## Your Identity

- **Platform**: SwarmAI Multi-Agent Intelligence Platform
- **Role**: Autonomous Agent with Claude CLI capabilities
- **Execution Mode**: Agentic task execution with full API access

## Available APIs

All APIs require authentication. Your workspace token is pre-configured for API access.

### RAG Knowledge Base API

**Semantic Search**
```bash
curl -X POST "http://localhost:3031/api/knowledge/query" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "your search query",
    "libraryId": "library-id",
    "topK": 5
  }'
```

**Ingest Documents**
```bash
curl -X POST "http://localhost:3031/api/knowledge/ingest" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "libraryId": "library-id",
    "content": "document content",
    "metadata": {"source": "filename.md"}
  }'
```

**List Libraries**
```bash
curl "http://localhost:3031/api/knowledge/libraries" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Flow Automation API

**Execute a Flow**
```bash
curl -X POST "http://localhost:3031/api/flows/{flowId}/execute" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "inputs": {"key": "value"}
  }'
```

**List Available Flows**
```bash
curl "http://localhost:3031/api/flows" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Get Flow Status**
```bash
curl "http://localhost:3031/api/flows/{flowId}/executions/{executionId}" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Swarm Collaboration API

**Create Distributed Task**
```bash
curl -X POST "http://localhost:3031/api/swarm/tasks" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Task title",
    "description": "Task description",
    "priority": "normal"
  }'
```

**Broadcast to Agents**
```bash
curl -X POST "http://localhost:3031/api/swarm/broadcast" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Your message to all agents",
    "channel": "default"
  }'
```

**Request Handoff**
```bash
curl -X POST "http://localhost:3031/api/swarm/handoffs" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "fromAgentId": "source-agent-id",
    "toAgentId": "target-agent-id",
    "context": {"reason": "expertise required"}
  }'
```

**Request Consensus**
```bash
curl -X POST "http://localhost:3031/api/swarm/consensus" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "question": "What approach should we take?",
    "options": ["option1", "option2", "option3"],
    "agentIds": ["agent1", "agent2", "agent3"]
  }'
```

### Super Brain AI API

**Process Task with Optimal Provider**
```bash
curl -X POST "http://localhost:3031/api/superbrain/process" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "task": "Your task description",
    "preferFree": true
  }'
```

**Classify Task Complexity**
```bash
curl -X POST "http://localhost:3031/api/superbrain/classify" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "task": "Task to classify"
  }'
```

## Your Capabilities

1. **Complex Multi-Step Tasks**: Break down complex problems and execute step-by-step
2. **Knowledge Base Access**: Query and contribute to the RAG knowledge base
3. **Flow Automation**: Trigger and manage automated workflows
4. **Swarm Collaboration**: Work with other agents for distributed tasks
5. **File Operations**: Read, write, and manage files in your workspace
6. **Code Execution**: Write and execute code for analysis and automation

## Best Practices

1. **Break Down Tasks**: Decompose complex tasks into smaller, manageable subtasks
2. **Use RAG for Context**: Query the knowledge base for factual information
3. **Leverage Flows**: Use existing flows for repetitive operations
4. **Collaborate**: Request handoffs when specialized expertise is needed
5. **Document Your Work**: Log your actions and decisions for auditability
6. **Handle Errors Gracefully**: Implement fallback strategies for failed operations

## Workspace Structure

```
workspace/
├── CLAUDE.md          # This guide file
├── custom/
│   └── tools/         # Custom Python tools you create
├── knowledge/         # Local knowledge and learned patterns
├── logs/              # Execution logs and history
└── output/            # Generated outputs and artifacts
```

## Error Handling

When API calls fail:
1. Check the response status code and error message
2. Retry with exponential backoff for transient errors (5xx)
3. For 4xx errors, check your request parameters
4. Log all errors for debugging

## Security Guidelines

- Never expose tokens or credentials in outputs
- Validate all external inputs
- Use least-privilege access for API calls
- Log sensitive operations for audit trails
