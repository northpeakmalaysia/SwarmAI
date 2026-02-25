/**
 * Agentic AI Routes
 * Autonomous agent workspaces, tokens, and custom tools
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('../services/database.cjs');
const { logger } = require('../services/logger.cjs');
const { authenticate } = require('./auth.cjs');
const { getPythonSandbox } = require('../services/agentic/PythonSandbox.cjs');
const { getApprovalService } = require('../services/agentic/ApprovalService.cjs');
const { getAgenticMemoryService, MEMORY_TYPES } = require('../services/agentic/AgenticMemoryService.cjs');
const { costTrackingService } = require('../services/agentic/CostTrackingService.cjs');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const { createPagination } = require('../utils/responseHelpers.cjs');

const router = express.Router();

router.use(authenticate);

// Ensure new columns exist on agentic_profiles (lazy migration on first request)
let _profileMigrationDone = false;
function ensureProfileColumns() {
  if (_profileMigrationDone) return;
  try {
    const db = getDatabase();
    const cols = db.pragma('table_info(agentic_profiles)').map(c => c.name);
    if (!cols.includes('cli_type')) {
      db.prepare("ALTER TABLE agentic_profiles ADD COLUMN cli_type TEXT DEFAULT 'claude'").run();
      logger.info('Added cli_type column to agentic_profiles');
    }
    if (!cols.includes('workspace_autonomy_level')) {
      db.prepare("ALTER TABLE agentic_profiles ADD COLUMN workspace_autonomy_level TEXT DEFAULT 'semi'").run();
      logger.info('Added workspace_autonomy_level column to agentic_profiles');
    }
    if (!cols.includes('quick_ack_mode')) {
      db.prepare("ALTER TABLE agentic_profiles ADD COLUMN quick_ack_mode TEXT DEFAULT 'typing'").run();
      logger.info('Added quick_ack_mode column to agentic_profiles');
    }
    // Phase 2b: Master recognition tracking
    if (!cols.includes('master_interaction_count')) {
      db.prepare("ALTER TABLE agentic_profiles ADD COLUMN master_interaction_count INTEGER DEFAULT 0").run();
      logger.info('Added master_interaction_count column to agentic_profiles');
    }
    if (!cols.includes('first_master_contact_at')) {
      db.prepare("ALTER TABLE agentic_profiles ADD COLUMN first_master_contact_at TEXT").run();
      logger.info('Added first_master_contact_at column to agentic_profiles');
    }
    if (!cols.includes('last_master_contact_at')) {
      db.prepare("ALTER TABLE agentic_profiles ADD COLUMN last_master_contact_at TEXT").run();
      logger.info('Added last_master_contact_at column to agentic_profiles');
    }

    // Fix: Make agentic_workspaces.agent_id nullable (profiles can exist without linked agents)
    const wsCols = db.pragma('table_info(agentic_workspaces)');
    const agentIdCol = wsCols.find(c => c.name === 'agent_id');
    if (agentIdCol && agentIdCol.notnull === 1) {
      logger.info('Migrating agentic_workspaces: making agent_id nullable...');
      db.exec(`
        BEGIN TRANSACTION;
        ALTER TABLE agentic_workspaces RENAME TO _agentic_workspaces_old;
        CREATE TABLE agentic_workspaces (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          agent_id TEXT,
          cli_type TEXT NOT NULL,
          autonomy_level TEXT DEFAULT 'semi',
          workspace_path TEXT,
          config TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now')),
          profile_id TEXT,
          status TEXT DEFAULT 'active'
        );
        INSERT INTO agentic_workspaces SELECT * FROM _agentic_workspaces_old;
        DROP TABLE _agentic_workspaces_old;
        COMMIT;
      `);
      logger.info('agentic_workspaces migration complete: agent_id is now nullable');
    }

    _profileMigrationDone = true;
  } catch (e) {
    logger.warn(`agentic_profiles migration: ${e.message}`);
  }
}

// Ensure scope overhaul columns exist on agentic_contact_scope
let _scopeMigrationDone = false;
function ensureScopeColumns() {
  if (_scopeMigrationDone) return;
  try {
    const db = getDatabase();
    const tableExists = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='agentic_contact_scope'"
    ).get();
    if (!tableExists) { _scopeMigrationDone = true; return; }

    const cols = db.pragma('table_info(agentic_contact_scope)').map(c => c.name);
    if (!cols.includes('platform_account_id')) {
      db.prepare("ALTER TABLE agentic_contact_scope ADD COLUMN platform_account_id TEXT DEFAULT NULL").run();
      logger.info('Added platform_account_id column to agentic_contact_scope');
    }
    if (!cols.includes('whitelist_group_ids')) {
      db.prepare("ALTER TABLE agentic_contact_scope ADD COLUMN whitelist_group_ids TEXT DEFAULT '[]'").run();
      logger.info('Added whitelist_group_ids column to agentic_contact_scope');
    }
    _scopeMigrationDone = true;
  } catch (e) {
    logger.warn(`agentic_contact_scope migration: ${e.message}`);
  }
}

router.use((req, res, next) => { ensureProfileColumns(); ensureScopeColumns(); next(); });

/**
 * Transform workspace from database to API format
 */
function transformWorkspace(w) {
  if (!w) return null;
  return {
    id: w.id,
    userId: w.user_id,
    profileId: w.profile_id,           // New: Links to agentic_profiles
    profileName: w.profileName,        // New: From joined profile
    agentId: w.agent_id,               // Deprecated: kept for backwards compatibility
    agentName: w.agentName || w.profileName,
    cliType: w.cli_type,
    autonomyLevel: w.autonomy_level,
    workspacePath: w.workspace_path,
    config: w.config ? JSON.parse(w.config) : {},
    status: w.status || 'active',
    createdAt: w.created_at,
    updatedAt: w.updated_at
  };
}

/**
 * Transform token from database to API format
 */
function transformToken(t, maskToken = true) {
  if (!t) return null;
  return {
    id: t.id,
    userId: t.user_id,
    workspaceId: t.workspace_id,
    profileId: t.profile_id,           // New: Links to agentic_profiles
    profileName: t.profileName,        // New: From joined profile
    agentId: t.agent_id,               // Deprecated: kept for backwards compatibility
    agentName: t.agentName || t.profileName, // Use profile name as fallback
    name: t.name,
    token: maskToken && t.token ? `${t.token.substring(0, 8)}...` : t.token,
    expiresAt: t.expires_at,
    lastUsedAt: t.last_used_at,
    createdAt: t.created_at
  };
}

/**
 * Transform custom tool from database to API format
 */
function transformTool(t) {
  if (!t) return null;
  return {
    id: t.id,
    userId: t.user_id,
    workspaceId: t.workspace_id,
    agentId: t.agent_id,
    name: t.name,
    description: t.description,
    parameters: t.parameters ? JSON.parse(t.parameters) : [],
    code: t.code,
    language: t.language,
    usageGuide: t.usage_guide,
    isActive: !!t.is_active,
    createdAt: t.created_at,
    updatedAt: t.updated_at
  };
}

/**
 * Generate usage guide for a custom tool
 * @param {Object} tool - Tool object with name, description, parameters
 * @returns {string} Markdown usage guide
 */
function generateToolUsageGuide(tool) {
  const params = tool.parameters ?
    (typeof tool.parameters === 'string' ? JSON.parse(tool.parameters) : tool.parameters) : [];

  let guide = `# ${tool.name}\n\n`;

  // Description
  if (tool.description) {
    guide += `## Description\n${tool.description}\n\n`;
  }

  // Parameters section
  if (params.length > 0) {
    guide += `## Parameters\n\n`;
    guide += `| Name | Type | Required | Default | Description |\n`;
    guide += `|------|------|----------|---------|-------------|\n`;
    for (const param of params) {
      guide += `| ${param.name} | ${param.type || 'string'} | ${param.required ? 'Yes' : 'No'} | ${param.default !== undefined ? param.default : '-'} | ${param.description || '-'} |\n`;
    }
    guide += '\n';
  }

  // Usage in FlowBuilder
  guide += `## Usage in FlowBuilder\n\n`;
  guide += `This tool is available as a node in the FlowBuilder under the **Agentic AI** category.\n\n`;
  guide += `**Node Type:** \`agentic:tool:${tool.id || '{toolId}'}\`\n\n`;

  // Input configuration
  if (params.length > 0) {
    guide += `### Node Configuration\n\n`;
    guide += '```json\n{\n';
    for (const param of params) {
      const exampleValue = param.type === 'number' ? '0' :
                          param.type === 'boolean' ? 'false' :
                          param.type === 'array' ? '[]' :
                          param.type === 'object' ? '{}' : '"value"';
      guide += `  "${param.name}": ${exampleValue}${params.indexOf(param) < params.length - 1 ? ',' : ''}\n`;
    }
    guide += '}\n```\n\n';
  }

  // Variable references
  guide += `### Using Flow Variables\n\n`;
  guide += `You can reference data from previous nodes or flow inputs:\n\n`;
  guide += `- \`{{input.fieldName}}\` - From flow input\n`;
  guide += `- \`{{node.nodeId.output}}\` - From previous node output\n`;
  guide += `- \`{{var.variableName}}\` - From flow variables\n\n`;

  // API usage
  guide += `## API Usage\n\n`;
  guide += `### Execute via API\n\n`;
  guide += '```bash\n';
  guide += `curl -X POST /api/agentic/tools/${tool.id || '{toolId}'}/test \\\n`;
  guide += `  -H "Authorization: Bearer YOUR_TOKEN" \\\n`;
  guide += `  -H "Content-Type: application/json" \\\n`;
  guide += `  -d '{\n`;
  guide += `    "inputs": {\n`;
  for (const param of params) {
    const exampleValue = param.type === 'number' ? '0' :
                        param.type === 'boolean' ? 'false' :
                        param.type === 'array' ? '[]' :
                        param.type === 'object' ? '{}' : '"example"';
    guide += `      "${param.name}": ${exampleValue}${params.indexOf(param) < params.length - 1 ? ',' : ''}\n`;
  }
  guide += `    }\n  }'\n`;
  guide += '```\n\n';

  // Output format
  guide += `## Output\n\n`;
  guide += `The tool returns a JSON object with:\n\n`;
  guide += `- \`result\` - The tool's execution result\n`;
  guide += `- \`executionTime\` - Time taken in milliseconds\n`;
  guide += `- \`toolName\` - Name of the executed tool\n\n`;

  // Example output
  guide += '```json\n{\n';
  guide += '  "result": { /* tool output */ },\n';
  guide += '  "executionTime": 150,\n';
  guide += `  "toolName": "${tool.name}"\n`;
  guide += '}\n```\n';

  return guide;
}

// Workspace directory
const WORKSPACES_DIR = path.join(__dirname, '..', 'data', 'workspaces');

// ============================================
// Workspaces
// ============================================

/**
 * GET /api/agentic/workspaces
 * List agentic workspaces
 */
router.get('/workspaces', (req, res) => {
  try {
    const db = getDatabase();
    const { limit = 50, offset = 0 } = req.query;

    // Count query for pagination
    const totalCount = db.prepare('SELECT COUNT(*) as count FROM agentic_workspaces WHERE user_id = ?')
      .get(req.user.id).count;

    // Join with agentic_profiles (primary) and agents (legacy fallback)
    const workspaces = db.prepare(`
      SELECT w.*,
             p.name as profileName,
             COALESCE(p.name, a.name) as agentName
      FROM agentic_workspaces w
      LEFT JOIN agentic_profiles p ON w.profile_id = p.id
      LEFT JOIN agents a ON w.agent_id = a.id
      WHERE w.user_id = ?
      ORDER BY w.created_at DESC
      LIMIT ? OFFSET ?
    `).all(req.user.id, parseInt(limit), parseInt(offset));

    const transformed = workspaces.map(transformWorkspace);

    res.json({
      workspaces: transformed,
      pagination: createPagination(transformed, {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: totalCount
      })
    });

  } catch (error) {
    logger.error(`Failed to list workspaces: ${error.message}`);
    res.status(500).json({ error: 'Failed to list workspaces' });
  }
});

/**
 * GET /api/agentic/workspaces/:id
 * Get workspace details
 */
router.get('/workspaces/:id', (req, res) => {
  try {
    const db = getDatabase();

    const workspace = db.prepare(`
      SELECT w.*,
             p.name as profileName,
             COALESCE(p.name, a.name) as agentName
      FROM agentic_workspaces w
      LEFT JOIN agentic_profiles p ON w.profile_id = p.id
      LEFT JOIN agents a ON w.agent_id = a.id
      WHERE w.id = ? AND w.user_id = ?
    `).get(req.params.id, req.user.id);

    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    res.json({ workspace: transformWorkspace(workspace) });

  } catch (error) {
    logger.error(`Failed to get workspace: ${error.message}`);
    res.status(500).json({ error: 'Failed to get workspace' });
  }
});

/**
 * GET /api/agentic/workspaces/agent/:agentId
 * Get workspace by agent ID (DEPRECATED - use /workspaces/profile/:profileId)
 */
router.get('/workspaces/agent/:agentId', (req, res) => {
  try {
    const db = getDatabase();

    const workspace = db.prepare(`
      SELECT w.*,
             p.name as profileName,
             COALESCE(p.name, a.name) as agentName
      FROM agentic_workspaces w
      LEFT JOIN agentic_profiles p ON w.profile_id = p.id
      LEFT JOIN agents a ON w.agent_id = a.id
      WHERE w.agent_id = ? AND w.user_id = ?
    `).get(req.params.agentId, req.user.id);

    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    res.json({ workspace: transformWorkspace(workspace) });

  } catch (error) {
    logger.error(`Failed to get workspace: ${error.message}`);
    res.status(500).json({ error: 'Failed to get workspace' });
  }
});

/**
 * GET /api/agentic/workspaces/profile/:profileId
 * Get workspace by profile ID (NEW - PRD design)
 */
router.get('/workspaces/profile/:profileId', (req, res) => {
  try {
    const db = getDatabase();

    const workspace = db.prepare(`
      SELECT w.*,
             p.name as profileName
      FROM agentic_workspaces w
      LEFT JOIN agentic_profiles p ON w.profile_id = p.id
      WHERE w.profile_id = ? AND w.user_id = ?
    `).get(req.params.profileId, req.user.id);

    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    res.json({ workspace: transformWorkspace(workspace) });

  } catch (error) {
    logger.error(`Failed to get workspace: ${error.message}`);
    res.status(500).json({ error: 'Failed to get workspace' });
  }
});

/**
 * POST /api/agentic/workspaces
 * Create workspace
 * Supports both profileId (new PRD design) and agentId (legacy)
 */
router.post('/workspaces', (req, res) => {
  try {
    const { profileId, agentId, cliType, autonomyLevel, config } = req.body;

    // Support both profileId (new) and agentId (legacy)
    if (!profileId && !agentId) {
      return res.status(400).json({ error: 'profileId (preferred) or agentId is required' });
    }
    if (!cliType) {
      return res.status(400).json({ error: 'cliType is required' });
    }

    const db = getDatabase();
    const workspaceId = uuidv4();

    // Use profileId as the directory identifier (preferred), fallback to agentId
    const dirId = profileId || agentId;

    // Create workspace directory
    const workspacePath = path.join(WORKSPACES_DIR, req.user.id, dirId);
    fs.mkdirSync(workspacePath, { recursive: true });

    // Get profile info for context file if profileId provided
    let profileInfo = null;
    if (profileId) {
      profileInfo = db.prepare('SELECT * FROM agentic_profiles WHERE id = ? AND user_id = ?')
        .get(profileId, req.user.id);
      if (!profileInfo) {
        return res.status(404).json({ error: 'Profile not found' });
      }
    }

    // Create context file with profile information
    const contextFileName = cliType === 'claude' ? 'CLAUDE.md' :
                           cliType === 'gemini' ? 'GEMINI.md' : 'OPENCODE.md';
    const contextPath = path.join(workspacePath, contextFileName);

    let contextContent = `# ${cliType.toUpperCase()} Agent Context\n\n`;
    if (profileInfo) {
      contextContent += `## Agent Information\n`;
      contextContent += `- Name: ${profileInfo.name}\n`;
      contextContent += `- Role: ${profileInfo.role}\n`;
      if (profileInfo.description) {
        contextContent += `- Description: ${profileInfo.description}\n`;
      }
      contextContent += `- Autonomy Level: ${profileInfo.autonomy_level}\n\n`;

      if (profileInfo.system_prompt) {
        contextContent += `## System Prompt\n${profileInfo.system_prompt}\n\n`;
      }
    }
    contextContent += `## Workspace\nThis is your workspace context file.\n`;

    fs.writeFileSync(contextPath, contextContent);

    // Insert with profile_id (new) and agent_id (legacy support)
    db.prepare(`
      INSERT INTO agentic_workspaces (id, user_id, profile_id, agent_id, cli_type, autonomy_level, workspace_path, config, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')
    `).run(workspaceId, req.user.id, profileId || null, agentId || null, cliType, autonomyLevel || 'semi', workspacePath, JSON.stringify(config || {}));

    const workspace = db.prepare(`
      SELECT w.*, p.name as profileName
      FROM agentic_workspaces w
      LEFT JOIN agentic_profiles p ON w.profile_id = p.id
      WHERE w.id = ?
    `).get(workspaceId);

    logger.info(`Workspace created: ${workspaceId} for profile ${profileId || 'N/A'}`);

    res.status(201).json({ workspace: transformWorkspace(workspace) });

  } catch (error) {
    logger.error(`Failed to create workspace: ${error.message}`);
    res.status(500).json({ error: 'Failed to create workspace' });
  }
});

/**
 * DELETE /api/agentic/workspaces/:id
 * Delete workspace
 */
router.delete('/workspaces/:id', (req, res) => {
  try {
    const db = getDatabase();

    const workspace = db.prepare('SELECT * FROM agentic_workspaces WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    // Delete workspace directory
    if (workspace.workspace_path && fs.existsSync(workspace.workspace_path)) {
      fs.rmSync(workspace.workspace_path, { recursive: true, force: true });
    }

    db.prepare('DELETE FROM agentic_workspaces WHERE id = ?').run(req.params.id);

    res.json({ message: 'Workspace deleted' });

  } catch (error) {
    logger.error(`Failed to delete workspace: ${error.message}`);
    res.status(500).json({ error: 'Failed to delete workspace' });
  }
});

/**
 * POST /api/agentic/workspaces/:id/regenerate-context
 * Regenerate context file with profile information
 */
router.post('/workspaces/:id/regenerate-context', (req, res) => {
  try {
    const db = getDatabase();

    // Get workspace with profile information
    const workspace = db.prepare(`
      SELECT w.*, p.name as profile_name, p.role as profile_role,
             p.description as profile_description, p.system_prompt,
             p.autonomy_level as profile_autonomy
      FROM agentic_workspaces w
      LEFT JOIN agentic_profiles p ON w.profile_id = p.id
      WHERE w.id = ? AND w.user_id = ?
    `).get(req.params.id, req.user.id);

    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    // Regenerate context file
    const contextFileName = workspace.cli_type === 'claude' ? 'CLAUDE.md' :
                           workspace.cli_type === 'gemini' ? 'GEMINI.md' : 'OPENCODE.md';
    const contextPath = path.join(workspace.workspace_path, contextFileName);

    let contextContent = `# ${workspace.cli_type.toUpperCase()} Agent Context\n\n`;

    // Add profile information if available
    if (workspace.profile_name) {
      contextContent += `## Agent Information\n`;
      contextContent += `- Name: ${workspace.profile_name}\n`;
      contextContent += `- Role: ${workspace.profile_role || 'Agentic AI Agent'}\n`;
      if (workspace.profile_description) {
        contextContent += `- Description: ${workspace.profile_description}\n`;
      }
      contextContent += `- Autonomy Level: ${workspace.profile_autonomy || workspace.autonomy_level}\n\n`;
    }

    // Add system prompt if available
    if (workspace.system_prompt) {
      contextContent += `## System Prompt\n${workspace.system_prompt}\n\n`;
    }

    contextContent += `## Workspace Information\n`;
    contextContent += `- Workspace ID: ${workspace.id}\n`;
    if (workspace.profile_id) {
      contextContent += `- Profile ID: ${workspace.profile_id}\n`;
    }
    contextContent += `- CLI Type: ${workspace.cli_type}\n`;
    contextContent += `- Autonomy Level: ${workspace.autonomy_level}\n`;
    contextContent += `- Created: ${workspace.created_at}\n\n`;

    contextContent += `## Available Tools\n`;
    contextContent += `Use the SwarmAI API to interact with the platform.\n\n`;

    contextContent += `## Guidelines\n`;
    contextContent += `Follow the autonomy level guidelines for your actions.\n`;

    fs.writeFileSync(contextPath, contextContent);

    res.json({ message: 'Context regenerated', contextPath });

  } catch (error) {
    logger.error(`Failed to regenerate context: ${error.message}`);
    res.status(500).json({ error: 'Failed to regenerate context' });
  }
});

// ============================================
// Tokens
// ============================================

/**
 * GET /api/agentic/tokens
 * List agentic tokens
 */
router.get('/tokens', (req, res) => {
  try {
    const db = getDatabase();
    const { limit = 50, offset = 0 } = req.query;

    // Count query for pagination
    const totalCount = db.prepare('SELECT COUNT(*) as count FROM agentic_tokens WHERE user_id = ?')
      .get(req.user.id).count;

    const tokens = db.prepare(`
      SELECT t.*,
             w.agent_id, w.profile_id,
             p.name as profileName,
             a.name as agentName
      FROM agentic_tokens t
      LEFT JOIN agentic_workspaces w ON t.workspace_id = w.id
      LEFT JOIN agentic_profiles p ON w.profile_id = p.id
      LEFT JOIN agents a ON w.agent_id = a.id
      WHERE t.user_id = ?
      ORDER BY t.created_at DESC
      LIMIT ? OFFSET ?
    `).all(req.user.id, parseInt(limit), parseInt(offset));

    const transformed = tokens.map(t => transformToken(t, true));

    res.json({
      tokens: transformed,
      pagination: createPagination(transformed, {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: totalCount
      })
    });

  } catch (error) {
    logger.error(`Failed to list tokens: ${error.message}`);
    res.status(500).json({ error: 'Failed to list tokens' });
  }
});

/**
 * POST /api/agentic/tokens
 * Generate token
 */
router.post('/tokens', (req, res) => {
  try {
    const { workspaceId, name, expiresIn } = req.body;

    if (!workspaceId) {
      return res.status(400).json({ error: 'workspaceId is required' });
    }

    const db = getDatabase();

    // Verify workspace ownership
    const workspace = db.prepare('SELECT id FROM agentic_workspaces WHERE id = ? AND user_id = ?')
      .get(workspaceId, req.user.id);

    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    const tokenId = uuidv4();
    const token = `swarm_${crypto.randomBytes(32).toString('hex')}`;

    // Calculate expiry (default 1 year)
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + (expiresIn || 1));

    db.prepare(`
      INSERT INTO agentic_tokens (id, user_id, workspace_id, name, token, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(tokenId, req.user.id, workspaceId, name || 'API Token', token, expiresAt.toISOString());

    res.status(201).json({
      token: {
        id: tokenId,
        token, // Full token returned only on creation
        name: name || 'API Token',
        expiresAt: expiresAt.toISOString()
      }
    });

  } catch (error) {
    logger.error(`Failed to generate token: ${error.message}`);
    res.status(500).json({ error: 'Failed to generate token' });
  }
});

/**
 * DELETE /api/agentic/tokens/:tokenId
 * Revoke token
 */
router.delete('/tokens/:tokenId', (req, res) => {
  try {
    const db = getDatabase();

    const result = db.prepare('DELETE FROM agentic_tokens WHERE id = ? AND user_id = ?')
      .run(req.params.tokenId, req.user.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Token not found' });
    }

    res.json({ message: 'Token revoked' });

  } catch (error) {
    logger.error(`Failed to revoke token: ${error.message}`);
    res.status(500).json({ error: 'Failed to revoke token' });
  }
});

// ============================================
// Custom Tools
// ============================================

/**
 * GET /api/agentic/tools
 * List custom tools
 */
router.get('/tools', (req, res) => {
  try {
    const db = getDatabase();
    const { limit = 50, offset = 0 } = req.query;

    // Count query for pagination
    const totalCount = db.prepare('SELECT COUNT(*) as count FROM custom_tools WHERE user_id = ?')
      .get(req.user.id).count;

    const tools = db.prepare(`
      SELECT t.*, w.agent_id
      FROM custom_tools t
      LEFT JOIN agentic_workspaces w ON t.workspace_id = w.id
      WHERE t.user_id = ?
      ORDER BY t.name
      LIMIT ? OFFSET ?
    `).all(req.user.id, parseInt(limit), parseInt(offset));

    const transformed = tools.map(transformTool);

    res.json({
      tools: transformed,
      pagination: createPagination(transformed, {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: totalCount
      })
    });

  } catch (error) {
    logger.error(`Failed to list tools: ${error.message}`);
    res.status(500).json({ error: 'Failed to list tools' });
  }
});

/**
 * GET /api/agentic/tools/workspace/:workspaceId
 * Get workspace tools
 */
router.get('/tools/workspace/:workspaceId', (req, res) => {
  try {
    const db = getDatabase();

    const tools = db.prepare(`
      SELECT * FROM custom_tools
      WHERE workspace_id = ? AND user_id = ?
      ORDER BY name
    `).all(req.params.workspaceId, req.user.id);

    res.json({ tools: tools.map(transformTool) });

  } catch (error) {
    logger.error(`Failed to get workspace tools: ${error.message}`);
    res.status(500).json({ error: 'Failed to get workspace tools' });
  }
});

/**
 * GET /api/agentic/tools/:id
 * Get tool details
 */
router.get('/tools/:id', (req, res) => {
  try {
    const db = getDatabase();

    const tool = db.prepare('SELECT * FROM custom_tools WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!tool) {
      return res.status(404).json({ error: 'Tool not found' });
    }

    res.json({ tool: transformTool(tool) });

  } catch (error) {
    logger.error(`Failed to get tool: ${error.message}`);
    res.status(500).json({ error: 'Failed to get tool' });
  }
});

/**
 * POST /api/agentic/tools
 * Create custom tool with auto-generated usage guide
 */
router.post('/tools', (req, res) => {
  try {
    const { workspaceId, name, description, parameters, code, language } = req.body;

    if (!workspaceId || !name || !code) {
      return res.status(400).json({ error: 'workspaceId, name, and code are required' });
    }

    const db = getDatabase();
    const toolId = uuidv4();

    // Generate usage guide
    const toolForGuide = {
      id: toolId,
      name,
      description,
      parameters: parameters || []
    };
    const usageGuide = generateToolUsageGuide(toolForGuide);

    db.prepare(`
      INSERT INTO custom_tools (id, user_id, workspace_id, name, description, parameters, code, language, usage_guide, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      toolId,
      req.user.id,
      workspaceId,
      name,
      description || null,
      JSON.stringify(parameters || []),
      code,
      language || 'python',
      usageGuide
    );

    const tool = db.prepare('SELECT * FROM custom_tools WHERE id = ?').get(toolId);

    // Broadcast to WebSocket that a new tool is available
    if (global.wsBroadcast) {
      global.wsBroadcast('agentic:tool_created', {
        toolId,
        name,
        userId: req.user.id,
        type: `agentic:tool:${toolId}`
      });
    }

    logger.info(`Custom tool created: ${name} (${toolId}) with auto-generated usage guide`);

    res.status(201).json({ tool: transformTool(tool) });

  } catch (error) {
    logger.error(`Failed to create tool: ${error.message}`);
    res.status(500).json({ error: 'Failed to create tool' });
  }
});

/**
 * PUT /api/agentic/tools/:id
 * Update custom tool and regenerate usage guide
 */
router.put('/tools/:id', (req, res) => {
  try {
    const { name, description, parameters, code, language } = req.body;
    const db = getDatabase();

    const existing = db.prepare('SELECT * FROM custom_tools WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!existing) {
      return res.status(404).json({ error: 'Tool not found' });
    }

    // Build update object
    const updates = [];
    const params = [];

    if (name !== undefined) { updates.push('name = ?'); params.push(name); }
    if (description !== undefined) { updates.push('description = ?'); params.push(description); }
    if (parameters !== undefined) { updates.push('parameters = ?'); params.push(JSON.stringify(parameters)); }
    if (code !== undefined) { updates.push('code = ?'); params.push(code); }
    if (language !== undefined) { updates.push('language = ?'); params.push(language); }

    // Regenerate usage guide with updated values
    const updatedTool = {
      id: req.params.id,
      name: name !== undefined ? name : existing.name,
      description: description !== undefined ? description : existing.description,
      parameters: parameters !== undefined ? parameters :
        (existing.parameters ? JSON.parse(existing.parameters) : [])
    };
    const usageGuide = generateToolUsageGuide(updatedTool);
    updates.push('usage_guide = ?');
    params.push(usageGuide);

    updates.push("updated_at = datetime('now')");
    params.push(req.params.id);

    db.prepare(`UPDATE custom_tools SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    const tool = db.prepare('SELECT * FROM custom_tools WHERE id = ?').get(req.params.id);

    // Broadcast update
    if (global.wsBroadcast) {
      global.wsBroadcast('agentic:tool_updated', {
        toolId: req.params.id,
        name: tool.name,
        userId: req.user.id
      });
    }

    logger.info(`Custom tool updated: ${tool.name} (${req.params.id})`);

    res.json({ tool: transformTool(tool) });

  } catch (error) {
    logger.error(`Failed to update tool: ${error.message}`);
    res.status(500).json({ error: 'Failed to update tool' });
  }
});

/**
 * GET /api/agentic/tools/:id/guide
 * Get tool usage guide
 */
router.get('/tools/:id/guide', (req, res) => {
  try {
    const db = getDatabase();

    const tool = db.prepare('SELECT id, name, usage_guide FROM custom_tools WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!tool) {
      return res.status(404).json({ error: 'Tool not found' });
    }

    res.json({
      toolId: tool.id,
      name: tool.name,
      guide: tool.usage_guide || 'No usage guide available'
    });

  } catch (error) {
    logger.error(`Failed to get tool guide: ${error.message}`);
    res.status(500).json({ error: 'Failed to get tool guide' });
  }
});

/**
 * POST /api/agentic/tools/:id/regenerate-guide
 * Regenerate usage guide for a tool
 */
router.post('/tools/:id/regenerate-guide', (req, res) => {
  try {
    const db = getDatabase();

    const tool = db.prepare('SELECT * FROM custom_tools WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!tool) {
      return res.status(404).json({ error: 'Tool not found' });
    }

    // Generate new usage guide
    const toolForGuide = {
      id: tool.id,
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters ? JSON.parse(tool.parameters) : []
    };
    const usageGuide = generateToolUsageGuide(toolForGuide);

    // Update in database
    db.prepare(`
      UPDATE custom_tools SET usage_guide = ?, updated_at = datetime('now') WHERE id = ?
    `).run(usageGuide, req.params.id);

    logger.info(`Usage guide regenerated for tool: ${tool.name}`);

    res.json({
      toolId: tool.id,
      name: tool.name,
      guide: usageGuide
    });

  } catch (error) {
    logger.error(`Failed to regenerate tool guide: ${error.message}`);
    res.status(500).json({ error: 'Failed to regenerate tool guide' });
  }
});

/**
 * DELETE /api/agentic/tools/:id
 * Delete tool
 */
router.delete('/tools/:id', (req, res) => {
  try {
    const db = getDatabase();

    // Get tool info before deletion
    const tool = db.prepare('SELECT name FROM custom_tools WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!tool) {
      return res.status(404).json({ error: 'Tool not found' });
    }

    db.prepare('DELETE FROM custom_tools WHERE id = ? AND user_id = ?')
      .run(req.params.id, req.user.id);

    // Broadcast deletion so FlowBuilder can refresh
    if (global.wsBroadcast) {
      global.wsBroadcast('agentic:tool_deleted', {
        toolId: req.params.id,
        name: tool.name,
        userId: req.user.id
      });
    }

    logger.info(`Custom tool deleted: ${tool.name} (${req.params.id})`);

    res.json({ message: 'Tool deleted' });

  } catch (error) {
    logger.error(`Failed to delete tool: ${error.message}`);
    res.status(500).json({ error: 'Failed to delete tool' });
  }
});

/**
 * POST /api/agentic/tools/:id/test
 * Test tool execution in sandbox
 */
router.post('/tools/:id/test', async (req, res) => {
  try {
    const { inputs } = req.body;
    const db = getDatabase();

    const tool = db.prepare('SELECT * FROM custom_tools WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!tool) {
      return res.status(404).json({ error: 'Tool not found' });
    }

    // Get workspace for file access
    let workspacePath = null;
    if (tool.workspace_id) {
      const workspace = db.prepare('SELECT workspace_path FROM agentic_workspaces WHERE id = ?')
        .get(tool.workspace_id);
      workspacePath = workspace?.workspace_path;
    }

    // Execute in sandbox
    const sandbox = getPythonSandbox();
    const result = await sandbox.executeTool(tool, inputs || {}, workspacePath);

    // Parse output if JSON
    let parsedOutput = result.output;
    try {
      if (result.output) {
        parsedOutput = JSON.parse(result.output);
      }
    } catch {
      // Keep as string if not valid JSON
    }

    res.json({
      success: result.status === 'success',
      executionId: result.executionId,
      status: result.status,
      output: parsedOutput,
      error: result.error,
      executionTime: result.executionTime
    });

  } catch (error) {
    logger.error(`Failed to test tool: ${error.message}`);
    res.status(500).json({ error: 'Failed to test tool' });
  }
});

/**
 * PATCH /api/agentic/tools/:id/active
 * Set tool active status
 */
router.patch('/tools/:id/active', (req, res) => {
  try {
    const { active } = req.body;
    const db = getDatabase();

    const result = db.prepare(`
      UPDATE custom_tools SET is_active = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?
    `).run(active ? 1 : 0, req.params.id, req.user.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Tool not found' });
    }

    res.json({ isActive: !!active });

  } catch (error) {
    logger.error(`Failed to update tool status: ${error.message}`);
    res.status(500).json({ error: 'Failed to update tool status' });
  }
});

/**
 * POST /api/agentic/tools/validate
 * Validate Python tool code syntax
 */
router.post('/tools/validate', async (req, res) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ error: 'Code is required' });
    }

    const sandbox = getPythonSandbox();

    // Check security first
    const securityCheck = sandbox.checkCodeSecurity(code);
    if (!securityCheck.safe) {
      return res.json({
        valid: false,
        error: `Security violation: ${securityCheck.reason}`,
        type: 'security'
      });
    }

    // Check syntax
    const syntaxCheck = await sandbox.validateSyntax(code);

    res.json({
      valid: syntaxCheck.valid,
      error: syntaxCheck.error,
      type: syntaxCheck.valid ? null : 'syntax'
    });

  } catch (error) {
    logger.error(`Failed to validate tool: ${error.message}`);
    res.status(500).json({ error: 'Failed to validate tool' });
  }
});

/**
 * GET /api/agentic/tools/template
 * Get tool code template
 */
router.get('/tools/template', (req, res) => {
  try {
    const { name, parameters } = req.query;

    let params = [];
    if (parameters) {
      try {
        params = JSON.parse(parameters);
      } catch {
        // Ignore parse errors
      }
    }

    const sandbox = getPythonSandbox();
    const template = sandbox.getToolTemplate(name || 'my_tool', params);

    res.json({ template });

  } catch (error) {
    logger.error(`Failed to get tool template: ${error.message}`);
    res.status(500).json({ error: 'Failed to get tool template' });
  }
});

/**
 * POST /api/agentic/tools/execute-inline
 * Execute inline code without saving (for AI agents to test before saving)
 */
router.post('/tools/execute-inline', async (req, res) => {
  try {
    const { code, inputs, workspaceId } = req.body;

    if (!code) {
      return res.status(400).json({ error: 'Code is required' });
    }

    const db = getDatabase();

    // Get workspace path if provided
    let workspacePath = null;
    if (workspaceId) {
      const workspace = db.prepare('SELECT workspace_path FROM agentic_workspaces WHERE id = ? AND user_id = ?')
        .get(workspaceId, req.user.id);

      if (!workspace) {
        return res.status(404).json({ error: 'Workspace not found' });
      }
      workspacePath = workspace.workspace_path;
    }

    // Create temporary tool object
    const tempTool = {
      name: 'inline_execution',
      code,
      parameters: '[]'
    };

    // Execute in sandbox
    const sandbox = getPythonSandbox();
    const result = await sandbox.executeTool(tempTool, inputs || {}, workspacePath);

    // Parse output if JSON
    let parsedOutput = result.output;
    try {
      if (result.output) {
        parsedOutput = JSON.parse(result.output);
      }
    } catch {
      // Keep as string if not valid JSON
    }

    res.json({
      success: result.status === 'success',
      executionId: result.executionId,
      status: result.status,
      output: parsedOutput,
      error: result.error,
      executionTime: result.executionTime
    });

  } catch (error) {
    logger.error(`Failed to execute inline tool: ${error.message}`);
    res.status(500).json({ error: 'Failed to execute inline tool' });
  }
});

// ============================================================================
// BUILT-IN TOOLS ENDPOINTS
// ============================================================================

/**
 * GET /api/agentic/tools/builtin
 * List all available built-in tools
 */
router.get('/tools/builtin', (req, res) => {
  try {
    const { category } = req.query;
    const { getBuiltinToolList, getToolsByCategory } = require('../services/agentic/builtin/index.cjs');

    let tools;
    if (category) {
      const categoryTools = getToolsByCategory(category);
      tools = Object.values(categoryTools).map((tool) => ({
        id: tool.id,
        name: tool.name,
        type: tool.type,
        description: tool.description,
        category: tool.category,
        parameters: tool.parameters,
      }));
    } else {
      tools = getBuiltinToolList();
    }

    res.json({ tools });
  } catch (error) {
    logger.error(`Failed to list built-in tools: ${error.message}`);
    res.status(500).json({ error: 'Failed to list built-in tools' });
  }
});

/**
 * GET /api/agentic/tools/builtin/categories
 * Get available built-in tool categories
 */
router.get('/tools/builtin/categories', (req, res) => {
  try {
    const { getCategories } = require('../services/agentic/builtin/index.cjs');
    const categories = getCategories();

    res.json({ categories });
  } catch (error) {
    logger.error(`Failed to get categories: ${error.message}`);
    res.status(500).json({ error: 'Failed to get categories' });
  }
});

/**
 * GET /api/agentic/tools/builtin/:name
 * Get details of a specific built-in tool
 */
router.get('/tools/builtin/:name', (req, res) => {
  try {
    const { getBuiltinTool } = require('../services/agentic/builtin/index.cjs');
    const tool = getBuiltinTool(req.params.name);

    if (!tool) {
      return res.status(404).json({ error: 'Built-in tool not found' });
    }

    res.json({
      tool: {
        id: tool.id,
        name: tool.name,
        type: tool.type,
        description: tool.description,
        category: tool.category,
        parameters: tool.parameters,
      },
    });
  } catch (error) {
    logger.error(`Failed to get built-in tool: ${error.message}`);
    res.status(500).json({ error: 'Failed to get built-in tool' });
  }
});

/**
 * POST /api/agentic/tools/builtin/:name/execute
 * Execute a built-in tool
 */
router.post('/tools/builtin/:name/execute', async (req, res) => {
  try {
    const { inputs = {}, accountId, agentId } = req.body;
    const toolName = req.params.name;

    const { getBuiltinTool, executeBuiltinTool } = require('../services/agentic/builtin/index.cjs');
    const tool = getBuiltinTool(toolName);

    if (!tool) {
      return res.status(404).json({ error: 'Built-in tool not found' });
    }

    // Build execution context
    const context = {
      userId: req.user.id,
      accountId,
      agentId,
      toolName,
    };

    // If no accountId provided, try to find default email account
    if (!accountId && toolName.startsWith('email_')) {
      const db = getDatabase();
      const defaultAccount = db
        .prepare(
          `SELECT id FROM platform_accounts
           WHERE user_id = ? AND platform = 'email' AND status = 'connected'
           ORDER BY last_connected_at DESC LIMIT 1`
        )
        .get(req.user.id);

      if (defaultAccount) {
        context.accountId = defaultAccount.id;
      }
    }

    const result = await executeBuiltinTool(toolName, inputs, context);

    // Emit WebSocket event
    if (global.wsBroadcast) {
      global.wsBroadcast('agentic:builtin_tool_executed', {
        toolName,
        success: result.success,
        userId: req.user.id,
      });
    }

    res.json(result);
  } catch (error) {
    logger.error(`Failed to execute built-in tool: ${error.message}`);
    res.status(500).json({ error: 'Failed to execute built-in tool' });
  }
});

/**
 * POST /api/agentic/tools/builtin/:name/test
 * Test a built-in tool with sample inputs
 */
router.post('/tools/builtin/:name/test', async (req, res) => {
  try {
    const { inputs = {}, accountId } = req.body;
    const toolName = req.params.name;

    const { getBuiltinTool, executeBuiltinTool } = require('../services/agentic/builtin/index.cjs');
    const tool = getBuiltinTool(toolName);

    if (!tool) {
      return res.status(404).json({ error: 'Built-in tool not found' });
    }

    // Validate inputs against parameters
    const validationErrors = [];
    for (const param of tool.parameters) {
      if (param.required && inputs[param.name] === undefined) {
        validationErrors.push(`Missing required parameter: ${param.name}`);
      }
    }

    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        errors: validationErrors,
      });
    }

    // Build context
    const context = {
      userId: req.user.id,
      accountId,
      toolName,
      isTest: true,
    };

    const startTime = Date.now();
    const result = await executeBuiltinTool(toolName, inputs, context);
    const duration = Date.now() - startTime;

    res.json({
      success: result.success,
      output: result,
      duration,
      tested: true,
    });
  } catch (error) {
    logger.error(`Failed to test built-in tool: ${error.message}`);
    res.status(500).json({ error: 'Failed to test built-in tool' });
  }
});

// ============================================================================
// AGENTIC PROFILES - Master/Sub-Agent Hierarchy System
// ============================================================================

// Import AgenticService (will be wired in Phase 2)
// const agenticService = require('../services/agentic/AgenticService.cjs');

/**
 * Transform agentic profile from database to API format
 * Handles both old migration schema (agent_type, parent_agentic_id) and new schema (profile_type, parent_profile_id)
 */
function transformProfile(p) {
  if (!p) return null;

  // Parse JSON fields safely
  const parseJson = (val) => {
    if (!val) return null;
    if (typeof val === 'object') return val;
    try {
      return JSON.parse(val);
    } catch {
      return null;
    }
  };

  return {
    id: p.id,
    userId: p.user_id,
    agentId: p.agent_id,
    agentName: p.agentName || p.agent_name,
    name: p.name,
    role: p.role,
    description: p.description,
    avatar: p.avatar,
    // Support both old (agent_type) and new (profile_type) column names
    profileType: p.agent_type || p.profile_type || 'master',
    // Support both old (parent_agentic_id) and new (parent_profile_id) column names
    parentProfileId: p.parent_agentic_id || p.parent_profile_id,
    hierarchyLevel: p.hierarchy_level || 0,
    hierarchyPath: p.hierarchy_path,
    status: p.status || 'inactive',
    // AI Configuration
    aiProvider: p.ai_provider,
    aiModel: p.ai_model,
    temperature: p.temperature,
    maxTokens: p.max_tokens,
    systemPrompt: p.system_prompt,
    routingPreset: p.routing_preset,
    // Autonomy settings
    autonomyLevel: p.autonomy_level || 'supervised',
    requireApprovalFor: parseJson(p.require_approval_for) || [],
    // Master contact
    masterContactId: p.master_contact_id,
    masterContactChannel: p.master_contact_channel,
    notifyMasterOn: parseJson(p.notify_master_on) || [],
    escalationTimeoutMinutes: p.escalation_timeout_minutes,
    // Response agents (multi-select Active Agents for outbound messaging)
    responseAgentIds: parseJson(p.response_agent_ids) || [],
    // Sub-agent permissions
    canCreateChildren: !!p.can_create_children,
    maxChildren: p.max_children,
    maxHierarchyDepth: p.max_hierarchy_depth,
    childrenAutonomyCap: p.children_autonomy_cap,
    // Resource limits
    dailyBudget: p.daily_budget,
    dailyBudgetUsed: p.daily_budget_used,
    rateLimitPerMinute: p.rate_limit_per_minute,
    // Lifecycle
    expiresAt: p.expires_at,
    terminatedAt: p.terminated_at,
    terminationReason: p.termination_reason,
    lastActiveAt: p.last_active_at,
    // Timestamps
    createdAt: p.created_at,
    updatedAt: p.updated_at,
    // PRD Refactor: CLI type and workspace autonomy at profile level
    cliType: p.cli_type || 'claude',
    workspaceAutonomyLevel: p.workspace_autonomy_level || 'semi',
    // Phase 2c: Quick acknowledgment mode
    quickAckMode: p.quick_ack_mode || 'typing',
    // Phase 2b: Master recognition tracking
    masterInteractionCount: p.master_interaction_count || 0,
    firstMasterContactAt: p.first_master_contact_at,
    lastMasterContactAt: p.last_master_contact_at
  };
}

/**
 * Transform team member from database to API format
 * Maps to agentic_team_members table from migration schema
 */
function transformTeamMember(m) {
  if (!m) return null;

  // Parse JSON fields safely
  const parseJson = (val) => {
    if (!val) return [];
    if (typeof val === 'object') return val;
    try {
      return JSON.parse(val);
    } catch {
      return [];
    }
  };

  return {
    id: m.id,
    // Support both agentic_id (migration) and profile_id (new)
    profileId: m.agentic_id || m.profile_id,
    userId: m.user_id,
    contactId: m.contact_id,
    // Contact/User info from joins
    contactName: m.contactName || m.contact_name,
    contactEmail: m.contactEmail || m.contact_email,
    userName: m.userName || m.user_name,
    userEmail: m.userEmail || m.user_email,
    // Role & Skills
    role: m.role || 'member',
    department: m.department,
    skills: parseJson(m.skills),
    // Availability
    isAvailable: m.is_available !== 0,
    availabilitySchedule: parseJson(m.availability_schedule) || {},
    timezone: m.timezone || 'Asia/Jakarta',
    maxConcurrentTasks: m.max_concurrent_tasks || 3,
    // Preferences
    taskTypes: parseJson(m.task_types),
    priorityLevel: m.priority_level || 'normal',
    preferredChannel: m.preferred_channel || 'email',
    notificationFrequency: m.notification_frequency || 'immediate',
    // Performance
    tasksCompleted: m.tasks_completed || 0,
    avgCompletionTime: m.avg_completion_time || 0,
    rating: m.rating || 5.0,
    // Gender
    gender: m.gender || null,
    contactAvatar: m.contactAvatar || m.contact_avatar || null,
    // Status
    isActive: m.is_active !== 0,
    createdAt: m.created_at,
    updatedAt: m.updated_at
  };
}

/**
 * Transform task from database to API format
 * Maps to agentic_tasks table from migration schema
 */
function transformTask(t) {
  if (!t) return null;

  // Parse JSON fields safely
  const parseJson = (val) => {
    if (!val) return [];
    if (typeof val === 'object') return val;
    try {
      return JSON.parse(val);
    } catch {
      return [];
    }
  };

  // Calculate if task is overdue
  const isOverdue = t.due_at &&
    t.status !== 'completed' &&
    t.status !== 'cancelled' &&
    new Date(t.due_at) < new Date();

  return {
    id: t.id,
    profileId: t.agentic_id,
    userId: t.user_id,
    parentTaskId: t.parent_task_id,
    // Task details
    title: t.title,
    description: t.description,
    taskType: t.task_type,
    // Assignment
    assignedTo: t.assigned_to,
    assignedAt: t.assigned_at,
    // Assignee info from join
    assigneeName: t.assigneeName || t.assignee_name,
    assigneeRole: t.assigneeRole || t.assignee_role,
    // Source info
    sourceType: t.source_type,
    sourceId: t.source_id,
    sourceContent: t.source_content,
    // Status & Priority
    status: t.status || 'pending',
    priority: t.priority || 'normal',
    // Timeline
    dueAt: t.due_at,
    startedAt: t.started_at,
    completedAt: t.completed_at,
    // Progress
    progressPercent: t.progress_percent || 0,
    estimatedHours: t.ai_estimated_hours,
    actualHours: t.actual_hours,
    // Updates as array
    updates: parseJson(t.updates),
    tags: parseJson(t.tags),
    // AI analysis
    aiSummary: t.ai_summary,
    aiSuggestedAssignee: t.ai_suggested_assignee,
    aiAnalysis: t.ai_analysis,
    completionNotes: t.completion_notes,
    // Computed
    isOverdue,
    // Timestamps
    createdAt: t.created_at,
    updatedAt: t.updated_at
  };
}

// ============================================
// Profile CRUD
// ============================================

/**
 * GET /api/agentic/profiles
 * List agentic profiles with pagination, search, and filters
 */
router.get('/profiles', (req, res) => {
  try {
    const db = getDatabase();
    const { limit = 50, offset = 0, search, status, profileType, cliType } = req.query;

    // Build WHERE clause (exclude terminated/deleted by default)
    let whereClause = "WHERE p.user_id = ? AND p.status != 'terminated'";
    const params = [req.user.id];

    if (search) {
      whereClause += ' AND (p.name LIKE ? OR p.description LIKE ? OR p.role LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (status) {
      whereClause += ' AND p.status = ?';
      params.push(status);
    }

    // Support both agent_type (migration) and profileType query param
    if (profileType) {
      whereClause += ' AND p.agent_type = ?';
      params.push(profileType);
    }

    // Filter by CLI type (PRD refactor)
    if (cliType) {
      whereClause += ' AND p.cli_type = ?';
      params.push(cliType);
    }

    // Count query for pagination
    const countSql = `SELECT COUNT(*) as count FROM agentic_profiles p ${whereClause}`;
    const totalCount = db.prepare(countSql).get(...params).count;

    // Main query - no agent_id column in migration schema, profiles are standalone
    const sql = `
      SELECT p.*
      FROM agentic_profiles p
      ${whereClause}
      ORDER BY p.created_at DESC
      LIMIT ? OFFSET ?
    `;
    params.push(parseInt(limit), parseInt(offset));

    const profiles = db.prepare(sql).all(...params);
    const transformed = profiles.map(transformProfile);

    res.json({
      profiles: transformed,
      pagination: createPagination(transformed, {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: totalCount
      })
    });

  } catch (error) {
    logger.error(`Failed to list profiles: ${error.message}`);
    res.status(500).json({ error: 'Failed to list profiles' });
  }
});

/**
 * GET /api/agentic/profiles/by-agent/:agentId
 * Get the agentic profile linked to a specific agent
 */
router.get('/profiles/by-agent/:agentId', (req, res) => {
  try {
    const db = getDatabase();

    const profile = db.prepare(`
      SELECT p.*
      FROM agentic_profiles p
      WHERE p.agent_id = ? AND p.user_id = ?
    `).get(req.params.agentId, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'No agentic profile linked to this agent' });
    }

    res.json({ profile: transformProfile(profile) });

  } catch (error) {
    logger.error(`Failed to get profile by agent: ${error.message}`);
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

/**
 * GET /api/agentic/profiles/:id
 * Get a single profile
 */
router.get('/profiles/:id', (req, res) => {
  try {
    const db = getDatabase();

    const profile = db.prepare(`
      SELECT p.*
      FROM agentic_profiles p
      WHERE p.id = ? AND p.user_id = ?
    `).get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    res.json({ profile: transformProfile(profile) });

  } catch (error) {
    logger.error(`Failed to get profile: ${error.message}`);
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

/**
 * GET /api/agentic/profiles/:id/workspace
 * Get the workspace associated with this profile (PRD refactor)
 */
router.get('/profiles/:id/workspace', (req, res) => {
  try {
    const db = getDatabase();

    // Verify profile ownership
    const profile = db.prepare('SELECT id, name FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Get workspace linked to this profile
    const workspace = db.prepare(`
      SELECT w.*, p.name as profileName
      FROM agentic_workspaces w
      LEFT JOIN agentic_profiles p ON w.profile_id = p.id
      WHERE w.profile_id = ? AND w.user_id = ?
    `).get(req.params.id, req.user.id);

    if (!workspace) {
      return res.status(404).json({ error: 'No workspace found for this profile' });
    }

    res.json({ workspace: transformWorkspace(workspace) });

  } catch (error) {
    logger.error(`Failed to get profile workspace: ${error.message}`);
    res.status(500).json({ error: 'Failed to get profile workspace' });
  }
});

/**
 * POST /api/agentic/profiles/:id/workspace
 * Create a workspace for this profile if it doesn't exist
 */
router.post('/profiles/:id/workspace', (req, res) => {
  try {
    const db = getDatabase();
    const { cliType, autonomyLevel } = req.body;

    // Verify profile ownership
    const profile = db.prepare('SELECT * FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Check if workspace already exists
    const existingWorkspace = db.prepare('SELECT id FROM agentic_workspaces WHERE profile_id = ?')
      .get(req.params.id);

    if (existingWorkspace) {
      return res.status(400).json({ error: 'Workspace already exists for this profile' });
    }

    // Use profile's cli_type and workspace_autonomy_level as defaults
    const resolvedCliType = cliType || profile.cli_type || 'claude';
    const resolvedAutonomy = autonomyLevel || profile.workspace_autonomy_level || 'semi';

    const workspaceId = uuidv4();
    const workspacePath = path.join(WORKSPACES_DIR, req.user.id, req.params.id);

    db.prepare(`
      INSERT INTO agentic_workspaces (
        id, user_id, profile_id, agent_id, cli_type, autonomy_level,
        workspace_path, status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, 'idle')
    `).run(
      workspaceId,
      req.user.id,
      req.params.id,
      profile.agent_id || null,
      resolvedCliType,
      resolvedAutonomy,
      workspacePath
    );

    const workspace = db.prepare(`
      SELECT w.*, p.name as profileName
      FROM agentic_workspaces w
      LEFT JOIN agentic_profiles p ON w.profile_id = p.id
      WHERE w.id = ?
    `).get(workspaceId);

    logger.info(`Created workspace for profile: ${profile.name} (${workspaceId})`);

    res.status(201).json({ workspace: transformWorkspace(workspace) });

  } catch (error) {
    logger.error(`Failed to create profile workspace: ${error.message}`);
    res.status(500).json({ error: 'Failed to create profile workspace' });
  }
});

/**
 * POST /api/agentic/profiles
 * Create a new agentic profile
 * Uses migration schema columns (agent_type, parent_agentic_id, etc.)
 */
router.post('/profiles', (req, res) => {
  try {
    const {
      name,
      role,
      description,
      avatar,
      agentId,  // Deprecated: Link to agents table (legacy support)
      profileType,
      parentProfileId,
      // PRD Refactor: CLI type and workspace autonomy at profile level
      cliType,              // 'claude' | 'gemini' | 'opencode' | 'bash'
      workspaceAutonomyLevel, // 'semi' | 'full'
      autoCreateWorkspace,  // If true, creates workspace with default settings
      // AI Configuration
      aiProvider,
      aiModel,
      temperature,
      maxTokens,
      systemPrompt,
      routingPreset,
      // Autonomy settings
      autonomyLevel,
      requireApprovalFor,
      // Master contact
      masterContactId,
      masterContactChannel,
      notifyMasterOn,
      escalationTimeoutMinutes,
      // Sub-agent permissions
      canCreateChildren,
      maxChildren,
      maxHierarchyDepth,
      childrenAutonomyCap,
      // Resource limits
      dailyBudget,
      rateLimitPerMinute,
      // Response agents
      responseAgentIds
    } = req.body;

    if (!name || !role) {
      return res.status(400).json({ error: 'Profile name and role are required' });
    }

    const db = getDatabase();
    const profileId = uuidv4();

    // Calculate hierarchy level and path
    let hierarchyLevel = 0;
    let hierarchyPath = `/${profileId}`;

    // If sub-agent, verify parent exists and belongs to user
    if (profileType === 'sub' && parentProfileId) {
      const parent = db.prepare('SELECT id, hierarchy_level, hierarchy_path FROM agentic_profiles WHERE id = ? AND user_id = ?')
        .get(parentProfileId, req.user.id);
      if (!parent) {
        return res.status(400).json({ error: 'Parent profile not found' });
      }
      hierarchyLevel = (parent.hierarchy_level || 0) + 1;
      hierarchyPath = `${parent.hierarchy_path || ''}/${profileId}`;
    }

    // Validate agentId if provided - must belong to user and not already linked
    if (agentId) {
      const agent = db.prepare('SELECT id FROM agents WHERE id = ? AND user_id = ?').get(agentId, req.user.id);
      if (!agent) {
        return res.status(400).json({ error: 'Agent not found or does not belong to you' });
      }
      const existingLink = db.prepare('SELECT id FROM agentic_profiles WHERE agent_id = ?').get(agentId);
      if (existingLink) {
        return res.status(400).json({ error: 'This agent is already linked to another profile' });
      }
    }

    // Validate cliType if provided
    const validCliTypes = ['claude', 'gemini', 'opencode', 'bash'];
    const resolvedCliType = cliType && validCliTypes.includes(cliType) ? cliType : 'claude';
    const resolvedAutonomyLevel = workspaceAutonomyLevel === 'full' ? 'full' : 'semi';

    db.prepare(`
      INSERT INTO agentic_profiles (
        id, user_id, agent_id, name, role, description, avatar,
        agent_type, parent_agentic_id, hierarchy_level, hierarchy_path,
        ai_provider, ai_model, temperature, max_tokens, system_prompt, routing_preset,
        autonomy_level, require_approval_for,
        master_contact_id, master_contact_channel, notify_master_on, escalation_timeout_minutes,
        can_create_children, max_children, max_hierarchy_depth, children_autonomy_cap,
        daily_budget, rate_limit_per_minute,
        cli_type, workspace_autonomy_level,
        response_agent_ids,
        status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'inactive')
    `).run(
      profileId,
      req.user.id,
      agentId || null,
      name,
      role,
      description || null,
      avatar || null,
      profileType || 'master',
      parentProfileId || null,
      hierarchyLevel,
      hierarchyPath,
      aiProvider || 'task-routing',
      aiModel || null,
      temperature !== undefined ? temperature : null,
      maxTokens !== undefined ? maxTokens : null,
      systemPrompt || null,
      routingPreset || null,
      autonomyLevel || 'supervised',
      JSON.stringify(requireApprovalFor || []),
      masterContactId || null,
      masterContactChannel || 'email',
      JSON.stringify(notifyMasterOn || ['approval_needed', 'daily_report', 'critical_error']),
      escalationTimeoutMinutes ?? 60,
      canCreateChildren ? 1 : 0,
      maxChildren ?? 5,
      maxHierarchyDepth ?? 3,
      childrenAutonomyCap || 'supervised',
      dailyBudget ?? 10.0,
      rateLimitPerMinute ?? 60,
      resolvedCliType,
      resolvedAutonomyLevel,
      JSON.stringify(responseAgentIds || [])
    );

    const profile = db.prepare('SELECT * FROM agentic_profiles WHERE id = ?').get(profileId);

    // Auto-create workspace if requested
    let workspace = null;
    if (autoCreateWorkspace || cliType) {
      const workspaceId = uuidv4();
      const workspacePath = path.join(WORKSPACES_DIR, req.user.id, profileId);

      db.prepare(`
        INSERT INTO agentic_workspaces (
          id, user_id, profile_id, agent_id, cli_type, autonomy_level,
          workspace_path, status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, 'idle')
      `).run(
        workspaceId,
        req.user.id,
        profileId,
        agentId || null,
        resolvedCliType,
        resolvedAutonomyLevel,
        workspacePath
      );

      workspace = db.prepare('SELECT * FROM agentic_workspaces WHERE id = ?').get(workspaceId);
      logger.info(`Auto-created workspace for profile: ${name} (${workspaceId})`);
    }

    logger.info(`Agentic profile created: ${name} (${profileId})`);

    res.status(201).json({
      profile: transformProfile(profile),
      workspace: workspace ? transformWorkspace(workspace) : null
    });

  } catch (error) {
    logger.error(`Failed to create profile: ${error.message}`);
    res.status(500).json({ error: 'Failed to create profile' });
  }
});

/**
 * PUT /api/agentic/profiles/:id
 * Update an agentic profile
 */
router.put('/profiles/:id', (req, res) => {
  try {
    const db = getDatabase();

    // Verify ownership
    const existing = db.prepare('SELECT * FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!existing) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const {
      name,
      role,
      description,
      avatar,
      status,
      // PRD Refactor: CLI type and workspace autonomy
      cliType,
      workspaceAutonomyLevel,
      // AI Configuration
      aiProvider,
      aiModel,
      temperature,
      maxTokens,
      systemPrompt,
      routingPreset,
      // Autonomy settings
      autonomyLevel,
      requireApprovalFor,
      // Master contact
      masterContactId,
      masterContactChannel,
      notifyMasterOn,
      escalationTimeoutMinutes,
      // Sub-agent permissions
      canCreateChildren,
      maxChildren,
      maxHierarchyDepth,
      childrenAutonomyCap,
      // Resource limits
      dailyBudget,
      rateLimitPerMinute,
      // Response agents
      responseAgentIds,
      // Quick acknowledgment mode (Phase 2c)
      quickAckMode
    } = req.body;

    const updates = [];
    const params = [];

    if (name !== undefined) { updates.push('name = ?'); params.push(name); }
    if (role !== undefined) { updates.push('role = ?'); params.push(role); }
    if (description !== undefined) { updates.push('description = ?'); params.push(description); }
    if (avatar !== undefined) { updates.push('avatar = ?'); params.push(avatar); }
    if (status !== undefined) { updates.push('status = ?'); params.push(status); }
    // PRD Refactor: CLI type and workspace autonomy
    if (cliType !== undefined) {
      const validCliTypes = ['claude', 'gemini', 'opencode', 'bash'];
      if (validCliTypes.includes(cliType)) {
        updates.push('cli_type = ?'); params.push(cliType);
      }
    }
    if (workspaceAutonomyLevel !== undefined) {
      const validLevels = ['semi', 'full'];
      if (validLevels.includes(workspaceAutonomyLevel)) {
        updates.push('workspace_autonomy_level = ?'); params.push(workspaceAutonomyLevel);
      }
    }
    // AI Configuration
    if (aiProvider !== undefined) { updates.push('ai_provider = ?'); params.push(aiProvider); }
    if (aiModel !== undefined) { updates.push('ai_model = ?'); params.push(aiModel); }
    if (temperature !== undefined) { updates.push('temperature = ?'); params.push(temperature); }
    if (maxTokens !== undefined) { updates.push('max_tokens = ?'); params.push(maxTokens); }
    if (systemPrompt !== undefined) { updates.push('system_prompt = ?'); params.push(systemPrompt); }
    if (routingPreset !== undefined) { updates.push('routing_preset = ?'); params.push(routingPreset); }
    // Autonomy settings
    if (autonomyLevel !== undefined) { updates.push('autonomy_level = ?'); params.push(autonomyLevel); }
    if (requireApprovalFor !== undefined) { updates.push('require_approval_for = ?'); params.push(JSON.stringify(requireApprovalFor)); }
    // Master contact
    if (masterContactId !== undefined) { updates.push('master_contact_id = ?'); params.push(masterContactId); }
    if (masterContactChannel !== undefined) { updates.push('master_contact_channel = ?'); params.push(masterContactChannel); }
    if (notifyMasterOn !== undefined) { updates.push('notify_master_on = ?'); params.push(JSON.stringify(notifyMasterOn)); }
    if (escalationTimeoutMinutes !== undefined) { updates.push('escalation_timeout_minutes = ?'); params.push(escalationTimeoutMinutes); }
    // Sub-agent permissions
    if (canCreateChildren !== undefined) { updates.push('can_create_children = ?'); params.push(canCreateChildren ? 1 : 0); }
    if (maxChildren !== undefined) { updates.push('max_children = ?'); params.push(maxChildren); }
    if (maxHierarchyDepth !== undefined) { updates.push('max_hierarchy_depth = ?'); params.push(maxHierarchyDepth); }
    if (childrenAutonomyCap !== undefined) { updates.push('children_autonomy_cap = ?'); params.push(childrenAutonomyCap); }
    // Resource limits
    if (dailyBudget !== undefined) { updates.push('daily_budget = ?'); params.push(dailyBudget); }
    if (rateLimitPerMinute !== undefined) { updates.push('rate_limit_per_minute = ?'); params.push(rateLimitPerMinute); }
    // Response agents
    if (responseAgentIds !== undefined) { updates.push('response_agent_ids = ?'); params.push(JSON.stringify(responseAgentIds)); }
    // Quick acknowledgment mode (Phase 2c)
    if (quickAckMode !== undefined) {
      const validModes = ['off', 'typing', 'message'];
      if (validModes.includes(quickAckMode)) {
        updates.push('quick_ack_mode = ?'); params.push(quickAckMode);
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push("updated_at = datetime('now')");
    params.push(req.params.id);

    db.prepare(`UPDATE agentic_profiles SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    const profile = db.prepare('SELECT * FROM agentic_profiles WHERE id = ?').get(req.params.id);

    logger.info(`Agentic profile updated: ${profile.name} (${req.params.id})`);

    // Broadcast profile update event
    if (global.wsBroadcast) {
      global.wsBroadcast('agentic:profile_updated', {
        profileId: req.params.id,
        userId: req.user.id,
        profile: transformProfile(profile),
      });
    }

    res.json({ profile: transformProfile(profile) });

  } catch (error) {
    logger.error(`Failed to update profile: ${error.message}`);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

/**
 * DELETE /api/agentic/profiles/:id
 * Soft delete an agentic profile (set status to 'terminated')
 */
router.delete('/profiles/:id', (req, res) => {
  try {
    const db = getDatabase();

    // Verify ownership
    const profile = db.prepare('SELECT * FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Soft delete by setting status to 'terminated' and recording termination
    db.prepare(`
      UPDATE agentic_profiles
      SET status = 'terminated', terminated_at = datetime('now'), termination_reason = 'User deleted', updated_at = datetime('now')
      WHERE id = ?
    `).run(req.params.id);

    logger.info(`Agentic profile soft deleted: ${profile.name} (${req.params.id})`);

    // Broadcast profile delete event
    if (global.wsBroadcast) {
      global.wsBroadcast('agentic:profile_deleted', {
        profileId: req.params.id,
        userId: req.user.id,
        profileName: profile.name,
      });
    }

    res.json({ message: 'Profile deleted successfully' });

  } catch (error) {
    logger.error(`Failed to delete profile: ${error.message}`);
    res.status(500).json({ error: 'Failed to delete profile' });
  }
});

// ============================================
// Hierarchy
// ============================================

/**
 * GET /api/agentic/profiles/:id/hierarchy
 * Get the hierarchy tree for a profile (parent and children)
 */
router.get('/profiles/:id/hierarchy', (req, res) => {
  try {
    const db = getDatabase();

    // Verify ownership
    const profile = db.prepare('SELECT * FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Get parent if exists (using migration column name: parent_agentic_id)
    let parent = null;
    if (profile.parent_agentic_id) {
      parent = db.prepare('SELECT * FROM agentic_profiles WHERE id = ?').get(profile.parent_agentic_id);
    }

    // Get children (using migration column name: parent_agentic_id)
    const children = db.prepare(`
      SELECT *
      FROM agentic_profiles
      WHERE parent_agentic_id = ? AND user_id = ? AND status != 'terminated'
      ORDER BY created_at ASC
    `).all(req.params.id, req.user.id);

    res.json({
      hierarchy: {
        current: transformProfile(profile),
        parent: parent ? transformProfile(parent) : null,
        children: children.map(transformProfile)
      }
    });

  } catch (error) {
    logger.error(`Failed to get hierarchy: ${error.message}`);
    res.status(500).json({ error: 'Failed to get hierarchy' });
  }
});

/**
 * POST /api/agentic/profiles/:id/children
 * Create a sub-agent under this profile
 *
 * Skills parameter options:
 * - skills: array of skill IDs to assign directly (not inherited)
 * - inheritSkills: boolean (default: true) - whether to inherit parent's skills at level 1
 * - skillLevels: object mapping skill IDs to levels for non-inherited skills
 */
router.post('/profiles/:id/children', (req, res) => {
  try {
    const db = getDatabase();

    // Verify parent ownership and check if can create children
    const parent = db.prepare('SELECT * FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!parent) {
      return res.status(404).json({ error: 'Parent profile not found' });
    }

    // Check if parent can create children
    if (!parent.can_create_children) {
      return res.status(403).json({ error: 'This profile is not allowed to create sub-agents' });
    }

    // Check current children count
    const childCount = db.prepare(
      'SELECT COUNT(*) as count FROM agentic_profiles WHERE parent_agentic_id = ? AND status != ?'
    ).get(req.params.id, 'terminated').count;

    if (childCount >= (parent.max_children || 5)) {
      return res.status(400).json({ error: `Maximum children limit (${parent.max_children || 5}) reached` });
    }

    // Check hierarchy depth
    const parentLevel = parent.hierarchy_level || 0;
    if (parentLevel >= (parent.max_hierarchy_depth || 3)) {
      return res.status(400).json({ error: 'Maximum hierarchy depth reached' });
    }

    const {
      name,
      role,
      description,
      avatar,
      // AI Configuration
      aiProvider,
      aiModel,
      systemPrompt,
      // Autonomy - capped by parent
      autonomyLevel,
      // Skills configuration
      skills = [],
      inheritSkills = true,
      skillLevels = {}
    } = req.body;

    if (!name || !role) {
      return res.status(400).json({ error: 'Profile name and role are required' });
    }

    const profileId = uuidv4();
    const hierarchyLevel = parentLevel + 1;
    const hierarchyPath = `${parent.hierarchy_path || ''}/${profileId}`;

    // Cap autonomy level based on parent's childrenAutonomyCap
    const allowedAutonomy = parent.children_autonomy_cap || 'supervised';
    const autonomyOrder = ['supervised', 'semi-autonomous', 'autonomous'];
    const requestedIndex = autonomyOrder.indexOf(autonomyLevel || 'supervised');
    const allowedIndex = autonomyOrder.indexOf(allowedAutonomy);
    const finalAutonomy = requestedIndex <= allowedIndex ? (autonomyLevel || 'supervised') : allowedAutonomy;

    db.prepare(`
      INSERT INTO agentic_profiles (
        id, user_id, name, role, description, avatar,
        agent_type, parent_agentic_id, hierarchy_level, hierarchy_path,
        created_by_type, created_by_agentic_id,
        inherit_team, inherit_knowledge, inherit_monitoring, inherit_routing,
        ai_provider, ai_model, system_prompt,
        autonomy_level, master_contact_id, master_contact_channel,
        status
      )
      VALUES (?, ?, ?, ?, ?, ?, 'sub', ?, ?, ?, 'user', NULL, 1, 1, 0, 1, ?, ?, ?, ?, ?, ?, 'inactive')
    `).run(
      profileId,
      req.user.id,
      name,
      role,
      description || null,
      avatar || null,
      req.params.id, // parent_agentic_id
      hierarchyLevel,
      hierarchyPath,
      aiProvider || parent.ai_provider || 'task-routing',
      aiModel || parent.ai_model || null,
      systemPrompt || null,
      finalAutonomy,
      parent.master_contact_id, // Inherit master contact
      parent.master_contact_channel || 'email'
    );

    // Handle skills
    const inheritedSkills = [];
    const addedSkills = [];

    // Check if skills tables exist (migration may not have run yet)
    const tablesExist = db.prepare(`
      SELECT COUNT(*) as count FROM sqlite_master
      WHERE type='table' AND name IN ('agentic_skills_catalog', 'agentic_agent_skills', 'agentic_skill_history')
    `).get().count === 3;

    if (tablesExist) {
      // Inherit skills from parent if enabled
      if (inheritSkills) {
        const parentSkills = db.prepare(`
          SELECT s.*, c.xp_per_level
          FROM agentic_agent_skills s
          JOIN agentic_skills_catalog c ON s.skill_id = c.id
          WHERE s.agentic_id = ?
        `).all(req.params.id);

        for (const parentSkill of parentSkills) {
          const skillId = uuidv4();
          // Inherited skills start at level 1
          const inheritedLevel = 1;
          const xpPerLevel = JSON.parse(parentSkill.xp_per_level || '[100, 300, 600, 1000]');
          const pointsToNext = xpPerLevel[0] || 100;

          db.prepare(`
            INSERT INTO agentic_agent_skills
            (id, agentic_id, skill_id, current_level, experience_points, points_to_next_level, is_inherited, inherited_from)
            VALUES (?, ?, ?, ?, 0, ?, 1, ?)
          `).run(skillId, profileId, parentSkill.skill_id, inheritedLevel, pointsToNext, req.params.id);

          // Log to history
          db.prepare(`
            INSERT INTO agentic_skill_history
            (id, agentic_id, skill_id, action, from_level, to_level, experience_gained, details)
            VALUES (?, ?, ?, 'inherited', NULL, ?, 0, ?)
          `).run(uuidv4(), profileId, parentSkill.skill_id, inheritedLevel, JSON.stringify({
            source: 'parent_inheritance',
            parentAgenticId: req.params.id,
            parentLevel: parentSkill.current_level
          }));

          inheritedSkills.push(parentSkill.skill_id);
        }
      }

      // Add specified skills (non-inherited)
      if (skills && skills.length > 0) {
        for (const skillId of skills) {
          // Skip if already inherited
          if (inheritedSkills.includes(skillId)) continue;

          // Verify skill exists
          const catalogSkill = db.prepare('SELECT * FROM agentic_skills_catalog WHERE id = ?').get(skillId);
          if (!catalogSkill) continue;

          const level = Math.min(skillLevels[skillId] || 1, catalogSkill.max_level || 4);
          const xpPerLevel = JSON.parse(catalogSkill.xp_per_level || '[100, 300, 600, 1000]');
          const pointsToNext = level < (catalogSkill.max_level || 4) ? (xpPerLevel[level - 1] || 100) : 0;

          const id = uuidv4();
          db.prepare(`
            INSERT INTO agentic_agent_skills
            (id, agentic_id, skill_id, current_level, experience_points, points_to_next_level, is_inherited, inherited_from)
            VALUES (?, ?, ?, ?, 0, ?, 0, NULL)
          `).run(id, profileId, skillId, level, pointsToNext);

          // Log to history
          db.prepare(`
            INSERT INTO agentic_skill_history
            (id, agentic_id, skill_id, action, from_level, to_level, experience_gained, details)
            VALUES (?, ?, ?, 'acquired', NULL, ?, 0, ?)
          `).run(uuidv4(), profileId, skillId, level, JSON.stringify({
            source: 'sub_agent_creation',
            parentAgenticId: req.params.id
          }));

          addedSkills.push(skillId);
        }
      }
    }

    const profile = db.prepare('SELECT * FROM agentic_profiles WHERE id = ?').get(profileId);

    logger.info(`Sub-agent created: ${name} (${profileId}) under parent ${req.params.id}, inherited ${inheritedSkills.length} skills, added ${addedSkills.length} skills`);

    res.status(201).json({
      profile: transformProfile(profile),
      skills: {
        inherited: inheritedSkills.length,
        added: addedSkills.length,
        total: inheritedSkills.length + addedSkills.length
      }
    });

  } catch (error) {
    logger.error(`Failed to create sub-agent: ${error.message}`);
    res.status(500).json({ error: 'Failed to create sub-agent' });
  }
});

/**
 * DELETE /api/agentic/profiles/:id/children/:childId
 * Detach a child from this profile (does not delete, just removes parent link)
 */
router.delete('/profiles/:id/children/:childId', (req, res) => {
  try {
    const db = getDatabase();

    // Verify parent ownership
    const parent = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!parent) {
      return res.status(404).json({ error: 'Parent profile not found' });
    }

    // Verify child belongs to parent (using migration column: parent_agentic_id)
    const child = db.prepare('SELECT * FROM agentic_profiles WHERE id = ? AND parent_agentic_id = ? AND user_id = ?')
      .get(req.params.childId, req.params.id, req.user.id);

    if (!child) {
      return res.status(404).json({ error: 'Child profile not found under this parent' });
    }

    // Detach child by removing parent link and changing to master type
    // Recalculate hierarchy
    db.prepare(`
      UPDATE agentic_profiles
      SET parent_agentic_id = NULL, agent_type = 'master', hierarchy_level = 0, hierarchy_path = '/' || id, updated_at = datetime('now')
      WHERE id = ?
    `).run(req.params.childId);

    logger.info(`Child detached: ${child.name} (${req.params.childId}) from parent ${req.params.id}`);

    res.json({ message: 'Child profile detached successfully' });

  } catch (error) {
    logger.error(`Failed to detach child: ${error.message}`);
    res.status(500).json({ error: 'Failed to detach child' });
  }
});

// ============================================
// Configuration Endpoints
// ============================================

/**
 * GET /api/agentic/routing-presets
 * Get available routing presets for agent AI configuration
 */
router.get('/routing-presets', (req, res) => {
  const presets = [
    { id: 'task-routing', name: 'Task Routing (Auto)', description: 'Uses SuperBrain task classification to route to the best provider per task tier' },
    { id: 'speed', name: 'Speed Optimized', description: 'Prioritizes fast response times with lighter models' },
    { id: 'quality', name: 'Quality Optimized', description: 'Prioritizes response quality with more capable models' },
    { id: 'cost', name: 'Cost Optimized', description: 'Prioritizes lower cost with free/cheap models' },
    { id: 'balanced', name: 'Balanced', description: 'Balances speed, quality, and cost' },
  ];
  res.json({ presets });
});

/**
 * GET /api/agentic/profiles/:id/routing
 * Get AI routing configuration for a profile from agentic_ai_routing table
 */
router.get('/profiles/:id/routing', (req, res) => {
  try {
    const db = getDatabase();

    // Verify profile ownership
    const profile = db.prepare('SELECT id, routing_preset FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Get routing configuration from agentic_ai_routing table
    const routingRules = db.prepare(`
      SELECT * FROM agentic_ai_routing WHERE agentic_id = ? AND user_id = ?
      ORDER BY task_type
    `).all(req.params.id, req.user.id);

    // Transform to API format
    const routing = {
      preset: profile.routing_preset,
      rules: routingRules.map(r => ({
        id: r.id,
        taskType: r.task_type,
        providerChain: r.provider_chain ? JSON.parse(r.provider_chain) : [],
        temperature: r.temperature,
        maxTokens: r.max_tokens,
        systemPromptOverride: r.system_prompt_override,
        maxRetries: r.max_retries,
        retryDelayMs: r.retry_delay_ms,
        timeoutSeconds: r.timeout_seconds,
        priority: r.priority,
        isActive: r.is_active !== 0
      }))
    };

    res.json({ routing });

  } catch (error) {
    logger.error(`Failed to get routing: ${error.message}`);
    res.status(500).json({ error: 'Failed to get routing' });
  }
});

/**
 * PUT /api/agentic/profiles/:id/routing
 * Update AI routing configuration for a profile
 */
router.put('/profiles/:id/routing', (req, res) => {
  try {
    const db = getDatabase();

    // Verify ownership
    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const { preset, rules } = req.body;

    // Update preset on profile
    if (preset !== undefined) {
      db.prepare(`
        UPDATE agentic_profiles SET routing_preset = ?, updated_at = datetime('now') WHERE id = ?
      `).run(preset, req.params.id);
    }

    // Update/insert routing rules
    if (rules && Array.isArray(rules)) {
      for (const rule of rules) {
        if (rule.id) {
          // Update existing
          db.prepare(`
            UPDATE agentic_ai_routing SET
              provider_chain = ?, temperature = ?, max_tokens = ?,
              system_prompt_override = ?, max_retries = ?, retry_delay_ms = ?,
              timeout_seconds = ?, priority = ?, is_active = ?, updated_at = datetime('now')
            WHERE id = ? AND agentic_id = ?
          `).run(
            JSON.stringify(rule.providerChain || []),
            rule.temperature ?? 0.7,
            rule.maxTokens ?? 4096,
            rule.systemPromptOverride || null,
            rule.maxRetries ?? 2,
            rule.retryDelayMs ?? 1000,
            rule.timeoutSeconds ?? 60,
            rule.priority || 'normal',
            rule.isActive !== false ? 1 : 0,
            rule.id,
            req.params.id
          );
        } else if (rule.taskType) {
          // Insert new
          const ruleId = uuidv4();
          db.prepare(`
            INSERT OR REPLACE INTO agentic_ai_routing (
              id, agentic_id, user_id, task_type, provider_chain,
              temperature, max_tokens, system_prompt_override,
              max_retries, retry_delay_ms, timeout_seconds, priority, is_active
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
          `).run(
            ruleId,
            req.params.id,
            req.user.id,
            rule.taskType,
            JSON.stringify(rule.providerChain || []),
            rule.temperature ?? 0.7,
            rule.maxTokens ?? 4096,
            rule.systemPromptOverride || null,
            rule.maxRetries ?? 2,
            rule.retryDelayMs ?? 1000,
            rule.timeoutSeconds ?? 60,
            rule.priority || 'normal'
          );
        }
      }
    }

    logger.info(`Routing updated for profile ${req.params.id}`);

    // Return updated routing
    const updatedProfile = db.prepare('SELECT routing_preset FROM agentic_profiles WHERE id = ?').get(req.params.id);
    const updatedRules = db.prepare('SELECT * FROM agentic_ai_routing WHERE agentic_id = ?').all(req.params.id);

    res.json({
      routing: {
        preset: updatedProfile.routing_preset,
        rules: updatedRules.map(r => ({
          id: r.id,
          taskType: r.task_type,
          providerChain: r.provider_chain ? JSON.parse(r.provider_chain) : [],
          temperature: r.temperature,
          maxTokens: r.max_tokens,
          isActive: r.is_active !== 0
        }))
      }
    });

  } catch (error) {
    logger.error(`Failed to update routing: ${error.message}`);
    res.status(500).json({ error: 'Failed to update routing' });
  }
});

/**
 * Helper: Transform a scope DB row to API format
 */
function transformScopeRow(scope) {
  if (!scope) return null;
  return {
    id: scope.id,
    scopeType: scope.scope_type || 'team_only',
    platformAccountId: scope.platform_account_id || null,
    whitelistContactIds: scope.whitelist_contact_ids ? JSON.parse(scope.whitelist_contact_ids) : [],
    whitelistTags: scope.whitelist_tags ? JSON.parse(scope.whitelist_tags) : [],
    whitelistGroupIds: scope.whitelist_group_ids ? JSON.parse(scope.whitelist_group_ids) : [],
    allowTeamMembers: scope.allow_team_members !== 0,
    allowMasterContact: scope.allow_master_contact !== 0,
    notifyOnOutOfScope: scope.notify_on_out_of_scope !== 0,
    autoAddApproved: scope.auto_add_approved !== 0,
    logAllCommunications: scope.log_all_communications !== 0,
  };
}

/**
 * GET /api/agentic/profiles/:id/contact-scope
 * Get contact scope for a profile. Supports ?platformAccountId= for per-platform scope.
 * Cascades: per-account → global fallback.
 */
router.get('/profiles/:id/contact-scope', (req, res) => {
  try {
    const db = getDatabase();
    const platformAccountId = req.query.platformAccountId || null;

    // Verify profile ownership
    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Cascade: try per-platform first, then global fallback
    let scope = null;
    if (platformAccountId) {
      scope = db.prepare(
        'SELECT * FROM agentic_contact_scope WHERE agentic_id = ? AND platform_account_id = ?'
      ).get(req.params.id, platformAccountId);
    }
    if (!scope) {
      scope = db.prepare(
        'SELECT * FROM agentic_contact_scope WHERE agentic_id = ? AND platform_account_id IS NULL'
      ).get(req.params.id);
    }

    const contactScope = scope ? transformScopeRow(scope) : {
      scopeType: 'team_only',
      platformAccountId: null,
      whitelistContactIds: [],
      whitelistTags: [],
      whitelistGroupIds: [],
      allowTeamMembers: true,
      allowMasterContact: true,
      notifyOnOutOfScope: true,
      autoAddApproved: false,
      logAllCommunications: true,
    };

    res.json({ contactScope });

  } catch (error) {
    logger.error(`Failed to get contact scope: ${error.message}`);
    res.status(500).json({ error: 'Failed to get contact scope' });
  }
});

/**
 * GET /api/agentic/profiles/:id/contact-scope/all
 * Get ALL scope rows (global + per-platform overrides) for a profile.
 */
router.get('/profiles/:id/contact-scope/all', (req, res) => {
  try {
    const db = getDatabase();

    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const rows = db.prepare(
      'SELECT * FROM agentic_contact_scope WHERE agentic_id = ? ORDER BY platform_account_id IS NULL DESC, platform_account_id'
    ).all(req.params.id);

    res.json({
      scopes: rows.map(transformScopeRow),
    });

  } catch (error) {
    logger.error(`Failed to get all contact scopes: ${error.message}`);
    res.status(500).json({ error: 'Failed to get contact scopes' });
  }
});

/**
 * PUT /api/agentic/profiles/:id/contact-scope
 * Upsert contact scope. Accepts platformAccountId in body for per-platform scope.
 */
router.put('/profiles/:id/contact-scope', (req, res) => {
  try {
    const db = getDatabase();

    // Verify ownership and check if master
    const profile = db.prepare('SELECT * FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    if (profile.agent_type === 'sub') {
      return res.status(403).json({ error: 'Sub-agents cannot modify contact scope. Update the master profile instead.' });
    }

    const { contactScope } = req.body;

    if (contactScope === undefined) {
      return res.status(400).json({ error: 'contactScope is required' });
    }

    const platformAccountId = contactScope.platformAccountId || null;

    // Upsert by (agentic_id, platform_account_id)
    let existing = null;
    if (platformAccountId) {
      existing = db.prepare(
        'SELECT id FROM agentic_contact_scope WHERE agentic_id = ? AND platform_account_id = ?'
      ).get(req.params.id, platformAccountId);
    } else {
      existing = db.prepare(
        'SELECT id FROM agentic_contact_scope WHERE agentic_id = ? AND platform_account_id IS NULL'
      ).get(req.params.id);
    }

    if (existing) {
      const updateSql = platformAccountId
        ? 'UPDATE agentic_contact_scope SET scope_type = ?, whitelist_contact_ids = ?, whitelist_tags = ?, whitelist_group_ids = ?, allow_team_members = ?, allow_master_contact = ?, notify_on_out_of_scope = ?, auto_add_approved = ?, log_all_communications = ?, updated_at = datetime(\'now\') WHERE agentic_id = ? AND platform_account_id = ?'
        : 'UPDATE agentic_contact_scope SET scope_type = ?, whitelist_contact_ids = ?, whitelist_tags = ?, whitelist_group_ids = ?, allow_team_members = ?, allow_master_contact = ?, notify_on_out_of_scope = ?, auto_add_approved = ?, log_all_communications = ?, updated_at = datetime(\'now\') WHERE agentic_id = ? AND platform_account_id IS NULL';

      const params = [
        contactScope.scopeType || 'team_only',
        JSON.stringify(contactScope.whitelistContactIds || []),
        JSON.stringify(contactScope.whitelistTags || []),
        JSON.stringify(contactScope.whitelistGroupIds || []),
        contactScope.allowTeamMembers !== false ? 1 : 0,
        contactScope.allowMasterContact !== false ? 1 : 0,
        contactScope.notifyOnOutOfScope !== false ? 1 : 0,
        contactScope.autoAddApproved ? 1 : 0,
        contactScope.logAllCommunications !== false ? 1 : 0,
        req.params.id,
      ];
      if (platformAccountId) params.push(platformAccountId);

      db.prepare(updateSql).run(...params);
    } else {
      const scopeId = uuidv4();
      db.prepare(`
        INSERT INTO agentic_contact_scope (
          id, agentic_id, user_id, platform_account_id, scope_type,
          whitelist_contact_ids, whitelist_tags, whitelist_group_ids,
          allow_team_members, allow_master_contact, notify_on_out_of_scope,
          auto_add_approved, log_all_communications
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        scopeId,
        req.params.id,
        req.user.id,
        platformAccountId,
        contactScope.scopeType || 'team_only',
        JSON.stringify(contactScope.whitelistContactIds || []),
        JSON.stringify(contactScope.whitelistTags || []),
        JSON.stringify(contactScope.whitelistGroupIds || []),
        contactScope.allowTeamMembers !== false ? 1 : 0,
        contactScope.allowMasterContact !== false ? 1 : 0,
        contactScope.notifyOnOutOfScope !== false ? 1 : 0,
        contactScope.autoAddApproved ? 1 : 0,
        contactScope.logAllCommunications !== false ? 1 : 0
      );
    }

    logger.info(`Contact scope updated for profile ${req.params.id} (platform: ${platformAccountId || 'global'})`);

    res.json({ contactScope: { ...contactScope, platformAccountId } });

  } catch (error) {
    logger.error(`Failed to update contact scope: ${error.message}`);
    res.status(500).json({ error: 'Failed to update contact scope' });
  }
});

/**
 * DELETE /api/agentic/profiles/:id/contact-scope
 * Delete a per-platform scope override (revert to global).
 * Requires ?platformAccountId= query param.
 */
router.delete('/profiles/:id/contact-scope', (req, res) => {
  try {
    const db = getDatabase();
    const platformAccountId = req.query.platformAccountId;

    if (!platformAccountId) {
      return res.status(400).json({ error: 'platformAccountId query param is required. Cannot delete global scope.' });
    }

    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const result = db.prepare(
      'DELETE FROM agentic_contact_scope WHERE agentic_id = ? AND platform_account_id = ?'
    ).run(req.params.id, platformAccountId);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'No per-platform scope found for this account' });
    }

    logger.info(`Deleted per-platform scope for profile ${req.params.id} (platform: ${platformAccountId})`);
    res.json({ message: 'Per-platform scope deleted. Global scope will now apply.' });

  } catch (error) {
    logger.error(`Failed to delete contact scope: ${error.message}`);
    res.status(500).json({ error: 'Failed to delete contact scope' });
  }
});

/**
 * GET /api/agentic/profiles/:id/background
 * Get background for a profile from agentic_background table (inherited for sub-agents)
 */
router.get('/profiles/:id/background', (req, res) => {
  try {
    const db = getDatabase();

    const profile = db.prepare('SELECT agent_type, parent_agentic_id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Get background from agentic_background table
    let background = db.prepare('SELECT * FROM agentic_background WHERE agentic_id = ?').get(req.params.id);
    let inherited = false;

    // For sub-agents, inherit from parent if not set
    if (!background && profile.agent_type === 'sub' && profile.parent_agentic_id) {
      background = db.prepare('SELECT * FROM agentic_background WHERE agentic_id = ?').get(profile.parent_agentic_id);
      inherited = true;
    }

    const result = background ? {
      id: background.id,
      companyName: background.company_name,
      companyShortName: background.company_short_name,
      companyType: background.company_type,
      industry: background.industry,
      description: background.description,
      established: background.established,
      employeeCount: background.employee_count,
      services: background.services ? JSON.parse(background.services) : [],
      products: background.products ? JSON.parse(background.products) : [],
      primaryPhone: background.primary_phone,
      primaryEmail: background.primary_email,
      supportEmail: background.support_email,
      website: background.website,
      addressStreet: background.address_street,
      addressCity: background.address_city,
      addressState: background.address_state,
      addressPostalCode: background.address_postal_code,
      addressCountry: background.address_country,
      timezone: background.timezone,
      businessHours: background.business_hours ? JSON.parse(background.business_hours) : {},
      linkedin: background.linkedin,
      facebook: background.facebook,
      twitter: background.twitter,
      instagram: background.instagram,
      customFields: background.custom_fields ? JSON.parse(background.custom_fields) : {}
    } : null;

    res.json({ background: result, inherited });

  } catch (error) {
    logger.error(`Failed to get background: ${error.message}`);
    res.status(500).json({ error: 'Failed to get background' });
  }
});

/**
 * PUT /api/agentic/profiles/:id/background
 * Update background (master profiles only)
 */
router.put('/profiles/:id/background', (req, res) => {
  try {
    const db = getDatabase();

    // Verify ownership and check if master
    const profile = db.prepare('SELECT * FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    if (profile.agent_type === 'sub') {
      return res.status(403).json({ error: 'Sub-agents cannot modify background. Update the master profile instead.' });
    }

    const { background } = req.body;

    if (background === undefined) {
      return res.status(400).json({ error: 'background is required' });
    }

    if (!background.companyName) {
      return res.status(400).json({ error: 'companyName is required' });
    }

    // Upsert into agentic_background
    const existing = db.prepare('SELECT id FROM agentic_background WHERE agentic_id = ?').get(req.params.id);

    if (existing) {
      db.prepare(`
        UPDATE agentic_background SET
          company_name = ?, company_short_name = ?, company_type = ?,
          industry = ?, description = ?, established = ?, employee_count = ?,
          services = ?, products = ?,
          primary_phone = ?, primary_email = ?, support_email = ?, website = ?,
          address_street = ?, address_city = ?, address_state = ?,
          address_postal_code = ?, address_country = ?,
          timezone = ?, business_hours = ?,
          linkedin = ?, facebook = ?, twitter = ?, instagram = ?,
          custom_fields = ?, updated_at = datetime('now')
        WHERE agentic_id = ?
      `).run(
        background.companyName,
        background.companyShortName || null,
        background.companyType || null,
        background.industry || null,
        background.description || null,
        background.established || null,
        background.employeeCount || null,
        JSON.stringify(background.services || []),
        JSON.stringify(background.products || []),
        background.primaryPhone || null,
        background.primaryEmail || null,
        background.supportEmail || null,
        background.website || null,
        background.addressStreet || null,
        background.addressCity || null,
        background.addressState || null,
        background.addressPostalCode || null,
        background.addressCountry || null,
        background.timezone || 'UTC',
        JSON.stringify(background.businessHours || {}),
        background.linkedin || null,
        background.facebook || null,
        background.twitter || null,
        background.instagram || null,
        JSON.stringify(background.customFields || {}),
        req.params.id
      );
    } else {
      const bgId = uuidv4();
      db.prepare(`
        INSERT INTO agentic_background (
          id, agentic_id, user_id, company_name, company_short_name, company_type,
          industry, description, established, employee_count, services, products,
          primary_phone, primary_email, support_email, website,
          address_street, address_city, address_state, address_postal_code, address_country,
          timezone, business_hours, linkedin, facebook, twitter, instagram, custom_fields
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        bgId,
        req.params.id,
        req.user.id,
        background.companyName,
        background.companyShortName || null,
        background.companyType || null,
        background.industry || null,
        background.description || null,
        background.established || null,
        background.employeeCount || null,
        JSON.stringify(background.services || []),
        JSON.stringify(background.products || []),
        background.primaryPhone || null,
        background.primaryEmail || null,
        background.supportEmail || null,
        background.website || null,
        background.addressStreet || null,
        background.addressCity || null,
        background.addressState || null,
        background.addressPostalCode || null,
        background.addressCountry || null,
        background.timezone || 'UTC',
        JSON.stringify(background.businessHours || {}),
        background.linkedin || null,
        background.facebook || null,
        background.twitter || null,
        background.instagram || null,
        JSON.stringify(background.customFields || {})
      );
    }

    logger.info(`Background updated for profile ${req.params.id}`);

    res.json({ background });

  } catch (error) {
    logger.error(`Failed to update background: ${error.message}`);
    res.status(500).json({ error: 'Failed to update background' });
  }
});

// =====================================================
// PERSONALITY MANAGEMENT
// =====================================================

const { getPersonalityService } = require('../services/agentic/PersonalityService.cjs');

/**
 * GET /api/agentic/profiles/:id/personality
 * Get all personality files (SOUL, AGENTS, USER, IDENTITY)
 */
router.get('/profiles/:id/personality', (req, res) => {
  try {
    const db = getDatabase();

    // Verify ownership
    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const personalityService = getPersonalityService();
    const personality = personalityService.getPersonality(req.params.id);

    res.json(personality);

  } catch (error) {
    logger.error(`Failed to get personality: ${error.message}`);
    res.status(500).json({ error: 'Failed to get personality' });
  }
});

/**
 * PUT /api/agentic/profiles/:id/personality
 * Update all personality files at once
 */
router.put('/profiles/:id/personality', (req, res) => {
  try {
    const db = getDatabase();

    // Verify ownership
    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const personalityService = getPersonalityService();
    const personality = personalityService.updatePersonality(req.params.id, req.body);

    logger.info(`Personality updated for profile ${req.params.id}`);
    res.json(personality);

  } catch (error) {
    logger.error(`Failed to update personality: ${error.message}`);
    res.status(500).json({ error: 'Failed to update personality' });
  }
});

/**
 * PUT /api/agentic/profiles/:id/personality/:fileType
 * Update a specific personality file (soul, agents, user, identity)
 */
router.put('/profiles/:id/personality/:fileType', (req, res) => {
  try {
    const db = getDatabase();
    const { fileType } = req.params;
    const { content } = req.body;

    // Verify ownership
    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }

    const personalityService = getPersonalityService();
    const personality = personalityService.updatePersonalityFile(req.params.id, fileType, content);

    logger.info(`Personality file ${fileType} updated for profile ${req.params.id}`);
    res.json(personality);

  } catch (error) {
    logger.error(`Failed to update personality file: ${error.message}`);
    res.status(500).json({ error: error.message || 'Failed to update personality file' });
  }
});

/**
 * DELETE /api/agentic/profiles/:id/personality/:fileType
 * Reset a specific personality file to default
 */
router.delete('/profiles/:id/personality/:fileType', (req, res) => {
  try {
    const db = getDatabase();
    const { fileType } = req.params;

    // Verify ownership
    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const personalityService = getPersonalityService();
    const personality = personalityService.resetPersonalityFile(req.params.id, fileType);

    logger.info(`Personality file ${fileType} reset for profile ${req.params.id}`);
    res.json(personality);

  } catch (error) {
    logger.error(`Failed to reset personality file: ${error.message}`);
    res.status(500).json({ error: error.message || 'Failed to reset personality file' });
  }
});

/**
 * POST /api/agentic/profiles/:id/personality/reset
 * Reset all personality files to defaults
 */
router.post('/profiles/:id/personality/reset', (req, res) => {
  try {
    const db = getDatabase();

    // Verify ownership
    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const personalityService = getPersonalityService();
    const personality = personalityService.resetAllPersonality(req.params.id);

    logger.info(`All personality files reset for profile ${req.params.id}`);
    res.json(personality);

  } catch (error) {
    logger.error(`Failed to reset personality: ${error.message}`);
    res.status(500).json({ error: 'Failed to reset personality' });
  }
});

/**
 * GET /api/agentic/profiles/:id/personality/templates
 * Get default personality templates
 */
router.get('/profiles/:id/personality/templates', (req, res) => {
  try {
    const personalityService = getPersonalityService();
    const templates = personalityService.getTemplates();

    res.json(templates);

  } catch (error) {
    logger.error(`Failed to get personality templates: ${error.message}`);
    res.status(500).json({ error: 'Failed to get templates' });
  }
});

/**
 * POST /api/agentic/profiles/:id/personality/generate
 * Generate personality from template with customizations
 */
router.post('/profiles/:id/personality/generate', (req, res) => {
  try {
    const db = getDatabase();

    // Verify ownership
    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const personalityService = getPersonalityService();
    const personality = personalityService.createFromTemplate(req.params.id, req.body);

    logger.info(`Personality generated from template for profile ${req.params.id}`);
    res.json(personality);

  } catch (error) {
    logger.error(`Failed to generate personality: ${error.message}`);
    res.status(500).json({ error: 'Failed to generate personality' });
  }
});

/**
 * GET /api/agentic/profiles/:id/personality/ai-context
 * Preview the agent data that will be used for AI personality generation
 */
router.get('/profiles/:id/personality/ai-context', (req, res) => {
  try {
    const db = getDatabase();

    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const personalityService = getPersonalityService();
    const context = personalityService.gatherAgentContext(req.params.id);

    res.json({
      profile: {
        name: context.profile.name,
        role: context.profile.role,
        description: context.profile.description,
        hasSystemPrompt: !!context.profile.system_prompt,
        autonomyLevel: context.profile.autonomy_level,
        agentType: context.profile.agent_type,
      },
      hasBackground: !!context.background,
      background: context.background ? {
        companyName: context.background.company_name,
        industry: context.background.industry,
        timezone: context.background.timezone,
      } : null,
      goalsCount: context.goals.length,
      goals: context.goals.map(g => ({ title: g.title, priority: g.priority })),
      skillsCount: context.skills.length,
      skills: context.skills.map(s => ({ name: s.name, level: s.current_level })),
      teamMembersCount: context.teamMembers.length,
      schedulesCount: context.schedules.length,
      monitoringCount: context.monitoring.length,
    });

  } catch (error) {
    logger.error(`Failed to get AI context: ${error.message}`);
    res.status(500).json({ error: 'Failed to gather agent context' });
  }
});

/**
 * POST /api/agentic/profiles/:id/personality/ai-generate
 * Generate personality using AI based on agent's existing data
 */
router.post('/profiles/:id/personality/ai-generate', async (req, res) => {
  try {
    const db = getDatabase();

    const profile = db.prepare('SELECT id, name FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const { guidance, language } = req.body;

    const personalityService = getPersonalityService();
    const result = await personalityService.generateWithAI(
      req.params.id,
      req.user.id,
      { guidance, language }
    );

    logger.info(`AI personality generated for profile ${req.params.id} (${profile.name})`);
    res.json(result);

  } catch (error) {
    logger.error(`Failed to AI-generate personality: ${error.message}`);
    res.status(500).json({
      error: error.message || 'Failed to generate personality with AI',
    });
  }
});

/**
 * GET /api/agentic/profiles/:id/personality/system-prompt
 * Get combined system prompt generated from personality files
 */
router.get('/profiles/:id/personality/system-prompt', (req, res) => {
  try {
    const db = getDatabase();

    // Verify ownership
    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const personalityService = getPersonalityService();
    const systemPrompt = personalityService.generateSystemPrompt(req.params.id);

    res.json({ systemPrompt });

  } catch (error) {
    logger.error(`Failed to generate system prompt: ${error.message}`);
    res.status(500).json({ error: 'Failed to generate system prompt' });
  }
});

/**
 * POST /api/agentic/profiles/:id/personality/sync-workspace
 * Sync personality files to workspace directory
 */
router.post('/profiles/:id/personality/sync-workspace', async (req, res) => {
  try {
    const db = getDatabase();

    // Verify ownership
    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Get workspace path
    const workspace = db.prepare(`
      SELECT workspace_path FROM agentic_workspaces
      WHERE profile_id = ? AND status = 'active'
    `).get(req.params.id);

    if (!workspace) {
      return res.status(400).json({ error: 'No active workspace found for this profile' });
    }

    const personalityService = getPersonalityService();
    await personalityService.generateWorkspaceFiles(req.params.id, workspace.workspace_path);

    logger.info(`Personality files synced to workspace for profile ${req.params.id}`);
    res.json({ success: true, workspacePath: workspace.workspace_path });

  } catch (error) {
    logger.error(`Failed to sync personality to workspace: ${error.message}`);
    res.status(500).json({ error: 'Failed to sync personality to workspace' });
  }
});

/**
 * GET /api/agentic/personality/presets
 * List available personality presets (no profile required)
 */
router.get('/personality/presets', (req, res) => {
  try {
    const personalityService = getPersonalityService();
    const presets = personalityService.getPresets();
    res.json({ presets });
  } catch (error) {
    logger.error(`Failed to get personality presets: ${error.message}`);
    res.status(500).json({ error: 'Failed to get personality presets' });
  }
});

/**
 * GET /api/agentic/personality/presets/:presetId
 * Get full preset content by ID
 */
router.get('/personality/presets/:presetId', (req, res) => {
  try {
    const personalityService = getPersonalityService();
    const preset = personalityService.getPreset(req.params.presetId);

    if (!preset) {
      return res.status(404).json({ error: 'Preset not found' });
    }

    res.json(preset);
  } catch (error) {
    logger.error(`Failed to get personality preset: ${error.message}`);
    res.status(500).json({ error: 'Failed to get personality preset' });
  }
});

/**
 * POST /api/agentic/profiles/:id/personality/apply-preset
 * Apply a personality preset to a profile
 */
router.post('/profiles/:id/personality/apply-preset', (req, res) => {
  try {
    const { presetId } = req.body;

    if (!presetId) {
      return res.status(400).json({ error: 'presetId is required' });
    }

    const db = getDatabase();

    // Verify ownership
    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const personalityService = getPersonalityService();
    const personality = personalityService.applyPreset(req.params.id, presetId);

    logger.info(`Applied preset "${presetId}" to profile ${req.params.id}`);
    res.json(personality);

  } catch (error) {
    logger.error(`Failed to apply personality preset: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/agentic/profiles/:id/master-contact
 * Get master contact for a profile
 */
router.get('/profiles/:id/master-contact', (req, res) => {
  try {
    const db = getDatabase();

    const profile = db.prepare(`
      SELECT p.master_contact_id, p.master_contact_channel, p.notify_master_on,
             p.escalation_timeout_minutes, c.display_name, c.avatar
      FROM agentic_profiles p
      LEFT JOIN contacts c ON p.master_contact_id = c.id
      WHERE p.id = ? AND p.user_id = ?
    `).get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    let notifyOn;
    try {
      notifyOn = JSON.parse(profile.notify_master_on || '[]');
    } catch {
      notifyOn = ['approval_needed', 'daily_report', 'critical_error'];
    }

    const masterContact = profile.master_contact_id ? {
      contactId: profile.master_contact_id,
      channel: profile.master_contact_channel || 'email',
      displayName: profile.display_name,
      avatar: profile.avatar,
      notifyOn,
      escalationTimeoutMinutes: profile.escalation_timeout_minutes || 60,
    } : null;

    res.json({
      masterContact,
      notifyOn,
      escalationTimeoutMinutes: profile.escalation_timeout_minutes || 60,
    });

  } catch (error) {
    logger.error(`Failed to get master contact: ${error.message}`);
    res.status(500).json({ error: 'Failed to get master contact' });
  }
});

/**
 * PUT /api/agentic/profiles/:id/master-contact
 * Update master contact for a profile
 */
router.put('/profiles/:id/master-contact', (req, res) => {
  try {
    const db = getDatabase();

    // Verify ownership
    const existing = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!existing) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const { masterContact, notifyOn, escalationTimeoutMinutes } = req.body;

    if (masterContact === undefined) {
      return res.status(400).json({ error: 'masterContact is required' });
    }

    // Validate contact exists if provided
    if (masterContact && masterContact.contactId) {
      const contact = db.prepare('SELECT id FROM contacts WHERE id = ? AND user_id = ?')
        .get(masterContact.contactId, req.user.id);
      if (!contact) {
        return res.status(400).json({ error: 'Contact not found' });
      }
    }

    db.prepare(`
      UPDATE agentic_profiles SET
        master_contact_id = ?,
        master_contact_channel = ?,
        notify_master_on = ?,
        escalation_timeout_minutes = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      masterContact ? masterContact.contactId : null,
      masterContact ? (masterContact.channel || 'email') : null,
      JSON.stringify(notifyOn || ['approval_needed', 'daily_report', 'critical_error']),
      escalationTimeoutMinutes || 60,
      req.params.id
    );

    logger.info(`Master contact updated for profile ${req.params.id}`);

    res.json({ masterContact, notifyOn, escalationTimeoutMinutes });

  } catch (error) {
    logger.error(`Failed to update master contact: ${error.message}`);
    res.status(500).json({ error: 'Failed to update master contact' });
  }
});

/**
 * POST /api/agentic/profiles/:id/master-contact/test
 * Send a test notification to the master contact
 */
router.post('/profiles/:id/master-contact/test', async (req, res) => {
  try {
    const db = getDatabase();

    // Verify ownership
    const profile = db.prepare(`
      SELECT p.id, p.name, p.master_contact_id, p.master_contact_channel
      FROM agentic_profiles p
      WHERE p.id = ? AND p.user_id = ?
    `).get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    if (!profile.master_contact_id) {
      return res.status(400).json({ error: 'No master contact configured for this profile' });
    }

    // Import the notification service
    const { masterNotificationService } = require('../services/agentic/MasterNotificationService.cjs');

    // Send test notification
    const result = await masterNotificationService.sendTestNotification(
      req.params.id,
      req.user.id,
      profile.master_contact_channel || 'email'
    );

    if (result.success) {
      logger.info(`Test notification sent for profile ${req.params.id}`);
      res.json({
        success: true,
        message: 'Test notification sent successfully',
        channel: result.channel,
        notificationId: result.notificationId,
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error || 'Failed to send test notification',
      });
    }

  } catch (error) {
    logger.error(`Failed to send test notification: ${error.message}`);
    res.status(500).json({ error: 'Failed to send test notification' });
  }
});

/**
 * GET /api/agentic/profiles/:id/notifications
 * Get notification history for a profile
 */
router.get('/profiles/:id/notifications', async (req, res) => {
  try {
    const db = getDatabase();

    // Verify ownership
    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const { limit = 50, offset = 0, type, status } = req.query;

    const { masterNotificationService } = require('../services/agentic/MasterNotificationService.cjs');

    const result = await masterNotificationService.getNotificationHistory(
      req.params.id,
      req.user.id,
      {
        limit: parseInt(limit) || 50,
        offset: parseInt(offset) || 0,
        type: type || null,
        status: status || null,
      }
    );

    res.json(result);

  } catch (error) {
    logger.error(`Failed to get notifications: ${error.message}`);
    res.status(500).json({ error: 'Failed to get notifications' });
  }
});

// ============================================
// Team Management
// Uses agentic_team_members table from migration (agentic_id, contact_id columns)
// ============================================

/**
 * GET /api/agentic/profiles/:id/team
 * List team members for a profile
 */
router.get('/profiles/:id/team', (req, res) => {
  try {
    const db = getDatabase();

    // Verify ownership
    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Migration schema uses agentic_id and contact_id
    const members = db.prepare(`
      SELECT tm.*, c.display_name as contactName, c.avatar as contactAvatar
      FROM agentic_team_members tm
      LEFT JOIN contacts c ON tm.contact_id = c.id
      WHERE tm.agentic_id = ? AND tm.is_active = 1
      ORDER BY tm.created_at ASC
    `).all(req.params.id);

    res.json({ members: members.map(transformTeamMember) });

  } catch (error) {
    logger.error(`Failed to list team members: ${error.message}`);
    res.status(500).json({ error: 'Failed to list team members' });
  }
});

/**
 * POST /api/agentic/profiles/:id/team
 * Add a team member to a profile
 */
router.post('/profiles/:id/team', (req, res) => {
  try {
    const db = getDatabase();

    // Verify ownership
    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const {
      contactId,
      role,
      department,
      skills,
      gender,
      availabilitySchedule,
      timezone,
      maxConcurrentTasks,
      taskTypes,
      priorityLevel,
      preferredChannel,
      notificationFrequency
    } = req.body;

    if (!contactId || !role) {
      return res.status(400).json({ error: 'contactId and role are required' });
    }

    // Check if contact exists
    const contact = db.prepare('SELECT id, display_name, gender as contactGender FROM contacts WHERE id = ? AND user_id = ?')
      .get(contactId, req.user.id);
    if (!contact) {
      return res.status(400).json({ error: 'Contact not found' });
    }

    // Check if already a member
    const existing = db.prepare('SELECT id FROM agentic_team_members WHERE agentic_id = ? AND contact_id = ?')
      .get(req.params.id, contactId);
    if (existing) {
      return res.status(400).json({ error: 'Contact is already a team member' });
    }

    // Ensure gender column exists on team_members
    try {
      const tmInfo = db.prepare("PRAGMA table_info(agentic_team_members)").all();
      if (!tmInfo.find(c => c.name === 'gender')) {
        db.exec("ALTER TABLE agentic_team_members ADD COLUMN gender TEXT");
      }
    } catch (e) { /* ignore */ }

    // Resolve gender: explicit > contact > auto-detect
    let resolvedGender = gender || contact.contactGender || null;
    if (!resolvedGender) {
      try {
        const { detectGender } = require('../services/genderDetector.cjs');
        resolvedGender = detectGender(contact.display_name);
      } catch (e) { /* ignore */ }
    }

    const memberId = uuidv4();

    db.prepare(`
      INSERT INTO agentic_team_members (
        id, agentic_id, user_id, contact_id, role, department, skills, gender,
        availability_schedule, timezone, max_concurrent_tasks,
        task_types, priority_level, preferred_channel, notification_frequency, is_active
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      memberId,
      req.params.id,
      req.user.id,
      contactId,
      role,
      department || null,
      JSON.stringify(skills || []),
      resolvedGender,
      JSON.stringify(availabilitySchedule || {}),
      timezone || 'Asia/Jakarta',
      maxConcurrentTasks ?? 3,
      JSON.stringify(taskTypes || []),
      priorityLevel || 'normal',
      preferredChannel || 'email',
      notificationFrequency || 'immediate'
    );

    // Sync gender to contact if contact doesn't have one yet
    if (resolvedGender && !contact.contactGender) {
      try {
        db.prepare("UPDATE contacts SET gender = ?, updated_at = datetime('now') WHERE id = ?")
          .run(resolvedGender, contactId);
      } catch (e) { /* ignore */ }
    }

    const member = db.prepare(`
      SELECT tm.*, c.display_name as contactName, c.avatar as contactAvatar
      FROM agentic_team_members tm
      LEFT JOIN contacts c ON tm.contact_id = c.id
      WHERE tm.id = ?
    `).get(memberId);

    logger.info(`Team member added to profile ${req.params.id}: ${contact.display_name}`);

    res.status(201).json({ member: transformTeamMember(member) });

  } catch (error) {
    logger.error(`Failed to add team member: ${error.message}`);
    res.status(500).json({ error: 'Failed to add team member' });
  }
});

/**
 * PUT /api/agentic/profiles/:id/team/:memberId
 * Update a team member's role/settings
 */
router.put('/profiles/:id/team/:memberId', (req, res) => {
  try {
    const db = getDatabase();

    // Verify ownership
    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Verify member exists
    const existing = db.prepare('SELECT id FROM agentic_team_members WHERE id = ? AND agentic_id = ?')
      .get(req.params.memberId, req.params.id);

    if (!existing) {
      return res.status(404).json({ error: 'Team member not found' });
    }

    const {
      role,
      department,
      skills,
      gender,
      isAvailable,
      availabilitySchedule,
      timezone,
      maxConcurrentTasks,
      taskTypes,
      priorityLevel,
      preferredChannel,
      notificationFrequency
    } = req.body;

    const updates = [];
    const params = [];

    if (role !== undefined) { updates.push('role = ?'); params.push(role); }
    if (department !== undefined) { updates.push('department = ?'); params.push(department); }
    if (skills !== undefined) { updates.push('skills = ?'); params.push(JSON.stringify(skills)); }
    if (gender !== undefined) { updates.push('gender = ?'); params.push(gender || null); }
    if (isAvailable !== undefined) { updates.push('is_available = ?'); params.push(isAvailable ? 1 : 0); }
    if (availabilitySchedule !== undefined) { updates.push('availability_schedule = ?'); params.push(JSON.stringify(availabilitySchedule)); }
    if (timezone !== undefined) { updates.push('timezone = ?'); params.push(timezone); }
    if (maxConcurrentTasks !== undefined) { updates.push('max_concurrent_tasks = ?'); params.push(maxConcurrentTasks); }
    if (taskTypes !== undefined) { updates.push('task_types = ?'); params.push(JSON.stringify(taskTypes)); }
    if (priorityLevel !== undefined) { updates.push('priority_level = ?'); params.push(priorityLevel); }
    if (preferredChannel !== undefined) { updates.push('preferred_channel = ?'); params.push(preferredChannel); }
    if (notificationFrequency !== undefined) { updates.push('notification_frequency = ?'); params.push(notificationFrequency); }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push("updated_at = datetime('now')");
    params.push(req.params.memberId);

    db.prepare(`UPDATE agentic_team_members SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    // Sync gender to linked contact
    if (gender !== undefined) {
      try {
        const memberRow = db.prepare('SELECT contact_id FROM agentic_team_members WHERE id = ?')
          .get(req.params.memberId);
        if (memberRow) {
          db.prepare("UPDATE contacts SET gender = ?, updated_at = datetime('now') WHERE id = ?")
            .run(gender || null, memberRow.contact_id);
        }
      } catch (e) { /* ignore */ }
    }

    const member = db.prepare(`
      SELECT tm.*, c.display_name as contactName, c.avatar as contactAvatar
      FROM agentic_team_members tm
      LEFT JOIN contacts c ON tm.contact_id = c.id
      WHERE tm.id = ?
    `).get(req.params.memberId);

    logger.info(`Team member updated: ${req.params.memberId}`);

    res.json({ member: transformTeamMember(member) });

  } catch (error) {
    logger.error(`Failed to update team member: ${error.message}`);
    res.status(500).json({ error: 'Failed to update team member' });
  }
});

/**
 * DELETE /api/agentic/profiles/:id/team/:memberId
 * Remove a team member from a profile (soft delete)
 */
router.delete('/profiles/:id/team/:memberId', (req, res) => {
  try {
    const db = getDatabase();

    // Verify ownership
    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Soft delete by setting is_active = 0
    const result = db.prepare(`
      UPDATE agentic_team_members SET is_active = 0, updated_at = datetime('now')
      WHERE id = ? AND agentic_id = ?
    `).run(req.params.memberId, req.params.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Team member not found' });
    }

    logger.info(`Team member removed: ${req.params.memberId}`);

    res.json({ message: 'Team member removed successfully' });

  } catch (error) {
    logger.error(`Failed to remove team member: ${error.message}`);
    res.status(500).json({ error: 'Failed to remove team member' });
  }
});

// ============================================
// Monitoring (Placeholder Stubs)
// ============================================

/**
 * Transform monitoring config from database to API format
 * Maps snake_case columns to camelCase properties
 */
function transformMonitoring(m) {
  if (!m) return null;

  // Parse JSON fields safely
  const parseJson = (val, defaultVal = []) => {
    if (!val) return defaultVal;
    if (typeof val === 'object') return val;
    try {
      return JSON.parse(val);
    } catch {
      return defaultVal;
    }
  };

  return {
    id: m.id,
    agenticId: m.agentic_id,
    userId: m.user_id,
    // Source configuration
    sourceType: m.source_type,
    sourceId: m.source_id,
    sourceName: m.source_name,
    // Filter options
    filterKeywords: parseJson(m.filter_keywords, []),
    filterSenders: parseJson(m.filter_senders, []),
    filterCategories: parseJson(m.filter_categories, []),
    priority: m.priority || 'normal',
    // Action settings
    autoRespond: m.auto_respond === 1,
    autoClassify: m.auto_classify === 1,
    forwardToTeam: m.forward_to_team === 1,
    // Status
    isActive: m.is_active === 1,
    createdAt: m.created_at,
    updatedAt: m.updated_at
  };
}

/**
 * GET /api/agentic/profiles/:id/monitoring
 * Get monitoring configuration for a profile
 * Returns all monitoring sources (email, whatsapp, telegram, platform_account)
 */
router.get('/profiles/:id/monitoring', (req, res) => {
  try {
    const db = getDatabase();

    // Verify profile ownership
    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Query monitoring configurations for this profile
    const monitoringConfigs = db.prepare(`
      SELECT *
      FROM agentic_monitoring
      WHERE agentic_id = ? AND user_id = ?
      ORDER BY source_type, created_at DESC
    `).all(req.params.id, req.user.id);

    // Transform to API format
    const transformed = monitoringConfigs.map(transformMonitoring);

    // Group by source type for easier frontend consumption
    const bySourceType = {
      email: transformed.filter(m => m.sourceType === 'email'),
      whatsapp: transformed.filter(m => m.sourceType === 'whatsapp'),
      telegram: transformed.filter(m => m.sourceType === 'telegram'),
      platformAccount: transformed.filter(m => m.sourceType === 'platform_account')
    };

    res.json({
      monitoring: transformed,
      bySourceType,
      summary: {
        total: transformed.length,
        active: transformed.filter(m => m.isActive).length,
        byType: {
          email: bySourceType.email.length,
          whatsapp: bySourceType.whatsapp.length,
          telegram: bySourceType.telegram.length,
          platformAccount: bySourceType.platformAccount.length
        }
      }
    });

  } catch (error) {
    logger.error(`Failed to get monitoring: ${error.message}`);
    res.status(500).json({ error: 'Failed to get monitoring configuration' });
  }
});

/**
 * PUT /api/agentic/profiles/:id/monitoring
 * Update or create monitoring configurations for a profile
 * Accepts an array of monitoring configs or a single config object
 */
router.put('/profiles/:id/monitoring', (req, res) => {
  try {
    const db = getDatabase();

    // Verify profile ownership
    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const { configs, sourceType, ...singleConfig } = req.body;

    // Handle batch update (array of configs) or single config
    const configsToProcess = configs || [{ sourceType, ...singleConfig }];

    if (!Array.isArray(configsToProcess) || configsToProcess.length === 0) {
      return res.status(400).json({ error: 'No monitoring configurations provided' });
    }

    // Validate source types
    const validSourceTypes = ['email', 'whatsapp', 'telegram', 'platform_account'];
    for (const config of configsToProcess) {
      if (config.sourceType && !validSourceTypes.includes(config.sourceType)) {
        return res.status(400).json({
          error: `Invalid source type: ${config.sourceType}. Must be one of: ${validSourceTypes.join(', ')}`
        });
      }
    }

    // Validate priority values
    const validPriorities = ['low', 'normal', 'high', 'urgent'];
    for (const config of configsToProcess) {
      if (config.priority && !validPriorities.includes(config.priority)) {
        return res.status(400).json({
          error: `Invalid priority: ${config.priority}. Must be one of: ${validPriorities.join(', ')}`
        });
      }
    }

    const results = [];

    for (const config of configsToProcess) {
      const {
        id: configId,
        sourceType: srcType,
        sourceId,
        sourceName,
        filterKeywords,
        filterSenders,
        filterCategories,
        priority,
        autoRespond,
        autoClassify,
        forwardToTeam,
        isActive
      } = config;

      // Skip configs without sourceType (required field)
      if (!srcType && !configId) {
        continue;
      }

      // Check if updating existing or creating new
      let existingConfig = null;
      if (configId) {
        existingConfig = db.prepare(`
          SELECT id FROM agentic_monitoring
          WHERE id = ? AND agentic_id = ? AND user_id = ?
        `).get(configId, req.params.id, req.user.id);
      } else if (srcType && sourceId) {
        // Find existing config by source type and source ID
        existingConfig = db.prepare(`
          SELECT id FROM agentic_monitoring
          WHERE agentic_id = ? AND source_type = ? AND source_id = ? AND user_id = ?
        `).get(req.params.id, srcType, sourceId, req.user.id);
      }

      if (existingConfig) {
        // Update existing monitoring config
        const updateFields = [];
        const updateValues = [];

        if (sourceName !== undefined) {
          updateFields.push('source_name = ?');
          updateValues.push(sourceName);
        }
        if (filterKeywords !== undefined) {
          updateFields.push('filter_keywords = ?');
          updateValues.push(JSON.stringify(filterKeywords));
        }
        if (filterSenders !== undefined) {
          updateFields.push('filter_senders = ?');
          updateValues.push(JSON.stringify(filterSenders));
        }
        if (filterCategories !== undefined) {
          updateFields.push('filter_categories = ?');
          updateValues.push(JSON.stringify(filterCategories));
        }
        if (priority !== undefined) {
          updateFields.push('priority = ?');
          updateValues.push(priority);
        }
        if (autoRespond !== undefined) {
          updateFields.push('auto_respond = ?');
          updateValues.push(autoRespond ? 1 : 0);
        }
        if (autoClassify !== undefined) {
          updateFields.push('auto_classify = ?');
          updateValues.push(autoClassify ? 1 : 0);
        }
        if (forwardToTeam !== undefined) {
          updateFields.push('forward_to_team = ?');
          updateValues.push(forwardToTeam ? 1 : 0);
        }
        if (isActive !== undefined) {
          updateFields.push('is_active = ?');
          updateValues.push(isActive ? 1 : 0);
        }

        if (updateFields.length > 0) {
          updateFields.push("updated_at = datetime('now')");
          updateValues.push(existingConfig.id);

          db.prepare(`
            UPDATE agentic_monitoring
            SET ${updateFields.join(', ')}
            WHERE id = ?
          `).run(...updateValues);
        }

        const updated = db.prepare('SELECT * FROM agentic_monitoring WHERE id = ?')
          .get(existingConfig.id);
        results.push(transformMonitoring(updated));

      } else if (srcType) {
        // Create new monitoring config
        const monitoringId = uuidv4();

        db.prepare(`
          INSERT INTO agentic_monitoring (
            id, agentic_id, user_id,
            source_type, source_id, source_name,
            filter_keywords, filter_senders, filter_categories, priority,
            auto_respond, auto_classify, forward_to_team,
            is_active, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `).run(
          monitoringId,
          req.params.id,
          req.user.id,
          srcType,
          sourceId || null,
          sourceName || null,
          JSON.stringify(filterKeywords || []),
          JSON.stringify(filterSenders || []),
          JSON.stringify(filterCategories || []),
          priority || 'normal',
          autoRespond ? 1 : 0,
          autoClassify !== false ? 1 : 0, // Default to true
          forwardToTeam ? 1 : 0,
          isActive !== false ? 1 : 0 // Default to true
        );

        const created = db.prepare('SELECT * FROM agentic_monitoring WHERE id = ?')
          .get(monitoringId);
        results.push(transformMonitoring(created));
      }
    }

    logger.info(`Monitoring updated for profile ${req.params.id}: ${results.length} configs`);

    res.json({
      monitoring: results,
      message: `Successfully updated ${results.length} monitoring configuration(s)`
    });

  } catch (error) {
    logger.error(`Failed to update monitoring: ${error.message}`);
    res.status(500).json({ error: 'Failed to update monitoring configuration' });
  }
});

/**
 * POST /api/agentic/profiles/:id/monitoring
 * Create a new monitoring configuration for a profile
 */
router.post('/profiles/:id/monitoring', (req, res) => {
  try {
    const db = getDatabase();

    // Verify profile ownership
    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const {
      sourceType,
      sourceId,
      sourceName,
      filterKeywords,
      filterSenders,
      filterCategories,
      priority,
      autoRespond,
      autoClassify,
      forwardToTeam,
      isActive
    } = req.body;

    // Validate required field
    if (!sourceType) {
      return res.status(400).json({ error: 'sourceType is required' });
    }

    // Validate source type
    const validSourceTypes = ['email', 'whatsapp', 'telegram', 'platform_account'];
    if (!validSourceTypes.includes(sourceType)) {
      return res.status(400).json({
        error: `Invalid source type: ${sourceType}. Must be one of: ${validSourceTypes.join(', ')}`
      });
    }

    // Validate priority
    const validPriorities = ['low', 'normal', 'high', 'urgent'];
    if (priority && !validPriorities.includes(priority)) {
      return res.status(400).json({
        error: `Invalid priority: ${priority}. Must be one of: ${validPriorities.join(', ')}`
      });
    }

    // Check for duplicate (same source type and source ID)
    if (sourceId) {
      const existing = db.prepare(`
        SELECT id FROM agentic_monitoring
        WHERE agentic_id = ? AND source_type = ? AND source_id = ?
      `).get(req.params.id, sourceType, sourceId);

      if (existing) {
        return res.status(409).json({
          error: 'Monitoring configuration already exists for this source',
          existingId: existing.id
        });
      }
    }

    const monitoringId = uuidv4();

    db.prepare(`
      INSERT INTO agentic_monitoring (
        id, agentic_id, user_id,
        source_type, source_id, source_name,
        filter_keywords, filter_senders, filter_categories, priority,
        auto_respond, auto_classify, forward_to_team,
        is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(
      monitoringId,
      req.params.id,
      req.user.id,
      sourceType,
      sourceId || null,
      sourceName || null,
      JSON.stringify(filterKeywords || []),
      JSON.stringify(filterSenders || []),
      JSON.stringify(filterCategories || []),
      priority || 'normal',
      autoRespond ? 1 : 0,
      autoClassify !== false ? 1 : 0,
      forwardToTeam ? 1 : 0,
      isActive !== false ? 1 : 0
    );

    const created = db.prepare('SELECT * FROM agentic_monitoring WHERE id = ?')
      .get(monitoringId);

    logger.info(`Monitoring config created for profile ${req.params.id}: ${sourceType}`);

    res.status(201).json({ monitoring: transformMonitoring(created) });

  } catch (error) {
    logger.error(`Failed to create monitoring: ${error.message}`);
    res.status(500).json({ error: 'Failed to create monitoring configuration' });
  }
});

/**
 * DELETE /api/agentic/profiles/:id/monitoring/:monitoringId
 * Delete a monitoring configuration
 */
router.delete('/profiles/:id/monitoring/:monitoringId', (req, res) => {
  try {
    const db = getDatabase();

    // Verify profile ownership
    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Verify monitoring config exists and belongs to this profile
    const monitoring = db.prepare(`
      SELECT id FROM agentic_monitoring
      WHERE id = ? AND agentic_id = ? AND user_id = ?
    `).get(req.params.monitoringId, req.params.id, req.user.id);

    if (!monitoring) {
      return res.status(404).json({ error: 'Monitoring configuration not found' });
    }

    // Delete the monitoring config
    db.prepare('DELETE FROM agentic_monitoring WHERE id = ?').run(req.params.monitoringId);

    logger.info(`Monitoring config deleted: ${req.params.monitoringId}`);

    res.json({ message: 'Monitoring configuration deleted successfully' });

  } catch (error) {
    logger.error(`Failed to delete monitoring: ${error.message}`);
    res.status(500).json({ error: 'Failed to delete monitoring configuration' });
  }
});

// ============================================
// Knowledge Sources
// Uses agentic_knowledge table from migration (agentic_id, library_id columns)
// Links agentic profiles to knowledge_libraries for RAG access
// ============================================

/**
 * Transform knowledge source from database to API format
 */
function transformKnowledgeSource(k) {
  if (!k) return null;
  return {
    id: k.id,
    agenticId: k.agentic_id,
    libraryId: k.library_id,
    libraryName: k.libraryName || null,
    libraryDescription: k.libraryDescription || null,
    accessType: k.access_type,
    autoLearn: !!k.auto_learn,
    learnFrom: k.learn_from ? JSON.parse(k.learn_from) : [],
    priority: k.priority,
    isActive: !!k.is_active,
    createdAt: k.created_at
  };
}

/**
 * GET /api/agentic/profiles/:id/knowledge
 * List knowledge sources for a profile
 *
 * Query params:
 *   - limit: number (default 50, max 100)
 *   - offset: number (default 0)
 *   - active: boolean (filter by is_active, default true)
 */
router.get('/profiles/:id/knowledge', (req, res) => {
  try {
    const db = getDatabase();

    // Verify ownership
    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Parse pagination params
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 100);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);
    const activeOnly = req.query.active !== 'false';

    // Build query with library details
    let whereClause = 'ak.agentic_id = ?';
    const params = [req.params.id];

    if (activeOnly) {
      whereClause += ' AND ak.is_active = 1';
    }

    // Get total count for pagination
    const totalResult = db.prepare(`
      SELECT COUNT(*) as total FROM agentic_knowledge ak
      WHERE ${whereClause}
    `).get(...params);

    // Get knowledge sources with library info
    const sources = db.prepare(`
      SELECT
        ak.*,
        kl.name as libraryName,
        kl.description as libraryDescription
      FROM agentic_knowledge ak
      LEFT JOIN knowledge_libraries kl ON ak.library_id = kl.id
      WHERE ${whereClause}
      ORDER BY ak.priority DESC, ak.created_at ASC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    const pagination = createPagination(totalResult.total, limit, offset);

    res.json({
      sources: sources.map(transformKnowledgeSource),
      pagination
    });

  } catch (error) {
    logger.error(`Failed to list knowledge sources: ${error.message}`);
    res.status(500).json({ error: 'Failed to list knowledge sources' });
  }
});

/**
 * POST /api/agentic/profiles/:id/knowledge
 * Link a knowledge source to a profile
 *
 * Body:
 *   - libraryId: string (required) - ID of knowledge_libraries entry
 *   - accessType: string (optional) - 'read' | 'write' | 'manage' (default: 'read')
 *   - priority: number (optional) - Higher priority sources are queried first (default: 0)
 *   - autoLearn: boolean (optional) - Auto-ingest learnings from interactions (default: false)
 *   - learnFrom: array (optional) - Sources to learn from (default: [])
 */
router.post('/profiles/:id/knowledge', (req, res) => {
  try {
    const db = getDatabase();

    // Verify ownership
    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const {
      libraryId,
      accessType,
      priority,
      autoLearn,
      learnFrom
    } = req.body;

    // Validate required fields
    if (!libraryId) {
      return res.status(400).json({ error: 'libraryId is required' });
    }

    // Validate accessType if provided
    const validAccessTypes = ['read', 'write', 'manage'];
    if (accessType && !validAccessTypes.includes(accessType)) {
      return res.status(400).json({
        error: `Invalid accessType. Must be one of: ${validAccessTypes.join(', ')}`
      });
    }

    // Verify library exists and belongs to user
    const library = db.prepare(`
      SELECT id, name, description FROM knowledge_libraries
      WHERE id = ? AND user_id = ?
    `).get(libraryId, req.user.id);

    if (!library) {
      return res.status(404).json({ error: 'Knowledge library not found' });
    }

    // Check if already linked (prevent duplicates)
    const existing = db.prepare(`
      SELECT id, is_active FROM agentic_knowledge
      WHERE agentic_id = ? AND library_id = ?
    `).get(req.params.id, libraryId);

    if (existing) {
      // If exists but inactive, reactivate it
      if (!existing.is_active) {
        db.prepare(`
          UPDATE agentic_knowledge SET
            is_active = 1,
            access_type = ?,
            priority = ?,
            auto_learn = ?,
            learn_from = ?
          WHERE id = ?
        `).run(
          accessType || 'read',
          priority ?? 0,
          autoLearn ? 1 : 0,
          JSON.stringify(learnFrom || []),
          existing.id
        );

        const reactivated = db.prepare(`
          SELECT
            ak.*,
            kl.name as libraryName,
            kl.description as libraryDescription
          FROM agentic_knowledge ak
          LEFT JOIN knowledge_libraries kl ON ak.library_id = kl.id
          WHERE ak.id = ?
        `).get(existing.id);

        logger.info(`Knowledge source reactivated for profile ${req.params.id}: ${library.name}`);
        return res.status(200).json({
          source: transformKnowledgeSource(reactivated),
          reactivated: true
        });
      }

      return res.status(409).json({
        error: 'Knowledge library is already linked to this profile',
        existingId: existing.id
      });
    }

    // Create new knowledge source link
    const sourceId = uuidv4();
    db.prepare(`
      INSERT INTO agentic_knowledge (
        id, agentic_id, user_id, library_id,
        access_type, priority, auto_learn, learn_from
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      sourceId,
      req.params.id,
      req.user.id,
      libraryId,
      accessType || 'read',
      priority ?? 0,
      autoLearn ? 1 : 0,
      JSON.stringify(learnFrom || [])
    );

    // Fetch the created source with library details
    const source = db.prepare(`
      SELECT
        ak.*,
        kl.name as libraryName,
        kl.description as libraryDescription
      FROM agentic_knowledge ak
      LEFT JOIN knowledge_libraries kl ON ak.library_id = kl.id
      WHERE ak.id = ?
    `).get(sourceId);

    logger.info(`Knowledge source linked to profile ${req.params.id}: ${library.name}`);

    res.status(201).json({ source: transformKnowledgeSource(source) });

  } catch (error) {
    logger.error(`Failed to link knowledge source: ${error.message}`);
    res.status(500).json({ error: 'Failed to link knowledge source' });
  }
});

/**
 * PUT /api/agentic/profiles/:id/knowledge/:kid
 * Update a knowledge source link settings
 *
 * Body (all optional):
 *   - accessType: string - 'read' | 'write' | 'manage'
 *   - priority: number - Higher priority sources are queried first
 *   - autoLearn: boolean - Auto-ingest learnings from interactions
 *   - learnFrom: array - Sources to learn from
 *   - isActive: boolean - Enable/disable the knowledge source
 */
router.put('/profiles/:id/knowledge/:kid', (req, res) => {
  try {
    const db = getDatabase();

    // Verify ownership
    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Verify knowledge source exists
    const existing = db.prepare(`
      SELECT id FROM agentic_knowledge
      WHERE id = ? AND agentic_id = ?
    `).get(req.params.kid, req.params.id);

    if (!existing) {
      return res.status(404).json({ error: 'Knowledge source not found' });
    }

    const {
      accessType,
      priority,
      autoLearn,
      learnFrom,
      isActive
    } = req.body;

    // Validate accessType if provided
    const validAccessTypes = ['read', 'write', 'manage'];
    if (accessType !== undefined && !validAccessTypes.includes(accessType)) {
      return res.status(400).json({
        error: `Invalid accessType. Must be one of: ${validAccessTypes.join(', ')}`
      });
    }

    // Build update query dynamically
    const updates = [];
    const params = [];

    if (accessType !== undefined) { updates.push('access_type = ?'); params.push(accessType); }
    if (priority !== undefined) { updates.push('priority = ?'); params.push(priority); }
    if (autoLearn !== undefined) { updates.push('auto_learn = ?'); params.push(autoLearn ? 1 : 0); }
    if (learnFrom !== undefined) { updates.push('learn_from = ?'); params.push(JSON.stringify(learnFrom)); }
    if (isActive !== undefined) { updates.push('is_active = ?'); params.push(isActive ? 1 : 0); }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    params.push(req.params.kid);

    db.prepare(`UPDATE agentic_knowledge SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    // Fetch updated source with library details
    const source = db.prepare(`
      SELECT
        ak.*,
        kl.name as libraryName,
        kl.description as libraryDescription
      FROM agentic_knowledge ak
      LEFT JOIN knowledge_libraries kl ON ak.library_id = kl.id
      WHERE ak.id = ?
    `).get(req.params.kid);

    logger.info(`Knowledge source updated: ${req.params.kid}`);

    res.json({ source: transformKnowledgeSource(source) });

  } catch (error) {
    logger.error(`Failed to update knowledge source: ${error.message}`);
    res.status(500).json({ error: 'Failed to update knowledge source' });
  }
});

/**
 * DELETE /api/agentic/profiles/:id/knowledge/:kid
 * Unlink a knowledge source from a profile (soft delete)
 *
 * Query params:
 *   - hard: boolean (optional) - If true, permanently delete instead of soft delete
 */
router.delete('/profiles/:id/knowledge/:kid', (req, res) => {
  try {
    const db = getDatabase();

    // Verify ownership
    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const hardDelete = req.query.hard === 'true';

    if (hardDelete) {
      // Permanent delete
      const result = db.prepare(`
        DELETE FROM agentic_knowledge
        WHERE id = ? AND agentic_id = ?
      `).run(req.params.kid, req.params.id);

      if (result.changes === 0) {
        return res.status(404).json({ error: 'Knowledge source not found' });
      }

      logger.info(`Knowledge source permanently deleted: ${req.params.kid}`);
      res.json({ message: 'Knowledge source permanently deleted' });
    } else {
      // Soft delete by setting is_active = 0
      const result = db.prepare(`
        UPDATE agentic_knowledge SET is_active = 0
        WHERE id = ? AND agentic_id = ?
      `).run(req.params.kid, req.params.id);

      if (result.changes === 0) {
        return res.status(404).json({ error: 'Knowledge source not found' });
      }

      logger.info(`Knowledge source unlinked: ${req.params.kid}`);
      res.json({ message: 'Knowledge source unlinked successfully' });
    }

  } catch (error) {
    logger.error(`Failed to remove knowledge source: ${error.message}`);
    res.status(500).json({ error: 'Failed to remove knowledge source' });
  }
});

// ============================================
// Schedules
// Uses agentic_schedules table from migration
// ============================================

// Valid action types for schedules
const VALID_ACTION_TYPES = ['check_messages', 'send_report', 'review_tasks', 'update_knowledge', 'custom_prompt', 'self_reflect', 'follow_up_check_in', 'proactive_outreach', 'health_summary', 'reasoning_cycle'];
const VALID_SCHEDULE_TYPES = ['cron', 'interval', 'once', 'event'];

/**
 * Transform schedule from database to API format
 */
function transformSchedule(s) {
  if (!s) return null;
  return {
    id: s.id,
    agenticId: s.agentic_id,
    title: s.title,
    description: s.description,
    scheduleType: s.schedule_type,
    cronExpression: s.cron_expression,
    intervalMinutes: s.interval_minutes,
    nextRunAt: s.next_run_at,
    lastRunAt: s.last_run_at,
    actionType: s.action_type,
    actionConfig: s.action_config ? JSON.parse(s.action_config) : {},
    customPrompt: s.custom_prompt,
    createdBy: s.created_by,
    isActive: !!s.is_active,
    createdAt: s.created_at,
    updatedAt: s.updated_at
  };
}

/**
 * Calculate the next run time from a cron expression
 * @param {string} cronExpression - Cron expression (e.g., "0 9 * * *")
 * @param {string} timezone - Timezone (default: UTC)
 * @returns {string|null} ISO datetime string of next run
 */
function calculateNextRun(cronExpression, timezone = 'UTC') {
  if (!cronExpression) return null;

  try {
    // Use cron-parser if available (already installed via bull dependency)
    const cronParser = require('cron-parser');
    const options = {
      currentDate: new Date(),
      tz: timezone
    };
    const interval = cronParser.parseExpression(cronExpression, options);
    return interval.next().toISOString();
  } catch (error) {
    logger.warn(`Failed to parse cron expression "${cronExpression}": ${error.message}`);
    return null;
  }
}

/**
 * Validate a cron expression
 * @param {string} cronExpression - Cron expression to validate
 * @returns {boolean} True if valid
 */
function isValidCronExpression(cronExpression) {
  if (!cronExpression) return false;

  try {
    const cronParser = require('cron-parser');
    cronParser.parseExpression(cronExpression);
    return true;
  } catch {
    return false;
  }
}

/**
 * GET /api/agentic/profiles/:id/schedules
 * List schedules for a profile
 * Query params:
 *   - isActive: boolean - Filter by active status
 *   - actionType: string - Filter by action type
 *   - limit: number - Max results (default: 50)
 *   - offset: number - Offset for pagination (default: 0)
 */
router.get('/profiles/:id/schedules', (req, res) => {
  try {
    const db = getDatabase();

    // Verify ownership
    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Build query with filters
    const conditions = ['agentic_id = ?'];
    const params = [req.params.id];

    // Filter by is_active
    if (req.query.isActive !== undefined) {
      const isActive = req.query.isActive === 'true' || req.query.isActive === '1';
      conditions.push('is_active = ?');
      params.push(isActive ? 1 : 0);
    }

    // Filter by action_type
    if (req.query.actionType) {
      if (!VALID_ACTION_TYPES.includes(req.query.actionType)) {
        return res.status(400).json({
          error: 'Invalid action type',
          validTypes: VALID_ACTION_TYPES
        });
      }
      conditions.push('action_type = ?');
      params.push(req.query.actionType);
    }

    // Get total count for pagination
    const countResult = db.prepare(`
      SELECT COUNT(*) as total FROM agentic_schedules
      WHERE ${conditions.join(' AND ')}
    `).get(...params);
    const total = countResult.total;

    // Pagination
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const offset = parseInt(req.query.offset) || 0;

    // Get schedules with pagination
    const schedules = db.prepare(`
      SELECT * FROM agentic_schedules
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    // Transform and calculate next_run for active cron schedules
    const transformed = schedules.map(s => {
      const schedule = transformSchedule(s);
      // Recalculate next_run if it's a cron schedule and is active
      if (schedule.isActive && schedule.scheduleType === 'cron' && schedule.cronExpression) {
        const calculatedNextRun = calculateNextRun(schedule.cronExpression);
        if (calculatedNextRun && (!schedule.nextRunAt || new Date(calculatedNextRun) > new Date(schedule.nextRunAt))) {
          schedule.nextRunAt = calculatedNextRun;
        }
      }
      return schedule;
    });

    res.json({
      schedules: transformed,
      pagination: createPagination(transformed, { limit, offset, total })
    });

  } catch (error) {
    logger.error(`Failed to list schedules: ${error.message}`);
    res.status(500).json({ error: 'Failed to list schedules' });
  }
});

/**
 * POST /api/agentic/profiles/:id/schedules
 * Create a schedule for a profile
 * Body:
 *   - title: string (required) - Schedule name
 *   - description: string - Optional description
 *   - scheduleType: string - 'cron' | 'interval' | 'once' | 'event' (default: 'cron')
 *   - cronExpression: string - Cron expression (required for cron type)
 *   - intervalMinutes: number - Interval in minutes (required for interval type)
 *   - actionType: string (required) - Action type
 *   - actionConfig: object - Action configuration
 *   - customPrompt: string - Custom prompt for custom_prompt action
 *   - isActive: boolean - Whether schedule is active (default: true)
 */
router.post('/profiles/:id/schedules', (req, res) => {
  try {
    const db = getDatabase();

    // Verify ownership
    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const {
      title,
      description,
      scheduleType = 'cron',
      cronExpression,
      intervalMinutes,
      actionType,
      actionConfig,
      customPrompt,
      isActive = true
    } = req.body;

    // Validate required fields
    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'title is required' });
    }

    if (!actionType) {
      return res.status(400).json({ error: 'actionType is required' });
    }

    if (!VALID_ACTION_TYPES.includes(actionType)) {
      return res.status(400).json({
        error: 'Invalid action type',
        validTypes: VALID_ACTION_TYPES
      });
    }

    if (!VALID_SCHEDULE_TYPES.includes(scheduleType)) {
      return res.status(400).json({
        error: 'Invalid schedule type',
        validTypes: VALID_SCHEDULE_TYPES
      });
    }

    // Validate based on schedule type
    if (scheduleType === 'cron') {
      if (!cronExpression) {
        return res.status(400).json({ error: 'cronExpression is required for cron schedule type' });
      }
      if (!isValidCronExpression(cronExpression)) {
        return res.status(400).json({ error: 'Invalid cron expression format' });
      }
    } else if (scheduleType === 'interval') {
      if (!intervalMinutes || intervalMinutes < 1) {
        return res.status(400).json({ error: 'intervalMinutes is required and must be >= 1 for interval schedule type' });
      }
    }

    // Validate custom_prompt action requires customPrompt
    if (actionType === 'custom_prompt' && !customPrompt) {
      return res.status(400).json({ error: 'customPrompt is required for custom_prompt action type' });
    }

    // Deduplication: check if an active schedule with same title already exists
    const existingSchedule = db.prepare(`
      SELECT id, title FROM agentic_schedules
      WHERE agentic_id = ? AND title = ? AND is_active = 1
    `).get(req.params.id, title.trim());

    if (existingSchedule) {
      return res.status(409).json({
        error: `Schedule "${title.trim()}" already exists`,
        existingScheduleId: existingSchedule.id
      });
    }

    const scheduleId = uuidv4();

    // Calculate next run time
    let nextRunAt = null;
    if (scheduleType === 'cron' && cronExpression) {
      nextRunAt = calculateNextRun(cronExpression);
    } else if (scheduleType === 'interval' && intervalMinutes) {
      const nextRun = new Date();
      nextRun.setMinutes(nextRun.getMinutes() + intervalMinutes);
      nextRunAt = nextRun.toISOString();
    }

    db.prepare(`
      INSERT INTO agentic_schedules (
        id, agentic_id, user_id, title, description,
        schedule_type, cron_expression, interval_minutes, next_run_at,
        action_type, action_config, custom_prompt,
        created_by, is_active
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      scheduleId,
      req.params.id,
      req.user.id,
      title.trim(),
      description || null,
      scheduleType,
      cronExpression || null,
      intervalMinutes || null,
      nextRunAt,
      actionType,
      JSON.stringify(actionConfig || {}),
      customPrompt || null,
      'user',
      isActive ? 1 : 0
    );

    const schedule = db.prepare('SELECT * FROM agentic_schedules WHERE id = ?').get(scheduleId);

    logger.info(`Schedule created: ${scheduleId} for profile ${req.params.id}`);

    res.status(201).json({ schedule: transformSchedule(schedule) });

  } catch (error) {
    logger.error(`Failed to create schedule: ${error.message}`);
    res.status(500).json({ error: 'Failed to create schedule' });
  }
});

/**
 * GET /api/agentic/profiles/:id/schedules/:sid
 * Get a single schedule by ID
 */
router.get('/profiles/:id/schedules/:sid', (req, res) => {
  try {
    const db = getDatabase();

    // Verify profile ownership
    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const schedule = db.prepare('SELECT * FROM agentic_schedules WHERE id = ? AND agentic_id = ?')
      .get(req.params.sid, req.params.id);

    if (!schedule) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    res.json({ schedule: transformSchedule(schedule) });

  } catch (error) {
    logger.error(`Failed to get schedule: ${error.message}`);
    res.status(500).json({ error: 'Failed to get schedule' });
  }
});

/**
 * PUT /api/agentic/profiles/:id/schedules/:sid
 * Update a schedule
 * Body: Same fields as POST, all optional
 */
router.put('/profiles/:id/schedules/:sid', (req, res) => {
  try {
    const db = getDatabase();

    // Verify ownership
    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Check if schedule exists and belongs to profile
    const existing = db.prepare('SELECT * FROM agentic_schedules WHERE id = ? AND agentic_id = ?')
      .get(req.params.sid, req.params.id);

    if (!existing) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    const {
      title,
      description,
      scheduleType,
      cronExpression,
      intervalMinutes,
      actionType,
      actionConfig,
      customPrompt,
      isActive
    } = req.body;

    const updates = [];
    const params = [];

    if (title !== undefined) {
      if (!title.trim()) {
        return res.status(400).json({ error: 'title cannot be empty' });
      }
      updates.push('title = ?');
      params.push(title.trim());
    }

    if (description !== undefined) {
      updates.push('description = ?');
      params.push(description || null);
    }

    if (scheduleType !== undefined) {
      if (!VALID_SCHEDULE_TYPES.includes(scheduleType)) {
        return res.status(400).json({
          error: 'Invalid schedule type',
          validTypes: VALID_SCHEDULE_TYPES
        });
      }
      updates.push('schedule_type = ?');
      params.push(scheduleType);
    }

    // Determine effective schedule type for validation
    const effectiveScheduleType = scheduleType || existing.schedule_type;

    if (cronExpression !== undefined) {
      if (cronExpression && !isValidCronExpression(cronExpression)) {
        return res.status(400).json({ error: 'Invalid cron expression format' });
      }
      updates.push('cron_expression = ?');
      params.push(cronExpression || null);
    }

    if (intervalMinutes !== undefined) {
      if (intervalMinutes && intervalMinutes < 1) {
        return res.status(400).json({ error: 'intervalMinutes must be >= 1' });
      }
      updates.push('interval_minutes = ?');
      params.push(intervalMinutes || null);
    }

    if (actionType !== undefined) {
      if (!VALID_ACTION_TYPES.includes(actionType)) {
        return res.status(400).json({
          error: 'Invalid action type',
          validTypes: VALID_ACTION_TYPES
        });
      }
      updates.push('action_type = ?');
      params.push(actionType);
    }

    if (actionConfig !== undefined) {
      updates.push('action_config = ?');
      params.push(JSON.stringify(actionConfig || {}));
    }

    if (customPrompt !== undefined) {
      updates.push('custom_prompt = ?');
      params.push(customPrompt || null);
    }

    if (isActive !== undefined) {
      updates.push('is_active = ?');
      params.push(isActive ? 1 : 0);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    // Recalculate next_run if schedule parameters changed
    const effectiveCron = cronExpression !== undefined ? cronExpression : existing.cron_expression;
    const effectiveInterval = intervalMinutes !== undefined ? intervalMinutes : existing.interval_minutes;
    const effectiveIsActive = isActive !== undefined ? isActive : existing.is_active;

    if (effectiveIsActive) {
      let nextRunAt = null;
      if (effectiveScheduleType === 'cron' && effectiveCron) {
        nextRunAt = calculateNextRun(effectiveCron);
      } else if (effectiveScheduleType === 'interval' && effectiveInterval) {
        const nextRun = new Date();
        nextRun.setMinutes(nextRun.getMinutes() + effectiveInterval);
        nextRunAt = nextRun.toISOString();
      }
      if (nextRunAt) {
        updates.push('next_run_at = ?');
        params.push(nextRunAt);
      }
    }

    updates.push("updated_at = datetime('now')");
    params.push(req.params.sid);

    db.prepare(`UPDATE agentic_schedules SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    const schedule = db.prepare('SELECT * FROM agentic_schedules WHERE id = ?').get(req.params.sid);

    logger.info(`Schedule updated: ${req.params.sid}`);

    res.json({ schedule: transformSchedule(schedule) });

  } catch (error) {
    logger.error(`Failed to update schedule: ${error.message}`);
    res.status(500).json({ error: 'Failed to update schedule' });
  }
});

/**
 * DELETE /api/agentic/profiles/:id/schedules/:sid
 * Delete a schedule
 */
router.delete('/profiles/:id/schedules/:sid', (req, res) => {
  try {
    const db = getDatabase();

    // Verify ownership
    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Check if schedule exists and belongs to profile
    const existing = db.prepare('SELECT id FROM agentic_schedules WHERE id = ? AND agentic_id = ?')
      .get(req.params.sid, req.params.id);

    if (!existing) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    db.prepare('DELETE FROM agentic_schedules WHERE id = ?').run(req.params.sid);

    logger.info(`Schedule deleted: ${req.params.sid}`);

    res.json({ message: 'Schedule deleted successfully' });

  } catch (error) {
    logger.error(`Failed to delete schedule: ${error.message}`);
    res.status(500).json({ error: 'Failed to delete schedule' });
  }
});

/**
 * POST /api/agentic/profiles/:id/schedules/:sid/run
 * Manually trigger a schedule to run now
 */
router.post('/profiles/:id/schedules/:sid/run', (req, res) => {
  try {
    const db = getDatabase();

    // Verify ownership
    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Get the schedule
    const schedule = db.prepare('SELECT * FROM agentic_schedules WHERE id = ? AND agentic_id = ?')
      .get(req.params.sid, req.params.id);

    if (!schedule) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    // Update last_run_at and calculate next_run_at
    let nextRunAt = null;
    if (schedule.schedule_type === 'cron' && schedule.cron_expression) {
      nextRunAt = calculateNextRun(schedule.cron_expression);
    } else if (schedule.schedule_type === 'interval' && schedule.interval_minutes) {
      const nextRun = new Date();
      nextRun.setMinutes(nextRun.getMinutes() + schedule.interval_minutes);
      nextRunAt = nextRun.toISOString();
    }

    db.prepare(`
      UPDATE agentic_schedules
      SET last_run_at = datetime('now'), next_run_at = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(nextRunAt, req.params.sid);

    const updated = db.prepare('SELECT * FROM agentic_schedules WHERE id = ?').get(req.params.sid);

    logger.info(`Schedule manually triggered: ${req.params.sid}`);

    // TODO: Actually execute the schedule action here
    // This would integrate with the schedule executor service

    res.json({
      message: 'Schedule triggered successfully',
      schedule: transformSchedule(updated)
    });

  } catch (error) {
    logger.error(`Failed to trigger schedule: ${error.message}`);
    res.status(500).json({ error: 'Failed to trigger schedule' });
  }
});

// ============================================
// Job History (Schedule Execution History)
// ============================================

const { getSchedulerService } = require('../services/agentic/SchedulerService.cjs');

/**
 * GET /api/agentic/profiles/:id/jobs
 * List job execution history for a profile
 *
 * Query params:
 * - scheduleId: Filter by schedule ID
 * - status: pending|running|success|failed|skipped|cancelled
 * - actionType: check_messages|send_report|review_tasks|update_knowledge|custom_prompt|self_reflect
 * - startDate: ISO date string
 * - endDate: ISO date string
 * - page: Page number (default 1)
 * - pageSize: Items per page (default 20)
 */
router.get('/profiles/:id/jobs', (req, res) => {
  try {
    const db = getDatabase();

    // Verify profile ownership
    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const schedulerService = getSchedulerService();
    const result = schedulerService.getJobHistory({
      agenticId: req.params.id,
      userId: req.user.id,
      scheduleId: req.query.scheduleId || null,
      status: req.query.status || null,
      actionType: req.query.actionType || null,
      startDate: req.query.startDate || null,
      endDate: req.query.endDate || null,
      page: parseInt(req.query.page, 10) || 1,
      pageSize: parseInt(req.query.pageSize, 10) || 20
    });

    res.json({
      jobs: result.jobs || result,
      totalPages: result.totalPages || 1,
      total: result.total || 0,
      page: result.page || 1,
      pageSize: result.pageSize || 20
    });

  } catch (error) {
    logger.error(`Failed to get job history: ${error.message}`);
    res.status(500).json({ error: 'Failed to get job history' });
  }
});

/**
 * GET /api/agentic/profiles/:id/jobs/stats
 * Get job execution statistics
 */
router.get('/profiles/:id/jobs/stats', (req, res) => {
  try {
    const db = getDatabase();

    // Verify profile ownership
    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const schedulerService = getSchedulerService();
    const stats = schedulerService.getJobStats(req.params.id, req.user.id);

    res.json({ stats });

  } catch (error) {
    logger.error(`Failed to get job stats: ${error.message}`);
    res.status(500).json({ error: 'Failed to get job statistics' });
  }
});

/**
 * GET /api/agentic/profiles/:id/jobs/:jobId
 * Get a single job execution details
 */
router.get('/profiles/:id/jobs/:jobId', (req, res) => {
  try {
    const db = getDatabase();

    // Verify profile ownership
    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Get job with schedule info
    const job = db.prepare(`
      SELECT jh.*, s.title as schedule_title
      FROM agentic_job_history jh
      LEFT JOIN agentic_schedules s ON jh.schedule_id = s.id
      WHERE jh.id = ? AND jh.agentic_id = ? AND jh.user_id = ?
    `).get(req.params.jobId, req.params.id, req.user.id);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Transform to API format
    const safeJsonParse = (str, defaultValue) => {
      if (!str) return defaultValue;
      try {
        return JSON.parse(str);
      } catch {
        return defaultValue;
      }
    };

    res.json({
      id: job.id,
      scheduleId: job.schedule_id,
      scheduleTitle: job.schedule_title,
      agenticId: job.agentic_id,
      userId: job.user_id,
      actionType: job.action_type,
      scheduledAt: job.scheduled_at,
      startedAt: job.started_at,
      completedAt: job.completed_at,
      durationMs: job.duration_ms,
      status: job.status,
      errorMessage: job.error_message,
      retryCount: job.retry_count,
      inputData: safeJsonParse(job.input_data, {}),
      outputData: safeJsonParse(job.output_data, {}),
      resultSummary: job.result_summary,
      tokensUsed: job.tokens_used,
      aiProvider: job.ai_provider,
      aiModel: job.ai_model,
      createdAt: job.created_at
    });

  } catch (error) {
    logger.error(`Failed to get job details: ${error.message}`);
    res.status(500).json({ error: 'Failed to get job details' });
  }
});

/**
 * POST /api/agentic/profiles/:id/schedules/:scheduleId/trigger
 * Trigger a schedule immediately using the SchedulerService
 */
router.post('/profiles/:id/schedules/:scheduleId/trigger', async (req, res) => {
  try {
    const db = getDatabase();

    // Verify profile ownership
    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const schedulerService = getSchedulerService();

    // Initialize if needed (lazy init with SuperBrain)
    try {
      const { getSuperBrainRouter } = require('../services/ai/SuperBrainRouter.cjs');
      schedulerService.initialize({ superBrain: getSuperBrainRouter() });
    } catch (e) {
      logger.warn(`SuperBrain not available for trigger: ${e.message}`);
    }

    await schedulerService.triggerSchedule(req.params.scheduleId, req.user.id);

    res.json({
      message: 'Schedule triggered successfully',
      scheduleId: req.params.scheduleId
    });

  } catch (error) {
    logger.error(`Failed to trigger schedule: ${error.message}`);
    res.status(500).json({ error: error.message || 'Failed to trigger schedule' });
  }
});

// ============================================
// Self-Prompting Engine
// ============================================

const { getSelfPromptingEngine } = require('../services/agentic/SelfPromptingEngine.cjs');

/**
 * GET /api/agentic/profiles/:id/self-prompts
 * List self-prompt history
 *
 * Query params:
 * - status: pending|approved|executed|rejected|expired
 * - page: Page number (default 1)
 * - pageSize: Items per page (default 20)
 */
router.get('/profiles/:id/self-prompts', (req, res) => {
  try {
    const db = getDatabase();

    // Verify profile ownership
    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const engine = getSelfPromptingEngine();
    const result = engine.getPromptHistory(req.params.id, req.user.id, {
      status: req.query.status || null,
      page: parseInt(req.query.page, 10) || 1,
      pageSize: parseInt(req.query.pageSize, 10) || 20
    });

    res.json(result);

  } catch (error) {
    logger.error(`Failed to get self-prompts: ${error.message}`);
    res.status(500).json({ error: 'Failed to get self-prompts' });
  }
});

/**
 * GET /api/agentic/profiles/:id/self-prompts/pending
 * Get pending self-prompts awaiting approval
 */
router.get('/profiles/:id/self-prompts/pending', (req, res) => {
  try {
    const db = getDatabase();

    // Verify profile ownership
    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const engine = getSelfPromptingEngine();
    const prompts = engine.getPendingPrompts(req.params.id, req.user.id);

    res.json({ prompts });

  } catch (error) {
    logger.error(`Failed to get pending self-prompts: ${error.message}`);
    res.status(500).json({ error: 'Failed to get pending self-prompts' });
  }
});

/**
 * POST /api/agentic/profiles/:id/self-prompts/:promptId/approve
 * Approve a pending self-prompt
 */
router.post('/profiles/:id/self-prompts/:promptId/approve', async (req, res) => {
  try {
    const db = getDatabase();

    // Verify profile ownership
    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const engine = getSelfPromptingEngine();
    const success = engine.approvePrompt(req.params.promptId, req.user.id);

    if (!success) {
      return res.status(404).json({ error: 'Self-prompt not found or already processed' });
    }

    // Optionally execute immediately
    if (req.body.execute) {
      try {
        await engine.executeSelfPrompt(req.params.promptId, req.params.id);
      } catch (execError) {
        logger.error(`Failed to execute approved prompt: ${execError.message}`);
        // Still return success for approval, but note execution failed
        return res.json({
          message: 'Self-prompt approved but execution failed',
          executionError: execError.message
        });
      }
    }

    res.json({ message: 'Self-prompt approved successfully' });

  } catch (error) {
    logger.error(`Failed to approve self-prompt: ${error.message}`);
    res.status(500).json({ error: 'Failed to approve self-prompt' });
  }
});

/**
 * POST /api/agentic/profiles/:id/self-prompts/:promptId/reject
 * Reject a pending self-prompt
 */
router.post('/profiles/:id/self-prompts/:promptId/reject', (req, res) => {
  try {
    const db = getDatabase();

    // Verify profile ownership
    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const engine = getSelfPromptingEngine();
    const success = engine.rejectPrompt(req.params.promptId, req.user.id);

    if (!success) {
      return res.status(404).json({ error: 'Self-prompt not found or already processed' });
    }

    res.json({ message: 'Self-prompt rejected' });

  } catch (error) {
    logger.error(`Failed to reject self-prompt: ${error.message}`);
    res.status(500).json({ error: 'Failed to reject self-prompt' });
  }
});

/**
 * POST /api/agentic/profiles/:id/self-prompts/:promptId/execute
 * Execute an approved self-prompt
 */
router.post('/profiles/:id/self-prompts/:promptId/execute', async (req, res) => {
  try {
    const db = getDatabase();

    // Verify profile ownership
    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const engine = getSelfPromptingEngine();

    // Initialize with SuperBrain if available
    try {
      const { getSuperBrainRouter } = require('../services/ai/SuperBrainRouter.cjs');
      engine.initialize({ superBrain: getSuperBrainRouter() });
    } catch (e) {
      logger.warn(`SuperBrain not available for execution: ${e.message}`);
    }

    const result = await engine.executeSelfPrompt(req.params.promptId, req.params.id);

    res.json({
      message: 'Self-prompt executed successfully',
      result
    });

  } catch (error) {
    logger.error(`Failed to execute self-prompt: ${error.message}`);
    res.status(500).json({ error: error.message || 'Failed to execute self-prompt' });
  }
});

/**
 * GET /api/agentic/profiles/:id/self-prompts/config
 * Get self-prompting configuration
 */
router.get('/profiles/:id/self-prompts/config', (req, res) => {
  try {
    const db = getDatabase();

    // Verify profile ownership
    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const engine = getSelfPromptingEngine();
    const config = engine.getConfig(req.params.id, req.user.id);

    res.json(config);

  } catch (error) {
    logger.error(`Failed to get self-prompt config: ${error.message}`);
    res.status(500).json({ error: 'Failed to get self-prompt configuration' });
  }
});

/**
 * PUT /api/agentic/profiles/:id/self-prompts/config
 * Update self-prompting configuration
 */
router.put('/profiles/:id/self-prompts/config', (req, res) => {
  try {
    const db = getDatabase();

    // Verify profile ownership
    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const engine = getSelfPromptingEngine();
    const config = engine.updateConfig(req.params.id, req.user.id, req.body);

    res.json(config);

  } catch (error) {
    logger.error(`Failed to update self-prompt config: ${error.message}`);
    res.status(500).json({ error: 'Failed to update self-prompt configuration' });
  }
});

// ============================================
// Self-Learning System
// ============================================

const { getSelfLearningService } = require('../services/agentic/SelfLearningService.cjs');

/**
 * GET /api/agentic/profiles/:id/self-learning/config
 * Get self-learning configuration
 */
router.get('/profiles/:id/self-learning/config', (req, res) => {
  try {
    const db = getDatabase();

    // Verify profile ownership
    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const service = getSelfLearningService();
    const config = service.getConfig(req.params.id, req.user.id);

    res.json(config);

  } catch (error) {
    logger.error(`Failed to get self-learning config: ${error.message}`);
    res.status(500).json({ error: 'Failed to get self-learning configuration' });
  }
});

/**
 * PUT /api/agentic/profiles/:id/self-learning/config
 * Update self-learning configuration
 */
router.put('/profiles/:id/self-learning/config', (req, res) => {
  try {
    const db = getDatabase();

    // Verify profile ownership
    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const service = getSelfLearningService();
    const config = service.updateConfig(req.params.id, req.user.id, req.body);

    res.json(config);

  } catch (error) {
    logger.error(`Failed to update self-learning config: ${error.message}`);
    res.status(500).json({ error: 'Failed to update self-learning configuration' });
  }
});

/**
 * GET /api/agentic/profiles/:id/self-learning/queue
 * Get learning queue items
 *
 * Query params:
 * - status: pending|processing|review|approved|ingested|rejected|duplicate|failed
 * - sourceType: conversations|tasks|emails|feedback|escalations|patterns
 * - page: Page number (default 1)
 * - pageSize: Items per page (default 20)
 */
router.get('/profiles/:id/self-learning/queue', (req, res) => {
  try {
    const db = getDatabase();

    // Verify profile ownership
    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const service = getSelfLearningService();
    const result = service.getLearningQueue(req.params.id, req.user.id, {
      status: req.query.status || null,
      sourceType: req.query.sourceType || null,
      page: parseInt(req.query.page, 10) || 1,
      pageSize: parseInt(req.query.pageSize, 10) || 20,
    });

    res.json(result);

  } catch (error) {
    logger.error(`Failed to get learning queue: ${error.message}`);
    res.status(500).json({ error: 'Failed to get learning queue' });
  }
});

/**
 * POST /api/agentic/profiles/:id/self-learning/queue
 * Queue content for learning
 */
router.post('/profiles/:id/self-learning/queue', (req, res) => {
  try {
    const db = getDatabase();

    // Verify profile ownership
    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const { sourceType, sourceId, content, summary, sourceContext, confidence } = req.body;

    if (!sourceType) {
      return res.status(400).json({ error: 'sourceType is required' });
    }

    if (!content) {
      return res.status(400).json({ error: 'content is required' });
    }

    const service = getSelfLearningService();
    const result = service.queueLearning({
      agenticId: req.params.id,
      userId: req.user.id,
      sourceType,
      sourceId,
      content,
      summary,
      sourceContext,
      confidence: confidence || 0.5,
    });

    res.status(201).json(result);

  } catch (error) {
    logger.error(`Failed to queue learning: ${error.message}`);
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /api/agentic/profiles/:id/self-learning/pending-review
 * Get items pending human review
 */
router.get('/profiles/:id/self-learning/pending-review', (req, res) => {
  try {
    const db = getDatabase();

    // Verify profile ownership
    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const service = getSelfLearningService();
    const items = service.getPendingReview(req.params.id, req.user.id);

    res.json({ items, count: items.length });

  } catch (error) {
    logger.error(`Failed to get pending review: ${error.message}`);
    res.status(500).json({ error: 'Failed to get pending review items' });
  }
});

/**
 * POST /api/agentic/profiles/:id/self-learning/queue/:itemId/approve
 * Approve a learning item
 */
router.post('/profiles/:id/self-learning/queue/:itemId/approve', (req, res) => {
  try {
    const service = getSelfLearningService();
    const success = service.approveLearning(req.params.itemId, req.user.id, req.body.notes);

    if (!success) {
      return res.status(404).json({ error: 'Learning item not found or already processed' });
    }

    res.json({ message: 'Learning item approved' });

  } catch (error) {
    logger.error(`Failed to approve learning: ${error.message}`);
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /api/agentic/profiles/:id/self-learning/queue/:itemId/reject
 * Reject a learning item
 */
router.post('/profiles/:id/self-learning/queue/:itemId/reject', (req, res) => {
  try {
    const service = getSelfLearningService();
    const success = service.rejectLearning(req.params.itemId, req.user.id, req.body.reason);

    if (!success) {
      return res.status(404).json({ error: 'Learning item not found or already processed' });
    }

    res.json({ message: 'Learning item rejected' });

  } catch (error) {
    logger.error(`Failed to reject learning: ${error.message}`);
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /api/agentic/profiles/:id/self-learning/stats
 * Get learning statistics
 *
 * Query params:
 * - days: Number of days to include (default 7)
 */
router.get('/profiles/:id/self-learning/stats', (req, res) => {
  try {
    const db = getDatabase();

    // Verify profile ownership
    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const service = getSelfLearningService();
    const stats = service.getStats(req.params.id, req.user.id, parseInt(req.query.days, 10) || 7);

    res.json(stats);

  } catch (error) {
    logger.error(`Failed to get learning stats: ${error.message}`);
    res.status(500).json({ error: 'Failed to get learning statistics' });
  }
});

// ============================================
// AI-to-AI Communication
// ============================================

const { getAIToCommunication } = require('../services/agentic/AIToCommunication.cjs');

/**
 * GET /api/agentic/profiles/:id/messages
 * Get AI-to-AI messages for a profile
 *
 * Query params:
 * - direction: inbox|sent|all (default: all)
 * - messageType: task_delegation|task_update|context_share|request|response|notification|handoff|coordination
 * - status: pending|delivered|read|acknowledged|responded|failed|expired
 * - threadId: Filter by thread
 * - page: Page number (default 1)
 * - pageSize: Items per page (default 20)
 */
router.get('/profiles/:id/messages', (req, res) => {
  try {
    const db = getDatabase();

    // Verify profile ownership
    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const comm = getAIToCommunication();
    const result = comm.getMessages(req.params.id, req.user.id, {
      direction: req.query.direction || 'all',
      messageType: req.query.messageType || null,
      status: req.query.status || null,
      threadId: req.query.threadId || null,
      page: parseInt(req.query.page, 10) || 1,
      pageSize: parseInt(req.query.pageSize, 10) || 20
    });

    res.json({
      messages: result.messages || result,
      pagination: result.pagination || { page: 1, pageSize: 20, total: 0 }
    });

  } catch (error) {
    logger.error(`Failed to get AI-to-AI messages: ${error.message}`);
    res.status(500).json({ error: 'Failed to get messages' });
  }
});

/**
 * POST /api/agentic/profiles/:id/messages
 * Send an AI-to-AI message
 */
router.post('/profiles/:id/messages', async (req, res) => {
  try {
    const db = getDatabase();

    // Verify profile ownership
    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const {
      receiverId,
      messageType,
      subject,
      content,
      metadata,
      priority,
      replyToId,
      threadId,
      taskId,
      deadlineAt,
    } = req.body;

    if (!receiverId) {
      return res.status(400).json({ error: 'receiverId is required' });
    }

    if (!messageType) {
      return res.status(400).json({ error: 'messageType is required' });
    }

    if (!content) {
      return res.status(400).json({ error: 'content is required' });
    }

    const comm = getAIToCommunication();
    const result = await comm.sendMessage({
      senderId: req.params.id,
      receiverId,
      userId: req.user.id,
      messageType,
      subject,
      content,
      metadata: metadata || {},
      priority: priority || 'normal',
      replyToId,
      threadId,
      taskId,
      deadlineAt,
    });

    res.status(201).json({ message: result });

  } catch (error) {
    logger.error(`Failed to send AI-to-AI message: ${error.message}`);
    res.status(500).json({ error: error.message || 'Failed to send message' });
  }
});

/**
 * GET /api/agentic/profiles/:id/messages/:messageId
 * Get a single AI-to-AI message
 */
router.get('/profiles/:id/messages/:messageId', (req, res) => {
  try {
    const comm = getAIToCommunication();
    const message = comm.getMessage(req.params.messageId, req.user.id);

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Verify the profile is sender or receiver
    if (message.senderId !== req.params.id && message.receiverId !== req.params.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({ message });

  } catch (error) {
    logger.error(`Failed to get AI-to-AI message: ${error.message}`);
    res.status(500).json({ error: 'Failed to get message' });
  }
});

/**
 * POST /api/agentic/profiles/:id/messages/:messageId/read
 * Mark message as read
 */
router.post('/profiles/:id/messages/:messageId/read', (req, res) => {
  try {
    const comm = getAIToCommunication();
    const success = comm.markAsRead(req.params.messageId, req.params.id, req.user.id);

    if (!success) {
      return res.status(404).json({ error: 'Message not found or already read' });
    }

    res.json({ message: 'Message marked as read' });

  } catch (error) {
    logger.error(`Failed to mark message as read: ${error.message}`);
    res.status(500).json({ error: 'Failed to mark message as read' });
  }
});

/**
 * POST /api/agentic/profiles/:id/messages/:messageId/acknowledge
 * Acknowledge a message
 */
router.post('/profiles/:id/messages/:messageId/acknowledge', (req, res) => {
  try {
    const comm = getAIToCommunication();
    const success = comm.acknowledgeMessage(req.params.messageId, req.params.id, req.user.id);

    if (!success) {
      return res.status(404).json({ error: 'Message not found or already acknowledged' });
    }

    res.json({ message: 'Message acknowledged' });

  } catch (error) {
    logger.error(`Failed to acknowledge message: ${error.message}`);
    res.status(500).json({ error: 'Failed to acknowledge message' });
  }
});

/**
 * POST /api/agentic/profiles/:id/messages/:messageId/respond
 * Respond to a message
 */
router.post('/profiles/:id/messages/:messageId/respond', async (req, res) => {
  try {
    const { content, metadata } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'content is required' });
    }

    const comm = getAIToCommunication();
    const result = await comm.sendResponse({
      senderId: req.params.id,
      originalMessageId: req.params.messageId,
      userId: req.user.id,
      responseContent: content,
      metadata: metadata || {},
    });

    res.status(201).json({ response: result });

  } catch (error) {
    logger.error(`Failed to respond to message: ${error.message}`);
    res.status(500).json({ error: error.message || 'Failed to respond' });
  }
});

/**
 * POST /api/agentic/profiles/:id/delegate-task
 * Delegate a task to a child agent
 */
router.post('/profiles/:id/delegate-task', async (req, res) => {
  try {
    const db = getDatabase();

    // Verify profile ownership
    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const {
      childId,
      taskTitle,
      taskDescription,
      taskPriority,
      deadline,
      context,
    } = req.body;

    if (!childId) {
      return res.status(400).json({ error: 'childId is required' });
    }

    if (!taskTitle) {
      return res.status(400).json({ error: 'taskTitle is required' });
    }

    const comm = getAIToCommunication();
    const result = await comm.delegateTask({
      parentId: req.params.id,
      childId,
      userId: req.user.id,
      taskTitle,
      taskDescription,
      taskPriority: taskPriority || 'normal',
      deadline,
      context: context || {},
    });

    res.status(201).json({ delegation: result });

  } catch (error) {
    logger.error(`Failed to delegate task: ${error.message}`);
    res.status(500).json({ error: error.message || 'Failed to delegate task' });
  }
});

/**
 * POST /api/agentic/profiles/:id/task-update
 * Send a task progress update
 */
router.post('/profiles/:id/task-update', async (req, res) => {
  try {
    const { taskId, progress, status, notes, targetId } = req.body;

    if (!taskId) {
      return res.status(400).json({ error: 'taskId is required' });
    }

    const comm = getAIToCommunication();
    const result = await comm.sendTaskUpdate({
      agenticId: req.params.id,
      taskId,
      userId: req.user.id,
      progress,
      status,
      notes,
      targetId,
    });

    res.json({ update: result });

  } catch (error) {
    logger.error(`Failed to send task update: ${error.message}`);
    res.status(500).json({ error: error.message || 'Failed to send task update' });
  }
});

/**
 * POST /api/agentic/profiles/:id/share-context
 * Share context with another agent
 */
router.post('/profiles/:id/share-context', async (req, res) => {
  try {
    const { receiverId, contextType, contextData, reason } = req.body;

    if (!receiverId) {
      return res.status(400).json({ error: 'receiverId is required' });
    }

    if (!contextType) {
      return res.status(400).json({ error: 'contextType is required' });
    }

    const comm = getAIToCommunication();
    const result = await comm.shareContext({
      senderId: req.params.id,
      receiverId,
      userId: req.user.id,
      contextType,
      contextData: contextData || {},
      reason,
    });

    res.json({ context: result });

  } catch (error) {
    logger.error(`Failed to share context: ${error.message}`);
    res.status(500).json({ error: error.message || 'Failed to share context' });
  }
});

/**
 * POST /api/agentic/profiles/:id/handoff
 * Initiate handoff to another agent
 */
router.post('/profiles/:id/handoff', async (req, res) => {
  try {
    const {
      targetId,
      conversationId,
      taskId,
      reason,
      summary,
      contextMessages,
    } = req.body;

    if (!targetId) {
      return res.status(400).json({ error: 'targetId is required' });
    }

    const comm = getAIToCommunication();
    const result = await comm.initiateHandoff({
      sourceId: req.params.id,
      targetId,
      userId: req.user.id,
      conversationId,
      taskId,
      reason,
      summary,
      contextMessages: contextMessages || [],
    });

    res.json({ handoff: result });

  } catch (error) {
    logger.error(`Failed to initiate handoff: ${error.message}`);
    res.status(500).json({ error: error.message || 'Failed to initiate handoff' });
  }
});

/**
 * GET /api/agentic/profiles/:id/threads
 * Get conversation threads for a profile
 */
router.get('/profiles/:id/threads', (req, res) => {
  try {
    const db = getDatabase();

    // Verify profile ownership
    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const comm = getAIToCommunication();
    const result = comm.getThreads(req.params.id, req.user.id, {
      page: parseInt(req.query.page, 10) || 1,
      pageSize: parseInt(req.query.pageSize, 10) || 20,
      activeOnly: req.query.activeOnly !== 'false',
    });

    res.json({
      threads: result.threads || result,
      pagination: result.pagination || { page: 1, pageSize: 20, total: 0 }
    });

  } catch (error) {
    logger.error(`Failed to get threads: ${error.message}`);
    res.status(500).json({ error: 'Failed to get threads' });
  }
});

// ============================================
// Tasks (Production-Ready Implementation)
// ============================================

/**
 * GET /api/agentic/profiles/:id/tasks
 * List tasks for a profile with filtering and pagination
 *
 * Query params:
 * - status: pending|assigned|in_progress|review|completed|cancelled|blocked
 * - priority: low|normal|high|urgent
 * - assigned_to: team member ID
 * - created_by: user|ai|schedule|parent_agent (legacy support)
 * - limit: number (default 50)
 * - offset: number (default 0)
 */
router.get('/profiles/:id/tasks', (req, res) => {
  try {
    const db = getDatabase();

    // Verify profile ownership
    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const {
      status,
      priority,
      assigned_to,
      created_by,
      limit = 50,
      offset = 0
    } = req.query;

    // Build WHERE clause
    let whereClause = 'WHERE t.agentic_id = ? AND t.user_id = ?';
    const params = [req.params.id, req.user.id];

    if (status) {
      whereClause += ' AND t.status = ?';
      params.push(status);
    }

    if (priority) {
      whereClause += ' AND t.priority = ?';
      params.push(priority);
    }

    if (assigned_to) {
      whereClause += ' AND t.assigned_to = ?';
      params.push(assigned_to);
    }

    if (created_by) {
      // Legacy: source_type maps to created_by in PRD
      whereClause += ' AND t.source_type = ?';
      params.push(created_by);
    }

    // Count query for pagination
    const countSql = `SELECT COUNT(*) as count FROM agentic_tasks t ${whereClause}`;
    const totalCount = db.prepare(countSql).get(...params).count;

    // Main query with join to get assignee info
    const sql = `
      SELECT t.*,
        tm.role as assignee_role,
        c.display_name as assignee_name
      FROM agentic_tasks t
      LEFT JOIN agentic_team_members tm ON t.assigned_to = tm.id
      LEFT JOIN contacts c ON tm.contact_id = c.id
      ${whereClause}
      ORDER BY
        CASE t.priority
          WHEN 'urgent' THEN 1
          WHEN 'high' THEN 2
          WHEN 'normal' THEN 3
          WHEN 'low' THEN 4
          ELSE 5
        END,
        t.due_at ASC NULLS LAST,
        t.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const tasks = db.prepare(sql).all(...params, parseInt(limit, 10), parseInt(offset, 10));

    res.json({
      tasks: tasks.map(transformTask),
      pagination: {
        total: totalCount,
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10),
        hasMore: parseInt(offset, 10) + tasks.length < totalCount
      }
    });

  } catch (error) {
    logger.error(`Failed to list tasks: ${error.message}`);
    res.status(500).json({ error: 'Failed to list tasks' });
  }
});

/**
 * GET /api/agentic/profiles/:id/tasks/:tid
 * Get a single task by ID
 */
router.get('/profiles/:id/tasks/:tid', (req, res) => {
  try {
    const db = getDatabase();

    // Verify profile ownership
    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Get task with assignee info
    const task = db.prepare(`
      SELECT t.*,
        tm.role as assignee_role,
        c.display_name as assignee_name
      FROM agentic_tasks t
      LEFT JOIN agentic_team_members tm ON t.assigned_to = tm.id
      LEFT JOIN contacts c ON tm.contact_id = c.id
      WHERE t.id = ? AND t.agentic_id = ?
    `).get(req.params.tid, req.params.id);

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    res.json({ task: transformTask(task) });

  } catch (error) {
    logger.error(`Failed to get task: ${error.message}`);
    res.status(500).json({ error: 'Failed to get task' });
  }
});

/**
 * POST /api/agentic/profiles/:id/tasks
 * Create a task for a profile
 *
 * Required body: { title: string }
 * Optional body: { description, priority, assignedTo, dueAt, parentTaskId, tags, estimatedHours, taskType, sourceType, sourceId, sourceContent }
 */
router.post('/profiles/:id/tasks', (req, res) => {
  try {
    const db = getDatabase();

    // Verify profile ownership
    const profile = db.prepare('SELECT id, name FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const {
      title,
      description,
      taskType,
      priority,
      assignedTo,
      dueAt,
      parentTaskId,
      tags,
      estimatedHours,
      sourceType,
      sourceId,
      sourceContent
    } = req.body;

    // Validate required fields
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return res.status(400).json({ error: 'Task title is required' });
    }

    // Validate priority if provided
    const validPriorities = ['low', 'normal', 'high', 'urgent'];
    if (priority && !validPriorities.includes(priority)) {
      return res.status(400).json({
        error: `Invalid priority. Must be one of: ${validPriorities.join(', ')}`
      });
    }

    // Validate assignedTo if provided - must be a valid team member
    if (assignedTo) {
      const teamMember = db.prepare(
        'SELECT id FROM agentic_team_members WHERE id = ? AND agentic_id = ? AND is_active = 1'
      ).get(assignedTo, req.params.id);

      if (!teamMember) {
        return res.status(400).json({ error: 'Invalid team member ID for assignment' });
      }
    }

    // Validate parentTaskId if provided
    if (parentTaskId) {
      const parentTask = db.prepare(
        'SELECT id FROM agentic_tasks WHERE id = ? AND agentic_id = ?'
      ).get(parentTaskId, req.params.id);

      if (!parentTask) {
        return res.status(400).json({ error: 'Parent task not found' });
      }
    }

    // Generate task ID
    const taskId = uuidv4();

    // Insert task
    db.prepare(`
      INSERT INTO agentic_tasks (
        id, agentic_id, user_id, parent_task_id,
        title, description, task_type,
        status, priority, assigned_to, assigned_at,
        due_at, ai_estimated_hours, tags, progress_percent,
        source_type, source_id, source_content,
        updates, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, '[]', datetime('now'), datetime('now'))
    `).run(
      taskId,
      req.params.id,
      req.user.id,
      parentTaskId || null,
      title.trim(),
      description || null,
      taskType || null,
      priority || 'normal',
      assignedTo || null,
      assignedTo ? new Date().toISOString() : null,
      dueAt || null,
      estimatedHours || null,
      JSON.stringify(tags || []),
      sourceType || 'user', // Default to 'user' for manual creation
      sourceId || null,
      sourceContent || null
    );

    // Log activity
    const activityId = uuidv4();
    db.prepare(`
      INSERT INTO agentic_activity_log (
        id, agentic_id, user_id, activity_type, activity_description,
        trigger_type, trigger_id, status, metadata, created_at
      )
      VALUES (?, ?, ?, 'task_created', ?, 'user', ?, 'success', ?, datetime('now'))
    `).run(
      activityId,
      req.params.id,
      req.user.id,
      `Task created: ${title.trim()}`,
      taskId,
      JSON.stringify({
        taskId,
        title: title.trim(),
        priority: priority || 'normal',
        assignedTo: assignedTo || null
      })
    );

    // Fetch the created task with assignee info
    const task = db.prepare(`
      SELECT t.*,
        tm.role as assignee_role,
        c.display_name as assignee_name
      FROM agentic_tasks t
      LEFT JOIN agentic_team_members tm ON t.assigned_to = tm.id
      LEFT JOIN contacts c ON tm.contact_id = c.id
      WHERE t.id = ?
    `).get(taskId);

    logger.info(`Task created for profile ${req.params.id}: ${title.trim()}`);

    // Broadcast task creation event
    if (global.wsBroadcast) {
      global.wsBroadcast('agentic:task_created', {
        profileId: req.params.id,
        taskId,
        userId: req.user.id,
        task: transformTask(task),
      });
    }

    res.status(201).json({ task: transformTask(task) });

  } catch (error) {
    logger.error(`Failed to create task: ${error.message}`);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

/**
 * PUT /api/agentic/profiles/:id/tasks/:tid
 * Update a task
 *
 * Allowed fields: title, description, status, priority, assignedTo, dueAt,
 *                 progressPercent, actualHours, aiAnalysis, completionNotes, tags, taskType
 */
router.put('/profiles/:id/tasks/:tid', (req, res) => {
  try {
    const db = getDatabase();

    // Verify profile ownership
    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Verify task exists and belongs to profile
    const existingTask = db.prepare(
      'SELECT * FROM agentic_tasks WHERE id = ? AND agentic_id = ?'
    ).get(req.params.tid, req.params.id);

    if (!existingTask) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const {
      title,
      description,
      taskType,
      status,
      priority,
      assignedTo,
      dueAt,
      progressPercent,
      actualHours,
      aiAnalysis,
      completionNotes,
      tags
    } = req.body;

    // Build dynamic update
    const updates = [];
    const params = [];

    // Validate and add fields
    if (title !== undefined) {
      if (typeof title !== 'string' || title.trim().length === 0) {
        return res.status(400).json({ error: 'Title cannot be empty' });
      }
      updates.push('title = ?');
      params.push(title.trim());
    }

    if (description !== undefined) {
      updates.push('description = ?');
      params.push(description);
    }

    if (taskType !== undefined) {
      updates.push('task_type = ?');
      params.push(taskType);
    }

    // Validate status
    if (status !== undefined) {
      const validStatuses = ['pending', 'assigned', 'in_progress', 'review', 'completed', 'cancelled', 'blocked'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
        });
      }
      updates.push('status = ?');
      params.push(status);

      // Set started_at when moving to in_progress
      if (status === 'in_progress' && !existingTask.started_at) {
        updates.push('started_at = datetime("now")');
      }

      // Set completed_at when status changes to completed
      if (status === 'completed' && existingTask.status !== 'completed') {
        updates.push('completed_at = datetime("now")');
        updates.push('progress_percent = 100');
      }

      // Clear completed_at if moving away from completed
      if (status !== 'completed' && existingTask.status === 'completed') {
        updates.push('completed_at = NULL');
      }
    }

    // Validate priority
    if (priority !== undefined) {
      const validPriorities = ['low', 'normal', 'high', 'urgent'];
      if (!validPriorities.includes(priority)) {
        return res.status(400).json({
          error: `Invalid priority. Must be one of: ${validPriorities.join(', ')}`
        });
      }
      updates.push('priority = ?');
      params.push(priority);
    }

    // Validate and handle assignedTo
    if (assignedTo !== undefined) {
      if (assignedTo === null || assignedTo === '') {
        // Unassign
        updates.push('assigned_to = NULL');
        updates.push('assigned_at = NULL');
      } else {
        // Validate team member
        const teamMember = db.prepare(
          'SELECT id FROM agentic_team_members WHERE id = ? AND agentic_id = ? AND is_active = 1'
        ).get(assignedTo, req.params.id);

        if (!teamMember) {
          return res.status(400).json({ error: 'Invalid team member ID for assignment' });
        }

        updates.push('assigned_to = ?');
        params.push(assignedTo);

        // Set assigned_at if this is a new assignment
        if (existingTask.assigned_to !== assignedTo) {
          updates.push('assigned_at = datetime("now")');
        }
      }
    }

    if (dueAt !== undefined) {
      updates.push('due_at = ?');
      params.push(dueAt);
    }

    if (progressPercent !== undefined) {
      const percent = parseInt(progressPercent, 10);
      if (isNaN(percent) || percent < 0 || percent > 100) {
        return res.status(400).json({ error: 'Progress percent must be between 0 and 100' });
      }
      updates.push('progress_percent = ?');
      params.push(percent);
    }

    if (actualHours !== undefined) {
      updates.push('actual_hours = ?');
      params.push(actualHours);
    }

    if (aiAnalysis !== undefined) {
      updates.push('ai_summary = ?'); // Map to ai_summary in DB
      params.push(aiAnalysis);
    }

    if (completionNotes !== undefined) {
      // Store in updates array as a new entry
      try {
        const existingUpdates = existingTask.updates ? JSON.parse(existingTask.updates) : [];
        existingUpdates.push({
          type: 'completion_note',
          content: completionNotes,
          timestamp: new Date().toISOString(),
          by: 'user'
        });
        updates.push('updates = ?');
        params.push(JSON.stringify(existingUpdates));
      } catch {
        updates.push('updates = ?');
        params.push(JSON.stringify([{
          type: 'completion_note',
          content: completionNotes,
          timestamp: new Date().toISOString(),
          by: 'user'
        }]));
      }
    }

    if (tags !== undefined) {
      updates.push('tags = ?');
      params.push(JSON.stringify(tags));
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    // Add updated_at timestamp
    updates.push("updated_at = datetime('now')");
    params.push(req.params.tid);

    // Execute update
    db.prepare(`UPDATE agentic_tasks SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    // Log status changes to activity log
    if (status !== undefined && status !== existingTask.status) {
      const activityId = uuidv4();
      db.prepare(`
        INSERT INTO agentic_activity_log (
          id, agentic_id, user_id, activity_type, activity_description,
          trigger_type, trigger_id, status, metadata, created_at
        )
        VALUES (?, ?, ?, 'task_status_changed', ?, 'user', ?, 'success', ?, datetime('now'))
      `).run(
        activityId,
        req.params.id,
        req.user.id,
        `Task status changed: ${existingTask.status} -> ${status}`,
        req.params.tid,
        JSON.stringify({
          taskId: req.params.tid,
          taskTitle: existingTask.title,
          previousStatus: existingTask.status,
          newStatus: status
        })
      );
    }

    // Log assignment changes
    if (assignedTo !== undefined && assignedTo !== existingTask.assigned_to) {
      const activityId = uuidv4();
      db.prepare(`
        INSERT INTO agentic_activity_log (
          id, agentic_id, user_id, activity_type, activity_description,
          trigger_type, trigger_id, status, metadata, created_at
        )
        VALUES (?, ?, ?, 'task_assigned', ?, 'user', ?, 'success', ?, datetime('now'))
      `).run(
        activityId,
        req.params.id,
        req.user.id,
        assignedTo ? `Task assigned to team member` : `Task unassigned`,
        req.params.tid,
        JSON.stringify({
          taskId: req.params.tid,
          taskTitle: existingTask.title,
          previousAssignee: existingTask.assigned_to,
          newAssignee: assignedTo || null
        })
      );
    }

    // Fetch updated task with assignee info
    const task = db.prepare(`
      SELECT t.*,
        tm.role as assignee_role,
        c.display_name as assignee_name
      FROM agentic_tasks t
      LEFT JOIN agentic_team_members tm ON t.assigned_to = tm.id
      LEFT JOIN contacts c ON tm.contact_id = c.id
      WHERE t.id = ?
    `).get(req.params.tid);

    logger.info(`Task updated for profile ${req.params.id}: ${existingTask.title}`);

    // Broadcast task update event
    if (global.wsBroadcast) {
      global.wsBroadcast('agentic:task_updated', {
        profileId: req.params.id,
        taskId: req.params.tid,
        userId: req.user.id,
        task: transformTask(task),
      });
    }

    res.json({ task: transformTask(task) });

  } catch (error) {
    logger.error(`Failed to update task: ${error.message}`);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

/**
 * DELETE /api/agentic/profiles/:id/tasks/:tid
 * Delete a task (soft delete by changing status to cancelled)
 */
router.delete('/profiles/:id/tasks/:tid', (req, res) => {
  try {
    const db = getDatabase();

    // Verify profile ownership
    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Verify task exists
    const existingTask = db.prepare(
      'SELECT id, title, status FROM agentic_tasks WHERE id = ? AND agentic_id = ?'
    ).get(req.params.tid, req.params.id);

    if (!existingTask) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Soft delete by setting status to cancelled
    db.prepare(`
      UPDATE agentic_tasks
      SET status = 'cancelled', updated_at = datetime('now')
      WHERE id = ?
    `).run(req.params.tid);

    // Log activity
    const activityId = uuidv4();
    db.prepare(`
      INSERT INTO agentic_activity_log (
        id, agentic_id, user_id, activity_type, activity_description,
        trigger_type, trigger_id, status, metadata, created_at
      )
      VALUES (?, ?, ?, 'task_cancelled', ?, 'user', ?, 'success', ?, datetime('now'))
    `).run(
      activityId,
      req.params.id,
      req.user.id,
      `Task cancelled: ${existingTask.title}`,
      req.params.tid,
      JSON.stringify({
        taskId: req.params.tid,
        taskTitle: existingTask.title,
        previousStatus: existingTask.status
      })
    );

    logger.info(`Task cancelled for profile ${req.params.id}: ${existingTask.title}`);

    // Broadcast task cancelled event
    if (global.wsBroadcast) {
      global.wsBroadcast('agentic:task_cancelled', {
        profileId: req.params.id,
        taskId: req.params.tid,
        userId: req.user.id,
        taskTitle: existingTask.title,
      });
    }

    res.json({ message: 'Task cancelled successfully' });

  } catch (error) {
    logger.error(`Failed to delete task: ${error.message}`);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

/**
 * POST /api/agentic/profiles/:id/tasks/:tid/auto-assign
 * Auto-assign a task to the best available team member
 */
router.post('/profiles/:id/tasks/:tid/auto-assign', async (req, res) => {
  try {
    const db = getDatabase();

    // Verify ownership
    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const { taskAssignmentService } = require('../services/agentic/TaskAssignmentService.cjs');

    const result = await taskAssignmentService.autoAssignTask(
      req.params.id,
      req.user.id,
      req.params.tid
    );

    if (result.success) {
      // Get updated task
      const task = db.prepare(`
        SELECT t.*, tm.role as assignee_role, c.display_name as assignee_name
        FROM agentic_tasks t
        LEFT JOIN agentic_team_members tm ON t.assigned_to = tm.id
        LEFT JOIN contacts c ON tm.contact_id = c.id
        WHERE t.id = ?
      `).get(req.params.tid);

      logger.info(`Task ${req.params.tid} auto-assigned to ${result.assignee.contactName}`);

      res.json({
        success: true,
        message: result.message,
        assignee: result.assignee,
        task: transformTask(task),
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
      });
    }

  } catch (error) {
    logger.error(`Failed to auto-assign task: ${error.message}`);
    res.status(500).json({ error: 'Failed to auto-assign task' });
  }
});

/**
 * POST /api/agentic/profiles/:id/tasks/suggest-assignee
 * Find the best team member for a task (without assigning)
 */
router.post('/profiles/:id/tasks/suggest-assignee', async (req, res) => {
  try {
    const db = getDatabase();

    // Verify ownership
    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const { requiredSkills, taskType, priority, excludeMemberIds } = req.body;

    const { taskAssignmentService } = require('../services/agentic/TaskAssignmentService.cjs');

    const suggestion = await taskAssignmentService.findBestAssignee(
      req.params.id,
      req.user.id,
      {
        requiredSkills: requiredSkills || [],
        taskType: taskType || null,
        priority: priority || 'normal',
        excludeMemberIds: excludeMemberIds || [],
      }
    );

    if (suggestion) {
      res.json({
        success: true,
        suggestion,
      });
    } else {
      res.json({
        success: false,
        message: 'No suitable team member found',
      });
    }

  } catch (error) {
    logger.error(`Failed to suggest assignee: ${error.message}`);
    res.status(500).json({ error: 'Failed to suggest assignee' });
  }
});

/**
 * POST /api/agentic/profiles/:id/tasks/redistribute
 * Get suggestions for redistributing tasks from an overloaded member
 */
router.post('/profiles/:id/tasks/redistribute', async (req, res) => {
  try {
    const db = getDatabase();

    // Verify ownership
    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const { memberId } = req.body;

    if (!memberId) {
      return res.status(400).json({ error: 'memberId is required' });
    }

    const { taskAssignmentService } = require('../services/agentic/TaskAssignmentService.cjs');

    const result = await taskAssignmentService.suggestRedistribution(
      req.params.id,
      req.user.id,
      memberId
    );

    res.json(result);

  } catch (error) {
    logger.error(`Failed to suggest redistribution: ${error.message}`);
    res.status(500).json({ error: 'Failed to suggest redistribution' });
  }
});

// ============================================
// Approvals
// ============================================

/**
 * GET /api/agentic/profiles/:id/approvals
 * List pending approvals for a profile
 */
router.get('/profiles/:id/approvals', (req, res) => {
  try {
    const db = getDatabase();

    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const approvalService = getApprovalService();
    const { status, actionType, startDate, priority, limit, offset } = req.query;

    const result = approvalService.listPendingApprovals(req.params.id, req.user.id, {
      status: status || 'pending',
      actionType,
      startDate,
      priority,
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0
    });

    res.json({
      approvals: result.approvals,
      pagination: {
        total: result.total,
        hasMore: result.hasMore,
        limit: limit ? parseInt(limit, 10) : 50,
        offset: offset ? parseInt(offset, 10) : 0
      }
    });

  } catch (error) {
    logger.error(`Failed to list approvals: ${error.message}`);
    res.status(500).json({ error: 'Failed to list approvals' });
  }
});

/**
 * POST /api/agentic/profiles/:id/approvals
 * Create a new approval request (for internal use by AI agents)
 */
router.post('/profiles/:id/approvals', (req, res) => {
  try {
    const db = getDatabase();

    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const { actionType, actionTitle, actionDescription, payload, triggeredBy, triggerContext, priority, expiresAt } = req.body;

    if (!actionType) {
      return res.status(400).json({ error: 'actionType is required' });
    }

    const approvalService = getApprovalService();
    const approval = approvalService.createApproval(req.params.id, req.user.id, {
      actionType,
      actionTitle,
      actionDescription,
      payload,
      triggeredBy,
      triggerContext,
      priority,
      expiresAt
    });

    res.status(201).json({ approval });

  } catch (error) {
    logger.error(`Failed to create approval: ${error.message}`);
    res.status(500).json({ error: error.message || 'Failed to create approval' });
  }
});

/**
 * POST /api/agentic/profiles/:id/approvals/:approvalId/approve
 * Approve an action
 */
router.post('/profiles/:id/approvals/:approvalId/approve', (req, res) => {
  try {
    const db = getDatabase();

    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const { notes, modifiedPayload } = req.body;

    const approvalService = getApprovalService();
    const approval = approvalService.approveAction(
      req.params.approvalId,
      req.user.id,
      notes,
      modifiedPayload
    );

    // Broadcast approval event
    if (global.wsBroadcast) {
      global.wsBroadcast('agentic:approval_approved', {
        profileId: req.params.id,
        approvalId: req.params.approvalId,
        userId: req.user.id,
        approval,
      });
    }

    // Resume agent reasoning for tool_execution approvals (fire-and-forget)
    try {
      if (approval.action_type === 'tool_execution') {
        const payload = modifiedPayload
          ? (typeof modifiedPayload === 'string' ? JSON.parse(modifiedPayload) : modifiedPayload)
          : (typeof approval.payload === 'string' ? JSON.parse(approval.payload) : approval.payload);

        const { getAgentReasoningLoop } = require('../services/agentic/AgentReasoningLoop.cjs');
        getAgentReasoningLoop().enqueue(req.params.id, 'approval_resume', {
          approvalId: req.params.approvalId,
          approvedTool: payload.tool || payload.toolId,
          approvedParams: payload.params || payload.parameters || {},
          modifiedPayload: modifiedPayload || null,
          approverNotes: notes || null,
          userId: req.user.id,
        });
        logger.info(`[Approvals] Queued approval_resume for agent ${req.params.id}, tool: ${payload.tool || payload.toolId}`);
      }
    } catch (resumeErr) {
      // Non-critical: approval is already saved, agent resume is best-effort
      logger.warn(`[Approvals] Failed to queue approval_resume: ${resumeErr.message}`);
    }

    res.json({ approval });

  } catch (error) {
    logger.error(`Failed to approve action: ${error.message}`);
    res.status(500).json({ error: error.message || 'Failed to approve action' });
  }
});

/**
 * POST /api/agentic/profiles/:id/approvals/:approvalId/reject
 * Reject an action
 */
router.post('/profiles/:id/approvals/:approvalId/reject', (req, res) => {
  try {
    const db = getDatabase();

    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const { reason } = req.body;

    const approvalService = getApprovalService();
    const approval = approvalService.rejectAction(
      req.params.approvalId,
      req.user.id,
      reason
    );

    // Broadcast rejection event
    if (global.wsBroadcast) {
      global.wsBroadcast('agentic:approval_rejected', {
        profileId: req.params.id,
        approvalId: req.params.approvalId,
        userId: req.user.id,
        approval,
      });
    }

    res.json({ approval });

  } catch (error) {
    logger.error(`Failed to reject action: ${error.message}`);
    res.status(500).json({ error: error.message || 'Failed to reject action' });
  }
});

/**
 * POST /api/agentic/profiles/:id/contact-scope/check
 * Check if a contact is within the allowed scope
 */
router.post('/profiles/:id/contact-scope/check', (req, res) => {
  try {
    const db = getDatabase();

    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const { contactId } = req.body;

    if (!contactId) {
      return res.status(400).json({ error: 'contactId is required' });
    }

    const approvalService = getApprovalService();
    const result = approvalService.checkContactScope(req.params.id, contactId, req.user.id);

    res.json({ scopeCheck: result });

  } catch (error) {
    logger.error(`Failed to check contact scope: ${error.message}`);
    res.status(500).json({ error: 'Failed to check contact scope' });
  }
});

// ============================================
// Memory System
// ============================================

/**
 * GET /api/agentic/profiles/:id/memory
 * List memories for a profile
 * Query params: type, types, minImportance, contactId, startDate, endDate, tags, limit, offset, orderBy, orderDir
 */
router.get('/profiles/:id/memory', (req, res) => {
  try {
    const db = getDatabase();

    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const memoryService = getAgenticMemoryService();
    const filters = {
      type: req.query.type,
      types: req.query.types ? req.query.types.split(',') : null,
      minImportance: req.query.minImportance ? parseFloat(req.query.minImportance) : null,
      contactId: req.query.contactId,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      tags: req.query.tags ? req.query.tags.split(',') : null,
      limit: req.query.limit || 50,
      offset: req.query.offset || 0,
      orderBy: req.query.orderBy || 'created_at',
      orderDir: req.query.orderDir || 'DESC'
    };

    const result = memoryService.listMemories(req.params.id, req.user.id, filters);

    res.json({
      memories: result.memories || result,
      pagination: result.pagination || { limit: 50, offset: 0, total: 0 }
    });

  } catch (error) {
    logger.error(`Failed to list memories: ${error.message}`, { stack: error.stack, profileId: req.params.id });
    res.status(500).json({ error: 'Failed to list memories', details: error.message });
  }
});

/**
 * GET /api/agentic/profiles/:id/memory/stats
 * Get memory statistics for a profile
 */
router.get('/profiles/:id/memory/stats', (req, res) => {
  try {
    const db = getDatabase();

    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const memoryService = getAgenticMemoryService();
    const stats = memoryService.getMemoryStats(req.params.id, req.user.id);

    res.json({ stats, memoryTypes: MEMORY_TYPES });

  } catch (error) {
    logger.error(`Failed to get memory stats: ${error.message}`);
    res.status(500).json({ error: 'Failed to get memory stats' });
  }
});

// ============================================
// Memory Sessions (MUST be defined before :mid routes)
// ============================================

/**
 * GET /api/agentic/profiles/:id/memory/sessions
 * List active memory sessions
 */
router.get('/profiles/:id/memory/sessions', (req, res) => {
  try {
    const db = getDatabase();

    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const memoryService = getAgenticMemoryService();
    const sessions = memoryService.listSessions(req.params.id, req.user.id);

    res.json({ sessions });

  } catch (error) {
    logger.error(`Failed to list sessions: ${error.message}`, { stack: error.stack });
    res.status(500).json({ error: 'Failed to list sessions' });
  }
});

/**
 * POST /api/agentic/profiles/:id/memory/sessions
 * Create a new memory session
 * Body: { type, contactId, metadata, ttl }
 */
router.post('/profiles/:id/memory/sessions', (req, res) => {
  try {
    const db = getDatabase();

    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const { type, contactId, metadata, ttl } = req.body;

    if (!type) {
      return res.status(400).json({ error: 'Session type is required' });
    }

    const memoryService = getAgenticMemoryService();
    const session = memoryService.createSession(req.params.id, req.user.id, type, {
      contactId,
      metadata,
      ttl
    });

    res.status(201).json({ session });

  } catch (error) {
    logger.error(`Failed to create session: ${error.message}`, { stack: error.stack });
    if (error.message.includes('Invalid session type')) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to create session' });
  }
});

/**
 * GET /api/agentic/profiles/:id/memory/sessions/:sid
 * Get session details with memories
 */
router.get('/profiles/:id/memory/sessions/:sid', (req, res) => {
  try {
    const db = getDatabase();

    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const memoryService = getAgenticMemoryService();
    const session = memoryService.getSession(req.params.sid, req.user.id);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Verify session belongs to this profile
    if (session.agenticId !== req.params.id) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json({ session });

  } catch (error) {
    logger.error(`Failed to get session: ${error.message}`, { stack: error.stack });
    res.status(500).json({ error: 'Failed to get session' });
  }
});

/**
 * POST /api/agentic/profiles/:id/memory/sessions/:sid/end
 * End a memory session
 */
router.post('/profiles/:id/memory/sessions/:sid/end', (req, res) => {
  try {
    const db = getDatabase();

    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const memoryService = getAgenticMemoryService();

    // Verify session belongs to this profile first
    const existing = memoryService.getSession(req.params.sid, req.user.id);
    if (!existing || existing.agenticId !== req.params.id) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const ended = memoryService.endSession(req.params.sid, req.user.id);

    if (!ended) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json({ success: true, message: 'Session ended' });

  } catch (error) {
    logger.error(`Failed to end session: ${error.message}`, { stack: error.stack });
    res.status(500).json({ error: 'Failed to end session' });
  }
});

/**
 * POST /api/agentic/profiles/:id/memory/search
 * Semantic search over memories
 * Body: { query, limit, minScore, types, minImportance, includeExpired }
 */
router.post('/profiles/:id/memory/search', async (req, res) => {
  try {
    const db = getDatabase();

    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const { query, limit, minScore, types, minImportance, includeExpired } = req.body;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'Query string is required' });
    }

    const memoryService = getAgenticMemoryService();
    const results = await memoryService.searchMemories(req.params.id, req.user.id, query, {
      limit: limit || 10,
      minScore: minScore ?? 0.3,
      types: types || null,
      minImportance: minImportance ?? null,
      includeExpired: includeExpired || false
    });

    res.json({
      memories: results,
      count: results.length,
      query
    });

  } catch (error) {
    logger.error(`Failed to search memories: ${error.message}`, { stack: error.stack });
    res.status(500).json({ error: 'Failed to search memories' });
  }
});

/**
 * POST /api/agentic/profiles/:id/memory/consolidate
 * Trigger memory consolidation (admin/scheduled task use)
 * Body: { olderThanDays, minRecallsForKeep, archiveThreshold, maxMemoriesToProcess }
 */
router.post('/profiles/:id/memory/consolidate', async (req, res) => {
  try {
    const db = getDatabase();

    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const { olderThanDays, minRecallsForKeep, archiveThreshold, maxMemoriesToProcess } = req.body;

    const memoryService = getAgenticMemoryService();
    const stats = await memoryService.consolidateMemories(req.params.id, {
      olderThanDays,
      minRecallsForKeep,
      archiveThreshold,
      maxMemoriesToProcess
    });

    res.json({ success: true, stats });

  } catch (error) {
    logger.error(`Failed to consolidate memories: ${error.message}`, { stack: error.stack });
    res.status(500).json({ error: 'Failed to consolidate memories' });
  }
});

// ============================================
// Memory Item Operations (parameterized :mid routes - MUST come after fixed paths)
// ============================================

/**
 * GET /api/agentic/profiles/:id/memory/:mid
 * Get a single memory by ID
 */
router.get('/profiles/:id/memory/:mid', (req, res) => {
  try {
    const db = getDatabase();

    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const memoryService = getAgenticMemoryService();
    const memory = memoryService.getMemory(req.params.mid, req.user.id);

    if (!memory) {
      return res.status(404).json({ error: 'Memory not found' });
    }

    // Verify memory belongs to this profile
    if (memory.agenticId !== req.params.id) {
      return res.status(404).json({ error: 'Memory not found' });
    }

    res.json({ memory });

  } catch (error) {
    logger.error(`Failed to get memory: ${error.message}`, { stack: error.stack });
    res.status(500).json({ error: 'Failed to get memory' });
  }
});

/**
 * POST /api/agentic/profiles/:id/memory
 * Create a memory entry for a profile
 * Body: { content, type, importance, title, summary, contactId, conversationId, taskId, tags, metadata, expiresAt }
 */
router.post('/profiles/:id/memory', async (req, res) => {
  try {
    const db = getDatabase();

    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const { content, type, importance, title, summary, contactId, conversationId, taskId, tags, metadata, expiresAt, emotionContext, occurredAt } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }

    const memoryService = getAgenticMemoryService();
    const memory = await memoryService.createMemory(req.params.id, req.user.id, {
      content,
      type: type || 'context',
      importance: importance ?? 0.5,
      title,
      summary,
      contactId,
      conversationId,
      taskId,
      tags: tags || [],
      metadata: metadata || {},
      emotionContext,
      occurredAt,
      expiresAt
    });

    res.status(201).json({ memory });

  } catch (error) {
    logger.error(`Failed to create memory: ${error.message}`);
    if (error.message.includes('Invalid memory type')) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to create memory' });
  }
});

/**
 * PATCH /api/agentic/profiles/:id/memory/:mid
 * Update a memory entry
 * Body: { title, content, summary, importance, emotionContext, tags, metadata, expiresAt }
 */
router.patch('/profiles/:id/memory/:mid', async (req, res) => {
  try {
    const db = getDatabase();

    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const memoryService = getAgenticMemoryService();

    // Verify memory belongs to this profile first
    const existing = memoryService.getMemory(req.params.mid, req.user.id);
    if (!existing || existing.agenticId !== req.params.id) {
      return res.status(404).json({ error: 'Memory not found' });
    }

    const updates = {};
    const allowedFields = ['title', 'content', 'summary', 'importance', 'emotionContext', 'tags', 'metadata', 'expiresAt'];

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    const memory = await memoryService.updateMemory(req.params.mid, req.user.id, updates);

    res.json({ memory });

  } catch (error) {
    logger.error(`Failed to update memory: ${error.message}`, { stack: error.stack, memoryId: req.params.mid });
    res.status(500).json({ error: 'Failed to update memory', details: error.message });
  }
});

/**
 * DELETE /api/agentic/profiles/:id/memory/:mid
 * Delete a memory entry
 */
router.delete('/profiles/:id/memory/:mid', async (req, res) => {
  try {
    const db = getDatabase();

    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const memoryService = getAgenticMemoryService();

    // Verify memory belongs to this profile first
    const existing = memoryService.getMemory(req.params.mid, req.user.id);
    if (!existing || existing.agenticId !== req.params.id) {
      return res.status(404).json({ error: 'Memory not found' });
    }

    const deleted = await memoryService.deleteMemory(req.params.mid, req.user.id);

    if (!deleted) {
      return res.status(404).json({ error: 'Memory not found' });
    }

    res.json({ success: true, message: 'Memory deleted' });

  } catch (error) {
    logger.error(`Failed to delete memory: ${error.message}`);
    res.status(500).json({ error: 'Failed to delete memory' });
  }
});

// ============================================
// Activity & Stats
// ============================================

/**
 * GET /api/agentic/profiles/:id/activity
 * Get activity log for a profile
 */
router.get('/profiles/:id/activity', (req, res) => {
  try {
    const db = getDatabase();

    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Placeholder: return empty activity log
    // In Phase 2, this will query the activity_log table
    res.json({
      activities: [],
      pagination: {
        page: 1,
        limit: 50,
        offset: 0,
        count: 0,
        total: 0,
        hasMore: false
      }
    });

  } catch (error) {
    logger.error(`Failed to get activity: ${error.message}`);
    res.status(500).json({ error: 'Failed to get activity' });
  }
});

/**
 * GET /api/agentic/profiles/:id/stats
 * Get statistics for a profile
 */
router.get('/profiles/:id/stats', (req, res) => {
  try {
    const db = getDatabase();

    const profile = db.prepare('SELECT * FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Count children (using migration column: parent_agentic_id)
    const childrenCount = db.prepare(
      'SELECT COUNT(*) as count FROM agentic_profiles WHERE parent_agentic_id = ? AND status != ?'
    ).get(req.params.id, 'terminated').count;

    // Count team members (using migration column: agentic_id)
    const teamCount = db.prepare(
      'SELECT COUNT(*) as count FROM agentic_team_members WHERE agentic_id = ? AND is_active = 1'
    ).get(req.params.id).count;

    // Count pending approvals
    const approvalsRequired = db.prepare(
      'SELECT COUNT(*) as count FROM agentic_approval_queue WHERE agentic_id = ? AND status = ?'
    ).get(req.params.id, 'pending').count;

    // Count tasks
    const tasksCompleted = db.prepare(
      'SELECT COUNT(*) as count FROM agentic_tasks WHERE agentic_id = ? AND status = ?'
    ).get(req.params.id, 'completed').count;

    const tasksPending = db.prepare(
      'SELECT COUNT(*) as count FROM agentic_tasks WHERE agentic_id = ? AND status IN (?, ?, ?)'
    ).get(req.params.id, 'pending', 'assigned', 'in_progress').count;

    // Count knowledge sources
    const knowledgeCount = db.prepare(
      'SELECT COUNT(*) as count FROM agentic_knowledge WHERE agentic_id = ? AND is_active = 1'
    ).get(req.params.id).count;

    // Count monitoring sources
    const monitoringCount = db.prepare(
      'SELECT COUNT(*) as count FROM agentic_monitoring WHERE agentic_id = ? AND is_active = 1'
    ).get(req.params.id).count;

    // Get budget info
    const budgetUsed = profile.daily_budget_used || 0;
    const budgetLimit = profile.daily_budget || 10.0;

    res.json({
      stats: {
        childrenCount,
        teamCount,
        knowledgeCount,
        monitoringCount,
        tasksPending,
        tasksCompleted,
        approvalsRequired,
        budgetUsed,
        budgetLimit,
        budgetPercentage: budgetLimit > 0 ? Math.round((budgetUsed / budgetLimit) * 100) : 0,
        lastActiveAt: profile.last_active_at || profile.updated_at
      }
    });

  } catch (error) {
    logger.error(`Failed to get stats: ${error.message}`);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

// ============================================
// Skills System
// ============================================

/**
 * Skill level names mapping
 */
const SKILL_LEVEL_NAMES = {
  1: 'beginner',
  2: 'intermediate',
  3: 'advanced',
  4: 'expert'
};

/**
 * Transform skill from database to API format
 */
function transformSkill(s) {
  if (!s) return null;

  const parseJson = (val) => {
    if (!val) return [];
    if (typeof val === 'object') return val;
    try {
      return JSON.parse(val);
    } catch {
      return [];
    }
  };

  return {
    id: s.id,
    agenticId: s.agentic_id,
    skillId: s.skill_id,
    name: s.name,
    category: s.category,
    description: s.description,
    icon: s.icon,
    currentLevel: s.current_level,
    levelName: SKILL_LEVEL_NAMES[s.current_level] || 'beginner',
    maxLevel: s.max_level || 4,
    experiencePoints: s.experience_points || 0,
    pointsToNextLevel: s.points_to_next_level || 100,
    toolsUnlocked: parseJson(s.tools_unlocked),
    prerequisites: parseJson(s.prerequisites),
    acquiredAt: s.acquired_at,
    lastUsedAt: s.last_used_at,
    usageCount: s.usage_count || 0,
    isInherited: !!s.is_inherited,
    inheritedFrom: s.inherited_from,
    createdAt: s.created_at,
    updatedAt: s.updated_at
  };
}

/**
 * Transform skill catalog item from database to API format
 */
function transformSkillCatalog(s) {
  if (!s) return null;

  const parseJson = (val) => {
    if (!val) return [];
    if (typeof val === 'object') return val;
    try {
      return JSON.parse(val);
    } catch {
      return [];
    }
  };

  return {
    id: s.id,
    name: s.name,
    category: s.category,
    description: s.description,
    icon: s.icon,
    prerequisites: parseJson(s.prerequisites),
    maxLevel: s.max_level || 4,
    toolsUnlocked: parseJson(s.tools_unlocked),
    xpPerLevel: parseJson(s.xp_per_level),
    createdAt: s.created_at
  };
}

/**
 * Calculate XP required for next level
 */
function getXpForLevel(xpPerLevel, targetLevel) {
  const xpArray = typeof xpPerLevel === 'string' ? JSON.parse(xpPerLevel) : (xpPerLevel || [100, 300, 600, 1000]);
  // targetLevel is 1-indexed, array is 0-indexed
  // Level 2 requires xpArray[0], Level 3 requires xpArray[1], etc.
  return xpArray[targetLevel - 2] || xpArray[xpArray.length - 1] || 1000;
}

/**
 * GET /api/agentic/skills/catalog
 * List all available skills in the system catalog
 */
router.get('/skills/catalog', (req, res) => {
  try {
    const db = getDatabase();
    const { category } = req.query;

    let sql = 'SELECT * FROM agentic_skills_catalog';
    const params = [];

    if (category) {
      sql += ' WHERE category = ?';
      params.push(category);
    }

    sql += ' ORDER BY category, name';

    const skills = db.prepare(sql).all(...params);

    // Group by category for easier frontend consumption
    const byCategory = {};
    for (const skill of skills) {
      const cat = skill.category;
      if (!byCategory[cat]) {
        byCategory[cat] = [];
      }
      byCategory[cat].push(transformSkillCatalog(skill));
    }

    res.json({
      skills: skills.map(transformSkillCatalog),
      byCategory,
      categories: Object.keys(byCategory),
      total: skills.length
    });

  } catch (error) {
    logger.error(`Failed to get skills catalog: ${error.message}`);
    res.status(500).json({ error: 'Failed to get skills catalog' });
  }
});

/**
 * GET /api/agentic/profiles/:id/skills
 * List all skills assigned to a specific agent profile
 */
router.get('/profiles/:id/skills', (req, res) => {
  try {
    const db = getDatabase();

    // Verify ownership
    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Get skills with catalog info joined
    const skills = db.prepare(`
      SELECT
        s.*,
        c.name,
        c.category,
        c.description,
        c.icon,
        c.max_level,
        c.tools_unlocked,
        c.prerequisites,
        c.xp_per_level
      FROM agentic_agent_skills s
      JOIN agentic_skills_catalog c ON s.skill_id = c.id
      WHERE s.agentic_id = ?
      ORDER BY c.category, c.name
    `).all(req.params.id);

    // Calculate stats
    const stats = {
      total: skills.length,
      inherited: skills.filter(s => s.is_inherited).length,
      own: skills.filter(s => !s.is_inherited).length,
      byLevel: {
        beginner: skills.filter(s => s.current_level === 1).length,
        intermediate: skills.filter(s => s.current_level === 2).length,
        advanced: skills.filter(s => s.current_level === 3).length,
        expert: skills.filter(s => s.current_level === 4).length
      },
      byCategory: {}
    };

    for (const skill of skills) {
      const cat = skill.category;
      if (!stats.byCategory[cat]) {
        stats.byCategory[cat] = 0;
      }
      stats.byCategory[cat]++;
    }

    res.json({
      skills: skills.map(transformSkill),
      stats
    });

  } catch (error) {
    logger.error(`Failed to get profile skills: ${error.message}`);
    res.status(500).json({ error: 'Failed to get profile skills' });
  }
});

/**
 * POST /api/agentic/profiles/:id/skills
 * Acquire a new skill for the agent
 */
router.post('/profiles/:id/skills', (req, res) => {
  try {
    const db = getDatabase();

    // Verify ownership
    const profile = db.prepare('SELECT * FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const { skillId, initialLevel = 1 } = req.body;

    if (!skillId) {
      return res.status(400).json({ error: 'skillId is required' });
    }

    // Verify skill exists in catalog
    const catalogSkill = db.prepare('SELECT * FROM agentic_skills_catalog WHERE id = ?').get(skillId);
    if (!catalogSkill) {
      return res.status(404).json({ error: 'Skill not found in catalog' });
    }

    // Check if already has this skill
    const existingSkill = db.prepare('SELECT id FROM agentic_agent_skills WHERE agentic_id = ? AND skill_id = ?')
      .get(req.params.id, skillId);

    if (existingSkill) {
      return res.status(409).json({ error: 'Agent already has this skill' });
    }

    // Prerequisites are informational only - all skills freely acquirable for autonomous agents

    // Calculate points to next level
    const level = Math.min(initialLevel, catalogSkill.max_level || 4);
    const pointsToNext = level < (catalogSkill.max_level || 4)
      ? getXpForLevel(catalogSkill.xp_per_level, level + 1)
      : 0;

    // Insert skill
    const id = uuidv4();
    db.prepare(`
      INSERT INTO agentic_agent_skills
      (id, agentic_id, skill_id, current_level, experience_points, points_to_next_level, is_inherited, inherited_from)
      VALUES (?, ?, ?, ?, 0, ?, 0, NULL)
    `).run(id, req.params.id, skillId, level, pointsToNext);

    // Log to history
    db.prepare(`
      INSERT INTO agentic_skill_history
      (id, agentic_id, skill_id, action, from_level, to_level, experience_gained, details)
      VALUES (?, ?, ?, 'acquired', NULL, ?, 0, ?)
    `).run(uuidv4(), req.params.id, skillId, level, JSON.stringify({ source: 'user_action' }));

    // Fetch and return the created skill
    const skill = db.prepare(`
      SELECT
        s.*,
        c.name,
        c.category,
        c.description,
        c.icon,
        c.max_level,
        c.tools_unlocked,
        c.prerequisites,
        c.xp_per_level
      FROM agentic_agent_skills s
      JOIN agentic_skills_catalog c ON s.skill_id = c.id
      WHERE s.id = ?
    `).get(id);

    logger.info(`Skill acquired: ${catalogSkill.name} for profile ${req.params.id}`);

    // Broadcast skill acquired event
    if (global.wsBroadcast) {
      global.wsBroadcast('agentic:skill_acquired', {
        profileId: req.params.id,
        userId: req.user.id,
        skill: transformSkill(skill),
        skillName: catalogSkill.name,
      });
    }

    res.status(201).json({ skill: transformSkill(skill) });

  } catch (error) {
    logger.error(`Failed to acquire skill: ${error.message}`);
    res.status(500).json({ error: 'Failed to acquire skill' });
  }
});

/**
 * PUT /api/agentic/profiles/:id/skills/:skillId
 * Upgrade skill level or add experience points
 */
router.put('/profiles/:id/skills/:skillId', (req, res) => {
  try {
    const db = getDatabase();

    // Verify ownership
    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Get current skill
    const currentSkill = db.prepare(`
      SELECT s.*, c.max_level, c.xp_per_level
      FROM agentic_agent_skills s
      JOIN agentic_skills_catalog c ON s.skill_id = c.id
      WHERE s.agentic_id = ? AND s.skill_id = ?
    `).get(req.params.id, req.params.skillId);

    if (!currentSkill) {
      return res.status(404).json({ error: 'Skill not found for this agent' });
    }

    const { addExperience, setLevel } = req.body;

    let newLevel = currentSkill.current_level;
    let newXp = currentSkill.experience_points;
    let xpGained = 0;

    // Handle direct level set (admin/manual upgrade)
    if (setLevel !== undefined) {
      const targetLevel = Math.min(Math.max(1, setLevel), currentSkill.max_level || 4);
      if (targetLevel !== currentSkill.current_level) {
        const action = targetLevel > currentSkill.current_level ? 'upgraded' : 'downgraded';
        const fromLevel = currentSkill.current_level;
        newLevel = targetLevel;
        newXp = 0; // Reset XP when manually setting level

        // Log to history
        db.prepare(`
          INSERT INTO agentic_skill_history
          (id, agentic_id, skill_id, action, from_level, to_level, experience_gained, details)
          VALUES (?, ?, ?, ?, ?, ?, 0, ?)
        `).run(uuidv4(), req.params.id, req.params.skillId, action, fromLevel, newLevel, JSON.stringify({ source: 'manual_set' }));
      }
    }

    // Handle adding experience (natural progression)
    if (addExperience !== undefined && addExperience > 0) {
      xpGained = addExperience;
      newXp = currentSkill.experience_points + addExperience;

      // Check for level up
      const maxLevel = currentSkill.max_level || 4;
      while (newLevel < maxLevel) {
        const xpNeeded = getXpForLevel(currentSkill.xp_per_level, newLevel + 1);
        if (newXp >= xpNeeded) {
          newXp -= xpNeeded;
          newLevel++;

          // Log level up
          db.prepare(`
            INSERT INTO agentic_skill_history
            (id, agentic_id, skill_id, action, from_level, to_level, experience_gained, details)
            VALUES (?, ?, ?, 'upgraded', ?, ?, ?, ?)
          `).run(uuidv4(), req.params.id, req.params.skillId, 'upgraded', newLevel - 1, newLevel, xpGained, JSON.stringify({ source: 'experience_gain' }));
        } else {
          break;
        }
      }
    }

    // Calculate new points to next level
    const pointsToNext = newLevel < (currentSkill.max_level || 4)
      ? getXpForLevel(currentSkill.xp_per_level, newLevel + 1) - newXp
      : 0;

    // Update skill
    db.prepare(`
      UPDATE agentic_agent_skills
      SET current_level = ?, experience_points = ?, points_to_next_level = ?, updated_at = datetime('now')
      WHERE agentic_id = ? AND skill_id = ?
    `).run(newLevel, newXp, Math.max(0, pointsToNext), req.params.id, req.params.skillId);

    // Fetch updated skill
    const skill = db.prepare(`
      SELECT
        s.*,
        c.name,
        c.category,
        c.description,
        c.icon,
        c.max_level,
        c.tools_unlocked,
        c.prerequisites,
        c.xp_per_level
      FROM agentic_agent_skills s
      JOIN agentic_skills_catalog c ON s.skill_id = c.id
      WHERE s.agentic_id = ? AND s.skill_id = ?
    `).get(req.params.id, req.params.skillId);

    // Broadcast skill upgrade event
    if (global.wsBroadcast && newLevel > currentSkill.current_level) {
      global.wsBroadcast('agentic:skill_leveled_up', {
        profileId: req.params.id,
        userId: req.user.id,
        skillId: req.params.skillId,
        previousLevel: currentSkill.current_level,
        newLevel,
        skill: transformSkill(skill),
      });
    }

    res.json({
      skill: transformSkill(skill),
      leveledUp: newLevel > currentSkill.current_level,
      previousLevel: currentSkill.current_level,
      xpGained
    });

  } catch (error) {
    logger.error(`Failed to update skill: ${error.message}`);
    res.status(500).json({ error: 'Failed to update skill' });
  }
});

/**
 * DELETE /api/agentic/profiles/:id/skills/:skillId
 * Remove a skill from the agent
 */
router.delete('/profiles/:id/skills/:skillId', (req, res) => {
  try {
    const db = getDatabase();

    // Verify ownership
    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Get current skill for logging
    const currentSkill = db.prepare(`
      SELECT s.*, c.name FROM agentic_agent_skills s
      JOIN agentic_skills_catalog c ON s.skill_id = c.id
      WHERE s.agentic_id = ? AND s.skill_id = ?
    `).get(req.params.id, req.params.skillId);

    if (!currentSkill) {
      return res.status(404).json({ error: 'Skill not found for this agent' });
    }

    // Log to history
    db.prepare(`
      INSERT INTO agentic_skill_history
      (id, agentic_id, skill_id, action, from_level, to_level, experience_gained, details)
      VALUES (?, ?, ?, 'removed', ?, NULL, 0, ?)
    `).run(uuidv4(), req.params.id, req.params.skillId, currentSkill.current_level, JSON.stringify({ source: 'user_action' }));

    // Delete skill
    db.prepare('DELETE FROM agentic_agent_skills WHERE agentic_id = ? AND skill_id = ?')
      .run(req.params.id, req.params.skillId);

    logger.info(`Skill removed: ${currentSkill.name} from profile ${req.params.id}`);

    res.json({ message: 'Skill removed successfully' });

  } catch (error) {
    logger.error(`Failed to remove skill: ${error.message}`);
    res.status(500).json({ error: 'Failed to remove skill' });
  }
});

/**
 * POST /api/agentic/profiles/:id/skills/:skillId/use
 * Record skill usage (adds XP and updates last_used_at)
 */
router.post('/profiles/:id/skills/:skillId/use', (req, res) => {
  try {
    const db = getDatabase();

    // Verify ownership
    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Get current skill
    const currentSkill = db.prepare(`
      SELECT s.*, c.max_level, c.xp_per_level
      FROM agentic_agent_skills s
      JOIN agentic_skills_catalog c ON s.skill_id = c.id
      WHERE s.agentic_id = ? AND s.skill_id = ?
    `).get(req.params.id, req.params.skillId);

    if (!currentSkill) {
      return res.status(404).json({ error: 'Skill not found for this agent' });
    }

    const { xpAmount = 10, context } = req.body;

    // Add XP and check for level up
    let newXp = currentSkill.experience_points + xpAmount;
    let newLevel = currentSkill.current_level;
    let leveledUp = false;

    const maxLevel = currentSkill.max_level || 4;
    while (newLevel < maxLevel) {
      const xpNeeded = getXpForLevel(currentSkill.xp_per_level, newLevel + 1);
      if (newXp >= xpNeeded) {
        newXp -= xpNeeded;
        newLevel++;
        leveledUp = true;

        // Log level up
        db.prepare(`
          INSERT INTO agentic_skill_history
          (id, agentic_id, skill_id, action, from_level, to_level, experience_gained, details)
          VALUES (?, ?, ?, 'upgraded', ?, ?, ?, ?)
        `).run(uuidv4(), req.params.id, req.params.skillId, newLevel - 1, newLevel, xpAmount, JSON.stringify({ source: 'usage', context }));
      } else {
        break;
      }
    }

    // Calculate new points to next level
    const pointsToNext = newLevel < maxLevel
      ? getXpForLevel(currentSkill.xp_per_level, newLevel + 1) - newXp
      : 0;

    // Update skill
    db.prepare(`
      UPDATE agentic_agent_skills
      SET current_level = ?,
          experience_points = ?,
          points_to_next_level = ?,
          last_used_at = datetime('now'),
          usage_count = usage_count + 1,
          updated_at = datetime('now')
      WHERE agentic_id = ? AND skill_id = ?
    `).run(newLevel, newXp, Math.max(0, pointsToNext), req.params.id, req.params.skillId);

    // Log usage to history
    db.prepare(`
      INSERT INTO agentic_skill_history
      (id, agentic_id, skill_id, action, from_level, to_level, experience_gained, details)
      VALUES (?, ?, ?, 'used', ?, ?, ?, ?)
    `).run(uuidv4(), req.params.id, req.params.skillId, currentSkill.current_level, newLevel, xpAmount, JSON.stringify({ context }));

    // Fetch updated skill
    const skill = db.prepare(`
      SELECT
        s.*,
        c.name,
        c.category,
        c.description,
        c.icon,
        c.max_level,
        c.tools_unlocked,
        c.prerequisites,
        c.xp_per_level
      FROM agentic_agent_skills s
      JOIN agentic_skills_catalog c ON s.skill_id = c.id
      WHERE s.agentic_id = ? AND s.skill_id = ?
    `).get(req.params.id, req.params.skillId);

    res.json({
      skill: transformSkill(skill),
      xpGained: xpAmount,
      leveledUp,
      previousLevel: currentSkill.current_level,
      newLevel
    });

  } catch (error) {
    logger.error(`Failed to record skill usage: ${error.message}`);
    res.status(500).json({ error: 'Failed to record skill usage' });
  }
});

/**
 * GET /api/agentic/profiles/:id/skills/recommendations
 * Get recommended skills for the agent to learn based on current skills and prerequisites
 */
router.get('/profiles/:id/skills/recommendations', (req, res) => {
  try {
    const db = getDatabase();

    // Verify ownership
    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Get current skills
    const currentSkills = db.prepare('SELECT skill_id FROM agentic_agent_skills WHERE agentic_id = ?')
      .all(req.params.id)
      .map(s => s.skill_id);

    // Get all catalog skills
    const allSkills = db.prepare('SELECT * FROM agentic_skills_catalog').all();

    const recommendations = [];

    for (const skill of allSkills) {
      // Skip if already has this skill
      if (currentSkills.includes(skill.id)) continue;

      const prerequisites = JSON.parse(skill.prerequisites || '[]');

      // Check if all prerequisites are met
      const hasAllPrereqs = prerequisites.every(p => currentSkills.includes(p));

      if (hasAllPrereqs) {
        // Calculate recommendation score based on category coverage, missing tools, etc.
        let score = 50; // Base score

        // Boost score if it's a prerequisite for many other skills
        const unlockCount = allSkills.filter(s => {
          const prereqs = JSON.parse(s.prerequisites || '[]');
          return prereqs.includes(skill.id);
        }).length;
        score += unlockCount * 10;

        // Boost if agent has skills in same category (synergy)
        const categorySkills = currentSkills.filter(cs => {
          const catSkill = allSkills.find(a => a.id === cs);
          return catSkill && catSkill.category === skill.category;
        });
        score += categorySkills.length * 5;

        // Lower score for skills with many prerequisites (more advanced)
        score -= prerequisites.length * 3;

        recommendations.push({
          skill: transformSkillCatalog(skill),
          score: Math.max(0, score),
          reason: prerequisites.length === 0
            ? 'No prerequisites - easy to learn'
            : `All ${prerequisites.length} prerequisite(s) met`,
          unlocks: unlockCount
        });
      }
    }

    // Sort by score descending
    recommendations.sort((a, b) => b.score - a.score);

    res.json({
      recommendations: recommendations.slice(0, 10), // Top 10 recommendations
      totalAvailable: recommendations.length,
      currentSkillCount: currentSkills.length
    });

  } catch (error) {
    logger.error(`Failed to get skill recommendations: ${error.message}`);
    res.status(500).json({ error: 'Failed to get skill recommendations' });
  }
});

/**
 * GET /api/agentic/profiles/:id/skills/history
 * Get skill learning/usage history for the agent
 */
router.get('/profiles/:id/skills/history', (req, res) => {
  try {
    const db = getDatabase();
    const { limit = 50, offset = 0, skillId, action } = req.query;

    // Verify ownership
    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    let sql = `
      SELECT h.*, c.name as skill_name, c.category, c.icon
      FROM agentic_skill_history h
      JOIN agentic_skills_catalog c ON h.skill_id = c.id
      WHERE h.agentic_id = ?
    `;
    const params = [req.params.id];

    if (skillId) {
      sql += ' AND h.skill_id = ?';
      params.push(skillId);
    }

    if (action) {
      sql += ' AND h.action = ?';
      params.push(action);
    }

    // Count total
    const countSql = sql.replace('SELECT h.*, c.name as skill_name, c.category, c.icon', 'SELECT COUNT(*) as count');
    const total = db.prepare(countSql).get(...params).count;

    sql += ' ORDER BY h.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const history = db.prepare(sql).all(...params);

    const parseJson = (val) => {
      if (!val) return null;
      try { return JSON.parse(val); } catch { return null; }
    };

    res.json({
      history: history.map(h => ({
        id: h.id,
        skillId: h.skill_id,
        skillName: h.skill_name,
        category: h.category,
        icon: h.icon,
        action: h.action,
        fromLevel: h.from_level,
        toLevelName: h.to_level ? SKILL_LEVEL_NAMES[h.to_level] : null,
        toLevel: h.to_level,
        experienceGained: h.experience_gained,
        details: parseJson(h.details),
        createdAt: h.created_at
      })),
      pagination: createPagination(parseInt(offset), parseInt(limit), total)
    });

  } catch (error) {
    logger.error(`Failed to get skill history: ${error.message}`);
    res.status(500).json({ error: 'Failed to get skill history' });
  }
});

// =====================================================
// GOALS MANAGEMENT
// =====================================================

/**
 * GET /api/agentic/profiles/:id/goals
 * Get all goals for a profile
 */
router.get('/profiles/:id/goals', (req, res) => {
  try {
    const db = getDatabase();
    const { status, type, limit = 50, offset = 0 } = req.query;

    // Verify ownership
    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    let sql = `SELECT * FROM agentic_goals WHERE agentic_id = ? AND user_id = ?`;
    const params = [req.params.id, req.user.id];

    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }

    if (type) {
      sql += ' AND goal_type = ?';
      params.push(type);
    }

    // Count total
    const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as count');
    const total = db.prepare(countSql).get(...params).count;

    sql += ' ORDER BY priority DESC, created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const goals = db.prepare(sql).all(...params);

    res.json({
      goals: goals.map(g => ({
        id: g.id,
        agenticId: g.agentic_id,
        title: g.title,
        description: g.description,
        goalType: g.goal_type,
        targetMetric: g.target_metric,
        targetValue: g.target_value,
        currentValue: g.current_value,
        progress: g.target_value && g.current_value
          ? Math.min(100, Math.round((parseFloat(g.current_value) / parseFloat(g.target_value)) * 100))
          : 0,
        deadlineAt: g.deadline_at,
        priority: g.priority,
        status: g.status,
        createdAt: g.created_at,
        updatedAt: g.updated_at
      })),
      pagination: createPagination(parseInt(offset), parseInt(limit), total)
    });

  } catch (error) {
    logger.error(`Failed to get goals: ${error.message}`);
    res.status(500).json({ error: 'Failed to get goals' });
  }
});

/**
 * POST /api/agentic/profiles/:id/goals
 * Create a new goal
 */
router.post('/profiles/:id/goals', (req, res) => {
  try {
    const db = getDatabase();
    const { title, description, goalType, targetMetric, targetValue, deadlineAt, priority } = req.body;

    if (!title?.trim()) {
      return res.status(400).json({ error: 'Title is required' });
    }

    // Verify ownership
    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const goalId = uuidv4();
    db.prepare(`
      INSERT INTO agentic_goals (
        id, agentic_id, user_id, title, description, goal_type,
        target_metric, target_value, current_value, deadline_at, priority, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
    `).run(
      goalId,
      req.params.id,
      req.user.id,
      title.trim(),
      description?.trim() || null,
      goalType || 'ongoing',
      targetMetric || null,
      targetValue || null,
      '0',
      deadlineAt || null,
      priority || 'normal'
    );

    const goal = db.prepare('SELECT * FROM agentic_goals WHERE id = ?').get(goalId);

    // Log activity
    logAgenticActivity(db, req.params.id, req.user.id, 'goal_created', {
      goalId,
      title: title.trim()
    });

    res.status(201).json({
      goal: {
        id: goal.id,
        agenticId: goal.agentic_id,
        title: goal.title,
        description: goal.description,
        goalType: goal.goal_type,
        targetMetric: goal.target_metric,
        targetValue: goal.target_value,
        currentValue: goal.current_value,
        progress: 0,
        deadlineAt: goal.deadline_at,
        priority: goal.priority,
        status: goal.status,
        createdAt: goal.created_at,
        updatedAt: goal.updated_at
      }
    });

  } catch (error) {
    logger.error(`Failed to create goal: ${error.message}`);
    res.status(500).json({ error: 'Failed to create goal' });
  }
});

/**
 * GET /api/agentic/profiles/:id/goals/:goalId
 * Get a specific goal
 */
router.get('/profiles/:id/goals/:goalId', (req, res) => {
  try {
    const db = getDatabase();

    const goal = db.prepare(`
      SELECT * FROM agentic_goals WHERE id = ? AND agentic_id = ? AND user_id = ?
    `).get(req.params.goalId, req.params.id, req.user.id);

    if (!goal) {
      return res.status(404).json({ error: 'Goal not found' });
    }

    res.json({
      goal: {
        id: goal.id,
        agenticId: goal.agentic_id,
        title: goal.title,
        description: goal.description,
        goalType: goal.goal_type,
        targetMetric: goal.target_metric,
        targetValue: goal.target_value,
        currentValue: goal.current_value,
        progress: goal.target_value && goal.current_value
          ? Math.min(100, Math.round((parseFloat(goal.current_value) / parseFloat(goal.target_value)) * 100))
          : 0,
        deadlineAt: goal.deadline_at,
        priority: goal.priority,
        status: goal.status,
        createdAt: goal.created_at,
        updatedAt: goal.updated_at
      }
    });

  } catch (error) {
    logger.error(`Failed to get goal: ${error.message}`);
    res.status(500).json({ error: 'Failed to get goal' });
  }
});

/**
 * PUT /api/agentic/profiles/:id/goals/:goalId
 * Update a goal
 */
router.put('/profiles/:id/goals/:goalId', (req, res) => {
  try {
    const db = getDatabase();
    const { title, description, goalType, targetMetric, targetValue, currentValue, deadlineAt, priority, status } = req.body;

    const goal = db.prepare(`
      SELECT * FROM agentic_goals WHERE id = ? AND agentic_id = ? AND user_id = ?
    `).get(req.params.goalId, req.params.id, req.user.id);

    if (!goal) {
      return res.status(404).json({ error: 'Goal not found' });
    }

    const updates = [];
    const params = [];

    if (title !== undefined) { updates.push('title = ?'); params.push(title.trim()); }
    if (description !== undefined) { updates.push('description = ?'); params.push(description?.trim() || null); }
    if (goalType !== undefined) { updates.push('goal_type = ?'); params.push(goalType); }
    if (targetMetric !== undefined) { updates.push('target_metric = ?'); params.push(targetMetric); }
    if (targetValue !== undefined) { updates.push('target_value = ?'); params.push(targetValue); }
    if (currentValue !== undefined) { updates.push('current_value = ?'); params.push(currentValue); }
    if (deadlineAt !== undefined) { updates.push('deadline_at = ?'); params.push(deadlineAt); }
    if (priority !== undefined) { updates.push('priority = ?'); params.push(priority); }
    if (status !== undefined) { updates.push('status = ?'); params.push(status); }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push("updated_at = datetime('now')");
    params.push(req.params.goalId);

    db.prepare(`UPDATE agentic_goals SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    const updated = db.prepare('SELECT * FROM agentic_goals WHERE id = ?').get(req.params.goalId);

    // Log activity
    logAgenticActivity(db, req.params.id, req.user.id, 'goal_updated', {
      goalId: req.params.goalId,
      changes: Object.keys(req.body)
    });

    res.json({
      goal: {
        id: updated.id,
        agenticId: updated.agentic_id,
        title: updated.title,
        description: updated.description,
        goalType: updated.goal_type,
        targetMetric: updated.target_metric,
        targetValue: updated.target_value,
        currentValue: updated.current_value,
        progress: updated.target_value && updated.current_value
          ? Math.min(100, Math.round((parseFloat(updated.current_value) / parseFloat(updated.target_value)) * 100))
          : 0,
        deadlineAt: updated.deadline_at,
        priority: updated.priority,
        status: updated.status,
        createdAt: updated.created_at,
        updatedAt: updated.updated_at
      }
    });

  } catch (error) {
    logger.error(`Failed to update goal: ${error.message}`);
    res.status(500).json({ error: 'Failed to update goal' });
  }
});

/**
 * PUT /api/agentic/profiles/:id/goals/:goalId/progress
 * Update goal progress (convenience endpoint)
 */
router.put('/profiles/:id/goals/:goalId/progress', (req, res) => {
  try {
    const db = getDatabase();
    const { currentValue, increment } = req.body;

    const goal = db.prepare(`
      SELECT * FROM agentic_goals WHERE id = ? AND agentic_id = ? AND user_id = ?
    `).get(req.params.goalId, req.params.id, req.user.id);

    if (!goal) {
      return res.status(404).json({ error: 'Goal not found' });
    }

    let newValue;
    if (increment !== undefined) {
      newValue = String(parseFloat(goal.current_value || '0') + parseFloat(increment));
    } else if (currentValue !== undefined) {
      newValue = String(currentValue);
    } else {
      return res.status(400).json({ error: 'currentValue or increment is required' });
    }

    // Check if goal is completed
    const progress = goal.target_value
      ? Math.min(100, Math.round((parseFloat(newValue) / parseFloat(goal.target_value)) * 100))
      : 0;

    const newStatus = progress >= 100 && goal.status === 'active' ? 'completed' : goal.status;

    db.prepare(`
      UPDATE agentic_goals
      SET current_value = ?, status = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(newValue, newStatus, req.params.goalId);

    const updated = db.prepare('SELECT * FROM agentic_goals WHERE id = ?').get(req.params.goalId);

    // Log activity
    logAgenticActivity(db, req.params.id, req.user.id, 'goal_progress_updated', {
      goalId: req.params.goalId,
      previousValue: goal.current_value,
      newValue,
      progress,
      autoCompleted: newStatus === 'completed' && goal.status !== 'completed'
    });

    res.json({
      goal: {
        id: updated.id,
        agenticId: updated.agentic_id,
        title: updated.title,
        currentValue: updated.current_value,
        targetValue: updated.target_value,
        progress,
        status: updated.status,
        updatedAt: updated.updated_at
      }
    });

  } catch (error) {
    logger.error(`Failed to update goal progress: ${error.message}`);
    res.status(500).json({ error: 'Failed to update goal progress' });
  }
});

/**
 * DELETE /api/agentic/profiles/:id/goals/:goalId
 * Delete a goal
 */
router.delete('/profiles/:id/goals/:goalId', (req, res) => {
  try {
    const db = getDatabase();

    const goal = db.prepare(`
      SELECT * FROM agentic_goals WHERE id = ? AND agentic_id = ? AND user_id = ?
    `).get(req.params.goalId, req.params.id, req.user.id);

    if (!goal) {
      return res.status(404).json({ error: 'Goal not found' });
    }

    db.prepare('DELETE FROM agentic_goals WHERE id = ?').run(req.params.goalId);

    // Log activity
    logAgenticActivity(db, req.params.id, req.user.id, 'goal_deleted', {
      goalId: req.params.goalId,
      title: goal.title
    });

    res.json({ success: true });

  } catch (error) {
    logger.error(`Failed to delete goal: ${error.message}`);
    res.status(500).json({ error: 'Failed to delete goal' });
  }
});

// =====================================================
// MEMORIES MANAGEMENT (DEPRECATED)
// =====================================================
// NOTE: These /memories endpoints are deprecated.
// Use /memory endpoints instead (lines 6512-6932).
// These redirects maintain backward compatibility.

/**
 * @deprecated Use GET /profiles/:id/memory instead
 */
router.get('/profiles/:id/memories', (req, res, next) => {
  logger.warn('DEPRECATED: /memories endpoint used. Please migrate to /memory');
  req.url = req.url.replace('/memories', '/memory');
  next('route');
});

/**
 * @deprecated Use POST /profiles/:id/memory instead
 */
router.post('/profiles/:id/memories', (req, res, next) => {
  logger.warn('DEPRECATED: /memories endpoint used. Please migrate to /memory');
  req.url = req.url.replace('/memories', '/memory');
  next('route');
});

/**
 * @deprecated Use GET /profiles/:id/memory/:mid instead
 */
router.get('/profiles/:id/memories/:memoryId', (req, res, next) => {
  logger.warn('DEPRECATED: /memories/:memoryId endpoint used. Please migrate to /memory/:mid');
  req.url = req.url.replace('/memories/', '/memory/').replace(req.params.memoryId, req.params.memoryId);
  req.params.mid = req.params.memoryId;
  next('route');
});

/**
 * @deprecated Use PATCH /profiles/:id/memory/:mid instead
 */
router.put('/profiles/:id/memories/:memoryId', (req, res, next) => {
  logger.warn('DEPRECATED: PUT /memories/:memoryId endpoint used. Please migrate to PATCH /memory/:mid');
  req.url = req.url.replace('/memories/', '/memory/');
  req.params.mid = req.params.memoryId;
  req.method = 'PATCH';
  next('route');
});

/**
 * @deprecated Use DELETE /profiles/:id/memory/:mid instead
 */
router.delete('/profiles/:id/memories/:memoryId', (req, res, next) => {
  logger.warn('DEPRECATED: /memories/:memoryId endpoint used. Please migrate to /memory/:mid');
  req.url = req.url.replace('/memories/', '/memory/');
  req.params.mid = req.params.memoryId;
  next('route');
});

/**
 * @deprecated Use POST /profiles/:id/memory/search instead
 * Note: The new endpoint uses POST with semantic vector search
 */
router.get('/profiles/:id/memories/search', (req, res) => {
  logger.warn('DEPRECATED: GET /memories/search endpoint used. Please migrate to POST /memory/search');
  // Redirect to the unified endpoint with transformed query
  res.status(301).json({
    error: 'Endpoint deprecated',
    message: 'Please use POST /profiles/:id/memory/search with body { query: "...", limit: N }',
    newEndpoint: `/agentic/profiles/${req.params.id}/memory/search`
  });
});

// =====================================================
// ACTIVITY LOGS & AUDIT TRAIL
// =====================================================

/**
 * GET /api/agentic/profiles/:id/activity-log
 * Get activity log for a profile
 */
router.get('/profiles/:id/activity-log', (req, res) => {
  try {
    const db = getDatabase();
    const { limit = 50, offset = 0, activityType } = req.query;

    // Verify ownership
    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Check if table exists
    const tableExists = db.prepare(`
      SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='agentic_activity_log'
    `).get().count > 0;

    if (!tableExists) {
      return res.json({ logs: [], total: 0, message: 'Activity log table not yet created' });
    }

    let whereClause = 'WHERE agentic_id = ? AND user_id = ?';
    const params = [req.params.id, req.user.id];

    if (activityType) {
      whereClause += ' AND activity_type = ?';
      params.push(activityType);
    }

    const countSql = `SELECT COUNT(*) as count FROM agentic_activity_log ${whereClause}`;
    const total = db.prepare(countSql).get(...params).count;

    const sql = `
      SELECT * FROM agentic_activity_log
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `;

    const logs = db.prepare(sql).all(...params, parseInt(limit), parseInt(offset));

    const parseJson = (val) => {
      if (!val) return null;
      try { return JSON.parse(val); } catch { return val; }
    };

    res.json({
      logs: logs.map(log => ({
        id: log.id,
        agenticId: log.agentic_id,
        activityType: log.activity_type,
        activityDescription: log.activity_description,
        triggerType: log.trigger_type,
        triggerId: log.trigger_id,
        status: log.status,
        result: log.result,
        requiredApproval: !!log.required_approval,
        approvedBy: log.approved_by,
        approvedAt: log.approved_at,
        metadata: parseJson(log.metadata) || {},
        createdAt: log.created_at
      })),
      total,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: parseInt(offset) + logs.length < total
      }
    });

  } catch (error) {
    logger.error(`Failed to get activity log: ${error.message}`);
    res.status(500).json({ error: 'Failed to get activity log' });
  }
});

/**
 * GET /api/agentic/profiles/:id/hierarchy-log
 * Get hierarchy change log for a profile
 */
router.get('/profiles/:id/hierarchy-log', (req, res) => {
  try {
    const db = getDatabase();
    const { limit = 50, offset = 0, eventType } = req.query;

    // Verify ownership
    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Check if table exists
    const tableExists = db.prepare(`
      SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='agentic_hierarchy_log'
    `).get().count > 0;

    if (!tableExists) {
      return res.json({ logs: [], total: 0, message: 'Hierarchy log table not yet created' });
    }

    let whereClause = 'WHERE hl.user_id = ? AND (hl.parent_agentic_id = ? OR hl.child_agentic_id = ?)';
    const params = [req.user.id, req.params.id, req.params.id];

    if (eventType) {
      whereClause += ' AND hl.event_type = ?';
      params.push(eventType);
    }

    const countSql = `SELECT COUNT(*) as count FROM agentic_hierarchy_log hl ${whereClause}`;
    const total = db.prepare(countSql).get(...params).count;

    const sql = `
      SELECT hl.*,
        pp.name as parent_name,
        cp.name as child_name
      FROM agentic_hierarchy_log hl
      LEFT JOIN agentic_profiles pp ON hl.parent_agentic_id = pp.id
      LEFT JOIN agentic_profiles cp ON hl.child_agentic_id = cp.id
      ${whereClause}
      ORDER BY hl.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const logs = db.prepare(sql).all(...params, parseInt(limit), parseInt(offset));

    const parseJson = (val) => {
      if (!val) return null;
      try { return JSON.parse(val); } catch { return val; }
    };

    res.json({
      logs: logs.map(log => ({
        id: log.id,
        eventType: log.event_type,
        parentAgenticId: log.parent_agentic_id,
        parentName: log.parent_name,
        childAgenticId: log.child_agentic_id,
        childName: log.child_name,
        triggeredBy: log.triggered_by,
        details: parseJson(log.details) || {},
        createdAt: log.created_at
      })),
      total,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: parseInt(offset) + logs.length < total
      }
    });

  } catch (error) {
    logger.error(`Failed to get hierarchy log: ${error.message}`);
    res.status(500).json({ error: 'Failed to get hierarchy log' });
  }
});

/**
 * GET /api/agentic/profiles/:id/scope-log
 * Get contact scope access log for a profile
 */
router.get('/profiles/:id/scope-log', (req, res) => {
  try {
    const db = getDatabase();
    const { limit = 50, offset = 0, status } = req.query;

    // Verify ownership
    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Check if table exists
    const tableExists = db.prepare(`
      SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='agentic_scope_log'
    `).get().count > 0;

    if (!tableExists) {
      return res.json({ logs: [], total: 0, message: 'Scope log table not yet created' });
    }

    let whereClause = 'WHERE sl.agentic_id = ? AND sl.user_id = ?';
    const params = [req.params.id, req.user.id];

    if (status) {
      whereClause += ' AND sl.status = ?';
      params.push(status);
    }

    const countSql = `SELECT COUNT(*) as count FROM agentic_scope_log sl ${whereClause}`;
    const total = db.prepare(countSql).get(...params).count;

    const sql = `
      SELECT sl.*, c.display_name as contact_name
      FROM agentic_scope_log sl
      LEFT JOIN contacts c ON sl.recipient_contact_id = c.id
      ${whereClause}
      ORDER BY sl.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const logs = db.prepare(sql).all(...params, parseInt(limit), parseInt(offset));

    // Build stats queries with base params only (agentic_id, user_id)
    const baseParams = [req.params.id, req.user.id];
    const statsWhere = 'WHERE agentic_id = ? AND user_id = ? AND status = ?';

    res.json({
      logs: logs.map(log => ({
        id: log.id,
        agenticId: log.agentic_id,
        actionType: log.action_type,
        recipientType: log.recipient_type,
        recipientValue: log.recipient_value,
        recipientContactId: log.recipient_contact_id,
        recipientName: log.recipient_name || log.contact_name,
        status: log.status,
        wasApproved: !!log.was_approved,
        approvedBy: log.approved_by,
        approvedAt: log.approved_at,
        originalContent: log.original_content,
        reasonBlocked: log.reason_blocked,
        createdAt: log.created_at
      })),
      total,
      stats: {
        allowed: db.prepare(`SELECT COUNT(*) as count FROM agentic_scope_log ${statsWhere}`).get(...baseParams, 'allowed').count,
        blocked: db.prepare(`SELECT COUNT(*) as count FROM agentic_scope_log ${statsWhere}`).get(...baseParams, 'blocked').count,
        pendingApproval: db.prepare(`SELECT COUNT(*) as count FROM agentic_scope_log ${statsWhere}`).get(...baseParams, 'pending_approval').count
      },
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: parseInt(offset) + logs.length < total
      }
    });

  } catch (error) {
    logger.error(`Failed to get scope log: ${error.message}`);
    res.status(500).json({ error: 'Failed to get scope log' });
  }
});

/**
 * GET /api/agentic/profiles/:id/notifications-log
 * Get master notifications log for a profile
 */
router.get('/profiles/:id/notifications-log', (req, res) => {
  try {
    const db = getDatabase();
    const { limit = 50, offset = 0, notificationType, status } = req.query;

    // Verify ownership
    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Check if table exists
    const tableExists = db.prepare(`
      SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='agentic_master_notifications'
    `).get().count > 0;

    if (!tableExists) {
      return res.json({ logs: [], total: 0, message: 'Notifications log table not yet created' });
    }

    let whereClause = 'WHERE mn.agentic_id = ? AND mn.user_id = ?';
    const params = [req.params.id, req.user.id];

    if (notificationType) {
      whereClause += ' AND mn.notification_type = ?';
      params.push(notificationType);
    }

    if (status) {
      whereClause += ' AND mn.delivery_status = ?';
      params.push(status);
    }

    const countSql = `SELECT COUNT(*) as count FROM agentic_master_notifications mn ${whereClause}`;
    const total = db.prepare(countSql).get(...params).count;

    const sql = `
      SELECT mn.*, c.display_name as contact_name
      FROM agentic_master_notifications mn
      LEFT JOIN contacts c ON mn.master_contact_id = c.id
      ${whereClause}
      ORDER BY mn.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const logs = db.prepare(sql).all(...params, parseInt(limit), parseInt(offset));

    const parseJson = (val) => {
      if (!val) return null;
      try { return JSON.parse(val); } catch { return val; }
    };

    // Build stats queries with base params only (agentic_id, user_id)
    const baseParams = [req.params.id, req.user.id];
    const statsWhere = 'WHERE agentic_id = ? AND user_id = ? AND delivery_status = ?';

    res.json({
      logs: logs.map(log => {
        return {
          id: log.id,
          agenticId: log.agentic_id,
          contactId: log.master_contact_id,
          contactName: log.contact_name,
          notificationType: log.notification_type,
          channel: log.channel,
          title: log.title,
          message: log.message || log.content,
          priority: log.priority || 'normal',
          status: log.delivery_status,
          deliveryStatus: log.delivery_status,
          deliveredAt: log.delivered_at ? log.delivered_at + 'Z' : null,
          readAt: log.read_at ? log.read_at + 'Z' : null,
          actionRequired: !!log.action_required,
          actionType: log.action_type || null,
          actionData: parseJson(log.action_data),
          deliveryAttempts: log.delivery_attempts || 0,
          createdAt: log.created_at ? log.created_at + 'Z' : null,
        };
      }),
      total,
      stats: {
        pending: db.prepare(`SELECT COUNT(*) as count FROM agentic_master_notifications ${statsWhere}`).get(...baseParams, 'pending').count,
        delivered: db.prepare(`SELECT COUNT(*) as count FROM agentic_master_notifications ${statsWhere}`).get(...baseParams, 'delivered').count,
        failed: db.prepare(`SELECT COUNT(*) as count FROM agentic_master_notifications ${statsWhere}`).get(...baseParams, 'failed').count
      },
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: parseInt(offset) + logs.length < total
      }
    });

  } catch (error) {
    logger.error(`Failed to get notifications log: ${error.message}`);
    res.status(500).json({ error: 'Failed to get notifications log' });
  }
});

// =====================================================
// COST & TOKEN TRACKING
// =====================================================

/**
 * GET /api/agentic/profiles/:id/usage
 * Get usage summary for a profile
 */
router.get('/profiles/:id/usage', (req, res) => {
  try {
    const { period = 'day', startDate, endDate } = req.query;

    const summary = costTrackingService.getUsageSummary(
      req.params.id,
      req.user.id,
      { period, startDate, endDate }
    );

    if (!summary) {
      return res.status(500).json({ error: 'Failed to get usage summary' });
    }

    res.json({ usage: summary });

  } catch (error) {
    logger.error(`Failed to get usage: ${error.message}`);
    res.status(500).json({ error: 'Failed to get usage summary' });
  }
});

/**
 * GET /api/agentic/profiles/:id/usage/logs
 * Get recent usage logs
 */
router.get('/profiles/:id/usage/logs', (req, res) => {
  try {
    const { limit = 50 } = req.query;

    const logs = costTrackingService.getRecentUsage(
      req.params.id,
      req.user.id,
      parseInt(limit)
    );

    res.json({ logs });

  } catch (error) {
    logger.error(`Failed to get usage logs: ${error.message}`);
    res.status(500).json({ error: 'Failed to get usage logs' });
  }
});

/**
 * POST /api/agentic/profiles/:id/usage
 * Record usage (typically called internally by AI services)
 */
router.post('/profiles/:id/usage', (req, res) => {
  try {
    const db = getDatabase();

    // Verify ownership
    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const {
      requestType = 'completion',
      provider,
      model,
      inputTokens = 0,
      outputTokens = 0,
      taskId,
      conversationId,
      source,
      metadata
    } = req.body;

    const result = costTrackingService.recordUsage({
      agenticId: req.params.id,
      userId: req.user.id,
      requestType,
      provider,
      model,
      inputTokens,
      outputTokens,
      taskId,
      conversationId,
      source,
      metadata
    });

    if (!result) {
      return res.status(500).json({ error: 'Failed to record usage' });
    }

    res.status(201).json({ usage: result });

  } catch (error) {
    logger.error(`Failed to record usage: ${error.message}`);
    res.status(500).json({ error: 'Failed to record usage' });
  }
});

/**
 * PUT /api/agentic/profiles/:id/budget
 * Update budget settings
 */
router.put('/profiles/:id/budget', (req, res) => {
  try {
    const { dailyBudget } = req.body;

    if (dailyBudget === undefined || dailyBudget < 0) {
      return res.status(400).json({ error: 'Valid daily budget is required' });
    }

    const result = costTrackingService.updateBudgetSettings(
      req.params.id,
      req.user.id,
      { dailyBudget }
    );

    if (!result.success) {
      return res.status(500).json({ error: result.error || 'Failed to update budget' });
    }

    res.json({ success: true, dailyBudget });

  } catch (error) {
    logger.error(`Failed to update budget: ${error.message}`);
    res.status(500).json({ error: 'Failed to update budget' });
  }
});

/**
 * POST /api/agentic/profiles/:id/budget/reset
 * Reset daily budget used (admin only)
 */
router.post('/profiles/:id/budget/reset', (req, res) => {
  try {
    const db = getDatabase();

    db.prepare(`
      UPDATE agentic_profiles
      SET daily_budget_used = 0,
          updated_at = datetime('now')
      WHERE id = ? AND user_id = ?
    `).run(req.params.id, req.user.id);

    res.json({ success: true, message: 'Daily budget reset' });

  } catch (error) {
    logger.error(`Failed to reset budget: ${error.message}`);
    res.status(500).json({ error: 'Failed to reset budget' });
  }
});

/**
 * GET /api/agentic/usage/pricing
 * Get pricing information for models
 */
router.get('/usage/pricing', (req, res) => {
  try {
    const { PRICING } = require('../services/agentic/CostTrackingService.cjs');
    res.json({ pricing: PRICING });
  } catch (error) {
    logger.error(`Failed to get pricing: ${error.message}`);
    res.status(500).json({ error: 'Failed to get pricing' });
  }
});

// ============================================================================
// AI TOOL PERMISSIONS & AUDIT (Phase 1 of Agentic AI Tools Plan)
// ============================================================================

/**
 * GET /api/agentic/profiles/:id/ai-tools
 * List all tools available to this agent with permission status.
 * Includes: allowed, requiresApproval, category, overrides.
 */
router.get('/profiles/:id/ai-tools', (req, res) => {
  try {
    const db = getDatabase();
    const profile = db.prepare(
      'SELECT id, autonomy_level FROM agentic_profiles WHERE id = ? AND user_id = ?'
    ).get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Get all registered tool IDs from SystemToolsRegistry
    const { getBuiltInToolNames } = require('../services/ai/SystemToolsRegistry.cjs');
    const allToolIds = getBuiltInToolNames();

    // Get permission details
    const { getAgenticToolPermissions } = require('../services/agentic/AgenticToolPermissions.cjs');
    const permissions = getAgenticToolPermissions();
    const toolPermissions = permissions.getToolPermissions(
      profile.id,
      profile.autonomy_level || 'semi-autonomous',
      allToolIds
    );

    res.json({
      agenticId: profile.id,
      autonomyLevel: profile.autonomy_level || 'semi-autonomous',
      totalTools: allToolIds.length,
      allowedCount: toolPermissions.filter(t => t.allowed).length,
      deniedCount: toolPermissions.filter(t => !t.allowed).length,
      approvalCount: toolPermissions.filter(t => t.requiresApproval).length,
      tools: toolPermissions,
    });
  } catch (error) {
    logger.error(`Failed to get AI tools: ${error.message}`);
    res.status(500).json({ error: 'Failed to get AI tool permissions' });
  }
});

/**
 * PUT /api/agentic/profiles/:id/ai-tools/:toolId
 * Set a tool override for this agent (enable, disable, or require_approval).
 */
router.put('/profiles/:id/ai-tools/:toolId', (req, res) => {
  try {
    const db = getDatabase();
    const profile = db.prepare(
      'SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?'
    ).get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const { overrideType, customConfig } = req.body;
    if (!overrideType || !['enable', 'disable', 'require_approval'].includes(overrideType)) {
      return res.status(400).json({
        error: 'Invalid overrideType. Must be: enable, disable, or require_approval',
      });
    }

    const { getAgenticToolPermissions } = require('../services/agentic/AgenticToolPermissions.cjs');
    const permissions = getAgenticToolPermissions();
    const result = permissions.setOverride(
      req.params.id,
      req.params.toolId,
      overrideType,
      customConfig || {}
    );

    logger.info(`[AI-Tools] Override set: agent=${req.params.id} tool=${req.params.toolId} type=${overrideType}`);
    res.json({ success: true, override: result });
  } catch (error) {
    logger.error(`Failed to set tool override: ${error.message}`);
    res.status(500).json({ error: 'Failed to set tool override' });
  }
});

/**
 * DELETE /api/agentic/profiles/:id/ai-tools/:toolId
 * Remove a tool override for this agent (revert to default matrix).
 */
router.delete('/profiles/:id/ai-tools/:toolId', (req, res) => {
  try {
    const db = getDatabase();
    const profile = db.prepare(
      'SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?'
    ).get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const { getAgenticToolPermissions } = require('../services/agentic/AgenticToolPermissions.cjs');
    const permissions = getAgenticToolPermissions();
    permissions.removeOverride(req.params.id, req.params.toolId);

    logger.info(`[AI-Tools] Override removed: agent=${req.params.id} tool=${req.params.toolId}`);
    res.json({ success: true });
  } catch (error) {
    logger.error(`Failed to remove tool override: ${error.message}`);
    res.status(500).json({ error: 'Failed to remove tool override' });
  }
});

/**
 * GET /api/agentic/profiles/:id/ai-tools/executions
 * Get tool execution audit log for this agent.
 * Query params: limit, offset, toolId, status, from, to
 */
router.get('/profiles/:id/ai-tools/executions', (req, res) => {
  try {
    const db = getDatabase();
    const profile = db.prepare(
      'SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?'
    ).get(req.params.id, req.user.id);

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;

    // Build WHERE clauses
    const conditions = ['agentic_id = ?'];
    const params = [req.params.id];

    if (req.query.toolId) {
      conditions.push('tool_id = ?');
      params.push(req.query.toolId);
    }
    if (req.query.status) {
      conditions.push('status = ?');
      params.push(req.query.status);
    }
    if (req.query.from) {
      conditions.push('created_at >= ?');
      params.push(req.query.from);
    }
    if (req.query.to) {
      conditions.push('created_at <= ?');
      params.push(req.query.to);
    }

    const where = conditions.join(' AND ');

    // Check if table exists first
    const tableExists = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='agentic_tool_executions'"
    ).get();

    if (!tableExists) {
      return res.json({ executions: [], total: 0, limit, offset });
    }

    const total = db.prepare(`SELECT COUNT(*) as cnt FROM agentic_tool_executions WHERE ${where}`).get(...params).cnt;

    const executions = db.prepare(`
      SELECT id, agentic_id, user_id, tool_id, parameters, result, status,
             execution_time_ms, trigger_source, session_id, orchestration_id,
             error_message, created_at
      FROM agentic_tool_executions
      WHERE ${where}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    // Parse JSON fields
    const parsed = executions.map(e => ({
      ...e,
      parameters: e.parameters ? JSON.parse(e.parameters) : {},
      result: e.result ? JSON.parse(e.result) : {},
    }));

    res.json({ executions: parsed, total, limit, offset });
  } catch (error) {
    logger.error(`Failed to get tool executions: ${error.message}`);
    res.status(500).json({ error: 'Failed to get tool execution log' });
  }
});

// ============================================================
// PHASE 4: Execution Status & Runtime Control
// ============================================================

/**
 * GET /profiles/:id/execution-status
 * Returns current execution state for an agent.
 */
router.get('/profiles/:id/execution-status', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { getAgentReasoningLoop } = require('../services/agentic/AgentReasoningLoop.cjs');
    const loop = getAgentReasoningLoop();

    const isRunning = loop.isRunning(id);
    const isPaused = loop.isPaused(id);
    const rateLimit = loop.getRateLimitStatus(id);

    res.json({
      agentId: id,
      isRunning,
      isPaused,
      rateLimit,
    });
  } catch (error) {
    logger.error(`Failed to get execution status: ${error.message}`);
    res.status(500).json({ error: 'Failed to get execution status' });
  }
});

/**
 * POST /profiles/:id/control
 * Runtime control actions: pause, resume, interrupt.
 */
router.post('/profiles/:id/control', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { action } = req.body;

    if (!['pause', 'resume', 'interrupt'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action. Must be: pause, resume, or interrupt' });
    }

    const { getAgentReasoningLoop } = require('../services/agentic/AgentReasoningLoop.cjs');
    const loop = getAgentReasoningLoop();

    switch (action) {
      case 'pause':
        loop.pause(id);
        break;
      case 'resume':
        loop.resume(id);
        break;
      case 'interrupt':
        loop.interrupt(id);
        break;
    }

    res.json({ success: true, action, agentId: id });
  } catch (error) {
    logger.error(`Failed to execute control action: ${error.message}`);
    res.status(500).json({ error: 'Failed to execute control action' });
  }
});

// ============================================================
// PHASE 6: Agent Collaboration Endpoints
// ============================================================

/**
 * GET /profiles/:id/conversations
 * List collaboration conversations for an agent.
 */
router.get('/profiles/:id/conversations', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { limit, type } = req.query;

    const { getCollaborationProtocol } = require('../services/agentic/CollaborationProtocol.cjs');
    const collab = getCollaborationProtocol();

    const conversations = collab.getConversations(id, userId, {
      limit: parseInt(limit) || 20,
      type: type || undefined,
    });

    res.json({ conversations });
  } catch (error) {
    logger.error(`Failed to get conversations: ${error.message}`);
    res.status(500).json({ error: 'Failed to get conversations' });
  }
});

/**
 * GET /conversations/:convId/messages
 * Get messages for a specific collaboration conversation.
 */
router.get('/conversations/:convId/messages', authenticate, async (req, res) => {
  try {
    const { convId } = req.params;

    const { getCollaborationProtocol } = require('../services/agentic/CollaborationProtocol.cjs');
    const collab = getCollaborationProtocol();

    const messages = collab.getConversationMessages(convId);

    res.json({ messages });
  } catch (error) {
    logger.error(`Failed to get conversation messages: ${error.message}`);
    res.status(500).json({ error: 'Failed to get conversation messages' });
  }
});

// ─── Phase 7: Execution History ───

router.get('/profiles/:id/execution-history', authenticate, (req, res) => {
  try {
    const db = getDatabase();
    const { limit = 20, offset = 0 } = req.query;

    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);
    if (!profile) return res.status(404).json({ error: 'Profile not found' });

    const tableExists = db.prepare(`
      SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='agentic_activity_log'
    `).get().count > 0;

    if (!tableExists) {
      return res.json({ executions: [], total: 0 });
    }

    const whereClause = `WHERE agentic_id = ? AND user_id = ? AND activity_type = 'reasoning_cycle_end'`;
    const params = [req.params.id, req.user.id];

    const total = db.prepare(`SELECT COUNT(*) as count FROM agentic_activity_log ${whereClause}`).get(...params).count;

    const rows = db.prepare(`
      SELECT id, activity_type, trigger_type, details, metadata, created_at
      FROM agentic_activity_log
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, parseInt(limit), parseInt(offset));

    const executions = rows.map(row => {
      let meta = {};
      try { meta = JSON.parse(row.metadata || '{}'); } catch { /* ignore */ }
      return {
        id: row.id,
        trigger: row.trigger_type || meta.trigger || 'unknown',
        timestamp: row.created_at,
        iterations: meta.iterations || 0,
        tokensUsed: meta.tokensUsed || meta.tokens_used || 0,
        actionCount: meta.actionCount || meta.action_count || 0,
        successCount: meta.successCount || 0,
        failCount: meta.failCount || 0,
        mode: meta.mode || 'reactive',
        finalThought: meta.finalThought || meta.final_thought || '',
        details: row.details,
      };
    });

    res.json({ executions, total });
  } catch (error) {
    logger.error(`Failed to get execution history: ${error.message}`);
    res.status(500).json({ error: 'Failed to get execution history' });
  }
});

// ─── Phase 7: Metrics Dashboard ───

router.get('/profiles/:id/metrics', authenticate, (req, res) => {
  try {
    const db = getDatabase();
    const { period = '7d' } = req.query;

    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);
    if (!profile) return res.status(404).json({ error: 'Profile not found' });

    // Calculate period start
    const periodDays = period === '24h' ? 1 : period === '30d' ? 30 : 7;
    const periodStart = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000).toISOString();

    const metrics = {
      period,
      periodStart,
      totalCycles: 0,
      avgIterations: 0,
      totalTokens: 0,
      recoveryRate: 0,
      toolSuccessRate: 0,
      dailyActivity: [],
      skillLevels: [],
      collaborationCount: 0,
    };

    // Activity log metrics
    const tableExists = db.prepare(`
      SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='agentic_activity_log'
    `).get().count > 0;

    if (tableExists) {
      // Total cycles
      const cycles = db.prepare(`
        SELECT COUNT(*) as count FROM agentic_activity_log
        WHERE agentic_id = ? AND activity_type = 'reasoning_cycle_end' AND created_at > ?
      `).get(req.params.id, periodStart);
      metrics.totalCycles = cycles.count;

      // Aggregate from metadata
      const rows = db.prepare(`
        SELECT metadata FROM agentic_activity_log
        WHERE agentic_id = ? AND activity_type = 'reasoning_cycle_end' AND created_at > ?
      `).all(req.params.id, periodStart);

      let totalIterations = 0;
      let totalSuccess = 0;
      let totalFail = 0;
      let recoveryCount = 0;

      for (const row of rows) {
        try {
          const m = JSON.parse(row.metadata || '{}');
          totalIterations += m.iterations || 0;
          metrics.totalTokens += m.tokensUsed || m.tokens_used || 0;
          totalSuccess += m.successCount || 0;
          totalFail += m.failCount || 0;
          if (m.recoveryApplied) recoveryCount++;
        } catch { /* skip */ }
      }

      metrics.avgIterations = metrics.totalCycles > 0 ? Math.round(totalIterations / metrics.totalCycles * 10) / 10 : 0;
      const totalActions = totalSuccess + totalFail;
      metrics.toolSuccessRate = totalActions > 0 ? Math.round(totalSuccess / totalActions * 100) : 0;
      metrics.recoveryRate = totalFail > 0 ? Math.round(recoveryCount / totalFail * 100) : 0;

      // Daily activity (group by date)
      const dailyRows = db.prepare(`
        SELECT DATE(created_at) as day, COUNT(*) as count
        FROM agentic_activity_log
        WHERE agentic_id = ? AND activity_type = 'reasoning_cycle_end' AND created_at > ?
        GROUP BY DATE(created_at)
        ORDER BY day
      `).all(req.params.id, periodStart);
      metrics.dailyActivity = dailyRows.map(r => ({ date: r.day, count: r.count }));
    }

    // Skill levels
    try {
      const skills = db.prepare(`
        SELECT c.name, c.category, s.current_level, s.xp
        FROM agentic_agent_skills s
        JOIN agentic_skills_catalog c ON s.skill_id = c.id
        WHERE s.agentic_id = ?
        ORDER BY s.current_level DESC
      `).all(req.params.id);
      metrics.skillLevels = skills.map(s => ({ name: s.name, category: s.category, level: s.current_level, xp: s.xp }));
    } catch { /* skills table may not exist */ }

    // Collaboration count
    try {
      const convTable = db.prepare(`
        SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='agentic_conversations'
      `).get().count > 0;
      if (convTable) {
        const convs = db.prepare(`
          SELECT COUNT(*) as count FROM agentic_conversations
          WHERE (initiator_id = ? OR participant_ids LIKE ?) AND created_at > ?
        `).get(req.params.id, `%${req.params.id}%`, periodStart);
        metrics.collaborationCount = convs.count;
      }
    } catch { /* conversations table may not exist */ }

    res.json(metrics);
  } catch (error) {
    logger.error(`Failed to get metrics: ${error.message}`);
    res.status(500).json({ error: 'Failed to get metrics' });
  }
});

// ============================================
// Self-Healing System
// ============================================

let _selfHealingService = null;
function getSelfHealingServiceInstance() {
  if (!_selfHealingService) {
    const mod = require('../services/agentic/SelfHealingService.cjs');
    _selfHealingService = mod.getSelfHealingService();
  }
  return _selfHealingService;
}

/**
 * GET /api/agentic/profiles/:id/self-healing/history
 * Get self-healing history for an agent
 *
 * Query params:
 * - limit: Max entries (default 20, max 50)
 */
router.get('/profiles/:id/self-healing/history', (req, res) => {
  try {
    const db = getDatabase();
    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const healer = getSelfHealingServiceInstance();
    const result = healer.getHealingHistory(req.params.id, {
      limit: parseInt(req.query.limit, 10) || 20,
    });

    res.json(result);
  } catch (error) {
    logger.error(`Failed to get self-healing history: ${error.message}`);
    res.status(500).json({ error: 'Failed to get self-healing history' });
  }
});

/**
 * GET /api/agentic/profiles/:id/self-healing/health
 * Get health report for an agent
 *
 * Query params:
 * - period: '24h' | '7d' | '30d' (default '24h')
 */
router.get('/profiles/:id/self-healing/health', (req, res) => {
  try {
    const db = getDatabase();
    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const healer = getSelfHealingServiceInstance();
    const result = healer.getHealthReport(req.params.id, {
      period: req.query.period || '24h',
    });

    res.json(result);
  } catch (error) {
    logger.error(`Failed to get health report: ${error.message}`);
    res.status(500).json({ error: 'Failed to get health report' });
  }
});

/**
 * GET /api/agentic/profiles/:id/self-healing/:healingId
 * Get details of a specific healing entry
 */
router.get('/profiles/:id/self-healing/:healingId', (req, res) => {
  try {
    const db = getDatabase();
    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const row = db.prepare(`
      SELECT * FROM agentic_self_healing_log
      WHERE id = ? AND agentic_id = ?
    `).get(req.params.healingId, req.params.id);

    if (!row) {
      return res.status(404).json({ error: 'Healing entry not found' });
    }

    // Parse JSON fields
    const jsonFields = ['trigger_context', 'diagnosis', 'affected_tools', 'proposed_fix', 'config_backup', 'applied_fix', 'test_results'];
    for (const field of jsonFields) {
      if (row[field] && typeof row[field] === 'string') {
        try { row[field] = JSON.parse(row[field]); } catch { /* keep as string */ }
      }
    }

    res.json(row);
  } catch (error) {
    logger.error(`Failed to get healing detail: ${error.message}`);
    res.status(500).json({ error: 'Failed to get healing detail' });
  }
});

/**
 * POST /api/agentic/profiles/:id/self-healing/diagnose
 * Trigger a manual diagnosis for an agent (async)
 */
router.post('/profiles/:id/self-healing/diagnose', async (req, res) => {
  try {
    const db = getDatabase();
    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const healer = getSelfHealingServiceInstance();
    const diagnosis = await healer.diagnoseSelf(req.params.id, req.user.id);

    res.json(diagnosis);
  } catch (error) {
    logger.error(`Failed to run diagnosis: ${error.message}`);
    res.status(500).json({ error: 'Failed to run diagnosis' });
  }
});

/**
 * POST /api/agentic/profiles/:id/self-healing/:healingId/approve
 * Approve a HIGH severity fix (awaiting_approval status)
 * Executes: backup → applyFix → selfTest → rollback if fails
 */
router.post('/profiles/:id/self-healing/:healingId/approve', async (req, res) => {
  try {
    const db = getDatabase();
    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const row = db.prepare(`
      SELECT * FROM agentic_self_healing_log
      WHERE id = ? AND agentic_id = ? AND status = 'awaiting_approval'
    `).get(req.params.healingId, req.params.id);

    if (!row) {
      return res.status(404).json({ error: 'No awaiting-approval healing entry found' });
    }

    const healer = getSelfHealingServiceInstance();
    const { HEALING_STATUS } = require('../services/agentic/SelfHealingService.cjs');

    // Parse proposed fix
    let proposedFix = {};
    try { proposedFix = JSON.parse(row.proposed_fix || '{}'); } catch { /* empty */ }

    let diagnosis = {};
    try { diagnosis = JSON.parse(row.diagnosis || '{}'); } catch { /* empty */ }

    const fixType = row.fix_type || (proposedFix.recommendations?.[0]?.fixType);
    const proposedChange = proposedFix.proposedChange || proposedFix;

    // If no fix type, try to extract from diagnosis recommendations
    const actualFixType = fixType || diagnosis.recommendations?.[0]?.fixType;
    if (!actualFixType) {
      return res.status(400).json({ error: 'No fix type found in healing entry' });
    }

    // Generate proposed change if not already present
    const actualChange = (proposedChange && Object.keys(proposedChange).length > 0)
      ? proposedChange
      : healer._generateProposedChange(actualFixType, diagnosis);

    // 1. Backup (may already exist from initial diagnosis)
    if (!row.config_backup || row.config_backup === '{}') {
      const backup = healer.createBackup(req.params.id, req.params.healingId);
      if (!backup.success) {
        return res.status(500).json({ error: `Backup failed: ${backup.error}` });
      }
    }

    // Update status and approver info
    healer._updateHealingLog(req.params.healingId, {
      approved_by: req.user.id,
      approved_at: new Date().toISOString(),
    });

    // 2. Apply fix
    const applyResult = await healer.applyFix(
      req.params.healingId, req.params.id, req.user.id,
      actualFixType, actualChange
    );

    if (!applyResult.success) {
      return res.status(500).json({ error: `Fix failed: ${applyResult.error}` });
    }

    // 3. Self-test
    const testResult = await healer.selfTest(req.params.id, req.user.id, {
      fixType: actualFixType, proposedChange: actualChange,
    });

    if (!testResult.passed) {
      const rollback = healer.rollbackFix(req.params.healingId, req.params.id);
      healer._learnFromHealing(req.params.id, req.user.id, req.params.healingId, 'rollback');
      return res.json({
        status: 'rolled_back',
        message: 'Fix applied but self-test failed. Changes rolled back.',
        testResult,
        rollback,
      });
    }

    // 4. Success
    healer._updateHealingLog(req.params.healingId, {
      status: 'completed',
      test_results: JSON.stringify(testResult),
      test_passed: 1,
      outcome: 'fixed',
      outcome_notes: `Approved by master and verified. Type: ${actualFixType}`,
    });
    healer._learnFromHealing(req.params.id, req.user.id, req.params.healingId, 'success');

    res.json({
      status: 'completed',
      message: 'Fix approved, applied, and verified successfully.',
      fixType: actualFixType,
      testResult,
    });
  } catch (error) {
    logger.error(`Failed to approve healing fix: ${error.message}`);
    res.status(500).json({ error: error.message || 'Failed to approve healing fix' });
  }
});

/**
 * POST /api/agentic/profiles/:id/self-healing/:healingId/rollback
 * Rollback a previously applied fix
 */
router.post('/profiles/:id/self-healing/:healingId/rollback', (req, res) => {
  try {
    const db = getDatabase();
    const profile = db.prepare('SELECT id FROM agentic_profiles WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const healer = getSelfHealingServiceInstance();
    const result = healer.rollbackFix(req.params.healingId, req.params.id);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({
      status: 'rolled_back',
      message: 'Fix rolled back successfully.',
      result,
    });
  } catch (error) {
    logger.error(`Failed to rollback healing fix: ${error.message}`);
    res.status(500).json({ error: error.message || 'Failed to rollback' });
  }
});

// ═══════════════════════════════════════════════════════════════
// Audit Log - Transparent AI Activity Timeline
// ═══════════════════════════════════════════════════════════════

/**
 * GET /api/agentic/profiles/:id/audit-log
 * Paginated, filterable audit log query.
 * Query params: limit, offset, categories, direction, search, since
 */
router.get('/profiles/:id/audit-log', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const {
      limit = 50,
      offset = 0,
      categories,     // comma-separated: "incoming,outgoing,tool_call"
      direction,      // INBOUND | INTERNAL | OUTBOUND
      search,         // text search in activity_description
      since,          // ISO date string
    } = req.query;

    const db = getDatabase();

    // Build WHERE clauses
    const conditions = [
      `agentic_id = ?`,
      `activity_type LIKE 'audit:%'`,
    ];
    const params = [id];

    if (userId) {
      conditions.push(`user_id = ?`);
      params.push(userId);
    }

    if (categories) {
      const cats = categories.split(',').map(c => `audit:${c.trim()}`);
      const placeholders = cats.map(() => '?').join(',');
      conditions.push(`activity_type IN (${placeholders})`);
      params.push(...cats);
    }

    if (direction) {
      conditions.push(`trigger_type = ?`);
      params.push(direction);
    }

    if (search) {
      conditions.push(`activity_description LIKE ?`);
      params.push(`%${search}%`);
    }

    if (since) {
      conditions.push(`created_at >= ?`);
      params.push(since);
    }

    const whereClause = conditions.join(' AND ');

    // Get total count
    const countRow = db.prepare(`
      SELECT COUNT(*) as total FROM agentic_activity_log WHERE ${whereClause}
    `).get(...params);

    const total = countRow?.total || 0;

    // Get paginated entries
    const entries = db.prepare(`
      SELECT id, agentic_id, user_id, activity_type, activity_description,
             trigger_type, status, metadata, created_at
      FROM agentic_activity_log
      WHERE ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, parseInt(limit), parseInt(offset));

    // Transform entries for frontend
    // SQLite datetime('now') stores UTC without timezone indicator.
    // Append 'Z' so JavaScript new Date() parses it correctly as UTC.
    const transformedEntries = entries.map(entry => ({
      id: entry.id,
      agenticId: entry.agentic_id,
      category: entry.activity_type.replace('audit:', ''),
      direction: entry.trigger_type,
      description: entry.activity_description,
      metadata: (() => { try { return JSON.parse(entry.metadata || '{}'); } catch { return {}; } })(),
      status: entry.status,
      createdAt: entry.created_at ? entry.created_at.replace(' ', 'T') + 'Z' : entry.created_at,
    }));

    res.json({
      entries: transformedEntries,
      total,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: parseInt(offset) + parseInt(limit) < total,
      },
    });
  } catch (error) {
    logger.error(`Failed to fetch audit log: ${error.message}`);
    res.status(500).json({ error: error.message || 'Failed to fetch audit log' });
  }
});

// ============================================================
// ASYNC CLI EXECUTION ENDPOINTS
// ============================================================

/**
 * GET /api/agentic/async-cli - List active/recent async CLI executions
 */
router.get('/async-cli', async (req, res) => {
  try {
    const { getAsyncCLIExecutionManager } = require('../services/ai/AsyncCLIExecutionManager.cjs');
    const manager = getAsyncCLIExecutionManager();
    const executions = manager.listActive(req.user.id);
    res.json({ executions });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/agentic/async-cli/:trackingId - Get status of a specific execution
 */
router.get('/async-cli/:trackingId', async (req, res) => {
  try {
    const { getAsyncCLIExecutionManager } = require('../services/ai/AsyncCLIExecutionManager.cjs');
    const manager = getAsyncCLIExecutionManager();
    const status = manager.getStatus(req.params.trackingId);
    if (!status) return res.status(404).json({ error: 'Execution not found' });
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/agentic/async-cli/:trackingId - Cancel an async execution
 */
router.delete('/async-cli/:trackingId', async (req, res) => {
  try {
    const { getAsyncCLIExecutionManager } = require('../services/ai/AsyncCLIExecutionManager.cjs');
    const manager = getAsyncCLIExecutionManager();
    const result = manager.cancelExecution(req.params.trackingId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
