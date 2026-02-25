/**
 * Agent Logs Routes
 * Logging and analytics for agent actions
 */

const express = require('express');
const { getDatabase } = require('../services/database.cjs');
const { logger } = require('../services/logger.cjs');
const { authenticate } = require('./auth.cjs');
const agentLogService = require('../services/agentLogService.cjs');

const router = express.Router();

// Apply authentication to all routes
router.use(authenticate);

// ============================================
// Helper: Verify agent ownership
// ============================================

function verifyAgentOwnership(agentId, userId) {
  const db = getDatabase();
  const agent = db.prepare('SELECT id FROM agents WHERE id = ? AND user_id = ?').get(agentId, userId);
  return !!agent;
}

// ============================================
// Query Logs
// ============================================

/**
 * GET /api/agent-logs
 * Query logs with filters
 */
router.get('/', (req, res) => {
  try {
    const {
      agentId,
      conversationId,
      messageId,
      actionTypes,
      startDate,
      endDate,
      hasError,
      limit = '100',
      offset = '0'
    } = req.query;

    // If filtering by agent, verify ownership
    if (agentId && !verifyAgentOwnership(agentId, req.user.id)) {
      return res.status(403).json({ error: 'Access denied to this agent' });
    }

    // Parse action types if provided
    let parsedActionTypes;
    if (actionTypes) {
      parsedActionTypes = Array.isArray(actionTypes) ? actionTypes : actionTypes.split(',');
      parsedActionTypes = parsedActionTypes.filter(t =>
        agentLogService.ACTION_TYPES.includes(t)
      );
    }

    // If no agent filter, get all user's agents and query
    if (!agentId) {
      const db = getDatabase();
      const userAgents = db.prepare('SELECT id FROM agents WHERE user_id = ?').all(req.user.id);

      if (userAgents.length === 0) {
        return res.json([]);
      }

      // Query logs for all user's agents
      const allLogs = [];
      for (const agent of userAgents) {
        const logs = agentLogService.query({
          agentId: agent.id,
          conversationId,
          messageId,
          actionTypes: parsedActionTypes,
          startDate,
          endDate,
          hasError: hasError === 'true' ? true : hasError === 'false' ? false : undefined,
          limit: parseInt(limit),
          offset: 0 // We'll apply offset after merging
        });
        allLogs.push(...logs);
      }

      // Sort by date descending and apply limit/offset
      allLogs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      const startIdx = parseInt(offset);
      const endIdx = startIdx + parseInt(limit);
      const paginatedLogs = allLogs.slice(startIdx, endIdx);

      return res.json(paginatedLogs);
    }

    const logs = agentLogService.query({
      agentId,
      conversationId,
      messageId,
      actionTypes: parsedActionTypes,
      startDate,
      endDate,
      hasError: hasError === 'true' ? true : hasError === 'false' ? false : undefined,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json(logs);

  } catch (error) {
    logger.error(`Failed to query logs: ${error.message}`);
    res.status(500).json({ error: 'Failed to query logs' });
  }
});

/**
 * GET /api/agent-logs/summary
 * Get summary for all user's agents
 */
router.get('/summary', (req, res) => {
  try {
    const { period = 'day' } = req.query;

    const db = getDatabase();
    const userAgents = db.prepare(`
      SELECT id, name FROM agents WHERE user_id = ?
    `).all(req.user.id);

    if (userAgents.length === 0) {
      return res.json({
        totalAgents: 0,
        totalLogs: 0,
        totalTokens: 0,
        totalCost: 0,
        agentStats: []
      });
    }

    const agentStats = userAgents.map(agent => {
      const stats = agentLogService.getAgentStats(agent.id, period);
      return {
        agentId: agent.id,
        agentName: agent.name,
        ...stats
      };
    });

    const summary = {
      totalAgents: userAgents.length,
      totalLogs: agentStats.reduce((sum, s) => sum + s.totalActions, 0),
      totalTokens: agentStats.reduce((sum, s) => sum + s.totalTokens, 0),
      totalCost: agentStats.reduce((sum, s) => sum + s.totalCost, 0),
      agentStats
    };

    res.json(summary);

  } catch (error) {
    logger.error(`Failed to get summary: ${error.message}`);
    res.status(500).json({ error: 'Failed to get summary' });
  }
});

/**
 * GET /api/agent-logs/conversation/:conversationId
 * Get logs for a conversation
 */
router.get('/conversation/:conversationId', (req, res) => {
  try {
    const { limit = '100' } = req.query;
    const logs = agentLogService.getByConversation(req.params.conversationId, parseInt(limit));
    res.json(logs);

  } catch (error) {
    logger.error(`Failed to get conversation logs: ${error.message}`);
    res.status(500).json({ error: 'Failed to get conversation logs' });
  }
});

/**
 * GET /api/agent-logs/:id
 * Get a specific log entry
 */
router.get('/:id', (req, res) => {
  try {
    const log = agentLogService.getById(req.params.id);

    if (!log) {
      return res.status(404).json({ error: 'Log entry not found' });
    }

    // Verify user owns the agent
    if (!verifyAgentOwnership(log.agentId, req.user.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(log);

  } catch (error) {
    logger.error(`Failed to get log: ${error.message}`);
    res.status(500).json({ error: 'Failed to get log' });
  }
});

/**
 * GET /api/agent-logs/:id/children
 * Get child logs for a parent log
 */
router.get('/:id/children', (req, res) => {
  try {
    const log = agentLogService.getById(req.params.id);

    if (!log) {
      return res.status(404).json({ error: 'Log entry not found' });
    }

    // Verify user owns the agent
    if (!verifyAgentOwnership(log.agentId, req.user.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const children = agentLogService.getChildLogs(req.params.id);
    res.json(children);

  } catch (error) {
    logger.error(`Failed to get child logs: ${error.message}`);
    res.status(500).json({ error: 'Failed to get child logs' });
  }
});

// ============================================
// Agent Stats Routes
// ============================================

/**
 * GET /api/agent-logs/agent/:agentId/stats
 * Get stats for a specific agent
 */
router.get('/agent/:agentId/stats', (req, res) => {
  try {
    const { period = 'day' } = req.query;

    // Verify ownership
    if (!verifyAgentOwnership(req.params.agentId, req.user.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const stats = agentLogService.getAgentStats(req.params.agentId, period);
    res.json(stats);

  } catch (error) {
    logger.error(`Failed to get agent stats: ${error.message}`);
    res.status(500).json({ error: 'Failed to get agent stats' });
  }
});

/**
 * GET /api/agent-logs/agent/:agentId/errors
 * Get recent errors for an agent
 */
router.get('/agent/:agentId/errors', (req, res) => {
  try {
    const { limit = '50' } = req.query;

    // Verify ownership
    if (!verifyAgentOwnership(req.params.agentId, req.user.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const errors = agentLogService.query({
      agentId: req.params.agentId,
      hasError: true,
      limit: parseInt(limit)
    });

    res.json(errors);

  } catch (error) {
    logger.error(`Failed to get agent errors: ${error.message}`);
    res.status(500).json({ error: 'Failed to get agent errors' });
  }
});

/**
 * GET /api/agent-logs/agent/:agentId/breakdown
 * Get action type breakdown for an agent
 */
router.get('/agent/:agentId/breakdown', (req, res) => {
  try {
    const { period = 'day' } = req.query;

    // Verify ownership
    if (!verifyAgentOwnership(req.params.agentId, req.user.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const stats = agentLogService.getAgentStats(req.params.agentId, period);

    // Transform to breakdown format
    const breakdown = {
      period,
      totalLogs: stats.totalActions,
      actionTypeBreakdown: stats.byActionType,
      errorRate: stats.totalActions > 0
        ? ((stats.byActionType['error'] || 0) / stats.totalActions * 100).toFixed(2) + '%'
        : '0%',
      averageTokensPerCompletion: stats.totalTokens > 0
        ? Math.round(stats.totalTokens / (stats.byActionType['ai_completion'] || 1))
        : 0,
      totalCost: stats.totalCost.toFixed(4),
      averageDuration: stats.avgDurationMs.toFixed(2) + 'ms'
    };

    res.json(breakdown);

  } catch (error) {
    logger.error(`Failed to get agent breakdown: ${error.message}`);
    res.status(500).json({ error: 'Failed to get agent breakdown' });
  }
});

module.exports = router;
