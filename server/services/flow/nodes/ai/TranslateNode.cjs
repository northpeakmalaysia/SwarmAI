/**
 * Translate Node
 *
 * Translates text from one language to another using AI.
 *
 * Features:
 * - Auto-detect source language
 * - 20+ supported target languages
 * - Preserves formatting and context
 * - Uses SuperBrainRouter for optimal provider selection
 *
 * Supported Languages:
 * English, Spanish, French, German, Italian, Portuguese,
 * Dutch, Russian, Chinese, Japanese, Korean, Arabic,
 * Hindi, Bengali, Turkish, Polish, Vietnamese, Thai,
 * Indonesian (Malay), Tamil
 */

const { BaseNodeExecutor } = require('../../BaseNodeExecutor.cjs');
const { getSuperBrainRouter } = require('../../../ai/SuperBrainRouter.cjs');

class TranslateNode extends BaseNodeExecutor {
  constructor() {
    super('ai:translate', 'ai');
  }

  async execute(context) {
    const { node } = context;
    const data = node.data || {};

    // Get text to translate
    const text = this.resolveTemplate(
      this.getRequired(data, 'text'),
      context
    );

    // Get target language
    const targetLanguage = this.resolveTemplate(
      this.getRequired(data, 'targetLanguage'),
      context
    );

    // Get optional source language (auto-detect if not provided)
    const sourceLanguage = this.resolveTemplate(
      this.getOptional(data, 'sourceLanguage', 'auto'),
      context
    );

    // Get optional options
    const preserveFormatting = this.getOptional(data, 'preserveFormatting', true);
    const includeOriginal = this.getOptional(data, 'includeOriginal', false);

    try {
      // Get SuperBrain router
      const router = getSuperBrainRouter();

      // Build translation prompt
      let prompt = `Translate the following text to ${targetLanguage}:\n\n${text}`;

      if (sourceLanguage && sourceLanguage !== 'auto') {
        prompt = `Translate the following text from ${sourceLanguage} to ${targetLanguage}:\n\n${text}`;
      }

      if (preserveFormatting) {
        prompt += '\n\nPreserve the original formatting, line breaks, and structure.';
      }

      prompt += '\n\nProvide ONLY the translated text without explanations.';

      // Execute translation via SuperBrain
      const result = await router.executeTask({
        prompt,
        taskType: 'simple', // Translation is a simple task
        userId: context.userId || 'system',
      });

      // Extract translated text from result
      const translatedText = result.response?.trim() || '';

      // Detect if translation failed
      if (!translatedText) {
        return this.failure(
          'Translation failed: No response from AI',
          'TRANSLATION_ERROR'
        );
      }

      return this.success({
        originalText: includeOriginal ? text : undefined,
        translatedText,
        sourceLanguage: sourceLanguage === 'auto' ? 'detected' : sourceLanguage,
        targetLanguage,
        provider: result.provider,
        model: result.model,
        executedAt: new Date().toISOString(),
      });
    } catch (error) {
      return this.failure(
        `Translation failed: ${error.message}`,
        'TRANSLATION_ERROR',
        true // Recoverable - AI service might be temporarily unavailable
      );
    }
  }

  validate(node) {
    const errors = [];
    const data = node.data || {};

    // Required fields
    if (!data.text) {
      errors.push('Text to translate is required');
    }

    if (!data.targetLanguage) {
      errors.push('Target language is required');
    }

    // Language validation
    const validLanguages = [
      'auto', 'english', 'spanish', 'french', 'german', 'italian', 'portuguese',
      'dutch', 'russian', 'chinese', 'japanese', 'korean', 'arabic',
      'hindi', 'bengali', 'turkish', 'polish', 'vietnamese', 'thai',
      'indonesian', 'malay', 'tamil'
    ];

    if (data.sourceLanguage && !validLanguages.includes(data.sourceLanguage.toLowerCase())) {
      errors.push(`Invalid source language: ${data.sourceLanguage}`);
    }

    if (data.targetLanguage && !validLanguages.includes(data.targetLanguage.toLowerCase())) {
      errors.push(`Invalid target language: ${data.targetLanguage}`);
    }

    return errors;
  }

  /**
   * Get metadata for FlowBuilder UI
   */
  static getMetadata() {
    return {
      type: 'ai:translate',
      category: 'ai',
      name: 'Translate Text',
      description: 'Translate text from one language to another using AI',
      icon: 'globe',
      properties: [
        {
          name: 'text',
          type: 'text',
          label: 'Text to Translate',
          description: 'Text content to translate (supports {{templates}})',
          required: true,
          multiline: true,
          rows: 5,
          placeholder: 'Hello, how are you?',
        },
        {
          name: 'sourceLanguage',
          type: 'select',
          label: 'Source Language',
          description: 'Original language (auto-detect if not specified)',
          options: [
            { value: 'auto', label: 'Auto-detect' },
            { value: 'english', label: 'English' },
            { value: 'spanish', label: 'Spanish (Español)' },
            { value: 'french', label: 'French (Français)' },
            { value: 'german', label: 'German (Deutsch)' },
            { value: 'italian', label: 'Italian (Italiano)' },
            { value: 'portuguese', label: 'Portuguese (Português)' },
            { value: 'dutch', label: 'Dutch (Nederlands)' },
            { value: 'russian', label: 'Russian (Русский)' },
            { value: 'chinese', label: 'Chinese (中文)' },
            { value: 'japanese', label: 'Japanese (日本語)' },
            { value: 'korean', label: 'Korean (한국어)' },
            { value: 'arabic', label: 'Arabic (العربية)' },
            { value: 'hindi', label: 'Hindi (हिन्दी)' },
            { value: 'bengali', label: 'Bengali (বাংলা)' },
            { value: 'turkish', label: 'Turkish (Türkçe)' },
            { value: 'polish', label: 'Polish (Polski)' },
            { value: 'vietnamese', label: 'Vietnamese (Tiếng Việt)' },
            { value: 'thai', label: 'Thai (ไทย)' },
            { value: 'malay', label: 'Malay (Bahasa Melayu)' },
            { value: 'tamil', label: 'Tamil (தமிழ்)' },
          ],
          default: 'auto',
        },
        {
          name: 'targetLanguage',
          type: 'select',
          label: 'Target Language',
          description: 'Language to translate to',
          required: true,
          options: [
            { value: 'english', label: 'English' },
            { value: 'spanish', label: 'Spanish (Español)' },
            { value: 'french', label: 'French (Français)' },
            { value: 'german', label: 'German (Deutsch)' },
            { value: 'italian', label: 'Italian (Italiano)' },
            { value: 'portuguese', label: 'Portuguese (Português)' },
            { value: 'dutch', label: 'Dutch (Nederlands)' },
            { value: 'russian', label: 'Russian (Русский)' },
            { value: 'chinese', label: 'Chinese (中文)' },
            { value: 'japanese', label: 'Japanese (日本語)' },
            { value: 'korean', label: 'Korean (한국어)' },
            { value: 'arabic', label: 'Arabic (العربية)' },
            { value: 'hindi', label: 'Hindi (हिन्दी)' },
            { value: 'bengali', label: 'Bengali (বাংলা)' },
            { value: 'turkish', label: 'Turkish (Türkçe)' },
            { value: 'polish', label: 'Polish (Polski)' },
            { value: 'vietnamese', label: 'Vietnamese (Tiếng Việt)' },
            { value: 'thai', label: 'Thai (ไทย)' },
            { value: 'malay', label: 'Malay (Bahasa Melayu)' },
            { value: 'tamil', label: 'Tamil (தமிழ்)' },
          ],
          default: 'english',
        },
        {
          name: 'preserveFormatting',
          type: 'boolean',
          label: 'Preserve Formatting',
          description: 'Keep original formatting, line breaks, and structure',
          default: true,
        },
        {
          name: 'includeOriginal',
          type: 'boolean',
          label: 'Include Original Text',
          description: 'Include original text in output',
          default: false,
        },
      ],
      outputs: [
        {
          name: 'translatedText',
          type: 'string',
          description: 'Translated text',
        },
        {
          name: 'originalText',
          type: 'string',
          description: 'Original text (if includeOriginal is true)',
        },
        {
          name: 'sourceLanguage',
          type: 'string',
          description: 'Detected or specified source language',
        },
        {
          name: 'targetLanguage',
          type: 'string',
          description: 'Target language',
        },
        {
          name: 'provider',
          type: 'string',
          description: 'AI provider used for translation',
        },
        {
          name: 'model',
          type: 'string',
          description: 'AI model used for translation',
        },
        {
          name: 'executedAt',
          type: 'string',
          description: 'ISO timestamp when translation was executed',
        },
      ],
    };
  }
}

module.exports = { TranslateNode };
