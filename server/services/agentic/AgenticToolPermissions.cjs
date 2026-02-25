/**
 * Agentic Tool Permissions
 * ========================
 * Lightweight permission matrix layer over SystemToolsRegistry.
 *
 * Determines which tools an agent can access based on:
 *   1. Agent's autonomy level (supervised/semi-autonomous/autonomous → mapped to 1-5)
 *   2. Per-agent tool overrides from agentic_tool_overrides table
 *   3. Default permission matrix (tool category → autonomy level → YES/APPROVAL/NO)
 */

const { logger } = require('../logger.cjs');
const { getDatabase } = require('../database.cjs');

// Map autonomy level strings to numeric levels
const AUTONOMY_LEVELS = {
  'supervised': 1,
  'low': 2,
  'semi-autonomous': 3,
  'high': 4,
  'autonomous': 5,
  'full': 5,
};

// Permission values
const ALLOW = 'allow';
const APPROVAL = 'approval';
const DENY = 'deny';

/**
 * Tool → permission category mapping.
 * Each tool is assigned to a permission category used in the matrix.
 */
const TOOL_PERMISSION_CATEGORY = {
  // Observation (read-only) - always allowed
  getMyProfile: 'observation',
  checkAgentStatuses: 'observation',
  checkGoalProgress: 'observation',
  listMySkills: 'observation',
  listMySchedules: 'observation',
  listMyTasks: 'observation',
  listTeamMembers: 'observation',
  searchTeamMembers: 'observation',
  listSubAgents: 'observation',
  checkSubAgentStatus: 'observation',
  getMyUsageStats: 'observation',
  getMyAuditLog: 'observation',
  checkAlerts: 'observation',

  // Self-healing (read-only diagnostics)
  getMyErrorHistory: 'observation',
  getMyHealthReport: 'observation',
  diagnoseSelf: 'observation',
  // Self-healing (write - config modification)
  proposeSelfFix: 'self_improvement',

  // Platform data (read-only) - always allowed
  searchContacts: 'observation',
  getContactDetails: 'observation',
  getConversations: 'observation',
  getMessages: 'observation',
  searchMessages: 'observation',

  // Memory (read)
  listRecentMemories: 'memory_read',
  searchMemory: 'memory_read',

  // Memory (write)
  saveMemory: 'memory_write',
  updateMemory: 'memory_write',
  consolidateMemories: 'memory_write',
  selfReflect: 'memory_write',

  // Memory (delete)
  forgetMemory: 'memory_delete',

  // Knowledge (read)
  ragQuery: 'knowledge_read',
  listKnowledgeLibraries: 'knowledge_read',
  getLibraryStats: 'knowledge_read',

  // Knowledge (ingest)
  learnFromConversation: 'knowledge_ingest',
  learnFromUrl: 'knowledge_ingest',
  learnFromText: 'knowledge_ingest',
  suggestLearningTopics: 'knowledge_ingest',

  // Self-management
  createSchedule: 'self_management',
  updateSchedule: 'self_management',
  deleteSchedule: 'self_management',
  createTask: 'self_management',
  updateTaskStatus: 'self_management',
  createGoal: 'self_management',
  updateGoalProgress: 'self_management',
  createReminder: 'self_management',
  cancelReminder: 'self_management',
  listReminders: 'observation',

  // Contact scope management
  getMyScope: 'observation',
  addContactToScope: 'self_management',
  removeContactFromScope: 'self_management',
  addGroupToScope: 'self_management',

  // Sub-agent management (create/delete)
  orchestrate: 'subagent_manage',
  createSpecialist: 'subagent_manage',
  recallSubAgent: 'subagent_manage',

  // Communication (respond) - always allowed
  respond: 'communication_respond',
  clarify: 'communication_respond',
  done: 'communication_respond',
  silent: 'communication_respond',
  heartbeat_ok: 'communication_respond',

  // Communication (outbound)
  notifyMaster: 'communication_outbound',
  sendWhatsApp: 'communication_outbound',
  sendTelegram: 'communication_outbound',
  sendEmail: 'communication_outbound',
  broadcastToSwarm: 'communication_outbound',
  broadcastTeam: 'communication_outbound',
  sendAgentMessage: 'communication_outbound',
  handoffToAgent: 'communication_outbound',
  delegateTask: 'communication_outbound',
  requestApproval: 'communication_respond', // always allowed - it's the approval mechanism itself

  // Self-improvement
  acquireSkill: 'self_improvement',
  upgradeSkill: 'self_improvement',
  evaluatePerformance: 'self_improvement',
  suggestImprovements: 'self_improvement',

  // Self-modification (dangerous)
  updateSelfPrompt: 'self_modification',

  // AI / Research tools - always allowed (read-only analysis)
  aiChat: 'observation',
  aiClassify: 'observation',
  aiExtract: 'observation',
  aiSummarize: 'observation',
  aiTranslate: 'observation',
  searchWeb: 'observation',

  // File tools - read-only
  readPdf: 'observation',
  readExcel: 'observation',
  readDocx: 'observation',
  readText: 'observation',
  readCsv: 'observation',
  extractTextFromImage: 'observation',
  analyzeImageMessage: 'observation',

  // File tools - write
  generatePdf: 'self_management',
  generateExcel: 'self_management',
  generateCsv: 'self_management',
  generateDocx: 'self_management',
  listWorkspaceFiles: 'observation',

  // Media send tools (outbound with file)
  sendWhatsAppMedia: 'communication_outbound',
  sendTelegramMedia: 'communication_outbound',
  sendEmailAttachment: 'communication_outbound',

  // Data tools
  jsonParse: 'observation',
  jsonStringify: 'observation',
  regexExtract: 'observation',
  templateString: 'observation',

  // Web tools (scraping/fetching - generally safe)
  fetchWebPage: 'observation',
  fetchJsPage: 'observation',
  scrapeWebPage: 'observation',
  httpRequest: 'self_management',

  // Flow tools
  triggerFlow: 'self_management',

  // CLI AI tools (agentic - powerful)
  claudeCliPrompt: 'self_management',
  geminiCliPrompt: 'self_management',
  opencodeCliPrompt: 'self_management',
};

/**
 * Permission matrix: category → minimum autonomy level
 *
 * Level 1 (Supervised): Only observation + respond
 * Level 2 (Low): + memory write, basic safe actions
 * Level 3 (Semi-autonomous): + self-management, knowledge ingest, memory delete (approval)
 * Level 4 (High): + sub-agent management, outbound comms, self-improvement
 * Level 5 (Full/Autonomous): + self-modification
 */
const PERMISSION_MATRIX = {
  // category → { minLevel, approvalLevel (optional) }
  observation:              { minLevel: 1 },
  memory_read:              { minLevel: 1 },
  memory_write:             { minLevel: 2, approvalLevel: 1 },
  memory_delete:            { minLevel: 4, approvalLevel: 3 },
  knowledge_read:           { minLevel: 1 },
  knowledge_ingest:         { minLevel: 3 },
  self_management:          { minLevel: 3, approvalLevel: 2 },
  subagent_manage:          { minLevel: 4 },
  communication_respond:    { minLevel: 1 },
  communication_outbound:   { minLevel: 4, approvalLevel: 2 },
  self_improvement:         { minLevel: 4, approvalLevel: 3 },
  self_modification:        { minLevel: 5 },
};

class AgenticToolPermissions {
  constructor() {
    this._overrideCache = new Map(); // agentId -> { overrides, cachedAt }
    this._cacheTtlMs = 60000; // 1 minute cache
  }

  /**
   * Check if an agent can execute a specific tool.
   * @param {string} agentId
   * @param {string} toolId
   * @param {number|string} autonomyLevel - numeric (1-5) or string ('supervised', etc.)
   * @returns {{ allowed: boolean, requiresApproval: boolean, reason: string }}
   */
  canExecute(agentId, toolId, autonomyLevel) {
    const level = typeof autonomyLevel === 'number'
      ? autonomyLevel
      : (AUTONOMY_LEVELS[autonomyLevel] || 3);

    // Check per-agent overrides first
    const overrides = this._getOverrides(agentId);
    const override = overrides.find(o => o.tool_id === toolId);

    if (override) {
      switch (override.override_type) {
        case 'enable':
          return { allowed: true, requiresApproval: false, reason: 'Enabled by override' };
        case 'disable':
          return { allowed: false, requiresApproval: false, reason: 'Disabled by override' };
        case 'require_approval':
          return { allowed: true, requiresApproval: true, reason: 'Approval required by override' };
      }
    }

    // Check permission matrix
    const category = TOOL_PERMISSION_CATEGORY[toolId];
    if (!category) {
      // Unknown tool - allow by default (backwards compatibility)
      return { allowed: true, requiresApproval: false, reason: 'No permission category defined' };
    }

    const matrixEntry = PERMISSION_MATRIX[category];
    if (!matrixEntry) {
      return { allowed: true, requiresApproval: false, reason: 'No matrix entry for category' };
    }

    if (level >= matrixEntry.minLevel) {
      return { allowed: true, requiresApproval: false, reason: `Level ${level} >= min ${matrixEntry.minLevel}` };
    }

    if (matrixEntry.approvalLevel && level >= matrixEntry.approvalLevel) {
      return { allowed: true, requiresApproval: true, reason: `Level ${level} requires approval for ${category}` };
    }

    return { allowed: false, requiresApproval: false, reason: `Level ${level} < min ${matrixEntry.minLevel} for ${category}` };
  }

  /**
   * Filter a list of tool IDs to only those the agent can access.
   * @param {string} agentId
   * @param {number|string} autonomyLevel
   * @param {string[]} toolIds - Candidate tool IDs
   * @returns {string[]} Filtered tool IDs
   */
  getAvailableTools(agentId, autonomyLevel, toolIds) {
    return toolIds.filter(toolId => {
      const result = this.canExecute(agentId, toolId, autonomyLevel);
      return result.allowed;
    });
  }

  /**
   * Get all tool permissions for an agent (for UI display).
   * @param {string} agentId
   * @param {number|string} autonomyLevel
   * @param {string[]} allToolIds - All available tool IDs
   * @returns {Array<{ toolId, allowed, requiresApproval, reason, category, hasOverride }>}
   */
  getToolPermissions(agentId, autonomyLevel, allToolIds) {
    const overrides = this._getOverrides(agentId);
    const overrideMap = new Map(overrides.map(o => [o.tool_id, o]));

    return allToolIds.map(toolId => {
      const result = this.canExecute(agentId, toolId, autonomyLevel);
      return {
        toolId,
        allowed: result.allowed,
        requiresApproval: result.requiresApproval,
        reason: result.reason,
        category: TOOL_PERMISSION_CATEGORY[toolId] || 'unknown',
        hasOverride: overrideMap.has(toolId),
        overrideType: overrideMap.get(toolId)?.override_type || null,
      };
    });
  }

  /**
   * Set a tool override for an agent.
   */
  setOverride(agentId, toolId, overrideType, customConfig = {}) {
    const db = getDatabase();
    const crypto = require('crypto');
    const id = crypto.randomUUID();

    db.prepare(`
      INSERT OR REPLACE INTO agentic_tool_overrides (id, agentic_id, tool_id, override_type, custom_config, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `).run(id, agentId, toolId, overrideType, JSON.stringify(customConfig));

    // Invalidate cache
    this._overrideCache.delete(agentId);
    return { id, agentId, toolId, overrideType };
  }

  /**
   * Remove a tool override for an agent.
   */
  removeOverride(agentId, toolId) {
    const db = getDatabase();
    db.prepare('DELETE FROM agentic_tool_overrides WHERE agentic_id = ? AND tool_id = ?').run(agentId, toolId);
    this._overrideCache.delete(agentId);
  }

  /**
   * Get all overrides for an agent (with caching).
   * @private
   */
  _getOverrides(agentId) {
    const cached = this._overrideCache.get(agentId);
    if (cached && (Date.now() - cached.cachedAt) < this._cacheTtlMs) {
      return cached.overrides;
    }

    try {
      const db = getDatabase();
      const overrides = db.prepare(
        'SELECT tool_id, override_type, custom_config FROM agentic_tool_overrides WHERE agentic_id = ?'
      ).all(agentId);
      this._overrideCache.set(agentId, { overrides, cachedAt: Date.now() });
      return overrides;
    } catch (e) {
      // Table might not exist yet
      return [];
    }
  }
}

// Singleton
let _instance = null;

function getAgenticToolPermissions() {
  if (!_instance) {
    _instance = new AgenticToolPermissions();
    logger.info('[AgenticToolPermissions] Initialized');
  }
  return _instance;
}

module.exports = {
  AgenticToolPermissions,
  getAgenticToolPermissions,
  AUTONOMY_LEVELS,
  TOOL_PERMISSION_CATEGORY,
  PERMISSION_MATRIX,
};
