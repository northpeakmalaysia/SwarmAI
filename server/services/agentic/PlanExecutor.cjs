/**
 * PlanExecutor — Phase 3: Intelligent Task Decomposition
 * =======================================================
 * Executes decomposed task plans with dependency tracking (DAG-based).
 *
 * Features:
 * - DAG-based execution (parallel where possible)
 * - Step-level retry and recovery
 * - Progress persistence for long-running plans
 *
 * Usage:
 *   const { getPlanExecutor } = require('./PlanExecutor.cjs');
 *   const executor = getPlanExecutor(reasoningLoopInstance);
 *   const result = await executor.execute(plan, agentId, profile, triggerContext, tools);
 */

const { logger } = require('../logger.cjs');
const { getDatabase } = require('../database.cjs');
const crypto = require('crypto');

class PlanExecutor {
  constructor(reasoningLoop) {
    this.reasoningLoop = reasoningLoop;
  }

  /**
   * Execute a decomposed plan.
   *
   * @param {Object} plan - Decomposed plan from TaskDecomposer
   * @param {string} agentId - Agent executing the plan
   * @param {Object} profile - Agent profile
   * @param {Object} triggerContext - Original trigger context
   * @param {Array} tools - Available tools
   * @returns {{ plan, stepResults, actions, tokensUsed, iterations }}
   */
  async execute(plan, agentId, profile, triggerContext, tools) {
    const planId = crypto.randomUUID();
    const stepResults = {};
    const actions = [];
    let totalTokens = 0;
    let totalIterations = 0;

    // Plan deadline: must complete within 3 min (< outer run() 4-min timeout)
    const PLAN_DEADLINE_MS = parseInt(process.env.PLAN_DEADLINE_MS, 10) || 3 * 60 * 1000;
    const deadline = Date.now() + PLAN_DEADLINE_MS;

    // Persist plan to DB
    this._savePlan(planId, agentId, profile.user_id, plan, triggerContext);

    logger.info(`[PlanExecutor] Starting plan ${planId}: ${plan.steps.length} steps, ${plan.parallelGroups.length} groups, deadline=${PLAN_DEADLINE_MS}ms`);

    try {
      // Execute parallel groups in order
      for (let groupIdx = 0; groupIdx < plan.parallelGroups.length; groupIdx++) {
        // Check abort signal from outer run() timeout
        if (triggerContext._abortSignal?.aborted) {
          logger.warn(`[PlanExecutor] Aborted by outer timeout at group ${groupIdx + 1}`);
          break;
        }
        // Check plan deadline
        if (Date.now() > deadline) {
          logger.warn(`[PlanExecutor] Plan deadline exceeded at group ${groupIdx + 1}/${plan.parallelGroups.length}`);
          break;
        }

        const group = plan.parallelGroups[groupIdx];
        const groupSteps = plan.steps.filter(s => group.includes(s.id));

        logger.info(`[PlanExecutor] Group ${groupIdx + 1}/${plan.parallelGroups.length}: [${group.join(', ')}]`);

        if (groupSteps.length === 1) {
          // Single step — execute directly
          const step = groupSteps[0];
          this._updatePlanStep(planId, step.id, 'in_progress');

          const result = await this._executeStep(
            step, agentId, profile, triggerContext, tools, stepResults
          );

          stepResults[step.id] = result;
          actions.push(...(result.actions || []));
          totalTokens += result.tokensUsed || 0;
          totalIterations += result.iterations || 0;

          this._updatePlanStep(planId, step.id, result.status);
        } else {
          // Multiple steps — execute in parallel
          const promises = groupSteps.map(step => {
            this._updatePlanStep(planId, step.id, 'in_progress');
            return this._executeStep(step, agentId, profile, triggerContext, tools, stepResults)
              .then(result => ({ stepId: step.id, result }));
          });

          const results = await Promise.allSettled(promises);

          for (const settled of results) {
            if (settled.status === 'fulfilled') {
              const { stepId, result } = settled.value;
              stepResults[stepId] = result;
              actions.push(...(result.actions || []));
              totalTokens += result.tokensUsed || 0;
              totalIterations += result.iterations || 0;
              this._updatePlanStep(planId, stepId, result.status);
            } else {
              // Step failed — find which step
              const failedStep = groupSteps.find(s =>
                !Object.keys(stepResults).includes(s.id)
              );
              if (failedStep) {
                stepResults[failedStep.id] = {
                  status: 'failed',
                  error: settled.reason?.message || 'Unknown error',
                  actions: [],
                  iterations: 0,
                  tokensUsed: 0,
                };
                this._updatePlanStep(planId, failedStep.id, 'failed');
              }
            }
          }
        }

        // Update plan progress
        const completedCount = Object.values(stepResults).filter(r => r.status === 'completed').length;
        const failedCount = Object.values(stepResults).filter(r => r.status === 'failed').length;
        this._updatePlanProgress(planId, completedCount, failedCount, totalTokens);

        // Phase 7: If any steps in this group failed, try to revise dependent future steps
        const failedStepIds = Object.entries(stepResults)
          .filter(([, r]) => r.status === 'failed')
          .map(([id]) => id);

        if (failedStepIds.length > 0 && groupIdx < plan.parallelGroups.length - 1) {
          try {
            await this._revisePlanOnFailure(plan, failedStepIds, stepResults, agentId, profile);
          } catch (revErr) {
            logger.debug(`[PlanExecutor] Plan revision skipped: ${revErr.message}`);
          }
        }
      }

      // Mark plan completed
      const finalStatus = Object.values(stepResults).some(r => r.status === 'failed') ? 'partial' : 'completed';
      this._completePlan(planId, finalStatus, stepResults);

      logger.info(`[PlanExecutor] Plan ${planId} ${finalStatus}: ${Object.keys(stepResults).length}/${plan.steps.length} steps done`);
    } catch (err) {
      logger.error(`[PlanExecutor] Plan ${planId} failed: ${err.message}`);
      this._completePlan(planId, 'failed', stepResults);
    }

    return {
      plan,
      planId,
      stepResults,
      actions,
      tokensUsed: totalTokens,
      iterations: totalIterations,
    };
  }

  /**
   * Execute a single step by running the reasoning loop with step-specific context.
   * @private
   */
  async _executeStep(step, agentId, profile, triggerContext, tools, priorResults) {
    // Build context from prior step results
    const priorContext = Object.entries(priorResults)
      .map(([id, result]) => `Step "${id}": ${result.summary || result.status}`)
      .join('\n');

    const stepContext = {
      ...triggerContext,
      _maxIterations: Math.max(step.estimatedIterations || 5, 3),
      _maxToolCalls: Math.max((step.estimatedIterations || 5) + 2, 5),
      _stepId: step.id,
      _stepTitle: step.title,
      _priorStepResults: priorContext,
      event: 'plan_step',
      situation: `You are executing step "${step.title}" of a larger plan.\nInstructions: ${step.description}` +
                 (priorContext ? `\n\nPrior step results:\n${priorContext}` : ''),
      preview: step.description,
    };

    try {
      const result = await this.reasoningLoop.run(agentId, 'plan_step', stepContext);
      return {
        status: 'completed',
        ...result,
        summary: result.finalThought?.substring(0, 300),
      };
    } catch (error) {
      logger.warn(`[PlanExecutor] Step "${step.id}" failed: ${error.message}`);
      return {
        status: 'failed',
        error: error.message,
        actions: [],
        iterations: 0,
        tokensUsed: 0,
      };
    }
  }

  // ==========================================
  // PHASE 7: Plan Revision on Failure
  // ==========================================

  /**
   * When a step fails, revise dependent steps to work around the failure.
   * Uses the AI to suggest alternative approaches for dependent steps.
   */
  async _revisePlanOnFailure(plan, failedStepIds, stepResults, agentId, profile) {
    // Find steps that depend on failed steps and haven't been executed yet
    const executedIds = new Set(Object.keys(stepResults));
    const dependentSteps = plan.steps.filter(s => {
      if (executedIds.has(s.id)) return false;
      const deps = plan.dependencyGraph?.[s.id] || s.dependsOn || [];
      return deps.some(d => failedStepIds.includes(d));
    });

    if (dependentSteps.length === 0) return;

    logger.info(`[PlanExecutor] Revising ${dependentSteps.length} steps that depend on failed: [${failedStepIds.join(', ')}]`);

    // Build failure context
    const failureContext = failedStepIds.map(id => {
      const step = plan.steps.find(s => s.id === id);
      const result = stepResults[id];
      return `Step "${step?.title || id}" failed: ${result?.error || 'unknown error'}`;
    }).join('\n');

    // Ask AI to revise the dependent steps
    try {
      const { getSuperBrainRouter } = require('../ai/SuperBrainRouter.cjs');
      const superBrain = getSuperBrainRouter();

      const revisionPrompt = `A task plan has partially failed. Revise the dependent steps to work around the failures.

FAILED STEPS:
${failureContext}

STEPS TO REVISE:
${dependentSteps.map(s => `- Step "${s.id}": ${s.title} — ${s.description}`).join('\n')}

Return ONLY a JSON array of revised steps with format:
[{"id": "step_id", "title": "revised title", "description": "revised description"}]

Keep step IDs the same. Adjust descriptions to account for the failure. If a step is no longer possible, set description to "SKIP: [reason]".`;

      const aiResult = await superBrain.process({
        task: revisionPrompt,
        messages: [{ role: 'user', content: revisionPrompt }],
        userId: profile.user_id,
        forceTier: 'simple',
      });

      if (aiResult?.result) {
        const jsonMatch = aiResult.result.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const revised = JSON.parse(jsonMatch[0]);
          for (const rev of revised) {
            const stepIdx = plan.steps.findIndex(s => s.id === rev.id);
            if (stepIdx !== -1) {
              plan.steps[stepIdx].title = rev.title || plan.steps[stepIdx].title;
              plan.steps[stepIdx].description = rev.description || plan.steps[stepIdx].description;
              logger.info(`[PlanExecutor] Revised step "${rev.id}": ${rev.title}`);
            }
          }
        }
      }
    } catch (aiErr) {
      logger.debug(`[PlanExecutor] AI revision failed: ${aiErr.message}`);
    }
  }

  // ==========================================
  // DB PERSISTENCE
  // ==========================================

  _savePlan(planId, agentId, userId, plan, triggerContext) {
    try {
      const db = getDatabase();
      db.prepare(`
        INSERT INTO agentic_plans (id, agentic_id, user_id, goal, steps, dependency_graph,
                                   parallel_groups, status, total_steps, trigger, trigger_context,
                                   created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'in_progress', ?, ?, ?, ?, ?)
      `).run(
        planId, agentId, userId,
        plan.goal || 'Task decomposition',
        JSON.stringify(plan.steps),
        JSON.stringify(plan.dependencyGraph),
        JSON.stringify(plan.parallelGroups),
        plan.steps.length,
        triggerContext?.event || 'manual',
        JSON.stringify(triggerContext || {}),
        new Date().toISOString(),
        new Date().toISOString()
      );
    } catch (e) {
      logger.debug(`[PlanExecutor] Failed to save plan: ${e.message}`);
    }
  }

  _updatePlanStep(planId, stepId, status) {
    try {
      const db = getDatabase();
      db.prepare(`
        UPDATE agentic_plans SET current_step = ?, updated_at = ? WHERE id = ?
      `).run(stepId, new Date().toISOString(), planId);
    } catch (e) { /* non-critical */ }
  }

  _updatePlanProgress(planId, completed, failed, tokens) {
    try {
      const db = getDatabase();
      db.prepare(`
        UPDATE agentic_plans
        SET completed_steps = ?, failed_steps = ?, tokens_used = ?, updated_at = ?
        WHERE id = ?
      `).run(completed, failed, tokens, new Date().toISOString(), planId);
    } catch (e) { /* non-critical */ }
  }

  _completePlan(planId, status, stepResults) {
    try {
      const db = getDatabase();
      db.prepare(`
        UPDATE agentic_plans
        SET status = ?, step_results = ?, completed_at = ?, updated_at = ?
        WHERE id = ?
      `).run(status, JSON.stringify(stepResults), new Date().toISOString(), new Date().toISOString(), planId);
    } catch (e) { /* non-critical */ }
  }
}

// Factory (not singleton — needs reasoning loop reference)
function getPlanExecutor(reasoningLoop) {
  return new PlanExecutor(reasoningLoop);
}

module.exports = {
  PlanExecutor,
  getPlanExecutor,
};
