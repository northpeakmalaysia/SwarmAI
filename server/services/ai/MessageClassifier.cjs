/**
 * Message Classifier Service
 *
 * Classifies incoming messages to determine processing intent:
 * - SKIP: No processing needed (status updates, self messages)
 * - PASSIVE: Store only, maybe RAG ingest (newsletters, broadcasts)
 * - ACTIVE: Full AI Router processing (questions, commands, direct messages)
 *
 * Uses a two-stage approach:
 * 1. Source-based classification (fast, pattern matching)
 * 2. Content-based override (can upgrade but not downgrade)
 */

const { logger } = require('../logger.cjs');

/**
 * Intent types for message processing
 */
const INTENT_TYPES = {
  SKIP: 'skip',           // No processing needed
  PASSIVE: 'passive',     // Store only, maybe RAG ingest
  ACTIVE: 'active',       // Full AI Router processing
};

/**
 * Source patterns for classification
 */
const SOURCE_PATTERNS = {
  NEWSLETTER: /@newsletter$/i,
  BROADCAST: /@broadcast$/i,
  STATUS: /@status$/i,
  GROUP: /@g\.us$/i,
  DIRECT: /@c\.us$/i,
  CHANNEL: /@channel$/i,
};

/**
 * Content patterns that indicate active intent
 */
const ACTIVE_CONTENT_PATTERNS = {
  COMMAND: /^\/\w+/,                          // Starts with /command
  QUESTION_END: /\?[\s]*$/,                   // Ends with ?
  QUESTION_START: /^\?/,                      // Starts with ?
  HELP_REQUEST: /\b(help|tolong|bantuan|how|bagaimana|apa|what|when|where|why|who)\b/i,
  MENTION: /@\w+/,                            // Contains @mention
};

/**
 * Content patterns that indicate passive/informational content
 */
const PASSIVE_CONTENT_PATTERNS = {
  URL_ONLY: /^https?:\/\/[^\s]+$/,            // Only a URL
  FORWARD_HEADER: /^\[Forwarded\]/i,          // Forwarded message
  BROADCAST_HEADER: /^📢|^🔔|^\[Broadcast\]/i, // Broadcast indicators
};

class MessageClassifier {
  constructor(options = {}) {
    this.config = {
      // Sources that should always be skipped
      skipSources: options.skipSources || ['@status'],

      // Sources that should be passive by default
      passiveSources: options.passiveSources || ['@newsletter', '@broadcast', '@channel'],

      // Enable content-based upgrade (passive → active)
      enableContentOverride: options.enableContentOverride !== false,

      // Custom patterns (can be extended by agents)
      customPatterns: options.customPatterns || {},

      ...options,
    };
  }

  /**
   * Classify a message to determine processing intent
   * @param {Object} message - Unified message object
   * @param {Object} context - Processing context
   * @returns {Object} Classification result
   */
  classify(message, context = {}) {
    const startTime = Date.now();

    const result = {
      intent: INTENT_TYPES.ACTIVE, // Default to active
      reason: 'default',
      confidence: 1.0,
      source: null,
      contentSignals: [],
    };

    // 1. Check for self-messages (always skip)
    if (message.fromMe === true) {
      result.intent = INTENT_TYPES.SKIP;
      result.reason = 'self_message';
      return this.finalizeResult(result, startTime);
    }

    // 2. Source-based classification
    const sourceClassification = this.classifyBySource(message.from);
    result.source = sourceClassification.source;

    if (sourceClassification.intent) {
      result.intent = sourceClassification.intent;
      result.reason = sourceClassification.reason;
      result.confidence = sourceClassification.confidence;
    }

    // 3. Content-based override (can upgrade passive → active)
    if (this.config.enableContentOverride && message.content) {
      const contentClassification = this.classifyByContent(message.content, context);
      result.contentSignals = contentClassification.signals;

      // Content can upgrade intent but not downgrade
      if (contentClassification.intent === INTENT_TYPES.ACTIVE &&
          result.intent !== INTENT_TYPES.SKIP) {
        result.intent = INTENT_TYPES.ACTIVE;
        result.reason = `content_override:${contentClassification.reason}`;
        result.confidence = contentClassification.confidence;
      }

      // Passive content can reinforce passive intent
      if (contentClassification.intent === INTENT_TYPES.PASSIVE &&
          result.intent === INTENT_TYPES.PASSIVE) {
        result.confidence = Math.min(1.0, result.confidence + 0.1);
      }
    }

    // 4. Context-based adjustments
    if (context.agentConfig) {
      const contextAdjustment = this.applyContextRules(result, context);
      if (contextAdjustment.modified) {
        result.intent = contextAdjustment.intent;
        result.reason = contextAdjustment.reason;
      }
    }

    return this.finalizeResult(result, startTime);
  }

  /**
   * Classify based on message source
   * @private
   */
  classifyBySource(from) {
    if (!from) {
      return { intent: null, source: 'unknown' };
    }

    const fromLower = from.toLowerCase();

    // Check skip sources
    for (const pattern of this.config.skipSources) {
      if (fromLower.includes(pattern.toLowerCase()) ||
          SOURCE_PATTERNS.STATUS?.test(from)) {
        return {
          intent: INTENT_TYPES.SKIP,
          reason: 'skip_source',
          source: pattern,
          confidence: 1.0,
        };
      }
    }

    // Check passive sources
    for (const pattern of this.config.passiveSources) {
      if (fromLower.includes(pattern.toLowerCase())) {
        return {
          intent: INTENT_TYPES.PASSIVE,
          reason: 'passive_source',
          source: pattern,
          confidence: 0.9,
        };
      }
    }

    // Check known patterns
    if (SOURCE_PATTERNS.NEWSLETTER.test(from)) {
      return {
        intent: INTENT_TYPES.PASSIVE,
        reason: 'newsletter',
        source: '@newsletter',
        confidence: 0.95,
      };
    }

    if (SOURCE_PATTERNS.BROADCAST.test(from)) {
      return {
        intent: INTENT_TYPES.PASSIVE,
        reason: 'broadcast',
        source: '@broadcast',
        confidence: 0.95,
      };
    }

    if (SOURCE_PATTERNS.CHANNEL.test(from)) {
      return {
        intent: INTENT_TYPES.PASSIVE,
        reason: 'channel',
        source: '@channel',
        confidence: 0.9,
      };
    }

    // Direct messages are active by default
    if (SOURCE_PATTERNS.DIRECT.test(from)) {
      return {
        intent: INTENT_TYPES.ACTIVE,
        reason: 'direct_message',
        source: '@c.us',
        confidence: 0.8,
      };
    }

    // Group messages need content analysis
    if (SOURCE_PATTERNS.GROUP.test(from)) {
      return {
        intent: null, // Will be determined by content
        reason: 'group_message',
        source: '@g.us',
        confidence: 0.5,
      };
    }

    return { intent: null, source: 'unknown' };
  }

  /**
   * Classify based on message content
   * @private
   */
  classifyByContent(content, context = {}) {
    if (!content || typeof content !== 'string') {
      return { intent: null, signals: [] };
    }

    const trimmed = content.trim();
    const signals = [];
    let intent = null;
    let reason = null;
    let confidence = 0.5;

    // Check for commands (always active)
    if (ACTIVE_CONTENT_PATTERNS.COMMAND.test(trimmed)) {
      signals.push('command');
      intent = INTENT_TYPES.ACTIVE;
      reason = 'command';
      confidence = 1.0;
    }

    // Check for questions
    if (ACTIVE_CONTENT_PATTERNS.QUESTION_END.test(trimmed) ||
        ACTIVE_CONTENT_PATTERNS.QUESTION_START.test(trimmed)) {
      signals.push('question');
      if (!intent) {
        intent = INTENT_TYPES.ACTIVE;
        reason = 'question';
        confidence = 0.85;
      }
    }

    // Check for help requests
    if (ACTIVE_CONTENT_PATTERNS.HELP_REQUEST.test(trimmed)) {
      signals.push('help_request');
      if (!intent || confidence < 0.9) {
        intent = INTENT_TYPES.ACTIVE;
        reason = 'help_request';
        confidence = 0.9;
      }
    }

    // Check for agent mentions
    if (context.agentName && trimmed.toLowerCase().includes(`@${context.agentName.toLowerCase()}`)) {
      signals.push('agent_mention');
      intent = INTENT_TYPES.ACTIVE;
      reason = 'agent_mention';
      confidence = 1.0;
    }

    // Check for passive content patterns
    if (PASSIVE_CONTENT_PATTERNS.URL_ONLY.test(trimmed)) {
      signals.push('url_only');
      if (!intent) {
        intent = INTENT_TYPES.PASSIVE;
        reason = 'url_only';
        confidence = 0.7;
      }
    }

    if (PASSIVE_CONTENT_PATTERNS.FORWARD_HEADER.test(trimmed)) {
      signals.push('forwarded');
      if (!intent) {
        intent = INTENT_TYPES.PASSIVE;
        reason = 'forwarded';
        confidence = 0.8;
      }
    }

    if (PASSIVE_CONTENT_PATTERNS.BROADCAST_HEADER.test(trimmed)) {
      signals.push('broadcast_header');
      if (!intent) {
        intent = INTENT_TYPES.PASSIVE;
        reason = 'broadcast_header';
        confidence = 0.85;
      }
    }

    return { intent, reason, confidence, signals };
  }

  /**
   * Apply context-based rules (agent config, user settings)
   * @private
   */
  applyContextRules(result, context) {
    const { agentConfig } = context;

    // Check if agent has specific processing mode
    if (agentConfig?.processingMode) {
      switch (agentConfig.processingMode) {
        case 'passive':
          return {
            modified: true,
            intent: INTENT_TYPES.PASSIVE,
            reason: 'agent_config:passive_mode',
          };
        case 'disabled':
          return {
            modified: true,
            intent: INTENT_TYPES.SKIP,
            reason: 'agent_config:disabled',
          };
        case 'flow_only':
          // For flow_only, we still need to classify but downstream will only check flows
          return { modified: false };
      }
    }

    // Check if source is in agent's skip list
    if (agentConfig?.skipSources && result.source) {
      if (agentConfig.skipSources.includes(result.source)) {
        return {
          modified: true,
          intent: INTENT_TYPES.SKIP,
          reason: 'agent_config:skip_source',
        };
      }
    }

    return { modified: false };
  }

  /**
   * Finalize classification result
   * @private
   */
  finalizeResult(result, startTime) {
    result.processingTimeMs = Date.now() - startTime;

    // Add sourceType as alias for source (for compatibility)
    result.sourceType = result.source;

    // Track stats
    this.trackStats(result.intent);

    // Log classification for debugging
    logger.debug(`MessageClassifier: ${result.intent} (${result.reason}) [${result.processingTimeMs}ms]`);

    return result;
  }

  /**
   * Track classification statistics
   * @private
   */
  trackStats(intent) {
    if (!this.stats) {
      this.stats = {
        total: 0,
        skip: 0,
        passive: 0,
        active: 0,
        startTime: Date.now(),
      };
    }
    this.stats.total++;
    this.stats[intent] = (this.stats[intent] || 0) + 1;
  }

  /**
   * Get classification statistics
   */
  getStats() {
    if (!this.stats) {
      return {
        total: 0,
        skip: 0,
        passive: 0,
        active: 0,
        uptime: 0,
      };
    }
    return {
      ...this.stats,
      uptime: Date.now() - this.stats.startTime,
      distribution: {
        skip: this.stats.total > 0 ? (this.stats.skip / this.stats.total * 100).toFixed(1) + '%' : '0%',
        passive: this.stats.total > 0 ? (this.stats.passive / this.stats.total * 100).toFixed(1) + '%' : '0%',
        active: this.stats.total > 0 ? (this.stats.active / this.stats.total * 100).toFixed(1) + '%' : '0%',
      },
    };
  }

  /**
   * Check if message should be processed for RAG ingestion
   * @param {Object} classification - Classification result
   * @returns {boolean}
   */
  shouldIngestToRAG(classification) {
    return classification.intent === INTENT_TYPES.PASSIVE;
  }

  /**
   * Check if message should trigger AI Router
   * @param {Object} classification - Classification result
   * @returns {boolean}
   */
  shouldTriggerAIRouter(classification) {
    return classification.intent === INTENT_TYPES.ACTIVE;
  }

  /**
   * Check if message should be completely skipped
   * @param {Object} classification - Classification result
   * @returns {boolean}
   */
  shouldSkip(classification) {
    return classification.intent === INTENT_TYPES.SKIP;
  }

  /**
   * Get configuration
   */
  getConfig() {
    return { ...this.config };
  }

  /**
   * Update configuration
   * @param {Object} newConfig - New configuration options
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
  }
}

// Singleton instance
let messageClassifierInstance = null;

/**
 * Get the MessageClassifier singleton
 * @param {Object} options - Configuration options
 * @returns {MessageClassifier}
 */
function getMessageClassifier(options = {}) {
  if (!messageClassifierInstance) {
    messageClassifierInstance = new MessageClassifier(options);
  }
  return messageClassifierInstance;
}

module.exports = {
  MessageClassifier,
  getMessageClassifier,
  INTENT_TYPES,
  SOURCE_PATTERNS,
};
