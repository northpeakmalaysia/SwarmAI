/**
 * MCP Manager for Local Agent
 *
 * Manages MCP (Model Context Protocol) server connections locally.
 * Uses @modelcontextprotocol/sdk to spawn stdio-based MCP server processes,
 * discover their tools, and execute tool calls.
 *
 * Mirrors patterns from server/services/mcp/MCPClientManager.cjs
 * but adapted for client-side use without database access.
 */

const os = require('os');

const TOOL_CALL_TIMEOUT = 60000; // 60s

/**
 * Pre-configured MCP server recipes
 */
const MCP_RECIPES = {
  playwright: {
    name: 'playwright',
    description: 'Browser automation via Playwright',
    command: 'npx',
    args: ['-y', '@playwright/mcp@latest'],
  },
  filesystem: {
    name: 'filesystem',
    description: 'Local filesystem access',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', os.homedir()],
  },
  sqlite: {
    name: 'sqlite',
    description: 'SQLite database access',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-sqlite'],
  },
  git: {
    name: 'git',
    description: 'Git repository operations',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
  },
  docker: {
    name: 'docker',
    description: 'Docker container management',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-docker'],
  },
};

class MCPManager {
  constructor() {
    /** @type {Map<string, { client: Object, transport: Object, tools: Array, config: Object }>} */
    this._connections = new Map();
    this._log = console.log;
  }

  /**
   * Set log function (called from connection.js)
   */
  setLogger(logFn) {
    this._log = logFn || console.log;
  }

  /**
   * Start all configured MCP servers
   * @param {Object} mcpConfig - { serverName: { command, args, env } }
   */
  async startAll(mcpConfig) {
    if (!mcpConfig || typeof mcpConfig !== 'object') return;

    const entries = Object.entries(mcpConfig);
    if (entries.length === 0) return;

    for (const [name, config] of entries) {
      try {
        await this.connect(name, config);
      } catch (e) {
        this._log(`MCP: Failed to start "${name}": ${e.message}`);
      }
    }
  }

  /**
   * Connect to a single MCP server
   * @param {string} name - Server name
   * @param {Object} config - { command, args, env }
   */
  async connect(name, config) {
    if (this._connections.has(name)) {
      this._log(`MCP: "${name}" already connected`);
      return;
    }

    if (!config.command) {
      throw new Error(`MCP server "${name}" has no command configured`);
    }

    const { Client } = require('@modelcontextprotocol/sdk/client');
    const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

    const args = Array.isArray(config.args) ? config.args : [];
    const env = config.env && typeof config.env === 'object'
      ? { ...process.env, ...config.env }
      : undefined;

    // On Windows, npx needs shell resolution
    const isWindows = os.platform() === 'win32';
    const command = isWindows && config.command === 'npx' ? 'npx.cmd' : config.command;

    this._log(`MCP: Starting "${name}" (${config.command} ${args.join(' ')})`);

    const transport = new StdioClientTransport({ command, args, env });

    const client = new Client(
      { name: 'swarmai-local-agent', version: '0.1.0' },
      { capabilities: {} }
    );

    try {
      await client.connect(transport);
    } catch (err) {
      throw new Error(`Failed to connect MCP server "${name}": ${err.message}`);
    }

    const entry = { client, transport, tools: [], config };
    this._connections.set(name, entry);

    // Discover tools
    try {
      const result = await client.listTools();
      entry.tools = (result.tools || []).map(t => ({
        server: name,
        name: t.name,
        description: t.description || '',
        inputSchema: t.inputSchema || { type: 'object', properties: {} },
      }));
      this._log(`MCP: "${name}" connected — ${entry.tools.length} tools discovered`);
    } catch (err) {
      this._log(`MCP: "${name}" connected but tool discovery failed: ${err.message}`);
    }

    // Handle unexpected disconnect
    if (transport.onclose) {
      const originalOnClose = transport.onclose;
      transport.onclose = () => {
        originalOnClose();
        if (this._connections.has(name)) {
          this._log(`MCP: "${name}" disconnected unexpectedly`);
          this._connections.delete(name);
        }
      };
    }
  }

  /**
   * Disconnect a single MCP server
   * @param {string} name
   */
  async disconnect(name) {
    const entry = this._connections.get(name);
    if (!entry) return;

    try {
      await entry.client.close();
    } catch (err) {
      this._log(`MCP: Error closing "${name}": ${err.message}`);
    }

    this._connections.delete(name);
  }

  /**
   * Disconnect all MCP servers
   */
  async disconnectAll() {
    const names = [...this._connections.keys()];
    const promises = names.map(name => this.disconnect(name));
    await Promise.allSettled(promises);
  }

  /**
   * Call a tool on a specific MCP server
   * @param {string} serverName
   * @param {string} toolName
   * @param {Object} args
   * @returns {Promise<Object>}
   */
  async callTool(serverName, toolName, args = {}) {
    const entry = this._connections.get(serverName);
    if (!entry) {
      throw new Error(`MCP server "${serverName}" not connected. Connected servers: ${this.getConnectedServers().join(', ') || 'none'}`);
    }

    // Validate tool exists
    const tool = entry.tools.find(t => t.name === toolName);
    if (!tool) {
      const available = entry.tools.map(t => t.name).join(', ');
      throw new Error(`Tool "${toolName}" not found on MCP server "${serverName}". Available: ${available || 'none'}`);
    }

    // Execute with timeout
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`MCP tool call timed out after ${TOOL_CALL_TIMEOUT / 1000}s`)), TOOL_CALL_TIMEOUT);
    });

    const callPromise = entry.client.callTool({
      name: toolName,
      arguments: args,
    });

    const result = await Promise.race([callPromise, timeoutPromise]);
    return result.content || result;
  }

  /**
   * Get all discovered tools from all connected servers (flat array)
   * @returns {Array<{ server: string, name: string, description: string, inputSchema: Object }>}
   */
  getAllTools() {
    const tools = [];
    for (const entry of this._connections.values()) {
      tools.push(...entry.tools);
    }
    return tools;
  }

  /**
   * Get list of connected server names
   * @returns {string[]}
   */
  getConnectedServers() {
    return [...this._connections.keys()];
  }

  /**
   * Get a pre-configured recipe
   * @param {string} name
   * @returns {Object|null}
   */
  static getRecipe(name) {
    return MCP_RECIPES[name] || null;
  }

  /**
   * Get all recipe names
   * @returns {string[]}
   */
  static getRecipeNames() {
    return Object.keys(MCP_RECIPES);
  }

  /**
   * Get recipe descriptions for display
   * @returns {Array<{name: string, description: string}>}
   */
  static getRecipeList() {
    return Object.values(MCP_RECIPES).map(r => ({
      name: r.name,
      description: r.description,
    }));
  }
}

// Singleton
let _instance = null;

function getMcpManager() {
  if (!_instance) {
    _instance = new MCPManager();
  }
  return _instance;
}

module.exports = { MCPManager, getMcpManager, MCP_RECIPES };
