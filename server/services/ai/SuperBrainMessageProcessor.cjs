/**
 * SuperBrain Message Processor
 *
 * Central orchestrator for all message processing in SwarmAI.
 * Acts as the "Main System Brain" that coordinates:
 * - Flow trigger evaluation and execution
 * - AI Router intent classification and tool execution
 * - Swarm agent routing
 * - Direct AI response generation
 *
 * Message Flow:
 * Platform → Unified Message → SuperBrain → [Flow|Tool|AI|Swarm] → Response
 */

const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('../logger.cjs');
const { getDatabase } = require('../database.cjs');

// Lazy-loaded dependencies to avoid circular imports
let _superBrainRouter = null;
let _aiRouterService = null;
let _flowEngine = null;
let _messageClassifier = null;
let _smartIngestion = null;
let _superBrainLogService = null;
let _visionService = null;
let _visionAIService = null;
let _localWhisperService = null;
let _voiceTranscriptionService = null;

function getSuperBrainLogService() {
  if (!_superBrainLogService) {
    try {
      const { getSuperBrainLogService: getService } = require('./SuperBrainLogService.cjs');
      _superBrainLogService = getService();
    } catch (error) {
      logger.warn('SuperBrainLogService not available');
    }
  }
  return _superBrainLogService;
}

function getVisionService() {
  if (!_visionService) {
    try {
      const { visionService } = require('../vision/VisionAnalysisService.cjs');
      _visionService = visionService;
    } catch (error) {
      logger.warn('VisionAnalysisService not available:', error.message);
    }
  }
  return _visionService;
}

function getVisionAIService() {
  if (!_visionAIService) {
    try {
      const { getVisionAIService: getService } = require('../vision/VisionAIService.cjs');
      _visionAIService = getService();
    } catch (error) {
      logger.warn('VisionAIService not available:', error.message);
    }
  }
  return _visionAIService;
}

function getLocalWhisperServiceLazy() {
  if (!_localWhisperService) {
    try {
      const { localWhisperService } = require('../voice/LocalWhisperService.cjs');
      _localWhisperService = localWhisperService;
    } catch (error) {
      logger.debug('LocalWhisperService not available:', error.message);
    }
  }
  return _localWhisperService;
}

function getVoiceTranscriptionServiceLazy() {
  if (!_voiceTranscriptionService) {
    try {
      const { getVoiceTranscriptionService } = require('../voice/VoiceTranscriptionService.cjs');
      _voiceTranscriptionService = getVoiceTranscriptionService();
    } catch (error) {
      logger.debug('VoiceTranscriptionService not available:', error.message);
    }
  }
  return _voiceTranscriptionService;
}

function getSuperBrainRouter() {
  if (!_superBrainRouter) {
    const { getSuperBrainRouter: getRouter } = require('./SuperBrainRouter.cjs');
    _superBrainRouter = getRouter();
  }
  return _superBrainRouter;
}

function getAIRouterService() {
  if (!_aiRouterService) {
    const { getAIRouterService: getService } = require('./AIRouterService.cjs');
    _aiRouterService = getService();
  }
  return _aiRouterService;
}

function getFlowEngine() {
  if (!_flowEngine) {
    try {
      const { getFlowExecutionEngine } = require('../flow/FlowExecutionEngine.cjs');
      _flowEngine = getFlowExecutionEngine();
    } catch (error) {
      logger.warn('FlowExecutionEngine not available');
    }
  }
  return _flowEngine;
}

function getMessageClassifier() {
  if (!_messageClassifier) {
    try {
      const { getMessageClassifier: getClassifier } = require('./MessageClassifier.cjs');
      _messageClassifier = getClassifier();
    } catch (error) {
      logger.warn('MessageClassifier not available');
    }
  }
  return _messageClassifier;
}

function getSmartIngestion() {
  if (!_smartIngestion) {
    try {
      const { getNewsletterIngestion } = require('../rag/NewsletterIngestion.cjs');
      _smartIngestion = getNewsletterIngestion();
    } catch (error) {
      logger.warn('SmartIngestion (NewsletterIngestion) not available');
    }
  }
  return _smartIngestion;
}

/**
 * Processing modes for message handling
 */
const PROCESSING_MODES = {
  AUTO: 'auto',           // SuperBrain decides (default)
  FLOW_ONLY: 'flow_only', // Only check flow triggers
  AI_ROUTER: 'ai_router', // Use AI Router for intent classification
  DIRECT_AI: 'direct_ai', // Direct AI response (no tool routing)
  SWARM: 'swarm',         // Route to swarm agents
};

/**
 * Response types from SuperBrain processing
 */
const RESPONSE_TYPES = {
  FLOW_EXECUTED: 'flow_executed',
  TOOL_EXECUTED: 'tool_executed',
  AI_RESPONSE: 'ai_response',
  SWARM_DELEGATED: 'swarm_delegated',
  PASSIVE_INGESTED: 'passive_ingested', // Content ingested to RAG (no response)
  SILENT: 'silent',                     // AI decided not to respond (<<SILENT>> protocol)
  NO_ACTION: 'no_action',
  CLARIFICATION: 'clarification',
  ERROR: 'error',
};

// Silent reply detection
const SILENT_TOKEN = '<<SILENT>>';
const SILENT_TOKEN_REGEX = /<<SILENT>>/i;

/**
 * Unified message schema
 */
const MESSAGE_SCHEMA = {
  // Required
  id: null,
  platform: null,      // whatsapp, telegram, email, webhook, etc.
  content: null,       // Message text content
  from: null,          // Sender identifier

  // Optional
  to: null,            // Recipient (for outgoing)
  contentType: 'text', // text, image, video, audio, document, location
  mediaUrl: null,
  mimeType: null,
  timestamp: null,
  externalId: null,
  conversationId: null,

  // Sender info
  sender: {
    id: null,
    name: null,
    phone: null,
    email: null,
  },

  // Group info
  isGroup: false,
  groupId: null,
  groupName: null,

  // Metadata
  metadata: {},
};

class SuperBrainMessageProcessor extends EventEmitter {
  constructor() {
    super();
    this.broadcast = null;
    this.initialized = false;
    this.processingHistory = new Map(); // Track recent processing for dedup
    this.config = {
      enableFlowTriggers: true,
      enableAIRouter: true,
      enableSwarm: true,
      enableMessageClassification: true, // Pre-classify messages (SKIP/PASSIVE/ACTIVE)
      enablePassiveIngestion: true, // Ingest passive content to RAG
      enableAutoImageAnalysis: true, // Auto-analyze images with OCR/Vision AI
      enableOcrCleanup: true, // Use AI to clean up OCR text (remove artifacts)
      enableAutoDocumentAnalysis: true, // Auto-extract text from PDF/Excel/Word documents
      maxDocumentExtractLength: 3000, // Max chars to store from document extraction
      autoReply: false, // Auto-send responses back to platform
      maxProcessingHistory: 1000,
      deduplicationWindowMs: 5000, // 5 seconds
      minOcrConfidence: 0.3, // Minimum OCR confidence to use extracted text
      maxContentLengthForImageAnalysis: 10, // Max content length to trigger auto-analysis
    };
  }

  /**
   * Initialize the processor
   * @param {Object} options - Configuration options
   * @param {Function} options.broadcast - WebSocket broadcast function
   * @param {Object} options.config - Override default config
   */
  initialize(options = {}) {
    if (options.broadcast) {
      this.broadcast = options.broadcast;
    }
    if (options.config) {
      this.config = { ...this.config, ...options.config };
    }
    this.initialized = true;
    logger.info('SuperBrainMessageProcessor initialized');
  }

  /**
   * Set broadcast function
   * @param {Function} broadcast - WebSocket broadcast function
   */
  setBroadcast(broadcast) {
    this.broadcast = broadcast;
  }

  /**
   * Process an incoming message through SuperBrain
   * This is the main entry point for all message processing
   *
   * @param {Object} message - Unified message object
   * @param {Object} context - Processing context
   * @param {string} context.userId - User ID
   * @param {string} context.agentId - Agent ID (optional)
   * @param {string} context.accountId - Platform account ID
   * @param {string} context.mode - Processing mode (optional)
   * @returns {Promise<Object>} Processing result
   */
  async process(message, context = {}) {
    const requestId = uuidv4();
    const startTime = Date.now();

    // Initialize log context for comprehensive tracking
    const logContext = {
      message: {
        id: null,
        platform: null,
        sender: null,
        contentPreview: null,
        conversationId: null,
      },
      classification: {
        intent: null,
        tier: null,
        confidence: null,
        reasons: [],
      },
      execution: {
        providerChain: [],
        providerUsed: null,
        model: null,
        failedProviders: [],
        tokenUsage: null,
      },
      tools: [],
      result: {
        type: null,
        success: true,
        error: null,
        responsePreview: null,
      },
      duration: {
        total: 0,
        classification: 0,
        providerSelection: 0,
        execution: 0,
        tools: 0,
      },
      userId: context.userId,
      agentId: context.agentId,
      flowId: null,
    };

    try {
      // Normalize message
      const normalizedMessage = this.normalizeMessage(message);

      // Populate log context with message info
      logContext.message = {
        id: normalizedMessage.id,
        platform: normalizedMessage.platform,
        sender: normalizedMessage.sender?.name || normalizedMessage.from,
        contentPreview: (normalizedMessage.content || '').substring(0, 100),
        conversationId: normalizedMessage.conversationId || context.conversationId,
      };

      // Check for duplicate processing
      if (this.isDuplicate(normalizedMessage)) {
        logger.debug(`Skipping duplicate message: ${normalizedMessage.id}`);
        return {
          type: RESPONSE_TYPES.NO_ACTION,
          reason: 'duplicate',
          requestId,
        };
      }

      // Mark as processing
      this.markProcessing(normalizedMessage);

      logger.info(`SuperBrain processing message ${normalizedMessage.id} from ${normalizedMessage.platform}`);

      // Get processing mode
      const mode = context.mode || PROCESSING_MODES.AUTO;

      let result;

      switch (mode) {
        case PROCESSING_MODES.FLOW_ONLY:
          result = await this.processFlowOnly(normalizedMessage, context, logContext);
          break;

        case PROCESSING_MODES.AI_ROUTER:
          result = await this.processWithAIRouter(normalizedMessage, context, logContext);
          break;

        case PROCESSING_MODES.DIRECT_AI:
          result = await this.processWithDirectAI(normalizedMessage, context, logContext);
          break;

        case PROCESSING_MODES.SWARM:
          result = await this.processWithSwarm(normalizedMessage, context, logContext);
          break;

        case PROCESSING_MODES.AUTO:
        default:
          result = await this.processAuto(normalizedMessage, context, logContext);
          break;
      }

      // Add processing metadata
      result.requestId = requestId;
      result.processingTimeMs = Date.now() - startTime;
      result.message = normalizedMessage;

      // Finalize log context
      logContext.duration.total = result.processingTimeMs;
      logContext.result.type = result.type;
      logContext.result.success = result.type !== RESPONSE_TYPES.ERROR;
      logContext.result.responsePreview = (result.response || '').substring(0, 200);

      // Extract additional info from result
      if (result.provider) logContext.execution.providerUsed = result.provider;
      if (result.model) logContext.execution.model = result.model;
      if (result.flow) logContext.flowId = result.flow.id;
      // Extract tool information - prefer toolsWithDetails for full info
      // Priority: result.toolsWithDetails > already populated logContext.tools > result.tools > result.tool
      if (result.toolsWithDetails && Array.isArray(result.toolsWithDetails)) {
        logContext.tools = result.toolsWithDetails;
      } else if (logContext.tools && logContext.tools.length > 0 && logContext.tools[0].parameters !== undefined) {
        // logContext.tools already has detailed info (set by sub-processor), keep it
        // Don't overwrite with less detailed extraction
      } else if (result.tools) {
        logContext.tools = result.tools.map(t => ({
          name: typeof t === 'string' ? t : t.name,
          category: typeof t === 'object' ? t.category : null,
          parameters: typeof t === 'object' ? t.parameters : null,
          result: typeof t === 'object' ? t.result : null,
          duration: typeof t === 'object' ? t.duration : null,
        }));
      } else if (result.tool) {
        logContext.tools = [{
          name: result.tool,
          category: null,
          parameters: result.results?.parameters || null,
          result: { success: true, output: result.results },
          duration: null,
        }];
      }

      // Create log entry (async, non-blocking)
      const logService = getSuperBrainLogService();
      if (logService && logContext.userId) {
        logService.createLogEntry(logContext).catch(err => {
          logger.debug(`Failed to create SuperBrain log: ${err.message}`);
        });
      }

      // Emit processing complete event
      this.emit('message:processed', result);

      // Broadcast result if enabled
      if (this.broadcast) {
        this.broadcast('superbrain:processed', {
          requestId,
          messageId: normalizedMessage.id,
          type: result.type,
          processingTimeMs: result.processingTimeMs,
        }, context.agentId);
      }

      // Auto-reply if enabled and we have a non-silent response
      if (this.config.autoReply && result.response && result.type !== RESPONSE_TYPES.SILENT && context.replyFunction) {
        await this.sendAutoReply(result, context);
      }

      // Build detailed log with tools info
      let logMessage = `SuperBrain completed processing in ${result.processingTimeMs}ms: ${result.type}`;
      if (result.type === RESPONSE_TYPES.TOOL_EXECUTED) {
        if (result.tools && result.tools.length > 0) {
          logMessage += ` [tools: ${result.tools.join(', ')}]`;
        } else if (result.tool) {
          logMessage += ` [tool: ${result.tool}]`;
        }
        if (result.command) {
          logMessage += ` [command: ${result.command}]`;
        }
      } else if (result.type === RESPONSE_TYPES.FLOW_EXECUTED && result.flow) {
        logMessage += ` [flow: ${result.flow.name || result.flow.id}]`;
      } else if (result.type === RESPONSE_TYPES.AI_RESPONSE && result.provider) {
        logMessage += ` [provider: ${result.provider}]`;
      } else if (result.type === RESPONSE_TYPES.SWARM_DELEGATED && result.agent) {
        logMessage += ` [agent: ${result.agent.name || result.agent.id}]`;
      }
      logger.info(logMessage);
      return result;

    } catch (error) {
      logger.error(`SuperBrain processing failed: ${error.message}`);

      // Log error in context
      logContext.duration.total = Date.now() - startTime;
      logContext.result.type = RESPONSE_TYPES.ERROR;
      logContext.result.success = false;
      logContext.result.error = error.message;

      // Create error log entry
      const logService = getSuperBrainLogService();
      if (logService && logContext.userId) {
        logService.createLogEntry(logContext).catch(err => {
          logger.debug(`Failed to create SuperBrain error log: ${err.message}`);
        });
      }

      const errorResult = {
        type: RESPONSE_TYPES.ERROR,
        error: error.message,
        requestId,
        processingTimeMs: Date.now() - startTime,
      };

      this.emit('message:error', errorResult);
      return errorResult;
    }
  }

  /**
   * Auto mode - SuperBrain decides the best processing path
   * Priority: Message Classification → Flow Triggers → AI Router → Direct AI
   * @private
   */
  async processAuto(message, context, logContext = {}) {
    const classificationStart = Date.now();

    // Step -1: Message gating (echo, group allowlist, mention, rate limit, content)
    try {
      const { getMessageGatingService } = require('./MessageGatingService.cjs');
      const gating = getMessageGatingService();
      const gateResult = await gating.evaluate(message, context);
      if (!gateResult.pass) {
        logger.info(`[Gating] Message blocked by ${gateResult.gate}: ${gateResult.reason}`);
        return {
          type: RESPONSE_TYPES.NO_ACTION,
          reason: `gated:${gateResult.gate}:${gateResult.reason}`,
          gate: gateResult.gate,
        };
      }
    } catch (e) {
      logger.debug(`[Gating] Service unavailable: ${e.message}`);
      // Fail-open: continue processing if gating service fails
    }

    // Step 0: Classify message intent (SKIP, PASSIVE, ACTIVE)
    if (this.config.enableMessageClassification) {
      const classifier = getMessageClassifier();
      if (classifier) {
        const classification = classifier.classify(message, context);
        logger.debug(`Message classified as: ${classification.intent} (reason: ${classification.reason})`);

        // Update log context with classification
        logContext.classification = {
          intent: classification.intent?.toUpperCase() || null,
          tier: null, // Will be set if AI processing happens
          confidence: classification.confidence || null,
          reasons: classification.reason ? [classification.reason] : [],
        };
        logContext.duration.classification = Date.now() - classificationStart;

        // SKIP: No processing needed (spam, noise, etc.)
        if (classification.intent === 'skip') {
          logger.info(`Message skipped: ${classification.reason}`);
          return {
            type: RESPONSE_TYPES.NO_ACTION,
            reason: classification.reason,
            classification,
          };
        }

        // PASSIVE: Content for RAG ingestion (newsletters, broadcasts, etc.)
        if (classification.intent === 'passive' && this.config.enablePassiveIngestion) {
          const ingestion = getSmartIngestion();
          if (ingestion) {
            // Run ingestion in background (non-blocking)
            this.ingestPassiveContent(message, context, classification).catch(error => {
              logger.error(`Background ingestion failed: ${error.message}`);
            });

            logger.info(`Passive content queued for ingestion: ${classification.source}`);
            return {
              type: RESPONSE_TYPES.PASSIVE_INGESTED,
              reason: 'content_ingested_to_rag',
              sourceType: classification.source,
              classification,
            };
          }
          // If ingestion not available, treat as no action
          return {
            type: RESPONSE_TYPES.NO_ACTION,
            reason: 'passive_content_no_ingestion_service',
            classification,
          };
        }

        // ACTIVE: Continue with normal processing flow
        logger.debug(`Active message - proceeding to flow/AI processing`);
      }
    }

    // Load per-user content analysis settings
    let userAnalysisSettings = null;
    try {
      const db = getDatabase();
      userAnalysisSettings = db.prepare(`
        SELECT ocr_auto_extract, vision_enabled, doc_auto_extract, doc_auto_summarize,
               transcription_enabled, transcription_auto_extract, transcription_language
        FROM superbrain_settings WHERE user_id = ?
      `).get(context.userId);
    } catch (e) {
      logger.debug(`Could not load user analysis settings: ${e.message}`);
    }
    const userOcrEnabled = userAnalysisSettings ? userAnalysisSettings.ocr_auto_extract !== 0 : true;
    const userVisionEnabled = userAnalysisSettings ? userAnalysisSettings.vision_enabled !== 0 : true;
    const userDocExtract = userAnalysisSettings ? userAnalysisSettings.doc_auto_extract !== 0 : true;
    const userDocSummarize = userAnalysisSettings ? Boolean(userAnalysisSettings.doc_auto_summarize) : false;
    const userTranscriptionEnabled = userAnalysisSettings ? userAnalysisSettings.transcription_enabled !== 0 : true;
    const userTranscriptionAutoExtract = userAnalysisSettings ? userAnalysisSettings.transcription_auto_extract !== 0 : true;
    const userTranscriptionLanguage = userAnalysisSettings?.transcription_language || 'auto';

    // Pending analysis response - will be returned if no flow matches
    // This ensures flow triggers are ALWAYS checked first, even for media-only messages
    let pendingAnalysisResponse = null;

    // Step 0.5: Auto-analyze image messages (OCR + Vision AI)
    // This enriches image-only messages with extracted/generated text content
    if (this.config.enableAutoImageAnalysis && (userOcrEnabled || userVisionEnabled)) {
      const originalContent = message.content?.trim() || '';
      const wasImageOnly = !originalContent || originalContent.length <= this.config.maxContentLengthForImageAnalysis;

      const analyzedMessage = await this.autoAnalyzeImageMessage(message, {
        ...context,
        ocrEnabled: userOcrEnabled,
        visionEnabled: userVisionEnabled,
      });
      if (analyzedMessage.metadata?.autoAnalyzed) {
        logger.info(`Image auto-analyzed: ${analyzedMessage.metadata.analysisType}`);

        // Update message reference with analyzed content (for flow triggers to use)
        Object.assign(message, analyzedMessage);

        // If original message was image-only, prepare analysis response
        // but don't return yet - check flow triggers first
        if (wasImageOnly) {
          const analysisType = analyzedMessage.metadata.analysisType;
          let responseText = '';

          if (analysisType === 'ocr') {
            // Format OCR result in monospace block
            const ocrText = analyzedMessage.content.replace('[Image Text OCR]: ', '');
            responseText = `📝 **Text Extracted from Image (OCR)**\n\n\`\`\`\n${ocrText}\n\`\`\`\n\n_Confidence: ${(analyzedMessage.metadata.ocrConfidence * 100).toFixed(1)}%_`;
          } else if (analysisType === 'vision_ai') {
            // Format Vision AI description
            const description = analyzedMessage.content.replace('[Image Description]: ', '');
            responseText = `🖼️ **Image Analysis**\n\n${description}`;
          }

          // Store for later - return after flow trigger check if no flow matched
          pendingAnalysisResponse = {
            type: RESPONSE_TYPES.AI_RESPONSE,
            response: responseText,
            metadata: {
              imageAnalysis: true,
              analysisType,
              ...analyzedMessage.metadata,
            },
          };
        }
      }
    }

    // Step 0.6: Auto-analyze document messages (extract text from PDF/Excel/Word)
    // This extracts text content from documents so it shows in the monocode display
    if (this.config.enableAutoDocumentAnalysis && userDocExtract) {
      const analyzedDoc = await this.autoAnalyzeDocumentMessage(message, context);
      if (analyzedDoc.metadata?.autoAnalyzed && analyzedDoc.metadata?.analysisType === 'document_extract') {
        logger.info(`Document auto-analyzed: ${analyzedDoc.metadata.docType} (${analyzedDoc.metadata.originalTextLength} chars)`);

        // Update message reference with extracted content (for flow triggers to use)
        Object.assign(message, analyzedDoc);

        // For document-only messages (no accompanying text), prepare response
        // but don't return yet - check flow triggers first
        const hasAccompanyingText = message.metadata?.originalContent?.trim().length > 0;
        if (!hasAccompanyingText) {
          const docType = analyzedDoc.metadata.docType;
          const fileName = analyzedDoc.metadata.fileName || 'Document';
          const pages = analyzedDoc.metadata.docPages;
          const pagesInfo = pages ? ` (${pages} ${docType === 'excel' ? 'sheets' : 'pages'})` : '';

          // Store for later - return after flow trigger check if no flow matched
          pendingAnalysisResponse = {
            type: RESPONSE_TYPES.AI_RESPONSE,
            response: `📄 **Document Content Extracted**\n\nFile: ${fileName}${pagesInfo}\n\n\`\`\`\n${analyzedDoc.content.substring(0, 2000)}\n\`\`\`${analyzedDoc.metadata.truncated ? '\n\n_Content was truncated due to length._' : ''}`,
            metadata: {
              documentAnalysis: true,
              analysisType: 'document_extract',
              ...analyzedDoc.metadata,
            },
          };
        }
      }
    }

    // Step 0.7: Auto-transcribe voice/audio messages
    // This extracts text from voice messages using local Whisper or cloud APIs
    if (this.config.enableAutoVoiceTranscription !== false && userTranscriptionEnabled && userTranscriptionAutoExtract) {
      const isVoice = message.contentType === 'voice' || message.contentType === 'audio' || message.contentType === 'ptt';

      if (isVoice && (!message.content || !message.content.includes('[Voice Transcription]'))) {
        try {
          const transcribedMessage = await this.autoTranscribeVoiceMessage(message, {
            ...context,
            transcriptionLanguage: userTranscriptionLanguage,
          });

          if (transcribedMessage.metadata?.autoAnalyzed && transcribedMessage.metadata?.analysisType === 'voice_transcription') {
            logger.info(`Voice auto-transcribed: ${transcribedMessage.metadata.transcriptionProvider}`);
            Object.assign(message, transcribedMessage);

            // Prepare pending response for voice-only messages
            const transcriptionText = transcribedMessage.content.replace('[Voice Transcription]: ', '');
            pendingAnalysisResponse = {
              type: RESPONSE_TYPES.AI_RESPONSE,
              response: transcriptionText,
              metadata: {
                voiceTranscription: true,
                analysisType: 'voice_transcription',
                ...transcribedMessage.metadata,
              },
            };
          }
        } catch (transcriptionError) {
          logger.debug(`Voice auto-transcription failed: ${transcriptionError.message}`);
        }
      }
    }

    // Step 1: Check for matching flow triggers (ALWAYS checked, even for media-only messages)
    if (this.config.enableFlowTriggers) {
      const flowResult = await this.checkFlowTriggers(message, context);
      if (flowResult.matched) {
        logContext.flowId = flowResult.flow?.id;
        return {
          type: RESPONSE_TYPES.FLOW_EXECUTED,
          flow: flowResult.flow,
          executionId: flowResult.executionId,
          response: flowResult.response,
        };
      }
    }

    // Step 1.5: If no flow matched but we have a pending analysis response (image/document),
    // return it now. This ensures flows can intercept media messages, but if none match,
    // the user still gets the OCR/Vision/Document analysis result.
    if (pendingAnalysisResponse) {
      logger.info(`No flow matched - returning pending ${pendingAnalysisResponse.metadata?.analysisType || 'analysis'} response`);
      return pendingAnalysisResponse;
    }

    // Step 2: Check for keyword commands (e.g., /help, /status)
    const commandResult = await this.checkCommands(message, context);
    if (commandResult.matched) {
      logContext.tools = [{
        name: `command:${commandResult.command}`,
        category: 'system',
        parameters: { args: commandResult.args },
        result: { success: true, output: commandResult.response },
        duration: null,
      }];
      return {
        type: RESPONSE_TYPES.TOOL_EXECUTED,
        command: commandResult.command,
        response: commandResult.response,
      };
    }

    // Step 3: Use AI Router for intent classification and tool routing
    if (this.config.enableAIRouter) {
      const aiRouterResult = await this.processWithAIRouter(message, context, logContext);
      if (aiRouterResult.type !== RESPONSE_TYPES.NO_ACTION) {
        return aiRouterResult;
      }
    }

    // Step 4: Check for swarm routing
    if (this.config.enableSwarm) {
      const swarmResult = await this.checkSwarmRouting(message, context);
      if (swarmResult.matched) {
        return {
          type: RESPONSE_TYPES.SWARM_DELEGATED,
          agent: swarmResult.agent,
          taskId: swarmResult.taskId,
        };
      }
    }

    // Step 5: Fall back to direct AI response
    return this.processWithDirectAI(message, context, logContext);
  }

  /**
   * Process only checking flow triggers
   * @private
   */
  async processFlowOnly(message, context, logContext = {}) {
    const flowResult = await this.checkFlowTriggers(message, context);
    if (flowResult.matched) {
      logContext.flowId = flowResult.flow?.id;
      return {
        type: RESPONSE_TYPES.FLOW_EXECUTED,
        flow: flowResult.flow,
        executionId: flowResult.executionId,
        response: flowResult.response,
      };
    }
    return { type: RESPONSE_TYPES.NO_ACTION, reason: 'no_matching_flow' };
  }

  /**
   * Process using AI Router for intent classification and tool execution
   * @private
   */
  async processWithAIRouter(message, context, logContext = {}) {
    const executionStart = Date.now();

    try {
      const aiRouter = getAIRouterService();

      const result = await aiRouter.process({
        message: message.content,
        userId: context.userId,
        sessionId: context.conversationId || context.sessionId || uuidv4(),
        context: {
          platform: message.platform,
          agentId: context.agentId,
          sender: message.sender,
        },
      });

      // Update log context
      logContext.duration.execution = Date.now() - executionStart;
      if (result.provider) logContext.execution.providerUsed = result.provider;
      if (result.model) logContext.execution.model = result.model;

      // Check if AI Router was skipped (disabled in user settings)
      if (result.skipped) {
        logger.debug(`AI Router skipped: ${result.reason}`);
        return {
          type: RESPONSE_TYPES.NO_ACTION,
          reason: result.reason,
          skipped: true,
        };
      }

      // Check if AI Router is in classify_only mode
      if (result.classifyOnly) {
        logger.debug(`AI Router classify_only: ${result.tool} (confidence: ${result.confidence})`);
        // Log classification but don't execute - fall back to direct AI for response
        logContext.classification = {
          ...logContext.classification,
          classifyOnly: true,
          classifiedTool: result.tool,
          classifiedTools: result.tools,
        };
        // Fall back to direct AI for generating response
        return this.processWithDirectAI(message, context, logContext);
      }

      // Check if clarification needed
      if (result.requiresClarification) {
        return {
          type: RESPONSE_TYPES.CLARIFICATION,
          question: result.response,
          tool: result.tool,
          confidence: result.confidence,
        };
      }

      // Check if tool was executed
      if (result.tool && result.tool !== 'general_conversation') {
        // Track tool execution in log context - prefer toolsWithDetails for full info
        if (result.toolsWithDetails && Array.isArray(result.toolsWithDetails)) {
          logContext.tools = result.toolsWithDetails;
        } else if (result.tools && Array.isArray(result.tools)) {
          logContext.tools = result.tools.map(t => ({
            name: typeof t === 'string' ? t : t.name,
            category: typeof t === 'object' ? t.category : null,
            parameters: typeof t === 'object' ? t.parameters : null,
            result: typeof t === 'object' ? { success: true, output: t.result } : null,
            duration: typeof t === 'object' ? t.duration : null,
          }));
        } else {
          logContext.tools = [{
            name: result.tool,
            category: null,
            parameters: result.results?.parameters || null,
            result: { success: true, output: result.results },
            duration: null,
          }];
        }

        // Track blocked tools if any
        if (result.blockedTools && result.blockedTools.length > 0) {
          logContext.blockedTools = result.blockedTools;
          logger.info(`Tools blocked by user settings: ${result.blockedTools.map(b => b.tool).join(', ')}`);
        }

        return {
          type: RESPONSE_TYPES.TOOL_EXECUTED,
          tool: result.tool,
          tools: result.tools,
          toolsWithDetails: result.toolsWithDetails,  // Include full tool details with parameters
          results: result.results,
          blockedTools: result.blockedTools,
          response: result.response,
          confidence: result.confidence,
        };
      }

      // Check for silent response (<<SILENT>> protocol)
      if (this.isSilentResponse(result.response)) {
        logger.info('AI Router decided to be silent');
        return {
          type: RESPONSE_TYPES.SILENT,
          reason: 'AI emitted SILENT token',
          confidence: result.confidence,
        };
      }

      // General conversation - return AI response
      return {
        type: RESPONSE_TYPES.AI_RESPONSE,
        response: result.response,
        confidence: result.confidence,
      };

    } catch (error) {
      logger.error(`AI Router processing failed: ${error.message}`);
      // Fall back to direct AI
      return this.processWithDirectAI(message, context, logContext);
    }
  }

  /**
   * Process with direct AI (no tool routing)
   * @private
   */
  async processWithDirectAI(message, context, logContext = {}) {
    const executionStart = Date.now();

    try {
      const superBrain = getSuperBrainRouter();

      const result = await superBrain.process({
        task: message.content,
        messages: [{ role: 'user', content: message.content }],
        userId: context.userId,
        preferFree: true,
      });

      // Update log context with execution details
      logContext.duration.execution = Date.now() - executionStart;
      logContext.execution.providerUsed = result.provider || null;
      logContext.execution.model = result.model || null;

      // Track classification tier if available
      if (result.classification?.tier) {
        logContext.classification.tier = result.classification.tier;
      }

      // Track provider chain if available
      if (result.providerChain) {
        logContext.execution.providerChain = result.providerChain;
      }
      if (result.attemptedProviders) {
        logContext.execution.providerChain = result.attemptedProviders;
      }

      // Track failed providers if any
      if (result.failedProviders) {
        logContext.execution.failedProviders = result.failedProviders;
      }

      // Track token usage if available
      if (result.usage) {
        logContext.execution.tokenUsage = {
          input: result.usage.prompt_tokens || result.usage.input || 0,
          output: result.usage.completion_tokens || result.usage.output || 0,
          total: result.usage.total_tokens || result.usage.total || 0,
        };
      }

      // Check for silent response (<<SILENT>> protocol)
      if (this.isSilentResponse(result.response)) {
        logger.info('Direct AI decided to be silent');
        return {
          type: RESPONSE_TYPES.SILENT,
          reason: 'AI emitted SILENT token',
          provider: result.provider,
          model: result.model,
        };
      }

      return {
        type: RESPONSE_TYPES.AI_RESPONSE,
        response: result.response,
        provider: result.provider,
        model: result.model,
      };

    } catch (error) {
      logger.error(`Direct AI processing failed: ${error.message}`);
      logContext.duration.execution = Date.now() - executionStart;
      logContext.result.error = error.message;
      return {
        type: RESPONSE_TYPES.ERROR,
        error: error.message,
      };
    }
  }

  /**
   * Process with swarm delegation
   * @private
   */
  async processWithSwarm(message, context, logContext = {}) {
    const swarmResult = await this.checkSwarmRouting(message, context);
    if (swarmResult.matched) {
      return {
        type: RESPONSE_TYPES.SWARM_DELEGATED,
        agent: swarmResult.agent,
        taskId: swarmResult.taskId,
      };
    }
    // Fall back to AI Router
    return this.processWithAIRouter(message, context, logContext);
  }

  /**
   * Check for matching flow triggers
   * @private
   */
  async checkFlowTriggers(message, context) {
    const flowEngine = getFlowEngine();
    if (!flowEngine) {
      return { matched: false };
    }

    const db = getDatabase();

    try {
      // Find active flows with message triggers for this user
      const flows = db.prepare(`
        SELECT * FROM flows
        WHERE user_id = ?
          AND status = 'active'
          AND (
            trigger_type = 'message'
            OR trigger_type LIKE '%_message'
            OR trigger_type = 'any_message'
          )
      `).all(context.userId);

      if (flows.length === 0) {
        return { matched: false };
      }

      for (const flow of flows) {
        const nodes = typeof flow.nodes === 'string'
          ? JSON.parse(flow.nodes)
          : (flow.nodes || []);

        // Find message trigger nodes
        const triggerNodes = nodes.filter(n =>
          n.type === 'trigger:message' ||
          n.type === `trigger:${message.platform}_message` ||
          n.type === 'trigger:any_message' ||
          (n.type.startsWith('trigger:') && n.type.includes('message'))
        );

        for (const triggerNode of triggerNodes) {
          const filters = triggerNode.data?.filters || {};

          if (this.matchesTriggerFilters(message, filters)) {
            logger.info(`Flow trigger matched: ${flow.id} (${flow.name})`);

            // Build flow input from message
            const flowInput = this.buildFlowInput(message, context);

            // Execute flow
            const executionId = await flowEngine.execute(flow, {
              input: flowInput,
              trigger: {
                type: 'message',
                source: message.platform,
                timestamp: new Date().toISOString(),
              },
              userId: context.userId,
            });

            return {
              matched: true,
              flow: { id: flow.id, name: flow.name },
              executionId,
              triggerNode: triggerNode.id,
            };
          }
        }
      }

      return { matched: false };

    } catch (error) {
      logger.error(`Flow trigger check failed: ${error.message}`);
      return { matched: false, error: error.message };
    }
  }

  /**
   * Check for command triggers (e.g., /help, /status)
   * @private
   */
  async checkCommands(message, context) {
    const content = (message.content || '').trim();

    // Check for command prefix
    if (!content.startsWith('/')) {
      return { matched: false };
    }

    const parts = content.slice(1).split(' ');
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);

    // Built-in commands
    const commands = {
      help: () => ({
        response: 'Available commands: /help, /status, /flows, /agents',
      }),
      status: () => ({
        response: `System Status: Online\nPlatform: ${message.platform}\nUser: ${context.userId}`,
      }),
      flows: async () => {
        const db = getDatabase();
        const flows = db.prepare(`
          SELECT id, name, status FROM flows WHERE user_id = ?
        `).all(context.userId);
        const flowList = flows.map(f => `- ${f.name} (${f.status})`).join('\n');
        return { response: `Your Flows:\n${flowList || 'No flows found'}` };
      },
      agents: async () => {
        const db = getDatabase();
        const agents = db.prepare(`
          SELECT id, name, status FROM agents WHERE user_id = ?
        `).all(context.userId);
        const agentList = agents.map(a => `- ${a.name} (${a.status})`).join('\n');
        return { response: `Your Agents:\n${agentList || 'No agents found'}` };
      },
    };

    if (commands[command]) {
      const result = await commands[command]();
      return { matched: true, command, args, ...result };
    }

    return { matched: false };
  }

  /**
   * Check if message should be routed to a swarm agent
   * @private
   */
  async checkSwarmRouting(message, context) {
    const db = getDatabase();

    try {
      // Check if there are active agents with specific expertise
      const agents = db.prepare(`
        SELECT * FROM agents
        WHERE user_id = ?
          AND status = 'active'
          AND auto_respond = 1
      `).all(context.userId);

      if (agents.length === 0) {
        return { matched: false };
      }

      // Simple keyword matching for now
      // TODO: Use AI to match message to best agent
      const content = (message.content || '').toLowerCase();

      for (const agent of agents) {
        const keywords = agent.personality ? JSON.parse(agent.personality).keywords : [];
        if (keywords && keywords.some(k => content.includes(k.toLowerCase()))) {
          return {
            matched: true,
            agent: { id: agent.id, name: agent.name },
            // TODO: Create swarm task
            taskId: null,
          };
        }
      }

      return { matched: false };

    } catch (error) {
      logger.error(`Swarm routing check failed: ${error.message}`);
      return { matched: false };
    }
  }

  /**
   * Match message against trigger filters
   * @private
   */
  matchesTriggerFilters(message, filters) {
    if (!filters || Object.keys(filters).length === 0) {
      return true; // No filters = match all
    }

    const content = (message.content || '').toLowerCase();
    const from = (message.from || message.sender?.id || '').toLowerCase();

    // Platform filter
    if (filters.platform && filters.platform !== 'any') {
      if (message.platform !== filters.platform) return false;
    }

    // Message type filter (allowChat, allowImage, allowVideo, etc.)
    const contentType = message.contentType || 'text';
    if (!this.isMessageTypeAllowed(contentType, filters)) {
      return false;
    }

    // Content filters (skip for patternType='any')
    if (filters.patternType !== 'any') {
      if (filters.contains && !content.includes(filters.contains.toLowerCase())) {
        return false;
      }
      if (filters.startsWith && !content.startsWith(filters.startsWith.toLowerCase())) {
        return false;
      }
      if (filters.endsWith && !content.endsWith(filters.endsWith.toLowerCase())) {
        return false;
      }
      if (filters.pattern) {
        try {
          const regex = new RegExp(filters.pattern, filters.caseSensitive ? '' : 'i');
          if (!regex.test(message.content || '')) return false;
        } catch {
          return false;
        }
      }
      if (filters.exactMatch && content !== filters.exactMatch.toLowerCase()) {
        return false;
      }
    }

    // Sender filters
    if (filters.from && from !== filters.from.toLowerCase()) {
      return false;
    }
    if (filters.notFrom && from === filters.notFrom.toLowerCase()) {
      return false;
    }
    // senderFilter from UI (comma-separated phone numbers)
    if (filters.senderFilter && Array.isArray(filters.senderFilter) && filters.senderFilter.length > 0) {
      const senderList = filters.senderFilter.map(s => s.toLowerCase());
      if (!senderList.some(s => from.includes(s))) {
        return false;
      }
    }

    // Group filter
    if (filters.isGroup !== undefined) {
      if (Boolean(message.isGroup) !== Boolean(filters.isGroup)) {
        return false;
      }
    }
    // fromGroups/fromPrivate filters from UI
    if (filters.fromGroups === false && message.isGroup) {
      return false;
    }
    if (filters.fromPrivate === false && !message.isGroup) {
      return false;
    }

    return true;
  }

  /**
   * Check if message type is allowed by trigger filters
   * @private
   * @param {string} contentType - Message content type (text, image, video, etc.)
   * @param {Object} filters - Trigger filter configuration
   * @returns {boolean} Whether the message type is allowed
   */
  isMessageTypeAllowed(contentType, filters) {
    // Map contentType to filter key
    const typeToFilterKey = {
      'text': 'allowChat',
      'chat': 'allowChat',
      'image': 'allowImage',
      'video': 'allowVideo',
      'audio': 'allowAudio',
      'voice': 'allowVoice',
      'ptt': 'allowVoice',  // Push-to-talk (voice note)
      'document': 'allowDocument',
      'sticker': 'allowSticker',
      'location': 'allowLocation',
      'contact': 'allowContact',
      'vcard': 'allowContact',
      'call_log': 'allowCallLog',
    };

    const filterKey = typeToFilterKey[contentType?.toLowerCase()] || 'allowChat';

    // Check if this specific type is configured in filters
    // If not configured (undefined), default to true (allow)
    if (filters[filterKey] === undefined) {
      return true;
    }

    return Boolean(filters[filterKey]);
  }

  /**
   * Build flow input from message
   * @private
   */
  buildFlowInput(message, context) {
    return {
      message: {
        id: message.id,
        content: message.content,
        from: message.from,
        platform: message.platform,
        conversationId: context.conversationId,
        contentType: message.contentType || 'text',
        mediaUrl: message.mediaUrl,
        timestamp: message.timestamp || new Date().toISOString(),
      },
      sender: message.sender || {
        id: message.from,
        name: message.senderName,
      },
      conversation: {
        id: context.conversationId,
        platform: message.platform,
      },
      // Cross-agent messaging source context
      trigger: {
        source: {
          agentId: context.agentId,
          accountId: context.accountId,
          platform: message.platform,
          contactId: message.from || message.sender?.id,
          conversationId: context.conversationId,
        }
      },
      // Top-level access for convenience
      agentId: context.agentId,
      platform: message.platform,
      // WhatsBots-style trigger variables
      triggerPhone: message.sender?.phone || message.from,
      triggerChatId: context.conversationId || message.from,
      triggerMessage: message.content,
      triggerMessageId: message.id,
      triggerSenderName: message.sender?.name || message.senderName,
      triggerIsGroup: message.isGroup || false,
      triggerGroupName: message.groupName,
      triggerHasMedia: message.contentType !== 'text',
      triggerMediaType: message.contentType,
      fromMe: message.fromMe || false,
    };
  }

  /**
   * Check if AI response indicates silence (no reply needed)
   * Supports <<SILENT>> token in response text
   * @private
   * @param {string} response - AI response text
   * @returns {boolean}
   */
  isSilentResponse(response) {
    if (!response) return false;
    return SILENT_TOKEN_REGEX.test(response.trim());
  }

  /**
   * Normalize message to unified schema
   * @private
   */
  normalizeMessage(message) {
    return {
      id: message.id || uuidv4(),
      platform: message.platform || 'unknown',
      content: message.content || message.text || message.body || '',
      from: message.from || message.sender?.id || message.sender?.phone,
      to: message.to,
      contentType: message.contentType || 'text',
      mediaUrl: message.mediaUrl || message.media?.url,
      mimeType: message.mimeType || message.media?.mimeType,
      timestamp: message.timestamp || new Date().toISOString(),
      externalId: message.externalId,
      conversationId: message.conversationId,
      sender: {
        id: message.sender?.id || message.from,
        name: message.sender?.name || message.senderName || message.pushName,
        phone: message.sender?.phone,
        email: message.sender?.email,
      },
      isGroup: message.isGroup || false,
      groupId: message.groupId || message.chat?.id,
      groupName: message.groupName || message.chat?.name,
      fromMe: message.fromMe || false,
      metadata: message.metadata || {},
    };
  }

  /**
   * Check for duplicate message processing
   * @private
   */
  isDuplicate(message) {
    const key = `${message.platform}:${message.from}:${message.id}`;
    const existing = this.processingHistory.get(key);
    if (existing) {
      const elapsed = Date.now() - existing.timestamp;
      if (elapsed < this.config.deduplicationWindowMs) {
        return true;
      }
    }
    return false;
  }

  /**
   * Mark message as being processed
   * @private
   */
  markProcessing(message) {
    const key = `${message.platform}:${message.from}:${message.id}`;
    this.processingHistory.set(key, {
      timestamp: Date.now(),
      messageId: message.id,
    });

    // Cleanup old entries
    if (this.processingHistory.size > this.config.maxProcessingHistory) {
      const cutoff = Date.now() - this.config.deduplicationWindowMs;
      for (const [k, v] of this.processingHistory) {
        if (v.timestamp < cutoff) {
          this.processingHistory.delete(k);
        }
      }
    }
  }

  /**
   * Auto-analyze image messages using OCR/Vision AI
   * Extracts text from images or generates descriptions for visual content
   * @private
   * @param {Object} message - Normalized message object
   * @param {Object} context - Processing context with userId
   * @returns {Promise<Object>} Updated message with extracted/generated content
   */
  async autoAnalyzeImageMessage(message, context) {
    // Check if auto-analysis is enabled
    if (!this.config.enableAutoImageAnalysis) {
      return message;
    }

    // Check if this is an image with minimal/no text content
    const isImage = message.contentType === 'image' ||
                    (message.mimeType && message.mimeType.startsWith('image/'));
    const hasMinimalContent = !message.content ||
                              message.content.trim().length <= this.config.maxContentLengthForImageAnalysis;

    if (!isImage || !hasMinimalContent) {
      return message;
    }

    logger.info(`Auto-analyzing image message: ${message.id}`);

    const visionService = getVisionService();
    if (!visionService) {
      logger.warn('VisionService not available for image analysis');
      return message;
    }

    try {
      // Get the local path for the image from media cache
      const db = getDatabase();
      const mediaCache = db.prepare(`
        SELECT local_path FROM media_cache
        WHERE message_id = ? AND expires_at > datetime('now')
      `).get(message.id);

      // Try multiple sources for image path
      let imagePath = mediaCache?.local_path || message.mediaUrl;

      if (!imagePath) {
        logger.debug(`No image path found for message ${message.id}`);
        return message;
      }

      // Step 1: Try OCR to extract text (if user has OCR enabled)
      let ocrResult = null;
      if (context.ocrEnabled !== false) {
        logger.debug(`Running OCR on image: ${imagePath}`);
        ocrResult = await visionService.analyzeImageMessage(
          { mediaUrl: imagePath, mediaLocalPath: mediaCache?.local_path },
          { minConfidence: this.config.minOcrConfidence }
        );
      } else {
        logger.debug('OCR disabled by user settings, skipping');
      }

      if (ocrResult?.shouldUpdate && ocrResult.extractedText) {
        // OCR found text - update message content
        logger.info(`OCR extracted ${ocrResult.extractedText.length} chars with confidence ${ocrResult.confidence.toFixed(2)}`);

        // Step 1.5: Use AI to clean up OCR text (remove artifacts, garbled characters)
        let cleanedText = ocrResult.extractedText;
        if (this.config.enableOcrCleanup) {
          try {
            cleanedText = await this.cleanupOcrText(ocrResult.extractedText, context);
            logger.info(`AI cleaned OCR text: ${cleanedText.length} chars (from ${ocrResult.extractedText.length})`);
          } catch (cleanupError) {
            logger.warn(`OCR cleanup failed, using raw text: ${cleanupError.message}`);
          }
        }

        const originalContent = message.content?.trim() || '';
        const ocrContent = `[Image Text OCR]: ${cleanedText}`;

        message.content = originalContent
          ? `${originalContent}\n\n${ocrContent}`
          : ocrContent;

        message.metadata = {
          ...message.metadata,
          autoAnalyzed: true,
          analysisType: 'ocr',
          ocrConfidence: ocrResult.confidence,
          ocrLanguage: ocrResult.language,
          ocrRawLength: ocrResult.extractedText.length,
          ocrCleanedLength: cleanedText.length,
        };

        // Persist cleaned OCR text to database so it shows in the UI
        try {
          const db = getDatabase();
          db.prepare(`
            UPDATE messages
            SET content = ?,
                metadata = json_set(COALESCE(metadata, '{}'),
                  '$.ocrExtracted', 1,
                  '$.ocrConfidence', ?,
                  '$.ocrLanguage', ?,
                  '$.autoAnalyzed', 1)
            WHERE id = ?
          `).run(cleanedText, ocrResult.confidence, ocrResult.language, message.id);
          logger.info(`Saved cleaned OCR text to message ${message.id}`);
        } catch (dbError) {
          logger.error(`Failed to save OCR text to database: ${dbError.message}`);
        }

        return message;
      }

      // Step 2: If OCR didn't find meaningful text, try Vision AI to describe the image
      if (context.visionEnabled === false) {
        logger.debug('Vision AI disabled by user settings, skipping');
        return message;
      }
      logger.debug('OCR found no text, trying Vision AI for image description');

      const imageDescription = await this.describeImageWithVisionAI(imagePath, context);

      if (imageDescription) {
        logger.info(`Vision AI generated description: ${imageDescription.substring(0, 100)}...`);

        const originalContent = message.content?.trim() || '';
        const visionContent = `[Image Description]: ${imageDescription}`;

        message.content = originalContent
          ? `${originalContent}\n\n${visionContent}`
          : visionContent;

        message.metadata = {
          ...message.metadata,
          autoAnalyzed: true,
          analysisType: 'vision_ai',
        };

        // Persist Vision AI description to database so it shows in the UI
        try {
          const db = getDatabase();
          db.prepare(`
            UPDATE messages
            SET content = ?,
                metadata = json_set(COALESCE(metadata, '{}'),
                  '$.visionDescription', 1,
                  '$.autoAnalyzed', 1)
            WHERE id = ?
          `).run(imageDescription, message.id);
          logger.info(`Saved Vision AI description to message ${message.id}`);
        } catch (dbError) {
          logger.error(`Failed to save Vision AI description to database: ${dbError.message}`);
        }
      }

      return message;

    } catch (error) {
      logger.error(`Image auto-analysis failed: ${error.message}`);
      return message; // Return original message on error
    }
  }

  /**
   * Auto-analyze document messages by extracting text from PDF/Excel/Word/CSV/Text files.
   * Uses the same libraries as SystemToolExecutors (pdf-parse, xlsx, mammoth).
   * Extracted text is stored in message.content so DocumentContent monocode can display it.
   *
   * @private
   * @param {Object} message - Normalized message object
   * @param {Object} context - Processing context with userId
   * @returns {Promise<Object>} Updated message with extracted document content
   */
  async autoTranscribeVoiceMessage(message, context) {
    const isVoice = message.contentType === 'voice' || message.contentType === 'audio' || message.contentType === 'ptt';
    if (!isVoice) return message;

    // Resolve audio file path from media_cache
    let audioPath = null;
    try {
      const db = getDatabase();
      if (message.id) {
        const cached = db.prepare(`
          SELECT local_path FROM media_cache
          WHERE message_id = ? AND expires_at > datetime('now')
        `).get(message.id);
        if (cached?.local_path) {
          audioPath = cached.local_path;
        }
      }
      // Fallback to message fields
      if (!audioPath) audioPath = message.mediaLocalPath || message.media_local_path;
    } catch (e) {
      logger.debug(`Could not resolve audio path: ${e.message}`);
    }

    if (!audioPath) {
      logger.debug('No audio file path available for transcription');
      return message;
    }

    const fs = require('fs');
    if (!fs.existsSync(audioPath)) {
      logger.debug(`Audio file not found: ${audioPath}`);
      return message;
    }

    const transcriptionLanguage = context.transcriptionLanguage || 'auto';

    // Step 1: Try local Whisper if available
    const localWhisper = getLocalWhisperServiceLazy();
    if (localWhisper) {
      try {
        const isAvailable = await localWhisper.checkWhisperAvailable();
        const ffmpegOk = await localWhisper.checkFfmpegAvailable();
        if (isAvailable && ffmpegOk) {
          const result = await localWhisper.transcribe(audioPath, { language: transcriptionLanguage });
          if (result?.text?.trim()) {
            const updatedMessage = { ...message };
            updatedMessage.content = `[Voice Transcription]: ${result.text}`;
            updatedMessage.metadata = {
              ...message.metadata,
              autoAnalyzed: true,
              analysisType: 'voice_transcription',
              transcriptionProvider: 'local_whisper',
              transcriptionLanguage: result.language,
              transcriptionConfidence: result.confidence,
            };

            // Persist to database
            this._persistTranscription(message.id, result.text, 'local_whisper', null, result.language);
            return updatedMessage;
          }
        }
      } catch (err) {
        logger.debug(`Local whisper transcription failed: ${err.message}`);
      }
    }

    // Step 2: Try cloud transcription service (3-level fallback)
    const cloudService = getVoiceTranscriptionServiceLazy();
    if (cloudService) {
      try {
        const result = await cloudService.transcribeAudio(audioPath, {
          userId: context.userId,
          language: transcriptionLanguage,
        });

        if (result?.success && result.text?.trim()) {
          const updatedMessage = { ...message };
          updatedMessage.content = `[Voice Transcription]: ${result.text}`;
          updatedMessage.metadata = {
            ...message.metadata,
            autoAnalyzed: true,
            analysisType: 'voice_transcription',
            transcriptionProvider: result.provider,
            transcriptionModel: result.model,
            transcriptionLanguage: result.language,
          };

          this._persistTranscription(message.id, result.text, result.provider, result.model, result.language);
          return updatedMessage;
        }
      } catch (err) {
        logger.debug(`Cloud transcription failed: ${err.message}`);
      }
    }

    return message;
  }

  /**
   * Persist transcription result to database
   * @private
   */
  _persistTranscription(messageId, text, provider, model, language) {
    if (!messageId) return;
    try {
      const db = getDatabase();
      db.prepare(`
        UPDATE messages
        SET content = ?,
            metadata = json_set(COALESCE(metadata, '{}'),
              '$.voiceTranscription', json('true'),
              '$.transcriptionProvider', ?,
              '$.transcriptionModel', ?,
              '$.transcriptionLanguage', ?,
              '$.autoAnalyzed', json('true'))
        WHERE id = ?
      `).run(
        `[Voice Transcription]: ${text}`,
        provider || 'unknown',
        model || null,
        language || 'auto',
        messageId
      );
    } catch (err) {
      logger.warn(`Failed to persist transcription: ${err.message}`);
    }
  }

  /**
   * Auto-analyze document messages - extract text from PDF/Excel/Word files
   *
   * @private
   * @param {Object} message - Normalized message object
   * @param {Object} context - Processing context with userId
   * @returns {Promise<Object>} Updated message with extracted document content
   */
  async autoAnalyzeDocumentMessage(message, context) {
    if (!this.config.enableAutoDocumentAnalysis) {
      return message;
    }

    // Check if this is a document message
    const isDocument = message.contentType === 'document' ||
                       (message.mimeType && (
                         message.mimeType.startsWith('application/pdf') ||
                         message.mimeType.includes('spreadsheet') ||
                         message.mimeType.includes('excel') ||
                         message.mimeType.includes('wordprocessing') ||
                         message.mimeType.includes('msword') ||
                         message.mimeType.startsWith('text/')
                       ));

    if (!isDocument) {
      return message;
    }

    // Skip if already analyzed
    if (message.metadata?.autoAnalyzed && message.metadata?.analysisType === 'document_extract') {
      return message;
    }

    logger.info(`Auto-analyzing document message: ${message.id}`);

    try {
      // Get the local path from media cache
      const db = getDatabase();
      const mediaCache = db.prepare(`
        SELECT local_path, mime_type FROM media_cache
        WHERE message_id = ? AND expires_at > datetime('now')
      `).get(message.id);

      let filePath = mediaCache?.local_path || message.mediaUrl || message.mediaLocalPath;

      if (!filePath) {
        logger.debug(`No file path found for document message ${message.id}`);
        return message;
      }

      const fs = require('fs');
      if (!fs.existsSync(filePath)) {
        logger.debug(`Document file not found: ${filePath}`);
        return message;
      }

      // Determine file type from MIME type or extension
      const mimeType = message.mimeType || mediaCache?.mime_type || '';
      const ext = require('path').extname(filePath).toLowerCase();
      const fileName = message.metadata?.fileName || require('path').basename(filePath);

      let extractedText = null;
      let docType = 'unknown';
      let docPages = null;

      // Extract content based on file type
      if (mimeType.includes('pdf') || ext === '.pdf') {
        docType = 'pdf';
        try {
          const pdfParse = require('pdf-parse');
          const buffer = await fs.promises.readFile(filePath);
          const data = await pdfParse(buffer);
          extractedText = data.text;
          docPages = data.numpages;
          logger.info(`PDF extracted: ${extractedText.length} chars, ${docPages} pages`);
        } catch (pdfErr) {
          logger.error(`PDF extraction failed: ${pdfErr.message}`);
        }

      } else if (mimeType.includes('spreadsheet') || mimeType.includes('excel') ||
                 ext === '.xlsx' || ext === '.xls') {
        docType = 'excel';
        try {
          const xlsx = require('xlsx');
          const workbook = xlsx.readFile(filePath);
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];

          if (worksheet) {
            // Convert to text table format
            const jsonData = xlsx.utils.sheet_to_json(worksheet, { header: 1 });
            const rows = jsonData.slice(0, 50); // Limit to first 50 rows
            extractedText = rows.map(row =>
              Array.isArray(row) ? row.join(' | ') : String(row)
            ).join('\n');
            docPages = workbook.SheetNames.length;
            logger.info(`Excel extracted: ${extractedText.length} chars, sheet "${sheetName}", ${docPages} sheets total`);
          }
        } catch (xlsErr) {
          logger.error(`Excel extraction failed: ${xlsErr.message}`);
        }

      } else if (mimeType.includes('wordprocessing') || mimeType.includes('msword') ||
                 ext === '.docx' || ext === '.doc') {
        docType = 'docx';
        try {
          const mammoth = require('mammoth');
          const buffer = fs.readFileSync(filePath);
          const result = await mammoth.extractRawText({ buffer });
          extractedText = result.value;
          logger.info(`Word extracted: ${extractedText.length} chars`);
        } catch (docErr) {
          logger.error(`Word extraction failed: ${docErr.message}`);
        }

      } else if (mimeType.startsWith('text/') || ext === '.csv' || ext === '.txt' || ext === '.json') {
        docType = ext === '.csv' ? 'csv' : 'text';
        try {
          extractedText = fs.readFileSync(filePath, 'utf-8');
          logger.info(`Text file read: ${extractedText.length} chars`);
        } catch (txtErr) {
          logger.error(`Text file read failed: ${txtErr.message}`);
        }
      }

      if (!extractedText || extractedText.trim().length === 0) {
        logger.debug(`No text extracted from document ${message.id}`);
        return message;
      }

      // Truncate if too long
      const maxLen = this.config.maxDocumentExtractLength;
      const originalLength = extractedText.length;
      const truncated = originalLength > maxLen;
      if (truncated) {
        extractedText = extractedText.substring(0, maxLen) + '\n\n... (truncated)';
      }

      // Update message content with extracted text
      message.content = extractedText.trim();

      message.metadata = {
        ...message.metadata,
        autoAnalyzed: true,
        analysisType: 'document_extract',
        docType,
        docPages,
        originalTextLength: originalLength,
        truncated,
        fileName,
      };

      // Persist extracted text to database
      try {
        db.prepare(`
          UPDATE messages
          SET content = ?,
              metadata = json_set(COALESCE(metadata, '{}'),
                '$.autoAnalyzed', 1,
                '$.analysisType', 'document_extract',
                '$.docType', ?,
                '$.docPages', ?,
                '$.originalTextLength', ?,
                '$.truncated', ?)
          WHERE id = ?
        `).run(
          extractedText.trim(),
          docType,
          docPages,
          originalLength,
          truncated ? 1 : 0,
          message.id
        );
        logger.info(`Saved extracted document text to message ${message.id} (${docType}, ${extractedText.length} chars)`);
      } catch (dbError) {
        logger.error(`Failed to save document text to database: ${dbError.message}`);
      }

      return message;

    } catch (error) {
      logger.error(`Document auto-analysis failed: ${error.message}`);
      return message;
    }
  }

  /**
   * Clean up raw OCR text using AI to remove artifacts and garbled characters
   * Keeps only meaningful, readable text from the image
   *
   * @private
   * @param {string} rawOcrText - Raw OCR extracted text (may contain noise)
   * @param {Object} context - Processing context with userId
   * @returns {Promise<string>} Cleaned up text
   */
  async cleanupOcrText(rawOcrText, context) {
    const superBrainRouter = getSuperBrainRouter();
    if (!superBrainRouter) {
      logger.warn('SuperBrainRouter not available for OCR cleanup');
      return rawOcrText;
    }

    const cleanupPrompt = `Clean up this OCR-extracted text from an image. Remove:
- Random characters, symbols, and garbled text from logos/graphics
- Meaningless character sequences
- Duplicate or repeated text

Keep only the meaningful, readable text content. Preserve the original language (don't translate).
If the text is mostly garbled with no meaningful content, return an empty string.

Raw OCR text:
"""
${rawOcrText}
"""

Return ONLY the cleaned text, nothing else. No explanations or formatting.`;

    try {
      const result = await superBrainRouter.process({
        task: cleanupPrompt,
        userId: context.userId,
        messages: [
          { role: 'system', content: 'You are a text cleanup assistant. Return only the cleaned text, nothing else.' },
          { role: 'user', content: cleanupPrompt },
        ],
      }, {
        forceTier: 'simple', // Fast model for simple cleanup task
      });

      if (result?.content) {
        const cleaned = result.content.trim();
        // If AI returns empty or very short, fall back to raw text
        if (cleaned.length < 5 && rawOcrText.length > 20) {
          return rawOcrText;
        }
        return cleaned;
      }
    } catch (error) {
      logger.error(`OCR text cleanup failed: ${error.message}`);
    }

    return rawOcrText;
  }

  /**
   * Describe an image using Vision AI with configurable 3-level fallback
   * Uses VisionAIService which supports: Ollama, OpenRouter (Free/Paid), Gemini CLI
   *
   * Fallback chain is user-configurable via SuperBrain settings:
   *   Level 1: Primary (e.g., Ollama with LLaVA)
   *   Level 2: Fallback 1 (e.g., OpenRouter Free with Gemini)
   *   Level 3: Fallback 2 (e.g., OpenRouter Paid with Claude)
   *
   * @private
   * @param {string} imagePath - Path to the image file
   * @param {Object} context - Processing context
   * @returns {Promise<string|null>} Image description or null
   */
  async describeImageWithVisionAI(imagePath, context) {
    const visionAI = getVisionAIService();
    if (!visionAI) {
      logger.warn('VisionAIService not available');
      return null;
    }

    try {
      const result = await visionAI.analyzeImage(imagePath, {
        userId: context.userId,
      });

      if (result.success) {
        logger.info(`Vision AI success (Level ${result.level}): ${result.provider}/${result.model} in ${result.duration}ms`);
        return result.content;
      }

      // Log failure reason
      if (result.reason === 'vision_disabled') {
        logger.debug('Vision AI is disabled in user settings');
      } else if (result.reason === 'all_providers_failed') {
        logger.warn(`Vision AI: All providers failed - ${JSON.stringify(result.errors)}`);
      } else {
        logger.warn(`Vision AI failed: ${result.reason}`);
      }

      return null;

    } catch (error) {
      logger.error(`Vision AI exception: ${error.message}`);
      return null;
    }
  }

  /**
   * Send auto-reply back to platform
   * @private
   */
  async sendAutoReply(result, context) {
    if (!result.response || !context.replyFunction) {
      return;
    }

    try {
      await context.replyFunction(result.response);
      logger.info(`Auto-reply sent for ${result.type}`);
    } catch (error) {
      logger.error(`Failed to send auto-reply: ${error.message}`);
    }
  }

  /**
   * Ingest passive content into RAG (background processing)
   * @private
   */
  async ingestPassiveContent(message, context, classification) {
    const ingestion = getSmartIngestion();
    if (!ingestion) {
      logger.warn('SmartIngestion service not available for passive content');
      return null;
    }

    try {
      const result = await ingestion.ingest(message, {
        userId: context.userId,
        agentId: context.agentId,
        sourceType: classification.source,
        platform: message.platform,
      });

      if (result.success) {
        logger.info(`Passive content ingested: library="${result.library?.name}", doc="${result.document?.id}"`);

        // Emit event for tracking
        this.emit('content:ingested', {
          messageId: message.id,
          libraryId: result.library?.id,
          documentId: result.document?.id,
          reliability: result.reliability,
          matchScore: result.matchScore,
        });

        // Broadcast to WebSocket if available
        if (this.broadcast) {
          this.broadcast('superbrain:content_ingested', {
            messageId: message.id,
            libraryName: result.library?.name,
            documentTitle: result.document?.title,
            reliability: result.reliability?.label,
          }, context.agentId);
        }
      } else {
        logger.debug(`Content not ingested: ${result.reason} (result: ${result.result})`);
      }

      return result;

    } catch (error) {
      logger.error(`Failed to ingest passive content: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get processing metrics
   */
  getMetrics() {
    const metrics = {
      processingHistorySize: this.processingHistory.size,
      config: this.config,
      initialized: this.initialized,
    };

    // Add ingestion stats if available
    const ingestion = getSmartIngestion();
    if (ingestion) {
      metrics.ingestion = ingestion.getStats();
    }

    // Add classifier stats if available
    const classifier = getMessageClassifier();
    if (classifier && classifier.getStats) {
      metrics.classifier = classifier.getStats();
    }

    return metrics;
  }
}

// Singleton instance
let instance = null;

function getSuperBrainMessageProcessor() {
  if (!instance) {
    instance = new SuperBrainMessageProcessor();
  }
  return instance;
}

module.exports = {
  SuperBrainMessageProcessor,
  getSuperBrainMessageProcessor,
  PROCESSING_MODES,
  RESPONSE_TYPES,
  MESSAGE_SCHEMA,
};
