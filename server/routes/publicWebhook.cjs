/**
 * Public Webhook Routes
 * Handles incoming webhook triggers for flows (no authentication middleware)
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('../services/database.cjs');
const { logger } = require('../services/logger.cjs');
const { WebhookTriggerNode } = require('../services/flow/nodes/triggers/WebhookTriggerNode.cjs');

const router = express.Router();

// Middleware to capture raw body for HMAC validation
router.use(express.json({
  verify: (req, res, buf) => {
    // Store raw body for HMAC signature validation
    req.rawBody = buf.toString('utf8');
  }
}));

/**
 * POST /public/webhook/:flowId/:path*
 * Trigger a flow via webhook
 *
 * Authentication is handled by the WebhookTriggerNode configuration
 */
router.all('/webhook/:flowId/*', async (req, res) => {
  const startTime = Date.now();
  const { flowId } = req.params;
  const webhookPath = '/' + (req.params[0] || ''); // Reconstruct path after flowId

  logger.info(`Webhook received: ${req.method} ${webhookPath} for flow ${flowId}`);

  try {
    const db = getDatabase();

    // Get the flow
    const flow = db.prepare('SELECT * FROM flows WHERE id = ?').get(flowId);

    if (!flow) {
      logger.warn(`Webhook flow not found: ${flowId}`);
      return res.status(404).json({
        error: 'Flow not found',
        flowId,
      });
    }

    // Check if flow is active
    if (flow.status !== 'active') {
      logger.warn(`Webhook flow is not active: ${flowId} (status: ${flow.status})`);
      return res.status(403).json({
        error: 'Flow is not active',
        flowId,
        status: flow.status,
      });
    }

    // Parse flow nodes
    let nodes = [];
    try {
      nodes = flow.nodes ? JSON.parse(flow.nodes) : [];
    } catch (e) {
      logger.error(`Failed to parse flow nodes: ${e.message}`);
      return res.status(500).json({
        error: 'Invalid flow configuration',
        details: 'Failed to parse flow nodes',
      });
    }

    // Find the webhook trigger node matching this path
    const webhookNode = nodes.find(n =>
      n.type === 'trigger:webhook' &&
      n.data?.webhookPath === webhookPath
    );

    if (!webhookNode) {
      logger.warn(`No webhook trigger node found for path: ${webhookPath} in flow ${flowId}`);
      return res.status(404).json({
        error: 'Webhook trigger not found',
        flowId,
        webhookPath,
        hint: 'Check that your flow has a webhook trigger node with this exact path',
      });
    }

    // Get authentication configuration from webhook node
    const authConfig = webhookNode.data?.authentication;

    // Validate authentication
    const authResult = WebhookTriggerNode.validateAuthentication(req, authConfig);

    if (authConfig?.enabled && !authResult.authenticated) {
      logger.warn(`Webhook authentication failed for flow ${flowId}: ${authResult.reason}`);
      return res.status(401).json({
        error: 'Unauthorized',
        message: authResult.reason,
        authMethod: authResult.method,
      });
    }

    // Extract webhook data
    const webhookData = {
      flowId,
      webhookPath,
      method: req.method,
      headers: req.headers,
      query: req.query,
      body: req.body,
      authResult,
    };

    // Log webhook execution
    const webhookLogId = uuidv4();
    db.prepare(`
      INSERT INTO webhook_executions (id, flow_id, webhook_path, method, request, auth_method, authenticated, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      webhookLogId,
      flowId,
      webhookPath,
      req.method,
      JSON.stringify({ headers: req.headers, query: req.query, body: req.body }),
      authResult.method,
      authResult.authenticated ? 1 : 0,
      'pending'
    );

    // Execute flow (async, don't wait for completion)
    // We'll return the response immediately
    executeFlowAsync(flow, webhookNode, webhookData, webhookLogId);

    // Get response configuration from webhook node
    const responseConfig = webhookNode.data?.response || {};
    const statusCode = parseInt(responseConfig.statusCode, 10) || 200;
    const responseHeaders = responseConfig.headers || { 'Content-Type': 'application/json' };
    let responseBody = responseConfig.body || JSON.stringify({
      success: true,
      message: 'Webhook received',
      executionId: webhookLogId,
    });

    // If body is not a string, stringify it
    if (typeof responseBody !== 'string') {
      responseBody = JSON.stringify(responseBody);
    }

    // Template resolution would require flow variables, which we don't have yet
    // For now, replace simple placeholders
    responseBody = responseBody
      .replace(/\{\{flowId\}\}/g, flowId)
      .replace(/\{\{webhookPath\}\}/g, webhookPath)
      .replace(/\{\{executionId\}\}/g, webhookLogId)
      .replace(/\{\{timestamp\}\}/g, new Date().toISOString());

    // Set response headers
    Object.entries(responseHeaders).forEach(([key, value]) => {
      res.setHeader(key, value);
    });

    // Send response
    const duration = Date.now() - startTime;
    logger.info(`Webhook processed in ${duration}ms, returning ${statusCode}`);

    res.status(statusCode).send(responseBody);

  } catch (error) {
    logger.error(`Webhook error: ${error.message}`, { error, flowId, path: webhookPath });
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to process webhook',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * Execute flow asynchronously and update webhook log
 */
async function executeFlowAsync(flow, webhookNode, webhookData, webhookLogId) {
  const db = getDatabase();

  try {
    // Load FlowExecutionEngine dynamically
    const { FlowExecutionEngine } = require('../services/flow/FlowExecutionEngine.cjs');
    const { registerAllNodes } = require('../services/flow/nodes/index.cjs');

    // Create engine and register nodes
    const engine = new FlowExecutionEngine();
    registerAllNodes(engine);

    // Prepare flow object with parsed data
    const flowObj = {
      id: flow.id,
      name: flow.name,
      nodes: typeof flow.nodes === 'string' ? JSON.parse(flow.nodes) : flow.nodes,
      edges: typeof flow.edges === 'string' ? JSON.parse(flow.edges) : flow.edges,
      variables: typeof flow.variables === 'string' ? JSON.parse(flow.variables) : flow.variables,
    };

    // Execute flow
    const result = await engine.execute(flowObj, {
      input: webhookData,
      trigger: {
        type: 'webhook',
        source: 'http',
        timestamp: new Date().toISOString(),
      },
      userId: flow.user_id,
      timeout: 120000, // 2 minute timeout for webhook executions
    });

    // Update webhook log with success
    db.prepare(`
      UPDATE webhook_executions
      SET status = ?, response = ?, completed_at = datetime('now')
      WHERE id = ?
    `).run('completed', JSON.stringify(result.output), webhookLogId);

    logger.info(`Webhook flow ${flow.id} executed successfully`);

  } catch (error) {
    logger.error(`Webhook flow execution failed: ${error.message}`, { error, flowId: flow.id });

    // Update webhook log with error
    db.prepare(`
      UPDATE webhook_executions
      SET status = ?, error = ?, completed_at = datetime('now')
      WHERE id = ?
    `).run('failed', error.message, webhookLogId);
  }
}

// ============================================
// Telegram Bot Webhook Endpoints
// ============================================

/**
 * POST /public/telegram/:accountId
 * Telegram Bot Webhook Endpoint - receives updates from Telegram
 */
router.post('/telegram/:accountId', async (req, res) => {
  const { accountId } = req.params;
  const secretToken = req.headers['x-telegram-bot-api-secret-token'];

  logger.info(`Telegram webhook received for account ${accountId}`);

  try {
    const { AgentManager } = require('../agents/agentManager.cjs');
    const agentManager = AgentManager.getInstance();
    const client = agentManager.getClient(accountId);

    if (!client) {
      logger.warn(`Telegram webhook: Account ${accountId} not found or not connected`);
      return res.status(404).json({ error: 'Account not found or not connected' });
    }

    // Validate secret token if configured
    if (client.getWebhookSecretToken && client.getWebhookSecretToken()) {
      if (!client.validateWebhookSecret(secretToken)) {
        logger.warn(`Invalid webhook secret for account ${accountId}`);
        return res.status(401).json({ error: 'Invalid secret token' });
      }
    }

    // Process the update
    const update = req.body;
    client.processWebhookUpdate(update);

    // Telegram expects 200 OK
    res.status(200).send('OK');
  } catch (error) {
    logger.error(`Telegram webhook error: ${error.message}`);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

/**
 * GET /public/telegram/:accountId
 * Telegram webhook health check
 */
router.get('/telegram/:accountId', (req, res) => {
  res.json({
    status: 'active',
    accountId: req.params.accountId,
    timestamp: new Date().toISOString()
  });
});

// ============================================
// WhatsApp Business API Webhook Endpoints
// ============================================

/**
 * POST /public/whatsapp-business/:accountId
 * WhatsApp Business API Webhook - receives messages from Meta
 * Validates HMAC signature if app secret is configured
 */
router.post('/whatsapp-business/:accountId', async (req, res) => {
  const { accountId } = req.params;
  const signature = req.headers['x-hub-signature-256'];

  logger.info(`WhatsApp Business webhook received for account ${accountId}`);

  try {
    const db = getDatabase();

    // Get account configuration
    const account = db.prepare(`
      SELECT pa.*, a.user_id
      FROM platform_accounts pa
      LEFT JOIN agents a ON pa.agent_id = a.id
      WHERE pa.id = ?
    `).get(accountId);

    if (!account) {
      logger.warn(`WhatsApp Business webhook: Account ${accountId} not found`);
      return res.status(404).json({ error: 'Account not found' });
    }

    // Parse config for app secret
    let appSecret = null;
    if (account.credentials_encrypted) {
      try {
        const { decrypt } = require('../agents/agentManager.cjs');
        const credentialsJson = decrypt(account.credentials_encrypted);
        const credentials = JSON.parse(credentialsJson);
        appSecret = credentials?.appSecret;
      } catch (e) {
        logger.debug('Could not decrypt credentials for HMAC validation');
      }
    }

    // Validate HMAC signature if app secret is configured
    if (appSecret) {
      const { WhatsAppBusinessClient } = require('../platforms/whatsappBusinessClient.cjs');
      const validation = WhatsAppBusinessClient.validateWebhookSignature(
        req.rawBody,
        signature,
        appSecret
      );

      if (!validation.valid) {
        logger.warn(`WhatsApp Business webhook: Invalid signature for account ${accountId}: ${validation.reason}`);
        return res.status(401).json({
          error: 'Unauthorized',
          message: validation.reason,
        });
      }

      logger.debug('WhatsApp Business webhook signature validated');
    }

    // Get the client and process webhook
    const { AgentManager } = require('../agents/agentManager.cjs');
    const agentManager = AgentManager.getInstance();
    const client = agentManager.getClient(accountId);

    if (client && typeof client.processWebhook === 'function') {
      client.processWebhook(req.body);
    } else {
      logger.warn(`WhatsApp Business client not connected for account ${accountId}`);
    }

    // Meta expects 200 OK quickly to avoid retries
    res.status(200).send('OK');

  } catch (error) {
    logger.error(`WhatsApp Business webhook error: ${error.message}`);
    // Still return 200 to prevent Meta from disabling the webhook
    res.status(200).send('OK');
  }
});

/**
 * GET /public/whatsapp-business/:accountId
 * WhatsApp Business API Webhook Verification
 * Meta sends a verification request when setting up webhooks
 */
router.get('/whatsapp-business/:accountId', async (req, res) => {
  const { accountId } = req.params;
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  logger.info(`WhatsApp Business webhook verification for account ${accountId}`);

  try {
    const db = getDatabase();

    // Get account configuration
    const account = db.prepare('SELECT * FROM platform_accounts WHERE id = ?').get(accountId);

    if (!account) {
      logger.warn(`WhatsApp Business verification: Account ${accountId} not found`);
      return res.status(404).send('Account not found');
    }

    // Get verify token from credentials
    let verifyToken = null;
    if (account.credentials_encrypted) {
      try {
        const { decrypt } = require('../agents/agentManager.cjs');
        const credentialsJson = decrypt(account.credentials_encrypted);
        const credentials = JSON.parse(credentialsJson);
        verifyToken = credentials?.webhookVerifyToken;
      } catch (e) {
        logger.debug('Could not decrypt credentials for verification');
      }
    }

    // Verify the token
    if (mode === 'subscribe' && token === verifyToken) {
      logger.info(`WhatsApp Business webhook verified for account ${accountId}`);
      return res.status(200).send(challenge);
    }

    logger.warn(`WhatsApp Business verification failed for account ${accountId}`);
    return res.status(403).send('Verification failed');

  } catch (error) {
    logger.error(`WhatsApp Business verification error: ${error.message}`);
    return res.status(500).send('Error');
  }
});

module.exports = router;
