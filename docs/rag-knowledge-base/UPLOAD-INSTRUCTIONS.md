# How to Upload SwarmAI Knowledge Base to RAG System

This guide explains how to upload the SwarmAI knowledge base to your RAG system for AI agent access.

## Prerequisites

- SwarmAI platform running (local or production)
- Access to SwarmAI dashboard
- Admin or Superadmin role
- Knowledge base files in `docs/rag-knowledge-base/`

## Quick Upload

### Option 1: Via Dashboard (Recommended)

1. **Login to SwarmAI Dashboard**
   ```
   Local: http://localhost:3202
   Production: https://agents.northpeak.app
   ```

2. **Navigate to Knowledge Section**
   - Click **Knowledge** in the sidebar
   - Click **+ New Library** button

3. **Create Library**
   ```
   Name: SwarmAI Documentation
   Description: Complete SwarmAI platform documentation for AI agents
   Embed Provider: openai
   Embed Model: text-embedding-3-small
   ```

4. **Upload Documents**
   - Click **Upload Documents** button
   - Select all markdown files from `docs/rag-knowledge-base/`
   - Or drag and drop the entire folder
   - Click **Upload**

5. **Wait for Processing**
   - Documents will be processed one by one
   - Check status: "processing" → "completed"
   - Processing time: ~2-5 minutes for all documents

6. **Link to Agents**
   - Go to **Agents** section
   - Click on an agent (or create new one)
   - Click **Settings** → **Knowledge**
   - Select "SwarmAI Documentation" library
   - Click **Save**

### Option 2: Via API

```bash
# 1. Create library
curl -X POST http://localhost:3031/api/knowledge/libraries \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "SwarmAI Documentation",
    "description": "Complete platform documentation",
    "embedProvider": "openai",
    "embedModel": "text-embedding-3-small"
  }'

# Response: { "id": 1, "name": "SwarmAI Documentation", ... }

# 2. Upload each document
for file in docs/rag-knowledge-base/**/*.md; do
  curl -X POST http://localhost:3031/api/knowledge/libraries/1/documents \
    -H "Authorization: Bearer YOUR_TOKEN" \
    -F "file=@$file" \
    -F 'metadata={"category":"documentation"}'
done

# 3. Link to agent
curl -X POST http://localhost:3031/api/agents/1/knowledge \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"libraryIds": [1]}'
```

### Option 3: Via CLI Script

```bash
# Navigate to project root
cd /path/to/SwarmAI

# Run upload script
node server/scripts/upload-knowledge.cjs \
  --library "SwarmAI Documentation" \
  --path "docs/rag-knowledge-base" \
  --token "YOUR_JWT_TOKEN"
```

## Document Structure

The knowledge base is organized as follows:

```
docs/rag-knowledge-base/
├── README.md                           # Overview
├── MASTER-INDEX.md                     # Complete index
├── UPLOAD-INSTRUCTIONS.md              # This file
├── 01-getting-started/
│   ├── overview.md                     # Platform overview
│   ├── quickstart-user.md              # User quick start
│   └── quickstart-developer.md         # Developer quick start
├── 02-user-guides/                     # (To be expanded)
├── 03-developer-guides/                # (To be expanded)
├── 04-features/
│   ├── superbrain-ai-system.md         # SuperBrain docs
│   ├── flowbuilder-automation.md       # FlowBuilder docs
│   ├── rag-knowledge-management.md     # RAG docs
│   └── agentic-ai-platform.md          # Agentic AI docs
├── 05-integrations/                    # (To be expanded)
├── 06-api-reference/
│   ├── authentication.md               # Auth API
│   └── overview.md                     # API overview
└── 07-troubleshooting/                 # (To be expanded)
```

**Total Documents**: 12 core documents created
**Estimated Processing Time**: 2-5 minutes
**Storage Size**: ~500KB (text)
**Vector Count**: ~800-1200 chunks

## Verification

### Test RAG Queries

After upload, test the knowledge base:

1. **Via Dashboard**:
   - Go to **Knowledge** → Your library
   - Click **Query** button
   - Test queries:
     - "How do I create an agent?"
     - "What is SuperBrain?"
     - "How to integrate WhatsApp?"

2. **Via API**:
   ```bash
   curl -X POST http://localhost:3031/api/knowledge/libraries/1/query \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "query": "How do I create an agent?",
       "topK": 3
     }'
   ```

3. **Via Agent**:
   - Chat with an agent that has the library linked
   - Ask: "How do I integrate WhatsApp?"
   - Agent should provide accurate answer from docs

### Expected Results

**Good Result** (score > 0.8):
```json
{
  "results": [
    {
      "content": "To integrate WhatsApp, go to Settings > Platforms...",
      "score": 0.92,
      "documentName": "quickstart-user.md"
    }
  ]
}
```

**Poor Result** (score < 0.6):
- Try rephrasing query
- Check document processing status
- Verify embedding model is working

## Best Practices

### 1. Library Organization

**Single Library** (Recommended for this knowledge base):
```
SwarmAI Documentation
└── All documentation files
```

**Multiple Libraries** (For larger deployments):
```
SwarmAI - User Guides
SwarmAI - Developer Guides
SwarmAI - API Reference
SwarmAI - Troubleshooting
```

### 2. Metadata

Add metadata when uploading:
```javascript
{
  "category": "documentation",
  "version": "1.0",
  "audience": "user" | "developer" | "admin",
  "difficulty": "beginner" | "intermediate" | "advanced"
}
```

### 3. Update Strategy

When documentation changes:

**Full Refresh** (Major updates):
1. Delete old library
2. Create new library
3. Upload all documents

**Incremental Update** (Minor changes):
1. Delete specific document
2. Upload new version
3. Existing vectors are replaced

### 4. Agent Configuration

**For General Support Agents**:
- Link: User Guides, Getting Started, Troubleshooting

**For Developer Support**:
- Link: Developer Guides, API Reference, Architecture

**For All-Purpose**:
- Link: Entire knowledge base

## Maintenance

### Regular Updates

Update documentation every:
- **Major Release**: Full refresh
- **New Feature**: Add/update specific docs
- **Bug Fix**: Update troubleshooting docs
- **API Change**: Update API reference

### Monitoring

Track knowledge base usage:

```bash
# Query analytics
GET /api/knowledge/libraries/1/analytics

# Response
{
  "totalQueries": 1500,
  "avgResponseTime": 120,
  "topQueries": [
    "how to create agent",
    "whatsapp integration",
    "api authentication"
  ],
  "lowScoreQueries": [
    "advanced custom integration"
  ]
}
```

### Optimization

If queries return poor results:

1. **Check Chunk Size**
   - Current: 800 characters
   - Adjust if needed: 500-1500 range

2. **Adjust Embedding Model**
   - Current: text-embedding-3-small
   - Try: text-embedding-3-large (more accurate)

3. **Improve Document Structure**
   - Add more context
   - Include more examples
   - Better headings

4. **Add Synonyms/Keywords**
   - Include alternative terms
   - Add common misspellings
   - Include abbreviations

## Troubleshooting

### Documents Not Processing

**Error**: "Document stuck in processing"

**Solutions**:
1. Check file format (must be .md, .pdf, .txt, .docx)
2. Verify file size (< 50MB)
3. Check Qdrant is running: `docker ps | grep qdrant`
4. Review logs: `docker logs swarmAI-backend`

### Low Search Scores

**Error**: All results have scores < 0.7

**Solutions**:
1. Lower threshold: Try 0.6 instead of 0.7
2. Increase topK: Try 5-10 instead of 3
3. Rephrase query with more context
4. Check if document contains relevant information

### Out of Memory

**Error**: Qdrant or backend crashes during upload

**Solutions**:
1. Increase Docker memory:
   ```bash
   docker update --memory 2g swarmAI-qdrant
   docker update --memory 2g swarmAI-backend
   ```

2. Upload in batches:
   ```bash
   # Upload 5 files at a time
   for batch in $(ls docs/rag-knowledge-base/**/*.md | xargs -n5); do
     # Upload batch
     sleep 10  # Wait between batches
   done
   ```

### Embedding API Failures

**Error**: "Embedding generation failed"

**Solutions**:
1. Verify OpenAI API key: Check `.env` file
2. Check API quota: Visit OpenAI dashboard
3. Use alternative provider:
   ```javascript
   {
     "embedProvider": "ollama",
     "embedModel": "nomic-embed-text"
   }
   ```

## Advanced Configuration

### Custom Embedding Models

**OpenAI**:
```javascript
{
  "embedProvider": "openai",
  "embedModel": "text-embedding-3-small",  // Fast, good quality
  // or
  "embedModel": "text-embedding-3-large"   // Slower, best quality
}
```

**Ollama** (Local):
```javascript
{
  "embedProvider": "ollama",
  "embedModel": "nomic-embed-text"
}
```

**Cohere**:
```javascript
{
  "embedProvider": "cohere",
  "embedModel": "embed-english-v3.0"
}
```

### Custom Chunking

Edit `server/services/rag/DocumentProcessor.cjs`:

```javascript
const CHUNKING_CONFIG = {
  chunkSize: 800,      // Characters per chunk
  chunkOverlap: 200,   // Overlap between chunks
  separator: "\n\n"    // Prefer paragraph breaks
};
```

### Hybrid Search

Enable keyword + semantic search:

```bash
POST /api/knowledge/libraries/1/query
{
  "query": "API authentication",
  "topK": 5,
  "mode": "hybrid",  # Combine semantic + keyword
  "alpha": 0.7       # 0.7 = 70% semantic, 30% keyword
}
```

## Next Steps

After uploading:

1. ✅ Verify all documents processed successfully
2. ✅ Test queries return relevant results
3. ✅ Link library to appropriate agents
4. ✅ Monitor query performance
5. ✅ Gather user feedback
6. ✅ Update documentation as needed

## Support

Need help?
- **Documentation**: [MASTER-INDEX.md](MASTER-INDEX.md)
- **Email**: support@swarmAI.com
- **Discord**: [discord.gg/swarmAI](https://discord.gg/swarmAI)
- **GitHub Issues**: [github.com/your-org/SwarmAI/issues](https://github.com/your-org/SwarmAI/issues)

---

**Estimated Upload Time**: 2-5 minutes
**Success Rate**: Check that all documents show "completed" status
**Verification**: Test 3-5 queries to ensure good results
