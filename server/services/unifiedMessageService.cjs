/**
 * Unified Message Service
 * =======================
 * Central hub for all incoming messages from all platforms
 *
 * Responsibilities:
 * 1. Normalize messages from different platforms
 * 2. Create/update conversations and contacts
 * 3. Cache media attachments with TTL
 * 4. Persist messages to database
 * 5. Broadcast to WebSocket clients
 * 6. Route through SuperBrain for intelligent processing
 * 7. Trigger FlowBuilder flows based on message content (legacy fallback)
 *
 * Flow (SuperBrain Mode - Default):
 * Platform Client → UnifiedMessageService → DB → SuperBrain → [Flow|Tool|AI|Swarm] → Response
 *
 * Flow (Legacy Mode):
 * Platform Client → UnifiedMessageService → DB → WebSocket → FlowBuilder
 */

const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('./database.cjs');
const { logger } = require('./logger.cjs');
const { mediaService } = require('./mediaService.cjs');

// Lazy load services to avoid circular dependencies
let _redisClient = null;
let _metricsService = null;

function getRedisClientSafe() {
  if (_redisClient === undefined) return null;
  if (_redisClient) return _redisClient;
  try {
    const { getRedisClient } = require('./redis.cjs');
    _redisClient = getRedisClient();
    return _redisClient;
  } catch (error) {
    _redisClient = undefined;
    return null;
  }
}

function getMetricsServiceSafe() {
  if (!_metricsService) {
    try {
      const { getMetricsService } = require('./metricsService.cjs');
      _metricsService = getMetricsService();
    } catch (error) {
      // Metrics not available
    }
  }
  return _metricsService;
}

// Deduplication TTL in seconds (5 minutes)
const DEDUP_TTL_SECONDS = 300;

// Lazy load SuperBrain to avoid circular dependencies
let _superBrainProcessor = null;
function getSuperBrainProcessor() {
  if (!_superBrainProcessor) {
    try {
      const { getSuperBrainMessageProcessor } = require('./ai/SuperBrainMessageProcessor.cjs');
      _superBrainProcessor = getSuperBrainMessageProcessor();
    } catch (error) {
      logger.warn('SuperBrainMessageProcessor not available');
    }
  }
  return _superBrainProcessor;
}

// Lazy load AgentReasoningLoop to avoid circular dependencies
let _agentReasoningLoop = null;
function getAgentReasoningLoopSafe() {
  if (!_agentReasoningLoop) {
    try {
      const { getAgentReasoningLoop } = require('./agentic/AgentReasoningLoop.cjs');
      _agentReasoningLoop = getAgentReasoningLoop();
    } catch (error) {
      logger.warn('AgentReasoningLoop not available');
    }
  }
  return _agentReasoningLoop;
}

class UnifiedMessageService extends EventEmitter {
  constructor() {
    super();
    this.broadcast = null;
    this.flowEngine = null;
    this.initialized = false;
    this.useSuperBrain = true; // Enable SuperBrain by default
  }

  /**
   * Initialize the service with dependencies
   * @param {Function} broadcast - WebSocket broadcast function
   * @param {Object} options - Configuration options
   * @param {boolean} options.useSuperBrain - Use SuperBrain for processing (default: true)
   */
  initialize(broadcast, options = {}) {
    this.broadcast = broadcast;
    this.useSuperBrain = options.useSuperBrain !== false;

    // Try to load flow engine (may not be available yet)
    try {
      const { getFlowExecutionEngine } = require('./flow/FlowExecutionEngine.cjs');
      this.flowEngine = getFlowExecutionEngine();
    } catch (error) {
      logger.warn('FlowExecutionEngine not available, flow triggers disabled');
    }

    // Initialize SuperBrain processor
    if (this.useSuperBrain) {
      const processor = getSuperBrainProcessor();
      if (processor) {
        processor.initialize({ broadcast });
        logger.info('SuperBrain Message Processor attached to UnifiedMessageService');
      }
    }

    this.initialized = true;
    logger.info(`UnifiedMessageService initialized (SuperBrain: ${this.useSuperBrain ? 'enabled' : 'disabled'})`);
  }

  /**
   * Enable or disable SuperBrain processing
   * @param {boolean} enabled
   */
  setSuperBrainEnabled(enabled) {
    this.useSuperBrain = enabled;
    logger.info(`SuperBrain processing ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Set the flow execution engine (can be set after initialization)
   * @param {Object} engine - FlowExecutionEngine instance
   */
  setFlowEngine(engine) {
    this.flowEngine = engine;
    logger.info('FlowExecutionEngine attached to UnifiedMessageService');
  }

  /**
   * Process incoming message from any platform
   * This is the main entry point for all incoming messages
   *
   * @param {Object} message - Normalized message object
   * @param {string} message.platform - Platform name (whatsapp, telegram-bot, email, etc.)
   * @param {string} message.from - Sender identifier
   * @param {string} [message.text] - Text content
   * @param {string} [message.contentType] - Content type (text, image, video, etc.)
   * @param {string} [message.mediaUrl] - URL to media content
   * @param {string} [message.mimeType] - MIME type of media
   * @param {Object} [message.sender] - Sender info { id, name, phone, email }
   * @param {boolean} [message.isGroup] - Whether this is a group message
   * @param {Object} context - Platform context
   * @param {string} context.agentId - Agent ID
   * @param {string} context.accountId - Platform account ID
   * @returns {Promise<Object>} Saved message
   */
  async processIncomingMessage(message, context) {
    const startTime = Date.now();
    const metrics = getMetricsServiceSafe();

    try {
      // 0. Deduplication check (early exit if duplicate)
      if (message.externalId) {
        const isDuplicate = await this.isMessageDuplicate(message.platform, message.externalId);
        if (isDuplicate) {
          logger.debug(`Duplicate message skipped: ${message.externalId}`);
          metrics?.recordDuplicate(message.platform, context.accountId, message.externalId);
          return { duplicate: true, externalId: message.externalId };
        }
      }

      logger.info(`Processing ${message.platform} message from ${message.sender?.id || message.from || 'unknown'}`);

      // Emit message:incoming hook
      try {
        const { getHookRegistry } = require('./agentic/HookRegistry.cjs');
        getHookRegistry().emitAsync('message:incoming', {
          platform: message.platform,
          sender: message.sender?.id || message.from,
          isGroup: message.isGroup || false,
          contentType: message.contentType || 'text',
          agentId: context.agentId,
          userId: context.userId,
        });
      } catch (e) { /* hooks optional */ }

      // Record message received metric
      metrics?.recordMessageReceived(message.platform, context.accountId, {
        contentType: message.contentType || 'text',
        isGroup: message.isGroup || false,
      });

      // 1. Get or create conversation
      const conversation = await this.getOrCreateConversation(message, context);

      // 2. Get or create contact
      const contact = await this.getOrCreateContact(message, conversation);

      // 3. Save message to database (must be before media caching due to FK constraint)
      const savedMessage = await this.saveMessage(message, conversation.id);

      // 4. Handle media attachments (download & cache with TTL)
      // Note: This must happen AFTER saveMessage because media_cache has FK to messages
      if (message.mediaUrl && message.contentType !== 'text') {
        await this.handleMediaAttachment(savedMessage, conversation.user_id);
      }

      // 5. Update conversation metadata
      await this.updateConversation(conversation.id, savedMessage);

      // 6. Broadcast to WebSocket clients
      if (this.broadcast) {
        logger.info(`Broadcasting message:new for conversation ${conversation.id} to agent ${context.agentId}`);
        this.broadcast('message:new', {
          message: this.transformMessageForClient(savedMessage),
          conversation: this.transformConversationForClient(conversation),
          contact: contact ? this.transformContactForClient(contact) : null
        }, context.agentId);
      } else {
        logger.warn('No broadcast function available - WebSocket messages will not be sent');
      }

      // 7. Route through SuperBrain OR check flow triggers (legacy)
      // Skip AI processing for outgoing messages (own messages synced from multi-device)
      let superBrainResult = null;
      if (message.direction !== 'outgoing') {
        if (this.useSuperBrain) {
          superBrainResult = await this.processWithSuperBrain(savedMessage, conversation, contact, context);
        } else {
          // Legacy: Direct flow trigger check
          await this.checkFlowTriggers(savedMessage, conversation, context);
        }
      }

      // 8. Emit event for additional processing
      this.emit('message:processed', {
        message: savedMessage,
        conversation,
        contact,
        agentId: context.agentId,
        processingTimeMs: Date.now() - startTime,
        superBrainResult,
      });

      logger.info(`Message processed in ${Date.now() - startTime}ms: ${savedMessage.id}`);

      return {
        message: savedMessage,
        conversation,
        contact,
        superBrainResult,
      };

    } catch (error) {
      logger.error(`Message processing failed: ${error.message}`);
      this.emit('message:error', { error, message, context });
      throw error;
    }
  }

  /**
   * Process message through SuperBrain (Main Brain)
   * Routes to flows, tools, AI, or swarm based on intent
   * @private
   */
  async processWithSuperBrain(message, conversation, contact, context) {
    const processor = getSuperBrainProcessor();
    if (!processor) {
      logger.warn('SuperBrain not available, falling back to flow triggers');
      await this.checkFlowTriggers(message, conversation, context);
      return null;
    }

    try {
      // Check if this message is an approval reply from master contact
      const approvalResult = await this.checkForApprovalReply(message, conversation, contact, context);
      if (approvalResult?.handled) {
        logger.info(`[Agentic] Message handled as approval reply: ${approvalResult.action}`);
        return { type: 'approval_reply', response: null, ...approvalResult };
      }

      // Check if this message is a response to a blocked plan task (human-in-loop)
      const taskResponseResult = await this.checkForTaskResponse(message, conversation, contact, context);
      if (taskResponseResult?.handled) {
        logger.info(`[Agentic] Message handled as task response: ${taskResponseResult.taskTitle}`);
        return { type: 'task_response', response: null, ...taskResponseResult };
      }

      // === NEW: Agentic Reasoning Loop intercept ===
      // Check if an agentic profile monitors this agent.
      // If yes, route through AgentReasoningLoop for multi-step reasoning with personality.
      let result = null;
      let usedAgenticPath = false;
      const agenticProfile = this.findAgenticProfileForAgent(context.agentId, conversation.user_id);

      if (agenticProfile && agenticProfile.status === 'active') {
        try {
          const db = getDatabase();
          const hasActiveMonitoring = db.prepare(`
            SELECT 1 FROM agentic_monitoring
            WHERE agentic_id = ? AND is_active = 1
              AND (
                (source_type = ? AND (source_id IS NULL OR source_id = ?))
                OR source_type = 'platform_account'
              )
            LIMIT 1
          `).get(agenticProfile.id, conversation.platform, context.accountId);

          if (hasActiveMonitoring) {
            // Audit: log incoming message with correct agenticId
            try {
              const { getAuditLogService } = require('./agentic/AuditLogService.cjs');
              getAuditLogService().log(agenticProfile.id, conversation.user_id, 'incoming', 'INBOUND', {
                platform: message.platform || conversation.platform,
                sender: message.sender?.name || message.sender?.id || message.from || 'unknown',
                preview: (message.content || message.body || '').substring(0, 200),
                isGroup: message.isGroup || false,
                conversationId: conversation.id,
                contentType: message.contentType || message.content_type || 'text',
                agentName: agenticProfile.name,
              });
            } catch (_) {}

            logger.info(`[Agentic] Routing message to AgentReasoningLoop for profile "${agenticProfile.name}" (agent: ${context.agentId})`);
            result = await this.processWithAgenticReasoning(
              agenticProfile, message, conversation, contact, context
            );
            usedAgenticPath = true;
            console.log(`[DEBUG] processWithAgenticReasoning returned: type=${result?.type}, hasResponse=${!!result?.response}, response="${(result?.response || '').substring(0, 120)}"`);
          }
        } catch (agenticErr) {
          console.log(`[DEBUG] processWithAgenticReasoning THREW: ${agenticErr.message}`);
          console.error(`[DEBUG] agenticErr stack:`, agenticErr.stack?.substring(0, 500));
          logger.warn(`[Agentic] Reasoning loop failed, falling back to SuperBrain: ${agenticErr.message}`);
          // Phase 1b: Send user-visible error on agentic failure before falling through
          // BUT only if the error wasn't already reported to the user (prevents triple error cascade)
          if (!agenticErr._userNotified) {
            try {
              const { getDeliveryQueueService } = require('./deliveryQueueService.cjs');
              const dlq = getDeliveryQueueService();
              if (dlq && this.agentManager && context.accountId && conversation.external_id) {
                await dlq.enqueue({
                  accountId: context.accountId,
                  recipient: conversation.external_id,
                  platform: conversation.platform || 'whatsapp',
                  content: "I ran into a technical issue processing your message. Let me try a different approach...",
                  source: 'error_fallback',
                  sourceContext: 'agentic_loop_failure',
                  conversationId: conversation.id,
                  agentId: context.agentId,
                  userId: conversation.user_id,
                });
              }
            } catch (_dlqErr) { /* DLQ enqueue failure is non-fatal */ }
          }
          // Fall through to generic SuperBrain processing
        }
      }
      // === END NEW ===

      if (!usedAgenticPath) {
        // Fetch conversation history for context (last 10 messages)
        const conversationHistory = this.getConversationHistory(conversation.id, 10);

        // Build unified message for SuperBrain
        const unifiedMessage = {
          id: message.id,
          platform: message.platform || conversation.platform,
          content: message.content || message.text,
          from: message.senderId || message.sender_id || conversation.external_id,
          contentType: message.contentType || message.content_type || 'text',
          mediaUrl: message.cachedMediaUrl || message.mediaUrl || message.media_url,
          mimeType: message.mimeType || message.mime_type,
          timestamp: message.createdAt || message.created_at,
          conversationId: conversation.id,
          sender: contact ? {
            id: contact.id,
            name: contact.display_name,
            phone: null,
            email: null,
          } : {
            id: message.senderId || message.sender_id,
            name: message.senderName || message.sender_name,
          },
          isGroup: conversation.is_group || false,
          groupId: conversation.is_group ? conversation.external_id : null,
          groupName: conversation.is_group ? conversation.title : null,
        };

        // Process through SuperBrain
        result = await processor.process(unifiedMessage, {
          userId: conversation.user_id,
          agentId: context.agentId,
          accountId: context.accountId,
          conversationId: conversation.id,
          conversationHistory,
          replyFunction: async (response) => {
            if (this.agentManager) {
              await this.agentManager.sendMessage(
                context.accountId,
                conversation.external_id,
                response
              );
            }
          },
        });
      }

      // Emit SuperBrain result event
      console.log(`[DEBUG] About to emit superbrain:processed. result type=${result?.type}, usedAgenticPath=${usedAgenticPath}`);
      this.emit('superbrain:processed', {
        messageId: message.id,
        conversationId: conversation.id,
        result,
      });
      console.log(`[DEBUG] superbrain:processed emitted OK`);

      // Agentic auto-respond (handles both agentic and SuperBrain paths)
      // SKIP if intermediate responses were already sent during reasoning loop — prevents duplicates
      const intermediateAlreadySent = result?._intermediateResponsesSent > 0;
      console.log(`[DEBUG] Auto-respond check: type=${result?.type}, hasResponse=${!!result?.response}, intermediateAlreadySent=${intermediateAlreadySent}, agentId=${context.agentId}`);
      logger.info(`[Agentic] Auto-respond check: type=${result?.type}, hasResponse=${!!result?.response}, intermediateAlreadySent=${intermediateAlreadySent}, agentId=${context.agentId}`);
      if (result && result.response && result.type !== 'silent' && !intermediateAlreadySent && this.agentManager) {
        try {
          const shouldAutoRespond = this.checkAgenticAutoRespond(
            context.agentId, context.accountId, conversation.user_id, conversation.platform
          );
          logger.info(`[Agentic] shouldAutoRespond=${shouldAutoRespond} for agent ${context.agentId} on ${conversation.platform}`);
          if (shouldAutoRespond) {
            // Enrich context with message text and sender phone for scope checks
            const scopeContext = {
              ...context,
              messageText: message.content || message.text || '',
              senderPhone: message.sender?.phone || message.senderPhone || null,
            };
            const scopeResult = await this.checkSenderScopeForAutoRespond(
              context.agentId, conversation, contact, scopeContext
            );

            if (scopeResult.allowed) {
              // Final safety net: extract message from JSON if AI returned raw tool call
              const cleanResponse = this.extractCleanResponse(result.response);

              // Save AI response to DB and broadcast to frontend BEFORE DLQ delivery
              const outMsgId = uuidv4();
              const outNow = new Date().toISOString();
              const db = getDatabase();
              db.prepare(`
                INSERT INTO messages (id, conversation_id, direction, content_type, content, status, ai_generated, created_at)
                VALUES (?, ?, 'outgoing', 'text', ?, 'pending', 1, ?)
              `).run(outMsgId, conversation.id, cleanResponse, outNow);
              db.prepare(`
                UPDATE conversations SET last_message_at = ?, updated_at = datetime('now') WHERE id = ?
              `).run(outNow, conversation.id);

              // Broadcast message:new so frontend updates in real-time
              if (this.broadcast) {
                this.broadcast('message:new', {
                  message: this.transformMessageForClient({
                    id: outMsgId,
                    conversationId: conversation.id,
                    direction: 'outgoing',
                    contentType: 'text',
                    content: cleanResponse,
                    senderId: context.agentId,
                    senderName: 'AI',
                    platform: conversation.platform,
                    createdAt: outNow,
                    aiGenerated: true,
                  }),
                  conversation: this.transformConversationForClient(conversation),
                }, context.agentId);
              }

              await this.agentManager.sendTyping(
                context.accountId,
                conversation.external_id,
                1500
              );
              const { getDeliveryQueueService } = require('./deliveryQueueService.cjs');
              const dlq = getDeliveryQueueService();
              await dlq.enqueue({
                accountId: context.accountId,
                recipient: conversation.external_id,
                platform: conversation.platform || 'whatsapp',
                content: cleanResponse,
                source: 'auto_respond',
                conversationId: conversation.id,
                messageId: outMsgId,
                agentId: context.agentId,
                userId: conversation.user_id,
              });
              logger.info(`[Agentic] Auto-response saved (${outMsgId}) and queued via DLQ for agent ${context.agentId} on ${conversation.platform}`);
            } else if (scopeResult.silent) {
              // Silent rejection (e.g., group not whitelisted, no mention) — skip approval workflow
              logger.info(`[Agentic] Silently skipping out-of-scope: ${scopeResult.reason}`);
            } else {
              logger.info(`[Agentic] Sender out of scope: ${scopeResult.reason}. Initiating approval workflow.`);
              await this.handleOutOfScopeMessage(
                scopeResult.agenticProfile,
                conversation,
                contact,
                context,
                result.response,
                scopeResult.reason
              );
            }
          }
        } catch (autoRespondErr) {
          logger.error(`[Agentic] Auto-respond failed: ${autoRespondErr.message}`);
          // Phase 1b: Last-resort direct send if DLQ/auto-respond failed
          try {
            if (this.agentManager && context.accountId && conversation.external_id) {
              await this.agentManager.sendMessage(
                context.accountId,
                conversation.external_id,
                "I processed your message but had an issue sending my reply. Please try again."
              );
            }
          } catch (_directErr) { /* truly nothing we can do */ }
        }
      }

      // Auto-reply if SuperBrain has global autoReply config (existing)
      if (!usedAgenticPath && this.config?.autoReply && result?.response && result?.type !== 'silent' && context.replyFunction) {
        // This is already handled inside processor.process() via the replyFunction callback
      }

      return result;

    } catch (error) {
      console.log(`[DEBUG] processWithSuperBrain CAUGHT error: ${error.message}`);
      console.error(`[DEBUG] processWithSuperBrain stack:`, error.stack?.substring(0, 500));
      logger.error(`SuperBrain processing failed: ${error.message}`);
      await this.checkFlowTriggers(message, conversation, context);
      return { type: 'error', error: error.message };
    }
  }

  /**
   * Set agent manager for reply functionality
   * @param {Object} agentManager
   */
  setAgentManager(agentManager) {
    this.agentManager = agentManager;
  }

  /**
   * Check if a message is a duplicate using Redis (with SQLite fallback)
   * @param {string} platform - Platform name
   * @param {string} externalId - External message ID
   * @returns {Promise<boolean>} True if duplicate
   * @private
   */
  async isMessageDuplicate(platform, externalId) {
    if (!externalId) return false;

    const dedupKey = `msg:dedup:${platform}:${externalId}`;

    // Try Redis first
    const redis = getRedisClientSafe();
    if (redis) {
      try {
        const exists = await redis.get(dedupKey);
        if (exists) return true;

        // Set with TTL (5 minutes)
        await redis.set(dedupKey, '1', 'EX', DEDUP_TTL_SECONDS);
        return false;
      } catch (error) {
        logger.debug(`Redis dedup check failed: ${error.message}`);
        // Fall through to SQLite
      }
    }

    // Fallback: check database for existing message with same external_id
    try {
      const db = getDatabase();
      const existing = db.prepare(`
        SELECT id FROM messages
        WHERE external_id = ?
        LIMIT 1
      `).get(externalId);

      return !!existing;
    } catch (error) {
      logger.debug(`SQLite dedup check failed: ${error.message}`);
      return false; // Fail open - allow processing
    }
  }

  /**
   * Get recent conversation history for AI context
   * @param {string} conversationId - Conversation ID
   * @param {number} limit - Max messages to fetch
   * @returns {Array} Array of recent messages in chronological order
   * @private
   */
  getConversationHistory(conversationId, limit = 10) {
    try {
      const db = getDatabase();
      const messages = db.prepare(`
        SELECT
          content,
          direction,
          sender_name,
          content_type,
          created_at
        FROM messages
        WHERE conversation_id = ?
          AND content IS NOT NULL
          AND content != ''
        ORDER BY created_at DESC
        LIMIT ?
      `).all(conversationId, limit);

      // Reverse to get chronological order and format for AI
      return messages.reverse().map(msg => ({
        role: msg.direction === 'incoming' ? 'user' : 'assistant',
        content: msg.content,
        senderName: msg.sender_name,
        contentType: msg.content_type,
        timestamp: msg.created_at,
      }));

    } catch (error) {
      logger.debug(`Failed to get conversation history: ${error.message}`);
      return [];
    }
  }

  /**
   * Handle media attachment - download and cache with TTL
   * @private
   */
  async handleMediaAttachment(message, userId) {
    if (!message.mediaUrl) return;

    try {
      const messageId = message.id || uuidv4();
      const localPath = await mediaService.cacheMedia(
        messageId,
        message.mediaUrl,
        message.mimeType || 'application/octet-stream',
        userId
      );

      // Update message with cached URL if successful
      if (localPath && !localPath.startsWith('http')) {
        message.cachedMediaUrl = `/api/media/${messageId}`;
        message.id = messageId; // Ensure ID is set for lookup
      }
    } catch (error) {
      logger.warn(`Failed to cache media: ${error.message}`);
      // Continue processing - media will use original URL
    }
  }

  /**
   * Check and trigger FlowBuilder flows for incoming message
   * @private
   */
  async checkFlowTriggers(message, conversation, context) {
    if (!this.flowEngine) {
      logger.debug('Flow engine not available, skipping flow triggers');
      return;
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
      `).all(conversation.user_id);

      if (flows.length === 0) {
        return;
      }

      logger.debug(`Found ${flows.length} flows to check for message triggers`);

      for (const flow of flows) {
        try {
          // Parse flow nodes
          const nodes = typeof flow.nodes === 'string' ? JSON.parse(flow.nodes) : (flow.nodes || []);

          // Find message trigger nodes
          const triggerNodes = nodes.filter(n =>
            n.type === 'trigger:message' ||
            n.type === `trigger:${message.platform}_message` ||
            n.type === 'trigger:any_message' ||
            n.type.startsWith('trigger:') && n.type.includes('message')
          );

          for (const triggerNode of triggerNodes) {
            const filters = triggerNode.data?.filters || {};

            // Check if message matches trigger filters
            if (this.matchesTriggerFilters(message, filters)) {
              logger.info(`Triggering flow ${flow.id} (${flow.name}) for message ${message.id}`);

              // Execute flow asynchronously (don't wait for completion)
              this.flowEngine.execute(flow, {
                input: {
                  message: {
                    id: message.id,
                    content: message.content || message.text,
                    from: message.senderId || message.sender?.id || message.from,
                    platform: message.platform,
                    conversationId: conversation.id,
                    contentType: message.contentType || 'text',
                    mediaUrl: message.cachedMediaUrl || message.mediaUrl,
                    timestamp: message.createdAt || new Date().toISOString()
                  },
                  conversation: {
                    id: conversation.id,
                    title: conversation.title,
                    platform: conversation.platform,
                    externalId: conversation.external_id
                  },
                  contact: {
                    id: message.sender?.id,
                    name: message.sender?.name,
                    phone: message.sender?.phone,
                    email: message.sender?.email
                  },
                  trigger: {
                    type: `${message.platform}_message`,
                    nodeId: triggerNode.id,
                    matchedAt: new Date().toISOString(),
                    // Cross-agent messaging source context
                    source: {
                      agentId: context.agentId,
                      accountId: context.accountId,
                      platform: message.platform,
                      contactId: message.senderId || message.sender?.id || message.from,
                      conversationId: conversation.id
                    }
                  },
                  // Also provide at top level for easy access
                  agentId: context.agentId,
                  platform: message.platform
                },
                trigger: {
                  type: 'message',
                  source: message.platform,
                  timestamp: new Date().toISOString()
                },
                userId: conversation.user_id
              }).catch(error => {
                logger.error(`Flow execution failed for ${flow.id}: ${error.message}`);
              });

              // Emit flow triggered event
              this.emit('flow:triggered', {
                flowId: flow.id,
                flowName: flow.name,
                messageId: message.id,
                triggeredAt: new Date().toISOString()
              });
            }
          }
        } catch (error) {
          logger.error(`Error processing flow ${flow.id}: ${error.message}`);
        }
      }
    } catch (error) {
      logger.error(`Flow trigger check failed: ${error.message}`);
    }
  }

  /**
   * Check if message matches trigger filter criteria
   * @private
   */
  matchesTriggerFilters(message, filters) {
    if (!filters || Object.keys(filters).length === 0) {
      return true; // No filters = match all
    }

    const content = (message.content || message.text || '').toLowerCase();
    const from = (message.senderId || message.sender?.id || message.from || '').toLowerCase();

    // Platform filter
    if (filters.platform && filters.platform !== 'any') {
      if (message.platform !== filters.platform) {
        return false;
      }
    }

    // Content filters
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
        const regex = new RegExp(filters.pattern, 'i');
        if (!regex.test(content)) return false;
      } catch {
        return false;
      }
    }
    if (filters.exactMatch && content !== filters.exactMatch.toLowerCase()) {
      return false;
    }

    // Sender filters
    if (filters.from && from !== filters.from.toLowerCase()) {
      return false;
    }
    if (filters.fromAny && Array.isArray(filters.fromAny)) {
      if (!filters.fromAny.map(s => s.toLowerCase()).includes(from)) {
        return false;
      }
    }
    if (filters.notFrom && from === filters.notFrom.toLowerCase()) {
      return false;
    }

    // Attachment filters
    if (filters.hasAttachment && (!message.contentType || message.contentType === 'text')) {
      return false;
    }
    if (filters.attachmentType && filters.attachmentType !== 'any') {
      if (message.contentType !== filters.attachmentType) {
        return false;
      }
    }

    // Group filter
    if (filters.isGroup !== undefined) {
      if (Boolean(message.isGroup) !== Boolean(filters.isGroup)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get or create conversation for message
   * @private
   */
  async getOrCreateConversation(message, context) {
    const db = getDatabase();

    // Build external ID based on platform
    // IMPORTANT: WhatsApp uses the raw chat ID (e.g., 120363420625326989@g.us)
    // to match the format used by whatsappClient.cjs sync
    let externalId;
    let legacyExternalId; // For backward compatibility with old prefixed format
    if (message.platform === 'whatsapp' || message.platform === 'whatsapp-business') {
      // Use raw WhatsApp chat ID (same as whatsappClient.cjs sync)
      externalId = message.from;
      // Also check for legacy prefixed format
      legacyExternalId = message.isGroup
        ? `whatsapp-group:${message.from}`
        : `whatsapp:${message.from}`;
    } else if (message.platform === 'email') {
      externalId = `email:${message.from}`;
    } else {
      externalId = `${message.platform}:${message.from}`;
    }

    // Check for existing conversation (try raw ID first, then legacy prefixed format)
    let conversation = db.prepare(`
      SELECT * FROM conversations WHERE external_id = ?
    `).get(externalId);

    // If not found and we have a legacy format, try that too
    if (!conversation && legacyExternalId) {
      conversation = db.prepare(`
        SELECT * FROM conversations WHERE external_id = ?
      `).get(legacyExternalId);
      // If found with legacy format, use that external_id to maintain consistency
      if (conversation) {
        logger.debug(`Found conversation with legacy external_id: ${legacyExternalId}`);
      }
    }

    // If not found and this is a WhatsApp @lid ID, try matching by phone@c.us
    // WhatsApp migrates contacts from @c.us to @lid format; old conversations use @c.us
    if (!conversation && externalId && externalId.endsWith('@lid')) {
      const senderPhone = message.sender?.phone;
      if (senderPhone) {
        const phoneCusId = `${senderPhone}@c.us`;
        conversation = db.prepare(`
          SELECT * FROM conversations WHERE external_id = ?
        `).get(phoneCusId);

        if (conversation) {
          // Migrate: update external_id to the new @lid format
          logger.info(`Migrating conversation ${conversation.id}: ${phoneCusId} → ${externalId}`);
          db.prepare(`
            UPDATE conversations SET external_id = ?, updated_at = datetime('now') WHERE id = ?
          `).run(externalId, conversation.id);
          conversation.external_id = externalId;
        }
      }
    }

    if (conversation) {
      // For groups, update title ONLY if current title is generic/placeholder
      // Do NOT overwrite if it already has a proper group name
      if (message.isGroup && message.groupName && conversation.title !== message.groupName) {
        // Only update if current title is generic (Unknown, Group Chat) or looks like a WhatsApp ID
        // WhatsApp group IDs look like: 120363420625326989@g.us
        // WhatsApp user IDs look like: 60123456789@c.us
        const isWhatsAppId = /^\d+@[gc]\.us$/.test(conversation.title);
        const titleNeedsUpdate =
          conversation.title === 'Unknown' ||
          conversation.title === 'Group Chat' ||
          isWhatsAppId; // Only match actual WhatsApp IDs, not names with @ symbol

        if (titleNeedsUpdate) {
          logger.info(`Updating group title from "${conversation.title}" to "${message.groupName}" for conversation ${conversation.id}`);
          db.prepare(`
            UPDATE conversations SET title = ?, updated_at = datetime('now') WHERE id = ?
          `).run(message.groupName, conversation.id);
          conversation.title = message.groupName;
        }
      }
      return conversation;
    }

    // Get user_id from platform account
    const account = db.prepare(`
      SELECT user_id, agent_id FROM platform_accounts WHERE id = ?
    `).get(context.accountId);

    if (!account) {
      throw new Error(`Platform account not found: ${context.accountId}`);
    }

    // Create new conversation - detect category from external ID
    const conversationId = uuidv4();
    // For groups, use the group name; for 1:1 chats, use the sender name
    const title = message.isGroup && message.groupName
      ? message.groupName
      : (message.sender?.name || message.from || 'Unknown');

    // Detect category from externalId
    let category = 'chat';
    if (externalId && externalId.includes('@newsletter')) {
      category = 'news';
    } else if (externalId && (externalId.includes('@broadcast') || externalId === 'status@broadcast')) {
      category = 'status';
    }

    db.prepare(`
      INSERT INTO conversations (id, user_id, agent_id, platform, external_id, title, is_group, category)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      conversationId,
      account.user_id,
      context.agentId || account.agent_id,
      message.platform,
      externalId,
      title,
      message.isGroup ? 1 : 0,
      category
    );

    conversation = db.prepare('SELECT * FROM conversations WHERE id = ?').get(conversationId);
    logger.info(`Created conversation: ${conversationId} for ${externalId}`);

    // Emit conversation created event
    this.emit('conversation:created', { conversation, message });

    return conversation;
  }

  /**
   * Get or create contact for message sender
   * @private
   */
  async getOrCreateContact(message, conversation) {
    const db = getDatabase();

    if (!message.sender) {
      return null;
    }

    // Determine identifier type and value based on platform
    let identifierType = 'phone';
    let identifierValue = message.sender.email || message.sender.phone || message.sender.id;

    if (message.platform === 'email') {
      identifierType = 'email';
    } else if (message.platform === 'whatsapp') {
      identifierType = 'whatsapp';
    } else if (message.platform === 'telegram-bot' || message.platform === 'telegram-user') {
      identifierType = 'telegram';
    }

    if (!identifierValue) {
      return null;
    }

    // Clean up WhatsApp LID/JID suffixes from identifier value
    const cleanIdentifier = identifierValue
      .replace(/@lid$/, '')
      .replace(/@c\.us$/, '')
      .replace(/@s\.whatsapp\.net$/, '');

    // Check for existing contact by identifier (search across all identifier types)
    // Also try with @lid suffix appended and stripped to catch all variants
    let contact = db.prepare(`
      SELECT c.* FROM contacts c
      JOIN contact_identifiers ci ON ci.contact_id = c.id
      WHERE c.user_id = ?
        AND (ci.identifier_value = ? OR ci.identifier_value = ? OR ci.identifier_value = ?)
    `).get(conversation.user_id, identifierValue, cleanIdentifier, cleanIdentifier + '@lid');

    if (!contact) {
      // Also update conversation contact_id if conversation already has a contact
      if (conversation.contact_id) {
        contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(conversation.contact_id);
      }
    }

    if (contact) {
      // Update conversation with contact_id if not set
      if (!conversation.contact_id) {
        db.prepare('UPDATE conversations SET contact_id = ? WHERE id = ?')
          .run(contact.id, conversation.id);
      }
      // Update display_name if currently a phone/LID and we now have a real name
      if (message.sender.name && contact.display_name) {
        const isLidName = /^\d{10,}(@lid)?$/.test(contact.display_name);
        const isPhoneName = /^\+?\d[\d\s\-()]{5,}$/.test(contact.display_name.trim());
        if (isLidName || isPhoneName) {
          db.prepare('UPDATE contacts SET display_name = ?, updated_at = datetime(\'now\') WHERE id = ?')
            .run(message.sender.name, contact.id);
          contact.display_name = message.sender.name;
        }
      }
      // Ensure this identifier is linked to the contact (add if missing)
      const hasIdentifier = db.prepare(
        'SELECT 1 FROM contact_identifiers WHERE contact_id = ? AND identifier_value = ?'
      ).get(contact.id, cleanIdentifier);
      if (!hasIdentifier) {
        db.prepare(`
          INSERT INTO contact_identifiers (id, contact_id, identifier_type, identifier_value, platform, is_primary, created_at)
          VALUES (?, ?, ?, ?, ?, 0, datetime('now'))
        `).run(uuidv4(), contact.id, identifierType, cleanIdentifier, message.platform);
      }
      return contact;
    }

    // Build display name - prefer sender name, fall back to formatted phone
    let displayName = message.sender.name;
    if (!displayName || /^\d{10,}(@lid)?$/.test(displayName)) {
      // If name is empty or just a LID number, use formatted phone
      const numericPart = cleanIdentifier.replace(/\D/g, '');
      if (numericPart.length >= 8 && numericPart.length <= 15) {
        displayName = `+${numericPart}`;
      } else {
        displayName = cleanIdentifier;
      }
    }

    // Create new contact
    const contactId = uuidv4();

    db.prepare(`
      INSERT INTO contacts (id, user_id, display_name)
      VALUES (?, ?, ?)
    `).run(contactId, conversation.user_id, displayName);

    // Add identifier (use cleaned value without @lid suffix)
    db.prepare(`
      INSERT INTO contact_identifiers (id, contact_id, identifier_type, identifier_value, platform, is_primary)
      VALUES (?, ?, ?, ?, ?, 1)
    `).run(uuidv4(), contactId, identifierType, cleanIdentifier, message.platform);

    // Link to conversation
    db.prepare('UPDATE conversations SET contact_id = ? WHERE id = ?')
      .run(contactId, conversation.id);

    contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(contactId);
    logger.info(`Created contact: ${displayName} (${contactId})`);

    // Emit contact created event
    this.emit('contact:created', { contact, message });

    return contact;
  }

  /**
   * Save message to database
   * @private
   */
  async saveMessage(message, conversationId) {
    const db = getDatabase();

    const messageId = message.id || uuidv4();
    // Use the provider's message timestamp if available (e.g., WhatsApp msg.timestamp),
    // falling back to current time for messages without a provider timestamp
    const now = message.timestamp
      ? (message.timestamp instanceof Date ? message.timestamp.toISOString() : new Date(message.timestamp).toISOString())
      : new Date().toISOString();

    // Build metadata with filename from mediaData if available
    const metadata = message.metadata || {};
    if (message.mediaData?.filename && !metadata.fileName) {
      metadata.fileName = message.mediaData.filename;
    }
    if (message.mediaData?.mimetype && !metadata.mimeType) {
      metadata.mimeType = message.mediaData.mimetype;
    }
    if (message.mediaData?.data && !metadata.fileSize) {
      metadata.fileSize = message.mediaData.data.length; // base64 length approximation
    }
    // Store link preview data from WhatsApp/Telegram if available
    if (message.linkPreview) {
      metadata.linkPreview = message.linkPreview;
    }
    const metadataStr = Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : null;

    db.prepare(`
      INSERT INTO messages (
        id, conversation_id, direction, content_type, content,
        media_url, media_mime_type, external_id, sender_id, sender_name, metadata, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      messageId,
      conversationId,
      message.direction || 'incoming',
      this.normalizeContentType(message.contentType),
      message.text || message.content || message.html || null,
      message.cachedMediaUrl || message.mediaUrl || null,
      message.mimeType || null,
      message.externalId || null,
      message.sender?.id || null,
      message.sender?.name || null,
      metadataStr,
      now
    );

    return {
      id: messageId,
      conversationId,
      direction: message.direction || 'incoming',
      contentType: message.contentType || 'text',
      content: message.text || message.content || message.html,
      mediaUrl: message.cachedMediaUrl || message.mediaUrl,
      mimeType: message.mimeType,
      externalId: message.externalId,
      senderId: message.sender?.id,
      senderName: message.sender?.name,
      platform: message.platform,
      createdAt: now
    };
  }

  /**
   * Check if the agent has agentic monitoring with auto_respond enabled.
   * This controls whether the Agentic AI auto-sends SuperBrain responses
   * back to the platform (independent of SuperBrain's global autoReply).
   *
   * Checks two paths:
   * 1. Agent directly has an agentic profile with monitoring auto_respond = 1
   * 2. Agent is a response_agent for an agentic profile with monitoring auto_respond = 1
   * @private
   */
  checkAgenticAutoRespond(agentId, accountId, userId, platform) {
    try {
      const db = getDatabase();

      // Map runtime platform names to monitoring source_type values
      // DB CHECK constraint allows: email, whatsapp, telegram, platform_account
      const platformToSourceType = {
        'whatsapp': 'whatsapp',
        'whatsapp-business': 'whatsapp',
        'telegram-bot': 'telegram',
        'telegram-user': 'telegram',
        'email': 'email',
      };
      const sourceType = platformToSourceType[platform] || platform;

      // Path 1: Direct - agent has its own agentic profile with monitoring
      // Must match specific platform account (source_id) to support per-account settings
      const directMonitoring = db.prepare(`
        SELECT m.auto_respond FROM agentic_monitoring m
        JOIN agentic_profiles p ON m.agentic_id = p.id
        WHERE p.agent_id = ? AND m.user_id = ? AND m.is_active = 1
          AND m.auto_respond = 1
          AND (
            (m.source_type = ? AND (m.source_id IS NULL OR m.source_id = ?))
            OR m.source_type = 'platform_account'
          )
        LIMIT 1
      `).get(agentId, userId, sourceType, accountId);

      if (directMonitoring) return true;

      // Path 2: Agent is a response_agent for an agentic profile
      // Check if any profile lists this agent in response_agent_ids
      // and has monitoring with auto_respond = 1
      const profiles = db.prepare(`
        SELECT id, response_agent_ids FROM agentic_profiles
        WHERE user_id = ? AND response_agent_ids IS NOT NULL
      `).all(userId);

      for (const profile of profiles) {
        try {
          const responseAgentIds = JSON.parse(profile.response_agent_ids || '[]');
          if (responseAgentIds.includes(agentId)) {
            const monitoring = db.prepare(`
              SELECT auto_respond FROM agentic_monitoring
              WHERE agentic_id = ? AND is_active = 1 AND auto_respond = 1
                AND (
                  (source_type = ? AND (source_id IS NULL OR source_id = ?))
                  OR source_type = 'platform_account'
                )
              LIMIT 1
            `).get(profile.id, sourceType, accountId);

            if (monitoring) return true;
          }
        } catch (e) { /* parse error, skip */ }
      }

      return false;
    } catch (e) {
      logger.debug(`[Agentic] checkAgenticAutoRespond error: ${e.message}`);
      return false;
    }
  }

  /**
   * Find the agentic profile that is monitoring this agent (via response_agent_ids).
   * Returns the full agentic profile row or null.
   * @private
   */
  findAgenticProfileForAgent(agentId, userId) {
    try {
      const db = getDatabase();

      // Path 1: Direct - agent IS the agentic profile's agent_id
      const direct = db.prepare(`
        SELECT * FROM agentic_profiles WHERE agent_id = ? AND user_id = ? AND status = 'active'
      `).get(agentId, userId);
      if (direct) return direct;

      // Path 2: Agent is in response_agent_ids of a profile
      const profiles = db.prepare(`
        SELECT * FROM agentic_profiles
        WHERE user_id = ? AND response_agent_ids IS NOT NULL AND status = 'active'
      `).all(userId);

      for (const profile of profiles) {
        try {
          const responseAgentIds = JSON.parse(profile.response_agent_ids || '[]');
          if (responseAgentIds.includes(agentId)) {
            return profile;
          }
        } catch (e) { /* parse error, skip */ }
      }

      return null;
    } catch (e) {
      logger.debug(`[Agentic] findAgenticProfileForAgent error: ${e.message}`);
      return null;
    }
  }

  /**
   * Process message through AgentReasoningLoop (for agents monitored by an agentic profile).
   * Provides multi-step reasoning with personality, tools, and skills.
   * @private
   */
  async processWithAgenticReasoning(agenticProfile, message, conversation, contact, context) {
    const loop = getAgentReasoningLoopSafe();
    if (!loop) {
      throw new Error('AgentReasoningLoop not available');
    }
    const db = getDatabase();

    // 1. Anti-loop: check if this message should be ignored
    if (this.shouldIgnoreForAgentic(agenticProfile, message, context)) {
      logger.info(`[Agentic] Anti-loop: ignoring message for profile "${agenticProfile.name}"`);
      return { type: 'silent', response: null };
    }

    // 2. Detect if sender is master contact
    const isMaster = this.detectMasterContact(agenticProfile, message, conversation, contact);

    // 2a. Phase 2b: Master Recognition — track interaction count and familiarity
    let masterFamiliarity = null;
    if (isMaster) {
      try {
        const now = new Date().toISOString();
        const count = (agenticProfile.master_interaction_count || 0) + 1;
        const firstContact = agenticProfile.first_master_contact_at || now;
        db.prepare(`
          UPDATE agentic_profiles
          SET master_interaction_count = ?,
              first_master_contact_at = COALESCE(first_master_contact_at, ?),
              last_master_contact_at = ?,
              updated_at = datetime('now')
          WHERE id = ?
        `).run(count, firstContact, now, agenticProfile.id);

        // Determine familiarity level
        let level;
        if (count <= 3) level = 'new';
        else if (count <= 20) level = 'developing';
        else if (count <= 100) level = 'established';
        else level = 'deep';

        masterFamiliarity = { count, level, firstContactAt: firstContact, lastContactAt: now };
        logger.info(`[Agentic] Master interaction #${count} (familiarity: ${level}) for profile "${agenticProfile.name}"`);
      } catch (famErr) {
        logger.warn(`[Agentic] Master familiarity tracking failed (non-fatal): ${famErr.message}`);
      }
    }

    // 2b. Phase 2c: Quick Acknowledgment — send immediate ack before heavy processing
    const quickAckMode = agenticProfile.quick_ack_mode || 'typing';
    if (quickAckMode !== 'off' && this.agentManager && context.accountId && conversation.external_id) {
      try {
        if (quickAckMode === 'message') {
          // Send a brief human-like ack message via DLQ
          const ackMsg = this._pickQuickAckMessage(agenticProfile, isMaster, masterFamiliarity);
          const { getDeliveryQueueService } = require('./deliveryQueueService.cjs');
          const dlq = getDeliveryQueueService();
          if (dlq) {
            await dlq.enqueue({
              accountId: context.accountId,
              recipient: conversation.external_id,
              platform: conversation.platform || 'whatsapp',
              content: ackMsg,
              source: 'quick_ack',
              conversationId: conversation.id,
              agentId: context.agentId,
              userId: conversation.user_id,
            });
            logger.info(`[Agentic] Quick ack sent: "${ackMsg}"`);
          }
        } else {
          // 'typing' mode (default) — send typing indicator only
          await this.agentManager.sendTyping(context.accountId, conversation.external_id, 5000);
        }
      } catch (ackErr) {
        logger.warn(`[Agentic] Quick ack failed (non-fatal): ${ackErr.message}`);
      }
    }

    // 3. Enrich message content (OCR, vision, links)
    const enrichedContent = await this.enrichMessageContent(message);

    // 4. Get conversation history and analyze task status
    const conversationHistory = this.getConversationHistory(conversation.id, 10);
    const historyPreview = conversationHistory
      .map(m => {
        const ts = m.timestamp ? new Date(m.timestamp).toLocaleTimeString('en-MY', { timeZone: 'Asia/Kuala_Lumpur', hour: '2-digit', minute: '2-digit' }) : '';
        const prefix = ts ? `[${ts}]` : '';
        if (m.role === 'assistant') {
          const truncated = (m.content || '').substring(0, 60);
          return `${prefix} [agent] ${truncated}${(m.content || '').length > 60 ? '...' : ''}`;
        }
        return `${prefix} [user] ${(m.content || '').substring(0, 150)}`;
      })
      .join('\n');

    // 4b. Analyze last task completion status (intent classification context)
    const lastTaskStatus = this.analyzeLastTaskStatus(conversationHistory, enrichedContent, message);
    logger.info(`[Agentic] Intent analysis: ${JSON.stringify(lastTaskStatus)}`);

    // 5. Build sender name
    const senderName = contact?.display_name
      || message.senderName || message.sender_name
      || message.senderId || message.sender_id
      || conversation.external_id || 'Unknown';

    const agentRow = db.prepare('SELECT name FROM agents WHERE id = ?').get(context.agentId);

    // 6. Call reasoning loop with incremental response callback
    logger.info(`[Agentic] Starting reasoning loop for "${agenticProfile.name}" - sender: ${senderName}, master: ${isMaster}`);

    // Incremental response: send each respond() message immediately to the user
    let intermediateResponsesSent = 0;
    const onIntermediateRespond = async (responseMessage) => {
      if (!this.agentManager || !context.accountId || !conversation.external_id) return;
      try {
        const shouldSend = this.checkAgenticAutoRespond(
          context.agentId, context.accountId, conversation.user_id, conversation.platform
        );
        if (!shouldSend) return;

        const cleanResponse = this.extractCleanResponse(responseMessage);
        if (!cleanResponse || cleanResponse.length < 2) return;

        // Save to messages DB + broadcast to frontend (matches auto-respond block)
        const outMsgId = uuidv4();
        const outNow = new Date().toISOString();
        const db = getDatabase();
        db.prepare(`
          INSERT INTO messages (id, conversation_id, direction, content_type, content, status, ai_generated, created_at)
          VALUES (?, ?, 'outgoing', 'text', ?, 'pending', 1, ?)
        `).run(outMsgId, conversation.id, cleanResponse, outNow);
        db.prepare(`
          UPDATE conversations SET last_message_at = ?, updated_at = datetime('now') WHERE id = ?
        `).run(outNow, conversation.id);

        if (this.broadcast) {
          this.broadcast('message:new', {
            message: this.transformMessageForClient({
              id: outMsgId,
              conversationId: conversation.id,
              direction: 'outgoing',
              contentType: 'text',
              content: cleanResponse,
              senderId: context.agentId,
              senderName: 'AI',
              platform: conversation.platform,
              createdAt: outNow,
              aiGenerated: true,
            }),
            conversation: this.transformConversationForClient(conversation),
          }, context.agentId);
        }

        await this.agentManager.sendTyping(context.accountId, conversation.external_id, 1000);
        const { getDeliveryQueueService } = require('./deliveryQueueService.cjs');
        const dlq = getDeliveryQueueService();
        await dlq.enqueue({
          accountId: context.accountId,
          recipient: conversation.external_id,
          platform: conversation.platform || 'whatsapp',
          content: cleanResponse,
          source: 'reasoning_loop',
          conversationId: conversation.id,
          messageId: outMsgId,
          agentId: context.agentId,
          userId: conversation.user_id,
        });
        intermediateResponsesSent++;
        logger.info(`[Agentic] Incremental response #${intermediateResponsesSent} saved (${outMsgId}) and queued via DLQ (${cleanResponse.length} chars)`);
      } catch (err) {
        logger.warn(`[Agentic] Failed to queue incremental response via DLQ: ${err.message}. Attempting direct send.`);
        try {
          const cleanResponse = this.extractCleanResponse(responseMessage);
          if (cleanResponse && cleanResponse.length >= 2) {
            await this.agentManager.sendMessage(context.accountId, conversation.external_id, cleanResponse);
            intermediateResponsesSent++;
          }
        } catch (directErr) {
          logger.error(`[Agentic] Direct send also failed: ${directErr.message}`);
        }
      }
    };

    // Resolve the actual local file path for media so Agentic AI knows where it is
    let mediaLocalPath = null;
    const rawMediaUrl = message.cachedMediaUrl || message.mediaUrl || message.media_url;
    if (rawMediaUrl) {
      if (rawMediaUrl.startsWith('/api/media/')) {
        const mediaId = rawMediaUrl.replace('/api/media/', '');
        try {
          const db = getDatabase();
          const cached = db.prepare('SELECT local_path FROM media_cache WHERE message_id = ? LIMIT 1').get(mediaId);
          if (cached?.local_path && require('fs').existsSync(cached.local_path)) {
            mediaLocalPath = cached.local_path;
          } else {
            // Fallback: scan media directory
            const mediaDir = require('path').join(__dirname, '..', 'data', 'media');
            const fs = require('fs');
            const files = fs.existsSync(mediaDir) ? fs.readdirSync(mediaDir).filter(f => f.startsWith(mediaId)) : [];
            if (files.length > 0) {
              mediaLocalPath = require('path').join(mediaDir, files[0]);
            }
          }
        } catch (e) {
          logger.debug(`[Agentic] Failed to resolve media path: ${e.message}`);
        }
      } else if (!rawMediaUrl.startsWith('http') && !rawMediaUrl.startsWith('data:')) {
        mediaLocalPath = rawMediaUrl;
      }
    }

    logger.info(`[Agentic] Sending to reasoning loop: sender=${senderName}, hasMedia=${!!(rawMediaUrl)}, mediaPath=${mediaLocalPath || 'none'}, contentType=${message.contentType || 'text'}, preview=${(enrichedContent || '').substring(0, 100)}...`);

    // === Phase 1a: Reasoning Loop Watchdog ===
    // Wraps loop.run() with timeout notifications and error safety net.
    // - Periodic typing indicators every 12s
    // - 60s: sends "Still working on this..." via DLQ
    // - 180s: sends "Taking longer than expected..." + logs for review
    // - On error: always sends a fallback error message (never silent drop)
    const watchdogTimers = [];
    let watchdogMessagesSent = 0;

    const sendWatchdogMessage = async (text, logLevel = 'info') => {
      try {
        if (!this.agentManager || !context.accountId || !conversation.external_id) return;
        const { getDeliveryQueueService } = require('./deliveryQueueService.cjs');
        const dlq = getDeliveryQueueService();
        await dlq.enqueue({
          accountId: context.accountId,
          recipient: conversation.external_id,
          platform: conversation.platform || 'whatsapp',
          content: text,
          source: 'watchdog',
          conversationId: conversation.id,
          agentId: context.agentId,
          userId: conversation.user_id,
        });
        watchdogMessagesSent++;
        logger[logLevel](`[Watchdog] Sent: "${text.substring(0, 80)}" (total: ${watchdogMessagesSent})`);
      } catch (err) {
        logger.error(`[Watchdog] DLQ failed: ${err.message}. Attempting direct send.`);
        // Phase 1b: Fall back to direct send if DLQ fails
        try {
          if (this.agentManager && context.accountId && conversation.external_id) {
            await this.agentManager.sendMessage(context.accountId, conversation.external_id, text);
            watchdogMessagesSent++;
          }
        } catch (_directErr) { /* truly nothing we can do */ }
      }
    };

    const sendTypingIndicator = async () => {
      try {
        if (this.agentManager && context.accountId && conversation.external_id) {
          await this.agentManager.sendTyping(context.accountId, conversation.external_id, 3000);
        }
      } catch (_) { /* non-critical */ }
    };

    // Start periodic typing indicator every 12s
    const typingInterval = setInterval(sendTypingIndicator, 12000);
    watchdogTimers.push(typingInterval);

    // Send initial typing indicator immediately
    sendTypingIndicator();

    // 60s warning
    const warn60s = setTimeout(() => {
      sendWatchdogMessage("Still working on this \u2014 I'm processing your request and will respond shortly. \u23f3");
    }, 60000);
    watchdogTimers.push(warn60s);

    // 180s warning + log for review
    const warn180s = setTimeout(() => {
      sendWatchdogMessage(
        "This is taking longer than expected. I'm still on it and will get back to you as soon as possible.",
        'warn'
      );
      logger.warn(`[Watchdog] Reasoning loop exceeded 180s for profile "${agenticProfile.name}" (agent: ${context.agentId}, conversation: ${conversation.id})`);
    }, 180000);
    watchdogTimers.push(warn180s);

    const clearWatchdog = () => {
      for (const timer of watchdogTimers) {
        clearTimeout(timer);
        clearInterval(timer);
      }
      watchdogTimers.length = 0;
    };

    let result;
    try {
      result = await loop.run(agenticProfile.id, 'event', {
        event: 'incoming_message',
        platform: message.platform || conversation.platform,
        sender: senderName,
        agentName: agentRow?.name || 'Unknown Agent',
        subject: message.subject || '',
        preview: enrichedContent,
        hasMedia: !!(rawMediaUrl),
        mediaLocalPath: mediaLocalPath || null,
        mediaApiUrl: rawMediaUrl && rawMediaUrl.startsWith('/api/media/') ? rawMediaUrl : null,
        contentType: message.contentType || message.content_type || 'text',
        isMaster,
        masterFamiliarity, // Phase 2b: interaction count and familiarity level
        quotedMessage: message.quotedMessage || null, // Reply/quoted message context from WhatsApp
        conversationHistory: historyPreview,
        lastTaskStatus,
        conversationId: conversation.id,
        accountId: context.accountId,
        externalId: conversation.external_id,
        _onIntermediateRespond: onIntermediateRespond,
      });
    } catch (loopError) {
      clearWatchdog();
      // Phase 1a: NEVER silently drop errors — send user-visible fallback.
      // ONLY send if ReasoningLoop didn't already send one (prevents triple error cascade).
      // ReasoningLoop.run() catch block sends its own message at line ~256, so we check
      // whether it already notified the user via _onIntermediateRespond.
      if (!loopError._userNotified) {
        await sendWatchdogMessage(
          "I ran into an issue while processing your message. Please try again, or contact support if this keeps happening."
        );
      }
      // Mark as user-notified so the outer agentic catch block (line ~320) won't send yet another message
      loopError._userNotified = true;
      try { logger.error(`[Watchdog] Reasoning loop threw error: ${loopError.message}`); } catch (_) {}
      throw loopError;
    }

    clearWatchdog();
    // === End Phase 1a Watchdog ===

    console.log(`[DEBUG] Reasoning loop completed: ${result.iterations} iters, ${result.actions?.length || 0} actions, intermediateResponses: ${intermediateResponsesSent}, watchdogMessages: ${watchdogMessagesSent}`);
    logger.info(`[Agentic] Reasoning loop completed: ${result.iterations} iterations, ${result.actions?.length || 0} actions, ${result.tokensUsed || 0} tokens, intermediateResponses: ${intermediateResponsesSent}, watchdogMessages: ${watchdogMessagesSent}`);

    // Track how many intermediate responses were sent
    result._intermediateResponsesSent = intermediateResponsesSent;

    // 7. Map result to SuperBrain-compatible format
    const mappedResult = this.mapReasoningResultToResponse(result);
    console.log(`[DEBUG] mapReasoningResult: type=${mappedResult.type}, hasResponse=${!!mappedResult.response}, provider=${mappedResult.provider || 'none'}`);
    return mappedResult;
  }

  /**
   * Anti-loop check for agentic processing.
   * Prevents processing messages sent by the agentic profile's own response agents.
   * @private
   */
  shouldIgnoreForAgentic(agenticProfile, message, context) {
    try {
      const db = getDatabase();
      const responseAgentIds = JSON.parse(agenticProfile.response_agent_ids || '[]');
      if (agenticProfile.agent_id) responseAgentIds.push(agenticProfile.agent_id);

      // Check if sender is a response agent's phone/email
      const senderPhone = (message.senderId || message.sender_id || message.from || '')
        .replace(/@(c\.us|lid|g\.us|s\.whatsapp\.net)$/i, '')
        .replace(/\D/g, '');

      for (const agentId of responseAgentIds) {
        const accounts = db.prepare(
          'SELECT connection_metadata FROM platform_accounts WHERE agent_id = ?'
        ).all(agentId);

        for (const acct of accounts) {
          try {
            const meta = JSON.parse(acct.connection_metadata || '{}');
            const phone = (meta.phone || meta.phoneNumber || '').replace(/\D/g, '');
            if (phone && senderPhone && phone === senderPhone) return true;
            if (meta.email && (message.from || '').toLowerCase() === meta.email.toLowerCase()) return true;
          } catch (e) { /* skip */ }
        }
      }

      return false;
    } catch (e) {
      logger.debug(`[Agentic] shouldIgnoreForAgentic error: ${e.message}`);
      return false;
    }
  }

  /**
   * Detect if the message sender is the agentic profile's master contact.
   * @private
   */
  detectMasterContact(agenticProfile, message, conversation, contact) {
    if (!agenticProfile.master_contact_id) return false;
    try {
      const db = getDatabase();
      const senderId = message.senderId || message.sender_id || message.from || conversation.external_id || '';
      const cleanSender = senderId.replace(/@(lid|c\.us|s\.whatsapp\.net|g\.us)$/i, '');

      const masterMatch = db.prepare(`
        SELECT 1 FROM contact_identifiers
        WHERE contact_id = ?
          AND (identifier_value = ? OR identifier_value = ? OR identifier_value = ?)
        LIMIT 1
      `).get(agenticProfile.master_contact_id, senderId, cleanSender, cleanSender + '@lid');

      return !!masterMatch;
    } catch (e) {
      logger.debug(`[Agentic] detectMasterContact error: ${e.message}`);
      return false;
    }
  }

  /**
   * Analyze conversation history to determine last task status and intent context.
   * Helps the reasoning loop understand: is this message a new intent or a follow-up?
   * @param {Array} conversationHistory - Recent messages
   * @param {string} newMessageContent - The new incoming message content
   * @param {object} newMessage - The new message object
   * @returns {{ previousTask: string, taskStatus: string, intentHint: string }}
   * @private
   */
  analyzeLastTaskStatus(conversationHistory, newMessageContent, newMessage) {
    if (!conversationHistory || conversationHistory.length < 2) {
      return { previousTask: 'none', taskStatus: 'none', intentHint: 'new_conversation' };
    }

    // Find the last user request (not the current one) and the agent's response
    // Messages are ordered oldest→newest. The newest user message is the current one.
    let lastUserQuery = null;
    let lastAgentResponse = null;
    let foundCurrentMsg = false;

    for (let i = conversationHistory.length - 1; i >= 0; i--) {
      const msg = conversationHistory[i];
      // Skip the most recent user message (that's the current incoming one)
      if (!foundCurrentMsg && msg.role === 'user') {
        foundCurrentMsg = true;
        continue;
      }
      if (foundCurrentMsg && msg.role === 'assistant' && !lastAgentResponse) {
        lastAgentResponse = (msg.content || '').substring(0, 200);
      }
      if (foundCurrentMsg && msg.role === 'user' && !lastUserQuery) {
        lastUserQuery = (msg.content || '').substring(0, 200);
      }
      if (lastUserQuery && lastAgentResponse) break;
    }

    // Determine task status
    let taskStatus = 'none';
    if (lastUserQuery && lastAgentResponse) {
      taskStatus = 'completed'; // Agent responded → previous task is done
    } else if (lastUserQuery && !lastAgentResponse) {
      taskStatus = 'pending'; // User asked but no agent response yet
    }

    // Determine intent hint
    const newContent = (newMessageContent || '').replace(/---\s*Enriched Data\s*---[\s\S]*/i, '').trim().toLowerCase();
    const isMedia = !!(newMessage?.mediaUrl || newMessage?.cachedMediaUrl || newMessage?.media_url);
    const isMediaOnly = isMedia && (!newContent || newContent.length < 5);
    const isAcknowledgement = /^(ok|okay|thanks|thank you|tq|terima kasih|noted|got it|alright|cool|👍|🙏)\s*[.!]?$/i.test(newContent);

    let intentHint;
    if (isMediaOnly) {
      intentHint = 'new_intent_media'; // Shared image/file = new topic
    } else if (isAcknowledgement) {
      intentHint = 'acknowledgement'; // User saying thanks = task closure
    } else if (lastUserQuery && newContent && this._hasTopicOverlap(lastUserQuery.toLowerCase(), newContent)) {
      intentHint = 'possible_followup'; // Content overlap = might be follow-up
    } else {
      intentHint = 'new_intent'; // Default to new intent
    }

    return {
      previousTask: lastUserQuery ? lastUserQuery.substring(0, 100) : 'none',
      taskStatus,
      intentHint,
    };
  }

  /**
   * Simple keyword overlap check between two strings.
   * Returns true if there's meaningful topic overlap.
   * @private
   */
  _hasTopicOverlap(text1, text2) {
    // Extract meaningful words (>3 chars, not common words)
    const stopWords = new Set(['the', 'this', 'that', 'what', 'from', 'with', 'have', 'been', 'your', 'will', 'can', 'are', 'was', 'for', 'and', 'not', 'you', 'all', 'any', 'her', 'his', 'its', 'let', 'may', 'our', 'too', 'use', 'yang', 'dan', 'ini', 'itu', 'ada', 'dia', 'apa', 'tak']);
    const getKeywords = (text) => {
      return text.split(/\s+/)
        .filter(w => w.length > 3 && !stopWords.has(w))
        .map(w => w.replace(/[^a-z0-9]/g, ''));
    };
    const kw1 = new Set(getKeywords(text1));
    const kw2 = getKeywords(text2);
    const overlap = kw2.filter(w => kw1.has(w));
    return overlap.length >= 2; // Need at least 2 keyword matches
  }

  /**
   * Enrich message content with OCR, vision analysis, and link previews.
   * @private
   */
  async enrichMessageContent(message) {
    let enrichedPreview = (message.content || message.text || '').substring(0, 500);
    const enrichments = [];

    // OCR / Image Analysis
    const mediaUrl = message.cachedMediaUrl || message.mediaUrl || message.media_url;
    const mimeType = message.mimeType || message.mime_type || '';
    logger.info(`[Enrich] mediaUrl: ${mediaUrl ? (mediaUrl.substring(0, 80) + '...') : 'none'}, mimeType: ${mimeType || 'none'}, contentType: ${message.contentType || 'none'}`);
    if (mediaUrl && (mimeType.startsWith('image/') || mimeType.startsWith('application/pdf'))) {
      try {
        const { visionService } = require('./vision/VisionAnalysisService.cjs');
        if (visionService && typeof visionService.extractTextFromUrl === 'function') {
          // Resolve the actual file path for OCR:
          // cachedMediaUrl is "/api/media/{id}" (API route, NOT a file path)
          // We need to find the actual file on disk or use the original data URL
          let ocrUrl = mediaUrl;
          if (mediaUrl.startsWith('/api/media/')) {
            // Look up actual file path from media_cache table
            const mediaId = mediaUrl.replace('/api/media/', '');
            try {
              const db = getDatabase();
              const cached = db.prepare('SELECT local_path FROM media_cache WHERE message_id = ? LIMIT 1').get(mediaId);
              if (cached?.local_path && require('fs').existsSync(cached.local_path)) {
                ocrUrl = cached.local_path;
                logger.info(`[Enrich] Resolved cached API URL to file: ${cached.local_path}`);
              } else {
                // Fallback: try to find file in media directory
                const mediaDir = require('path').join(__dirname, '..', 'data', 'media');
                const fs = require('fs');
                const files = fs.existsSync(mediaDir) ? fs.readdirSync(mediaDir).filter(f => f.startsWith(mediaId)) : [];
                if (files.length > 0) {
                  ocrUrl = require('path').join(mediaDir, files[0]);
                  logger.info(`[Enrich] Found media file by ID scan: ${ocrUrl}`);
                } else if (message.mediaUrl && message.mediaUrl.startsWith('data:')) {
                  // Last resort: use original base64 data URL
                  ocrUrl = message.mediaUrl;
                  logger.info(`[Enrich] Falling back to original base64 data URL for OCR`);
                }
              }
            } catch (dbErr) {
              logger.warn(`[Enrich] Failed to resolve media path: ${dbErr.message}`);
              // Fallback to original mediaUrl if available
              if (message.mediaUrl && message.mediaUrl !== mediaUrl) {
                ocrUrl = message.mediaUrl;
              }
            }
          }
          logger.info(`[Enrich] Starting OCR for ${mimeType} (url type: ${ocrUrl.startsWith('data:') ? 'base64' : ocrUrl.startsWith('/') ? 'file-path' : 'other'})`);
          const ocrResult = await visionService.extractTextFromUrl(ocrUrl, { timeout: 15000 });
          if (ocrResult?.text && ocrResult.text.trim().length > 5) {
            enrichments.push(`[OCR extracted text]: ${ocrResult.text.substring(0, 500)}`);
            logger.info(`[Enrich] OCR success: ${ocrResult.text.substring(0, 80)}... (confidence: ${ocrResult.confidence || 'N/A'})`);
          } else {
            logger.info(`[Enrich] OCR returned empty/short text: "${(ocrResult?.text || '').substring(0, 30)}"`);
          }
        } else {
          logger.warn(`[Enrich] Vision service not available or missing extractTextFromUrl`);
        }
      } catch (e) {
        logger.warn(`[Enrich] OCR enrichment failed: ${e.message}`);
      }
    } else if (mediaUrl && !mimeType) {
      logger.warn(`[Enrich] Media URL present but no mimeType — OCR skipped. ContentType: ${message.contentType}`);
    }

    // Link preview / URL extraction
    const content = message.content || message.text || '';
    const urlRegex = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;
    const urls = (content.match(urlRegex) || []).slice(0, 3);
    if (urls.length > 0) {
      enrichments.push(`[URLs found]: ${urls.join(', ')}`);
    }

    // Media info
    if (mediaUrl && mimeType) {
      enrichments.push(`[Media]: ${mimeType}`);
    }

    // Email-specific
    if ((message.platform === 'email') && message.html) {
      const textFromHtml = (message.html || '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 300);
      if (textFromHtml && textFromHtml.length > enrichedPreview.length) {
        enrichedPreview = textFromHtml;
      }
    }

    if (enrichments.length > 0) {
      enrichedPreview += '\n\n--- Enriched Data ---\n' + enrichments.join('\n');
    }

    return enrichedPreview;
  }

  /**
   * Phase 2c: Pick a quick acknowledgment message.
   * Uses personality-aware variants if available, otherwise defaults.
   * @private
   */
  _pickQuickAckMessage(agenticProfile, isMaster, masterFamiliarity = null) {
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

    // Phase 2b: Master-specific acks based on familiarity
    if (isMaster && masterFamiliarity) {
      const { level } = masterFamiliarity;
      if (level === 'new') {
        return pick(['Got it! I\'m on it.', 'Understood, working on that for you.', 'Received! Let me take care of that.']);
      }
      if (level === 'deep' || level === 'established') {
        return pick(['On it!', 'Got it.', 'Sure thing.', 'Working on it.']);
      }
    }

    // Default ack messages (casual, brief)
    const defaultAcks = [
      'Got it! Let me work on that.',
      'On it!',
      'Let me check that for you.',
      'Looking into it now.',
      'One moment, working on this.',
    ];

    // Try to get personality-aware ack from profile
    try {
      const PersonalityService = require('./agentic/PersonalityService.cjs');
      const ps = PersonalityService.getInstance?.();
      if (ps && agenticProfile.id) {
        const personality = ps.getPersonality?.(agenticProfile.id);
        if (personality?.tone) {
          const tone = personality.tone.toLowerCase();
          if (tone.includes('formal') || tone.includes('professional')) {
            return pick(['Acknowledged. Processing your request.', 'Understood. Let me look into this.', 'Received. Working on it now.']);
          }
          if (tone.includes('friendly') || tone.includes('casual') || tone.includes('warm')) {
            return pick(['Got it! Working on that now.', 'On it! Give me a sec.', 'Sure thing! Let me check.']);
          }
          if (tone.includes('concise') || tone.includes('minimal')) {
            return pick(['Got it.', 'On it.', 'Checking.']);
          }
        }
      }
    } catch (_) { /* PersonalityService not available, use defaults */ }

    return pick(defaultAcks);
  }

  /**
   * Extract clean text from a response that might contain raw JSON tool call.
   * Last-resort safety net before sending to messaging platforms.
   * @param {string} response - Response text to clean
   * @returns {string} Clean response text
   * @private
   */
  extractCleanResponse(response) {
    if (!response || typeof response !== 'string') return response;

    const trimmed = response.trim();

    // Check if the response looks like a JSON tool call
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const parsed = JSON.parse(trimmed);
        // Extract message from respond action
        if (parsed.action === 'respond' && parsed.params?.message) {
          logger.info('[Agentic] extractCleanResponse: Extracted message from raw JSON respond action');
          return parsed.params.message;
        }
        // Extract question from clarify action
        if (parsed.action === 'clarify' && parsed.params?.question) {
          logger.info('[Agentic] extractCleanResponse: Extracted question from raw JSON clarify action');
          return parsed.params.question;
        }
        // Other JSON with a message field
        if (parsed.message && typeof parsed.message === 'string') {
          logger.info('[Agentic] extractCleanResponse: Extracted message field from raw JSON');
          return parsed.message;
        }
      } catch (e) {
        // Not valid JSON, return as-is
      }
    }

    // Check if response contains embedded JSON (text + JSON)
    const jsonMatch = response.match(/\{"action"\s*:\s*"respond"\s*,\s*"params"\s*:\s*\{[^}]*"message"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (jsonMatch) {
      try {
        // Try to parse the full JSON to get the message properly
        const fullMatch = response.match(/\{"action"\s*:\s*"respond"\s*,\s*"params"\s*:\s*\{.*?\}\s*\}/s);
        if (fullMatch) {
          const parsed = JSON.parse(fullMatch[0]);
          if (parsed.params?.message) {
            logger.info('[Agentic] extractCleanResponse: Extracted message from embedded JSON');
            return parsed.params.message;
          }
        }
      } catch (e) {
        // Fallback: use regex capture group
        const unescaped = jsonMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n');
        logger.info('[Agentic] extractCleanResponse: Extracted message via regex from embedded JSON');
        return unescaped;
      }
    }

    return response;
  }

  /**
   * Map AgentReasoningLoop result to SuperBrain-compatible response format.
   * @private
   */
  mapReasoningResultToResponse(result) {
    console.log(`[DEBUG] mapReasoningResultToResponse: silent=${result.silent}, intermediateResponses=${result._intermediateResponsesSent}, actions=${(result.actions||[]).map(a=>a.tool+':'+a.status).join(',')}, finalThought=${result.finalThought ? result.finalThought.substring(0,60) : 'null'}`);
    // Silent flag
    if (result.silent) {
      return { type: 'silent', response: null };
    }

    // If intermediate responses were already sent, check if there's still a final
    // response that hasn't been sent yet (from a respond action without sentImmediately)
    if (result._intermediateResponsesSent > 0) {
      // Check if there's a FINAL respond that wasn't sent incrementally
      const unsentResponds = (result.actions || []).filter(
        a => a.tool === 'respond' && a.status === 'executed' && a.result?.message && !a.sentImmediately
      );
      if (unsentResponds.length > 0) {
        // There's a final unsent respond - send it
        const lastUnsent = unsentResponds[unsentResponds.length - 1];
        return {
          type: 'ai_response',
          response: lastUnsent.result.message,
          provider: 'agentic-reasoning',
          reasoningIterations: result.iterations,
        };
      }
      // All responds were sent incrementally — but check if budget was exhausted
      // before the AI could compose its final answer (the intermediate was just "Got it!")
      const budgetExhausted = result.finalThought && result.finalThought.includes('Tool budget exhausted');
      if (!budgetExhausted) {
        // Truly nothing more to send
        logger.info(`[Agentic] All ${result._intermediateResponsesSent} responses already sent incrementally, marking silent`);
        return { type: 'silent', response: null };
      }
      // Budget exhausted — fall through to finalThought / synthesis logic below
      logger.info(`[Agentic] Budget exhausted after intermediate response — falling through to synthesis`);
    }

    // Check if 'respond' tool was used - prefer the LAST respond action
    // (the first one might be planning/thinking, the last one is the actual response)
    const respondActions = (result.actions || []).filter(
      a => a.tool === 'respond' && a.status === 'executed' && a.result?.message
    );
    if (respondActions.length > 0) {
      // Use the last respond action (most likely the final user-facing message)
      const respondAction = respondActions[respondActions.length - 1];
      const message = respondAction.result.message;

      // Skip if the "respond" message is clearly internal planning, not a user-facing response
      // (contains tool names, describes what to do rather than doing it)
      const toolNames = ['listTeamMembers', 'searchWeb', 'ragQuery', 'delegateTask', 'scheduleTask', 'createTask', 'saveMemory', 'notifyMaster'];
      const mentionsTools = toolNames.filter(t => message.includes(t)).length;
      const looksLikePlanning = mentionsTools >= 2 || (
        message.includes('We need to') && message.includes('Then ') && mentionsTools >= 1
      );

      if (looksLikePlanning && result.finalThought && result.finalThought.length > 10) {
        // The respond was planning, not a real response - fall through to finalThought
        logger.info(`[Agentic] mapReasoningResult: Skipping respond action that looks like planning (mentions ${mentionsTools} tools). Using finalThought instead.`);
      } else {
        return {
          type: 'ai_response',
          response: message,
          provider: 'agentic-reasoning',
          reasoningIterations: result.iterations,
        };
      }
    }

    // Check if 'clarify' tool was used
    const clarifyAction = (result.actions || []).find(
      a => a.tool === 'clarify' && a.status === 'executed' && a.result?.question
    );
    if (clarifyAction) {
      return {
        type: 'ai_response',
        response: clarifyAction.result.question,
        provider: 'agentic-reasoning',
        reasoningIterations: result.iterations,
      };
    }

    // Check if messaging tools already sent the response directly
    const messagingTools = ['sendWhatsApp', 'sendTelegram', 'sendEmail', 'notifyMaster'];
    const usedMessaging = (result.actions || []).some(
      a => messagingTools.includes(a.tool) && a.status === 'executed'
    );
    if (usedMessaging) {
      console.log(`[DEBUG] mapReasoningResult: returning SILENT because messaging tool was used: ${(result.actions||[]).filter(a=>messagingTools.includes(a.tool)).map(a=>a.tool).join(',')}`);
      return { type: 'silent', response: null };
    }

    // Handle "Busy:" responses from concurrent lock wait timeout — always send to user
    if (result.finalThought && result.finalThought.startsWith('Busy:')) {
      return {
        type: 'ai_response',
        response: "I'm currently processing another request. I'll get to yours shortly — please give me a moment.",
        provider: 'agentic-reasoning-busy',
        reasoningIterations: 0,
      };
    }

    // Fallback: use finalThought as response
    // Note: "Plan completed:" and "Actions completed:" are status strings, not user responses.
    // With the synthesis step, these should rarely reach here. But if they do, fall through
    // to the last-resort action-based synthesis below rather than sending the raw status string.
    if (result.finalThought && result.finalThought.length > 5
      && !result.finalThought.startsWith('Error:')
      && !result.finalThought.startsWith('Skipped:')
      && !result.finalThought.startsWith('Plan completed:')
      && !result.finalThought.startsWith('Actions completed:')
      && !result.finalThought.startsWith('Execution timed out')) {
      let responseText = result.finalThought;

      // Safety net: reject finalThought that looks like raw error/debug output
      if (this._isRawErrorOutput(responseText)) {
        logger.warn(`[Agentic] mapReasoningResult: finalThought contains raw error output, suppressing (${responseText.substring(0, 150)}...)`);
        // Fall through to synthesized response or no_action
      } else {
        // Safety net: if finalThought is unparsed JSON tool call, extract the message
        const trimmed = responseText.trim();
        if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
          try {
            const parsed = JSON.parse(trimmed);
            if (parsed.action === 'respond' && parsed.params?.message) {
              responseText = parsed.params.message;
            } else if (parsed.action === 'clarify' && parsed.params?.question) {
              responseText = parsed.params.question;
            }
          } catch (e) { /* not JSON, use as-is */ }
        }

        return {
          type: 'ai_response',
          response: responseText,
          provider: 'agentic-reasoning',
          reasoningIterations: result.iterations,
        };
      }
    }

    // Last resort: if AI executed tools but never called respond, synthesize a brief response
    const executedActions = (result.actions || []).filter(a => a.status === 'executed');
    if (executedActions.length > 0) {
      // Try to extract meaningful result from executeOnLocalAgent actions
      const localAgentResults = executedActions.filter(a => a.tool === 'executeOnLocalAgent' && a.result);
      const lastLocalResult = localAgentResults.length > 0 ? localAgentResults[localAgentResults.length - 1] : null;

      // If we have a local agent result with actual output, include it
      if (lastLocalResult?.result?.output || lastLocalResult?.result?.result) {
        const output = (lastLocalResult.result.output || lastLocalResult.result.result || '').toString().substring(0, 500);
        if (output.length > 10) {
          const summary = `I've completed the task on your local agent. Here's the result:\n\n${output}`;
          console.log(`[DEBUG] mapReasoningResult: Using local agent result for synthesis`);
          return {
            type: 'ai_response',
            response: summary,
            provider: 'agentic-reasoning',
            reasoningIterations: result.iterations,
          };
        }
      }

      const actionDescriptions = executedActions.map(a => {
        if (a.tool === 'handoffToAgent' || a.tool === 'delegateTask') return 'delegated the task';
        if (a.tool === 'createTask') return 'created a follow-up task';
        if (a.tool === 'searchWeb') return 'searched the web';
        if (a.tool === 'ragQuery') return 'searched knowledge base';
        if (a.tool === 'orchestrate') return 'coordinated specialist agents';
        if (a.tool === 'listTeamMembers') return 'checked team availability';
        if (a.tool === 'saveMemory') return 'saved notes';
        if (a.tool === 'createSchedule') return 'set a schedule';
        if (a.tool === 'executeOnLocalAgent') return 'worked with your local agent';
        if (a.tool === 'searchMessages') return 'searched message history';
        if (a.tool === 'searchContacts') return 'searched contacts';
        return null;
      }).filter(Boolean);

      if (actionDescriptions.length > 0) {
        const uniqueActions = [...new Set(actionDescriptions)];
        // If it was a plan, say "completed" instead of the vague "will follow up"
        const isPlan = result.planId || result.finalThought?.startsWith('Plan completed:');
        const summary = isPlan
          ? `I've ${uniqueActions.join(' and ')} to handle your request. The task has been completed.`
          : `I've ${uniqueActions.join(', ')}. I'll follow up with results shortly.`;
        logger.info(`[Agentic] mapReasoningResult: Synthesized response from ${executedActions.length} executed actions`);
        return {
          type: 'ai_response',
          response: summary,
          provider: 'agentic-reasoning',
          reasoningIterations: result.iterations,
        };
      }
    }

    // If all providers failed and we have no useful response, send a friendly error
    if (result.finalThought && this._isRawErrorOutput(result.finalThought)) {
      return {
        type: 'ai_response',
        response: "I'm experiencing some technical difficulties right now. Please try again in a moment.",
        provider: 'agentic-reasoning-fallback',
        reasoningIterations: result.iterations,
      };
    }

    // No response to send
    return { type: 'no_action', response: null };
  }

  /**
   * Check if text looks like raw error output that should NOT be sent to users.
   * @private
   */
  _isRawErrorOutput(text) {
    if (!text || text.length < 10) return false;

    const ERROR_PATTERNS = [
      /Insufficient credits/i,
      /statusCode["']?\s*:\s*[45]\d{2}/i,
      /"error"\s*:\s*[{\['"]/i,
      /openrouter\.ai\/settings/i,
      /Performing one time database migration/i,
      /rate_limit_exceeded/i,
      /EACCES:\s*permission denied/i,
      /at\s+\w+\s+\(.*\.(?:js|cjs|mjs|ts):\d+:\d+\)/i,
      /UnhandledPromiseRejection/i,
      /Error:\s*connect\s+ECONNREFUSED/i,
      /OPENROUTER PROCESSING/i,
      /\bsocket hang up\b/i,
      /credits exhausted/i,
      /All providers failed/i,
      /Tool call limit reached/i,
    ];

    for (const pattern of ERROR_PATTERNS) {
      if (pattern.test(text)) return true;
    }

    return false;
  }

  /**
   * Check if the sender of a message is within the agentic profile's contact scope.
   * Supports per-platform scope overrides, group whitelisting, and mention detection.
   * Returns { allowed: boolean, reason: string, agenticProfile: object|null, silent?: boolean }
   * @private
   */
  async checkSenderScopeForAutoRespond(agentId, conversation, contact, context) {
    try {
      const db = getDatabase();

      // Find the agentic profile monitoring this agent
      const agenticProfile = this.findAgenticProfileForAgent(agentId, conversation.user_id);
      if (!agenticProfile) {
        // No agentic profile found - allow by default (non-agentic agent)
        return { allowed: true, reason: 'No agentic profile' };
      }

      // --- Per-platform scope lookup (cascade: per-account → global fallback) ---
      const platformAccountId = context.accountId || null;
      let scope = null;
      if (platformAccountId) {
        scope = db.prepare(`
          SELECT * FROM agentic_contact_scope
          WHERE agentic_id = ? AND platform_account_id = ?
        `).get(agenticProfile.id, platformAccountId);
      }
      if (!scope) {
        // Fallback to global scope (platform_account_id IS NULL)
        scope = db.prepare(`
          SELECT * FROM agentic_contact_scope
          WHERE agentic_id = ? AND platform_account_id IS NULL
        `).get(agenticProfile.id);
      }

      // If no scope configured, default behavior: allow all (to not break existing setups)
      if (!scope) {
        return { allowed: true, reason: 'No contact scope configured', agenticProfile };
      }

      const scopeType = scope.scope_type || 'team_only';

      // Unrestricted scope - allow everyone
      if (scopeType === 'unrestricted') {
        return { allowed: true, reason: 'Unrestricted scope', agenticProfile };
      }

      // --- Resolve sender phone ---
      // For group messages, external_id is the group JID — resolve sender from contact_identifiers
      // For DMs, strip WhatsApp/Telegram suffixes from external_id
      let senderPhone = null;
      const isGroup = !!conversation.is_group;

      if (isGroup && contact?.id) {
        // Group message: get sender's phone from their contact record
        const senderIdentifier = db.prepare(`
          SELECT identifier_value FROM contact_identifiers
          WHERE contact_id = ? AND identifier_type IN ('phone', 'whatsapp')
          LIMIT 1
        `).get(contact.id);
        senderPhone = senderIdentifier
          ? senderIdentifier.identifier_value.replace(/\D/g, '')
          : null;
      }

      if (!senderPhone) {
        // DM or group fallback: use context.senderPhone or strip from external_id
        senderPhone = context.senderPhone
          || (conversation.external_id
            ? conversation.external_id.replace(/@(c\.us|lid|g\.us|s\.whatsapp\.net)$/i, '')
            : null);
      }

      // --- Group-specific scope checks (Feature 3) ---
      if (isGroup) {
        const whitelistGroupIds = JSON.parse(scope.whitelist_group_ids || '[]');
        const groupId = conversation.id || conversation.external_id;

        // Check if group is whitelisted (by conversation ID or external_id)
        const isGroupWhitelisted = whitelistGroupIds.includes(conversation.id)
          || whitelistGroupIds.includes(conversation.external_id)
          || whitelistGroupIds.includes(groupId);

        if (!isGroupWhitelisted) {
          // Group not whitelisted → silently skip (no approval notification)
          return { allowed: false, reason: 'Group not whitelisted', agenticProfile, silent: true };
        }

        // Group is whitelisted — check if agent name is mentioned in the message
        const messageText = context.messageText || '';
        const agentName = agenticProfile.name || '';
        if (agentName && messageText) {
          const mentionRegex = new RegExp(`\\b${agentName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
          if (!mentionRegex.test(messageText)) {
            // Agent not mentioned → silently skip
            return { allowed: false, reason: 'Agent not mentioned in group message', agenticProfile, silent: true };
          }
        } else if (!messageText) {
          // No message text available — silently skip to be safe
          return { allowed: false, reason: 'No message text for mention check', agenticProfile, silent: true };
        }

        // Agent mentioned in whitelisted group → allow
        return { allowed: true, reason: 'Mentioned in whitelisted group', agenticProfile };
      }

      // --- DM scope checks (existing logic with fixes) ---

      if (!senderPhone) {
        return { allowed: false, reason: 'Cannot identify sender', agenticProfile };
      }

      // Check 1: Is sender the master contact?
      if (scope.allow_master_contact === 1 && agenticProfile.master_contact_id) {
        const masterIdentifiers = db.prepare(`
          SELECT identifier_value FROM contact_identifiers
          WHERE contact_id = ? AND identifier_type IN ('phone', 'whatsapp')
        `).all(agenticProfile.master_contact_id);

        for (const mi of masterIdentifiers) {
          const cleanMasterPhone = mi.identifier_value.replace(/\D/g, '');
          if (senderPhone === cleanMasterPhone) {
            return { allowed: true, reason: 'Master contact', agenticProfile };
          }
        }
      }

      // Check 2: Is sender a team member?
      if (scope.allow_team_members === 1) {
        const senderTeamContact = db.prepare(`
          SELECT c.id FROM contacts c
          JOIN contact_identifiers ci ON c.id = ci.contact_id
          WHERE ci.identifier_value LIKE ? AND c.user_id = ?
          LIMIT 1
        `).get(`%${senderPhone}%`, conversation.user_id);

        if (senderTeamContact) {
          const isTeamMember = db.prepare(`
            SELECT 1 FROM agentic_team_members
            WHERE agentic_id = ? AND contact_id = ? AND is_active = 1
          `).get(agenticProfile.id, senderTeamContact.id);

          if (isTeamMember) {
            return { allowed: true, reason: 'Team member', agenticProfile };
          }
        }
      }

      // Check 3: Scope-type specific checks
      const senderContact = contact?.id ? contact : db.prepare(`
        SELECT c.* FROM contacts c
        JOIN contact_identifiers ci ON c.id = ci.contact_id
        WHERE ci.identifier_value LIKE ? AND c.user_id = ?
        LIMIT 1
      `).get(`%${senderPhone}%`, conversation.user_id);

      if (scopeType === 'all_user_contacts' && senderContact) {
        return { allowed: true, reason: 'User contact', agenticProfile };
      }

      if (scopeType === 'contacts_whitelist' && senderContact) {
        const whitelistIds = JSON.parse(scope.whitelist_contact_ids || '[]');
        if (whitelistIds.includes(senderContact.id)) {
          return { allowed: true, reason: 'Whitelisted contact', agenticProfile };
        }
      }

      if (scopeType === 'contacts_tags' && senderContact) {
        const allowedTags = JSON.parse(scope.whitelist_tags || '[]');
        const contactTags = JSON.parse(senderContact.tags || '[]');
        if (contactTags.some(tag => allowedTags.includes(tag))) {
          return { allowed: true, reason: 'Contact has allowed tag', agenticProfile };
        }
      }

      // Check if there's already a pending approval for this sender
      const existingApproval = db.prepare(`
        SELECT id, status FROM agentic_approval_queue
        WHERE agentic_id = ? AND action_type = 'send_message'
          AND status = 'pending'
          AND json_extract(action_payload, '$.senderPhone') = ?
        ORDER BY created_at DESC LIMIT 1
      `).get(agenticProfile.id, senderPhone);

      if (existingApproval) {
        return {
          allowed: false,
          reason: 'Approval already pending for this sender',
          agenticProfile,
          existingApprovalId: existingApproval.id
        };
      }

      // Out of scope
      return {
        allowed: false,
        reason: `Contact not in scope (${scopeType})`,
        agenticProfile,
        senderPhone,
        senderContactId: senderContact?.id || null
      };

    } catch (e) {
      logger.warn(`[Agentic] checkSenderScope error: ${e.message}`);
      // On error, allow to not block messages
      return { allowed: true, reason: `Scope check error: ${e.message}` };
    }
  }

  /**
   * Handle an out-of-scope message: send "waiting" to sender, create approval, notify master.
   * @private
   */
  async handleOutOfScopeMessage(agenticProfile, conversation, contact, context, aiResponse, reason) {
    try {
      const db = getDatabase();
      const senderExternalId = conversation.external_id;
      const senderPhone = senderExternalId
        ? senderExternalId.replace(/@(c\.us|lid|g\.us|s\.whatsapp\.net)$/i, '')
        : 'unknown';
      const senderName = contact?.display_name || conversation.title || senderPhone;

      // 1. Send "waiting for permission" message to the sender
      const waitingMsg = `Hi ${senderName}, thank you for your message. I need to check with my supervisor before I can respond to you. Please wait a moment while I get approval.`;
      await this.agentManager.sendTyping(context.accountId, senderExternalId, 1000);
      await this.agentManager.sendMessage(context.accountId, senderExternalId, waitingMsg);
      logger.info(`[Agentic] Sent "waiting for permission" to ${senderPhone}`);

      // 2. Try to get sender's profile picture (WhatsApp)
      let profilePicUrl = null;
      try {
        const { AgentManager } = require('../agents/agentManager.cjs');
        const agentManager = AgentManager.getInstance();
        const client = agentManager.clients?.get(context.accountId);
        if (client && client.client && client.client.getProfilePicUrl) {
          profilePicUrl = await client.client.getProfilePicUrl(senderExternalId);
        }
      } catch (picErr) {
        logger.debug(`[Agentic] Could not get profile pic: ${picErr.message}`);
      }

      // 3. Create approval request
      const { getApprovalService } = require('./agentic/ApprovalService.cjs');
      const approvalService = getApprovalService();

      const approval = approvalService.createApproval(agenticProfile.id, agenticProfile.user_id, {
        actionType: 'send_message',
        actionTitle: `Respond to ${senderName}`,
        actionDescription: `Someone outside your contact scope is trying to reach me. They sent a message and I have a response ready.\n\nSender: ${senderName}\nPhone: ${senderPhone}\nPlatform: ${conversation.platform}\n${profilePicUrl ? `Profile Picture: ${profilePicUrl}` : ''}`,
        payload: {
          response: aiResponse,
          recipientChatId: senderExternalId,
          accountId: context.accountId,
          platformAccountId: context.accountId || null,
          senderPhone,
          senderName,
          senderContactId: contact?.id || null,
          profilePicUrl,
          conversationId: conversation.id,
          platform: conversation.platform,
        },
        triggeredBy: 'message',
        triggerContext: {
          messageFrom: senderPhone,
          senderName,
          platform: conversation.platform,
          reason,
        },
        confidenceScore: 0.9,
        reasoning: `Sender ${senderName} (${senderPhone}) is not in the configured contact scope. Requesting master approval to respond.`,
        priority: 'high',
      });

      logger.info(`[Agentic] Created approval ${approval.id} for out-of-scope sender ${senderPhone}`);

      // 3b. Send master notification directly via agentManager
      // (ApprovalService.notifyMaster may fail if WhatsAppManager isn't available)
      try {
        if (agenticProfile.master_contact_id && this.agentManager) {
          // Find master's phone number
          const masterIdentifiers = db.prepare(`
            SELECT identifier_value FROM contact_identifiers
            WHERE contact_id = ? AND identifier_type IN ('phone', 'whatsapp')
            LIMIT 1
          `).all(agenticProfile.master_contact_id);

          const masterContact = db.prepare(`
            SELECT display_name FROM contacts WHERE id = ?
          `).get(agenticProfile.master_contact_id);

          if (masterIdentifiers.length > 0) {
            const masterPhone = masterIdentifiers[0].identifier_value.replace(/\D/g, '');
            // Find a WhatsApp account to send from
            const responseAgentIds = JSON.parse(agenticProfile.response_agent_ids || '[]');
            let waAccountId = null;
            for (const agId of [...responseAgentIds, agenticProfile.agent_id].filter(Boolean)) {
              const wa = db.prepare(`
                SELECT id FROM platform_accounts
                WHERE agent_id = ? AND platform = 'whatsapp' AND status = 'connected' LIMIT 1
              `).get(agId);
              if (wa) { waAccountId = wa.id; break; }
            }

            if (waAccountId) {
              const masterChatId = masterPhone.includes('@') ? masterPhone : `${masterPhone}@c.us`;

              // Build notification message with sender details
              let notifLines = [
                `*New Contact Request*`,
                ``,
                `Someone outside your contact scope is trying to reach me:`,
                ``,
                `Name: ${senderName}`,
                `Phone: ${senderPhone}`,
                `Platform: ${conversation.platform}`,
              ];
              if (profilePicUrl) {
                notifLines.push(`Profile Pic: ${profilePicUrl}`);
              }
              notifLines.push(``);
              notifLines.push(`Their message has been processed and I have a response ready.`);
              notifLines.push(``);
              notifLines.push(`Reply *"ok"* or *"approve"* to allow me to respond.`);
              notifLines.push(`Reply *"reject"* to decline.`);
              notifLines.push(``);
              notifLines.push(`Approval ID: ${approval.id.substring(0, 8)}`);

              await this.agentManager.sendTyping(waAccountId, masterChatId, 500);
              await this.agentManager.sendMessage(waAccountId, masterChatId, notifLines.join('\n'));
              logger.info(`[Agentic] Master notification sent to ${masterPhone} about ${senderPhone}`);
            }
          }
        }
      } catch (notifErr) {
        logger.warn(`[Agentic] Direct master notification failed: ${notifErr.message}`);
      }

      // 4. Log to scope log
      try {
        db.prepare(`
          INSERT INTO agentic_scope_log (id, agentic_id, user_id, action_type,
            recipient_type, recipient_value, recipient_contact_id, recipient_name,
            message_preview, status, approval_id, reason_blocked, created_at)
          VALUES (?, ?, ?, 'send_message', ?, ?, ?, ?, ?, 'pending', ?, ?, datetime('now'))
        `).run(
          require('uuid').v4(),
          agenticProfile.id,
          agenticProfile.user_id,
          conversation.platform,
          senderPhone,
          contact?.id || null,
          senderName,
          (aiResponse || '').substring(0, 200),
          approval.id,
          reason
        );
      } catch (logErr) {
        logger.debug(`[Agentic] Scope log insert failed: ${logErr.message}`);
      }

    } catch (err) {
      logger.error(`[Agentic] handleOutOfScopeMessage failed: ${err.message}`);
    }
  }

  /**
   * Check if an incoming message is a master approval reply (e.g., "approve", "ok", "allow", "reject").
   * If so, process the approval and execute the stored action.
   * @private
   */
  async checkForApprovalReply(message, conversation, contact, context) {
    try {
      const content = (message.content || message.text || '').trim().toLowerCase();

      // Quick check: only process short messages that look like approval commands
      if (!content || content.length > 100) return { handled: false };

      const approvePattern = /^(approve|yes|ok|allow|confirm|go ahead|proceed)(?:\s+#?([a-f0-9-]+))?$/i;
      const rejectPattern = /^(reject|no|deny|decline|block)(?:\s+#?([a-f0-9-]+))?(?:\s+(.+))?$/i;

      if (!approvePattern.test(content) && !rejectPattern.test(content)) {
        return { handled: false };
      }

      const db = getDatabase();
      const senderExternalId = conversation.external_id;
      const senderPhone = senderExternalId
        ? senderExternalId.replace(/@(c\.us|lid|g\.us|s\.whatsapp\.net)$/i, '')
        : null;

      if (!senderPhone) return { handled: false };

      // Check if this sender is a master contact for any agentic profile
      const masterProfiles = db.prepare(`
        SELECT ap.id as agentic_id, ap.user_id, ap.master_contact_id
        FROM agentic_profiles ap
        JOIN contact_identifiers ci ON ci.contact_id = ap.master_contact_id
        WHERE ci.identifier_value LIKE ?
          AND ci.identifier_type IN ('phone', 'whatsapp')
          AND ap.user_id = ?
      `).all(`%${senderPhone}%`, conversation.user_id);

      if (masterProfiles.length === 0) return { handled: false };

      // Find pending approvals for these agentic profiles
      const agenticIds = masterProfiles.map(p => p.agentic_id);
      const placeholders = agenticIds.map(() => '?').join(',');

      const approveMatch = content.match(approvePattern);
      const rejectMatch = content.match(rejectPattern);
      const specificId = approveMatch?.[2] || rejectMatch?.[2];

      let pendingApproval;
      if (specificId) {
        pendingApproval = db.prepare(`
          SELECT * FROM agentic_approval_queue
          WHERE (id = ? OR id LIKE ?)
            AND agentic_id IN (${placeholders})
            AND status = 'pending'
          LIMIT 1
        `).get(specificId, `${specificId}%`, ...agenticIds);
      } else {
        pendingApproval = db.prepare(`
          SELECT * FROM agentic_approval_queue
          WHERE agentic_id IN (${placeholders})
            AND status = 'pending'
            AND action_type = 'send_message'
          ORDER BY created_at DESC
          LIMIT 1
        `).get(...agenticIds);
      }

      if (!pendingApproval) return { handled: false };

      const { getApprovalService } = require('./agentic/ApprovalService.cjs');
      const approvalService = getApprovalService();
      const userId = pendingApproval.user_id;

      if (approveMatch) {
        // Approve the action
        const approved = approvalService.approveAction(pendingApproval.id, userId, 'Approved via chat reply');
        logger.info(`[Agentic] Approval ${pendingApproval.id} approved by master via chat`);

        // Execute the stored action: send the original response
        const payload = JSON.parse(pendingApproval.action_payload || '{}');
        if (payload.response && payload.recipientChatId && payload.accountId && this.agentManager) {
          try {
            await this.agentManager.sendTyping(payload.accountId, payload.recipientChatId, 1500);
            await this.agentManager.sendMessage(payload.accountId, payload.recipientChatId, payload.response);
            logger.info(`[Agentic] Sent approved response to ${payload.senderName || payload.senderPhone}`);

            // Auto-add to whitelist if configured (per-platform cascade)
            const scopePlatformId = payload.platformAccountId || null;
            let scope = null;
            if (scopePlatformId) {
              scope = db.prepare(`
                SELECT auto_add_approved, whitelist_contact_ids FROM agentic_contact_scope
                WHERE agentic_id = ? AND platform_account_id = ?
              `).get(pendingApproval.agentic_id, scopePlatformId);
            }
            if (!scope) {
              scope = db.prepare(`
                SELECT auto_add_approved, whitelist_contact_ids FROM agentic_contact_scope
                WHERE agentic_id = ? AND platform_account_id IS NULL
              `).get(pendingApproval.agentic_id);
            }

            if (scope?.auto_add_approved === 1 && payload.senderContactId) {
              const currentWhitelist = JSON.parse(scope.whitelist_contact_ids || '[]');
              if (!currentWhitelist.includes(payload.senderContactId)) {
                currentWhitelist.push(payload.senderContactId);
                // Update the specific scope row that was matched
                if (scopePlatformId && db.prepare('SELECT 1 FROM agentic_contact_scope WHERE agentic_id = ? AND platform_account_id = ?').get(pendingApproval.agentic_id, scopePlatformId)) {
                  db.prepare(`
                    UPDATE agentic_contact_scope SET whitelist_contact_ids = ?, updated_at = datetime('now')
                    WHERE agentic_id = ? AND platform_account_id = ?
                  `).run(JSON.stringify(currentWhitelist), pendingApproval.agentic_id, scopePlatformId);
                } else {
                  db.prepare(`
                    UPDATE agentic_contact_scope SET whitelist_contact_ids = ?, updated_at = datetime('now')
                    WHERE agentic_id = ? AND platform_account_id IS NULL
                  `).run(JSON.stringify(currentWhitelist), pendingApproval.agentic_id);
                }
                logger.info(`[Agentic] Auto-added ${payload.senderContactId} to whitelist`);
              }
            }
          } catch (sendErr) {
            logger.error(`[Agentic] Failed to send approved response: ${sendErr.message}`);
          }
        }

        // Confirm to master
        await this.agentManager.sendMessage(
          context.accountId,
          senderExternalId,
          `Approved. I've sent my response to ${payload.senderName || payload.senderPhone}.`
        );

        return { handled: true, action: 'approved', approvalId: pendingApproval.id };

      } else if (rejectMatch) {
        // Reject the action
        const rejectReason = rejectMatch[3] || 'Rejected via chat reply';
        approvalService.rejectAction(pendingApproval.id, userId, rejectReason);
        logger.info(`[Agentic] Approval ${pendingApproval.id} rejected by master via chat`);

        // Notify sender that request was denied
        const payload = JSON.parse(pendingApproval.action_payload || '{}');
        if (payload.recipientChatId && payload.accountId && this.agentManager) {
          try {
            await this.agentManager.sendMessage(
              payload.accountId,
              payload.recipientChatId,
              `I'm sorry, but I'm not able to assist you at this time. My supervisor has not authorized me to respond to your message.`
            );
          } catch (sendErr) {
            logger.debug(`[Agentic] Could not notify rejected sender: ${sendErr.message}`);
          }
        }

        // Confirm to master
        await this.agentManager.sendMessage(
          context.accountId,
          senderExternalId,
          `Rejected. I've informed ${payload.senderName || payload.senderPhone} that I cannot assist them.`
        );

        return { handled: true, action: 'rejected', approvalId: pendingApproval.id };
      }

      return { handled: false };
    } catch (err) {
      logger.debug(`[Agentic] checkForApprovalReply error: ${err.message}`);
      return { handled: false };
    }
  }

  /**
   * Check if an incoming message is a response to a blocked plan task (human-in-loop).
   * Matches by awaiting_from_contact_id and keyword overlap.
   * If matched: stores response, saves memory, resumes plan via reasoning loop.
   * @private
   */
  async checkForTaskResponse(message, conversation, contact, context) {
    try {
      const content = (message.content || message.text || '').trim();
      if (!content || content.length < 2) return { handled: false };

      const db = getDatabase();

      // Resolve sender contact ID
      const senderContactId = contact?.id;
      if (!senderContactId) return { handled: false };

      // Find blocked tasks awaiting response from this contact
      let pendingTasks = [];
      try {
        pendingTasks = db.prepare(`
          SELECT t.id, t.title, t.agentic_id, t.user_id, t.parent_task_id,
                 t.awaiting_response_message, t.awaiting_from_contact_id,
                 t.original_requester_conversation_id, t.original_requester_account_id,
                 t.plan_item_type, t.plan_order
          FROM agentic_tasks t
          WHERE t.awaiting_from_contact_id = ?
            AND t.status = 'blocked'
            AND t.plan_item_type = 'human_input'
            AND t.user_id = ?
          ORDER BY t.updated_at DESC
          LIMIT 5
        `).all(senderContactId, conversation.user_id);
      } catch (e) {
        // Table might not have the new columns yet - log warning once
        if (!this._planMigrationWarned) {
          logger.warn(`[Agentic] checkForTaskResponse query failed: ${e.message}. Run: node server/scripts/migrate-plan-driven-tasks.cjs`);
          this._planMigrationWarned = true;
        }
        return { handled: false };
      }

      if (pendingTasks.length === 0) {
        // Also check if sender is a master contact for any agentic profile with pending tasks
        try {
          const masterTasks = db.prepare(`
            SELECT t.id, t.title, t.agentic_id, t.user_id, t.parent_task_id,
                   t.awaiting_response_message, t.awaiting_from_contact_id,
                   t.original_requester_conversation_id, t.original_requester_account_id,
                   t.plan_item_type, t.plan_order
            FROM agentic_tasks t
            JOIN agentic_profiles ap ON ap.id = t.agentic_id AND ap.master_contact_id = ?
            WHERE t.status = 'blocked'
              AND t.plan_item_type = 'human_input'
              AND t.user_id = ?
            ORDER BY t.updated_at DESC
            LIMIT 5
          `).all(senderContactId, conversation.user_id);
          pendingTasks = masterTasks;
        } catch (e) {
          return { handled: false };
        }
      }

      if (pendingTasks.length === 0) return { handled: false };

      // Match: if only one pending task, use it. If multiple, use keyword overlap.
      let matchedTask = pendingTasks[0]; // default to most recent
      if (pendingTasks.length > 1) {
        const contentWords = content.toLowerCase().split(/\s+/);
        let bestScore = 0;
        for (const task of pendingTasks) {
          const questionWords = (task.awaiting_response_message || task.title || '').toLowerCase().split(/\s+/);
          const overlap = contentWords.filter(w => w.length > 2 && questionWords.includes(w)).length;
          if (overlap > bestScore) {
            bestScore = overlap;
            matchedTask = task;
          }
        }
      }

      logger.info(`[Agentic] Task response matched: task="${matchedTask.title}" (${matchedTask.id}) from contact ${senderContactId}`);

      // 1. Atomically update task: set response_received, change status to in_progress
      //    WHERE status = 'blocked' prevents race condition if multiple messages arrive simultaneously
      const updateResult = db.prepare(`
        UPDATE agentic_tasks SET
          response_received = ?,
          response_received_at = datetime('now'),
          status = 'in_progress',
          updated_at = datetime('now')
        WHERE id = ? AND status = 'blocked'
      `).run(content, matchedTask.id);

      if (updateResult.changes === 0) {
        // Task was already processed by a concurrent message
        logger.info(`[Agentic] Task ${matchedTask.id} already processed (race condition avoided)`);
        return { handled: false };
      }

      // 2. Save response to memory
      try {
        const { getAgenticMemoryService } = require('./agentic/AgenticMemoryService.cjs');
        const memService = getAgenticMemoryService();
        if (memService && memService.createMemory) {
          const contactName = contact?.display_name || senderContactId;
          await memService.createMemory({
            agenticId: matchedTask.agentic_id,
            userId: matchedTask.user_id,
            content: `Response from ${contactName} for task "${matchedTask.title}": ${content.substring(0, 500)}`,
            memoryType: 'task_response',
            tags: ['task_response', 'human_input'],
            importanceScore: 7,
          });
        }
      } catch (e) {
        logger.debug(`[Agentic] Could not save task response to memory: ${e.message}`);
      }

      // 3. Trigger reasoning loop to resume the plan
      try {
        const { getAgentReasoningLoop } = require('./agentic/AgentReasoningLoop.cjs');
        const loop = getAgentReasoningLoop();

        const contactName = contact?.display_name || senderContactId;

        // Build trigger context for plan continuation
        const resumeContext = {
          event: 'task_response_received',
          taskId: matchedTask.id,
          taskTitle: matchedTask.title,
          planId: matchedTask.parent_task_id,
          question: matchedTask.awaiting_response_message,
          responseContent: content,
          responderName: contactName,
          conversationId: matchedTask.original_requester_conversation_id || conversation.id,
          accountId: matchedTask.original_requester_account_id || context.accountId,
          isMaster: true,
          // Pass response callback to send results back to the original requester
          _onIntermediateRespond: async (responseMessage) => {
            // Send response to the original requester's conversation
            const targetConversationId = matchedTask.original_requester_conversation_id;
            const targetAccountId = matchedTask.original_requester_account_id;

            if (!targetConversationId || !targetAccountId || !this.agentManager) return;

            try {
              // Look up the external_id for the conversation
              const conv = db.prepare('SELECT external_id FROM conversations WHERE id = ?').get(targetConversationId);
              if (conv?.external_id) {
                await this.agentManager.sendTyping(targetAccountId, conv.external_id, 1000);
                const { getDeliveryQueueService } = require('./deliveryQueueService.cjs');
                const dlq = getDeliveryQueueService();
                await dlq.enqueue({
                  accountId: targetAccountId,
                  recipient: conv.external_id,
                  platform: conversation.platform || 'whatsapp',
                  content: responseMessage,
                  source: 'reasoning_loop',
                  sourceContext: 'plan_continuation',
                  conversationId: targetConversationId,
                  agentId: context.agentId,
                  userId: conversation.user_id,
                });
                logger.info(`[Agentic] Plan continuation response queued via DLQ`);
              }
            } catch (sendErr) {
              logger.warn(`[Agentic] Failed to queue plan continuation response: ${sendErr.message}`);
            }
          },
        };

        // Run asynchronously - don't block the message pipeline
        loop.run(matchedTask.agentic_id, 'event', resumeContext)
          .then(result => {
            logger.info(`[Agentic] Plan continuation completed: ${result.iterations} iterations, ${result.actions?.length || 0} actions`);
          })
          .catch(async (err) => {
            logger.error(`[Agentic] Plan continuation failed: ${err.message}`);
            // Phase 1b: Notify original requester of plan failure
            try {
              const targetConversationId = matchedTask.original_requester_conversation_id;
              const targetAccountId = matchedTask.original_requester_account_id;
              if (targetConversationId && targetAccountId && this.agentManager) {
                const conv = db.prepare('SELECT external_id FROM conversations WHERE id = ?').get(targetConversationId);
                if (conv?.external_id) {
                  const { getDeliveryQueueService } = require('./deliveryQueueService.cjs');
                  await getDeliveryQueueService().enqueue({
                    accountId: targetAccountId,
                    recipient: conv.external_id,
                    platform: conversation.platform || 'whatsapp',
                    content: "I encountered an issue resuming the plan. Please try again or send your request once more.",
                    source: 'plan_continuation_error',
                    conversationId: targetConversationId,
                    agentId: context.agentId,
                    userId: conversation.user_id,
                  });
                }
              }
            } catch (_notifyErr) { /* non-fatal */ }
          });
      } catch (e) {
        logger.error(`[Agentic] Could not trigger plan continuation: ${e.message}`);
      }

      return { handled: true, action: 'task_response', taskId: matchedTask.id, taskTitle: matchedTask.title };
    } catch (err) {
      logger.debug(`[Agentic] checkForTaskResponse error: ${err.message}`);
      return { handled: false };
    }
  }

  /**
   * Normalize content_type to a value the DB constraint accepts.
   * Valid: text, image, video, audio, document, sticker, location, contact, voice, system
   * @private
   */
  normalizeContentType(type) {
    const VALID = new Set(['text', 'image', 'video', 'audio', 'document', 'sticker', 'location', 'contact', 'voice', 'system']);
    const t = (type || 'text').toLowerCase();
    return VALID.has(t) ? t : 'text';
  }

  /**
   * Update conversation after new message
   * @private
   */
  async updateConversation(conversationId, message) {
    const db = getDatabase();

    // Use the message's actual timestamp (from provider) for last_message_at
    const messageTimestamp = message.createdAt || new Date().toISOString();

    db.prepare(`
      UPDATE conversations
      SET last_message_at = ?,
          unread_count = unread_count + 1,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(messageTimestamp, conversationId);
  }

  /**
   * Transform message for WebSocket client
   * @private
   */
  transformMessageForClient(message) {
    return {
      id: message.id,
      conversationId: message.conversationId,
      direction: message.direction,
      contentType: message.contentType,
      content: message.content,
      mediaUrl: message.mediaUrl,
      mediaMimeType: message.mimeType || message.mediaMimeType,
      senderId: message.senderId,
      senderName: message.senderName,
      platform: message.platform,
      createdAt: message.createdAt,
      metadata: message.metadata,
      // For compatibility with legacy frontend format
      role: message.direction === 'incoming' ? 'assistant' : 'user',
      isFromAI: message.aiGenerated || false
    };
  }

  /**
   * Transform conversation for WebSocket client
   * @private
   */
  transformConversationForClient(conversation) {
    return {
      id: conversation.id,
      title: conversation.title,
      agentId: conversation.agent_id,
      platform: conversation.platform,
      externalId: conversation.external_id,
      contactName: conversation.contact_name,
      status: conversation.status,
      isGroup: Boolean(conversation.is_group),
      unreadCount: conversation.unread_count,
      lastMessageAt: conversation.last_message_at,
      createdAt: conversation.created_at,
      updatedAt: conversation.updated_at
    };
  }

  /**
   * Transform contact for WebSocket client
   * @private
   */
  transformContactForClient(contact) {
    return {
      id: contact.id,
      displayName: contact.display_name,
      avatar: contact.avatar,
      notes: contact.notes,
      createdAt: contact.created_at
    };
  }

  /**
   * Mark conversation messages as read
   */
  async markAsRead(conversationId, userId) {
    const db = getDatabase();

    // Verify ownership
    const conversation = db.prepare(`
      SELECT * FROM conversations WHERE id = ? AND user_id = ?
    `).get(conversationId, userId);

    if (!conversation) {
      throw new Error('Conversation not found');
    }

    db.prepare(`
      UPDATE conversations
      SET unread_count = 0, updated_at = datetime('now')
      WHERE id = ?
    `).run(conversationId);

    db.prepare(`
      UPDATE messages
      SET status = 'read'
      WHERE conversation_id = ? AND direction = 'incoming' AND status != 'read'
    `).run(conversationId);

    return { success: true };
  }

  /**
   * Send outgoing message
   */
  async sendMessage(conversationId, content, options = {}) {
    const db = getDatabase();

    const conversation = db.prepare('SELECT * FROM conversations WHERE id = ?')
      .get(conversationId);

    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    // Save outgoing message
    const messageId = uuidv4();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO messages (id, conversation_id, direction, content_type, content, status, ai_generated, created_at)
      VALUES (?, ?, 'outgoing', ?, ?, 'pending', ?, ?)
    `).run(
      messageId,
      conversationId,
      options.contentType || 'text',
      content,
      options.aiGenerated ? 1 : 0,
      now
    );

    // Update conversation
    db.prepare(`
      UPDATE conversations SET last_message_at = ?, updated_at = datetime('now') WHERE id = ?
    `).run(now, conversationId);

    const savedMessage = db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId);

    // Broadcast as message:new for real-time frontend updates
    if (this.broadcast) {
      const transformedMsg = this.transformMessageForClient({
        id: messageId,
        conversationId,
        direction: 'outgoing',
        contentType: options.contentType || 'text',
        content,
        platform: conversation.platform,
        createdAt: now,
        aiGenerated: options.aiGenerated || false,
      });
      this.broadcast('message:new', {
        message: transformedMsg,
        conversation: this.transformConversationForClient(conversation),
      }, conversation.agent_id);
    }

    return savedMessage;
  }

  // ==========================================
  // CROSS-AGENT MESSAGING
  // ==========================================

  /**
   * Send a message through a specific agent to specific contacts
   * This enables cross-platform messaging (e.g., Telegram flow → WhatsApp message)
   *
   * @param {Object} options
   * @param {string} options.agentId - Target agent ID
   * @param {string} options.platform - Target platform (whatsapp, telegram-bot, email)
   * @param {string|string[]} options.recipients - Contact ID(s) or raw identifiers
   * @param {string} options.content - Message content
   * @param {Object} [options.messageOptions] - Platform-specific options
   * @param {string} [options.userId] - User ID for authorization
   * @param {Object} [options.sourceContext] - Original trigger context for tracking
   * @returns {Promise<Object>} Send results
   */
  async sendCrossAgentMessage(options) {
    const {
      agentId,
      platform,
      recipients,
      content,
      messageOptions = {},
      userId,
      sourceContext = {}
    } = options;

    const db = getDatabase();
    const { AgentManager } = require('../agents/agentManager.cjs');
    const agentManager = AgentManager.getInstance();

    // Validate agent exists and belongs to user
    const agent = db.prepare(`
      SELECT id, name, user_id FROM agents WHERE id = ?
    `).get(agentId);

    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    if (userId && agent.user_id !== userId) {
      throw new Error(`Agent does not belong to user`);
    }

    // Get platform account for this agent
    const account = db.prepare(`
      SELECT id, platform, status FROM platform_accounts
      WHERE agent_id = ? AND platform = ?
    `).get(agentId, platform);

    if (!account) {
      throw new Error(`Agent ${agent.name} has no ${platform} account configured`);
    }

    // Get the connected client
    const client = agentManager.getClient(account.id);
    if (!client || client.getStatus() !== 'connected') {
      throw new Error(`Agent ${agent.name} ${platform} is not connected (status: ${client?.getStatus() || 'no client'})`);
    }

    // Normalize recipients to array
    const recipientList = Array.isArray(recipients) ? recipients : [recipients];
    const results = [];

    // Send to each recipient
    for (const recipientId of recipientList) {
      try {
        // Resolve contact identifier if it's a contact ID (UUID format)
        let targetIdentifier = recipientId;
        if (recipientId.includes('-') && recipientId.length > 30) {
          // Looks like a UUID - resolve from contacts
          const identifier = await this.resolveContactIdentifier(recipientId, platform);
          if (identifier) {
            targetIdentifier = identifier;
          }
        }

        // Send through the appropriate platform
        let result;
        if (platform === 'whatsapp' || platform === 'whatsapp-business') {
          result = await client.sendMessage(targetIdentifier, content, messageOptions);
        } else if (platform === 'telegram-bot' || platform === 'telegram-user') {
          result = await client.sendMessage(targetIdentifier, content, messageOptions);
        } else if (platform === 'email') {
          result = await client.sendEmail(
            targetIdentifier,
            messageOptions.subject || 'Message from Agent',
            content,
            messageOptions
          );
        } else {
          throw new Error(`Unsupported platform: ${platform}`);
        }

        // Log the cross-agent message
        logger.info(`Cross-agent message sent: ${agent.name} (${platform}) → ${targetIdentifier}`);

        // Save outgoing message to database for tracking
        const savedMessage = await this.saveCrossAgentMessage({
          agentId,
          platform,
          recipient: targetIdentifier,
          content,
          result,
          sourceContext,
          userId: agent.user_id
        });

        results.push({
          recipient: targetIdentifier,
          success: true,
          messageId: result.id || result.messageId || savedMessage.id,
          platform,
          agentId,
          agentName: agent.name
        });

      } catch (error) {
        logger.error(`Failed to send to ${recipientId}: ${error.message}`);
        results.push({
          recipient: recipientId,
          success: false,
          error: error.message,
          platform,
          agentId
        });
      }
    }

    // Broadcast cross-agent message event
    if (this.broadcast) {
      this.broadcast('crossagent:message_sent', {
        agentId,
        agentName: agent.name,
        platform,
        recipientCount: recipientList.length,
        successCount: results.filter(r => r.success).length,
        sourceContext
      });
    }

    return {
      success: results.every(r => r.success),
      results,
      totalSent: results.filter(r => r.success).length,
      totalFailed: results.filter(r => !r.success).length
    };
  }

  /**
   * Resolve a contact ID to a platform-specific identifier
   * @private
   */
  async resolveContactIdentifier(contactId, platform) {
    const db = getDatabase();

    // Map platform to identifier type
    const platformToType = {
      'whatsapp': 'whatsapp',
      'whatsapp-business': 'whatsapp',
      'telegram-bot': 'telegram',
      'telegram-user': 'telegram',
      'email': 'email'
    };

    const identifierType = platformToType[platform] || platform;

    // Look up identifier for this contact and platform
    const identifier = db.prepare(`
      SELECT identifier_value FROM contact_identifiers
      WHERE contact_id = ? AND (identifier_type = ? OR platform = ?)
      ORDER BY is_primary DESC
      LIMIT 1
    `).get(contactId, identifierType, platform);

    return identifier?.identifier_value || null;
  }

  /**
   * Save cross-agent message to database for tracking
   * @private
   */
  async saveCrossAgentMessage({ agentId, platform, recipient, content, result, sourceContext, userId }) {
    const db = getDatabase();

    // Find or create conversation for this cross-agent message
    const externalId = `${platform}:${recipient}`;
    let conversation = db.prepare(`
      SELECT id FROM conversations WHERE external_id = ? AND agent_id = ?
    `).get(externalId, agentId);

    if (!conversation) {
      const conversationId = uuidv4();
      db.prepare(`
        INSERT INTO conversations (id, user_id, agent_id, platform, external_id, title, category)
        VALUES (?, ?, ?, ?, ?, ?, 'chat')
      `).run(conversationId, userId, agentId, platform, externalId, recipient);
      conversation = { id: conversationId };
    }

    // Save the message
    const messageId = uuidv4();
    const now = new Date().toISOString();
    const metadata = JSON.stringify({
      crossAgent: true,
      sourceContext,
      platformResult: result
    });

    db.prepare(`
      INSERT INTO messages (id, conversation_id, direction, content_type, content, status, metadata, created_at)
      VALUES (?, ?, 'outgoing', 'text', ?, 'sent', ?, ?)
    `).run(messageId, conversation.id, content, metadata, now);

    // Update conversation
    db.prepare(`
      UPDATE conversations SET last_message_at = ?, updated_at = datetime('now') WHERE id = ?
    `).run(now, conversation.id);

    return { id: messageId, conversationId: conversation.id };
  }

  /**
   * Get contacts for a specific agent's platform
   * Used by FlowBuilder contact picker
   *
   * @param {string} agentId - Agent ID
   * @param {string} [platform] - Optional platform filter
   * @param {Object} [options] - Query options
   * @param {string} [options.search] - Search term
   * @param {number} [options.limit] - Max results (default 50)
   * @returns {Promise<Object[]>} Contacts with identifiers
   */
  async getAgentContacts(agentId, platform = null, options = {}) {
    const db = getDatabase();
    const { search = '', limit = 50 } = options;

    // Get agent's user_id
    const agent = db.prepare('SELECT user_id FROM agents WHERE id = ?').get(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    // Build query to get contacts with identifiers
    let query = `
      SELECT DISTINCT
        c.id,
        c.display_name,
        c.avatar,
        c.company,
        c.tags,
        ci.identifier_type,
        ci.identifier_value,
        ci.platform,
        ci.is_primary,
        (
          SELECT MAX(m.created_at) FROM messages m
          JOIN conversations conv ON m.conversation_id = conv.id
          WHERE conv.contact_id = c.id
        ) as last_message_at
      FROM contacts c
      LEFT JOIN contact_identifiers ci ON ci.contact_id = c.id
      WHERE c.user_id = ?
        AND c.is_blocked = 0
    `;

    const params = [agent.user_id];

    // Add platform filter
    if (platform) {
      const platformToType = {
        'whatsapp': 'whatsapp',
        'whatsapp-business': 'whatsapp',
        'telegram-bot': 'telegram',
        'email': 'email'
      };
      const identifierType = platformToType[platform] || platform;
      query += ` AND (ci.identifier_type = ? OR ci.platform = ?)`;
      params.push(identifierType, platform);
    }

    // Add search filter
    if (search) {
      query += ` AND (c.display_name LIKE ? OR ci.identifier_value LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`);
    }

    query += ` ORDER BY c.is_favorite DESC, last_message_at DESC NULLS LAST LIMIT ?`;
    params.push(limit);

    const rows = db.prepare(query).all(...params);

    // Group identifiers by contact
    const contactMap = new Map();
    for (const row of rows) {
      if (!contactMap.has(row.id)) {
        contactMap.set(row.id, {
          id: row.id,
          displayName: row.display_name,
          avatarUrl: row.avatar,
          company: row.company,
          tags: row.tags ? JSON.parse(row.tags) : [],
          lastMessageAt: row.last_message_at,
          identifiers: []
        });
      }

      if (row.identifier_value) {
        contactMap.get(row.id).identifiers.push({
          type: row.identifier_type,
          value: row.identifier_value,
          platform: row.platform,
          isPrimary: Boolean(row.is_primary)
        });
      }
    }

    return Array.from(contactMap.values());
  }

  /**
   * Get available agents with connected platforms
   * Used by FlowBuilder agent selector
   *
   * @param {string} userId - User ID
   * @returns {Promise<Object[]>} Agents with platform status
   */
  async getAvailableAgents(userId) {
    const db = getDatabase();
    const { AgentManager } = require('../agents/agentManager.cjs');
    const agentManager = AgentManager.getInstance();

    // Get all agents for user with their platform accounts
    const agents = db.prepare(`
      SELECT
        a.id,
        a.name,
        a.avatar,
        a.type,
        pa.id as account_id,
        pa.platform,
        pa.status as account_status
      FROM agents a
      LEFT JOIN platform_accounts pa ON pa.agent_id = a.id
      WHERE a.user_id = ?
      ORDER BY a.name
    `).all(userId);

    // Group platforms by agent
    const agentMap = new Map();
    for (const row of agents) {
      if (!agentMap.has(row.id)) {
        agentMap.set(row.id, {
          id: row.id,
          name: row.name,
          avatar: row.avatar,
          type: row.type,
          platforms: []
        });
      }

      if (row.account_id) {
        // Check live connection status from AgentManager
        const client = agentManager.getClient(row.account_id);
        const isConnected = client && client.getStatus() === 'connected';

        agentMap.get(row.id).platforms.push({
          accountId: row.account_id,
          platform: row.platform,
          status: isConnected ? 'connected' : (row.account_status || 'disconnected'),
          isConnected
        });
      }
    }

    return Array.from(agentMap.values());
  }
}

// Singleton instance
const unifiedMessageService = new UnifiedMessageService();

module.exports = {
  UnifiedMessageService,
  unifiedMessageService
};
