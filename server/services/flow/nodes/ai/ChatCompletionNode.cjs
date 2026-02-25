/**
 * Chat Completion Node
 *
 * Executes an AI chat completion request using the configured AI provider.
 * Supports system prompts, message history, and various model parameters.
 */

const { BaseNodeExecutor } = require('../../BaseNodeExecutor.cjs');
const { getSuperBrainRouter } = require('../../../ai/SuperBrainRouter.cjs');

class ChatCompletionNode extends BaseNodeExecutor {
  constructor() {
    super('ai:chatCompletion', 'ai');
  }

  async execute(context) {
    const { input, node, services } = context;
    const data = node.data || {};

    // Get SuperBrain Router for Task Routing
    const superBrain = getSuperBrainRouter();

    // Build messages array
    const messages = [];

    // Add system prompt if provided
    const systemPrompt = this.resolveTemplate(
      this.getOptional(data, 'systemPrompt', ''),
      context
    );
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }

    // Add message history if provided
    const messageHistory = this.getOptional(data, 'messageHistory', []);
    if (Array.isArray(messageHistory)) {
      for (const msg of messageHistory) {
        messages.push({
          role: msg.role || 'user',
          content: this.resolveTemplate(msg.content || '', context),
        });
      }
    }

    // Add the main prompt/message
    const prompt = this.resolveTemplate(
      this.getOptional(data, 'prompt', '{{input.message}}'),
      context
    );
    if (prompt) {
      messages.push({ role: 'user', content: prompt });
    }

    // Validate we have at least one message
    if (messages.length === 0) {
      return this.failure('No messages to send. Provide a prompt or message history.', 'NO_MESSAGES');
    }

    // Get model configuration
    const temperature = this.getOptional(data, 'temperature', 0.7);
    const maxTokens = this.getOptional(data, 'maxTokens', null);
    const forceTier = this.getOptional(data, 'tier', null); // Allow tier override
    let forceProvider = this.getOptional(data, 'providerId', null); // Allow provider override
    const timeout = this.getOptional(data, 'timeout', null); // Custom timeout for CLI tools

    // Handle special provider values
    const useTaskRouting = forceProvider === 'task-routing';
    if (useTaskRouting) {
      // Task Routing - let SuperBrain classify and route based on tier
      forceProvider = null; // Don't force provider, use tier-based routing
    }

    try {
      // Route through SuperBrain for Task Routing with fallback support
      const result = await superBrain.process({
        task: prompt,
        messages,
        userId: context.userId,
        forceTier: useTaskRouting ? null : forceTier, // Let SuperBrain classify if task routing
        forceProvider,
      }, {
        temperature: parseFloat(temperature),
        maxTokens: maxTokens ? parseInt(maxTokens, 10) : undefined,
        timeout: timeout ? parseInt(timeout, 10) : undefined,
        agentId: context.agentId,
      });

      return this.success({
        content: result.content,
        model: result.model,
        provider: result.provider,
        tier: result.classification?.tier,
        usage: result.usage,
        messages: messages.length,
        completedAt: new Date().toISOString(),
      });
    } catch (error) {
      // Check if error is recoverable (rate limit, timeout)
      const isRecoverable =
        error.message.includes('rate limit') ||
        error.message.includes('timeout') ||
        error.message.includes('503') ||
        error.message.includes('429');

      return this.failure(
        `AI completion failed: ${error.message}`,
        'AI_ERROR',
        isRecoverable
      );
    }
  }

  validate(node) {
    const errors = [];
    const data = node.data || {};

    // Must have either a prompt or message history
    const hasPrompt = data.prompt && data.prompt.trim();
    const hasHistory = Array.isArray(data.messageHistory) && data.messageHistory.length > 0;

    if (!hasPrompt && !hasHistory) {
      errors.push('Either prompt or messageHistory is required');
    }

    // Validate temperature if provided
    if (data.temperature !== undefined) {
      const temp = parseFloat(data.temperature);
      if (isNaN(temp) || temp < 0 || temp > 2) {
        errors.push('Temperature must be a number between 0 and 2');
      }
    }

    // Validate maxTokens if provided
    if (data.maxTokens !== undefined) {
      const tokens = parseInt(data.maxTokens, 10);
      if (isNaN(tokens) || tokens < 1) {
        errors.push('maxTokens must be a positive integer');
      }
    }

    // Validate tier if provided (for Task Routing override)
    if (data.tier !== undefined && data.tier !== null) {
      const validTiers = ['trivial', 'simple', 'moderate', 'complex', 'critical'];
      if (!validTiers.includes(data.tier)) {
        errors.push(`Invalid tier. Must be one of: ${validTiers.join(', ')}`);
      }
    }

    // Validate timeout if provided (for CLI tools)
    if (data.timeout !== undefined) {
      const timeout = parseInt(data.timeout, 10);
      if (isNaN(timeout) || timeout < 1000) {
        errors.push('timeout must be at least 1000ms (1 second)');
      }
    }

    return errors;
  }
}

module.exports = { ChatCompletionNode };
