/**
 * CLI Authentication Manager
 *
 * Manages superadmin authentication for CLI AI tools.
 * Creates terminal sessions for authentication and tracks auth status.
 */

const { v4: uuidv4 } = require('uuid');
const { logger } = require('../logger.cjs');
const { getDatabase } = require('../database.cjs');
const { getCLIAIProvider, CLI_CONFIGS } = require('./providers/CLIAIProvider.cjs');

/**
 * Auth session states
 */
const AUTH_STATES = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  FAILED: 'failed',
  EXPIRED: 'expired',
};

/**
 * CLI types that can be authenticated
 */
const CLI_TYPES = ['claude', 'gemini', 'opencode'];

class CLIAuthManager {
  constructor(options = {}) {
    this.terminalService = null; // Injected
    this.cliProvider = getCLIAIProvider();
    this.authSessions = new Map(); // sessionId -> session info
    this.sessionTimeout = options.sessionTimeout || 300000; // 5 minutes to complete auth
  }

  /**
   * Set terminal service
   * @param {Object} terminalService - TerminalService instance
   */
  setTerminalService(terminalService) {
    this.terminalService = terminalService;
  }

  /**
   * Start an authentication session for a CLI
   * @param {string} cliType - CLI type ('claude', 'gemini', 'opencode')
   * @param {string} userId - User ID (must be superadmin)
   * @returns {Promise<Object>} Session info
   */
  async startAuthSession(cliType, userId) {
    // Validate CLI type
    if (!CLI_TYPES.includes(cliType)) {
      throw new Error(`Invalid CLI type: ${cliType}. Must be one of: ${CLI_TYPES.join(', ')}`);
    }

    // Check if user is superadmin
    const db = getDatabase();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);

    if (!user || (user.role !== 'admin' && !user.is_superuser)) {
      throw new Error('Only superadmin can authenticate CLI tools');
    }

    // Create auth session
    const sessionId = uuidv4();
    const terminalSessionId = null; // Will be set when terminal is created

    const session = {
      id: sessionId,
      cliType,
      userId,
      terminalSessionId,
      status: AUTH_STATES.PENDING,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + this.sessionTimeout).toISOString(),
    };

    // Store session
    this.authSessions.set(sessionId, session);

    // Save to database
    this.saveSessionToDb(session);

    // Get CLI config for instructions
    const cliConfig = CLI_CONFIGS[cliType];

    logger.info(`CLI auth session started for ${cliType} by user ${userId}`);

    return {
      sessionId,
      cliType,
      status: AUTH_STATES.PENDING,
      expiresAt: session.expiresAt,
      instructions: this.getAuthInstructions(cliType),
      command: cliConfig.command,
    };
  }

  /**
   * Get authentication instructions for a CLI
   * @param {string} cliType - CLI type
   * @returns {string}
   */
  getAuthInstructions(cliType) {
    const instructions = {
      claude: `
# Claude CLI Authentication

1. Open the terminal session
2. Run: claude auth login
3. Follow the browser prompts to authenticate
4. Once complete, click "Complete Authentication" button
      `,
      gemini: `
# Gemini CLI Authentication

1. Open the terminal session
2. Run: gemini auth login
3. Follow the prompts to authenticate with your Google account
4. Once complete, click "Complete Authentication" button
      `,
      opencode: `
# OpenCode CLI Authentication

OpenCode supports multiple AI providers. You can configure one or more:

1. Open the terminal session
2. Run: opencode auth login
3. This will open a browser to configure your provider API keys
4. Alternatively, set environment variables or create a .env file:
   - OPENAI_API_KEY for OpenAI/GPT models
   - ANTHROPIC_API_KEY for Claude models
   - GOOGLE_API_KEY for Gemini models
   - Or other provider keys as needed
5. Run: opencode auth list - to verify authenticated providers
6. Once complete, click "Complete Authentication" button

Note: Credentials are stored at ~/.local/share/opencode/auth.json
      `,
    };

    return instructions[cliType] || 'Follow the CLI authentication prompts';
  }

  /**
   * Create terminal session for authentication
   * @param {string} sessionId - Auth session ID
   * @returns {Promise<Object>} Terminal session info
   */
  async createTerminalSession(sessionId) {
    const session = this.authSessions.get(sessionId);
    if (!session) {
      throw new Error('Auth session not found');
    }

    if (session.status !== AUTH_STATES.PENDING) {
      throw new Error(`Session is ${session.status}, cannot create terminal`);
    }

    if (!this.terminalService) {
      throw new Error('Terminal service not available');
    }

    // Create terminal session
    // terminalService.createSession expects (userId, terminalType, options)
    const terminalSession = this.terminalService.createSession(
      session.userId,
      session.cliType, // 'claude', 'gemini', or 'opencode'
      {
        metadata: {
          authSessionId: sessionId,
          cliType: session.cliType,
        },
      }
    );

    // Update session
    session.terminalSessionId = terminalSession.id;
    session.status = AUTH_STATES.IN_PROGRESS;
    this.authSessions.set(sessionId, session);
    this.updateSessionInDb(session);

    logger.info(`Terminal session ${terminalSession.id} created for CLI auth ${sessionId}`);

    return {
      sessionId,
      terminalSessionId: terminalSession.id,
      status: AUTH_STATES.IN_PROGRESS,
    };
  }

  /**
   * Complete authentication for a CLI
   * @param {string} sessionId - Auth session ID
   * @returns {Promise<Object>}
   */
  async completeAuth(sessionId) {
    const session = this.authSessions.get(sessionId);
    if (!session) {
      throw new Error('Auth session not found');
    }

    if (session.status === AUTH_STATES.COMPLETED) {
      return { success: true, message: 'Already authenticated' };
    }

    if (session.status !== AUTH_STATES.IN_PROGRESS && session.status !== AUTH_STATES.PENDING) {
      throw new Error(`Cannot complete auth: session is ${session.status}`);
    }

    // Check if session expired
    if (new Date(session.expiresAt) < new Date()) {
      session.status = AUTH_STATES.EXPIRED;
      this.authSessions.set(sessionId, session);
      this.updateSessionInDb(session);
      throw new Error('Auth session expired');
    }

    // Verify CLI is actually authenticated (optional verification)
    // For now, we trust the user clicked complete after authenticating

    // Update session status
    session.status = AUTH_STATES.COMPLETED;
    session.completedAt = new Date().toISOString();
    this.authSessions.set(sessionId, session);
    this.updateSessionInDb(session);

    // Notify CLI provider
    this.cliProvider.authenticate(session.cliType, session.terminalSessionId);

    logger.info(`CLI ${session.cliType} authentication completed`);

    return {
      success: true,
      cliType: session.cliType,
      message: `${session.cliType} CLI authenticated successfully`,
    };
  }

  /**
   * Fail authentication session
   * @param {string} sessionId - Auth session ID
   * @param {string} reason - Failure reason
   */
  async failAuth(sessionId, reason = 'Authentication failed') {
    const session = this.authSessions.get(sessionId);
    if (!session) return;

    session.status = AUTH_STATES.FAILED;
    session.failedAt = new Date().toISOString();
    session.failureReason = reason;
    this.authSessions.set(sessionId, session);
    this.updateSessionInDb(session);

    logger.warn(`CLI auth session ${sessionId} failed: ${reason}`);
  }

  /**
   * Get authentication status for all CLIs
   * @returns {Object}
   */
  getAuthStatus() {
    const status = {};

    for (const cliType of CLI_TYPES) {
      const providerAuth = this.cliProvider.getAuthStatus()[cliType];
      status[cliType] = {
        authenticated: providerAuth?.authenticated || false,
        authenticatedAt: providerAuth?.authenticatedAt || null,
        config: CLI_CONFIGS[cliType] || null,
      };
    }

    return status;
  }

  /**
   * Get session status
   * @param {string} sessionId - Session ID
   * @returns {Object|null}
   */
  getSessionStatus(sessionId) {
    return this.authSessions.get(sessionId) || null;
  }

  /**
   * Get pending sessions for a user
   * @param {string} userId - User ID
   * @returns {Object[]}
   */
  getPendingSessions(userId) {
    const sessions = [];

    for (const session of this.authSessions.values()) {
      if (
        session.userId === userId &&
        (session.status === AUTH_STATES.PENDING || session.status === AUTH_STATES.IN_PROGRESS)
      ) {
        sessions.push(session);
      }
    }

    return sessions;
  }

  /**
   * Revoke CLI authentication
   * @param {string} cliType - CLI type
   * @param {string} userId - User ID (must be superadmin)
   */
  async revokeAuth(cliType, userId) {
    // Check if user is superadmin
    const db = getDatabase();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);

    if (!user || (user.role !== 'admin' && !user.is_superuser)) {
      throw new Error('Only superadmin can revoke CLI authentication');
    }

    // Revoke in CLI provider
    this.cliProvider.revokeAuth(cliType);

    // Update database
    db.prepare(`
      UPDATE cli_auth_sessions
      SET status = 'revoked', updated_at = datetime('now')
      WHERE cli_type = ? AND status = 'completed'
    `).run(cliType);

    logger.info(`CLI ${cliType} authentication revoked by user ${userId}`);

    return { success: true, cliType, message: `${cliType} authentication revoked` };
  }

  /**
   * Clean up expired sessions
   */
  cleanupExpiredSessions() {
    const now = new Date();

    for (const [sessionId, session] of this.authSessions.entries()) {
      if (
        new Date(session.expiresAt) < now &&
        session.status !== AUTH_STATES.COMPLETED &&
        session.status !== AUTH_STATES.FAILED
      ) {
        session.status = AUTH_STATES.EXPIRED;
        this.authSessions.set(sessionId, session);
        this.updateSessionInDb(session);
      }
    }
  }

  /**
   * Save session to database
   * @param {Object} session - Session object
   */
  saveSessionToDb(session) {
    try {
      const db = getDatabase();

      db.prepare(`
        INSERT INTO cli_auth_sessions (
          id, cli_type, user_id, terminal_session_id, status,
          created_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        session.id,
        session.cliType,
        session.userId,
        session.terminalSessionId,
        session.status,
        session.createdAt,
        session.expiresAt
      );
    } catch (error) {
      // Table may not exist yet
      logger.debug(`Could not save auth session to DB: ${error.message}`);
    }
  }

  /**
   * Update session in database
   * @param {Object} session - Session object
   */
  updateSessionInDb(session) {
    try {
      const db = getDatabase();

      db.prepare(`
        UPDATE cli_auth_sessions
        SET terminal_session_id = ?, status = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(
        session.terminalSessionId,
        session.status,
        session.id
      );
    } catch (error) {
      logger.debug(`Could not update auth session in DB: ${error.message}`);
    }
  }

  /**
   * Load authenticated sessions from database on startup
   */
  async loadAuthenticatedSessions() {
    try {
      const db = getDatabase();

      const sessions = db.prepare(`
        SELECT * FROM cli_auth_sessions
        WHERE status = 'completed'
        AND datetime(expires_at) > datetime('now')
        ORDER BY created_at DESC
      `).all();

      for (const session of sessions) {
        // Only restore the most recent for each CLI type
        if (!this.cliProvider.isAuthenticated(session.cli_type)) {
          this.cliProvider.authenticate(session.cli_type, session.terminal_session_id);
          logger.info(`Restored CLI ${session.cli_type} authentication from database`);
        }
      }
    } catch (error) {
      logger.debug(`Could not load auth sessions from DB: ${error.message}`);
    }
  }

  /**
   * Start periodic cleanup of expired sessions
   */
  startCleanupTask() {
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions();
    }, 60000); // Every minute
  }

  /**
   * Stop cleanup task
   */
  stopCleanupTask() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

// Singleton instance
let cliAuthManagerInstance = null;

function getCLIAuthManager(options = {}) {
  if (!cliAuthManagerInstance) {
    cliAuthManagerInstance = new CLIAuthManager(options);
  }
  return cliAuthManagerInstance;
}

module.exports = {
  CLIAuthManager,
  getCLIAuthManager,
  AUTH_STATES,
  CLI_TYPES,
};
