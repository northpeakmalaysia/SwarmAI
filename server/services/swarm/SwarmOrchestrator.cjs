/**
 * Swarm Orchestrator
 *
 * Central coordinator for all swarm operations.
 * Manages tasks, agents, handoffs, collaborations, and consensus.
 */

const { v4: uuidv4 } = require('uuid');
const { EventEmitter } = require('events');
const { getDatabase } = require('../database.cjs');
const { logger } = require('../logger.cjs');
const { getAgentDiscoveryService } = require('./AgentDiscoveryService.cjs');
const { getHandoffService } = require('./HandoffService.cjs');
const { getCollaborationService } = require('./CollaborationService.cjs');
const { getConsensusService } = require('./ConsensusService.cjs');

class SwarmOrchestrator extends EventEmitter {
  constructor() {
    super();
    this.taskQueue = new Map();
    this.cleanupInterval = null;
    this.superBrain = null; // Will be set via setSuperBrain()
  }

  /**
   * Set Super Brain router for AI-powered task execution
   * @param {Object} superBrain - SuperBrainRouter instance
   */
  setSuperBrain(superBrain) {
    this.superBrain = superBrain;
    logger.info('SuperBrain router connected to SwarmOrchestrator');
  }

  /**
   * Initialize the orchestrator
   */
  async initialize() {
    // Start cleanup interval
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60 * 1000); // Every minute

    logger.info('SwarmOrchestrator initialized');
  }

  /**
   * Shutdown the orchestrator
   */
  async shutdown() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }

  /**
   * Get swarm status
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Swarm status
   */
  async getStatus(userId) {
    const discovery = getAgentDiscoveryService();
    return discovery.getSwarmStatus(userId);
  }

  /**
   * Create a new swarm task
   * @param {Object} options - Task options
   * @returns {Promise<Object>} Created task
   */
  async createTask(options) {
    const {
      userId,
      title,
      description,
      priority = 'normal',
      agentId,
      autoAssign = true,
    } = options;

    const db = getDatabase();
    const id = uuidv4();

    let assignedAgentId = agentId;

    // Auto-assign if requested
    if (autoAssign && !assignedAgentId) {
      const discovery = getAgentDiscoveryService();
      const agent = await discovery.findBestAgent(userId, {});
      if (agent) {
        assignedAgentId = agent.id;
      }
    }

    // Create task record
    db.prepare(`
      INSERT INTO swarm_tasks (
        id, user_id, title, description, priority,
        assigned_agent_id, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'pending', datetime('now'), datetime('now'))
    `).run(id, userId, title, description, priority, assignedAgentId);

    // Update agent status if assigned
    if (assignedAgentId) {
      const discovery = getAgentDiscoveryService();
      await discovery.updateAgentStatus(assignedAgentId, 'busy');

      db.prepare(`
        UPDATE swarm_tasks SET status = 'in_progress' WHERE id = ?
      `).run(id);
    }

    const task = {
      id,
      userId,
      title,
      description,
      priority,
      assignedAgentId,
      status: assignedAgentId ? 'in_progress' : 'pending',
      createdAt: new Date().toISOString(),
    };

    this.emit('task:created', task);
    logger.info(`Task created: ${id}`, { assigned: !!assignedAgentId });

    return task;
  }

  /**
   * Assign a task to an agent
   * @param {string} taskId - Task ID
   * @param {string} agentId - Agent ID
   * @param {string} userId - User ID for ownership check
   * @returns {Promise<Object>} Updated task
   */
  async assignTask(taskId, agentId, userId) {
    const db = getDatabase();

    const task = db.prepare(`
      SELECT * FROM swarm_tasks WHERE id = ? AND user_id = ?
    `).get(taskId, userId);

    if (!task) {
      throw new Error('Task not found');
    }

    const discovery = getAgentDiscoveryService();
    const agent = await discovery.getAgent(agentId, userId);

    if (!agent) {
      throw new Error('Agent not found');
    }

    // Update task
    db.prepare(`
      UPDATE swarm_tasks
      SET assigned_agent_id = ?, status = 'in_progress', updated_at = datetime('now')
      WHERE id = ?
    `).run(agentId, taskId);

    // Update agent status
    await discovery.updateAgentStatus(agentId, 'busy');

    this.emit('task:assigned', { taskId, agentId });

    return {
      ...task,
      assignedAgentId: agentId,
      status: 'in_progress',
    };
  }

  /**
   * Complete a task
   * @param {string} taskId - Task ID
   * @param {string} userId - User ID
   * @param {Object} result - Task result
   * @returns {Promise<Object>} Completed task
   */
  async completeTask(taskId, userId, result = null) {
    const db = getDatabase();

    const task = db.prepare(`
      SELECT * FROM swarm_tasks WHERE id = ? AND user_id = ?
    `).get(taskId, userId);

    if (!task) {
      throw new Error('Task not found');
    }

    // Update task
    db.prepare(`
      UPDATE swarm_tasks
      SET status = 'completed', result = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(result ? JSON.stringify(result) : null, taskId);

    // Update agent status
    if (task.assigned_agent_id) {
      const discovery = getAgentDiscoveryService();
      await discovery.updateAgentStatus(task.assigned_agent_id, 'idle');

      // Reward reputation for successful completion
      await discovery.updateReputation(task.assigned_agent_id, 5);
    }

    this.emit('task:completed', { taskId, result });

    return {
      ...task,
      status: 'completed',
      result,
    };
  }

  /**
   * Fail a task
   * @param {string} taskId - Task ID
   * @param {string} userId - User ID
   * @param {string} reason - Failure reason
   * @returns {Promise<Object>} Failed task
   */
  async failTask(taskId, userId, reason) {
    const db = getDatabase();

    const task = db.prepare(`
      SELECT * FROM swarm_tasks WHERE id = ? AND user_id = ?
    `).get(taskId, userId);

    if (!task) {
      throw new Error('Task not found');
    }

    // Update task
    db.prepare(`
      UPDATE swarm_tasks
      SET status = 'failed', result = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(JSON.stringify({ error: reason }), taskId);

    // Update agent status and penalize reputation
    if (task.assigned_agent_id) {
      const discovery = getAgentDiscoveryService();
      await discovery.updateAgentStatus(task.assigned_agent_id, 'idle');
      await discovery.updateReputation(task.assigned_agent_id, -3);
    }

    this.emit('task:failed', { taskId, reason });

    return {
      ...task,
      status: 'failed',
      error: reason,
    };
  }

  /**
   * Get task by ID
   * @param {string} taskId - Task ID
   * @param {string} userId - User ID
   * @returns {Promise<Object|null>} Task or null
   */
  async getTask(taskId, userId) {
    const db = getDatabase();

    const task = db.prepare(`
      SELECT t.*, a.name as agent_name
      FROM swarm_tasks t
      LEFT JOIN agents a ON t.assigned_agent_id = a.id
      WHERE t.id = ? AND t.user_id = ?
    `).get(taskId, userId);

    if (!task) {
      return null;
    }

    return {
      ...task,
      result: task.result ? JSON.parse(task.result) : null,
    };
  }

  /**
   * Get tasks for a user
   * @param {string} userId - User ID
   * @param {Object} options - Filter options
   * @returns {Promise<Array>} List of tasks
   */
  async getTasks(userId, options = {}) {
    const { status, priority, agentId, limit = 50 } = options;
    const db = getDatabase();

    let query = `
      SELECT t.*, a.name as agent_name
      FROM swarm_tasks t
      LEFT JOIN agents a ON t.assigned_agent_id = a.id
      WHERE t.user_id = ?
    `;
    const params = [userId];

    if (status) {
      query += ` AND t.status = ?`;
      params.push(status);
    }

    if (priority) {
      query += ` AND t.priority = ?`;
      params.push(priority);
    }

    if (agentId) {
      query += ` AND t.assigned_agent_id = ?`;
      params.push(agentId);
    }

    query += ` ORDER BY
      CASE t.priority
        WHEN 'urgent' THEN 1
        WHEN 'high' THEN 2
        WHEN 'normal' THEN 3
        WHEN 'low' THEN 4
      END,
      t.created_at DESC
      LIMIT ?`;
    params.push(limit);

    const tasks = db.prepare(query).all(...params);

    return tasks.map(t => ({
      ...t,
      result: t.result ? JSON.parse(t.result) : null,
    }));
  }

  /**
   * Broadcast a message to multiple agents
   * @param {Object} options - Broadcast options
   * @returns {Promise<Object>} Broadcast result
   */
  async broadcast(options) {
    const { userId, message, agentIds, channel = 'default' } = options;

    const discovery = getAgentDiscoveryService();
    const results = [];

    const targetAgentIds = agentIds || (await discovery.getAgents(userId)).map(a => a.id);

    for (const agentId of targetAgentIds) {
      try {
        this.emit('broadcast', { agentId, message, channel });
        results.push({ agentId, success: true });
      } catch (error) {
        results.push({ agentId, success: false, error: error.message });
      }
    }

    logger.info(`Broadcast sent to ${results.length} agents`);

    return {
      sent: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results,
    };
  }

  /**
   * Request a handoff
   */
  async requestHandoff(options) {
    const handoff = getHandoffService();
    return handoff.createHandoff(options);
  }

  /**
   * Start a collaboration
   */
  async startCollaboration(options) {
    const collaboration = getCollaborationService();
    return collaboration.createCollaboration(options);
  }

  /**
   * Request consensus
   */
  async requestConsensus(options) {
    const consensus = getConsensusService();
    return consensus.createConsensusRequest(options);
  }

  /**
   * Execute a task with Super Brain AI routing
   * @param {Object} task - Task to execute
   * @param {Object} options - Execution options
   * @returns {Promise<Object>} Execution result
   */
  async executeWithSuperBrain(task, options = {}) {
    if (!this.superBrain) {
      throw new Error('SuperBrain not connected. Call setSuperBrain() first.');
    }

    const { userId, distributeToAgents = false } = options;
    const discovery = getAgentDiscoveryService();

    // Step 1: Classify task using Super Brain
    const classification = this.superBrain.classifier.classify(task.description || task.title);

    logger.debug(`Task classified for Super Brain: ${classification.tier} (confidence: ${classification.confidence})`);

    // Step 2: If distribute to agents, find capable agents
    if (distributeToAgents) {
      const agents = await discovery.getAgents(userId, {
        status: 'idle',
        minReputation: 50,
      });

      if (agents.length === 0) {
        // No agents available, execute directly with Super Brain
        return this.executeSuperBrainDirect(task, userId, classification);
      }

      // Distribute task across agents
      return this.distributeTaskToAgents(task, agents, userId, classification);
    }

    // Execute directly with Super Brain
    return this.executeSuperBrainDirect(task, userId, classification);
  }

  /**
   * Execute task directly with Super Brain
   * @private
   */
  async executeSuperBrainDirect(task, userId, classification) {
    const result = await this.superBrain.process({
      task: task.description || task.title,
      userId,
    }, {
      classification,
    });

    // Update task in database if it exists
    if (task.id) {
      const db = getDatabase();
      db.prepare(`
        UPDATE swarm_tasks
        SET status = 'completed',
            result = ?,
            updated_at = datetime('now')
        WHERE id = ?
      `).run(JSON.stringify({
        content: result.content,
        provider: result.provider,
        classification: classification.tier,
      }), task.id);
    }

    this.emit('task:ai_completed', {
      taskId: task.id,
      provider: result.provider,
      tier: classification.tier,
    });

    return {
      taskId: task.id,
      content: result.content,
      provider: result.provider,
      classification,
      duration: result.duration,
    };
  }

  /**
   * Distribute task to multiple agents with AI-powered execution
   * @private
   */
  async distributeTaskToAgents(task, agents, userId, classification) {
    const collaborationId = uuidv4();

    // Create collaboration record
    const collaboration = getCollaborationService();
    await collaboration.createCollaboration({
      userId,
      agentIds: agents.map(a => a.id),
      task: task.description || task.title,
      context: JSON.stringify({ classification, superBrain: true }),
    });

    // Execute on each agent in parallel
    const executions = agents.slice(0, 3).map(async (agent) => {
      try {
        // Each agent gets the task with its own context
        const result = await this.superBrain.process({
          task: task.description || task.title,
          userId,
          context: {
            agentId: agent.id,
            agentName: agent.name,
          },
        });

        return {
          agentId: agent.id,
          agentName: agent.name,
          success: true,
          content: result.content,
          provider: result.provider,
        };
      } catch (error) {
        return {
          agentId: agent.id,
          agentName: agent.name,
          success: false,
          error: error.message,
        };
      }
    });

    const agentResults = await Promise.all(executions);

    // If multiple results, use consensus to determine best
    const successfulResults = agentResults.filter(r => r.success);

    if (successfulResults.length > 1) {
      // Use consensus service to pick best result
      const consensus = getConsensusService();
      const consensusResult = await consensus.createConsensusRequest({
        userId,
        question: 'Which response is best?',
        options: successfulResults.map((r, i) => ({
          id: `result_${i}`,
          label: `${r.agentName}: ${r.content.substring(0, 100)}...`,
        })),
        agentIds: agents.map(a => a.id),
      });

      return {
        collaborationId,
        taskId: task.id,
        results: agentResults,
        bestResult: successfulResults[0], // Default to first if no consensus yet
        consensusId: consensusResult.id,
        classification,
      };
    }

    return {
      collaborationId,
      taskId: task.id,
      results: agentResults,
      bestResult: successfulResults[0] || null,
      classification,
    };
  }

  /**
   * Get Super Brain status
   * @returns {Object|null} Super Brain status
   */
  getSuperBrainStatus() {
    if (!this.superBrain) {
      return null;
    }
    return this.superBrain.getInfo();
  }

  /**
   * Clean up expired resources
   */
  async cleanup() {
    try {
      const handoff = getHandoffService();
      await handoff.cleanupExpired();

      const consensus = getConsensusService();
      await consensus.cleanupExpired();

      logger.debug('Swarm cleanup completed');
    } catch (error) {
      logger.error(`Swarm cleanup failed: ${error.message}`);
    }
  }
}

// Singleton instance
let orchestratorInstance = null;

function getSwarmOrchestrator() {
  if (!orchestratorInstance) {
    orchestratorInstance = new SwarmOrchestrator();
  }
  return orchestratorInstance;
}

module.exports = {
  SwarmOrchestrator,
  getSwarmOrchestrator,
};
