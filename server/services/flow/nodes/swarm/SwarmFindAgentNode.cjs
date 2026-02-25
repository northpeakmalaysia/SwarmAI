/**
 * Swarm Find Agent Node
 *
 * Finds the best available agent based on skills and criteria.
 */

const { BaseNodeExecutor } = require('../../BaseNodeExecutor.cjs');

class SwarmFindAgentNode extends BaseNodeExecutor {
  constructor() {
    super('swarm:findAgent', 'swarm');
  }

  /**
   * Get static metadata for this node type
   */
  static getMetadata() {
    return {
      type: 'swarm:findAgent',
      label: 'Find Best Agent',
      description: 'Find the best available agent based on skills and criteria',
      icon: 'Search',
      category: 'swarm',
      color: 'pink',
      properties: {
        requiredSkills: {
          type: 'array',
          label: 'Required Skills',
          description: 'Skills the agent must have (all required)'
        },
        preferredSkills: {
          type: 'array',
          label: 'Preferred Skills',
          description: 'Skills that are preferred but not required'
        },
        taskDescription: {
          type: 'textarea',
          label: 'Task Description',
          description: 'Description of the task (used for AI-based matching)',
          showVariablePicker: true
        },
        selectionStrategy: {
          type: 'select',
          label: 'Selection Strategy',
          description: 'How to select the best agent',
          options: [
            { value: 'best_match', label: 'Best Skill Match' },
            { value: 'least_busy', label: 'Least Busy Agent' },
            { value: 'highest_reputation', label: 'Highest Reputation' },
            { value: 'round_robin', label: 'Round Robin' },
            { value: 'random', label: 'Random Selection' }
          ],
          default: 'best_match'
        },
        statusFilter: {
          type: 'select',
          label: 'Status Filter',
          description: 'Filter agents by status',
          options: [
            { value: 'idle', label: 'Idle Only' },
            { value: 'available', label: 'Available (Idle or Busy)' },
            { value: 'any', label: 'Any Status' }
          ],
          default: 'idle'
        },
        excludeAgentIds: {
          type: 'array',
          label: 'Exclude Agents',
          description: 'Agent IDs to exclude from selection'
        },
        fallbackAgentId: {
          type: 'agent',
          label: 'Fallback Agent',
          description: 'Agent to use if no match found'
        },
        storeInVariable: {
          type: 'text',
          label: 'Store In Variable',
          description: 'Store the selected agent ID in this flow variable',
          placeholder: 'selectedAgentId'
        }
      },
      outputs: {
        found: { label: 'Agent Found', type: 'default' },
        notFound: { label: 'Not Found', type: 'conditional' }
      },
      getDefaultConfig: () => ({
        requiredSkills: [],
        preferredSkills: [],
        taskDescription: '',
        selectionStrategy: 'best_match',
        statusFilter: 'idle',
        excludeAgentIds: [],
        fallbackAgentId: '',
        storeInVariable: ''
      })
    };
  }

  /**
   * Execute the node
   */
  async execute(context) {
    const {
      requiredSkills,
      preferredSkills,
      taskDescription,
      selectionStrategy,
      statusFilter,
      excludeAgentIds,
      fallbackAgentId,
      storeInVariable
    } = context.node.data;

    const resolvedTask = this.resolveTemplate(taskDescription, context);

    try {
      // Get all agents
      const allAgents = await this.getAllAgents(context);

      if (allAgents.length === 0) {
        return this.handleNoAgents(context, fallbackAgentId, storeInVariable);
      }

      // Filter agents
      let candidates = this.filterAgents(allAgents, {
        statusFilter,
        excludeAgentIds,
        requiredSkills
      });

      if (candidates.length === 0) {
        return this.handleNoAgents(context, fallbackAgentId, storeInVariable);
      }

      // Score and rank agents
      const scoredAgents = this.scoreAgents(candidates, {
        requiredSkills,
        preferredSkills,
        selectionStrategy
      });

      // Select best agent
      const selectedAgent = this.selectAgent(scoredAgents, selectionStrategy);

      if (!selectedAgent) {
        return this.handleNoAgents(context, fallbackAgentId, storeInVariable);
      }

      // Store in variable if specified
      if (storeInVariable) {
        context.variables[storeInVariable] = selectedAgent.id;
      }

      return this.success({
        agentId: selectedAgent.id,
        agentName: selectedAgent.name,
        matchScore: selectedAgent.score,
        matchedSkills: selectedAgent.matchedSkills,
        status: selectedAgent.status,
        reputationScore: selectedAgent.reputation_score || selectedAgent.reputationScore,
        isFallback: false,
        selectionStrategy
      }, ['found']);

    } catch (error) {
      context.logger.error(`Find agent failed: ${error.message}`);
      return this.failure(error.message, error.code || 'FIND_AGENT_ERROR', true);
    }
  }

  /**
   * Handle case when no agents found
   * @private
   */
  async handleNoAgents(context, fallbackAgentId, storeInVariable) {
    if (fallbackAgentId) {
      const fallback = await this.getAgent(context, fallbackAgentId);
      if (fallback) {
        if (storeInVariable) {
          context.variables[storeInVariable] = fallback.id;
        }
        return this.success({
          agentId: fallback.id,
          agentName: fallback.name,
          isFallback: true
        }, ['found']);
      }
    }

    return this.success({
      found: false,
      reason: 'No matching agents available'
    }, ['notFound']);
  }

  /**
   * Get all agents for user
   * @private
   */
  async getAllAgents(context) {
    const { swarm } = context.services;

    if (swarm?.getAgents) {
      return swarm.getAgents(context.userId);
    }

    const db = context.services.database || require('../../../database.cjs').getDatabase();
    return db.prepare(`
      SELECT * FROM agents WHERE user_id = ?
    `).all(context.userId);
  }

  /**
   * Get specific agent
   * @private
   */
  async getAgent(context, agentId) {
    const { swarm } = context.services;

    if (swarm?.getAgent) {
      return swarm.getAgent(agentId, context.userId);
    }

    const db = context.services.database || require('../../../database.cjs').getDatabase();
    return db.prepare(`
      SELECT * FROM agents WHERE id = ? AND user_id = ?
    `).get(agentId, context.userId);
  }

  /**
   * Filter agents based on criteria
   * @private
   */
  filterAgents(agents, options) {
    const { statusFilter, excludeAgentIds, requiredSkills } = options;

    return agents.filter(agent => {
      // Exclude specific agents
      if (excludeAgentIds && excludeAgentIds.includes(agent.id)) {
        return false;
      }

      // Status filter
      if (statusFilter === 'idle' && agent.status !== 'idle') {
        return false;
      }
      if (statusFilter === 'available' && agent.status === 'offline') {
        return false;
      }

      // Required skills filter
      if (requiredSkills && requiredSkills.length > 0) {
        const agentSkills = this.parseSkills(agent.skills);
        const hasAllRequired = requiredSkills.every(skill =>
          agentSkills.some(s => s.toLowerCase() === skill.toLowerCase())
        );
        if (!hasAllRequired) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Score agents based on criteria
   * @private
   */
  scoreAgents(agents, options) {
    const { requiredSkills, preferredSkills, selectionStrategy } = options;

    return agents.map(agent => {
      const agentSkills = this.parseSkills(agent.skills);
      let score = 0;
      const matchedSkills = [];

      // Score for required skills (2 points each)
      if (requiredSkills) {
        for (const skill of requiredSkills) {
          if (agentSkills.some(s => s.toLowerCase() === skill.toLowerCase())) {
            score += 2;
            matchedSkills.push(skill);
          }
        }
      }

      // Score for preferred skills (1 point each)
      if (preferredSkills) {
        for (const skill of preferredSkills) {
          if (agentSkills.some(s => s.toLowerCase() === skill.toLowerCase())) {
            score += 1;
            if (!matchedSkills.includes(skill)) {
              matchedSkills.push(skill);
            }
          }
        }
      }

      // Bonus for reputation
      const reputation = agent.reputation_score || agent.reputationScore || 50;
      score += reputation / 20; // 0-5 points based on reputation

      // Bonus for idle status
      if (agent.status === 'idle') {
        score += 2;
      }

      return {
        ...agent,
        score,
        matchedSkills
      };
    });
  }

  /**
   * Select agent based on strategy
   * @private
   */
  selectAgent(scoredAgents, strategy) {
    if (scoredAgents.length === 0) {
      return null;
    }

    switch (strategy) {
      case 'best_match':
        // Highest score
        return scoredAgents.sort((a, b) => b.score - a.score)[0];

      case 'highest_reputation':
        // Highest reputation
        return scoredAgents.sort((a, b) =>
          (b.reputation_score || b.reputationScore || 0) -
          (a.reputation_score || a.reputationScore || 0)
        )[0];

      case 'least_busy':
        // Prefer idle, then by reputation
        return scoredAgents.sort((a, b) => {
          if (a.status === 'idle' && b.status !== 'idle') return -1;
          if (a.status !== 'idle' && b.status === 'idle') return 1;
          return (b.reputation_score || 0) - (a.reputation_score || 0);
        })[0];

      case 'round_robin':
        // Least recently used (by updated_at)
        return scoredAgents.sort((a, b) => {
          const aTime = new Date(a.updated_at || a.updatedAt || 0).getTime();
          const bTime = new Date(b.updated_at || b.updatedAt || 0).getTime();
          return aTime - bTime;
        })[0];

      case 'random':
        // Random selection
        return scoredAgents[Math.floor(Math.random() * scoredAgents.length)];

      default:
        return scoredAgents[0];
    }
  }

  /**
   * Parse skills from agent
   * @private
   */
  parseSkills(skills) {
    if (!skills) return [];
    if (Array.isArray(skills)) return skills;
    if (typeof skills === 'string') {
      try {
        return JSON.parse(skills);
      } catch {
        return skills.split(',').map(s => s.trim());
      }
    }
    return [];
  }
}

module.exports = { SwarmFindAgentNode };
