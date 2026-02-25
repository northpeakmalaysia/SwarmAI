/**
 * Self-Prompting Engine
 * =====================
 * Enables autonomous AI agents to initiate their own actions based on:
 * - Goal Progress Check: Periodically reviews goals and initiates corrective actions
 * - Idle Detection: Triggers proactive engagement when agent is idle
 * - Pattern Recognition: Detects patterns in data and suggests insights
 * - Context Change: Responds to significant environment changes
 * - Reflection Schedule: Regular self-assessment and learning
 *
 * Trigger Types:
 * - goal_check: Evaluate goal progress and take action
 * - idle_detection: Agent hasn't been active for threshold period
 * - pattern_recognition: New pattern detected in data
 * - context_change: Significant change in environment/context
 * - reflection_schedule: Scheduled self-reflection time
 * - event_response: Response to external events
 */

const EventEmitter = require('events');
const crypto = require('crypto');
const { getDatabase } = require('../database.cjs');
const { logger } = require('../logger.cjs');

/**
 * Trigger types for self-prompting
 */
const TriggerType = {
  GOAL_CHECK: 'goal_check',
  IDLE_DETECTION: 'idle_detection',
  PATTERN_RECOGNITION: 'pattern_recognition',
  CONTEXT_CHANGE: 'context_change',
  REFLECTION_SCHEDULE: 'reflection_schedule',
  EVENT_RESPONSE: 'event_response',
  HEALTH_CHECK: 'health_check',
  // Phase 2d: Proactive check-ins
  FOLLOW_UP: 'follow_up',
  PROACTIVE_CONTACT: 'proactive_contact',
};

/**
 * Self-prompt action types
 */
const SelfPromptAction = {
  REVIEW_GOALS: 'review_goals',
  CHECK_MESSAGES: 'check_messages',
  UPDATE_MEMORY: 'update_memory',
  SUGGEST_TASK: 'suggest_task',
  SEND_NOTIFICATION: 'send_notification',
  INITIATE_CONVERSATION: 'initiate_conversation',
  SELF_REFLECT: 'self_reflect',
  REQUEST_FEEDBACK: 'request_feedback',
  GENERATE_REPORT: 'generate_report',
  HEALTH_CHECK: 'health_check',
  // Phase 2d: Proactive check-ins
  FOLLOW_UP_CHECK_IN: 'follow_up_check_in',
  PROACTIVE_OUTREACH: 'proactive_outreach',
};

/**
 * Configuration thresholds
 */
const DEFAULT_CONFIG = {
  idleThresholdMinutes: 60,         // How long before idle detection triggers
  goalCheckIntervalMinutes: 240,    // How often to check goals (4 hours)
  reflectionIntervalHours: 24,      // How often to run reflection (daily)
  minConfidenceForAction: 0.7,      // Minimum confidence to take autonomous action
  maxSelfPromptsPerHour: 10,        // Rate limit for self-prompts
  cooldownMinutes: 15,              // Cooldown between similar triggers
};

class SelfPromptingEngine extends EventEmitter {
  constructor() {
    super();
    this.db = null;
    this.isRunning = false;
    this.checkInterval = null;
    this.checkIntervalMs = 60000; // Check every minute
    this.superBrain = null;
    this.triggerCooldowns = new Map(); // triggerKey -> lastTriggerTime
    this.activeProfiles = new Map(); // profileId -> config
  }

  /**
   * Get database instance
   */
  getDb() {
    if (!this.db) {
      this.db = getDatabase();
      this.ensureSelfPromptTables();
    }
    return this.db;
  }

  /**
   * Ensure self-prompt related tables exist
   */
  ensureSelfPromptTables() {
    const db = this.db;
    try {
      db.exec(`
        -- Self-prompt trigger log
        CREATE TABLE IF NOT EXISTS agentic_self_prompts (
          id TEXT PRIMARY KEY,
          agentic_id TEXT NOT NULL,
          user_id TEXT NOT NULL,

          trigger_type TEXT NOT NULL,
          trigger_context TEXT DEFAULT '{}',

          action_type TEXT,
          action_config TEXT DEFAULT '{}',
          action_taken INTEGER DEFAULT 0,

          confidence REAL DEFAULT 0,
          reasoning TEXT,

          status TEXT DEFAULT 'pending'
            CHECK(status IN ('pending', 'approved', 'executed', 'rejected', 'expired')),
          approval_required INTEGER DEFAULT 1,
          approved_by TEXT,
          approved_at TEXT,

          executed_at TEXT,
          result TEXT,
          error_message TEXT,

          created_at TEXT DEFAULT (datetime('now')),
          expires_at TEXT,

          FOREIGN KEY (agentic_id) REFERENCES agentic_profiles(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_self_prompts_agentic ON agentic_self_prompts(agentic_id);
        CREATE INDEX IF NOT EXISTS idx_self_prompts_status ON agentic_self_prompts(status);
        CREATE INDEX IF NOT EXISTS idx_self_prompts_created ON agentic_self_prompts(created_at DESC);

        -- Self-prompting configuration per profile
        CREATE TABLE IF NOT EXISTS agentic_self_prompt_config (
          id TEXT PRIMARY KEY,
          agentic_id TEXT UNIQUE NOT NULL,
          user_id TEXT NOT NULL,

          -- Enable/disable triggers
          enable_goal_check INTEGER DEFAULT 1,
          enable_idle_detection INTEGER DEFAULT 1,
          enable_pattern_recognition INTEGER DEFAULT 0,
          enable_context_change INTEGER DEFAULT 1,
          enable_reflection INTEGER DEFAULT 1,

          -- Thresholds
          idle_threshold_minutes INTEGER DEFAULT 60,
          goal_check_interval_minutes INTEGER DEFAULT 240,
          reflection_interval_hours INTEGER DEFAULT 24,

          -- Approval settings
          auto_approve_confidence_threshold REAL DEFAULT 0.9,
          require_approval_for TEXT DEFAULT '["send_notification","initiate_conversation"]',

          -- Rate limiting
          max_prompts_per_hour INTEGER DEFAULT 10,
          cooldown_minutes INTEGER DEFAULT 15,

          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now')),

          FOREIGN KEY (agentic_id) REFERENCES agentic_profiles(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_self_prompt_config_agentic ON agentic_self_prompt_config(agentic_id);
      `);

      // Add missing columns for frontend compatibility
      const colsToAdd = [
        { name: 'enabled', def: 'INTEGER DEFAULT 0' },
        { name: 'enable_message_check', def: 'INTEGER DEFAULT 0' },
        { name: 'enable_task_management', def: 'INTEGER DEFAULT 0' },
        { name: 'enable_learning', def: 'INTEGER DEFAULT 0' },
        // Phase 2d: Proactive check-in settings
        { name: 'enable_follow_up', def: 'INTEGER DEFAULT 0' },
        { name: 'follow_up_delay_minutes', def: 'INTEGER DEFAULT 30' },
        { name: 'enable_proactive_contact', def: 'INTEGER DEFAULT 0' },
        { name: 'proactive_contact_schedule', def: "TEXT DEFAULT '09:00'" },
        { name: 'enable_pending_task_reminder', def: 'INTEGER DEFAULT 0' },
        { name: 'pending_task_reminder_hours', def: 'INTEGER DEFAULT 24' },
      ];
      for (const col of colsToAdd) {
        try {
          db.prepare(`ALTER TABLE agentic_self_prompt_config ADD COLUMN ${col.name} ${col.def}`).run();
          logger.info(`Added column ${col.name} to agentic_self_prompt_config`);
        } catch (e) {
          // Column already exists - ignore
        }
      }

      logger.info('Ensured self-prompt tables exist');
    } catch (error) {
      logger.error(`Failed to create self-prompt tables: ${error.message}`);
    }
  }

  /**
   * Initialize the engine with dependencies
   */
  async initialize(options = {}) {
    this.getDb(); // Ensure tables

    if (options.superBrain) {
      this.superBrain = options.superBrain;
    }

    if (options.checkIntervalMs) {
      this.checkIntervalMs = options.checkIntervalMs;
    }

    // Load active profiles
    this.loadActiveProfiles();

    logger.info('SelfPromptingEngine initialized');
  }

  /**
   * Load profiles with self-prompting enabled
   */
  loadActiveProfiles() {
    const db = this.getDb();

    try {
      const profiles = db.prepare(`
        SELECT p.id, p.user_id, p.name, p.autonomy_level, p.last_active_at,
               c.enable_goal_check, c.enable_idle_detection, c.enable_pattern_recognition,
               c.enable_context_change, c.enable_reflection,
               c.idle_threshold_minutes, c.goal_check_interval_minutes,
               c.reflection_interval_hours, c.auto_approve_confidence_threshold,
               c.require_approval_for, c.max_prompts_per_hour, c.cooldown_minutes,
               c.enable_follow_up, c.follow_up_delay_minutes,
               c.enable_proactive_contact, c.proactive_contact_schedule,
               c.enable_pending_task_reminder, c.pending_task_reminder_hours
        FROM agentic_profiles p
        LEFT JOIN agentic_self_prompt_config c ON p.id = c.agentic_id
        WHERE p.status IN ('active', 'running')
          AND p.autonomy_level IN ('semi-autonomous', 'autonomous')
      `).all();

      this.activeProfiles.clear();
      for (const profile of profiles) {
        this.activeProfiles.set(profile.id, {
          ...profile,
          config: {
            enableGoalCheck: profile.enable_goal_check ?? true,
            enableIdleDetection: profile.enable_idle_detection ?? true,
            enablePatternRecognition: profile.enable_pattern_recognition ?? false,
            enableContextChange: profile.enable_context_change ?? true,
            enableReflection: profile.enable_reflection ?? true,
            idleThresholdMinutes: profile.idle_threshold_minutes ?? DEFAULT_CONFIG.idleThresholdMinutes,
            goalCheckIntervalMinutes: profile.goal_check_interval_minutes ?? DEFAULT_CONFIG.goalCheckIntervalMinutes,
            reflectionIntervalHours: profile.reflection_interval_hours ?? DEFAULT_CONFIG.reflectionIntervalHours,
            autoApproveThreshold: profile.auto_approve_confidence_threshold ?? 0.9,
            requireApprovalFor: this.safeJsonParse(profile.require_approval_for, ['send_notification', 'initiate_conversation']),
            maxPromptsPerHour: profile.max_prompts_per_hour ?? DEFAULT_CONFIG.maxSelfPromptsPerHour,
            cooldownMinutes: profile.cooldown_minutes ?? DEFAULT_CONFIG.cooldownMinutes,
            // Phase 2d: Proactive check-in settings
            enableFollowUp: profile.enable_follow_up ?? false,
            followUpDelayMinutes: profile.follow_up_delay_minutes ?? 30,
            enableProactiveContact: profile.enable_proactive_contact ?? false,
            proactiveContactSchedule: profile.proactive_contact_schedule || '09:00',
            enablePendingTaskReminder: profile.enable_pending_task_reminder ?? false,
            pendingTaskReminderHours: profile.pending_task_reminder_hours ?? 24,
          }
        });
      }

      logger.info(`Loaded ${this.activeProfiles.size} active profiles for self-prompting`);
    } catch (error) {
      logger.error(`Failed to load active profiles: ${error.message}`);
    }
  }

  /**
   * Start the self-prompting engine
   */
  start() {
    if (this.isRunning) {
      logger.warn('SelfPromptingEngine is already running');
      return;
    }

    this.isRunning = true;
    logger.info('SelfPromptingEngine started');

    // Initial check
    this.checkAllTriggers();

    // Set up periodic checking
    this.checkInterval = setInterval(() => {
      this.checkAllTriggers();
    }, this.checkIntervalMs);

    this.emit('started');
  }

  /**
   * Stop the engine
   */
  stop() {
    if (!this.isRunning) return;

    this.isRunning = false;

    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    logger.info('SelfPromptingEngine stopped');
    this.emit('stopped');
  }

  /**
   * Check all triggers for all active profiles
   */
  async checkAllTriggers() {
    if (!this.isRunning) return;

    // Reload active profiles periodically
    if (Math.random() < 0.1) { // 10% chance to reload
      this.loadActiveProfiles();
    }

    for (const [profileId, profileData] of this.activeProfiles) {
      try {
        await this.checkProfileTriggers(profileId, profileData);
      } catch (error) {
        logger.error(`Error checking triggers for ${profileId}: ${error.message}`);
      }
    }
  }

  /**
   * Check triggers for a specific profile
   */
  async checkProfileTriggers(profileId, profileData) {
    const config = profileData.config;

    // Check rate limit
    if (!this.checkRateLimit(profileId, config.maxPromptsPerHour)) {
      return;
    }

    // Check each enabled trigger type
    if (config.enableIdleDetection) {
      await this.checkIdleTrigger(profileId, profileData);
    }

    if (config.enableGoalCheck) {
      await this.checkGoalTrigger(profileId, profileData);
    }

    if (config.enableReflection) {
      await this.checkReflectionTrigger(profileId, profileData);
    }

    if (config.enableContextChange) {
      await this.checkContextChangeTrigger(profileId, profileData);
    }

    // Self-healing health check (default enabled)
    if (config.enableHealthCheck !== false) {
      await this.checkHealthTrigger(profileId, profileData);
    }

    // Phase 2d: Proactive check-ins
    if (config.enableFollowUp) {
      await this.checkFollowUpTrigger(profileId, profileData);
    }
    if (config.enableProactiveContact) {
      await this.checkProactiveContactTrigger(profileId, profileData);
    }
    if (config.enablePendingTaskReminder) {
      await this.checkPendingTaskReminderTrigger(profileId, profileData);
    }
  }

  /**
   * Check idle detection trigger
   */
  async checkIdleTrigger(profileId, profileData) {
    const cooldownKey = `${profileId}:idle`;
    if (this.isInCooldown(cooldownKey, profileData.config.cooldownMinutes)) {
      return;
    }

    const lastActive = profileData.last_active_at
      ? new Date(profileData.last_active_at)
      : null;

    if (!lastActive) return;

    const idleMinutes = (Date.now() - lastActive.getTime()) / 60000;

    if (idleMinutes >= profileData.config.idleThresholdMinutes) {
      await this.createSelfPrompt(profileId, profileData, {
        triggerType: TriggerType.IDLE_DETECTION,
        triggerContext: {
          idleMinutes: Math.round(idleMinutes),
          threshold: profileData.config.idleThresholdMinutes,
          lastActiveAt: lastActive.toISOString(),
        },
        suggestedAction: SelfPromptAction.CHECK_MESSAGES,
        reasoning: `Agent has been idle for ${Math.round(idleMinutes)} minutes (threshold: ${profileData.config.idleThresholdMinutes}). Consider checking for pending messages or tasks.`,
        confidence: 0.8,
      });

      this.setCooldown(cooldownKey);
    }
  }

  /**
   * Check goal progress trigger
   */
  async checkGoalTrigger(profileId, profileData) {
    const db = this.getDb();
    const cooldownKey = `${profileId}:goal`;

    // Goal checks happen less frequently
    const goalCooldownMinutes = profileData.config.goalCheckIntervalMinutes;
    if (this.isInCooldown(cooldownKey, goalCooldownMinutes)) {
      return;
    }

    // Get active goals
    const goals = db.prepare(`
      SELECT id, title, progress, target_value, current_value, deadline_at, status
      FROM agentic_goals
      WHERE agentic_id = ? AND status = 'active'
    `).all(profileId);

    if (goals.length === 0) return;

    // Check for goals that need attention
    const now = new Date();
    const needsAttention = [];

    for (const goal of goals) {
      // Check deadline approaching
      if (goal.deadline_at) {
        const deadline = new Date(goal.deadline_at);
        const daysUntilDeadline = (deadline - now) / (1000 * 60 * 60 * 24);

        if (daysUntilDeadline <= 3 && goal.progress < 80) {
          needsAttention.push({
            goal,
            reason: 'deadline_approaching',
            urgency: daysUntilDeadline <= 1 ? 'critical' : 'high',
          });
        }
      }

      // Check stalled progress
      if (goal.progress < 20 && !goal.deadline_at) {
        needsAttention.push({
          goal,
          reason: 'stalled_progress',
          urgency: 'medium',
        });
      }
    }

    if (needsAttention.length > 0) {
      await this.createSelfPrompt(profileId, profileData, {
        triggerType: TriggerType.GOAL_CHECK,
        triggerContext: {
          totalGoals: goals.length,
          needsAttention: needsAttention.length,
          goals: needsAttention.map(g => ({
            title: g.goal.title,
            progress: g.goal.progress,
            reason: g.reason,
            urgency: g.urgency,
          })),
        },
        suggestedAction: SelfPromptAction.REVIEW_GOALS,
        reasoning: `${needsAttention.length} goal(s) need attention. ${needsAttention.filter(g => g.urgency === 'critical').length} are critical.`,
        confidence: needsAttention.some(g => g.urgency === 'critical') ? 0.95 : 0.75,
      });

      this.setCooldown(cooldownKey);
    }
  }

  /**
   * Check reflection schedule trigger
   */
  async checkReflectionTrigger(profileId, profileData) {
    const db = this.getDb();
    const cooldownKey = `${profileId}:reflection`;

    // Reflections happen even less frequently
    const reflectionCooldownMinutes = profileData.config.reflectionIntervalHours * 60;
    if (this.isInCooldown(cooldownKey, reflectionCooldownMinutes)) {
      return;
    }

    // Check last reflection
    const lastReflection = db.prepare(`
      SELECT created_at FROM agentic_memory
      WHERE agentic_id = ? AND memory_type = 'reflection'
      ORDER BY created_at DESC LIMIT 1
    `).get(profileId);

    const hoursSinceReflection = lastReflection
      ? (Date.now() - new Date(lastReflection.created_at).getTime()) / (1000 * 60 * 60)
      : profileData.config.reflectionIntervalHours + 1;

    if (hoursSinceReflection >= profileData.config.reflectionIntervalHours) {
      await this.createSelfPrompt(profileId, profileData, {
        triggerType: TriggerType.REFLECTION_SCHEDULE,
        triggerContext: {
          hoursSinceLastReflection: Math.round(hoursSinceReflection),
          scheduledInterval: profileData.config.reflectionIntervalHours,
          lastReflectionAt: lastReflection?.created_at || null,
        },
        suggestedAction: SelfPromptAction.SELF_REFLECT,
        reasoning: `It's time for scheduled self-reflection. Last reflection was ${Math.round(hoursSinceReflection)} hours ago.`,
        confidence: 0.85,
      });

      this.setCooldown(cooldownKey);
    }
  }

  /**
   * Check context change trigger
   */
  async checkContextChangeTrigger(profileId, profileData) {
    const db = this.getDb();
    const cooldownKey = `${profileId}:context`;

    if (this.isInCooldown(cooldownKey, profileData.config.cooldownMinutes)) {
      return;
    }

    // Check for significant changes (e.g., new messages, task changes)
    const recentChanges = [];

    // Check for unread messages
    const unreadCount = db.prepare(`
      SELECT COUNT(*) as count FROM messages m
      JOIN conversations c ON m.conversation_id = c.id
      WHERE c.user_id = ? AND m.is_read = 0 AND m.direction = 'inbound'
    `).get(profileData.user_id);

    if (unreadCount && unreadCount.count > 5) {
      recentChanges.push({
        type: 'unread_messages',
        count: unreadCount.count,
        urgency: unreadCount.count > 20 ? 'high' : 'medium',
      });
    }

    // Check for overdue tasks
    const overdueTasks = db.prepare(`
      SELECT COUNT(*) as count FROM agentic_tasks
      WHERE agentic_id = ? AND status IN ('pending', 'in_progress')
        AND due_at < datetime('now')
    `).get(profileId);

    if (overdueTasks && overdueTasks.count > 0) {
      recentChanges.push({
        type: 'overdue_tasks',
        count: overdueTasks.count,
        urgency: 'high',
      });
    }

    if (recentChanges.length > 0) {
      await this.createSelfPrompt(profileId, profileData, {
        triggerType: TriggerType.CONTEXT_CHANGE,
        triggerContext: {
          changes: recentChanges,
          totalChanges: recentChanges.length,
        },
        suggestedAction: recentChanges.some(c => c.type === 'unread_messages')
          ? SelfPromptAction.CHECK_MESSAGES
          : SelfPromptAction.REVIEW_GOALS,
        reasoning: `Detected ${recentChanges.length} context change(s): ${recentChanges.map(c => `${c.count} ${c.type.replace('_', ' ')}`).join(', ')}`,
        confidence: recentChanges.some(c => c.urgency === 'high') ? 0.9 : 0.7,
      });

      this.setCooldown(cooldownKey);
    }
  }

  /**
   * Check health trigger - periodic self-healing health check.
   * Queries SelfHealingService for error rate and performance trend.
   * Triggers self-prompt if error rate > 20% or performance is degrading.
   */
  async checkHealthTrigger(profileId, profileData) {
    const cooldownKey = `${profileId}:health`;
    const healthCheckInterval = profileData.config.healthCheckIntervalMinutes || 360; // 6 hours default

    if (this.isInCooldown(cooldownKey, healthCheckInterval)) {
      return;
    }

    try {
      const { getSelfHealingService } = require('./SelfHealingService.cjs');
      const healer = getSelfHealingService();
      const report = healer.getHealthReport(profileId, { period: '24h' });

      // Only trigger if there are actual issues
      if (report.totalExecutions < 5) return; // Not enough data
      if (report.errorRate <= 20 && report.performanceTrend !== 'degrading') return; // Healthy

      await this.createSelfPrompt(profileId, profileData, {
        triggerType: TriggerType.HEALTH_CHECK,
        triggerContext: {
          errorRate: report.errorRate,
          successRate: report.successRate,
          performanceTrend: report.performanceTrend,
          topErrors: (report.topErrors || []).slice(0, 3),
          anomalyCount: (report.anomalies || []).length,
        },
        suggestedAction: SelfPromptAction.HEALTH_CHECK,
        reasoning: `Health check: ${report.errorRate}% error rate, performance ${report.performanceTrend}. ${report.topErrors?.length || 0} recurring error types.`,
        confidence: report.errorRate > 50 ? 0.95 : 0.80,
      });

      this.setCooldown(cooldownKey);
    } catch (e) {
      // Non-critical - don't crash the engine
      logger.debug(`[SelfPrompting] Health check failed: ${e.message}`);
    }
  }

  // === Phase 2d: Proactive Check-in Triggers ===

  /**
   * Follow-up check-in: After a task/conversation ends, wait N minutes
   * then ask master if they need anything else.
   */
  async checkFollowUpTrigger(profileId, profileData) {
    const cooldownKey = `${profileId}:follow_up`;
    const delayMinutes = profileData.config.followUpDelayMinutes || 30;

    if (this.isInCooldown(cooldownKey, delayMinutes)) {
      return;
    }

    try {
      const db = this.getDb();

      // Check if there was a completed conversation (agent responded) within the delay window
      // but no master message since then
      const profile = db.prepare('SELECT master_contact_id, last_master_contact_at FROM agentic_profiles WHERE id = ?').get(profileId);
      if (!profile?.master_contact_id) return;

      const lastMasterContact = profile.last_master_contact_at;
      if (!lastMasterContact) return; // No master interaction yet

      const lastMasterMs = new Date(lastMasterContact).getTime();
      const nowMs = Date.now();
      const silenceMinutes = (nowMs - lastMasterMs) / 60000;

      // Only trigger if master has been silent for exactly the delay window (±5 min)
      if (silenceMinutes < delayMinutes || silenceMinutes > delayMinutes + 10) return;

      // Check that the agent actually responded recently (not just received)
      const recentAgentMsg = db.prepare(`
        SELECT 1 FROM messages m
        JOIN conversations c ON m.conversation_id = c.id
        WHERE c.contact_id = ? AND m.direction = 'outgoing'
          AND m.created_at > datetime('now', '-' || ? || ' minutes')
        LIMIT 1
      `).get(profile.master_contact_id, delayMinutes + 10);

      if (!recentAgentMsg) return; // Agent didn't respond recently, no need for follow-up

      await this.createSelfPrompt(profileId, profileData, {
        triggerType: TriggerType.FOLLOW_UP,
        triggerContext: {
          silenceMinutes: Math.round(silenceMinutes),
          lastMasterContact: lastMasterContact,
        },
        suggestedAction: SelfPromptAction.FOLLOW_UP_CHECK_IN,
        reasoning: `Master has been silent for ${Math.round(silenceMinutes)} minutes after last interaction. Sending a brief follow-up check-in.`,
        confidence: 0.85,
      });

      this.setCooldown(cooldownKey);
    } catch (e) {
      logger.debug(`[SelfPrompting] Follow-up check failed: ${e.message}`);
    }
  }

  /**
   * Proactive contact: Morning greetings / daily summary at scheduled time.
   */
  async checkProactiveContactTrigger(profileId, profileData) {
    const cooldownKey = `${profileId}:proactive_contact`;
    // Cooldown of 23 hours to prevent multiple triggers per day
    if (this.isInCooldown(cooldownKey, 23 * 60)) {
      return;
    }

    try {
      const scheduleTime = profileData.config.proactiveContactSchedule || '09:00';
      const [schedHour, schedMin] = scheduleTime.split(':').map(Number);
      const now = new Date();
      const currentHour = now.getHours();
      const currentMin = now.getMinutes();

      // Check if current time is within the schedule window (±5 minutes)
      const schedTotalMin = schedHour * 60 + schedMin;
      const currentTotalMin = currentHour * 60 + currentMin;
      if (Math.abs(currentTotalMin - schedTotalMin) > 5) return;

      await this.createSelfPrompt(profileId, profileData, {
        triggerType: TriggerType.PROACTIVE_CONTACT,
        triggerContext: {
          scheduledTime: scheduleTime,
          currentTime: `${String(currentHour).padStart(2, '0')}:${String(currentMin).padStart(2, '0')}`,
          type: 'morning_greeting',
        },
        suggestedAction: SelfPromptAction.PROACTIVE_OUTREACH,
        reasoning: `Scheduled proactive contact at ${scheduleTime}. Sending morning greeting/daily summary to master.`,
        confidence: 0.90,
      });

      this.setCooldown(cooldownKey);
    } catch (e) {
      logger.debug(`[SelfPrompting] Proactive contact check failed: ${e.message}`);
    }
  }

  /**
   * Pending task reminder: Notify master about overdue or stale tasks.
   */
  async checkPendingTaskReminderTrigger(profileId, profileData) {
    const cooldownKey = `${profileId}:task_reminder`;
    const reminderHours = profileData.config.pendingTaskReminderHours || 24;
    // Cooldown matches the reminder interval
    if (this.isInCooldown(cooldownKey, reminderHours * 60)) {
      return;
    }

    try {
      const db = this.getDb();

      // Find overdue/stale tasks for this agent
      const staleTasks = db.prepare(`
        SELECT COUNT(*) as count FROM agentic_tasks
        WHERE agentic_id = ? AND status IN ('pending', 'in_progress', 'blocked')
          AND updated_at < datetime('now', '-' || ? || ' hours')
      `).get(profileId, reminderHours);

      if (!staleTasks || staleTasks.count === 0) return;

      await this.createSelfPrompt(profileId, profileData, {
        triggerType: TriggerType.FOLLOW_UP,
        triggerContext: {
          staleTaskCount: staleTasks.count,
          reminderHours,
          type: 'pending_task_reminder',
        },
        suggestedAction: SelfPromptAction.FOLLOW_UP_CHECK_IN,
        reasoning: `${staleTasks.count} task(s) have not been updated in ${reminderHours}+ hours. Sending reminder to master.`,
        confidence: 0.80,
      });

      this.setCooldown(cooldownKey);
    } catch (e) {
      logger.debug(`[SelfPrompting] Pending task reminder check failed: ${e.message}`);
    }
  }

  // === End Phase 2d Triggers ===

  /**
   * Create a self-prompt record
   */
  async createSelfPrompt(profileId, profileData, promptData) {
    const db = this.getDb();
    const id = crypto.randomUUID();
    const config = profileData.config;

    // Determine if approval is required
    const requiresApproval = config.requireApprovalFor.includes(promptData.suggestedAction)
      || promptData.confidence < config.autoApproveThreshold;

    // Auto-approve if confidence is high and not in approval list
    const status = requiresApproval ? 'pending' : 'approved';
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours

    try {
      db.prepare(`
        INSERT INTO agentic_self_prompts (
          id, agentic_id, user_id, trigger_type, trigger_context,
          action_type, action_config, confidence, reasoning,
          status, approval_required, expires_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(
        id,
        profileId,
        profileData.user_id,
        promptData.triggerType,
        JSON.stringify(promptData.triggerContext),
        promptData.suggestedAction,
        JSON.stringify(promptData.actionConfig || {}),
        promptData.confidence,
        promptData.reasoning,
        status,
        requiresApproval ? 1 : 0,
        expiresAt
      );

      // Emit event
      this.emit('prompt:created', {
        id,
        profileId,
        triggerType: promptData.triggerType,
        action: promptData.suggestedAction,
        confidence: promptData.confidence,
        requiresApproval,
        status,
      });

      logger.info(`Created self-prompt ${id} for profile ${profileId}: ${promptData.triggerType} -> ${promptData.suggestedAction}`);

      // Auto-execute if approved and autonomous
      if (status === 'approved' && profileData.autonomy_level === 'autonomous') {
        await this.executeSelfPrompt(id, profileId);
      }

      return id;
    } catch (error) {
      logger.error(`Failed to create self-prompt: ${error.message}`);
      throw error;
    }
  }

  /**
   * Execute an approved self-prompt
   */
  async executeSelfPrompt(promptId, profileId) {
    const db = this.getDb();

    try {
      const prompt = db.prepare(`
        SELECT * FROM agentic_self_prompts WHERE id = ? AND agentic_id = ?
      `).get(promptId, profileId);

      if (!prompt) {
        throw new Error('Self-prompt not found');
      }

      if (prompt.status !== 'approved') {
        throw new Error(`Cannot execute prompt with status: ${prompt.status}`);
      }

      // Update status to executing
      db.prepare(`
        UPDATE agentic_self_prompts SET status = 'executing' WHERE id = ?
      `).run(promptId);

      let result;
      try {
        result = await this.executeAction(prompt);
      } catch (error) {
        // Update with error
        db.prepare(`
          UPDATE agentic_self_prompts
          SET status = 'executed', action_taken = 0, error_message = ?, executed_at = datetime('now')
          WHERE id = ?
        `).run(error.message, promptId);

        throw error;
      }

      // Update with success
      db.prepare(`
        UPDATE agentic_self_prompts
        SET status = 'executed', action_taken = 1, result = ?, executed_at = datetime('now')
        WHERE id = ?
      `).run(JSON.stringify(result), promptId);

      this.emit('prompt:executed', {
        id: promptId,
        profileId,
        action: prompt.action_type,
        result,
      });

      logger.info(`Executed self-prompt ${promptId}: ${prompt.action_type}`);

      return result;
    } catch (error) {
      logger.error(`Failed to execute self-prompt ${promptId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Execute the action for a self-prompt
   * Routes through AgentReasoningLoop for autonomous AI-driven execution
   */
  async executeAction(prompt) {
    const triggerContext = this.safeJsonParse(prompt.trigger_context, {});

    // Acquire global AI concurrency slot (non-blocking: skip if at capacity)
    const { getAIConcurrencyGuard } = require('./AIConcurrencyGuard.cjs');
    const guard = getAIConcurrencyGuard();
    const release = guard.tryAcquire();
    if (!release) {
      const stats = guard.getStats();
      logger.info(`[SelfPrompting] Skipping execution - AI concurrency limit reached (${stats.running}/${stats.maxConcurrent})`);
      return { action: prompt.action_type, skipped: true, reason: 'concurrency_limit' };
    }

    try {
      const SELF_PROMPT_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes

      const { getAgentReasoningLoop } = require('./AgentReasoningLoop.cjs');
      const loop = getAgentReasoningLoop();

      const result = await Promise.race([
        loop.run(prompt.agentic_id, 'periodic_think', {
          triggerType: prompt.trigger_type,
          suggestedAction: prompt.action_type,
          reasoning: prompt.reasoning || triggerContext.reasoning,
          triggerContext,
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Self-prompt execution timed out after 3 minutes')), SELF_PROMPT_TIMEOUT_MS)
        ),
      ]);

      return {
        action: prompt.action_type,
        reasoning: result.finalThought,
        actions: result.actions,
        iterations: result.iterations,
        tokensUsed: result.tokensUsed,
        summary: `AI reasoning: ${result.actions.length} actions taken`,
      };
    } catch (err) {
      logger.warn(`SelfPromptingEngine: ReasoningLoop failed, using fallback: ${err.message}`);
      // Fallback to simple DB-based actions
      return this.executeActionFallback(prompt);
    } finally {
      release();
    }
  }

  /**
   * Fallback action execution (simple DB queries, no AI reasoning)
   */
  async executeActionFallback(prompt) {
    const actionConfig = this.safeJsonParse(prompt.action_config, {});
    const triggerContext = this.safeJsonParse(prompt.trigger_context, {});

    switch (prompt.action_type) {
      case SelfPromptAction.REVIEW_GOALS:
        return this.actionReviewGoals(prompt.agentic_id, triggerContext);

      case SelfPromptAction.CHECK_MESSAGES:
        return this.actionCheckMessages(prompt.agentic_id, prompt.user_id);

      case SelfPromptAction.SELF_REFLECT:
        return this.actionSelfReflect(prompt.agentic_id, prompt.user_id);

      case SelfPromptAction.UPDATE_MEMORY:
        return this.actionUpdateMemory(prompt.agentic_id, prompt.user_id, actionConfig);

      case SelfPromptAction.SUGGEST_TASK:
        return this.actionSuggestTask(prompt.agentic_id, prompt.user_id, triggerContext);

      case SelfPromptAction.GENERATE_REPORT:
        return this.actionGenerateReport(prompt.agentic_id, prompt.user_id, actionConfig);

      case SelfPromptAction.HEALTH_CHECK:
        return this.actionHealthCheck(prompt.agentic_id, prompt.user_id, triggerContext);

      default:
        return { message: `Action ${prompt.action_type} not implemented`, skipped: true };
    }
  }

  // =====================================================
  // ACTION IMPLEMENTATIONS
  // =====================================================

  async actionReviewGoals(agenticId, context) {
    const db = this.getDb();

    // Get goals needing attention
    const goals = db.prepare(`
      SELECT * FROM agentic_goals
      WHERE agentic_id = ? AND status = 'active'
      ORDER BY deadline_at ASC NULLS LAST
    `).all(agenticId);

    return {
      action: 'review_goals',
      goalsReviewed: goals.length,
      needsAttention: context.needsAttention || 0,
      summary: `Reviewed ${goals.length} goals. ${context.needsAttention || 0} need attention.`,
    };
  }

  async actionCheckMessages(agenticId, userId) {
    const db = this.getDb();

    const unread = db.prepare(`
      SELECT COUNT(*) as count FROM messages m
      JOIN conversations c ON m.conversation_id = c.id
      WHERE c.user_id = ? AND m.is_read = 0 AND m.direction = 'inbound'
    `).get(userId);

    return {
      action: 'check_messages',
      unreadCount: unread?.count || 0,
      summary: `Found ${unread?.count || 0} unread messages.`,
    };
  }

  async actionSelfReflect(agenticId, userId) {
    const db = this.getDb();

    if (!this.superBrain) {
      return { action: 'self_reflect', skipped: true, reason: 'SuperBrain not available' };
    }

    // Get context for reflection
    const recentJobs = db.prepare(`
      SELECT action_type, status, result_summary FROM agentic_job_history
      WHERE agentic_id = ? ORDER BY created_at DESC LIMIT 10
    `).all(agenticId);

    const goals = db.prepare(`
      SELECT title, progress FROM agentic_goals
      WHERE agentic_id = ? AND status = 'active'
    `).all(agenticId);

    // Generate reflection using AI
    const reflectionPrompt = `
      Perform a brief self-reflection based on:

      Recent Activities:
      ${recentJobs.map(j => `- ${j.action_type}: ${j.status}`).join('\n') || 'No recent activities'}

      Active Goals:
      ${goals.map(g => `- ${g.title}: ${g.progress}%`).join('\n') || 'No active goals'}

      Provide a concise reflection with:
      1. Key insights
      2. Areas for improvement
      3. Recommended next steps
    `;

    const REFLECT_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes
    const result = await Promise.race([
      this.superBrain.process({
        task: reflectionPrompt,
        messages: [{ role: 'user', content: reflectionPrompt }],
        userId,
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Self-reflection timed out after 2 minutes')), REFLECT_TIMEOUT_MS)
      ),
    ]);

    // Store reflection in memory
    db.prepare(`
      INSERT INTO agentic_memory (id, agentic_id, user_id, memory_type, title, content, importance, created_at, updated_at)
      VALUES (?, ?, ?, 'reflection', 'Self-Reflection', ?, 7, datetime('now'), datetime('now'))
    `).run(crypto.randomUUID(), agenticId, userId, result.content);

    return {
      action: 'self_reflect',
      reflection: result.content,
      activitiesReviewed: recentJobs.length,
      goalsReviewed: goals.length,
    };
  }

  async actionUpdateMemory(agenticId, userId, config) {
    return {
      action: 'update_memory',
      status: 'queued',
      config,
    };
  }

  async actionSuggestTask(agenticId, userId, context) {
    return {
      action: 'suggest_task',
      context,
      suggestion: 'Review pending items and prioritize based on deadlines',
    };
  }

  async actionGenerateReport(agenticId, userId, config) {
    return {
      action: 'generate_report',
      reportType: config.reportType || 'summary',
      status: 'queued',
    };
  }

  /**
   * Health check action: runs self-healing analysis and returns results.
   */
  async actionHealthCheck(agenticId, userId, context) {
    try {
      const { getSelfHealingService } = require('./SelfHealingService.cjs');
      const healer = getSelfHealingService();
      const result = await healer.analyzeAndHeal(agenticId, userId, {
        trigger: 'periodic',
        triggerContext: context,
      });
      return { action: 'health_check', ...result };
    } catch (e) {
      logger.debug(`[SelfPrompting] Health check action failed: ${e.message}`);
      return { action: 'health_check', error: e.message };
    }
  }

  // =====================================================
  // UTILITY METHODS
  // =====================================================

  /**
   * Check if a trigger is in cooldown
   */
  isInCooldown(key, cooldownMinutes) {
    const lastTrigger = this.triggerCooldowns.get(key);
    if (!lastTrigger) return false;

    const elapsedMinutes = (Date.now() - lastTrigger) / 60000;
    return elapsedMinutes < cooldownMinutes;
  }

  /**
   * Set cooldown for a trigger
   */
  setCooldown(key) {
    this.triggerCooldowns.set(key, Date.now());
  }

  /**
   * Check rate limit for a profile
   */
  checkRateLimit(profileId, maxPerHour) {
    const db = this.getDb();

    const count = db.prepare(`
      SELECT COUNT(*) as count FROM agentic_self_prompts
      WHERE agentic_id = ? AND created_at >= datetime('now', '-1 hour')
    `).get(profileId);

    return (count?.count || 0) < maxPerHour;
  }

  /**
   * Safely parse JSON
   */
  safeJsonParse(str, defaultValue) {
    if (!str) return defaultValue;
    try {
      return JSON.parse(str);
    } catch {
      return defaultValue;
    }
  }

  // =====================================================
  // API METHODS
  // =====================================================

  /**
   * Get pending self-prompts for approval
   */
  getPendingPrompts(agenticId, userId) {
    const db = this.getDb();

    const prompts = db.prepare(`
      SELECT * FROM agentic_self_prompts
      WHERE agentic_id = ? AND user_id = ? AND status = 'pending'
        AND (expires_at IS NULL OR expires_at > datetime('now'))
      ORDER BY created_at DESC
    `).all(agenticId, userId);

    return prompts.map(p => this.transformPrompt(p));
  }

  /**
   * Get self-prompt history
   */
  getPromptHistory(agenticId, userId, options = {}) {
    const db = this.getDb();
    const { page = 1, pageSize = 20, status = null } = options;
    const offset = (page - 1) * pageSize;

    let whereClause = 'WHERE agentic_id = ? AND user_id = ?';
    const params = [agenticId, userId];

    if (status) {
      whereClause += ' AND status = ?';
      params.push(status);
    }

    const total = db.prepare(`
      SELECT COUNT(*) as count FROM agentic_self_prompts ${whereClause}
    `).get(...params);

    const prompts = db.prepare(`
      SELECT * FROM agentic_self_prompts ${whereClause}
      ORDER BY created_at DESC LIMIT ? OFFSET ?
    `).all(...params, pageSize, offset);

    return {
      prompts: prompts.map(p => this.transformPrompt(p)),
      total: total.count,
      page,
      pageSize,
    };
  }

  /**
   * Approve a self-prompt
   */
  approvePrompt(promptId, userId) {
    const db = this.getDb();

    const result = db.prepare(`
      UPDATE agentic_self_prompts
      SET status = 'approved', approved_by = ?, approved_at = datetime('now')
      WHERE id = ? AND user_id = ? AND status = 'pending'
    `).run(userId, promptId, userId);

    return result.changes > 0;
  }

  /**
   * Reject a self-prompt
   */
  rejectPrompt(promptId, userId) {
    const db = this.getDb();

    const result = db.prepare(`
      UPDATE agentic_self_prompts
      SET status = 'rejected', approved_by = ?, approved_at = datetime('now')
      WHERE id = ? AND user_id = ? AND status = 'pending'
    `).run(userId, promptId, userId);

    return result.changes > 0;
  }

  /**
   * Get/update self-prompt configuration
   */
  getConfig(agenticId, userId) {
    const db = this.getDb();

    const config = db.prepare(`
      SELECT * FROM agentic_self_prompt_config WHERE agentic_id = ? AND user_id = ?
    `).get(agenticId, userId);

    if (!config) {
      return {
        agenticId,
        enabled: false,
        checkIntervalMinutes: DEFAULT_CONFIG.goalCheckIntervalMinutes || 240,
        maxPromptsPerHour: DEFAULT_CONFIG.maxSelfPromptsPerHour || 10,
        goalCheckEnabled: true,
        messageCheckEnabled: false,
        taskCheckEnabled: false,
        learningEnabled: false,
        autoApproveTypes: [],
        requireApprovalTypes: ['send_notification', 'initiate_conversation'],
        // Legacy fields for backward compatibility
        enableGoalCheck: true,
        enableIdleDetection: true,
        enablePatternRecognition: false,
        enableContextChange: true,
        enableReflection: true,
        idleThresholdMinutes: DEFAULT_CONFIG.idleThresholdMinutes,
        goalCheckIntervalMinutes: DEFAULT_CONFIG.goalCheckIntervalMinutes,
        reflectionIntervalHours: DEFAULT_CONFIG.reflectionIntervalHours,
        autoApproveThreshold: 0.9,
        requireApprovalFor: ['send_notification', 'initiate_conversation'],
        cooldownMinutes: DEFAULT_CONFIG.cooldownMinutes,
      };
    }

    return this.transformConfig(config);
  }

  updateConfig(agenticId, userId, configData) {
    const db = this.getDb();

    const existing = db.prepare(`
      SELECT id FROM agentic_self_prompt_config WHERE agentic_id = ?
    `).get(agenticId);

    // Map frontend field names to DB values (accept both frontend and legacy names)
    const enabled = configData.enabled !== undefined ? (configData.enabled ? 1 : 0) : 0;
    const enableGoalCheck = (configData.goalCheckEnabled ?? configData.enableGoalCheck) ? 1 : 0;
    const enableMessageCheck = (configData.messageCheckEnabled ?? configData.enableMessageCheck) ? 1 : 0;
    const enableTaskManagement = (configData.taskCheckEnabled ?? configData.enableTaskManagement) ? 1 : 0;
    const enableLearning = (configData.learningEnabled ?? configData.enableLearning) ? 1 : 0;
    const enableIdleDetection = configData.enableIdleDetection ? 1 : 0;
    const enablePatternRecognition = configData.enablePatternRecognition ? 1 : 0;
    const enableContextChange = configData.enableContextChange !== undefined ? (configData.enableContextChange ? 1 : 0) : 1;
    const enableReflection = configData.enableReflection !== undefined ? (configData.enableReflection ? 1 : 0) : 1;
    const checkInterval = configData.checkIntervalMinutes || configData.goalCheckIntervalMinutes || DEFAULT_CONFIG.goalCheckIntervalMinutes;
    const maxPromptsPerHour = configData.maxPromptsPerHour || DEFAULT_CONFIG.maxSelfPromptsPerHour;
    const cooldownMinutes = configData.cooldownMinutes || DEFAULT_CONFIG.cooldownMinutes;
    const idleThresholdMinutes = configData.idleThresholdMinutes || DEFAULT_CONFIG.idleThresholdMinutes;
    const reflectionIntervalHours = configData.reflectionIntervalHours || DEFAULT_CONFIG.reflectionIntervalHours || 24;
    const autoApproveThreshold = configData.autoApproveThreshold || 0.9;
    const requireApprovalFor = JSON.stringify(configData.requireApprovalTypes || configData.requireApprovalFor || []);

    if (existing) {
      db.prepare(`
        UPDATE agentic_self_prompt_config SET
          enabled = ?,
          enable_goal_check = ?,
          enable_idle_detection = ?,
          enable_pattern_recognition = ?,
          enable_context_change = ?,
          enable_reflection = ?,
          enable_message_check = ?,
          enable_task_management = ?,
          enable_learning = ?,
          idle_threshold_minutes = ?,
          goal_check_interval_minutes = ?,
          reflection_interval_hours = ?,
          auto_approve_confidence_threshold = ?,
          require_approval_for = ?,
          max_prompts_per_hour = ?,
          cooldown_minutes = ?,
          updated_at = datetime('now')
        WHERE agentic_id = ?
      `).run(
        enabled,
        enableGoalCheck,
        enableIdleDetection,
        enablePatternRecognition,
        enableContextChange,
        enableReflection,
        enableMessageCheck,
        enableTaskManagement,
        enableLearning,
        idleThresholdMinutes,
        checkInterval,
        reflectionIntervalHours,
        autoApproveThreshold,
        requireApprovalFor,
        maxPromptsPerHour,
        cooldownMinutes,
        agenticId
      );
    } else {
      db.prepare(`
        INSERT INTO agentic_self_prompt_config (
          id, agentic_id, user_id,
          enabled,
          enable_goal_check, enable_idle_detection, enable_pattern_recognition,
          enable_context_change, enable_reflection,
          enable_message_check, enable_task_management, enable_learning,
          idle_threshold_minutes, goal_check_interval_minutes, reflection_interval_hours,
          auto_approve_confidence_threshold, require_approval_for,
          max_prompts_per_hour, cooldown_minutes,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).run(
        crypto.randomUUID(),
        agenticId,
        userId,
        enabled,
        enableGoalCheck,
        enableIdleDetection,
        enablePatternRecognition,
        enableContextChange,
        enableReflection,
        enableMessageCheck,
        enableTaskManagement,
        enableLearning,
        idleThresholdMinutes,
        checkInterval,
        reflectionIntervalHours,
        autoApproveThreshold,
        requireApprovalFor,
        maxPromptsPerHour,
        cooldownMinutes
      );
    }

    // Reload active profiles
    this.loadActiveProfiles();

    return this.getConfig(agenticId, userId);
  }

  /**
   * Transform prompt for API response
   */
  transformPrompt(row) {
    return {
      id: row.id,
      agenticId: row.agentic_id,
      userId: row.user_id,
      triggerType: row.trigger_type,
      triggerContext: this.safeJsonParse(row.trigger_context, {}),
      actionType: row.action_type,
      actionConfig: this.safeJsonParse(row.action_config, {}),
      actionTaken: !!row.action_taken,
      confidence: row.confidence,
      reasoning: row.reasoning,
      status: row.status,
      approvalRequired: !!row.approval_required,
      approvedBy: row.approved_by,
      approvedAt: row.approved_at,
      executedAt: row.executed_at,
      result: this.safeJsonParse(row.result, null),
      errorMessage: row.error_message,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
    };
  }

  /**
   * Transform config for API response
   */
  transformConfig(row) {
    return {
      id: row.id,
      agenticId: row.agentic_id,
      // Frontend-compatible fields
      enabled: !!row.enabled,
      checkIntervalMinutes: row.goal_check_interval_minutes,
      maxPromptsPerHour: row.max_prompts_per_hour,
      goalCheckEnabled: !!row.enable_goal_check,
      messageCheckEnabled: !!row.enable_message_check,
      taskCheckEnabled: !!row.enable_task_management,
      learningEnabled: !!row.enable_learning,
      autoApproveTypes: [],
      requireApprovalTypes: this.safeJsonParse(row.require_approval_for, []),
      // Legacy fields for backward compatibility
      enableGoalCheck: !!row.enable_goal_check,
      enableIdleDetection: !!row.enable_idle_detection,
      enablePatternRecognition: !!row.enable_pattern_recognition,
      enableContextChange: !!row.enable_context_change,
      enableReflection: !!row.enable_reflection,
      idleThresholdMinutes: row.idle_threshold_minutes,
      goalCheckIntervalMinutes: row.goal_check_interval_minutes,
      reflectionIntervalHours: row.reflection_interval_hours,
      autoApproveThreshold: row.auto_approve_confidence_threshold,
      requireApprovalFor: this.safeJsonParse(row.require_approval_for, []),
      cooldownMinutes: row.cooldown_minutes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

// Singleton instance
let _instance = null;

function getSelfPromptingEngine() {
  if (!_instance) {
    _instance = new SelfPromptingEngine();
  }
  return _instance;
}

module.exports = {
  SelfPromptingEngine,
  getSelfPromptingEngine,
  TriggerType,
  SelfPromptAction,
};
