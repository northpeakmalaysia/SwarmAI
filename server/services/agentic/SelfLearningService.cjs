/**
 * Self-Learning Service
 * =====================
 * Enables autonomous AI agents to learn from interactions and update knowledge.
 *
 * Features:
 * - Auto-extract learning from conversations, tasks, emails, feedback
 * - Deduplicate against existing RAG knowledge
 * - Safety controls (rate limits, human approval for sensitive content)
 * - Knowledge versioning and audit trail
 * - Learning source tracking (conversations, tasks, emails, feedback, escalations, patterns)
 *
 * Learning Sources:
 * - conversations: Learn from message exchanges
 * - tasks: Learn from task outcomes and patterns
 * - emails: Learn from email content
 * - feedback: Learn from user feedback and corrections
 * - escalations: Learn from escalation patterns
 * - patterns: Learn from detected behavioral patterns
 */

const EventEmitter = require('events');
const crypto = require('crypto');
const { getDatabase } = require('../database.cjs');
const { logger } = require('../logger.cjs');

/**
 * Learning sources
 */
const LearnSource = {
  CONVERSATIONS: 'conversations',
  TASKS: 'tasks',
  EMAILS: 'emails',
  FEEDBACK: 'feedback',
  ESCALATIONS: 'escalations',
  PATTERNS: 'patterns',
};

/**
 * Learning status
 */
const LearnStatus = {
  PENDING: 'pending',           // Awaiting processing
  PROCESSING: 'processing',     // Being extracted/analyzed
  REVIEW: 'review',             // Awaiting human review
  APPROVED: 'approved',         // Approved for ingestion
  INGESTED: 'ingested',         // Added to knowledge base
  REJECTED: 'rejected',         // Rejected by human review
  DUPLICATE: 'duplicate',       // Duplicate content detected
  FAILED: 'failed',             // Processing failed
};

/**
 * Default configuration
 */
const DEFAULT_CONFIG = {
  enabled: false,                     // Self-learning disabled by default
  maxAutoLearnsPerHour: 10,           // Rate limit
  chunkSize: 500,                     // Max chars per knowledge chunk
  humanReviewThreshold: 0.7,          // Confidence below this requires review
  autoApproveThreshold: 0.9,          // Auto-approve if confidence above this
  enabledSources: ['conversations', 'feedback'],  // Which sources are enabled
  cooldownMinutes: 5,                 // Cooldown between learning from same source
  minContentLength: 50,               // Minimum content length to learn
  maxContentLength: 5000,             // Maximum content length per learning
};

class SelfLearningService extends EventEmitter {
  constructor() {
    super();
    this.db = null;
    this.superBrain = null;
    this.ragService = null;
    this.isRunning = false;
    this.checkInterval = null;
    this.checkIntervalMs = 60000; // Check every minute
    this.learningCooldowns = new Map(); // agenticId:source -> lastLearnTime
  }

  /**
   * Get database instance
   */
  getDb() {
    if (!this.db) {
      this.db = getDatabase();
      this.ensureLearningTables();
    }
    return this.db;
  }

  /**
   * Ensure self-learning tables exist
   */
  ensureLearningTables() {
    const db = this.db;
    try {
      db.exec(`
        -- Self-learning configuration per profile
        CREATE TABLE IF NOT EXISTS agentic_self_learning_config (
          id TEXT PRIMARY KEY,
          agentic_id TEXT UNIQUE NOT NULL,
          user_id TEXT NOT NULL,

          -- Master toggle
          enabled INTEGER DEFAULT 0,

          -- Rate limiting
          max_auto_learns_per_hour INTEGER DEFAULT 10,
          cooldown_minutes INTEGER DEFAULT 5,

          -- Content settings
          chunk_size INTEGER DEFAULT 500,
          min_content_length INTEGER DEFAULT 50,
          max_content_length INTEGER DEFAULT 5000,

          -- Approval thresholds
          human_review_threshold REAL DEFAULT 0.7,
          auto_approve_threshold REAL DEFAULT 0.9,

          -- Enabled sources (JSON array)
          enabled_sources TEXT DEFAULT '["conversations", "feedback"]',

          -- Knowledge library binding
          bound_library_id TEXT,

          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now')),

          FOREIGN KEY (agentic_id) REFERENCES agentic_profiles(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_self_learn_config_agentic ON agentic_self_learning_config(agentic_id);

        -- Learning queue and history
        CREATE TABLE IF NOT EXISTS agentic_learning_queue (
          id TEXT PRIMARY KEY,
          agentic_id TEXT NOT NULL,
          user_id TEXT NOT NULL,

          -- Source information
          source_type TEXT NOT NULL
            CHECK(source_type IN ('conversations', 'tasks', 'emails', 'feedback', 'escalations', 'patterns')),
          source_id TEXT,
          source_context TEXT DEFAULT '{}',

          -- Extracted content
          content TEXT NOT NULL,
          summary TEXT,
          extracted_facts TEXT DEFAULT '[]',
          confidence REAL DEFAULT 0.5,

          -- Processing status
          status TEXT DEFAULT 'pending'
            CHECK(status IN ('pending', 'processing', 'review', 'approved', 'ingested', 'rejected', 'duplicate', 'failed')),

          -- Review information
          reviewed_by TEXT,
          reviewed_at TEXT,
          review_notes TEXT,

          -- Ingestion information
          knowledge_chunk_id TEXT,
          ingested_at TEXT,

          -- Deduplication
          similarity_score REAL,
          similar_chunk_id TEXT,

          -- Error handling
          error_message TEXT,
          retry_count INTEGER DEFAULT 0,

          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now')),

          FOREIGN KEY (agentic_id) REFERENCES agentic_profiles(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_learning_queue_agentic ON agentic_learning_queue(agentic_id);
        CREATE INDEX IF NOT EXISTS idx_learning_queue_status ON agentic_learning_queue(status);
        CREATE INDEX IF NOT EXISTS idx_learning_queue_source ON agentic_learning_queue(source_type);
        CREATE INDEX IF NOT EXISTS idx_learning_queue_created ON agentic_learning_queue(created_at DESC);

        -- Learning statistics
        CREATE TABLE IF NOT EXISTS agentic_learning_stats (
          id TEXT PRIMARY KEY,
          agentic_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          date TEXT NOT NULL,

          -- Counts by status
          pending_count INTEGER DEFAULT 0,
          processed_count INTEGER DEFAULT 0,
          ingested_count INTEGER DEFAULT 0,
          rejected_count INTEGER DEFAULT 0,
          duplicate_count INTEGER DEFAULT 0,
          failed_count INTEGER DEFAULT 0,

          -- Counts by source
          conversations_count INTEGER DEFAULT 0,
          tasks_count INTEGER DEFAULT 0,
          emails_count INTEGER DEFAULT 0,
          feedback_count INTEGER DEFAULT 0,
          escalations_count INTEGER DEFAULT 0,
          patterns_count INTEGER DEFAULT 0,

          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now')),

          UNIQUE(agentic_id, date),
          FOREIGN KEY (agentic_id) REFERENCES agentic_profiles(id) ON DELETE CASCADE
        );
      `);
      logger.info('Ensured self-learning tables exist');
    } catch (error) {
      logger.error(`Failed to create self-learning tables: ${error.message}`);
    }
  }

  /**
   * Initialize the service with dependencies
   */
  initialize(options = {}) {
    this.getDb();

    if (options.superBrain) {
      this.superBrain = options.superBrain;
    }

    if (options.ragService) {
      this.ragService = options.ragService;
    }

    logger.info('SelfLearningService initialized');
  }

  /**
   * Start the background learning processor
   */
  start() {
    if (this.isRunning) {
      logger.warn('SelfLearningService is already running');
      return;
    }

    this.isRunning = true;
    logger.info('SelfLearningService started');

    // Initial processing
    this.processLearningQueue();

    // Set up periodic processing
    this.checkInterval = setInterval(() => {
      this.processLearningQueue();
    }, this.checkIntervalMs);

    this.emit('started');
  }

  /**
   * Stop the service
   */
  stop() {
    if (!this.isRunning) return;

    this.isRunning = false;

    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    logger.info('SelfLearningService stopped');
    this.emit('stopped');
  }

  // =====================================================
  // CONFIGURATION MANAGEMENT
  // =====================================================

  /**
   * Get self-learning configuration
   */
  getConfig(agenticId, userId) {
    const db = this.getDb();

    const config = db.prepare(`
      SELECT * FROM agentic_self_learning_config WHERE agentic_id = ? AND user_id = ?
    `).get(agenticId, userId);

    if (!config) {
      return {
        agenticId,
        enabled: DEFAULT_CONFIG.enabled,
        maxAutoLearnsPerHour: DEFAULT_CONFIG.maxAutoLearnsPerHour,
        cooldownMinutes: DEFAULT_CONFIG.cooldownMinutes,
        chunkSize: DEFAULT_CONFIG.chunkSize,
        minContentLength: DEFAULT_CONFIG.minContentLength,
        maxContentLength: DEFAULT_CONFIG.maxContentLength,
        humanReviewThreshold: DEFAULT_CONFIG.humanReviewThreshold,
        autoApproveThreshold: DEFAULT_CONFIG.autoApproveThreshold,
        enabledSources: DEFAULT_CONFIG.enabledSources,
        boundLibraryId: null,
      };
    }

    return this.transformConfig(config);
  }

  /**
   * Update self-learning configuration
   */
  updateConfig(agenticId, userId, configData) {
    const db = this.getDb();

    const existing = db.prepare(`
      SELECT id FROM agentic_self_learning_config WHERE agentic_id = ?
    `).get(agenticId);

    const enabledSources = Array.isArray(configData.enabledSources)
      ? JSON.stringify(configData.enabledSources)
      : JSON.stringify(DEFAULT_CONFIG.enabledSources);

    if (existing) {
      db.prepare(`
        UPDATE agentic_self_learning_config SET
          enabled = ?,
          max_auto_learns_per_hour = ?,
          cooldown_minutes = ?,
          chunk_size = ?,
          min_content_length = ?,
          max_content_length = ?,
          human_review_threshold = ?,
          auto_approve_threshold = ?,
          enabled_sources = ?,
          bound_library_id = ?,
          updated_at = datetime('now')
        WHERE agentic_id = ?
      `).run(
        configData.enabled ? 1 : 0,
        configData.maxAutoLearnsPerHour || DEFAULT_CONFIG.maxAutoLearnsPerHour,
        configData.cooldownMinutes || DEFAULT_CONFIG.cooldownMinutes,
        configData.chunkSize || DEFAULT_CONFIG.chunkSize,
        configData.minContentLength || DEFAULT_CONFIG.minContentLength,
        configData.maxContentLength || DEFAULT_CONFIG.maxContentLength,
        configData.humanReviewThreshold || DEFAULT_CONFIG.humanReviewThreshold,
        configData.autoApproveThreshold || DEFAULT_CONFIG.autoApproveThreshold,
        enabledSources,
        configData.boundLibraryId || null,
        agenticId
      );
    } else {
      db.prepare(`
        INSERT INTO agentic_self_learning_config (
          id, agentic_id, user_id,
          enabled, max_auto_learns_per_hour, cooldown_minutes,
          chunk_size, min_content_length, max_content_length,
          human_review_threshold, auto_approve_threshold,
          enabled_sources, bound_library_id,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).run(
        crypto.randomUUID(),
        agenticId,
        userId,
        configData.enabled ? 1 : 0,
        configData.maxAutoLearnsPerHour || DEFAULT_CONFIG.maxAutoLearnsPerHour,
        configData.cooldownMinutes || DEFAULT_CONFIG.cooldownMinutes,
        configData.chunkSize || DEFAULT_CONFIG.chunkSize,
        configData.minContentLength || DEFAULT_CONFIG.minContentLength,
        configData.maxContentLength || DEFAULT_CONFIG.maxContentLength,
        configData.humanReviewThreshold || DEFAULT_CONFIG.humanReviewThreshold,
        configData.autoApproveThreshold || DEFAULT_CONFIG.autoApproveThreshold,
        enabledSources,
        configData.boundLibraryId || null
      );
    }

    return this.getConfig(agenticId, userId);
  }

  // =====================================================
  // LEARNING QUEUE MANAGEMENT
  // =====================================================

  /**
   * Queue content for learning
   */
  queueLearning(options) {
    const db = this.getDb();
    const {
      agenticId,
      userId,
      sourceType,
      sourceId,
      content,
      summary,
      sourceContext = {},
      confidence = 0.5,
    } = options;

    // Validate source type
    if (!Object.values(LearnSource).includes(sourceType)) {
      throw new Error(`Invalid source type: ${sourceType}`);
    }

    // Get config to check if enabled
    const config = this.getConfig(agenticId, userId);

    if (!config.enabled) {
      throw new Error('Self-learning is not enabled for this profile');
    }

    if (!config.enabledSources.includes(sourceType)) {
      throw new Error(`Learning from ${sourceType} is not enabled`);
    }

    // Check rate limit
    if (!this.checkRateLimit(agenticId, config.maxAutoLearnsPerHour)) {
      throw new Error('Rate limit exceeded. Try again later.');
    }

    // Check cooldown
    const cooldownKey = `${agenticId}:${sourceType}`;
    if (this.isInCooldown(cooldownKey, config.cooldownMinutes)) {
      throw new Error(`Cooldown active for ${sourceType}. Try again later.`);
    }

    // Validate content length
    if (content.length < config.minContentLength) {
      throw new Error(`Content too short (min ${config.minContentLength} chars)`);
    }

    const truncatedContent = content.substring(0, config.maxContentLength);

    // Create queue entry
    const id = crypto.randomUUID();
    const status = confidence >= config.autoApproveThreshold
      ? LearnStatus.APPROVED
      : confidence < config.humanReviewThreshold
        ? LearnStatus.REVIEW
        : LearnStatus.PENDING;

    db.prepare(`
      INSERT INTO agentic_learning_queue (
        id, agentic_id, user_id, source_type, source_id,
        source_context, content, summary, confidence, status,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(
      id,
      agenticId,
      userId,
      sourceType,
      sourceId || null,
      JSON.stringify(sourceContext),
      truncatedContent,
      summary || null,
      confidence,
      status
    );

    // Set cooldown
    this.setCooldown(cooldownKey);

    // Update stats
    this.updateStats(agenticId, userId, sourceType, 'pending');

    this.emit('learning:queued', {
      id,
      agenticId,
      sourceType,
      status,
      confidence,
    });

    logger.info(`Queued learning ${id} from ${sourceType} for profile ${agenticId}`);

    return { id, status, confidence };
  }

  /**
   * Get learning queue items
   */
  getLearningQueue(agenticId, userId, options = {}) {
    const db = this.getDb();
    const {
      status = null,
      sourceType = null,
      page = 1,
      pageSize = 20,
    } = options;

    let whereClause = 'WHERE agentic_id = ? AND user_id = ?';
    const params = [agenticId, userId];

    if (status) {
      whereClause += ' AND status = ?';
      params.push(status);
    }

    if (sourceType) {
      whereClause += ' AND source_type = ?';
      params.push(sourceType);
    }

    const offset = (page - 1) * pageSize;

    const total = db.prepare(`
      SELECT COUNT(*) as count FROM agentic_learning_queue ${whereClause}
    `).get(...params);

    const items = db.prepare(`
      SELECT * FROM agentic_learning_queue ${whereClause}
      ORDER BY created_at DESC LIMIT ? OFFSET ?
    `).all(...params, pageSize, offset);

    return {
      items: items.map(this.transformQueueItem.bind(this)),
      total: total.count,
      page,
      pageSize,
    };
  }

  /**
   * Get items pending review
   */
  getPendingReview(agenticId, userId) {
    const db = this.getDb();

    const items = db.prepare(`
      SELECT * FROM agentic_learning_queue
      WHERE agentic_id = ? AND user_id = ? AND status = 'review'
      ORDER BY created_at ASC
    `).all(agenticId, userId);

    return items.map(this.transformQueueItem.bind(this));
  }

  /**
   * Approve a learning item
   */
  approveLearning(itemId, userId, notes = null) {
    const db = this.getDb();

    const item = db.prepare(`
      SELECT * FROM agentic_learning_queue WHERE id = ? AND user_id = ?
    `).get(itemId, userId);

    if (!item) {
      throw new Error('Learning item not found');
    }

    if (item.status !== 'review' && item.status !== 'pending') {
      throw new Error(`Cannot approve item with status: ${item.status}`);
    }

    db.prepare(`
      UPDATE agentic_learning_queue
      SET status = 'approved', reviewed_by = ?, reviewed_at = datetime('now'),
          review_notes = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(userId, notes, itemId);

    this.emit('learning:approved', { id: itemId, agenticId: item.agentic_id });

    return true;
  }

  /**
   * Reject a learning item
   */
  rejectLearning(itemId, userId, reason = null) {
    const db = this.getDb();

    const item = db.prepare(`
      SELECT * FROM agentic_learning_queue WHERE id = ? AND user_id = ?
    `).get(itemId, userId);

    if (!item) {
      throw new Error('Learning item not found');
    }

    db.prepare(`
      UPDATE agentic_learning_queue
      SET status = 'rejected', reviewed_by = ?, reviewed_at = datetime('now'),
          review_notes = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(userId, reason, itemId);

    // Update stats
    this.updateStats(item.agentic_id, item.user_id, item.source_type, 'rejected');

    this.emit('learning:rejected', { id: itemId, agenticId: item.agentic_id, reason });

    return true;
  }

  // =====================================================
  // LEARNING PROCESSOR
  // =====================================================

  /**
   * Process the learning queue
   */
  async processLearningQueue() {
    if (!this.isRunning) return;

    const db = this.getDb();

    // Get approved items ready for ingestion
    const items = db.prepare(`
      SELECT q.*, c.bound_library_id
      FROM agentic_learning_queue q
      LEFT JOIN agentic_self_learning_config c ON q.agentic_id = c.agentic_id
      WHERE q.status = 'approved'
      ORDER BY q.created_at ASC
      LIMIT 10
    `).all();

    for (const item of items) {
      try {
        await this.processLearningItem(item);
      } catch (error) {
        logger.error(`Failed to process learning ${item.id}: ${error.message}`);
        this.markFailed(item.id, error.message);
      }
    }
  }

  /**
   * Process a single learning item
   */
  async processLearningItem(item) {
    const db = this.getDb();

    // Update status to processing
    db.prepare(`
      UPDATE agentic_learning_queue SET status = 'processing', updated_at = datetime('now')
      WHERE id = ?
    `).run(item.id);

    // Check for duplicates using similarity
    const isDuplicate = await this.checkDuplicate(item);
    if (isDuplicate.duplicate) {
      db.prepare(`
        UPDATE agentic_learning_queue
        SET status = 'duplicate', similarity_score = ?, similar_chunk_id = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(isDuplicate.score, isDuplicate.chunkId, item.id);

      this.updateStats(item.agentic_id, item.user_id, item.source_type, 'duplicate');
      return;
    }

    // Extract facts/insights if SuperBrain available
    let extractedFacts = [];
    if (this.superBrain) {
      try {
        extractedFacts = await this.extractFacts(item.content);
      } catch (e) {
        logger.warn(`Failed to extract facts: ${e.message}`);
      }
    }

    // Ingest into knowledge base
    const chunkId = await this.ingestToKnowledge(item, extractedFacts);

    // Update status to ingested
    db.prepare(`
      UPDATE agentic_learning_queue
      SET status = 'ingested', knowledge_chunk_id = ?, extracted_facts = ?,
          ingested_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `).run(chunkId, JSON.stringify(extractedFacts), item.id);

    // Update stats
    this.updateStats(item.agentic_id, item.user_id, item.source_type, 'ingested');

    this.emit('learning:ingested', {
      id: item.id,
      agenticId: item.agentic_id,
      chunkId,
      sourceType: item.source_type,
    });

    logger.info(`Ingested learning ${item.id} as chunk ${chunkId}`);
  }

  /**
   * Check for duplicate content
   */
  async checkDuplicate(item) {
    // Simple text-based duplicate check
    // In production, use vector similarity search
    const db = this.getDb();

    const existingChunks = db.prepare(`
      SELECT id, content FROM agentic_learning_queue
      WHERE agentic_id = ? AND status = 'ingested' AND id != ?
      ORDER BY created_at DESC LIMIT 100
    `).all(item.agentic_id, item.id);

    for (const chunk of existingChunks) {
      const similarity = this.calculateSimilarity(item.content, chunk.content);
      if (similarity > 0.85) {
        return { duplicate: true, score: similarity, chunkId: chunk.id };
      }
    }

    return { duplicate: false };
  }

  /**
   * Calculate text similarity (simple Jaccard)
   */
  calculateSimilarity(text1, text2) {
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));

    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }

  /**
   * Extract facts using AI
   */
  async extractFacts(content) {
    if (!this.superBrain) return [];

    const result = await this.superBrain.process({
      task: 'Extract key facts and insights from this content. Return as JSON array of strings.',
      messages: [{ role: 'user', content }],
    });

    try {
      return JSON.parse(result.content);
    } catch {
      return [result.content];
    }
  }

  /**
   * Ingest content into knowledge base
   */
  async ingestToKnowledge(item, facts) {
    const db = this.getDb();

    // Create knowledge chunk
    const chunkId = crypto.randomUUID();
    const libraryId = item.bound_library_id || 'default';

    // Store in agentic memory as knowledge type
    db.prepare(`
      INSERT INTO agentic_memory (
        id, agentic_id, user_id, memory_type, title, content, summary,
        importance_score, tags, metadata, created_at, updated_at
      ) VALUES (?, ?, ?, 'knowledge', ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(
      chunkId,
      item.agentic_id,
      item.user_id,
      `Auto-learned from ${item.source_type}`,
      item.content,
      item.summary || facts.slice(0, 3).join('; '),
      7, // High importance for learned content
      JSON.stringify(['auto-learned', item.source_type]),
      JSON.stringify({
        sourceType: item.source_type,
        sourceId: item.source_id,
        learnedAt: new Date().toISOString(),
        facts,
        libraryId,
      })
    );

    return chunkId;
  }

  /**
   * Mark item as failed
   */
  markFailed(itemId, errorMessage) {
    const db = this.getDb();

    const item = db.prepare('SELECT * FROM agentic_learning_queue WHERE id = ?').get(itemId);

    db.prepare(`
      UPDATE agentic_learning_queue
      SET status = 'failed', error_message = ?, retry_count = retry_count + 1, updated_at = datetime('now')
      WHERE id = ?
    `).run(errorMessage, itemId);

    if (item) {
      this.updateStats(item.agentic_id, item.user_id, item.source_type, 'failed');
    }
  }

  // =====================================================
  // STATS & UTILITIES
  // =====================================================

  /**
   * Update learning statistics
   */
  updateStats(agenticId, userId, sourceType, status) {
    const db = this.getDb();
    const date = new Date().toISOString().split('T')[0];

    // Upsert stats
    const existing = db.prepare(`
      SELECT id FROM agentic_learning_stats WHERE agentic_id = ? AND date = ?
    `).get(agenticId, date);

    if (existing) {
      const column = `${status}_count`;
      const sourceColumn = `${sourceType}_count`;

      db.prepare(`
        UPDATE agentic_learning_stats
        SET ${column} = ${column} + 1, ${sourceColumn} = ${sourceColumn} + 1, updated_at = datetime('now')
        WHERE id = ?
      `).run(existing.id);
    } else {
      const id = crypto.randomUUID();
      db.prepare(`
        INSERT INTO agentic_learning_stats (id, agentic_id, user_id, date, ${status}_count, ${sourceType}_count)
        VALUES (?, ?, ?, ?, 1, 1)
      `).run(id, agenticId, userId, date);
    }
  }

  /**
   * Get learning statistics
   */
  getStats(agenticId, userId, days = 7) {
    const db = this.getDb();

    const stats = db.prepare(`
      SELECT * FROM agentic_learning_stats
      WHERE agentic_id = ? AND user_id = ? AND date >= date('now', '-' || ? || ' days')
      ORDER BY date DESC
    `).all(agenticId, userId, days);

    // Aggregate
    const totals = stats.reduce((acc, s) => ({
      pending: acc.pending + s.pending_count,
      processed: acc.processed + s.processed_count,
      ingested: acc.ingested + s.ingested_count,
      rejected: acc.rejected + s.rejected_count,
      duplicate: acc.duplicate + s.duplicate_count,
      failed: acc.failed + s.failed_count,
      bySource: {
        conversations: acc.bySource.conversations + s.conversations_count,
        tasks: acc.bySource.tasks + s.tasks_count,
        emails: acc.bySource.emails + s.emails_count,
        feedback: acc.bySource.feedback + s.feedback_count,
        escalations: acc.bySource.escalations + s.escalations_count,
        patterns: acc.bySource.patterns + s.patterns_count,
      }
    }), {
      pending: 0, processed: 0, ingested: 0, rejected: 0, duplicate: 0, failed: 0,
      bySource: { conversations: 0, tasks: 0, emails: 0, feedback: 0, escalations: 0, patterns: 0 }
    });

    return {
      totals,
      daily: stats.map(s => ({
        date: s.date,
        pending: s.pending_count,
        ingested: s.ingested_count,
        rejected: s.rejected_count,
      })),
    };
  }

  /**
   * Check rate limit
   */
  checkRateLimit(agenticId, maxPerHour) {
    const db = this.getDb();

    const count = db.prepare(`
      SELECT COUNT(*) as count FROM agentic_learning_queue
      WHERE agentic_id = ? AND created_at >= datetime('now', '-1 hour')
    `).get(agenticId);

    return (count?.count || 0) < maxPerHour;
  }

  /**
   * Check cooldown
   */
  isInCooldown(key, cooldownMinutes) {
    const lastTime = this.learningCooldowns.get(key);
    if (!lastTime) return false;

    const elapsedMinutes = (Date.now() - lastTime) / 60000;
    return elapsedMinutes < cooldownMinutes;
  }

  /**
   * Set cooldown
   */
  setCooldown(key) {
    this.learningCooldowns.set(key, Date.now());
  }

  /**
   * Transform config for API response
   */
  transformConfig(row) {
    return {
      id: row.id,
      agenticId: row.agentic_id,
      enabled: !!row.enabled,
      maxAutoLearnsPerHour: row.max_auto_learns_per_hour,
      cooldownMinutes: row.cooldown_minutes,
      chunkSize: row.chunk_size,
      minContentLength: row.min_content_length,
      maxContentLength: row.max_content_length,
      humanReviewThreshold: row.human_review_threshold,
      autoApproveThreshold: row.auto_approve_threshold,
      enabledSources: this.safeJsonParse(row.enabled_sources, []),
      boundLibraryId: row.bound_library_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Transform queue item for API response
   */
  transformQueueItem(row) {
    return {
      id: row.id,
      agenticId: row.agentic_id,
      sourceType: row.source_type,
      sourceId: row.source_id,
      sourceContext: this.safeJsonParse(row.source_context, {}),
      content: row.content,
      summary: row.summary,
      extractedFacts: this.safeJsonParse(row.extracted_facts, []),
      confidence: row.confidence,
      status: row.status,
      reviewedBy: row.reviewed_by,
      reviewedAt: row.reviewed_at,
      reviewNotes: row.review_notes,
      knowledgeChunkId: row.knowledge_chunk_id,
      ingestedAt: row.ingested_at,
      similarityScore: row.similarity_score,
      similarChunkId: row.similar_chunk_id,
      errorMessage: row.error_message,
      retryCount: row.retry_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Safely parse JSON
   */
  safeJsonParse(str, defaultValue) {
    if (!str) return defaultValue;
    try {
      return JSON.parse(str);
    } catch {
      return defaultValue;
    }
  }
}

// Singleton
let _instance = null;

function getSelfLearningService() {
  if (!_instance) {
    _instance = new SelfLearningService();
  }
  return _instance;
}

module.exports = {
  SelfLearningService,
  getSelfLearningService,
  LearnSource,
  LearnStatus,
};
