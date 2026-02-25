/**
 * Swarm Routes
 * Swarm orchestration, handoffs, consensus, and collaboration
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('../services/database.cjs');
const { logger } = require('../services/logger.cjs');
const { authenticate } = require('./auth.cjs');
const { createPagination } = require('../utils/responseHelpers.cjs');

const router = express.Router();

router.use(authenticate);

/**
 * Default swarm configuration
 */
const DEFAULT_SWARM_CONFIG = {
  maxAgentsPerUser: 10,
  maxConcurrentTasks: 5,
  handoffTimeout: 30,
  consensusThreshold: 60,
  autoAssignTasks: true,
  enableCollaboration: true,
  taskRetryLimit: 3,
  idleAgentTimeout: 60,
  // AI Flow Generator settings
  flowGeneratorAiName: 'Athena',
};

/**
 * GET /api/swarm/config
 * Get swarm configuration for the user
 */
router.get('/config', (req, res) => {
  try {
    const db = getDatabase();

    // Check if user is superadmin for system-wide config
    const isSuperAdmin = req.user.isSuperuser || req.user.role === 'superadmin';

    // Try to get user-specific config or system config
    let config = null;

    if (isSuperAdmin) {
      // Get system-wide swarm config
      const systemConfig = db.prepare(
        'SELECT value FROM system_settings WHERE key = ?'
      ).get('swarm_config');

      if (systemConfig) {
        try {
          config = JSON.parse(systemConfig.value);
        } catch (e) {
          // Invalid JSON, use defaults
        }
      }
    }

    // Return config with defaults filled in
    res.json({
      config: { ...DEFAULT_SWARM_CONFIG, ...config }
    });

  } catch (error) {
    logger.error(`Failed to get swarm config: ${error.message}`);
    res.status(500).json({ error: 'Failed to get swarm config' });
  }
});

/**
 * PUT /api/swarm/config
 * Update swarm configuration (superadmin only)
 */
router.put('/config', (req, res) => {
  try {
    // Check if user is superadmin
    const isSuperAdmin = req.user.isSuperuser || req.user.role === 'superadmin';
    if (!isSuperAdmin) {
      return res.status(403).json({ error: 'Only superadmins can update swarm configuration' });
    }

    const db = getDatabase();
    const { config } = req.body;

    if (!config) {
      return res.status(400).json({ error: 'config is required' });
    }

    // Validate config values
    const validatedConfig = {
      maxAgentsPerUser: Math.min(100, Math.max(1, config.maxAgentsPerUser || DEFAULT_SWARM_CONFIG.maxAgentsPerUser)),
      maxConcurrentTasks: Math.min(50, Math.max(1, config.maxConcurrentTasks || DEFAULT_SWARM_CONFIG.maxConcurrentTasks)),
      handoffTimeout: Math.min(120, Math.max(5, config.handoffTimeout || DEFAULT_SWARM_CONFIG.handoffTimeout)),
      consensusThreshold: Math.min(100, Math.max(50, config.consensusThreshold || DEFAULT_SWARM_CONFIG.consensusThreshold)),
      autoAssignTasks: config.autoAssignTasks !== undefined ? config.autoAssignTasks : DEFAULT_SWARM_CONFIG.autoAssignTasks,
      enableCollaboration: config.enableCollaboration !== undefined ? config.enableCollaboration : DEFAULT_SWARM_CONFIG.enableCollaboration,
      taskRetryLimit: Math.min(10, Math.max(0, config.taskRetryLimit || DEFAULT_SWARM_CONFIG.taskRetryLimit)),
      idleAgentTimeout: Math.min(1440, Math.max(5, config.idleAgentTimeout || DEFAULT_SWARM_CONFIG.idleAgentTimeout)),
      // AI Flow Generator name - validate and sanitize
      flowGeneratorAiName: (config.flowGeneratorAiName || DEFAULT_SWARM_CONFIG.flowGeneratorAiName).trim().substring(0, 50),
    };

    // Upsert system config
    db.prepare(`
      INSERT INTO system_settings (id, key, value, updated_at)
      VALUES (lower(hex(randomblob(16))), ?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at
    `).run('swarm_config', JSON.stringify(validatedConfig));

    logger.info(`Swarm config updated by user ${req.user.id}`);

    res.json({
      config: validatedConfig,
      message: 'Swarm configuration updated successfully'
    });

  } catch (error) {
    logger.error(`Failed to update swarm config: ${error.message}`);
    res.status(500).json({ error: 'Failed to update swarm config' });
  }
});

/**
 * Transform task from database to API format
 */
function transformTask(t) {
  if (!t) return null;
  return {
    id: t.id,
    userId: t.user_id,
    title: t.title,
    description: t.description,
    status: t.status,
    priority: t.priority,
    assignedAgentId: t.assigned_agent_id,
    agentName: t.agentName,
    result: t.result,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
    completedAt: t.completed_at
  };
}

/**
 * Transform handoff from database to API format
 */
function transformHandoff(h) {
  if (!h) return null;
  return {
    id: h.id,
    userId: h.user_id,
    conversationId: h.conversation_id,
    conversationTitle: h.conversationTitle,
    fromAgentId: h.from_agent_id,
    fromAgentName: h.fromAgentName,
    toAgentId: h.to_agent_id,
    toAgentName: h.toAgentName,
    reason: h.reason,
    status: h.status,
    createdAt: h.created_at,
    acceptedAt: h.accepted_at,
    rejectedAt: h.rejected_at
  };
}

/**
 * Transform consensus request from database to API format
 */
function transformConsensusRequest(r) {
  if (!r) return null;
  return {
    id: r.id,
    userId: r.user_id,
    question: r.question,
    options: r.options ? JSON.parse(r.options) : [],
    agentIds: r.agent_ids ? JSON.parse(r.agent_ids) : [],
    votes: r.votes ? JSON.parse(r.votes) : {},
    threshold: r.threshold,
    status: r.status,
    result: r.result,
    expiresAt: r.expires_at,
    createdAt: r.created_at,
    completedAt: r.completed_at
  };
}

/**
 * GET /api/swarm/status
 * Get swarm status overview
 */
router.get('/status', async (req, res) => {
  try {
    const { getSwarmOrchestrator } = require('../services/swarm/index.cjs');
    const orchestrator = getSwarmOrchestrator();

    const status = await orchestrator.getStatus(req.user.id);

    // Calculate health status
    const total = status.agents?.total || 0;
    const active = (status.agents?.idle || 0) + (status.agents?.busy || 0);

    let health = 'offline';
    if (total > 0) {
      const ratio = active / total;
      if (ratio >= 0.7) health = 'healthy';
      else if (ratio >= 0.3) health = 'degraded';
      else health = 'critical';
    }

    res.json({
      status: health,
      agents: {
        total,
        active,
        idle: status.agents?.idle || 0,
        busy: status.agents?.busy || 0,
        offline: status.agents?.offline || 0,
        error: status.agents?.error || 0,
      },
      tasks: {
        active: status.activeTasks,
      },
      handoffs: {
        recent: status.recentHandoffs,
      },
      lastUpdated: status.lastUpdated,
    });

  } catch (error) {
    logger.error(`Failed to get swarm status: ${error.message}`);
    res.status(500).json({ error: 'Failed to get swarm status' });
  }
});

/**
 * GET /api/swarm/stats/extended
 * Get extended swarm statistics
 */
router.get('/stats/extended', (req, res) => {
  try {
    const db = getDatabase();

    const agents = db.prepare(`
      SELECT
        a.*,
        (SELECT COUNT(*) FROM conversations WHERE agent_id = a.id) as conversationCount,
        (SELECT COUNT(*) FROM messages m JOIN conversations c ON m.conversation_id = c.id WHERE c.agent_id = a.id) as messageCount
      FROM agents a
      WHERE a.user_id = ?
    `).all(req.user.id);

    res.json({
      agents: agents.map(a => ({
        id: a.id,
        name: a.name,
        status: a.status,
        conversationCount: a.conversationCount,
        messageCount: a.messageCount,
        lastActive: a.updated_at
      })),
      summary: {
        totalAgents: agents.length,
        activeAgents: agents.filter(a => a.status !== 'offline').length,
        totalConversations: agents.reduce((sum, a) => sum + a.conversationCount, 0),
        totalMessages: agents.reduce((sum, a) => sum + a.messageCount, 0)
      }
    });

  } catch (error) {
    logger.error(`Failed to get extended stats: ${error.message}`);
    res.status(500).json({ error: 'Failed to get extended stats' });
  }
});

/**
 * GET /api/swarm/leaderboard
 * Get agent leaderboard
 */
router.get('/leaderboard', (req, res) => {
  try {
    const db = getDatabase();
    const { limit = 10 } = req.query;

    const leaderboard = db.prepare(`
      SELECT
        a.id,
        a.name,
        a.status,
        (SELECT COUNT(*) FROM conversations WHERE agent_id = a.id) as conversations,
        (SELECT COUNT(*) FROM messages m JOIN conversations c ON m.conversation_id = c.id WHERE c.agent_id = a.id AND m.direction = 'outgoing') as messagesSent,
        COALESCE(a.reputation_score, 100) as score
      FROM agents a
      WHERE a.user_id = ?
      ORDER BY score DESC, conversations DESC
      LIMIT ?
    `).all(req.user.id, parseInt(limit));

    res.json({ leaderboard });

  } catch (error) {
    logger.error(`Failed to get leaderboard: ${error.message}`);
    res.status(500).json({ error: 'Failed to get leaderboard' });
  }
});

/**
 * GET /api/swarm/tasks
 * List swarm tasks
 */
router.get('/tasks', (req, res) => {
  try {
    const db = getDatabase();
    const { status, limit = 50, offset = 0 } = req.query;

    // Count query for pagination
    let countQuery = 'SELECT COUNT(*) as count FROM swarm_tasks WHERE user_id = ?';
    const countParams = [req.user.id];
    if (status) {
      countQuery += ' AND status = ?';
      countParams.push(status);
    }
    const totalCount = db.prepare(countQuery).get(...countParams).count;

    let query = `
      SELECT t.*, a.name as agentName
      FROM swarm_tasks t
      LEFT JOIN agents a ON t.assigned_agent_id = a.id
      WHERE t.user_id = ?
    `;
    const params = [req.user.id];

    if (status) {
      query += ' AND t.status = ?';
      params.push(status);
    }

    query += ' ORDER BY t.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const tasks = db.prepare(query).all(...params);
    const transformed = tasks.map(transformTask);

    res.json({
      tasks: transformed,
      pagination: createPagination(transformed, {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: totalCount
      })
    });

  } catch (error) {
    logger.error(`Failed to list tasks: ${error.message}`);
    res.status(500).json({ error: 'Failed to list tasks' });
  }
});

/**
 * POST /api/swarm/tasks
 * Create a swarm task
 */
router.post('/tasks', async (req, res) => {
  try {
    const { title, description, priority, agentId, autoAssign = true } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Task title is required' });
    }

    const { getSwarmOrchestrator } = require('../services/swarm/index.cjs');
    const orchestrator = getSwarmOrchestrator();

    const task = await orchestrator.createTask({
      userId: req.user.id,
      title,
      description,
      priority: priority || 'normal',
      agentId,
      autoAssign,
    });

    // Broadcast to WebSocket
    if (global.wsBroadcast) {
      global.wsBroadcast('swarm:task_created', task);
    }

    res.status(201).json({ task });

  } catch (error) {
    logger.error(`Failed to create task: ${error.message}`);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

/**
 * GET /api/swarm/handoffs/recent
 * Get recent handoffs
 */
router.get('/handoffs/recent', (req, res) => {
  try {
    const db = getDatabase();
    const { limit = 20, offset = 0 } = req.query;

    // Count query for pagination
    const totalCount = db.prepare('SELECT COUNT(*) as count FROM handoffs WHERE user_id = ?')
      .get(req.user.id).count;

    const handoffs = db.prepare(`
      SELECT
        h.*,
        fa.name as fromAgentName,
        ta.name as toAgentName,
        c.title as conversationTitle
      FROM handoffs h
      LEFT JOIN agents fa ON h.from_agent_id = fa.id
      LEFT JOIN agents ta ON h.to_agent_id = ta.id
      LEFT JOIN conversations c ON h.conversation_id = c.id
      WHERE h.user_id = ?
      ORDER BY h.created_at DESC
      LIMIT ? OFFSET ?
    `).all(req.user.id, parseInt(limit), parseInt(offset));

    const transformed = handoffs.map(transformHandoff);

    res.json({
      handoffs: transformed,
      pagination: createPagination(transformed, {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: totalCount
      })
    });

  } catch (error) {
    logger.error(`Failed to get handoffs: ${error.message}`);
    res.status(500).json({ error: 'Failed to get handoffs' });
  }
});

/**
 * POST /api/swarm/handoff
 * Initiate agent handoff
 */
router.post('/handoff', async (req, res) => {
  try {
    const { conversationId, fromAgentId, toAgentId, reason, autoAccept = true } = req.body;

    if (!toAgentId) {
      return res.status(400).json({ error: 'toAgentId is required' });
    }

    const { getHandoffService } = require('../services/swarm/index.cjs');
    const handoffService = getHandoffService();

    const handoff = await handoffService.createHandoff({
      userId: req.user.id,
      conversationId,
      fromAgentId,
      toAgentId,
      reason,
      autoAccept,
    });

    // Broadcast
    if (global.wsBroadcast) {
      global.wsBroadcast('swarm:handoff', handoff);
    }

    res.status(201).json({ handoff });

  } catch (error) {
    logger.error(`Failed to create handoff: ${error.message}`);
    res.status(500).json({ error: error.message || 'Failed to create handoff' });
  }
});

/**
 * POST /api/swarm/handoff/:id/accept
 * Accept a pending handoff
 */
router.post('/handoff/:id/accept', async (req, res) => {
  try {
    const { getHandoffService } = require('../services/swarm/index.cjs');
    const handoffService = getHandoffService();

    const handoff = await handoffService.acceptHandoff(req.params.id, req.user.id);

    if (global.wsBroadcast) {
      global.wsBroadcast('swarm:handoff_accepted', handoff);
    }

    res.json({ handoff });

  } catch (error) {
    logger.error(`Failed to accept handoff: ${error.message}`);
    res.status(400).json({ error: error.message || 'Failed to accept handoff' });
  }
});

/**
 * POST /api/swarm/handoff/:id/reject
 * Reject a pending handoff
 */
router.post('/handoff/:id/reject', async (req, res) => {
  try {
    const { reason } = req.body;

    const { getHandoffService } = require('../services/swarm/index.cjs');
    const handoffService = getHandoffService();

    const handoff = await handoffService.rejectHandoff(req.params.id, req.user.id, reason);

    if (global.wsBroadcast) {
      global.wsBroadcast('swarm:handoff_rejected', handoff);
    }

    res.json({ handoff });

  } catch (error) {
    logger.error(`Failed to reject handoff: ${error.message}`);
    res.status(400).json({ error: error.message || 'Failed to reject handoff' });
  }
});

/**
 * GET /api/swarm/consensus
 * Get consensus requests
 */
router.get('/consensus', (req, res) => {
  try {
    const db = getDatabase();
    const { limit = 20, offset = 0 } = req.query;

    // Count query for pagination
    const totalCount = db.prepare('SELECT COUNT(*) as count FROM consensus_requests WHERE user_id = ?')
      .get(req.user.id).count;

    const requests = db.prepare(`
      SELECT * FROM consensus_requests
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(req.user.id, parseInt(limit), parseInt(offset));

    const transformed = requests.map(transformConsensusRequest);

    res.json({
      requests: transformed,
      pagination: createPagination(transformed, {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: totalCount
      })
    });

  } catch (error) {
    logger.error(`Failed to get consensus: ${error.message}`);
    res.status(500).json({ error: 'Failed to get consensus' });
  }
});

/**
 * POST /api/swarm/consensus
 * Create consensus request
 */
router.post('/consensus', async (req, res) => {
  try {
    const { question, options, agentIds, threshold, expiresIn } = req.body;

    if (!question || !options || !agentIds) {
      return res.status(400).json({ error: 'question, options, and agentIds are required' });
    }

    const { getConsensusService } = require('../services/swarm/index.cjs');
    const consensusService = getConsensusService();

    const request = await consensusService.createConsensusRequest({
      userId: req.user.id,
      question,
      optionsList: options,
      agentIds,
      threshold: threshold || 0.5,
      expiresIn,
    });

    if (global.wsBroadcast) {
      global.wsBroadcast('swarm:consensus_created', request);
    }

    res.status(201).json({ request });

  } catch (error) {
    logger.error(`Failed to create consensus: ${error.message}`);
    res.status(500).json({ error: error.message || 'Failed to create consensus' });
  }
});

/**
 * POST /api/swarm/consensus/:id/vote
 * Submit a vote for a consensus request
 */
router.post('/consensus/:id/vote', async (req, res) => {
  try {
    const { agentId, choice, reasoning } = req.body;

    if (!agentId || choice === undefined) {
      return res.status(400).json({ error: 'agentId and choice are required' });
    }

    const { getConsensusService } = require('../services/swarm/index.cjs');
    const consensusService = getConsensusService();

    const result = await consensusService.submitVote(req.params.id, agentId, choice, reasoning);

    if (global.wsBroadcast) {
      global.wsBroadcast('swarm:consensus_vote', {
        requestId: req.params.id,
        agentId,
        ...result,
      });
    }

    res.json(result);

  } catch (error) {
    logger.error(`Failed to submit vote: ${error.message}`);
    res.status(400).json({ error: error.message || 'Failed to submit vote' });
  }
});

/**
 * GET /api/swarm/consensus/:id
 * Get consensus request details
 */
router.get('/consensus/:id', async (req, res) => {
  try {
    const { getConsensusService } = require('../services/swarm/index.cjs');
    const consensusService = getConsensusService();

    const request = await consensusService.getConsensusRequest(req.params.id, req.user.id);

    if (!request) {
      return res.status(404).json({ error: 'Consensus request not found' });
    }

    res.json({ request });

  } catch (error) {
    logger.error(`Failed to get consensus: ${error.message}`);
    res.status(500).json({ error: 'Failed to get consensus request' });
  }
});

/**
 * POST /api/swarm/collaborate
 * Start multi-agent collaboration
 */
router.post('/collaborate', async (req, res) => {
  try {
    const { agentIds, task, context, mode = 'sequential', maxRounds = 5 } = req.body;

    if (!agentIds || !task) {
      return res.status(400).json({ error: 'agentIds and task are required' });
    }

    const { getCollaborationService } = require('../services/swarm/index.cjs');
    const collaborationService = getCollaborationService();

    const collaboration = await collaborationService.createCollaboration({
      userId: req.user.id,
      agentIds,
      task,
      context,
      mode,
      maxRounds,
    });

    // Broadcast
    if (global.wsBroadcast) {
      global.wsBroadcast('swarm:collaboration_started', collaboration);
    }

    res.status(201).json(collaboration);

  } catch (error) {
    logger.error(`Failed to start collaboration: ${error.message}`);
    res.status(500).json({ error: error.message || 'Failed to start collaboration' });
  }
});

/**
 * GET /api/swarm/collaborate/:id
 * Get collaboration details
 */
router.get('/collaborate/:id', async (req, res) => {
  try {
    const { getCollaborationService } = require('../services/swarm/index.cjs');
    const collaborationService = getCollaborationService();

    const collaboration = await collaborationService.getCollaboration(req.params.id, req.user.id);

    if (!collaboration) {
      return res.status(404).json({ error: 'Collaboration not found' });
    }

    res.json({ collaboration });

  } catch (error) {
    logger.error(`Failed to get collaboration: ${error.message}`);
    res.status(500).json({ error: 'Failed to get collaboration' });
  }
});

/**
 * POST /api/swarm/collaborate/:id/contribute
 * Add contribution to collaboration
 */
router.post('/collaborate/:id/contribute', async (req, res) => {
  try {
    const { agentId, content, metadata } = req.body;

    if (!agentId || !content) {
      return res.status(400).json({ error: 'agentId and content are required' });
    }

    const { getCollaborationService } = require('../services/swarm/index.cjs');
    const collaborationService = getCollaborationService();

    const result = await collaborationService.addContribution(
      req.params.id,
      agentId,
      { content, metadata }
    );

    if (global.wsBroadcast) {
      global.wsBroadcast('swarm:collaboration_contribution', {
        collaborationId: req.params.id,
        agentId,
        ...result,
      });
    }

    res.json(result);

  } catch (error) {
    logger.error(`Failed to add contribution: ${error.message}`);
    res.status(400).json({ error: error.message || 'Failed to add contribution' });
  }
});

/**
 * POST /api/swarm/collaborate/:id/complete
 * Complete a collaboration
 */
router.post('/collaborate/:id/complete', async (req, res) => {
  try {
    const { reason } = req.body;

    const { getCollaborationService } = require('../services/swarm/index.cjs');
    const collaborationService = getCollaborationService();

    const result = await collaborationService.completeCollaboration(req.params.id, reason);

    if (global.wsBroadcast) {
      global.wsBroadcast('swarm:collaboration_completed', {
        collaborationId: req.params.id,
        ...result,
      });
    }

    res.json(result);

  } catch (error) {
    logger.error(`Failed to complete collaboration: ${error.message}`);
    res.status(400).json({ error: error.message || 'Failed to complete collaboration' });
  }
});

/**
 * POST /api/swarm/broadcast
 * Broadcast message to agents
 */
router.post('/broadcast', async (req, res) => {
  try {
    const { agentIds, message, channel } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'message is required' });
    }

    const { getSwarmOrchestrator } = require('../services/swarm/index.cjs');
    const orchestrator = getSwarmOrchestrator();

    const result = await orchestrator.broadcast({
      userId: req.user.id,
      message,
      agentIds,
      channel,
    });

    // Also broadcast to WebSocket
    if (global.wsBroadcast) {
      global.wsBroadcast('swarm:broadcast', {
        agentIds,
        message,
        channel,
        timestamp: new Date().toISOString()
      });
    }

    res.json(result);

  } catch (error) {
    logger.error(`Failed to broadcast: ${error.message}`);
    res.status(500).json({ error: 'Failed to broadcast' });
  }
});

/**
 * GET /api/swarm/agents/available
 * Get available agents
 */
router.get('/agents/available', async (req, res) => {
  try {
    const { skills } = req.query;

    const { getAgentDiscoveryService } = require('../services/swarm/index.cjs');
    const discovery = getAgentDiscoveryService();

    const agents = await discovery.getAvailableAgents(req.user.id, {
      skills: skills ? skills.split(',') : undefined,
    });

    res.json({ agents });

  } catch (error) {
    logger.error(`Failed to get available agents: ${error.message}`);
    res.status(500).json({ error: 'Failed to get available agents' });
  }
});

/**
 * POST /api/swarm/agents/:id/heartbeat
 * Register agent heartbeat
 */
router.post('/agents/:id/heartbeat', async (req, res) => {
  try {
    const { getAgentDiscoveryService } = require('../services/swarm/index.cjs');
    const discovery = getAgentDiscoveryService();

    await discovery.heartbeat(req.params.id);

    res.json({ success: true, timestamp: new Date().toISOString() });

  } catch (error) {
    logger.error(`Failed to register heartbeat: ${error.message}`);
    res.status(500).json({ error: 'Failed to register heartbeat' });
  }
});

/**
 * POST /api/swarm/tasks/:id/complete
 * Complete a task
 */
router.post('/tasks/:id/complete', async (req, res) => {
  try {
    const { result } = req.body;

    const { getSwarmOrchestrator } = require('../services/swarm/index.cjs');
    const orchestrator = getSwarmOrchestrator();

    const task = await orchestrator.completeTask(req.params.id, req.user.id, result);

    if (global.wsBroadcast) {
      global.wsBroadcast('swarm:task_completed', task);
    }

    res.json({ task });

  } catch (error) {
    logger.error(`Failed to complete task: ${error.message}`);
    res.status(400).json({ error: error.message || 'Failed to complete task' });
  }
});

/**
 * POST /api/swarm/tasks/:id/fail
 * Mark a task as failed
 */
router.post('/tasks/:id/fail', async (req, res) => {
  try {
    const { reason } = req.body;

    const { getSwarmOrchestrator } = require('../services/swarm/index.cjs');
    const orchestrator = getSwarmOrchestrator();

    const task = await orchestrator.failTask(req.params.id, req.user.id, reason);

    if (global.wsBroadcast) {
      global.wsBroadcast('swarm:task_failed', task);
    }

    res.json({ task });

  } catch (error) {
    logger.error(`Failed to mark task as failed: ${error.message}`);
    res.status(400).json({ error: error.message || 'Failed to mark task as failed' });
  }
});

/**
 * POST /api/swarm/tasks/:id/assign
 * Assign a task to an agent
 */
router.post('/tasks/:id/assign', async (req, res) => {
  try {
    const { agentId } = req.body;

    if (!agentId) {
      return res.status(400).json({ error: 'agentId is required' });
    }

    const { getSwarmOrchestrator } = require('../services/swarm/index.cjs');
    const orchestrator = getSwarmOrchestrator();

    const task = await orchestrator.assignTask(req.params.id, agentId, req.user.id);

    if (global.wsBroadcast) {
      global.wsBroadcast('swarm:task_assigned', task);
    }

    res.json({ task });

  } catch (error) {
    logger.error(`Failed to assign task: ${error.message}`);
    res.status(400).json({ error: error.message || 'Failed to assign task' });
  }
});

// ============================================================================
// EMAIL COORDINATION ENDPOINTS
// ============================================================================

/**
 * POST /api/swarm/email/tasks
 * Create an email coordination task
 */
router.post('/email/tasks', async (req, res) => {
  try {
    const {
      emailId,
      emailExternalId,
      platformAccountId,
      conversationId,
      priority,
      agentId,
      autoAssign,
      metadata,
    } = req.body;

    if (!emailId) {
      return res.status(400).json({ error: 'emailId is required' });
    }

    const { getEmailCoordinationService } = require('../services/swarm/index.cjs');
    const emailCoord = getEmailCoordinationService();

    const task = await emailCoord.createEmailTask({
      userId: req.user.id,
      emailId,
      emailExternalId,
      platformAccountId,
      conversationId,
      priority,
      agentId,
      autoAssign: autoAssign !== false,
      metadata,
    });

    res.status(201).json({ task });
  } catch (error) {
    logger.error(`Failed to create email task: ${error.message}`);
    res.status(400).json({ error: error.message || 'Failed to create email task' });
  }
});

/**
 * GET /api/swarm/email/tasks
 * Get email coordination tasks
 */
router.get('/email/tasks', async (req, res) => {
  try {
    const { status, agentId, priority, limit, offset } = req.query;

    const { getEmailCoordinationService } = require('../services/swarm/index.cjs');
    const emailCoord = getEmailCoordinationService();

    const result = await emailCoord.getEmailTasks(req.user.id, {
      status,
      agentId,
      priority,
      limit: parseInt(limit) || 50,
      offset: parseInt(offset) || 0,
    });

    res.json(result);
  } catch (error) {
    logger.error(`Failed to get email tasks: ${error.message}`);
    res.status(500).json({ error: 'Failed to get email tasks' });
  }
});

/**
 * GET /api/swarm/email/tasks/:id
 * Get a specific email task
 */
router.get('/email/tasks/:id', async (req, res) => {
  try {
    const { getEmailCoordinationService } = require('../services/swarm/index.cjs');
    const emailCoord = getEmailCoordinationService();

    const task = await emailCoord.getEmailTask(req.params.id, req.user.id);

    if (!task) {
      return res.status(404).json({ error: 'Email task not found' });
    }

    res.json({ task });
  } catch (error) {
    logger.error(`Failed to get email task: ${error.message}`);
    res.status(500).json({ error: 'Failed to get email task' });
  }
});

/**
 * POST /api/swarm/email/assign
 * Assign an email to an agent
 */
router.post('/email/assign', async (req, res) => {
  try {
    const { taskId, emailId, agentId } = req.body;

    if (!agentId) {
      return res.status(400).json({ error: 'agentId is required' });
    }

    if (!taskId && !emailId) {
      return res.status(400).json({ error: 'Either taskId or emailId is required' });
    }

    const { getEmailCoordinationService } = require('../services/swarm/index.cjs');
    const emailCoord = getEmailCoordinationService();

    const task = await emailCoord.assignEmailToAgent({
      taskId,
      emailId,
      agentId,
      userId: req.user.id,
    });

    res.json({ task });
  } catch (error) {
    logger.error(`Failed to assign email: ${error.message}`);
    res.status(400).json({ error: error.message || 'Failed to assign email' });
  }
});

/**
 * POST /api/swarm/email/handoff
 * Request handoff of email between agents
 */
router.post('/email/handoff', async (req, res) => {
  try {
    const {
      taskId,
      emailId,
      fromAgentId,
      toAgentId,
      reason,
      context,
      autoAccept,
    } = req.body;

    if (!fromAgentId || !toAgentId) {
      return res.status(400).json({ error: 'fromAgentId and toAgentId are required' });
    }

    if (!taskId && !emailId) {
      return res.status(400).json({ error: 'Either taskId or emailId is required' });
    }

    const { getEmailCoordinationService } = require('../services/swarm/index.cjs');
    const emailCoord = getEmailCoordinationService();

    const result = await emailCoord.requestEmailHandoff({
      taskId,
      emailId,
      fromAgentId,
      toAgentId,
      userId: req.user.id,
      reason,
      context,
      autoAccept,
    });

    res.json(result);
  } catch (error) {
    logger.error(`Failed to request email handoff: ${error.message}`);
    res.status(400).json({ error: error.message || 'Failed to request email handoff' });
  }
});

/**
 * PUT /api/swarm/email/tasks/:id/status
 * Update email task status
 */
router.put('/email/tasks/:id/status', async (req, res) => {
  try {
    const { status, result } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'status is required' });
    }

    const validStatuses = ['pending', 'assigned', 'processing', 'responded', 'handoff', 'completed', 'failed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }

    const { getEmailCoordinationService } = require('../services/swarm/index.cjs');
    const emailCoord = getEmailCoordinationService();

    const task = await emailCoord.updateTaskStatus({
      taskId: req.params.id,
      status,
      result,
      userId: req.user.id,
    });

    res.json({ task });
  } catch (error) {
    logger.error(`Failed to update email task status: ${error.message}`);
    res.status(400).json({ error: error.message || 'Failed to update email task status' });
  }
});

/**
 * GET /api/swarm/agents/email-capable
 * Get agents capable of handling email
 */
router.get('/agents/email-capable', async (req, res) => {
  try {
    const { status, limit } = req.query;

    const { getEmailCoordinationService } = require('../services/swarm/index.cjs');
    const emailCoord = getEmailCoordinationService();

    const agents = await emailCoord.getEmailCapableAgents(req.user.id, {
      status,
      limit: parseInt(limit) || 50,
    });

    res.json({ agents });
  } catch (error) {
    logger.error(`Failed to get email-capable agents: ${error.message}`);
    res.status(500).json({ error: 'Failed to get email-capable agents' });
  }
});

/**
 * GET /api/swarm/email/stats
 * Get email coordination statistics
 */
router.get('/email/stats', async (req, res) => {
  try {
    const { getEmailCoordinationService } = require('../services/swarm/index.cjs');
    const emailCoord = getEmailCoordinationService();

    const stats = await emailCoord.getStats(req.user.id);

    res.json({ stats });
  } catch (error) {
    logger.error(`Failed to get email stats: ${error.message}`);
    res.status(500).json({ error: 'Failed to get email stats' });
  }
});

module.exports = router;
