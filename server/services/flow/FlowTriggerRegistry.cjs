/**
 * Flow Trigger Registry
 * =====================
 * Central registry for managing flow triggers and their subscriptions.
 * Integrates with UnifiedMessageService for message-based triggers
 * and supports various trigger types.
 *
 * Trigger Types:
 * - message: Triggered by incoming messages (WhatsApp, Telegram, Email, etc.)
 * - webhook: Triggered by HTTP webhook calls
 * - schedule: Triggered by cron schedules
 * - event: Triggered by internal system events
 * - manual: Triggered manually by user
 */

const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('../database.cjs');
const { logger } = require('../logger.cjs');

/**
 * Active trigger subscription
 * @typedef {Object} TriggerSubscription
 * @property {string} id - Subscription ID
 * @property {string} flowId - Flow ID
 * @property {string} triggerType - Type of trigger
 * @property {string} nodeId - Trigger node ID
 * @property {Object} config - Trigger configuration
 * @property {string} userId - Owner user ID
 * @property {boolean} active - Whether subscription is active
 * @property {Date} createdAt - When subscription was created
 */

class FlowTriggerRegistry extends EventEmitter {
  constructor() {
    super();

    /** @type {Map<string, TriggerSubscription>} */
    this.subscriptions = new Map();

    /** @type {Map<string, Set<string>>} - triggerType -> subscriptionIds */
    this.byType = new Map();

    /** @type {Map<string, Set<string>>} - flowId -> subscriptionIds */
    this.byFlow = new Map();

    /** @type {Map<string, Set<string>>} - userId -> subscriptionIds */
    this.byUser = new Map();

    /** @type {Object} */
    this.flowEngine = null;

    /** @type {Object} */
    this.unifiedMessageService = null;

    /** @type {Object} */
    this.scheduler = null;

    this.initialized = false;
  }

  /**
   * Initialize the registry with dependencies
   * @param {Object} options
   * @param {Object} options.flowEngine - FlowExecutionEngine instance
   * @param {Object} options.unifiedMessageService - UnifiedMessageService instance
   * @param {Object} options.scheduler - Scheduler for cron triggers
   */
  initialize(options = {}) {
    if (options.flowEngine) {
      this.flowEngine = options.flowEngine;
    }

    if (options.unifiedMessageService) {
      this.unifiedMessageService = options.unifiedMessageService;
      this.attachMessageListener();
    }

    if (options.scheduler) {
      this.scheduler = options.scheduler;
    }

    // Load active subscriptions from database
    this.loadActiveSubscriptions();

    this.initialized = true;
    logger.info('FlowTriggerRegistry initialized');
  }

  /**
   * Attach listener to unified message service
   * @private
   */
  attachMessageListener() {
    // Listen for processed messages
    this.unifiedMessageService.on('message:processed', async (event) => {
      await this.handleMessageTrigger(event);
    });

    // Listen for SuperBrain flow routes
    this.unifiedMessageService.on('superbrain:flow_route', async (event) => {
      await this.handleSuperBrainFlowRoute(event);
    });

    logger.info('FlowTriggerRegistry attached to UnifiedMessageService');
  }

  /**
   * Load active subscriptions from database
   * @private
   */
  loadActiveSubscriptions() {
    const db = getDatabase();

    try {
      // Get all active flows with triggers
      const flows = db.prepare(`
        SELECT id, user_id, nodes, edges, trigger_type, status
        FROM flows
        WHERE status = 'active'
      `).all();

      let count = 0;
      for (const flow of flows) {
        try {
          const nodes = typeof flow.nodes === 'string'
            ? JSON.parse(flow.nodes)
            : (flow.nodes || []);

          // Find trigger nodes
          const triggerNodes = nodes.filter(n =>
            n.type && n.type.startsWith('trigger:')
          );

          for (const triggerNode of triggerNodes) {
            this.registerSubscription({
              flowId: flow.id,
              userId: flow.user_id,
              nodeId: triggerNode.id,
              triggerType: triggerNode.type.replace('trigger:', ''),
              config: triggerNode.data || {},
            });
            count++;
          }
        } catch (error) {
          logger.warn(`Failed to parse flow ${flow.id}: ${error.message}`);
        }
      }

      logger.info(`Loaded ${count} active trigger subscriptions from ${flows.length} flows`);
    } catch (error) {
      logger.error(`Failed to load active subscriptions: ${error.message}`);
    }
  }

  /**
   * Register a trigger subscription
   * @param {Object} options
   * @param {string} options.flowId - Flow ID
   * @param {string} options.userId - User ID
   * @param {string} options.nodeId - Trigger node ID
   * @param {string} options.triggerType - Type of trigger
   * @param {Object} options.config - Trigger configuration
   * @returns {string} Subscription ID
   */
  registerSubscription({ flowId, userId, nodeId, triggerType, config }) {
    const id = `${flowId}:${nodeId}`;

    // Remove existing if present
    if (this.subscriptions.has(id)) {
      this.unregisterSubscription(id);
    }

    const subscription = {
      id,
      flowId,
      userId,
      nodeId,
      triggerType,
      config,
      active: true,
      createdAt: new Date(),
    };

    // Add to main map
    this.subscriptions.set(id, subscription);

    // Index by type
    if (!this.byType.has(triggerType)) {
      this.byType.set(triggerType, new Set());
    }
    this.byType.get(triggerType).add(id);

    // Index by flow
    if (!this.byFlow.has(flowId)) {
      this.byFlow.set(flowId, new Set());
    }
    this.byFlow.get(flowId).add(id);

    // Index by user
    if (!this.byUser.has(userId)) {
      this.byUser.set(userId, new Set());
    }
    this.byUser.get(userId).add(id);

    // Set up schedule if applicable
    if (triggerType === 'schedule' && config.cron) {
      this.setupScheduleTrigger(subscription);
    }

    this.emit('subscription:registered', subscription);
    logger.debug(`Registered trigger subscription: ${id} (${triggerType})`);

    return id;
  }

  /**
   * Unregister a trigger subscription
   * @param {string} id - Subscription ID
   */
  unregisterSubscription(id) {
    const subscription = this.subscriptions.get(id);
    if (!subscription) return;

    // Remove from indices
    this.byType.get(subscription.triggerType)?.delete(id);
    this.byFlow.get(subscription.flowId)?.delete(id);
    this.byUser.get(subscription.userId)?.delete(id);

    // Cancel scheduled job if applicable
    if (subscription.triggerType === 'schedule' && subscription.scheduledJob) {
      this.cancelScheduleTrigger(subscription);
    }

    // Remove from main map
    this.subscriptions.delete(id);

    this.emit('subscription:unregistered', { id, subscription });
    logger.debug(`Unregistered trigger subscription: ${id}`);
  }

  /**
   * Unregister all subscriptions for a flow
   * @param {string} flowId - Flow ID
   */
  unregisterFlow(flowId) {
    const subscriptionIds = this.byFlow.get(flowId);
    if (!subscriptionIds) return;

    for (const id of subscriptionIds) {
      this.unregisterSubscription(id);
    }
  }

  /**
   * Handle incoming message trigger
   * @private
   */
  async handleMessageTrigger(event) {
    const { message, conversation, contact, agentId } = event;

    // Get message-type subscriptions for this user
    const messageTypes = ['message', 'any_message', `${message.platform}_message`];
    const candidates = [];

    for (const type of messageTypes) {
      const subscriptionIds = this.byType.get(type);
      if (subscriptionIds) {
        for (const id of subscriptionIds) {
          const sub = this.subscriptions.get(id);
          if (sub && sub.userId === conversation.user_id && sub.active) {
            candidates.push(sub);
          }
        }
      }
    }

    if (candidates.length === 0) {
      return;
    }

    logger.debug(`Evaluating ${candidates.length} message trigger candidates for message ${message.id}`);

    // Evaluate each subscription
    for (const subscription of candidates) {
      try {
        const matches = this.evaluateMessageFilters(message, subscription.config);

        if (matches.matched) {
          logger.info(`Message trigger matched: flow=${subscription.flowId}, node=${subscription.nodeId}`);

          await this.executeTrigger(subscription, {
            message: {
              id: message.id,
              content: message.content,
              from: message.senderId || message.from,
              platform: message.platform,
              conversationId: conversation.id,
              contentType: message.contentType || 'text',
              mediaUrl: message.cachedMediaUrl || message.mediaUrl,
              timestamp: message.createdAt,
            },
            conversation: {
              id: conversation.id,
              title: conversation.title,
              platform: conversation.platform,
              externalId: conversation.external_id,
            },
            contact: contact ? {
              id: contact.id,
              name: contact.display_name,
            } : null,
            trigger: {
              type: 'message',
              source: message.platform,
              matchedFilters: matches.matchedFilters,
              timestamp: new Date().toISOString(),
            },
          });
        }
      } catch (error) {
        logger.error(`Error evaluating trigger ${subscription.id}: ${error.message}`);
      }
    }
  }

  /**
   * Handle SuperBrain flow route request
   * @private
   */
  async handleSuperBrainFlowRoute(event) {
    const { flowId, input, context } = event;

    // Find subscription for this flow
    const subscriptionIds = this.byFlow.get(flowId);
    if (!subscriptionIds || subscriptionIds.size === 0) {
      logger.warn(`No subscriptions found for flow ${flowId}`);
      return;
    }

    // Use first subscription (typically there's only one trigger per flow)
    const subscriptionId = [...subscriptionIds][0];
    const subscription = this.subscriptions.get(subscriptionId);

    if (!subscription) {
      logger.warn(`Subscription not found: ${subscriptionId}`);
      return;
    }

    await this.executeTrigger(subscription, {
      ...input,
      trigger: {
        type: 'superbrain_route',
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * Evaluate message against trigger filters
   * @private
   */
  evaluateMessageFilters(message, config) {
    const filters = config.filters || config;
    const matchedFilters = [];

    // Platform filter
    if (filters.platform && filters.platform !== 'any') {
      if (message.platform !== filters.platform) {
        return { matched: false, reason: 'Platform mismatch' };
      }
      matchedFilters.push('platform');
    }

    // Message type filter (allowChat, allowImage, allowVideo, etc.)
    const contentType = message.contentType || 'text';
    if (!this.isMessageTypeAllowed(contentType, filters)) {
      return { matched: false, reason: `Message type '${contentType}' not allowed by filter` };
    }
    matchedFilters.push('messageType');

    const content = (message.content || '').toLowerCase();
    const from = (message.senderId || message.from || '').toLowerCase();

    // Content filters (skip if patternType='any')
    if (filters.patternType !== 'any') {
      if (filters.contains && !content.includes(filters.contains.toLowerCase())) {
        return { matched: false, reason: 'Content does not contain pattern' };
      }
      if (filters.contains) matchedFilters.push('contains');

      if (filters.startsWith && !content.startsWith(filters.startsWith.toLowerCase())) {
        return { matched: false, reason: 'Content does not start with pattern' };
      }
      if (filters.startsWith) matchedFilters.push('startsWith');

      if (filters.endsWith && !content.endsWith(filters.endsWith.toLowerCase())) {
        return { matched: false, reason: 'Content does not end with pattern' };
      }
      if (filters.endsWith) matchedFilters.push('endsWith');

      if (filters.exactMatch && content !== filters.exactMatch.toLowerCase()) {
        return { matched: false, reason: 'Content does not exactly match' };
      }
      if (filters.exactMatch) matchedFilters.push('exactMatch');

      if (filters.pattern) {
        try {
          const regex = new RegExp(filters.pattern, filters.caseSensitive ? '' : 'i');
          if (!regex.test(message.content || '')) {
            return { matched: false, reason: 'Content does not match pattern' };
          }
          matchedFilters.push('pattern');
        } catch {
          return { matched: false, reason: 'Invalid regex pattern' };
        }
      }
    }

    // Sender filters
    if (filters.from && from !== filters.from.toLowerCase()) {
      return { matched: false, reason: 'Sender mismatch' };
    }
    if (filters.from) matchedFilters.push('from');

    if (filters.fromAny && Array.isArray(filters.fromAny)) {
      const fromList = filters.fromAny.map(s => s.toLowerCase());
      if (!fromList.includes(from)) {
        return { matched: false, reason: 'Sender not in allowed list' };
      }
      matchedFilters.push('fromAny');
    }

    if (filters.notFrom && from === filters.notFrom.toLowerCase()) {
      return { matched: false, reason: 'Sender in blocked list' };
    }
    if (filters.notFrom) matchedFilters.push('notFrom');

    // senderFilter from UI (comma-separated phone numbers)
    if (filters.senderFilter && Array.isArray(filters.senderFilter) && filters.senderFilter.length > 0) {
      const senderList = filters.senderFilter.map(s => s.toLowerCase());
      if (!senderList.some(s => from.includes(s))) {
        return { matched: false, reason: 'Sender not in filter list' };
      }
      matchedFilters.push('senderFilter');
    }

    // Attachment filters
    if (filters.hasAttachment) {
      if (!message.contentType || message.contentType === 'text') {
        return { matched: false, reason: 'No attachment' };
      }
      matchedFilters.push('hasAttachment');
    }

    if (filters.attachmentType && filters.attachmentType !== 'any') {
      if (message.contentType !== filters.attachmentType) {
        return { matched: false, reason: 'Attachment type mismatch' };
      }
      matchedFilters.push('attachmentType');
    }

    // Group filter
    if (filters.isGroup !== undefined) {
      if (Boolean(message.isGroup) !== Boolean(filters.isGroup)) {
        return { matched: false, reason: filters.isGroup ? 'Not a group message' : 'Is a group message' };
      }
      matchedFilters.push('isGroup');
    }

    // fromGroups/fromPrivate filters from UI
    if (filters.fromGroups === false && message.isGroup) {
      return { matched: false, reason: 'Group messages not allowed' };
    }
    if (filters.fromPrivate === false && !message.isGroup) {
      return { matched: false, reason: 'Private messages not allowed' };
    }

    return { matched: true, matchedFilters };
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
   * Execute a triggered flow
   * @private
   */
  async executeTrigger(subscription, input) {
    if (!this.flowEngine) {
      logger.error('Flow engine not available for trigger execution');
      return;
    }

    const db = getDatabase();

    try {
      // Get flow from database
      const flow = db.prepare('SELECT * FROM flows WHERE id = ?').get(subscription.flowId);

      if (!flow) {
        logger.warn(`Flow not found for trigger: ${subscription.flowId}`);
        return;
      }

      if (flow.status !== 'active') {
        logger.debug(`Flow ${subscription.flowId} is not active, skipping`);
        return;
      }

      // Parse flow definition
      const nodes = typeof flow.nodes === 'string' ? JSON.parse(flow.nodes) : flow.nodes;
      const edges = typeof flow.edges === 'string' ? JSON.parse(flow.edges) : flow.edges;

      // Execute flow
      const executionId = await this.flowEngine.execute(
        { ...flow, nodes, edges },
        {
          input,
          trigger: input.trigger,
          userId: subscription.userId,
          startNodeId: subscription.nodeId,
        }
      );

      // Emit trigger executed event
      this.emit('trigger:executed', {
        subscriptionId: subscription.id,
        flowId: subscription.flowId,
        executionId,
        input,
        timestamp: new Date().toISOString(),
      });

      logger.info(`Trigger executed: flow=${subscription.flowId}, execution=${executionId}`);
      return executionId;

    } catch (error) {
      logger.error(`Trigger execution failed: ${error.message}`);
      this.emit('trigger:error', {
        subscriptionId: subscription.id,
        flowId: subscription.flowId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Set up scheduled trigger using cron
   * @private
   */
  setupScheduleTrigger(subscription) {
    if (!this.scheduler) {
      logger.warn('Scheduler not available for schedule trigger');
      return;
    }

    const { cron, timezone } = subscription.config;

    try {
      const job = this.scheduler.schedule(
        cron,
        async () => {
          await this.executeTrigger(subscription, {
            trigger: {
              type: 'schedule',
              cron,
              scheduledAt: new Date().toISOString(),
            },
          });
        },
        { timezone: timezone || 'UTC' }
      );

      subscription.scheduledJob = job;
      logger.debug(`Scheduled trigger set up: ${subscription.id} with cron "${cron}"`);
    } catch (error) {
      logger.error(`Failed to set up schedule trigger: ${error.message}`);
    }
  }

  /**
   * Cancel scheduled trigger
   * @private
   */
  cancelScheduleTrigger(subscription) {
    if (subscription.scheduledJob) {
      subscription.scheduledJob.stop?.() || subscription.scheduledJob.cancel?.();
      delete subscription.scheduledJob;
    }
  }

  /**
   * Manually trigger a flow
   * @param {string} flowId - Flow ID
   * @param {Object} input - Input data
   * @param {string} userId - User ID
   */
  async manualTrigger(flowId, input, userId) {
    // Create temporary subscription for manual trigger
    const tempSubscription = {
      id: `manual:${flowId}:${Date.now()}`,
      flowId,
      userId,
      nodeId: null,
      triggerType: 'manual',
      config: {},
      active: true,
    };

    return this.executeTrigger(tempSubscription, {
      ...input,
      trigger: {
        type: 'manual',
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * Handle webhook trigger
   * @param {string} webhookId - Webhook identifier
   * @param {Object} payload - Webhook payload
   * @param {Object} headers - Request headers
   */
  async webhookTrigger(webhookId, payload, headers) {
    // Find subscription for this webhook
    const subscriptionIds = this.byType.get('webhook');
    if (!subscriptionIds) {
      throw new Error(`No webhook subscriptions found`);
    }

    for (const id of subscriptionIds) {
      const subscription = this.subscriptions.get(id);
      if (subscription?.config?.webhookId === webhookId) {
        return this.executeTrigger(subscription, {
          payload,
          headers: {
            contentType: headers['content-type'],
            userAgent: headers['user-agent'],
          },
          trigger: {
            type: 'webhook',
            webhookId,
            timestamp: new Date().toISOString(),
          },
        });
      }
    }

    throw new Error(`Webhook not found: ${webhookId}`);
  }

  /**
   * Get all subscriptions for a user
   * @param {string} userId - User ID
   * @returns {TriggerSubscription[]}
   */
  getSubscriptionsForUser(userId) {
    const ids = this.byUser.get(userId);
    if (!ids) return [];
    return [...ids].map(id => this.subscriptions.get(id)).filter(Boolean);
  }

  /**
   * Get subscription statistics
   */
  getStats() {
    const stats = {
      total: this.subscriptions.size,
      byType: {},
      activeFlows: this.byFlow.size,
      activeUsers: this.byUser.size,
    };

    for (const [type, ids] of this.byType) {
      stats.byType[type] = ids.size;
    }

    return stats;
  }
}

// Singleton instance
let _instance = null;

function getFlowTriggerRegistry() {
  if (!_instance) {
    _instance = new FlowTriggerRegistry();
  }
  return _instance;
}

module.exports = {
  FlowTriggerRegistry,
  getFlowTriggerRegistry,
};
