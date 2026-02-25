/**
 * AgenticMemoryService
 *
 * Provides long-term memory storage and semantic search capabilities for Agentic AI profiles.
 * Uses SQLite for structured storage and Qdrant for vector embeddings.
 *
 * Tables used (from migrate-agentic-tables.cjs):
 * - agentic_memory: Long-term memory entries
 * - agentic_memory_vectors: Vector embedding references
 * - agentic_memory_sessions: Session management (Redis-backed)
 */

const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('../database.cjs');
const { logger } = require('../logger.cjs');
const { getVectorStoreService } = require('../rag/VectorStoreService.cjs');
const { getAIService } = require('../ai/AIService.cjs');

// Memory type definitions
const MEMORY_TYPES = [
  'conversation',
  'transaction',
  'decision',
  'learning',
  'context',
  'preference',
  'relationship',
  'event',
  'reflection'
];

// Session type definitions
const SESSION_TYPES = [
  'active_conversation',
  'working_context',
  'recent_interactions',
  'pending_decisions'
];

// Vector dimension (matches OpenAI text-embedding-3-small, Ollama nomic-embed-text is 768)
const DEFAULT_VECTOR_SIZE = 768; // Use Ollama default since it's free

/**
 * AgenticMemoryService class
 * Manages long-term memory storage and retrieval for Agentic AI profiles
 */
class AgenticMemoryService {
  constructor() {
    this.vectorStore = getVectorStoreService();
    this.aiService = getAIService();
  }

  /**
   * Get the Qdrant collection name for an agentic profile
   * @param {string} agenticId - Agentic profile ID
   * @returns {string} Collection name
   */
  getCollectionName(agenticId) {
    return `agentic_memory_${agenticId}`;
  }

  /**
   * Ensure Qdrant collection exists for an agentic profile
   * @param {string} agenticId - Agentic profile ID
   * @param {number} vectorSize - Vector dimension size
   */
  async ensureCollection(agenticId, vectorSize = DEFAULT_VECTOR_SIZE) {
    const collectionName = this.getCollectionName(agenticId);
    try {
      await this.vectorStore.ensureCollection(collectionName, vectorSize);
      logger.debug(`Ensured Qdrant collection: ${collectionName}`);
    } catch (error) {
      logger.error(`Failed to ensure collection ${collectionName}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Transform memory row from snake_case to camelCase
   * @param {Object} row - Database row
   * @returns {Object} Transformed memory object
   */
  transformMemory(row) {
    if (!row) return null;

    return {
      id: row.id,
      agenticId: row.agentic_id,
      userId: row.user_id,
      memoryType: row.memory_type,
      title: row.title,
      content: row.content,
      summary: row.summary,
      contactId: row.contact_id,
      conversationId: row.conversation_id,
      taskId: row.task_id,
      relatedMemoryIds: row.related_memory_ids ? JSON.parse(row.related_memory_ids) : [],
      importanceScore: row.importance_score,
      emotionContext: row.emotion_context,
      tags: row.tags ? JSON.parse(row.tags) : [],
      metadata: row.metadata ? JSON.parse(row.metadata) : {},
      occurredAt: row.occurred_at,
      expiresAt: row.expires_at,
      lastRecalledAt: row.last_recalled_at,
      recallCount: row.recall_count,
      storageType: row.storage_type,
      storageKey: row.storage_key,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  /**
   * Transform session row from snake_case to camelCase
   * @param {Object} row - Database row
   * @returns {Object} Transformed session object
   */
  transformSession(row) {
    if (!row) return null;

    return {
      id: row.id,
      agenticId: row.agentic_id,
      userId: row.user_id,
      sessionType: row.session_type,
      redisKey: row.redis_key,
      redisTtl: row.redis_ttl,
      contactId: row.contact_id,
      metadata: row.metadata ? JSON.parse(row.metadata) : {},
      lastAccessedAt: row.last_accessed_at,
      expiresAt: row.expires_at,
      createdAt: row.created_at
    };
  }

  // ============================================
  // Memory CRUD Operations
  // ============================================

  /**
   * Create a new memory entry
   * @param {string} agenticId - Agentic profile ID
   * @param {string} userId - User ID
   * @param {Object} data - Memory data
   * @returns {Promise<Object>} Created memory
   */
  async createMemory(agenticId, userId, data) {
    const {
      content,
      type = 'context',
      importance = 0.5,
      title = null,
      summary = null,
      contactId = null,
      conversationId = null,
      taskId = null,
      relatedMemoryIds = [],
      emotionContext = null,
      tags = [],
      metadata = {},
      occurredAt = null,
      expiresAt = null,
      sessionId = null
    } = data;

    // Validate memory type
    if (!MEMORY_TYPES.includes(type)) {
      throw new Error(`Invalid memory type: ${type}. Must be one of: ${MEMORY_TYPES.join(', ')}`);
    }

    // Validate importance score
    const importanceScore = Math.max(0, Math.min(1, importance));

    const db = getDatabase();
    const memoryId = uuidv4();
    const now = new Date().toISOString();

    try {
      // Insert memory into SQLite
      db.prepare(`
        INSERT INTO agentic_memory (
          id, agentic_id, user_id, memory_type, title, content, summary,
          contact_id, conversation_id, task_id, related_memory_ids,
          importance_score, emotion_context, tags, metadata,
          occurred_at, expires_at, storage_type, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        memoryId,
        agenticId,
        userId,
        type,
        title,
        content,
        summary,
        contactId,
        conversationId,
        taskId,
        JSON.stringify(relatedMemoryIds),
        importanceScore,
        emotionContext,
        JSON.stringify(tags),
        JSON.stringify(metadata),
        occurredAt || now,
        expiresAt,
        'inline',
        now,
        now
      );

      // Generate embedding and store in Qdrant
      try {
        const embedText = this._buildEmbedText(content, title, summary, tags);
        const [embedding] = await this.aiService.embed([embedText], { userId });

        if (embedding && embedding.length > 0) {
          // Ensure collection exists with correct dimensions
          await this.ensureCollection(agenticId, embedding.length);

          const collectionName = this.getCollectionName(agenticId);
          const vectorId = uuidv4();

          // Store vector in Qdrant
          await this.vectorStore.upsertPoints(collectionName, [{
            id: vectorId,
            vector: embedding,
            payload: {
              memoryId,
              agenticId,
              userId,
              memoryType: type,
              title,
              importanceScore,
              tags,
              occurredAt: occurredAt || now,
              createdAt: now
            }
          }]);

          // Store vector reference in SQLite
          db.prepare(`
            INSERT INTO agentic_memory_vectors (
              id, memory_id, agentic_id, user_id, vector_collection, vector_id,
              embedding_model, embedding_version, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            uuidv4(),
            memoryId,
            agenticId,
            userId,
            collectionName,
            vectorId,
            'nomic-embed-text', // Default Ollama model
            1,
            now
          );

          logger.debug(`Created memory vector for ${memoryId} in ${collectionName}`);
        }
      } catch (embeddingError) {
        // Log but don't fail - memory is still stored in SQLite
        logger.warn(`Failed to create embedding for memory ${memoryId}: ${embeddingError.message}`);
      }

      // Sync to FTS5 index for keyword search
      this._syncToFts(memoryId, agenticId, userId, title, content, summary, tags);

      // Fetch and return the created memory
      const memory = db.prepare('SELECT * FROM agentic_memory WHERE id = ?').get(memoryId);
      logger.info(`Created memory ${memoryId} for agentic ${agenticId}`);

      return this.transformMemory(memory);

    } catch (error) {
      logger.error(`Failed to create memory: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get a single memory by ID
   * @param {string} memoryId - Memory ID
   * @param {string} userId - User ID (for ownership verification)
   * @returns {Object|null} Memory or null if not found
   */
  getMemory(memoryId, userId) {
    const db = getDatabase();

    const memory = db.prepare(`
      SELECT * FROM agentic_memory
      WHERE id = ? AND user_id = ?
    `).get(memoryId, userId);

    if (memory) {
      // Update recall stats
      db.prepare(`
        UPDATE agentic_memory
        SET last_recalled_at = datetime('now'),
            recall_count = recall_count + 1,
            updated_at = datetime('now')
        WHERE id = ?
      `).run(memoryId);
    }

    return this.transformMemory(memory);
  }

  /**
   * List memories for an agentic profile with filtering
   * @param {string} agenticId - Agentic profile ID
   * @param {string} userId - User ID
   * @param {Object} filters - Filter options
   * @returns {Object} { memories: [], pagination: {} }
   */
  listMemories(agenticId, userId, filters = {}) {
    const {
      type = null,
      types = null,
      minImportance = null,
      sessionId = null,
      contactId = null,
      startDate = null,
      endDate = null,
      tags = null,
      limit = 50,
      offset = 0,
      orderBy = 'created_at',
      orderDir = 'DESC'
    } = filters;

    const db = getDatabase();
    const conditions = ['agentic_id = ?', 'user_id = ?'];
    const params = [agenticId, userId];

    // Filter by single type
    if (type && MEMORY_TYPES.includes(type)) {
      conditions.push('memory_type = ?');
      params.push(type);
    }

    // Filter by multiple types
    if (types && Array.isArray(types) && types.length > 0) {
      const validTypes = types.filter(t => MEMORY_TYPES.includes(t));
      if (validTypes.length > 0) {
        conditions.push(`memory_type IN (${validTypes.map(() => '?').join(', ')})`);
        params.push(...validTypes);
      }
    }

    // Filter by minimum importance
    if (minImportance !== null && !isNaN(minImportance)) {
      conditions.push('importance_score >= ?');
      params.push(minImportance);
    }

    // Filter by contact
    if (contactId) {
      conditions.push('contact_id = ?');
      params.push(contactId);
    }

    // Filter by date range
    if (startDate) {
      conditions.push('(occurred_at >= ? OR created_at >= ?)');
      params.push(startDate, startDate);
    }
    if (endDate) {
      conditions.push('(occurred_at <= ? OR created_at <= ?)');
      params.push(endDate, endDate);
    }

    // Filter by tags (JSON array contains)
    if (tags && Array.isArray(tags) && tags.length > 0) {
      const tagConditions = tags.map(() => "tags LIKE ?");
      conditions.push(`(${tagConditions.join(' OR ')})`);
      tags.forEach(tag => params.push(`%"${tag}"%`));
    }

    // Exclude expired memories
    conditions.push("(expires_at IS NULL OR expires_at > datetime('now'))");

    // Build query
    const whereClause = conditions.join(' AND ');

    // Validate orderBy to prevent SQL injection
    const validOrderColumns = ['created_at', 'updated_at', 'importance_score', 'occurred_at', 'recall_count'];
    const safeOrderBy = validOrderColumns.includes(orderBy) ? orderBy : 'created_at';
    const safeOrderDir = orderDir.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    // Get total count
    const countResult = db.prepare(`
      SELECT COUNT(*) as count FROM agentic_memory WHERE ${whereClause}
    `).get(...params);
    const total = countResult.count;

    // Get memories
    const memories = db.prepare(`
      SELECT * FROM agentic_memory
      WHERE ${whereClause}
      ORDER BY ${safeOrderBy} ${safeOrderDir}
      LIMIT ? OFFSET ?
    `).all(...params, parseInt(limit), parseInt(offset));

    return {
      memories: memories.map(m => this.transformMemory(m)),
      pagination: {
        page: Math.floor(offset / limit) + 1,
        limit: parseInt(limit),
        offset: parseInt(offset),
        count: memories.length,
        total,
        hasMore: (parseInt(offset) + memories.length) < total
      }
    };
  }

  /**
   * Update a memory entry
   * @param {string} memoryId - Memory ID
   * @param {string} userId - User ID
   * @param {Object} updates - Fields to update
   * @returns {Object|null} Updated memory or null
   */
  async updateMemory(memoryId, userId, updates) {
    const db = getDatabase();

    // Verify ownership
    const existing = db.prepare(`
      SELECT * FROM agentic_memory WHERE id = ? AND user_id = ?
    `).get(memoryId, userId);

    if (!existing) {
      return null;
    }

    const allowedFields = [
      'title', 'content', 'summary', 'importance_score',
      'emotion_context', 'tags', 'metadata', 'expires_at'
    ];

    const setClauses = ["updated_at = datetime('now')"];
    const params = [];

    for (const [key, value] of Object.entries(updates)) {
      const dbKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      if (allowedFields.includes(dbKey)) {
        setClauses.push(`${dbKey} = ?`);
        if (dbKey === 'tags' || dbKey === 'metadata') {
          params.push(JSON.stringify(value));
        } else if (dbKey === 'importance_score') {
          params.push(Math.max(0, Math.min(1, value)));
        } else {
          params.push(value);
        }
      }
    }

    if (setClauses.length === 1) {
      // No valid fields to update
      return this.transformMemory(existing);
    }

    params.push(memoryId, userId);

    db.prepare(`
      UPDATE agentic_memory
      SET ${setClauses.join(', ')}
      WHERE id = ? AND user_id = ?
    `).run(...params);

    // Re-generate embedding if content changed
    if (updates.content || updates.title || updates.summary || updates.tags) {
      try {
        const memory = db.prepare('SELECT * FROM agentic_memory WHERE id = ?').get(memoryId);
        const embedText = this._buildEmbedText(
          memory.content,
          memory.title,
          memory.summary,
          JSON.parse(memory.tags || '[]')
        );

        const [embedding] = await this.aiService.embed([embedText], { userId });

        if (embedding && embedding.length > 0) {
          // Get existing vector reference
          const vectorRef = db.prepare(`
            SELECT * FROM agentic_memory_vectors WHERE memory_id = ?
          `).get(memoryId);

          if (vectorRef) {
            // Update existing vector
            await this.vectorStore.upsertPoints(vectorRef.vector_collection, [{
              id: vectorRef.vector_id,
              vector: embedding,
              payload: {
                memoryId,
                agenticId: memory.agentic_id,
                userId,
                memoryType: memory.memory_type,
                title: memory.title,
                importanceScore: memory.importance_score,
                tags: JSON.parse(memory.tags || '[]'),
                occurredAt: memory.occurred_at,
                updatedAt: new Date().toISOString()
              }
            }]);

            logger.debug(`Updated embedding for memory ${memoryId}`);
          }
        }
      } catch (embeddingError) {
        logger.warn(`Failed to update embedding for memory ${memoryId}: ${embeddingError.message}`);
      }
    }

    // Re-sync FTS5 if content fields changed
    if (updates.content || updates.title || updates.summary || updates.tags) {
      const memory = db.prepare('SELECT * FROM agentic_memory WHERE id = ?').get(memoryId);
      if (memory) {
        this._syncToFts(memoryId, memory.agentic_id, userId,
          memory.title, memory.content, memory.summary,
          JSON.parse(memory.tags || '[]'));
      }
    }

    const updated = db.prepare('SELECT * FROM agentic_memory WHERE id = ?').get(memoryId);
    return this.transformMemory(updated);
  }

  /**
   * Delete a memory entry
   * @param {string} memoryId - Memory ID
   * @param {string} userId - User ID
   * @returns {boolean} True if deleted
   */
  async deleteMemory(memoryId, userId) {
    const db = getDatabase();

    // Get memory and vector references
    const memory = db.prepare(`
      SELECT * FROM agentic_memory WHERE id = ? AND user_id = ?
    `).get(memoryId, userId);

    if (!memory) {
      return false;
    }

    // Get vector references
    const vectorRefs = db.prepare(`
      SELECT * FROM agentic_memory_vectors WHERE memory_id = ?
    `).all(memoryId);

    // Delete from Qdrant
    for (const ref of vectorRefs) {
      try {
        await this.vectorStore.deletePoints(ref.vector_collection, [ref.vector_id]);
        logger.debug(`Deleted vector ${ref.vector_id} from ${ref.vector_collection}`);
      } catch (error) {
        logger.warn(`Failed to delete vector from Qdrant: ${error.message}`);
      }
    }

    // Delete vector references
    db.prepare('DELETE FROM agentic_memory_vectors WHERE memory_id = ?').run(memoryId);

    // Remove from FTS5 index
    this._removeFromFts(memoryId, memory);

    // Delete memory
    db.prepare('DELETE FROM agentic_memory WHERE id = ?').run(memoryId);

    logger.info(`Deleted memory ${memoryId}`);
    return true;
  }

  // ============================================
  // Semantic Search
  // ============================================

  /**
   * Search memories using hybrid (vector + keyword) search.
   * @param {string} agenticId - Agentic profile ID
   * @param {string} userId - User ID
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @param {string} [options.searchMode='hybrid'] - 'hybrid' | 'vector' | 'keyword'
   * @returns {Promise<Array>} Search results with scores
   */
  async searchMemories(agenticId, userId, query, options = {}) {
    const {
      limit = 10,
      searchMode = 'hybrid',
      ...restOptions
    } = options;

    // Route based on search mode
    if (searchMode === 'keyword') {
      return this.searchMemoriesKeyword(agenticId, userId, query, { limit, ...restOptions });
    }

    if (searchMode === 'vector') {
      return this._searchMemoriesVector(agenticId, userId, query, { limit, ...restOptions });
    }

    // Hybrid mode: run both searches, fuse results
    const [vectorResults, keywordResults] = await Promise.allSettled([
      this._searchMemoriesVector(agenticId, userId, query, { limit: limit * 2, ...restOptions }),
      Promise.resolve(this.searchMemoriesKeyword(agenticId, userId, query, { limit: limit * 2, ...restOptions })),
    ]);

    const vectors = vectorResults.status === 'fulfilled' ? vectorResults.value : [];
    const keywords = keywordResults.status === 'fulfilled' ? keywordResults.value : [];

    // If one source failed, return the other
    if (vectors.length === 0 && keywords.length === 0) return [];
    if (vectors.length === 0) return keywords.slice(0, limit);
    if (keywords.length === 0) return vectors.slice(0, limit);

    // Reciprocal Rank Fusion
    const fused = this._reciprocalRankFusion(vectors, keywords, limit);
    logger.debug(`Hybrid search: ${vectors.length} vector + ${keywords.length} keyword -> ${fused.length} fused results`);
    return fused;
  }

  /**
   * Vector-only search (existing Qdrant path)
   * @private
   */
  async _searchMemoriesVector(agenticId, userId, query, options = {}) {
    const {
      limit = 10,
      minScore = 0.3,
      types = null,
      minImportance = null,
      includeExpired = false
    } = options;

    const db = getDatabase();
    const collectionName = this.getCollectionName(agenticId);

    try {
      const collectionInfo = await this.vectorStore.getCollectionInfo(collectionName);
      if (!collectionInfo) {
        logger.debug(`No vector collection found for agentic ${agenticId}`);
        return [];
      }

      const [queryEmbedding] = await this.aiService.embed([query], { userId });
      if (!queryEmbedding || queryEmbedding.length === 0) {
        logger.warn('Failed to generate query embedding');
        return [];
      }

      const filter = {
        must: [
          { key: 'agenticId', match: { value: agenticId } },
          { key: 'userId', match: { value: userId } }
        ]
      };

      if (types && Array.isArray(types) && types.length > 0) {
        filter.must.push({ key: 'memoryType', match: { any: types } });
      }

      if (minImportance !== null && !isNaN(minImportance)) {
        filter.must.push({ key: 'importanceScore', range: { gte: minImportance } });
      }

      const searchResults = await this.vectorStore.search(collectionName, queryEmbedding, {
        limit: limit * 2,
        filter,
        scoreThreshold: minScore
      });

      const results = [];
      for (const result of searchResults) {
        const memoryId = result.payload?.memoryId;
        if (!memoryId) continue;

        const memory = db.prepare('SELECT * FROM agentic_memory WHERE id = ?').get(memoryId);
        if (!memory) continue;

        if (!includeExpired && memory.expires_at) {
          const expiresAt = new Date(memory.expires_at);
          if (expiresAt < new Date()) continue;
        }

        db.prepare(`
          UPDATE agentic_memory SET last_recalled_at = datetime('now'), recall_count = recall_count + 1 WHERE id = ?
        `).run(memoryId);

        results.push({
          ...this.transformMemory(memory),
          score: result.score,
          source: 'vector',
        });

        if (results.length >= limit) break;
      }

      return results;
    } catch (error) {
      logger.error(`Vector memory search failed: ${error.message}`);
      return [];
    }
  }

  /**
   * FTS5 keyword search
   * @param {string} agenticId
   * @param {string} userId
   * @param {string} query
   * @param {Object} options
   * @returns {Array}
   */
  searchMemoriesKeyword(agenticId, userId, query, options = {}) {
    const { limit = 10 } = options;
    const db = getDatabase();

    if (!this._hasFtsSupport()) {
      return [];
    }

    try {
      // Sanitize query for FTS5 (remove special chars, wrap terms in quotes if needed)
      const sanitized = query.replace(/[^\w\s]/g, ' ').trim();
      if (!sanitized || sanitized.length < 2) return [];

      const results = db.prepare(`
        SELECT m.*, fts.rank as fts_rank
        FROM agentic_memory_fts fts
        JOIN agentic_memory_fts_map map ON map.rowid = fts.rowid
        JOIN agentic_memory m ON m.id = map.memory_id
        WHERE agentic_memory_fts MATCH ?
          AND map.agentic_id = ?
          AND map.user_id = ?
          AND (m.expires_at IS NULL OR m.expires_at > datetime('now'))
        ORDER BY fts.rank
        LIMIT ?
      `).all(sanitized, agenticId, userId, limit);

      return results.map((row, index) => ({
        ...this.transformMemory(row),
        score: Math.abs(row.fts_rank || 0),
        rank: index + 1,
        source: 'keyword',
      }));
    } catch (e) {
      logger.debug(`FTS5 keyword search failed: ${e.message}`);
      return [];
    }
  }

  /**
   * Synchronous memory search using FTS5 keyword search only.
   * Used by AgentReasoningLoop for context building (no async embedding needed).
   * @param {string} agenticId
   * @param {string} userId
   * @param {string} query
   * @param {number} limit
   * @returns {Array}
   */
  searchMemoriesSync(agenticId, userId, query, limit = 5) {
    return this.searchMemoriesKeyword(agenticId, userId, query, { limit });
  }

  /**
   * Merge two ranked result lists using Reciprocal Rank Fusion.
   * score = sum(1 / (k + rank_i)) for each list the item appears in
   * @private
   */
  _reciprocalRankFusion(vectorResults, keywordResults, limit = 10, k = 60) {
    const scoreMap = new Map();

    vectorResults.forEach((result, index) => {
      const rank = index + 1;
      scoreMap.set(result.id, {
        memory: result,
        rrfScore: 1 / (k + rank),
        sources: ['vector'],
        vectorRank: rank,
        vectorScore: result.score,
      });
    });

    keywordResults.forEach((result, index) => {
      const rank = index + 1;
      const rrfScore = 1 / (k + rank);

      if (scoreMap.has(result.id)) {
        const existing = scoreMap.get(result.id);
        existing.rrfScore += rrfScore;
        existing.sources.push('keyword');
        existing.keywordRank = rank;
      } else {
        scoreMap.set(result.id, {
          memory: result,
          rrfScore,
          sources: ['keyword'],
          keywordRank: rank,
        });
      }
    });

    return Array.from(scoreMap.values())
      .sort((a, b) => b.rrfScore - a.rrfScore)
      .slice(0, limit)
      .map(entry => ({
        ...entry.memory,
        score: entry.rrfScore,
        sources: entry.sources,
      }));
  }

  // ============================================
  // FTS5 Helpers (Hybrid Memory Search)
  // ============================================

  /**
   * Check if FTS5 tables exist
   * @private
   */
  _hasFtsSupport() {
    try {
      const db = getDatabase();
      const result = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='agentic_memory_fts'").get();
      return !!result;
    } catch (e) {
      return false;
    }
  }

  /**
   * Sync a memory to FTS5 index
   * @private
   */
  _syncToFts(memoryId, agenticId, userId, title, content, summary, tags) {
    const db = getDatabase();
    try {
      if (!this._hasFtsSupport()) return;

      // Insert into mapping table
      db.prepare(`
        INSERT OR IGNORE INTO agentic_memory_fts_map (memory_id, agentic_id, user_id) VALUES (?, ?, ?)
      `).run(memoryId, agenticId, userId);

      const mapRow = db.prepare('SELECT rowid FROM agentic_memory_fts_map WHERE memory_id = ?').get(memoryId);
      if (mapRow) {
        const tagsStr = Array.isArray(tags) ? JSON.stringify(tags) : (tags || '[]');
        // Delete old FTS entry if exists, then insert new
        try {
          db.prepare("INSERT INTO agentic_memory_fts(agentic_memory_fts, rowid, title, content, summary, tags) VALUES('delete', ?, ?, ?, ?, ?)").run(
            mapRow.rowid, title || '', content || '', summary || '', tagsStr
          );
        } catch (e) {
          // Ignore delete errors (entry may not exist yet)
        }
        db.prepare('INSERT INTO agentic_memory_fts(rowid, title, content, summary, tags) VALUES(?, ?, ?, ?, ?)').run(
          mapRow.rowid, title || '', content || '', summary || '', tagsStr
        );
      }
    } catch (e) {
      logger.debug(`FTS sync failed for memory ${memoryId}: ${e.message}`);
    }
  }

  /**
   * Remove a memory from FTS5 index
   * @private
   */
  _removeFromFts(memoryId, memory) {
    const db = getDatabase();
    try {
      if (!this._hasFtsSupport()) return;

      const mapRow = db.prepare('SELECT rowid FROM agentic_memory_fts_map WHERE memory_id = ?').get(memoryId);
      if (mapRow && memory) {
        try {
          db.prepare("INSERT INTO agentic_memory_fts(agentic_memory_fts, rowid, title, content, summary, tags) VALUES('delete', ?, ?, ?, ?, ?)").run(
            mapRow.rowid, memory.title || '', memory.content || '', memory.summary || '', memory.tags || '[]'
          );
        } catch (e) {
          // Ignore if entry doesn't exist
        }
        db.prepare('DELETE FROM agentic_memory_fts_map WHERE memory_id = ?').run(memoryId);
      }
    } catch (e) {
      logger.debug(`FTS removal failed for memory ${memoryId}: ${e.message}`);
    }
  }

  // ============================================
  // Session Management
  // ============================================

  /**
   * Create a new memory session
   * @param {string} agenticId - Agentic profile ID
   * @param {string} userId - User ID
   * @param {string} type - Session type
   * @param {Object} options - Session options
   * @returns {Object} Created session
   */
  createSession(agenticId, userId, type, options = {}) {
    if (!SESSION_TYPES.includes(type)) {
      throw new Error(`Invalid session type: ${type}. Must be one of: ${SESSION_TYPES.join(', ')}`);
    }

    const {
      contactId = null,
      metadata = {},
      ttl = 3600 // 1 hour default
    } = options;

    const db = getDatabase();
    const sessionId = uuidv4();
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
    const redisKey = `agentic:session:${agenticId}:${type}:${sessionId}`;

    db.prepare(`
      INSERT INTO agentic_memory_sessions (
        id, agentic_id, user_id, session_type, redis_key, redis_ttl,
        contact_id, metadata, last_accessed_at, expires_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      sessionId,
      agenticId,
      userId,
      type,
      redisKey,
      ttl,
      contactId,
      JSON.stringify(metadata),
      now,
      expiresAt,
      now
    );

    const session = db.prepare('SELECT * FROM agentic_memory_sessions WHERE id = ?').get(sessionId);
    logger.info(`Created memory session ${sessionId} for agentic ${agenticId}`);

    return this.transformSession(session);
  }

  /**
   * End a memory session
   * @param {string} sessionId - Session ID
   * @param {string} userId - User ID
   * @returns {boolean} True if ended
   */
  endSession(sessionId, userId) {
    const db = getDatabase();

    const result = db.prepare(`
      UPDATE agentic_memory_sessions
      SET expires_at = datetime('now')
      WHERE id = ? AND user_id = ?
    `).run(sessionId, userId);

    if (result.changes > 0) {
      logger.info(`Ended memory session ${sessionId}`);
      return true;
    }

    return false;
  }

  /**
   * Get session details with associated memories
   * @param {string} sessionId - Session ID
   * @param {string} userId - User ID
   * @returns {Object|null} Session with memories
   */
  getSession(sessionId, userId) {
    const db = getDatabase();

    const session = db.prepare(`
      SELECT * FROM agentic_memory_sessions
      WHERE id = ? AND user_id = ?
    `).get(sessionId, userId);

    if (!session) {
      return null;
    }

    // Update last accessed
    db.prepare(`
      UPDATE agentic_memory_sessions
      SET last_accessed_at = datetime('now')
      WHERE id = ?
    `).run(sessionId);

    // Get memories created during this session (by time range)
    const memories = db.prepare(`
      SELECT * FROM agentic_memory
      WHERE agentic_id = ? AND user_id = ?
        AND created_at >= ? AND created_at <= COALESCE(?, datetime('now'))
      ORDER BY created_at DESC
      LIMIT 100
    `).all(
      session.agentic_id,
      userId,
      session.created_at,
      session.expires_at
    );

    return {
      ...this.transformSession(session),
      memories: memories.map(m => this.transformMemory(m))
    };
  }

  /**
   * List active sessions for an agentic profile
   * @param {string} agenticId - Agentic profile ID
   * @param {string} userId - User ID
   * @returns {Array} Active sessions
   */
  listSessions(agenticId, userId) {
    const db = getDatabase();

    const sessions = db.prepare(`
      SELECT * FROM agentic_memory_sessions
      WHERE agentic_id = ? AND user_id = ?
        AND (expires_at IS NULL OR expires_at > datetime('now'))
      ORDER BY created_at DESC
    `).all(agenticId, userId);

    return sessions.map(s => this.transformSession(s));
  }

  // ============================================
  // Memory Consolidation
  // ============================================

  /**
   * Consolidate memories (summarize old, adjust importance, archive)
   * Called by scheduled tasks
   * @param {string} agenticId - Agentic profile ID
   * @param {Object} options - Consolidation options
   * @returns {Object} Consolidation stats
   */
  async consolidateMemories(agenticId, options = {}) {
    const {
      olderThanDays = 30,
      minRecallsForKeep = 2,
      archiveThreshold = 0.2,
      maxMemoriesToProcess = 100
    } = options;

    const db = getDatabase();
    const stats = {
      processed: 0,
      importanceAdjusted: 0,
      archived: 0,
      summarized: 0
    };

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    // Get old memories that need processing
    const memories = db.prepare(`
      SELECT * FROM agentic_memory
      WHERE agentic_id = ?
        AND created_at < ?
        AND (expires_at IS NULL OR expires_at > datetime('now'))
      ORDER BY importance_score ASC, recall_count ASC
      LIMIT ?
    `).all(agenticId, cutoffDate.toISOString(), maxMemoriesToProcess);

    for (const memory of memories) {
      stats.processed++;

      // Adjust importance based on recall patterns
      let newImportance = memory.importance_score;

      if (memory.recall_count >= minRecallsForKeep * 2) {
        // Frequently recalled - increase importance
        newImportance = Math.min(1, memory.importance_score + 0.1);
      } else if (memory.recall_count < minRecallsForKeep && memory.importance_score > 0.3) {
        // Rarely recalled - decrease importance
        newImportance = Math.max(0.1, memory.importance_score - 0.1);
      }

      if (newImportance !== memory.importance_score) {
        db.prepare(`
          UPDATE agentic_memory
          SET importance_score = ?, updated_at = datetime('now')
          WHERE id = ?
        `).run(newImportance, memory.id);
        stats.importanceAdjusted++;
      }

      // Archive low-importance memories
      if (newImportance < archiveThreshold && memory.recall_count < minRecallsForKeep) {
        // Set expiration to archive
        const archiveDate = new Date();
        archiveDate.setDate(archiveDate.getDate() + 7); // 7 days before deletion

        db.prepare(`
          UPDATE agentic_memory
          SET expires_at = ?, updated_at = datetime('now')
          WHERE id = ?
        `).run(archiveDate.toISOString(), memory.id);
        stats.archived++;
      }
    }

    logger.info(`Memory consolidation for ${agenticId}: ${JSON.stringify(stats)}`);
    return stats;
  }

  /**
   * Cleanup expired memories and orphaned vectors
   * @param {string} agenticId - Optional agentic profile ID (null for all)
   * @returns {Object} Cleanup stats
   */
  async cleanupExpiredMemories(agenticId = null) {
    const db = getDatabase();
    const stats = {
      memoriesDeleted: 0,
      vectorsDeleted: 0,
      sessionsDeleted: 0
    };

    // Build condition
    const agenticCondition = agenticId ? 'AND agentic_id = ?' : '';
    const params = agenticId ? [agenticId] : [];

    // Get expired memories
    const expiredMemories = db.prepare(`
      SELECT id, agentic_id FROM agentic_memory
      WHERE expires_at IS NOT NULL AND expires_at < datetime('now')
      ${agenticCondition}
    `).all(...params);

    for (const memory of expiredMemories) {
      // Get vector references
      const vectorRefs = db.prepare(`
        SELECT * FROM agentic_memory_vectors WHERE memory_id = ?
      `).all(memory.id);

      // Delete from Qdrant
      for (const ref of vectorRefs) {
        try {
          await this.vectorStore.deletePoints(ref.vector_collection, [ref.vector_id]);
          stats.vectorsDeleted++;
        } catch (error) {
          logger.warn(`Failed to delete vector: ${error.message}`);
        }
      }

      // Delete vector references
      db.prepare('DELETE FROM agentic_memory_vectors WHERE memory_id = ?').run(memory.id);

      // Delete memory
      db.prepare('DELETE FROM agentic_memory WHERE id = ?').run(memory.id);
      stats.memoriesDeleted++;
    }

    // Delete expired sessions
    const sessionsResult = db.prepare(`
      DELETE FROM agentic_memory_sessions
      WHERE expires_at IS NOT NULL AND expires_at < datetime('now')
      ${agenticCondition}
    `).run(...params);
    stats.sessionsDeleted = sessionsResult.changes;

    logger.info(`Memory cleanup: ${JSON.stringify(stats)}`);
    return stats;
  }

  // ============================================
  // Helpers
  // ============================================

  /**
   * Build text for embedding generation
   * @private
   */
  _buildEmbedText(content, title, summary, tags) {
    const parts = [];

    if (title) parts.push(`Title: ${title}`);
    if (summary) parts.push(`Summary: ${summary}`);
    if (content) parts.push(content);
    if (tags && tags.length > 0) parts.push(`Tags: ${tags.join(', ')}`);

    return parts.join('\n\n');
  }

  /**
   * Get memory statistics for an agentic profile
   * @param {string} agenticId - Agentic profile ID
   * @param {string} userId - User ID
   * @returns {Object} Memory statistics
   */
  getMemoryStats(agenticId, userId) {
    const db = getDatabase();

    const totalCount = db.prepare(`
      SELECT COUNT(*) as count FROM agentic_memory
      WHERE agentic_id = ? AND user_id = ?
    `).get(agenticId, userId).count;

    const typeStats = db.prepare(`
      SELECT memory_type, COUNT(*) as count
      FROM agentic_memory
      WHERE agentic_id = ? AND user_id = ?
      GROUP BY memory_type
    `).all(agenticId, userId);

    const avgImportance = db.prepare(`
      SELECT AVG(importance_score) as avg FROM agentic_memory
      WHERE agentic_id = ? AND user_id = ?
    `).get(agenticId, userId).avg || 0;

    const recentCount = db.prepare(`
      SELECT COUNT(*) as count FROM agentic_memory
      WHERE agentic_id = ? AND user_id = ?
        AND created_at > datetime('now', '-7 days')
    `).get(agenticId, userId).count;

    const expiringCount = db.prepare(`
      SELECT COUNT(*) as count FROM agentic_memory
      WHERE agentic_id = ? AND user_id = ?
        AND expires_at IS NOT NULL
        AND expires_at > datetime('now')
        AND expires_at < datetime('now', '+7 days')
    `).get(agenticId, userId).count;

    return {
      total: totalCount,
      byType: typeStats.reduce((acc, t) => ({ ...acc, [t.memory_type]: t.count }), {}),
      averageImportance: Math.round(avgImportance * 100) / 100,
      recentlyCreated: recentCount,
      expiringSoon: expiringCount
    };
  }
}

// Singleton instance
let agenticMemoryServiceInstance = null;

/**
 * Get AgenticMemoryService singleton
 * @returns {AgenticMemoryService}
 */
function getAgenticMemoryService() {
  if (!agenticMemoryServiceInstance) {
    agenticMemoryServiceInstance = new AgenticMemoryService();
  }
  return agenticMemoryServiceInstance;
}

module.exports = {
  AgenticMemoryService,
  getAgenticMemoryService,
  MEMORY_TYPES,
  SESSION_TYPES
};
