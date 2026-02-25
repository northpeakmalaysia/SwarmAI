/**
 * AI Router Service
 *
 * The "Main Brain" that intelligently routes user requests to appropriate tools.
 * This service:
 * 1. Classifies incoming messages using AI
 * 2. Determines which tool(s) to use
 * 3. Extracts parameters from natural language
 * 4. Executes tools with validation
 * 5. Handles multi-step tool chains
 *
 * Based on WhatsBots AI-Router pattern with enhancements for SwarmAI.
 */

const { v4: uuidv4 } = require('uuid');
const { logger } = require('../logger.cjs');
const { getDatabase } = require('../database.cjs');
const { getSystemToolsRegistry } = require('./SystemToolsRegistry.cjs');
const { getSuperBrainRouter } = require('./SuperBrainRouter.cjs');

/**
 * Messaging tools that are subject to auto_send_mode restriction
 */
const MESSAGING_TOOL_IDS = ['sendWhatsApp', 'sendTelegram', 'sendEmail'];

/**
 * AI Router modes
 */
const AI_ROUTER_MODES = {
  FULL: 'full',           // Classify and execute tools
  CLASSIFY_ONLY: 'classify_only', // Classify but don't execute
  DISABLED: 'disabled',   // No AI Router processing
};

/**
 * Confidence thresholds
 */
const CONFIDENCE_THRESHOLDS = {
  HIGH: 0.85,
  MEDIUM: 0.70,
  LOW: 0.50,
  MIN_FOR_EXECUTION: 0.70,
  MIN_FOR_CACHING: 0.80,
};

/**
 * Placeholder patterns for chaining
 */
const CHAIN_PLACEHOLDERS = {
  PREVIOUS_OUTPUT: '{PREVIOUS_OUTPUT}',
  SEARCH_RESULTS: '{SEARCH_RESULTS}',
  AI_GENERATED: '{AI_GENERATED}',
  SCRAPED_DATA: '{SCRAPED_DATA}',
};

/**
 * E-commerce URL patterns that need JS rendering
 */
const ECOMMERCE_PATTERNS = [
  /shopee\./i,
  /lazada\./i,
  /amazon\./i,
  /tokopedia\./i,
  /alibaba\./i,
  /taobao\./i,
  /ebay\./i,
  /zalora\./i,
];

/**
 * AI Router Service class
 */
class AIRouterService {
  constructor(options = {}) {
    this.toolsRegistry = getSystemToolsRegistry();
    this.superBrain = null; // Set via setSuperBrain()

    // Configuration
    this.config = {
      defaultModel: options.defaultModel || null, // Use SuperBrain's selection
      confidenceThreshold: options.confidenceThreshold || CONFIDENCE_THRESHOLDS.MIN_FOR_EXECUTION,
      maxChainLength: options.maxChainLength || 3,
      enableCaching: options.enableCaching !== false,
      cacheTimeout: options.cacheTimeout || 300000, // 5 minutes
      ...options,
    };

    // Intent cache (simple in-memory, could be Redis)
    this.intentCache = new Map();

    // Metrics
    this.metrics = {
      totalRequests: 0,
      toolUsage: {},
      clarifications: 0,
      chainExecutions: 0,
      errors: 0,
    };

    // Conversation history per user/session
    this.conversationHistory = new Map();
  }

  /**
   * Set SuperBrain router
   * @param {Object} superBrain - SuperBrainRouter instance
   */
  setSuperBrain(superBrain) {
    this.superBrain = superBrain;
  }

  /**
   * Load user's tool access settings from database
   * @param {string} userId - User ID
   * @returns {Object} Tool access settings
   */
  loadUserToolSettings(userId) {
    try {
      const db = getDatabase();
      const row = db.prepare(`
        SELECT auto_send_mode, enabled_tools, tool_confidence_threshold, ai_router_mode
        FROM superbrain_settings
        WHERE user_id = ?
      `).get(userId);

      if (!row) {
        // Return defaults
        return {
          autoSendMode: 'restricted',
          enabledTools: null, // null = all tools
          toolConfidenceThreshold: 0.7,
          aiRouterMode: 'full',
        };
      }

      return {
        autoSendMode: row.auto_send_mode || 'restricted',
        enabledTools: row.enabled_tools ? JSON.parse(row.enabled_tools) : null,
        toolConfidenceThreshold: row.tool_confidence_threshold !== null
          ? row.tool_confidence_threshold
          : 0.7,
        aiRouterMode: row.ai_router_mode || 'full',
      };

    } catch (error) {
      logger.warn(`Failed to load user tool settings: ${error.message}`);
      return {
        autoSendMode: 'restricted',
        enabledTools: null,
        toolConfidenceThreshold: 0.7,
        aiRouterMode: 'full',
      };
    }
  }

  /**
   * Check if a tool is allowed for the user
   * @param {string} toolId - Tool ID
   * @param {Object} userSettings - User's tool settings
   * @returns {Object} { allowed: boolean, reason: string }
   */
  checkToolAccess(toolId, userSettings) {
    const { autoSendMode, enabledTools } = userSettings;

    // Check if tool is in enabled list (if list is specified)
    if (enabledTools !== null && !enabledTools.includes(toolId)) {
      return {
        allowed: false,
        reason: `Tool "${toolId}" is not in your enabled tools list`,
      };
    }

    // Check if messaging tool and auto-send is restricted
    if (MESSAGING_TOOL_IDS.includes(toolId) && autoSendMode === 'restricted') {
      return {
        allowed: false,
        reason: `Messaging tool "${toolId}" is restricted. Auto-send mode is set to "restricted". Use FlowBuilder to send messages.`,
      };
    }

    return { allowed: true, reason: null };
  }

  /**
   * Process a user message and route to appropriate tools
   * @param {Object} request - Request object
   * @param {string} request.message - User message
   * @param {string} request.userId - User ID
   * @param {string} [request.sessionId] - Session ID for context
   * @param {Object} [request.context] - Additional context
   * @returns {Promise<Object>}
   */
  async process(request) {
    const requestId = uuidv4();
    const startTime = Date.now();

    const {
      message,
      userId,
      sessionId,
      context = {},
    } = request;

    this.metrics.totalRequests++;

    logger.debug(`AIRouter processing request ${requestId}: "${message.substring(0, 100)}..."`);

    try {
      // Step 0: Load user's tool access settings
      const userSettings = this.loadUserToolSettings(userId);

      // Check if AI Router is disabled
      if (userSettings.aiRouterMode === AI_ROUTER_MODES.DISABLED) {
        logger.debug(`AIRouter disabled for user ${userId}, skipping processing`);
        return {
          requestId,
          success: true,
          tool: null,
          response: null,
          skipped: true,
          reason: 'AI Router is disabled in user settings',
          duration: Date.now() - startTime,
        };
      }

      // Store settings in context for later use
      context.userToolSettings = userSettings;

      // Use user's confidence threshold if specified
      const confidenceThreshold = userSettings.toolConfidenceThreshold || this.config.confidenceThreshold;

      // Step 1: Check cache for similar intent
      const cacheKey = this.generateCacheKey(message, context);
      const cachedIntent = this.getFromCache(cacheKey);

      if (cachedIntent) {
        logger.debug(`AIRouter using cached intent for request ${requestId}`);

        // If classify_only mode, don't execute
        if (userSettings.aiRouterMode === AI_ROUTER_MODES.CLASSIFY_ONLY) {
          return {
            requestId,
            success: true,
            classification: cachedIntent,
            tool: cachedIntent.tools?.[0]?.tool || 'unknown',
            tools: cachedIntent.tools?.map(t => t.tool) || [],
            toolsWithDetails: (cachedIntent.tools || []).map(t => ({
              name: t.tool,
              category: this.toolsRegistry.getTool(t.tool)?.category || null,
              parameters: t.parameters || null,
              result: {
                success: true,
                output: null,
                error: 'Not executed (classify_only mode)',
              },
              duration: null,
            })),
            response: null,
            classifyOnly: true,
            reason: 'AI Router in classify_only mode - classification returned without execution',
            confidence: cachedIntent.confidence,
            duration: Date.now() - startTime,
          };
        }

        return await this.executeFromClassification(cachedIntent, request, requestId, userSettings);
      }

      // Step 2: Build context with conversation history
      const historyContext = this.buildHistoryContext(userId, sessionId);

      // Step 3: Classify intent using AI
      const classification = await this.classifyIntent(message, {
        ...context,
        historyContext,
        userId,
        enabledTools: userSettings.enabledTools,
      });

      // Step 4: Validate classification
      if (classification.confidence < confidenceThreshold) {
        // Route to clarify
        this.metrics.clarifications++;
        const clarifyParams = {
          question: classification.reasoning || 'I need more information to help you. Could you please clarify your request?',
          originalTools: classification.tools?.map(t => t.tool) || [],
          confidence: classification.confidence,
        };
        return {
          requestId,
          success: true,
          requiresClarification: true,
          tool: 'clarify',
          tools: ['clarify'],
          toolsWithDetails: [{
            name: 'clarify',
            category: 'system',
            parameters: clarifyParams,
            result: {
              success: true,
              output: { question: clarifyParams.question },
              error: null,
            },
            duration: Date.now() - startTime,
          }],
          response: clarifyParams.question,
          confidence: classification.confidence,
          duration: Date.now() - startTime,
        };
      }

      // Step 5: Cache high-confidence classifications
      if (classification.confidence >= CONFIDENCE_THRESHOLDS.MIN_FOR_CACHING) {
        this.addToCache(cacheKey, classification);
      }

      // Step 5.5: If classify_only mode, return classification without execution
      if (userSettings.aiRouterMode === AI_ROUTER_MODES.CLASSIFY_ONLY) {
        logger.debug(`AIRouter in classify_only mode, returning classification without execution`);
        return {
          requestId,
          success: true,
          classification,
          tool: classification.tools?.[0]?.tool || 'unknown',
          tools: classification.tools?.map(t => t.tool) || [],
          toolsWithDetails: (classification.tools || []).map(t => ({
            name: t.tool,
            category: this.toolsRegistry.getTool(t.tool)?.category || null,
            parameters: t.parameters || null,
            result: {
              success: true,
              output: null,
              error: 'Not executed (classify_only mode)',
            },
            duration: null,
          })),
          response: null,
          classifyOnly: true,
          reason: 'AI Router in classify_only mode - classification returned without execution',
          confidence: classification.confidence,
          reasoning: classification.reasoning,
          duration: Date.now() - startTime,
        };
      }

      // Step 6: Execute tool(s) with access control
      const result = await this.executeFromClassification(classification, request, requestId, userSettings);

      // Step 7: Update conversation history
      this.updateHistory(userId, sessionId, message, result);

      return {
        ...result,
        duration: Date.now() - startTime,
      };

    } catch (error) {
      this.metrics.errors++;
      logger.error(`AIRouter error for request ${requestId}: ${error.message}`);

      return {
        requestId,
        success: false,
        error: error.message,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Classify user intent using AI
   * @param {string} message - User message
   * @param {Object} context - Context
   * @returns {Promise<Object>}
   */
  async classifyIntent(message, context = {}) {
    // Generate system prompt with tool definitions
    const systemPrompt = this.toolsRegistry.generateSystemPrompt({
      enabledTools: context.enabledTools,
      customInstructions: context.customInstructions,
      conversationHistory: context.historyContext,
    });

    // Use SuperBrain or fallback to direct API call
    let aiResponse;

    if (this.superBrain) {
      const result = await this.superBrain.process({
        task: message,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message },
        ],
        userId: context.userId,
        temperature: 0.3, // Lower temperature for classification
        maxTokens: 2000,
      });

      aiResponse = result.content;
    } else {
      // Direct call if SuperBrain not available
      throw new Error('SuperBrain not initialized. Call setSuperBrain() first.');
    }

    // Parse AI response
    const classification = this.parseClassificationResponse(aiResponse, message);

    // Apply auto-switches (e-commerce detection, etc.)
    return this.applyAutoSwitches(classification, message);
  }

  /**
   * Parse AI classification response
   * @param {string} response - AI response
   * @param {string} originalMessage - Original user message
   * @returns {Object}
   */
  parseClassificationResponse(response, originalMessage) {
    try {
      // Log the raw response for debugging
      if (!response || response.length === 0) {
        logger.warn('Classification response is empty');
        throw new Error('Empty response from AI');
      }

      // Extract JSON from response
      let jsonStr = response;

      // Handle markdown code blocks
      const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
      }

      // Try to find JSON object in the response if not already clean JSON
      if (!jsonStr.startsWith('{') && !jsonStr.startsWith('[')) {
        const jsonObjectMatch = response.match(/\{[\s\S]*\}/);
        if (jsonObjectMatch) {
          jsonStr = jsonObjectMatch[0];
        }
      }

      // Log what we're trying to parse (truncated for readability)
      logger.debug(`Parsing classification JSON (${jsonStr.length} chars): ${jsonStr.substring(0, 200)}...`);

      const parsed = JSON.parse(jsonStr);

      // Handle single tool format
      if (parsed.tool) {
        return {
          tools: [{ tool: parsed.tool, parameters: parsed.parameters || {} }],
          confidence: parsed.confidence || 0.5,
          reasoning: parsed.reasoning || '',
          isChain: false,
        };
      }

      // Handle multi-tool chain format
      if (parsed.tools && Array.isArray(parsed.tools)) {
        return {
          tools: parsed.tools.map(t => ({
            tool: t.tool,
            parameters: t.parameters || {},
          })),
          confidence: parsed.confidence || 0.5,
          reasoning: parsed.reasoning || '',
          isChain: parsed.tools.length > 1,
        };
      }

      // Fallback to clarify
      return {
        tools: [{ tool: 'clarify', parameters: { question: 'Could you please clarify your request?' } }],
        confidence: 0.3,
        reasoning: 'Failed to parse classification',
        isChain: false,
      };

    } catch (error) {
      // Log more details for debugging
      const responsePreview = response ? response.substring(0, 500) : 'null/undefined';
      logger.warn(`Failed to parse classification response: ${error.message}`);
      logger.debug(`Raw response (first 500 chars): ${responsePreview}`);

      // Return clarify on parse failure
      return {
        tools: [{ tool: 'clarify', parameters: { question: 'I didn\'t quite understand that. Could you rephrase your request?' } }],
        confidence: 0.3,
        reasoning: `Parse error: ${error.message}`,
        isChain: false,
      };
    }
  }

  /**
   * Apply auto-switches based on detected patterns
   * @param {Object} classification - Classification result
   * @param {string} message - Original message
   * @returns {Object}
   */
  applyAutoSwitches(classification, message) {
    const tools = classification.tools || [];

    for (let i = 0; i < tools.length; i++) {
      const toolSpec = tools[i];

      // Auto-switch fetchWebPage to fetchJsPage for e-commerce URLs
      if (toolSpec.tool === 'fetchWebPage' || toolSpec.tool === 'downloadWebBody') {
        const url = toolSpec.parameters?.url || '';
        if (ECOMMERCE_PATTERNS.some(pattern => pattern.test(url))) {
          logger.debug(`Auto-switching ${toolSpec.tool} to fetchJsPage for e-commerce URL`);
          toolSpec.tool = 'fetchJsPage';
        }
      }

      // Detect URLs in message that might need fetching for CLI tools
      if (toolSpec.tool === 'aiChat' || toolSpec.tool === 'claudeCliPrompt' || toolSpec.tool === 'geminiCliPrompt') {
        const urlMatch = message.match(/https?:\/\/[^\s]+/);
        if (urlMatch && !toolSpec.parameters?.urlContent) {
          // Flag that URL content should be fetched
          toolSpec.parameters = {
            ...toolSpec.parameters,
            _autoFetchUrl: urlMatch[0],
          };
        }
      }
    }

    return classification;
  }

  /**
   * Execute tools from classification
   * @param {Object} classification - Classification result
   * @param {Object} request - Original request
   * @param {string} requestId - Request ID
   * @param {Object} userSettings - User's tool access settings
   * @returns {Promise<Object>}
   */
  async executeFromClassification(classification, request, requestId, userSettings = null) {
    const { tools, confidence, reasoning, isChain } = classification;
    const results = [];
    let previousOutput = null;
    const blockedTools = [];

    // Load user settings if not provided
    if (!userSettings) {
      userSettings = this.loadUserToolSettings(request.userId);
    }

    // Track tool usage
    for (const toolSpec of tools) {
      this.metrics.toolUsage[toolSpec.tool] = (this.metrics.toolUsage[toolSpec.tool] || 0) + 1;
    }

    // Execute tools
    for (let i = 0; i < tools.length; i++) {
      const toolSpec = tools[i];

      // Check tool access restrictions BEFORE execution
      const accessCheck = this.checkToolAccess(toolSpec.tool, userSettings);
      if (!accessCheck.allowed) {
        logger.info(`Tool "${toolSpec.tool}" blocked for user: ${accessCheck.reason}`);
        blockedTools.push({
          tool: toolSpec.tool,
          reason: accessCheck.reason,
        });

        results.push({
          tool: toolSpec.tool,
          success: false,
          blocked: true,
          error: accessCheck.reason,
        });

        // Don't stop chain, continue to next tool (might be a non-messaging tool)
        continue;
      }

      // Resolve placeholders from previous outputs
      const resolvedParams = this.resolveChainPlaceholders(toolSpec.parameters, previousOutput, results);

      // Handle auto-fetch URL if flagged
      if (resolvedParams._autoFetchUrl) {
        try {
          const urlContent = await this.fetchUrlContent(resolvedParams._autoFetchUrl);
          resolvedParams.additionalContext = urlContent;
          delete resolvedParams._autoFetchUrl;
        } catch (error) {
          logger.warn(`Failed to auto-fetch URL: ${error.message}`);
        }
      }

      // Execute the tool
      const toolStartTime = Date.now();
      const result = await this.executeTool(toolSpec.tool, resolvedParams, {
        ...request.context,
        userId: request.userId,
        requestId,
      });
      const toolDuration = Date.now() - toolStartTime;

      results.push({
        tool: toolSpec.tool,
        parameters: resolvedParams,
        duration: toolDuration,
        ...result,
      });

      // Store output for chaining
      if (result.success) {
        previousOutput = result.result;
      } else if (!result.blocked) {
        // Stop chain on non-blocked error
        break;
      }
    }

    // Track chain executions
    if (isChain && tools.length > 1) {
      this.metrics.chainExecutions++;
    }

    // Build response
    const successfulResults = results.filter(r => r.success);
    const allSuccess = successfulResults.length === results.length;
    const finalResult = results[results.length - 1];

    // AI summarization for file-reading tools
    const FILE_TOOLS = ['readPdf', 'readExcel', 'readDocx', 'readText', 'readCsv'];
    if (finalResult?.success && FILE_TOOLS.includes(finalResult.tool) && this.superBrain) {
      try {
        const toolOutput = finalResult.result;
        // Truncate large data to avoid token overflow
        const rawText = typeof toolOutput === 'string'
          ? toolOutput
          : JSON.stringify(toolOutput, null, 2);
        const truncated = rawText.length > 8000 ? rawText.substring(0, 8000) + '\n...(truncated)' : rawText;

        const fileName = tools[tools.length - 1]?.parameters?.filePath || 'document';
        const summaryResult = await this.superBrain.process({
          task: `Summarize the following document content`,
          messages: [
            {
              role: 'system',
              content: `You are a document analysis assistant. Summarize the extracted content from "${fileName}" clearly and concisely. Highlight key data points, structure, and important information. If the data is tabular, describe the columns and notable rows. Keep your summary under 500 words. Use plain text, no markdown.`,
            },
            {
              role: 'user',
              content: `Here is the extracted content from "${fileName}":\n\n${truncated}`,
            },
          ],
          userId: request.userId,
          temperature: 0.3,
          maxTokens: 1500,
        });

        if (summaryResult?.content) {
          finalResult.result = {
            ...toolOutput,
            summary: summaryResult.content,
          };
          logger.info(`AI summarized ${finalResult.tool} output (${rawText.length} chars → ${summaryResult.content.length} chars)`);
        }
      } catch (summaryError) {
        logger.warn(`AI summarization failed for ${finalResult.tool}: ${summaryError.message}`);
      }
    }

    // Build response message including blocked tool info
    let response = this.formatResponse(finalResult, tools);
    if (blockedTools.length > 0) {
      const blockMsg = blockedTools.map(b => `${b.tool}: ${b.reason}`).join('; ');
      response = response
        ? `${response}\n\n⚠️ Some tools were blocked: ${blockMsg}`
        : `⚠️ Tools blocked: ${blockMsg}`;
    }

    return {
      requestId,
      success: allSuccess,
      tool: tools.length === 1 ? tools[0].tool : 'chain',
      tools: tools.map(t => t.tool),
      toolsWithDetails: results.map(r => ({
        name: r.tool,
        category: this.toolsRegistry.getTool(r.tool)?.category || null,
        parameters: r.parameters || null,
        result: {
          success: r.success,
          output: r.result,
          error: r.error || null,
        },
        duration: r.duration || null,
      })),
      results,
      blockedTools: blockedTools.length > 0 ? blockedTools : undefined,
      response,
      confidence,
      reasoning,
    };
  }

  /**
   * Execute a single tool
   * @param {string} toolId - Tool ID
   * @param {Object} params - Parameters
   * @param {Object} context - Execution context
   * @returns {Promise<Object>}
   */
  async executeTool(toolId, params, context = {}) {
    // Special handling for built-in response tools
    if (toolId === 'respond') {
      return {
        success: true,
        result: { message: params.message },
      };
    }

    if (toolId === 'clarify') {
      return {
        success: true,
        result: { question: params.question, options: params.options },
        requiresClarification: true,
      };
    }

    // Execute through registry
    return await this.toolsRegistry.executeTool(toolId, params, context);
  }

  /**
   * Resolve placeholders in parameters for tool chaining
   * @param {Object} params - Parameters with possible placeholders
   * @param {*} previousOutput - Output from previous tool
   * @param {Array} allResults - All results so far
   * @returns {Object}
   */
  resolveChainPlaceholders(params, previousOutput, allResults) {
    const resolved = {};

    for (const [key, value] of Object.entries(params)) {
      if (typeof value !== 'string') {
        resolved[key] = value;
        continue;
      }

      let resolvedValue = value;

      // Replace placeholders
      if (resolvedValue.includes(CHAIN_PLACEHOLDERS.PREVIOUS_OUTPUT)) {
        const replacement = typeof previousOutput === 'string'
          ? previousOutput
          : JSON.stringify(previousOutput);
        resolvedValue = resolvedValue.replace(CHAIN_PLACEHOLDERS.PREVIOUS_OUTPUT, replacement);
      }

      if (resolvedValue.includes(CHAIN_PLACEHOLDERS.SEARCH_RESULTS)) {
        const searchResult = allResults.find(r => r.tool === 'searchWeb' && r.success);
        if (searchResult?.result?.results) {
          resolvedValue = resolvedValue.replace(
            CHAIN_PLACEHOLDERS.SEARCH_RESULTS,
            JSON.stringify(searchResult.result.results)
          );
        }
      }

      if (resolvedValue.includes(CHAIN_PLACEHOLDERS.SCRAPED_DATA)) {
        const scrapeResult = allResults.find(r =>
          (r.tool === 'scrapeWebPage' || r.tool === 'fetchWebPage') && r.success
        );
        if (scrapeResult?.result) {
          resolvedValue = resolvedValue.replace(
            CHAIN_PLACEHOLDERS.SCRAPED_DATA,
            typeof scrapeResult.result === 'string'
              ? scrapeResult.result
              : JSON.stringify(scrapeResult.result)
          );
        }
      }

      resolved[key] = resolvedValue;
    }

    return resolved;
  }

  /**
   * Fetch URL content for CLI AI tools
   * @param {string} url - URL to fetch
   * @returns {Promise<string>}
   */
  async fetchUrlContent(url) {
    const result = await this.toolsRegistry.executeTool('fetchWebPage', { url }, {});
    if (result.success) {
      return typeof result.result === 'string'
        ? result.result
        : JSON.stringify(result.result);
    }
    throw new Error(result.error || 'Failed to fetch URL');
  }

  /**
   * Format response for user
   * @param {Object} result - Execution result
   * @param {Array} tools - Tools used
   * @returns {string}
   */
  formatResponse(result, tools) {
    if (!result) return 'No result';

    if (result.requiresClarification) {
      return result.result?.question || 'Could you please clarify?';
    }

    if (!result.success) {
      return `Sorry, I encountered an error: ${result.error}`;
    }

    // Extract meaningful response
    const output = result.result;

    // Prefer AI summary for file tools
    if (output?.summary) {
      return output.summary;
    }

    if (typeof output === 'string') {
      return output;
    }

    if (output?.message) {
      return output.message;
    }

    if (output?.content) {
      return output.content;
    }

    if (output?.response) {
      return output.response;
    }

    // For structured data (Excel rows, CSV), create a brief textual summary
    if (output?.data && Array.isArray(output.data)) {
      const rowCount = output.data.length;
      const headers = rowCount > 0 ? Object.keys(output.data[0]) : [];
      const preview = output.data.slice(0, 5).map(row =>
        headers.map(h => `${h}: ${row[h]}`).join(', ')
      ).join('\n');
      return `📊 Read ${rowCount} rows from "${output.sheet || 'file'}".\nColumns: ${headers.join(', ')}\n\nPreview (first ${Math.min(5, rowCount)} rows):\n${preview}`;
    }

    // For text extraction (PDF, DOCX, TXT)
    if (output?.text && typeof output.text === 'string') {
      const textPreview = output.text.length > 2000 ? output.text.substring(0, 2000) + '...' : output.text;
      const pageInfo = output.numPages ? ` (${output.numPages} pages)` : '';
      return `📄 Document content${pageInfo}:\n\n${textPreview}`;
    }

    // Default: stringify
    return JSON.stringify(output, null, 2);
  }

  /**
   * Build conversation history context
   * @param {string} userId - User ID
   * @param {string} sessionId - Session ID
   * @returns {string}
   */
  buildHistoryContext(userId, sessionId) {
    const key = `${userId}:${sessionId || 'default'}`;
    const history = this.conversationHistory.get(key) || [];

    if (history.length === 0) return '';

    // Take last 10 exchanges
    const recent = history.slice(-10);

    let context = 'CONVERSATION HISTORY:\n';
    for (const entry of recent) {
      context += `User: ${entry.message}\n`;
      context += `Assistant: (→ ${entry.tool}) ${entry.summary}\n\n`;
    }

    return context;
  }

  /**
   * Update conversation history
   * @param {string} userId - User ID
   * @param {string} sessionId - Session ID
   * @param {string} message - User message
   * @param {Object} result - Execution result
   */
  updateHistory(userId, sessionId, message, result) {
    const key = `${userId}:${sessionId || 'default'}`;
    let history = this.conversationHistory.get(key) || [];

    history.push({
      message: message.substring(0, 200),
      tool: result.tool,
      summary: this.summarizeResult(result),
      timestamp: Date.now(),
    });

    // Keep only last 20 entries
    if (history.length > 20) {
      history = history.slice(-20);
    }

    this.conversationHistory.set(key, history);
  }

  /**
   * Summarize result for history
   * @param {Object} result - Execution result
   * @returns {string}
   */
  summarizeResult(result) {
    if (result.response) {
      return result.response.substring(0, 100) + (result.response.length > 100 ? '...' : '');
    }
    return result.success ? 'Completed successfully' : `Error: ${result.error}`;
  }

  /**
   * Generate cache key
   * @param {string} message - Message
   * @param {Object} context - Context
   * @returns {string}
   */
  generateCacheKey(message, context = {}) {
    // Simple hash: normalize message + enabled tools
    const normalized = message.toLowerCase().trim();
    const tools = (context.enabledTools || []).sort().join(',');
    return `${normalized}:${tools}`;
  }

  /**
   * Get from intent cache
   * @param {string} key - Cache key
   * @returns {Object|null}
   */
  getFromCache(key) {
    if (!this.config.enableCaching) return null;

    const cached = this.intentCache.get(key);
    if (!cached) return null;

    // Check expiry
    if (Date.now() - cached.timestamp > this.config.cacheTimeout) {
      this.intentCache.delete(key);
      return null;
    }

    return cached.classification;
  }

  /**
   * Add to intent cache
   * @param {string} key - Cache key
   * @param {Object} classification - Classification result
   */
  addToCache(key, classification) {
    if (!this.config.enableCaching) return;

    this.intentCache.set(key, {
      classification,
      timestamp: Date.now(),
    });

    // Clean old entries if cache gets too large
    if (this.intentCache.size > 1000) {
      const oldest = this.intentCache.keys().next().value;
      this.intentCache.delete(oldest);
    }
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.intentCache.clear();
  }

  /**
   * Clear user history
   * @param {string} userId - User ID
   * @param {string} [sessionId] - Session ID
   */
  clearHistory(userId, sessionId) {
    if (sessionId) {
      this.conversationHistory.delete(`${userId}:${sessionId}`);
    } else {
      // Clear all sessions for user
      for (const key of this.conversationHistory.keys()) {
        if (key.startsWith(`${userId}:`)) {
          this.conversationHistory.delete(key);
        }
      }
    }
  }

  /**
   * Get metrics
   * @returns {Object}
   */
  getMetrics() {
    return {
      ...this.metrics,
      cacheSize: this.intentCache.size,
      activeHistories: this.conversationHistory.size,
      registeredTools: this.toolsRegistry.getStats(),
    };
  }

  /**
   * Get info
   * @returns {Object}
   */
  getInfo() {
    return {
      name: 'AI Router Service',
      version: '1.0.0',
      config: {
        confidenceThreshold: this.config.confidenceThreshold,
        maxChainLength: this.config.maxChainLength,
        enableCaching: this.config.enableCaching,
      },
      metrics: this.getMetrics(),
    };
  }
}

// Singleton instance
let aiRouterInstance = null;

/**
 * Get the AIRouterService singleton
 * @param {Object} [options] - Options
 * @returns {AIRouterService}
 */
function getAIRouterService(options = {}) {
  if (!aiRouterInstance) {
    aiRouterInstance = new AIRouterService(options);
  }
  return aiRouterInstance;
}

module.exports = {
  AIRouterService,
  getAIRouterService,
  CONFIDENCE_THRESHOLDS,
  CHAIN_PLACEHOLDERS,
  MESSAGING_TOOL_IDS,
  AI_ROUTER_MODES,
};
