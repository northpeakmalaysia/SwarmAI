/**
 * Local Agent Gateway (Phase 5.1)
 * ================================
 * Manages WebSocket connections from Local Agent CLI instances.
 *
 * Uses a dedicated Socket.io namespace (/local-agent) with API key auth.
 * Handles heartbeat monitoring, command dispatch, and online status tracking.
 */

const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('./database.cjs');
const { logger } = require('./logger.cjs');

// Heartbeat config
const HEARTBEAT_CHECK_INTERVAL_MS = 30 * 1000;  // Server checks every 30s
const HEARTBEAT_STALE_THRESHOLD_MS = 45 * 1000;  // Mark offline after 45s no heartbeat
const APPROVED_KEY_TTL_MS = 5 * 60 * 1000;       // Plain key available for 5 min after approval

class LocalAgentGateway {
  constructor() {
    this._io = null;
    this._namespace = null;
    this._connectedAgents = new Map(); // agentId → { socket, userId, lastHeartbeat }
    this._pendingCommands = new Map(); // commandId → { resolve, reject, timeout }
    this._approvedKeys = new Map();    // sessionId → { apiKey, expiresAt }
    this._heartbeatInterval = null;
    this._initialized = false;
  }

  /**
   * Initialize the gateway with Socket.io server
   * @param {import('socket.io').Server} io
   */
  initialize(io) {
    if (this._initialized) return;

    this._io = io;
    this._namespace = io.of('/local-agent');

    // Auth middleware for the namespace
    this._namespace.use(this._authMiddleware.bind(this));

    // Connection handler
    this._namespace.on('connection', this._onConnect.bind(this));

    // Start heartbeat checker
    this._startHeartbeatCheck();

    this._initialized = true;
    logger.info('[LocalAgentGateway] Initialized on /local-agent namespace');
  }

  /**
   * Auth middleware — validates API key from handshake
   */
  _authMiddleware(socket, next) {
    const apiKey = socket.handshake.auth?.apiKey;

    if (!apiKey || !apiKey.startsWith('sla_')) {
      return next(new Error('Invalid API key'));
    }

    try {
      const db = getDatabase();
      const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

      const agent = db.prepare(
        "SELECT id, user_id, name, status FROM local_agents WHERE api_key_hash = ? AND status = 'active'"
      ).get(keyHash);

      if (!agent) {
        return next(new Error('API key not found or agent revoked'));
      }

      // Attach agent info to socket
      socket.agentId = agent.id;
      socket.userId = agent.user_id;
      socket.agentName = agent.name;

      next();
    } catch (error) {
      logger.error(`[LocalAgentGateway] Auth error: ${error.message}`);
      next(new Error('Authentication failed'));
    }
  }

  /**
   * Handle new Local Agent connection
   */
  _onConnect(socket) {
    const { agentId, userId, agentName } = socket;

    // Disconnect any existing connection for this agent
    const existing = this._connectedAgents.get(agentId);
    if (existing) {
      logger.info(`[LocalAgentGateway] Replacing existing connection for agent ${agentId}`);
      existing.socket.disconnect(true);
    }

    // Store connection
    this._connectedAgents.set(agentId, {
      socket,
      userId,
      lastHeartbeat: Date.now(),
    });

    // Update DB
    try {
      const db = getDatabase();
      db.prepare(`
        UPDATE local_agents
        SET is_online = 1, last_connected_at = datetime('now'), last_heartbeat_at = datetime('now'), updated_at = datetime('now')
        WHERE id = ?
      `).run(agentId);
    } catch (e) {
      logger.warn(`[LocalAgentGateway] DB update on connect failed: ${e.message}`);
    }

    // Broadcast online status to dashboard
    if (this._io) {
      this._io.emit('local-agent:online', { agentId, name: agentName, userId });
    }

    logger.info(`[LocalAgentGateway] Agent connected: ${agentName} (${agentId})`);

    // --- Event listeners ---

    // Heartbeat (with health metrics)
    socket.on('heartbeat', (data) => {
      const conn = this._connectedAgents.get(agentId);
      if (conn) {
        conn.lastHeartbeat = Date.now();
        // Store latest health metrics in connection context
        if (data?.metrics) {
          conn.healthMetrics = data.metrics;
        }
      }

      // Update DB heartbeat + health metrics
      try {
        const db = getDatabase();
        if (data?.metrics) {
          db.prepare("UPDATE local_agents SET last_heartbeat_at = datetime('now'), health_metrics = ? WHERE id = ?")
            .run(JSON.stringify(data.metrics), agentId);
        } else {
          db.prepare("UPDATE local_agents SET last_heartbeat_at = datetime('now') WHERE id = ?")
            .run(agentId);
        }
      } catch (e) { /* ignore */ }

      // Ack back
      socket.emit('heartbeat:ack', { timestamp: new Date().toISOString() });
    });

    // Command result
    socket.on('command:result', (data) => {
      const { commandId, result, error } = data;
      const pending = this._pendingCommands.get(commandId);
      if (pending) {
        clearTimeout(pending.timeout);
        this._pendingCommands.delete(commandId);
        if (error) {
          pending.reject(new Error(error));
        } else {
          pending.resolve(result);
        }
      }

      // Broadcast to dashboard for real-time command history updates
      if (this._io) {
        this._io.emit('local-agent:command-result', {
          agentId,
          commandId,
          status: error ? 'failed' : 'success',
        });
      }
    });

    // Streaming output from commands (shell, cliSession)
    socket.on('command:output', (data) => {
      const { commandId, chunk, stream } = data;
      // Relay to dashboard
      if (this._io) {
        this._io.emit('local-agent:output', {
          agentId,
          commandId,
          chunk,
          stream: stream || 'stdout',
        });
      }
    });

    // Async command result — local agent completed a long-running background task
    socket.on('command:async-result', async (data) => {
      const { commandId, result, error } = data;
      logger.info(`[LocalAgentGateway] Async result received for ${commandId} from agent ${agentId}`);

      // Look up original command context from DB
      try {
        const db = getDatabase();
        const cmd = db.prepare('SELECT * FROM local_agent_commands WHERE id = ?').get(commandId);
        if (!cmd) {
          logger.warn(`[LocalAgentGateway] No command record found for async result ${commandId}`);
          return;
        }

        // Update command status in DB
        const executionTime = Date.now() - new Date(cmd.created_at || Date.now()).getTime();
        db.prepare(`
          UPDATE local_agent_commands
          SET status = ?, result = ?, execution_time_ms = ?, completed_at = datetime('now')
          WHERE id = ?
        `).run(error ? 'failed' : 'success', JSON.stringify(result || { error }), executionTime, commandId);

        // Delegate to AsyncCLIExecutionManager for intelligent delivery (recall + respond)
        try {
          const { getAsyncCLIExecutionManager } = require('./ai/AsyncCLIExecutionManager.cjs');
          const manager = getAsyncCLIExecutionManager();
          await manager.handleLocalAgentResult(commandId, cmd, result, error);
        } catch (e) {
          logger.warn(`[LocalAgentGateway] Async result delivery failed for ${commandId}: ${e.message}`);
        }
      } catch (e) {
        logger.error(`[LocalAgentGateway] Failed to process async result ${commandId}: ${e.message}`);
      }

      // Broadcast to dashboard
      if (this._io) {
        this._io.emit('local-agent:command-result', {
          agentId,
          commandId,
          status: error ? 'failed' : 'success',
          async: true,
        });
      }
    });

    // System info (sent on connect — includes tool registry + MCP tools)
    socket.on('system-info', (info) => {
      try {
        const db = getDatabase();
        db.prepare(`
          UPDATE local_agents
          SET hostname = ?, os_type = ?, os_version = ?, capabilities = ?,
              tool_registry = ?, mcp_tools = ?, updated_at = datetime('now')
          WHERE id = ?
        `).run(
          info.hostname || null,
          info.os || null,
          info.osVersion || null,
          JSON.stringify(info.capabilities || []),
          JSON.stringify(info.toolRegistry || {}),
          JSON.stringify(info.mcpTools || []),
          agentId
        );
      } catch (e) {
        logger.warn(`[LocalAgentGateway] system-info update failed: ${e.message}`);
      }
    });

    // Workspace info — Local Agent created shared dirs (temp, downloads)
    socket.on('workspace:info', (data) => {
      const conn = this._connectedAgents.get(agentId);
      if (conn) {
        conn.workspacePaths = data; // { rootPath, tempPath, downloadsPath }
      }
      // Persist workspace root path to DB
      try {
        const db = getDatabase();
        db.prepare("UPDATE local_agents SET workspace_root = ? WHERE id = ?")
          .run(data?.rootPath || null, agentId);
      } catch (e) { /* non-critical */ }
    });

    // Workspace ready — Local Agent created a per-profile workspace
    socket.on('workspace:ready', (data) => {
      const conn = this._connectedAgents.get(agentId);
      if (conn) {
        if (!conn.profileWorkspaces) conn.profileWorkspaces = {};
        conn.profileWorkspaces[data.profileName] = data.workspacePath;
      }
    });

    // AI Providers — Local Agent discovered Ollama/LM Studio running on device
    socket.on('ai-providers', (data) => {
      const providers = data?.providers || [];
      if (providers.length === 0) return;

      try {
        const db = getDatabase();

        for (const provider of providers) {
          const providerName = `${agentName} / ${provider.type === 'ollama' ? 'Ollama' : 'LM Studio'}`;
          const config = JSON.stringify({
            localAgentId: agentId,
            providerType: provider.type,
            baseUrl: provider.baseUrl,
          });
          const models = JSON.stringify(provider.models || []);

          // Upsert: match on user_id + type + localAgentId linkage
          const existing = db.prepare(
            "SELECT id FROM ai_providers WHERE user_id = ? AND type = 'local-agent' AND config LIKE ?"
          ).get(userId, `%"localAgentId":"${agentId}"%"providerType":"${provider.type}"%`);

          if (existing) {
            db.prepare(`
              UPDATE ai_providers
              SET name = ?, models = ?, config = ?, is_active = 1, base_url = ?, updated_at = datetime('now')
              WHERE id = ?
            `).run(providerName, models, config, provider.baseUrl, existing.id);
          } else {
            const { v4: uuidv4 } = require('uuid');
            db.prepare(`
              INSERT INTO ai_providers (id, user_id, name, type, base_url, config, models, is_active, is_default, created_at, updated_at)
              VALUES (?, ?, ?, 'local-agent', ?, ?, ?, 1, 0, datetime('now'), datetime('now'))
            `).run(uuidv4(), userId, providerName, provider.baseUrl, config, models);
          }

          logger.info(`[LocalAgentGateway] AI provider registered: ${providerName} (${provider.models.length} models)`);
        }
      } catch (e) {
        logger.warn(`[LocalAgentGateway] ai-providers registration failed: ${e.message}`);
      }
    });

    // Disconnect
    socket.on('disconnect', (reason) => {
      this._connectedAgents.delete(agentId);

      // Reject all pending commands for this agent
      for (const [cmdId, pending] of this._pendingCommands) {
        if (pending.agentId === agentId) {
          clearTimeout(pending.timeout);
          pending.reject(new Error('Agent disconnected'));
          this._pendingCommands.delete(cmdId);
        }
      }

      // Update DB — mark agent offline
      try {
        const db = getDatabase();
        db.prepare("UPDATE local_agents SET is_online = 0, updated_at = datetime('now') WHERE id = ?")
          .run(agentId);
      } catch (e) { /* ignore */ }

      // Deactivate AI providers linked to this agent
      try {
        const db = getDatabase();
        db.prepare(
          "UPDATE ai_providers SET is_active = 0, updated_at = datetime('now') WHERE type = 'local-agent' AND config LIKE ?"
        ).run(`%"localAgentId":"${agentId}"%`);
      } catch (e) { /* ignore */ }

      // Broadcast offline status
      if (this._io) {
        this._io.emit('local-agent:offline', { agentId, userId });
      }

      logger.info(`[LocalAgentGateway] Agent disconnected: ${agentName} (${agentId}) — ${reason}`);
    });
  }

  /**
   * Send a command to a connected Local Agent
   * @param {string} agentId
   * @param {string} command
   * @param {object} params
   * @param {number} timeout - ms
   * @returns {Promise<any>}
   */
  sendCommand(agentId, command, params = {}, timeout = 30000) {
    return new Promise((resolve, reject) => {
      const conn = this._connectedAgents.get(agentId);
      if (!conn) {
        return reject(new Error('Agent not connected'));
      }

      const commandId = uuidv4();

      // Set timeout
      const timer = setTimeout(() => {
        this._pendingCommands.delete(commandId);
        reject(new Error('Command timed out'));
      }, timeout);

      // Store pending (agentId needed for cleanup on disconnect)
      this._pendingCommands.set(commandId, { resolve, reject, timeout: timer, agentId });

      // Send command
      conn.socket.emit('command', {
        commandId,
        command,
        params,
      });
    });
  }

  /**
   * Send a command with full audit logging to local_agent_commands table
   * @param {string} agentId
   * @param {string} command
   * @param {object} params
   * @param {string} userId
   * @param {string|null} agenticProfileId
   * @param {number} timeout
   * @returns {Promise<object>} Command result
   */
  async sendCommandWithLogging(agentId, command, params = {}, userId, agenticProfileId = null, timeout = 30000) {
    const cmdId = uuidv4();
    const startTime = Date.now();

    // Insert command record
    try {
      const db = getDatabase();
      db.prepare(`
        INSERT INTO local_agent_commands (id, local_agent_id, user_id, agentic_profile_id, command, params, status)
        VALUES (?, ?, ?, ?, ?, ?, 'sent')
      `).run(cmdId, agentId, userId, agenticProfileId, command, JSON.stringify(params));
    } catch (e) {
      logger.warn(`[LocalAgentGateway] Command logging failed: ${e.message}`);
    }

    // Audit: log outgoing command to local agent
    try {
      const { getAuditLogService } = require('./agentic/AuditLogService.cjs');
      if (agenticProfileId) {
        getAuditLogService().log(agenticProfileId, userId, 'local_agent_out', 'OUTBOUND', {
          agentId,
          command,
          paramsPreview: JSON.stringify(params).substring(0, 200),
        });
      }
    } catch (_) {}

    try {
      const result = await this.sendCommand(agentId, command, params, timeout);
      const executionTime = Date.now() - startTime;

      // Check if the local agent returned a "restricted" status (needs user approval)
      if (result && typeof result === 'object' && result.status === 'restricted') {
        try {
          const db = getDatabase();
          db.prepare(`
            UPDATE local_agent_commands
            SET status = 'approval_required', result = ?, completed_at = NULL
            WHERE id = ?
          `).run(JSON.stringify(result), cmdId);
        } catch (e) { /* logging failure is non-fatal */ }

        // Look up agent name for the notification
        let agentName = 'Unknown Agent';
        try {
          const db = getDatabase();
          const agent = db.prepare('SELECT name FROM local_agents WHERE id = ?').get(agentId);
          if (agent) agentName = agent.name;
        } catch (e) { /* ignore */ }

        // Broadcast approval-needed event to dashboard
        if (this._io) {
          this._io.emit('local-agent:approval-needed', {
            id: cmdId,
            agentId,
            agentName,
            command,
            params,
            requestedAt: new Date().toISOString(),
          });
        }

        return result;
      }

      // Update command record with result
      try {
        const db = getDatabase();
        let resultStr = JSON.stringify(result);
        if (resultStr.length > 50000) {
          resultStr = resultStr.substring(0, 50000) + '... [truncated]';
        }
        db.prepare(`
          UPDATE local_agent_commands
          SET status = 'success', result = ?, execution_time_ms = ?, completed_at = datetime('now')
          WHERE id = ?
        `).run(resultStr, executionTime, cmdId);
      } catch (e) { /* logging failure is non-fatal */ }

      // Audit: log incoming result from local agent
      try {
        const { getAuditLogService } = require('./agentic/AuditLogService.cjs');
        if (agenticProfileId) {
          getAuditLogService().log(agenticProfileId, userId, 'local_agent_in', 'INBOUND', {
            agentId,
            command,
            executionTime,
            preview: JSON.stringify(result).substring(0, 200),
          });
        }
      } catch (_) {}

      return result;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const status = error.message === 'Command timed out' ? 'timeout' : 'failed';

      try {
        const db = getDatabase();
        db.prepare(`
          UPDATE local_agent_commands
          SET status = ?, error_message = ?, execution_time_ms = ?, completed_at = datetime('now')
          WHERE id = ?
        `).run(status, error.message, executionTime, cmdId);
      } catch (e) { /* logging failure is non-fatal */ }

      throw error;
    }
  }

  /**
   * Send a command for async/background execution on the local agent.
   * Does NOT wait for result — the local agent reports back via 'command:async-result' event.
   * Used for long-running CLI sessions (> 3.5 min) that would exceed the reasoning loop timeout.
   *
   * @param {string} agentId
   * @param {string} command
   * @param {object} params - Includes asyncMode:true flag
   * @param {string} userId
   * @param {string|null} agenticProfileId
   */
  sendAsyncCommand(agentId, command, params = {}, userId, agenticProfileId = null) {
    const conn = this._connectedAgents.get(agentId);
    if (!conn) {
      logger.warn(`[LocalAgentGateway] Cannot send async command: agent ${agentId} not connected`);
      return null;
    }

    const commandId = params.asyncTrackingId || uuidv4();

    // Log to DB
    try {
      const db = getDatabase();
      db.prepare(`
        INSERT INTO local_agent_commands (id, local_agent_id, user_id, agentic_profile_id, command, params, status)
        VALUES (?, ?, ?, ?, ?, ?, 'async_running')
      `).run(commandId, agentId, userId, agenticProfileId, command, JSON.stringify(params));
    } catch (e) {
      logger.warn(`[LocalAgentGateway] Async command logging failed: ${e.message}`);
    }

    // Send command without setting up a pending promise — no timeout timer needed
    conn.socket.emit('command', {
      commandId,
      command,
      params: { ...params, asyncMode: true },
    });

    logger.info(`[LocalAgentGateway] Sent async command ${commandId} to agent ${agentId}: ${command}`);
    return commandId;
  }

  /**
   * Check if an agent is online
   */
  isOnline(agentId) {
    return this._connectedAgents.has(agentId);
  }

  /**
   * Get all online agents for a user
   */
  getOnlineAgents(userId) {
    const result = [];
    for (const [agentId, conn] of this._connectedAgents) {
      if (conn.userId === userId) {
        result.push(agentId);
      }
    }
    return result;
  }

  /**
   * Get live health metrics for an agent (from in-memory heartbeat data)
   */
  getHealthMetrics(agentId) {
    const conn = this._connectedAgents.get(agentId);
    if (!conn) return null;
    return conn.healthMetrics || null;
  }

  /**
   * Get workspace paths for a connected agent
   * @returns {{ rootPath, tempPath, downloadsPath, profileWorkspaces } | null}
   */
  getWorkspacePaths(agentId) {
    const conn = this._connectedAgents.get(agentId);
    if (!conn) return null;
    return {
      ...(conn.workspacePaths || {}),
      profileWorkspaces: conn.profileWorkspaces || {},
    };
  }

  /**
   * Forcefully disconnect an agent (e.g., on revoke)
   */
  disconnectAgent(agentId) {
    const conn = this._connectedAgents.get(agentId);
    if (conn) {
      conn.socket.emit('revoked', { reason: 'Agent access revoked' });
      conn.socket.disconnect(true);
    }
  }

  /**
   * Store a plain API key temporarily after approval (for CLI polling)
   */
  storeApprovedKey(sessionId, apiKey) {
    this._approvedKeys.set(sessionId, {
      apiKey,
      expiresAt: Date.now() + APPROVED_KEY_TTL_MS,
    });
  }

  /**
   * Retrieve the plain API key for an approved session.
   * Key remains available until TTL expires (prevents loss on network retry).
   */
  consumeApprovedKey(sessionId) {
    const entry = this._approvedKeys.get(sessionId);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this._approvedKeys.delete(sessionId);
      return null;
    }
    return entry.apiKey;
  }

  /**
   * Periodic heartbeat check — marks stale agents offline
   */
  _startHeartbeatCheck() {
    this._heartbeatInterval = setInterval(() => {
      const now = Date.now();
      for (const [agentId, conn] of this._connectedAgents) {
        if (now - conn.lastHeartbeat > HEARTBEAT_STALE_THRESHOLD_MS) {
          logger.info(`[LocalAgentGateway] Agent ${agentId} heartbeat stale — disconnecting`);
          conn.socket.disconnect(true);
          // _onConnect disconnect handler will clean up
        }
      }

      // Clean expired approved keys
      for (const [sid, entry] of this._approvedKeys) {
        if (Date.now() > entry.expiresAt) {
          this._approvedKeys.delete(sid);
        }
      }
    }, HEARTBEAT_CHECK_INTERVAL_MS);
  }

  /**
   * Graceful shutdown
   */
  stop() {
    if (this._heartbeatInterval) {
      clearInterval(this._heartbeatInterval);
      this._heartbeatInterval = null;
    }

    // Reject all pending commands
    for (const [cmdId, pending] of this._pendingCommands) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Gateway shutting down'));
    }
    this._pendingCommands.clear();

    // Disconnect all agents
    for (const [agentId, conn] of this._connectedAgents) {
      conn.socket.disconnect(true);
    }
    this._connectedAgents.clear();
    this._approvedKeys.clear();

    logger.info('[LocalAgentGateway] Stopped');
  }
}

// Singleton
let _instance = null;

function getLocalAgentGateway() {
  if (!_instance) {
    _instance = new LocalAgentGateway();
  }
  return _instance;
}

module.exports = { LocalAgentGateway, getLocalAgentGateway };
