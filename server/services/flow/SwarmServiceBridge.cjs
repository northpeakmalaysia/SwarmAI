/**
 * Swarm Service Bridge
 * ====================
 * Provides a unified interface for flow nodes to access swarm capabilities.
 * Acts as a facade over the various swarm services.
 *
 * Services bridged:
 * - AgentDiscoveryService: Finding and managing agents
 * - HandoffService: Conversation handoffs between agents
 * - CollaborationService: Multi-agent collaboration
 * - ConsensusService: Multi-agent voting and consensus
 * - SwarmOrchestrator: Central task management
 */

const { logger } = require('../logger.cjs');
const { getDatabase } = require('../database.cjs');

// Lazy load swarm services to avoid circular dependencies
let _swarmOrchestrator = null;
let _agentDiscovery = null;
let _handoffService = null;
let _collaborationService = null;
let _consensusService = null;
let _superBrain = null;

function getSwarmOrchestrator() {
  if (!_swarmOrchestrator) {
    try {
      const { getSwarmOrchestrator: get } = require('../swarm/SwarmOrchestrator.cjs');
      _swarmOrchestrator = get();
    } catch (e) {
      logger.warn('SwarmOrchestrator not available');
    }
  }
  return _swarmOrchestrator;
}

function getAgentDiscovery() {
  if (!_agentDiscovery) {
    try {
      const { getAgentDiscoveryService } = require('../swarm/AgentDiscoveryService.cjs');
      _agentDiscovery = getAgentDiscoveryService();
    } catch (e) {
      logger.warn('AgentDiscoveryService not available');
    }
  }
  return _agentDiscovery;
}

function getHandoffService() {
  if (!_handoffService) {
    try {
      const { getHandoffService: get } = require('../swarm/HandoffService.cjs');
      _handoffService = get();
    } catch (e) {
      logger.warn('HandoffService not available');
    }
  }
  return _handoffService;
}

function getCollaborationService() {
  if (!_collaborationService) {
    try {
      const { getCollaborationService: get } = require('../swarm/CollaborationService.cjs');
      _collaborationService = get();
    } catch (e) {
      logger.warn('CollaborationService not available');
    }
  }
  return _collaborationService;
}

function getConsensusService() {
  if (!_consensusService) {
    try {
      const { getConsensusService: get } = require('../swarm/ConsensusService.cjs');
      _consensusService = get();
    } catch (e) {
      logger.warn('ConsensusService not available');
    }
  }
  return _consensusService;
}

function getSuperBrain() {
  if (!_superBrain) {
    try {
      const { getSuperBrainRouter } = require('../ai/SuperBrainRouter.cjs');
      _superBrain = getSuperBrainRouter();
    } catch (e) {
      logger.warn('SuperBrainRouter not available');
    }
  }
  return _superBrain;
}

/**
 * Swarm Service Bridge for FlowBuilder nodes
 */
class SwarmServiceBridge {
  constructor() {
    this.db = getDatabase();
  }

  // ===========================================
  // Agent Management
  // ===========================================

  /**
   * Get an agent by ID
   * @param {string} agentId - Agent ID
   * @param {string} userId - User ID for ownership check
   */
  async getAgent(agentId, userId) {
    const discovery = getAgentDiscovery();
    if (discovery) {
      return discovery.getAgent(agentId, userId);
    }

    // Fallback to direct DB
    return this.db.prepare(`
      SELECT * FROM agents WHERE id = ? AND user_id = ?
    `).get(agentId, userId);
  }

  /**
   * Find agents matching criteria
   * @param {string} userId - User ID
   * @param {Object} criteria - Search criteria
   */
  async findAgents(userId, criteria = {}) {
    const discovery = getAgentDiscovery();
    if (discovery) {
      return discovery.findAgents(userId, criteria);
    }

    // Fallback to basic search
    let query = 'SELECT * FROM agents WHERE user_id = ?';
    const params = [userId];

    if (criteria.capabilities?.length) {
      query += ' AND capabilities LIKE ?';
      params.push(`%${criteria.capabilities[0]}%`);
    }

    if (criteria.status) {
      query += ' AND status = ?';
      params.push(criteria.status);
    }

    return this.db.prepare(query).all(...params);
  }

  /**
   * Find the best agent for a task
   * @param {string} userId - User ID
   * @param {Object} taskContext - Task context for matching
   */
  async findBestAgent(userId, taskContext) {
    const discovery = getAgentDiscovery();
    if (discovery) {
      return discovery.findBestAgent(userId, taskContext);
    }

    // Fallback: return first available agent
    return this.db.prepare(`
      SELECT * FROM agents
      WHERE user_id = ? AND status = 'available'
      ORDER BY created_at DESC
      LIMIT 1
    `).get(userId);
  }

  /**
   * Update agent status
   * @param {string} agentId - Agent ID
   * @param {string} status - New status
   */
  async updateAgentStatus(agentId, status) {
    const discovery = getAgentDiscovery();
    if (discovery) {
      return discovery.updateAgentStatus(agentId, status);
    }

    this.db.prepare(`
      UPDATE agents SET status = ?, updated_at = datetime('now') WHERE id = ?
    `).run(status, agentId);
  }

  /**
   * Get swarm status for user
   * @param {string} userId - User ID
   */
  async getSwarmStatus(userId) {
    const orchestrator = getSwarmOrchestrator();
    if (orchestrator) {
      return orchestrator.getStatus(userId);
    }

    // Basic fallback status
    const agents = this.db.prepare(`
      SELECT status, COUNT(*) as count FROM agents
      WHERE user_id = ? GROUP BY status
    `).all(userId);

    const tasks = this.db.prepare(`
      SELECT status, COUNT(*) as count FROM swarm_tasks
      WHERE user_id = ? GROUP BY status
    `).all(userId);

    return {
      agents: agents.reduce((acc, r) => ({ ...acc, [r.status]: r.count }), {}),
      tasks: tasks.reduce((acc, r) => ({ ...acc, [r.status]: r.count }), {}),
    };
  }

  // ===========================================
  // Task Management
  // ===========================================

  /**
   * Create a swarm task
   * @param {Object} options - Task options
   */
  async createTask(options) {
    const orchestrator = getSwarmOrchestrator();
    if (orchestrator) {
      return orchestrator.createTask(options);
    }

    throw new Error('SwarmOrchestrator not available');
  }

  /**
   * Execute a task with an agent
   * @param {string} taskId - Task ID
   * @param {string} agentId - Agent ID
   * @param {Object} options - Execution options
   */
  async executeTask(taskId, agentId, options = {}) {
    const orchestrator = getSwarmOrchestrator();
    if (orchestrator) {
      return orchestrator.executeTask(taskId, agentId, options);
    }

    throw new Error('SwarmOrchestrator not available');
  }

  /**
   * Get task status
   * @param {string} taskId - Task ID
   * @param {string} userId - User ID
   */
  async getTaskStatus(taskId, userId) {
    return this.db.prepare(`
      SELECT * FROM swarm_tasks WHERE id = ? AND user_id = ?
    `).get(taskId, userId);
  }

  // ===========================================
  // Agent Handoffs
  // ===========================================

  /**
   * Initiate a handoff between agents
   * @param {Object} options - Handoff options
   */
  async initiateHandoff(options) {
    const handoff = getHandoffService();
    if (handoff) {
      return handoff.initiateHandoff(options);
    }

    throw new Error('HandoffService not available');
  }

  /**
   * Accept a handoff
   * @param {string} handoffId - Handoff ID
   * @param {string} agentId - Accepting agent ID
   */
  async acceptHandoff(handoffId, agentId) {
    const handoff = getHandoffService();
    if (handoff) {
      return handoff.acceptHandoff(handoffId, agentId);
    }

    throw new Error('HandoffService not available');
  }

  /**
   * Reject a handoff
   * @param {string} handoffId - Handoff ID
   * @param {string} reason - Rejection reason
   */
  async rejectHandoff(handoffId, reason) {
    const handoff = getHandoffService();
    if (handoff) {
      return handoff.rejectHandoff(handoffId, reason);
    }

    throw new Error('HandoffService not available');
  }

  // ===========================================
  // Collaboration
  // ===========================================

  /**
   * Start a collaboration session
   * @param {Object} options - Collaboration options
   */
  async startCollaboration(options) {
    const collab = getCollaborationService();
    if (collab) {
      return collab.startCollaboration(options);
    }

    throw new Error('CollaborationService not available');
  }

  /**
   * Broadcast message to swarm
   * @param {Object} options - Broadcast options
   */
  async broadcast(options) {
    const { userId, message, agentIds, filter } = options;

    // Get target agents
    let agents;
    if (agentIds?.length) {
      agents = await Promise.all(
        agentIds.map(id => this.getAgent(id, userId))
      );
      agents = agents.filter(Boolean);
    } else {
      agents = await this.findAgents(userId, filter || {});
    }

    if (agents.length === 0) {
      return { success: false, error: 'No agents found', responses: [] };
    }

    // Broadcast and collect responses
    const responses = [];
    const superBrain = getSuperBrain();

    for (const agent of agents) {
      try {
        const response = await this.queryAgent(agent.id, message, userId, {
          timeout: options.timeout || 30000,
        });

        responses.push({
          agentId: agent.id,
          agentName: agent.name,
          success: true,
          response: response.content || response,
        });
      } catch (error) {
        responses.push({
          agentId: agent.id,
          agentName: agent.name,
          success: false,
          error: error.message,
        });
      }
    }

    return {
      success: true,
      totalAgents: agents.length,
      successCount: responses.filter(r => r.success).length,
      responses,
    };
  }

  // ===========================================
  // Consensus
  // ===========================================

  /**
   * Start a consensus vote
   * @param {Object} options - Consensus options
   */
  async startConsensus(options) {
    const consensus = getConsensusService();
    if (consensus) {
      return consensus.startVote(options);
    }

    // Simple fallback: poll all agents and determine majority
    const { userId, question, agentIds, options: voteOptions } = options;

    const agents = agentIds?.length
      ? await Promise.all(agentIds.map(id => this.getAgent(id, userId)))
      : await this.findAgents(userId, {});

    const votes = [];
    const superBrain = getSuperBrain();

    for (const agent of agents.filter(Boolean)) {
      try {
        const response = await this.queryAgent(
          agent.id,
          `Choose one option for: ${question}\nOptions: ${voteOptions.join(', ')}`,
          userId
        );

        // Parse vote from response
        const content = (response.content || response || '').toLowerCase();
        const voted = voteOptions.find(opt => content.includes(opt.toLowerCase()));

        if (voted) {
          votes.push({ agentId: agent.id, vote: voted });
        }
      } catch (error) {
        logger.warn(`Agent ${agent.id} failed to vote: ${error.message}`);
      }
    }

    // Calculate results
    const results = {};
    for (const opt of voteOptions) {
      results[opt] = votes.filter(v => v.vote === opt).length;
    }

    const winner = Object.entries(results).sort((a, b) => b[1] - a[1])[0];

    return {
      question,
      options: voteOptions,
      votes,
      results,
      winner: winner ? { option: winner[0], count: winner[1] } : null,
      consensus: winner && winner[1] > agents.length / 2,
    };
  }

  // ===========================================
  // AI Query
  // ===========================================

  /**
   * Query an agent with a message
   * @param {string} agentId - Agent ID
   * @param {string} message - Message to send
   * @param {string} userId - User ID
   * @param {Object} options - Query options
   */
  async queryAgent(agentId, message, userId, options = {}) {
    const agent = await this.getAgent(agentId, userId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    const superBrain = getSuperBrain();
    if (superBrain) {
      const messages = [];

      // Add system prompt
      if (agent.system_prompt || agent.systemPrompt) {
        messages.push({
          role: 'system',
          content: agent.system_prompt || agent.systemPrompt,
        });
      }

      // Add query
      messages.push({
        role: 'user',
        content: message,
      });

      return superBrain.process({
        task: message,
        messages,
        userId,
        agentId,
      }, {
        temperature: options.temperature ?? 0.7,
        maxTokens: options.maxTokens ?? 4096,
        timeout: options.timeout ?? 30000,
      });
    }

    throw new Error('No AI service available');
  }

  // ===========================================
  // Helper Methods
  // ===========================================

  /**
   * Check if swarm services are available
   */
  isAvailable() {
    return !!(getSwarmOrchestrator() || getAgentDiscovery());
  }

  /**
   * Get service status
   */
  getServiceStatus() {
    return {
      orchestrator: !!getSwarmOrchestrator(),
      discovery: !!getAgentDiscovery(),
      handoff: !!getHandoffService(),
      collaboration: !!getCollaborationService(),
      consensus: !!getConsensusService(),
      superBrain: !!getSuperBrain(),
    };
  }
}

// Singleton instance
let _instance = null;

function getSwarmServiceBridge() {
  if (!_instance) {
    _instance = new SwarmServiceBridge();
  }
  return _instance;
}

module.exports = {
  SwarmServiceBridge,
  getSwarmServiceBridge,
};
