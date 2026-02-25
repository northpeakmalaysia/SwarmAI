/**
 * Athena Monitor Service
 * =======================
 * Background monitoring service for the Athena Personal Assistant agent.
 *
 * Monitors:
 * - All agents' incoming email messages
 * - Platform connection status changes (connect/disconnect/error)
 * - Swarm task completions and failures
 * - Agent status changes (periodic polling)
 *
 * Anti-Loop Mechanism:
 * - Builds an ignore list from response_agent_ids (all platform accounts & phone numbers)
 * - Ignores messages from master's phone (replies to notifications)
 * - Ignores messages on response agents' platform accounts
 * - Ignores Athena's own agent record activities
 *
 * Sends notifications via MasterNotificationService -> WhatsApp to master.
 */

const EventEmitter = require('events');
const { getDatabase } = require('../database.cjs');
const { logger } = require('../logger.cjs');
const { v4: uuidv4 } = require('uuid');

class AthenaMonitorService extends EventEmitter {
  constructor() {
    super();
    this.isRunning = false;
    this.agentManager = null;
    this.masterNotificationService = null;

    // Cached profile data
    this.athenaProfile = null;
    this.masterPhone = null;

    // Anti-loop: Sets of identifiers to ignore
    this.responseAgentIds = new Set();
    this.responseAccountIds = new Set();
    this.responsePlatformNumbers = new Set();

    // Notification batching
    this.notificationQueue = [];
    this.batchInterval = null;
    this.batchIntervalMs = 5000; // 5 seconds

    // Health check (now managed by SchedulerService - kept for manual API trigger only)

    // Agent status tracking (for polling)
    this.lastAgentStatuses = new Map();
    this.agentPollInterval = null;
    this.agentPollIntervalMs = 60000; // 1 minute

    // Daily notification cap
    this.dailyCap = 200;
    this.dailyCount = 0;
    this.dailyResetInterval = null;

    // Named event handlers (for clean removal on stop)
    this._onMessage = null;
    this._onStatusChange = null;
    this._onError = null;

    // WhatsApp client reference
    this.whatsappAccountId = null;
  }

  /**
   * Get singleton instance
   */
  static getInstance() {
    if (!AthenaMonitorService._instance) {
      AthenaMonitorService._instance = new AthenaMonitorService();
    }
    return AthenaMonitorService._instance;
  }

  /**
   * Initialize the service with dependencies
   */
  async initialize({ agentManager }) {
    this.agentManager = agentManager;

    // Load MasterNotificationService
    try {
      const mod = require('./MasterNotificationService.cjs');
      this.masterNotificationService = mod.masterNotificationService || mod;
      if (typeof this.masterNotificationService === 'function') {
        this.masterNotificationService = new this.masterNotificationService();
      }
    } catch (e) {
      logger.warn(`Athena: MasterNotificationService not available: ${e.message}`);
    }

    // Load Athena's profile from DB
    const db = getDatabase();
    this.athenaProfile = db.prepare(`
      SELECT * FROM agentic_profiles
      WHERE name = 'Athena' AND status = 'active'
      ORDER BY created_at DESC LIMIT 1
    `).get();

    if (!this.athenaProfile) {
      logger.warn('Athena: No active Athena profile found. Run setup-athena.cjs first.');
      return false;
    }

    // Get master phone from contact
    if (this.athenaProfile.master_contact_id) {
      const identifier = db.prepare(`
        SELECT identifier_value FROM contact_identifiers
        WHERE contact_id = ? AND identifier_type IN ('phone', 'whatsapp')
        LIMIT 1
      `).get(this.athenaProfile.master_contact_id);
      this.masterPhone = identifier?.identifier_value?.replace(/\D/g, '') || null;
    }

    if (!this.masterPhone) {
      logger.warn('Athena: No master phone number found. Notifications may not work.');
    }

    // Build ignore list from response agents
    await this.buildIgnoreList();

    logger.info(`Athena: Initialized - Master: ${this.masterPhone}, Response Agents: ${this.responseAgentIds.size}, Ignore Accounts: ${this.responseAccountIds.size}, Ignore Numbers: ${this.responsePlatformNumbers.size}`);
    return true;
  }

  /**
   * Build the ignore list from response_agent_ids
   * Resolves agent IDs -> platform_accounts -> phone numbers/emails
   */
  async buildIgnoreList() {
    const db = getDatabase();
    const agentIds = JSON.parse(this.athenaProfile.response_agent_ids || '[]');

    this.responseAgentIds.clear();
    this.responseAccountIds.clear();
    this.responsePlatformNumbers.clear();

    for (const agentId of agentIds) {
      this.responseAgentIds.add(agentId);

      // Get all platform accounts for this response agent
      const accounts = db.prepare(`
        SELECT id, platform, connection_metadata
        FROM platform_accounts
        WHERE agent_id = ?
      `).all(agentId);

      for (const account of accounts) {
        this.responseAccountIds.add(account.id);

        // Extract phone/email from connection_metadata
        try {
          const meta = JSON.parse(account.connection_metadata || '{}');
          if (meta.phone) {
            this.responsePlatformNumbers.add(meta.phone.replace(/\D/g, ''));
          }
          if (meta.email) {
            this.responsePlatformNumbers.add(meta.email.toLowerCase());
          }
          if (meta.phoneNumber) {
            this.responsePlatformNumbers.add(meta.phoneNumber.replace(/\D/g, ''));
          }
        } catch (e) {
          // Metadata parse failed, skip
        }
      }
    }

    // Also add Athena's own agent to ignore
    if (this.athenaProfile.agent_id) {
      this.responseAgentIds.add(this.athenaProfile.agent_id);
    }

    logger.debug(`Athena: Ignore list - Agents: [${[...this.responseAgentIds]}], Accounts: [${[...this.responseAccountIds]}], Numbers: [${[...this.responsePlatformNumbers]}]`);
  }

  /**
   * ANTI-LOOP: Check if a message should be ignored
   *
   * The master should be able to contact Athena directly.
   * Only ignore master messages on the NOTIFICATION account (to prevent
   * re-processing Athena's own notifications and master's replies to them).
   */
  shouldIgnoreMessage(message) {
    const senderPhone = (message.sender?.phone || message.from || '')
      .replace('@c.us', '').replace('@g.us', '').replace('@lid', '').replace(/\D/g, '');

    // 1. Ignore master messages ONLY on Athena's notification WhatsApp account
    //    (prevents re-processing replies to Athena's own notifications)
    //    Master messages on OTHER accounts are allowed (master can talk to agents)
    if (this.masterPhone && senderPhone === this.masterPhone) {
      if (message.accountId && message.accountId === this.whatsappAccountId) {
        return true;
      }
      // Master sending on non-notification accounts → allow through
    }

    // 2. Ignore messages FROM any response agent's platform number
    if (this.responsePlatformNumbers.has(senderPhone)) {
      return true;
    }

    // 3. Ignore messages arriving ON any response agent's platform account
    //    (these are Athena's own response agents - she monitors them, not listens to them)
    if (message.accountId && this.responseAccountIds.has(message.accountId)) {
      return true;
    }

    // 4. Ignore messages from Athena's own agent
    if (message.agentId && this.responseAgentIds.has(message.agentId)) {
      return true;
    }

    return false;
  }

  /**
   * Start monitoring
   */
  async start() {
    if (this.isRunning) {
      logger.info('Athena: Already running');
      return;
    }

    if (!this.athenaProfile) {
      logger.warn('Athena: Cannot start - no profile loaded');
      return;
    }

    logger.info('Athena: Starting monitor service...');

    // Setup WhatsApp client with retry
    await this.setupWhatsAppClientWithRetry();

    // Wire up event listeners
    this.setupMessageListener();
    this.setupSwarmListeners();

    // Start batch processing
    this.batchInterval = setInterval(() => this.processBatch(), this.batchIntervalMs);

    // Health check now managed by SchedulerService (agentic_schedules table)

    // Start agent status polling
    this.initAgentStatuses();
    this.agentPollInterval = setInterval(() => this.pollAgentStatuses(), this.agentPollIntervalMs);

    // Daily cap reset at midnight
    this.dailyResetInterval = setInterval(() => {
      this.dailyCount = 0;
    }, 86400000);

    this.isRunning = true;

    // Emit agent:wake_up hook
    try {
      const { getHookRegistry } = require('./HookRegistry.cjs');
      getHookRegistry().emitAsync('agent:wake_up', {
        agenticId: this.athenaProfile.id,
        userId: this.athenaProfile.user_id,
        agentName: this.athenaProfile.name,
      });
    } catch (e) { /* hooks optional */ }

    // Use AgentReasoningLoop for startup - AI decides what to do on wake-up
    try {
      const { getAgentReasoningLoop } = require('./AgentReasoningLoop.cjs');
      const loop = getAgentReasoningLoop();
      const db = getDatabase();
      const agentCount = db.prepare('SELECT COUNT(*) as count FROM agents WHERE user_id = ?').get(this.athenaProfile.user_id)?.count || 0;
      const platformCount = db.prepare("SELECT COUNT(*) as count FROM platform_accounts WHERE status = 'connected' AND user_id = ?").get(this.athenaProfile.user_id)?.count || 0;

      loop.run(this.athenaProfile.id, 'wake_up', {
        situation: `You just came online. ${this.getMonitoringSummary()}`,
        agentCount,
        platformCount,
        _onIntermediateRespond: this._createRespondCallback('Athena Online'),
      }).then(result => {
        logger.info(`Athena: Wake-up reasoning complete - ${result.actions.length} actions, ${result.iterations} iterations`);
      }).catch(err => {
        logger.warn(`Athena: Wake-up reasoning failed, sending fallback notification: ${err.message}`);
        // Fallback: send basic startup notification
        this.sendNotificationDirect({
          type: 'startup',
          title: 'Athena Online',
          message: `Athena Personal Assistant is now active.\n\nMonitoring: ${this.getMonitoringSummary()}`,
          priority: 'normal',
        });
      });
    } catch (err) {
      logger.warn(`Athena: ReasoningLoop not available, using fallback: ${err.message}`);
      await this.sendNotificationDirect({
        type: 'startup',
        title: 'Athena Online',
        message: `Athena Personal Assistant is now active.\n\nMonitoring: ${this.getMonitoringSummary()}`,
        priority: 'normal',
      });
    }

    logger.info('Athena: Monitor service started');
  }

  /**
   * Stop monitoring
   */
  async stop() {
    if (!this.isRunning) return;

    logger.info('Athena: Stopping monitor service...');

    // Clear intervals
    if (this.batchInterval) clearInterval(this.batchInterval);
    if (this.agentPollInterval) clearInterval(this.agentPollInterval);
    if (this.dailyResetInterval) clearInterval(this.dailyResetInterval);

    // Remove event listeners (only our own handlers)
    if (this.agentManager && this._onMessage) {
      this.agentManager.removeListener('message', this._onMessage);
    }

    // Process remaining notifications
    await this.processBatch();

    this.isRunning = false;
    logger.info('Athena: Monitor service stopped');
  }

  /**
   * Setup WhatsApp client from response agents (with retry for slow reconnection)
   */
  async setupWhatsAppClientWithRetry(maxRetries = 5, delayMs = 10000) {
    for (let i = 0; i < maxRetries; i++) {
      const success = await this.setupWhatsAppClient();
      if (success) return true;

      if (i < maxRetries - 1) {
        logger.info(`Athena: WhatsApp not ready, retrying in ${delayMs / 1000}s (${i + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
    logger.warn('Athena: WhatsApp client not available after retries. Notifications will be logged only.');
    return false;
  }

  /**
   * Find and set the WhatsApp client from response agents
   */
  async setupWhatsAppClient() {
    if (!this.agentManager) return false;

    const db = getDatabase();

    // Look through response agents' WhatsApp accounts
    for (const agentId of this.responseAgentIds) {
      const accounts = db.prepare(`
        SELECT id FROM platform_accounts
        WHERE agent_id = ? AND platform = 'whatsapp' AND status = 'connected'
      `).all(agentId);

      for (const account of accounts) {
        const client = this.agentManager.getClient(account.id);
        if (client) {
          // Check if client has sendMessage capability
          const status = typeof client.getStatus === 'function' ? client.getStatus() : null;
          if (status === 'connected' || status === 'ready') {
            // Set the WhatsApp client on MasterNotificationService
            if (this.masterNotificationService?.setPlatformClients) {
              this.masterNotificationService.setPlatformClients({ whatsapp: client });
            }
            this.whatsappAccountId = account.id;
            logger.info(`Athena: WhatsApp client set from account ${account.id} (agent: ${agentId})`);
            return true;
          }
        }
      }
    }

    // Fallback: try any connected WhatsApp account
    const anyConnected = db.prepare(`
      SELECT id, agent_id FROM platform_accounts
      WHERE platform = 'whatsapp' AND status = 'connected'
      LIMIT 1
    `).get();

    if (anyConnected) {
      const client = this.agentManager.getClient(anyConnected.id);
      if (client) {
        if (this.masterNotificationService?.setPlatformClients) {
          this.masterNotificationService.setPlatformClients({ whatsapp: client });
        }
        this.whatsappAccountId = anyConnected.id;
        // Add this account to ignore list too
        this.responseAccountIds.add(anyConnected.id);
        logger.info(`Athena: WhatsApp client set from fallback account ${anyConnected.id}`);
        return true;
      }
    }

    return false;
  }

  /**
   * Setup message event listener on AgentManager
   */
  setupMessageListener() {
    if (!this.agentManager) return;

    // Message processing is now handled by unifiedMessageService.processWithAgenticReasoning()
    // which routes through AgentReasoningLoop for ALL agentic profiles.
    // This listener is no longer needed for messages - prevents double-processing.
    logger.info('Athena: Message listener DISABLED (handled by unifiedMessageService agentic routing)');
  }

  /**
   * Handle incoming message from any agent's platform
   * Enriches message via SuperBrain (OCR, image analysis, link previews)
   * then passes to AgentReasoningLoop for AI-driven decision making
   */
  handleIncomingMessage(message) {
    // Anti-loop check (safety - stays hardcoded)
    if (this.shouldIgnoreMessage(message)) {
      return;
    }

    const db = getDatabase();
    const agent = message.agentId
      ? db.prepare('SELECT name FROM agents WHERE id = ?').get(message.agentId)
      : null;

    const senderName = message.sender?.name || message.sender?.email || message.from || 'Unknown';

    // Detect if sender is the master contact
    let isMaster = false;
    if (this.athenaProfile?.master_contact_id) {
      try {
        const senderId = message.sender?.phone || message.sender?.id || message.sender?.email || message.from || '';
        // Clean identifier (strip @lid, @c.us, @s.whatsapp.net)
        const cleanSender = senderId.replace(/@lid$/, '').replace(/@c\.us$/, '').replace(/@s\.whatsapp\.net$/, '');
        // Check if any identifier on the master contact matches the sender
        const masterMatch = db.prepare(`
          SELECT 1 FROM contact_identifiers
          WHERE contact_id = ?
            AND (identifier_value = ? OR identifier_value = ? OR identifier_value = ?)
          LIMIT 1
        `).get(this.athenaProfile.master_contact_id, senderId, cleanSender, cleanSender + '@lid');
        isMaster = !!masterMatch;
        if (isMaster) {
          logger.info(`Athena: Message from MASTER "${senderName}" (${cleanSender})`);
        }
      } catch (e) {
        logger.debug(`Athena: Master check failed: ${e.message}`);
      }
    }

    // Enrich message through SuperBrain, then pass to reasoning loop
    this.enrichAndProcess(message, senderName, agent, isMaster).catch(err => {
      logger.debug(`Athena: Message enrichment/reasoning failed, using fallback: ${err.message}`);
      // Fallback: only notify for emails (old behavior)
      if (message.platform === 'email') {
        this.queueNotification({
          type: 'new_email',
          title: `New Email for ${agent?.name || 'Agent'}`,
          message: `From: ${senderName}\nSubject: ${message.subject || 'No Subject'}\nPreview: ${(message.text || '').substring(0, 100)}`,
          priority: 'normal',
        });
      }
    });
  }

  /**
   * Enrich message with SuperBrain processing (OCR, image analysis, link previews)
   * then feed the enriched content to the reasoning loop.
   */
  async enrichAndProcess(message, senderName, agent, isMaster = false) {
    let enrichedPreview = (message.text || '').substring(0, 500);
    const enrichments = [];

    // --- OCR / Image Analysis ---
    if (message.hasMedia && message.mediaUrl) {
      try {
        const mimeType = message.mimeType || '';
        if (mimeType.startsWith('image/') || mimeType.startsWith('application/pdf')) {
          const { visionService } = require('../vision/VisionAnalysisService.cjs');
          if (visionService && typeof visionService.extractTextFromUrl === 'function') {
            const ocrResult = await visionService.extractTextFromUrl(
              message.mediaLocalPath || message.mediaUrl,
              { timeout: 15000 }
            );
            if (ocrResult?.text && ocrResult.text.trim().length > 5) {
              enrichments.push(`[OCR extracted text]: ${ocrResult.text.substring(0, 500)}`);
            }
          }
        }
      } catch (ocrErr) {
        logger.debug(`Athena: OCR enrichment failed: ${ocrErr.message}`);
      }
    }

    // --- Link Preview Extraction ---
    if (message.linkPreview) {
      const lp = message.linkPreview;
      enrichments.push(`[Link Preview]: ${lp.title || ''} - ${lp.description || ''} (${lp.url || ''})`);
    } else if (message.text) {
      // Extract URLs from text and note them
      const urlRegex = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;
      const urls = (message.text.match(urlRegex) || []).slice(0, 3);
      if (urls.length > 0) {
        enrichments.push(`[URLs found]: ${urls.join(', ')}`);
      }
    }

    // --- Attachment info ---
    if (message.hasAttachments && message.attachments?.length > 0) {
      const attInfo = message.attachments.map(a => `${a.filename || 'file'} (${a.contentType || 'unknown'})`).join(', ');
      enrichments.push(`[Attachments]: ${attInfo}`);
    } else if (message.hasMedia && message.mimeType) {
      enrichments.push(`[Media]: ${message.mimeType}${message.mediaData?.filename ? ` - ${message.mediaData.filename}` : ''}`);
    }

    // --- Email-specific enrichment ---
    if (message.platform === 'email') {
      if (message.html) {
        // Extract key info from HTML (strip tags, get first 300 chars)
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
    }

    // Build the full enriched content for the AI
    let fullContent = enrichedPreview;
    if (enrichments.length > 0) {
      fullContent += '\n\n--- Enriched Data ---\n' + enrichments.join('\n');
    }

    // Now pass enriched message to reasoning loop
    const { getAgentReasoningLoop } = require('./AgentReasoningLoop.cjs');
    const loop = getAgentReasoningLoop();

    const result = await loop.run(this.athenaProfile.id, 'event', {
      event: 'incoming_message',
      platform: message.platform,
      sender: senderName,
      agentName: agent?.name || 'Unknown Agent',
      subject: message.subject || '',
      preview: fullContent,
      hasMedia: !!message.hasMedia,
      contentType: message.contentType || message.mimeType || 'text',
      isMaster,
      _onIntermediateRespond: this._createRespondCallback(`Message from ${senderName}`),
    });

    if (result.actions.length > 0) {
      logger.info(`Athena: Message from ${senderName} → ${result.actions.length} actions taken`);
    }
  }

  /**
   * Setup swarm event listeners
   */
  setupSwarmListeners() {
    try {
      // Try to get SwarmOrchestrator
      const orchestratorMod = require('../swarm/SwarmOrchestrator.cjs');
      const orchestrator = orchestratorMod.getSwarmOrchestrator
        ? orchestratorMod.getSwarmOrchestrator()
        : orchestratorMod;

      if (orchestrator && typeof orchestrator.on === 'function') {
        orchestrator.on('task:completed', ({ taskId, agentId, result }) => {
          const db = getDatabase();
          const task = db.prepare('SELECT title FROM swarm_tasks WHERE id = ?').get(taskId);
          const agent = agentId ? db.prepare('SELECT name FROM agents WHERE id = ?').get(agentId) : null;

          this.queueNotification({
            type: 'task_completed',
            title: 'Task Completed',
            message: `Task: ${task?.title || taskId}\nAgent: ${agent?.name || agentId || 'Unknown'}`,
            priority: 'normal',
          });
        });

        orchestrator.on('task:failed', ({ taskId, agentId, reason }) => {
          const db = getDatabase();
          const task = db.prepare('SELECT title FROM swarm_tasks WHERE id = ?').get(taskId);
          const agent = agentId ? db.prepare('SELECT name FROM agents WHERE id = ?').get(agentId) : null;

          this.queueNotification({
            type: 'critical_error',
            title: 'Task Failed',
            message: `Task: ${task?.title || taskId}\nAgent: ${agent?.name || agentId || 'Unknown'}\nReason: ${reason || 'Unknown'}`,
            priority: 'high',
          });
        });

        logger.debug('Athena: Swarm listeners attached');
      }
    } catch (e) {
      logger.debug(`Athena: SwarmOrchestrator not available: ${e.message}`);
    }
  }

  /**
   * Initialize agent status tracking
   */
  initAgentStatuses() {
    const db = getDatabase();
    const agents = db.prepare(`
      SELECT id, name, status FROM agents WHERE user_id = ?
    `).all(this.athenaProfile.user_id);

    this.lastAgentStatuses.clear();
    for (const agent of agents) {
      this.lastAgentStatuses.set(agent.id, agent.status);
    }
  }

  /**
   * Poll for agent status changes
   * Detects changes and routes significant ones through reasoning loop
   */
  pollAgentStatuses() {
    const db = getDatabase();
    const agents = db.prepare(`
      SELECT id, name, status FROM agents WHERE user_id = ?
    `).all(this.athenaProfile.user_id);

    const significantChanges = [];

    for (const agent of agents) {
      // Skip Athena's own agent
      if (this.responseAgentIds.has(agent.id)) continue;

      const previousStatus = this.lastAgentStatuses.get(agent.id);

      if (previousStatus && previousStatus !== agent.status) {
        const isSignificant =
          agent.status === 'offline' ||
          agent.status === 'error' ||
          (previousStatus === 'offline' && agent.status === 'idle');

        if (isSignificant) {
          significantChanges.push({
            agentName: agent.name,
            oldStatus: previousStatus,
            newStatus: agent.status,
          });
        }
      }

      this.lastAgentStatuses.set(agent.id, agent.status);
    }

    // Only trigger reasoning when there are significant changes
    if (significantChanges.length > 0) {
      try {
        const { getAgentReasoningLoop } = require('./AgentReasoningLoop.cjs');
        const loop = getAgentReasoningLoop();

        loop.run(this.athenaProfile.id, 'event', {
          event: 'agent_status_changes',
          changes: significantChanges,
          _onIntermediateRespond: this._createRespondCallback('Agent Status'),
        }).catch(err => {
          logger.debug(`Athena: Status change reasoning failed, using fallback: ${err.message}`);
          // Fallback: queue notifications directly (old behavior)
          for (const change of significantChanges) {
            this.queueNotification({
              type: 'agent_status_change',
              title: `Agent ${change.newStatus === 'idle' ? 'Back Online' : change.newStatus.toUpperCase()}: ${change.agentName}`,
              message: `Agent "${change.agentName}" changed: ${change.oldStatus} -> ${change.newStatus}`,
              priority: change.newStatus === 'error' ? 'high' : 'normal',
            });
          }
        });
      } catch (err) {
        // Fallback if ReasoningLoop not available
        for (const change of significantChanges) {
          this.queueNotification({
            type: 'agent_status_change',
            title: `Agent ${change.newStatus === 'idle' ? 'Back Online' : change.newStatus.toUpperCase()}: ${change.agentName}`,
            message: `Agent "${change.agentName}" changed: ${change.oldStatus} -> ${change.newStatus}`,
            priority: change.newStatus === 'error' ? 'high' : 'normal',
          });
        }
      }
    }
  }

  /**
   * Queue a notification for batched sending
   */
  queueNotification(notification) {
    if (this.dailyCount >= this.dailyCap) {
      logger.warn(`Athena: Daily notification cap (${this.dailyCap}) reached, dropping: ${notification.title}`);
      return;
    }

    // Urgent notifications bypass batching
    if (notification.priority === 'urgent') {
      this.sendNotificationDirect(notification);
      return;
    }

    this.notificationQueue.push({
      ...notification,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Process batched notifications
   */
  async processBatch() {
    if (this.notificationQueue.length === 0) return;

    const batch = this.notificationQueue.splice(0, this.notificationQueue.length);

    // Group by type
    const grouped = {};
    for (const notif of batch) {
      if (!grouped[notif.type]) grouped[notif.type] = [];
      grouped[notif.type].push(notif);
    }

    for (const [type, notifications] of Object.entries(grouped)) {
      if (notifications.length === 1) {
        await this.sendNotificationDirect(notifications[0]);
      } else {
        // Batch multiple same-type notifications
        const highestPriority = notifications.reduce((p, n) => {
          const order = { urgent: 0, high: 1, normal: 2, low: 3 };
          return (order[n.priority] || 3) < (order[p] || 3) ? n.priority : p;
        }, 'low');

        await this.sendNotificationDirect({
          type,
          title: `${notifications.length} ${type.replace(/_/g, ' ')} events`,
          message: notifications.map(n => `- ${n.title}: ${n.message.substring(0, 80)}`).join('\n'),
          priority: highestPriority,
        });
      }
    }
  }

  /**
   * Send a notification directly via MasterNotificationService
   */
  async sendNotificationDirect(notif) {
    if (!this.athenaProfile) return;

    this.dailyCount++;

    try {
      if (this.masterNotificationService?.sendNotification) {
        const result = await this.masterNotificationService.sendNotification({
          agenticId: this.athenaProfile.id,
          userId: this.athenaProfile.user_id,
          type: notif.type,
          title: notif.title,
          message: notif.message,
          priority: notif.priority || 'normal',
          forceSend: true, // Athena always sends (bypasses notify_master_on check)
        });

        if (result.success) {
          logger.info(`Athena: Notification sent - ${notif.title}`);
        } else {
          logger.warn(`Athena: Notification delivery failed - ${result.error}`);
        }
        return result;
      } else {
        // Fallback: log only
        logger.info(`Athena [${notif.priority}] ${notif.title}: ${notif.message}`);
        return { success: false, error: 'MasterNotificationService not available' };
      }
    } catch (error) {
      logger.error(`Athena: Notification error: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send periodic health summary
   */
  async sendHealthSummary() {
    try {
      const db = getDatabase();
      const userId = this.athenaProfile.user_id;

      // Gather stats
      const totalAgents = db.prepare('SELECT COUNT(*) as count FROM agents WHERE user_id = ?').get(userId)?.count || 0;
      const activeAgents = db.prepare("SELECT COUNT(*) as count FROM agents WHERE user_id = ? AND status != 'offline'").get(userId)?.count || 0;

      const connectedPlatforms = db.prepare(`
        SELECT platform, COUNT(*) as count FROM platform_accounts
        WHERE user_id = ? AND status = 'connected'
        GROUP BY platform
      `).all(userId);

      const recentMessages = db.prepare(`
        SELECT COUNT(*) as count FROM messages
        WHERE created_at > datetime('now', '-1 hour')
      `).get()?.count || 0;

      // Try to get task stats (table may not exist)
      let pendingTasks = 0;
      let failedTasks = 0;
      try {
        pendingTasks = db.prepare("SELECT COUNT(*) as count FROM swarm_tasks WHERE status = 'pending'").get()?.count || 0;
        failedTasks = db.prepare("SELECT COUNT(*) as count FROM swarm_tasks WHERE status = 'failed' AND updated_at > datetime('now', '-1 hour')").get()?.count || 0;
      } catch (e) {
        // swarm_tasks table may not exist
      }

      const platformList = connectedPlatforms.map(p => `  ${p.platform}: ${p.count} connected`).join('\n') || '  None connected';

      const now = new Date();
      const timeStr = now.toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur' });

      const message = [
        `Agents: ${activeAgents}/${totalAgents} active`,
        ``,
        `Platforms:`,
        platformList,
        ``,
        `Messages (1h): ${recentMessages}`,
        pendingTasks > 0 ? `Tasks Pending: ${pendingTasks}` : null,
        failedTasks > 0 ? `Tasks Failed (1h): ${failedTasks}` : null,
        ``,
        `Notifications today: ${this.dailyCount}/${this.dailyCap}`,
        `Time: ${timeStr}`,
      ].filter(Boolean).join('\n');

      await this.sendNotificationDirect({
        type: 'health_summary',
        title: 'Health Check',
        message,
        priority: 'low',
      });
    } catch (error) {
      logger.error(`Athena: Health summary error: ${error.message}`);
    }
  }

  /**
   * Create a _onIntermediateRespond callback that routes AI respond actions
   * to the master via sendNotificationDirect (instead of silently dropping them).
   */
  _createRespondCallback(contextLabel = 'Athena') {
    return async (responseMessage) => {
      if (!responseMessage || responseMessage.length < 2) return;
      await this.sendNotificationDirect({
        type: 'athena_response',
        title: contextLabel,
        message: responseMessage,
        priority: 'normal',
      });
    };
  }

  /**
   * Get a short monitoring summary string
   */
  getMonitoringSummary() {
    const db = getDatabase();
    const userId = this.athenaProfile?.user_id;
    if (!userId) return 'N/A';

    const totalAgents = db.prepare('SELECT COUNT(*) as count FROM agents WHERE user_id = ?').get(userId)?.count || 0;
    const platforms = db.prepare("SELECT COUNT(*) as count FROM platform_accounts WHERE user_id = ? AND status = 'connected'").get(userId)?.count || 0;

    return `${totalAgents} agents, ${platforms} connected platforms`;
  }

  /**
   * Enable/disable Athena
   */
  async setEnabled(enabled) {
    if (enabled && !this.isRunning) {
      await this.start();
    } else if (!enabled && this.isRunning) {
      await this.stop();
    }

    if (this.athenaProfile) {
      const db = getDatabase();
      db.prepare('UPDATE agentic_profiles SET status = ?, updated_at = datetime(\'now\') WHERE id = ?')
        .run(enabled ? 'active' : 'paused', this.athenaProfile.id);
    }
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      profileId: this.athenaProfile?.id || null,
      profileStatus: this.athenaProfile?.status || null,
      masterPhone: this.masterPhone,
      whatsappConnected: !!this.whatsappAccountId,
      whatsappAccountId: this.whatsappAccountId,
      responseAgentIds: [...this.responseAgentIds],
      responseAccountIds: [...this.responseAccountIds],
      ignoredNumbers: [...this.responsePlatformNumbers],
      dailyNotifications: this.dailyCount,
      dailyCap: this.dailyCap,
      queueLength: this.notificationQueue.length,
    };
  }
}

// Singleton
AthenaMonitorService._instance = null;

function getAthenaMonitorService() {
  return AthenaMonitorService.getInstance();
}

module.exports = {
  AthenaMonitorService,
  getAthenaMonitorService,
};
