/**
 * MCP Client Manager
 *
 * Manages MCP (Model Context Protocol) server connections per-user.
 * Supports stdio and SSE transports, tool discovery, and execution.
 *
 * Uses @modelcontextprotocol/sdk v1.26+ with CJS require().
 */

const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('../database.cjs');
const { createServiceLogger } = require('../logger.cjs');

const logger = createServiceLogger('MCPClient');

// MCP SDK imports (CJS - need .js extension for sub-path imports)
const { Client } = require('@modelcontextprotocol/sdk/client');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const { SSEClientTransport } = require('@modelcontextprotocol/sdk/client/sse.js');

// Constants
const TOOL_CALL_TIMEOUT = 60000; // 60s default
const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_BASE_DELAY = 5000; // 5s

/**
 * @typedef {Object} ConnectionEntry
 * @property {Object} client - MCP Client instance
 * @property {Object} transport - MCP Transport instance
 * @property {Array} tools - Discovered tools
 * @property {string} serverId - Server ID
 * @property {string} serverName - Server display name
 * @property {number} reconnectAttempts - Current reconnect attempt count
 */

class MCPClientManager {
  constructor() {
    /** @type {Map<string, Map<string, ConnectionEntry>>} userId -> serverId -> connection */
    this.connections = new Map();
    /** @type {Map<string, NodeJS.Timeout>} `userId:serverId` -> reconnect timer */
    this.reconnectTimers = new Map();
  }

  // ========================================
  // Connection Lifecycle
  // ========================================

  /**
   * Connect to an MCP server
   * @param {string} userId
   * @param {string} serverId
   * @returns {Promise<{tools: Array}>} Discovered tools
   */
  async connectServer(userId, serverId) {
    const db = getDatabase();

    // Check if already connected
    if (this.isConnected(userId, serverId)) {
      logger.info(`Server ${serverId} already connected for user ${userId}`);
      const entry = this._getConnection(userId, serverId);
      return { tools: entry.tools || [] };
    }

    // Load server config from DB
    const server = db.prepare(
      'SELECT * FROM mcp_servers WHERE id = ? AND user_id = ?'
    ).get(serverId, userId);

    if (!server) {
      throw new Error('MCP server not found');
    }

    logger.info(`Connecting to MCP server: ${server.name} (${server.type})`);

    // Create transport based on type
    let transport;
    try {
      transport = this._createTransport(server);
    } catch (err) {
      this._updateServerStatus(serverId, 'error');
      throw new Error(`Failed to create transport: ${err.message}`);
    }

    // Create MCP client
    const client = new Client(
      { name: 'swarm-ai', version: '1.0.0' },
      { capabilities: {} }
    );

    // Connect
    try {
      await client.connect(transport);
    } catch (err) {
      this._updateServerStatus(serverId, 'error');
      throw new Error(`Failed to connect to MCP server "${server.name}": ${err.message}`);
    }

    // Store connection
    if (!this.connections.has(userId)) {
      this.connections.set(userId, new Map());
    }

    const entry = {
      client,
      transport,
      tools: [],
      serverId,
      serverName: server.name,
      reconnectAttempts: 0,
    };

    this.connections.get(userId).set(serverId, entry);

    // Set up disconnect handler for auto-reconnect
    this._setupDisconnectHandler(userId, serverId, server);

    // Discover tools
    try {
      const tools = await this._discoverTools(userId, serverId);
      entry.tools = tools;

      // Update DB
      this._updateServerStatus(serverId, 'connected');
      this._syncToolsToDb(userId, serverId, tools);

      logger.info(`Connected to "${server.name}" - discovered ${tools.length} tools`);

      return { tools };
    } catch (err) {
      logger.warn(`Connected to "${server.name}" but tool discovery failed: ${err.message}`);
      this._updateServerStatus(serverId, 'connected');
      return { tools: [] };
    }
  }

  /**
   * Disconnect from an MCP server
   * @param {string} userId
   * @param {string} serverId
   */
  async disconnectServer(userId, serverId) {
    // Cancel any pending reconnect
    this._cancelReconnect(userId, serverId);

    const entry = this._getConnection(userId, serverId);
    if (!entry) {
      // Not connected in memory, just update DB
      this._updateServerStatus(serverId, 'disconnected');
      return;
    }

    try {
      await entry.client.close();
    } catch (err) {
      logger.warn(`Error closing client for server ${serverId}: ${err.message}`);
    }

    // Remove from connections map
    const userConns = this.connections.get(userId);
    if (userConns) {
      userConns.delete(serverId);
      if (userConns.size === 0) {
        this.connections.delete(userId);
      }
    }

    this._updateServerStatus(serverId, 'disconnected');
    logger.info(`Disconnected from MCP server ${serverId}`);
  }

  /**
   * Shutdown all connections (for graceful server shutdown)
   */
  async shutdown() {
    logger.info('Shutting down all MCP connections...');

    // Cancel all reconnect timers
    for (const timer of this.reconnectTimers.values()) {
      clearTimeout(timer);
    }
    this.reconnectTimers.clear();

    // Disconnect all clients
    const promises = [];
    for (const [userId, userConns] of this.connections) {
      for (const [serverId, entry] of userConns) {
        promises.push(
          entry.client.close().catch(err => {
            logger.warn(`Error closing server ${serverId}: ${err.message}`);
          })
        );
      }
    }

    await Promise.allSettled(promises);
    this.connections.clear();
    logger.info('All MCP connections closed');
  }

  // ========================================
  // Tool Discovery
  // ========================================

  /**
   * Discover tools from a connected server
   * @param {string} userId
   * @param {string} serverId
   * @returns {Promise<Array>}
   */
  async _discoverTools(userId, serverId) {
    const entry = this._getConnection(userId, serverId);
    if (!entry) {
      throw new Error(`Server ${serverId} not connected`);
    }

    const result = await entry.client.listTools();
    const tools = (result.tools || []).map(tool => ({
      name: tool.name,
      description: tool.description || '',
      inputSchema: tool.inputSchema || { type: 'object', properties: {} },
      serverId,
      serverName: entry.serverName,
    }));

    entry.tools = tools;
    return tools;
  }

  /**
   * Get all tools from all connected servers for a user
   * @param {string} userId
   * @returns {Array}
   */
  getTools(userId) {
    const userConns = this.connections.get(userId);
    if (!userConns) return [];

    const allTools = [];
    for (const entry of userConns.values()) {
      allTools.push(...(entry.tools || []));
    }
    return allTools;
  }

  /**
   * Get tools from a specific server
   * @param {string} userId
   * @param {string} serverId
   * @returns {Array}
   */
  getToolsByServer(userId, serverId) {
    const entry = this._getConnection(userId, serverId);
    return entry ? (entry.tools || []) : [];
  }

  // ========================================
  // Tool Execution
  // ========================================

  /**
   * Call a tool on a connected MCP server
   * @param {string} userId
   * @param {string} serverId
   * @param {string} toolName
   * @param {Object} args
   * @returns {Promise<Object>} Tool result
   */
  async callTool(userId, serverId, toolName, args = {}) {
    const entry = this._getConnection(userId, serverId);
    if (!entry) {
      throw new Error(`MCP server not connected. Please connect the server first.`);
    }

    // Validate tool exists
    const tool = entry.tools.find(t => t.name === toolName);
    if (!tool) {
      throw new Error(`Tool "${toolName}" not found on server "${entry.serverName}"`);
    }

    logger.debug(`Calling MCP tool: ${toolName} on ${entry.serverName}`, { args });

    // Execute with timeout
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Tool call timed out after ${TOOL_CALL_TIMEOUT / 1000}s`)), TOOL_CALL_TIMEOUT);
    });

    const callPromise = entry.client.callTool({
      name: toolName,
      arguments: args,
    });

    const result = await Promise.race([callPromise, timeoutPromise]);

    logger.debug(`MCP tool call completed: ${toolName}`);

    return result.content || result;
  }

  // ========================================
  // Connection Status
  // ========================================

  /**
   * Check if a server is connected
   * @param {string} userId
   * @param {string} serverId
   * @returns {boolean}
   */
  isConnected(userId, serverId) {
    return !!this._getConnection(userId, serverId);
  }

  /**
   * Get connection status for all servers of a user
   * @param {string} userId
   * @returns {Map<string, boolean>} serverId -> isConnected
   */
  getConnectionStatus(userId) {
    const status = new Map();
    const userConns = this.connections.get(userId);
    if (userConns) {
      for (const serverId of userConns.keys()) {
        status.set(serverId, true);
      }
    }
    return status;
  }

  // ========================================
  // Private Helpers
  // ========================================

  /**
   * Create transport based on server type
   * @param {Object} server - Server DB record
   * @returns {Object} Transport instance
   */
  _createTransport(server) {
    const type = server.type;

    if (type === 'stdio') {
      if (!server.command) {
        throw new Error('Command is required for stdio transport');
      }

      let args = [];
      if (server.args) {
        try {
          args = JSON.parse(server.args);
          // Handle case where args is stored as a single string (space-separated)
          if (typeof args === 'string') {
            args = args.split(/\s+/).filter(Boolean);
          }
        } catch {
          // If not valid JSON, treat as space-separated string
          args = server.args.split(/\s+/).filter(Boolean);
        }
      }

      let env = undefined;
      if (server.env) {
        try {
          env = { ...process.env, ...JSON.parse(server.env) };
        } catch {
          env = undefined;
        }
      }

      logger.debug(`Creating stdio transport: ${server.command} ${args.join(' ')}`);

      return new StdioClientTransport({
        command: server.command,
        args,
        env,
      });
    }

    if (type === 'sse') {
      const config = server.config ? JSON.parse(server.config) : {};
      const url = config.url || config.endpoint;

      if (!url) {
        throw new Error('URL is required for SSE transport');
      }

      logger.debug(`Creating SSE transport: ${url}`);

      return new SSEClientTransport(new URL(url));
    }

    throw new Error(`Unsupported transport type: ${type}`);
  }

  /**
   * Set up disconnect handler for auto-reconnect
   */
  _setupDisconnectHandler(userId, serverId, serverConfig) {
    const entry = this._getConnection(userId, serverId);
    if (!entry || !entry.transport) return;

    // Handle transport close events
    const originalOnClose = entry.transport.onclose;
    entry.transport.onclose = () => {
      if (originalOnClose) originalOnClose();

      // Check if this was intentional (server still in our map means unexpected)
      const stillTracked = this._getConnection(userId, serverId);
      if (stillTracked) {
        logger.warn(`MCP server "${serverConfig.name}" disconnected unexpectedly`);
        this._updateServerStatus(serverId, 'error');

        // Remove stale connection
        const userConns = this.connections.get(userId);
        if (userConns) userConns.delete(serverId);

        // Schedule reconnect
        this._scheduleReconnect(userId, serverId, serverConfig);
      }
    };
  }

  /**
   * Schedule a reconnection attempt
   */
  _scheduleReconnect(userId, serverId, serverConfig, attempt = 0) {
    if (attempt >= MAX_RECONNECT_ATTEMPTS) {
      logger.error(`Max reconnect attempts reached for server "${serverConfig.name}"`);
      this._updateServerStatus(serverId, 'error');
      return;
    }

    const delay = RECONNECT_BASE_DELAY * Math.pow(2, attempt);
    const key = `${userId}:${serverId}`;

    logger.info(`Scheduling reconnect for "${serverConfig.name}" in ${delay / 1000}s (attempt ${attempt + 1}/${MAX_RECONNECT_ATTEMPTS})`);

    this.reconnectTimers.set(key, setTimeout(async () => {
      this.reconnectTimers.delete(key);
      try {
        await this.connectServer(userId, serverId);
        logger.info(`Reconnected to "${serverConfig.name}" successfully`);
      } catch (err) {
        logger.warn(`Reconnect failed for "${serverConfig.name}": ${err.message}`);
        this._scheduleReconnect(userId, serverId, serverConfig, attempt + 1);
      }
    }, delay));
  }

  /**
   * Cancel pending reconnect
   */
  _cancelReconnect(userId, serverId) {
    const key = `${userId}:${serverId}`;
    const timer = this.reconnectTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.reconnectTimers.delete(key);
    }
  }

  /**
   * Get connection entry
   * @returns {ConnectionEntry|null}
   */
  _getConnection(userId, serverId) {
    const userConns = this.connections.get(userId);
    if (!userConns) return null;
    return userConns.get(serverId) || null;
  }

  /**
   * Update server status in database
   */
  _updateServerStatus(serverId, status) {
    try {
      const db = getDatabase();
      const updates = status === 'connected'
        ? `status = 'connected', connected_at = datetime('now'), updated_at = datetime('now')`
        : `status = '${status}', updated_at = datetime('now')`;

      db.prepare(`UPDATE mcp_servers SET ${updates} WHERE id = ?`).run(serverId);
    } catch (err) {
      logger.warn(`Failed to update server status: ${err.message}`);
    }
  }

  /**
   * Sync discovered tools to database
   */
  _syncToolsToDb(userId, serverId, tools) {
    try {
      const db = getDatabase();

      // Update mcp_servers.tools with tool name strings (for quick badge display in UI)
      const toolNames = tools.map(t => t.name);
      db.prepare(
        `UPDATE mcp_servers SET tools = ?, updated_at = datetime('now') WHERE id = ?`
      ).run(JSON.stringify(toolNames), serverId);

      // Upsert individual tools to mcp_server_tools
      const upsertStmt = db.prepare(`
        INSERT INTO mcp_server_tools (id, server_id, user_id, tool_name, description, input_schema, is_enabled, last_synced_at)
        VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'))
        ON CONFLICT(server_id, tool_name) DO UPDATE SET
          description = excluded.description,
          input_schema = excluded.input_schema,
          last_synced_at = datetime('now')
      `);

      const deleteOldStmt = db.prepare(
        `DELETE FROM mcp_server_tools WHERE server_id = ? AND tool_name NOT IN (${tools.map(() => '?').join(',')})`
      );

      const syncTx = db.transaction(() => {
        for (const tool of tools) {
          upsertStmt.run(
            uuidv4(),
            serverId,
            userId,
            tool.name,
            tool.description || '',
            JSON.stringify(tool.inputSchema || {}),
          );
        }

        // Remove tools that no longer exist on the server
        if (tools.length > 0) {
          deleteOldStmt.run(serverId, ...tools.map(t => t.name));
        } else {
          db.prepare('DELETE FROM mcp_server_tools WHERE server_id = ?').run(serverId);
        }
      });

      syncTx();
      logger.debug(`Synced ${tools.length} tools to DB for server ${serverId}`);
    } catch (err) {
      logger.warn(`Failed to sync tools to DB: ${err.message}`);
    }
  }
}

// Singleton
let instance = null;

function getMCPClientManager() {
  if (!instance) {
    instance = new MCPClientManager();
  }
  return instance;
}

module.exports = { MCPClientManager, getMCPClientManager };
