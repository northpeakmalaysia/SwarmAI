/**
 * Local Agent Routes (Phase 5.1)
 *
 * Manages Local Agent registration, auth flow, and command dispatch.
 *
 * Public routes (CLI auth flow):
 *   POST /auth/init          - CLI initiates auth, gets session + auth URL
 *   GET  /auth/status/:sid   - CLI polls for approval result
 *
 * Protected routes (browser/dashboard):
 *   GET  /auth/pending        - List pending challenges for current user
 *   POST /auth/approve/:sid   - Approve a challenge
 *   POST /auth/deny/:sid      - Deny a challenge
 *   GET  /                    - List user's local agents
 *   GET  /:id                 - Get single agent details
 *   PUT  /:id                 - Update agent name
 *   DELETE /:id               - Revoke agent
 *   POST /:id/command         - Send command to online agent
 */

const express = require('express');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('../services/database.cjs');
const { logger } = require('../services/logger.cjs');
const { authenticate } = require('./auth.cjs');
const { getLocalAgentGateway } = require('../services/LocalAgentGateway.cjs');

const router = express.Router();

// ============================================
// Helper: generate API key
// ============================================
function generateApiKey() {
  const raw = crypto.randomBytes(24).toString('hex'); // 48 hex chars
  return `sla_${raw}`;
}

function hashApiKey(apiKey) {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

// ============================================
// PUBLIC ROUTES (no auth — used by CLI)
// ============================================

/**
 * POST /api/local-agents/auth/init
 * CLI sends device info, gets session_id + auth_url
 */
router.post('/auth/init', (req, res) => {
  try {
    const { deviceName, hostname, os, osVersion } = req.body;

    if (!deviceName || typeof deviceName !== 'string' || deviceName.length > 100) {
      return res.status(400).json({ error: 'deviceName is required and must be under 100 characters' });
    }

    const db = getDatabase();
    const sessionId = uuidv4();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min

    db.prepare(`
      INSERT INTO local_agent_challenges (id, device_name, device_info, expires_at)
      VALUES (?, ?, ?, ?)
    `).run(
      sessionId,
      deviceName,
      JSON.stringify({ hostname: hostname || '', os: os || '', osVersion: osVersion || '' }),
      expiresAt
    );

    // Build auth URL — frontend route
    const serverUrl = process.env.PUBLIC_URL || process.env.FRONTEND_URL || `http://localhost:3202`;
    const authUrl = `${serverUrl}/local-agent/auth/${sessionId}`;

    logger.info(`[LocalAgent] Auth challenge created: ${sessionId} for "${deviceName}"`);

    res.json({
      sessionId,
      authUrl,
      expiresAt,
    });
  } catch (error) {
    logger.error(`[LocalAgent] auth/init error: ${error.message}`);
    res.status(500).json({ error: 'Failed to create auth challenge' });
  }
});

/**
 * GET /api/local-agents/auth/status/:sessionId
 * CLI polls this to check if user approved/denied
 */
router.get('/auth/status/:sessionId', (req, res) => {
  try {
    const db = getDatabase();
    const challenge = db.prepare(
      'SELECT id, status, api_key_hash, api_key_prefix, local_agent_id, expires_at FROM local_agent_challenges WHERE id = ?'
    ).get(req.params.sessionId);

    if (!challenge) {
      return res.status(404).json({ error: 'Challenge not found' });
    }

    // Check expiry
    if (new Date(challenge.expires_at) < new Date() && challenge.status === 'pending') {
      db.prepare('UPDATE local_agent_challenges SET status = ? WHERE id = ?')
        .run('expired', challenge.id);
      return res.json({ status: 'expired' });
    }

    const result = { status: challenge.status };

    // If approved, include the API key (stored temporarily in device_info during approval)
    if (challenge.status === 'approved') {
      // The plain-text API key is stored ephemerally in a memory map, not DB
      const gateway = getLocalAgentGateway();
      const plainKey = gateway.consumeApprovedKey(challenge.id);
      if (plainKey) {
        result.apiKey = plainKey;
        result.agentId = challenge.local_agent_id;
      } else {
        // Key already consumed — CLI should use cached key
        result.agentId = challenge.local_agent_id;
        result.message = 'API key already retrieved. Use your cached key.';
      }
    }

    res.json(result);
  } catch (error) {
    logger.error(`[LocalAgent] auth/status error: ${error.message}`);
    res.status(500).json({ error: 'Failed to check status' });
  }
});

// ============================================
// PROTECTED ROUTES (JWT auth — browser/dashboard)
// ============================================
router.use(authenticate);

/**
 * GET /api/local-agents/auth/challenge/:sessionId
 * Get challenge details for the approval page
 */
router.get('/auth/challenge/:sessionId', (req, res) => {
  try {
    const db = getDatabase();
    const challenge = db.prepare(
      'SELECT id, status, device_name, device_info, expires_at, created_at FROM local_agent_challenges WHERE id = ?'
    ).get(req.params.sessionId);

    if (!challenge) {
      return res.status(404).json({ error: 'Challenge not found' });
    }

    res.json({
      id: challenge.id,
      status: challenge.status,
      deviceName: challenge.device_name,
      deviceInfo: JSON.parse(challenge.device_info || '{}'),
      expiresAt: challenge.expires_at,
      createdAt: challenge.created_at,
    });
  } catch (error) {
    logger.error(`[LocalAgent] challenge detail error: ${error.message}`);
    res.status(500).json({ error: 'Failed to fetch challenge' });
  }
});

/**
 * GET /api/local-agents/auth/pending
 * List pending challenges scoped to current user.
 * Admins/superusers see all pending challenges; regular users see only
 * challenges with matching target_user_id or unscoped (null target).
 */
router.get('/auth/pending', (req, res) => {
  try {
    const db = getDatabase();
    const now = new Date().toISOString();

    // Expire old challenges first
    db.prepare("UPDATE local_agent_challenges SET status = 'expired' WHERE status = 'pending' AND expires_at < ?")
      .run(now);

    const isAdmin = req.user.role === 'admin' || req.user.isSuperuser;

    let challenges;
    if (isAdmin) {
      // Admins see all pending challenges
      challenges = db.prepare(
        "SELECT id, device_name, device_info, user_id, expires_at, created_at FROM local_agent_challenges WHERE status = 'pending' ORDER BY created_at DESC"
      ).all();
    } else {
      // Regular users see only challenges targeted at them or unscoped
      challenges = db.prepare(
        "SELECT id, device_name, device_info, user_id, expires_at, created_at FROM local_agent_challenges WHERE status = 'pending' AND (user_id IS NULL OR user_id = ?) ORDER BY created_at DESC"
      ).all(req.user.id);
    }

    res.json(challenges.map(c => ({
      id: c.id,
      deviceName: c.device_name,
      deviceInfo: JSON.parse(c.device_info || '{}'),
      targetUserId: c.user_id || null,
      expiresAt: c.expires_at,
      createdAt: c.created_at,
    })));
  } catch (error) {
    logger.error(`[LocalAgent] auth/pending error: ${error.message}`);
    res.status(500).json({ error: 'Failed to fetch pending challenges' });
  }
});

/**
 * POST /api/local-agents/auth/approve/:sessionId
 * User approves → generate API key, create local_agents row
 */
router.post('/auth/approve/:sessionId', (req, res) => {
  try {
    const db = getDatabase();
    const challenge = db.prepare(
      "SELECT * FROM local_agent_challenges WHERE id = ? AND status = 'pending'"
    ).get(req.params.sessionId);

    if (!challenge) {
      return res.status(404).json({ error: 'Challenge not found or already resolved' });
    }

    // Check expiry
    if (new Date(challenge.expires_at) < new Date()) {
      db.prepare("UPDATE local_agent_challenges SET status = 'expired' WHERE id = ?")
        .run(challenge.id);
      return res.status(410).json({ error: 'Challenge expired' });
    }

    // Generate API key
    const apiKey = generateApiKey();
    const apiKeyHash = hashApiKey(apiKey);
    const apiKeyPrefix = apiKey.substring(0, 12); // "sla_" + first 8 hex
    const deviceInfo = JSON.parse(challenge.device_info || '{}');
    const hostname = deviceInfo.hostname || null;

    // Deduplicate: if an agent with the same hostname already exists for this user,
    // reuse it instead of creating a duplicate (handles reinstall/reconfigure)
    let agentId;
    const existingAgent = hostname
      ? db.prepare(
          "SELECT id FROM local_agents WHERE user_id = ? AND hostname = ? AND status = 'active'"
        ).get(req.user.id, hostname)
      : null;

    if (existingAgent) {
      // Reuse existing agent — just update the API key and device info
      agentId = existingAgent.id;
      db.prepare(`
        UPDATE local_agents
        SET api_key_hash = ?, api_key_prefix = ?, name = ?,
            os_type = ?, os_version = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(
        apiKeyHash, apiKeyPrefix,
        challenge.device_name || 'Local Agent',
        deviceInfo.os || null, deviceInfo.osVersion || null,
        agentId
      );
      logger.info(`[LocalAgent] Reusing existing agent "${challenge.device_name}" (${agentId}) — same hostname "${hostname}"`);
    } else {
      // New agent
      agentId = uuidv4();
      db.prepare(`
        INSERT INTO local_agents (id, user_id, name, api_key_hash, api_key_prefix, hostname, os_type, os_version)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        agentId, req.user.id,
        challenge.device_name || 'Local Agent',
        apiKeyHash, apiKeyPrefix,
        hostname, deviceInfo.os || null, deviceInfo.osVersion || null
      );
    }

    // Update challenge
    db.prepare(`
      UPDATE local_agent_challenges
      SET status = 'approved', user_id = ?, api_key_hash = ?, api_key_prefix = ?, local_agent_id = ?
      WHERE id = ?
    `).run(req.user.id, apiKeyHash, apiKeyPrefix, agentId, challenge.id);

    // Store plain API key temporarily so CLI can retrieve it via polling
    const gateway = getLocalAgentGateway();
    gateway.storeApprovedKey(challenge.id, apiKey);

    logger.info(`[LocalAgent] Approved agent "${challenge.device_name}" (${agentId}) for user ${req.user.id}`);

    res.json({
      agentId,
      name: challenge.device_name,
      apiKeyPrefix,
    });
  } catch (error) {
    logger.error(`[LocalAgent] auth/approve error: ${error.message}`);
    res.status(500).json({ error: 'Failed to approve challenge' });
  }
});

/**
 * POST /api/local-agents/auth/deny/:sessionId
 * User denies the challenge
 */
router.post('/auth/deny/:sessionId', (req, res) => {
  try {
    const db = getDatabase();
    const result = db.prepare(
      "UPDATE local_agent_challenges SET status = 'denied' WHERE id = ? AND status = 'pending'"
    ).run(req.params.sessionId);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Challenge not found or already resolved' });
    }

    logger.info(`[LocalAgent] Denied challenge ${req.params.sessionId}`);
    res.json({ status: 'denied' });
  } catch (error) {
    logger.error(`[LocalAgent] auth/deny error: ${error.message}`);
    res.status(500).json({ error: 'Failed to deny challenge' });
  }
});

/**
 * GET /api/local-agents
 * List user's local agents
 */
router.get('/', (req, res) => {
  try {
    const db = getDatabase();
    const agents = db.prepare(`
      SELECT id, name, api_key_prefix, hostname, os_type, os_version,
             last_connected_at, last_heartbeat_at, is_online, capabilities, tool_registry, mcp_tools, status,
             created_at, updated_at
      FROM local_agents
      WHERE user_id = ? AND status = 'active'
      ORDER BY created_at DESC
    `).all(req.user.id);

    // Enrich with live online status from gateway
    const gateway = getLocalAgentGateway();
    const enriched = agents.map(a => {
      const isOnline = gateway.isOnline(a.id);
      // Use live metrics if online, otherwise fall back to DB cached metrics
      const liveMetrics = isOnline ? gateway.getHealthMetrics(a.id) : null;
      const healthMetrics = liveMetrics || (a.health_metrics ? JSON.parse(a.health_metrics) : null);

      return {
        id: a.id,
        name: a.name,
        apiKeyPrefix: a.api_key_prefix,
        hostname: a.hostname,
        osType: a.os_type,
        osVersion: a.os_version,
        lastConnectedAt: a.last_connected_at,
        lastHeartbeatAt: a.last_heartbeat_at,
        isOnline,
        capabilities: JSON.parse(a.capabilities || '[]'),
        toolRegistry: JSON.parse(a.tool_registry || '{}'),
        mcpTools: JSON.parse(a.mcp_tools || '[]'),
        healthMetrics,
        status: a.status,
        createdAt: a.created_at,
        updatedAt: a.updated_at,
      };
    });

    res.json({ agents: enriched });
  } catch (error) {
    logger.error(`[LocalAgent] list error: ${error.message}`);
    res.status(500).json({ error: 'Failed to list agents' });
  }
});

/**
 * GET /api/local-agents/commands/pending-approvals
 * List all commands awaiting user approval across all agents.
 * IMPORTANT: Must be defined BEFORE /:id to avoid route shadowing.
 */
router.get('/commands/pending-approvals', (req, res) => {
  try {
    const db = getDatabase();
    const commands = db.prepare(`
      SELECT c.id, c.local_agent_id, c.command, c.params, c.requested_at,
             a.name as agent_name
      FROM local_agent_commands c
      JOIN local_agents a ON c.local_agent_id = a.id
      WHERE c.status = 'approval_required' AND a.user_id = ?
      ORDER BY c.requested_at DESC
    `).all(req.user.id);

    res.json({
      commands: commands.map(c => ({
        id: c.id,
        agentId: c.local_agent_id,
        agentName: c.agent_name,
        command: c.command,
        params: JSON.parse(c.params || '{}'),
        requestedAt: c.requested_at,
      })),
    });
  } catch (error) {
    logger.error(`[LocalAgent] pending-approvals error: ${error.message}`);
    res.status(500).json({ error: 'Failed to fetch pending approvals' });
  }
});

/**
 * GET /api/local-agents/:id
 * Get single agent details
 */
router.get('/:id', (req, res) => {
  try {
    const db = getDatabase();
    const agent = db.prepare(
      'SELECT * FROM local_agents WHERE id = ? AND user_id = ?'
    ).get(req.params.id, req.user.id);

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    const gateway = getLocalAgentGateway();

    res.json({
      id: agent.id,
      name: agent.name,
      apiKeyPrefix: agent.api_key_prefix,
      hostname: agent.hostname,
      osType: agent.os_type,
      osVersion: agent.os_version,
      lastConnectedAt: agent.last_connected_at,
      lastHeartbeatAt: agent.last_heartbeat_at,
      isOnline: gateway.isOnline(agent.id),
      capabilities: JSON.parse(agent.capabilities || '[]'),
      toolRegistry: JSON.parse(agent.tool_registry || '{}'),
      mcpTools: JSON.parse(agent.mcp_tools || '[]'),
      status: agent.status,
      createdAt: agent.created_at,
      updatedAt: agent.updated_at,
    });
  } catch (error) {
    logger.error(`[LocalAgent] get error: ${error.message}`);
    res.status(500).json({ error: 'Failed to get agent' });
  }
});

/**
 * GET /api/local-agents/:id/health
 * Get live health metrics for an agent
 */
router.get('/:id/health', (req, res) => {
  try {
    const db = getDatabase();
    const agent = db.prepare(
      "SELECT id FROM local_agents WHERE id = ? AND user_id = ?"
    ).get(req.params.id, req.user.id);

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Try live metrics from gateway first, fall back to DB
    const gateway = getLocalAgentGateway();
    const liveMetrics = gateway.getHealthMetrics(req.params.id);

    if (liveMetrics) {
      res.json({ metrics: liveMetrics, source: 'live', isOnline: true });
    } else {
      res.json({ metrics: null, source: 'none', isOnline: gateway.isOnline(req.params.id) });
    }
  } catch (error) {
    logger.error(`[LocalAgent] health error: ${error.message}`);
    res.status(500).json({ error: 'Failed to get health metrics' });
  }
});

/**
 * PUT /api/local-agents/:id
 * Update agent name
 */
router.put('/:id', (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }

    const db = getDatabase();
    const result = db.prepare(
      "UPDATE local_agents SET name = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?"
    ).run(name, req.params.id, req.user.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    res.json({ success: true });
  } catch (error) {
    logger.error(`[LocalAgent] update error: ${error.message}`);
    res.status(500).json({ error: 'Failed to update agent' });
  }
});

/**
 * DELETE /api/local-agents/:id
 * Revoke agent (soft delete)
 */
router.delete('/:id', (req, res) => {
  try {
    const db = getDatabase();
    const result = db.prepare(
      "UPDATE local_agents SET status = 'revoked', is_online = 0, updated_at = datetime('now') WHERE id = ? AND user_id = ?"
    ).run(req.params.id, req.user.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Disconnect if online
    const gateway = getLocalAgentGateway();
    gateway.disconnectAgent(req.params.id);

    // Clean up linked ai_providers entries
    try {
      const cleaned = db.prepare(
        "DELETE FROM ai_providers WHERE type = 'local-agent' AND config LIKE ?"
      ).run(`%"localAgentId":"${req.params.id}"%`);
      if (cleaned.changes > 0) {
        logger.info(`[LocalAgent] Cleaned up ${cleaned.changes} ai_provider(s) for agent ${req.params.id}`);
      }
    } catch (e) {
      logger.warn(`[LocalAgent] ai_provider cleanup failed: ${e.message}`);
    }

    // Clean up child records so agent can be fully deleted later if needed
    try {
      db.prepare('DELETE FROM local_agent_commands WHERE local_agent_id = ?').run(req.params.id);
      db.prepare('DELETE FROM temp_files WHERE local_agent_id = ?').run(req.params.id);
    } catch (e) { /* non-critical */ }

    logger.info(`[LocalAgent] Revoked agent ${req.params.id}`);
    res.json({ success: true });
  } catch (error) {
    logger.error(`[LocalAgent] revoke error: ${error.message}`);
    res.status(500).json({ error: 'Failed to revoke agent' });
  }
});

/**
 * POST /api/local-agents/:id/command
 * Send command to online agent (with audit logging)
 */
router.post('/:id/command', async (req, res) => {
  try {
    const { command, params } = req.body;
    if (!command) {
      return res.status(400).json({ error: 'command is required' });
    }

    // Verify ownership
    const db = getDatabase();
    const agent = db.prepare(
      "SELECT id FROM local_agents WHERE id = ? AND user_id = ? AND status = 'active'"
    ).get(req.params.id, req.user.id);

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    const gateway = getLocalAgentGateway();
    if (!gateway.isOnline(req.params.id)) {
      return res.status(409).json({ error: 'Agent is offline' });
    }

    const result = await gateway.sendCommandWithLogging(
      req.params.id, command, params || {}, req.user.id, null,
      (command === 'shell' || command === 'mcp') ? 60000 : 30000
    );
    res.json({ result });
  } catch (error) {
    logger.error(`[LocalAgent] command error: ${error.message}`);
    if (error.message === 'Command timed out') {
      return res.status(504).json({ error: 'Command timed out' });
    }
    res.status(500).json({ error: 'Failed to send command' });
  }
});

/**
 * GET /api/local-agents/:id/commands
 * Command history for an agent (paginated)
 */
router.get('/:id/commands', (req, res) => {
  try {
    const db = getDatabase();

    // Verify ownership
    const agent = db.prepare(
      "SELECT id FROM local_agents WHERE id = ? AND user_id = ?"
    ).get(req.params.id, req.user.id);

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const offset = parseInt(req.query.offset) || 0;

    const commands = db.prepare(`
      SELECT id, command, params, status, result, error_message,
             execution_time_ms, requested_at, completed_at
      FROM local_agent_commands
      WHERE local_agent_id = ? AND user_id = ?
      ORDER BY requested_at DESC
      LIMIT ? OFFSET ?
    `).all(req.params.id, req.user.id, limit, offset);

    const total = db.prepare(
      'SELECT COUNT(*) as count FROM local_agent_commands WHERE local_agent_id = ? AND user_id = ?'
    ).get(req.params.id, req.user.id);

    res.json({
      commands: commands.map(c => ({
        id: c.id,
        command: c.command,
        params: JSON.parse(c.params || '{}'),
        status: c.status,
        result: c.result ? JSON.parse(c.result) : null,
        errorMessage: c.error_message,
        executionTimeMs: c.execution_time_ms,
        requestedAt: c.requested_at,
        completedAt: c.completed_at,
      })),
      total: total.count,
      limit,
      offset,
    });
  } catch (error) {
    logger.error(`[LocalAgent] command history error: ${error.message}`);
    res.status(500).json({ error: 'Failed to fetch command history' });
  }
});

/**
 * POST /api/local-agents/:id/commands/:cmdId/approve
 * Approve a pending command
 */
router.post('/:id/commands/:cmdId/approve', async (req, res) => {
  try {
    const db = getDatabase();

    // Verify ownership + command exists + pending
    const cmd = db.prepare(`
      SELECT c.id, c.local_agent_id, c.command, c.params
      FROM local_agent_commands c
      JOIN local_agents a ON c.local_agent_id = a.id
      WHERE c.id = ? AND c.local_agent_id = ? AND a.user_id = ? AND c.status = 'approval_required'
    `).get(req.params.cmdId, req.params.id, req.user.id);

    if (!cmd) {
      return res.status(404).json({ error: 'Pending command not found' });
    }

    // Update status to approved
    db.prepare("UPDATE local_agent_commands SET status = 'approved' WHERE id = ?").run(cmd.id);

    // Execute the command
    const gateway = getLocalAgentGateway();
    if (!gateway.isOnline(cmd.local_agent_id)) {
      return res.status(409).json({ error: 'Agent is offline. Command approved but cannot execute.' });
    }

    try {
      const result = await gateway.sendCommand(cmd.local_agent_id, cmd.command, JSON.parse(cmd.params || '{}'));
      db.prepare(`
        UPDATE local_agent_commands SET status = 'success', result = ?, completed_at = datetime('now')
        WHERE id = ?
      `).run(JSON.stringify(result).substring(0, 50000), cmd.id);

      res.json({ result });
    } catch (execError) {
      db.prepare(`
        UPDATE local_agent_commands SET status = 'failed', error_message = ?, completed_at = datetime('now')
        WHERE id = ?
      `).run(execError.message, cmd.id);

      res.status(500).json({ error: execError.message });
    }
  } catch (error) {
    logger.error(`[LocalAgent] command approve error: ${error.message}`);
    res.status(500).json({ error: 'Failed to approve command' });
  }
});

/**
 * POST /api/local-agents/:id/commands/:cmdId/deny
 * Deny a pending command
 */
router.post('/:id/commands/:cmdId/deny', (req, res) => {
  try {
    const db = getDatabase();

    const result = db.prepare(`
      UPDATE local_agent_commands
      SET status = 'denied', completed_at = datetime('now')
      WHERE id = ? AND local_agent_id = ? AND status = 'approval_required'
      AND local_agent_id IN (SELECT id FROM local_agents WHERE user_id = ?)
    `).run(req.params.cmdId, req.params.id, req.user.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Pending command not found' });
    }

    res.json({ status: 'denied' });
  } catch (error) {
    logger.error(`[LocalAgent] command deny error: ${error.message}`);
    res.status(500).json({ error: 'Failed to deny command' });
  }
});

module.exports = router;
