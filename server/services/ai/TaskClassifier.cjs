/**
 * Task Classifier Service
 *
 * Classifies incoming tasks into complexity tiers to determine
 * the optimal AI provider for processing.
 */

const { logger } = require('../logger.cjs');

/**
 * Task complexity tiers
 */
const TASK_TIERS = {
  TRIVIAL: 'trivial',     // Translation, formatting, simple lookup
  SIMPLE: 'simple',       // Q&A, summarization, basic generation
  MODERATE: 'moderate',   // Code generation, analysis, multi-step reasoning
  COMPLEX: 'complex',     // Agentic tasks, research, autonomous execution
  CRITICAL: 'critical',   // Security-sensitive, high-stakes decisions
};

/**
 * Default pattern keywords for each tier
 */
const DEFAULT_PATTERNS = {
  [TASK_TIERS.TRIVIAL]: [
    'translate', 'translation', 'convert', 'format', 'formatting',
    'uppercase', 'lowercase', 'capitalize', 'spell', 'grammar',
    'date format', 'time format', 'currency', 'unit convert',
  ],
  [TASK_TIERS.SIMPLE]: [
    'summarize', 'summary', 'explain', 'describe', 'answer',
    'what is', 'how to', 'define', 'list', 'compare',
    'paraphrase', 'rewrite', 'simplify', 'clarify',
  ],
  [TASK_TIERS.MODERATE]: [
    'code', 'program', 'script', 'function', 'implement',
    'analyze', 'analysis', 'debug', 'fix', 'optimize',
    'generate', 'create', 'build', 'design', 'develop',
    'refactor', 'review', 'test', 'validate',
  ],
  [TASK_TIERS.COMPLEX]: [
    'research', 'investigate', 'explore', 'study',
    'plan', 'strategy', 'architecture', 'system design',
    'execute', 'automate', 'workflow', 'pipeline',
    'multi-step', 'autonomous', 'agent', 'agentic',
    'delegate', 'coordinate', 'orchestrate', 'assign to',
    'find and', 'search and', 'training for', 'team member',
  ],
  [TASK_TIERS.CRITICAL]: [
    'security', 'secure', 'authentication', 'authorization',
    'deploy', 'deployment', 'production', 'release',
    'database migration', 'data migration', 'backup',
    'sensitive', 'confidential', 'compliance', 'audit',
  ],
};

/**
 * Token length thresholds for complexity estimation
 */
const LENGTH_THRESHOLDS = {
  SHORT: 50,      // < 50 tokens likely trivial/simple
  MEDIUM: 200,    // 50-200 tokens likely moderate
  LONG: 500,      // 200-500 tokens likely complex
  VERY_LONG: 1000, // > 500 tokens likely critical review needed
};

/**
 * Context indicators that affect classification
 */
const CONTEXT_INDICATORS = {
  hasCode: /```[\s\S]*```|function\s+\w+|class\s+\w+|const\s+\w+|let\s+\w+|var\s+\w+/,
  hasUrl: /https?:\/\/[^\s]+/,
  hasJson: /\{[\s\S]*"[\w]+"\s*:/,
  hasError: /error|exception|failed|crash|bug|issue/i,
  hasMultiStep: /first|then|next|after|finally|step\s*\d/i,
  isQuestion: /\?$/,
  isCommand: /^(please\s+)?(do|make|create|build|write|generate|fix|update|delete|remove)/i,
};

class TaskClassifier {
  constructor(options = {}) {
    this.patterns = { ...DEFAULT_PATTERNS, ...options.customPatterns };
    this.weights = {
      patternMatch: 0.4,
      lengthIndicator: 0.2,
      contextIndicator: 0.3,
      explicitHint: 0.1,
    };
  }

  /**
   * Classify a task into a complexity tier
   * @param {string|Object} task - Task description or object with task and context
   * @param {Object} context - Additional context for classification
   * @returns {Object} Classification result
   */
  classify(task, context = {}) {
    const taskText = typeof task === 'string' ? task : task.task || task.description || '';
    const taskLower = taskText.toLowerCase();

    // Calculate scores for each tier
    const scores = {};
    for (const tier of Object.values(TASK_TIERS)) {
      scores[tier] = this.calculateTierScore(taskText, taskLower, tier, context);
    }

    // Find the tier with highest score
    let maxTier = TASK_TIERS.SIMPLE;
    let maxScore = 0;

    for (const [tier, score] of Object.entries(scores)) {
      if (score > maxScore) {
        maxScore = score;
        maxTier = tier;
      }
    }

    // Calculate confidence based on score difference
    const sortedScores = Object.values(scores).sort((a, b) => b - a);
    const confidence = sortedScores[0] > 0
      ? Math.min(1, (sortedScores[0] - (sortedScores[1] || 0)) / sortedScores[0] + 0.5)
      : 0.5;

    // Get suggested provider based on tier
    const suggestedProviders = this.getSuggestedProviders(maxTier);

    const result = {
      tier: maxTier,
      confidence: Math.round(confidence * 100) / 100,
      scores,
      suggestedProviders,
      analysis: this.analyzeTask(taskText, taskLower),
    };

    logger.debug(`Task classified as ${maxTier} with confidence ${result.confidence}`);

    return result;
  }

  /**
   * Calculate score for a specific tier
   */
  calculateTierScore(taskText, taskLower, tier, context) {
    let score = 0;

    // Pattern matching score
    const patterns = this.patterns[tier] || [];
    let patternMatches = 0;
    for (const pattern of patterns) {
      if (taskLower.includes(pattern.toLowerCase())) {
        patternMatches++;
      }
    }
    score += (patternMatches / Math.max(patterns.length, 1)) * this.weights.patternMatch * 100;

    // Keyword priority boost: when higher-tier keywords match, they should
    // override length-based scoring. A short message saying "delegate to team"
    // is still complex even though it's short text.
    if (patternMatches > 0 && (tier === TASK_TIERS.COMPLEX || tier === TASK_TIERS.CRITICAL)) {
      score += patternMatches * 8; // +8 per matching keyword for complex/critical
    }

    // Length-based scoring
    const tokenEstimate = taskText.split(/\s+/).length;
    score += this.getLengthScore(tokenEstimate, tier) * this.weights.lengthIndicator * 100;

    // Context indicator scoring
    score += this.getContextScore(taskText, tier, context) * this.weights.contextIndicator * 100;

    // Explicit hints from context
    if (context.forceTier === tier) {
      score += this.weights.explicitHint * 100;
    }

    return Math.round(score * 100) / 100;
  }

  /**
   * Get score based on task length
   */
  getLengthScore(tokenCount, tier) {
    switch (tier) {
      case TASK_TIERS.TRIVIAL:
        return tokenCount < LENGTH_THRESHOLDS.SHORT ? 1 : 0.3;
      case TASK_TIERS.SIMPLE:
        return tokenCount >= LENGTH_THRESHOLDS.SHORT && tokenCount < LENGTH_THRESHOLDS.MEDIUM ? 1 : 0.5;
      case TASK_TIERS.MODERATE:
        return tokenCount >= LENGTH_THRESHOLDS.MEDIUM && tokenCount < LENGTH_THRESHOLDS.LONG ? 1 : 0.4;
      case TASK_TIERS.COMPLEX:
        return tokenCount >= LENGTH_THRESHOLDS.LONG && tokenCount < LENGTH_THRESHOLDS.VERY_LONG ? 1 : 0.3;
      case TASK_TIERS.CRITICAL:
        return tokenCount >= LENGTH_THRESHOLDS.VERY_LONG ? 0.8 : 0.2;
      default:
        return 0.5;
    }
  }

  /**
   * Get score based on context indicators
   */
  getContextScore(taskText, tier, context) {
    let score = 0;
    let indicators = 0;

    // Check for code presence
    if (CONTEXT_INDICATORS.hasCode.test(taskText)) {
      indicators++;
      if (tier === TASK_TIERS.MODERATE || tier === TASK_TIERS.COMPLEX) {
        score += 0.3;
      }
    }

    // Check for multi-step indicators
    if (CONTEXT_INDICATORS.hasMultiStep.test(taskText)) {
      indicators++;
      if (tier === TASK_TIERS.COMPLEX || tier === TASK_TIERS.MODERATE) {
        score += 0.2;
      }
    }

    // Check for error/debug context
    if (CONTEXT_INDICATORS.hasError.test(taskText)) {
      indicators++;
      if (tier === TASK_TIERS.MODERATE) {
        score += 0.2;
      }
    }

    // Check for simple question format
    if (CONTEXT_INDICATORS.isQuestion.test(taskText) && !CONTEXT_INDICATORS.hasMultiStep.test(taskText)) {
      indicators++;
      if (tier === TASK_TIERS.SIMPLE || tier === TASK_TIERS.TRIVIAL) {
        score += 0.2;
      }
    }

    // Consider context hints
    if (context.hasRAG && tier === TASK_TIERS.MODERATE) {
      score += 0.1;
    }
    if (context.isAgentic && (tier === TASK_TIERS.COMPLEX || tier === TASK_TIERS.CRITICAL)) {
      score += 0.2;
    }

    return indicators > 0 ? score / indicators : 0;
  }

  /**
   * Analyze task for additional insights
   */
  analyzeTask(taskText, taskLower) {
    return {
      hasCode: CONTEXT_INDICATORS.hasCode.test(taskText),
      hasUrl: CONTEXT_INDICATORS.hasUrl.test(taskText),
      hasJson: CONTEXT_INDICATORS.hasJson.test(taskText),
      hasError: CONTEXT_INDICATORS.hasError.test(taskText),
      isMultiStep: CONTEXT_INDICATORS.hasMultiStep.test(taskText),
      isQuestion: CONTEXT_INDICATORS.isQuestion.test(taskText),
      isCommand: CONTEXT_INDICATORS.isCommand.test(taskText),
      estimatedTokens: taskText.split(/\s+/).length,
    };
  }

  /**
   * Get suggested providers for a tier
   */
  getSuggestedProviders(tier) {
    const providerMap = {
      [TASK_TIERS.TRIVIAL]: ['ollama', 'openrouter'],
      [TASK_TIERS.SIMPLE]: ['openrouter', 'ollama'],
      [TASK_TIERS.MODERATE]: ['openrouter', 'cli-gemini', 'cli-opencode'],
      [TASK_TIERS.COMPLEX]: ['cli-claude', 'cli-gemini', 'cli-opencode'],
      [TASK_TIERS.CRITICAL]: ['cli-claude', 'cli-gemini', 'openrouter'],
    };
    return providerMap[tier] || ['openrouter'];
  }

  /**
   * AI-powered classification system prompt.
   * Kept as a static method so it can be tested independently.
   */
  static getClassifierSystemPrompt(taskRoutingInfo = '') {
    return [
      'You are a task complexity classifier for an AI routing system.',
      'Classify the user\'s message into exactly ONE tier:',
      '',
      '- trivial: greetings (hi, hello, hey, thanks), yes/no, simple acknowledgements, emojis only',
      '- simple: quick Q&A, translation, rephrasing, lookups, short factual questions, casual conversation',
      '- moderate: analysis, code generation, document creation, multi-part questions, data processing',
      '- complex: research, multi-step plans, autonomous workflows, system design, cross-platform tasks',
      '- critical: security-sensitive operations, production deployments, data migrations, bulk destructive actions',
      '',
      'IMPORTANT: Classify the USER\'S MESSAGE only, not the system prompt or context around it.',
      'A simple "hi" is ALWAYS trivial regardless of what system instructions surround it.',
      '',
      taskRoutingInfo,
      '',
      'Respond ONLY with valid JSON (no markdown fences, no explanation):',
      '{"tier":"<tier>","confidence":<0.0-1.0>,"reasoning":"<one sentence why>"}',
    ].filter(Boolean).join('\n');
  }

  /**
   * Classify using an AI model. Falls back to local keyword-based on any failure.
   * Calls providers directly (not through SuperBrainRouter) to avoid circular deps.
   *
   * @param {string} taskText - The raw user message to classify
   * @param {Object} aiConfig - { providerChain: [{type, baseUrl, apiKey, model, name}], timeout: 15000, taskRoutingInfo: '' }
   * @param {Object} localFallback - Pre-computed result from classify() to use on failure
   * @returns {Promise<Object>} Classification result (same shape as classify())
   */
  async classifyWithAI(taskText, aiConfig, localFallback) {
    const { providerChain = [], timeout = 15000, taskRoutingInfo = '' } = aiConfig;
    if (providerChain.length === 0) {
      return { ...localFallback, source: 'local' };
    }

    const systemPrompt = TaskClassifier.getClassifierSystemPrompt(taskRoutingInfo);
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: taskText },
    ];

    // Try each provider in chain (primary, then fallbacks in order)
    for (let i = 0; i < providerChain.length; i++) {
      const provider = providerChain[i];
      const label = i === 0 ? 'primary' : `fallback-${i}`;

      // Special "local" entry — use keyword-based classification at this position
      if (provider.type === 'local') {
        logger.info(`[TaskClassifier] Using local keyword classification at chain position ${i} (${label})`);
        return { ...localFallback, source: 'local' };
      }

      try {
        const aiResponse = await Promise.race([
          this._callProvider(provider, messages),
          new Promise((_, reject) => setTimeout(() => reject(new Error('classifier timeout')), timeout)),
        ]);

        const parsed = this._parseClassifierResponse(aiResponse);
        if (parsed) {
          logger.info(`[TaskClassifier] AI classification: tier="${parsed.tier}", confidence=${parsed.confidence}, provider=${provider.name || provider.type} (${label})`);
          return {
            tier: parsed.tier,
            confidence: parsed.confidence,
            scores: localFallback.scores,
            suggestedProviders: this.getSuggestedProviders(parsed.tier),
            analysis: localFallback.analysis,
            reasoning: parsed.reasoning || null,
            source: 'ai',
            classifierProvider: provider.name || provider.type,
          };
        }
        logger.warn(`[TaskClassifier] AI response invalid JSON, trying next provider`);
      } catch (err) {
        logger.warn(`[TaskClassifier] AI provider ${provider.name || provider.type} failed: ${err.message}`);
      }
    }

    // All chain entries failed — return keyword-based result as ultimate fallback
    logger.info(`[TaskClassifier] All classifier chain entries failed, using local keyword classification`);
    return { ...localFallback, source: 'local-chain-exhausted' };
  }

  /**
   * Call an AI provider directly for classification.
   * Supports ollama, openrouter, local-agent, and google types.
   * @private
   */
  async _callProvider(provider, messages) {
    const { type, baseUrl, apiKey, model } = provider;

    switch (type) {
      case 'ollama':
      case 'local-agent-ollama': {
        // Direct Ollama HTTP API call
        const url = `${baseUrl || 'http://localhost:11434'}/api/chat`;
        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: model || 'qwen3:4b',
            messages,
            stream: false,
            think: false, // Disable thinking mode — classification needs direct JSON, not reasoning
            options: { temperature: 0.1, num_predict: 150 },
          }),
        });
        if (!resp.ok) throw new Error(`Ollama HTTP ${resp.status}`);
        const data = await resp.json();
        // Prefer content, but fall back to thinking field (some models put everything there)
        return data.message?.content || data.message?.thinking || '';
      }

      case 'openrouter': {
        const url = 'https://openrouter.ai/api/v1/chat/completions';
        const resp = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'HTTP-Referer': 'https://agents.northpeak.app',
          },
          body: JSON.stringify({
            model: model || 'openai/gpt-oss-120b:free',
            messages,
            temperature: 0.1,
            max_tokens: 150,
          }),
        });
        if (!resp.ok) throw new Error(`OpenRouter HTTP ${resp.status}`);
        const data = await resp.json();
        return data.choices?.[0]?.message?.content || '';
      }

      case 'google': {
        // Gemini REST API
        const url = `${baseUrl || 'https://generativelanguage.googleapis.com/v1beta'}/models/${model || 'gemini-2.0-flash'}:generateContent?key=${apiKey}`;
        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: messages.map(m => `${m.role}: ${m.content}`).join('\n') }] }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 150 },
          }),
        });
        if (!resp.ok) throw new Error(`Google AI HTTP ${resp.status}`);
        const data = await resp.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      }

      case 'local-agent': {
        // Route through LocalAgentGateway WebSocket
        const { getLocalAgentGateway } = require('../LocalAgentGateway.cjs');
        const gateway = getLocalAgentGateway();
        const result = await gateway.sendCommand(provider.localAgentId, 'aiChat', {
          provider: provider.localProviderType || 'ollama',
          baseUrl: provider.localBaseUrl || 'http://localhost:11434',
          model: model || 'qwen3:8b',
          messages,
          think: false,
          options: { temperature: 0.1, maxTokens: 150 },
        }, 15000);
        return result?.content || result?.thinking || '';
      }

      default:
        throw new Error(`Unsupported classifier provider type: ${type}`);
    }
  }

  /**
   * Parse AI classifier response into structured result.
   * Handles raw JSON, markdown-fenced JSON, and thinking tags.
   * @private
   */
  _parseClassifierResponse(response) {
    if (!response || typeof response !== 'string') return null;

    // Strip markdown fences and thinking tags
    let cleaned = response
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .trim();

    // Find JSON object in the response
    const jsonMatch = cleaned.match(/\{[\s\S]*?"tier"\s*:\s*"[^"]+"/);
    if (!jsonMatch) return null;

    // Extract the complete JSON object
    const startIdx = cleaned.indexOf(jsonMatch[0]);
    let braceCount = 0;
    let endIdx = startIdx;
    for (let i = startIdx; i < cleaned.length; i++) {
      if (cleaned[i] === '{') braceCount++;
      if (cleaned[i] === '}') braceCount--;
      if (braceCount === 0) { endIdx = i + 1; break; }
    }

    try {
      const parsed = JSON.parse(cleaned.substring(startIdx, endIdx));
      const validTiers = Object.values(TASK_TIERS);
      if (!validTiers.includes(parsed.tier)) return null;
      parsed.confidence = Math.max(0, Math.min(1, parseFloat(parsed.confidence) || 0.5));
      return parsed;
    } catch {
      return null;
    }
  }

  /**
   * Add custom patterns for a tier
   */
  addPatterns(tier, patterns) {
    if (!this.patterns[tier]) {
      this.patterns[tier] = [];
    }
    this.patterns[tier].push(...patterns);
  }

  /**
   * Get all available tiers
   */
  getTiers() {
    return Object.values(TASK_TIERS);
  }

  /**
   * Check if a tier is valid
   */
  isValidTier(tier) {
    return Object.values(TASK_TIERS).includes(tier);
  }
}

// Singleton instance
let taskClassifierInstance = null;

function getTaskClassifier(options = {}) {
  if (!taskClassifierInstance) {
    taskClassifierInstance = new TaskClassifier(options);
  }
  return taskClassifierInstance;
}

module.exports = {
  TaskClassifier,
  getTaskClassifier,
  TASK_TIERS,
  DEFAULT_PATTERNS,
};
