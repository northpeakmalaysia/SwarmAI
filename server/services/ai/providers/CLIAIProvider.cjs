/**
 * CLI AI Provider
 *
 * Main brain processor using CLI AI tools (Claude CLI, Gemini CLI, OpenCode CLI).
 * Executes complex agentic tasks through authenticated CLI sessions.
 */

const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('../../logger.cjs');
const { getDatabase } = require('../../database.cjs');

// Get cliuser uid/gid for running CLI tools (Docker environment)
const isWindows = os.platform() === 'win32';
let cliUserInfo = null;
if (!isWindows) {
  try {
    const uid = parseInt(execSync('id -u cliuser 2>/dev/null').toString().trim());
    const gid = parseInt(execSync('id -g cliuser 2>/dev/null').toString().trim());
    if (!isNaN(uid) && !isNaN(gid)) {
      cliUserInfo = { uid, gid };
      logger.info(`[CLIAIProvider] Found cliuser: uid=${uid}, gid=${gid}`);
    }
  } catch {
    logger.info('[CLIAIProvider] cliuser not found, CLI tools will run as current user');
  }
}

/**
 * Default models for CLI providers
 * For Claude and Gemini: Empty - they use "Default (Auto)" mode only
 * For OpenCode: Specific models since it's multi-provider
 */
const CLI_DEFAULT_MODELS = {
  claude: [], // CLI auto-selects model, no need for specific models
  gemini: [], // CLI auto-selects model, no need for specific models
  opencode: [
    // OpenCode is multi-provider, so we list available models
    { id: 'opencode/big-pickle', name: 'Big Pickle', isFree: false },
    { id: 'opencode/glm-4.7-free', name: 'GLM 4.7 Free', isFree: true },
    { id: 'opencode/gpt-5-nano', name: 'GPT 5 Nano', isFree: false },
    { id: 'opencode/kimi-k2.5-free', name: 'Kimi K2.5 Free', isFree: true },
    { id: 'opencode/minimax-m2.1-free', name: 'Minimax M2.1 Free', isFree: true },
    { id: 'opencode/trinity-large-preview-free', name: 'Trinity Large Preview Free', isFree: true },
  ],
};

/**
 * CLI display names for UI
 */
const CLI_DISPLAY_NAMES = {
  claude: 'Claude CLI (Anthropic)',
  gemini: 'Gemini CLI (Google)',
  opencode: 'OpenCode CLI (Multi-Provider)',
};

/**
 * CLI tool configurations
 */
const CLI_CONFIGS = {
  claude: {
    command: 'claude',
    // --dangerously-skip-permissions: required in Docker sandbox, otherwise Claude hangs
    //   waiting for permission approval on stdin (which is immediately closed)
    // -p: non-interactive print mode, prompt follows as next argument
    args: ['--dangerously-skip-permissions', '-p'],
    requiresAuth: true,
    capabilities: ['agentic', 'code', 'analysis', 'reasoning', 'research', 'autonomous'],
    maxTokens: 200000,
    timeout: 3600000, // 60 minutes for complex agentic tasks
    cost: 'paid',
  },
  gemini: {
    command: 'gemini',
    // -p: non-interactive (headless) mode, prompt follows as next argument
    // --yolo is appended AFTER the prompt in buildCommand() to auto-approve all tool calls
    args: ['-p'],
    requiresAuth: true,
    capabilities: ['agentic', 'code', 'analysis', 'reasoning', 'multimodal'],
    maxTokens: 100000,
    timeout: 3600000, // 60 minutes for complex agentic tasks
    cost: 'free',
  },
  opencode: {
    command: 'opencode',
    args: ['run'],
    formatArgs: ['--format', 'json'], // For machine-readable output
    requiresAuth: true,
    capabilities: ['code', 'agentic', 'automation', 'analysis', 'reasoning'],
    maxTokens: 128000, // OpenCode supports large context
    timeout: 3600000, // 60 minutes for complex agentic tasks
    cost: 'free',
    authCommand: 'opencode auth login', // Command to authenticate
    versionCommand: 'opencode --version',
    description: 'OpenCode CLI - Free AI coding assistant with agentic capabilities',
  },
};

/**
 * Execution status types
 */
const EXECUTION_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  TIMEOUT: 'timeout',
  CANCELLED: 'cancelled',
};

class CLIAIProvider {
  constructor(config = {}) {
    this.config = config;
    this.authenticatedCLIs = new Map(); // cli -> { authenticated, sessionId, authenticatedAt, capabilities }
    this.runningExecutions = new Map(); // executionId -> { process, startTime, cli }
    this.workspaceManager = null; // Injected
    this.baseWorkspaceDir = config.workspaceDir || path.join(process.cwd(), 'data', 'workspaces');

    // Load auth state from database on startup
    this.loadAuthStateFromDB().catch((err) => {
      logger.error('Failed to load CLI auth state from DB:', err.message);
    });
  }

  /**
   * Load authentication state from database
   * Restores auth state after server restart
   */
  async loadAuthStateFromDB() {
    try {
      const db = getDatabase();
      const states = db.prepare(`
        SELECT cli_type, is_authenticated, capabilities, config, authenticated_at, authenticated_by
        FROM cli_auth_state WHERE is_authenticated = 1
      `).all();

      for (const state of states) {
        // Verify CLI is actually still authenticated by running a quick check
        const isValid = await this.verifyCLIAuth(state.cli_type);

        if (isValid) {
          this.authenticatedCLIs.set(state.cli_type, {
            authenticated: true,
            authenticatedAt: state.authenticated_at,
            authenticatedBy: state.authenticated_by,
            capabilities: state.capabilities ? JSON.parse(state.capabilities) : {},
            config: state.config ? JSON.parse(state.config) : {},
          });
          logger.info(`CLI ${state.cli_type} auth restored from database`);
        } else {
          // Mark as unauthenticated in DB
          await this.saveAuthState(state.cli_type, false, { error_message: 'Auth verification failed on startup' });
          logger.warn(`CLI ${state.cli_type} auth verification failed, marked as unauthenticated`);
        }
      }

      logger.info(`CLI auth state loaded: ${this.authenticatedCLIs.size} authenticated`);
    } catch (error) {
      logger.error('Error loading CLI auth state:', error.message);
    }
  }

  /**
   * Verify if CLI is actually authenticated by running a test command
   * @param {string} cliType - CLI type
   * @returns {Promise<boolean>}
   */
  async verifyCLIAuth(cliType) {
    const config = CLI_CONFIGS[cliType];
    if (!config) return false;

    return new Promise((resolve) => {
      // Run version command to check if CLI is responsive
      const spawnOpts = {
        shell: true,
        timeout: 10000,
        env: { ...process.env, HOME: process.env.CLI_HOME || '/home/cliuser' },
      };
      // Run as cliuser if available (Docker environment)
      if (cliUserInfo) {
        spawnOpts.uid = cliUserInfo.uid;
        spawnOpts.gid = cliUserInfo.gid;
      }
      const proc = spawn(config.command, ['--version'], spawnOpts);

      proc.on('close', (code) => {
        resolve(code === 0);
      });

      proc.on('error', () => {
        resolve(false);
      });

      // Timeout fallback
      setTimeout(() => {
        try { proc.kill(); } catch (e) { /* ignore */ }
        resolve(false);
      }, 10000);
    });
  }

  /**
   * Save authentication state to database
   * @param {string} cliType - CLI type
   * @param {boolean} isAuthenticated - Auth status
   * @param {Object} options - Additional options
   */
  async saveAuthState(cliType, isAuthenticated, options = {}) {
    try {
      const db = getDatabase();
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO cli_auth_state (cli_type, is_authenticated, authenticated_at, authenticated_by, capabilities, config, error_message, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(cli_type) DO UPDATE SET
          is_authenticated = excluded.is_authenticated,
          authenticated_at = CASE WHEN excluded.is_authenticated = 1 THEN excluded.authenticated_at ELSE authenticated_at END,
          authenticated_by = COALESCE(excluded.authenticated_by, authenticated_by),
          capabilities = COALESCE(excluded.capabilities, capabilities),
          config = COALESCE(excluded.config, config),
          error_message = excluded.error_message,
          last_check_at = excluded.updated_at,
          updated_at = excluded.updated_at
      `).run(
        cliType,
        isAuthenticated ? 1 : 0,
        isAuthenticated ? now : null,
        options.authenticatedBy || null,
        options.capabilities ? JSON.stringify(options.capabilities) : null,
        options.config ? JSON.stringify(options.config) : null,
        options.error_message || null,
        now
      );

      logger.info(`CLI ${cliType} auth state saved to database: ${isAuthenticated ? 'authenticated' : 'not authenticated'}`);
    } catch (error) {
      logger.error(`Error saving CLI auth state for ${cliType}:`, error.message);
    }
  }

  /**
   * Discover available models from a CLI tool by running CLI commands
   * @param {string} cliType - CLI type
   * @returns {Promise<Array>} Array of model objects
   */
  async discoverModelsFromCLI(cliType) {
    const config = CLI_CONFIGS[cliType];
    if (!config) return CLI_DEFAULT_MODELS[cliType] || [];

    // Only opencode currently supports model listing
    if (cliType !== 'opencode') {
      return CLI_DEFAULT_MODELS[cliType] || [];
    }

    return new Promise((resolve) => {
      let output = '';
      let errorOutput = '';

      // Use correct command: opencode models
      const spawnOpts = {
        shell: true,
        timeout: 15000,
        env: { ...process.env, HOME: process.env.CLI_HOME || '/home/cliuser' },
      };
      if (cliUserInfo) {
        spawnOpts.uid = cliUserInfo.uid;
        spawnOpts.gid = cliUserInfo.gid;
      }
      const proc = spawn('opencode', ['models'], spawnOpts);

      proc.stdout.on('data', (data) => {
        output += data.toString();
      });

      proc.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0 && output.trim()) {
          // Parse text output (one model per line, format: opencode/model-name)
          const lines = output.split('\n')
            .map(line => line.trim())
            .filter(line => line && line.includes('/'));  // Filter lines with provider/model format

          if (lines.length > 0) {
            const models = lines.map(line => {
              // Extract display name from model ID (e.g., "opencode/glm-4.7-free" -> "GLM 4.7 Free")
              const modelPart = line.split('/').pop() || line;
              const displayName = modelPart
                .replace(/-/g, ' ')
                .replace(/\b\w/g, c => c.toUpperCase());

              return {
                id: line,
                name: displayName,
                isFree: line.includes('free'),
              };
            });
            logger.info(`Discovered ${models.length} models from OpenCode CLI`);
            resolve(models);
            return;
          }
        }

        // Fallback to defaults
        logger.warn(`OpenCode model discovery failed (code: ${code}), using defaults`);
        resolve(CLI_DEFAULT_MODELS.opencode || []);
      });

      proc.on('error', (error) => {
        logger.warn(`OpenCode model discovery error: ${error.message}, using defaults`);
        resolve(CLI_DEFAULT_MODELS.opencode || []);
      });

      // Timeout fallback
      setTimeout(() => {
        try { proc.kill(); } catch (e) { /* ignore */ }
        logger.warn(`OpenCode model discovery timeout, using defaults`);
        resolve(CLI_DEFAULT_MODELS.opencode || []);
      }, 15000);
    });
  }

  /**
   * Detect CLI capabilities (available models, features)
   * @param {string} cliType - CLI type
   * @param {boolean} forceRefresh - Force refresh model discovery
   * @returns {Promise<Object>}
   */
  async detectCapabilities(cliType, forceRefresh = false) {
    const capabilities = {
      models: [],
      features: [],
      version: null,
      providers: [],
    };

    try {
      const config = CLI_CONFIGS[cliType];

      switch (cliType) {
        case 'opencode':
          // Try to discover models dynamically
          if (forceRefresh || !this.authenticatedCLIs.get(cliType)?.capabilities?.models?.length) {
            try {
              const discoveredModels = await this.discoverModelsFromCLI('opencode');
              if (discoveredModels.length > 0) {
                capabilities.models = discoveredModels;
              } else {
                capabilities.models = CLI_DEFAULT_MODELS.opencode;
              }
            } catch (e) {
              logger.warn(`OpenCode model discovery failed: ${e.message}`);
              capabilities.models = CLI_DEFAULT_MODELS.opencode;
            }
          } else {
            // Use cached models
            capabilities.models = this.authenticatedCLIs.get(cliType)?.capabilities?.models || CLI_DEFAULT_MODELS.opencode;
          }
          capabilities.features = ['multi-model', 'file-attachment', 'json-output', 'agentic'];
          capabilities.providers = ['anthropic', 'openai', 'deepseek', 'google'];
          break;

        case 'claude':
          capabilities.models = CLI_DEFAULT_MODELS.claude;
          capabilities.features = ['agentic', 'code-editing', 'mcp', 'autonomous'];
          break;

        case 'gemini':
          capabilities.models = CLI_DEFAULT_MODELS.gemini;
          capabilities.features = ['multimodal', 'grounding', 'code-execution'];
          break;
      }

      // Get version
      const versionResult = await this.verifyCLIAuth(cliType);
      if (versionResult) {
        capabilities.version = config?.command || cliType;
      }
    } catch (error) {
      logger.warn(`Error detecting capabilities for ${cliType}:`, error.message);
    }

    return capabilities;
  }

  /**
   * Set workspace manager
   * @param {Object} workspaceManager - WorkspaceManager instance
   */
  setWorkspaceManager(workspaceManager) {
    this.workspaceManager = workspaceManager;
  }

  /**
   * Authenticate a CLI tool (called after superadmin completes auth)
   * @param {string} cliType - CLI type ('claude', 'gemini', 'opencode')
   * @param {string} sessionId - Terminal session ID
   * @param {string} userId - User ID who authenticated
   */
  async authenticate(cliType, sessionId, userId = null) {
    if (!CLI_CONFIGS[cliType]) {
      throw new Error(`Unknown CLI type: ${cliType}`);
    }

    const capabilities = await this.detectCapabilities(cliType);

    this.authenticatedCLIs.set(cliType, {
      authenticated: true,
      sessionId,
      authenticatedAt: new Date().toISOString(),
      authenticatedBy: userId,
      capabilities,
    });

    // Save to database for persistence
    await this.saveAuthState(cliType, true, {
      authenticatedBy: userId,
      capabilities,
    });

    logger.info(`CLI ${cliType} authenticated and saved to database`);
  }

  /**
   * Check if a CLI is authenticated (from cache/database or API key)
   * @param {string} cliType - CLI type
   * @returns {boolean}
   */
  isAuthenticated(cliType) {
    // First check OAuth/session authentication (from cli_auth_state DB table)
    const status = this.authenticatedCLIs.get(cliType);
    if (status?.authenticated === true) {
      return true;
    }

    // Check for API key authentication (alternative for Docker environments)
    switch (cliType) {
      case 'claude':
        // Claude CLI can use ANTHROPIC_API_KEY environment variable
        if (process.env.ANTHROPIC_API_KEY) {
          logger.debug('Claude CLI using ANTHROPIC_API_KEY from environment');
          return true;
        }
        break;
      case 'gemini':
        // Gemini CLI can use GOOGLE_API_KEY or GEMINI_API_KEY
        if (process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY) {
          logger.debug('Gemini CLI using API key from environment');
          return true;
        }
        break;
      case 'opencode':
        // OpenCode supports multiple providers, check for any configured
        if (process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.OPENROUTER_API_KEY) {
          logger.debug('OpenCode CLI using API key from environment');
          return true;
        }
        break;
    }

    // Check for on-disk credential files (OAuth/session tokens from CLI login)
    // This catches cases where CLIs are authenticated via `cli auth login` in Docker
    // but the cli_auth_state DB table hasn't been updated.
    if (this._hasOnDiskCredentials(cliType)) {
      return true;
    }

    return false;
  }

  /**
   * Check if CLI has on-disk credential files (OAuth tokens, config files).
   * These are created by `claude auth login`, `gemini auth login`, `opencode auth login`.
   * @param {string} cliType
   * @returns {boolean}
   * @private
   */
  _hasOnDiskCredentials(cliType) {
    const fsSync = require('fs');
    const cliHome = process.env.CLI_HOME || '/home/cliuser';

    try {
      switch (cliType) {
        case 'claude': {
          // Claude CLI stores OAuth credentials in ~/.claude/.credentials.json
          // Format can be: {"claudeAiOauth":{"accessToken":"sk-ant-oat01-...",...}}
          // or legacy: {"accessToken":"...", "oauthAccount":"..."}
          const credPath = path.join(cliHome, '.claude', '.credentials.json');
          if (fsSync.existsSync(credPath)) {
            const content = fsSync.readFileSync(credPath, 'utf8');
            const creds = JSON.parse(content);
            if (creds && (
              creds.accessToken ||
              creds.oauthAccount ||
              creds.claudeAiOauth?.accessToken
            )) {
              logger.debug(`[CLIAIProvider] Claude CLI has on-disk OAuth credentials at ${credPath}`);
              return true;
            }
            logger.debug(`[CLIAIProvider] Claude credential file exists but no valid tokens found. Keys: ${Object.keys(creds || {}).join(', ')}`);
          }
          break;
        }
        case 'gemini': {
          // Gemini CLI stores OAuth in ~/.gemini/oauth_creds.json or ~/.config/gemini/
          // Also check application_default_credentials.json used by newer gemini CLI versions
          const credPaths = [
            path.join(cliHome, '.gemini', 'oauth_creds.json'),
            path.join(cliHome, '.config', 'gemini', 'oauth_creds.json'),
            path.join(cliHome, '.config', 'gcloud', 'application_default_credentials.json'),
          ];
          for (const credPath of credPaths) {
            if (fsSync.existsSync(credPath)) {
              logger.debug(`[CLIAIProvider] Gemini CLI has on-disk credentials at ${credPath}`);
              return true;
            }
          }
          // Also check if gemini directory itself exists (may use different credential file names)
          const geminiDir = path.join(cliHome, '.gemini');
          if (fsSync.existsSync(geminiDir)) {
            try {
              const files = fsSync.readdirSync(geminiDir);
              if (files.some(f => f.includes('cred') || f.includes('oauth') || f.includes('token') || f.includes('auth'))) {
                logger.debug(`[CLIAIProvider] Gemini CLI has credential-like files in ${geminiDir}: ${files.join(', ')}`);
                return true;
              }
              logger.debug(`[CLIAIProvider] Gemini dir exists at ${geminiDir} with files: ${files.join(', ')} but no credential files found`);
            } catch (e) {
              logger.debug(`[CLIAIProvider] Cannot read gemini dir ${geminiDir}: ${e.message}`);
            }
          }
          logger.debug(`[CLIAIProvider] Gemini: no on-disk credentials found. CLI_HOME=${cliHome}, checked: ${credPaths.join(', ')}`);
          break;
        }
        case 'opencode': {
          // OpenCode stores config in ~/.opencode/config.json or ~/.config/opencode/
          const configPaths = [
            path.join(cliHome, '.opencode', 'config.json'),
            path.join(cliHome, '.config', 'opencode', 'config.json'),
            path.join(cliHome, '.local', 'share', 'opencode', 'config.json'),
          ];
          for (const cfgPath of configPaths) {
            if (fsSync.existsSync(cfgPath)) {
              logger.debug(`[CLIAIProvider] OpenCode CLI has on-disk config at ${cfgPath}`);
              return true;
            }
          }
          break;
        }
      }
    } catch (e) {
      // File system check is best-effort
      logger.debug(`[CLIAIProvider] On-disk credential check failed for ${cliType}: ${e.message}`);
    }

    return false;
  }

  /**
   * Verify CLI authentication by actually running a test command
   * This is more reliable than just checking database flags
   * @param {string} cliType - CLI type ('claude', 'gemini', 'opencode')
   * @returns {Promise<{authenticated: boolean, error?: string, responseTime?: number}>}
   */
  async verifyAuthentication(cliType) {
    const config = CLI_CONFIGS[cliType];
    if (!config) {
      return { authenticated: false, error: `Unknown CLI type: ${cliType}` };
    }

    const startTime = Date.now();

    try {
      // Build a simple test command
      let testCmd;
      switch (cliType) {
        case 'claude':
          // Must include --dangerously-skip-permissions to avoid hanging on permission prompt
          testCmd = `${config.command} --dangerously-skip-permissions -p "Reply with just OK" --max-turns 1`;
          break;
        case 'gemini':
          // Must include --yolo to avoid hanging on tool approval
          testCmd = `${config.command} -p "Reply with just OK" --yolo`;
          break;
        case 'opencode':
          // OpenCode CLI: opencode run "test" --format json
          testCmd = `${config.command} run "Reply with just OK" --format json`;
          break;
        default:
          testCmd = `${config.command} --version`;
      }

      logger.info(`Verifying ${cliType} CLI authentication with: ${testCmd}`);

      // Use async spawn (NOT execSync) to avoid blocking the Node.js event loop
      const cliHome = process.env.CLI_HOME || '/home/cliuser';
      const output = await new Promise((resolve, reject) => {
        const parts = testCmd.split(/\s+/);
        const cmd = parts[0];
        const args = parts.slice(1);
        let stdout = '';
        let stderr = '';

        const spawnOpts = {
          env: { ...process.env, HOME: cliHome },
          stdio: ['pipe', 'pipe', 'pipe'],
          shell: true, // shell: true because testCmd is a pre-built string with quotes
        };
        if (cliUserInfo) {
          spawnOpts.uid = cliUserInfo.uid;
          spawnOpts.gid = cliUserInfo.gid;
        }

        const child = spawn(cmd, args, spawnOpts);
        child.stdin.end();

        const timeoutId = setTimeout(() => {
          child.kill('SIGTERM');
          setTimeout(() => { if (!child.killed) child.kill('SIGKILL'); }, 5000);
          reject(new Error(`CLI auth verification timeout after 180000ms`));
        }, 180000);

        child.stdout.on('data', (data) => { stdout += data.toString(); });
        child.stderr.on('data', (data) => { stderr += data.toString(); });
        child.on('close', (code) => {
          clearTimeout(timeoutId);
          if (code === 0) {
            resolve(stdout.trim());
          } else {
            reject(new Error(`CLI exited with code ${code}: ${stderr || stdout}`));
          }
        });
        child.on('error', (err) => {
          clearTimeout(timeoutId);
          reject(err);
        });
      });

      const responseTime = Date.now() - startTime;
      logger.info(`${cliType} CLI verification successful in ${responseTime}ms`);

      // Update database with verified status
      await this.saveAuthState(cliType, true, {
        verifiedAt: new Date().toISOString(),
        responseTime,
      });

      // Update in-memory cache
      this.authenticatedCLIs.set(cliType, {
        authenticated: true,
        authenticatedAt: new Date().toISOString(),
        verifiedAt: new Date().toISOString(),
      });

      return {
        authenticated: true,
        responseTime,
        output: (output || '').substring(0, 200), // First 200 chars of response
      };

    } catch (error) {
      const responseTime = Date.now() - startTime;
      logger.warn(`${cliType} CLI verification failed: ${error.message}`);

      // Check for specific auth errors
      const isAuthError = error.message.includes('auth') ||
                          error.message.includes('login') ||
                          error.message.includes('credentials') ||
                          error.message.includes('token') ||
                          error.message.includes('unauthorized');

      // Update database with failed status
      await this.saveAuthState(cliType, false, {
        errorMessage: error.message,
        verifiedAt: new Date().toISOString(),
      });

      // Update in-memory cache
      this.authenticatedCLIs.set(cliType, {
        authenticated: false,
        errorMessage: error.message,
      });

      return {
        authenticated: false,
        error: error.message,
        isAuthError,
        responseTime,
      };
    }
  }

  /**
   * Verify all CLI authentications
   * @returns {Promise<Object>} Status for each CLI
   */
  async verifyAllAuthentications() {
    const results = {};
    for (const cliType of Object.keys(CLI_CONFIGS)) {
      results[cliType] = await this.verifyAuthentication(cliType);
    }
    return results;
  }

  /**
   * Get authentication status for all CLIs
   * @returns {Object}
   */
  getAuthStatus() {
    const status = {};
    for (const cliType of Object.keys(CLI_CONFIGS)) {
      const auth = this.authenticatedCLIs.get(cliType);
      const isAuth = this.isAuthenticated(cliType);

      // Determine auth method
      let authMethod = 'none';
      if (auth?.authenticated) {
        authMethod = 'oauth';
      } else if (cliType === 'claude' && process.env.ANTHROPIC_API_KEY) {
        authMethod = 'api_key';
      } else if (cliType === 'gemini' && (process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY)) {
        authMethod = 'api_key';
      } else if (cliType === 'opencode' && (process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.OPENROUTER_API_KEY)) {
        authMethod = 'api_key';
      }

      status[cliType] = {
        authenticated: isAuth,
        authMethod: authMethod,
        authenticatedAt: auth?.authenticatedAt || null,
        authenticatedBy: auth?.authenticatedBy || (authMethod === 'api_key' ? 'environment' : null),
        capabilities: auth?.capabilities || {},
        models: CLI_DEFAULT_MODELS[cliType] || [],
      };
    }
    return status;
  }

  /**
   * Get authentication status from database (for API)
   * @returns {Object}
   */
  getAuthStatusFromDB() {
    try {
      const db = getDatabase();
      const states = db.prepare(`
        SELECT cli_type, is_authenticated, authenticated_at, authenticated_by, capabilities, config, last_used_at, error_message
        FROM cli_auth_state
      `).all();

      const status = {};
      for (const cliType of Object.keys(CLI_CONFIGS)) {
        const state = states.find(s => s.cli_type === cliType);
        status[cliType] = {
          authenticated: state?.is_authenticated === 1,
          authenticatedAt: state?.authenticated_at || null,
          authenticatedBy: state?.authenticated_by || null,
          capabilities: state?.capabilities ? JSON.parse(state.capabilities) : {},
          config: state?.config ? JSON.parse(state.config) : {},
          lastUsedAt: state?.last_used_at || null,
          errorMessage: state?.error_message || null,
        };
      }
      return status;
    } catch (error) {
      logger.error('Error getting CLI auth status from DB:', error.message);
      return this.getAuthStatus();
    }
  }

  /**
   * Revoke authentication for a CLI
   * @param {string} cliType - CLI type
   */
  async revokeAuth(cliType) {
    this.authenticatedCLIs.delete(cliType);

    // Update database
    await this.saveAuthState(cliType, false, { error_message: 'Authentication revoked' });

    logger.info(`CLI ${cliType} authentication revoked`);
  }

  /**
   * Update last used timestamp
   * @param {string} cliType - CLI type
   */
  updateLastUsed(cliType) {
    try {
      const db = getDatabase();
      db.prepare(`
        UPDATE cli_auth_state SET last_used_at = datetime('now'), updated_at = datetime('now')
        WHERE cli_type = ?
      `).run(cliType);
    } catch (error) {
      logger.warn(`Error updating last used for ${cliType}:`, error.message);
    }
  }

  /**
   * Check if CLI tool is available in system
   * @param {string} cliType - CLI type
   * @returns {Promise<boolean>}
   */
  async isAvailable(cliType) {
    const config = CLI_CONFIGS[cliType];
    if (!config) return false;

    return new Promise((resolve) => {
      const spawnOpts = {
        shell: true,
        timeout: 5000,
        env: { ...process.env, HOME: process.env.CLI_HOME || '/home/cliuser' },
      };
      if (cliUserInfo) {
        spawnOpts.uid = cliUserInfo.uid;
        spawnOpts.gid = cliUserInfo.gid;
      }
      const proc = spawn(config.command, ['--version'], spawnOpts);

      proc.on('close', (code) => {
        resolve(code === 0);
      });

      proc.on('error', () => {
        resolve(false);
      });
    });
  }

  /**
   * Execute a task using CLI AI
   * @param {string} task - Task description
   * @param {Object} options - Execution options
   * @returns {Promise<Object>}
   */
  async execute(task, options = {}) {
    const {
      cliType = 'claude',
      workspaceId,
      userId,
      timeout,
      context = {},
    } = options;

    // Validate CLI type
    const config = CLI_CONFIGS[cliType];
    if (!config) {
      throw new Error(`Unknown CLI type: ${cliType}`);
    }

    // Check authentication
    if (!this.isAuthenticated(cliType)) {
      throw new Error(`CLI ${cliType} not authenticated. Superadmin must authenticate first.`);
    }

    // Get or create workspace
    const workspace = await this.getOrCreateWorkspace(userId, workspaceId, cliType);

    // Create execution record
    const executionId = uuidv4();
    const startTime = Date.now();

    // ── Pre-execution workspace snapshot (for 3-layer file detection) ──
    // Snapshot all files in workspace tree before CLI runs so we can detect new files afterward
    const fsSnap = require('fs');
    const workspaceSnapshot = new Set();
    const _snapshotDir = (dir) => {
      try {
        if (!fsSnap.existsSync(dir)) return;
        for (const entry of fsSnap.readdirSync(dir, { withFileTypes: true })) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isFile()) {
            workspaceSnapshot.add(fullPath);
          } else if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '.git') {
            _snapshotDir(fullPath); // recurse into subdirectories
          }
        }
      } catch (e) { /* best-effort snapshot */ }
    };
    _snapshotDir(workspace.path);

    try {
      // Build the command
      const command = this.buildCommand(task, cliType, workspace, context);

      // Execute in workspace context
      const result = await this.executeInWorkspace(
        command,
        workspace.path,
        cliType,
        timeout || config.timeout
      );

      // Record execution
      await this.recordExecution(executionId, {
        cliType,
        task,
        workspaceId: workspace.id,
        userId,
        status: EXECUTION_STATUS.COMPLETED,
        output: result.output,
        duration: Date.now() - startTime,
      });

      // Update last used timestamp
      this.updateLastUsed(cliType);

      // Parse structured output from CLIs that support --format json (e.g., opencode)
      const parsedContent = this._parseStructuredOutput(result.output, cliType);

      // ── 3-LAYER FILE DETECTION (adapted from WhatsBots FlowBuilder) ──
      // Layer 1: Parse [FILE_GENERATED: path] markers from stdout
      // Layer 2: Regex scan stdout for absolute workspace paths
      // Layer 3: Directory diff (new files not in pre-exec snapshot)
      let outputFiles = [];
      try {
        const fsDetect = require('fs');
        const detectedPaths = new Set();

        // LAYER 1: Parse [FILE_GENERATED: /path/to/file] markers from CLI output
        const FILE_MARKER_RE = /\[FILE_GENERATED:\s*([^\]]+)\]/g;
        let markerMatch;
        while ((markerMatch = FILE_MARKER_RE.exec(result.output)) !== null) {
          const markedPath = markerMatch[1].trim();
          if (fsDetect.existsSync(markedPath) && fsDetect.statSync(markedPath).isFile()) {
            detectedPaths.add(path.resolve(markedPath));
            logger.debug(`[CLIAIProvider] Layer1 [FILE_GENERATED] marker: ${markedPath}`);
          }
        }

        // LAYER 2: Regex scan stdout for absolute paths within workspace
        const escapedWs = workspace.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const PATH_RE = new RegExp(`(${escapedWs}[^\\s"'\\]\\)]+)`, 'g');
        let pathMatch;
        while ((pathMatch = PATH_RE.exec(result.output)) !== null) {
          const foundPath = pathMatch[1].trim().replace(/[.,;:]+$/, ''); // strip trailing punctuation
          try {
            if (fsDetect.existsSync(foundPath) && fsDetect.statSync(foundPath).isFile()) {
              detectedPaths.add(path.resolve(foundPath));
              logger.debug(`[CLIAIProvider] Layer2 path regex: ${foundPath}`);
            }
          } catch { /* skip invalid paths */ }
        }

        // LAYER 3: Directory diff — recursively find new files not in pre-exec snapshot
        const _scanDirRecursive = (dir) => {
          try {
            if (!fsDetect.existsSync(dir)) return;
            for (const entry of fsDetect.readdirSync(dir, { withFileTypes: true })) {
              const filePath = path.join(dir, entry.name);
              if (entry.name === 'media_input' || entry.name === 'node_modules' || entry.name === '.git') continue;
              if (entry.isDirectory()) {
                _scanDirRecursive(filePath); // recurse
                continue;
              }
              if (!entry.isFile()) continue;
              const resolvedPath = path.resolve(filePath);
              if (detectedPaths.has(resolvedPath)) continue; // already found by Layer 1/2
              try {
                const stats = fsDetect.statSync(filePath);
                if (!workspaceSnapshot.has(filePath) || stats.mtimeMs >= startTime) {
                  detectedPaths.add(resolvedPath);
                  logger.debug(`[CLIAIProvider] Layer3 dir-diff: ${entry.name}`);
                }
              } catch { /* skip */ }
            }
          } catch { /* scan dir not accessible */ }
        };
        _scanDirRecursive(workspace.path);

        // Build outputFiles array from all detected paths
        for (const filePath of detectedPaths) {
          try {
            const stats = fsDetect.statSync(filePath);
            const name = path.basename(filePath);
            const size = stats.size;
            outputFiles.push({
              name,
              size,
              sizeHuman: size < 1024 ? `${size}B` : size < 1048576 ? `${(size / 1024).toFixed(1)}KB` : `${(size / 1048576).toFixed(1)}MB`,
              fullPath: filePath,
            });
          } catch { /* skip */ }
        }

        if (outputFiles.length > 0) {
          const fileList = outputFiles.map(f => `${f.name} (${f.sizeHuman})`).join(', ');
          logger.info(`[CLIAIProvider] Detected ${outputFiles.length} output file(s) via 3-layer scan: ${fileList}`);
        }
      } catch (scanErr) {
        logger.debug(`[CLIAIProvider] File detection failed: ${scanErr.message}`);
      }

      return {
        executionId,
        content: parsedContent,
        cliType,
        workspace: workspace.path,
        duration: Date.now() - startTime,
        status: EXECUTION_STATUS.COMPLETED,
        provider: `cli-${cliType}`,
        outputFiles,
      };
    } catch (error) {
      // Record failed execution
      await this.recordExecution(executionId, {
        cliType,
        task,
        workspaceId: workspace?.id,
        userId,
        status: error.timeout ? EXECUTION_STATUS.TIMEOUT : EXECUTION_STATUS.FAILED,
        error: error.message,
        duration: Date.now() - startTime,
      });

      throw error;
    }
  }

  /**
   * Get or create workspace for execution
   * @param {string} userId - User ID
   * @param {string} workspaceId - Workspace ID (optional)
   * @param {string} cliType - CLI type
   * @returns {Promise<Object>}
   */
  async getOrCreateWorkspace(userId, workspaceId, cliType) {
    if (this.workspaceManager) {
      if (workspaceId) {
        // Try to get existing workspace; if not found, create with the same ID
        const existing = await this.workspaceManager.getWorkspace(workspaceId);
        if (existing) return existing;
        // Fall through to create — use provided workspaceId so callers get a consistent reference
      }
      return await this.workspaceManager.createWorkspace(userId, workspaceId || uuidv4(), cliType);
    }

    // Fallback: create simple workspace (no WorkspaceManager available)
    const wsId = workspaceId || uuidv4();
    const workspacePath = path.join(this.baseWorkspaceDir, userId || 'default', wsId);

    await fs.mkdir(workspacePath, { recursive: true });

    return {
      id: wsId,
      path: workspacePath,
      cliType,
    };
  }

  /**
   * Build CLI command from task
   * @param {string} task - Task description
   * @param {string} cliType - CLI type
   * @param {Object} workspace - Workspace info
   * @param {Object} context - Additional context
   * @returns {Object}
   */
  buildCommand(task, cliType, workspace, context = {}) {
    const config = CLI_CONFIGS[cliType];

    // Build prompt with context
    let prompt = task;

    if (context.systemPrompt) {
      prompt = `${context.systemPrompt}\n\n${task}`;
    }

    if (context.files && context.files.length > 0) {
      prompt += `\n\nRelevant files:\n${context.files.join('\n')}`;
    }

    // Build command based on CLI type
    // Note: prompt is passed as a proper argument (not shell-interpolated)
    // because executeInWorkspace uses shell: false
    // IMPORTANT: HOME must point to the CLI user's real home (e.g., /home/cliuser)
    // so CLI tools can find their auth credentials and config.
    // The workspace path is used as cwd (working directory) in executeInWorkspace.
    const cliHome = process.env.CLI_HOME || '/home/cliuser';
    switch (cliType) {
      case 'claude': {
        // args: ['--dangerously-skip-permissions', '-p', prompt, ...]
        const claudeArgs = [...config.args, prompt];
        // --model: allow specifying claude-sonnet-4-5, claude-opus-4, etc.
        if (context.model) {
          claudeArgs.push('--model', context.model);
        }
        // --add-dir: give Claude filesystem access to the workspace tree
        if (workspace && workspace.path) {
          claudeArgs.push('--add-dir', workspace.path);
        }
        // --max-turns: prevent Claude from iterating endlessly (10 turns is plenty for file generation)
        claudeArgs.push('--max-turns', '10');
        // --output-format: text for reliable stdout parsing
        claudeArgs.push('--output-format', 'text');
        return {
          command: config.command,
          args: claudeArgs,
          env: {
            ...process.env,
            HOME: cliHome,
          },
        };
      }

      case 'gemini': {
        // args: ['-p', prompt, '--yolo', ...]
        // -p <prompt>: non-interactive headless mode
        // --yolo AFTER prompt: auto-approve all tool calls (file creation, shell commands)
        const geminiArgs = [...config.args, prompt, '--yolo'];
        // --model: allow specifying gemini-2.5-pro, gemini-2.5-flash, etc.
        if (context.model) {
          geminiArgs.push('--model', context.model);
        }
        // --include-directories: give Gemini read access to workspace
        if (workspace && workspace.path) {
          geminiArgs.push('--include-directories', workspace.path);
        }
        // --output-format: text for reliable stdout parsing
        geminiArgs.push('--output-format', 'text');
        return {
          command: config.command,
          args: geminiArgs,
          env: {
            ...process.env,
            HOME: cliHome,
          },
        };
      }

      case 'opencode': {
        // OpenCode CLI: opencode run "prompt" --format json
        // Supports: --model, --provider, --file, --attach options
        const opencodeArgs = [...config.args, prompt];

        // Add format flag for structured output if available
        if (config.formatArgs) {
          opencodeArgs.push(...config.formatArgs);
        }

        // Add provider if specified in context (e.g., anthropic, openai, deepseek)
        if (context.provider) {
          opencodeArgs.push('--provider', context.provider);
        }

        // Add model if specified in context
        if (context.model) {
          opencodeArgs.push('--model', context.model);
        }

        // Add file attachments if specified
        if (context.attachFiles && Array.isArray(context.attachFiles)) {
          for (const file of context.attachFiles) {
            opencodeArgs.push('--file', file);
          }
        }

        // Add temperature if specified
        if (context.temperature !== undefined && context.temperature !== null) {
          opencodeArgs.push('--temperature', String(context.temperature));
        }

        return {
          command: config.command,
          args: opencodeArgs,
          env: {
            ...process.env,
            HOME: cliHome,
            // OpenCode config dir - use real home, not workspace
            OPENCODE_CONFIG_DIR: cliHome,
          },
        };
      }

      default:
        return {
          command: config.command,
          args: [prompt],
          env: process.env,
        };
    }
  }

  /**
   * Execute command in workspace
   * @param {Object} command - Command configuration
   * @param {string} cwd - Working directory
   * @param {string} cliType - CLI type
   * @param {number} timeout - Timeout in ms
   * @returns {Promise<Object>}
   */
  executeInWorkspace(command, cwd, cliType, timeout) {
    return new Promise((resolve, reject) => {
      const executionId = uuidv4();
      let output = '';
      let errorOutput = '';

      const spawnOpts = {
        cwd,
        env: command.env,
        shell: false,  // IMPORTANT: shell=false to avoid prompt text being interpreted as shell commands
        stdio: ['pipe', 'pipe', 'pipe'],
      };
      // Run as cliuser if available (Docker environment)
      if (cliUserInfo) {
        spawnOpts.uid = cliUserInfo.uid;
        spawnOpts.gid = cliUserInfo.gid;
      }
      const childProcess = spawn(command.command, command.args, spawnOpts);

      // Close stdin immediately (prompt is passed as argument)
      childProcess.stdin.end();

      // Track running execution
      this.runningExecutions.set(executionId, {
        process: childProcess,
        startTime: Date.now(),
        cli: cliType,
      });

      // Set timeout
      const timeoutId = setTimeout(() => {
        // Clean up runningExecutions BEFORE rejecting to prevent stale entries
        this.runningExecutions.delete(executionId);
        childProcess.kill('SIGTERM');
        setTimeout(() => {
          if (!childProcess.killed) {
            childProcess.kill('SIGKILL');
          }
        }, 5000);

        const error = new Error(`CLI execution timeout after ${timeout}ms`);
        error.timeout = true;
        reject(error);
      }, timeout);

      childProcess.stdout.on('data', (data) => {
        output += data.toString();
      });

      childProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      childProcess.on('close', (code) => {
        clearTimeout(timeoutId);
        this.runningExecutions.delete(executionId);

        if (code === 0) {
          const trimmedOutput = output.trim();

          // Sanitize CLI output: detect error patterns that should NOT be treated as valid AI responses
          const sanitized = this._sanitizeCLIOutput(trimmedOutput, cliType);
          if (sanitized.isError) {
            logger.warn(`[CLIAIProvider] CLI ${cliType} returned error content on stdout: ${sanitized.reason}`);
            reject(new Error(`CLI ${cliType} returned error output: ${sanitized.reason}`));
            return;
          }

          resolve({
            output: sanitized.cleanOutput,
            exitCode: code,
          });
        } else {
          reject(new Error(`CLI exited with code ${code}: ${errorOutput || output}`));
        }
      });

      childProcess.on('error', (error) => {
        clearTimeout(timeoutId);
        this.runningExecutions.delete(executionId);
        reject(error);
      });
    });
  }

  /**
   * Parse structured output from CLIs that support JSON format (e.g., opencode --format json).
   * OpenCode outputs NDJSON (newline-delimited JSON) with parts like:
   *   {"type":"step_start",...}
   *   {"type":"text","text":"Hello!"}
   *   {"type":"step_finish",...}
   * This method extracts the text content from the structured output.
   * For non-JSON output or other CLI types, returns the output as-is.
   * @private
   */
  _parseStructuredOutput(output, cliType) {
    if (!output || cliType !== 'opencode') {
      return output;
    }

    // Check if output looks like NDJSON (multiple JSON objects on separate lines)
    const lines = output.split('\n').filter(line => line.trim());
    const jsonLines = lines.filter(line => {
      const trimmed = line.trim();
      return trimmed.startsWith('{') && trimmed.endsWith('}');
    });

    // If less than half the lines are JSON, it's likely plain text output
    if (jsonLines.length < lines.length / 2) {
      return output;
    }

    // Parse all NDJSON events, extracting text and tool calls
    const textParts = [];
    const toolCalls = [];
    const toolResults = [];
    let finishReason = null;

    for (const line of jsonLines) {
      try {
        const parsed = JSON.parse(line);

        switch (parsed.type) {
          case 'text':
            // Direct text content: {"type":"text","part":{"text":"..."}} or {"type":"text","text":"..."}
            if (parsed.part?.text) textParts.push(parsed.part.text);
            else if (parsed.text) textParts.push(parsed.text);
            break;

          case 'text_delta':
          case 'content_block_delta':
            // Streaming text deltas
            if (parsed.delta?.text) textParts.push(parsed.delta.text);
            else if (parsed.text) textParts.push(parsed.text);
            break;

          case 'tool_use':
            // Tool call: {"type":"tool_use","part":{"name":"respond","input":{"message":"..."}}}
            if (parsed.part) {
              toolCalls.push(parsed.part);
              // If the tool is a respond-like action, extract its message content
              const input = parsed.part.input || parsed.part.arguments;
              if (input) {
                const msg = input.message || input.content || input.text || input.response;
                if (msg && typeof msg === 'string') {
                  textParts.push(msg);
                }
              }
            }
            break;

          case 'tool_result':
            // Tool execution result
            if (parsed.part?.content) {
              toolResults.push(parsed.part.content);
            } else if (parsed.result) {
              toolResults.push(typeof parsed.result === 'string' ? parsed.result : JSON.stringify(parsed.result));
            }
            break;

          case 'assistant':
          case 'message':
            // Full message event
            if (parsed.content) {
              const content = typeof parsed.content === 'string' ? parsed.content :
                Array.isArray(parsed.content) ? parsed.content.map(c => c.text || '').join('') : '';
              if (content) textParts.push(content);
            } else if (parsed.message) {
              textParts.push(typeof parsed.message === 'string' ? parsed.message : JSON.stringify(parsed.message));
            }
            break;

          case 'step_finish':
            if (parsed.finishReason) finishReason = parsed.finishReason;
            break;

          // step_start, message_start, message_stop are structural events - skip
        }
      } catch (e) {
        // Not valid JSON, skip
      }
    }

    if (textParts.length > 0) {
      logger.debug(`[CLIAIProvider] Parsed ${textParts.length} text parts from opencode NDJSON output (${toolCalls.length} tool calls)`);
      let combined = textParts.join('\n');

      // Fix double-escaped JSON from NDJSON wrapping:
      // When the AI generates {"action":"respond",...} inside a NDJSON text field,
      // it may come out as {\"action\":\"respond\",...} with literal backslash-quotes.
      // Detect this pattern and unescape so downstream parseToolCalls can parse it.
      if (combined.includes('\\"') && (combined.includes('"action"') || combined.includes('\\"action\\"'))) {
        const unescaped = combined
          .replace(/\\"/g, '"')
          .replace(/\\n/g, '\n')
          .replace(/\\t/g, '\t')
          .replace(/\\\\/g, '\\');
        // Verify the unescape didn't break things - check it still looks like a tool call
        if (unescaped.includes('"action"')) {
          logger.debug('[CLIAIProvider] Unescaped double-encoded JSON in NDJSON text output');
          combined = unescaped;
        }
      }

      return combined;
    }

    // No text content extracted, but we have valid NDJSON with tool results
    if (toolResults.length > 0) {
      logger.debug(`[CLIAIProvider] No text parts in NDJSON, but found ${toolResults.length} tool results`);
      return toolResults.join('\n');
    }

    // Valid NDJSON but no extractable text or tool results
    // Do NOT return raw NDJSON - it will be mistaken for error output
    logger.warn(`[CLIAIProvider] OpenCode NDJSON output had ${jsonLines.length} events but no extractable text content. Events: ${jsonLines.slice(0, 3).map(l => { try { return JSON.parse(l).type; } catch(e) { return '?'; }}).join(', ')}...`);
    return '';
  }

  /**
   * Sanitize CLI output to detect error patterns that should not be treated as valid AI responses.
   * Returns { isError: boolean, reason: string, cleanOutput: string }
   * @private
   */
  _sanitizeCLIOutput(output, cliType) {
    if (!output) {
      return { isError: true, reason: 'Empty output', cleanOutput: '' };
    }

    // Step 1: Strip known noise prefixes FIRST (migration text, progress indicators)
    // These are non-fatal - the real response may follow the noise
    let cleanOutput = output;
    const NOISE_PATTERNS = [
      /^Performing one time database migration.*?\n/gmi,
      /^sqlite-migration:done\n/gmi,
      /^Database migration complete\.\n/gmi,
      /^Migrating.*?\n/gmi,
      /^Loading.*?\n/gmi,
      /^\s*\[.*?]\s*$/gmi, // Progress bars like [====]
    ];
    for (const noisePattern of NOISE_PATTERNS) {
      cleanOutput = cleanOutput.replace(noisePattern, '');
    }
    cleanOutput = cleanOutput.trim();

    // If after stripping noise, nothing remains - it was only noise
    if (!cleanOutput) {
      return { isError: true, reason: 'Output was only noise/migration text', cleanOutput: '' };
    }

    // Step 2: Check error patterns on the cleaned output
    const ERROR_PATTERNS = [
      { pattern: /Insufficient credits/i, reason: 'API credits exhausted' },
      { pattern: /statusCode["']?\s*:\s*4[0-9]{2}/i, reason: 'HTTP error status in output' },
      { pattern: /"error"\s*:\s*\{/i, reason: 'JSON error object in output' },
      { pattern: /OPENROUTER PROCESSING/i, reason: 'Raw API processing output' },
      { pattern: /openrouter\.ai\/settings\/credits/i, reason: 'OpenRouter credits error' },
      { pattern: /rate_limit_exceeded/i, reason: 'Rate limit exceeded' },
      { pattern: /EACCES: permission denied/i, reason: 'Permission denied error' },
      { pattern: /ENOENT: no such file/i, reason: 'File not found error' },
      { pattern: /Error: connect ECONNREFUSED/i, reason: 'Connection refused' },
      { pattern: /UnhandledPromiseRejection/i, reason: 'Unhandled promise rejection' },
      { pattern: /at\s+\w+\s+\(.*\.(?:js|cjs|mjs|ts):\d+:\d+\)/i, reason: 'Stack trace in output' },
    ];

    for (const { pattern, reason } of ERROR_PATTERNS) {
      if (pattern.test(cleanOutput)) {
        return { isError: true, reason, cleanOutput: '' };
      }
    }

    // Step 3: If the cleaned output is mostly JSON with error fields, treat as error
    if (cleanOutput.startsWith('{') || cleanOutput.startsWith('[')) {
      try {
        const parsed = JSON.parse(cleanOutput);
        if (parsed.error || parsed.statusCode >= 400 || parsed.message?.includes('error')) {
          return { isError: true, reason: 'JSON error response', cleanOutput: '' };
        }
      } catch (e) { /* Not pure JSON - may be mixed content (e.g., NDJSON) */ }
    }

    return { isError: false, reason: '', cleanOutput };
  }

  /**
   * Cancel a running execution
   * @param {string} executionId - Execution ID
   * @returns {boolean}
   */
  cancelExecution(executionId) {
    const execution = this.runningExecutions.get(executionId);
    if (!execution) return false;

    execution.process.kill('SIGTERM');
    this.runningExecutions.delete(executionId);
    return true;
  }

  /**
   * Record execution to database
   * @param {string} executionId - Execution ID
   * @param {Object} data - Execution data
   */
  async recordExecution(executionId, data) {
    try {
      const db = getDatabase();

      db.prepare(`
        INSERT INTO cli_executions (
          id, cli_type, user_id, workspace_id, task, status,
          output, error, duration_ms, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(
        executionId,
        data.cliType,
        data.userId || null,
        data.workspaceId || null,
        data.task,
        data.status,
        data.output || null,
        data.error || null,
        data.duration
      );
    } catch (error) {
      logger.warn(`Failed to record CLI execution: ${error.message}`);
    }
  }

  /**
   * Get CLI configuration
   * @param {string} cliType - CLI type
   * @returns {Object|null}
   */
  getConfig(cliType) {
    return CLI_CONFIGS[cliType] || null;
  }

  /**
   * Get all supported CLIs
   * @returns {Object}
   */
  getSupportedCLIs() {
    return { ...CLI_CONFIGS };
  }

  /**
   * Get provider info
   * @returns {Object}
   */
  getInfo() {
    return {
      name: 'CLI AI Provider',
      type: 'cli',
      supportedCLIs: Object.keys(CLI_CONFIGS),
      authStatus: this.getAuthStatus(),
      runningExecutions: this.runningExecutions.size,
    };
  }

  /**
   * Chat interface (wrapper for execute)
   * @param {Array} messages - Chat messages
   * @param {Object} options - Options
   * @returns {Promise<Object>}
   */
  async chat(messages, options = {}) {
    // Extract system prompt
    const systemPrompt = messages.find(m => m.role === 'system')?.content;

    // Build full conversation as a single prompt for CLI
    // CLI providers are one-shot, so we serialize the full multi-turn conversation
    const nonSystemMessages = messages.filter(m => m.role !== 'system');

    let task;
    if (nonSystemMessages.length <= 1) {
      // Simple case: single user message
      task = nonSystemMessages[0]?.content || '';
    } else {
      // Multi-turn: serialize conversation history so CLI sees tool results
      const conversationParts = [];
      for (const msg of nonSystemMessages) {
        if (msg.role === 'user') {
          conversationParts.push(`[User]: ${msg.content}`);
        } else if (msg.role === 'assistant') {
          conversationParts.push(`[You (previous response)]: ${msg.content}`);
        }
      }
      task = conversationParts.join('\n\n');
    }

    const context = { systemPrompt };

    const result = await this.execute(task, {
      ...options,
      context,
    });

    return {
      content: result.content,
      model: result.cliType,
      provider: result.provider,
      usage: {
        promptTokens: 0, // CLI doesn't provide token counts
        completionTokens: 0,
        totalTokens: 0,
      },
      outputFiles: result.outputFiles || [],
    };
  }
}

// Singleton instance
let cliAIProviderInstance = null;

function getCLIAIProvider(config = {}) {
  if (!cliAIProviderInstance) {
    cliAIProviderInstance = new CLIAIProvider(config);
  }
  return cliAIProviderInstance;
}

module.exports = {
  CLIAIProvider,
  getCLIAIProvider,
  CLI_CONFIGS,
  CLI_DEFAULT_MODELS,
  CLI_DISPLAY_NAMES,
  EXECUTION_STATUS,
};
