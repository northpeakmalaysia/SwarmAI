/**
 * Orchestrator Engine
 * ===================
 * Enables the Manager-Specialist pattern for Agentic AI.
 *
 * When a Main AI (Manager) encounters a complex task, it can call the
 * "orchestrate" tool to decompose the task into subtasks. This engine:
 *   1. Finds or auto-creates specialist sub-agents for each subtask
 *   2. Runs their reasoning loops in parallel (or sequentially)
 *   3. Collects and aggregates results
 *   4. Returns the aggregated results to the Manager for final synthesis
 *
 * Inspired by the Roo Code orchestrator pattern:
 *   - Each subtask gets clear scope, context, and completion instructions
 *   - Sub-agents only do their assigned work and signal completion
 *   - Manager synthesizes all results into a final response
 *
 * Recursion prevention (3-layer defense):
 *   1. Depth counter: _orchestrationDepth in triggerContext
 *   2. Tool filtering: sub-agents don't see orchestrate/createSpecialist tools
 *   3. Agent type guard: auto-created specialists have canCreateChildren=false
 */

const { logger } = require('../logger.cjs');
const { getDatabase } = require('../database.cjs');
const crypto = require('crypto');

class OrchestratorEngine {
  constructor() {
    this.MAX_PARALLEL_AGENTS = 5;
    this.SUB_AGENT_TIMEOUT_MS = 120000; // 2 minutes per sub-agent
    this.SUB_AGENT_MAX_ITERATIONS = 3;
    this.SUB_AGENT_MAX_TOOL_CALLS = 3;
  }

  /**
   * Main orchestration entry point.
   * Called by the "orchestrate" tool executor.
   *
   * @param {Object} params - { goal, subtasks: [{title, description, requiredSkills}], mode }
   * @param {Object} context - { agenticId, userId, _orchestrationDepth }
   * @returns {Object} Aggregated results from all sub-agents
   */
  async orchestrate(params, context) {
    const depth = context._orchestrationDepth || 0;

    // Layer 1: Recursion guard
    if (depth >= 1) {
      logger.warn(`[Orchestrator] Blocked: sub-agent at depth ${depth} tried to orchestrate`);
      return {
        success: false,
        error: 'Sub-agents cannot orchestrate further. Use your own tools to complete the task.',
      };
    }

    const { goal, subtasks, mode = 'parallel' } = params;

    if (!goal || typeof goal !== 'string') {
      return { success: false, error: 'Missing or invalid "goal" parameter' };
    }

    if (!subtasks || !Array.isArray(subtasks) || subtasks.length === 0) {
      return { success: false, error: 'Missing or empty "subtasks" array' };
    }

    if (subtasks.length > this.MAX_PARALLEL_AGENTS) {
      return {
        success: false,
        error: `Maximum ${this.MAX_PARALLEL_AGENTS} subtasks allowed. Got ${subtasks.length}.`,
      };
    }

    // Verify parent agent can create children
    const db = getDatabase();
    const parentProfile = db.prepare(
      'SELECT id, can_create_children, max_children FROM agentic_profiles WHERE id = ? AND user_id = ?'
    ).get(context.agenticId, context.userId);

    if (!parentProfile) {
      return { success: false, error: 'Parent agentic profile not found' };
    }

    if (!parentProfile.can_create_children) {
      return {
        success: false,
        error: 'This agent does not have permission to create sub-agents. Enable "can_create_children" in agent settings.',
      };
    }

    const orchestrationId = crypto.randomUUID();
    logger.info(`[Orchestrator] Starting orchestration ${orchestrationId}: "${goal}" with ${subtasks.length} subtasks (${mode})`);

    // Resolve agents for each subtask
    const assignments = [];
    for (const subtask of subtasks) {
      try {
        const agent = await this.findOrCreateAgent(subtask, context);
        assignments.push({ subtask, agent });
        logger.info(`[Orchestrator] Subtask "${subtask.title}" -> agent "${agent.name}" (${agent.id})`);
      } catch (err) {
        logger.error(`[Orchestrator] Failed to resolve agent for subtask "${subtask.title}": ${err.message}`);
        assignments.push({ subtask, agent: null, error: err.message });
      }
    }

    // Execute subtasks
    let results;
    if (mode === 'sequential') {
      results = await this.executeSequential(assignments, goal, context);
    } else {
      results = await this.executeParallel(assignments, goal, context);
    }

    // Log orchestration
    this.logOrchestration(context, orchestrationId, goal, assignments, results);

    // Format aggregated results
    const aggregated = {
      success: true,
      orchestrationId,
      goal,
      mode,
      subtaskCount: subtasks.length,
      completedCount: results.filter(r => r.status === 'completed').length,
      failedCount: results.filter(r => r.status !== 'completed').length,
      results: results.map(r => ({
        subtask: r.subtask.title,
        agentName: r.agent?.name || 'unassigned',
        agentId: r.agent?.id || null,
        status: r.status,
        findings: r.finalThought || r.error || 'No output',
        iterations: r.iterations || 0,
        tokensUsed: r.tokensUsed || 0,
      })),
    };

    logger.info(`[Orchestrator] Completed ${orchestrationId}: ${aggregated.completedCount}/${aggregated.subtaskCount} subtasks succeeded`);

    return aggregated;
  }

  /**
   * Find an existing sub-agent that matches the subtask, or create a specialist.
   */
  async findOrCreateAgent(subtask, context) {
    const db = getDatabase();
    const parentId = context.agenticId;
    const userId = context.userId;

    // Find existing sub-agents under this parent
    const subAgents = db.prepare(`
      SELECT id, name, role, description, status
      FROM agentic_profiles
      WHERE parent_agentic_id = ? AND user_id = ? AND status != 'deleted'
    `).all(parentId, userId);

    // Score them against the subtask
    if (subAgents.length > 0) {
      const scored = this.scoreAgentsForTask(subAgents, subtask);
      if (scored.length > 0 && scored[0].score > 20) {
        logger.info(`[Orchestrator] Reusing existing sub-agent "${scored[0].agent.name}" (score: ${scored[0].score})`);
        return scored[0].agent;
      }
    }

    // Check max_children limit
    const parentProfile = db.prepare(
      'SELECT max_children FROM agentic_profiles WHERE id = ?'
    ).get(parentId);

    const existingCount = db.prepare(
      'SELECT COUNT(*) as cnt FROM agentic_profiles WHERE parent_agentic_id = ? AND status != \'deleted\''
    ).get(parentId);

    if (existingCount.cnt >= (parentProfile?.max_children || 5)) {
      // Can't create more - use least-scored existing agent if any
      if (subAgents.length > 0) {
        logger.warn(`[Orchestrator] Max children reached, reusing first available sub-agent`);
        return subAgents[0];
      }
      throw new Error(`Maximum sub-agent limit (${parentProfile?.max_children || 5}) reached`);
    }

    // Auto-create specialist
    const specialistName = this.generateSpecialistName(subtask);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    // Get parent's hierarchy info for proper path
    const parent = db.prepare('SELECT hierarchy_level, hierarchy_path, children_autonomy_cap FROM agentic_profiles WHERE id = ?').get(parentId);

    db.prepare(`
      INSERT INTO agentic_profiles (
        id, user_id, name, role, description,
        agent_type, parent_agentic_id, hierarchy_level, hierarchy_path,
        created_by_type, created_by_agentic_id, creation_reason,
        inherit_team, inherit_knowledge, inherit_monitoring, inherit_routing,
        ai_provider, temperature, max_tokens,
        autonomy_level, can_create_children,
        status, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?,
        'sub', ?, ?, ?,
        'agentic', ?, ?,
        1, 1, 0, 1,
        'task-routing', 0.7, 2000,
        ?, 0,
        'active', ?, ?
      )
    `).run(
      id, userId, specialistName,
      subtask.title,
      `Auto-created specialist for: ${subtask.description || subtask.title}`,
      parentId,
      (parent?.hierarchy_level || 0) + 1,
      `${parent?.hierarchy_path || ''}/${id}`,
      parentId,
      `Orchestrator: ${subtask.title}`,
      parent?.children_autonomy_cap || 'semi-autonomous',
      now, now
    );

    logger.info(`[Orchestrator] Created specialist "${specialistName}" (${id}) for subtask "${subtask.title}"`);

    return { id, name: specialistName, role: subtask.title, description: subtask.description || subtask.title };
  }

  /**
   * Execute all assignments in parallel with per-agent timeout.
   */
  async executeParallel(assignments, goal, context) {
    const promises = assignments.map(({ subtask, agent, error }) => {
      if (!agent) {
        return Promise.resolve({
          subtask, agent: null, status: 'failed',
          error: error || 'No agent assigned', iterations: 0, tokensUsed: 0,
        });
      }

      return this.runSubAgent(agent, subtask, goal, context)
        .then(result => ({
          subtask, agent, status: 'completed',
          finalThought: result.finalThought,
          iterations: result.iterations,
          tokensUsed: result.tokensUsed,
        }))
        .catch(err => ({
          subtask, agent,
          status: err.message === 'TIMEOUT' ? 'timeout' : 'failed',
          error: err.message, iterations: 0, tokensUsed: 0,
        }));
    });

    return Promise.all(promises);
  }

  /**
   * Execute assignments sequentially, passing prior results as context.
   */
  async executeSequential(assignments, goal, context) {
    const results = [];
    let priorFindings = '';

    for (const { subtask, agent, error } of assignments) {
      if (!agent) {
        results.push({
          subtask, agent: null, status: 'failed',
          error: error || 'No agent assigned', iterations: 0, tokensUsed: 0,
        });
        continue;
      }

      try {
        const result = await this.runSubAgent(agent, subtask, goal, context, priorFindings);
        results.push({
          subtask, agent, status: 'completed',
          finalThought: result.finalThought,
          iterations: result.iterations,
          tokensUsed: result.tokensUsed,
        });
        // Accumulate findings for next agent
        if (result.finalThought) {
          priorFindings += `\n[${subtask.title}]: ${result.finalThought}`;
        }
      } catch (err) {
        results.push({
          subtask, agent,
          status: err.message === 'TIMEOUT' ? 'timeout' : 'failed',
          error: err.message, iterations: 0, tokensUsed: 0,
        });
      }
    }

    return results;
  }

  /**
   * Run a single sub-agent's reasoning loop with timeout.
   */
  async runSubAgent(agent, subtask, goal, context, priorFindings = '') {
    const { getAgentReasoningLoop } = require('./AgentReasoningLoop.cjs');
    const loop = getAgentReasoningLoop();

    const situation = [
      'You have been assigned a subtask as part of a larger goal.',
      '',
      `Overall goal: ${goal}`,
      `Your specific task: ${subtask.title}`,
      subtask.description ? `Details: ${subtask.description}` : '',
      '',
      'RULES:',
      '- Only perform the work outlined above. Do not deviate.',
      '- Use your available tools (searchWeb, ragQuery, listTeamMembers, etc.) to gather information.',
      '- When done, use the "done" tool with a concise summary of your findings.',
      '- Do NOT use "respond" - your results go back to the manager, not the user.',
      '- Be thorough but concise in your findings.',
    ].filter(Boolean).join('\n');

    const fullSituation = priorFindings
      ? `${situation}\n\nPrior findings from other specialists:\n${priorFindings}`
      : situation;

    const promise = loop.run(agent.id, 'event', {
      event: 'orchestrated_task',
      situation: fullSituation,
      preview: subtask.title,
      _orchestrationDepth: (context._orchestrationDepth || 0) + 1,
      _maxIterations: this.SUB_AGENT_MAX_ITERATIONS,
      _maxToolCalls: this.SUB_AGENT_MAX_TOOL_CALLS,
    });

    return this.withTimeout(promise, this.SUB_AGENT_TIMEOUT_MS);
  }

  /**
   * Timeout wrapper for promises.
   */
  withTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('TIMEOUT')), ms)
      ),
    ]);
  }

  /**
   * Score agents against a subtask using keyword matching + skill levels (Phase 5).
   */
  scoreAgentsForTask(agents, subtask) {
    const taskText = `${subtask.title} ${subtask.description || ''}`.toLowerCase();
    const taskWords = taskText.split(/\s+/).filter(w => w.length > 2);
    const reqSkills = (subtask.requiredSkills || '')
      .toLowerCase()
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    return agents
      .map(agent => {
        let score = 0;
        const role = (agent.role || '').toLowerCase();
        const desc = (agent.description || '').toLowerCase();
        const name = (agent.name || '').toLowerCase();

        // Skill matching (highest weight)
        for (const skill of reqSkills) {
          if (role.includes(skill)) score += 15;
          if (desc.includes(skill)) score += 10;
          if (name.includes(skill)) score += 5;
        }

        // Task word matching
        for (const word of taskWords) {
          if (role.includes(word)) score += 5;
          if (desc.includes(word)) score += 3;
          if (name.includes(word)) score += 2;
        }

        // Phase 5: Skill-level scoring from actual skill data
        // Agents with higher skill levels in relevant categories score higher
        if (agent.skills && Array.isArray(agent.skills)) {
          const skillCategories = ['communication', 'analysis', 'automation', 'integration', 'management'];
          const levelScores = { 1: 10, 2: 25, 3: 50, 4: 100 };

          for (const agentSkill of agent.skills) {
            const cat = (agentSkill.category || '').toLowerCase();
            // Check if task mentions this skill category
            if (reqSkills.includes(cat) || taskText.includes(cat)) {
              score += levelScores[agentSkill.current_level] || 10;
            }
          }
        } else if (agent.id) {
          // Load skills from DB if not pre-loaded
          try {
            const { getDatabase } = require('../database.cjs');
            const db = getDatabase();
            const agentSkills = db.prepare(`
              SELECT c.category, s.current_level FROM agentic_agent_skills s
              JOIN agentic_skills_catalog c ON s.skill_id = c.id
              WHERE s.agentic_id = ?
            `).all(agent.id);

            const levelScores = { 1: 10, 2: 25, 3: 50, 4: 100 };
            for (const sk of agentSkills) {
              if (reqSkills.includes(sk.category) || taskText.includes(sk.category)) {
                score += levelScores[sk.current_level] || 10;
              }
            }
          } catch (e) { /* skills lookup optional */ }
        }

        return { agent, score };
      })
      .sort((a, b) => b.score - a.score);
  }

  /**
   * Generate a readable specialist name from the subtask.
   */
  generateSpecialistName(subtask) {
    const words = subtask.title
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2)
      .slice(0, 3)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
    return `${words.join(' ')} Specialist`;
  }

  /**
   * Log orchestration activity.
   */
  logOrchestration(context, orchestrationId, goal, assignments, results) {
    try {
      const db = getDatabase();
      const id = crypto.randomUUID();
      db.prepare(`
        INSERT INTO agentic_activity_log (
          id, agentic_id, user_id, activity_type, activity_description,
          trigger_type, status, metadata, created_at
        ) VALUES (?, ?, ?, 'orchestration', ?, 'orchestrate', 'success', ?, datetime('now'))
      `).run(
        id,
        context.agenticId,
        context.userId,
        `Orchestrated "${goal}" with ${assignments.length} subtasks`,
        JSON.stringify({
          orchestrationId,
          goal,
          subtasks: assignments.map(a => ({
            title: a.subtask.title,
            agentName: a.agent?.name,
            agentId: a.agent?.id,
          })),
          results: results.map(r => ({
            subtask: r.subtask.title,
            status: r.status,
            iterations: r.iterations,
            tokensUsed: r.tokensUsed,
          })),
        })
      );
    } catch (e) {
      logger.debug(`[Orchestrator] Activity log write failed: ${e.message}`);
    }
  }
}

// Singleton
let _instance = null;

function getOrchestratorEngine() {
  if (!_instance) {
    _instance = new OrchestratorEngine();
    logger.info('[Orchestrator] OrchestratorEngine initialized');
  }
  return _instance;
}

module.exports = {
  OrchestratorEngine,
  getOrchestratorEngine,
};
