/**
 * TaskDecomposer — Phase 3: Intelligent Task Decomposition
 * =========================================================
 * Detects complex tasks and decomposes them into structured plans with dependencies.
 *
 * Runs BEFORE the reasoning loop for complex/critical tasks.
 * Uses AI to generate a structured decomposition plan.
 * Returns a DAG of subtasks with dependencies and parallel groups.
 *
 * Usage:
 *   const { getTaskDecomposer } = require('./TaskDecomposer.cjs');
 *   const decomposer = getTaskDecomposer();
 *   if (decomposer.shouldDecompose(task, tier)) { ... }
 */

const { logger } = require('../logger.cjs');

class TaskDecomposer {
  constructor() {
    // Complexity indicators that suggest decomposition
    this.decompositionTriggers = {
      multiEntity: /\b(and|also|plus|then|after that|additionally)\b/i,
      multiStep: /\b(first|second|then|next|finally|step \d+)\b/i,
      research: /\b(research|analyze|compare|evaluate|investigate)\b/i,
      multiPlatform: /\b(whatsapp|email|telegram|sms)\b.*\b(whatsapp|email|telegram|sms)\b/i,
      conditional: /\b(if|unless|depending on|based on)\b/i,
      aggregation: /\b(all|every|each|summarize|report on|overview)\b/i,
    };
  }

  /**
   * Determine if a task should be auto-decomposed.
   *
   * @param {string} task - The task description/message
   * @param {string} tier - Task complexity tier
   * @param {Object} agentProfile - Agent profile (optional)
   * @returns {boolean}
   */
  shouldDecompose(task, tier, agentProfile = null) {
    if (!task || typeof task !== 'string') return false;

    // Always decompose critical tasks
    if (tier === 'critical') return true;

    // For complex tasks, check for decomposition triggers
    if (tier === 'complex') {
      const triggerCount = Object.values(this.decompositionTriggers)
        .filter(pattern => pattern.test(task)).length;
      return triggerCount >= 2;
    }

    // For moderate tasks, only if explicitly multi-step AND multi-entity
    if (tier === 'moderate') {
      return this.decompositionTriggers.multiStep.test(task) &&
             this.decompositionTriggers.multiEntity.test(task);
    }

    return false;
  }

  /**
   * Decompose a task into a structured plan with dependencies.
   *
   * @param {string} task - Task description
   * @param {Object} agentContext - { availableTools, skills }
   * @param {Function} aiCallFn - async (messages) => { content }
   * @returns {Object|null} - Parsed plan or null if decomposition fails
   */
  async decompose(task, agentContext, aiCallFn) {
    const prompt = this._buildDecompositionPrompt(task, agentContext);

    try {
      const result = await aiCallFn([
        { role: 'system', content: prompt },
        { role: 'user', content: `Decompose this task into subtasks:\n\n${task}` },
      ]);

      const content = result?.content || result;
      if (!content) return null;

      const plan = this._parsePlan(typeof content === 'string' ? content : JSON.stringify(content));
      if (plan) {
        logger.info(`[TaskDecomposer] Plan generated: ${plan.steps.length} steps, ${plan.parallelGroups.length} parallel groups`);
      }
      return plan;
    } catch (err) {
      logger.warn(`[TaskDecomposer] Decomposition failed: ${err.message}`);
      return null;
    }
  }

  // ==========================================
  // PRIVATE METHODS
  // ==========================================

  _buildDecompositionPrompt(task, context) {
    const tools = context.availableTools?.map(t => typeof t === 'string' ? t : t.id).join(', ') || 'various tools';
    const skills = context.skills?.map(s => `${s.name} (${s.category})`).join(', ') || 'general';

    return `You are a task decomposition specialist. Analyze the given task and break it into smaller, independent subtasks.

AVAILABLE TOOLS: ${tools}
AGENT SKILLS: ${skills}

Respond with ONLY a JSON plan (no markdown fences, no extra text):
{
  "goal": "Overall task goal",
  "estimatedComplexity": "moderate|complex|critical",
  "steps": [
    {
      "id": "step_1",
      "title": "Brief step title",
      "description": "Detailed instructions for this step",
      "requiredTools": ["tool1", "tool2"],
      "requiredSkills": ["category"],
      "dependsOn": [],
      "estimatedIterations": 3,
      "canParallelize": true
    },
    {
      "id": "step_2",
      "title": "Step that depends on step 1",
      "description": "...",
      "requiredTools": ["tool3"],
      "requiredSkills": [],
      "dependsOn": ["step_1"],
      "estimatedIterations": 2,
      "canParallelize": false
    }
  ],
  "synthesisStep": {
    "description": "How to combine all step results into final answer"
  }
}

RULES:
- Each step should be completable in 3-5 tool calls
- Steps with no dependencies can run in parallel
- Include a synthesis step to combine results
- If any step might fail, note alternatives in the description
- Maximum 6 steps per plan
- Use only tools from the AVAILABLE TOOLS list`;
  }

  _parsePlan(content) {
    try {
      // Extract JSON from response (handle markdown fences)
      let jsonStr = content;
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
      } else {
        // Try to find raw JSON object
        const rawMatch = content.match(/\{[\s\S]*\}/);
        if (rawMatch) {
          jsonStr = rawMatch[0];
        }
      }

      const plan = JSON.parse(jsonStr);

      // Validate plan structure
      if (!plan.steps || !Array.isArray(plan.steps) || plan.steps.length === 0) {
        logger.debug('[TaskDecomposer] Invalid plan: no steps array');
        return null;
      }

      // Ensure each step has required fields
      for (const step of plan.steps) {
        if (!step.id) step.id = `step_${plan.steps.indexOf(step) + 1}`;
        if (!step.title) step.title = step.description?.substring(0, 50) || `Step ${step.id}`;
        if (!step.dependsOn) step.dependsOn = [];
        if (!step.estimatedIterations) step.estimatedIterations = 3;
        if (!step.requiredTools) step.requiredTools = [];
        if (!step.requiredSkills) step.requiredSkills = [];
      }

      // Build dependency graph and execution order
      plan.dependencyGraph = this._buildDependencyGraph(plan.steps);
      plan.executionOrder = this._topologicalSort(plan.steps, plan.dependencyGraph);
      plan.parallelGroups = this._identifyParallelGroups(plan.executionOrder, plan.steps);

      return plan;
    } catch (e) {
      logger.debug(`[TaskDecomposer] Plan parsing failed: ${e.message}`);
      return null;
    }
  }

  _buildDependencyGraph(steps) {
    const graph = {};
    for (const step of steps) {
      graph[step.id] = step.dependsOn || [];
    }
    return graph;
  }

  _topologicalSort(steps, graph) {
    const visited = new Set();
    const order = [];

    const visit = (id) => {
      if (visited.has(id)) return;
      visited.add(id);
      for (const dep of (graph[id] || [])) {
        visit(dep);
      }
      order.push(id);
    };

    for (const step of steps) {
      visit(step.id);
    }

    return order;
  }

  _identifyParallelGroups(executionOrder, steps) {
    const groups = [];
    const completed = new Set();

    let safetyCounter = 0;
    const maxLoops = steps.length + 1;

    while (completed.size < steps.length && safetyCounter < maxLoops) {
      safetyCounter++;

      // Find all steps whose dependencies are satisfied
      const ready = steps.filter(s =>
        !completed.has(s.id) &&
        (s.dependsOn || []).every(dep => completed.has(dep))
      );

      if (ready.length === 0) break;

      groups.push(ready.map(s => s.id));
      ready.forEach(s => completed.add(s.id));
    }

    return groups;
  }
}

// Singleton
let _instance = null;

function getTaskDecomposer() {
  if (!_instance) {
    _instance = new TaskDecomposer();
    logger.info('[TaskDecomposer] Initialized');
  }
  return _instance;
}

module.exports = {
  TaskDecomposer,
  getTaskDecomposer,
};
