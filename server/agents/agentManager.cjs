/**
 * Agent Manager
 * Manages multiple platform client instances (WhatsApp, Email)
 * WhatsBots-style multi-agent architecture
 */

const EventEmitter = require('events');
const { WhatsAppClient } = require('../platforms/whatsappClient.cjs');
const { EmailClient } = require('../platforms/emailClient.cjs');
const { TelegramBotClient } = require('../platforms/telegramBotClient.cjs');
const { getDatabase } = require('../services/database.cjs');
const { logger } = require('../services/logger.cjs');
const crypto = require('crypto');

// Encryption key for credentials
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');

/**
 * Encrypt sensitive data
 */
function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const key = Buffer.from(ENCRYPTION_KEY, 'hex');
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

/**
 * Decrypt sensitive data
 */
function decrypt(text) {
  const parts = text.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const encryptedText = parts[1];
  const key = Buffer.from(ENCRYPTION_KEY, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/**
 * Agent Manager Class
 * Singleton pattern - manages all platform clients
 */
class AgentManager extends EventEmitter {
  constructor() {
    super();

    // Map of accountId -> client instance
    this.clients = new Map();

    // Map of agentId -> accountIds
    this.agentAccounts = new Map();
  }

  /**
   * Get singleton instance
   */
  static getInstance() {
    if (!AgentManager.instance) {
      AgentManager.instance = new AgentManager();
    }
    return AgentManager.instance;
  }

  /**
   * Initialize the agent manager
   */
  async initialize() {
    logger.info('Agent Manager initialized');
  }

  /**
   * Create a new platform account or return existing one
   * Prevents duplicate platform accounts for the same agent + platform
   */
  async createAccount(userId, agentId, platform, credentials = {}) {
    const db = getDatabase();
    const { v4: uuidv4 } = require('uuid');

    // Check if agent already has an account for this platform
    if (agentId) {
      const existing = db.prepare(`
        SELECT id FROM platform_accounts
        WHERE agent_id = ? AND platform = ?
      `).get(agentId, platform);

      if (existing) {
        logger.info(`Agent ${agentId} already has ${platform} account ${existing.id}, returning existing`);
        return { accountId: existing.id, platform, existing: true };
      }
    }

    const accountId = uuidv4();

    // Encrypt credentials if provided
    const encryptedCredentials = Object.keys(credentials).length > 0
      ? encrypt(JSON.stringify(credentials))
      : null;

    db.prepare(`
      INSERT INTO platform_accounts (id, user_id, agent_id, platform, credentials_encrypted)
      VALUES (?, ?, ?, ?, ?)
    `).run(accountId, userId, agentId, platform, encryptedCredentials);

    logger.info(`Created platform account: ${platform} for agent ${agentId}`);

    // For Agentic AI platform, also create an agentic_profile linked to this agent
    if (platform === 'agentic-ai' && agentId) {
      try {
        const agent = db.prepare('SELECT name, description FROM agents WHERE id = ?').get(agentId);
        if (agent) {
          const profileId = uuidv4();
          db.prepare(`
            INSERT INTO agentic_profiles (
              id, user_id, agent_id, name, role, description,
              agent_type, hierarchy_level, hierarchy_path, status
            )
            VALUES (?, ?, ?, ?, ?, ?, 'master', 0, ?, 'inactive')
          `).run(
            profileId,
            userId,
            agentId,
            agent.name,
            'Agentic AI Agent',  // Default role
            agent.description || 'Autonomous AI agent',
            `/${profileId}`
          );
          logger.info(`Created agentic_profile ${profileId} for Agentic AI agent ${agentId}`);
        }
      } catch (profileError) {
        logger.error(`Failed to create agentic_profile for agent ${agentId}: ${profileError.message}`);
        // Don't fail the platform account creation if profile creation fails
      }
    }

    return { accountId, platform };
  }

  /**
   * Connect a platform account
   */
  async connect(accountId, options = {}) {
    const db = getDatabase();

    const account = db.prepare(`
      SELECT id, platform, credentials_encrypted, agent_id
      FROM platform_accounts
      WHERE id = ?
    `).get(accountId);

    if (!account) {
      throw new Error(`Account not found: ${accountId}`);
    }

    // Check if already connected
    if (this.clients.has(accountId)) {
      logger.warn(`Account ${accountId} already connected, reconnecting...`);
      await this.disconnect(accountId);
    }

    // Create appropriate client
    let client;

    switch (account.platform) {
      case 'whatsapp':
        client = new WhatsAppClient(accountId);
        break;

      case 'email':
        if (!account.credentials_encrypted) {
          throw new Error('Email credentials required');
        }
        const emailConfig = JSON.parse(decrypt(account.credentials_encrypted));
        client = new EmailClient(accountId, emailConfig);
        break;

      case 'telegram-bot':
        if (!account.credentials_encrypted) {
          throw new Error('Telegram bot token required');
        }
        const telegramConfig = JSON.parse(decrypt(account.credentials_encrypted));
        client = new TelegramBotClient(accountId, telegramConfig);
        break;

      case 'telegram-user':
        if (!account.credentials_encrypted) {
          throw new Error('Telegram API credentials required (apiId, apiHash)');
        }
        const { TelegramUserClient } = require('../platforms/telegramUserClient.cjs');
        const telegramUserConfig = JSON.parse(decrypt(account.credentials_encrypted));
        client = new TelegramUserClient(accountId, telegramUserConfig);
        break;

      default:
        throw new Error(`Unsupported platform: ${account.platform}`);
    }

    // Setup event handlers
    this.setupClientEvents(client, account.agent_id);

    // Store client in map BEFORE connecting so auth endpoints can find it
    // during interactive auth flows (Telegram User needs /auth/code, /auth/password)
    this.clients.set(accountId, client);

    // Track agent -> accounts mapping
    if (account.agent_id) {
      if (!this.agentAccounts.has(account.agent_id)) {
        this.agentAccounts.set(account.agent_id, []);
      }
      this.agentAccounts.get(account.agent_id).push(accountId);
    }

    try {
      await client.connect(options);
    } catch (err) {
      // Connect failed — clean up the map entry and the client
      this.clients.delete(accountId);
      if (account.agent_id) {
        const accts = this.agentAccounts.get(account.agent_id);
        if (accts) {
          const idx = accts.indexOf(accountId);
          if (idx > -1) accts.splice(idx, 1);
        }
      }
      try { await client.disconnect(); } catch (_) {}
      throw err;
    }

    return client;
  }

  /**
   * Disconnect a platform account
   */
  async disconnect(accountId) {
    const client = this.clients.get(accountId);
    if (!client) {
      return;
    }

    await client.disconnect();
    this.clients.delete(accountId);

    // Update agent mapping
    this.agentAccounts.forEach((accounts, agentId) => {
      const index = accounts.indexOf(accountId);
      if (index > -1) {
        accounts.splice(index, 1);
      }
    });

    logger.info(`Disconnected account: ${accountId}`);
  }

  /**
   * Disconnect all clients
   * @param {boolean} graceful - If true, attempt graceful shutdown
   */
  async disconnectAll(graceful = false) {
    const promises = [];

    logger.info(`Disconnecting all clients (graceful: ${graceful})...`);

    this.clients.forEach((client, accountId) => {
      // Pass graceful flag to client if it supports it
      if (graceful && typeof client.disconnect === 'function') {
        promises.push(
          client.disconnect(true).catch(err => {
            logger.warn(`Graceful disconnect failed for ${accountId}: ${err.message}`);
          })
        );
      } else {
        promises.push(this.disconnect(accountId));
      }
    });

    // Give up to 10 seconds for graceful shutdown
    if (graceful) {
      const timeout = new Promise(resolve => setTimeout(resolve, 10000));
      await Promise.race([Promise.allSettled(promises), timeout]);
    } else {
      await Promise.all(promises);
    }

    this.clients.clear();
    logger.info('All clients disconnected');
  }

  /**
   * Reconnect active agents on startup
   */
  async reconnectActiveAgents() {
    const db = getDatabase();
    const fs = require('fs');
    const path = require('path');

    // Cleanup orphaned platform_accounts (where agent no longer exists)
    const orphanedAccounts = db.prepare(`
      DELETE FROM platform_accounts
      WHERE agent_id NOT IN (SELECT id FROM agents)
    `).run();

    if (orphanedAccounts.changes > 0) {
      logger.info(`Cleaned up ${orphanedAccounts.changes} orphaned platform account(s)`);
    }

    // Auto-reset: Change 'error' or stale 'connecting' status to 'disconnected' so they can be reconnected
    // This prevents accounts from being stuck in error/connecting state after crashes or transient failures
    const staleAccounts = db.prepare(`
      UPDATE platform_accounts
      SET status = 'disconnected', updated_at = datetime('now')
      WHERE status IN ('error', 'connecting')
    `).run();

    if (staleAccounts.changes > 0) {
      logger.info(`Auto-reset ${staleAccounts.changes} account(s) from 'error'/'connecting' to 'disconnected'`);
    }

    // Query accounts that should be reconnected:
    // - WhatsApp: any non-error status (uses session files, not credentials)
    // - Other platforms: require credentials
    // - Only accounts with valid agents (non-draft or completed draft)
    const accounts = db.prepare(`
      SELECT pa.id, pa.platform, pa.status, a.name as agent_name
      FROM platform_accounts pa
      JOIN agents a ON pa.agent_id = a.id
      WHERE (
        (pa.platform = 'whatsapp' AND pa.status IN ('connected', 'disconnected', 'qr_pending'))
        OR
        (pa.platform != 'whatsapp' AND pa.status IN ('connected', 'disconnected') AND pa.credentials_encrypted IS NOT NULL)
      )
    `).all();

    logger.info(`Found ${accounts.length} accounts to reconnect`);

    let reconnected = 0;
    let failed = 0;
    let skipped = 0;

    for (const account of accounts) {
      try {
        // For WhatsApp, check if session exists (LocalAuth stores in session-{clientId} folder)
        if (account.platform === 'whatsapp') {
          const sessionPath = path.join(
            __dirname, '..', 'data', 'whatsapp-sessions',
            `session-${account.id}`
          );

          if (!fs.existsSync(sessionPath)) {
            logger.info(`Skipping ${account.platform}:${account.id.substring(0, 8)} - no session folder`);
            skipped++;
            continue;
          }

          logger.info(`Found WhatsApp session for "${account.agent_name}" (${account.id.substring(0, 8)}), reconnecting...`);
        }

        if (account.platform === 'telegram-bot') {
          logger.info(`Reconnecting Telegram Bot "${account.agent_name}" (${account.id.substring(0, 8)})...`);
        }

        if (account.platform === 'telegram-user') {
          logger.info(`Reconnecting Telegram User "${account.agent_name}" (${account.id.substring(0, 8)}) via saved session...`);
        }

        await this.connect(account.id, { autoReconnect: true });
        reconnected++;
      } catch (error) {
        logger.error(`Failed to reconnect ${account.platform}:"${account.agent_name}" (${account.id.substring(0, 8)}) - ${error.message}`);
        failed++;
      }
    }

    logger.info(`Reconnection complete: ${reconnected} success, ${failed} failed, ${skipped} skipped`);
  }

  /**
   * Get client by account ID
   */
  getClient(accountId) {
    return this.clients.get(accountId);
  }

  /**
   * Get all clients for an agent
   */
  getAgentClients(agentId) {
    const accountIds = this.agentAccounts.get(agentId) || [];
    return accountIds.map(id => this.clients.get(id)).filter(Boolean);
  }

  /**
   * Get status of an account
   */
  getAccountStatus(accountId) {
    const client = this.clients.get(accountId);
    return client ? client.getStatus() : 'disconnected';
  }

  /**
   * Get all connected accounts
   */
  getConnectedAccounts() {
    const accounts = [];

    this.clients.forEach((client, accountId) => {
      accounts.push({
        accountId,
        platform: client.constructor.name.replace('Client', '').toLowerCase(),
        status: client.getStatus()
      });
    });

    return accounts;
  }

  /**
   * Setup event handlers for a client
   */
  setupClientEvents(client, agentId) {
    // Forward message events
    client.on('message', (message) => {
      this.emit('message', {
        ...message,
        agentId,
        accountId: client.accountId
      });
    });

    // Forward status changes
    client.on('status_change', (status, oldStatus) => {
      this.emit('status_change', {
        accountId: client.accountId,
        agentId,
        status,
        oldStatus
      });
    });

    // Forward errors
    client.on('error', (error) => {
      this.emit('error', {
        accountId: client.accountId,
        agentId,
        error
      });
    });

    // Forward QR events (WhatsApp)
    client.on('qr', (data) => {
      this.emit('qr', {
        accountId: client.accountId,
        agentId,
        ...data
      });
    });
  }

  /**
   * Send typing indicator through appropriate client
   */
  async sendTyping(accountId, to, durationMs = 1500) {
    const client = this.clients.get(accountId);
    if (!client) return;

    if (client instanceof WhatsAppClient && client.sendTyping) {
      await client.sendTyping(to, durationMs);
    }

    // Telegram Bot: send typing action via Bot API
    if (client instanceof TelegramBotClient && client.sendChatAction) {
      try {
        await client.sendChatAction(to, 'typing');
      } catch (e) { /* non-critical */ }
    }

    // Telegram User: send typing action via gramjs MTProto
    const { TelegramUserClient } = require('../platforms/telegramUserClient.cjs');
    if (client instanceof TelegramUserClient && client.sendChatAction) {
      try {
        await client.sendChatAction(to, 'typing');
      } catch (e) { /* non-critical */ }
    }
  }

  /**
   * Send message through appropriate client
   */
  async sendMessage(accountId, to, content, options = {}) {
    const client = this.clients.get(accountId);
    if (!client) {
      throw new Error(`Account not connected: ${accountId}`);
    }

    if (client instanceof WhatsAppClient) {
      if (options.media) {
        return client.sendMedia(to, options.media, content, options);
      }
      return client.sendMessage(to, content, options);
    }

    if (client instanceof EmailClient) {
      return client.sendEmail(to, options.subject || 'No Subject', content, options);
    }

    if (client instanceof TelegramBotClient) {
      if (options.media) {
        return client.sendMedia(to, options.mediaType || 'document', options.media, {
          ...options,
          caption: content
        });
      }
      return client.sendMessage(to, content, options);
    }

    // For TelegramUserClient and others
    if (client.sendMessage) {
      return client.sendMessage(to, content, options);
    }

    throw new Error(`Unknown client type for account: ${accountId}`);
  }

  /**
   * Update email credentials
   */
  async updateEmailCredentials(accountId, credentials) {
    const db = getDatabase();

    const encryptedCredentials = encrypt(JSON.stringify(credentials));

    db.prepare(`
      UPDATE platform_accounts
      SET credentials_encrypted = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(encryptedCredentials, accountId);

    logger.info(`Updated credentials for account: ${accountId}`);
  }
}

// Export singleton instance getter
module.exports = {
  AgentManager,
  encrypt,
  decrypt
};
