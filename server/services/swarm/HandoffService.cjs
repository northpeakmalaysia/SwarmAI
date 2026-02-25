/**
 * Handoff Service
 *
 * Manages conversation handoffs between agents.
 * Enables seamless transfer of context when switching agents.
 */

const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('../database.cjs');
const { logger } = require('../logger.cjs');
const { getAgentDiscoveryService } = require('./AgentDiscoveryService.cjs');

class HandoffService {
  constructor() {
    this.pendingHandoffs = new Map();
  }

  /**
   * Create a handoff request
   * @param {Object} options - Handoff options
   * @returns {Promise<Object>} Created handoff
   */
  async createHandoff(options) {
    const {
      userId,
      conversationId,
      fromAgentId,
      toAgentId,
      reason,
      context,
      autoAccept = false,
    } = options;

    const db = getDatabase();
    const id = uuidv4();

    // Validate target agent exists and is available
    if (toAgentId) {
      const discovery = getAgentDiscoveryService();
      const agent = await discovery.getAgent(toAgentId, userId);

      if (!agent) {
        throw new Error('Target agent not found');
      }

      if (agent.status !== 'idle' && !autoAccept) {
        throw new Error(`Target agent is not available (status: ${agent.status})`);
      }
    }

    const status = autoAccept ? 'completed' : 'pending';

    // Create handoff record
    db.prepare(`
      INSERT INTO handoffs (
        id, user_id, conversation_id, from_agent_id, to_agent_id,
        reason, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(id, userId, conversationId, fromAgentId, toAgentId, reason, status);

    // Store context in memory for pending handoffs
    if (!autoAccept && context) {
      this.pendingHandoffs.set(id, {
        context,
        createdAt: Date.now(),
      });
    }

    // If auto-accepted, update conversation assignment
    if (autoAccept && conversationId && toAgentId) {
      db.prepare(`
        UPDATE conversations SET agent_id = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(toAgentId, conversationId);

      // Update agent statuses
      const discovery = getAgentDiscoveryService();
      if (fromAgentId) {
        await discovery.updateAgentStatus(fromAgentId, 'idle');
      }
      await discovery.updateAgentStatus(toAgentId, 'busy');
    }

    const handoff = {
      id,
      userId,
      conversationId,
      fromAgentId,
      toAgentId,
      reason,
      status,
      createdAt: new Date().toISOString(),
    };

    logger.info(`Handoff created: ${id}`, { from: fromAgentId, to: toAgentId });

    return handoff;
  }

  /**
   * Accept a pending handoff
   * @param {string} handoffId - Handoff ID
   * @param {string} userId - User ID for ownership check
   * @returns {Promise<Object>} Updated handoff
   */
  async acceptHandoff(handoffId, userId) {
    const db = getDatabase();

    const handoff = db.prepare(`
      SELECT * FROM handoffs WHERE id = ? AND user_id = ?
    `).get(handoffId, userId);

    if (!handoff) {
      throw new Error('Handoff not found');
    }

    if (handoff.status !== 'pending') {
      throw new Error(`Handoff is not pending (status: ${handoff.status})`);
    }

    // Update handoff status
    db.prepare(`
      UPDATE handoffs SET status = 'completed' WHERE id = ?
    `).run(handoffId);

    // Update conversation assignment
    if (handoff.conversation_id && handoff.to_agent_id) {
      db.prepare(`
        UPDATE conversations SET agent_id = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(handoff.to_agent_id, handoff.conversation_id);
    }

    // Update agent statuses
    const discovery = getAgentDiscoveryService();
    if (handoff.from_agent_id) {
      await discovery.updateAgentStatus(handoff.from_agent_id, 'idle');
    }
    if (handoff.to_agent_id) {
      await discovery.updateAgentStatus(handoff.to_agent_id, 'busy');
    }

    // Get stored context
    const pendingData = this.pendingHandoffs.get(handoffId);
    this.pendingHandoffs.delete(handoffId);

    logger.info(`Handoff accepted: ${handoffId}`);

    return {
      ...handoff,
      status: 'completed',
      context: pendingData?.context,
    };
  }

  /**
   * Reject a pending handoff
   * @param {string} handoffId - Handoff ID
   * @param {string} userId - User ID for ownership check
   * @param {string} reason - Rejection reason
   * @returns {Promise<Object>} Updated handoff
   */
  async rejectHandoff(handoffId, userId, reason) {
    const db = getDatabase();

    const handoff = db.prepare(`
      SELECT * FROM handoffs WHERE id = ? AND user_id = ?
    `).get(handoffId, userId);

    if (!handoff) {
      throw new Error('Handoff not found');
    }

    if (handoff.status !== 'pending') {
      throw new Error(`Handoff is not pending (status: ${handoff.status})`);
    }

    // Update handoff status
    db.prepare(`
      UPDATE handoffs SET status = 'rejected', reason = ? WHERE id = ?
    `).run(reason || handoff.reason, handoffId);

    // Clean up pending data
    this.pendingHandoffs.delete(handoffId);

    logger.info(`Handoff rejected: ${handoffId}`);

    return {
      ...handoff,
      status: 'rejected',
      rejectionReason: reason,
    };
  }

  /**
   * Get handoff by ID
   * @param {string} handoffId - Handoff ID
   * @param {string} userId - User ID for ownership check
   * @returns {Promise<Object|null>} Handoff or null
   */
  async getHandoff(handoffId, userId) {
    const db = getDatabase();

    return db.prepare(`
      SELECT * FROM handoffs WHERE id = ? AND user_id = ?
    `).get(handoffId, userId) || null;
  }

  /**
   * Get handoffs for a user
   * @param {string} userId - User ID
   * @param {Object} options - Filter options
   * @returns {Promise<Array>} List of handoffs
   */
  async getHandoffs(userId, options = {}) {
    const { status, agentId, conversationId, limit = 50 } = options;
    const db = getDatabase();

    let query = `
      SELECT h.*,
             fa.name as from_agent_name,
             ta.name as to_agent_name
      FROM handoffs h
      LEFT JOIN agents fa ON h.from_agent_id = fa.id
      LEFT JOIN agents ta ON h.to_agent_id = ta.id
      WHERE h.user_id = ?
    `;
    const params = [userId];

    if (status) {
      query += ` AND h.status = ?`;
      params.push(status);
    }

    if (agentId) {
      query += ` AND (h.from_agent_id = ? OR h.to_agent_id = ?)`;
      params.push(agentId, agentId);
    }

    if (conversationId) {
      query += ` AND h.conversation_id = ?`;
      params.push(conversationId);
    }

    query += ` ORDER BY h.created_at DESC LIMIT ?`;
    params.push(limit);

    return db.prepare(query).all(...params);
  }

  /**
   * Get pending handoffs for an agent
   * @param {string} agentId - Agent ID
   * @returns {Promise<Array>} List of pending handoffs
   */
  async getPendingHandoffsForAgent(agentId) {
    const db = getDatabase();

    return db.prepare(`
      SELECT h.*,
             fa.name as from_agent_name,
             c.title as conversation_title
      FROM handoffs h
      LEFT JOIN agents fa ON h.from_agent_id = fa.id
      LEFT JOIN conversations c ON h.conversation_id = c.id
      WHERE h.to_agent_id = ? AND h.status = 'pending'
      ORDER BY h.created_at ASC
    `).all(agentId);
  }

  /**
   * Cancel a pending handoff
   * @param {string} handoffId - Handoff ID
   * @param {string} userId - User ID
   */
  async cancelHandoff(handoffId, userId) {
    const db = getDatabase();

    const handoff = db.prepare(`
      SELECT * FROM handoffs WHERE id = ? AND user_id = ?
    `).get(handoffId, userId);

    if (!handoff) {
      throw new Error('Handoff not found');
    }

    if (handoff.status !== 'pending') {
      throw new Error(`Cannot cancel handoff (status: ${handoff.status})`);
    }

    db.prepare(`
      UPDATE handoffs SET status = 'cancelled' WHERE id = ?
    `).run(handoffId);

    this.pendingHandoffs.delete(handoffId);

    logger.info(`Handoff cancelled: ${handoffId}`);
  }

  /**
   * Clean up expired pending handoffs
   */
  async cleanupExpired() {
    const expiryTime = 30 * 60 * 1000; // 30 minutes
    const now = Date.now();

    for (const [id, data] of this.pendingHandoffs) {
      if (now - data.createdAt > expiryTime) {
        this.pendingHandoffs.delete(id);

        const db = getDatabase();
        db.prepare(`
          UPDATE handoffs SET status = 'expired' WHERE id = ? AND status = 'pending'
        `).run(id);

        logger.debug(`Handoff expired: ${id}`);
      }
    }
  }
}

// Singleton instance
let handoffServiceInstance = null;

function getHandoffService() {
  if (!handoffServiceInstance) {
    handoffServiceInstance = new HandoffService();
  }
  return handoffServiceInstance;
}

module.exports = {
  HandoffService,
  getHandoffService,
};
