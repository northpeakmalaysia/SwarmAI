/**
 * Platform Routes
 * Connect and manage platform accounts (WhatsApp, Email)
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('../services/database.cjs');
const { logger } = require('../services/logger.cjs');
const { authenticate } = require('./auth.cjs');
const { AgentManager, encrypt } = require('../agents/agentManager.cjs');
const { createPagination } = require('../utils/responseHelpers.cjs');
const redisService = require('../services/redis.cjs');

const router = express.Router();

// Apply authentication to all routes
router.use(authenticate);

/**
 * Transform platform account from database to API format
 */
function transformPlatformAccount(acc) {
  if (!acc) return null;
  return {
    id: acc.id,
    platform: acc.platform,
    status: acc.status,
    agentId: acc.agent_id,
    agentName: acc.agent_name,
    metadata: acc.connection_metadata ? JSON.parse(acc.connection_metadata) : null,
    lastConnectedAt: acc.last_connected_at,
    lastError: acc.last_error,
    errorCount: acc.error_count,
    createdAt: acc.created_at,
    updatedAt: acc.updated_at
  };
}

/**
 * GET /api/platforms
 * List all platform accounts for the current user
 */
router.get('/', (req, res) => {
  try {
    const db = getDatabase();
    const { platform, limit = 50, offset = 0 } = req.query;

    // Count query for pagination
    let countQuery = 'SELECT COUNT(*) as count FROM platform_accounts WHERE user_id = ?';
    const countParams = [req.user.id];
    if (platform) {
      countQuery += ' AND platform = ?';
      countParams.push(platform);
    }
    const totalCount = db.prepare(countQuery).get(...countParams).count;

    let query = `
      SELECT
        pa.id,
        pa.platform,
        pa.status,
        pa.agent_id,
        pa.connection_metadata,
        pa.last_connected_at,
        pa.last_error,
        pa.error_count,
        pa.created_at,
        pa.updated_at,
        a.name as agent_name
      FROM platform_accounts pa
      LEFT JOIN agents a ON pa.agent_id = a.id
      WHERE pa.user_id = ?
    `;
    const params = [req.user.id];

    if (platform) {
      query += ' AND pa.platform = ?';
      params.push(platform);
    }

    query += ' ORDER BY pa.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const accounts = db.prepare(query).all(...params);
    const transformed = accounts.map(transformPlatformAccount);

    res.json({
      accounts: transformed,
      pagination: createPagination(transformed, {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: totalCount
      })
    });

  } catch (error) {
    logger.error(`Failed to list platform accounts: ${error.message}`);
    res.status(500).json({ error: 'Failed to list platform accounts' });
  }
});

// ============================================
// Phase 3a: Platform Health Endpoints
// (MUST be before /:id routes to avoid param capture)
// ============================================

/**
 * GET /api/platforms/health
 * Get health summary for all platform accounts
 */
router.get('/health', (req, res) => {
  try {
    const { getChannelHealthMonitor } = require('../services/ChannelHealthMonitor.cjs');
    const monitor = getChannelHealthMonitor();
    const summary = monitor.getHealthSummary(req.user.id);
    res.json(summary);
  } catch (error) {
    logger.error(`Failed to get health summary: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/platforms/health/accounts
 * Get detailed health for all platform accounts
 */
router.get('/health/accounts', (req, res) => {
  try {
    const { getChannelHealthMonitor } = require('../services/ChannelHealthMonitor.cjs');
    const monitor = getChannelHealthMonitor();
    const accounts = monitor.getAllHealth(req.user.id);
    res.json({ accounts });
  } catch (error) {
    logger.error(`Failed to get account health: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/platforms/health/:accountId
 * Get health for a specific platform account
 */
router.get('/health/:accountId', (req, res) => {
  try {
    const { getChannelHealthMonitor } = require('../services/ChannelHealthMonitor.cjs');
    const monitor = getChannelHealthMonitor();
    const health = monitor.getAccountHealth(req.params.accountId, req.user.id);
    if (!health) {
      return res.status(404).json({ error: 'Account not found or no health data' });
    }
    res.json(health);
  } catch (error) {
    logger.error(`Failed to get account health: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/platforms/health/:accountId/events
 * Get recent connection events for a platform account
 */
router.get('/health/:accountId/events', (req, res) => {
  try {
    const { getChannelHealthMonitor } = require('../services/ChannelHealthMonitor.cjs');
    const monitor = getChannelHealthMonitor();
    const limit = parseInt(req.query.limit) || 50;
    const events = monitor.getAccountEvents(req.params.accountId, Math.min(limit, 200), req.user.id);
    res.json({ events });
  } catch (error) {
    logger.error(`Failed to get account events: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/platforms/whatsapp
 * Create or reconnect a WhatsApp account
 * If agent already has a WhatsApp account, reconnect it instead of creating a new one
 */
router.post('/whatsapp', async (req, res) => {
  try {
    const { agentId } = req.body;

    const db = getDatabase();

    // Verify agent ownership if agentId provided
    if (agentId) {
      const agent = db.prepare('SELECT id FROM agents WHERE id = ? AND user_id = ?')
        .get(agentId, req.user.id);

      if (!agent) {
        return res.status(404).json({ error: 'Agent not found' });
      }

      // Check if agent already has a WhatsApp account
      const existingAccount = db.prepare(`
        SELECT id, status FROM platform_accounts
        WHERE agent_id = ? AND platform = 'whatsapp'
      `).get(agentId);

      if (existingAccount) {
        logger.info(`Agent ${agentId} already has WhatsApp account ${existingAccount.id}, reconnecting...`);

        // Reconnect existing account
        const agentManager = AgentManager.getInstance();
        await agentManager.connect(existingAccount.id);

        const client = agentManager.getClient(existingAccount.id);
        const qr = client ? await client.getQRCode() : null;

        return res.json({
          accountId: existingAccount.id,
          platform: 'whatsapp',
          status: client?.getStatus() || 'connecting',
          qr,
          reconnected: true
        });
      }
    }

    // Create new platform account (no existing account found)
    const accountId = uuidv4();

    db.prepare(`
      INSERT INTO platform_accounts (id, user_id, agent_id, platform, status)
      VALUES (?, ?, ?, 'whatsapp', 'connecting')
    `).run(accountId, req.user.id, agentId || null);

    // Start connection
    const agentManager = AgentManager.getInstance();
    await agentManager.connect(accountId);

    // Get QR code if available
    const client = agentManager.getClient(accountId);
    const qr = client ? await client.getQRCode() : null;

    res.status(201).json({
      accountId,
      platform: 'whatsapp',
      status: client?.getStatus() || 'connecting',
      qr
    });

  } catch (error) {
    logger.error(`Failed to create WhatsApp account: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/platforms/whatsapp/:id/qr
 * Get current QR code for WhatsApp account (by account ID)
 */
router.get('/whatsapp/:id/qr', async (req, res) => {
  try {
    const db = getDatabase();

    // Verify ownership
    const account = db.prepare(`
      SELECT id, status FROM platform_accounts
      WHERE id = ? AND user_id = ? AND platform = 'whatsapp'
    `).get(req.params.id, req.user.id);

    if (!account) {
      return res.status(404).json({ error: 'WhatsApp account not found' });
    }

    const agentManager = AgentManager.getInstance();
    const client = agentManager.getClient(req.params.id);

    if (!client) {
      return res.status(400).json({ error: 'WhatsApp client not connected' });
    }

    const qrData = await client.getQRCode();

    // getQRCode returns { qr, qrImage, expiresAt } or null
    res.json({
      status: client.getStatus(),
      qr: qrData?.qrImage || null,
      qrCode: qrData?.qrImage || null  // For frontend compatibility
    });

  } catch (error) {
    logger.error(`Failed to get QR code: ${error.message}`);
    res.status(500).json({ error: 'Failed to get QR code' });
  }
});

/**
 * GET /api/platforms/:agentId/whatsapp/qr
 * Get current QR code for WhatsApp account by agent ID
 * This is used by the frontend QRCodeDisplay component
 */
router.get('/:agentId/whatsapp/qr', async (req, res) => {
  try {
    const db = getDatabase();

    // Find the WhatsApp platform account for this agent
    const account = db.prepare(`
      SELECT pa.id, pa.status FROM platform_accounts pa
      JOIN agents a ON pa.agent_id = a.id
      WHERE pa.agent_id = ? AND a.user_id = ? AND pa.platform = 'whatsapp'
      ORDER BY pa.created_at DESC
      LIMIT 1
    `).get(req.params.agentId, req.user.id);

    if (!account) {
      return res.status(404).json({ error: 'WhatsApp account not found for this agent' });
    }

    // Check if already connected
    if (account.status === 'connected') {
      return res.json({
        status: 'connected',
        qrCode: null
      });
    }

    const agentManager = AgentManager.getInstance();
    const client = agentManager.getClient(account.id);

    if (!client) {
      return res.status(400).json({ error: 'WhatsApp client not initialized', status: account.status });
    }

    const qrData = await client.getQRCode();

    // getQRCode returns { qr, qrImage, expiresAt } or null
    // Frontend expects qrCode to be the data URL string
    res.json({
      status: client.getStatus(),
      qrCode: qrData?.qrImage || null
    });

  } catch (error) {
    logger.error(`Failed to get QR code by agent: ${error.message}`);
    res.status(500).json({ error: 'Failed to get QR code' });
  }
});

/**
 * POST /api/platforms/telegram-bot
 * Create a new Telegram Bot account
 */
router.post('/telegram-bot', async (req, res) => {
  try {
    const { agentId, token, polling = true } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Bot token is required' });
    }

    const db = getDatabase();

    // Verify agent ownership if agentId provided
    if (agentId) {
      const agent = db.prepare('SELECT id FROM agents WHERE id = ? AND user_id = ?')
        .get(agentId, req.user.id);

      if (!agent) {
        return res.status(404).json({ error: 'Agent not found' });
      }
    }

    // Encrypt credentials
    const credentials = { botToken: token, polling };
    const encryptedCredentials = encrypt(JSON.stringify(credentials));

    // Create platform account
    const accountId = uuidv4();

    db.prepare(`
      INSERT INTO platform_accounts (id, user_id, agent_id, platform, status, credentials_encrypted)
      VALUES (?, ?, ?, 'telegram-bot', 'connecting', ?)
    `).run(accountId, req.user.id, agentId || null, encryptedCredentials);

    // Store connection metadata
    db.prepare(`
      UPDATE platform_accounts
      SET connection_metadata = ?
      WHERE id = ?
    `).run(JSON.stringify({ polling }), accountId);

    // Start connection
    const agentManager = AgentManager.getInstance();

    try {
      await agentManager.connect(accountId);

      const client = agentManager.getClient(accountId);
      const botInfo = client?.getBotInfo?.() || null;

      res.status(201).json({
        accountId,
        platform: 'telegram-bot',
        status: client?.getStatus() || 'connected',
        metadata: botInfo ? { botUsername: botInfo.username, botName: botInfo.first_name } : null
      });

    } catch (connError) {
      // Update status to error
      db.prepare(`
        UPDATE platform_accounts
        SET status = 'error', last_error = ?
        WHERE id = ?
      `).run(connError.message, accountId);

      res.status(400).json({
        error: 'Failed to connect Telegram bot',
        details: connError.message,
        accountId
      });
    }

  } catch (error) {
    logger.error(`Failed to create Telegram bot account: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Telegram Bot Webhook Endpoints
// ============================================

/**
 * POST /api/platforms/telegram-bot/:id/webhook
 * Switch Telegram bot to webhook mode
 */
router.post('/telegram-bot/:id/webhook', async (req, res) => {
  try {
    const { webhookUrl, secretToken } = req.body;
    const db = getDatabase();

    const account = db.prepare(`
      SELECT id FROM platform_accounts WHERE id = ? AND user_id = ? AND platform = 'telegram-bot'
    `).get(req.params.id, req.user.id);

    if (!account) {
      return res.status(404).json({ error: 'Telegram bot account not found' });
    }

    const agentManager = AgentManager.getInstance();
    const client = agentManager.getClient(req.params.id);

    if (!client) {
      return res.status(400).json({ error: 'Client not connected' });
    }

    // Generate webhook URL if not provided
    const baseUrl = process.env.PUBLIC_URL || `http://localhost:${process.env.API_PORT || 3031}`;
    const fullWebhookUrl = webhookUrl || `${baseUrl}/public/telegram/${req.params.id}`;

    const generatedSecretToken = await client.switchToWebhook(fullWebhookUrl, secretToken);

    res.json({
      success: true,
      webhookUrl: fullWebhookUrl,
      mode: 'webhook',
      secretToken: generatedSecretToken
    });
  } catch (error) {
    logger.error(`Failed to switch to webhook: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/platforms/telegram-bot/:id/polling
 * Switch Telegram bot to polling mode
 */
router.post('/telegram-bot/:id/polling', async (req, res) => {
  try {
    const db = getDatabase();

    const account = db.prepare(`
      SELECT id FROM platform_accounts WHERE id = ? AND user_id = ? AND platform = 'telegram-bot'
    `).get(req.params.id, req.user.id);

    if (!account) {
      return res.status(404).json({ error: 'Telegram bot account not found' });
    }

    const agentManager = AgentManager.getInstance();
    const client = agentManager.getClient(req.params.id);

    if (!client) {
      return res.status(400).json({ error: 'Client not connected' });
    }

    await client.switchToPolling();

    res.json({
      success: true,
      mode: 'polling'
    });
  } catch (error) {
    logger.error(`Failed to switch to polling: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Telegram Bot Commands Endpoints
// ============================================

/**
 * GET /api/platforms/telegram-bot/:id/commands
 * Get current bot commands
 */
router.get('/telegram-bot/:id/commands', async (req, res) => {
  try {
    const db = getDatabase();

    const account = db.prepare(`
      SELECT id FROM platform_accounts WHERE id = ? AND user_id = ? AND platform = 'telegram-bot'
    `).get(req.params.id, req.user.id);

    if (!account) {
      return res.status(404).json({ error: 'Telegram bot account not found' });
    }

    const agentManager = AgentManager.getInstance();
    const client = agentManager.getClient(req.params.id);

    if (!client) {
      return res.status(400).json({ error: 'Client not connected' });
    }

    const commands = await client.getMyCommands();
    res.json({ commands });
  } catch (error) {
    logger.error(`Failed to get commands: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/platforms/telegram-bot/:id/commands
 * Set custom bot commands
 */
router.put('/telegram-bot/:id/commands', async (req, res) => {
  try {
    const { commands } = req.body;

    if (!Array.isArray(commands)) {
      return res.status(400).json({ error: 'Commands must be an array' });
    }

    // Validate command format
    for (const cmd of commands) {
      if (!cmd.command || !cmd.description) {
        return res.status(400).json({ error: 'Each command must have "command" and "description" fields' });
      }
    }

    const db = getDatabase();

    const account = db.prepare(`
      SELECT id, connection_metadata FROM platform_accounts WHERE id = ? AND user_id = ? AND platform = 'telegram-bot'
    `).get(req.params.id, req.user.id);

    if (!account) {
      return res.status(404).json({ error: 'Telegram bot account not found' });
    }

    const agentManager = AgentManager.getInstance();
    const client = agentManager.getClient(req.params.id);

    if (!client) {
      return res.status(400).json({ error: 'Client not connected' });
    }

    // Set commands on Telegram
    await client.setMyCommands(commands);

    // Store in metadata for persistence
    let metadata = {};
    try {
      metadata = account.connection_metadata ? JSON.parse(account.connection_metadata) : {};
    } catch (e) {
      metadata = {};
    }
    metadata.customCommands = commands;

    db.prepare(`
      UPDATE platform_accounts
      SET connection_metadata = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(JSON.stringify(metadata), req.params.id);

    res.json({ success: true, commands });
  } catch (error) {
    logger.error(`Failed to set commands: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Telegram User Account Endpoints
// ============================================

/**
 * POST /api/platforms/telegram-user
 * Create Telegram User account (MTProto)
 */
router.post('/telegram-user', async (req, res) => {
  try {
    const { agentId, phoneNumber } = req.body;

    // Use request body credentials or fall back to environment variables
    const apiId = req.body.apiId || process.env.TELEGRAM_API_ID;
    const apiHash = req.body.apiHash || process.env.TELEGRAM_API_HASH;

    if (!apiId || !apiHash) {
      return res.status(400).json({ error: 'Telegram API credentials not configured. Set TELEGRAM_API_ID and TELEGRAM_API_HASH in environment.' });
    }

    const db = getDatabase();

    // Verify agent ownership if agentId provided
    if (agentId) {
      const agent = db.prepare('SELECT id FROM agents WHERE id = ? AND user_id = ?')
        .get(agentId, req.user.id);

      if (!agent) {
        return res.status(404).json({ error: 'Agent not found' });
      }
    }

    // Encrypt credentials
    const credentials = { apiId: parseInt(apiId), apiHash, phoneNumber };
    const encryptedCredentials = encrypt(JSON.stringify(credentials));

    // Create platform account
    const accountId = uuidv4();

    db.prepare(`
      INSERT INTO platform_accounts (id, user_id, agent_id, platform, status, credentials_encrypted)
      VALUES (?, ?, ?, 'telegram-user', 'connecting', ?)
    `).run(accountId, req.user.id, agentId || null, encryptedCredentials);

    // Start connection in background (client.start() blocks until full auth completes)
    const agentManager = AgentManager.getInstance();

    // Fire and forget — don't await the full auth flow
    const connectPromise = agentManager.connect(accountId).catch(err => {
      logger.warn(`Telegram user connect background error: ${err.message}`);
      db.prepare(`
        UPDATE platform_accounts SET status = 'error', last_error = ? WHERE id = ?
      `).run(err.message, accountId);
    });

    // Wait briefly for the MTProto handshake and auth state to settle
    // gramJS connects fast (~2-3s), then enters the phoneCode callback
    await Promise.race([
      connectPromise,
      new Promise(resolve => setTimeout(resolve, 10000))
    ]);

    const client = agentManager.getClient(accountId);
    const authState = client?.authState || 'connecting';

    res.status(201).json({
      id: accountId,
      accountId,
      platform: 'telegram-user',
      status: authState === 'connected' ? 'connected' : 'connecting',
      authState,
      hint: authState === 'code_required'
        ? 'Verification code sent to your Telegram app'
        : authState === 'connected'
        ? 'Already authenticated'
        : `Auth state: ${authState}`
    });

  } catch (error) {
    logger.error(`Failed to create Telegram user account: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/platforms/telegram-user/:id/auth/phone
 * Provide phone number for Telegram user auth
 */
router.post('/telegram-user/:id/auth/phone', async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    const db = getDatabase();

    const account = db.prepare(`
      SELECT id FROM platform_accounts WHERE id = ? AND user_id = ? AND platform = 'telegram-user'
    `).get(req.params.id, req.user.id);

    if (!account) {
      return res.status(404).json({ error: 'Telegram user account not found' });
    }

    const agentManager = AgentManager.getInstance();
    const client = agentManager.getClient(req.params.id);

    if (!client) {
      return res.status(400).json({ error: 'Client not initialized. Try reconnecting.' });
    }

    if (!client.providePhone) {
      return res.status(400).json({ error: 'Client does not support phone auth' });
    }

    client.providePhone(phone);

    res.json({
      success: true,
      message: 'Phone number provided. Waiting for verification code.',
      nextStep: 'code'
    });
  } catch (error) {
    logger.error(`Failed to provide phone: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/platforms/telegram-user/:id/auth/code
 * Provide verification code for Telegram user auth
 */
router.post('/telegram-user/:id/auth/code', async (req, res) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ error: 'Verification code is required' });
    }

    const db = getDatabase();

    const account = db.prepare(`
      SELECT id FROM platform_accounts WHERE id = ? AND user_id = ? AND platform = 'telegram-user'
    `).get(req.params.id, req.user.id);

    if (!account) {
      return res.status(404).json({ error: 'Telegram user account not found' });
    }

    const agentManager = AgentManager.getInstance();
    const client = agentManager.getClient(req.params.id);

    if (!client) {
      return res.status(400).json({ error: 'Client not initialized' });
    }

    if (!client.provideCode) {
      return res.status(400).json({ error: 'Client does not support code auth' });
    }

    client.provideCode(code);

    res.json({
      success: true,
      message: 'Code provided. May need 2FA password or will connect.',
      nextStep: 'password_or_connected'
    });
  } catch (error) {
    logger.error(`Failed to provide code: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/platforms/telegram-user/:id/auth/password
 * Provide 2FA password for Telegram user auth
 */
router.post('/telegram-user/:id/auth/password', async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ error: '2FA password is required' });
    }

    const db = getDatabase();

    const account = db.prepare(`
      SELECT id FROM platform_accounts WHERE id = ? AND user_id = ? AND platform = 'telegram-user'
    `).get(req.params.id, req.user.id);

    if (!account) {
      return res.status(404).json({ error: 'Telegram user account not found' });
    }

    const agentManager = AgentManager.getInstance();
    const client = agentManager.getClient(req.params.id);

    if (!client) {
      return res.status(400).json({ error: 'Client not initialized' });
    }

    if (!client.providePassword) {
      return res.status(400).json({ error: 'Client does not support 2FA' });
    }

    client.providePassword(password);

    res.json({
      success: true,
      message: '2FA password provided. Connecting...'
    });
  } catch (error) {
    logger.error(`Failed to provide password: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/platforms/telegram-user/:id/auth/status
 * Get current auth status for Telegram user account
 */
router.get('/telegram-user/:id/auth/status', async (req, res) => {
  try {
    const db = getDatabase();

    const account = db.prepare(`
      SELECT id, status, last_error FROM platform_accounts WHERE id = ? AND user_id = ? AND platform = 'telegram-user'
    `).get(req.params.id, req.user.id);

    if (!account) {
      return res.status(404).json({ error: 'Telegram user account not found' });
    }

    const agentManager = AgentManager.getInstance();
    const client = agentManager.getClient(req.params.id);

    res.json({
      accountId: req.params.id,
      status: client?.getStatus() || account.status,
      authState: client?.authState || 'unknown',
      lastError: account.last_error,
      userInfo: client?.getUserInfo?.() || null
    });
  } catch (error) {
    logger.error(`Failed to get auth status: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Email Platform Endpoints
// ============================================

/**
 * Email service presets for common providers
 */
const EMAIL_PRESETS = {
  gmail: {
    name: 'Gmail',
    imap: { host: 'imap.gmail.com', port: 993, secure: true },
    smtp: { host: 'smtp.gmail.com', port: 587, secure: false },
    notes: 'Requires App Password (not your regular Google password)',
    helpUrl: 'https://myaccount.google.com/apppasswords',
    helpSteps: [
      'Go to your Google Account → Security',
      'Enable 2-Step Verification if not already enabled',
      'Go to "App passwords" (or use the link below)',
      'Select "Mail" and your device, then click "Generate"',
      'Copy the 16-character password and use it here'
    ]
  },
  outlook: {
    name: 'Outlook / Hotmail / Live',
    imap: { host: 'outlook.office365.com', port: 993, secure: true },
    smtp: { host: 'smtp.office365.com', port: 587, secure: false },
    notes: 'May require App Password if 2FA is enabled',
    helpUrl: 'https://account.live.com/proofs/AppPassword',
    helpSteps: [
      'Go to Microsoft Account → Security',
      'Enable Two-step verification if not already enabled',
      'Go to "App passwords" section',
      'Click "Create a new app password"',
      'Copy the generated password and use it here'
    ]
  },
  yahoo: {
    name: 'Yahoo Mail',
    imap: { host: 'imap.mail.yahoo.com', port: 993, secure: true },
    smtp: { host: 'smtp.mail.yahoo.com', port: 587, secure: false },
    notes: 'Requires App Password for third-party access',
    helpUrl: 'https://login.yahoo.com/account/security/app-passwords',
    helpSteps: [
      'Go to Yahoo Account → Account Security',
      'Enable Two-step verification if not already enabled',
      'Scroll to "Generate app password"',
      'Select "Other App" and enter "SwarmAI"',
      'Click "Generate" and copy the password'
    ]
  },
  icloud: {
    name: 'iCloud Mail',
    imap: { host: 'imap.mail.me.com', port: 993, secure: true },
    smtp: { host: 'smtp.mail.me.com', port: 587, secure: false },
    notes: 'Requires App-Specific Password from Apple ID',
    helpUrl: 'https://appleid.apple.com/account/manage',
    helpSteps: [
      'Go to appleid.apple.com and sign in',
      'Go to "Sign-In and Security" → "App-Specific Passwords"',
      'Click "Generate an app-specific password"',
      'Enter a label like "SwarmAI Email"',
      'Copy the generated password and use it here'
    ]
  },
  zoho: {
    name: 'Zoho Mail',
    imap: { host: 'imap.zoho.com', port: 993, secure: true },
    smtp: { host: 'smtp.zoho.com', port: 587, secure: false },
    notes: 'Enable IMAP access in Zoho Mail settings first',
    helpUrl: 'https://mail.zoho.com/zm/#settings/all/mailaccounts',
    helpSteps: [
      'Go to Zoho Mail Settings → Mail Accounts',
      'Select your email account',
      'Go to "IMAP Access" and enable it',
      'If 2FA enabled, generate App Password in Security settings',
      'Use your Zoho email and password (or app password)'
    ]
  },
  protonmail: {
    name: 'ProtonMail (Bridge)',
    imap: { host: '127.0.0.1', port: 1143, secure: false },
    smtp: { host: '127.0.0.1', port: 1025, secure: false },
    notes: 'Requires ProtonMail Bridge desktop app',
    helpUrl: 'https://proton.me/mail/bridge',
    helpSteps: [
      'Download and install ProtonMail Bridge',
      'Sign in with your ProtonMail account',
      'Bridge will show IMAP/SMTP credentials',
      'Use the Bridge-generated password (NOT your account password)',
      'Keep Bridge running while using email'
    ]
  },
  fastmail: {
    name: 'Fastmail',
    imap: { host: 'imap.fastmail.com', port: 993, secure: true },
    smtp: { host: 'smtp.fastmail.com', port: 587, secure: false },
    notes: 'Requires App Password for third-party apps',
    helpUrl: 'https://www.fastmail.com/settings/security/devicekeys',
    helpSteps: [
      'Go to Fastmail Settings → Privacy & Security',
      'Click "New app password" under App Passwords',
      'Choose "Custom" and select IMAP, SMTP access',
      'Enter a name like "SwarmAI"',
      'Copy the generated password and use it here'
    ]
  },
  gmx: {
    name: 'GMX Mail',
    imap: { host: 'imap.gmx.com', port: 993, secure: true },
    smtp: { host: 'mail.gmx.com', port: 587, secure: false },
    notes: 'Enable POP3/IMAP access in GMX settings',
    helpUrl: 'https://www.gmx.com/mail/settings/',
    helpSteps: [
      'Go to GMX Settings → POP3/IMAP',
      'Enable "Access via POP3 and IMAP"',
      'Save the settings',
      'Use your GMX email and password here'
    ]
  },
  aol: {
    name: 'AOL Mail',
    imap: { host: 'imap.aol.com', port: 993, secure: true },
    smtp: { host: 'smtp.aol.com', port: 587, secure: false },
    notes: 'May require App Password if 2FA is enabled',
    helpUrl: 'https://login.aol.com/account/security/app-passwords',
    helpSteps: [
      'Go to AOL Account Security',
      'Enable Two-step verification if not enabled',
      'Click "Generate app password"',
      'Select "Other App" and enter "SwarmAI"',
      'Copy the generated password and use it here'
    ]
  },
  custom: {
    name: 'Custom / Other',
    imap: { host: '', port: 993, secure: true },
    smtp: { host: '', port: 587, secure: false },
    notes: 'Enter your email provider settings manually',
    helpUrl: null,
    helpSteps: [
      'Contact your email provider for IMAP/SMTP settings',
      'Common IMAP port: 993 (SSL) or 143 (STARTTLS)',
      'Common SMTP port: 587 (STARTTLS) or 465 (SSL)',
      'You may need to enable IMAP access in your email settings',
      'Some providers require app-specific passwords'
    ]
  }
};

/**
 * GET /api/platforms/email/presets
 * Get email service presets for common providers
 */
router.get('/email/presets', (req, res) => {
  const presets = Object.entries(EMAIL_PRESETS).map(([key, value]) => ({
    id: key,
    ...value
  }));
  res.json({ presets });
});

/**
 * POST /api/platforms/email/test
 * Test email connection without persisting to database
 */
router.post('/email/test', async (req, res) => {
  const Imap = require('imap');
  const nodemailer = require('nodemailer');

  let { email, password, imap, smtp, imapHost, imapPort, smtpHost, smtpPort, useTLS, platformAccountId } = req.body;

  // If platformAccountId provided and no password, try to get stored password
  if (platformAccountId && !password) {
    try {
      const db = getDatabase();
      const account = db.prepare(`
        SELECT credentials_encrypted FROM platform_accounts
        WHERE id = ? AND user_id = ? AND platform = 'email'
      `).get(platformAccountId, req.user.id);

      if (account?.credentials_encrypted) {
        const { decrypt } = require('../agents/agentManager.cjs');
        const credentials = JSON.parse(decrypt(account.credentials_encrypted));
        password = credentials.password;
        // Also use stored settings if not provided
        if (!email) email = credentials.email;
        if (!imapHost && !imap) {
          imapHost = credentials.imap?.host;
          imapPort = credentials.imap?.port;
        }
        if (!smtpHost && !smtp) {
          smtpHost = credentials.smtp?.host;
          smtpPort = credentials.smtp?.port;
        }
      }
    } catch (decryptError) {
      logger.error(`Failed to get stored credentials: ${decryptError.message}`);
    }
  }

  // Support both nested object format and flat format
  const imapConfig = imap || {
    host: imapHost,
    port: imapPort || 993,
    secure: useTLS !== false
  };
  const smtpConfig = smtp || {
    host: smtpHost,
    port: smtpPort || 587,
    secure: false // SMTP typically uses STARTTLS on port 587
  };

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: 'Email and password are required'
    });
  }

  if (!imapConfig.host || !smtpConfig.host) {
    return res.status(400).json({
      success: false,
      message: 'IMAP and SMTP host configuration required'
    });
  }

  const results = {
    imap: { success: false, message: '', details: null },
    smtp: { success: false, message: '', details: null }
  };

  // Test IMAP connection
  try {
    logger.info(`Testing IMAP connection to ${imapConfig.host}:${imapConfig.port} for ${email}`);

    await new Promise((resolve, reject) => {
      const imapClient = new Imap({
        user: email,
        password: password,
        host: imapConfig.host,
        port: imapConfig.port || 993,
        tls: imapConfig.secure !== false,
        tlsOptions: { rejectUnauthorized: false },
        connTimeout: 15000,
        authTimeout: 10000
      });

      const timeout = setTimeout(() => {
        try { imapClient.end(); } catch (e) {}
        reject(new Error('IMAP connection timeout (15s)'));
      }, 15000);

      imapClient.once('ready', () => {
        clearTimeout(timeout);
        results.imap = {
          success: true,
          message: 'IMAP connection successful',
          details: { host: imapConfig.host, port: imapConfig.port }
        };
        imapClient.end();
        resolve();
      });

      imapClient.once('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      imapClient.connect();
    });
  } catch (imapError) {
    logger.error(`IMAP test failed for ${email}: ${imapError.message}`);
    results.imap = {
      success: false,
      message: `IMAP connection failed: ${imapError.message}`,
      details: { host: imapConfig.host, port: imapConfig.port, error: imapError.message }
    };
  }

  // Test SMTP connection
  try {
    logger.info(`Testing SMTP connection to ${smtpConfig.host}:${smtpConfig.port} for ${email}`);

    const transporter = nodemailer.createTransport({
      host: smtpConfig.host,
      port: smtpConfig.port || 587,
      secure: smtpConfig.secure || false,
      auth: {
        user: email,
        pass: password
      },
      tls: {
        rejectUnauthorized: false
      },
      connectionTimeout: 15000
    });

    await transporter.verify();
    results.smtp = {
      success: true,
      message: 'SMTP connection successful',
      details: { host: smtpConfig.host, port: smtpConfig.port }
    };
    transporter.close();
  } catch (smtpError) {
    logger.error(`SMTP test failed for ${email}: ${smtpError.message}`);
    results.smtp = {
      success: false,
      message: `SMTP connection failed: ${smtpError.message}`,
      details: { host: smtpConfig.host, port: smtpConfig.port, error: smtpError.message }
    };
  }

  // Determine overall success
  const overallSuccess = results.imap.success && results.smtp.success;
  let overallMessage = '';

  if (overallSuccess) {
    overallMessage = 'Both IMAP and SMTP connections successful';
  } else if (results.imap.success && !results.smtp.success) {
    overallMessage = 'IMAP OK, but SMTP failed: ' + results.smtp.message;
  } else if (!results.imap.success && results.smtp.success) {
    overallMessage = 'SMTP OK, but IMAP failed: ' + results.imap.message;
  } else {
    overallMessage = 'Both connections failed. Check credentials and server settings.';
  }

  res.json({
    success: overallSuccess,
    message: overallMessage,
    results
  });
});

/**
 * POST /api/platforms/email
 * Create a new Email account
 */
router.post('/email', async (req, res) => {
  try {
    const { agentId, email, password, imap, smtp } = req.body;

    if (!email || !password || !imap || !smtp) {
      return res.status(400).json({
        error: 'Email, password, IMAP, and SMTP configuration required'
      });
    }

    const db = getDatabase();

    // Verify agent ownership if agentId provided
    if (agentId) {
      const agent = db.prepare('SELECT id FROM agents WHERE id = ? AND user_id = ?')
        .get(agentId, req.user.id);

      if (!agent) {
        return res.status(404).json({ error: 'Agent not found' });
      }
    }

    // Encrypt credentials
    const credentials = { email, password, imap, smtp };
    const encryptedCredentials = encrypt(JSON.stringify(credentials));

    // Check if agent already has an email account - update instead of creating duplicate
    let accountId;
    const existing = agentId ? db.prepare(`
      SELECT id FROM platform_accounts
      WHERE agent_id = ? AND platform = 'email' AND user_id = ?
    `).get(agentId, req.user.id) : null;

    if (existing) {
      // Update existing account credentials
      accountId = existing.id;
      logger.info(`Agent ${agentId} already has email account ${accountId}, updating credentials`);

      // Disconnect old client if connected
      const agentManager = AgentManager.getInstance();
      try { await agentManager.disconnect(accountId); } catch (e) { /* ignore */ }

      db.prepare(`
        UPDATE platform_accounts
        SET credentials_encrypted = ?, status = 'connecting', last_error = NULL, error_count = 0, updated_at = datetime('now')
        WHERE id = ?
      `).run(encryptedCredentials, accountId);
    } else {
      // Create new platform account
      accountId = uuidv4();
      db.prepare(`
        INSERT INTO platform_accounts (id, user_id, agent_id, platform, status, credentials_encrypted)
        VALUES (?, ?, ?, 'email', 'connecting', ?)
      `).run(accountId, req.user.id, agentId || null, encryptedCredentials);
    }

    // Start connection
    const agentManager = AgentManager.getInstance();

    try {
      await agentManager.connect(accountId);

      const client = agentManager.getClient(accountId);

      res.status(201).json({
        accountId,
        platform: 'email',
        status: client?.getStatus() || 'connected',
        email
      });

    } catch (connError) {
      // Update status to error
      db.prepare(`
        UPDATE platform_accounts
        SET status = 'error', last_error = ?
        WHERE id = ?
      `).run(connError.message, accountId);

      res.status(400).json({
        error: 'Failed to connect to email server',
        details: connError.message,
        accountId
      });
    }

  } catch (error) {
    logger.error(`Failed to create email account: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/platforms/email/:id
 * Get email account details (without password)
 */
router.get('/email/:id', async (req, res) => {
  try {
    const db = getDatabase();

    // Verify ownership
    const account = db.prepare(`
      SELECT id, platform, status, agent_id, credentials_encrypted, connection_metadata,
             last_connected_at, last_error, created_at, updated_at
      FROM platform_accounts
      WHERE id = ? AND user_id = ? AND platform = 'email'
    `).get(req.params.id, req.user.id);

    if (!account) {
      return res.status(404).json({ error: 'Email account not found' });
    }

    // Decrypt credentials to get email and settings (but NOT password)
    let email = '';
    let imapHost = '';
    let imapPort = 993;
    let smtpHost = '';
    let smtpPort = 587;

    if (account.credentials_encrypted) {
      try {
        const { decrypt } = require('../agents/agentManager.cjs');
        const credentials = JSON.parse(decrypt(account.credentials_encrypted));
        email = credentials.email || '';
        imapHost = credentials.imap?.host || '';
        imapPort = credentials.imap?.port || 993;
        smtpHost = credentials.smtp?.host || '';
        smtpPort = credentials.smtp?.port || 587;
      } catch (decryptError) {
        logger.error(`Failed to decrypt email credentials: ${decryptError.message}`);
      }
    }

    // Parse connection metadata for additional settings
    let settings = {};
    if (account.connection_metadata) {
      try {
        settings = JSON.parse(account.connection_metadata);
      } catch (e) {}
    }

    res.json({
      id: account.id,
      platform: account.platform,
      status: account.status,
      agentId: account.agent_id,
      email,
      imapHost,
      imapPort,
      smtpHost,
      smtpPort,
      settings,
      lastConnectedAt: account.last_connected_at,
      lastError: account.last_error,
      createdAt: account.created_at,
      updatedAt: account.updated_at
    });

  } catch (error) {
    logger.error(`Failed to get email account: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/platforms/email/:id
 * Update email account credentials
 */
router.put('/email/:id', async (req, res) => {
  try {
    const db = getDatabase();
    const { email, password, imap, smtp, settings } = req.body;

    // Verify ownership
    const account = db.prepare(`
      SELECT id, credentials_encrypted FROM platform_accounts
      WHERE id = ? AND user_id = ? AND platform = 'email'
    `).get(req.params.id, req.user.id);

    if (!account) {
      return res.status(404).json({ error: 'Email account not found' });
    }

    // Get existing credentials
    let existingCredentials = {};
    if (account.credentials_encrypted) {
      try {
        const { decrypt } = require('../agents/agentManager.cjs');
        existingCredentials = JSON.parse(decrypt(account.credentials_encrypted));
      } catch (e) {
        logger.error(`Failed to decrypt existing credentials: ${e.message}`);
      }
    }

    // Merge with new values (only update what's provided)
    const updatedCredentials = {
      email: email || existingCredentials.email,
      password: password || existingCredentials.password, // Only update if new password provided
      imap: imap || existingCredentials.imap || { host: '', port: 993, secure: true },
      smtp: smtp || existingCredentials.smtp || { host: '', port: 587, secure: false }
    };

    // Encrypt and save
    const encryptedCredentials = encrypt(JSON.stringify(updatedCredentials));

    // Update settings metadata if provided
    let connectionMetadata = null;
    if (settings) {
      connectionMetadata = JSON.stringify(settings);
    }

    // Update database
    if (connectionMetadata) {
      db.prepare(`
        UPDATE platform_accounts
        SET credentials_encrypted = ?, connection_metadata = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(encryptedCredentials, connectionMetadata, req.params.id);
    } else {
      db.prepare(`
        UPDATE platform_accounts
        SET credentials_encrypted = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(encryptedCredentials, req.params.id);
    }

    // Disconnect and reconnect with new credentials
    const agentManager = AgentManager.getInstance();

    try {
      await agentManager.disconnect(req.params.id);
      await agentManager.connect(req.params.id);

      const client = agentManager.getClient(req.params.id);

      res.json({
        success: true,
        message: 'Email credentials updated successfully',
        status: client?.getStatus() || 'connected'
      });
    } catch (connError) {
      // Update status to error but keep credentials saved
      db.prepare(`
        UPDATE platform_accounts
        SET status = 'error', last_error = ?
        WHERE id = ?
      `).run(connError.message, req.params.id);

      res.json({
        success: true,
        message: 'Credentials saved but connection failed: ' + connError.message,
        status: 'error',
        error: connError.message
      });
    }

  } catch (error) {
    logger.error(`Failed to update email account: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/platforms/:id/connect
 * Connect/reconnect a platform account
 */
router.post('/:id/connect', async (req, res) => {
  try {
    const db = getDatabase();

    // Verify ownership
    const account = db.prepare(`
      SELECT id, platform, status FROM platform_accounts
      WHERE id = ? AND user_id = ?
    `).get(req.params.id, req.user.id);

    if (!account) {
      return res.status(404).json({ error: 'Platform account not found' });
    }

    const agentManager = AgentManager.getInstance();
    await agentManager.connect(req.params.id);

    const client = agentManager.getClient(req.params.id);

    res.json({
      accountId: req.params.id,
      platform: account.platform,
      status: client?.getStatus() || 'connecting'
    });

  } catch (error) {
    logger.error(`Failed to connect: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/platforms/:id/disconnect
 * Disconnect a platform account
 */
router.post('/:id/disconnect', async (req, res) => {
  try {
    const db = getDatabase();

    // Verify ownership
    const account = db.prepare(`
      SELECT id FROM platform_accounts WHERE id = ? AND user_id = ?
    `).get(req.params.id, req.user.id);

    if (!account) {
      return res.status(404).json({ error: 'Platform account not found' });
    }

    const agentManager = AgentManager.getInstance();
    await agentManager.disconnect(req.params.id);

    res.json({
      accountId: req.params.id,
      status: 'disconnected'
    });

  } catch (error) {
    logger.error(`Failed to disconnect: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/platforms/:id/reset
 * Reset a platform account status from 'error' to 'disconnected'
 * Useful when account is stuck in error state
 */
router.post('/:id/reset', async (req, res) => {
  try {
    const db = getDatabase();

    // Verify ownership
    const account = db.prepare(`
      SELECT id, platform, status FROM platform_accounts
      WHERE id = ? AND user_id = ?
    `).get(req.params.id, req.user.id);

    if (!account) {
      return res.status(404).json({ error: 'Platform account not found' });
    }

    // Reset status to disconnected
    db.prepare(`
      UPDATE platform_accounts
      SET status = 'disconnected', updated_at = datetime('now')
      WHERE id = ?
    `).run(req.params.id);

    logger.info(`Platform account ${req.params.id} reset from '${account.status}' to 'disconnected'`);

    res.json({
      accountId: req.params.id,
      platform: account.platform,
      previousStatus: account.status,
      status: 'disconnected',
      message: 'Account reset successfully. You can now reconnect.'
    });

  } catch (error) {
    logger.error(`Failed to reset platform account: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/platforms/:id
 * Delete a platform account
 */
router.delete('/:id', async (req, res) => {
  try {
    const db = getDatabase();

    // Verify ownership
    const account = db.prepare(`
      SELECT id, platform FROM platform_accounts WHERE id = ? AND user_id = ?
    `).get(req.params.id, req.user.id);

    if (!account) {
      return res.status(404).json({ error: 'Platform account not found' });
    }

    // Disconnect first
    const agentManager = AgentManager.getInstance();
    await agentManager.disconnect(req.params.id);

    // Clean up WhatsApp session folder if exists
    if (account.platform === 'whatsapp') {
      const sessionPath = path.join(__dirname, '..', 'data', 'whatsapp-sessions', `session-${req.params.id}`);
      if (fs.existsSync(sessionPath)) {
        fs.rmSync(sessionPath, { recursive: true, force: true });
        logger.info(`Deleted WhatsApp session folder: session-${req.params.id}`);
      }
    }

    // Delete from database
    db.prepare('DELETE FROM whatsapp_qr_codes WHERE platform_account_id = ?')
      .run(req.params.id);

    db.prepare('DELETE FROM platform_accounts WHERE id = ?')
      .run(req.params.id);

    logger.info(`Platform account deleted: ${account.platform} (${req.params.id})`);

    res.json({ message: 'Platform account deleted' });

  } catch (error) {
    logger.error(`Failed to delete platform account: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/platforms/:id/agent
 * Assign/reassign an agent to a platform account
 */
router.put('/:id/agent', (req, res) => {
  try {
    const { agentId } = req.body;
    const db = getDatabase();

    // Verify platform account ownership
    const account = db.prepare(`
      SELECT id FROM platform_accounts WHERE id = ? AND user_id = ?
    `).get(req.params.id, req.user.id);

    if (!account) {
      return res.status(404).json({ error: 'Platform account not found' });
    }

    // Verify agent ownership if agentId provided
    if (agentId) {
      const agent = db.prepare('SELECT id FROM agents WHERE id = ? AND user_id = ?')
        .get(agentId, req.user.id);

      if (!agent) {
        return res.status(404).json({ error: 'Agent not found' });
      }
    }

    db.prepare(`
      UPDATE platform_accounts
      SET agent_id = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(agentId || null, req.params.id);

    res.json({ message: 'Agent assigned successfully' });

  } catch (error) {
    logger.error(`Failed to assign agent: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/platforms/:id/chats
 * Get chats from a WhatsApp account
 */
router.get('/:id/chats', async (req, res) => {
  try {
    const db = getDatabase();

    // Verify ownership
    const account = db.prepare(`
      SELECT id, platform FROM platform_accounts
      WHERE id = ? AND user_id = ? AND platform = 'whatsapp'
    `).get(req.params.id, req.user.id);

    if (!account) {
      return res.status(404).json({ error: 'WhatsApp account not found' });
    }

    const agentManager = AgentManager.getInstance();
    const client = agentManager.getClient(req.params.id);

    if (!client || client.getStatus() !== 'connected') {
      return res.status(400).json({ error: 'WhatsApp client not connected' });
    }

    const chats = await client.getChats();

    res.json({ chats });

  } catch (error) {
    logger.error(`Failed to get chats: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/platforms/:id/contacts
 * Get contacts from a WhatsApp account with caching and profile pic support
 * Matches old WhatsBots system functionality
 *
 * Query params:
 * - limit: Max contacts to return (default: 100)
 * - validNumbersOnly: Filter for valid phone numbers (default: true)
 * - forceRefresh: Skip cache and fetch fresh (default: false)
 */
router.get('/:id/contacts', async (req, res) => {
  try {
    const db = getDatabase();
    const { limit = 100, validNumbersOnly = 'true', forceRefresh = 'false' } = req.query;
    const limitNum = parseInt(limit);
    const filterValid = validNumbersOnly !== 'false';
    const skipCache = forceRefresh === 'true';

    // Verify ownership
    const account = db.prepare(`
      SELECT id, platform FROM platform_accounts
      WHERE id = ? AND user_id = ? AND platform = 'whatsapp'
    `).get(req.params.id, req.user.id);

    if (!account) {
      return res.status(404).json({ error: 'WhatsApp account not found' });
    }

    const accountId = req.params.id;

    // Try to get from Redis cache first (unless force refresh)
    if (!skipCache && redisService.isRedisAvailable()) {
      const cachedContacts = await redisService.getBulkContacts(accountId);
      if (cachedContacts && cachedContacts.length > 0) {
        logger.info(`[Contacts] Using cached contacts for account ${accountId} (${cachedContacts.length} total)`);

        // Get last sync time
        const lastSync = await redisService.getContactListLastSync(accountId);

        // Format and return cached contacts
        const formattedContacts = cachedContacts.slice(0, limitNum).map(contact => ({
          id: contact.id,
          number: contact.number,
          name: contact.name || contact.pushname || null,
          isMyContact: contact.isMyContact || false,
          isGroup: contact.isGroup || false,
          isUser: contact.isUser || false,
          isBlocked: contact.isBlocked || false,
          profilePicUrl: contact.profilePicUrl || null
        }));

        return res.json({
          contacts: formattedContacts,
          fromCache: true,
          lastSync: lastSync ? new Date(lastSync).toISOString() : null,
          totalContacts: cachedContacts.length
        });
      }
    }

    // No cache or force refresh - fetch from WhatsApp
    const agentManager = AgentManager.getInstance();
    const client = agentManager.getClient(accountId);

    if (!client || client.getStatus() !== 'connected') {
      return res.status(400).json({ error: 'WhatsApp client not connected' });
    }

    logger.info(`[Contacts] Fetching fresh contacts from WhatsApp for account ${accountId}`);

    // Get all contacts from WhatsApp
    const allContacts = await client.getContacts();
    if (!allContacts || allContacts.length === 0) {
      return res.json({
        contacts: [],
        fromCache: false,
        lastSync: new Date().toISOString(),
        totalContacts: 0
      });
    }

    // Filter for valid phone numbers if requested
    let filteredContacts = allContacts;
    if (filterValid) {
      filteredContacts = allContacts.filter(contact => {
        const phoneNumber = contact.number || contact.id?.user;
        if (!phoneNumber) return false;
        // Basic validation: should be numeric and have reasonable length
        const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
        return cleanNumber.length >= 7 && cleanNumber.length <= 15;
      });
    }

    // Sort contacts alphabetically (priority: name > pushname > number)
    filteredContacts.sort((a, b) => {
      const aName = (a.name || a.pushname || a.number || '').toLowerCase().trim();
      const bName = (b.name || b.pushname || b.number || '').toLowerCase().trim();
      return aName.localeCompare(bName);
    });

    // Parallel profile pic loading for first 20 contacts
    const profilePicPromises = filteredContacts.slice(0, 20).map(async (contact) => {
      try {
        contact.profilePicUrl = await contact.getProfilePicUrl();
      } catch (picError) {
        contact.profilePicUrl = null;
      }
    });
    await Promise.all(profilePicPromises);

    // Format contacts for caching and response
    const contactsToCache = filteredContacts.map(contact => ({
      id: contact.id?._serialized || contact.id,
      number: contact.number || contact.id?.user,
      name: contact.name || null,
      pushname: contact.pushname || null,
      isMyContact: contact.isMyContact || false,
      isGroup: contact.isGroup || false,
      isUser: contact.isUser || false,
      isBlocked: contact.isBlocked || false,
      profilePicUrl: contact.profilePicUrl || null
    }));

    // Cache ALL contacts in Redis for future use
    if (redisService.isRedisAvailable() && contactsToCache.length > 0) {
      await redisService.storeBulkContacts(accountId, contactsToCache);
      logger.info(`[Contacts] Cached ${contactsToCache.length} contacts for account ${accountId}`);
    }

    // Format response (return requested amount)
    const formattedContacts = contactsToCache.slice(0, limitNum).map(contact => ({
      id: contact.id,
      number: contact.number,
      name: contact.name || contact.pushname || null,
      isMyContact: contact.isMyContact,
      isGroup: contact.isGroup,
      isUser: contact.isUser,
      isBlocked: contact.isBlocked,
      profilePicUrl: contact.profilePicUrl
    }));

    // Start background profile pic update for remaining contacts
    if (filteredContacts.length > 20) {
      updateProfilePicsInBackground(accountId, filteredContacts.slice(20), client);
    }

    res.json({
      contacts: formattedContacts,
      fromCache: false,
      lastSync: new Date().toISOString(),
      totalContacts: filteredContacts.length
    });

  } catch (error) {
    logger.error(`Failed to get contacts: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Background profile pic updater
 * Fetches profile pictures for contacts in background to avoid blocking response
 */
async function updateProfilePicsInBackground(accountId, contacts, client) {
  if (!contacts || contacts.length === 0) return;

  const processLimit = Math.min(50, contacts.length);
  logger.info(`[Background] Starting profile pic update for ${processLimit}/${contacts.length} contacts of account ${accountId}`);

  let processedCount = 0;
  let updatedCount = 0;

  for (let i = 0; i < processLimit; i++) {
    const contact = contacts[i];
    const contactId = contact.id?._serialized || contact.id;

    try {
      // Check if we already have a cached profile pic
      if (redisService.isRedisAvailable()) {
        const cachedPic = await redisService.getProfilePic(accountId, contactId);
        if (cachedPic) {
          processedCount++;
          continue;
        }
      }

      // Get profile pic
      const profilePicUrl = await contact.getProfilePicUrl();
      if (profilePicUrl) {
        // Store in Redis
        if (redisService.isRedisAvailable()) {
          await redisService.storeProfilePic(accountId, contactId, profilePicUrl);
        }

        // Update cached contact
        const cachedContact = await redisService.getContact(accountId, contactId);
        if (cachedContact) {
          cachedContact.profilePicUrl = profilePicUrl;
          await redisService.storeContact(accountId, contactId, cachedContact);
        }

        // Broadcast update via WebSocket
        if (global.io) {
          global.io.emit('profilePicUpdate', {
            accountId,
            contactId,
            profilePicUrl
          });
        }

        updatedCount++;
      }

      processedCount++;

      // Small delay to avoid overwhelming WhatsApp
      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (err) {
      processedCount++;
    }
  }

  logger.info(`[Background] Completed profile pic update for account ${accountId}: processed ${processedCount}, updated ${updatedCount}`);
}

/**
 * POST /api/platforms/:id/sync
 * Manually sync WhatsApp chats and contacts to database
 */
router.post('/:id/sync', authenticate, async (req, res) => {
  try {
    const db = getDatabase();

    // Verify ownership (any platform)
    const account = db.prepare(`
      SELECT id, platform FROM platform_accounts
      WHERE id = ? AND user_id = ?
    `).get(req.params.id, req.user.id);

    if (!account) {
      return res.status(404).json({ error: 'Platform account not found' });
    }

    // Telegram platforms receive messages in real-time (no historical sync)
    if (account.platform === 'telegram-bot' || account.platform === 'telegram-user') {
      return res.json({
        success: true,
        message: 'Telegram receives messages in real-time — no sync needed.',
        contactsSynced: 0,
        conversationsSynced: 0
      });
    }

    if (account.platform !== 'whatsapp') {
      return res.status(400).json({ error: `Sync not supported for platform: ${account.platform}` });
    }

    const agentManager = AgentManager.getInstance();
    const client = agentManager.getClient(req.params.id);

    if (!client || client.getStatus() !== 'connected') {
      return res.status(400).json({ error: 'WhatsApp client not connected' });
    }

    // Trigger sync
    const result = await client.syncToDatabase();

    res.json({
      success: result.synced,
      contactsSynced: result.contactsSynced || 0,
      conversationsSynced: result.conversationsSynced || 0,
      error: result.error
    });

  } catch (error) {
    logger.error(`Failed to sync: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Emit resync status to WebSocket clients
 */
function emitResyncStatus(agentId, status, data = {}) {
  logger.info(`Emitting resync:status to room agent:${agentId} - status: ${status}`);
  if (global.io) {
    global.io.to(`agent:${agentId}`).emit('resync:status', {
      status,
      ...data,
      timestamp: new Date().toISOString()
    });
  } else {
    logger.warn('global.io not available for WebSocket emit');
  }
}

/**
 * Emit sync status to WebSocket clients (for contacts/chats sync)
 */
function emitSyncStatus(agentId, type, status, data = {}) {
  logger.info(`Emitting sync:status to room agent:${agentId} - type: ${type}, status: ${status}`);
  if (global.io) {
    global.io.to(`agent:${agentId}`).emit('sync:status', {
      type,
      status,
      ...data,
      timestamp: new Date().toISOString()
    });
  } else {
    logger.warn('global.io not available for WebSocket emit');
  }
}

/**
 * POST /api/platforms/:id/sync-contacts
 * Sync only WhatsApp contacts (incremental, non-destructive)
 * Emits WebSocket events for progress tracking
 * NOTE: This endpoint returns immediately and runs sync in background
 */
router.post('/:id/sync-contacts', authenticate, async (req, res) => {
  try {
    const db = getDatabase();

    // Verify ownership
    const account = db.prepare(`
      SELECT pa.id, pa.platform, pa.agent_id, a.user_id
      FROM platform_accounts pa
      JOIN agents a ON a.id = pa.agent_id
      WHERE pa.id = ? AND a.user_id = ? AND pa.platform = 'whatsapp'
    `).get(req.params.id, req.user.id);

    if (!account) {
      return res.status(404).json({ error: 'WhatsApp account not found' });
    }

    const agentManager = AgentManager.getInstance();
    const client = agentManager.getClient(req.params.id);

    if (!client || client.getStatus() !== 'connected') {
      return res.status(400).json({ error: 'WhatsApp client not connected' });
    }

    const agentId = account.agent_id;
    const accountId = req.params.id;
    logger.info(`Contact sync requested for account ${accountId}, agentId: ${agentId}`);

    // Return immediately - sync runs in background
    res.json({
      success: true,
      message: 'Contact sync started. Progress will be sent via WebSocket.',
      accountId,
      agentId
    });

    // Run sync in background
    setImmediate(async () => {
      try {
        // Emit: Started
        emitSyncStatus(agentId, 'contacts', 'started', { message: 'Starting contact sync...' });

        // Use the new syncContactsOnly method with progress callback
        const result = await client.syncContactsOnly((progress) => {
          let status = 'syncing';
          if (progress.phase === 'fetching') {
            status = 'started';
          } else if (progress.phase === 'syncing') {
            status = 'syncing';
          }

          emitSyncStatus(agentId, 'contacts', status, {
            message: progress.message,
            current: progress.current,
            total: progress.total,
            stats: progress.stats
          });
        });

        // Emit: Complete or Error
        if (result.synced) {
          emitSyncStatus(agentId, 'contacts', 'completed', {
            message: 'Contact sync completed successfully!',
            stats: {
              contactsSynced: result.contactsSynced || 0,
              contactsExisting: result.contactsExisting || 0,
              contactErrors: result.contactErrors || 0
            }
          });
          logger.info(`Contact sync completed for account ${accountId}: ${result.contactsSynced} new, ${result.contactsExisting} existing`);
        } else {
          emitSyncStatus(agentId, 'contacts', 'error', {
            message: result.error || 'Contact sync failed',
            stats: {
              contactsSynced: result.contactsSynced || 0,
              contactsExisting: result.contactsExisting || 0,
              contactErrors: result.contactErrors || 0
            }
          });
          logger.error(`Contact sync error for account ${accountId}: ${result.error}`);
        }
      } catch (bgError) {
        logger.error(`Contact sync background error for account ${accountId}: ${bgError.message}`);
        emitSyncStatus(agentId, 'contacts', 'error', {
          message: `Contact sync failed: ${bgError.message}`
        });
      }
    });

  } catch (error) {
    logger.error(`Failed to sync contacts: ${error.message}`);
    // Try to emit error status if we have agentId
    try {
      const account = getDatabase().prepare(`
        SELECT agent_id FROM platform_accounts WHERE id = ?
      `).get(req.params.id);
      if (account?.agent_id) {
        emitSyncStatus(account.agent_id, 'contacts', 'error', {
          message: `Contact sync failed: ${error.message}`
        });
      }
    } catch (e) {
      // Ignore emit errors
    }
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/platforms/:id/sync-chats
 * Sync only WhatsApp chats and messages (incremental, non-destructive)
 * Emits WebSocket events for progress tracking
 * NOTE: This endpoint returns immediately and runs sync in background
 */
router.post('/:id/sync-chats', authenticate, async (req, res) => {
  try {
    const db = getDatabase();

    // Verify ownership
    const account = db.prepare(`
      SELECT pa.id, pa.platform, pa.agent_id, a.user_id
      FROM platform_accounts pa
      JOIN agents a ON a.id = pa.agent_id
      WHERE pa.id = ? AND a.user_id = ? AND pa.platform = 'whatsapp'
    `).get(req.params.id, req.user.id);

    if (!account) {
      return res.status(404).json({ error: 'WhatsApp account not found' });
    }

    const agentManager = AgentManager.getInstance();
    const client = agentManager.getClient(req.params.id);

    if (!client || client.getStatus() !== 'connected') {
      return res.status(400).json({ error: 'WhatsApp client not connected' });
    }

    const agentId = account.agent_id;
    const accountId = req.params.id;
    logger.info(`Chat sync requested for account ${accountId}, agentId: ${agentId}`);

    // Return immediately - sync runs in background
    res.json({
      success: true,
      message: 'Chat sync started. Progress will be sent via WebSocket.',
      accountId,
      agentId
    });

    // Run sync in background
    setImmediate(async () => {
      try {
        // Emit: Started
        emitSyncStatus(agentId, 'chats', 'started', { message: 'Starting chat sync...' });

        // Use the new syncChatsAndMessages method with progress callback
        const result = await client.syncChatsAndMessages((progress) => {
          let status = 'syncing_chats';
          if (progress.phase === 'fetching') {
            status = 'started';
          } else if (progress.phase === 'syncing_chats') {
            status = 'syncing_chats';
          } else if (progress.phase === 'syncing_messages') {
            status = 'syncing_messages';
          } else if (progress.phase === 'error') {
            status = 'error';
          }

          emitSyncStatus(agentId, 'chats', status, {
            message: progress.message,
            current: progress.current,
            total: progress.total,
            subStep: progress.subStep,
            stats: progress.stats
          });
        });

        // Emit: Complete or Error
        if (result.synced) {
          emitSyncStatus(agentId, 'chats', 'completed', {
            message: 'Chat sync completed successfully!',
            stats: {
              conversationsSynced: result.conversationsSynced || 0,
              conversationsExisting: result.conversationsExisting || 0,
              conversationsSkipped: result.conversationsSkipped || 0,
              conversationsLinked: result.conversationsLinked || 0,
              messagesSynced: result.messagesSynced || 0
            }
          });
          logger.info(`Chat sync completed for account ${accountId}: ${result.conversationsSynced} conversations, ${result.messagesSynced} messages`);
        } else {
          emitSyncStatus(agentId, 'chats', 'error', {
            message: result.error || 'Chat sync failed',
            stats: {
              conversationsSynced: result.conversationsSynced || 0,
              conversationsExisting: result.conversationsExisting || 0,
              messagesSynced: result.messagesSynced || 0
            }
          });
          logger.error(`Chat sync error for account ${accountId}: ${result.error}`);
        }
      } catch (bgError) {
        logger.error(`Chat sync background error for account ${accountId}: ${bgError.message}`);
        emitSyncStatus(agentId, 'chats', 'error', {
          message: `Chat sync failed: ${bgError.message}`
        });
      }
    });

  } catch (error) {
    logger.error(`Failed to sync chats: ${error.message}`);
    // Try to emit error status if we have agentId
    try {
      const account = getDatabase().prepare(`
        SELECT agent_id FROM platform_accounts WHERE id = ?
      `).get(req.params.id);
      if (account?.agent_id) {
        emitSyncStatus(account.agent_id, 'chats', 'error', {
          message: `Chat sync failed: ${error.message}`
        });
      }
    } catch (e) {
      // Ignore emit errors
    }
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/platforms/:id/force-resync
 * Delete all conversations/messages and perform fresh sync
 * Emits WebSocket events for progress tracking
 * NOTE: This endpoint returns immediately and runs sync in background
 */
router.post('/:id/force-resync', authenticate, async (req, res) => {
  try {
    const db = getDatabase();

    // Verify ownership
    const account = db.prepare(`
      SELECT pa.id, pa.platform, pa.agent_id, a.user_id
      FROM platform_accounts pa
      JOIN agents a ON a.id = pa.agent_id
      WHERE pa.id = ? AND a.user_id = ? AND pa.platform = 'whatsapp'
    `).get(req.params.id, req.user.id);

    if (!account) {
      return res.status(404).json({ error: 'WhatsApp account not found' });
    }

    const agentManager = AgentManager.getInstance();
    const client = agentManager.getClient(req.params.id);

    if (!client || client.getStatus() !== 'connected') {
      return res.status(400).json({ error: 'WhatsApp client not connected' });
    }

    const agentId = account.agent_id;
    const accountId = req.params.id;
    logger.info(`Force resync requested for account ${accountId}, agentId: ${agentId}`);

    // Return immediately - sync runs in background
    res.json({
      success: true,
      message: 'Force resync started. Progress will be sent via WebSocket.',
      accountId,
      agentId
    });

    // Run sync in background (async, fire-and-forget)
    setImmediate(async () => {
      let messagesDeleted = 0;
      let conversationsDeleted = 0;

      try {
        // Emit: Started
        emitResyncStatus(agentId, 'started', { message: 'Starting force resync...' });

        // Step 1: Delete messages
        emitResyncStatus(agentId, 'deleting_messages', { message: 'Deleting existing messages...' });
        const deleteMessagesResult = db.prepare(`
          DELETE FROM messages
          WHERE conversation_id IN (
            SELECT id FROM conversations WHERE agent_id = ?
          )
        `).run(agentId);
        messagesDeleted = deleteMessagesResult.changes;
        logger.info(`Deleted ${messagesDeleted} messages`);

        // Step 2: Delete conversations
        emitResyncStatus(agentId, 'deleting_conversations', {
          message: 'Deleting existing conversations...',
          messagesDeleted
        });
        const deleteConversationsResult = db.prepare(`
          DELETE FROM conversations WHERE agent_id = ?
        `).run(agentId);
        conversationsDeleted = deleteConversationsResult.changes;
        logger.info(`Deleted ${conversationsDeleted} conversations`);

        // Use the new sync method with detailed progress callback
        const result = await client.syncToDatabaseWithProgress((progress) => {
          // Map internal progress to frontend status
          let status = 'syncing_contacts';
          let message = progress.message;

          if (progress.step === 'contacts') {
            status = 'syncing_contacts';
            if (progress.phase === 'fetching') {
              message = 'Fetching contacts from WhatsApp...';
            } else if (progress.total > 0) {
              message = `Syncing contacts: ${progress.current}/${progress.total}`;
            }
          } else if (progress.step === 'chats') {
            status = 'syncing_chats';
            if (progress.phase === 'fetching') {
              message = 'Fetching chat list from WhatsApp...';
            } else if (progress.total > 0) {
              message = `Syncing chats: ${progress.current}/${progress.total}`;
            }
          } else if (progress.step === 'messages') {
            status = 'syncing_messages';
            if (progress.total > 0) {
              message = `Syncing messages: ${progress.current}/${progress.total} chats (${progress.stats?.messagesSynced || 0} messages)`;
            }
          } else if (progress.step === 'complete') {
            status = 'completed';
          } else if (progress.step === 'error') {
            status = 'error';
          }

          emitResyncStatus(agentId, status, {
            message,
            messagesDeleted,
            conversationsDeleted,
            // Detailed progress info
            step: progress.step,
            phase: progress.phase,
            current: progress.current,
            total: progress.total,
            subStep: progress.subStep,
            stats: progress.stats
          });
        });

        // Emit: Complete or Error
        if (result.synced) {
          emitResyncStatus(agentId, 'completed', {
            message: 'Force resync completed successfully!',
            messagesDeleted,
            conversationsDeleted,
            contactsSynced: result.contactsSynced || 0,
            contactsExisting: result.contactsExisting || 0,
            conversationsSynced: result.conversationsSynced || 0,
            conversationsExisting: result.conversationsExisting || 0,
            messagesSynced: result.messagesSynced || 0
          });
          logger.info(`Force resync completed for account ${accountId}: ${result.contactsSynced} contacts, ${result.conversationsSynced} conversations, ${result.messagesSynced} messages`);
        } else {
          emitResyncStatus(agentId, 'error', {
            message: result.error || 'Resync completed with errors',
            messagesDeleted,
            conversationsDeleted,
            contactsSynced: result.contactsSynced || 0,
            conversationsSynced: result.conversationsSynced || 0,
            messagesSynced: result.messagesSynced || 0
          });
          logger.error(`Force resync error for account ${accountId}: ${result.error}`);
        }
      } catch (bgError) {
        logger.error(`Force resync background error for account ${accountId}: ${bgError.message}`);
        emitResyncStatus(agentId, 'error', {
          message: `Resync failed: ${bgError.message}`,
          messagesDeleted,
          conversationsDeleted
        });
      }
    });

  } catch (error) {
    logger.error(`Failed to force resync: ${error.message}`);
    // Try to emit error status if we have agentId
    try {
      const account = getDatabase().prepare(`
        SELECT agent_id FROM platform_accounts WHERE id = ?
      `).get(req.params.id);
      if (account?.agent_id) {
        emitResyncStatus(account.agent_id, 'error', {
          message: `Force resync failed: ${error.message}`
        });
      }
    } catch (e) {
      // Ignore emit errors
    }
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/platforms/:id/conversations/:conversationId/sync
 * Sync messages for a specific conversation (by chatID)
 * Fetches recent messages from WhatsApp for a single chat
 * @param {number} limit - Optional message limit (default: 100, max: 500)
 */
router.post('/:id/conversations/:conversationId/sync', authenticate, async (req, res) => {
  try {
    const db = getDatabase();
    const { limit: queryLimit } = req.body;
    const limit = Math.min(Math.max(parseInt(queryLimit) || 100, 1), 500);

    // Verify ownership
    const account = db.prepare(`
      SELECT pa.id, pa.platform, pa.agent_id
      FROM platform_accounts pa
      JOIN agents a ON a.id = pa.agent_id
      WHERE pa.id = ? AND a.user_id = ? AND pa.platform = 'whatsapp'
    `).get(req.params.id, req.user.id);

    if (!account) {
      return res.status(404).json({ error: 'WhatsApp account not found' });
    }

    // Verify conversation belongs to this user
    const conversation = db.prepare(`
      SELECT id, external_id, title FROM conversations
      WHERE id = ? AND user_id = ? AND platform = 'whatsapp'
    `).get(req.params.conversationId, req.user.id);

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const agentManager = AgentManager.getInstance();
    const client = agentManager.getClient(req.params.id);

    if (!client || client.getStatus() !== 'connected') {
      return res.status(400).json({ error: 'WhatsApp client not connected' });
    }

    // Sync messages for this specific conversation
    const result = await client.fetchMessagesForConversation(req.params.conversationId, limit);

    if (result.synced) {
      // Get updated message count for this conversation
      const msgCount = db.prepare(`
        SELECT COUNT(*) as count FROM messages WHERE conversation_id = ?
      `).get(req.params.conversationId);

      // Get the latest and oldest message timestamps
      const timeRange = db.prepare(`
        SELECT MIN(created_at) as oldest, MAX(created_at) as newest
        FROM messages WHERE conversation_id = ?
      `).get(req.params.conversationId);

      res.json({
        success: true,
        messagesSynced: result.messagesSynced,
        totalMessages: msgCount?.count || 0,
        oldestMessage: timeRange?.oldest || null,
        newestMessage: timeRange?.newest || null,
        conversationId: req.params.conversationId,
        chatTitle: conversation.title
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error || 'Sync failed'
      });
    }

  } catch (error) {
    logger.error(`Failed to sync conversation: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/platforms/:id/emails
 * Get emails from an email account
 */
router.get('/:id/emails', async (req, res) => {
  try {
    const db = getDatabase();

    // Verify ownership
    const account = db.prepare(`
      SELECT id, platform FROM platform_accounts
      WHERE id = ? AND user_id = ? AND platform = 'email'
    `).get(req.params.id, req.user.id);

    if (!account) {
      return res.status(404).json({ error: 'Email account not found' });
    }

    const agentManager = AgentManager.getInstance();
    const client = agentManager.getClient(req.params.id);

    if (!client || client.getStatus() !== 'connected') {
      return res.status(400).json({ error: 'Email client not connected' });
    }

    const { folder = 'INBOX', limit = 50 } = req.query;
    const emails = await client.getEmails(folder, parseInt(limit));

    res.json({ emails });

  } catch (error) {
    logger.error(`Failed to get emails: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/platforms/:id/folders
 * Get email folders
 */
router.get('/:id/folders', async (req, res) => {
  try {
    const db = getDatabase();

    // Verify ownership
    const account = db.prepare(`
      SELECT id, platform FROM platform_accounts
      WHERE id = ? AND user_id = ? AND platform = 'email'
    `).get(req.params.id, req.user.id);

    if (!account) {
      return res.status(404).json({ error: 'Email account not found' });
    }

    const agentManager = AgentManager.getInstance();
    const client = agentManager.getClient(req.params.id);

    if (!client || client.getStatus() !== 'connected') {
      return res.status(400).json({ error: 'Email client not connected' });
    }

    const folders = await client.getFolders();

    res.json({ folders });

  } catch (error) {
    logger.error(`Failed to get folders: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Orphaned Sessions Management
// ============================================

/**
 * GET /api/platforms/orphaned-sessions
 * List orphaned WhatsApp session folders (folders without matching platform_account)
 */
router.get('/orphaned-sessions', (req, res) => {
  try {
    const { sessionCleanupService } = require('../services/sessionCleanupService.cjs');
    const orphaned = sessionCleanupService.getOrphanedSessions();

    // Add formatted size to each session
    const sessionsWithSize = orphaned.map(session => ({
      ...session,
      sizeFormatted: sessionCleanupService.formatSize(session.sizeBytes)
    }));

    res.json({
      sessions: sessionsWithSize,
      count: orphaned.length,
      totalSize: orphaned.reduce((sum, s) => sum + s.sizeBytes, 0),
      totalSizeFormatted: sessionCleanupService.formatSize(
        orphaned.reduce((sum, s) => sum + s.sizeBytes, 0)
      )
    });
  } catch (error) {
    logger.error(`Failed to get orphaned sessions: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/platforms/orphaned-sessions/:sessionId
 * Delete a specific orphaned session folder
 */
router.delete('/orphaned-sessions/:sessionId', (req, res) => {
  try {
    const { sessionCleanupService } = require('../services/sessionCleanupService.cjs');
    const deleted = sessionCleanupService.deleteOrphanedSession(req.params.sessionId);

    if (deleted) {
      res.json({ success: true, message: `Session ${req.params.sessionId} deleted` });
    } else {
      res.status(404).json({ success: false, error: 'Session not found or not orphaned' });
    }
  } catch (error) {
    logger.error(`Failed to delete orphaned session: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/platforms/orphaned-sessions
 * Delete all orphaned session folders
 */
router.delete('/orphaned-sessions', (req, res) => {
  try {
    const { sessionCleanupService } = require('../services/sessionCleanupService.cjs');
    const result = sessionCleanupService.cleanupAllOrphaned();

    res.json({
      success: true,
      deleted: result.deleted,
      total: result.total,
      message: `Deleted ${result.deleted}/${result.total} orphaned sessions`
    });
  } catch (error) {
    logger.error(`Failed to cleanup orphaned sessions: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
