/**
 * Dashboard Routes
 * Statistics and overview data
 */

const express = require('express');
const { getDatabase } = require('../services/database.cjs');
const { logger } = require('../services/logger.cjs');
const { authenticate } = require('./auth.cjs');

const router = express.Router();

router.use(authenticate);

/**
 * GET /api/dashboard/stats
 * Get dashboard statistics
 */
router.get('/stats', (req, res) => {
  try {
    const db = getDatabase();

    // Get agents with details for the dashboard (including platform info)
    // Use subquery to get only one platform account per agent (prefer connected, then most recent)
    const agentsWithDetails = db.prepare(`
      SELECT
        a.id,
        a.name,
        a.ai_model as model,
        a.status,
        a.system_prompt as systemPrompt,
        a.reputation_score as reputationScore,
        (SELECT COUNT(*) FROM messages m
         JOIN conversations c ON m.conversation_id = c.id
         WHERE c.agent_id = a.id) as messageCount,
        (SELECT COUNT(*) FROM conversations c WHERE c.agent_id = a.id) as conversationCount,
        (SELECT id FROM platform_accounts WHERE agent_id = a.id ORDER BY
          CASE status WHEN 'connected' THEN 0 WHEN 'qr_pending' THEN 1 ELSE 2 END,
          created_at DESC LIMIT 1) as platformAccountId,
        (SELECT platform FROM platform_accounts WHERE agent_id = a.id ORDER BY
          CASE status WHEN 'connected' THEN 0 WHEN 'qr_pending' THEN 1 ELSE 2 END,
          created_at DESC LIMIT 1) as platformType,
        (SELECT status FROM platform_accounts WHERE agent_id = a.id ORDER BY
          CASE status WHEN 'connected' THEN 0 WHEN 'qr_pending' THEN 1 ELSE 2 END,
          created_at DESC LIMIT 1) as platformStatus
      FROM agents a
      WHERE a.user_id = ?
      ORDER BY a.created_at DESC
    `).all(req.user.id);

    // Transform agents to match DashboardAgent interface
    const agents = agentsWithDetails.map(agent => ({
      id: agent.id,
      name: agent.name,
      model: agent.model || 'default',
      status: agent.status || 'offline',
      systemPrompt: agent.systemPrompt || '',
      skills: [],
      messageCount: agent.messageCount || 0,
      conversationCount: agent.conversationCount || 0,
      reputationScore: agent.reputationScore || 100,
      // Platform info for sync functionality
      platformAccountId: agent.platformAccountId || null,
      platformType: agent.platformType || null,
      platformStatus: agent.platformStatus || null
    }));

    // Calculate agent stats
    const totalAgents = agents.length;
    const activeAgents = agents.filter(a => a.status === 'idle' || a.status === 'busy').length;

    // Get message stats (last 24 hours)
    const messageStats = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN direction = 'incoming' THEN 1 ELSE 0 END) as incoming,
        SUM(CASE WHEN direction = 'outgoing' THEN 1 ELSE 0 END) as outgoing
      FROM messages m
      JOIN conversations c ON m.conversation_id = c.id
      WHERE c.user_id = ? AND m.created_at >= datetime('now', '-1 day')
    `).get(req.user.id);

    // Get active flows count
    const activeFlowsResult = db.prepare(`
      SELECT COUNT(*) as count
      FROM flows
      WHERE user_id = ? AND status = 'active'
    `).get(req.user.id);

    // Get AI usage stats for today
    const aiUsageToday = db.prepare(`
      SELECT
        COALESCE(SUM(input_tokens + output_tokens), 0) as totalTokens,
        COALESCE(SUM(cost), 0) as totalCost
      FROM ai_usage
      WHERE user_id = ? AND created_at >= datetime('now', '-1 day')
    `).get(req.user.id);

    // Calculate swarm health metrics
    const swarmHealth = {
      connectivity: totalAgents > 0 ? Math.round((activeAgents / totalAgents) * 100) : 0,
      averageLoad: calculateAverageLoad(db, req.user.id),
      collaborationRate: calculateCollaborationRate(db, req.user.id),
      consensusSuccess: calculateConsensusSuccess(db, req.user.id)
    };

    // Get recent handoffs
    const recentHandoffs = db.prepare(`
      SELECT
        h.id,
        h.from_agent_id,
        h.to_agent_id,
        h.reason,
        h.status,
        h.created_at as timestamp,
        fa.name as fromAgentName,
        ta.name as toAgentName
      FROM handoffs h
      JOIN agents fa ON h.from_agent_id = fa.id
      JOIN agents ta ON h.to_agent_id = ta.id
      WHERE fa.user_id = ?
      ORDER BY h.created_at DESC
      LIMIT 5
    `).all(req.user.id);

    const formattedHandoffs = recentHandoffs.map(h => ({
      id: h.id,
      fromAgent: { id: h.from_agent_id, name: h.fromAgentName },
      toAgent: { id: h.to_agent_id, name: h.toAgentName },
      reason: h.reason,
      status: h.status,
      timestamp: h.timestamp
    }));

    // Build stats object matching DashboardStats interface
    const stats = {
      totalAgents,
      activeAgents,
      messagesToday: messageStats?.total || 0,
      activeTasks: activeFlowsResult?.count || 0,
      aiCostToday: aiUsageToday?.totalCost || 0,
      aiTokensToday: aiUsageToday?.totalTokens || 0
    };

    res.json({
      agents,
      stats,
      swarmHealth,
      recentHandoffs: formattedHandoffs
    });

  } catch (error) {
    logger.error(`Failed to get dashboard stats: ${error.message}`);
    res.status(500).json({ error: 'Failed to get dashboard stats' });
  }
});

/**
 * Calculate average load across agents (% of agents currently busy)
 */
function calculateAverageLoad(db, userId) {
  try {
    const result = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'busy' THEN 1 ELSE 0 END) as busy
      FROM agents
      WHERE user_id = ?
    `).get(userId);

    if (!result || result.total === 0) return 0;
    return Math.round((result.busy / result.total) * 100);
  } catch (e) {
    return 0;
  }
}

/**
 * Calculate collaboration rate (% of tasks with multiple agents)
 */
function calculateCollaborationRate(db, userId) {
  try {
    const result = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN participants_count > 1 THEN 1 ELSE 0 END) as collaborative
      FROM (
        SELECT task_id, COUNT(DISTINCT agent_id) as participants_count
        FROM swarm_task_assignments sta
        JOIN swarm_tasks st ON sta.task_id = st.id
        WHERE st.user_id = ?
        GROUP BY task_id
      )
    `).get(userId);

    if (!result || result.total === 0) return 0;
    return Math.round((result.collaborative / result.total) * 100);
  } catch (e) {
    return 0;
  }
}

/**
 * Calculate consensus success rate
 */
function calculateConsensusSuccess(db, userId) {
  try {
    const result = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as successful
      FROM consensus_sessions cs
      JOIN swarm_tasks st ON cs.task_id = st.id
      WHERE st.user_id = ?
    `).get(userId);

    if (!result || result.total === 0) return 0;
    return Math.round((result.successful / result.total) * 100);
  } catch (e) {
    return 0;
  }
}

/**
 * GET /api/dashboard/schedules
 * Get scheduled flows
 */
router.get('/schedules', (req, res) => {
  try {
    const db = getDatabase();

    // Get flows with schedule triggers
    const flows = db.prepare(`
      SELECT id, name, description, nodes, status, trigger_type, created_at, updated_at
      FROM flows
      WHERE user_id = ? AND trigger_type = 'schedule'
      ORDER BY updated_at DESC
    `).all(req.user.id);

    // Parse nodes to find schedule configurations
    const schedules = flows.map(flow => {
      let scheduleConfig = null;
      let nextRunAt = null;
      let nextRunDescription = 'Not scheduled';

      try {
        const nodes = JSON.parse(flow.nodes || '[]');
        const scheduleTrigger = nodes.find(n =>
          n.type === 'trigger' && n.data?.subtype === 'schedule_trigger'
        );

        if (scheduleTrigger?.data?.config) {
          scheduleConfig = scheduleTrigger.data.config;

          // Calculate next run based on cron or interval
          if (scheduleConfig.cronExpression) {
            nextRunDescription = `Cron: ${scheduleConfig.cronExpression}`;
            // For simplicity, estimate next run as 1 hour from now if active
            if (flow.status === 'active') {
              nextRunAt = new Date(Date.now() + 3600000).toISOString();
            }
          } else if (scheduleConfig.interval) {
            const intervalMs = scheduleConfig.interval * 1000;
            nextRunDescription = `Every ${scheduleConfig.interval}s`;
            if (flow.status === 'active') {
              nextRunAt = new Date(Date.now() + intervalMs).toISOString();
            }
          }
        }
      } catch (e) {
        // Ignore parse errors
      }

      const countdownSeconds = nextRunAt
        ? Math.max(0, Math.floor((new Date(nextRunAt) - Date.now()) / 1000))
        : 0;

      return {
        scheduleId: flow.id,
        flowId: flow.id,
        flowName: flow.name,
        description: flow.description,
        status: flow.status,
        nextRunAt,
        nextRunDescription,
        countdownSeconds,
        countdownFormatted: formatCountdown(countdownSeconds),
        upcomingExecutions: [],
        createdAt: flow.created_at,
        updatedAt: flow.updated_at
      };
    });

    // Sort by next run (active first, then by time)
    schedules.sort((a, b) => {
      if (a.status === 'active' && b.status !== 'active') return -1;
      if (a.status !== 'active' && b.status === 'active') return 1;
      if (!a.nextRunAt) return 1;
      if (!b.nextRunAt) return -1;
      return new Date(a.nextRunAt) - new Date(b.nextRunAt);
    });

    // Create summary
    const enabledSchedules = schedules.filter(s => s.status === 'active').length;
    const nextExecution = schedules.find(s => s.status === 'active' && s.nextRunAt) || null;

    res.json({
      schedules,
      summary: {
        totalSchedules: schedules.length,
        enabledSchedules,
        disabledSchedules: schedules.length - enabledSchedules,
        nextExecution: nextExecution ? {
          scheduleId: nextExecution.scheduleId,
          flowId: nextExecution.flowId,
          flowName: nextExecution.flowName,
          scheduleName: nextExecution.flowName,
          nextRunAt: nextExecution.nextRunAt,
          nextRunDescription: nextExecution.nextRunDescription,
          countdownSeconds: nextExecution.countdownSeconds,
          countdownFormatted: nextExecution.countdownFormatted
        } : null
      }
    });

  } catch (error) {
    logger.error(`Failed to get schedules: ${error.message}`);
    res.status(500).json({ error: 'Failed to get schedules' });
  }
});

/**
 * Format countdown seconds to human-readable string
 */
function formatCountdown(seconds) {
  if (seconds <= 0) return 'Now';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
}

/**
 * GET /api/dashboard/activity
 * Get recent activity
 */
router.get('/activity', (req, res) => {
  try {
    const db = getDatabase();
    const { limit = 20 } = req.query;

    const activity = db.prepare(`
      SELECT
        m.id,
        m.content,
        m.direction,
        m.created_at as timestamp,
        c.title as conversationTitle,
        c.platform,
        a.name as agentName
      FROM messages m
      JOIN conversations c ON m.conversation_id = c.id
      LEFT JOIN agents a ON c.agent_id = a.id
      WHERE c.user_id = ?
      ORDER BY m.created_at DESC
      LIMIT ?
    `).all(req.user.id, parseInt(limit));

    res.json({ activity });

  } catch (error) {
    logger.error(`Failed to get activity: ${error.message}`);
    res.status(500).json({ error: 'Failed to get activity' });
  }
});

/**
 * GET /api/dashboard/health
 * Get detailed swarm health with issues and auto-healing actions
 */
router.get('/health', (req, res) => {
  try {
    const db = getDatabase();
    const issues = [];
    const actions = [];

    // Check platform accounts for issues
    const platformAccounts = db.prepare(`
      SELECT pa.id, pa.platform, pa.status, pa.agent_id, a.name as agentName
      FROM platform_accounts pa
      LEFT JOIN agents a ON pa.agent_id = a.id
      WHERE pa.user_id = ?
    `).all(req.user.id);

    const errorAccounts = platformAccounts.filter(p => p.status === 'error');
    const disconnectedAccounts = platformAccounts.filter(p => p.status === 'disconnected');
    const qrPendingAccounts = platformAccounts.filter(p => p.status === 'qr_pending');

    // Add issues for error accounts
    errorAccounts.forEach(account => {
      issues.push({
        id: `platform-error-${account.id}`,
        type: 'error',
        category: 'platform',
        title: `${account.platform} connection failed`,
        description: `Agent "${account.agentName || 'Unknown'}" has a failed ${account.platform} connection`,
        accountId: account.id,
        agentId: account.agent_id,
        platform: account.platform
      });
      actions.push({
        id: `reset-${account.id}`,
        issueId: `platform-error-${account.id}`,
        label: 'Reset & Reconnect',
        description: 'Reset the error status and attempt to reconnect',
        endpoint: `/api/platforms/${account.id}/reset`,
        method: 'POST',
        autoHeal: true
      });
    });

    // Add issues for disconnected accounts (warning)
    disconnectedAccounts.forEach(account => {
      issues.push({
        id: `platform-disconnected-${account.id}`,
        type: 'warning',
        category: 'platform',
        title: `${account.platform} disconnected`,
        description: `Agent "${account.agentName || 'Unknown'}" is not connected to ${account.platform}`,
        accountId: account.id,
        agentId: account.agent_id,
        platform: account.platform
      });
      actions.push({
        id: `connect-${account.id}`,
        issueId: `platform-disconnected-${account.id}`,
        label: 'Connect',
        description: 'Attempt to connect to the platform',
        endpoint: `/api/platforms/${account.id}/connect`,
        method: 'POST',
        autoHeal: true
      });
    });

    // Add info for QR pending (needs user action)
    qrPendingAccounts.forEach(account => {
      issues.push({
        id: `platform-qr-${account.id}`,
        type: 'info',
        category: 'platform',
        title: `${account.platform} awaiting QR scan`,
        description: `Agent "${account.agentName || 'Unknown'}" needs QR code to be scanned`,
        accountId: account.id,
        agentId: account.agent_id,
        platform: account.platform
      });
      actions.push({
        id: `scan-qr-${account.id}`,
        issueId: `platform-qr-${account.id}`,
        label: 'Scan QR Code',
        description: 'Open the agent to scan the QR code',
        navigateTo: `/agents?openQR=${account.agent_id}`,
        autoHeal: false
      });
    });

    // Check agent status
    const agents = db.prepare(`
      SELECT id, name, status FROM agents WHERE user_id = ?
    `).all(req.user.id);

    const errorAgents = agents.filter(a => a.status === 'error');
    const offlineAgents = agents.filter(a => a.status === 'offline');

    errorAgents.forEach(agent => {
      issues.push({
        id: `agent-error-${agent.id}`,
        type: 'error',
        category: 'agent',
        title: `Agent "${agent.name}" in error state`,
        description: 'This agent encountered an error and needs attention',
        agentId: agent.id
      });
      actions.push({
        id: `reset-agent-${agent.id}`,
        issueId: `agent-error-${agent.id}`,
        label: 'Reset Agent',
        description: 'Reset the agent status to idle',
        endpoint: `/api/agents/${agent.id}/status`,
        method: 'PATCH',
        body: { status: 'idle' },
        autoHeal: true
      });
    });

    // Calculate health status
    const errorCount = issues.filter(i => i.type === 'error').length;
    const warningCount = issues.filter(i => i.type === 'warning').length;
    const infoCount = issues.filter(i => i.type === 'info').length;

    let healthStatus = 'healthy';
    let healthColor = 'green';
    let healthLabel = 'All Systems Operational';

    if (errorCount > 0) {
      healthStatus = 'critical';
      healthColor = 'red';
      healthLabel = `${errorCount} Critical Issue${errorCount > 1 ? 's' : ''}`;
    } else if (warningCount > 0) {
      healthStatus = 'degraded';
      healthColor = 'yellow';
      healthLabel = `${warningCount} Warning${warningCount > 1 ? 's' : ''}`;
    } else if (infoCount > 0) {
      healthStatus = 'attention';
      healthColor = 'blue';
      healthLabel = `${infoCount} Item${infoCount > 1 ? 's' : ''} Need Attention`;
    }

    // Summary stats
    const totalAgents = agents.length;
    const activeAgents = agents.filter(a => a.status === 'idle' || a.status === 'busy').length;
    const connectedPlatforms = platformAccounts.filter(p => p.status === 'connected').length;
    const totalPlatforms = platformAccounts.length;

    res.json({
      health: {
        status: healthStatus,
        color: healthColor,
        label: healthLabel
      },
      summary: {
        totalAgents,
        activeAgents,
        connectedPlatforms,
        totalPlatforms,
        errorCount,
        warningCount,
        infoCount
      },
      issues,
      actions,
      lastChecked: new Date().toISOString()
    });

  } catch (error) {
    logger.error(`Failed to get health status: ${error.message}`);
    res.status(500).json({ error: 'Failed to get health status' });
  }
});

/**
 * POST /api/dashboard/health/auto-heal
 * Execute all auto-healable actions
 */
router.post('/health/auto-heal', async (req, res) => {
  try {
    const db = getDatabase();
    const results = [];

    // Reset all error platform accounts
    const errorAccounts = db.prepare(`
      SELECT id, platform FROM platform_accounts
      WHERE user_id = ? AND status = 'error'
    `).all(req.user.id);

    for (const account of errorAccounts) {
      try {
        db.prepare(`
          UPDATE platform_accounts
          SET status = 'disconnected', updated_at = datetime('now')
          WHERE id = ?
        `).run(account.id);

        results.push({
          accountId: account.id,
          platform: account.platform,
          action: 'reset',
          success: true
        });
      } catch (err) {
        results.push({
          accountId: account.id,
          platform: account.platform,
          action: 'reset',
          success: false,
          error: err.message
        });
      }
    }

    // Reset all error agents
    const errorAgents = db.prepare(`
      SELECT id, name FROM agents
      WHERE user_id = ? AND status = 'error'
    `).all(req.user.id);

    for (const agent of errorAgents) {
      try {
        db.prepare(`
          UPDATE agents
          SET status = 'idle', updated_at = datetime('now')
          WHERE id = ?
        `).run(agent.id);

        results.push({
          agentId: agent.id,
          agentName: agent.name,
          action: 'reset',
          success: true
        });
      } catch (err) {
        results.push({
          agentId: agent.id,
          agentName: agent.name,
          action: 'reset',
          success: false,
          error: err.message
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    logger.info(`Auto-heal completed: ${successCount} success, ${failCount} failed`);

    res.json({
      success: true,
      message: `Auto-heal completed: ${successCount} fixed, ${failCount} failed`,
      results
    });

  } catch (error) {
    logger.error(`Auto-heal failed: ${error.message}`);
    res.status(500).json({ error: 'Auto-heal failed' });
  }
});

// ============================================================
// DELIVERY QUEUE (DLQ) ENDPOINTS
// ============================================================

/**
 * GET /api/dashboard/dlq/stats
 * Get delivery queue statistics
 */
router.get('/dlq/stats', (req, res) => {
  try {
    const { getDeliveryQueueService } = require('../services/deliveryQueueService.cjs');
    const dlq = getDeliveryQueueService();
    const stats = dlq.getStats(req.user.id);

    // Recent activity (last 24h) — filtered by user
    const db = getDatabase();
    const recentSent = db.prepare(`
      SELECT COUNT(*) as count FROM delivery_queue
      WHERE user_id = ? AND status = 'sent' AND sent_at >= datetime('now', '-1 day')
    `).get(req.user.id);
    const recentFailed = db.prepare(`
      SELECT COUNT(*) as count FROM delivery_queue
      WHERE user_id = ? AND status = 'dead' AND dead_at >= datetime('now', '-1 day')
    `).get(req.user.id);

    res.json({
      stats,
      recent24h: {
        sent: recentSent?.count || 0,
        dead: recentFailed?.count || 0,
      },
      healthStatus: (stats.dead || 0) > 0 || (stats.retrying || 0) > 5 ? 'warning' : 'healthy',
    });
  } catch (error) {
    logger.error(`Failed to get DLQ stats: ${error.message}`);
    res.status(500).json({ error: 'Failed to get DLQ stats' });
  }
});

/**
 * GET /api/dashboard/dlq/dead-letters
 * Get dead letter entries
 */
router.get('/dlq/dead-letters', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const { getDeliveryQueueService } = require('../services/deliveryQueueService.cjs');
    const dlq = getDeliveryQueueService();
    const deadLetters = dlq.getDeadLetters(limit, req.user.id);

    res.json({ deadLetters, total: deadLetters.length });
  } catch (error) {
    logger.error(`Failed to get dead letters: ${error.message}`);
    res.status(500).json({ error: 'Failed to get dead letters' });
  }
});

/**
 * POST /api/dashboard/dlq/retry/:id
 * Retry a dead letter message
 */
router.post('/dlq/retry/:id', async (req, res) => {
  try {
    const { getDeliveryQueueService } = require('../services/deliveryQueueService.cjs');
    const dlq = getDeliveryQueueService();
    const sent = await dlq.retryDeadLetter(req.params.id, req.user.id);

    res.json({ success: true, sent, message: sent ? 'Message delivered' : 'Message re-queued for retry' });
  } catch (error) {
    logger.error(`Failed to retry dead letter ${req.params.id}: ${error.message}`);
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /api/dashboard/dlq/history
 * Get recent delivery history (sent + dead)
 */
router.get('/dlq/history', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const db = getDatabase();
    const history = db.prepare(`
      SELECT id, recipient, platform, content_type, status, source, retry_count, last_error,
             created_at, sent_at, dead_at
      FROM delivery_queue
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(req.user.id, limit);

    res.json({ history, total: history.length });
  } catch (error) {
    logger.error(`Failed to get DLQ history: ${error.message}`);
    res.status(500).json({ error: 'Failed to get DLQ history' });
  }
});

module.exports = router;
