/**
 * SuperBrain Node
 *
 * Routes AI requests through the SuperBrain system with explicit tier
 * classification and failover chain routing. Provides full control over
 * the Task Routing architecture with real-time provider chain visibility.
 *
 * Features:
 * - Explicit tier selection (trivial, simple, moderate, complex, critical)
 * - Custom provider chain override
 * - Failover chain visualization
 * - Classification insights
 * - Agentic task support
 */

const { BaseNodeExecutor } = require('../../BaseNodeExecutor.cjs');
const { getSuperBrainRouter } = require('../../../ai/SuperBrainRouter.cjs');

class SuperBrainNode extends BaseNodeExecutor {
  constructor() {
    super('ai:superBrain', 'ai');
  }

  /**
   * Get static metadata for this node type
   */
  static getMetadata() {
    return {
      type: 'ai:superBrain',
      label: 'SuperBrain AI',
      description: 'Route AI requests through SuperBrain with tier classification and failover',
      icon: 'Zap',
      category: 'ai',
      color: 'purple',
      properties: {
        prompt: {
          type: 'textarea',
          label: 'Prompt',
          description: 'The prompt or task to process (supports {{templates}})',
          required: true,
          showVariablePicker: true,
          rows: 4
        },
        systemPrompt: {
          type: 'textarea',
          label: 'System Prompt',
          description: 'Optional system prompt for context',
          showVariablePicker: true,
          rows: 3
        },
        tierMode: {
          type: 'select',
          label: 'Tier Mode',
          description: 'How to determine the task tier',
          options: [
            { value: 'auto', label: 'Auto-classify (Recommended)' },
            { value: 'force', label: 'Force Specific Tier' }
          ],
          default: 'auto'
        },
        forceTier: {
          type: 'select',
          label: 'Force Tier',
          description: 'Override automatic classification',
          options: [
            { value: 'trivial', label: 'Trivial - Greetings, Yes/No' },
            { value: 'simple', label: 'Simple - Quick queries, Translation' },
            { value: 'moderate', label: 'Moderate - Conversations, Analysis' },
            { value: 'complex', label: 'Complex - Code generation, Deep reasoning' },
            { value: 'critical', label: 'Critical - Agentic tasks, Autonomous' }
          ],
          default: 'moderate',
          showWhen: { tierMode: 'force' }
        },
        useCustomChain: {
          type: 'boolean',
          label: 'Use Custom Provider Chain',
          description: 'Override the default failover chain for this request',
          default: false
        },
        customProviderChain: {
          type: 'array',
          label: 'Custom Provider Chain',
          description: 'List of providers to try in order',
          showWhen: { useCustomChain: true },
          itemSchema: {
            type: 'object',
            properties: {
              provider: { type: 'text', label: 'Provider Name' },
              model: { type: 'text', label: 'Model ID' }
            }
          }
        },
        temperature: {
          type: 'number',
          label: 'Temperature',
          description: 'Creativity level (0.0 = deterministic, 1.0 = creative)',
          default: 0.7,
          min: 0,
          max: 2,
          step: 0.1
        },
        maxTokens: {
          type: 'number',
          label: 'Max Tokens',
          description: 'Maximum response length (leave empty for default)',
          min: 1,
          max: 128000
        },
        timeout: {
          type: 'number',
          label: 'Timeout (ms)',
          description: 'Request timeout in milliseconds',
          default: 30000,
          min: 1000,
          max: 300000
        },
        includeClassification: {
          type: 'boolean',
          label: 'Include Classification Details',
          description: 'Include task classification insights in output',
          default: true
        },
        includeProviderChain: {
          type: 'boolean',
          label: 'Include Provider Chain',
          description: 'Include attempted provider chain in output',
          default: false
        },
        storeInVariable: {
          type: 'text',
          label: 'Store Response In',
          description: 'Store the AI response in this variable',
          placeholder: 'aiResponse'
        }
      },
      outputs: {
        default: { label: 'Success', type: 'default' },
        error: { label: 'Error', type: 'conditional' }
      },
      getDefaultConfig: () => ({
        prompt: '',
        systemPrompt: '',
        tierMode: 'auto',
        forceTier: 'moderate',
        useCustomChain: false,
        customProviderChain: [],
        temperature: 0.7,
        maxTokens: null,
        timeout: 30000,
        includeClassification: true,
        includeProviderChain: false,
        storeInVariable: ''
      })
    };
  }

  /**
   * Validate node configuration
   */
  validate(node) {
    const errors = [];
    const data = node.data || {};

    if (!data.prompt) {
      errors.push('Prompt is required');
    }

    if (data.temperature !== undefined) {
      const temp = parseFloat(data.temperature);
      if (isNaN(temp) || temp < 0 || temp > 2) {
        errors.push('Temperature must be between 0 and 2');
      }
    }

    if (data.maxTokens !== undefined && data.maxTokens !== null) {
      const tokens = parseInt(data.maxTokens, 10);
      if (isNaN(tokens) || tokens < 1) {
        errors.push('maxTokens must be a positive integer');
      }
    }

    if (data.useCustomChain && (!data.customProviderChain || data.customProviderChain.length === 0)) {
      errors.push('Custom provider chain requires at least one provider');
    }

    return errors;
  }

  /**
   * Execute the node
   */
  async execute(context) {
    const {
      prompt,
      systemPrompt,
      tierMode,
      forceTier,
      useCustomChain,
      customProviderChain,
      temperature,
      maxTokens,
      timeout,
      includeClassification,
      includeProviderChain,
      storeInVariable
    } = context.node.data;

    // Resolve templates
    const resolvedPrompt = this.resolveTemplate(prompt, context);
    const resolvedSystemPrompt = systemPrompt ? this.resolveTemplate(systemPrompt, context) : '';

    if (!resolvedPrompt) {
      return this.failure('Prompt is required', 'MISSING_PROMPT');
    }

    try {
      const superBrain = getSuperBrainRouter();

      // Build messages array
      const messages = [];
      if (resolvedSystemPrompt) {
        messages.push({ role: 'system', content: resolvedSystemPrompt });
      }
      messages.push({ role: 'user', content: resolvedPrompt });

      // Build options
      const options = {
        temperature: parseFloat(temperature) || 0.7,
        timeout: parseInt(timeout, 10) || 30000
      };

      if (maxTokens) {
        options.maxTokens = parseInt(maxTokens, 10);
      }

      // Build request
      const request = {
        task: resolvedPrompt,
        messages,
        userId: context.userId,
        agentId: context.agentId
      };

      // Handle tier mode
      if (tierMode === 'force') {
        request.forceTier = forceTier;
      }

      // Handle custom provider chain
      if (useCustomChain && customProviderChain && customProviderChain.length > 0) {
        request.customProviderChain = customProviderChain.map(p => ({
          provider: p.provider,
          model: p.model
        }));
      }

      context.logger.info(`SuperBrain processing: tier=${tierMode === 'force' ? forceTier : 'auto'}`);

      // Execute through SuperBrain
      const result = await superBrain.process(request, options);

      // Build output
      const output = {
        content: result.content,
        provider: result.provider,
        model: result.model,
        executedAt: new Date().toISOString()
      };

      // Include classification details
      if (includeClassification && result.classification) {
        output.classification = {
          tier: result.classification.tier,
          confidence: result.classification.confidence,
          reasoning: result.classification.reasoning
        };
      }

      // Include provider chain
      if (includeProviderChain && result.providerChain) {
        output.providerChain = result.providerChain;
        output.attemptedProviders = result.attemptedProviders || [];
      }

      // Include usage stats
      if (result.usage) {
        output.usage = result.usage;
      }

      // Store in variable if specified
      if (storeInVariable) {
        context.variables[storeInVariable] = output;
      }

      return this.success(output);

    } catch (error) {
      context.logger.error(`SuperBrain failed: ${error.message}`);

      // Check if recoverable
      const isRecoverable =
        error.message.includes('rate limit') ||
        error.message.includes('timeout') ||
        error.message.includes('503') ||
        error.message.includes('429');

      return this.failure(
        error.message,
        error.code || 'SUPERBRAIN_ERROR',
        isRecoverable
      );
    }
  }
}

module.exports = { SuperBrainNode };
