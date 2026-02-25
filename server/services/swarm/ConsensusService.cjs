/**
 * Consensus Service
 *
 * Manages voting and consensus-building among agents.
 * Enables democratic decision-making in the swarm.
 */

const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('../database.cjs');
const { logger } = require('../logger.cjs');
const { getAgentDiscoveryService } = require('./AgentDiscoveryService.cjs');

class ConsensusService {
  constructor() {
    this.activeVotes = new Map();
  }

  /**
   * Create a new consensus request
   * @param {Object} options - Consensus options
   * @returns {Promise<Object>} Created consensus request
   */
  async createConsensusRequest(options) {
    const {
      userId,
      question,
      optionsList,
      agentIds,
      threshold = 0.5,
      expiresIn = 5 * 60 * 1000, // 5 minutes default
    } = options;

    const db = getDatabase();
    const id = uuidv4();

    // Validate agents
    const discovery = getAgentDiscoveryService();
    const validAgentIds = [];

    for (const agentId of agentIds) {
      const agent = await discovery.getAgent(agentId, userId);
      if (agent) {
        validAgentIds.push(agentId);
      }
    }

    if (validAgentIds.length < 2) {
      throw new Error('At least 2 valid agents are required for consensus');
    }

    // Create consensus record
    db.prepare(`
      INSERT INTO consensus_requests (
        id, user_id, question, options, agent_ids, threshold, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'pending', datetime('now'))
    `).run(
      id,
      userId,
      question,
      JSON.stringify(optionsList),
      JSON.stringify(validAgentIds),
      threshold
    );

    // Initialize voting state
    this.activeVotes.set(id, {
      votes: new Map(),
      expiresAt: Date.now() + expiresIn,
      requiredVotes: Math.ceil(validAgentIds.length * threshold),
      totalVoters: validAgentIds.length,
    });

    const consensus = {
      id,
      userId,
      question,
      options: optionsList,
      agentIds: validAgentIds,
      threshold,
      status: 'pending',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + expiresIn).toISOString(),
    };

    logger.info(`Consensus request created: ${id}`, {
      voters: validAgentIds.length,
      threshold
    });

    return consensus;
  }

  /**
   * Submit a vote
   * @param {string} requestId - Consensus request ID
   * @param {string} agentId - Voting agent ID
   * @param {string|number} choice - The vote choice (option index or value)
   * @param {Object} reasoning - Optional reasoning for the vote
   * @returns {Promise<Object>} Vote result
   */
  async submitVote(requestId, agentId, choice, reasoning = null) {
    const db = getDatabase();
    const state = this.activeVotes.get(requestId);

    if (!state) {
      throw new Error('Consensus request not found or expired');
    }

    if (Date.now() > state.expiresAt) {
      await this.expireConsensus(requestId);
      throw new Error('Consensus request has expired');
    }

    // Check if agent already voted
    if (state.votes.has(agentId)) {
      throw new Error('Agent has already voted');
    }

    // Record vote
    state.votes.set(agentId, {
      choice,
      reasoning,
      timestamp: new Date().toISOString(),
    });

    // Check if consensus reached
    const result = this.checkConsensus(requestId);

    if (result.isComplete) {
      await this.completeConsensus(requestId, result);
    }

    return {
      requestId,
      votesReceived: state.votes.size,
      totalVoters: state.totalVoters,
      isComplete: result.isComplete,
      result: result.isComplete ? result : null,
    };
  }

  /**
   * Check if consensus has been reached
   * @param {string} requestId - Consensus request ID
   * @returns {Object} Consensus check result
   */
  checkConsensus(requestId) {
    const state = this.activeVotes.get(requestId);

    if (!state) {
      return { isComplete: false, reason: 'not_found' };
    }

    // Count votes per option
    const voteCounts = new Map();
    for (const [, vote] of state.votes) {
      const count = voteCounts.get(vote.choice) || 0;
      voteCounts.set(vote.choice, count + 1);
    }

    // Find the leading option
    let maxVotes = 0;
    let leadingOption = null;
    for (const [option, count] of voteCounts) {
      if (count > maxVotes) {
        maxVotes = count;
        leadingOption = option;
      }
    }

    // Check if all votes are in
    const allVotesIn = state.votes.size >= state.totalVoters;

    // Check if consensus threshold met
    const votesNeeded = state.requiredVotes;
    const consensusReached = maxVotes >= votesNeeded;

    if (consensusReached) {
      return {
        isComplete: true,
        reason: 'consensus_reached',
        winningOption: leadingOption,
        winningVotes: maxVotes,
        totalVotes: state.votes.size,
        voteCounts: Object.fromEntries(voteCounts),
      };
    }

    if (allVotesIn) {
      // All votes in but no clear consensus - take plurality
      return {
        isComplete: true,
        reason: 'all_votes_in',
        winningOption: leadingOption,
        winningVotes: maxVotes,
        totalVotes: state.votes.size,
        voteCounts: Object.fromEntries(voteCounts),
        note: 'Plurality decision - no consensus threshold met',
      };
    }

    return {
      isComplete: false,
      reason: 'pending',
      currentLeader: leadingOption,
      leadingVotes: maxVotes,
      votesReceived: state.votes.size,
      votesNeeded: votesNeeded,
    };
  }

  /**
   * Complete a consensus request
   * @param {string} requestId - Request ID
   * @param {Object} result - Consensus result
   */
  async completeConsensus(requestId, result) {
    const db = getDatabase();
    const state = this.activeVotes.get(requestId);

    if (!state) {
      return;
    }

    // Store result
    const fullResult = {
      ...result,
      votes: Object.fromEntries(
        [...state.votes].map(([agentId, vote]) => [agentId, vote])
      ),
      completedAt: new Date().toISOString(),
    };

    db.prepare(`
      UPDATE consensus_requests
      SET status = 'completed', result = ?
      WHERE id = ?
    `).run(JSON.stringify(fullResult), requestId);

    // Clean up
    this.activeVotes.delete(requestId);

    logger.info(`Consensus completed: ${requestId}`, {
      winner: result.winningOption,
      votes: result.totalVotes
    });
  }

  /**
   * Expire a consensus request
   * @param {string} requestId - Request ID
   */
  async expireConsensus(requestId) {
    const db = getDatabase();
    const state = this.activeVotes.get(requestId);

    if (state) {
      const partialResult = {
        reason: 'expired',
        votesReceived: state.votes.size,
        votesNeeded: state.requiredVotes,
        votes: Object.fromEntries(
          [...state.votes].map(([agentId, vote]) => [agentId, vote])
        ),
        expiredAt: new Date().toISOString(),
      };

      db.prepare(`
        UPDATE consensus_requests
        SET status = 'expired', result = ?
        WHERE id = ?
      `).run(JSON.stringify(partialResult), requestId);

      this.activeVotes.delete(requestId);
    } else {
      db.prepare(`
        UPDATE consensus_requests SET status = 'expired' WHERE id = ?
      `).run(requestId);
    }

    logger.info(`Consensus expired: ${requestId}`);
  }

  /**
   * Get consensus request by ID
   * @param {string} requestId - Request ID
   * @param {string} userId - User ID for ownership check
   * @returns {Promise<Object|null>} Consensus request or null
   */
  async getConsensusRequest(requestId, userId) {
    const db = getDatabase();

    const request = db.prepare(`
      SELECT * FROM consensus_requests WHERE id = ? AND user_id = ?
    `).get(requestId, userId);

    if (!request) {
      return null;
    }

    const state = this.activeVotes.get(requestId);

    return {
      ...request,
      options: JSON.parse(request.options || '[]'),
      agentIds: JSON.parse(request.agent_ids || '[]'),
      result: request.result ? JSON.parse(request.result) : null,
      currentState: state ? {
        votesReceived: state.votes.size,
        totalVoters: state.totalVoters,
        requiredVotes: state.requiredVotes,
        expiresAt: new Date(state.expiresAt).toISOString(),
      } : null,
    };
  }

  /**
   * Get consensus requests for a user
   * @param {string} userId - User ID
   * @param {Object} options - Filter options
   * @returns {Promise<Array>} List of consensus requests
   */
  async getConsensusRequests(userId, options = {}) {
    const { status, agentId, limit = 50 } = options;
    const db = getDatabase();

    let query = `
      SELECT * FROM consensus_requests WHERE user_id = ?
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

    const requests = db.prepare(query).all(...params);

    return requests.map(r => ({
      ...r,
      options: JSON.parse(r.options || '[]'),
      agentIds: JSON.parse(r.agent_ids || '[]'),
      result: r.result ? JSON.parse(r.result) : null,
    }));
  }

  /**
   * Clean up expired votes
   */
  async cleanupExpired() {
    const now = Date.now();

    for (const [requestId, state] of this.activeVotes) {
      if (now > state.expiresAt) {
        await this.expireConsensus(requestId);
      }
    }
  }
}

// Singleton instance
let consensusServiceInstance = null;

function getConsensusService() {
  if (!consensusServiceInstance) {
    consensusServiceInstance = new ConsensusService();
  }
  return consensusServiceInstance;
}

module.exports = {
  ConsensusService,
  getConsensusService,
};
