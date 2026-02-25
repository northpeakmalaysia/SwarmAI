/**
 * Rephrase Node
 *
 * Rephrases text in different styles using AI. Supports 6 built-in styles
 * plus custom tone definitions.
 *
 * Built-in Styles:
 * - Professional: Business-appropriate, formal language
 * - Casual: Relaxed, conversational tone
 * - Concise: Shortened while preserving meaning
 * - Detailed: Expanded with more context
 * - Friendly: Warm, approachable tone
 * - Formal: Official, ceremonial language
 *
 * Features:
 * - Style presets and custom tones
 * - Preserve/transform formatting
 * - Length control (shorter/same/longer)
 * - Audience targeting
 * - Multi-language support
 */

const { BaseNodeExecutor } = require('../../BaseNodeExecutor.cjs');
const { getSuperBrainRouter } = require('../../../ai/SuperBrainRouter.cjs');

// Built-in style definitions
const STYLE_PRESETS = {
  professional: {
    name: 'Professional',
    description: 'Business-appropriate, formal language suitable for workplace communication',
    instructions: 'Rewrite in a professional, business-appropriate tone. Use formal language, avoid slang, and maintain a respectful, competent voice.'
  },
  casual: {
    name: 'Casual',
    description: 'Relaxed, conversational tone for informal communication',
    instructions: 'Rewrite in a casual, conversational tone. Use contractions, simple language, and a friendly voice as if talking to a friend.'
  },
  concise: {
    name: 'Concise',
    description: 'Shortened while preserving core meaning',
    instructions: 'Rewrite to be as brief as possible while preserving the core meaning. Remove unnecessary words, combine sentences where possible, and get straight to the point.'
  },
  detailed: {
    name: 'Detailed',
    description: 'Expanded with additional context and explanation',
    instructions: 'Expand the text with more context, examples, and explanation. Make it more comprehensive while keeping it clear and organized.'
  },
  friendly: {
    name: 'Friendly',
    description: 'Warm, approachable tone that builds rapport',
    instructions: 'Rewrite in a warm, friendly tone. Be personable, use encouraging language, and make the reader feel welcomed and valued.'
  },
  formal: {
    name: 'Formal',
    description: 'Official, ceremonial language for formal contexts',
    instructions: 'Rewrite in a formal, official tone. Use complete sentences, proper grammar, and language appropriate for official documents or formal occasions.'
  },
  empathetic: {
    name: 'Empathetic',
    description: 'Understanding and compassionate tone',
    instructions: 'Rewrite with empathy and understanding. Acknowledge feelings, show compassion, and use supportive language.'
  },
  persuasive: {
    name: 'Persuasive',
    description: 'Compelling and convincing language',
    instructions: 'Rewrite to be more persuasive and compelling. Use strong action words, highlight benefits, and create a sense of urgency or importance.'
  },
  technical: {
    name: 'Technical',
    description: 'Precise, technical language for expert audiences',
    instructions: 'Rewrite using precise, technical language. Include relevant terminology, be accurate, and assume the reader has domain expertise.'
  },
  simple: {
    name: 'Simple',
    description: 'Easy to understand, plain language',
    instructions: 'Rewrite using simple, plain language that anyone can understand. Avoid jargon, use short sentences, and explain any complex concepts.'
  }
};

class RephraseNode extends BaseNodeExecutor {
  constructor() {
    super('ai:rephrase', 'ai');
  }

  /**
   * Get static metadata for this node type
   */
  static getMetadata() {
    return {
      type: 'ai:rephrase',
      label: 'Rephrase Text',
      description: 'Rephrase text in different styles using AI',
      icon: 'RefreshCw',
      category: 'ai',
      color: 'green',
      properties: {
        text: {
          type: 'textarea',
          label: 'Text to Rephrase',
          description: 'The text to rephrase (supports {{templates}})',
          required: true,
          showVariablePicker: true,
          rows: 4
        },
        styleMode: {
          type: 'select',
          label: 'Style Mode',
          description: 'Use a preset style or define custom tone',
          options: [
            { value: 'preset', label: 'Use Preset Style' },
            { value: 'custom', label: 'Custom Tone' }
          ],
          default: 'preset'
        },
        style: {
          type: 'select',
          label: 'Style Preset',
          description: 'Select the desired writing style',
          options: [
            { value: 'professional', label: 'Professional - Business-appropriate' },
            { value: 'casual', label: 'Casual - Relaxed, conversational' },
            { value: 'concise', label: 'Concise - Brief and to the point' },
            { value: 'detailed', label: 'Detailed - Expanded with context' },
            { value: 'friendly', label: 'Friendly - Warm and approachable' },
            { value: 'formal', label: 'Formal - Official language' },
            { value: 'empathetic', label: 'Empathetic - Compassionate' },
            { value: 'persuasive', label: 'Persuasive - Compelling' },
            { value: 'technical', label: 'Technical - Expert language' },
            { value: 'simple', label: 'Simple - Plain language' }
          ],
          default: 'professional',
          showWhen: { styleMode: 'preset' }
        },
        customTone: {
          type: 'textarea',
          label: 'Custom Tone Instructions',
          description: 'Describe how you want the text rephrased',
          placeholder: 'Rewrite in a...',
          showWhen: { styleMode: 'custom' },
          rows: 2
        },
        lengthControl: {
          type: 'select',
          label: 'Length Control',
          description: 'Adjust the output length',
          options: [
            { value: 'shorter', label: 'Shorter - More concise' },
            { value: 'same', label: 'Same - Similar length' },
            { value: 'longer', label: 'Longer - More detailed' }
          ],
          default: 'same'
        },
        targetAudience: {
          type: 'select',
          label: 'Target Audience',
          description: 'Who will read this text?',
          options: [
            { value: 'general', label: 'General Public' },
            { value: 'expert', label: 'Domain Experts' },
            { value: 'executive', label: 'Executives/Leaders' },
            { value: 'customer', label: 'Customers/Clients' },
            { value: 'colleague', label: 'Colleagues/Team' },
            { value: 'child', label: 'Children/Beginners' }
          ],
          default: 'general'
        },
        preserveFormatting: {
          type: 'boolean',
          label: 'Preserve Formatting',
          description: 'Keep original formatting, lists, and structure',
          default: true
        },
        preserveKeyTerms: {
          type: 'array',
          label: 'Preserve Key Terms',
          description: 'Terms that should not be changed (brand names, technical terms)',
          itemSchema: {
            type: 'text',
            label: 'Term'
          }
        },
        outputLanguage: {
          type: 'select',
          label: 'Output Language',
          description: 'Language for the rephrased text',
          options: [
            { value: 'same', label: 'Same as input' },
            { value: 'english', label: 'English' },
            { value: 'spanish', label: 'Spanish' },
            { value: 'french', label: 'French' },
            { value: 'german', label: 'German' },
            { value: 'chinese', label: 'Chinese' },
            { value: 'japanese', label: 'Japanese' },
            { value: 'korean', label: 'Korean' },
            { value: 'arabic', label: 'Arabic' },
            { value: 'portuguese', label: 'Portuguese' }
          ],
          default: 'same'
        },
        includeOriginal: {
          type: 'boolean',
          label: 'Include Original Text',
          description: 'Include the original text in output for comparison',
          default: false
        },
        storeInVariable: {
          type: 'text',
          label: 'Store Result In',
          description: 'Store the rephrased text in this variable',
          placeholder: 'rephrasedText'
        }
      },
      outputs: {
        default: { label: 'Rephrased', type: 'default' }
      },
      getDefaultConfig: () => ({
        text: '',
        styleMode: 'preset',
        style: 'professional',
        customTone: '',
        lengthControl: 'same',
        targetAudience: 'general',
        preserveFormatting: true,
        preserveKeyTerms: [],
        outputLanguage: 'same',
        includeOriginal: false,
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
      errors.push('Text to rephrase is required');
    }

    if (data.styleMode === 'custom' && !data.customTone) {
      errors.push('Custom tone instructions are required when using custom mode');
    }

    return errors;
  }

  /**
   * Execute the node
   */
  async execute(context) {
    const {
      text,
      styleMode,
      style,
      customTone,
      lengthControl,
      targetAudience,
      preserveFormatting,
      preserveKeyTerms,
      outputLanguage,
      includeOriginal,
      storeInVariable
    } = context.node.data;

    const resolvedText = this.resolveTemplate(text, context);

    if (!resolvedText) {
      return this.failure('Text to rephrase is required', 'MISSING_TEXT');
    }

    try {
      const superBrain = getSuperBrainRouter();

      // Build rephrase prompt
      const prompt = this.buildRephrasePrompt({
        text: resolvedText,
        styleMode,
        style,
        customTone,
        lengthControl,
        targetAudience,
        preserveFormatting,
        preserveKeyTerms,
        outputLanguage
      });

      // Execute rephrasing
      const result = await superBrain.process({
        task: prompt,
        messages: [
          {
            role: 'system',
            content: 'You are an expert writer and editor. Rephrase text exactly as instructed, providing only the rephrased version without explanations.'
          },
          { role: 'user', content: prompt }
        ],
        userId: context.userId,
        forceTier: 'simple' // Rephrasing is a simple task
      }, {
        temperature: 0.7, // Some creativity for natural rephrasing
        maxTokens: Math.max(500, resolvedText.length * 2)
      });

      // Extract rephrased text
      const rephrasedText = result.content.trim();

      // Build output
      const output = {
        rephrasedText,
        style: styleMode === 'preset' ? style : 'custom',
        styleName: styleMode === 'preset' ? STYLE_PRESETS[style]?.name : 'Custom',
        lengthControl,
        targetAudience,
        outputLanguage,
        originalLength: resolvedText.length,
        rephrasedLength: rephrasedText.length,
        provider: result.provider,
        model: result.model,
        rephrasedAt: new Date().toISOString()
      };

      if (includeOriginal) {
        output.originalText = resolvedText;
      }

      // Store in variable if specified
      if (storeInVariable) {
        context.variables[storeInVariable] = output.rephrasedText;
      }

      return this.success(output);

    } catch (error) {
      context.logger.error(`Rephrase failed: ${error.message}`);
      return this.failure(error.message, 'REPHRASE_ERROR', true);
    }
  }

  /**
   * Build the rephrase prompt
   * @private
   */
  buildRephrasePrompt(options) {
    const {
      text,
      styleMode,
      style,
      customTone,
      lengthControl,
      targetAudience,
      preserveFormatting,
      preserveKeyTerms,
      outputLanguage
    } = options;

    let prompt = '';

    // Style instructions
    if (styleMode === 'preset') {
      const preset = STYLE_PRESETS[style];
      if (preset) {
        prompt += `${preset.instructions}\n\n`;
      }
    } else {
      prompt += `${customTone}\n\n`;
    }

    // Length control
    switch (lengthControl) {
      case 'shorter':
        prompt += 'Make the text shorter and more concise while preserving the key message.\n';
        break;
      case 'longer':
        prompt += 'Expand the text with more detail and context while maintaining clarity.\n';
        break;
      default:
        prompt += 'Keep the length similar to the original.\n';
    }

    // Target audience
    prompt += `The target audience is: ${this.getAudienceDescription(targetAudience)}.\n`;

    // Formatting
    if (preserveFormatting) {
      prompt += 'Preserve the original formatting, including lists, paragraphs, and structure.\n';
    }

    // Key terms
    if (preserveKeyTerms && preserveKeyTerms.length > 0) {
      prompt += `Keep these terms unchanged: ${preserveKeyTerms.join(', ')}\n`;
    }

    // Language
    if (outputLanguage && outputLanguage !== 'same') {
      prompt += `Output the rephrased text in ${outputLanguage}.\n`;
    }

    prompt += `\nTEXT TO REPHRASE:\n"${text}"\n\n`;
    prompt += 'Provide ONLY the rephrased text, without any explanations or commentary.';

    return prompt;
  }

  /**
   * Get human-readable audience description
   * @private
   */
  getAudienceDescription(audience) {
    const descriptions = {
      general: 'general public with no specialized knowledge',
      expert: 'domain experts with technical background',
      executive: 'executives and business leaders who need quick insights',
      customer: 'customers and clients who need clear, helpful information',
      colleague: 'colleagues and team members who share context',
      child: 'children or beginners who need simple explanations'
    };
    return descriptions[audience] || descriptions.general;
  }
}

module.exports = { RephraseNode };
