/**
 * AI-to-AI Communication Service
 * ===============================
 * Enables communication between agentic profiles (AI agents).
 *
 * Features:
 * - Direct messaging between agents
 * - Task delegation from parent to child agents
 * - Context sharing and handoffs
 * - Collaborative task coordination
 * - Message acknowledgment and response tracking
 *
 * Message Types:
 * - task_delegation: Parent assigns task to child agent
 * - task_update: Progress/status update on delegated task
 * - context_share: Share context/memory with another agent
 * - request: Ask another agent for information/action
 * - response: Reply to a request
 * - notification: General notification to another agent
 * - handoff: Transfer conversation/task to another agent
 * - coordination: Collaborative task coordination
 */

const EventEmitter = require('events');
const crypto = require('crypto');
const { getDatabase } = require('../database.cjs');
const { logger } = require('../logger.cjs');

/**
 * Message types for AI-to-AI communication
 */
const MessageType = {
  TASK_DELEGATION: 'task_delegation',
  TASK_UPDATE: 'task_update',
  CONTEXT_SHARE: 'context_share',
  REQUEST: 'request',
  RESPONSE: 'response',
  NOTIFICATION: 'notification',
  HANDOFF: 'handoff',
  COORDINATION: 'coordination',
};

/**
 * Message priority levels
 */
const Priority = {
  LOW: 'low',
  NORMAL: 'normal',
  HIGH: 'high',
  URGENT: 'urgent',
};

/**
 * Message status
 */
const MessageStatus = {
  PENDING: 'pending',
  DELIVERED: 'delivered',
  READ: 'read',
  ACKNOWLEDGED: 'acknowledged',
  RESPONDED: 'responded',
  FAILED: 'failed',
  EXPIRED: 'expired',
};

class AIToCommunication extends EventEmitter {
  constructor() {
    super();
    this.db = null;
    this.superBrain = null;
    this.agenticService = null;
  }

  /**
   * Get database instance
   */
  getDb() {
    if (!this.db) {
      this.db = getDatabase();
      this.ensureMessageTables();
    }
    return this.db;
  }

  /**
   * Ensure AI-to-AI message tables exist
   */
  ensureMessageTables() {
    const db = this.db;
    try {
      // Check if agentic_messages exists with old schema (from_agentic_id instead of sender_id)
      const tableInfo = db.prepare("PRAGMA table_info('agentic_messages')").all();
      const hasOldSchema = tableInfo.length > 0 && tableInfo.some(c => c.name === 'from_agentic_id');
      const hasNewSchema = tableInfo.length > 0 && tableInfo.some(c => c.name === 'sender_id');

      if (hasOldSchema && !hasNewSchema) {
        // Migrate: rename old table, create new, migrate data
        logger.info('Migrating agentic_messages from old schema (from_agentic_id) to new (sender_id)...');

        // Drop old indexes that reference old columns
        db.exec(`
          DROP INDEX IF EXISTS idx_agentic_messages_from;
          DROP INDEX IF EXISTS idx_agentic_messages_to;
          DROP INDEX IF EXISTS idx_agentic_messages_type;
          DROP INDEX IF EXISTS idx_agentic_messages_status;
        `);

        db.exec(`ALTER TABLE agentic_messages RENAME TO agentic_messages_old`);

        // Create new table
        this._createMessagesTable(db);

        // Migrate existing data (map old columns to new)
        const oldCount = db.prepare('SELECT COUNT(*) as cnt FROM agentic_messages_old').get();
        if (oldCount.cnt > 0) {
          db.exec(`
            INSERT INTO agentic_messages (
              id, user_id, sender_id, receiver_id, message_type, subject, content,
              metadata, reply_to_id, status, created_at, updated_at
            )
            SELECT
              id, user_id, from_agentic_id, to_agentic_id,
              CASE message_type
                WHEN 'status_update' THEN 'notification'
                WHEN 'escalation' THEN 'notification'
                ELSE message_type
              END,
              subject, content, context, reply_to_id,
              CASE status
                WHEN 'processing' THEN 'read'
                WHEN 'completed' THEN 'responded'
                ELSE status
              END,
              created_at, COALESCE(processed_at, created_at)
            FROM agentic_messages_old
          `);
          logger.info(`Migrated ${oldCount.cnt} messages from old schema`);
        }

        db.exec(`DROP TABLE agentic_messages_old`);
        logger.info('Old agentic_messages_old table dropped after migration');
      } else if (!hasNewSchema && tableInfo.length === 0) {
        // Fresh install - create new table
        this._createMessagesTable(db);
      }

      // Create threads table
      this._createThreadsTable(db);

      logger.info('Ensured AI-to-AI message tables exist');
    } catch (error) {
      logger.error(`Failed to create AI-to-AI message tables: ${error.message}`);
    }
  }

  /**
   * Create the agentic_messages table with current schema
   */
  _createMessagesTable(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS agentic_messages (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,

        -- Sender/Receiver (agentic profiles)
        sender_id TEXT NOT NULL,
        receiver_id TEXT NOT NULL,

        -- Message details
        message_type TEXT NOT NULL
          CHECK(message_type IN ('task_delegation', 'task_update', 'context_share',
                                 'request', 'response', 'notification', 'handoff', 'coordination')),
        subject TEXT,
        content TEXT NOT NULL,
        metadata TEXT DEFAULT '{}',

        -- Reference to another message (for responses/updates)
        reply_to_id TEXT,
        thread_id TEXT,

        -- Priority and status
        priority TEXT DEFAULT 'normal'
          CHECK(priority IN ('low', 'normal', 'high', 'urgent')),
        status TEXT DEFAULT 'pending'
          CHECK(status IN ('pending', 'delivered', 'read', 'acknowledged', 'responded', 'failed', 'expired')),

        -- Acknowledgment
        acknowledged_at TEXT,
        responded_at TEXT,

        -- Task delegation specific
        task_id TEXT,
        deadline_at TEXT,

        -- Expiry
        expires_at TEXT,

        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),

        FOREIGN KEY (sender_id) REFERENCES agentic_profiles(id) ON DELETE CASCADE,
        FOREIGN KEY (receiver_id) REFERENCES agentic_profiles(id) ON DELETE CASCADE,
        FOREIGN KEY (reply_to_id) REFERENCES agentic_messages(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_ai_msg_sender ON agentic_messages(sender_id);
      CREATE INDEX IF NOT EXISTS idx_ai_msg_receiver ON agentic_messages(receiver_id);
      CREATE INDEX IF NOT EXISTS idx_ai_msg_thread ON agentic_messages(thread_id);
      CREATE INDEX IF NOT EXISTS idx_ai_msg_status ON agentic_messages(status);
      CREATE INDEX IF NOT EXISTS idx_ai_msg_created ON agentic_messages(created_at DESC);
    `);
  }

  /**
   * Create the agentic_threads table
   */
  _createThreadsTable(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS agentic_threads (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,

        -- Participants (agentic profile IDs, JSON array)
        participants TEXT NOT NULL,

        -- Thread details
        subject TEXT,
        thread_type TEXT DEFAULT 'general'
          CHECK(thread_type IN ('general', 'task', 'coordination', 'handoff')),

        -- Associated task/context
        task_id TEXT,
        context TEXT DEFAULT '{}',

        -- Status
        is_active INTEGER DEFAULT 1,
        last_message_at TEXT,
        message_count INTEGER DEFAULT 0,

        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_ai_thread_user ON agentic_threads(user_id);
      CREATE INDEX IF NOT EXISTS idx_ai_thread_active ON agentic_threads(is_active, last_message_at DESC);
    `);
  }

  /**
   * Initialize with dependencies
   */
  initialize(options = {}) {
    this.getDb();

    if (options.superBrain) {
      this.superBrain = options.superBrain;
    }

    if (options.agenticService) {
      this.agenticService = options.agenticService;
    }

    logger.info('AIToCommunication initialized');
  }

  // =====================================================
  // SEND MESSAGES
  // =====================================================

  /**
   * Send a message from one agentic profile to another
   */
  async sendMessage(options) {
    const db = this.getDb();
    const {
      senderId,
      receiverId,
      userId,
      messageType,
      subject,
      content,
      metadata = {},
      priority = Priority.NORMAL,
      replyToId = null,
      threadId = null,
      taskId = null,
      deadlineAt = null,
      expiresAt = null,
    } = options;

    // Validate sender and receiver exist and belong to same user
    const sender = db.prepare(`
      SELECT id, name, user_id FROM agentic_profiles WHERE id = ? AND user_id = ?
    `).get(senderId, userId);

    const receiver = db.prepare(`
      SELECT id, name, user_id FROM agentic_profiles WHERE id = ? AND user_id = ?
    `).get(receiverId, userId);

    if (!sender) {
      throw new Error('Sender profile not found or access denied');
    }

    if (!receiver) {
      throw new Error('Receiver profile not found or access denied');
    }

    const messageId = crypto.randomUUID();
    let resolvedThreadId = threadId;

    // Create or get thread if needed
    if (!resolvedThreadId && messageType !== MessageType.NOTIFICATION) {
      resolvedThreadId = this.getOrCreateThread(userId, [senderId, receiverId], {
        subject,
        threadType: this.getThreadTypeFromMessageType(messageType),
        taskId,
      });
    }

    try {
      db.prepare(`
        INSERT INTO agentic_messages (
          id, user_id, sender_id, receiver_id, message_type, subject, content,
          metadata, reply_to_id, thread_id, priority, status, task_id,
          deadline_at, expires_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, datetime('now'), datetime('now'))
      `).run(
        messageId,
        userId,
        senderId,
        receiverId,
        messageType,
        subject || null,
        content,
        JSON.stringify(metadata),
        replyToId,
        resolvedThreadId,
        priority,
        taskId || null,
        deadlineAt || null,
        expiresAt || null
      );

      // Update thread
      if (resolvedThreadId) {
        db.prepare(`
          UPDATE agentic_threads
          SET last_message_at = datetime('now'), message_count = message_count + 1, updated_at = datetime('now')
          WHERE id = ?
        `).run(resolvedThreadId);
      }

      // Mark as delivered immediately (within same system)
      db.prepare(`
        UPDATE agentic_messages SET status = 'delivered', updated_at = datetime('now') WHERE id = ?
      `).run(messageId);

      // Emit event
      this.emit('message:sent', {
        id: messageId,
        senderId,
        senderName: sender.name,
        receiverId,
        receiverName: receiver.name,
        messageType,
        subject,
        threadId: resolvedThreadId,
        timestamp: new Date().toISOString(),
      });

      logger.info(`AI-to-AI message sent: ${sender.name} -> ${receiver.name} (${messageType})`);

      return {
        id: messageId,
        threadId: resolvedThreadId,
        status: 'delivered',
        sender: { id: senderId, name: sender.name },
        receiver: { id: receiverId, name: receiver.name },
      };
    } catch (error) {
      logger.error(`Failed to send AI-to-AI message: ${error.message}`);
      throw error;
    }
  }

  /**
   * Delegate a task from parent to child agent
   */
  async delegateTask(options) {
    const db = this.getDb();
    const {
      parentId,
      childId,
      userId,
      taskTitle,
      taskDescription,
      taskPriority = 'normal',
      deadline = null,
      context = {},
    } = options;

    // Verify hierarchy relationship
    const child = db.prepare(`
      SELECT id, name, parent_agentic_id FROM agentic_profiles
      WHERE id = ? AND user_id = ? AND parent_agentic_id = ?
    `).get(childId, userId, parentId);

    if (!child) {
      throw new Error('Child agent not found or not a child of the specified parent');
    }

    // Create task
    const taskId = crypto.randomUUID();
    db.prepare(`
      INSERT INTO agentic_tasks (
        id, agentic_id, user_id, title, description, task_type, source_type,
        status, priority, due_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'delegated', 'parent_agent', 'assigned', ?, ?, datetime('now'), datetime('now'))
    `).run(
      taskId,
      childId,
      userId,
      taskTitle,
      taskDescription || null,
      taskPriority,
      deadline || null
    );

    // Send delegation message
    const message = await this.sendMessage({
      senderId: parentId,
      receiverId: childId,
      userId,
      messageType: MessageType.TASK_DELEGATION,
      subject: `Task Assigned: ${taskTitle}`,
      content: taskDescription || taskTitle,
      metadata: {
        taskId,
        taskTitle,
        taskPriority,
        context,
      },
      priority: taskPriority === 'urgent' ? Priority.URGENT : Priority.HIGH,
      taskId,
      deadlineAt: deadline,
    });

    this.emit('task:delegated', {
      taskId,
      parentId,
      childId,
      taskTitle,
      messageId: message.id,
    });

    return {
      taskId,
      messageId: message.id,
      threadId: message.threadId,
      childAgent: { id: childId, name: child.name },
    };
  }

  /**
   * Send task progress update
   */
  async sendTaskUpdate(options) {
    const {
      agenticId,
      taskId,
      userId,
      progress,
      status,
      notes,
      targetId = null, // If null, send to task creator
    } = options;

    const db = this.getDb();

    // Get task
    const task = db.prepare(`
      SELECT * FROM agentic_tasks WHERE id = ? AND user_id = ?
    `).get(taskId, userId);

    if (!task) {
      throw new Error('Task not found');
    }

    // Determine receiver (parent agent if delegated)
    let receiverId = targetId;
    if (!receiverId) {
      const profile = db.prepare(`
        SELECT parent_agentic_id FROM agentic_profiles WHERE id = ?
      `).get(agenticId);
      receiverId = profile?.parent_agentic_id;
    }

    if (!receiverId) {
      throw new Error('No target for task update');
    }

    // Update task progress
    db.prepare(`
      UPDATE agentic_tasks SET progress = ?, status = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(progress || 0, status || task.status, taskId);

    // Send update message
    return this.sendMessage({
      senderId: agenticId,
      receiverId,
      userId,
      messageType: MessageType.TASK_UPDATE,
      subject: `Task Update: ${task.title}`,
      content: notes || `Progress: ${progress}%, Status: ${status}`,
      metadata: {
        taskId,
        progress,
        status,
        previousStatus: task.status,
      },
      priority: status === 'completed' ? Priority.HIGH : Priority.NORMAL,
      taskId,
    });
  }

  /**
   * Share context/memory between agents
   */
  async shareContext(options) {
    const {
      senderId,
      receiverId,
      userId,
      contextType, // 'memory', 'conversation', 'knowledge', 'custom'
      contextData,
      reason,
    } = options;

    return this.sendMessage({
      senderId,
      receiverId,
      userId,
      messageType: MessageType.CONTEXT_SHARE,
      subject: `Context Share: ${contextType}`,
      content: reason || `Sharing ${contextType} context`,
      metadata: {
        contextType,
        contextData,
      },
      priority: Priority.NORMAL,
    });
  }

  /**
   * Request information or action from another agent
   */
  async sendRequest(options) {
    const {
      senderId,
      receiverId,
      userId,
      requestType,
      requestContent,
      requiresResponse = true,
      deadline = null,
    } = options;

    return this.sendMessage({
      senderId,
      receiverId,
      userId,
      messageType: MessageType.REQUEST,
      subject: `Request: ${requestType}`,
      content: requestContent,
      metadata: {
        requestType,
        requiresResponse,
      },
      priority: deadline ? Priority.HIGH : Priority.NORMAL,
      deadlineAt: deadline,
    });
  }

  /**
   * Respond to a request or message
   */
  async sendResponse(options) {
    const {
      senderId,
      originalMessageId,
      userId,
      responseContent,
      metadata = {},
    } = options;

    const db = this.getDb();

    // Get original message
    const original = db.prepare(`
      SELECT * FROM agentic_messages WHERE id = ? AND user_id = ?
    `).get(originalMessageId, userId);

    if (!original) {
      throw new Error('Original message not found');
    }

    // Send response
    const response = await this.sendMessage({
      senderId,
      receiverId: original.sender_id,
      userId,
      messageType: MessageType.RESPONSE,
      subject: `Re: ${original.subject || original.message_type}`,
      content: responseContent,
      metadata: {
        ...metadata,
        originalMessageType: original.message_type,
        originalMessageId,
      },
      priority: original.priority,
      replyToId: originalMessageId,
      threadId: original.thread_id,
    });

    // Mark original as responded
    db.prepare(`
      UPDATE agentic_messages SET status = 'responded', responded_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `).run(originalMessageId);

    return response;
  }

  /**
   * Handoff conversation/task to another agent
   */
  async initiateHandoff(options) {
    const {
      sourceId,
      targetId,
      userId,
      conversationId,
      taskId,
      reason,
      summary,
      contextMessages = [],
    } = options;

    return this.sendMessage({
      senderId: sourceId,
      receiverId: targetId,
      userId,
      messageType: MessageType.HANDOFF,
      subject: `Handoff: ${conversationId ? 'Conversation' : 'Task'}`,
      content: reason || 'Handoff initiated',
      metadata: {
        conversationId,
        taskId,
        summary,
        contextMessages,
        handoffAt: new Date().toISOString(),
      },
      priority: Priority.HIGH,
      taskId,
    });
  }

  // =====================================================
  // READ MESSAGES
  // =====================================================

  /**
   * Get messages for an agentic profile
   */
  getMessages(agenticId, userId, options = {}) {
    const db = this.getDb();
    const {
      direction = 'all', // 'inbox', 'sent', 'all'
      messageType = null,
      status = null,
      threadId = null,
      page = 1,
      pageSize = 20,
    } = options;

    // Use m. prefix for all columns to avoid ambiguity in JOINs
    const conditions = ['m.user_id = ?'];
    const params = [userId];

    if (direction === 'inbox') {
      conditions.push('m.receiver_id = ?');
      params.push(agenticId);
    } else if (direction === 'sent') {
      conditions.push('m.sender_id = ?');
      params.push(agenticId);
    } else {
      conditions.push('(m.sender_id = ? OR m.receiver_id = ?)');
      params.push(agenticId, agenticId);
    }

    if (messageType) {
      conditions.push('m.message_type = ?');
      params.push(messageType);
    }

    if (status) {
      conditions.push('m.status = ?');
      params.push(status);
    }

    if (threadId) {
      conditions.push('m.thread_id = ?');
      params.push(threadId);
    }

    const whereClause = conditions.join(' AND ');
    const offset = (page - 1) * pageSize;

    // Get total
    const total = db.prepare(`
      SELECT COUNT(*) as count FROM agentic_messages m WHERE ${whereClause}
    `).get(...params);

    // Get messages with sender/receiver names
    const messages = db.prepare(`
      SELECT m.*,
        s.name as sender_name,
        r.name as receiver_name
      FROM agentic_messages m
      LEFT JOIN agentic_profiles s ON m.sender_id = s.id
      LEFT JOIN agentic_profiles r ON m.receiver_id = r.id
      WHERE ${whereClause}
      ORDER BY m.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, pageSize, offset);

    return {
      messages: messages.map(m => this.transformMessage(m)),
      total: total.count,
      page,
      pageSize,
      unread: direction === 'inbox' ? this.getUnreadCount(agenticId, userId) : 0,
    };
  }

  /**
   * Get unread message count
   */
  getUnreadCount(agenticId, userId) {
    const db = this.getDb();
    const result = db.prepare(`
      SELECT COUNT(*) as count FROM agentic_messages
      WHERE receiver_id = ? AND user_id = ? AND status IN ('pending', 'delivered')
    `).get(agenticId, userId);
    return result?.count || 0;
  }

  /**
   * Get a single message
   */
  getMessage(messageId, userId) {
    const db = this.getDb();
    const message = db.prepare(`
      SELECT m.*,
        s.name as sender_name,
        r.name as receiver_name
      FROM agentic_messages m
      LEFT JOIN agentic_profiles s ON m.sender_id = s.id
      LEFT JOIN agentic_profiles r ON m.receiver_id = r.id
      WHERE m.id = ? AND m.user_id = ?
    `).get(messageId, userId);

    return message ? this.transformMessage(message) : null;
  }

  /**
   * Mark message as read
   */
  markAsRead(messageId, agenticId, userId) {
    const db = this.getDb();
    const result = db.prepare(`
      UPDATE agentic_messages
      SET status = 'read', updated_at = datetime('now')
      WHERE id = ? AND receiver_id = ? AND user_id = ? AND status IN ('pending', 'delivered')
    `).run(messageId, agenticId, userId);

    return result.changes > 0;
  }

  /**
   * Acknowledge message
   */
  acknowledgeMessage(messageId, agenticId, userId) {
    const db = this.getDb();
    const result = db.prepare(`
      UPDATE agentic_messages
      SET status = 'acknowledged', acknowledged_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ? AND receiver_id = ? AND user_id = ? AND status IN ('pending', 'delivered', 'read')
    `).run(messageId, agenticId, userId);

    return result.changes > 0;
  }

  // =====================================================
  // THREADS
  // =====================================================

  /**
   * Get or create a thread between participants
   */
  getOrCreateThread(userId, participantIds, options = {}) {
    const db = this.getDb();
    const sortedParticipants = [...participantIds].sort().join(',');

    // Check for existing thread
    const existing = db.prepare(`
      SELECT id FROM agentic_threads
      WHERE user_id = ? AND participants = ? AND is_active = 1
      ${options.taskId ? 'AND task_id = ?' : ''}
    `).get(userId, JSON.stringify(sortedParticipants.split(',')), ...(options.taskId ? [options.taskId] : []));

    if (existing) {
      return existing.id;
    }

    // Create new thread
    const threadId = crypto.randomUUID();
    db.prepare(`
      INSERT INTO agentic_threads (
        id, user_id, participants, subject, thread_type, task_id, context,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(
      threadId,
      userId,
      JSON.stringify(sortedParticipants.split(',')),
      options.subject || null,
      options.threadType || 'general',
      options.taskId || null,
      JSON.stringify(options.context || {})
    );

    return threadId;
  }

  /**
   * Get threads for an agentic profile
   */
  getThreads(agenticId, userId, options = {}) {
    const db = this.getDb();
    const { page = 1, pageSize = 20, activeOnly = true } = options;
    const offset = (page - 1) * pageSize;

    let whereClause = `user_id = ? AND participants LIKE ?`;
    const params = [userId, `%${agenticId}%`];

    if (activeOnly) {
      whereClause += ' AND is_active = 1';
    }

    const total = db.prepare(`
      SELECT COUNT(*) as count FROM agentic_threads WHERE ${whereClause}
    `).get(...params);

    const threads = db.prepare(`
      SELECT * FROM agentic_threads
      WHERE ${whereClause}
      ORDER BY last_message_at DESC NULLS LAST, created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, pageSize, offset);

    return {
      threads: threads.map(t => this.transformThread(t)),
      total: total.count,
      page,
      pageSize,
    };
  }

  // =====================================================
  // HELPERS
  // =====================================================

  getThreadTypeFromMessageType(messageType) {
    switch (messageType) {
      case MessageType.TASK_DELEGATION:
      case MessageType.TASK_UPDATE:
        return 'task';
      case MessageType.HANDOFF:
        return 'handoff';
      case MessageType.COORDINATION:
        return 'coordination';
      default:
        return 'general';
    }
  }

  transformMessage(row) {
    return {
      id: row.id,
      userId: row.user_id,
      senderId: row.sender_id,
      senderName: row.sender_name,
      receiverId: row.receiver_id,
      receiverName: row.receiver_name,
      messageType: row.message_type,
      subject: row.subject,
      content: row.content,
      metadata: this.safeJsonParse(row.metadata, {}),
      replyToId: row.reply_to_id,
      threadId: row.thread_id,
      priority: row.priority,
      status: row.status,
      acknowledgedAt: row.acknowledged_at,
      respondedAt: row.responded_at,
      taskId: row.task_id,
      deadlineAt: row.deadline_at,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  transformThread(row) {
    return {
      id: row.id,
      userId: row.user_id,
      participants: this.safeJsonParse(row.participants, []),
      subject: row.subject,
      threadType: row.thread_type,
      taskId: row.task_id,
      context: this.safeJsonParse(row.context, {}),
      isActive: !!row.is_active,
      lastMessageAt: row.last_message_at,
      messageCount: row.message_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

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

function getAIToCommunication() {
  if (!_instance) {
    _instance = new AIToCommunication();
  }
  return _instance;
}

module.exports = {
  AIToCommunication,
  getAIToCommunication,
  MessageType,
  Priority,
  MessageStatus,
};
