/**
 * ReflectionService — Phase 2: Post-Execution Learning
 * =====================================================
 * Analyzes completed reasoning loop executions and extracts learnings.
 *
 * Runs automatically after every non-trivial reasoning loop completion.
 * Generates insights from successes, failures, and patterns.
 * Updates skill XP and creates memories for future reference.
 *
 * Usage:
 *   const { getReflectionService } = require('./ReflectionService.cjs');
 *   const service = getReflectionService();
 *   const insights = await service.reflect(agentId, userId, execution);
 */

const { logger } = require('../logger.cjs');
const { getDatabase } = require('../database.cjs');
const crypto = require('crypto');

// Tool → skill category mapping
const TOOL_TO_SKILL_CATEGORY = {
  // Communication
  aiTranslate: 'communication',
  aiSummarize: 'communication',
  respond: 'communication',
  sendWhatsApp: 'communication',
  sendEmail: 'communication',
  sendTelegram: 'communication',
  sendMessageToContact: 'communication',

  // Analysis
  searchWeb: 'analysis',
  ragQuery: 'analysis',
  aiClassify: 'analysis',
  aiExtract: 'analysis',
  aiChat: 'analysis',

  // Automation
  triggerFlow: 'automation',
  createSchedule: 'automation',
  updateSchedule: 'automation',
  createTask: 'automation',

  // Integration
  searchContacts: 'integration',
  getContactDetails: 'integration',
  getConversations: 'integration',
  getMessages: 'integration',
  searchMessages: 'integration',

  // Management
  delegateTask: 'management',
  sendAgentMessage: 'management',
  handoffToAgent: 'management',
  orchestrate: 'management',
  broadcastTeam: 'management',
  createSpecialist: 'management',
  checkAgentStatuses: 'management',
};

class ReflectionService {
  constructor() {
    this.minActionsForReflection = 2;
    this.maxLearningsPerExecution = 5;
  }

  /**
   * Reflect on a completed execution and extract learnings.
   *
   * @param {string} agentId
   * @param {string} userId
   * @param {Object} execution - { trigger, triggerContext, actions, iterations, tokensUsed, finalThought }
   * @returns {{ learnings: [], skillUpdates: [], memoriesToSave: [] }}
   */
  async reflect(agentId, userId, execution) {
    const { actions, trigger, triggerContext, iterations, tokensUsed } = execution;

    // Skip trivial executions
    if (!actions || actions.length < this.minActionsForReflection) {
      return { learnings: [], skillUpdates: [], memoriesToSave: [] };
    }

    const insights = {
      learnings: [],
      skillUpdates: [],
      memoriesToSave: [],
    };

    try {
      // Phase 7: Quality gate — determine if this execution warrants memory creation
      const shouldCreateMemories = this._shouldCreateMemories(execution);

      // 1. Analyze tool effectiveness
      this._analyzeToolUsage(actions, insights);

      // 2. Analyze failure patterns (always learn from failures)
      this._analyzeFailures(actions, trigger, insights);

      // 3. Analyze efficiency
      this._analyzeEfficiency(actions, iterations, tokensUsed, insights, shouldCreateMemories);

      // 4. Extract task pattern (only if quality gate passes)
      if (shouldCreateMemories) {
        this._extractTaskPattern(trigger, triggerContext, actions, insights);
      }

      // Limit learnings
      if (insights.learnings.length > this.maxLearningsPerExecution) {
        insights.learnings = insights.learnings.slice(0, this.maxLearningsPerExecution);
      }
      if (insights.memoriesToSave.length > this.maxLearningsPerExecution) {
        insights.memoriesToSave = insights.memoriesToSave.slice(0, this.maxLearningsPerExecution);
      }

      logger.debug(`[Reflection] Agent ${agentId}: ${insights.learnings.length} learnings, ${insights.skillUpdates.length} skill updates, ${insights.memoriesToSave.length} memories`);
    } catch (err) {
      logger.debug(`[Reflection] Analysis error (non-critical): ${err.message}`);
    }

    return insights;
  }

  /**
   * Check if any skills should level up based on accumulated XP.
   * Called after XP updates to auto-promote skill levels.
   *
   * @param {string} agentId
   */
  checkSkillLevelUps(agentId) {
    try {
      const db = getDatabase();

      const skills = db.prepare(`
        SELECT s.id, s.xp, s.current_level, s.skill_id,
               c.xp_per_level, c.name, c.category
        FROM agentic_agent_skills s
        JOIN agentic_skills_catalog c ON s.skill_id = c.id
        WHERE s.agentic_id = ?
      `).all(agentId);

      for (const skill of skills) {
        const xpThresholds = JSON.parse(skill.xp_per_level || '[100, 300, 600, 1000]');
        const currentThreshold = xpThresholds[skill.current_level - 1];

        if (currentThreshold && skill.xp >= currentThreshold && skill.current_level < 4) {
          const newLevel = skill.current_level + 1;

          db.prepare(`
            UPDATE agentic_agent_skills
            SET current_level = ?, updated_at = ?
            WHERE id = ?
          `).run(newLevel, new Date().toISOString(), skill.id);

          // Record level-up in history
          try {
            db.prepare(`
              INSERT INTO agentic_skill_history (id, agentic_id, skill_id, event_type, details, created_at)
              VALUES (?, ?, ?, 'level_up', ?, ?)
            `).run(
              crypto.randomUUID(),
              agentId, skill.skill_id,
              JSON.stringify({ from: skill.current_level, to: newLevel, xp: skill.xp }),
              new Date().toISOString()
            );
          } catch (e) { /* history optional */ }

          logger.info(`[Reflection] Agent ${agentId}: ${skill.name} leveled up ${skill.current_level} → ${newLevel} (XP: ${skill.xp})`);
        }
      }
    } catch (err) {
      logger.debug(`[Reflection] Level-up check error (non-critical): ${err.message}`);
    }
  }

  // ==========================================
  // PHASE 7: Skill Decay
  // ==========================================

  /**
   * Apply XP decay to skills that haven't been used recently.
   * Rules: 5% XP per week of inactivity after 14 days, max 50% decay.
   * Auto-decrease level if XP drops below threshold.
   *
   * @param {string} agentId
   */
  applySkillDecay(agentId) {
    try {
      const db = getDatabase();
      const now = Date.now();
      const twoWeeksAgo = new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString();

      // Find skills not used in 14+ days
      const staleSkills = db.prepare(`
        SELECT s.id, s.xp, s.current_level, s.skill_id, s.last_used_at,
               c.xp_per_level, c.name
        FROM agentic_agent_skills s
        JOIN agentic_skills_catalog c ON s.skill_id = c.id
        WHERE s.agentic_id = ? AND s.last_used_at < ?
      `).all(agentId, twoWeeksAgo);

      for (const skill of staleSkills) {
        if (!skill.last_used_at || skill.xp <= 0) continue;

        // Calculate weeks of inactivity beyond 14 days
        const lastUsed = new Date(skill.last_used_at).getTime();
        const inactiveMs = now - lastUsed;
        const inactiveWeeks = Math.floor(inactiveMs / (7 * 24 * 60 * 60 * 1000));
        const decayWeeks = Math.max(0, inactiveWeeks - 2); // Subtract 2-week grace

        if (decayWeeks <= 0) continue;

        // 5% per week, max 50% total decay
        const decayPercent = Math.min(decayWeeks * 5, 50);
        const originalXp = skill.xp;
        const xpLoss = Math.floor(originalXp * (decayPercent / 100));

        if (xpLoss <= 0) continue;

        const newXp = Math.max(0, originalXp - xpLoss);

        db.prepare(`
          UPDATE agentic_agent_skills SET xp = ?, updated_at = ? WHERE id = ?
        `).run(newXp, new Date().toISOString(), skill.id);

        logger.info(`[Reflection] Skill decay: ${skill.name} for agent ${agentId} — XP ${originalXp} → ${newXp} (${decayPercent}% decay, ${decayWeeks} weeks inactive)`);

        // Check if level should decrease
        const xpThresholds = JSON.parse(skill.xp_per_level || '[100, 300, 600, 1000]');
        if (skill.current_level > 1) {
          // Check if XP is below threshold for current level
          const prevThreshold = xpThresholds[skill.current_level - 2] || 0; // threshold for level below current
          if (newXp < prevThreshold) {
            const newLevel = Math.max(1, skill.current_level - 1);
            db.prepare(`
              UPDATE agentic_agent_skills SET current_level = ?, updated_at = ? WHERE id = ?
            `).run(newLevel, new Date().toISOString(), skill.id);

            // Record level decrease in history
            try {
              db.prepare(`
                INSERT INTO agentic_skill_history (id, agentic_id, skill_id, event_type, details, created_at)
                VALUES (?, ?, ?, 'downgraded', ?, ?)
              `).run(
                crypto.randomUUID(),
                agentId, skill.skill_id,
                JSON.stringify({ from: skill.current_level, to: newLevel, xp: newXp, reason: 'inactivity_decay' }),
                new Date().toISOString()
              );
            } catch (e) { /* history optional */ }

            logger.info(`[Reflection] Skill downgraded: ${skill.name} ${skill.current_level} → ${newLevel} for agent ${agentId}`);
          }
        }
      }
    } catch (err) {
      logger.debug(`[Reflection] Skill decay error (non-critical): ${err.message}`);
    }
  }

  // ==========================================
  // PRIVATE ANALYSIS METHODS
  // ==========================================

  /**
   * Phase 7: Quality gate — decide if this execution deserves memory creation.
   * Always learn from: failures, recovery events.
   * Skip trivial executions: <3 actions OR <2 iterations (unless there are failures).
   * Learn from diverse chains: 4+ actions AND 2+ unique tools.
   */
  _shouldCreateMemories(execution) {
    const { actions, iterations } = execution;
    if (!actions || actions.length === 0) return false;

    // Always learn from failures
    const hasFailures = actions.some(a => a.status === 'failed');
    if (hasFailures) return true;

    // Always learn from recovery events
    const hasRecovery = actions.some(a => a.recoveryApplied);
    if (hasRecovery) return true;

    // Skip trivial: <3 actions or <2 iterations
    if (actions.length < 3 || iterations < 2) return false;

    // Learn from diverse tool chains: 4+ actions and 2+ unique tools
    const uniqueTools = new Set(actions.map(a => a.tool).filter(Boolean));
    if (actions.length >= 4 && uniqueTools.size >= 2) return true;

    // Default: skip to avoid memory bloat
    return false;
  }

  _analyzeToolUsage(actions, insights) {
    const toolUsage = {};

    for (const action of actions) {
      const tool = action.tool;
      if (!tool) continue;
      if (!toolUsage[tool]) {
        toolUsage[tool] = { success: 0, failed: 0 };
      }
      if (action.status === 'executed') {
        toolUsage[tool].success++;
      } else if (action.status === 'failed') {
        toolUsage[tool].failed++;
      }
    }

    // Generate skill XP updates for successful tools
    for (const [tool, stats] of Object.entries(toolUsage)) {
      if (stats.success >= 1) {
        const category = TOOL_TO_SKILL_CATEGORY[tool];
        if (category) {
          insights.skillUpdates.push({
            category,
            tool,
            xpGain: stats.success * 5, // 5 XP per successful use
          });
        }
      }
    }
  }

  _analyzeFailures(actions, trigger, insights) {
    const failures = actions.filter(a => a.status === 'failed');
    if (failures.length === 0) return;

    const failedTools = [...new Set(failures.map(f => f.tool).filter(Boolean))];
    const triggerName = trigger || 'unknown';

    insights.learnings.push({
      type: 'learning',
      content: `When handling "${triggerName}" tasks, tools [${failedTools.join(', ')}] failed. Consider using alternative approaches or checking prerequisites first.`,
      importance: Math.min(0.9, 0.5 + (failures.length * 0.1)),
      tags: ['failure_pattern', triggerName, ...failedTools],
    });

    // Also save as memory for future reference
    insights.memoriesToSave.push({
      type: 'learning',
      content: `Tool failures during "${triggerName}": [${failedTools.join(', ')}] failed. ${failures.length} total failures.`,
      importance: Math.min(0.9, 0.5 + (failures.length * 0.1)),
      tags: ['failure_pattern', triggerName],
    });
  }

  _analyzeEfficiency(actions, iterations, tokensUsed, insights, shouldCreateMemories = true) {
    const executedActions = actions.filter(a => a.status === 'executed');

    // High iteration count with few successes = inefficient (always learn)
    if (iterations > 5 && executedActions.length < 3) {
      insights.learnings.push({
        type: 'learning',
        content: `Task required ${iterations} iterations but only ${executedActions.length} successful actions. Future similar tasks should consider planning first or decomposing into subtasks.`,
        importance: 0.7,
        tags: ['efficiency', 'optimization'],
      });
    }

    // Track successful tool chains for reuse (3+ executed tools) — only if quality gate passes
    if (shouldCreateMemories && executedActions.length >= 3) {
      const toolChain = executedActions.map(a => a.tool).join(' → ');
      insights.memoriesToSave.push({
        type: 'decision',
        content: `Successful tool chain: ${toolChain}`,
        importance: 0.6,
        tags: ['tool_chain', 'pattern'],
      });
    }
  }

  _extractTaskPattern(trigger, triggerContext, actions, insights) {
    const executedTools = actions
      .filter(a => a.status === 'executed')
      .map(a => a.tool)
      .filter(Boolean);

    if (executedTools.length === 0) return;

    const approach = executedTools.join(', ');
    const eventType = triggerContext?.event || 'manual';
    const triggerName = trigger || 'unknown';

    insights.memoriesToSave.push({
      type: 'decision',
      content: `For "${triggerName}" (${eventType}): used approach [${approach}]`,
      importance: 0.5,
      tags: ['task_pattern', triggerName],
    });
  }
}

// Singleton
let _instance = null;

function getReflectionService() {
  if (!_instance) {
    _instance = new ReflectionService();
    logger.info('[ReflectionService] Initialized');
  }
  return _instance;
}

module.exports = {
  ReflectionService,
  getReflectionService,
  TOOL_TO_SKILL_CATEGORY,
};
