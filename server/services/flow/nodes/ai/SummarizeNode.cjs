/**
 * Summarize Node
 *
 * Summarizes long text into concise summaries using AI.
 *
 * Features:
 * - Multiple summary lengths (short, medium, long)
 * - Bullet points or paragraph format
 * - Key points extraction
 * - Uses SuperBrainRouter for optimal provider selection
 *
 * Summary Lengths:
 * - short: 1-2 sentences
 * - medium: 1 paragraph (3-5 sentences)
 * - long: 2-3 paragraphs
 */

const { BaseNodeExecutor } = require('../../BaseNodeExecutor.cjs');
const { getSuperBrainRouter } = require('../../../ai/SuperBrainRouter.cjs');

class SummarizeNode extends BaseNodeExecutor {
  constructor() {
    super('ai:summarize', 'ai');
  }

  async execute(context) {
    const { node } = context;
    const data = node.data || {};

    // Get text to summarize
    const text = this.resolveTemplate(
      this.getRequired(data, 'text'),
      context
    );

    // Get summary options
    const length = this.getOptional(data, 'length', 'medium');
    const format = this.getOptional(data, 'format', 'paragraph');
    const extractKeyPoints = this.getOptional(data, 'extractKeyPoints', false);

    try {
      // Get SuperBrain router
      const router = getSuperBrainRouter();

      // Build summarization prompt
      let prompt = `Summarize the following text:\n\n${text}\n\n`;

      // Add length specification
      switch (length) {
        case 'short':
          prompt += 'Provide a brief summary in 1-2 sentences.\n';
          break;
        case 'medium':
          prompt += 'Provide a concise summary in 1 paragraph (3-5 sentences).\n';
          break;
        case 'long':
          prompt += 'Provide a detailed summary in 2-3 paragraphs.\n';
          break;
      }

      // Add format specification
      if (format === 'bullets') {
        prompt += 'Format the summary as bullet points.\n';
      } else {
        prompt += 'Format the summary as flowing paragraphs.\n';
      }

      // Add key points extraction if requested
      if (extractKeyPoints) {
        prompt += '\nAfter the summary, list 3-5 key points as bullet points.';
      }

      // Execute summarization via SuperBrain
      const result = await router.executeTask({
        prompt,
        taskType: 'moderate', // Summarization is a moderate complexity task
        userId: context.userId || 'system',
      });

      // Extract summary from result
      const summary = result.response?.trim() || '';

      // Detect if summarization failed
      if (!summary) {
        return this.failure(
          'Summarization failed: No response from AI',
          'SUMMARIZATION_ERROR'
        );
      }

      // Calculate compression ratio
      const originalLength = text.length;
      const summaryLength = summary.length;
      const compressionRatio = originalLength > 0
        ? ((1 - (summaryLength / originalLength)) * 100).toFixed(1)
        : 0;

      return this.success({
        summary,
        length,
        format,
        originalLength,
        summaryLength,
        compressionRatio: parseFloat(compressionRatio),
        provider: result.provider,
        model: result.model,
        executedAt: new Date().toISOString(),
      });
    } catch (error) {
      return this.failure(
        `Summarization failed: ${error.message}`,
        'SUMMARIZATION_ERROR',
        true // Recoverable - AI service might be temporarily unavailable
      );
    }
  }

  validate(node) {
    const errors = [];
    const data = node.data || {};

    // Required fields
    if (!data.text) {
      errors.push('Text to summarize is required');
    } else if (typeof data.text === 'string' && data.text.trim().length < 10) {
      errors.push('Text must be at least 10 characters long');
    }

    // Length validation
    const validLengths = ['short', 'medium', 'long'];
    if (data.length && !validLengths.includes(data.length)) {
      errors.push(`Invalid length: ${data.length}. Must be one of: ${validLengths.join(', ')}`);
    }

    // Format validation
    const validFormats = ['paragraph', 'bullets'];
    if (data.format && !validFormats.includes(data.format)) {
      errors.push(`Invalid format: ${data.format}. Must be one of: ${validFormats.join(', ')}`);
    }

    return errors;
  }

  /**
   * Get metadata for FlowBuilder UI
   */
  static getMetadata() {
    return {
      type: 'ai:summarize',
      category: 'ai',
      name: 'Summarize Text',
      description: 'Summarize long text into concise summaries using AI',
      icon: 'file-text',
      properties: [
        {
          name: 'text',
          type: 'text',
          label: 'Text to Summarize',
          description: 'Long text content to summarize (supports {{templates}})',
          required: true,
          multiline: true,
          rows: 8,
          placeholder: 'Enter or paste long text to summarize...',
        },
        {
          name: 'length',
          type: 'select',
          label: 'Summary Length',
          description: 'How concise the summary should be',
          required: true,
          options: [
            { value: 'short', label: 'Short (1-2 sentences)' },
            { value: 'medium', label: 'Medium (1 paragraph)' },
            { value: 'long', label: 'Long (2-3 paragraphs)' },
          ],
          default: 'medium',
        },
        {
          name: 'format',
          type: 'select',
          label: 'Summary Format',
          description: 'Output format style',
          required: true,
          options: [
            { value: 'paragraph', label: 'Paragraph (flowing text)' },
            { value: 'bullets', label: 'Bullet Points (list)' },
          ],
          default: 'paragraph',
        },
        {
          name: 'extractKeyPoints',
          type: 'boolean',
          label: 'Extract Key Points',
          description: 'Include 3-5 key points after summary',
          default: false,
        },
      ],
      outputs: [
        {
          name: 'summary',
          type: 'string',
          description: 'Generated summary text',
        },
        {
          name: 'length',
          type: 'string',
          description: 'Summary length used (short, medium, long)',
        },
        {
          name: 'format',
          type: 'string',
          description: 'Summary format used (paragraph, bullets)',
        },
        {
          name: 'originalLength',
          type: 'number',
          description: 'Original text length in characters',
        },
        {
          name: 'summaryLength',
          type: 'number',
          description: 'Summary text length in characters',
        },
        {
          name: 'compressionRatio',
          type: 'number',
          description: 'Compression ratio as percentage (0-100)',
        },
        {
          name: 'provider',
          type: 'string',
          description: 'AI provider used for summarization',
        },
        {
          name: 'model',
          type: 'string',
          description: 'AI model used for summarization',
        },
        {
          name: 'executedAt',
          type: 'string',
          description: 'ISO timestamp when summarization was executed',
        },
      ],
    };
  }
}

module.exports = { SummarizeNode };
