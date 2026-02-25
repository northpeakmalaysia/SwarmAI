/**
 * Email Coordination Service
 *
 * Coordinates email handling across agents in the swarm.
 * Supports:
 * - Email task assignment to agents
 * - Email handoffs between agents
 * - Finding email-capable agents
 * - Tracking email processing status
 *
 * Integrates with:
 * - AgentDiscoveryService for finding capable agents
 * - HandoffService for email conversation handoffs
 * - EmailClient for email operations
 */

const { v4: uuidv4 } = require('uuid');
const { EventEmitter } = require('events');
const { getDatabase } = require('../database.cjs');
const { logger } = require('../logger.cjs');
const { getAgentDiscoveryService } = require('./AgentDiscoveryService.cjs');
const { getHandoffService } = require('./HandoffService.cjs');

class EmailCoordinationService extends EventEmitter {
  constructor() {
    super();
    this.activeEmailTasks = new Map();
    this.initialized = false;

    // Ensure table exists
    this.ensureTable();
  }

  /**
   * Ensure email_coordination table exists
   */
  ensureTable() {
    const db = getDatabase();
    db.exec(`
      CREATE TABLE IF NOT EXISTS email_coordination (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        email_id TEXT NOT NULL,
        email_external_id TEXT,
        platform_account_id TEXT,
        assigned_agent_id TEXT,
        conversation_id TEXT,
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'assigned', 'processing', 'responded', 'handoff', 'completed', 'failed')),
        priority TEXT DEFAULT 'normal' CHECK(priority IN ('low', 'normal', 'high', 'urgent')),
        metadata TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (assigned_agent_id) REFERENCES agents(id)
      );
      CREATE INDEX IF NOT EXISTS idx_email_coord_user ON email_coordination(user_id);
      CREATE INDEX IF NOT EXISTS idx_email_coord_agent ON email_coordination(assigned_agent_id);
      CREATE INDEX IF NOT EXISTS idx_email_coord_status ON email_coordination(status);
      CREATE INDEX IF NOT EXISTS idx_email_coord_email ON email_coordination(email_id);
    `);
    this.initialized = true;
  }

  /**
   * Create an email coordination task
   * @param {Object} options - Task options
   * @returns {Promise<Object>} Created task
   */
  async createEmailTask(options) {
    const {
      userId,
      emailId,
      emailExternalId,
      platformAccountId,
      conversationId,
      priority = 'normal',
      agentId,
      autoAssign = true,
      metadata = {},
    } = options;

    const db = getDatabase();
    const id = uuidv4();

    let assignedAgentId = agentId;

    // Auto-assign to email-capable agent if requested
    if (autoAssign && !assignedAgentId) {
      const agents = await this.getEmailCapableAgents(userId);
      if (agents.length > 0) {
        // Pick agent with highest reputation that is idle
        const idleAgents = agents.filter((a) => a.status === 'idle');
        assignedAgentId = idleAgents.length > 0 ? idleAgents[0].id : agents[0].id;
      }
    }

    const status = assignedAgentId ? 'assigned' : 'pending';

    db.prepare(`
      INSERT INTO email_coordination (
        id, user_id, email_id, email_external_id, platform_account_id,
        assigned_agent_id, conversation_id, status, priority, metadata,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(
      id,
      userId,
      emailId,
      emailExternalId || null,
      platformAccountId || null,
      assignedAgentId || null,
      conversationId || null,
      status,
      priority,
      JSON.stringify(metadata)
    );

    const task = {
      id,
      userId,
      emailId,
      emailExternalId,
      platformAccountId,
      assignedAgentId,
      conversationId,
      status,
      priority,
      metadata,
      createdAt: new Date().toISOString(),
    };

    // Store in memory for quick access
    this.activeEmailTasks.set(id, task);

    // Emit event
    this.emit('task_created', task);

    // Broadcast via WebSocket
    if (global.wsBroadcast) {
      global.wsBroadcast('swarm:email_task_created', {
        taskId: id,
        emailId,
        assignedAgentId,
        status,
        priority,
      });
    }

    logger.info(`EmailCoordination: Created task ${id} for email ${emailId}`);
    return task;
  }

  /**
   * Assign email to a specific agent
   * @param {Object} options - Assignment options
   * @returns {Promise<Object>} Updated task
   */
  async assignEmailToAgent(options) {
    const { taskId, emailId, agentId, userId } = options;

    const db = getDatabase();

    // Find task by ID or emailId
    let task;
    if (taskId) {
      task = db
        .prepare('SELECT * FROM email_coordination WHERE id = ? AND user_id = ?')
        .get(taskId, userId);
    } else if (emailId) {
      task = db
        .prepare('SELECT * FROM email_coordination WHERE email_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 1')
        .get(emailId, userId);
    }

    if (!task) {
      throw new Error('Email task not found');
    }

    // Verify agent exists and belongs to user
    const agent = db
      .prepare('SELECT id, name, status FROM agents WHERE id = ? AND user_id = ?')
      .get(agentId, userId);

    if (!agent) {
      throw new Error('Agent not found');
    }

    // Update task
    db.prepare(`
      UPDATE email_coordination
      SET assigned_agent_id = ?, status = 'assigned', updated_at = datetime('now')
      WHERE id = ?
    `).run(agentId, task.id);

    // Update agent status to busy
    const discovery = getAgentDiscoveryService();
    await discovery.updateAgentStatus(agentId, 'busy');

    const updatedTask = {
      ...task,
      assignedAgentId: agentId,
      status: 'assigned',
      updatedAt: new Date().toISOString(),
    };

    // Update memory cache
    this.activeEmailTasks.set(task.id, updatedTask);

    // Emit event
    this.emit('task_assigned', { task: updatedTask, agent });

    // Broadcast via WebSocket
    if (global.wsBroadcast) {
      global.wsBroadcast('swarm:email_assigned', {
        taskId: task.id,
        emailId: task.email_id,
        agentId,
        agentName: agent.name,
      });
    }

    logger.info(`EmailCoordination: Assigned email ${task.email_id} to agent ${agent.name}`);
    return updatedTask;
  }

  /**
   * Request handoff of email between agents
   * @param {Object} options - Handoff options
   * @returns {Promise<Object>} Handoff result
   */
  async requestEmailHandoff(options) {
    const {
      taskId,
      emailId,
      fromAgentId,
      toAgentId,
      userId,
      reason,
      context,
      autoAccept = false,
    } = options;

    const db = getDatabase();

    // Find task
    let task;
    if (taskId) {
      task = db
        .prepare('SELECT * FROM email_coordination WHERE id = ? AND user_id = ?')
        .get(taskId, userId);
    } else if (emailId) {
      task = db
        .prepare('SELECT * FROM email_coordination WHERE email_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 1')
        .get(emailId, userId);
    }

    if (!task) {
      throw new Error('Email task not found');
    }

    // Verify agents
    const fromAgent = db.prepare('SELECT id, name FROM agents WHERE id = ?').get(fromAgentId);
    const toAgent = db.prepare('SELECT id, name FROM agents WHERE id = ?').get(toAgentId);

    if (!fromAgent || !toAgent) {
      throw new Error('Invalid agent(s)');
    }

    // Use HandoffService for the handoff
    const handoffService = getHandoffService();
    const handoff = await handoffService.createHandoff({
      userId,
      conversationId: task.conversation_id,
      fromAgentId,
      toAgentId,
      reason: reason || 'Email handoff requested',
      context: context || { emailId: task.email_id, taskId: task.id },
      autoAccept,
    });

    // Update task status
    db.prepare(`
      UPDATE email_coordination
      SET status = 'handoff', assigned_agent_id = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(autoAccept ? toAgentId : fromAgentId, task.id);

    // Emit event
    this.emit('handoff_requested', { task, handoff, fromAgent, toAgent });

    // Broadcast via WebSocket
    if (global.wsBroadcast) {
      global.wsBroadcast('swarm:email_handoff', {
        taskId: task.id,
        emailId: task.email_id,
        fromAgentId,
        fromAgentName: fromAgent.name,
        toAgentId,
        toAgentName: toAgent.name,
        reason,
        handoffId: handoff.id,
        autoAccepted: autoAccept,
      });
    }

    logger.info(`EmailCoordination: Handoff requested from ${fromAgent.name} to ${toAgent.name}`);
    return { task, handoff };
  }

  /**
   * Get agents capable of handling email
   * @param {string} userId - User ID
   * @param {Object} options - Filter options
   * @returns {Promise<Array>} Email-capable agents
   */
  async getEmailCapableAgents(userId, options = {}) {
    const { status, limit = 50 } = options;

    const db = getDatabase();
    const discovery = getAgentDiscoveryService();

    // Get all agents for user
    const agents = await discovery.getAgents(userId, { limit });

    // Filter for email-capable agents
    const emailCapable = agents.filter((agent) => {
      // Check if agent has email-related skills
      const skills = this.extractSkills(agent);
      const hasEmailSkill = skills.some((skill) =>
        ['email', 'mail', 'communication', 'messaging', 'inbox'].some((keyword) =>
          skill.toLowerCase().includes(keyword)
        )
      );

      // Check if agent has email platform account
      const hasEmailAccount = db
        .prepare(
          `SELECT 1 FROM platform_accounts
           WHERE agent_id = ? AND platform = 'email' AND status = 'connected'`
        )
        .get(agent.id);

      // Agent is email-capable if has skill OR has email account
      return hasEmailSkill || hasEmailAccount;
    });

    // Filter by status if specified
    if (status) {
      return emailCapable.filter((a) => a.status === status);
    }

    return emailCapable;
  }

  /**
   * Extract skills from agent
   * @param {Object} agent - Agent object
   * @returns {Array<string>} Skills array
   */
  extractSkills(agent) {
    let skills = [];

    // Parse skills JSON if string
    if (typeof agent.skills === 'string') {
      try {
        skills = JSON.parse(agent.skills) || [];
      } catch {
        skills = [];
      }
    } else if (Array.isArray(agent.skills)) {
      skills = agent.skills;
    }

    // Extract from description
    const description = agent.description || '';
    const descriptionSkills = description.match(/\b(email|mail|support|customer|communication)\b/gi) || [];

    return [...new Set([...skills, ...descriptionSkills])];
  }

  /**
   * Update email task status
   * @param {Object} options - Update options
   * @returns {Promise<Object>} Updated task
   */
  async updateTaskStatus(options) {
    const { taskId, status, result, userId } = options;

    const db = getDatabase();

    const task = db
      .prepare('SELECT * FROM email_coordination WHERE id = ? AND user_id = ?')
      .get(taskId, userId);

    if (!task) {
      throw new Error('Email task not found');
    }

    const metadata = task.metadata ? JSON.parse(task.metadata) : {};
    if (result) {
      metadata.result = result;
    }

    db.prepare(`
      UPDATE email_coordination
      SET status = ?, metadata = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(status, JSON.stringify(metadata), taskId);

    const updatedTask = {
      ...task,
      status,
      metadata,
      updatedAt: new Date().toISOString(),
    };

    // Update memory cache
    this.activeEmailTasks.set(taskId, updatedTask);

    // Update agent status if task completed/failed
    if (['completed', 'failed'].includes(status) && task.assigned_agent_id) {
      const discovery = getAgentDiscoveryService();
      await discovery.updateAgentStatus(task.assigned_agent_id, 'idle');

      // Update reputation
      if (status === 'completed') {
        await discovery.updateReputation(task.assigned_agent_id, 3); // +3 for email handled
      } else if (status === 'failed') {
        await discovery.updateReputation(task.assigned_agent_id, -2); // -2 for failure
      }
    }

    // Emit event
    this.emit('task_updated', updatedTask);

    // Broadcast via WebSocket
    if (global.wsBroadcast) {
      global.wsBroadcast('swarm:email_task_update', {
        taskId,
        emailId: task.email_id,
        status,
        result,
      });
    }

    logger.info(`EmailCoordination: Task ${taskId} status updated to ${status}`);
    return updatedTask;
  }

  /**
   * Get email tasks
   * @param {string} userId - User ID
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Tasks with pagination
   */
  async getEmailTasks(userId, options = {}) {
    const { status, agentId, priority, limit = 50, offset = 0 } = options;

    const db = getDatabase();
    const conditions = ['user_id = ?'];
    const params = [userId];

    if (status) {
      conditions.push('status = ?');
      params.push(status);
    }

    if (agentId) {
      conditions.push('assigned_agent_id = ?');
      params.push(agentId);
    }

    if (priority) {
      conditions.push('priority = ?');
      params.push(priority);
    }

    const whereClause = conditions.join(' AND ');

    const tasks = db
      .prepare(
        `SELECT * FROM email_coordination
         WHERE ${whereClause}
         ORDER BY
           CASE priority
             WHEN 'urgent' THEN 1
             WHEN 'high' THEN 2
             WHEN 'normal' THEN 3
             WHEN 'low' THEN 4
           END,
           created_at DESC
         LIMIT ? OFFSET ?`
      )
      .all(...params, limit, offset);

    const total = db
      .prepare(`SELECT COUNT(*) as count FROM email_coordination WHERE ${whereClause}`)
      .get(...params);

    // Parse metadata
    const parsedTasks = tasks.map((task) => ({
      ...task,
      metadata: task.metadata ? JSON.parse(task.metadata) : {},
    }));

    return {
      tasks: parsedTasks,
      pagination: {
        total: total.count,
        limit,
        offset,
        hasMore: offset + tasks.length < total.count,
      },
    };
  }

  /**
   * Get email task by ID
   * @param {string} taskId - Task ID
   * @param {string} userId - User ID
   * @returns {Promise<Object|null>} Task or null
   */
  async getEmailTask(taskId, userId) {
    const db = getDatabase();

    const task = db
      .prepare('SELECT * FROM email_coordination WHERE id = ? AND user_id = ?')
      .get(taskId, userId);

    if (!task) {
      return null;
    }

    return {
      ...task,
      metadata: task.metadata ? JSON.parse(task.metadata) : {},
    };
  }

  /**
   * Get statistics
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Statistics
   */
  async getStats(userId) {
    const db = getDatabase();

    const stats = db
      .prepare(
        `SELECT
           COUNT(*) as total,
           SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
           SUM(CASE WHEN status = 'assigned' THEN 1 ELSE 0 END) as assigned,
           SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processing,
           SUM(CASE WHEN status = 'responded' THEN 1 ELSE 0 END) as responded,
           SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
           SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
           SUM(CASE WHEN priority = 'urgent' THEN 1 ELSE 0 END) as urgent,
           SUM(CASE WHEN priority = 'high' THEN 1 ELSE 0 END) as high_priority
         FROM email_coordination
         WHERE user_id = ?`
      )
      .get(userId);

    return stats;
  }
}

// Singleton instance
let instance = null;

function getEmailCoordinationService() {
  if (!instance) {
    instance = new EmailCoordinationService();
  }
  return instance;
}

module.exports = {
  EmailCoordinationService,
  getEmailCoordinationService,
};
