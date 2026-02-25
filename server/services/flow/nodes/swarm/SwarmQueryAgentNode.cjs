/**
 * Swarm Query Agent Node
 *
 * Sends a query to a specific AI agent and returns the response.
 */

const { BaseNodeExecutor } = require('../../BaseNodeExecutor.cjs');

class SwarmQueryAgentNode extends BaseNodeExecutor {
  constructor() {
    super('swarm:queryAgent', 'swarm');
  }

  /**
   * Get static metadata for this node type
   */
  static getMetadata() {
    return {
      type: 'swarm:queryAgent',
      label: 'Query Agent',
      description: 'Send a query to a specific AI agent and get a response',
      icon: 'MessageSquare',
      category: 'swarm',
      color: 'pink',
      properties: {
        agentId: {
          type: 'agent',
          label: 'Agent',
          description: 'Select the agent to query',
          required: true
        },
        query: {
          type: 'textarea',
          label: 'Query',
          description: 'The message to send to the agent',
          required: true,
          showVariablePicker: true,
          placeholder: 'Ask the agent something...'
        },
        systemPromptOverride: {
          type: 'textarea',
          label: 'System Prompt Override',
          description: 'Override the agent\'s default system prompt',
          showVariablePicker: true
        },
        contextMessages: {
          type: 'number',
          label: 'Context Messages',
          description: 'Number of previous conversation messages to include',
          default: 5,
          min: 0,
          max: 50
        },
        conversationId: {
          type: 'variable',
          label: 'Conversation ID',
          description: 'Optional conversation for context',
          showVariablePicker: true
        },
        temperature: {
          type: 'number',
          label: 'Temperature',
          description: 'AI response randomness (0-2)',
          default: 0.7,
          min: 0,
          max: 2,
          step: 0.1
        },
        maxTokens: {
          type: 'number',
          label: 'Max Tokens',
          description: 'Maximum response length',
          default: 4096,
          min: 1,
          max: 128000
        },
        timeout: {
          type: 'number',
          label: 'Timeout (seconds)',
          description: 'Maximum time to wait for response',
          default: 30,
          min: 5,
          max: 300
        }
      },
      outputs: {
        default: { label: 'Response', type: 'default' },
        error: { label: 'Error', type: 'conditional' }
      },
      getDefaultConfig: () => ({
        agentId: '',
        query: '',
        systemPromptOverride: '',
        contextMessages: 5,
        conversationId: '',
        temperature: 0.7,
        maxTokens: 4096,
        timeout: 30
      })
    };
  }

  /**
   * Validate node configuration
   */
  validate(node) {
    const errors = [];
    const data = node.data || {};

    if (!data.agentId) {
      errors.push('Agent is required');
    }

    if (!data.query) {
      errors.push('Query is required');
    }

    return errors;
  }

  /**
   * Execute the node
   */
  async execute(context) {
    const {
      agentId,
      query,
      systemPromptOverride,
      contextMessages,
      conversationId,
      temperature,
      maxTokens,
      timeout
    } = context.node.data;

    // Resolve template variables
    const resolvedQuery = this.resolveTemplate(query, context);
    const resolvedSystemPrompt = this.resolveTemplate(systemPromptOverride, context);
    const resolvedConversationId = this.resolveTemplate(conversationId, context);

    if (!agentId) {
      return this.failure('Agent ID is required', 'MISSING_AGENT');
    }

    if (!resolvedQuery) {
      return this.failure('Query is required', 'MISSING_QUERY');
    }

    try {
      // Get swarm services
      const { swarm, ai } = context.services;

      if (!swarm && !ai) {
        return this.failure('Swarm or AI service not available', 'SERVICE_UNAVAILABLE');
      }

      // Get agent details
      const agent = await this.getAgent(context, agentId);
      if (!agent) {
        return this.failure(`Agent not found: ${agentId}`, 'AGENT_NOT_FOUND');
      }

      // Build messages array
      const messages = await this.buildMessages(context, {
        query: resolvedQuery,
        agent,
        conversationId: resolvedConversationId,
        contextMessages,
        systemPromptOverride: resolvedSystemPrompt
      });

      // Execute AI request
      const result = await this.executeQuery(context, {
        agent,
        messages,
        temperature,
        maxTokens,
        timeout
      });

      return this.success({
        agentId,
        agentName: agent.name,
        query: resolvedQuery,
        response: result.content,
        model: result.model,
        provider: result.provider,
        tokensUsed: result.usage?.totalTokens || 0,
        executedAt: new Date().toISOString()
      });

    } catch (error) {
      context.logger.error(`Query agent failed: ${error.message}`);

      // Check if error is recoverable
      const recoverable = ['TIMEOUT', 'RATE_LIMIT', 'SERVICE_UNAVAILABLE'].includes(error.code);

      return this.failure(error.message, error.code || 'QUERY_ERROR', recoverable);
    }
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

    // Fallback to database
    const db = context.services.database || require('../../../database.cjs').getDatabase();
    const agent = db.prepare(`
      SELECT * FROM agents WHERE id = ? AND user_id = ?
    `).get(agentId, context.userId);

    return agent;
  }

  /**
   * Build messages array for AI request
   * @private
   */
  async buildMessages(context, options) {
    const { query, agent, conversationId, contextMessages, systemPromptOverride } = options;

    const messages = [];

    // Add system prompt
    const systemPrompt = systemPromptOverride || agent.system_prompt || agent.systemPrompt;
    if (systemPrompt) {
      messages.push({
        role: 'system',
        content: systemPrompt
      });
    }

    // Add conversation context if available
    if (conversationId && contextMessages > 0) {
      const historyMessages = await this.getConversationHistory(context, conversationId, contextMessages);
      messages.push(...historyMessages);
    }

    // Add the query
    messages.push({
      role: 'user',
      content: query
    });

    return messages;
  }

  /**
   * Get conversation history
   * @private
   */
  async getConversationHistory(context, conversationId, limit) {
    try {
      const db = context.services.database || require('../../../database.cjs').getDatabase();

      const rows = db.prepare(`
        SELECT role, content FROM messages
        WHERE conversation_id = ?
        ORDER BY created_at DESC
        LIMIT ?
      `).all(conversationId, limit);

      // Reverse to get chronological order
      return rows.reverse().map(row => ({
        role: row.role === 'agent' ? 'assistant' : row.role,
        content: row.content
      }));
    } catch (error) {
      context.logger.warn(`Failed to get conversation history: ${error.message}`);
      return [];
    }
  }

  /**
   * Execute AI query
   * @private
   */
  async executeQuery(context, options) {
    const { agent, messages, temperature, maxTokens, timeout } = options;
    const { ai, swarm } = context.services;

    // Use SuperBrain if available
    if (ai?.process) {
      return ai.process({
        task: messages[messages.length - 1].content,
        messages: messages.slice(0, -1),
        userId: context.userId,
        agentId: agent.id
      }, {
        temperature,
        maxTokens,
        timeout: timeout * 1000
      });
    }

    // Use swarm orchestrator if available
    if (swarm?.queryAgent) {
      return swarm.queryAgent(agent.id, {
        message: messages[messages.length - 1].content,
        contextMessages: messages.slice(0, -1),
        userId: context.userId,
        temperature,
        maxTokens,
        timeout: timeout * 1000
      });
    }

    throw new Error('No AI service available');
  }
}

module.exports = { SwarmQueryAgentNode };
