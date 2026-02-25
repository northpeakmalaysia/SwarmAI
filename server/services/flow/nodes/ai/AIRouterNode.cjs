/**
 * AI Router Node
 *
 * The "Main Brain" node for FlowBuilder that intelligently routes
 * user requests to appropriate tools based on intent classification.
 *
 * This node can:
 * - Classify user intent using AI
 * - Select appropriate tools based on classification
 * - Execute single tools or multi-tool chains
 * - Handle clarification requests
 * - Route to connected flow nodes
 *
 * Based on WhatsBots ai-router pattern.
 */

const { BaseNodeExecutor } = require('../../BaseNodeExecutor.cjs');
const { getAIRouterService } = require('../../../ai/AIRouterService.cjs');
const { getSystemToolsRegistry } = require('../../../ai/SystemToolsRegistry.cjs');
const { getSuperBrainRouter } = require('../../../ai/SuperBrainRouter.cjs');

class AIRouterNode extends BaseNodeExecutor {
  constructor() {
    super('ai:router', 'ai');
    this.aiRouter = null;
  }

  /**
   * Lazy initialization of AI Router
   */
  getRouter() {
    if (!this.aiRouter) {
      this.aiRouter = getAIRouterService();

      // Initialize SuperBrain if not set
      try {
        const superBrain = getSuperBrainRouter();
        this.aiRouter.setSuperBrain(superBrain);
      } catch (error) {
        // SuperBrain might not be available
      }
    }
    return this.aiRouter;
  }

  async execute(context) {
    const { input, node, services } = context;
    const data = node.data || {};

    // Get the message to process
    const message = this.resolveTemplate(
      this.getOptional(data, 'message', '{{input.message}}'),
      context
    );

    if (!message || !message.trim()) {
      return this.failure('No message provided to AI Router', 'NO_MESSAGE');
    }

    // Get configuration
    const config = {
      // Tools configuration
      enabledTools: this.getOptional(data, 'enabledTools', null), // null = all tools
      disabledTools: this.getOptional(data, 'disabledTools', []),

      // AI configuration
      customInstructions: this.resolveTemplate(
        this.getOptional(data, 'customInstructions', ''),
        context
      ),

      // Confidence threshold
      confidenceThreshold: parseFloat(this.getOptional(data, 'confidenceThreshold', 0.7)),

      // Tool execution mode
      executeTools: this.getOptional(data, 'executeTools', true), // false = classify only
      maxChainLength: parseInt(this.getOptional(data, 'maxChainLength', 3), 10),

      // Routing options
      routeToNodes: this.getOptional(data, 'routeToNodes', false), // Route to connected nodes
      toolToNodeMapping: this.getOptional(data, 'toolToNodeMapping', {}), // Map tools to node IDs
    };

    try {
      const router = this.getRouter();

      // Determine enabled tools (all except disabled)
      let enabledTools = config.enabledTools;
      if (!enabledTools) {
        const registry = getSystemToolsRegistry();
        enabledTools = registry.getAllTools().map(t => t.id);
      }

      // Remove disabled tools
      if (config.disabledTools.length > 0) {
        enabledTools = enabledTools.filter(t => !config.disabledTools.includes(t));
      }

      // Process through AI Router
      const result = await router.process({
        message,
        userId: context.userId,
        sessionId: context.executionId,
        context: {
          enabledTools,
          customInstructions: config.customInstructions,
          agentId: context.agentId,
          flowId: context.flow?.id,
        },
      });

      // If classify only mode, return classification
      if (!config.executeTools) {
        return this.success({
          classification: {
            tool: result.tool,
            tools: result.tools,
            confidence: result.confidence,
            reasoning: result.reasoning,
          },
          message,
          completedAt: new Date().toISOString(),
        });
      }

      // Check if clarification is needed
      if (result.requiresClarification) {
        return this.success({
          requiresClarification: true,
          clarificationQuestion: result.response,
          tool: 'clarify',
          confidence: result.confidence,
          completedAt: new Date().toISOString(),
        }, {
          // Route to clarify handle if configured
          nextNodes: ['clarify'],
        });
      }

      // If routing to nodes is enabled, find the mapped node
      if (config.routeToNodes) {
        const mappedNodeId = config.toolToNodeMapping[result.tool];
        if (mappedNodeId) {
          return this.success({
            routedToNode: mappedNodeId,
            tool: result.tool,
            parameters: result.results?.[0]?.result || {},
            confidence: result.confidence,
            completedAt: new Date().toISOString(),
          }, {
            nextNodes: [mappedNodeId],
          });
        }
      }

      // Return the full result
      return this.success({
        tool: result.tool,
        tools: result.tools,
        results: result.results,
        response: result.response,
        confidence: result.confidence,
        reasoning: result.reasoning,
        requestId: result.requestId,
        duration: result.duration,
        completedAt: new Date().toISOString(),
      });

    } catch (error) {
      // Check if error is recoverable
      const isRecoverable =
        error.message.includes('rate limit') ||
        error.message.includes('timeout') ||
        error.message.includes('503') ||
        error.message.includes('429');

      return this.failure(
        `AI Router failed: ${error.message}`,
        'AI_ROUTER_ERROR',
        isRecoverable
      );
    }
  }

  validate(node) {
    const errors = [];
    const data = node.data || {};

    // Must have a message source
    const hasMessage = data.message && data.message.trim();
    if (!hasMessage) {
      // Check if it uses the default
      if (!data.message?.includes('{{')) {
        errors.push('Message is required (use {{input.message}} for flow input)');
      }
    }

    // Validate confidence threshold
    if (data.confidenceThreshold !== undefined) {
      const threshold = parseFloat(data.confidenceThreshold);
      if (isNaN(threshold) || threshold < 0 || threshold > 1) {
        errors.push('Confidence threshold must be a number between 0 and 1');
      }
    }

    // Validate max chain length
    if (data.maxChainLength !== undefined) {
      const maxChain = parseInt(data.maxChainLength, 10);
      if (isNaN(maxChain) || maxChain < 1 || maxChain > 10) {
        errors.push('Max chain length must be between 1 and 10');
      }
    }

    return errors;
  }

  /**
   * Get available tools for configuration UI
   * @returns {Object[]}
   */
  static getAvailableTools() {
    const registry = getSystemToolsRegistry();
    return registry.getAllTools().map(t => ({
      id: t.id,
      name: t.name,
      description: t.description,
      category: t.category,
    }));
  }

  /**
   * Get router metrics
   * @returns {Object}
   */
  static getMetrics() {
    const router = getAIRouterService();
    return router.getMetrics();
  }
}

module.exports = { AIRouterNode };
