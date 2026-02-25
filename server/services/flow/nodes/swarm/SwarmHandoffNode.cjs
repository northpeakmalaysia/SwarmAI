/**
 * Swarm Handoff Node
 *
 * Transfers a conversation from one agent to another.
 */

const { BaseNodeExecutor } = require('../../BaseNodeExecutor.cjs');

class SwarmHandoffNode extends BaseNodeExecutor {
  constructor() {
    super('swarm:handoff', 'swarm');
  }

  /**
   * Get static metadata for this node type
   */
  static getMetadata() {
    return {
      type: 'swarm:handoff',
      label: 'Agent Handoff',
      description: 'Transfer a conversation to another agent',
      icon: 'ArrowRightLeft',
      category: 'swarm',
      color: 'pink',
      properties: {
        conversationId: {
          type: 'variable',
          label: 'Conversation ID',
          description: 'The conversation to hand off',
          required: true,
          showVariablePicker: true
        },
        targetAgentId: {
          type: 'agent',
          label: 'Target Agent',
          description: 'The agent to transfer to'
        },
        autoSelectAgent: {
          type: 'boolean',
          label: 'Auto-Select Agent',
          description: 'Automatically select the best available agent',
          default: false
        },
        requiredSkills: {
          type: 'array',
          label: 'Required Skills',
          description: 'Skills the target agent must have',
          conditionalDisplay: { field: 'autoSelectAgent', value: true }
        },
        reason: {
          type: 'textarea',
          label: 'Handoff Reason',
          description: 'Reason for the handoff (included in context)',
          showVariablePicker: true
        },
        summary: {
          type: 'textarea',
          label: 'Conversation Summary',
          description: 'Summary to provide to the new agent',
          showVariablePicker: true
        },
        preserveContext: {
          type: 'boolean',
          label: 'Preserve Context',
          description: 'Include conversation history for new agent',
          default: true
        },
        contextMessageCount: {
          type: 'number',
          label: 'Context Messages',
          description: 'Number of previous messages to include',
          default: 10,
          min: 0,
          max: 50,
          conditionalDisplay: { field: 'preserveContext', value: true }
        },
        notifyUser: {
          type: 'boolean',
          label: 'Notify User',
          description: 'Send a message to the user about the handoff',
          default: true
        },
        notificationMessage: {
          type: 'textarea',
          label: 'Notification Message',
          description: 'Message to send to user about the handoff',
          default: "I'm transferring you to {{targetAgent.name}} who can better assist you.",
          showVariablePicker: true,
          conditionalDisplay: { field: 'notifyUser', value: true }
        }
      },
      outputs: {
        default: { label: 'Handoff Complete', type: 'default' },
        failed: { label: 'Failed', type: 'conditional' }
      },
      getDefaultConfig: () => ({
        conversationId: '',
        targetAgentId: '',
        autoSelectAgent: false,
        requiredSkills: [],
        reason: '',
        summary: '',
        preserveContext: true,
        contextMessageCount: 10,
        notifyUser: true,
        notificationMessage: "I'm transferring you to {{targetAgent.name}} who can better assist you."
      })
    };
  }

  /**
   * Validate node configuration
   */
  validate(node) {
    const errors = [];
    const data = node.data || {};

    if (!data.conversationId) {
      errors.push('Conversation ID is required');
    }

    if (!data.autoSelectAgent && !data.targetAgentId) {
      errors.push('Target agent is required when auto-select is disabled');
    }

    return errors;
  }

  /**
   * Execute the node
   */
  async execute(context) {
    const {
      conversationId,
      targetAgentId,
      autoSelectAgent,
      requiredSkills,
      reason,
      summary,
      preserveContext,
      contextMessageCount,
      notifyUser,
      notificationMessage
    } = context.node.data;

    const resolvedConversationId = this.resolveTemplate(conversationId, context);
    const resolvedReason = this.resolveTemplate(reason, context);
    const resolvedSummary = this.resolveTemplate(summary, context);

    if (!resolvedConversationId) {
      return this.failure('Conversation ID is required', 'MISSING_CONVERSATION');
    }

    try {
      // Get conversation
      const conversation = await this.getConversation(context, resolvedConversationId);
      if (!conversation) {
        return this.failure('Conversation not found', 'CONVERSATION_NOT_FOUND');
      }

      const sourceAgentId = conversation.agent_id || conversation.agentId;

      // Determine target agent
      let targetAgent;
      if (autoSelectAgent) {
        targetAgent = await this.findBestAgent(context, requiredSkills, sourceAgentId);
        if (!targetAgent) {
          return this.failure('No suitable agent available for handoff', 'NO_AGENT_AVAILABLE', ['failed']);
        }
      } else {
        targetAgent = await this.getAgent(context, targetAgentId);
        if (!targetAgent) {
          return this.failure(`Target agent not found: ${targetAgentId}`, 'AGENT_NOT_FOUND', ['failed']);
        }
      }

      // Get conversation context if needed
      let conversationContext = null;
      if (preserveContext) {
        conversationContext = await this.getConversationContext(context, resolvedConversationId, contextMessageCount);
      }

      // Create handoff record
      const handoff = await this.createHandoff(context, {
        conversationId: resolvedConversationId,
        sourceAgentId,
        targetAgentId: targetAgent.id,
        reason: resolvedReason,
        summary: resolvedSummary,
        context: conversationContext
      });

      // Update conversation assignment
      await this.updateConversationAgent(context, resolvedConversationId, targetAgent.id);

      // Send notification to user if enabled
      if (notifyUser) {
        const message = this.resolveTemplate(notificationMessage, {
          ...context,
          variables: {
            ...context.variables,
            targetAgent: {
              id: targetAgent.id,
              name: targetAgent.name
            }
          }
        });
        await this.sendNotification(context, resolvedConversationId, message);
      }

      // Emit handoff event
      this.emitHandoffEvent(context, handoff, targetAgent);

      return this.success({
        handoffId: handoff.id,
        conversationId: resolvedConversationId,
        sourceAgentId,
        targetAgentId: targetAgent.id,
        targetAgentName: targetAgent.name,
        reason: resolvedReason,
        contextIncluded: preserveContext,
        userNotified: notifyUser,
        handoffAt: new Date().toISOString()
      });

    } catch (error) {
      context.logger.error(`Handoff failed: ${error.message}`);
      return this.failure(error.message, error.code || 'HANDOFF_ERROR', true);
    }
  }

  /**
   * Get conversation by ID
   * @private
   */
  async getConversation(context, conversationId) {
    const db = context.services.database || require('../../../database.cjs').getDatabase();
    return db.prepare(`
      SELECT * FROM conversations WHERE id = ? AND user_id = ?
    `).get(conversationId, context.userId);
  }

  /**
   * Get agent by ID
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
   * Find best agent for handoff
   * @private
   */
  async findBestAgent(context, requiredSkills, excludeAgentId) {
    const { swarm } = context.services;

    if (swarm?.findBestAgent) {
      return swarm.findBestAgent(context.userId, {
        requiredSkills: requiredSkills || [],
        excludeAgentIds: excludeAgentId ? [excludeAgentId] : []
      });
    }

    // Fallback to simple query
    const db = context.services.database || require('../../../database.cjs').getDatabase();
    let query = `
      SELECT * FROM agents
      WHERE user_id = ? AND status != 'offline'
    `;
    const params = [context.userId];

    if (excludeAgentId) {
      query += ' AND id != ?';
      params.push(excludeAgentId);
    }

    query += ' ORDER BY reputation_score DESC LIMIT 1';

    return db.prepare(query).get(...params);
  }

  /**
   * Get conversation context
   * @private
   */
  async getConversationContext(context, conversationId, limit) {
    const db = context.services.database || require('../../../database.cjs').getDatabase();

    const messages = db.prepare(`
      SELECT role, content, created_at FROM messages
      WHERE conversation_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(conversationId, limit);

    return messages.reverse();
  }

  /**
   * Create handoff record
   * @private
   */
  async createHandoff(context, options) {
    const { swarm } = context.services;

    if (swarm?.initiateHandoff) {
      return swarm.initiateHandoff(options);
    }

    // Create handoff record in database
    const db = context.services.database || require('../../../database.cjs').getDatabase();
    const { v4: uuidv4 } = require('uuid');
    const id = uuidv4();

    db.prepare(`
      INSERT INTO swarm_handoffs (
        id, user_id, conversation_id, source_agent_id, target_agent_id,
        reason, summary, context, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'completed', datetime('now'))
    `).run(
      id,
      context.userId,
      options.conversationId,
      options.sourceAgentId,
      options.targetAgentId,
      options.reason || null,
      options.summary || null,
      options.context ? JSON.stringify(options.context) : null
    );

    return { id, ...options, status: 'completed' };
  }

  /**
   * Update conversation agent assignment
   * @private
   */
  async updateConversationAgent(context, conversationId, agentId) {
    const db = context.services.database || require('../../../database.cjs').getDatabase();

    db.prepare(`
      UPDATE conversations SET agent_id = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(agentId, conversationId);
  }

  /**
   * Send notification message to user
   * @private
   */
  async sendNotification(context, conversationId, message) {
    const { messaging } = context.services;

    if (messaging?.sendToConversation) {
      await messaging.sendToConversation(conversationId, {
        content: message,
        role: 'agent',
        type: 'handoff_notification'
      });
    }
  }

  /**
   * Emit handoff event
   * @private
   */
  emitHandoffEvent(context, handoff, targetAgent) {
    if (global.wsBroadcast) {
      global.wsBroadcast('swarm:handoff', {
        handoffId: handoff.id,
        conversationId: handoff.conversationId,
        sourceAgentId: handoff.sourceAgentId,
        targetAgentId: targetAgent.id,
        targetAgentName: targetAgent.name,
        timestamp: new Date().toISOString()
      });
    }
  }
}

module.exports = { SwarmHandoffNode };
