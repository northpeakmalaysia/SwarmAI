# SuperBrain AI System

SuperBrain is SwarmAI's central intelligence router that automatically classifies tasks, selects optimal AI providers, and handles failover to ensure reliable AI responses.

## Overview

Instead of manually choosing which AI model to use for each task, SuperBrain:
1. **Analyzes** the complexity of incoming requests
2. **Routes** to the most cost-effective provider
3. **Falls back** to alternative providers if primary fails
4. **Learns** from user preferences and feedback

## Core Components

### 1. Task Classifier

Automatically categorizes tasks into complexity tiers:

| Tier | Description | Example Tasks |
|------|-------------|---------------|
| **TRIVIAL** | Simple, repetitive queries | "What's 2+2?", "Hi", "Thanks" |
| **SIMPLE** | Straightforward Q&A | "What is the capital of France?", "Define photosynthesis" |
| **MODERATE** | Analysis, formatting, translation | "Summarize this article", "Translate to Spanish" |
| **COMPLEX** | Multi-step reasoning, code generation | "Write a Python function to...", "Analyze this data set" |
| **CRITICAL** | High-stakes, specialized tasks | "Review this legal contract", "Debug production issue" |

**How Classification Works**:
```javascript
// Factors considered:
- Message length (longer = more complex)
- Keywords (code, analyze, create, etc.)
- Context (conversation history)
- User intent (question vs. command)
- Attachments (files, images)
```

### 2. Provider Strategy

Each tier has a chain of providers with automatic failover:

```
TRIVIAL:
  1. Ollama (free, local)
  2. OpenRouter Free (DeepSeek, Qwen)
  3. OpenCode CLI (multi-provider)

SIMPLE:
  1. OpenRouter Free
  2. Ollama
  3. OpenCode CLI
  4. OpenRouter Paid (fallback)

MODERATE:
  1. OpenRouter Free (larger models)
  2. OpenCode CLI
  3. Gemini CLI (free)
  4. OpenRouter Paid

COMPLEX:
  1. Claude CLI (paid, best quality)
  2. Gemini CLI
  3. OpenCode CLI
  4. OpenRouter Paid (GPT-4, Claude)

CRITICAL:
  1. Claude CLI
  2. Gemini CLI
  3. OpenCode CLI
  4. OpenRouter Paid (premium models)
```

**Failover Logic**:
- If primary provider fails (error, timeout, rate limit), automatically try next in chain
- Track failure rates and temporarily skip unreliable providers
- Log all attempts for debugging

### 3. Message Processing

SuperBrain provides three key message APIs:

#### Translate Message
Convert text to 20+ languages:
```bash
POST /api/ai/translate
{
  "text": "Hello, how are you?",
  "targetLanguage": "es"
}
```

**Supported Languages**:
English, Spanish, French, German, Italian, Portuguese, Chinese (Simplified/Traditional), Japanese, Korean, Russian, Arabic, Hindi, Bengali, Turkish, Vietnamese, Thai, Indonesian, Polish, Dutch, Swedish

#### Rephrase Message
Adjust tone and style:
```bash
POST /api/ai/rephrase
{
  "text": "I need this done ASAP",
  "style": "professional"
}
```

**Styles**:
- **professional**: Business-appropriate, formal
- **casual**: Friendly, conversational
- **concise**: Brief, to the point
- **detailed**: Comprehensive, thorough
- **friendly**: Warm, approachable
- **formal**: Very professional, structured

#### Transform Message
Extract URLs, detect intent, add metadata:
```bash
POST /api/ai/transform
{
  "content": "Check out this article: https://example.com/article",
  "extract": ["urls", "intent"]
}
```

### 4. Message Classification

SuperBrain categorizes incoming messages for workflow routing:

**Categories**:
- **SKIP**: Ignore (spam, system messages)
- **PASSIVE**: Ingest to RAG, don't respond (FYI messages)
- **ACTIVE**: Generate response (questions, commands)

**Example**:
```javascript
// User: "FYI, the meeting is at 3pm"
→ PASSIVE (save to knowledge, no response needed)

// User: "What time is the meeting?"
→ ACTIVE (respond with answer)

// System: "Message delivered"
→ SKIP (ignore)
```

## User Settings

Each user can customize SuperBrain behavior via `superbrain_settings` table:

### Per-Tier Configuration

```javascript
{
  "trivial": {
    "provider": "ollama",
    "model": "llama2",
    "enabled": true
  },
  "simple": {
    "provider": "openrouter",
    "model": "deepseek/deepseek-r1-0528",
    "enabled": true
  },
  "moderate": {
    "provider": "openrouter",
    "model": "qwen/qwen-2.5-72b-instruct",
    "enabled": true
  },
  "complex": {
    "provider": "claude-cli",
    "model": "claude-3-5-sonnet-20241022",
    "enabled": true
  },
  "critical": {
    "provider": "claude-cli",
    "model": "claude-opus-4-5-20251101",
    "enabled": true
  }
}
```

### Router Mode

Three modes control SuperBrain behavior:

| Mode | Description |
|------|-------------|
| **full** | Complete routing: classify + select provider + process |
| **classify_only** | Only classify (skip provider selection) |
| **disabled** | Bypass SuperBrain, use agent's configured provider |

### Auto-Send Mode

Control when AI responses are automatically sent:

| Mode | Behavior |
|------|----------|
| **restricted** | AI drafts response, user must approve before sending |
| **allowed** | AI sends responses automatically |

## API Endpoints

### Get User Settings
```bash
GET /api/superbrain/settings
Authorization: Bearer <token>
```

Response:
```json
{
  "userId": 1,
  "routerMode": "full",
  "autoSendMode": "restricted",
  "tierSettings": {
    "trivial": { "provider": "ollama", "model": "llama2" },
    ...
  }
}
```

### Update Settings
```bash
PUT /api/superbrain/settings
Authorization: Bearer <token>
Content-Type: application/json

{
  "routerMode": "full",
  "autoSendMode": "allowed",
  "tierSettings": {
    "complex": {
      "provider": "claude-cli",
      "model": "claude-3-5-sonnet-20241022"
    }
  }
}
```

### Process Message
```bash
POST /api/superbrain/process
Authorization: Bearer <token>
Content-Type: application/json

{
  "agentId": 1,
  "content": "Write a Python function to calculate Fibonacci",
  "context": {
    "conversationId": 123,
    "platform": "whatsapp"
  }
}
```

Response:
```json
{
  "classification": "COMPLEX",
  "provider": "claude-cli",
  "model": "claude-3-5-sonnet-20241022",
  "response": {
    "content": "Here's a Python function...",
    "usage": {
      "promptTokens": 50,
      "completionTokens": 200,
      "totalTokens": 250
    }
  },
  "processingTime": 1234
}
```

## Provider Details

### OpenRouter
- **Type**: Paid (free models available)
- **Models**: 100+ models (GPT, Claude, Llama, DeepSeek, Qwen)
- **Pros**: Wide selection, unified API, competitive pricing
- **Cost**: Free models: $0, Paid: $0.001-$0.06 per 1K tokens

### Ollama
- **Type**: Free (local)
- **Models**: Llama 2/3, Mistral, CodeLlama, Phi, Gemma
- **Pros**: No cost, privacy, offline, fast
- **Cons**: Requires local resources (GPU recommended)

### Claude CLI
- **Type**: Paid (Anthropic account required)
- **Models**: Claude 3.5 Sonnet, Claude Opus 4.5
- **Pros**: Best quality, reasoning, code generation
- **Cost**: $3-$15 per 1M input tokens

### Gemini CLI
- **Type**: Free tier available
- **Models**: Gemini 1.5 Flash, Gemini 2.0 Flash
- **Pros**: Fast, free tier, good multimodal
- **Cost**: Free tier: 1500 requests/day

### OpenCode CLI
- **Type**: Free (multi-provider)
- **Models**: Multiple providers (Claude, GPT, Gemini, Groq)
- **Pros**: Aggregates free tiers, no API keys needed
- **Cost**: Free

## Best Practices

### For Cost Optimization
1. Enable Ollama for trivial/simple tasks
2. Use OpenRouter free models (DeepSeek, Qwen)
3. Reserve Claude CLI for complex/critical tasks only
4. Set appropriate tier thresholds

### For Quality
1. Use Claude CLI for code generation
2. Use Gemini CLI for multimodal tasks
3. Enable multiple fallbacks per tier
4. Monitor response quality and adjust

### For Speed
1. Use Ollama for instant responses (local)
2. Set lower max tokens for simple tasks
3. Enable parallel processing for batch tasks
4. Use WebSocket for real-time updates

### For Reliability
1. Configure at least 2 providers per tier
2. Monitor provider health metrics
3. Set appropriate timeouts (30s recommended)
4. Enable automatic failover

## Troubleshooting

### Issue: All Providers Failing

**Symptoms**: All messages return errors
**Causes**:
- No valid API keys configured
- Rate limits exceeded on all providers
- Network connectivity issues

**Solutions**:
1. Check API keys in `.env` file
2. Verify provider status pages
3. Check rate limit quotas
4. Test network connectivity
5. Review error logs in `server/logs/`

### Issue: Slow Responses

**Symptoms**: Messages take 10+ seconds
**Causes**:
- Using slow models (large context)
- High max tokens setting
- Provider API latency

**Solutions**:
1. Use faster models (Flash, Haiku)
2. Reduce max tokens (2048 vs 4096)
3. Enable Ollama for local processing
4. Check provider latency stats

### Issue: Incorrect Classification

**Symptoms**: Simple tasks routed to expensive models
**Causes**:
- Classification keywords mismatch
- Insufficient context
- User-specific settings

**Solutions**:
1. Adjust classification thresholds
2. Provide more context in messages
3. Override with manual tier selection
4. Review classification logs

### Issue: Inconsistent Quality

**Symptoms**: Response quality varies greatly
**Causes**:
- Multiple providers in failover chain
- Temperature settings too high
- Model switching mid-conversation

**Solutions**:
1. Use single provider per tier (disable failover)
2. Lower temperature (0.3-0.5)
3. Pin conversations to specific models
4. Enable conversation memory

## Advanced Configuration

### Custom Provider Chains

Edit `server/services/ai/SuperBrainRouter.cjs`:

```javascript
const TIER_CHAINS = {
  complex: [
    { provider: 'claude-cli', model: 'claude-3-5-sonnet-20241022' },
    { provider: 'openrouter', model: 'anthropic/claude-3.5-sonnet' },
    { provider: 'gemini-cli', model: 'gemini-1.5-pro' }
  ]
};
```

### Custom Classification Rules

Edit `server/services/ai/TaskClassifier.cjs`:

```javascript
// Add custom keywords
const COMPLEX_KEYWORDS = [
  'debug', 'optimize', 'refactor', 'architecture',
  'your-custom-keyword'
];

// Adjust scoring weights
if (containsCodeBlock(message)) {
  score += 30; // Increase from 20
}
```

### Provider Health Monitoring

```bash
# Check provider health
GET /api/ai/providers/health

# Response
{
  "ollama": { "status": "healthy", "latency": 50 },
  "openrouter": { "status": "healthy", "latency": 500 },
  "claude-cli": { "status": "degraded", "latency": 2000 }
}
```

## Related Topics

- [Creating Agents](../02-user-guides/creating-agents.md)
- [AI Providers Configuration](../03-developer-guides/ai-providers.md)
- [Cost Optimization](../02-user-guides/cost-optimization.md)
- [Message Processing API](../06-api-reference/messages.md)

---

**Keywords**: SuperBrain, AI routing, task classification, provider selection, message processing, translate, rephrase, failover
