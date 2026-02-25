/**
 * Master Notification Service
 * ============================
 * Handles sending notifications to master contacts (superiors) for agentic profiles.
 *
 * Notification Types:
 * - approval_needed: Action requires human approval
 * - approval_reminder: Reminder for pending approval
 * - daily_report: Daily summary of agent activities
 * - weekly_report: Weekly summary and metrics
 * - critical_error: Critical error occurred
 * - budget_warning: Approaching budget limit (80%)
 * - budget_exceeded: Budget limit reached
 * - task_completed: Important task completed
 * - out_of_scope: Attempted to contact someone outside scope
 * - test: Test notification
 */

const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('../database.cjs');
const { logger } = require('../logger.cjs');

class MasterNotificationService {
  constructor() {
    this.platformClients = {};
    this.ensureTable();
  }

  /**
   * Ensure the notifications table exists
   */
  ensureTable() {
    try {
      const db = getDatabase();
      db.exec(`
        CREATE TABLE IF NOT EXISTS agentic_master_notifications (
          id TEXT PRIMARY KEY,
          agentic_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          master_contact_id TEXT NOT NULL,
          notification_type TEXT NOT NULL,
          title TEXT NOT NULL,
          content TEXT NOT NULL,
          context TEXT DEFAULT '{}',
          channel TEXT DEFAULT 'email',
          delivery_status TEXT DEFAULT 'pending',
          delivery_attempts INTEGER DEFAULT 0,
          sent_at TEXT,
          delivered_at TEXT,
          read_at TEXT,
          action_required INTEGER DEFAULT 0,
          action_type TEXT,
          action_data TEXT,
          reference_type TEXT,
          reference_id TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now')),
          FOREIGN KEY (agentic_id) REFERENCES agentic_profiles(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_master_notif_agentic ON agentic_master_notifications(agentic_id);
        CREATE INDEX IF NOT EXISTS idx_master_notif_user ON agentic_master_notifications(user_id);
        CREATE INDEX IF NOT EXISTS idx_master_notif_master ON agentic_master_notifications(master_contact_id, delivery_status);
        CREATE INDEX IF NOT EXISTS idx_master_notif_status ON agentic_master_notifications(delivery_status);
      `);
    } catch (error) {
      // Table might already exist, that's okay
      if (!error.message.includes('already exists')) {
        logger.error(`MasterNotificationService table error: ${error.message}`);
      }
    }

    // Safe column migration for tables created before these columns existed
    const migrateDb = getDatabase();
    const columnsToEnsure = [
      { name: 'delivery_attempts', sql: 'ALTER TABLE agentic_master_notifications ADD COLUMN delivery_attempts INTEGER DEFAULT 0' },
      { name: 'action_required', sql: 'ALTER TABLE agentic_master_notifications ADD COLUMN action_required INTEGER DEFAULT 0' },
      { name: 'action_type', sql: 'ALTER TABLE agentic_master_notifications ADD COLUMN action_type TEXT' },
      { name: 'action_data', sql: 'ALTER TABLE agentic_master_notifications ADD COLUMN action_data TEXT' },
      { name: 'reference_type', sql: 'ALTER TABLE agentic_master_notifications ADD COLUMN reference_type TEXT' },
      { name: 'reference_id', sql: 'ALTER TABLE agentic_master_notifications ADD COLUMN reference_id TEXT' },
    ];
    for (const col of columnsToEnsure) {
      try {
        migrateDb.exec(col.sql);
        logger.info(`MasterNotificationService: Added missing column "${col.name}"`);
      } catch (e) {
        // "duplicate column name" = already exists, ignore
        if (!e.message.includes('duplicate column')) {
          logger.warn(`MasterNotificationService: Could not add column "${col.name}": ${e.message}`);
        }
      }
    }
  }

  /**
   * Set platform clients for sending messages
   */
  setPlatformClients(clients) {
    this.platformClients = clients;
  }

  /**
   * Get master contact configuration for a profile
   */
  async getMasterContact(agenticId, userId) {
    const db = getDatabase();

    const profile = db.prepare(`
      SELECT p.master_contact_id, p.master_contact_channel, p.notify_master_on,
             c.display_name, c.avatar
      FROM agentic_profiles p
      LEFT JOIN contacts c ON p.master_contact_id = c.id
      WHERE p.id = ? AND p.user_id = ?
    `).get(agenticId, userId);

    if (!profile || !profile.master_contact_id) {
      return null;
    }

    // Get contact identifiers for sending messages
    const identifiers = db.prepare(`
      SELECT identifier_type, identifier_value FROM contact_identifiers
      WHERE contact_id = ?
    `).all(profile.master_contact_id);

    return {
      contactId: profile.master_contact_id,
      channel: profile.master_contact_channel || 'email',
      displayName: profile.display_name,
      avatar: profile.avatar,
      notifyOn: JSON.parse(profile.notify_master_on || '[]'),
      identifiers: identifiers.reduce((acc, i) => {
        acc[i.identifier_type] = i.identifier_value;
        return acc;
      }, {}),
    };
  }

  /**
   * Check if notification type is enabled for this profile
   */
  isNotificationEnabled(masterContact, notificationType) {
    if (!masterContact?.notifyOn) return false;
    return masterContact.notifyOn.includes(notificationType);
  }

  /**
   * Send a notification to the master contact
   */
  async sendNotification({
    agenticId,
    userId,
    type,
    title,
    message,
    priority = 'normal',
    actionRequired = false,
    actionType = null,
    actionData = null,
    referenceType = null,
    referenceId = null,
    forceSend = false,
  }) {
    try {
      const masterContact = await this.getMasterContact(agenticId, userId);

      if (!masterContact) {
        logger.warn(`No master contact configured for agentic ${agenticId}`);
        return { success: false, error: 'No master contact configured' };
      }

      // Check if this notification type is enabled (unless forceSend)
      if (!forceSend && !this.isNotificationEnabled(masterContact, type)) {
        logger.debug(`Notification type ${type} not enabled for agentic ${agenticId}`);
        return { success: false, error: 'Notification type not enabled' };
      }

      const db = getDatabase();
      const notificationId = uuidv4();

      // Build context JSON (stores priority, action metadata)
      const contextJson = JSON.stringify({
        priority,
        actionRequired: actionRequired || false,
        actionType: actionType || null,
        actionData: actionData || null,
      });

      // Create notification record (uses 'content' column, matching migration schema)
      db.prepare(`
        INSERT INTO agentic_master_notifications (
          id, agentic_id, user_id, master_contact_id, notification_type,
          title, content, context, channel, delivery_status,
          action_required, action_type, action_data,
          reference_type, reference_id
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)
      `).run(
        notificationId,
        agenticId,
        userId,
        masterContact.contactId,
        type,
        title,
        message,
        contextJson,
        masterContact.channel,
        actionRequired ? 1 : 0,
        actionType,
        actionData ? JSON.stringify(actionData) : null,
        referenceType,
        referenceId
      );

      // Apply personality rewrite before delivery (original raw text already in DB)
      let deliveryMessage = message;
      try {
        const { applyPersonality } = require('./PersonalityRewriter.cjs');
        deliveryMessage = await applyPersonality({
          profileId: agenticId,
          userId,
          rawText: message,
          notificationType: type,
          tier: 'trivial',
          useCache: true,
        });
      } catch (personalityError) {
        // Non-fatal: use original message if personality rewrite fails
        logger.debug(`Personality rewrite skipped: ${personalityError.message}`);
      }

      // Attempt to deliver via configured channel (email/whatsapp/telegram)
      const deliveryResult = await this.deliverNotification(
        notificationId,
        masterContact,
        { title, message: deliveryMessage, type, priority, actionRequired }
      );

      // Also push to mobile devices (non-blocking, additional channel)
      this._pushToMobileDevices(userId, {
        alertType: type,
        title,
        body: deliveryMessage,
        priority,
        agenticId,
        referenceType,
        referenceId,
      });

      // Update delivery status
      if (deliveryResult.success) {
        db.prepare(`
          UPDATE agentic_master_notifications
          SET delivery_status = 'delivered', delivered_at = datetime('now'),
              delivery_attempts = delivery_attempts + 1
          WHERE id = ?
        `).run(notificationId);
      } else {
        db.prepare(`
          UPDATE agentic_master_notifications
          SET delivery_status = 'failed',
              delivery_attempts = delivery_attempts + 1
          WHERE id = ?
        `).run(notificationId);
        logger.warn(`Notification ${notificationId} delivery failed: ${deliveryResult.error || 'Unknown error'}`);
      }

      return {
        success: deliveryResult.success,
        notificationId,
        channel: masterContact.channel,
        error: deliveryResult.error,
      };

    } catch (error) {
      logger.error(`Failed to send master notification: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Deliver notification via the configured channel
   */
  async deliverNotification(notificationId, masterContact, content) {
    const { channel, identifiers, displayName } = masterContact;
    const { title, message, type, priority, actionRequired } = content;

    // Format message based on channel
    const formattedMessage = this.formatMessage(channel, {
      title,
      message,
      type,
      priority,
      actionRequired,
      recipientName: displayName,
    });

    try {
      switch (channel) {
        case 'email':
          return await this.sendEmail(identifiers.email, formattedMessage);

        case 'whatsapp':
          return await this.sendWhatsApp(identifiers.phone || identifiers.whatsapp, formattedMessage);

        case 'telegram':
          return await this.sendTelegram(identifiers.telegram, formattedMessage);

        default:
          logger.warn(`Unknown notification channel: ${channel}`);
          return { success: false, error: `Unknown channel: ${channel}` };
      }
    } catch (error) {
      logger.error(`Delivery failed for ${channel}: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Push notification to user's mobile devices via MobileAgentGateway.
   * Non-blocking — failures are logged but don't affect primary delivery.
   *
   * @param {string} userId
   * @param {Object} alertData - Passed directly to gateway.pushAlert()
   */
  _pushToMobileDevices(userId, alertData) {
    try {
      const { getMobileAgentGateway } = require('../MobileAgentGateway.cjs');
      const gateway = getMobileAgentGateway();

      const alertTypeMap = {
        approval_needed: 'approval_needed',
        approval_reminder: 'approval_needed',
        daily_report: 'daily_report',
        weekly_report: 'daily_report',
        critical_error: 'critical_error',
        budget_warning: 'budget_warning',
        budget_exceeded: 'budget_exceeded',
        task_completed: 'task_completed',
        out_of_scope: 'custom',
        test: 'test',
      };

      gateway.pushAlert(userId, {
        ...alertData,
        alertType: alertTypeMap[alertData.alertType] || 'custom',
      });
    } catch (e) {
      logger.debug(`[MasterNotification] Mobile push skipped: ${e.message}`);
    }
  }

  /**
   * Format message for the target channel
   */
  formatMessage(channel, { title, message, type, priority, actionRequired, recipientName }) {
    const priorityEmoji = {
      urgent: '🚨',
      high: '⚠️',
      normal: 'ℹ️',
      low: '📝',
    }[priority] || 'ℹ️';

    const typeLabel = {
      approval_needed: 'Approval Required',
      approval_reminder: 'Approval Reminder',
      daily_report: 'Daily Report',
      weekly_report: 'Weekly Report',
      critical_error: 'Critical Error',
      budget_warning: 'Budget Warning',
      budget_exceeded: 'Budget Exceeded',
      task_completed: 'Task Completed',
      out_of_scope: 'Out of Scope Alert',
      test: 'Test Notification',
    }[type] || type;

    if (channel === 'email') {
      return {
        subject: `${priorityEmoji} [SwarmAI] ${title}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #1e293b; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
              <h2 style="margin: 0; font-size: 18px;">${priorityEmoji} ${typeLabel}</h2>
            </div>
            <div style="background: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; border-top: none;">
              <h3 style="margin: 0 0 10px; color: #1e293b;">${title}</h3>
              <p style="color: #475569; line-height: 1.6;">${message}</p>
              ${actionRequired ? `
                <div style="margin-top: 20px; padding: 15px; background: #fef3c7; border-radius: 8px;">
                  <strong style="color: #92400e;">⚡ Action Required</strong>
                  <p style="color: #92400e; margin: 5px 0 0;">Please review and respond to this notification.</p>
                </div>
              ` : ''}
            </div>
            <div style="background: #f1f5f9; padding: 15px; border-radius: 0 0 8px 8px; text-align: center; color: #64748b; font-size: 12px;">
              Sent by SwarmAI Agentic System
            </div>
          </div>
        `,
        text: `${typeLabel}: ${title}\n\n${message}${actionRequired ? '\n\n⚡ ACTION REQUIRED' : ''}`,
      };
    }

    // WhatsApp / Telegram format
    return {
      text: `${priorityEmoji} *${typeLabel}*\n\n*${title}*\n\n${message}${actionRequired ? '\n\n⚡ *Action Required* - Please respond.' : ''}`,
    };
  }

  /**
   * Send email notification
   */
  async sendEmail(email, content) {
    if (!email) {
      return { success: false, error: 'No email address configured' };
    }

    // Use email client if available
    if (this.platformClients.email?.sendMail) {
      try {
        await this.platformClients.email.sendMail({
          to: email,
          subject: content.subject,
          html: content.html,
          text: content.text,
        });
        return { success: true };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }

    // Log for development
    logger.info(`[DEV] Email notification to ${email}: ${content.subject}`);
    return { success: true, simulated: true };
  }

  /**
   * Send WhatsApp notification
   */
  async sendWhatsApp(phone, content) {
    if (!phone) {
      return { success: false, error: 'No phone number configured' };
    }

    const chatId = phone.includes('@') ? phone : `${phone.replace(/\D/g, '')}@c.us`;

    // Path 1: Use injected WhatsApp client if available
    if (this.platformClients.whatsapp?.sendMessage) {
      try {
        await this.platformClients.whatsapp.sendMessage(chatId, content.text);
        return { success: true };
      } catch (error) {
        logger.warn(`[MasterNotification] Direct WhatsApp send failed: ${error.message}, trying AgentManager...`);
      }
    }

    // Path 2: Use AgentManager (standard message delivery path)
    try {
      const { AgentManager } = require('../../agents/agentManager.cjs');
      const agentManager = AgentManager?.getInstance?.();

      if (agentManager?.sendMessage) {
        // Find a connected WhatsApp account to send from
        const db = getDatabase();
        const acct = db.prepare(`
          SELECT id FROM platform_accounts
          WHERE platform = 'whatsapp' AND status = 'connected'
          LIMIT 1
        `).get();

        if (acct) {
          await agentManager.sendMessage(acct.id, chatId, content.text);
          logger.info(`[MasterNotification] WhatsApp notification sent via AgentManager to ${phone}`);
          return { success: true };
        }
        logger.warn('[MasterNotification] No connected WhatsApp account found');
      }
    } catch (amErr) {
      logger.warn(`[MasterNotification] AgentManager WhatsApp fallback failed: ${amErr.message}`);
    }

    // Path 3: Use DeliveryQueue as last resort
    try {
      const { getDeliveryQueueService } = require('../deliveryQueueService.cjs');
      const dq = getDeliveryQueueService();
      if (dq) {
        const db = getDatabase();
        const acct = db.prepare(`
          SELECT id FROM platform_accounts
          WHERE platform = 'whatsapp' AND status = 'connected'
          LIMIT 1
        `).get();

        if (acct) {
          await dq.enqueue({
            accountId: acct.id,
            recipient: chatId,
            platform: 'whatsapp',
            content: content.text,
            source: 'master_notification',
          });
          logger.info(`[MasterNotification] WhatsApp notification queued via DLQ to ${phone}`);
          return { success: true, queued: true };
        }
      }
    } catch (dqErr) {
      logger.warn(`[MasterNotification] DLQ fallback failed: ${dqErr.message}`);
    }

    logger.warn(`[MasterNotification] All WhatsApp delivery paths failed for ${phone}`);
    return { success: false, error: 'No WhatsApp delivery path available' };
  }

  /**
   * Send Telegram notification
   */
  async sendTelegram(chatId, content) {
    if (!chatId) {
      return { success: false, error: 'No Telegram chat ID configured' };
    }

    // Use Telegram client if available
    if (this.platformClients.telegram?.sendMessage) {
      try {
        await this.platformClients.telegram.sendMessage(chatId, content.text, {
          parse_mode: 'Markdown',
        });
        return { success: true };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }

    // Log for development
    logger.info(`[DEV] Telegram notification to ${chatId}: ${content.text.substring(0, 100)}...`);
    return { success: true, simulated: true };
  }

  /**
   * Send a test notification
   */
  async sendTestNotification(agenticId, userId, channel) {
    return this.sendNotification({
      agenticId,
      userId,
      type: 'test',
      title: 'Test Notification',
      message: 'This is a test notification from your SwarmAI Agentic Agent. If you received this message, notifications are working correctly!',
      priority: 'normal',
      forceSend: true, // Bypass notification type check
    });
  }

  /**
   * Send approval request notification
   */
  async sendApprovalRequest(agenticId, userId, approvalData) {
    return this.sendNotification({
      agenticId,
      userId,
      type: 'approval_needed',
      title: `Approval Required: ${approvalData.actionType}`,
      message: `Your AI agent "${approvalData.agentName}" wants to perform the following action:\n\n${approvalData.description}\n\nReason: ${approvalData.reason || 'No reason provided'}`,
      priority: 'high',
      actionRequired: true,
      actionType: 'approve_action',
      actionData: {
        approvalId: approvalData.approvalId,
        actionType: approvalData.actionType,
      },
      referenceType: 'approval',
      referenceId: approvalData.approvalId,
    });
  }

  /**
   * Send daily report notification
   */
  async sendDailyReport(agenticId, userId, reportData) {
    const { agentName, stats, highlights } = reportData;

    const message = `
📊 Daily Activity Summary for ${agentName}

Messages Processed: ${stats.messagesProcessed || 0}
Tasks Completed: ${stats.tasksCompleted || 0}
Approvals Pending: ${stats.approvalsPending || 0}
Budget Used: $${(stats.budgetUsed || 0).toFixed(2)}

${highlights?.length ? `\n📌 Highlights:\n${highlights.map(h => `• ${h}`).join('\n')}` : ''}
    `.trim();

    return this.sendNotification({
      agenticId,
      userId,
      type: 'daily_report',
      title: `Daily Report: ${agentName}`,
      message,
      priority: 'normal',
    });
  }

  /**
   * Send critical error notification
   */
  async sendCriticalError(agenticId, userId, errorData) {
    return this.sendNotification({
      agenticId,
      userId,
      type: 'critical_error',
      title: `Critical Error: ${errorData.errorType || 'Unknown Error'}`,
      message: `A critical error occurred in your AI agent:\n\n${errorData.message}\n\nContext: ${errorData.context || 'No context available'}`,
      priority: 'urgent',
      actionRequired: true,
      referenceType: 'error',
      referenceId: errorData.errorId,
    });
  }

  /**
   * Send budget warning notification
   */
  async sendBudgetWarning(agenticId, userId, budgetData) {
    const percentage = ((budgetData.used / budgetData.limit) * 100).toFixed(1);

    return this.sendNotification({
      agenticId,
      userId,
      type: budgetData.exceeded ? 'budget_exceeded' : 'budget_warning',
      title: budgetData.exceeded ? 'Budget Limit Exceeded' : 'Budget Warning',
      message: `Your AI agent has ${budgetData.exceeded ? 'exceeded' : 'reached ' + percentage + '% of'} its daily budget.\n\nUsed: $${budgetData.used.toFixed(2)}\nLimit: $${budgetData.limit.toFixed(2)}\n\n${budgetData.exceeded ? 'The agent has been paused. Please increase the limit or wait until tomorrow.' : 'Consider reviewing the agent\'s activities.'}`,
      priority: budgetData.exceeded ? 'urgent' : 'high',
      actionRequired: budgetData.exceeded,
    });
  }

  /**
   * Get notification history for a profile
   */
  async getNotificationHistory(agenticId, userId, options = {}) {
    const { limit = 50, offset = 0, type = null, status = null } = options;

    const db = getDatabase();

    let query = `
      SELECT n.*, c.display_name as contact_name
      FROM agentic_master_notifications n
      LEFT JOIN contacts c ON n.master_contact_id = c.id
      WHERE n.agentic_id = ? AND n.user_id = ?
    `;
    const params = [agenticId, userId];

    if (type) {
      query += ' AND n.notification_type = ?';
      params.push(type);
    }

    if (status) {
      query += ' AND n.delivery_status = ?';
      params.push(status);
    }

    query += ' ORDER BY n.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const notifications = db.prepare(query).all(...params);

    const total = db.prepare(`
      SELECT COUNT(*) as count
      FROM agentic_master_notifications
      WHERE agentic_id = ? AND user_id = ?
      ${type ? 'AND notification_type = ?' : ''}
      ${status ? 'AND delivery_status = ?' : ''}
    `).get(
      agenticId,
      userId,
      ...(type ? [type] : []),
      ...(status ? [status] : [])
    ).count;

    return {
      notifications: notifications.map(n => {
        const ctx = JSON.parse(n.context || '{}');
        return {
          id: n.id,
          agenticId: n.agentic_id,
          masterContactId: n.master_contact_id,
          notificationType: n.notification_type,
          type: n.notification_type,
          title: n.title,
          message: n.content,
          priority: ctx.priority || 'normal',
          channel: n.channel,
          deliveryStatus: n.delivery_status,
          status: n.delivery_status,
          deliveryAttempts: 0,
          deliveredAt: n.delivered_at ? n.delivered_at + 'Z' : null,
          readAt: n.read_at ? n.read_at + 'Z' : null,
          actionRequired: !!ctx.actionRequired,
          actionType: ctx.actionType || null,
          contactName: n.contact_name,
          createdAt: n.created_at ? n.created_at + 'Z' : null,
        };
      }),
      total,
      limit,
      offset,
    };
  }
}

// Singleton instance
const masterNotificationService = new MasterNotificationService();

module.exports = {
  MasterNotificationService,
  masterNotificationService,
};
