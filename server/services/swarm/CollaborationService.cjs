/**
 * Collaboration Service
 *
 * Manages multi-agent collaboration sessions.
 * Enables agents to work together on complex tasks.
 */

const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('../database.cjs');
const { logger } = require('../logger.cjs');
const { getAgentDiscoveryService } = require('./AgentDiscoveryService.cjs');

class CollaborationService {
  constructor() {
    this.activeCollaborations = new Map();
  }

  /**
   * Create a new collaboration session
   * @param {Object} options - Collaboration options
   * @returns {Promise<Object>} Created collaboration
   */
  async createCollaboration(options) {
    const {
      userId,
      agentIds,
      task,
      context,
      mode = 'sequential', // sequential, parallel, round-robin
      maxRounds = 5,
    } = options;

    const db = getDatabase();
    const id = uuidv4();

    // Validate agents exist and belong to user
    const discovery = getAgentDiscoveryService();
    const validAgentIds = [];

    for (const agentId of agentIds) {
      const agent = await discovery.getAgent(agentId, userId);
      if (agent) {
        validAgentIds.push(agentId);
      }
    }

    if (validAgentIds.length < 2) {
      throw new Error('At least 2 valid agents are required for collaboration');
    }

    // Create collaboration record
    db.prepare(`
      INSERT INTO collaborations (
        id, user_id, agent_ids, task, context, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'active', datetime('now'), datetime('now'))
    `).run(id, userId, JSON.stringify(validAgentIds), task, JSON.stringify(context || {}));

    // Initialize collaboration state
    this.activeCollaborations.set(id, {
      mode,
      maxRounds,
      currentRound: 0,
      contributions: [],
      agentQueue: [...validAgentIds],
      currentAgentIndex: 0,
    });

    const collaboration = {
      id,
      userId,
      agentIds: validAgentIds,
      task,
      context,
      mode,
      maxRounds,
      status: 'active',
      createdAt: new Date().toISOString(),
    };

    logger.info(`Collaboration created: ${id}`, { agents: validAgentIds.length, mode });

    return collaboration;
  }

  /**
   * Add a contribution to a collaboration
   * @param {string} collaborationId - Collaboration ID
   * @param {string} agentId - Contributing agent ID
   * @param {Object} contribution - The contribution data
   * @returns {Promise<Object>} Updated collaboration
   */
  async addContribution(collaborationId, agentId, contribution) {
    const state = this.activeCollaborations.get(collaborationId);

    if (!state) {
      throw new Error('Collaboration not found or inactive');
    }

    // Add contribution
    state.contributions.push({
      agentId,
      content: contribution.content,
      metadata: contribution.metadata,
      timestamp: new Date().toISOString(),
    });

    // Advance to next agent
    state.currentAgentIndex = (state.currentAgentIndex + 1) % state.agentQueue.length;

    // Check if round complete
    if (state.currentAgentIndex === 0) {
      state.currentRound++;
    }

    // Check if collaboration complete
    let isComplete = false;
    if (state.currentRound >= state.maxRounds) {
      isComplete = true;
    }

    if (isComplete) {
      await this.completeCollaboration(collaborationId, 'max_rounds_reached');
    }

    return {
      collaborationId,
      contributionCount: state.contributions.length,
      currentRound: state.currentRound,
      isComplete,
    };
  }

  /**
   * Get the next agent in the collaboration queue
   * @param {string} collaborationId - Collaboration ID
   * @returns {Promise<string|null>} Next agent ID or null if complete
   */
  async getNextAgent(collaborationId) {
    const state = this.activeCollaborations.get(collaborationId);

    if (!state) {
      return null;
    }

    if (state.currentRound >= state.maxRounds) {
      return null;
    }

    return state.agentQueue[state.currentAgentIndex];
  }

  /**
   * Get collaboration context for an agent
   * @param {string} collaborationId - Collaboration ID
   * @returns {Promise<Object>} Context for the next contribution
   */
  async getCollaborationContext(collaborationId) {
    const db = getDatabase();
    const state = this.activeCollaborations.get(collaborationId);

    if (!state) {
      throw new Error('Collaboration not found or inactive');
    }

    const collab = db.prepare(`
      SELECT * FROM collaborations WHERE id = ?
    `).get(collaborationId);

    if (!collab) {
      throw new Error('Collaboration not found');
    }

    return {
      task: collab.task,
      originalContext: JSON.parse(collab.context || '{}'),
      contributions: state.contributions,
      currentRound: state.currentRound,
      maxRounds: state.maxRounds,
      mode: state.mode,
    };
  }

  /**
   * Complete a collaboration
   * @param {string} collaborationId - Collaboration ID
   * @param {string} reason - Completion reason
   * @returns {Promise<Object>} Final collaboration result
   */
  async completeCollaboration(collaborationId, reason = 'completed') {
    const db = getDatabase();
    const state = this.activeCollaborations.get(collaborationId);

    if (!state) {
      throw new Error('Collaboration not found or inactive');
    }

    // Aggregate results
    const result = {
      reason,
      rounds: state.currentRound,
      totalContributions: state.contributions.length,
      contributions: state.contributions,
      aggregatedContent: state.contributions.map(c => c.content).join('\n\n---\n\n'),
    };

    // Update database
    db.prepare(`
      UPDATE collaborations
      SET status = 'completed', result = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(JSON.stringify(result), collaborationId);

    // Clean up
    this.activeCollaborations.delete(collaborationId);

    logger.info(`Collaboration completed: ${collaborationId}`, { reason });

    return result;
  }

  /**
   * Cancel a collaboration
   * @param {string} collaborationId - Collaboration ID
   * @param {string} userId - User ID for ownership check
   */
  async cancelCollaboration(collaborationId, userId) {
    const db = getDatabase();

    const collab = db.prepare(`
      SELECT * FROM collaborations WHERE id = ? AND user_id = ?
    `).get(collaborationId, userId);

    if (!collab) {
      throw new Error('Collaboration not found');
    }

    if (collab.status !== 'active') {
      throw new Error(`Collaboration is not active (status: ${collab.status})`);
    }

    db.prepare(`
      UPDATE collaborations
      SET status = 'cancelled', updated_at = datetime('now')
      WHERE id = ?
    `).run(collaborationId);

    this.activeCollaborations.delete(collaborationId);

    logger.info(`Collaboration cancelled: ${collaborationId}`);
  }

  /**
   * Get collaboration by ID
   * @param {string} collaborationId - Collaboration ID
   * @param {string} userId - User ID for ownership check
   * @returns {Promise<Object|null>} Collaboration or null
   */
  async getCollaboration(collaborationId, userId) {
    const db = getDatabase();

    const collab = db.prepare(`
      SELECT * FROM collaborations WHERE id = ? AND user_id = ?
    `).get(collaborationId, userId);

    if (!collab) {
      return null;
    }

    const state = this.activeCollaborations.get(collaborationId);

    return {
      ...collab,
      agentIds: JSON.parse(collab.agent_ids || '[]'),
      context: JSON.parse(collab.context || '{}'),
      result: collab.result ? JSON.parse(collab.result) : null,
      currentState: state ? {
        currentRound: state.currentRound,
        contributionCount: state.contributions.length,
        mode: state.mode,
      } : null,
    };
  }

  /**
   * Get collaborations for a user
   * @param {string} userId - User ID
   * @param {Object} options - Filter options
   * @returns {Promise<Array>} List of collaborations
   */
  async getCollaborations(userId, options = {}) {
    const { status, agentId, limit = 50 } = options;
    const db = getDatabase();

    let query = `
      SELECT * FROM collaborations WHERE user_id = ?
    `;
    const params = [userId];

    if (status) {
      query += ` AND status = ?`;
      params.push(status);
    }

    if (agentId) {
      query += ` AND agent_ids LIKE ?`;
      params.push(`%"${agentId}"%`);
    }

    query += ` ORDER BY created_at DESC LIMIT ?`;
    params.push(limit);

    const collabs = db.prepare(query).all(...params);

    return collabs.map(c => ({
      ...c,
      agentIds: JSON.parse(c.agent_ids || '[]'),
      context: JSON.parse(c.context || '{}'),
      result: c.result ? JSON.parse(c.result) : null,
    }));
  }
}

// Singleton instance
let collaborationServiceInstance = null;

function getCollaborationService() {
  if (!collaborationServiceInstance) {
    collaborationServiceInstance = new CollaborationService();
  }
  return collaborationServiceInstance;
}

module.exports = {
  CollaborationService,
  getCollaborationService,
};
