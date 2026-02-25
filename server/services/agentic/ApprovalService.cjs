/**
 * Approval Service
 *
 * Manages the Agentic Approval Workflow system for human-in-the-loop approvals.
 * Handles approval queue, contact scope verification, and master notifications.
 *
 * Key features:
 * - Approval queue management (create, list, approve, reject)
 * - Contact scope checking (whitelist/blacklist verification)
 * - Master contact notifications via WhatsApp, Telegram, Email
 * - Approval reply processing from chat messages
 * - Expiry handling for stale approvals
 */

const crypto = require('crypto');
const { getDatabase } = require('../database.cjs');
const { logger } = require('../logger.cjs');

// Lazy-load platform clients to avoid circular dependencies
let _whatsappManager = null;
let _telegramManager = null;
let _emailManager = null;

function getWhatsAppManager() {
  if (!_whatsappManager) {
    try {
      const { WhatsAppManager } = require('../../platforms/whatsappClient.cjs');
      _whatsappManager = WhatsAppManager.getInstance();
    } catch (e) {
      logger.debug('WhatsApp manager not available');
    }
  }
  return _whatsappManager;
}

function getTelegramManager() {
  if (!_telegramManager) {
    try {
      const { TelegramBotManager } = require('../../platforms/telegramBotClient.cjs');
      _telegramManager = TelegramBotManager.getInstance();
    } catch (e) {
      logger.debug('Telegram manager not available');
    }
  }
  return _telegramManager;
}

function getEmailManager() {
  if (!_emailManager) {
    try {
      const { EmailManager } = require('../../platforms/emailClient.cjs');
      _emailManager = EmailManager.getInstance();
    } catch (e) {
      logger.debug('Email manager not available');
    }
  }
  return _emailManager;
}

/**
 * ApprovalService Class
 * Manages approvals, notifications, and contact scope for Agentic AI
 */
class ApprovalService {
  constructor(db = null) {
    this.db = db;
  }

  /**
   * Get database instance (lazy initialization)
   * @returns {Object} Database instance
   */
  getDb() {
    if (!this.db) {
      this.db = getDatabase();
    }
    return this.db;
  }

  // =====================================================
  // APPROVAL QUEUE OPERATIONS
  // =====================================================

  /**
   * Create a new approval request
   * @param {string} agenticId - Agentic profile ID
   * @param {string} userId - Owner user ID
   * @param {Object} data - Approval data
   * @param {string} data.actionType - Type of action needing approval
   * @param {string} data.actionTitle - Human-readable title
   * @param {string} data.actionDescription - Detailed description
   * @param {Object} data.payload - JSON payload with action details
   * @param {string} data.triggeredBy - What triggered this (e.g., 'schedule', 'message', 'agent')
   * @param {Object} data.triggerContext - Additional context
   * @param {number} data.confidenceScore - AI confidence (0-1)
   * @param {string} data.reasoning - AI reasoning for this action
   * @param {string} data.priority - Priority level ('low', 'normal', 'high', 'urgent')
   * @param {Date|string} data.expiresAt - When this approval expires
   * @returns {Object} Created approval
   */
  createApproval(agenticId, userId, data) {
    const db = this.getDb();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    try {
      // Get the agentic profile to find master contact
      const profile = db.prepare(`
        SELECT master_contact_id, master_contact_channel, escalation_timeout_minutes
        FROM agentic_profiles
        WHERE id = ? AND user_id = ?
      `).get(agenticId, userId);

      if (!profile) {
        throw new Error('Agentic profile not found');
      }

      if (!profile.master_contact_id) {
        throw new Error('No master contact configured for this agentic profile');
      }

      // Calculate expiry if not provided
      const expiresAt = data.expiresAt ||
        new Date(Date.now() + (profile.escalation_timeout_minutes || 60) * 60 * 1000).toISOString();

      const stmt = db.prepare(`
        INSERT INTO agentic_approval_queue (
          id, agentic_id, user_id,
          action_type, action_title, action_description, action_payload,
          triggered_by, trigger_context, confidence_score, reasoning,
          master_contact_id, notification_channel,
          status, priority, expires_at, created_at
        ) VALUES (
          ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?,
          'pending', ?, ?, ?
        )
      `);

      stmt.run(
        id,
        agenticId,
        userId,
        data.actionType,
        data.actionTitle || data.actionType,
        data.actionDescription || null,
        JSON.stringify(data.payload || {}),
        data.triggeredBy || 'agent',
        JSON.stringify(data.triggerContext || {}),
        data.confidenceScore || null,
        data.reasoning || null,
        profile.master_contact_id,
        profile.master_contact_channel || 'email',
        data.priority || 'normal',
        expiresAt,
        now
      );

      logger.info(`Created approval request: ${id} for agentic ${agenticId}`);

      const approval = this.getApproval(id, userId);

      // Notify master contact asynchronously
      this.notifyMaster(agenticId, {
        type: 'approval_needed',
        title: `Approval Required: ${data.actionTitle || data.actionType}`,
        message: this.formatApprovalMessage(approval),
        approvalId: id,
        urgency: data.priority || 'normal'
      }).catch(err => {
        logger.error(`Failed to notify master for approval ${id}: ${err.message}`);
      });

      return approval;
    } catch (error) {
      logger.error(`Failed to create approval: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * Get a single approval by ID
   * @param {string} approvalId - Approval ID
   * @param {string} userId - Owner user ID for verification
   * @returns {Object|null} Approval or null
   */
  getApproval(approvalId, userId) {
    const db = this.getDb();

    try {
      const row = db.prepare(`
        SELECT * FROM agentic_approval_queue
        WHERE id = ? AND user_id = ?
      `).get(approvalId, userId);

      if (!row) {
        return null;
      }

      return this.transformApproval(row);
    } catch (error) {
      logger.error(`Failed to get approval: ${error.message}`);
      return null;
    }
  }

  /**
   * List pending approvals for an agentic profile
   * @param {string} agenticId - Agentic profile ID
   * @param {string} userId - Owner user ID
   * @param {Object} filters - Filter options
   * @param {string} filters.status - Filter by status (default: 'pending')
   * @param {string} filters.actionType - Filter by action type
   * @param {string} filters.startDate - Filter by start date
   * @param {string} filters.priority - Filter by priority
   * @param {number} filters.limit - Limit results (default: 50)
   * @param {number} filters.offset - Offset for pagination (default: 0)
   * @returns {Object} { approvals, total, hasMore }
   */
  listPendingApprovals(agenticId, userId, filters = {}) {
    const db = this.getDb();
    const {
      status = 'pending',
      actionType,
      startDate,
      priority,
      limit = 50,
      offset = 0
    } = filters;

    try {
      let whereClause = 'WHERE agentic_id = ? AND user_id = ?';
      const params = [agenticId, userId];

      if (status) {
        whereClause += ' AND status = ?';
        params.push(status);
      }

      if (actionType) {
        whereClause += ' AND action_type = ?';
        params.push(actionType);
      }

      if (startDate) {
        whereClause += ' AND created_at >= ?';
        params.push(startDate);
      }

      if (priority) {
        whereClause += ' AND priority = ?';
        params.push(priority);
      }

      // Get total count
      const countRow = db.prepare(`
        SELECT COUNT(*) as total FROM agentic_approval_queue ${whereClause}
      `).get(...params);
      const total = countRow?.total || 0;

      // Get paginated results
      const rows = db.prepare(`
        SELECT * FROM agentic_approval_queue
        ${whereClause}
        ORDER BY
          CASE priority
            WHEN 'urgent' THEN 1
            WHEN 'high' THEN 2
            WHEN 'normal' THEN 3
            WHEN 'low' THEN 4
          END,
          created_at DESC
        LIMIT ? OFFSET ?
      `).all(...params, limit, offset);

      const approvals = rows.map(row => this.transformApproval(row));

      return {
        approvals,
        total,
        hasMore: offset + approvals.length < total
      };
    } catch (error) {
      logger.error(`Failed to list approvals: ${error.message}`);
      return { approvals: [], total: 0, hasMore: false };
    }
  }

  /**
   * Approve an action
   * @param {string} approvalId - Approval ID
   * @param {string} userId - User ID performing the approval
   * @param {string} notes - Optional notes
   * @param {Object} modifiedPayload - Optional modified payload
   * @returns {Object} Approved approval with payload for execution
   */
  approveAction(approvalId, userId, notes = null, modifiedPayload = null) {
    const db = this.getDb();
    const now = new Date().toISOString();

    try {
      // Get the approval first
      const approval = db.prepare(`
        SELECT * FROM agentic_approval_queue
        WHERE id = ? AND user_id = ? AND status = 'pending'
      `).get(approvalId, userId);

      if (!approval) {
        throw new Error('Approval not found or already processed');
      }

      // Check if expired
      if (approval.expires_at && new Date(approval.expires_at) < new Date()) {
        // Mark as expired instead
        db.prepare(`
          UPDATE agentic_approval_queue
          SET status = 'expired', resolved_at = ?
          WHERE id = ?
        `).run(now, approvalId);
        throw new Error('Approval has expired');
      }

      // Update the approval status
      db.prepare(`
        UPDATE agentic_approval_queue
        SET
          status = 'approved',
          resolved_by = ?,
          resolved_at = ?,
          resolution_notes = ?,
          modified_payload = ?
        WHERE id = ?
      `).run(
        userId,
        now,
        notes,
        modifiedPayload ? JSON.stringify(modifiedPayload) : null,
        approvalId
      );

      logger.info(`Approval ${approvalId} approved by user ${userId}`);

      // Log activity
      this.logActivity(approval.agentic_id, userId, {
        activityType: 'approval_approved',
        description: `Approved: ${approval.action_title}`,
        triggerId: approvalId,
        metadata: { notes }
      });

      return this.getApproval(approvalId, userId);
    } catch (error) {
      logger.error(`Failed to approve action: ${error.message}`);
      throw error;
    }
  }

  /**
   * Reject an action
   * @param {string} approvalId - Approval ID
   * @param {string} userId - User ID performing the rejection
   * @param {string} reason - Rejection reason
   * @returns {Object} Rejected approval
   */
  rejectAction(approvalId, userId, reason = null) {
    const db = this.getDb();
    const now = new Date().toISOString();

    try {
      // Get the approval first
      const approval = db.prepare(`
        SELECT * FROM agentic_approval_queue
        WHERE id = ? AND user_id = ? AND status = 'pending'
      `).get(approvalId, userId);

      if (!approval) {
        throw new Error('Approval not found or already processed');
      }

      // Update the approval status
      db.prepare(`
        UPDATE agentic_approval_queue
        SET
          status = 'rejected',
          resolved_by = ?,
          resolved_at = ?,
          resolution_notes = ?
        WHERE id = ?
      `).run(userId, now, reason, approvalId);

      logger.info(`Approval ${approvalId} rejected by user ${userId}`);

      // Log activity
      this.logActivity(approval.agentic_id, userId, {
        activityType: 'approval_rejected',
        description: `Rejected: ${approval.action_title}`,
        triggerId: approvalId,
        metadata: { reason }
      });

      return this.getApproval(approvalId, userId);
    } catch (error) {
      logger.error(`Failed to reject action: ${error.message}`);
      throw error;
    }
  }

  // =====================================================
  // CONTACT SCOPE OPERATIONS
  // =====================================================

  /**
   * Check if a contact is within the allowed scope for an agentic profile
   * @param {string} agenticId - Agentic profile ID
   * @param {string} contactId - Contact ID to check
   * @param {string} userId - Owner user ID
   * @returns {Object} { allowed: boolean, requiresApproval: boolean, reason: string }
   */
  checkContactScope(agenticId, contactId, userId, platformAccountId) {
    const db = this.getDb();

    try {
      // Get contact scope settings (per-platform cascade)
      let scope = null;
      if (platformAccountId) {
        scope = db.prepare(`
          SELECT * FROM agentic_contact_scope
          WHERE agentic_id = ? AND platform_account_id = ?
        `).get(agenticId, platformAccountId);
      }
      if (!scope) {
        scope = db.prepare(`
          SELECT * FROM agentic_contact_scope
          WHERE agentic_id = ? AND platform_account_id IS NULL
        `).get(agenticId);
      }

      // If no scope configured, default to team_only
      if (!scope) {
        return this.checkDefaultScope(agenticId, contactId, userId);
      }

      // Get the contact details
      const contact = db.prepare(`
        SELECT c.*, ci.identifier_type, ci.identifier_value
        FROM contacts c
        LEFT JOIN contact_identifiers ci ON c.id = ci.contact_id
        WHERE c.id = ? AND c.user_id = ?
      `).get(contactId, userId);

      if (!contact) {
        return {
          allowed: false,
          requiresApproval: scope.notify_on_out_of_scope === 1,
          reason: 'Contact not found'
        };
      }

      // Check master contact (always allowed if enabled)
      if (scope.allow_master_contact === 1) {
        const profile = db.prepare(`
          SELECT master_contact_id FROM agentic_profiles WHERE id = ?
        `).get(agenticId);
        if (profile?.master_contact_id === contactId) {
          return { allowed: true, requiresApproval: false, reason: 'Master contact' };
        }
      }

      // Check team members (always allowed if enabled)
      if (scope.allow_team_members === 1) {
        const isTeamMember = db.prepare(`
          SELECT 1 FROM agentic_team_members
          WHERE agentic_id = ? AND contact_id = ? AND is_active = 1
        `).get(agenticId, contactId);
        if (isTeamMember) {
          return { allowed: true, requiresApproval: false, reason: 'Team member' };
        }
      }

      // Check based on scope type
      const scopeType = scope.scope_type || 'team_only';

      switch (scopeType) {
        case 'unrestricted':
          return { allowed: true, requiresApproval: false, reason: 'Unrestricted scope' };

        case 'all_user_contacts':
          // Any contact belonging to the user is allowed
          return { allowed: true, requiresApproval: false, reason: 'User contact' };

        case 'contacts_whitelist':
          // Check if contact is in whitelist
          const whitelistIds = this.parseJson(scope.whitelist_contact_ids) || [];
          if (whitelistIds.includes(contactId)) {
            return { allowed: true, requiresApproval: false, reason: 'Whitelisted contact' };
          }
          return {
            allowed: false,
            requiresApproval: scope.notify_on_out_of_scope === 1,
            reason: 'Contact not in whitelist'
          };

        case 'contacts_tags':
          // Check if contact has any allowed tags
          const allowedTags = this.parseJson(scope.whitelist_tags) || [];
          const contactTags = this.parseJson(contact.tags) || [];
          const hasAllowedTag = contactTags.some(tag => allowedTags.includes(tag));
          if (hasAllowedTag) {
            return { allowed: true, requiresApproval: false, reason: 'Contact has allowed tag' };
          }
          return {
            allowed: false,
            requiresApproval: scope.notify_on_out_of_scope === 1,
            reason: 'Contact does not have allowed tags'
          };

        case 'team_only':
        default:
          // Only team members are allowed (already checked above)
          return {
            allowed: false,
            requiresApproval: scope.notify_on_out_of_scope === 1,
            reason: 'Contact is not a team member'
          };
      }
    } catch (error) {
      logger.error(`Failed to check contact scope: ${error.message}`);
      return {
        allowed: false,
        requiresApproval: true,
        reason: `Error checking scope: ${error.message}`
      };
    }
  }

  /**
   * Check default scope when no explicit scope is configured
   */
  checkDefaultScope(agenticId, contactId, userId) {
    const db = this.getDb();

    // Default: only team members and master contact
    const profile = db.prepare(`
      SELECT master_contact_id FROM agentic_profiles WHERE id = ?
    `).get(agenticId);

    if (profile?.master_contact_id === contactId) {
      return { allowed: true, requiresApproval: false, reason: 'Master contact (default scope)' };
    }

    const isTeamMember = db.prepare(`
      SELECT 1 FROM agentic_team_members
      WHERE agentic_id = ? AND contact_id = ? AND is_active = 1
    `).get(agenticId, contactId);

    if (isTeamMember) {
      return { allowed: true, requiresApproval: false, reason: 'Team member (default scope)' };
    }

    return {
      allowed: false,
      requiresApproval: true,
      reason: 'Contact not in default scope (team members and master only)'
    };
  }

  // =====================================================
  // MASTER NOTIFICATION OPERATIONS
  // =====================================================

  /**
   * Send notification to master contact
   * @param {string} agenticId - Agentic profile ID
   * @param {Object} notification - Notification data
   * @param {string} notification.type - Notification type
   * @param {string} notification.title - Title
   * @param {string} notification.message - Message content
   * @param {string} notification.approvalId - Related approval ID
   * @param {string} notification.urgency - Urgency level
   * @returns {Object} Notification result
   */
  async notifyMaster(agenticId, notification) {
    const db = this.getDb();

    try {
      // Get profile and master contact info
      const profile = db.prepare(`
        SELECT ap.*, c.display_name as master_name,
               ci.identifier_type, ci.identifier_value
        FROM agentic_profiles ap
        LEFT JOIN contacts c ON ap.master_contact_id = c.id
        LEFT JOIN contact_identifiers ci ON c.id = ci.contact_id
          AND ci.identifier_type = CASE ap.master_contact_channel
            WHEN 'whatsapp' THEN 'phone'
            WHEN 'telegram' THEN 'telegram'
            WHEN 'email' THEN 'email'
          END
        WHERE ap.id = ?
      `).get(agenticId);

      if (!profile) {
        throw new Error('Agentic profile not found');
      }

      if (!profile.master_contact_id) {
        logger.warn(`No master contact configured for agentic ${agenticId}`);
        return { sent: false, reason: 'No master contact' };
      }

      const channel = profile.master_contact_channel || 'email';
      const notificationId = crypto.randomUUID();

      // Create notification record
      db.prepare(`
        INSERT INTO agentic_master_notifications (
          id, agentic_id, user_id, master_contact_id,
          notification_type, title, content, context,
          channel, delivery_status, reference_type, reference_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
      `).run(
        notificationId,
        agenticId,
        profile.user_id,
        profile.master_contact_id,
        notification.type,
        notification.title,
        notification.message,
        JSON.stringify({ urgency: notification.urgency }),
        channel,
        notification.approvalId ? 'approval' : null,
        notification.approvalId || null
      );

      // Send via the configured channel
      let result = { sent: false };

      try {
        switch (channel) {
          case 'whatsapp':
            result = await this.sendWhatsAppNotification(
              profile.identifier_value,
              notification,
              profile.user_id
            );
            break;

          case 'telegram':
            result = await this.sendTelegramNotification(
              profile.identifier_value,
              notification,
              profile.user_id
            );
            break;

          case 'email':
          default:
            result = await this.sendEmailNotification(
              profile.identifier_value,
              notification,
              profile.user_id
            );
            break;
        }
      } catch (sendError) {
        logger.error(`Failed to send ${channel} notification: ${sendError.message}`);
        result = { sent: false, error: sendError.message };
      }

      // Update notification status
      const status = result.sent ? 'sent' : 'failed';
      db.prepare(`
        UPDATE agentic_master_notifications
        SET delivery_status = ?, sent_at = ?, error_message = ?
        WHERE id = ?
      `).run(
        status,
        result.sent ? new Date().toISOString() : null,
        result.error || null,
        notificationId
      );

      // Update approval notification count if applicable
      if (notification.approvalId) {
        db.prepare(`
          UPDATE agentic_approval_queue
          SET notification_sent_at = COALESCE(notification_sent_at, ?),
              notification_count = notification_count + 1
          WHERE id = ?
        `).run(new Date().toISOString(), notification.approvalId);
      }

      return {
        notificationId,
        channel,
        ...result
      };
    } catch (error) {
      logger.error(`Failed to notify master: ${error.message}`);
      throw error;
    }
  }

  /**
   * Send WhatsApp notification
   */
  async sendWhatsAppNotification(phone, notification, userId) {
    const manager = getWhatsAppManager();
    if (!manager) {
      return { sent: false, error: 'WhatsApp not available' };
    }

    try {
      // Find connected WhatsApp account for this user
      const db = this.getDb();
      const account = db.prepare(`
        SELECT id FROM platform_accounts
        WHERE user_id = ? AND platform = 'whatsapp' AND status = 'connected'
        LIMIT 1
      `).get(userId);

      if (!account) {
        return { sent: false, error: 'No connected WhatsApp account' };
      }

      const client = manager.getClient(account.id);
      if (!client || client.getStatus() !== 'connected') {
        return { sent: false, error: 'WhatsApp client not connected' };
      }

      // Format phone number for WhatsApp
      const chatId = phone.replace(/\D/g, '') + '@c.us';
      await client.sendMessage(chatId, this.formatNotificationText(notification));

      return { sent: true };
    } catch (error) {
      return { sent: false, error: error.message };
    }
  }

  /**
   * Send Telegram notification
   */
  async sendTelegramNotification(chatId, notification, userId) {
    const manager = getTelegramManager();
    if (!manager) {
      return { sent: false, error: 'Telegram not available' };
    }

    try {
      // Find connected Telegram bot for this user
      const db = this.getDb();
      const account = db.prepare(`
        SELECT id FROM platform_accounts
        WHERE user_id = ? AND platform = 'telegram-bot' AND status = 'connected'
        LIMIT 1
      `).get(userId);

      if (!account) {
        return { sent: false, error: 'No connected Telegram bot' };
      }

      const client = manager.getClient(account.id);
      if (!client || client.getStatus() !== 'connected') {
        return { sent: false, error: 'Telegram bot not connected' };
      }

      await client.sendMessage(chatId, this.formatNotificationText(notification));

      return { sent: true };
    } catch (error) {
      return { sent: false, error: error.message };
    }
  }

  /**
   * Send Email notification
   */
  async sendEmailNotification(email, notification, userId) {
    const manager = getEmailManager();
    if (!manager) {
      return { sent: false, error: 'Email not available' };
    }

    try {
      // Find connected email account for this user
      const db = this.getDb();
      const account = db.prepare(`
        SELECT id FROM platform_accounts
        WHERE user_id = ? AND platform = 'email' AND status = 'connected'
        LIMIT 1
      `).get(userId);

      if (!account) {
        return { sent: false, error: 'No connected email account' };
      }

      const client = manager.getClient(account.id);
      if (!client || client.getStatus() !== 'connected') {
        return { sent: false, error: 'Email client not connected' };
      }

      await client.sendEmail(
        email,
        `[SwarmAI] ${notification.title}`,
        this.formatNotificationEmail(notification),
        { isHtml: true }
      );

      return { sent: true };
    } catch (error) {
      return { sent: false, error: error.message };
    }
  }

  // =====================================================
  // REPLY HANDLING
  // =====================================================

  /**
   * Process an approval reply from chat message
   * @param {string} contactId - Contact ID who sent the reply
   * @param {string} message - The reply message text
   * @param {string} userId - User ID context
   * @returns {Object} Processing result
   */
  async processApprovalReply(contactId, message, userId) {
    const db = this.getDb();
    const text = message.toLowerCase().trim();

    try {
      // Parse message for approval keywords
      const approveMatch = text.match(/^(approve|yes|ok|confirm)(?:\s+#?(\d+|[a-f0-9-]+))?$/i);
      const rejectMatch = text.match(/^(reject|no|deny|decline)(?:\s+#?(\d+|[a-f0-9-]+))?(?:\s+(.+))?$/i);

      if (!approveMatch && !rejectMatch) {
        return { processed: false, reason: 'No approval command found' };
      }

      // Find pending approval for this contact
      let approval;
      const specificId = (approveMatch?.[2] || rejectMatch?.[2]);

      if (specificId) {
        // Looking for specific approval
        approval = db.prepare(`
          SELECT * FROM agentic_approval_queue
          WHERE (id = ? OR id LIKE ?)
            AND master_contact_id = ?
            AND status = 'pending'
            AND user_id = ?
        `).get(specificId, `%${specificId}%`, contactId, userId);
      } else {
        // Get most recent pending approval for this contact
        approval = db.prepare(`
          SELECT * FROM agentic_approval_queue
          WHERE master_contact_id = ?
            AND status = 'pending'
            AND user_id = ?
          ORDER BY created_at DESC
          LIMIT 1
        `).get(contactId, userId);
      }

      if (!approval) {
        return { processed: false, reason: 'No pending approval found' };
      }

      // Process approval or rejection
      if (approveMatch) {
        const result = this.approveAction(approval.id, userId, 'Approved via chat reply');
        return {
          processed: true,
          action: 'approved',
          approval: result
        };
      } else {
        const reason = rejectMatch[3] || 'Rejected via chat reply';
        const result = this.rejectAction(approval.id, userId, reason);
        return {
          processed: true,
          action: 'rejected',
          approval: result
        };
      }
    } catch (error) {
      logger.error(`Failed to process approval reply: ${error.message}`);
      return { processed: false, error: error.message };
    }
  }

  // =====================================================
  // EXPIRY HANDLING
  // =====================================================

  /**
   * Process expired approvals
   * @returns {Object} Processing result with count
   */
  async processExpiredApprovals() {
    const db = this.getDb();
    const now = new Date().toISOString();

    try {
      // Find expired approvals
      const expired = db.prepare(`
        SELECT * FROM agentic_approval_queue
        WHERE status = 'pending'
          AND expires_at IS NOT NULL
          AND expires_at < ?
      `).all(now);

      if (expired.length === 0) {
        return { processed: 0 };
      }

      // Update status to expired
      const updateStmt = db.prepare(`
        UPDATE agentic_approval_queue
        SET status = 'expired', resolved_at = ?
        WHERE id = ?
      `);

      for (const approval of expired) {
        updateStmt.run(now, approval.id);

        // Log activity
        this.logActivity(approval.agentic_id, approval.user_id, {
          activityType: 'approval_expired',
          description: `Approval expired: ${approval.action_title}`,
          triggerId: approval.id
        });

        // Notify agentic profile of expired approval
        this.notifyMaster(approval.agentic_id, {
          type: 'status_update',
          title: `Approval Expired: ${approval.action_title}`,
          message: `The approval request "${approval.action_title}" has expired without a response.`,
          urgency: 'low'
        }).catch(err => {
          logger.warn(`Failed to notify about expired approval: ${err.message}`);
        });
      }

      logger.info(`Processed ${expired.length} expired approvals`);
      return { processed: expired.length };
    } catch (error) {
      logger.error(`Failed to process expired approvals: ${error.message}`);
      return { processed: 0, error: error.message };
    }
  }

  // =====================================================
  // HELPER METHODS
  // =====================================================

  /**
   * Log an activity
   */
  logActivity(agenticId, userId, data) {
    try {
      const db = this.getDb();
      const id = crypto.randomUUID();

      db.prepare(`
        INSERT INTO agentic_activity_log (
          id, agentic_id, user_id,
          activity_type, activity_description,
          trigger_type, trigger_id, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        agenticId,
        userId,
        data.activityType,
        data.description,
        data.triggerType || null,
        data.triggerId || null,
        JSON.stringify(data.metadata || {})
      );
    } catch (error) {
      logger.warn(`Failed to log activity: ${error.message}`);
    }
  }

  /**
   * Transform database row to camelCase object
   */
  transformApproval(row) {
    if (!row) return null;

    return {
      id: row.id,
      agenticId: row.agentic_id,
      userId: row.user_id,
      actionType: row.action_type,
      actionTitle: row.action_title,
      actionDescription: row.action_description,
      payload: this.parseJson(row.action_payload),
      triggeredBy: row.triggered_by,
      triggerContext: this.parseJson(row.trigger_context),
      confidenceScore: row.confidence_score,
      reasoning: row.reasoning,
      masterContactId: row.master_contact_id,
      notificationChannel: row.notification_channel,
      notificationSentAt: row.notification_sent_at,
      notificationCount: row.notification_count,
      status: row.status,
      priority: row.priority,
      resolvedBy: row.resolved_by,
      resolvedAt: row.resolved_at,
      resolutionNotes: row.resolution_notes,
      modifiedPayload: this.parseJson(row.modified_payload),
      expiresAt: row.expires_at,
      createdAt: row.created_at
    };
  }

  /**
   * Parse JSON safely
   */
  parseJson(value) {
    if (!value) return null;
    if (typeof value === 'object') return value;
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  /**
   * Format approval message for notifications
   */
  formatApprovalMessage(approval) {
    const lines = [
      `Action: ${approval.actionType}`,
      `Title: ${approval.actionTitle}`,
    ];

    if (approval.actionDescription) {
      lines.push(`Description: ${approval.actionDescription}`);
    }

    if (approval.reasoning) {
      lines.push(`AI Reasoning: ${approval.reasoning}`);
    }

    if (approval.confidenceScore) {
      lines.push(`Confidence: ${Math.round(approval.confidenceScore * 100)}%`);
    }

    lines.push('');
    lines.push(`Reply "approve" to approve or "reject [reason]" to reject.`);
    lines.push(`ID: ${approval.id.substring(0, 8)}`);

    return lines.join('\n');
  }

  /**
   * Format notification text for chat platforms
   */
  formatNotificationText(notification) {
    const lines = [
      `[${notification.urgency?.toUpperCase() || 'INFO'}] ${notification.title}`,
      '',
      notification.message
    ];

    return lines.join('\n');
  }

  /**
   * Format notification for email (HTML)
   */
  formatNotificationEmail(notification) {
    const urgencyColor = {
      urgent: '#dc3545',
      high: '#fd7e14',
      normal: '#0d6efd',
      low: '#6c757d'
    };

    const color = urgencyColor[notification.urgency] || urgencyColor.normal;

    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: ${color}; color: white; padding: 15px 20px; border-radius: 8px 8px 0 0;">
          <h2 style="margin: 0; font-size: 18px;">${notification.title}</h2>
        </div>
        <div style="background: #f8f9fa; padding: 20px; border: 1px solid #dee2e6; border-top: none; border-radius: 0 0 8px 8px;">
          <pre style="white-space: pre-wrap; font-family: inherit; margin: 0;">${notification.message}</pre>
        </div>
        <div style="margin-top: 15px; font-size: 12px; color: #6c757d;">
          <p>This notification was sent by SwarmAI Agentic System.</p>
        </div>
      </div>
    `;
  }
}

// Singleton instance
let approvalServiceInstance = null;

/**
 * Get ApprovalService singleton
 * @param {Object} db - Optional database instance
 * @returns {ApprovalService}
 */
function getApprovalService(db = null) {
  if (!approvalServiceInstance) {
    approvalServiceInstance = new ApprovalService(db);
  }
  return approvalServiceInstance;
}

module.exports = {
  ApprovalService,
  getApprovalService
};
