/**
 * Terminal Service - Interactive terminal sessions with PTY support
 * Supports Bash, Claude CLI, Gemini CLI, and OpenCode CLI
 * Works on Windows and Linux with node-pty fallback
 */

const { spawn, execSync } = require('child_process');
const path = require('path');
const crypto = require('crypto');
const EventEmitter = require('events');
const os = require('os');
const fs = require('fs');
const { logger } = require('./logger.cjs');

// Try to load node-pty, fallback to basic spawn if not available
let pty;
try {
  pty = require('node-pty');
  logger.info('[TerminalService] node-pty loaded successfully');
} catch (err) {
  logger.warn(`[TerminalService] node-pty not available (${err.message}), using fallback mode`);
  pty = null;
}

// Detect platform
const isWindows = os.platform() === 'win32';

// Find available shell with fallbacks
function findShell() {
  if (isWindows) {
    // On Windows, try PowerShell first, then cmd
    const windowsShells = ['powershell.exe', 'pwsh.exe', 'cmd.exe'];
    for (const sh of windowsShells) {
      try {
        execSync(`where ${sh}`, { stdio: 'ignore' });
        logger.info(`[TerminalService] Using Windows shell: ${sh}`);
        return sh;
      } catch {
        continue;
      }
    }
    return 'cmd.exe'; // Fallback
  }

  // On Unix, try various shells
  const unixShells = [
    process.env.SHELL,
    '/bin/bash',
    '/bin/sh',
    '/usr/bin/bash',
    '/usr/bin/sh'
  ].filter(Boolean);

  for (const sh of unixShells) {
    if (fs.existsSync(sh)) {
      logger.info(`[TerminalService] Using Unix shell: ${sh}`);
      return sh;
    }
  }

  logger.warn('[TerminalService] No standard shell found, using /bin/sh');
  return '/bin/sh';
}

const shell = findShell();

// Get cliuser uid/gid for running CLI tools (Docker environment)
let cliUserInfo = null;
if (!isWindows) {
  try {
    const { execSync } = require('child_process');
    const uid = parseInt(execSync('id -u cliuser 2>/dev/null').toString().trim());
    const gid = parseInt(execSync('id -g cliuser 2>/dev/null').toString().trim());
    if (!isNaN(uid) && !isNaN(gid)) {
      cliUserInfo = { uid, gid };
      logger.info(`[TerminalService] Found cliuser: uid=${uid}, gid=${gid}`);
    }
  } catch {
    logger.info('[TerminalService] cliuser not found, CLI tools will run as current user');
  }
}

// Terminal type configurations
const TERMINAL_TYPES = {
  'bash': {
    id: 'bash',
    name: 'Bash Terminal',
    description: isWindows ? 'PowerShell terminal' : 'Standard bash shell',
    command: shell,
    args: isWindows ? [] : [],
    installed: true
  },
  'claude': {
    id: 'claude',
    name: 'Claude CLI',
    description: 'Claude AI assistant CLI',
    command: 'claude',
    args: [],
    installed: false // Will be checked dynamically
  },
  'gemini': {
    id: 'gemini',
    name: 'Gemini CLI',
    description: 'Google Gemini CLI',
    command: 'gemini',
    args: [],
    installed: false
  },
  'opencode': {
    id: 'opencode',
    name: 'OpenCode CLI',
    description: 'OpenCode assistant CLI',
    command: 'opencode',
    args: [],
    installed: false
  }
};

class TerminalService extends EventEmitter {
  constructor() {
    super();
    this.sessions = new Map(); // sessionId -> session info
    this.maxSessions = 10; // Max concurrent terminal sessions
    this.sessionTimeout = 30 * 60 * 1000; // 30 minutes
    this.workingDirectory = process.cwd();

    // Start cleanup interval
    this.startCleanup();

    // Check CLI installations on startup
    this.checkCLIInstallations();
  }

  /**
   * Check which CLIs are installed
   */
  async checkCLIInstallations() {
    const checkCommand = isWindows ? 'where' : 'which';

    for (const [key, config] of Object.entries(TERMINAL_TYPES)) {
      if (key === 'bash') continue; // Bash/PowerShell is always available

      try {
        const { execSync } = require('child_process');
        execSync(`${checkCommand} ${config.command}`, { stdio: 'ignore' });
        config.installed = true;
        logger.info(`[TerminalService] ${config.name} is installed`);
      } catch {
        config.installed = false;
        logger.info(`[TerminalService] ${config.name} not found`);
      }
    }
  }

  /**
   * Get available terminal types
   */
  getAvailableTypes() {
    return Object.values(TERMINAL_TYPES).map(t => ({
      type: t.id,  // Frontend expects 'type' not 'id'
      name: t.name,
      description: t.description,
      installed: t.installed
    }));
  }

  /**
   * Create a new terminal session
   * @param {string} userId - User ID
   * @param {string} terminalType - Type of terminal
   * @param {object} options - Additional options
   * @returns {object} Session info
   */
  createSession(userId, terminalType, options = {}) {
    // Validate terminal type
    const terminalConfig = TERMINAL_TYPES[terminalType];
    if (!terminalConfig) {
      throw new Error(`Invalid terminal type: ${terminalType}. Available: ${Object.keys(TERMINAL_TYPES).join(', ')}`);
    }

    // Check if CLI is installed
    if (!terminalConfig.installed && terminalType !== 'bash') {
      throw new Error(`${terminalConfig.name} is not installed on this system`);
    }

    // Check max sessions
    const userSessionCount = Array.from(this.sessions.values())
      .filter(s => s.userId === userId && s.status === 'active').length;

    if (userSessionCount >= this.maxSessions) {
      throw new Error('Maximum terminal sessions reached. Please close an existing session.');
    }

    // Generate session ID
    const sessionId = crypto.randomBytes(16).toString('hex');

    // Terminal dimensions
    const cols = options.cols || 120;
    const rows = options.rows || 40;
    const cwd = options.cwd || this.workingDirectory;

    let termProcess;

    // Environment setup
    const env = {
      ...process.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      FORCE_COLOR: '1'
    };

    // Remove sensitive env vars
    delete env.JWT_SECRET;
    delete env.REDIS_PASSWORD;

    if (pty) {
      // Use node-pty for full PTY support
      try {
        const shellCommand = terminalConfig.command;
        logger.info(`[TerminalService] Attempting PTY spawn with command: ${shellCommand}, cwd: ${cwd}`);

        // Verify command exists before spawning
        if (!shellCommand) {
          throw new Error('Shell command is empty or undefined');
        }

        // On Unix, verify shell exists
        if (!isWindows && !fs.existsSync(shellCommand) && !shellCommand.includes('/')) {
          // Try to find in PATH
          try {
            execSync(`which ${shellCommand}`, { stdio: 'ignore' });
          } catch {
            throw new Error(`Shell not found: ${shellCommand}`);
          }
        }

        // Use cliuser for CLI tools (claude, gemini, opencode) to access persisted credentials
        const ptyOptions = {
          name: 'xterm-256color',
          cols: cols,
          rows: rows,
          cwd: cwd,
          env: env
        };

        // Run CLI tools as cliuser in Docker (credentials are in /home/cliuser)
        if (cliUserInfo && terminalType !== 'bash') {
          ptyOptions.uid = cliUserInfo.uid;
          ptyOptions.gid = cliUserInfo.gid;
          ptyOptions.env.HOME = '/home/cliuser';
          logger.info(`[TerminalService] Running ${terminalType} as cliuser (uid=${cliUserInfo.uid})`);
        }

        termProcess = pty.spawn(shellCommand, terminalConfig.args, ptyOptions);
        logger.info(`[TerminalService] PTY session created: ${sessionId}`);
      } catch (err) {
        logger.error(`[TerminalService] PTY spawn failed for command '${terminalConfig.command}': ${err.message}`);

        // Try fallback to basic spawn if PTY fails
        logger.info('[TerminalService] Attempting fallback to basic spawn...');
        try {
          termProcess = spawn(terminalConfig.command, terminalConfig.args, {
            cwd: cwd,
            shell: true,
            env: env,
            stdio: ['pipe', 'pipe', 'pipe']
          });
          logger.info(`[TerminalService] Fallback spawn session created: ${sessionId}`);
          pty = null; // Temporarily disable PTY for this session's event handling
        } catch (fallbackErr) {
          logger.error(`[TerminalService] Fallback spawn also failed: ${fallbackErr.message}`);
          throw new Error(`Failed to spawn terminal (${terminalConfig.command}): ${err.message}`);
        }
      }
    } else {
      // Fallback to basic spawn
      try {
        termProcess = spawn(terminalConfig.command, terminalConfig.args, {
          cwd: cwd,
          shell: true,
          env: env,
          stdio: ['pipe', 'pipe', 'pipe']
        });
        logger.info(`[TerminalService] Spawn session created: ${sessionId}`);
      } catch (err) {
        logger.error(`[TerminalService] Spawn failed: ${err.message}`);
        throw new Error(`Failed to spawn terminal: ${err.message}`);
      }
    }

    // Create session object
    const session = {
      id: sessionId,
      userId: userId,
      type: terminalType,
      typeName: terminalConfig.name,
      description: terminalConfig.description,
      process: termProcess,
      status: 'active',
      createdAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      cols: cols,
      rows: rows,
      cwd: cwd,
      outputBuffer: [], // Buffer for reconnection
      maxBufferSize: 1000
    };

    // Set up process event handlers
    this.setupProcessHandlers(session);

    // Store session
    this.sessions.set(sessionId, session);

    logger.info(`[TerminalService] Session created: ${sessionId} (${terminalType}) for user ${userId}`);

    return {
      id: sessionId,
      userId: userId,
      type: terminalType,
      typeName: terminalConfig.name,
      description: terminalConfig.description,
      status: 'active',
      createdAt: session.createdAt,
      lastActivity: session.lastActivity,
      cols: cols,
      rows: rows
    };
  }

  /**
   * Set up event handlers for the process
   */
  setupProcessHandlers(session) {
    const proc = session.process;

    if (pty) {
      // node-pty style events
      proc.onData((data) => {
        session.lastActivity = new Date().toISOString();
        this.bufferOutput(session, data);
        this.emit('data', session.id, data);
      });

      proc.onExit(({ exitCode, signal }) => {
        logger.info(`[TerminalService] Session ${session.id} exited with code ${exitCode}`);
        session.status = 'exited';
        session.exitCode = exitCode;
        this.emit('exit', session.id, exitCode, signal);
      });
    } else {
      // Basic spawn style events
      if (proc.stdout) {
        proc.stdout.on('data', (data) => {
          const str = data.toString();
          session.lastActivity = new Date().toISOString();
          this.bufferOutput(session, str);
          this.emit('data', session.id, str);
        });
      }

      if (proc.stderr) {
        proc.stderr.on('data', (data) => {
          const str = data.toString();
          session.lastActivity = new Date().toISOString();
          this.bufferOutput(session, str);
          this.emit('data', session.id, str);
        });
      }

      proc.on('close', (code) => {
        logger.info(`[TerminalService] Session ${session.id} closed with code ${code}`);
        session.status = 'exited';
        session.exitCode = code;
        this.emit('exit', session.id, code, null);
      });

      proc.on('error', (err) => {
        logger.error(`[TerminalService] Session ${session.id} error: ${err.message}`);
        session.status = 'error';
        session.error = err.message;
        this.emit('error', session.id, err);
      });
    }
  }

  /**
   * Buffer output for reconnection support
   */
  bufferOutput(session, data) {
    session.outputBuffer.push({
      timestamp: Date.now(),
      data: data
    });

    // Trim buffer if too large
    if (session.outputBuffer.length > session.maxBufferSize) {
      session.outputBuffer = session.outputBuffer.slice(-session.maxBufferSize);
    }
  }

  /**
   * Write data to terminal
   */
  write(sessionId, data) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }
    if (session.status !== 'active') {
      throw new Error('Session is not active');
    }

    session.lastActivity = new Date().toISOString();

    if (pty) {
      session.process.write(data);
    } else if (session.process.stdin) {
      session.process.stdin.write(data);
    }
  }

  /**
   * Resize terminal
   */
  resize(sessionId, cols, rows) {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== 'active') {
      return false;
    }

    session.cols = cols;
    session.rows = rows;

    if (pty && session.process.resize) {
      session.process.resize(cols, rows);
    }

    return true;
  }

  /**
   * Get session info
   */
  getSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    return {
      id: session.id,
      userId: session.userId,
      type: session.type,
      typeName: session.typeName,
      description: session.description,
      status: session.status,
      createdAt: session.createdAt,
      lastActivity: session.lastActivity,
      cols: session.cols,
      rows: session.rows,
      exitCode: session.exitCode,
      error: session.error
    };
  }

  /**
   * Get buffered output for reconnection
   */
  getBufferedOutput(sessionId, since = 0) {
    const session = this.sessions.get(sessionId);
    if (!session) return [];

    return session.outputBuffer
      .filter(item => item.timestamp > since)
      .map(item => item.data)
      .join('');
  }

  /**
   * Get all sessions for a user
   */
  getUserSessions(userId) {
    const sessions = [];
    this.sessions.forEach((session) => {
      if (session.userId === userId) {
        sessions.push({
          id: session.id,
          userId: session.userId,
          type: session.type,
          typeName: session.typeName,
          description: session.description,
          status: session.status,
          createdAt: session.createdAt,
          lastActivity: session.lastActivity,
          cols: session.cols,
          rows: session.rows
        });
      }
    });
    return sessions;
  }

  /**
   * Verify session ownership
   */
  verifyOwnership(sessionId, userId) {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    return session.userId === userId;
  }

  /**
   * Close a terminal session
   */
  closeSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    try {
      if (pty) {
        session.process.kill();
      } else {
        session.process.kill('SIGTERM');
        // Force kill after timeout
        setTimeout(() => {
          try {
            if (!session.process.killed) {
              session.process.kill('SIGKILL');
            }
          } catch {
            // Already dead
          }
        }, 5000);
      }
    } catch (err) {
      logger.error(`[TerminalService] Error killing session ${sessionId}: ${err.message}`);
    }

    session.status = 'closed';
    this.sessions.delete(sessionId);

    logger.info(`[TerminalService] Session closed: ${sessionId}`);
    this.emit('closed', sessionId);

    return true;
  }

  /**
   * Close all sessions for a user
   */
  closeUserSessions(userId) {
    const sessionsToClose = [];
    this.sessions.forEach((session, id) => {
      if (session.userId === userId) {
        sessionsToClose.push(id);
      }
    });

    sessionsToClose.forEach(id => this.closeSession(id));
    return sessionsToClose.length;
  }

  /**
   * Start cleanup interval for stale sessions
   */
  startCleanup() {
    setInterval(() => {
      const now = Date.now();
      const toClose = [];

      this.sessions.forEach((session, id) => {
        const lastActivity = new Date(session.lastActivity).getTime();
        if (now - lastActivity > this.sessionTimeout) {
          logger.info(`[TerminalService] Session ${id} timed out`);
          toClose.push(id);
        }
      });

      toClose.forEach(id => this.closeSession(id));
    }, 60 * 1000); // Check every minute
  }

  /**
   * Check if a specific CLI is installed
   * @param {string} cliName - Name of CLI (claude, gemini, opencode)
   * @returns {boolean}
   */
  isCliInstalled(cliName) {
    const config = TERMINAL_TYPES[cliName];
    if (!config) {
      return false;
    }
    return config.installed;
  }

  /**
   * Install a CLI tool
   * @param {string} cliName - Name of CLI to install (claude, gemini, opencode)
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async installCli(cliName) {
    const validClis = ['claude', 'gemini', 'opencode'];
    if (!validClis.includes(cliName)) {
      return { success: false, message: `Invalid CLI name. Valid options: ${validClis.join(', ')}` };
    }

    // CLI package mapping
    const cliPackages = {
      'claude': '@anthropic-ai/claude-code',
      'gemini': '@anthropic-ai/claude-code',  // Placeholder - actual package TBD
      'opencode': 'opencode-ai'  // Placeholder - actual package TBD
    };

    const packageName = cliPackages[cliName];
    logger.info(`[TerminalService] Attempting to install ${cliName} CLI (${packageName})`);

    try {
      // Use npm to install globally
      const { execSync } = require('child_process');
      const installCmd = isWindows
        ? `npm install -g ${packageName}`
        : `npm install -g ${packageName}`;

      execSync(installCmd, {
        stdio: 'pipe',
        timeout: 120000 // 2 minute timeout
      });

      // Re-check installation
      const checkCommand = isWindows ? 'where' : 'which';
      try {
        execSync(`${checkCommand} ${cliName}`, { stdio: 'ignore' });
        TERMINAL_TYPES[cliName].installed = true;
        logger.info(`[TerminalService] ${cliName} CLI installed successfully`);
        return { success: true, message: `${cliName} installed successfully` };
      } catch {
        // Installation succeeded but command not found - might need PATH update
        logger.warn(`[TerminalService] ${cliName} installed but not in PATH`);
        return {
          success: true,
          message: `${cliName} installed. You may need to restart your terminal or update PATH.`
        };
      }
    } catch (err) {
      logger.error(`[TerminalService] Failed to install ${cliName}: ${err.message}`);
      return {
        success: false,
        message: `Failed to install ${cliName}: ${err.message}`
      };
    }
  }

  /**
   * Re-check CLI installations (useful after install)
   */
  async recheckCliInstallation(cliName) {
    if (!TERMINAL_TYPES[cliName]) {
      return false;
    }

    const checkCommand = isWindows ? 'where' : 'which';
    try {
      execSync(`${checkCommand} ${cliName}`, { stdio: 'ignore' });
      TERMINAL_TYPES[cliName].installed = true;
      logger.info(`[TerminalService] ${cliName} is now installed`);
      return true;
    } catch {
      TERMINAL_TYPES[cliName].installed = false;
      return false;
    }
  }
}

// Export singleton instance
const terminalService = new TerminalService();
module.exports = terminalService;
