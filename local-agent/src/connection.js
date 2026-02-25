/**
 * WebSocket connection management for Local Agent
 *
 * Connects to SwarmAI server via Socket.io /local-agent namespace.
 * Handles heartbeat, command dispatch, and reconnection.
 */

const os = require('os');
const { executeCommand, getCapabilities, setConnectionContext, setSocket } = require('./commands');
const { scanTools } = require('./toolScanner');
const { loadConfig, getWorkspaceDefaults } = require('./config');
const { initWorkspaceManager, getWorkspaceManager } = require('./workspace');

const HEARTBEAT_INTERVAL_MS = 15 * 1000; // Send heartbeat every 15s

class AgentConnection {
  constructor(serverUrl, apiKey, options = {}) {
    this._serverUrl = serverUrl;
    this._apiKey = apiKey;
    this._socket = null;
    this._heartbeatInterval = null;
    this._onStatusChange = options.onStatusChange || (() => {});
    this._onLog = options.onLog || console.log;
    this._connected = false;
    this._prevCpuTimes = null; // For CPU usage delta calculation
  }

  /**
   * Connect to server
   */
  async connect() {
    if (this._socket) {
      throw new Error('Already connected. Call disconnect() first.');
    }

    const { io } = require('socket.io-client');

    this._onLog('Connecting to server...');

    this._socket = io(`${this._serverUrl}/local-agent`, {
      auth: { apiKey: this._apiKey },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 30000,
      reconnectionAttempts: Infinity,
      maxHttpBufferSize: 20 * 1024 * 1024, // 20MB — match server config for large payloads (screenshots, file transfers)
      pingTimeout: 60000,                   // 60s — allow large payloads to finish transmitting
    });

    // Connection events
    this._socket.on('connect', () => {
      this._connected = true;
      this._onStatusChange('connected');
      this._onLog('Connected to SwarmAI server');

      // Pass server context to commands module for HTTP file uploads
      setConnectionContext(this._serverUrl, this._apiKey);

      // Pass socket reference for streaming output
      setSocket(this._socket);

      // Send system info on connect (includes tool registry + MCP tools)
      let toolRegistry = {};
      try {
        this._onLog('Scanning installed tools...');
        toolRegistry = scanTools();
        const installed = Object.entries(toolRegistry).filter(([, v]) => v.installed).map(([k]) => k);
        this._onLog(`Found tools: ${installed.join(', ') || 'none'}`);
      } catch (e) {
        this._onLog(`Tool scan failed: ${e.message}`);
      }

      // Start MCP servers (async, non-blocking for initial connect)
      let mcpTools = [];
      const startMcp = async () => {
        try {
          const { loadConfig } = require('./config');
          const config = loadConfig();
          if (config.mcpServers && Object.keys(config.mcpServers).length > 0) {
            this._onLog('Starting MCP servers...');
            const { getMcpManager } = require('./mcpManager');
            const mcpManager = getMcpManager();
            mcpManager.setLogger(this._onLog);
            await mcpManager.startAll(config.mcpServers);
            mcpTools = mcpManager.getAllTools();
            const servers = mcpManager.getConnectedServers();
            this._onLog(`MCP: ${servers.length} server(s) active, ${mcpTools.length} tool(s) available`);

            // Send updated system-info with MCP tools
            if (this._socket && this._connected) {
              this._socket.emit('system-info', {
                hostname: os.hostname(),
                os: os.platform(),
                osVersion: os.release(),
                capabilities: getCapabilities(),
                toolRegistry,
                mcpTools,
              });
            }
          }
        } catch (e) {
          this._onLog(`MCP startup failed: ${e.message}`);
        }
      };

      // Emit initial system-info immediately (without MCP tools)
      this._socket.emit('system-info', {
        hostname: os.hostname(),
        os: os.platform(),
        osVersion: os.release(),
        capabilities: getCapabilities(),
        toolRegistry,
        mcpTools: [],
      });

      // Start MCP servers in background (will re-emit system-info when ready)
      startMcp();

      // Scan for local AI providers (Ollama, LM Studio) — async, non-blocking
      const scanAiServices = async () => {
        try {
          const { scanAiProviders } = require('./aiProviderScanner');
          const aiProviders = await scanAiProviders();
          if (aiProviders.length > 0 && this._socket && this._connected) {
            this._socket.emit('ai-providers', { providers: aiProviders });
            const summary = aiProviders.map(p => `${p.type}(${p.models.length} models)`).join(', ');
            this._onLog(`AI providers: ${summary}`);
          }
        } catch (e) {
          this._onLog(`AI provider scan failed: ${e.message}`);
        }
      };
      scanAiServices();

      // Initialize workspace shared dirs (temp, downloads)
      // Use getWorkspaceManager() to avoid re-creating instance on reconnect
      try {
        const config = loadConfig();
        const wsConfig = { ...getWorkspaceDefaults(), ...(config.workspace || {}) };
        const wm = getWorkspaceManager() || initWorkspaceManager(wsConfig);
        const shared = wm.initSharedDirs();
        this._onLog(`Workspace root: ${shared.rootPath}`);
        // Report workspace paths to server
        this._socket.emit('workspace:info', shared);
      } catch (e) {
        this._onLog(`Workspace init failed: ${e.message}`);
      }

      // Start periodic cleanup of temp/downloads (clear previous interval on reconnect)
      if (this._cleanupInterval) {
        clearInterval(this._cleanupInterval);
        this._cleanupInterval = null;
      }
      const cleanupMs = getWorkspaceDefaults().cleanupIntervalMs;
      this._cleanupInterval = setInterval(() => {
        const wm = getWorkspaceManager();
        if (wm) {
          const tempDeleted = wm.cleanupTemp();
          const dlDeleted = wm.cleanupDownloads();
          if (tempDeleted || dlDeleted) {
            this._onLog(`Workspace cleanup: ${tempDeleted} temp, ${dlDeleted} downloads removed`);
          }
        }
      }, cleanupMs);

      // Start heartbeat
      this._startHeartbeat();
    });

    this._socket.on('disconnect', (reason) => {
      this._connected = false;
      this._onStatusChange('disconnected');
      this._onLog(`Disconnected: ${reason}`);
      this._stopHeartbeat();
    });

    this._socket.on('connect_error', (error) => {
      this._onStatusChange('error');
      this._onLog(`Connection error: ${error.message}`);
    });

    // Listen for profile workspace requests from server (lazy per-profile init)
    // Registered outside 'connect' handler to avoid duplicate listeners on reconnect
    this._socket.on('workspace:init', (data) => {
      try {
        const { profileName, systemPrompt } = data || {};
        const wm = getWorkspaceManager();
        if (!wm || !profileName) return;
        const wsPath = wm.ensureProfileWorkspace(profileName, { systemPrompt });
        this._socket.emit('workspace:ready', { profileName, workspacePath: wsPath });
        this._onLog(`Profile workspace ready: ${wsPath}`);
      } catch (e) {
        this._onLog(`Workspace init for profile failed: ${e.message}`);
      }
    });

    // Command handling (await needed for async handlers like screenshot)
    this._socket.on('command', async (data) => {
      const { commandId, command, params } = data;
      this._onLog(`Received command: ${command}`);

      try {
        const result = await executeCommand(command, params, commandId);
        this._socket.emit('command:result', { commandId, result });
        this._onLog(`Command ${command} completed`);
      } catch (error) {
        this._socket.emit('command:result', {
          commandId,
          error: error.message,
        });
        this._onLog(`Command ${command} failed: ${error.message}`);
      }
    });

    // Heartbeat ack
    this._socket.on('heartbeat:ack', () => {
      // Server acknowledged heartbeat
    });

    // Revocation
    this._socket.on('revoked', (data) => {
      this._onLog(`Agent revoked: ${data?.reason || 'Access revoked'}`);
      this.disconnect();
      process.exit(1);
    });

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, 15000);

      this._socket.once('connect', () => {
        clearTimeout(timeout);
        resolve();
      });

      this._socket.once('connect_error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  /**
   * Disconnect from server
   */
  disconnect() {
    this._stopHeartbeat();

    // Stop workspace cleanup interval
    if (this._cleanupInterval) {
      clearInterval(this._cleanupInterval);
      this._cleanupInterval = null;
    }

    // Shutdown MCP servers
    try {
      const { getMcpManager } = require('./mcpManager');
      getMcpManager().disconnectAll();
    } catch { /* ignore if MCP not loaded */ }

    if (this._socket) {
      this._socket.disconnect();
      this._socket = null;
    }
    this._connected = false;
  }

  /**
   * Check if connected
   */
  isConnected() {
    return this._connected;
  }

  _startHeartbeat() {
    this._stopHeartbeat();
    this._heartbeatInterval = setInterval(() => {
      if (this._socket && this._connected) {
        // Enrich heartbeat with system metrics (#9 Health Dashboard)
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const cpus = os.cpus();

        // Calculate CPU usage from delta between consecutive heartbeats
        let cpuUsage = 0;
        if (cpus.length > 0) {
          const current = {};
          for (const cpu of cpus) {
            for (const type in cpu.times) {
              current[type] = (current[type] || 0) + cpu.times[type];
            }
          }

          if (this._prevCpuTimes) {
            const idleDelta = current.idle - this._prevCpuTimes.idle;
            let totalDelta = 0;
            for (const type in current) {
              totalDelta += (current[type] - (this._prevCpuTimes[type] || 0));
            }
            if (totalDelta > 0) {
              cpuUsage = Math.round(100 - (idleDelta / totalDelta * 100));
              cpuUsage = Math.max(0, Math.min(100, cpuUsage));
            }
          }
          this._prevCpuTimes = current;
        }

        this._socket.emit('heartbeat', {
          timestamp: Date.now(),
          metrics: {
            cpu: { usage: cpuUsage, cores: cpus.length },
            memory: {
              used: Math.round((totalMem - freeMem) / (1024 * 1024)),
              total: Math.round(totalMem / (1024 * 1024)),
              unit: 'MB',
            },
            uptime: Math.round(os.uptime()),
            loadAvg: os.loadavg().map(v => Math.round(v * 100) / 100),
          },
        });
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  _stopHeartbeat() {
    if (this._heartbeatInterval) {
      clearInterval(this._heartbeatInterval);
      this._heartbeatInterval = null;
    }
  }
}

module.exports = { AgentConnection };
