/**
 * Agent Routes
 * CRUD operations for agents
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('../services/database.cjs');
const { logger } = require('../services/logger.cjs');
const { authenticate } = require('./auth.cjs');
const { transformBooleans, parseJsonFields, createPagination } = require('../utils/responseHelpers.cjs');

const router = express.Router();

// Apply authentication to all routes
router.use(authenticate);

/**
 * Transform agent row from database to API response format
 */
function transformAgent(agent) {
  if (!agent) return null;

  // Parse skills from JSON string
  let skills = [];
  try {
    skills = agent.skills ? JSON.parse(agent.skills) : [];
  } catch (e) {
    skills = [];
  }

  return {
    id: agent.id,
    userId: agent.user_id,
    name: agent.name,
    description: agent.description,
    avatar: agent.avatar,
    systemPrompt: agent.system_prompt,
    // Return both naming conventions for compatibility
    aiProvider: agent.ai_provider,
    aiModel: agent.ai_model,
    provider: agent.ai_provider || 'openrouter',  // Frontend expects 'provider'
    model: agent.ai_model || '',                  // Frontend expects 'model'
    skills: skills,                               // Array of skill strings
    temperature: agent.temperature ?? 0.7,
    maxTokens: agent.max_tokens ?? 4096,
    reputationScore: agent.reputation_score ?? 100,
    status: agent.status,
    autoResponse: !!agent.auto_response,
    platformCount: agent.platform_count,
    conversationCount: agent.conversation_count,
    metadata: agent.metadata ? JSON.parse(agent.metadata) : null,
    settings: agent.settings ? JSON.parse(agent.settings) : null,
    createdAt: agent.created_at,
    updatedAt: agent.updated_at
  };
}

/**
 * GET /api/agents
 * List all agents for the current user
 */
router.get('/', (req, res) => {
  try {
    const db = getDatabase();
    const { limit = 50, offset = 0 } = req.query;

    // Get total count
    const totalCount = db.prepare('SELECT COUNT(*) as count FROM agents WHERE user_id = ?')
      .get(req.user.id).count;

    const agents = db.prepare(`
      SELECT
        a.*,
        (SELECT COUNT(*) FROM platform_accounts WHERE agent_id = a.id) as platform_count,
        (SELECT COUNT(*) FROM conversations WHERE agent_id = a.id) as conversation_count
      FROM agents a
      WHERE a.user_id = ?
      ORDER BY a.created_at DESC
      LIMIT ? OFFSET ?
    `).all(req.user.id, parseInt(limit), parseInt(offset));

    // Get platform accounts for each agent and transform
    const agentsWithPlatforms = agents.map(agent => {
      const platforms = db.prepare(`
        SELECT id, platform, status, connection_metadata
        FROM platform_accounts
        WHERE agent_id = ?
      `).all(agent.id);

      const transformed = transformAgent(agent);
      transformed.platforms = platforms.map(p => ({
        id: p.id,
        platform: p.platform,
        status: p.status,
        metadata: p.connection_metadata ? JSON.parse(p.connection_metadata) : null
      }));
      return transformed;
    });

    res.json({
      agents: agentsWithPlatforms,
      pagination: createPagination(agentsWithPlatforms, {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: totalCount
      })
    });

  } catch (error) {
    logger.error(`Failed to list agents: ${error.message}`);
    res.status(500).json({ error: 'Failed to list agents' });
  }
});

/**
 * GET /api/agents/:id
 * Get a single agent
 */
router.get('/:id', (req, res) => {
  try {
    const db = getDatabase();

    const agent = db.prepare(`
      SELECT * FROM agents WHERE id = ? AND user_id = ?
    `).get(req.params.id, req.user.id);

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Get platform accounts
    const platforms = db.prepare(`
      SELECT id, platform, status, connection_metadata, last_connected_at, last_error
      FROM platform_accounts
      WHERE agent_id = ?
    `).all(agent.id);

    const transformed = transformAgent(agent);
    transformed.platforms = platforms.map(p => ({
      id: p.id,
      platform: p.platform,
      status: p.status,
      metadata: p.connection_metadata ? JSON.parse(p.connection_metadata) : null,
      lastConnectedAt: p.last_connected_at,
      lastError: p.last_error
    }));

    res.json({ agent: transformed });

  } catch (error) {
    logger.error(`Failed to get agent: ${error.message}`);
    res.status(500).json({ error: 'Failed to get agent' });
  }
});

/**
 * POST /api/agents
 * Create a new agent
 */
router.post('/', (req, res) => {
  try {
    const {
      name,
      description,
      systemPrompt,
      aiProvider,
      aiModel,
      provider,     // Frontend uses 'provider'
      model,        // Frontend uses 'model'
      skills,
      temperature,
      maxTokens,
      autoResponse
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Agent name is required' });
    }

    const db = getDatabase();
    const agentId = uuidv4();

    // Accept both naming conventions
    const providerValue = aiProvider ?? provider ?? 'openrouter';
    const modelValue = aiModel ?? model ?? null;
    const skillsValue = skills ? JSON.stringify(skills) : '[]';

    db.prepare(`
      INSERT INTO agents (
        id, user_id, name, description, system_prompt,
        ai_provider, ai_model, skills, temperature, max_tokens, auto_response
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      agentId,
      req.user.id,
      name,
      description || null,
      systemPrompt || null,
      providerValue,
      modelValue,
      skillsValue,
      temperature ?? 0.7,
      maxTokens ?? 4096,
      autoResponse ? 1 : 0
    );

    const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(agentId);

    logger.info(`Agent created: ${name} (${agentId})`);

    res.status(201).json({ agent: transformAgent(agent) });

  } catch (error) {
    logger.error(`Failed to create agent: ${error.message}`);
    res.status(500).json({ error: 'Failed to create agent' });
  }
});

/**
 * PUT /api/agents/:id
 * Update an agent
 */
router.put('/:id', (req, res) => {
  try {
    const db = getDatabase();

    // Verify ownership
    const existing = db.prepare('SELECT id FROM agents WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!existing) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    const {
      name,
      description,
      status,
      systemPrompt,
      aiProvider,
      aiModel,
      provider,     // Frontend uses 'provider'
      model,        // Frontend uses 'model'
      skills,
      temperature,
      maxTokens,
      autoResponse
    } = req.body;

    const updates = [];
    const params = [];

    if (name !== undefined) { updates.push('name = ?'); params.push(name); }
    if (description !== undefined) { updates.push('description = ?'); params.push(description); }
    if (status !== undefined) { updates.push('status = ?'); params.push(status); }
    if (systemPrompt !== undefined) { updates.push('system_prompt = ?'); params.push(systemPrompt); }
    // Accept both aiProvider and provider
    const providerValue = aiProvider ?? provider;
    if (providerValue !== undefined) { updates.push('ai_provider = ?'); params.push(providerValue); }
    // Accept both aiModel and model
    const modelValue = aiModel ?? model;
    if (modelValue !== undefined) { updates.push('ai_model = ?'); params.push(modelValue); }
    // Skills as JSON array
    if (skills !== undefined) { updates.push('skills = ?'); params.push(JSON.stringify(skills)); }
    if (temperature !== undefined) { updates.push('temperature = ?'); params.push(temperature); }
    if (maxTokens !== undefined) { updates.push('max_tokens = ?'); params.push(maxTokens); }
    if (autoResponse !== undefined) { updates.push('auto_response = ?'); params.push(autoResponse ? 1 : 0); }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push('updated_at = datetime(\'now\')');
    params.push(req.params.id);

    db.prepare(`UPDATE agents SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id);

    logger.info(`Agent updated: ${agent.name} (${req.params.id})`);

    res.json({ agent: transformAgent(agent) });

  } catch (error) {
    logger.error(`Failed to update agent: ${error.message}`);
    res.status(500).json({ error: 'Failed to update agent' });
  }
});

/**
 * DELETE /api/agents/:id
 * Delete an agent
 */
router.delete('/:id', async (req, res) => {
  try {
    const db = getDatabase();

    // Verify ownership
    const agent = db.prepare('SELECT * FROM agents WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Disconnect any connected platform accounts
    const { AgentManager } = require('../agents/agentManager.cjs');
    const agentManager = AgentManager.getInstance();

    const accounts = db.prepare('SELECT id FROM platform_accounts WHERE agent_id = ?')
      .all(req.params.id);

    for (const account of accounts) {
      await agentManager.disconnect(account.id);

      // Clean up WhatsApp session folder if exists
      const sessionPath = path.join(__dirname, '..', 'data', 'whatsapp-sessions', `session-${account.id}`);
      if (fs.existsSync(sessionPath)) {
        fs.rmSync(sessionPath, { recursive: true, force: true });
        logger.info(`Deleted WhatsApp session folder: session-${account.id}`);
      }
    }

    // Delete platform accounts
    db.prepare('DELETE FROM platform_accounts WHERE agent_id = ?').run(req.params.id);

    // Delete linked agentic_profile (if exists)
    db.prepare('DELETE FROM agentic_profiles WHERE agent_id = ?').run(req.params.id);

    // Delete conversations (messages cascade)
    db.prepare('DELETE FROM conversations WHERE agent_id = ?').run(req.params.id);

    // Delete agent
    db.prepare('DELETE FROM agents WHERE id = ?').run(req.params.id);

    logger.info(`Agent deleted: ${agent.name} (${req.params.id})`);

    res.json({ message: 'Agent deleted successfully' });

  } catch (error) {
    logger.error(`Failed to delete agent: ${error.message}`);
    res.status(500).json({ error: 'Failed to delete agent' });
  }
});

// ============================================
// Agent Activation
// ============================================

/**
 * POST /api/agents/:id/activate
 * Activate an agent (set status to active)
 */
router.post('/:id/activate', async (req, res) => {
  try {
    const db = getDatabase();

    // Verify ownership
    const agent = db.prepare('SELECT * FROM agents WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    if (agent.status === 'idle') {
      return res.json({ agent: transformAgent(agent), message: 'Agent already active' });
    }

    // Update status to 'idle' (active state in the CHECK constraint)
    db.prepare("UPDATE agents SET status = 'idle', updated_at = datetime('now') WHERE id = ?")
      .run(req.params.id);

    // Reconnect platform accounts
    const { AgentManager } = require('../agents/agentManager.cjs');
    const agentManager = AgentManager.getInstance();

    const accounts = db.prepare('SELECT id FROM platform_accounts WHERE agent_id = ?')
      .all(req.params.id);

    for (const account of accounts) {
      try {
        await agentManager.connect(account.id);
      } catch (err) {
        logger.warn(`Failed to reconnect account ${account.id}: ${err.message}`);
      }
    }

    const updatedAgent = db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id);

    logger.info(`Agent activated: ${agent.name} (${req.params.id})`);

    // Broadcast status change
    if (global.wsBroadcast) {
      global.wsBroadcast('agent:status_changed', {
        agentId: req.params.id,
        status: 'idle'
      }, req.params.id);
    }

    res.json({ agent: transformAgent(updatedAgent), message: 'Agent activated' });

  } catch (error) {
    logger.error(`Failed to activate agent: ${error.message}`);
    res.status(500).json({ error: 'Failed to activate agent' });
  }
});

/**
 * POST /api/agents/:id/deactivate
 * Deactivate an agent (set status to offline)
 */
router.post('/:id/deactivate', async (req, res) => {
  try {
    const db = getDatabase();

    // Verify ownership
    const agent = db.prepare('SELECT * FROM agents WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    if (agent.status === 'offline') {
      return res.json({ agent: transformAgent(agent), message: 'Agent already offline' });
    }

    // Disconnect platform accounts first
    const { AgentManager } = require('../agents/agentManager.cjs');
    const agentManager = AgentManager.getInstance();

    const accounts = db.prepare('SELECT id FROM platform_accounts WHERE agent_id = ?')
      .all(req.params.id);

    for (const account of accounts) {
      try {
        await agentManager.disconnect(account.id);
      } catch (err) {
        logger.warn(`Failed to disconnect account ${account.id}: ${err.message}`);
      }
    }

    // Update status to 'offline' (inactive state in the CHECK constraint)
    db.prepare("UPDATE agents SET status = 'offline', updated_at = datetime('now') WHERE id = ?")
      .run(req.params.id);

    const updatedAgent = db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id);

    logger.info(`Agent deactivated: ${agent.name} (${req.params.id})`);

    // Broadcast status change
    if (global.wsBroadcast) {
      global.wsBroadcast('agent:status_changed', {
        agentId: req.params.id,
        status: 'offline'
      }, req.params.id);
    }

    res.json({ agent: transformAgent(updatedAgent), message: 'Agent deactivated' });

  } catch (error) {
    logger.error(`Failed to deactivate agent: ${error.message}`);
    res.status(500).json({ error: 'Failed to deactivate agent' });
  }
});

// ==========================================
// CROSS-AGENT MESSAGING API
// ==========================================

/**
 * GET /api/agents/messaging/available
 * Get all agents with their connected platforms for cross-agent messaging
 * Used by FlowBuilder AgentSelectorField
 */
router.get('/messaging/available', async (req, res) => {
  try {
    const { unifiedMessageService } = require('../services/unifiedMessageService.cjs');

    const agents = await unifiedMessageService.getAvailableAgents(req.user.id);

    res.json({ agents });

  } catch (error) {
    logger.error(`Failed to get available agents: ${error.message}`);
    res.status(500).json({ error: 'Failed to get available agents' });
  }
});

/**
 * GET /api/agents/:id/contacts
 * Get contacts for a specific agent (synced from platforms)
 * Used by FlowBuilder ContactPickerField
 */
router.get('/:id/contacts', async (req, res) => {
  try {
    const db = getDatabase();

    // Verify agent ownership
    const agent = db.prepare('SELECT id FROM agents WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    const { platform, search, limit = 50 } = req.query;

    const { unifiedMessageService } = require('../services/unifiedMessageService.cjs');

    const contacts = await unifiedMessageService.getAgentContacts(
      req.params.id,
      platform || null,
      { search, limit: parseInt(limit) }
    );

    res.json({ contacts });

  } catch (error) {
    logger.error(`Failed to get agent contacts: ${error.message}`);
    res.status(500).json({ error: 'Failed to get agent contacts' });
  }
});

/**
 * POST /api/agents/:id/send
 * Send a cross-agent message
 * Enables sending messages through a specific agent to specific contacts
 */
router.post('/:id/send', async (req, res) => {
  try {
    const db = getDatabase();

    // Verify agent ownership
    const agent = db.prepare('SELECT id FROM agents WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    const { platform, recipients, content, options = {} } = req.body;

    if (!platform) {
      return res.status(400).json({ error: 'platform is required' });
    }
    if (!recipients || (Array.isArray(recipients) && recipients.length === 0)) {
      return res.status(400).json({ error: 'recipients is required' });
    }
    if (!content) {
      return res.status(400).json({ error: 'content is required' });
    }

    const { unifiedMessageService } = require('../services/unifiedMessageService.cjs');

    const result = await unifiedMessageService.sendCrossAgentMessage({
      agentId: req.params.id,
      platform,
      recipients: Array.isArray(recipients) ? recipients : [recipients],
      content,
      messageOptions: options,
      userId: req.user.id,
      sourceContext: {
        source: 'api',
        endpoint: '/api/agents/:id/send'
      }
    });

    res.json(result);

  } catch (error) {
    logger.error(`Failed to send cross-agent message: ${error.message}`);
    res.status(500).json({ error: error.message || 'Failed to send message' });
  }
});

module.exports = router;
