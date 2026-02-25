# RAG Knowledge Management

RAG (Retrieval-Augmented Generation) enables your AI agents to access custom knowledge from your documents, providing accurate, context-aware responses.

## Overview

SwarmAI's RAG system:
1. **Ingests** documents (PDF, TXT, DOCX, MD)
2. **Processes** text into chunks
3. **Embeds** chunks into vectors
4. **Stores** in Qdrant vector database
5. **Retrieves** relevant chunks for AI queries

## Core Concepts

### Knowledge Libraries
Organized collections of documents (e.g., "Product Docs", "Customer Support", "Legal")

### Documents
Individual files uploaded to libraries

### Chunks
Document segments (typically 500-1000 characters) with overlap for context

### Embeddings
Vector representations of text for semantic search

### Semantic Search
Find relevant information by meaning, not just keywords

## Architecture

```
Document Upload
    ↓
Text Extraction (PDF/DOCX/TXT/MD)
    ↓
Chunking (with overlap)
    ↓
Embedding Generation (OpenAI/Local)
    ↓
Vector Storage (Qdrant)
    ↓
Indexing & Metadata
    ↓
Ready for Queries
```

## Document Processing Pipeline

### 1. Text Extraction

**Supported Formats**:
- **PDF**: pdf-parse library (text extraction)
- **DOCX**: mammoth library (Word documents)
- **TXT**: Direct read (plain text)
- **MD**: Direct read (Markdown)

**Future Support**: HTML, PPTX, XLSX, Images (OCR)

### 2. Chunking Strategy

**Default Settings**:
```javascript
{
  chunkSize: 800,        // Characters per chunk
  chunkOverlap: 200,     // Overlap between chunks
  separator: "\n\n"      // Prefer paragraph breaks
}
```

**Why Chunking?**
- Models have context limits
- Smaller chunks = more precise retrieval
- Overlap preserves context across boundaries

**Example**:
```
Original: "SwarmAI is a multi-agent platform. It supports WhatsApp, Telegram, and Email integration."

Chunk 1: "SwarmAI is a multi-agent platform. It supports WhatsApp,"
Chunk 2: "It supports WhatsApp, Telegram, and Email integration."
                    ↑ overlap ↑
```

### 3. Embedding Generation

**Default Provider**: OpenAI `text-embedding-3-small`

**Alternatives**:
- Local: sentence-transformers (all-MiniLM-L6-v2)
- Ollama: nomic-embed-text
- Cohere: embed-english-v3.0

**Embedding Dimensions**: 1536 (OpenAI), 384 (local)

### 4. Vector Storage (Qdrant)

**Collection Structure**:
```javascript
{
  collectionName: "library-{libraryId}",
  vectors: {
    size: 1536,
    distance: "Cosine"
  },
  payload: {
    documentId: number,
    documentName: string,
    chunkIndex: number,
    content: string,
    metadata: object
  }
}
```

## API Endpoints

### Create Library
```bash
POST /api/knowledge/libraries
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Product Documentation",
  "description": "All product guides and manuals",
  "embedProvider": "openai",
  "embedModel": "text-embedding-3-small"
}
```

Response:
```json
{
  "id": 1,
  "name": "Product Documentation",
  "documentCount": 0,
  "status": "active",
  "createdAt": "2026-02-03T10:00:00Z"
}
```

### Upload Document
```bash
POST /api/knowledge/libraries/:id/documents
Authorization: Bearer <token>
Content-Type: multipart/form-data

file: document.pdf
metadata: {
  "author": "John Doe",
  "version": "2.1",
  "tags": ["guide", "api"]
}
```

Response:
```json
{
  "id": 1,
  "name": "document.pdf",
  "status": "processing",
  "size": 1048576,
  "pageCount": 50,
  "uploadedAt": "2026-02-03T10:05:00Z"
}
```

### Query Knowledge
```bash
POST /api/knowledge/libraries/:id/query
Authorization: Bearer <token>
Content-Type: application/json

{
  "query": "How do I integrate WhatsApp?",
  "topK": 3,
  "scoreThreshold": 0.7
}
```

Response:
```json
{
  "results": [
    {
      "content": "To integrate WhatsApp, go to Settings > Platforms...",
      "score": 0.92,
      "documentName": "integration-guide.pdf",
      "metadata": {
        "page": 15,
        "section": "WhatsApp Setup"
      }
    },
    {
      "content": "WhatsApp integration requires a QR code scan...",
      "score": 0.87,
      "documentName": "quick-start.pdf",
      "metadata": {
        "page": 3
      }
    }
  ],
  "queryTime": 120
}
```

### Link Library to Agent
```bash
POST /api/agents/:agentId/knowledge
Authorization: Bearer <token>
Content-Type: application/json

{
  "libraryIds": [1, 2, 3]
}
```

Now the agent can access these libraries during conversations.

## RAG Query Modes

### 1. Semantic Search
Find by meaning:
```
Query: "customer support workflow"
Matches: "handling customer inquiries", "support ticket process"
```

### 2. Hybrid Search
Combine semantic + keyword:
```
Query: "API authentication"
Matches: Semantic similarity + exact "API" and "authentication" mentions
```

### 3. MMR (Maximal Marginal Relevance)
Diverse results:
```
Query: "SwarmAI features"
Results: Covers different feature categories, not just similar chunks
```

## Integration with Agents

### Automatic RAG
Agent automatically queries linked libraries when:
- User asks a question
- Agent detects knowledge gap
- Conversation requires factual information

**Example Conversation**:
```
User: "What's the refund policy?"

Agent (Internal):
  1. Detect question requires knowledge
  2. Query "refund policy" in linked libraries
  3. Retrieve top 3 relevant chunks
  4. Include in AI prompt context
  5. Generate answer based on retrieved knowledge

Agent: "According to our policy, refunds are available within 30 days..."
```

### Manual RAG Query
Use RAGQuery node in FlowBuilder:
```yaml
Node: RAGQuery
Config:
  - libraryId: 1
  - query: "{{input.userQuestion}}"
  - topK: 5
  - scoreThreshold: 0.75
Output: { results, sources }
```

### RAG + SuperBrain
SuperBrain automatically includes RAG context:
```
User Question → SuperBrain Router
    ↓
Task Classifier (MODERATE)
    ↓
RAG Query (if agent has linked libraries)
    ↓
Provider Selection
    ↓
AI Response (with context)
```

## Best Practices

### Document Preparation

**1. Clean Documents**
- Remove headers/footers
- Fix OCR errors
- Use clear section breaks

**2. Structure Content**
- Use headings and subheadings
- Keep paragraphs focused
- Add metadata (author, date, version)

**3. Optimize Size**
- Split very large documents (>50 pages)
- Remove unnecessary images (if PDF)
- Use plain text when possible

### Library Organization

**Strategy 1: By Topic**
```
- Product Documentation
- Customer Support
- Legal & Compliance
- Internal Policies
```

**Strategy 2: By Audience**
```
- Customer-Facing
- Employee Handbook
- Developer Docs
```

**Strategy 3: By Update Frequency**
```
- Static (policies, legal)
- Dynamic (FAQ, troubleshooting)
```

### Query Optimization

**1. Clear Questions**
```javascript
// Bad
"policy"

// Good
"What is the refund policy for cancelled orders?"
```

**2. Context in Queries**
```javascript
// Without context
"How to install?"

// With context
"How to install SwarmAI on Windows?"
```

**3. Adjust topK and Threshold**
```javascript
// Precise, limited results
{ topK: 3, scoreThreshold: 0.85 }

// Comprehensive, more results
{ topK: 10, scoreThreshold: 0.65 }
```

### Performance Tuning

**1. Chunk Size**
- Small (500): More precise, more chunks
- Large (1500): More context, fewer chunks
- Recommended: 800-1000 with 200 overlap

**2. Embedding Model**
- Fast: text-embedding-3-small, local models
- Accurate: text-embedding-3-large
- Balanced: text-embedding-3-small (default)

**3. Caching**
Enable Redis caching for frequent queries:
```javascript
{
  cacheTTL: 3600,  // 1 hour
  cacheKey: "rag:{libraryId}:{queryHash}"
}
```

## Advanced Features

### Metadata Filtering

Filter results by metadata:
```bash
POST /api/knowledge/libraries/:id/query
{
  "query": "API authentication",
  "topK": 5,
  "filter": {
    "metadata.version": "2.0",
    "metadata.tags": { "$in": ["api", "security"] }
  }
}
```

### Document Versioning

Track document versions:
```javascript
{
  documentId: 1,
  name: "user-guide.pdf",
  version: "3.0",
  previousVersions: [
    { version: "2.0", uploadedAt: "2025-12-01" },
    { version: "1.0", uploadedAt: "2025-06-01" }
  ]
}
```

### Citation Tracking

Include sources in AI responses:
```
AI: "According to our refund policy [1], refunds are available within 30 days [2]."

Sources:
[1] refund-policy.pdf, page 2
[2] customer-handbook.pdf, page 15
```

### Incremental Updates

Update specific documents without reprocessing entire library:
```bash
PUT /api/knowledge/documents/:id
Content-Type: multipart/form-data

file: updated-document.pdf
```

System automatically:
1. Deletes old vectors
2. Processes new version
3. Updates embeddings
4. Maintains document ID

## Troubleshooting

### Documents Not Processing

**Symptoms**: Status stuck on "processing"

**Causes**:
- Large file size (>50MB)
- Corrupt PDF/DOCX
- No text content (image-only PDF)
- Embedding API failure

**Solutions**:
1. Check file format and size
2. Verify text can be extracted (try opening in reader)
3. Check embedding provider API status
4. Review processing logs:
   ```bash
   GET /api/knowledge/documents/:id/logs
   ```

### Poor Search Results

**Symptoms**: Irrelevant results, low scores

**Causes**:
- Query too vague
- Threshold too high
- Document quality issues
- Embedding mismatch

**Solutions**:
1. Rephrase query with more context
2. Lower scoreThreshold (try 0.65)
3. Increase topK (try 5-10)
4. Review document content quality
5. Check if embedding model matches

### Slow Query Performance

**Symptoms**: Queries take >2 seconds

**Causes**:
- Large library (>10,000 chunks)
- High topK value
- No indexing
- Qdrant not optimized

**Solutions**:
1. Reduce topK (use 3-5)
2. Enable caching
3. Optimize Qdrant:
   ```bash
   # Increase Qdrant resources
   docker update --memory 2g swarmAI-qdrant
   ```
4. Use hybrid search with filters

### Out of Memory

**Symptoms**: Embedding generation fails

**Causes**:
- Processing very large document
- Batch size too large
- Insufficient RAM

**Solutions**:
1. Split large documents
2. Reduce batch size in config
3. Increase Docker memory:
   ```yaml
   # docker-compose.yml
   qdrant:
     mem_limit: 2g
   ```

## Code Examples

### Python: Upload and Query

```python
import requests

# Upload document
with open('guide.pdf', 'rb') as f:
    response = requests.post(
        'http://localhost:3031/api/knowledge/libraries/1/documents',
        headers={'Authorization': 'Bearer YOUR_TOKEN'},
        files={'file': f}
    )
doc_id = response.json()['id']

# Query
response = requests.post(
    'http://localhost:3031/api/knowledge/libraries/1/query',
    headers={'Authorization': 'Bearer YOUR_TOKEN'},
    json={
        'query': 'How to setup WhatsApp?',
        'topK': 3
    }
)
results = response.json()['results']
for result in results:
    print(f"Score: {result['score']}")
    print(f"Content: {result['content']}\n")
```

### JavaScript: RAG-Enhanced Chat

```javascript
async function chatWithRAG(agentId, userMessage, libraryId) {
  // 1. Query knowledge base
  const ragResponse = await fetch(`/api/knowledge/libraries/${libraryId}/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query: userMessage,
      topK: 3
    })
  });
  const { results } = await ragResponse.json();

  // 2. Build context from results
  const context = results.map(r => r.content).join('\n\n');

  // 3. Send to agent with context
  const chatResponse = await fetch('/api/messages', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      agentId,
      content: userMessage,
      context: {
        ragResults: results,
        ragContext: context
      }
    })
  });

  return await chatResponse.json();
}
```

## Related Topics

- [Creating Knowledge Libraries](../02-user-guides/rag-knowledge.md)
- [Document Upload](../02-user-guides/document-upload.md)
- [Vector Search](../03-developer-guides/vector-search.md)
- [Qdrant Configuration](../03-developer-guides/qdrant-setup.md)

---

**Keywords**: RAG, knowledge management, document processing, vector search, embeddings, semantic search, Qdrant
