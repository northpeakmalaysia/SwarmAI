/**
 * Background Job Scheduler Service
 * =================================
 * Processes agentic_schedules table, executes scheduled actions,
 * and tracks execution history for monitoring and debugging.
 *
 * Schedule Types:
 * - cron: Standard cron expressions (e.g., "0 9 * * 1-5")
 * - interval: Run every N minutes
 * - once: One-time execution at specific datetime
 * - event: Triggered by system events
 *
 * Action Types:
 * - check_messages: Check and respond to pending messages
 * - send_report: Generate and send reports
 * - review_tasks: Review and update task statuses
 * - update_knowledge: Refresh RAG knowledge base
 * - custom_prompt: Execute custom AI prompt
 * - self_reflect: Self-assessment and goal review
 */

const EventEmitter = require('events');
const crypto = require('crypto');
const { getDatabase } = require('../database.cjs');
const { logger } = require('../logger.cjs');

// Import cron parser for cron expression validation
let cronParser;
try {
  cronParser = require('cron-parser');
} catch {
  logger.warn('cron-parser not available, using basic cron parsing');
}

/**
 * Job execution status
 */
const JobStatus = {
  PENDING: 'pending',
  RUNNING: 'running',
  SUCCESS: 'success',
  FAILED: 'failed',
  SKIPPED: 'skipped',
  CANCELLED: 'cancelled'
};

/**
 * Action type handlers
 */
const ActionHandlers = {
  check_messages: 'handleCheckMessages',
  send_report: 'handleSendReport',
  review_tasks: 'handleReviewTasks',
  update_knowledge: 'handleUpdateKnowledge',
  custom_prompt: 'handleCustomPrompt',
  self_reflect: 'handleSelfReflect',
  health_summary: 'handleHealthSummary',
  reasoning_cycle: 'handleReasoningCycle',
  // Phase 2d: Proactive check-in actions
  follow_up_check_in: 'handleFollowUpCheckIn',
  proactive_outreach: 'handleProactiveOutreach',
};

class SchedulerService extends EventEmitter {
  constructor() {
    super();
    this.db = null;
    this.isRunning = false;
    this.checkInterval = null;
    this.checkIntervalMs = 60000; // Check every 60 seconds
    this.maxConcurrentJobs = 5;
    this.runningJobs = new Map();
    this.superBrain = null;
    this.agenticService = null;
  }

  /**
   * Get database instance
   */
  getDb() {
    if (!this.db) {
      this.db = getDatabase();
      this.ensureJobHistoryTable();
    }
    return this.db;
  }

  /**
   * Ensure job history table exists
   */
  ensureJobHistoryTable() {
    const db = this.db;
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS agentic_job_history (
          id TEXT PRIMARY KEY,
          schedule_id TEXT NOT NULL,
          agentic_id TEXT NOT NULL,
          user_id TEXT NOT NULL,

          -- Execution details
          action_type TEXT NOT NULL,
          scheduled_at TEXT NOT NULL,
          started_at TEXT,
          completed_at TEXT,
          duration_ms INTEGER,

          -- Status
          status TEXT DEFAULT 'pending'
            CHECK(status IN ('pending', 'running', 'success', 'failed', 'skipped', 'cancelled')),
          error_message TEXT,
          retry_count INTEGER DEFAULT 0,

          -- Input/Output
          input_data TEXT DEFAULT '{}',
          output_data TEXT DEFAULT '{}',
          result_summary TEXT,

          -- AI metrics
          tokens_used INTEGER DEFAULT 0,
          ai_provider TEXT,
          ai_model TEXT,

          created_at TEXT DEFAULT (datetime('now')),

          FOREIGN KEY (schedule_id) REFERENCES agentic_schedules(id) ON DELETE CASCADE,
          FOREIGN KEY (agentic_id) REFERENCES agentic_profiles(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_job_hist_schedule ON agentic_job_history(schedule_id);
        CREATE INDEX IF NOT EXISTS idx_job_hist_agentic ON agentic_job_history(agentic_id);
        CREATE INDEX IF NOT EXISTS idx_job_hist_user ON agentic_job_history(user_id);
        CREATE INDEX IF NOT EXISTS idx_job_hist_status ON agentic_job_history(status);
        CREATE INDEX IF NOT EXISTS idx_job_hist_created ON agentic_job_history(created_at DESC);
      `);
      logger.info('Ensured agentic_job_history table exists');
    } catch (error) {
      logger.error(`Failed to create job history table: ${error.message}`);
    }
  }

  /**
   * Initialize the scheduler with dependencies
   * @param {Object} options - Configuration options
   */
  async initialize(options = {}) {
    this.getDb(); // Initialize DB and ensure tables

    if (options.superBrain) {
      this.superBrain = options.superBrain;
    }

    if (options.agenticService) {
      this.agenticService = options.agenticService;
    }

    if (options.checkIntervalMs) {
      this.checkIntervalMs = options.checkIntervalMs;
    }

    logger.info('SchedulerService initialized');
  }

  /**
   * Start the scheduler
   */
  start() {
    if (this.isRunning) {
      logger.warn('SchedulerService is already running');
      return;
    }

    this.isRunning = true;
    logger.info('SchedulerService started');

    // Fix orphaned schedules with no next_run_at (created without proper initialization)
    try {
      const db = this.getDb();
      const fixed = db.prepare(`
        UPDATE agentic_schedules
        SET next_run_at = datetime('now', '+' || interval_minutes || ' minutes')
        WHERE is_active = 1 AND next_run_at IS NULL AND schedule_type = 'interval' AND interval_minutes > 0
      `).run();
      if (fixed.changes > 0) {
        logger.info(`SchedulerService: Fixed ${fixed.changes} schedules with missing next_run_at`);
      }
    } catch (e) {
      logger.debug(`SchedulerService: Could not fix orphaned schedules: ${e.message}`);
    }

    // Clean up stale "running" job history from previous crashes/restarts
    try {
      const db2 = this.getDb();
      const staleFixed = db2.prepare(`
        UPDATE agentic_job_history
        SET status = 'failed',
            error_message = 'Server restarted while job was running',
            completed_at = datetime('now')
        WHERE status = 'running'
      `).run();
      if (staleFixed.changes > 0) {
        logger.info(`SchedulerService: Cleaned up ${staleFixed.changes} stale running jobs from previous session`);
      }
    } catch (e) {
      logger.debug(`SchedulerService: Could not clean stale jobs: ${e.message}`);
    }

    // Stagger past-due schedules to prevent thundering herd after restart
    try {
      const db3 = this.getDb();
      const pastDue = db3.prepare(`
        SELECT id FROM agentic_schedules
        WHERE is_active = 1 AND next_run_at IS NOT NULL AND next_run_at <= datetime('now')
        ORDER BY next_run_at ASC
      `).all();

      if (pastDue.length > 1) {
        const staggerIntervalSec = 30; // 30 seconds between each
        for (let i = 0; i < pastDue.length; i++) {
          const staggeredTime = new Date(Date.now() + (i * staggerIntervalSec * 1000)).toISOString();
          db3.prepare('UPDATE agentic_schedules SET next_run_at = ? WHERE id = ?')
            .run(staggeredTime, pastDue[i].id);
        }
        logger.info(`SchedulerService: Staggered ${pastDue.length} past-due schedules (${staggerIntervalSec}s apart)`);
      }
    } catch (e) {
      logger.debug(`SchedulerService: Could not stagger schedules: ${e.message}`);
    }

    // Delayed initial check (allow staggering to settle)
    setTimeout(() => this.checkDueJobs(), 5000);

    // Set up periodic checking
    this.checkInterval = setInterval(() => {
      this.checkDueJobs();
    }, this.checkIntervalMs);

    this.emit('started');
  }

  /**
   * Stop the scheduler
   */
  stop() {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    // Cancel running jobs
    for (const [jobId, job] of this.runningJobs) {
      this.updateJobStatus(jobId, JobStatus.CANCELLED, { error: 'Scheduler stopped' });
    }
    this.runningJobs.clear();

    logger.info('SchedulerService stopped');
    this.emit('stopped');
  }

  /**
   * Check for and execute due jobs
   */
  async checkDueJobs() {
    if (!this.isRunning) return;

    const db = this.getDb();
    const now = new Date().toISOString();

    try {
      // Get active schedules that are due
      const dueSchedules = db.prepare(`
        SELECT s.*, p.name as profile_name, p.system_prompt, p.ai_provider, p.ai_model
        FROM agentic_schedules s
        JOIN agentic_profiles p ON s.agentic_id = p.id
        WHERE s.is_active = 1
          AND s.next_run_at IS NOT NULL
          AND s.next_run_at <= ?
          AND p.status IN ('active', 'running')
        ORDER BY s.next_run_at ASC
        LIMIT ?
      `).all(now, this.maxConcurrentJobs - this.runningJobs.size);

      if (dueSchedules.length === 0) {
        return;
      }

      logger.debug(`Found ${dueSchedules.length} due schedules to process`);

      // Process each due schedule
      for (const schedule of dueSchedules) {
        // Skip if already running
        if (this.runningJobs.has(schedule.id)) {
          continue;
        }

        // Execute the job
        this.executeJob(schedule).catch(error => {
          logger.error(`Job execution failed for schedule ${schedule.id}: ${error.message}`);
        });
      }
    } catch (error) {
      logger.error(`Error checking due jobs: ${error.message}`);
    }
  }

  /**
   * Execute a scheduled job
   * @param {Object} schedule - Schedule record from database
   */
  async executeJob(schedule) {
    const db = this.getDb();
    const jobId = crypto.randomUUID();
    const startTime = Date.now();

    // Create job history record
    const historyRecord = {
      id: jobId,
      scheduleId: schedule.id,
      agenticId: schedule.agentic_id,
      userId: schedule.user_id,
      actionType: schedule.action_type,
      scheduledAt: schedule.next_run_at,
      startedAt: new Date().toISOString(),
      status: JobStatus.RUNNING,
      inputData: JSON.stringify({
        scheduleTitle: schedule.title,
        actionConfig: this.safeJsonParse(schedule.action_config, {}),
        customPrompt: schedule.custom_prompt
      })
    };

    try {
      // Insert history record
      db.prepare(`
        INSERT INTO agentic_job_history (
          id, schedule_id, agentic_id, user_id, action_type,
          scheduled_at, started_at, status, input_data
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        historyRecord.id,
        historyRecord.scheduleId,
        historyRecord.agenticId,
        historyRecord.userId,
        historyRecord.actionType,
        historyRecord.scheduledAt,
        historyRecord.startedAt,
        historyRecord.status,
        historyRecord.inputData
      );

      // Track running job
      this.runningJobs.set(schedule.id, { jobId, schedule, startTime });

      // Emit job started event
      this.emit('job:started', {
        jobId,
        scheduleId: schedule.id,
        actionType: schedule.action_type
      });

      // Execute the action with concurrency guard + hard timeout
      const handlerName = ActionHandlers[schedule.action_type];
      if (!handlerName || typeof this[handlerName] !== 'function') {
        throw new Error(`Unknown action type: ${schedule.action_type}`);
      }

      const JOB_TIMEOUT_MS = parseInt(process.env.SCHEDULER_JOB_TIMEOUT_MS, 10) || 5 * 60 * 1000; // 5 minutes

      // Acquire global AI concurrency slot
      const { getAIConcurrencyGuard } = require('./AIConcurrencyGuard.cjs');
      const guard = getAIConcurrencyGuard();
      let release;
      try {
        release = await guard.acquire(30000); // Wait up to 30s for a slot
      } catch (acquireErr) {
        throw new Error(`Concurrency limit reached: ${acquireErr.message}`);
      }

      let result;
      try {
        result = await Promise.race([
          this[handlerName](schedule, historyRecord),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`Job timed out after ${JOB_TIMEOUT_MS}ms`)), JOB_TIMEOUT_MS)
          ),
        ]);
      } finally {
        if (release) release();
      }

      // Calculate duration
      const duration = Date.now() - startTime;

      // Update history with success
      db.prepare(`
        UPDATE agentic_job_history SET
          status = ?,
          completed_at = ?,
          duration_ms = ?,
          output_data = ?,
          result_summary = ?,
          tokens_used = ?,
          ai_provider = ?,
          ai_model = ?
        WHERE id = ?
      `).run(
        JobStatus.SUCCESS,
        new Date().toISOString(),
        duration,
        JSON.stringify(result.data || {}),
        result.summary || 'Completed successfully',
        result.tokensUsed || 0,
        result.provider || schedule.ai_provider,
        result.model || schedule.ai_model,
        jobId
      );

      // Update schedule timestamps and calculate next run
      this.updateScheduleAfterRun(schedule, true);

      // Emit success event
      this.emit('job:completed', {
        jobId,
        scheduleId: schedule.id,
        actionType: schedule.action_type,
        duration,
        result
      });

      logger.info(`Job ${jobId} completed successfully in ${duration}ms`);

      // Always send scheduled task output to master (was previously opt-in via sendNotification flag)
      const actionConfig = this.safeJsonParse(schedule.action_config, {});
      if (result.data?.content) {
        try {
          const mnsMod = require('./MasterNotificationService.cjs');
          const mns = mnsMod.masterNotificationService || (typeof mnsMod === 'function' ? new mnsMod() : mnsMod);
          if (mns?.sendNotification) {
            const notifType = schedule.action_type === 'health_summary' ? 'health_summary'
              : schedule.action_type === 'reasoning_cycle' ? 'task_completed'
              : schedule.action_type === 'send_report' ? 'daily_report'
              : 'task_completed';
            await mns.sendNotification({
              agenticId: schedule.agentic_id,
              userId: schedule.user_id,
              type: notifType,
              title: schedule.title || 'Scheduled Task Output',
              message: result.data.content,
              priority: actionConfig.priority || 'low',
              referenceType: 'scheduled_task',
              referenceId: schedule.id,
              forceSend: true,
            });
            logger.debug(`Schedule notification sent for job ${jobId}`);
          }
        } catch (notifError) {
          logger.warn(`Schedule notification delivery failed: ${notifError.message}`);
        }
      }

    } catch (error) {
      const duration = Date.now() - startTime;

      // Update history with failure
      db.prepare(`
        UPDATE agentic_job_history SET
          status = ?,
          completed_at = ?,
          duration_ms = ?,
          error_message = ?
        WHERE id = ?
      `).run(
        JobStatus.FAILED,
        new Date().toISOString(),
        duration,
        error.message,
        jobId
      );

      // Update schedule timestamps (still calculate next run)
      this.updateScheduleAfterRun(schedule, false);

      // Emit failure event
      this.emit('job:failed', {
        jobId,
        scheduleId: schedule.id,
        actionType: schedule.action_type,
        duration,
        error: error.message
      });

      // Notify user via dashboard bell
      try {
        const { emitUserNotification } = require('../notificationEmitter.cjs');
        emitUserNotification(schedule.user_id, {
          type: 'error',
          title: 'Scheduled Job Failed',
          message: `Job "${schedule.title || schedule.id}" failed: ${error.message.substring(0, 200)}`,
          duration: 10000,
        });
      } catch (_) { /* best-effort */ }

      logger.error(`Job ${jobId} failed after ${duration}ms: ${error.message}`);
    } finally {
      this.runningJobs.delete(schedule.id);
    }
  }

  /**
   * Update schedule after job execution
   * @param {Object} schedule - Schedule record
   * @param {boolean} success - Whether the job succeeded
   */
  updateScheduleAfterRun(schedule, success) {
    const db = this.getDb();
    const now = new Date().toISOString();

    let nextRunAt = null;

    // Calculate next run based on schedule type
    switch (schedule.schedule_type) {
      case 'cron':
        nextRunAt = this.getNextCronTime(schedule.cron_expression);
        break;

      case 'interval':
        if (schedule.interval_minutes) {
          const next = new Date();
          next.setMinutes(next.getMinutes() + schedule.interval_minutes);
          nextRunAt = next.toISOString();
        }
        break;

      case 'once':
        // One-time schedules don't repeat
        nextRunAt = null;
        break;

      case 'event':
        // Event-based schedules are triggered externally
        nextRunAt = null;
        break;
    }

    // Update schedule
    db.prepare(`
      UPDATE agentic_schedules SET
        last_run_at = ?,
        next_run_at = ?,
        updated_at = ?
      WHERE id = ?
    `).run(now, nextRunAt, now, schedule.id);

    // Deactivate one-time schedules after execution
    if (schedule.schedule_type === 'once') {
      db.prepare(`
        UPDATE agentic_schedules SET is_active = 0 WHERE id = ?
      `).run(schedule.id);
    }
  }

  /**
   * Calculate next cron execution time
   * @param {string} expression - Cron expression
   * @returns {string|null} Next run ISO timestamp
   */
  getNextCronTime(expression) {
    if (!expression) return null;

    try {
      if (cronParser) {
        const interval = cronParser.parseExpression(expression);
        return interval.next().toISOString();
      }

      // Basic fallback parsing
      return this.basicCronNextTime(expression);
    } catch (error) {
      logger.error(`Failed to parse cron expression "${expression}": ${error.message}`);
      return null;
    }
  }

  /**
   * Basic cron next time calculation (fallback)
   * @param {string} expression - Cron expression
   * @returns {string|null} Next run ISO timestamp
   */
  basicCronNextTime(expression) {
    // Simple implementation for common patterns
    const parts = expression.trim().split(/\s+/);
    if (parts.length < 5) return null;

    const [minute, hour] = parts;
    const now = new Date();
    const next = new Date();

    // Handle simple cases like "0 9 * * *" (daily at 9:00)
    if (minute !== '*' && hour !== '*') {
      next.setHours(parseInt(hour, 10), parseInt(minute, 10), 0, 0);
      if (next <= now) {
        next.setDate(next.getDate() + 1);
      }
      return next.toISOString();
    }

    // Default to 1 hour from now for complex patterns
    next.setHours(next.getHours() + 1, 0, 0, 0);
    return next.toISOString();
  }

  // =====================================================
  // ACTION HANDLERS
  // =====================================================

  /**
   * Handle check_messages action
   */
  async handleCheckMessages(schedule, historyRecord) {
    const config = this.safeJsonParse(schedule.action_config, {});

    // Get unread/pending messages for this agentic profile
    const db = this.getDb();
    const messages = db.prepare(`
      SELECT m.*, c.title as conversation_title, c.platform
      FROM messages m
      JOIN conversations c ON m.conversation_id = c.id
      WHERE m.agent_id IN (
        SELECT agent_id FROM agent_agentic_links
        WHERE agentic_id = ?
      )
      AND m.is_read = 0
      AND m.direction = 'inbound'
      ORDER BY m.created_at DESC
      LIMIT ?
    `).all(schedule.agentic_id, config.maxMessages || 10);

    return {
      summary: `Checked ${messages.length} pending messages`,
      data: {
        messageCount: messages.length,
        messages: messages.map(m => ({
          id: m.id,
          preview: m.content?.substring(0, 100),
          platform: m.platform,
          conversationTitle: m.conversation_title
        }))
      },
      tokensUsed: 0
    };
  }

  /**
   * Handle send_report action
   */
  async handleSendReport(schedule, historyRecord) {
    const config = this.safeJsonParse(schedule.action_config, {});

    if (!this.superBrain) {
      throw new Error('SuperBrain not available for report generation');
    }

    const reportType = config.reportType || 'daily_summary';
    const prompt = schedule.custom_prompt || `Generate a ${reportType} report for the agentic profile.`;

    // Build system prompt with personality if available
    let systemPromptText = schedule.system_prompt || 'You are a helpful assistant that generates clear, concise reports.';
    try {
      const { getPersonalityService } = require('./PersonalityService.cjs');
      const personalityPrompt = getPersonalityService().generateSystemPrompt(schedule.agentic_id);
      if (personalityPrompt) {
        systemPromptText = personalityPrompt + '\n\nAdditional instructions: ' + systemPromptText;
      }
    } catch (e) {
      logger.debug(`SchedulerService: personality not available for report: ${e.message}`);
    }

    // Generate report using AI
    const result = await this.superBrain.process({
      task: prompt,
      messages: [
        { role: 'system', content: systemPromptText },
        { role: 'user', content: prompt }
      ],
      userId: schedule.user_id
    }, {
      temperature: 0.7,
      maxTokens: 2000
    });

    return {
      summary: `Generated ${reportType} report`,
      data: {
        reportType,
        content: result.content,
        generatedAt: new Date().toISOString()
      },
      tokensUsed: result.usage?.total_tokens || 0,
      provider: result.provider,
      model: result.model
    };
  }

  /**
   * Handle review_tasks action
   */
  async handleReviewTasks(schedule, historyRecord) {
    const config = this.safeJsonParse(schedule.action_config, {});
    const db = this.getDb();

    // Get pending/in-progress tasks
    const tasks = db.prepare(`
      SELECT * FROM agentic_tasks
      WHERE agentic_id = ?
      AND status IN ('pending', 'in_progress', 'assigned')
      ORDER BY priority DESC, created_at ASC
      LIMIT ?
    `).all(schedule.agentic_id, config.maxTasks || 20);

    // Check for overdue tasks
    const now = new Date().toISOString();
    const overdueTasks = tasks.filter(t => t.due_at && t.due_at < now);

    return {
      summary: `Reviewed ${tasks.length} tasks, ${overdueTasks.length} overdue`,
      data: {
        totalTasks: tasks.length,
        overdueTasks: overdueTasks.length,
        byStatus: {
          pending: tasks.filter(t => t.status === 'pending').length,
          assigned: tasks.filter(t => t.status === 'assigned').length,
          inProgress: tasks.filter(t => t.status === 'in_progress').length
        }
      },
      tokensUsed: 0
    };
  }

  /**
   * Handle update_knowledge action
   */
  async handleUpdateKnowledge(schedule, historyRecord) {
    const config = this.safeJsonParse(schedule.action_config, {});

    // This would integrate with RAG system to refresh knowledge
    // For now, return a placeholder
    return {
      summary: 'Knowledge update scheduled',
      data: {
        sources: config.sources || [],
        status: 'queued'
      },
      tokensUsed: 0
    };
  }

  /**
   * Handle custom_prompt action
   */
  async handleCustomPrompt(schedule, historyRecord) {
    if (!this.superBrain) {
      throw new Error('SuperBrain not available for custom prompt execution');
    }

    const config = this.safeJsonParse(schedule.action_config, {});
    const prompt = schedule.custom_prompt;

    if (!prompt) {
      throw new Error('No custom prompt defined');
    }

    // Build system prompt with personality if available
    let customSystemPrompt = schedule.system_prompt || 'You are a helpful AI assistant.';
    try {
      const { getPersonalityService } = require('./PersonalityService.cjs');
      const personalityPrompt = getPersonalityService().generateSystemPrompt(schedule.agentic_id);
      if (personalityPrompt) {
        customSystemPrompt = personalityPrompt + '\n\nAdditional instructions: ' + customSystemPrompt;
      }
    } catch (e) {
      logger.debug(`SchedulerService: personality not available for custom prompt: ${e.message}`);
    }

    // Execute custom prompt
    const result = await this.superBrain.process({
      task: prompt,
      messages: [
        { role: 'system', content: customSystemPrompt },
        { role: 'user', content: prompt }
      ],
      userId: schedule.user_id
    }, {
      temperature: config.temperature || 0.7,
      maxTokens: config.maxTokens || 2000
    });

    return {
      summary: 'Custom prompt executed',
      data: {
        prompt: prompt.substring(0, 200),
        response: result.content
      },
      tokensUsed: result.usage?.total_tokens || 0,
      provider: result.provider,
      model: result.model
    };
  }

  /**
   * Handle self_reflect action
   */
  async handleSelfReflect(schedule, historyRecord) {
    if (!this.superBrain) {
      throw new Error('SuperBrain not available for self-reflection');
    }

    const db = this.getDb();

    // Get recent activity
    const recentJobs = db.prepare(`
      SELECT action_type, status, result_summary, completed_at
      FROM agentic_job_history
      WHERE agentic_id = ?
      ORDER BY completed_at DESC
      LIMIT 10
    `).all(schedule.agentic_id);

    // Get current goals
    const goals = db.prepare(`
      SELECT title, progress, status
      FROM agentic_goals
      WHERE agentic_id = ? AND status = 'active'
    `).all(schedule.agentic_id);

    const reflectionPrompt = `
      Please review your recent activities and goals, then provide a brief self-assessment:

      Recent Activities:
      ${recentJobs.map(j => `- ${j.action_type}: ${j.status} - ${j.result_summary || 'No summary'}`).join('\n')}

      Active Goals:
      ${goals.map(g => `- ${g.title}: ${g.progress}% complete`).join('\n')}

      Provide:
      1. What went well
      2. Areas for improvement
      3. Recommended next actions
    `;

    // Build system prompt with personality if available
    let reflectSystemPrompt = `${schedule.system_prompt || ''}\n\nYou are performing self-reflection to improve your performance.`;
    try {
      const { getPersonalityService } = require('./PersonalityService.cjs');
      const personalityPrompt = getPersonalityService().generateSystemPrompt(schedule.agentic_id);
      if (personalityPrompt) {
        reflectSystemPrompt = personalityPrompt + '\n\nYou are performing self-reflection to improve your performance.';
      }
    } catch (e) {
      logger.debug(`SchedulerService: personality not available for reflection: ${e.message}`);
    }

    const result = await this.superBrain.process({
      task: reflectionPrompt,
      messages: [
        { role: 'system', content: reflectSystemPrompt },
        { role: 'user', content: reflectionPrompt }
      ],
      userId: schedule.user_id
    }, {
      temperature: 0.5,
      maxTokens: 1500
    });

    // Store reflection in memory
    try {
      db.prepare(`
        INSERT INTO agentic_memory (
          id, agentic_id, user_id, memory_type, title, content,
          importance, created_at, updated_at
        ) VALUES (?, ?, ?, 'reflection', 'Self-Reflection', ?, 7, datetime('now'), datetime('now'))
      `).run(
        crypto.randomUUID(),
        schedule.agentic_id,
        schedule.user_id,
        result.content
      );
    } catch (error) {
      logger.warn(`Failed to store reflection: ${error.message}`);
    }

    return {
      summary: 'Self-reflection completed',
      data: {
        reflection: result.content,
        activitiesReviewed: recentJobs.length,
        goalsReviewed: goals.length
      },
      tokensUsed: result.usage?.total_tokens || 0,
      provider: result.provider,
      model: result.model
    };
  }

  // =====================================================
  // HEALTH SUMMARY HANDLER
  // =====================================================

  /**
   * Handle health_summary action - gather system stats and format as message
   * Moved from AthenaMonitorService.sendHealthSummary() to be schedule-driven
   */
  async handleHealthSummary(schedule, historyRecord) {
    const db = this.getDb();
    const userId = schedule.user_id;

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

    // Get notification stats
    let todayNotifications = 0;
    try {
      todayNotifications = db.prepare(`
        SELECT COUNT(*) as count FROM agentic_master_notifications
        WHERE agentic_id = ? AND created_at > datetime('now', 'start of day')
      `).get(schedule.agentic_id)?.count || 0;
    } catch (e) {
      // table may not exist
    }

    const platformList = connectedPlatforms.map(p => `  ${p.platform}: ${p.count} connected`).join('\n') || '  None connected';
    const now = new Date();
    const timeStr = now.toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur' });

    const content = [
      `Agents: ${activeAgents}/${totalAgents} active`,
      ``,
      `Platforms:`,
      platformList,
      ``,
      `Messages (1h): ${recentMessages}`,
      pendingTasks > 0 ? `Tasks Pending: ${pendingTasks}` : null,
      failedTasks > 0 ? `Tasks Failed (1h): ${failedTasks}` : null,
      ``,
      `Notifications today: ${todayNotifications}`,
      `Time: ${timeStr}`,
    ].filter(Boolean).join('\n');

    return {
      summary: 'Health summary generated',
      data: {
        content,
        activeAgents,
        totalAgents,
        connectedPlatforms: connectedPlatforms.length,
        recentMessages,
        pendingTasks,
        failedTasks,
        generatedAt: now.toISOString(),
      },
      tokensUsed: 0,
    };
  }

  /**
   * Handle reasoning_cycle action - routes through AgentReasoningLoop
   * The AI autonomously decides what to do based on its personality, goals, and context
   */
  async handleReasoningCycle(schedule, historyRecord) {
    const { getAgentReasoningLoop } = require('./AgentReasoningLoop.cjs');
    const loop = getAgentReasoningLoop();

    const actionConfig = this.safeJsonParse(schedule.action_config, {});

    const result = await loop.run(schedule.agentic_id, 'schedule', {
      scheduleTitle: schedule.title,
      scheduleDescription: schedule.description,
      customPrompt: schedule.custom_prompt,
      situation: schedule.custom_prompt || `Scheduled task: ${schedule.title}`,
      actionConfig,
    });

    return {
      summary: `Reasoning cycle: ${result.actions.length} actions, ${result.iterations} iterations`,
      data: {
        content: result.finalThought || `Completed ${result.actions.length} actions`,
        actions: result.actions,
        iterations: result.iterations,
        tokensUsed: result.tokensUsed,
      },
      tokensUsed: result.tokensUsed,
    };
  }

  // =====================================================
  // Phase 2d: PROACTIVE CHECK-IN HANDLERS
  // =====================================================

  /**
   * Follow-up check-in: Send a brief "Anything else?" after task completion.
   * Routes through reasoning loop for personality-aware follow-up.
   */
  async handleFollowUpCheckIn(schedule, historyRecord) {
    const { getAgentReasoningLoop } = require('./AgentReasoningLoop.cjs');
    const loop = getAgentReasoningLoop();
    const actionConfig = this.safeJsonParse(schedule.action_config, {});

    const result = await loop.run(schedule.agentic_id, 'periodic_think', {
      event: 'follow_up_check_in',
      situation: actionConfig.reason || 'Your master has been silent after the last interaction. Send a brief, friendly follow-up to check if they need anything else. Keep it short (1-2 sentences max). Do NOT re-introduce yourself.',
      triggerType: 'follow_up',
      suggestedAction: 'follow_up_check_in',
    });

    return {
      summary: `Follow-up check-in: ${result.actions?.length || 0} actions`,
      data: {
        content: result.finalThought || 'Follow-up sent',
        actions: result.actions,
      },
      tokensUsed: result.tokensUsed,
    };
  }

  /**
   * Proactive outreach: Morning greeting or daily summary.
   * Routes through reasoning loop for intelligent, context-aware greeting.
   */
  async handleProactiveOutreach(schedule, historyRecord) {
    const { getAgentReasoningLoop } = require('./AgentReasoningLoop.cjs');
    const loop = getAgentReasoningLoop();
    const actionConfig = this.safeJsonParse(schedule.action_config, {});
    const type = actionConfig.type || 'morning_greeting';

    let situation;
    if (type === 'morning_greeting') {
      situation = 'It is morning. Send a brief, warm greeting to your master. If there are pending tasks or important updates, mention them briefly. Keep it concise and natural (2-3 sentences max).';
    } else if (type === 'daily_summary') {
      situation = 'End of day. Send a brief daily summary to your master covering: tasks completed, pending items, and any issues requiring attention. Keep it organized but concise.';
    } else {
      situation = actionConfig.situation || 'Send a proactive check-in message to your master.';
    }

    const result = await loop.run(schedule.agentic_id, 'periodic_think', {
      event: 'proactive_outreach',
      situation,
      triggerType: 'proactive_contact',
      suggestedAction: 'proactive_outreach',
      outreachType: type,
    });

    return {
      summary: `Proactive outreach (${type}): ${result.actions?.length || 0} actions`,
      data: {
        content: result.finalThought || 'Proactive message sent',
        actions: result.actions,
        outreachType: type,
      },
      tokensUsed: result.tokensUsed,
    };
  }

  // =====================================================
  // MANUAL TRIGGER METHODS
  // =====================================================

  /**
   * Manually trigger a schedule
   * @param {string} scheduleId - Schedule ID
   * @param {string} userId - User ID for verification
   * @returns {Object} Job execution result
   */
  async triggerSchedule(scheduleId, userId) {
    const db = this.getDb();

    const schedule = db.prepare(`
      SELECT s.*, p.name as profile_name, p.system_prompt, p.ai_provider, p.ai_model
      FROM agentic_schedules s
      JOIN agentic_profiles p ON s.agentic_id = p.id
      WHERE s.id = ? AND s.user_id = ?
    `).get(scheduleId, userId);

    if (!schedule) {
      throw new Error('Schedule not found or access denied');
    }

    // Override next_run_at to now for manual trigger
    schedule.next_run_at = new Date().toISOString();

    // Execute immediately
    return this.executeJob(schedule);
  }

  /**
   * Get job history for a schedule or agentic profile
   * @param {Object} filters - Query filters
   * @returns {Object} Paginated job history
   */
  getJobHistory(filters = {}) {
    const db = this.getDb();

    const {
      scheduleId = null,
      agenticId = null,
      userId = null,
      status = null,
      actionType = null,
      page = 1,
      pageSize = 20,
      startDate = null,
      endDate = null
    } = filters;

    const conditions = [];
    const params = [];

    if (scheduleId) {
      conditions.push('jh.schedule_id = ?');
      params.push(scheduleId);
    }

    if (agenticId) {
      conditions.push('jh.agentic_id = ?');
      params.push(agenticId);
    }

    if (userId) {
      conditions.push('jh.user_id = ?');
      params.push(userId);
    }

    if (status) {
      conditions.push('jh.status = ?');
      params.push(status);
    }

    if (actionType) {
      conditions.push('jh.action_type = ?');
      params.push(actionType);
    }

    if (startDate) {
      conditions.push('jh.created_at >= ?');
      params.push(startDate);
    }

    if (endDate) {
      conditions.push('jh.created_at <= ?');
      params.push(endDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (page - 1) * pageSize;

    // Get total count
    const countResult = db.prepare(`
      SELECT COUNT(*) as total FROM agentic_job_history jh ${whereClause}
    `).get(...params);

    // Get paginated results
    const jobs = db.prepare(`
      SELECT jh.*, s.title as schedule_title
      FROM agentic_job_history jh
      LEFT JOIN agentic_schedules s ON jh.schedule_id = s.id
      ${whereClause}
      ORDER BY jh.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, pageSize, offset);

    return {
      jobs: jobs.map(job => this.transformJobHistory(job)),
      total: countResult.total,
      page,
      pageSize,
      totalPages: Math.ceil(countResult.total / pageSize)
    };
  }

  /**
   * Get job statistics
   * @param {string} agenticId - Agentic profile ID
   * @param {string} userId - User ID
   * @returns {Object} Job statistics
   */
  getJobStats(agenticId, userId) {
    const db = this.getDb();

    const stats = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) as running,
        AVG(CASE WHEN status = 'success' THEN duration_ms END) as avgDuration,
        SUM(tokens_used) as totalTokens
      FROM agentic_job_history
      WHERE agentic_id = ? AND user_id = ?
    `).get(agenticId, userId);

    // Get stats by action type
    const byActionType = db.prepare(`
      SELECT
        action_type,
        COUNT(*) as total,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
      FROM agentic_job_history
      WHERE agentic_id = ? AND user_id = ?
      GROUP BY action_type
    `).all(agenticId, userId);

    // Get recent activity (last 24 hours)
    const recentActivity = db.prepare(`
      SELECT
        strftime('%H', created_at) as hour,
        COUNT(*) as count
      FROM agentic_job_history
      WHERE agentic_id = ? AND user_id = ?
        AND created_at >= datetime('now', '-24 hours')
      GROUP BY strftime('%H', created_at)
      ORDER BY hour
    `).all(agenticId, userId);

    return {
      total: stats.total || 0,
      success: stats.success || 0,
      failed: stats.failed || 0,
      running: stats.running || 0,
      successRate: stats.total > 0 ? Math.round((stats.success / stats.total) * 100) : 0,
      avgDurationMs: Math.round(stats.avgDuration || 0),
      totalTokensUsed: stats.totalTokens || 0,
      byActionType: byActionType.map(item => ({
        actionType: item.action_type,
        total: item.total,
        success: item.success,
        failed: item.failed,
        successRate: item.total > 0 ? Math.round((item.success / item.total) * 100) : 0
      })),
      recentActivity
    };
  }

  // =====================================================
  // TRANSFORM HELPERS
  // =====================================================

  /**
   * Transform job history row to API format
   */
  transformJobHistory(row) {
    return {
      id: row.id,
      scheduleId: row.schedule_id,
      scheduleTitle: row.schedule_title,
      agenticId: row.agentic_id,
      userId: row.user_id,
      actionType: row.action_type,
      scheduledAt: row.scheduled_at,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      durationMs: row.duration_ms,
      status: row.status,
      errorMessage: row.error_message,
      retryCount: row.retry_count,
      inputData: this.safeJsonParse(row.input_data, {}),
      outputData: this.safeJsonParse(row.output_data, {}),
      resultSummary: row.result_summary,
      tokensUsed: row.tokens_used,
      aiProvider: row.ai_provider,
      aiModel: row.ai_model,
      createdAt: row.created_at
    };
  }

  /**
   * Safely parse JSON string
   */
  safeJsonParse(str, defaultValue) {
    if (!str) return defaultValue;
    try {
      return JSON.parse(str);
    } catch {
      return defaultValue;
    }
  }
}

// Singleton instance
let _instance = null;

function getSchedulerService() {
  if (!_instance) {
    _instance = new SchedulerService();
  }
  return _instance;
}

module.exports = {
  SchedulerService,
  getSchedulerService,
  JobStatus
};
