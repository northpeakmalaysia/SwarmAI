/**
 * Classify Intent Node
 *
 * Classifies user messages or text into predefined categories using AI.
 * Supports both predefined intent categories and custom user-defined categories.
 *
 * Features:
 * - Predefined common intents (greeting, question, complaint, etc.)
 * - Custom category definition
 * - Confidence scoring
 * - Multi-label classification option
 * - Entity extraction (optional)
 */

const { BaseNodeExecutor } = require('../../BaseNodeExecutor.cjs');
const { getSuperBrainRouter } = require('../../../ai/SuperBrainRouter.cjs');

// Predefined intent categories
const PREDEFINED_INTENTS = {
  conversation: [
    'greeting', 'goodbye', 'thanks', 'apology', 'small_talk'
  ],
  customer_service: [
    'question', 'complaint', 'feedback', 'request', 'cancellation',
    'refund', 'billing', 'technical_support', 'account_issue'
  ],
  commerce: [
    'product_inquiry', 'price_check', 'order_status', 'shipping',
    'return', 'exchange', 'availability'
  ],
  scheduling: [
    'appointment', 'reschedule', 'reminder', 'availability_check'
  ],
  information: [
    'faq', 'how_to', 'explanation', 'definition', 'comparison'
  ]
};

class ClassifyIntentNode extends BaseNodeExecutor {
  constructor() {
    super('ai:classifyIntent', 'ai');
  }

  /**
   * Get static metadata for this node type
   */
  static getMetadata() {
    return {
      type: 'ai:classifyIntent',
      label: 'Classify Intent',
      description: 'Classify text into categories using AI',
      icon: 'Tags',
      category: 'ai',
      color: 'blue',
      properties: {
        text: {
          type: 'textarea',
          label: 'Text to Classify',
          description: 'The message or text to classify (supports {{templates}})',
          required: true,
          showVariablePicker: true,
          rows: 3
        },
        categoryMode: {
          type: 'select',
          label: 'Category Mode',
          description: 'Use predefined categories or define custom ones',
          options: [
            { value: 'predefined', label: 'Predefined Categories' },
            { value: 'custom', label: 'Custom Categories' },
            { value: 'both', label: 'Both (Predefined + Custom)' }
          ],
          default: 'predefined'
        },
        predefinedGroups: {
          type: 'multiselect',
          label: 'Predefined Category Groups',
          description: 'Select which category groups to use',
          options: [
            { value: 'conversation', label: 'Conversation (greeting, goodbye, thanks...)' },
            { value: 'customer_service', label: 'Customer Service (question, complaint...)' },
            { value: 'commerce', label: 'Commerce (product, order, shipping...)' },
            { value: 'scheduling', label: 'Scheduling (appointment, reminder...)' },
            { value: 'information', label: 'Information (faq, how_to, explanation...)' }
          ],
          default: ['conversation', 'customer_service'],
          showWhen: { categoryMode: ['predefined', 'both'] }
        },
        customCategories: {
          type: 'array',
          label: 'Custom Categories',
          description: 'Define your own categories',
          showWhen: { categoryMode: ['custom', 'both'] },
          itemSchema: {
            type: 'object',
            properties: {
              name: { type: 'text', label: 'Category Name' },
              description: { type: 'text', label: 'Description (helps AI classify)' },
              examples: { type: 'text', label: 'Example phrases (comma-separated)' }
            }
          }
        },
        multiLabel: {
          type: 'boolean',
          label: 'Allow Multiple Labels',
          description: 'Allow classification into multiple categories',
          default: false
        },
        maxLabels: {
          type: 'number',
          label: 'Max Labels',
          description: 'Maximum number of labels when multi-label is enabled',
          default: 3,
          min: 1,
          max: 10,
          showWhen: { multiLabel: true }
        },
        confidenceThreshold: {
          type: 'number',
          label: 'Confidence Threshold',
          description: 'Minimum confidence score (0.0 - 1.0)',
          default: 0.5,
          min: 0,
          max: 1,
          step: 0.1
        },
        extractEntities: {
          type: 'boolean',
          label: 'Extract Entities',
          description: 'Extract named entities from the text',
          default: false
        },
        entityTypes: {
          type: 'multiselect',
          label: 'Entity Types to Extract',
          options: [
            { value: 'person', label: 'Person Names' },
            { value: 'organization', label: 'Organizations' },
            { value: 'location', label: 'Locations' },
            { value: 'date', label: 'Dates/Times' },
            { value: 'number', label: 'Numbers/Quantities' },
            { value: 'product', label: 'Products' },
            { value: 'email', label: 'Email Addresses' },
            { value: 'phone', label: 'Phone Numbers' }
          ],
          default: ['person', 'date'],
          showWhen: { extractEntities: true }
        },
        includeContext: {
          type: 'boolean',
          label: 'Include Context',
          description: 'Provide additional context for classification',
          default: false
        },
        contextText: {
          type: 'textarea',
          label: 'Context',
          description: 'Additional context to help classification',
          showWhen: { includeContext: true },
          rows: 2
        },
        storeInVariable: {
          type: 'text',
          label: 'Store Result In',
          description: 'Store the classification result in this variable',
          placeholder: 'intentResult'
        }
      },
      outputs: {
        default: { label: 'Classified', type: 'default' },
        unknown: { label: 'Unknown/Low Confidence', type: 'conditional' }
      },
      getDefaultConfig: () => ({
        text: '',
        categoryMode: 'predefined',
        predefinedGroups: ['conversation', 'customer_service'],
        customCategories: [],
        multiLabel: false,
        maxLabels: 3,
        confidenceThreshold: 0.5,
        extractEntities: false,
        entityTypes: ['person', 'date'],
        includeContext: false,
        contextText: '',
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

    if (!data.text) {
      errors.push('Text to classify is required');
    }

    if (data.categoryMode === 'custom' || data.categoryMode === 'both') {
      if (!data.customCategories || data.customCategories.length === 0) {
        if (data.categoryMode === 'custom') {
          errors.push('At least one custom category is required');
        }
      }
    }

    if (data.categoryMode === 'predefined' || data.categoryMode === 'both') {
      if (!data.predefinedGroups || data.predefinedGroups.length === 0) {
        if (data.categoryMode === 'predefined') {
          errors.push('At least one predefined category group is required');
        }
      }
    }

    return errors;
  }

  /**
   * Execute the node
   */
  async execute(context) {
    const {
      text,
      categoryMode,
      predefinedGroups,
      customCategories,
      multiLabel,
      maxLabels,
      confidenceThreshold,
      extractEntities,
      entityTypes,
      includeContext,
      contextText,
      storeInVariable
    } = context.node.data;

    const resolvedText = this.resolveTemplate(text, context);

    if (!resolvedText) {
      return this.failure('Text to classify is required', 'MISSING_TEXT');
    }

    try {
      const superBrain = getSuperBrainRouter();

      // Build categories list
      const categories = this.buildCategoriesList(
        categoryMode,
        predefinedGroups,
        customCategories
      );

      // Build classification prompt
      const prompt = this.buildClassificationPrompt({
        text: resolvedText,
        categories,
        multiLabel,
        maxLabels,
        extractEntities,
        entityTypes,
        context: includeContext ? contextText : null
      });

      // Execute classification
      const result = await superBrain.process({
        task: prompt,
        messages: [
          {
            role: 'system',
            content: 'You are an expert text classifier. Always respond with valid JSON only.'
          },
          { role: 'user', content: prompt }
        ],
        userId: context.userId,
        forceTier: 'simple' // Classification is a simple task
      }, {
        temperature: 0.1, // Low temperature for consistent classification
        maxTokens: 500
      });

      // Parse result
      const classification = this.parseClassificationResult(result.content);

      // Filter by confidence threshold
      const filteredIntents = classification.intents.filter(
        i => i.confidence >= confidenceThreshold
      );

      // Build output
      const output = {
        text: resolvedText,
        intents: filteredIntents,
        primaryIntent: filteredIntents.length > 0 ? filteredIntents[0] : null,
        allCategories: categories.map(c => c.name || c),
        provider: result.provider,
        model: result.model,
        classifiedAt: new Date().toISOString()
      };

      if (extractEntities && classification.entities) {
        output.entities = classification.entities;
      }

      // Store in variable if specified
      if (storeInVariable) {
        context.variables[storeInVariable] = output;
      }

      // Determine output path
      if (filteredIntents.length === 0) {
        output.reason = 'No intent met confidence threshold';
        return this.success(output, ['unknown']);
      }

      return this.success(output);

    } catch (error) {
      context.logger.error(`Classification failed: ${error.message}`);
      return this.failure(error.message, 'CLASSIFICATION_ERROR', true);
    }
  }

  /**
   * Build the list of categories to classify into
   * @private
   */
  buildCategoriesList(mode, predefinedGroups, customCategories) {
    const categories = [];

    // Add predefined categories
    if (mode === 'predefined' || mode === 'both') {
      for (const group of (predefinedGroups || [])) {
        const intents = PREDEFINED_INTENTS[group] || [];
        categories.push(...intents.map(name => ({ name, group })));
      }
    }

    // Add custom categories
    if (mode === 'custom' || mode === 'both') {
      for (const cat of (customCategories || [])) {
        categories.push({
          name: cat.name,
          description: cat.description,
          examples: cat.examples ? cat.examples.split(',').map(e => e.trim()) : [],
          group: 'custom'
        });
      }
    }

    return categories;
  }

  /**
   * Build the classification prompt
   * @private
   */
  buildClassificationPrompt(options) {
    const { text, categories, multiLabel, maxLabels, extractEntities, entityTypes, context } = options;

    let prompt = `Classify the following text into one or more categories.\n\n`;

    if (context) {
      prompt += `CONTEXT: ${context}\n\n`;
    }

    prompt += `TEXT: "${text}"\n\n`;

    prompt += `AVAILABLE CATEGORIES:\n`;
    for (const cat of categories) {
      if (typeof cat === 'string') {
        prompt += `- ${cat}\n`;
      } else {
        prompt += `- ${cat.name}`;
        if (cat.description) prompt += `: ${cat.description}`;
        if (cat.examples && cat.examples.length > 0) {
          prompt += ` (examples: ${cat.examples.join(', ')})`;
        }
        prompt += `\n`;
      }
    }

    prompt += `\nINSTRUCTIONS:\n`;
    if (multiLabel) {
      prompt += `- You may assign up to ${maxLabels} categories\n`;
      prompt += `- Only assign categories that clearly match the text\n`;
    } else {
      prompt += `- Assign exactly ONE category that best matches the text\n`;
    }
    prompt += `- Provide a confidence score from 0.0 to 1.0 for each category\n`;

    if (extractEntities) {
      prompt += `- Also extract entities of types: ${entityTypes.join(', ')}\n`;
    }

    prompt += `\nRespond with JSON in this exact format:\n`;
    prompt += `{\n`;
    prompt += `  "intents": [{"category": "category_name", "confidence": 0.95, "reasoning": "brief explanation"}]`;
    if (extractEntities) {
      prompt += `,\n  "entities": [{"type": "entity_type", "value": "extracted value", "position": "where in text"}]`;
    }
    prompt += `\n}`;

    return prompt;
  }

  /**
   * Parse the classification result from AI response
   * @private
   */
  parseClassificationResult(content) {
    try {
      // Try to extract JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);

        // Normalize the result
        return {
          intents: (parsed.intents || []).map(i => ({
            category: i.category || i.intent || i.name,
            confidence: parseFloat(i.confidence) || 0,
            reasoning: i.reasoning || i.reason || ''
          })).sort((a, b) => b.confidence - a.confidence),
          entities: parsed.entities || []
        };
      }
    } catch (error) {
      // Fallback: try to extract category from plain text
    }

    // Fallback result
    return {
      intents: [{
        category: 'unknown',
        confidence: 0,
        reasoning: 'Could not parse classification result'
      }],
      entities: []
    };
  }
}

module.exports = { ClassifyIntentNode };
