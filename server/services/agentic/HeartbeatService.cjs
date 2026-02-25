/**
 * Heartbeat Service
 * =================
 * Agents periodically "check in" with a heartbeat. If no heartbeat_ok
 * is emitted within the configured interval, escalate (notify master,
 * mark agent as unhealthy).
 *
 * Configuration per agent via agentic_profiles.heartbeat_config:
 *   { "enabled": true, "intervalMs": 300000, "escalateAfterMisses": 3 }
 *
 * Usage:
 *   const { getHeartbeatService } = require('./HeartbeatService.cjs');
 *   const hb = getHeartbeatService();
 *   hb.start();  // Starts timers for all agents with heartbeat enabled
 */

const { logger } = require('../logger.cjs');
const { getDatabase } = require('../database.cjs');

class HeartbeatService {
  constructor() {
    this.timers = new Map();      // agentId -> intervalId
    this.missCount = new Map();   // agentId -> consecutive misses
    this.lastOk = new Map();      // agentId -> timestamp
    this.configs = new Map();     // agentId -> parsed heartbeat_config
    this.started = false;
  }

  /**
   * Start heartbeat monitoring for all enabled agents.
   */
  start() {
    if (this.started) return;
    this.started = true;

    try {
      const db = getDatabase();
      const agents = db.prepare(`
        SELECT id, name, heartbeat_config FROM agentic_profiles
        WHERE heartbeat_config IS NOT NULL
      `).all();

      let started = 0;
      for (const agent of agents) {
        try {
          const config = JSON.parse(agent.heartbeat_config);
          if (config && config.enabled) {
            this.startAgent(agent.id, config);
            started++;
          }
        } catch (e) {
          logger.debug(`[Heartbeat] Invalid config for agent ${agent.id}: ${e.message}`);
        }
      }

      if (started > 0) {
        logger.info(`[Heartbeat] Started monitoring for ${started} agents`);
      } else {
        logger.debug('[Heartbeat] No agents have heartbeat enabled');
      }
    } catch (e) {
      logger.warn(`[Heartbeat] Failed to start: ${e.message}`);
    }
  }

  /**
   * Start heartbeat timer for a specific agent.
   */
  startAgent(agentId, config) {
    // Stop existing timer if any
    this.stopAgent(agentId);

    const intervalMs = config.intervalMs || 300000; // Default: 5 minutes
    this.configs.set(agentId, config);
    this.missCount.set(agentId, 0);

    const timer = setInterval(() => {
      this.performHeartbeat(agentId).catch(err => {
        logger.warn(`[Heartbeat] Error for agent ${agentId}: ${err.message}`);
      });
    }, intervalMs);

    this.timers.set(agentId, timer);
    logger.info(`[Heartbeat] Started for agent ${agentId} (interval: ${intervalMs}ms)`);
  }

  /**
   * Stop heartbeat timer for a specific agent.
   */
  stopAgent(agentId) {
    const timer = this.timers.get(agentId);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(agentId);
      this.configs.delete(agentId);
      this.missCount.delete(agentId);
      logger.debug(`[Heartbeat] Stopped for agent ${agentId}`);
    }
  }

  /**
   * Perform a heartbeat check for an agent.
   */
  async performHeartbeat(agentId) {
    const config = this.configs.get(agentId);
    if (!config) return;

    try {
      const { getAgentReasoningLoop } = require('./AgentReasoningLoop.cjs');
      const loop = getAgentReasoningLoop();

      const result = await loop.run(agentId, 'heartbeat', {
        situation: 'Periodic heartbeat check - confirm you are operational',
        lastHeartbeatOk: this.lastOk.get(agentId),
      });

      // Check if AI responded with heartbeat_ok action
      const hasOk = result.actions.some(a => a.tool === 'heartbeat_ok' && a.status === 'executed');

      if (hasOk) {
        this.missCount.set(agentId, 0);
        this.lastOk.set(agentId, Date.now());
        logger.debug(`[Heartbeat] Agent ${agentId} OK`);
        // Emit heartbeat:ok hook
        try {
          const { getHookRegistry } = require('./HookRegistry.cjs');
          getHookRegistry().emitAsync('heartbeat:ok', { agenticId: agentId, lastOk: Date.now() });
        } catch (e) { /* hooks optional */ }
      } else if (result.silent) {
        // Silent response counts as OK (agent is alive but chose not to act)
        this.missCount.set(agentId, 0);
        this.lastOk.set(agentId, Date.now());
        logger.debug(`[Heartbeat] Agent ${agentId} silent (counted as OK)`);
      } else {
        const misses = (this.missCount.get(agentId) || 0) + 1;
        this.missCount.set(agentId, misses);
        logger.warn(`[Heartbeat] Agent ${agentId} missed heartbeat (${misses}/${config.escalateAfterMisses || 3})`);

        // Emit heartbeat:miss hook
        try {
          const { getHookRegistry } = require('./HookRegistry.cjs');
          getHookRegistry().emitAsync('heartbeat:miss', { agenticId: agentId, missCount: misses });
        } catch (e) { /* hooks optional */ }

        if (misses >= (config.escalateAfterMisses || 3)) {
          await this.escalate(agentId, misses);
        }
      }
    } catch (error) {
      const misses = (this.missCount.get(agentId) || 0) + 1;
      this.missCount.set(agentId, misses);
      logger.warn(`[Heartbeat] Agent ${agentId} heartbeat failed: ${error.message} (miss ${misses})`);

      if (misses >= (this.configs.get(agentId)?.escalateAfterMisses || 3)) {
        await this.escalate(agentId, misses);
      }
    }
  }

  /**
   * Escalate missed heartbeats - notify master.
   */
  async escalate(agentId, misses) {
    logger.warn(`[Heartbeat] ESCALATION: Agent ${agentId} missed ${misses} consecutive heartbeats`);

    try {
      const db = getDatabase();
      const profile = db.prepare('SELECT name, user_id FROM agentic_profiles WHERE id = ?').get(agentId);
      if (!profile) return;

      // Try to notify master via MasterNotificationService
      const { getMasterNotificationService } = require('./MasterNotificationService.cjs');
      const notifier = getMasterNotificationService();
      if (notifier) {
        await notifier.sendNotification({
          agenticId: agentId,
          userId: profile.user_id,
          type: 'critical_error',
          title: 'Agent Heartbeat Failure',
          message: `Agent "${profile.name}" has missed ${misses} consecutive heartbeats and may be unresponsive.`,
          priority: 'high',
        });
      }

      // Log to activity log
      db.prepare(`
        INSERT INTO agentic_activity_log (id, agentic_id, user_id, activity_type, trigger_type, details, created_at)
        VALUES (?, ?, ?, 'heartbeat_escalation', 'heartbeat', ?, datetime('now'))
      `).run(
        require('uuid').v4(),
        agentId,
        profile.user_id,
        JSON.stringify({ misses, escalated: true })
      );
    } catch (e) {
      logger.error(`[Heartbeat] Failed to escalate for agent ${agentId}: ${e.message}`);
    }
  }

  /**
   * Reload heartbeat config for an agent (call after profile update).
   */
  reloadAgent(agentId) {
    try {
      const db = getDatabase();
      const agent = db.prepare('SELECT heartbeat_config FROM agentic_profiles WHERE id = ?').get(agentId);
      if (!agent?.heartbeat_config) {
        this.stopAgent(agentId);
        return;
      }

      const config = JSON.parse(agent.heartbeat_config);
      if (config && config.enabled) {
        this.startAgent(agentId, config);
      } else {
        this.stopAgent(agentId);
      }
    } catch (e) {
      logger.debug(`[Heartbeat] Failed to reload agent ${agentId}: ${e.message}`);
    }
  }

  /**
   * Stop all heartbeat timers.
   */
  stop() {
    for (const [agentId, timer] of this.timers) {
      clearInterval(timer);
    }
    this.timers.clear();
    this.missCount.clear();
    this.configs.clear();
    this.started = false;
    logger.info('[Heartbeat] All timers stopped');
  }

  /**
   * Get heartbeat status for all monitored agents.
   */
  getStatus() {
    const status = {};
    for (const [agentId, config] of this.configs) {
      status[agentId] = {
        config,
        lastOk: this.lastOk.get(agentId) || null,
        missCount: this.missCount.get(agentId) || 0,
        isMonitoring: this.timers.has(agentId),
      };
    }
    return status;
  }
}

// Singleton
let _instance = null;
function getHeartbeatService() {
  if (!_instance) {
    _instance = new HeartbeatService();
  }
  return _instance;
}

module.exports = {
  HeartbeatService,
  getHeartbeatService,
};
