/**
 * Agent Discovery Service
 *
 * Finds and manages available agents in the swarm.
 * Provides agent lookup by skills, status, and availability.
 */

const { getDatabase } = require('../database.cjs');
const { logger } = require('../logger.cjs');

class AgentDiscoveryService {
  constructor() {
    this.agentCache = new Map();
    this.cacheTTL = 30000; // 30 seconds
  }

  /**
   * Get all agents for a user
   * @param {string} userId - User ID
   * @param {Object} options - Filter options
   * @returns {Promise<Array>} List of agents
   */
  async getAgents(userId, options = {}) {
    const { status, skills, limit = 100 } = options;
    const db = getDatabase();

    let query = `
      SELECT * FROM agents
      WHERE user_id = ?
    `;
    const params = [userId];

    if (status) {
      query += ` AND status = ?`;
      params.push(status);
    }

    query += ` ORDER BY reputation_score DESC, created_at DESC LIMIT ?`;
    params.push(limit);

    const agents = db.prepare(query).all(...params);

    // Filter by skills if specified
    if (skills && skills.length > 0) {
      return agents.filter(agent => {
        const agentSkills = this.extractSkills(agent);
        return skills.some(skill =>
          agentSkills.some(as => as.toLowerCase().includes(skill.toLowerCase()))
        );
      });
    }

    return agents;
  }

  /**
   * Get available agents (idle or with capacity)
   * @param {string} userId - User ID
   * @param {Object} options - Filter options
   * @returns {Promise<Array>} List of available agents
   */
  async getAvailableAgents(userId, options = {}) {
    return this.getAgents(userId, { ...options, status: 'idle' });
  }

  /**
   * Get agent by ID
   * @param {string} agentId - Agent ID
   * @param {string} userId - User ID for ownership check
   * @returns {Promise<Object|null>} Agent or null
   */
  async getAgent(agentId, userId) {
    const db = getDatabase();

    const agent = db.prepare(`
      SELECT * FROM agents WHERE id = ? AND user_id = ?
    `).get(agentId, userId);

    return agent || null;
  }

  /**
   * Find best agent for a task based on skills and availability
   * @param {string} userId - User ID
   * @param {Object} criteria - Selection criteria
   * @returns {Promise<Object|null>} Best matching agent or null
   */
  async findBestAgent(userId, criteria = {}) {
    const { requiredSkills = [], preferredSkills = [], excludeAgentIds = [] } = criteria;

    const agents = await this.getAvailableAgents(userId);

    if (agents.length === 0) {
      return null;
    }

    // Filter out excluded agents
    let candidates = agents.filter(a => !excludeAgentIds.includes(a.id));

    if (candidates.length === 0) {
      return null;
    }

    // Score each candidate
    const scored = candidates.map(agent => {
      const agentSkills = this.extractSkills(agent);
      let score = agent.reputation_score || 100;

      // Required skills - agent must have all
      const hasAllRequired = requiredSkills.every(skill =>
        agentSkills.some(as => as.toLowerCase().includes(skill.toLowerCase()))
      );

      if (!hasAllRequired && requiredSkills.length > 0) {
        return { agent, score: -1 }; // Disqualify
      }

      // Preferred skills - bonus points
      const preferredMatches = preferredSkills.filter(skill =>
        agentSkills.some(as => as.toLowerCase().includes(skill.toLowerCase()))
      );
      score += preferredMatches.length * 10;

      return { agent, score };
    });

    // Filter qualified and sort by score
    const qualified = scored.filter(s => s.score >= 0);
    if (qualified.length === 0) {
      return null;
    }

    qualified.sort((a, b) => b.score - a.score);
    return qualified[0].agent;
  }

  /**
   * Extract skills from agent data
   * @param {Object} agent - Agent object
   * @returns {string[]} List of skills
   */
  extractSkills(agent) {
    const skills = [];

    // Extract from description
    if (agent.description) {
      // Look for skills mentioned in description
      const skillPatterns = [
        /skilled?\s+(?:in|at)\s+([^.]+)/gi,
        /expert\s+(?:in|at)\s+([^.]+)/gi,
        /specializ(?:e|es|ing)\s+in\s+([^.]+)/gi,
      ];

      for (const pattern of skillPatterns) {
        const matches = agent.description.matchAll(pattern);
        for (const match of matches) {
          skills.push(...match[1].split(/[,;]/g).map(s => s.trim()));
        }
      }
    }

    // Extract from system prompt
    if (agent.system_prompt) {
      // Look for role/capability mentions
      if (agent.system_prompt.includes('customer support')) skills.push('customer support');
      if (agent.system_prompt.includes('technical')) skills.push('technical');
      if (agent.system_prompt.includes('sales')) skills.push('sales');
      if (agent.system_prompt.includes('coding') || agent.system_prompt.includes('programming')) {
        skills.push('coding');
      }
      if (agent.system_prompt.includes('translation')) skills.push('translation');
      if (agent.system_prompt.includes('writing')) skills.push('writing');
    }

    // Use agent name as hint
    const nameLower = (agent.name || '').toLowerCase();
    if (nameLower.includes('support')) skills.push('support');
    if (nameLower.includes('sales')) skills.push('sales');
    if (nameLower.includes('tech')) skills.push('technical');
    if (nameLower.includes('dev')) skills.push('development');

    return [...new Set(skills)]; // Deduplicate
  }

  /**
   * Update agent status
   * @param {string} agentId - Agent ID
   * @param {string} status - New status
   */
  async updateAgentStatus(agentId, status) {
    const db = getDatabase();

    const validStatuses = ['idle', 'busy', 'offline', 'error'];
    if (!validStatuses.includes(status)) {
      throw new Error(`Invalid status: ${status}`);
    }

    db.prepare(`
      UPDATE agents
      SET status = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(status, agentId);

    // Invalidate cache
    this.agentCache.delete(agentId);

    logger.debug(`Agent ${agentId} status updated to ${status}`);
  }

  /**
   * Update agent reputation
   * @param {string} agentId - Agent ID
   * @param {number} delta - Change in reputation (positive or negative)
   */
  async updateReputation(agentId, delta) {
    const db = getDatabase();

    // Clamp reputation between 0 and 200
    db.prepare(`
      UPDATE agents
      SET reputation_score = MAX(0, MIN(200, reputation_score + ?)),
          updated_at = datetime('now')
      WHERE id = ?
    `).run(delta, agentId);

    logger.debug(`Agent ${agentId} reputation changed by ${delta}`);
  }

  /**
   * Register agent heartbeat (mark as active)
   * @param {string} agentId - Agent ID
   */
  async heartbeat(agentId) {
    const db = getDatabase();

    const agent = db.prepare('SELECT status FROM agents WHERE id = ?').get(agentId);

    if (agent && agent.status === 'offline') {
      await this.updateAgentStatus(agentId, 'idle');
    }

    // Update timestamp
    db.prepare(`
      UPDATE agents SET updated_at = datetime('now') WHERE id = ?
    `).run(agentId);
  }

  /**
   * Get swarm status summary
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Swarm status
   */
  async getSwarmStatus(userId) {
    const db = getDatabase();

    const agents = db.prepare(`
      SELECT status, COUNT(*) as count FROM agents
      WHERE user_id = ?
      GROUP BY status
    `).all(userId);

    const statusCounts = {
      idle: 0,
      busy: 0,
      offline: 0,
      error: 0,
      total: 0,
    };

    for (const row of agents) {
      statusCounts[row.status] = row.count;
      statusCounts.total += row.count;
    }

    // Get active tasks count
    const activeTasks = db.prepare(`
      SELECT COUNT(*) as count FROM swarm_tasks
      WHERE user_id = ? AND status IN ('pending', 'in_progress')
    `).get(userId);

    // Get recent handoffs
    const recentHandoffs = db.prepare(`
      SELECT COUNT(*) as count FROM handoffs
      WHERE user_id = ? AND created_at > datetime('now', '-1 hour')
    `).get(userId);

    return {
      agents: statusCounts,
      activeTasks: activeTasks?.count || 0,
      recentHandoffs: recentHandoffs?.count || 0,
      lastUpdated: new Date().toISOString(),
    };
  }
}

// Singleton instance
let discoveryServiceInstance = null;

function getAgentDiscoveryService() {
  if (!discoveryServiceInstance) {
    discoveryServiceInstance = new AgentDiscoveryService();
  }
  return discoveryServiceInstance;
}

module.exports = {
  AgentDiscoveryService,
  getAgentDiscoveryService,
};
