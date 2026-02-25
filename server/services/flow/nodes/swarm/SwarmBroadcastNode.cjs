/**
 * Swarm Broadcast Node
 *
 * Broadcasts a message to multiple agents and collects their responses.
 */

const { BaseNodeExecutor } = require('../../BaseNodeExecutor.cjs');

class SwarmBroadcastNode extends BaseNodeExecutor {
  constructor() {
    super('swarm:broadcast', 'swarm');
  }

  /**
   * Get static metadata for this node type
   */
  static getMetadata() {
    return {
      type: 'swarm:broadcast',
      label: 'Broadcast to Agents',
      description: 'Send a message to multiple agents and collect responses',
      icon: 'Radio',
      category: 'swarm',
      color: 'pink',
      properties: {
        message: {
          type: 'textarea',
          label: 'Message',
          description: 'The message to broadcast to all agents',
          required: true,
          showVariablePicker: true
        },
        agentIds: {
          type: 'multiselect',
          label: 'Target Agents',
          description: 'Select specific agents to broadcast to (leave empty for all)',
          options: [] // Dynamically populated
        },
        agentFilter: {
          type: 'select',
          label: 'Agent Filter',
          description: 'Filter which agents receive the broadcast',
          options: [
            { value: 'all', label: 'All Available Agents' },
            { value: 'selected', label: 'Selected Agents Only' },
            { value: 'skill', label: 'By Skill' },
            { value: 'status', label: 'By Status' }
          ],
          default: 'all'
        },
        requiredSkills: {
          type: 'array',
          label: 'Required Skills',
          description: 'Only broadcast to agents with these skills',
          conditionalDisplay: { field: 'agentFilter', value: 'skill' }
        },
        statusFilter: {
          type: 'select',
          label: 'Status Filter',
          options: [
            { value: 'idle', label: 'Idle Only' },
            { value: 'busy', label: 'Busy Only' },
            { value: 'any', label: 'Any Status' }
          ],
          default: 'idle',
          conditionalDisplay: { field: 'agentFilter', value: 'status' }
        },
        responseMode: {
          type: 'select',
          label: 'Response Mode',
          description: 'How to collect responses from agents',
          options: [
            { value: 'all', label: 'Wait for All Responses' },
            { value: 'first', label: 'First Response Only' },
            { value: 'none', label: 'No Response (Fire and Forget)' }
          ],
          default: 'all'
        },
        timeout: {
          type: 'number',
          label: 'Timeout (seconds)',
          description: 'Maximum time to wait for responses',
          default: 30,
          min: 5,
          max: 300
        },
        continueOnPartial: {
          type: 'boolean',
          label: 'Continue on Partial',
          description: 'Continue if some agents fail to respond',
          default: true
        }
      },
      outputs: {
        default: { label: 'All Responses', type: 'default' },
        partial: { label: 'Partial', type: 'conditional' },
        error: { label: 'Error', type: 'conditional' }
      },
      getDefaultConfig: () => ({
        message: '',
        agentIds: [],
        agentFilter: 'all',
        requiredSkills: [],
        statusFilter: 'idle',
        responseMode: 'all',
        timeout: 30,
        continueOnPartial: true
      })
    };
  }

  /**
   * Validate node configuration
   */
  validate(node) {
    const errors = [];
    const data = node.data || {};

    if (!data.message) {
      errors.push('Message is required');
    }

    if (data.agentFilter === 'selected' && (!data.agentIds || data.agentIds.length === 0)) {
      errors.push('At least one agent must be selected');
    }

    return errors;
  }

  /**
   * Execute the node
   */
  async execute(context) {
    const {
      message,
      agentIds,
      agentFilter,
      requiredSkills,
      statusFilter,
      responseMode,
      timeout,
      continueOnPartial
    } = context.node.data;

    const resolvedMessage = this.resolveTemplate(message, context);

    if (!resolvedMessage) {
      return this.failure('Message is required', 'MISSING_MESSAGE');
    }

    try {
      // Get target agents
      const agents = await this.getTargetAgents(context, {
        agentIds,
        agentFilter,
        requiredSkills,
        statusFilter
      });

      if (agents.length === 0) {
        return this.failure('No agents available for broadcast', 'NO_AGENTS');
      }

      context.logger.info(`Broadcasting to ${agents.length} agents`);

      // Fire and forget mode
      if (responseMode === 'none') {
        await this.sendBroadcast(context, agents, resolvedMessage);
        return this.success({
          broadcast: true,
          agentCount: agents.length,
          agentIds: agents.map(a => a.id),
          message: resolvedMessage,
          responseMode: 'none'
        });
      }

      // Wait for responses
      const responses = await this.broadcastAndWait(context, agents, resolvedMessage, {
        mode: responseMode,
        timeout,
        continueOnPartial
      });

      const successCount = responses.filter(r => r.success).length;
      const failCount = responses.filter(r => !r.success).length;

      // Determine output based on results
      if (successCount === 0) {
        return this.failure('All agents failed to respond', 'ALL_FAILED');
      }

      if (failCount > 0 && !continueOnPartial) {
        return this.success({
          broadcast: true,
          agentCount: agents.length,
          successCount,
          failCount,
          responses,
          partial: true
        }, ['partial']);
      }

      return this.success({
        broadcast: true,
        agentCount: agents.length,
        successCount,
        failCount,
        responses: responses.filter(r => r.success),
        allResponded: failCount === 0
      });

    } catch (error) {
      context.logger.error(`Broadcast failed: ${error.message}`);
      return this.failure(error.message, error.code || 'BROADCAST_ERROR', true);
    }
  }

  /**
   * Get target agents based on filter criteria
   * @private
   */
  async getTargetAgents(context, options) {
    const { agentIds, agentFilter, requiredSkills, statusFilter } = options;
    const { swarm } = context.services;

    // Get all agents for this user
    let agents = await this.getAllAgents(context);

    switch (agentFilter) {
      case 'selected':
        agents = agents.filter(a => agentIds.includes(a.id));
        break;

      case 'skill':
        if (requiredSkills && requiredSkills.length > 0) {
          agents = agents.filter(a => {
            const agentSkills = this.parseSkills(a.skills);
            return requiredSkills.every(skill => agentSkills.includes(skill));
          });
        }
        break;

      case 'status':
        if (statusFilter !== 'any') {
          agents = agents.filter(a => a.status === statusFilter);
        }
        break;

      case 'all':
      default:
        // Filter to available (idle) agents by default
        agents = agents.filter(a => a.status !== 'offline');
        break;
    }

    return agents;
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

    // Fallback to database
    const db = context.services.database || require('../../../database.cjs').getDatabase();
    return db.prepare(`
      SELECT * FROM agents WHERE user_id = ?
    `).all(context.userId);
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

  /**
   * Send broadcast without waiting for responses
   * @private
   */
  async sendBroadcast(context, agents, message) {
    const { swarm } = context.services;

    if (swarm?.broadcast) {
      return swarm.broadcast({
        userId: context.userId,
        message,
        agentIds: agents.map(a => a.id)
      });
    }

    // Emit event for each agent
    for (const agent of agents) {
      this.emitBroadcastEvent(context, agent, message);
    }
  }

  /**
   * Broadcast and wait for responses
   * @private
   */
  async broadcastAndWait(context, agents, message, options) {
    const { mode, timeout, continueOnPartial } = options;
    const { ai } = context.services;

    // Create promise for each agent
    const agentPromises = agents.map(async (agent) => {
      try {
        const response = await this.queryAgent(context, agent, message, timeout);
        return {
          success: true,
          agentId: agent.id,
          agentName: agent.name,
          response: response.content,
          model: response.model
        };
      } catch (error) {
        return {
          success: false,
          agentId: agent.id,
          agentName: agent.name,
          error: error.message
        };
      }
    });

    // Wait based on mode
    if (mode === 'first') {
      // Race to first successful response
      const result = await Promise.race(
        agentPromises.map(p => p.then(r => {
          if (r.success) return r;
          throw new Error(r.error);
        }))
      );
      return [result];
    }

    // Wait for all with timeout
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Broadcast timeout')), timeout * 1000);
    });

    try {
      const results = await Promise.race([
        Promise.allSettled(agentPromises),
        timeoutPromise
      ]);

      return results.map(r => r.status === 'fulfilled' ? r.value : {
        success: false,
        error: r.reason?.message || 'Unknown error'
      });
    } catch (error) {
      // Timeout - return partial results
      if (continueOnPartial) {
        const settled = await Promise.allSettled(
          agentPromises.map(p => Promise.race([p, Promise.resolve({ timeout: true })]))
        );
        return settled.map(r => r.status === 'fulfilled' ? r.value : { success: false, error: 'Timeout' });
      }
      throw error;
    }
  }

  /**
   * Query a single agent
   * @private
   */
  async queryAgent(context, agent, message, timeout) {
    const { ai } = context.services;

    if (ai?.process) {
      return ai.process({
        task: message,
        messages: agent.system_prompt ? [{ role: 'system', content: agent.system_prompt }] : [],
        userId: context.userId,
        agentId: agent.id
      }, {
        timeout: timeout * 1000
      });
    }

    throw new Error('AI service not available');
  }

  /**
   * Emit broadcast event
   * @private
   */
  emitBroadcastEvent(context, agent, message) {
    if (global.wsBroadcast) {
      global.wsBroadcast('swarm:broadcast', {
        agentId: agent.id,
        agentName: agent.name,
        message,
        timestamp: new Date().toISOString()
      });
    }
  }
}

module.exports = { SwarmBroadcastNode };
