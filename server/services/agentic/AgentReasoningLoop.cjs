/**
 * Agent Reasoning Loop
 * ====================
 * Core autonomous reasoning engine for Agentic AI.
 *
 * Instead of hardcoded behaviors (setInterval, fixed notifications),
 * agents reason autonomously: load identity → discover tools → ask AI
 * "what should I do?" → parse tool calls → execute → observe → repeat.
 *
 * Hybrid tool calling: uses native function_calling API for capable providers
 * (OpenRouter models with tool support), falls back to structured prompting
 * for all others (Ollama, CLI). Works with ALL providers via SuperBrainRouter.
 *
 * Usage:
 *   const { getAgentReasoningLoop } = require('./AgentReasoningLoop.cjs');
 *   const loop = getAgentReasoningLoop();
 *   const result = await loop.run(agentId, 'wake_up', { situation: '...' });
 */

const { logger } = require('../logger.cjs');
const { getDatabase } = require('../database.cjs');
const crypto = require('crypto');
const { convertToolsToOpenAI } = require('../ai/ToolSchemaConverter.cjs');

// =====================================================
// CONTEXT BUDGET (Conversation Message Truncation Only)
// =====================================================
// NOTE: System prompt is NO LONGER truncated. The AI provider's own context window
// is the natural limit. Artificially truncating the system prompt was causing agents
// to lose critical context (tools, personality, goals, team info) and perform poorly.
// Only conversation messages are truncated to prevent runaway reasoning loops.
const DEFAULT_CONTEXT_BUDGET = {
  maxConversationMessages: 30,     // Max messages in reasoning loop
  headMessages: 3,                 // Keep first N messages (system + initial user)
  tailMessages: 5,                 // Keep last N messages (most recent context)
};

// =====================================================
// SAFE TOOL CATEGORIES (auto-execute for semi-autonomous)
// =====================================================
const SAFE_TOOLS = new Set([
  // Analysis & AI (read-only, no external side effects)
  'aiChat', 'aiClassify', 'aiExtract', 'aiSummarize', 'aiTranslate',
  'searchWeb', 'ragQuery', 'respond', 'clarify', 'done', 'silent', 'heartbeat_ok',
  // Orchestration (internal, creates sub-agents and runs them)
  'orchestrate', 'createSpecialist',
  // Self-awareness (read-only)
  'checkAgentStatuses', 'checkGoalProgress', 'getMyProfile',
  'listMySkills', 'listRecentMemories', 'searchMemory',
  'listMySchedules', 'listMyTasks', 'listTeamMembers', 'searchTeamMembers',
  // Platform data (read-only, no external side effects)
  'searchContacts', 'getContactDetails', 'getConversations', 'getMessages', 'searchMessages',
  // Memory & reflection (internal, no external impact)
  'saveMemory', 'selfReflect',
  // Internal management (no external side effects)
  'createSchedule', 'updateSchedule', 'deleteSchedule',
  'createTask', 'updateTaskStatus',
  'createGoal', 'updateGoalProgress',
  // Plan-driven reasoning (internal planning, no external side effects)
  'generatePlan',
  // Phase 6: Collaboration (internal agent-to-agent, no external side effects)
  'consultAgent', 'shareKnowledge',
  // Self-Healing (read-only diagnostics, no external side effects)
  'getMyErrorHistory', 'getMyHealthReport', 'diagnoseSelf',
  // File generation (workspace-only, no external side effects)
  'listWorkspaceFiles', 'generatePdf', 'generateDocx', 'generateExcel', 'generateCsv',
  // Note: notifyMaster, sendWhatsApp, sendEmail, sendTelegram, sendAgentMessage,
  // delegateTask, requestApproval, requestHumanInput are NOT safe - they have external side effects
  // Note: proposeSelfFix is NOT safe - it modifies config (requires approval for HIGH severity)
  // Scope management (read-only)
  'getMyScope',
]);

// =====================================================
// OUTBOUND MESSAGING TOOLS (require master authority)
// =====================================================
// These tools send messages to EXTERNAL contacts/groups.
// Only master can instruct the agent to use these.
// Non-master contacts (even whitelisted) must get master approval.
const OUTBOUND_CONTACT_TOOLS = new Set([
  'sendWhatsApp', 'sendTelegram', 'sendEmail',
  'sendWhatsAppMedia', 'sendTelegramMedia', 'sendEmailAttachment',
  'broadcastTeam',
]);

// =====================================================
// MASTER-ONLY TOOLS (execute only when master instructs)
// =====================================================
// These tools modify agent configuration or contact scope.
// Non-master contacts cannot instruct these — requires master approval.
// When master instructs, auto-execute (skip autonomy check).
const MASTER_AUTHORITY_TOOLS = new Set([
  // Scope management (who the agent responds to)
  'addContactToScope', 'removeContactFromScope', 'addGroupToScope',
  // Outbound messaging is handled separately above
]);

// =====================================================
// TOOL SELECTION RULES
// =====================================================

// Always available to every agent - core self-awareness + basic actions
const ALWAYS_AVAILABLE = [
  // Core
  'notifyMaster', 'aiChat', 'done', 'heartbeat_ok',
  // Response (for incoming message handling)
  'respond', 'clarify',
  // Self-awareness (read)
  'getMyProfile', 'checkAgentStatuses', 'checkGoalProgress',
  'listMySkills', 'listMySchedules', 'listMyTasks',
  'listRecentMemories', 'searchMemory', 'listTeamMembers', 'searchTeamMembers',
  // Self-management (write)
  'saveMemory', 'selfReflect',
  // Schedule/Task/Goal management (auto-schedule, auto-task, auto-goal)
  'createSchedule', 'updateSchedule', 'deleteSchedule',
  'createTask', 'updateTaskStatus',
  'createGoal', 'updateGoalProgress',
  // Outbound messaging (contact lookup + send)
  'sendMessageToContact',
  // Collaboration
  'sendAgentMessage', 'delegateTask', 'handoffToAgent',
  // Human-in-the-loop
  'requestApproval', 'requestHumanInput',
  // Plan-driven reasoning
  'generatePlan',
  // Knowledge & Research (always available - agents should search knowledge first)
  'ragQuery', 'searchWeb',
  // Agentic Memory (Phase 2) - gated by permission matrix
  'updateMemory', 'forgetMemory', 'consolidateMemories',
  // Agentic Knowledge (Phase 2) - gated by permission matrix
  'learnFromConversation', 'learnFromUrl', 'learnFromText',
  'listKnowledgeLibraries', 'getLibraryStats', 'suggestLearningTopics',
  // Agentic Sub-Agent Management (Phase 2) - gated by permission matrix
  'listSubAgents', 'checkSubAgentStatus', 'recallSubAgent',
  // Agentic Self-Improvement (Phase 3) - gated by permission matrix
  'acquireSkill', 'upgradeSkill', 'evaluatePerformance',
  'suggestImprovements', 'updateSelfPrompt',
  // Agentic Observation (Phase 3) - gated by permission matrix
  'getMyUsageStats', 'getMyAuditLog', 'checkAlerts',
  // Self-Healing (diagnostics + fix proposal)
  'getMyErrorHistory', 'getMyHealthReport', 'diagnoseSelf', 'proposeSelfFix',
  // File reading (server-side media & documents)
  'readPdf', 'readDocx', 'readExcel', 'readText', 'readCsv',
  'extractTextFromImage', 'analyzeImageMessage',
  // File generation & listing (workspace tools)
  'generatePdf', 'generateDocx', 'generateExcel', 'generateCsv', 'listWorkspaceFiles',
  // NOTE: CLI AI tools (claudeCliPrompt, geminiCliPrompt, opencodeCliPrompt) are added
  // dynamically in selectToolsForAgent() based on actual auth status — not here.
  // Agentic Communication (Phase 3) - gated by permission matrix
  'broadcastTeam',
  // Platform Data (read-only access to contacts, conversations, messages)
  'searchContacts', 'getContactDetails', 'getConversations', 'getMessages', 'searchMessages',
];

const SOURCE_TO_TOOLS = {
  email: ['sendEmail', 'sendEmailAttachment'],
  whatsapp: ['sendWhatsApp', 'sendWhatsAppMedia'],
  telegram: ['sendTelegram', 'sendTelegramMedia'],
};

// Level-gated skill-to-tool mapping (Phase 5: Active Skills & Learning)
// Each category maps skill levels (1-4) to progressively more tools.
// Level 1 = Beginner, Level 2 = Intermediate, Level 3 = Advanced, Level 4 = Expert
const SKILL_CATEGORY_TO_TOOLS = {
  communication: {
    tools: ['aiTranslate', 'aiSummarize', 'respond', 'sendWhatsApp', 'sendEmail', 'sendTelegram', 'sendWhatsAppMedia', 'sendTelegramMedia', 'sendEmailAttachment'],
    levelGated: {
      1: ['respond', 'aiSummarize'],
      2: ['respond', 'aiSummarize', 'aiTranslate', 'sendWhatsApp'],
      3: ['respond', 'aiSummarize', 'aiTranslate', 'sendWhatsApp', 'sendEmail', 'sendTelegram', 'sendWhatsAppMedia', 'sendTelegramMedia', 'sendEmailAttachment'],
      4: ['respond', 'aiSummarize', 'aiTranslate', 'sendWhatsApp', 'sendEmail', 'sendTelegram', 'sendWhatsAppMedia', 'sendTelegramMedia', 'sendEmailAttachment'],
    },
  },
  analysis: {
    tools: ['searchWeb', 'ragQuery', 'aiClassify', 'aiExtract', 'aiChat'],
    levelGated: {
      1: ['ragQuery', 'aiChat'],
      2: ['ragQuery', 'aiChat', 'searchWeb', 'aiClassify'],
      3: ['ragQuery', 'aiChat', 'searchWeb', 'aiClassify', 'aiExtract'],
      4: ['ragQuery', 'aiChat', 'searchWeb', 'aiClassify', 'aiExtract'],
    },
  },
  automation: {
    tools: ['triggerFlow', 'createSchedule', 'createTask'],
    levelGated: {
      1: ['createTask'],
      2: ['createTask', 'createSchedule'],
      3: ['createTask', 'createSchedule', 'triggerFlow'],
      4: ['createTask', 'createSchedule', 'triggerFlow'],
    },
  },
  integration: {
    tools: ['searchContacts', 'getContactDetails', 'getConversations', 'getMessages', 'searchMessages'],
    levelGated: {
      1: ['searchContacts'],
      2: ['searchContacts', 'getContactDetails', 'getConversations'],
      3: ['searchContacts', 'getContactDetails', 'getConversations', 'getMessages', 'searchMessages'],
      4: ['searchContacts', 'getContactDetails', 'getConversations', 'getMessages', 'searchMessages'],
    },
  },
  management: {
    tools: ['delegateTask', 'sendAgentMessage', 'handoffToAgent', 'orchestrate', 'broadcastTeam', 'checkAgentStatuses', 'consultAgent', 'shareKnowledge', 'requestConsensus', 'requestAsyncConsensus', 'resolveConflict'],
    levelGated: {
      1: ['sendAgentMessage', 'checkAgentStatuses'],
      2: ['sendAgentMessage', 'checkAgentStatuses', 'delegateTask', 'handoffToAgent', 'consultAgent'],
      3: ['sendAgentMessage', 'checkAgentStatuses', 'delegateTask', 'handoffToAgent', 'consultAgent', 'broadcastTeam', 'shareKnowledge'],
      4: ['sendAgentMessage', 'checkAgentStatuses', 'delegateTask', 'handoffToAgent', 'consultAgent', 'broadcastTeam', 'shareKnowledge', 'orchestrate', 'requestConsensus', 'requestAsyncConsensus', 'resolveConflict'],
    },
  },
};

class AgentReasoningLoop {
  constructor(options = {}) {
    this.defaultMaxIterations = 5;
    this.defaultMaxToolCallsPerCycle = 5;
    this.maxCyclesPerHour = 20;
    this.runningLoops = new Map(); // agentId -> true
    this.rateLimiter = new Map();  // agentId -> { count, windowStart }

    // Phase 4: Runtime control state
    this.pausedLoops = new Set();      // agentIds that are paused
    this.interruptedLoops = new Set(); // agentIds that should stop
    this.contextBudget = options.contextBudget || DEFAULT_CONTEXT_BUDGET;

    // Dynamic iteration budgets by task complexity tier
    // Trivial/simple kept low to prevent timeout on greetings & quick queries
    this.iterationBudgets = {
      trivial:  { maxIterations: 1,  maxToolCalls: 1 },
      simple:   { maxIterations: 3,  maxToolCalls: 3 },
      moderate: { maxIterations: 8,  maxToolCalls: 6 },
      complex:  { maxIterations: 12, maxToolCalls: 8 },
      critical: { maxIterations: 15, maxToolCalls: 10 },
    };
  }

  /**
   * Phase 7: Enqueue a reasoning job via Bull queue (if available).
   * Falls back to direct run() if queue is not initialized.
   *
   * @param {string} agentId
   * @param {string} trigger
   * @param {Object} triggerContext
   * @param {Object} options - { priority, isMaster, isCritical, isComplex }
   * @returns {Promise<Object>} Job object (if queued) or direct result (if fallback)
   */
  async enqueue(agentId, trigger, triggerContext = {}, options = {}) {
    try {
      const { getReasoningJobQueue } = require('./ReasoningJobQueue.cjs');
      const queue = getReasoningJobQueue();
      const job = await queue.enqueue(agentId, trigger, triggerContext, options);
      if (job) return { queued: true, jobId: job.id };
    } catch (err) {
      // Queue not available — fall through to direct execution
    }
    // Fallback: execute directly
    return this.run(agentId, trigger, triggerContext);
  }

  /**
   * Run a reasoning cycle for an agent.
   * @param {string} agentId - agentic_profiles.id
   * @param {string} trigger - 'wake_up' | 'event' | 'schedule' | 'periodic_think'
   * @param {Object} triggerContext - situational data
   * @returns {{ actions: Array, iterations: number, tokensUsed: number, finalThought: string }}
   */
  async run(agentId, trigger, triggerContext = {}) {
    // Hard timeout wrapper: no single run() can exceed this, regardless of iteration count.
    // Prevents V8 heap exhaustion from hung AI/CLI calls.
    const DEFAULT_TIMEOUT_MS = 4 * 60 * 1000; // 4 minutes
    const RUN_TIMEOUT_MS = parseInt(process.env.REASONING_LOOP_TIMEOUT_MS, 10) || DEFAULT_TIMEOUT_MS;

    // AbortController allows us to signal cancellation to inner loops (PlanExecutor, etc.)
    // so orphaned promises don't keep running after timeout
    const abortController = new AbortController();
    triggerContext._abortSignal = abortController.signal;

    let timeoutId;
    return Promise.race([
      this._runInner(agentId, trigger, triggerContext),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          abortController.abort(); // Signal all inner loops to stop
          reject(new Error(`ReasoningLoop hard timeout after ${RUN_TIMEOUT_MS}ms`));
        }, RUN_TIMEOUT_MS);
      }),
    ]).then(result => {
      clearTimeout(timeoutId);
      return result;
    }).catch(async (err) => {
      clearTimeout(timeoutId);
      abortController.abort(); // Ensure abort on any error

      // Ensure lock is cleaned up on timeout (the finally in _runInner won't run if timed out)
      const triggerType = triggerContext.event || trigger || 'default';
      const lockKey = `${agentId}:${triggerType}`;
      this.runningLoops.delete(lockKey);

      // Use safeLog to prevent logger failures from breaking the error handler chain.
      // If logger.error() throws here, the throw below never executes and the caller's
      // catch block (which sends the user-facing fallback message) is never reached.
      const { safeLog } = require('../logger.cjs');
      safeLog('error', `[ReasoningLoop] Run failed for agent ${agentId} (trigger=${trigger}): ${err.message}`);

      // Last-resort: try to send user-facing message before re-throwing
      if (typeof triggerContext._onIntermediateRespond === 'function') {
        try {
          await triggerContext._onIntermediateRespond("I'm sorry, I couldn't complete your request in time. Please try again.");
          err._userNotified = true; // Prevent duplicate error messages in caller catch blocks
        } catch (_) {}
      }

      throw err;
    });
  }

  /**
   * Inner implementation of run() - contains all reasoning logic.
   * Called by run() which wraps it with a hard timeout.
   */
  async _runInner(agentId, trigger, triggerContext = {}) {
    // Step 1: Guard - concurrent lock (per trigger type) + rate limit
    // Use trigger-specific locks so e.g. wake_up doesn't block incoming_message processing
    const triggerType = triggerContext.event || trigger || 'default';
    const lockKey = `${agentId}:${triggerType}`;

    if (this.runningLoops.get(lockKey)) {
      // For incoming_message triggers, wait for lock release instead of immediately skipping.
      // This prevents silent message drops when two messages arrive in quick succession.
      if (triggerType === 'incoming_message') {
        const WAIT_INTERVAL_MS = 3000;
        const MAX_WAIT_MS = 30000;
        let waited = 0;
        logger.info(`[ReasoningLoop] Lock held for ${lockKey} — waiting up to ${MAX_WAIT_MS / 1000}s for release`);
        while (this.runningLoops.get(lockKey) && waited < MAX_WAIT_MS) {
          await new Promise(r => setTimeout(r, WAIT_INTERVAL_MS));
          waited += WAIT_INTERVAL_MS;
        }
        if (this.runningLoops.get(lockKey)) {
          logger.warn(`[ReasoningLoop] Lock still held after ${MAX_WAIT_MS / 1000}s for ${lockKey} — returning busy`);
          return { actions: [], iterations: 0, tokensUsed: 0, finalThought: 'Busy: another request is still being processed. Please try again in a moment.' };
        }
        logger.info(`[ReasoningLoop] Lock released after ${waited}ms — proceeding with ${lockKey}`);
      } else {
        logger.debug(`[ReasoningLoop] Skipping - already running for ${lockKey}`);
        return { actions: [], iterations: 0, tokensUsed: 0, finalThought: 'Skipped: concurrent run' };
      }
    }

    if (!this.checkRateLimit(agentId)) {
      logger.warn(`[ReasoningLoop] Rate limit hit for agent ${agentId}`);
      if (triggerType === 'incoming_message') {
        return { actions: [], iterations: 0, tokensUsed: 0, finalThought: 'Busy: rate limit reached — please try again later.' };
      }
      return { actions: [], iterations: 0, tokensUsed: 0, finalThought: 'Skipped: rate limit' };
    }

    this.runningLoops.set(lockKey, true);

    const actions = [];
    let iterations = 0;
    let tokensUsed = 0;
    let finalThought = '';

    try {
      const db = getDatabase();

      // Load profile
      const profile = db.prepare(`
        SELECT id, user_id, name, role, autonomy_level, system_prompt,
               require_approval_for, master_contact_id, master_contact_channel,
               ai_provider, ai_model, temperature, max_tokens
        FROM agentic_profiles WHERE id = ?
      `).get(agentId);

      if (!profile) {
        throw new Error(`Agent profile not found: ${agentId}`);
      }

      // Phase 7: Check for existing checkpoint (crash recovery)
      // IMPORTANT: For new incoming_message events, always start fresh — never resume
      // a stale checkpoint from a previous task (prevents "getting lost" re-execution bug)
      let resumedFromCheckpoint = false;
      try {
        const { getReasoningCheckpoint } = require('./ReasoningCheckpoint.cjs');
        const cpService = getReasoningCheckpoint();
        const isNewMessage = trigger === 'event' && triggerContext?.event === 'incoming_message';
        if (isNewMessage) {
          // Clear any stale checkpoint — each incoming message is an independent task
          cpService.completeCheckpoint(agentId);
          logger.info(`[ReasoningLoop] New incoming message — cleared stale checkpoint for agent ${agentId}`);
        } else {
          const checkpoint = cpService.loadCheckpoint(agentId);
          if (checkpoint && checkpoint.iteration > 0) {
            logger.info(`[ReasoningLoop] Resuming from checkpoint at iteration ${checkpoint.iteration} for agent ${agentId}`);
            iterations = checkpoint.iteration;
            tokensUsed = checkpoint.tokensUsed || 0;
            if (checkpoint.actionRecords) actions.push(...checkpoint.actionRecords);
            resumedFromCheckpoint = true;
            // Note: messages are rebuilt fresh (system prompt may have changed)
          }
        }
      } catch (cpErr) {
        logger.warn(`[ReasoningLoop] Checkpoint load failed: ${cpErr.message}`);
      }

      // Emit reasoning:start hook
      try {
        const { getHookRegistry } = require('./HookRegistry.cjs');
        getHookRegistry().emitAsync('reasoning:start', {
          agenticId: agentId, userId: profile.user_id, trigger, triggerContext,
        });
      } catch (e) { /* hooks optional */ }

      // Pre-execute approved tool (avoids wasting AI tokens on re-invocation)
      if (trigger === 'approval_resume' && triggerContext.approvedTool) {
        try {
          const toolId = triggerContext.approvedTool;
          const params = triggerContext.modifiedPayload?.params || triggerContext.approvedParams || {};
          const execContext = {
            agenticId: agentId,
            userId: profile.user_id,
            trigger: 'approval_resume',
          };

          logger.info(`[ReasoningLoop] Pre-executing approved tool: ${toolId}`);
          const result = await this.executeTool(toolId, params, execContext);

          // Store result for buildUserMessage to include
          triggerContext._approvalToolResult = result;

          // Record in actions array
          actions.push({
            tool: toolId,
            params,
            result,
            status: result?.success !== false ? 'success' : 'failed',
            approvalResumed: true,
            timestamp: new Date().toISOString(),
          });
        } catch (preExecErr) {
          logger.warn(`[ReasoningLoop] Pre-execution of approved tool failed: ${preExecErr.message}`);
          triggerContext._approvalToolResult = { success: false, error: preExecErr.message };
        }
      }

      // Step 2: Determine AI routing
      const hasOwnProvider = profile.ai_provider && profile.ai_provider !== 'task-routing';
      if (hasOwnProvider) {
        logger.info(`[ReasoningLoop] Using agent's own AI config: ${profile.ai_provider}/${profile.ai_model || 'default'}`);
      } else {
        logger.info(`[ReasoningLoop] Using global SuperBrain task routing`);
      }

      // Step 3: Classify task FIRST (before building prompt) so tier-aware tool selection works
      let maxIterations = this.defaultMaxIterations;
      let maxToolCallsPerCycle = this.defaultMaxToolCallsPerCycle;
      let classifiedTier = 'moderate'; // default tier

      // Context-based override (for orchestrated sub-agents)
      if (triggerContext._maxIterations) {
        maxIterations = triggerContext._maxIterations;
        logger.info(`[ReasoningLoop] Budget override from orchestrator: maxIterations=${maxIterations}`);
      }
      if (triggerContext._maxToolCalls) {
        maxToolCallsPerCycle = triggerContext._maxToolCalls;
      }

      // Task-based classification (only for non-overridden, message-triggered cases)
      let rawClassifiedTier = 'moderate'; // raw tier before budget upgrades (for fast-path check)
      if (!triggerContext._maxIterations && (triggerContext.preview || triggerContext.situation)) {
        try {
          const { getTaskClassifier } = require('../ai/TaskClassifier.cjs');
          const classifier = getTaskClassifier();
          const taskText = triggerContext.preview || triggerContext.situation || '';
          let classification = classifier.classify(taskText);

          // Optional AI classification override (if user has AI classifier mode)
          if (profile.user_id) {
            try {
              const { getSuperBrainRouter } = require('../ai/SuperBrainRouter.cjs');
              const sbr = getSuperBrainRouter();
              const classifierConfig = sbr._buildClassifierConfig(profile.user_id);
              if (classifierConfig) {
                classification = await classifier.classifyWithAI(taskText, classifierConfig, classification);
                logger.info(`[ReasoningLoop] AI classifier → "${classification.tier}" (source: ${classification.source}, provider: ${classification.classifierProvider || 'n/a'})`);
              }
            } catch (aiClassErr) {
              logger.warn(`[ReasoningLoop] AI classifier failed, using local: ${aiClassErr.message}`);
            }
          }

          rawClassifiedTier = classification.tier; // save raw tier before budget adjustments

          // Use structured analysis instead of fragile inline keyword matching
          const budgetResult = this.classifyIterationBudget(taskText, triggerType, classification);
          const tier = budgetResult.tier;
          if (budgetResult.reason) {
            logger.info(`[ReasoningLoop] Budget adjustment: ${classification.tier} -> ${tier} (${budgetResult.reason})`);
          }

          classifiedTier = tier;
          const budget = this.iterationBudgets[tier];
          if (budget) {
            maxIterations = budget.maxIterations;
            maxToolCallsPerCycle = budget.maxToolCalls;
            logger.info(`[ReasoningLoop] Dynamic budget: tier=${tier}, confidence=${classification.confidence}, maxIterations=${maxIterations}, maxToolCalls=${maxToolCallsPerCycle}`);
          }

          // Audit log: classification result
          try {
            const { getAuditLogService } = require('./AuditLogService.cjs');
            getAuditLogService().log(agentId, profile.user_id, 'classification', 'INTERNAL', {
              tier: classifiedTier,
              rawTier: rawClassifiedTier,
              confidence: classification.confidence?.toFixed(2),
              source: classification.source || 'local',
              classifierProvider: classification.classifierProvider || null,
              reasoning: classification.reasoning || null,
              scores: classification.scores,
              preview: taskText.substring(0, 100),
              maxIterations,
              maxToolCalls: maxToolCallsPerCycle,
            });
          } catch (_) {}
        } catch (e) {
          // TaskClassifier optional, fall back to defaults
          logger.debug(`[ReasoningLoop] TaskClassifier unavailable, using defaults: ${e.message}`);
        }
      }

      // Check for user-configured reasoning budgets from superbrain_settings
      if (!triggerContext._maxIterations && profile.user_id) {
        try {
          const userBudgets = db.prepare(
            'SELECT reasoning_budgets FROM superbrain_settings WHERE user_id = ?'
          ).get(profile.user_id);
          if (userBudgets?.reasoning_budgets) {
            const parsed = JSON.parse(userBudgets.reasoning_budgets);
            if (parsed[classifiedTier]) {
              maxIterations = parsed[classifiedTier].maxIterations || maxIterations;
              maxToolCallsPerCycle = parsed[classifiedTier].maxToolCalls || maxToolCallsPerCycle;
              logger.info(`[ReasoningLoop] User budget override: tier=${classifiedTier}, maxIter=${maxIterations}, maxTools=${maxToolCallsPerCycle}`);
            }
          }
        } catch (e) {
          logger.debug(`[ReasoningLoop] No user budget override: ${e.message}`);
        }
      }

      // Step 4: Build context (AFTER classification so tier-aware tool selection works)
      // Pass classified tier to triggerContext for tool selection
      triggerContext._classifiedTier = classifiedTier;
      const systemPrompt = this.buildSystemPrompt(agentId, profile, trigger, triggerContext);
      const userMessage = this.buildUserMessage(trigger, triggerContext);
      const tools = this.selectToolsForAgent(agentId, profile, triggerContext);

      // Pre-convert tools to OpenAI format for native function calling (computed once, used every iteration)
      const openAITools = convertToolsToOpenAI(tools);
      logger.info(`[ReasoningLoop] Converted ${openAITools.length} tools to OpenAI format for native tool calling`);

      // Log prompt size for diagnostics
      logger.info(`[ReasoningLoop] System prompt: ${systemPrompt.length} chars, User message: ${userMessage.length} chars, Tools: ${tools.length}`);

      // Step 5: Build conversation for multi-turn
      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ];

      // Phase 4: Emit reasoning:start WebSocket event
      this._emitAgenticEvent(profile.user_id, agentId, 'agentic:reasoning:start', {
        agentName: profile.name, trigger, tier: classifiedTier,
        maxIterations, timestamp: new Date().toISOString(),
      });

      // =============================================================
      // FAST-PATH: Trivial greetings bypass the full reasoning loop
      // =============================================================
      // For very short messages that are clearly greetings/acknowledgments,
      // make a single lightweight AI call with minimal tools instead of
      // the full 76+ tool reasoning loop. This prevents 240s timeouts on "Hi".
      if (
        rawClassifiedTier === 'trivial' &&
        triggerType === 'incoming_message' &&
        !triggerContext._maxIterations &&
        !triggerContext._stepId
      ) {
        const rawPreview = (triggerContext.preview || '').replace(/---\s*Enriched Data\s*---[\s\S]*/i, '').trim();
        const wordCount = rawPreview.split(/\s+/).filter(Boolean).length;
        const isGreeting = wordCount <= 5 && /^(h(i|ello|ey|ola|owdy)|good\s*(morning|afternoon|evening|night|day)|thanks?(\s+you)?|thank\s+you|ok(ay)?|sure|bye|goodbye|see\s+ya|yo|sup|what'?s?\s*up|hey\s+there|morning|evening|night|gm|gn)/i.test(rawPreview);

        if (isGreeting) {
          logger.info(`[ReasoningLoop] FAST-PATH: trivial greeting detected ("${rawPreview}"), using lightweight AI call`);

          try {
            // Build a minimal prompt with just personality + respond/done tools
            const { getPersonalityService } = require('./PersonalityService.cjs');
            let personalityPrompt;
            try {
              personalityPrompt = getPersonalityService().generateSystemPrompt(agentId);
            } catch (_) {
              personalityPrompt = profile.system_prompt || `You are ${profile.name}, a ${profile.role || 'AI agent'}.`;
            }

            const fastSystemPrompt = [
              personalityPrompt,
              '',
              '=== OUTPUT FORMAT ===',
              'Respond with exactly ONE tool call in this JSON format:',
              '```tool',
              '{"action": "respond", "params": {"message": "your friendly reply here"}}',
              '```',
              'After responding, the system will automatically finish. Keep your reply brief and natural.',
              `The sender\'s name is "${triggerContext.sender || 'the user'}". Platform: ${triggerContext.platform || 'unknown'}.`,
            ].join('\n');

            const fastMessages = [
              { role: 'system', content: fastSystemPrompt },
              { role: 'user', content: userMessage },
            ];

            const { getSuperBrainRouter } = require('../ai/SuperBrainRouter.cjs');
            const superBrain = getSuperBrainRouter();
            const fastRequest = {
              task: 'Reply to a greeting message naturally.',
              messages: fastMessages,
              userId: profile.user_id,
            };
            if (hasOwnProvider) {
              fastRequest.forceProvider = profile.ai_provider;
            } else {
              fastRequest.forceTier = 'simple';
            }

            const fastResult = await superBrain.process(fastRequest, {
              isAgentic: true,
              temperature: profile.temperature != null ? profile.temperature : undefined,
              maxTokens: 200,
              model: hasOwnProvider ? profile.ai_model : undefined,
            });

            const fastContent = fastResult?.content || '';
            const fastToolCalls = this.parseToolCalls(fastContent);
            let responded = false;

            for (const tc of fastToolCalls) {
              if (tc.action === 'respond' && tc.params?.message) {
                if (typeof triggerContext._onIntermediateRespond === 'function') {
                  await triggerContext._onIntermediateRespond(tc.params.message);
                  responded = true;
                }
                actions.push({ tool: 'respond', params: tc.params, result: { success: true }, status: 'success', timestamp: new Date().toISOString() });
              }
            }

            // If AI didn't use respond tool, extract text and respond directly
            if (!responded && fastContent.length > 0) {
              const plainReply = fastContent.replace(/```tool[\s\S]*?```/g, '').replace(/```[\s\S]*?```/g, '').trim();
              if (plainReply && typeof triggerContext._onIntermediateRespond === 'function') {
                await triggerContext._onIntermediateRespond(plainReply);
                actions.push({ tool: 'respond', params: { message: plainReply }, result: { success: true }, status: 'success', timestamp: new Date().toISOString() });
              }
            }

            tokensUsed = (fastResult?.usage?.total_tokens) || Math.ceil((fastSystemPrompt.length + userMessage.length + fastContent.length) / 4);
            iterations = 1;
            finalThought = 'Fast-path greeting response';

            this._emitAgenticEvent(profile.user_id, agentId, 'agentic:reasoning:complete', {
              trigger, iterations: 1, tokensUsed, actionCount: actions.length,
              mode: 'fast-path-greeting', timestamp: new Date().toISOString(),
            });

            return { actions, iterations, tokensUsed, finalThought };
          } catch (fastErr) {
            // Fast-path failed — fall through to normal reasoning loop
            logger.warn(`[ReasoningLoop] Fast-path failed, falling back to normal loop: ${fastErr.message}`);
          }
        }
      }

      // Phase 3: Auto-decomposition for complex/critical tasks
      // Only for top-level agents (not sub-agents/orchestrated steps)
      if (!triggerContext._maxIterations && !triggerContext._stepId) {
        try {
          const { getTaskDecomposer } = require('./TaskDecomposer.cjs');
          const decomposer = getTaskDecomposer();

          if (decomposer.shouldDecompose(userMessage, classifiedTier)) {
            logger.info(`[ReasoningLoop] Auto-decomposing ${classifiedTier} task`);

            const plan = await decomposer.decompose(userMessage, {
              availableTools: [], // Will use agent's tools
              skills: this._getAgentSkills(agentId),
            }, (msgs) => this._callAI(msgs, profile, hasOwnProvider));

            if (plan && plan.steps.length >= 2) {
              logger.info(`[ReasoningLoop] Decomposition plan: ${plan.steps.length} steps, ${plan.parallelGroups.length} parallel groups`);

              const { getPlanExecutor } = require('./PlanExecutor.cjs');
              const executor = getPlanExecutor(this);
              const planResult = await executor.execute(plan, agentId, profile, triggerContext, []);

              // Phase 4: Emit completion event
              this._emitAgenticEvent(profile.user_id, agentId, 'agentic:reasoning:complete', {
                trigger, iterations: planResult.iterations, tokensUsed: planResult.tokensUsed,
                actionCount: planResult.actions?.length || 0,
                mode: 'decomposed', planSteps: plan.steps.length,
                timestamp: new Date().toISOString(),
              });

              const completedSteps = Object.values(planResult.stepResults).filter(r => r.status === 'completed').length;
              const allActions = planResult.actions || [];

              // Synthesis: Ask AI to compose a user-facing response from step results
              // (auto-decomposition lacked this — plan-driven loop has it in Phase 3)
              let synthesizedThought = `Plan completed: ${completedSteps}/${plan.steps.length} steps succeeded`;
              if (!triggerContext._abortSignal?.aborted) {
                try {
                  const stepSummaries = Object.entries(planResult.stepResults)
                    .map(([id, r]) => {
                      const resultStr = r.result ? JSON.stringify(r.result).substring(0, 300) : (r.summary || r.status);
                      return `- ${r.title || id}: ${resultStr}`;
                    }).join('\n');

                  const synthMessages = [...messages, {
                    role: 'user',
                    content: `You completed a plan. Here are the results:\n\n${stepSummaries}\n\nNow use "respond" to send a clear, helpful summary to the user. Then use "done" to finish.`,
                  }];

                  const synthResult = await this._callAI(synthMessages, profile, hasOwnProvider);
                  if (synthResult.content) {
                    const synthCalls = this.parseToolCalls(synthResult.content);
                    for (const call of synthCalls) {
                      if (call.action === 'respond' && typeof triggerContext._onIntermediateRespond === 'function') {
                        const respResult = await this.executeTool('respond', call.params, {
                          agenticId: agentId, userId: profile.user_id,
                          conversationId: triggerContext.conversationId || null,
                          accountId: triggerContext.accountId || null,
                        });
                        if (respResult.success && respResult.result?.message) {
                          try { await triggerContext._onIntermediateRespond(respResult.result.message); } catch (e) { /* ok */ }
                          synthesizedThought = respResult.result.message;
                        }
                        allActions.push({ tool: 'respond', params: call.params, status: 'executed', sentImmediately: true });
                      } else if (call.action === 'done') {
                        synthesizedThought = synthesizedThought || call.reasoning || 'Plan completed';
                      }
                    }
                    // If AI responded with plain text (no tool calls), use it as the thought
                    if (synthCalls.length === 0 && synthResult.content.length > 10) {
                      synthesizedThought = synthResult.content;
                    }
                  }
                  console.log(`[DEBUG] Auto-decomposition synthesis: "${synthesizedThought.substring(0, 120)}"`);
                } catch (synthErr) {
                  console.log(`[DEBUG] Auto-decomposition synthesis failed (non-fatal): ${synthErr.message}`);
                }
              }

              const result = {
                actions: allActions,
                iterations: (planResult.iterations || 0) + 1, // +1 for synthesis
                tokensUsed: planResult.tokensUsed || 0,
                finalThought: synthesizedThought,
                planId: planResult.planId,
                plan: planResult.plan,
              };

              // Phase 2: Reflect on decomposed execution (fire-and-forget)
              this._reflectOnExecution(agentId, profile.user_id, trigger, triggerContext, result)
                .catch(e => console.error(`[DEBUG] Decomposed reflection failed: ${e.message}`));

              return result;
            }
          }
        } catch (decompError) {
          logger.warn(`[ReasoningLoop] Auto-decomposition failed, falling back: ${decompError.message}`);
        }
      }

      // Step 5.5: Plan-driven mode check
      // For moderate/complex/critical tasks from incoming messages, try plan-driven loop first
      if (this.shouldUsePlanDrivenMode(classifiedTier, triggerContext)) {
        logger.info(`[ReasoningLoop] Plan-driven mode: tier=${classifiedTier}, attempting plan generation`);
        try {
          const planResult = await this.runPlanDrivenLoop(agentId, profile, messages, triggerContext);
          if (planResult) {
            logger.info(`[ReasoningLoop] Plan-driven mode completed: ${planResult.iterations} iterations, ${planResult.actions?.length || 0} actions, planId=${planResult.planId}`);
            return planResult;
          }
          // planResult is null = AI declined to plan, fall through to reactive loop
          logger.info('[ReasoningLoop] Plan-driven mode declined by AI, falling back to reactive loop');
        } catch (planErr) {
          logger.warn(`[ReasoningLoop] Plan-driven mode failed, falling back to reactive: ${planErr.message}`);
        }
      }

      // Step 6: Reasoning loop (reactive)
      let toolCallCount = 0;
      let consecutiveRespondOnlyCount = 0; // Track consecutive respond-only iterations
      let totalRespondsSent = 0; // Track total respond actions across ALL iterations
      const MAX_RESPONDS_PER_RUN = 2; // Hard cap: max 2 respond messages per reasoning run
      let respondCapReached = false; // Flag to break outer loop when respond cap hit
      const executedToolNames = []; // Track which tools were actually executed for self-audit

      for (let i = 0; i < maxIterations; i++) {
        iterations = i + 1;
        console.log(`[DEBUG] === Reasoning loop iteration ${iterations}/${maxIterations} for agent ${agentId} ===`);

        // Check abort signal from outer run() timeout
        if (triggerContext._abortSignal?.aborted) {
          console.log(`[DEBUG] Reasoning loop aborted by timeout at iteration ${iterations}`);
          finalThought = 'Execution timed out';
          break;
        }

        // Phase 4: Check for interrupt/pause
        if (this.interruptedLoops.has(agentId)) {
          logger.info(`[ReasoningLoop] Agent ${agentId} interrupted at iteration ${iterations}`);
          this.interruptedLoops.delete(agentId);
          finalThought = 'Execution interrupted by user';
          break;
        }
        while (this.pausedLoops.has(agentId)) {
          await new Promise(r => setTimeout(r, 500));
          if (this.interruptedLoops.has(agentId)) {
            this.interruptedLoops.delete(agentId);
            this.pausedLoops.delete(agentId);
            finalThought = 'Execution interrupted while paused';
            break;
          }
        }
        if (finalThought === 'Execution interrupted while paused') break;

        // Phase 4: Emit reasoning step event
        this._emitAgenticEvent(profile.user_id, agentId, 'agentic:reasoning:step', {
          iteration: iterations, maxIterations,
          timestamp: new Date().toISOString(),
        });

        // Phase 7: Save checkpoint after each iteration (non-blocking)
        if (iterations > 1 || resumedFromCheckpoint) {
          try {
            const { getReasoningCheckpoint } = require('./ReasoningCheckpoint.cjs');
            getReasoningCheckpoint().saveCheckpoint(agentId, profile.user_id, {
              trigger, triggerContext, iteration: iterations,
              actionRecords: actions, tokensUsed, tier: 'moderate',
            });
          } catch (cpErr) { /* checkpoint save is best-effort */ }
        }

        // Phase 7: RAG auto-enrichment on iteration 2+ (after initial context is set)
        if (iterations >= 2) {
          try {
            await this._enrichWithRAG(agentId, profile.user_id, messages);
          } catch (ragErr) { /* RAG enrichment is best-effort */ }
        }

        // Call SuperBrainRouter
        const { getSuperBrainRouter } = require('../ai/SuperBrainRouter.cjs');
        const superBrain = getSuperBrainRouter();

        // Truncate messages if over budget (head-tail split)
        const truncatedMessages = this.truncateMessages(messages);

        // Build request based on agent's AI config
        const processRequest = {
          task: 'Autonomous agent reasoning: analyze context, select tools, execute actions. Requires structured JSON output.',
          messages: truncatedMessages,
          userId: profile.user_id,
          tools: openAITools, // Native function calling (used by capable OpenRouter models)
        };

        if (hasOwnProvider) {
          // Agent has its own provider/model - force it
          processRequest.forceProvider = profile.ai_provider;
        } else {
          // Use classified tier for routing (was hardcoded to 'moderate' causing slow responses for simple messages)
          // Floor at 'simple' for reasoning loop since trivial models may not support tool-use JSON
          const routingTier = (classifiedTier === 'trivial') ? 'simple' : classifiedTier;
          processRequest.forceTier = routingTier;
        }

        let aiResult;
        // Audit: log AI request before calling provider (include prompt details)
        try {
          const { getAuditLogService } = require('./AuditLogService.cjs');
          // Build prompt summary for audit visibility
          const promptMessages = truncatedMessages.map((m, idx) => ({
            role: m.role,
            contentLength: (m.content || '').length,
            preview: (m.content || '').substring(0, 500),
          }));
          const totalPromptChars = truncatedMessages.reduce((sum, m) => sum + (m.content || '').length, 0);

          getAuditLogService().log(agentId, profile.user_id, 'ai_request', 'INTERNAL', {
            provider: hasOwnProvider ? profile.ai_provider : 'task-routing',
            model: hasOwnProvider ? profile.ai_model : `tier:${processRequest.forceTier || 'moderate'}`,
            messageCount: truncatedMessages.length,
            totalPromptChars,
            iteration: iterations,
            budget: { maxIterations, maxToolCalls: maxToolCallsPerCycle, tier: classifiedTier },
            messages: promptMessages,
          });
        } catch (_) {}
        try {
          console.log(`[DEBUG] Calling SuperBrain for iteration ${iterations}...`);
          aiResult = await superBrain.process(processRequest, {
            isAgentic: true,
            temperature: profile.temperature != null ? profile.temperature : undefined,
            maxTokens: profile.max_tokens != null ? profile.max_tokens : undefined,
            model: hasOwnProvider ? profile.ai_model : undefined,
          });
          console.log(`[DEBUG] SuperBrain returned for iteration ${iterations}: ${(aiResult?.content || '').substring(0, 100)}`);
        } catch (providerErr) {
          // Audit: log provider error
          try {
            const { getAuditLogService } = require('./AuditLogService.cjs');
            getAuditLogService().log(agentId, profile.user_id, 'error', 'INTERNAL', {
              message: `AI providers failed at iteration ${iterations}`,
              error: providerErr.message,
              iteration: iterations,
            });
          } catch (_) {}
          logger.error(`[ReasoningLoop] All AI providers failed at iteration ${iterations}: ${providerErr.message}`);
          if (iterations === 1 && triggerContext.event === 'incoming_message') {
            finalThought = "I'm experiencing some technical difficulties right now. Please try again in a moment.";
            // Phase 1b: Send directly via callback to bypass auto-respond gate
            if (typeof triggerContext._onIntermediateRespond === 'function') {
              try { await triggerContext._onIntermediateRespond(finalThought); } catch (_) {}
            }
          }
          break;
        }

        const _iterInputTokens  = aiResult.usage?.promptTokens    || 0;
        const _iterOutputTokens = aiResult.usage?.completionTokens || 0;
        tokensUsed += _iterInputTokens + _iterOutputTokens;

        // Non-blocking agentic usage recording
        setImmediate(() => {
          try {
            const { costTrackingService } = require('./CostTrackingService.cjs');
            costTrackingService.recordUsage({
              agenticId:      agentId,
              userId:         profile.user_id,
              requestType:    'reasoning',
              provider:       aiResult.provider  || null,
              model:          aiResult.model     || null,
              inputTokens:    _iterInputTokens,
              outputTokens:   _iterOutputTokens,
              conversationId: triggerContext?.conversationId || null,
              source:         'reasoning_loop',
            });
          } catch (trackErr) {
            logger.debug(`Agentic usage tracking skipped: ${trackErr.message}`);
          }
        });

        const aiResponse = aiResult.content || '';

        // ── NATIVE TOOL CALLING DETECTION ──
        // Check if the provider returned native function calling results
        const nativeToolCalls = aiResult.nativeToolCalls || null;
        const usedNativeTools = aiResult.usedNativeTools === true;
        if (usedNativeTools) {
          logger.info(`[ReasoningLoop] Native tool calls received: ${nativeToolCalls.map(tc => tc.function?.name).join(', ')} (finish_reason: ${aiResult.finishReason})`);
        }

        // ── AUTO-DELIVER FILES FROM CLI PROVIDER PATH ──
        // When SuperBrain routes through CLI providers (cli-claude, cli-gemini, cli-opencode),
        // CLIAIProvider.chat() returns outputFiles[] but the reasoning loop only reads .content.
        // Auto-deliver these files via DLQ so users receive the actual attachments.
        if (aiResult.outputFiles && Array.isArray(aiResult.outputFiles) && aiResult.outputFiles.length > 0) {
          const acctId = triggerContext.accountId;
          const extId = triggerContext.externalId;
          const plat = triggerContext.platform || 'whatsapp';

          if (acctId && extId) {
            try {
              const fs = require('fs');
              const path = require('path');
              const { getDeliveryQueueService } = require('../deliveryQueueService.cjs');
              const { getTempFileService } = require('../TempFileService.cjs');
              const dlq = getDeliveryQueueService();
              const tempService = getTempFileService();
              let deliveredCount = 0;

              // Script filtering: when CLI generates both scripts (.py/.js) and documents (.docx/.pdf),
              // only deliver the documents — scripts are intermediate build artifacts, not user deliverables.
              const SCRIPT_EXTS = new Set(['.py', '.js', '.ts', '.sh', '.rb', '.go', '.rs', '.java']);
              const DOCUMENT_EXTS = new Set(['.pdf', '.docx', '.doc', '.xlsx', '.xls', '.csv', '.txt', '.md', '.html', '.json', '.zip']);
              let filesToDeliver = aiResult.outputFiles;

              const hasScripts = filesToDeliver.some(f => SCRIPT_EXTS.has(path.extname(f.name).toLowerCase()));
              const hasDocuments = filesToDeliver.some(f => DOCUMENT_EXTS.has(path.extname(f.name).toLowerCase()));

              if (hasScripts && hasDocuments) {
                const before = filesToDeliver.length;
                filesToDeliver = filesToDeliver.filter(f => !SCRIPT_EXTS.has(path.extname(f.name).toLowerCase()));
                logger.info(`[ReasoningLoop] Script filtering: removed ${before - filesToDeliver.length} script(s), delivering ${filesToDeliver.length} document(s)`);
              }

              for (const file of filesToDeliver) {
                try {
                  if (!file.fullPath || !fs.existsSync(file.fullPath)) {
                    logger.warn(`[ReasoningLoop] Provider output file not found: ${file.fullPath || file.name}`);
                    continue;
                  }

                  const fileBuffer = fs.readFileSync(file.fullPath);
                  const ext = path.extname(file.name).toLowerCase();
                  const MIME_MAP = {
                    '.pdf': 'application/pdf', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.csv': 'text/csv',
                    '.doc': 'application/msword', '.xls': 'application/vnd.ms-excel',
                    '.txt': 'text/plain', '.html': 'text/html', '.json': 'application/json',
                    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.zip': 'application/zip',
                  };
                  const mimeType = MIME_MAP[ext] || 'application/octet-stream';

                  // Store in TempFileService for tracking/TTL
                  tempService.store(profile.user_id, fileBuffer, file.name, mimeType, {
                    ttlHours: 72,
                    source: 'cli-provider-auto',
                    metadata: { provider: aiResult.provider, agentId },
                  });

                  // Enqueue media delivery via DLQ
                  await dlq.enqueue({
                    accountId: acctId,
                    recipient: extId,
                    platform: plat,
                    content: `${file.name} (${file.sizeHuman || ''})`,
                    contentType: 'media',
                    options: JSON.stringify({
                      media: file.fullPath,
                      caption: `${file.name} (${file.sizeHuman || ''})`,
                      fileName: file.name,
                      mimeType,
                    }),
                    source: 'cli_provider_auto_delivery',
                    conversationId: triggerContext.conversationId || null,
                    agentId: agentId,
                    userId: profile.user_id,
                  });
                  deliveredCount++;
                  logger.info(`[ReasoningLoop] Auto-delivered provider file ${file.name} via DLQ to ${extId}`);
                } catch (fileErr) {
                  logger.warn(`[ReasoningLoop] Auto-delivery failed for ${file.name}: ${fileErr.message}`);
                }
              }

              if (deliveredCount > 0) {
                logger.info(`[ReasoningLoop] Auto-delivered ${deliveredCount} file(s) from CLI provider path`);
              }
            } catch (dlqErr) {
              logger.warn(`[ReasoningLoop] Provider file auto-delivery setup error: ${dlqErr.message}`);
            }
          }
        }

        // Audit: log AI response (full content for debugging)
        try {
          const { getAuditLogService } = require('./AuditLogService.cjs');
          getAuditLogService().log(agentId, profile.user_id, 'ai_response', 'INTERNAL', {
            provider: aiResult.provider || 'unknown',
            model: aiResult.model || 'unknown',
            tokens: _iterInputTokens + _iterOutputTokens,
            inputTokens: _iterInputTokens,
            outputTokens: _iterOutputTokens,
            iteration: iterations,
            contentLength: aiResponse.length,
            fullResponse: aiResponse.substring(0, 3000),
            finishReason: aiResult.finishReason || null,
            usedNativeTools: usedNativeTools,
            nativeToolCallCount: nativeToolCalls?.length || 0,
          });
        } catch (_) {}

        // Log raw AI response for diagnosis
        logger.info(`[ReasoningLoop] AI response (${aiResponse.length} chars): ${aiResponse.substring(0, 300)}`);

        // Handle empty AI response (all providers failed)
        // Allow empty content when native tool calls are present (model's response is only tool calls)
        if (!aiResponse.trim() && !usedNativeTools) {
          logger.warn(`[ReasoningLoop] AI returned empty response for agent ${agentId}, iteration ${iterations}`);
          if (iterations === 1 && triggerContext.event === 'incoming_message') {
            // First iteration with no response - acknowledge the message
            finalThought = `I received your message but I'm having trouble processing it right now. I'll follow up once I can properly analyze it. Your request: "${(triggerContext.preview || '').substring(0, 100)}"`;
            // Phase 1b: Send directly via callback to bypass auto-respond gate
            if (typeof triggerContext._onIntermediateRespond === 'function') {
              try { await triggerContext._onIntermediateRespond(finalThought); } catch (_) {}
            }
          } else {
            finalThought = '';
          }
          break;
        }

        // Parse tool calls — NATIVE path (structured function calling) or TEXT path (JSON in text)
        let toolCalls;
        if (usedNativeTools && nativeToolCalls && nativeToolCalls.length > 0) {
          // NATIVE PATH: Convert OpenAI tool_calls to internal format
          toolCalls = this.parseNativeToolCalls(nativeToolCalls);
          logger.info(`[ReasoningLoop] Parsed ${toolCalls.length} native tool calls: ${toolCalls.map(tc => tc.action).join(', ')}`);
        } else {
          // TEXT PATH: Existing text-based parsing (unchanged)
          toolCalls = this.parseToolCalls(aiResponse);
        }

        // No tool calls = final thought (AI just responded with text)
        if (toolCalls.length === 0) {
          // Check for <<SILENT>> token in plain text response
          if (aiResponse.includes('<<SILENT>>')) {
            finalThought = 'Agent chose to remain silent';
            this.logActivity(db, agentId, profile.user_id, 'silent_decision', trigger, {
              iterations, tokensUsed, reasoning: 'SILENT token detected in response',
            });
            return { actions, iterations, tokensUsed, finalThought, silent: true };
          }

          // finish_reason based termination: when native tools were available and the model
          // returned finish_reason='stop' with no tool calls, this is an authoritative signal
          // that the AI is done — skip meta-talk detection and trust the model's judgment.
          const finishReason = aiResult.finishReason;
          const hadNativeToolsAvailable = !!(processRequest.tools && processRequest.tools.length > 0);

          if (hadNativeToolsAvailable && finishReason === 'stop') {
            logger.info(`[ReasoningLoop] finish_reason=stop with no tool calls — AI naturally finished (native tools were available)`);
            finalThought = aiResponse || '';
            break;
          }

          // Meta-talk detection: some models can't produce structured tool calls and instead
          // output text ABOUT what they want to do (e.g., "We need to output tool calls in JSON format").
          // Don't treat this as a final response — skip it and continue the loop so SuperBrain
          // can fail over to a provider that CAN produce tool calls (e.g., CLI providers).
          const isMetaTalk = /tool.?call|json.?format|output.?format|structured.?output|function.?call/i.test(aiResponse)
            && aiResponse.length < 500
            && iterations <= 2; // Only retry on early iterations to prevent infinite loops
          if (isMetaTalk) {
            logger.warn(`[ReasoningLoop] AI response looks like meta-talk about tool calling (${aiResponse.length} chars, iter ${iterations}) — skipping as non-final`);
            // Add as assistant message so the next iteration has context
            messages.push({ role: 'assistant', content: aiResponse });
            messages.push({ role: 'user', content: 'Your previous response did not contain a valid tool call. You MUST respond with a JSON tool call in the ```tool format. Try again.' });
            continue; // Don't break — try next iteration
          }

          // Sanitize: don't use raw AI response as finalThought if it looks like error output
          if (this._looksLikeErrorOutput(aiResponse)) {
            logger.warn(`[ReasoningLoop] AI response looks like error output (${aiResponse.substring(0, 200)}...) - not using as finalThought`);
            finalThought = '';
          } else {
            finalThought = aiResponse;
          }
          break;
        }

        // Process each tool call
        const availableToolIds = tools.map(t => t.id).concat(['done', 'silent', 'heartbeat_ok']);
        let nativeAssistantMsgAdded = false; // Track if we've added the assistant+tool_calls message for this iteration
        for (const call of toolCalls) {
          if (call.action === 'done') {
            finalThought = call.reasoning || aiResponse;
            // Log completion
            this.logActivity(db, agentId, profile.user_id, 'reasoning_cycle_end', trigger, {
              iterations, tokensUsed, actionsCount: actions.length, finalThought,
            });
            return { actions, iterations, tokensUsed, finalThought };
          }

          if (call.action === 'silent') {
            finalThought = call.reasoning || 'Agent chose to remain silent';
            this.logActivity(db, agentId, profile.user_id, 'silent_decision', trigger, {
              iterations, tokensUsed, reasoning: call.reasoning,
            });
            return { actions, iterations, tokensUsed, finalThought, silent: true };
          }

          if (toolCallCount >= maxToolCallsPerCycle) {
            finalThought = 'Tool call limit reached';
            break;
          }

          // Validate and auto-correct tool call before execution
          const validation = this.validateToolCall(call, availableToolIds);
          if (!validation.valid) {
            logger.warn(`[ReasoningLoop] Invalid tool call: ${validation.error}`);
            messages.push({ role: 'assistant', content: aiResponse });
            messages.push({
              role: 'user',
              content: `Tool call error: ${validation.error}\nUse a valid tool from the available tools list.`,
            });
            break; // Break inner loop, continue outer reasoning loop for AI to retry
          }
          // Apply corrections (alias/fuzzy match/param name fixes)
          call.action = validation.correctedCall.action;
          call.params = validation.correctedCall.params;

          // Autonomy check + Master authority for outbound messaging
          let approvalNeeded = this.needsApproval(profile, call.action);
          const isMasterTriggered = triggerContext.isMaster === true;
          const isOutboundContact = OUTBOUND_CONTACT_TOOLS.has(call.action);

          // Rule: Outbound messaging to contacts requires master authority
          // - Non-master triggers outbound → ALWAYS needs approval (even if autonomous)
          // - Master triggers outbound → skip approval (master IS the authority)
          if (isOutboundContact) {
            if (!isMasterTriggered) {
              approvalNeeded = true;
              logger.info(`[ReasoningLoop] Non-master triggered outbound tool "${call.action}" — requires master approval`);
            } else {
              // Master explicitly instructed this — execute without approval
              approvalNeeded = false;
            }
          }

          // Rule: Scope modification tools require master authority
          // - Non-master triggers scope change → ALWAYS needs approval
          // - Master triggers scope change → skip approval (master IS the authority)
          const isMasterAuthorityTool = MASTER_AUTHORITY_TOOLS.has(call.action);
          if (isMasterAuthorityTool) {
            if (!isMasterTriggered) {
              approvalNeeded = true;
              logger.info(`[ReasoningLoop] Non-master triggered master-authority tool "${call.action}" — requires master approval`);
            } else {
              // Master explicitly instructed this — execute without approval
              approvalNeeded = false;
            }
          }

          if (approvalNeeded) {
            // Queue for approval instead of executing
            this.queueForApproval(db, agentId, profile.user_id, call);
            actions.push({
              tool: call.action,
              params: call.params,
              reasoning: call.reasoning,
              status: 'queued_for_approval',
            });

            // Tell AI the action was queued — use context-specific message
            const isRestrictedTool = (isOutboundContact || isMasterAuthorityTool) && !isMasterTriggered;
            messages.push({ role: 'assistant', content: aiResponse });
            messages.push({
              role: 'user',
              content: isRestrictedTool
                ? `Tool "${call.action}" can only be authorized by your master. It has been queued for master approval. Tell the sender you need master's permission first.`
                : `Tool "${call.action}" requires master approval. It has been queued. Please continue with other actions or finish.`,
            });
          } else {
            // Phase 4: Emit tool start event
            this._emitAgenticEvent(profile.user_id, agentId, 'agentic:tool:start', {
              toolName: call.action, params: this._sanitizeParams(call.params),
              reasoning: call.reasoning, timestamp: new Date().toISOString(),
            });

            const toolStartTime = Date.now();

            // Phase 1: Execute with recovery wrapper
            const toolContext = {
              agenticId: agentId,
              userId: profile.user_id,
              _orchestrationDepth: triggerContext._orchestrationDepth || 0,
              // Conversation context for tools like sendWhatsAppMedia
              conversationId: triggerContext.conversationId || null,
              accountId: triggerContext.accountId || null,
              externalId: triggerContext.externalId || null,
              platform: triggerContext.platform || null,
              sender: triggerContext.sender || null,
              // Full trigger context for async CLI execution (needs conversation info + _onIntermediateRespond)
              _triggerContext: triggerContext,
            };

            let toolResult;
            try {
              console.log(`[DEBUG] Executing tool: ${call.action} via recovery wrapper`);
              const { getRecoveryStrategies } = require('./RecoveryStrategies.cjs');
              const recovery = getRecoveryStrategies();
              toolResult = await recovery.executeWithRecovery(
                this.executeTool.bind(this), call.action, call.params, toolContext
              );
              console.log(`[DEBUG] Tool ${call.action} completed: success=${toolResult?.success}`);
            } catch (recoveryErr) {
              console.log(`[DEBUG] Recovery failed for ${call.action}, trying direct: ${recoveryErr.message}`);
              // Fallback to direct execution if recovery module fails
              toolResult = await this.executeTool(call.action, call.params, toolContext);
              console.log(`[DEBUG] Direct execution completed: success=${toolResult?.success}`);
            }

            const toolDuration = Date.now() - toolStartTime;
            console.log(`[DEBUG] Tool ${call.action} duration: ${toolDuration}ms, proceeding to emit event`);

            // ── ASYNC CLI HANDLING ──
            // If the tool returned async:true, the CLI process is running in background.
            // Feed this info back to the AI so it knows to proceed without waiting.
            // Results will be delivered to the user automatically when the CLI completes.
            if (toolResult.success && toolResult.result && toolResult.result.async === true) {
              const asyncTrackingId = toolResult.result.trackingId;
              logger.info(`[ReasoningLoop] Tool ${call.action} started async execution: ${asyncTrackingId}`);

              this._emitAgenticEvent(profile.user_id, agentId, 'agentic:tool:result', {
                toolName: call.action, success: true,
                summary: `Async execution started (tracking: ${asyncTrackingId})`,
                duration: toolDuration, async: true,
                timestamp: new Date().toISOString(),
              });

              actions.push({
                tool: call.action,
                params: call.params,
                reasoning: call.reasoning,
                status: 'async_started',
                result: { trackingId: asyncTrackingId, async: true },
              });

              // Tell the AI the task is running in background
              messages.push({ role: 'assistant', content: `[Called ${call.action}]` });
              messages.push({
                role: 'user',
                content: `Tool "${call.action}" started a background task (tracking: ${asyncTrackingId}). ` +
                  `The result will be delivered to the user automatically when complete — you have already notified them. ` +
                  `You do NOT need to wait. Proceed with "done" unless you have other tasks to handle.`,
              });
              toolCallCount++;
              continue; // Skip normal tool result handling, move to next tool call or iteration
            }

            // Phase 4: Emit tool result event
            this._emitAgenticEvent(profile.user_id, agentId, 'agentic:tool:result', {
              toolName: call.action, success: toolResult.success,
              summary: this.summarizeToolResult(call.action, toolResult.success ? toolResult.result : toolResult.error, 200),
              duration: toolDuration,
              recoveryApplied: toolResult.recoveryApplied || false,
              attempts: toolResult.attempts || 1,
              usedAlternativeTool: toolResult.usedAlternativeTool || null,
              timestamp: new Date().toISOString(),
            });

            const actionRecord = {
              tool: toolResult.usedAlternativeTool || call.action,
              params: call.params,
              reasoning: call.reasoning,
              status: toolResult.success ? 'executed' : 'failed',
              result: toolResult.success ? toolResult.result : toolResult.error,
              recoveryApplied: toolResult.recoveryApplied || false,
              attempts: toolResult.attempts || 1,
            };

            // Track executed tools for self-audit feedback
            if (toolResult.success) {
              executedToolNames.push(toolResult.usedAlternativeTool || call.action);

              // Phase 5: Micro-XP gain on successful tool use (+1 XP)
              this._awardMicroXP(agentId, toolResult.usedAlternativeTool || call.action);
            }

            // Incremental response: if respond tool was called and we have a callback,
            // send the message immediately to the user and continue the loop
            if (call.action === 'respond' && toolResult.success && toolResult.result?.message
                && typeof triggerContext._onIntermediateRespond === 'function') {
              // Sanitize: don't send raw error output to user via respond tool
              if (this._looksLikeErrorOutput(toolResult.result.message)) {
                logger.warn(`[ReasoningLoop] Blocking respond with error content: ${toolResult.result.message.substring(0, 150)}...`);
                actionRecord.status = 'blocked_error_content';
                actions.push(actionRecord);
                toolCallCount++;
                continue;
              }
              // Sanitize: don't send placeholder/template text to user
              if (this._looksLikePlaceholderText(toolResult.result.message)) {
                logger.warn(`[ReasoningLoop] Blocking respond with placeholder text: ${toolResult.result.message.substring(0, 150)}...`);
                actionRecord.status = 'blocked_placeholder_text';
                actions.push(actionRecord);
                toolCallCount++;
                // Feed error back so AI knows to use tools first
                messages.push({ role: 'assistant', content: `respond("${toolResult.result.message.substring(0, 100)}...")` });
                messages.push({
                  role: 'user',
                  content: 'ERROR: Your respond message contained placeholder text (e.g. [Insert...], [timestamp]). You MUST use data tools (searchContacts, getMessages, etc.) FIRST to get real data, then use "respond" with the actual results. Never send template text.',
                });
                continue;
              }
              try {
                await triggerContext._onIntermediateRespond(toolResult.result.message);
                actionRecord.sentImmediately = true;
                totalRespondsSent++;
                logger.info(`[ReasoningLoop] Incremental response sent (${toolResult.result.message.length} chars, total=${totalRespondsSent}/${MAX_RESPONDS_PER_RUN}), continuing loop`);
              } catch (sendErr) {
                logger.warn(`[ReasoningLoop] Failed to send incremental response: ${sendErr.message}`);
              }

              // Hard cap: stop loop if we've sent MAX_RESPONDS_PER_RUN messages
              if (totalRespondsSent >= MAX_RESPONDS_PER_RUN) {
                logger.warn(`[ReasoningLoop] Stopping loop: total respond cap reached (${totalRespondsSent}/${MAX_RESPONDS_PER_RUN})`);
                actions.push(actionRecord);
                toolCallCount++;
                finalThought = toolResult.result.message;
                respondCapReached = true; // Signal outer loop to stop
                break; // Break inner toolCalls loop
              }

              // Guard: detect consecutive respond-only iterations (AI re-acknowledging persona)
              // If the ONLY tool call in this iteration is "respond" with no other tools,
              // allow the first one (acknowledgment) but stop on the second consecutive one.
              // Threshold >= 2 allows: respond(ack) → tools → respond(results) flow.
              if (toolCalls.length === 1 && toolCalls[0].action === 'respond') {
                consecutiveRespondOnlyCount++;
                if (consecutiveRespondOnlyCount >= 2) {
                  logger.warn(`[ReasoningLoop] Stopping loop: ${consecutiveRespondOnlyCount} consecutive respond-only iterations (likely re-acknowledging persona)`);
                  actions.push(actionRecord);
                  toolCallCount++;
                  finalThought = toolResult.result.message;
                  respondCapReached = true; // Signal outer loop to stop
                  break; // Break inner toolCalls loop
                }
              } else {
                consecutiveRespondOnlyCount = 0;
              }

              // Feed result back to AI and continue (don't stop the loop)
              const originalTask = triggerContext.preview || triggerContext.situation || '';
              const taskReminder = originalTask
                ? `\nReminder - the user's original request was: "${originalTask.substring(0, 300)}"\nFocus on completing THIS request.`
                : '';
              const respondFeedback = `Your response has been sent to the user. If you need to do more work for this request (research, delegation, follow-up), continue. If you have fully addressed the request, use the "done" action to finish. Do NOT re-introduce yourself or re-acknowledge your persona/instructions.${taskReminder}`;

              if (usedNativeTools && call._nativeToolCallId) {
                // NATIVE PATH: Use OpenAI tool result format
                if (!nativeAssistantMsgAdded) {
                  messages.push({ role: 'assistant', content: aiResponse || null, tool_calls: nativeToolCalls });
                  nativeAssistantMsgAdded = true;
                }
                messages.push({ role: 'tool', tool_call_id: call._nativeToolCallId, content: respondFeedback });
              } else {
                // TEXT PATH: Existing user/assistant message pattern
                messages.push({ role: 'assistant', content: aiResponse });
                messages.push({ role: 'user', content: respondFeedback });
              }
              actions.push(actionRecord);
              toolCallCount++;
              continue;
            }

            actions.push(actionRecord);

            // Log this tool execution
            this.logActivity(db, agentId, profile.user_id, 'tool_execution', trigger, {
              tool: call.action, params: call.params, success: toolResult.success,
              result: toolResult.success ? toolResult.result : undefined,
              error: toolResult.error,
            });

            // Emit reasoning:tool_call hook
            try {
              const { getHookRegistry } = require('./HookRegistry.cjs');
              getHookRegistry().emitAsync('reasoning:tool_call', {
                agenticId: agentId, userId: profile.user_id,
                tool: call.action, success: toolResult.success,
              });
            } catch (e) { /* hooks optional */ }

            // Feed result back to AI with running tally of executed tools
            let feedbackContent;
            if (toolResult.success) {
              const altNote = toolResult.usedAlternativeTool
                ? ` (via alternative tool "${toolResult.usedAlternativeTool}")`
                : '';
              feedbackContent = `Tool "${call.action}" executed successfully${altNote}. Result: ${this.summarizeToolResult(call.action, toolResult.result)}\n[Tools executed so far: ${executedToolNames.join(', ')}]`;
            } else {
              // Phase 1: Enriched error feedback with recovery suggestions
              const recovery = toolResult.recovery || {};
              const errorType = recovery.errorType ? ` [${recovery.errorType}]` : '';
              const suggestion = recovery.suggestion ? `\nSuggestion: ${recovery.suggestion}` : '';
              const alternatives = recovery.alternatives?.length > 0
                ? `\nAvailable alternative tools: ${recovery.alternatives.join(', ')}`
                : '';
              feedbackContent = `Tool "${call.action}" failed${errorType}: ${toolResult.error}${suggestion}${alternatives}\n[Tools executed so far: ${executedToolNames.join(', ')}]`;
            }

            if (usedNativeTools && call._nativeToolCallId) {
              // NATIVE PATH: Use OpenAI tool result format
              if (!nativeAssistantMsgAdded) {
                messages.push({ role: 'assistant', content: aiResponse || null, tool_calls: nativeToolCalls });
                nativeAssistantMsgAdded = true;
              }
              messages.push({ role: 'tool', tool_call_id: call._nativeToolCallId, content: feedbackContent });
            } else {
              // TEXT PATH: Existing user/assistant message pattern
              messages.push({ role: 'assistant', content: aiResponse });
              messages.push({ role: 'user', content: feedbackContent });
            }
          }

          toolCallCount++;
        }

        // Check if respond cap was reached in inner loop - break outer loop too
        if (respondCapReached) break;

        // Mid-loop reflection checkpoint: every 3 tool executions, re-ground the AI
        if (toolCallCount > 0 && toolCallCount % 3 === 0 && i < maxIterations - 1) {
          const originalTask = triggerContext.preview || triggerContext.situation || '';
          messages.push({
            role: 'user',
            content: `=== CHECKPOINT ===\nOriginal request: "${originalTask.substring(0, 300)}"\nTools used: [${executedToolNames.join(', ')}]\nAre you making progress? Do NOT repeat tools with the same parameters.\nIf you have enough info, use "respond" with findings then "done".`,
          });
          logger.info(`[ReasoningLoop] Reflection checkpoint at ${toolCallCount} tool calls`);
        }

        if (toolCallCount >= maxToolCallsPerCycle) break;
      }

      console.log(`[DEBUG] Loop exited after ${iterations} iterations, ${actions.length} actions, finalThought=${finalThought ? 'set' : 'empty'}`);

      // If finalThought is empty after exhausting tool budget, synthesize one from actions
      if (!finalThought && actions.length > 0) {
        const executedActions = actions.filter(a => a.status === 'executed');
        if (executedActions.length > 0) {
          const actionSummaries = executedActions.map(a => {
            if (a.tool === 'respond') return null; // already handled
            if (a.tool === 'handoffToAgent') return `Delegated task to agent`;
            if (a.tool === 'delegateTask') return `Delegated task`;
            if (a.tool === 'createTask') return `Created task: ${a.params?.title || a.params?.description || 'task'}`;
            if (a.tool === 'searchWeb') return `Searched the web`;
            if (a.tool === 'ragQuery') return `Searched knowledge base`;
            if (a.tool === 'listTeamMembers') return `Checked team members`;
            if (a.tool === 'getMyProfile') return `Checked profile`;
            if (a.tool === 'orchestrate') return `Orchestrated sub-agents`;
            return `Used ${a.tool}`;
          }).filter(Boolean);

          if (actionSummaries.length > 0) {
            finalThought = `Actions completed: ${actionSummaries.join('; ')}. Tool budget exhausted before explicit response.`;
            logger.info(`[ReasoningLoop] Synthesized finalThought from ${executedActions.length} actions: ${finalThought}`);
          }
        }
      }

      // Log cycle completion
      this.logActivity(db, agentId, profile.user_id, 'reasoning_cycle_end', trigger, {
        iterations, tokensUsed, actionsCount: actions.length, finalThought,
      });

      // Emit reasoning:end hook
      try {
        const { getHookRegistry } = require('./HookRegistry.cjs');
        getHookRegistry().emitAsync('reasoning:end', {
          agenticId: agentId, userId: profile.user_id,
          trigger, iterations, tokensUsed,
          actions, finalThought,
        });
      } catch (e) { /* hooks optional */ }

      // Phase 4: Emit reasoning complete WebSocket event
      this._emitAgenticEvent(profile.user_id, agentId, 'agentic:reasoning:complete', {
        trigger, iterations, tokensUsed,
        actionCount: actions.length,
        successCount: actions.filter(a => a.status === 'executed').length,
        failCount: actions.filter(a => a.status === 'failed').length,
        finalThought: finalThought?.substring(0, 300),
        mode: 'reactive',
        timestamp: new Date().toISOString(),
      });

      // Phase 2: Post-execution reflection and learning (fire-and-forget — MUST NOT block result return)
      const result = { actions, iterations, tokensUsed, finalThought };
      console.log(`[DEBUG] Starting reflection (fire-and-forget) for agent ${agentId}`);
      this._reflectOnExecution(agentId, profile.user_id, trigger, triggerContext, result)
        .catch(e => console.error(`[DEBUG] Reflection failed: ${e.message}`));

      // Phase 7: Mark checkpoint complete on normal exit
      try {
        const { getReasoningCheckpoint } = require('./ReasoningCheckpoint.cjs');
        getReasoningCheckpoint().completeCheckpoint(agentId);
      } catch (cpErr) { /* best-effort */ }

      console.log(`[DEBUG] Returning result: ${result.iterations} iterations, ${result.actions?.length} actions, finalThought=${result.finalThought ? result.finalThought.substring(0, 80) : 'null'}`);
      return result;
    } catch (error) {
      // Use safeLog so a broken logger can't prevent the re-throw below
      const { safeLog } = require('../logger.cjs');
      safeLog('error', `[ReasoningLoop] Error for agent ${agentId}: ${error.message}`);

      // Phase 7: Mark checkpoint failed on error
      try {
        const { getReasoningCheckpoint } = require('./ReasoningCheckpoint.cjs');
        getReasoningCheckpoint().failCheckpoint(agentId);
      } catch (cpErr) { /* best-effort */ }

      // Phase 4: Emit error event
      try {
        this._emitAgenticEvent(null, agentId, 'agentic:error', {
          error: error.message, trigger,
          timestamp: new Date().toISOString(),
        });
      } catch (_) { /* best-effort */ }

      // Notify user via dashboard bell
      try {
        const userId = profile?.user_id;
        if (userId) {
          const { emitUserNotification } = require('../notificationEmitter.cjs');
          emitUserNotification(userId, {
            type: 'error',
            title: 'Agent Error',
            message: `Agent reasoning failed: ${error.message.substring(0, 200)}`,
            duration: 10000,
          });
        }
      } catch (_) { /* best-effort */ }

      // Phase 1b: Throw so caller (watchdog) can send user-facing error
      // Previously returned { finalThought: "Error:..." } which was filtered out by mapReasoningResult
      throw error;
    } finally {
      this.runningLoops.delete(lockKey);
    }
  }

  // =====================================================
  // CONTEXT BUILDING
  // =====================================================

  buildSystemPrompt(agentId, profile, trigger, triggerContext) {
    // Gather all sections - NO truncation. Let the AI provider handle its own context window.
    const sections = this.gatherPromptSections(agentId, profile, trigger, triggerContext);
    const fullPrompt = sections.map(s => s.content).join('\n\n');
    const estimatedTokens = this.estimateTokens(fullPrompt);
    logger.info(`[ReasoningLoop] System prompt assembled: ~${estimatedTokens} tokens (${sections.length} sections: ${sections.map(s => s.id).join(', ')})`);
    return fullPrompt;
  }

  /**
   * Gather all prompt sections. No truncation - let the AI provider handle context limits.
   * @private
   */
  gatherPromptSections(agentId, profile, trigger, triggerContext) {
    const sections = [];

    // 1. Personality - agent identity, soul, operating instructions
    try {
      const { getPersonalityService } = require('./PersonalityService.cjs');
      const personalityPrompt = getPersonalityService().generateSystemPrompt(agentId);
      if (personalityPrompt) {
        sections.push({ id: 'personality', content: personalityPrompt });
      }
    } catch (e) {
      const fallback = profile.system_prompt || `You are ${profile.name}, a ${profile.role || 'AI agent'}.`;
      sections.push({ id: 'personality', content: fallback });
    }

    // 2. Agent context - goals, skills, team, tasks, background
    try {
      const { getPersonalityService } = require('./PersonalityService.cjs');
      const context = getPersonalityService().gatherAgentContext(agentId);

      // Enrich context with master contact name and familiarity
      if (profile.master_contact_id) {
        try {
          const db = getDatabase();
          const masterContact = db.prepare('SELECT display_name FROM contacts WHERE id = ?').get(profile.master_contact_id);
          if (masterContact) {
            context.masterContactName = masterContact.display_name;
            context.masterContactChannel = profile.master_contact_channel || 'whatsapp';
          }
          // Phase 2b: Add master familiarity from trigger context
          if (triggerContext?.masterFamiliarity) {
            context.masterFamiliarity = triggerContext.masterFamiliarity;
          }
        } catch (e) { /* master contact lookup optional */ }
      }

      // Enrich context with knowledge libraries available to this agent
      try {
        const db = getDatabase();
        const libraries = db.prepare(`
          SELECT id, name, description FROM knowledge_libraries WHERE user_id = ?
        `).all(profile.user_id);
        if (libraries.length > 0) {
          context.knowledgeLibraries = libraries.map(l => ({
            id: l.id,
            name: l.name,
            description: l.description || '',
          }));
        }
      } catch (e) { /* knowledge library lookup optional */ }

      const contextStr = this.formatAgentContext(context);
      sections.push({ id: 'context', content: contextStr });
    } catch (e) {
      logger.debug(`[ReasoningLoop] Could not gather agent context: ${e.message}`);
    }

    // 3. Recent memories (use message content for search, not generic event name)
    try {
      const { getAgenticMemoryService } = require('./AgenticMemoryService.cjs');
      const memService = getAgenticMemoryService();
      // Build a content-aware search query instead of generic "event: incoming_message"
      let memoryQuery;
      if (trigger === 'event' && triggerContext.event === 'incoming_message') {
        // Use actual message content + sender for relevant memory retrieval
        // Skip memory search for media-only messages (no text = no meaningful query)
        const senderPart = triggerContext.sender ? `from ${triggerContext.sender}` : '';
        const rawPreview = (triggerContext.preview || '').replace(/---\s*Enriched Data\s*---[\s\S]*/i, '').trim();
        const contentPart = rawPreview.substring(0, 100);
        memoryQuery = (contentPart && contentPart.length > 3) ? `${senderPart} ${contentPart}`.trim() : null;
        if (!memoryQuery) {
          logger.info(`[ReasoningLoop] Skipping memory search: no meaningful text content (media-only message)`);
        }
      } else {
        memoryQuery = `${trigger}: ${triggerContext.situation || triggerContext.event || ''}`;
      }
      // Skip memory search if no meaningful query (avoids irrelevant matches)
      const memories = memoryQuery && memService.searchMemoriesSync
        ? memService.searchMemoriesSync(agentId, profile.user_id, memoryQuery, 5)
        : [];
      if (memories.length > 0) {
        const memText = '\n=== RECENT MEMORIES ===\n' +
          memories.map((m, i) => `${i + 1}. ${m.content} (importance: ${m.importance_score || 'unknown'})`).join('\n');
        sections.push({ id: 'memories', content: memText });
      }
    } catch (e) {
      // Memory search is optional
    }

    // 4. Available tools + instructions (tier-aware: fewer instructions for simple tiers)
    const tools = this.selectToolsForAgent(agentId, profile, triggerContext);
    const tier = triggerContext._classifiedTier || 'moderate';
    const toolText = this.formatToolInstructions(tools, profile.autonomy_level, tier);
    sections.push({ id: 'tools', content: toolText });

    // 5. Connected Local Agents (Phase 5.2 — device awareness)
    try {
      const { getLocalAgentGateway } = require('../LocalAgentGateway.cjs');
      const gateway = getLocalAgentGateway();
      const onlineAgentIds = gateway.getOnlineAgents(profile.user_id);

      if (onlineAgentIds.length > 0) {
        const db = getDatabase();
        const agentsList = onlineAgentIds.map(id => {
          const la = db.prepare(
            'SELECT name, hostname, os_type, tool_registry, capabilities, mcp_tools FROM local_agents WHERE id = ?'
          ).get(id);
          if (!la) return null;
          let tools = {};
          try { tools = JSON.parse(la.tool_registry || '{}'); } catch { /* ignore */ }
          let caps = [];
          try { caps = JSON.parse(la.capabilities || '[]'); } catch { /* ignore */ }
          let mcpTools = [];
          try { mcpTools = JSON.parse(la.mcp_tools || '[]'); } catch { /* ignore */ }
          return { name: la.name, hostname: la.hostname, os: la.os_type, tools, capabilities: caps, mcpTools };
        }).filter(Boolean);

        if (agentsList.length > 0) {
          let text = '\n=== CONNECTED LOCAL AGENTS ===\n';
          text += 'You can execute commands on these devices using executeOnLocalAgent(agentName, command, params):\n\n';

          for (const a of agentsList) {
            text += `### ${a.name} (Online)\n`;
            text += `- Hostname: ${a.hostname || 'unknown'}, OS: ${a.os || 'unknown'}\n`;
            if (a.capabilities.length > 0) {
              text += `- Commands: ${a.capabilities.join(', ')}\n`;
            }
            const installedTools = Object.entries(a.tools)
              .filter(([, v]) => v.installed)
              .map(([k, v]) => `${k}${v.version ? ' v' + v.version : ''}`);
            if (installedTools.length > 0) {
              text += `- Dev Tools: ${installedTools.join(', ')}\n`;
            }

            // MCP tools (Phase 5.3)
            if (a.mcpTools && a.mcpTools.length > 0) {
              const byServer = {};
              for (const t of a.mcpTools) {
                const srv = t.server || 'unknown';
                if (!byServer[srv]) byServer[srv] = [];
                byServer[srv].push(t.name);
              }
              text += `- MCP Servers:\n`;
              for (const [srv, toolNames] of Object.entries(byServer)) {
                text += `  - ${srv}: ${toolNames.join(', ')}\n`;
              }
              text += `  Usage: executeOnLocalAgent("${a.name}", "mcp", {"server": "<name>", "tool": "<tool>", "args": {...}})\n`;
            }
            text += '\n';
          }

          text += 'When user asks to run commands, access files ON THEIR DEVICE, take screenshots, use local tools, or use MCP tools (browser automation, etc.) on their device → use executeOnLocalAgent.\n';
          text += 'NOTE: Files received via WhatsApp/Telegram/Email are stored on the SERVER — use backend tools (readPdf, readDocx, extractTextFromImage, etc.) for those. Do NOT use executeOnLocalAgent for incoming message attachments.\n';
          text += 'NOTE: "Claude CLI tools" / "Gemini CLI" / "OpenCode CLI" refers to SERVER-SIDE tools (claudeCliPrompt, geminiCliPrompt, opencodeCliPrompt) — NOT executeOnLocalAgent.\n';
          text += '\n### Advanced Commands (Phase 5.4)\n';
          text += '- **cliSession**: Delegate AI tasks to Claude/Gemini/OpenCode CLI on user\'s device. Params: {cliType: "claude"|"gemini"|"opencode", prompt: "...", cwd?: "path", timeout?: ms}\n';
          text += '- **fileTransfer**: Read files up to 10MB as base64 (larger than fileRead\'s 1MB). Params: {path: "..."}\n';
          text += '- **clipboard**: Read or write system clipboard. Params: {action: "read"} or {action: "write", text: "..."}\n';
          text += '- **capture**: Camera photo or microphone recording via ffmpeg. Params: {type: "camera"|"microphone"|"list_devices", device?, duration?}. NOTE: Screen recording is NOT supported — only camera and microphone.\n';
          text += '\n**File Transfer Flow**: Use fileTransfer to get base64 → then uploadToTempStorage to create a download URL → share URL with user.\n';
          if (agentsList.length === 1) {
            text += `Only 1 device online ("${agentsList[0].name}") — use it directly without asking.\n`;
          } else {
            text += 'If unclear which device, ask the user which one to use.\n';
          }

          sections.push({ id: 'local-agents', content: text });
        }
      }
    } catch (e) {
      // Local agent lookup is optional — don't break prompt assembly
      logger.debug(`[ReasoningLoop] Local agent context failed: ${e.message}`);
    }

    // 6. Paired Mobile Devices (phone SMS, notifications, GPS monitoring)
    try {
      const { getMobileAgentGateway } = require('../MobileAgentGateway.cjs');
      const gateway = getMobileAgentGateway();
      const db = getDatabase();

      const mobileDevices = db.prepare(
        "SELECT id, name, phone_number, device_model, is_online FROM mobile_agents WHERE user_id = ? AND status = 'active'"
      ).all(profile.user_id);

      if (mobileDevices.length > 0) {
        let text = '\n=== PAIRED MOBILE DEVICES ===\n';
        text += 'You can monitor the master\'s phone using mobile tools:\n';
        text += '- queryMobileEvents: search SMS, notifications, missed calls, OTPs, app alerts\n';
        text += '- getMobileDeviceStatus: battery, WiFi/cellular, screen state\n';
        text += '- getMobileDeviceLocation: GPS coordinates, last known position\n';
        text += '- sendSmsViaDevice: send SMS through the phone\'s SIM card\n';
        text += '- markMobileEventRead: mark events as processed\n\n';

        for (const d of mobileDevices) {
          const isOnline = gateway.isOnline(d.id);
          text += `### ${d.name} (${isOnline ? 'Online' : 'Offline'})\n`;
          text += `- Model: ${d.device_model || 'unknown'}\n`;
          if (d.phone_number) text += `- Phone: ${d.phone_number}\n`;

          if (isOnline) {
            const status = gateway.getDeviceStatus(d.id);
            if (status) {
              text += `- Battery: ${status.batteryLevel ?? '?'}%${status.batteryCharging ? ' (charging)' : ''}\n`;
              text += `- WiFi: ${status.wifiConnected ? 'connected' : 'disconnected'}, Cellular: ${status.cellularType || 'unknown'}\n`;
              if (status.latitude != null && status.longitude != null) {
                text += `- GPS: ${status.latitude}, ${status.longitude} (accuracy: ${status.locationAccuracy || '?'}m)\n`;
              }
            }
          }
          text += '\n';
        }

        text += 'Use queryMobileEvents to check for new SMS, OTPs, or missed calls. Important events (OTPs, security alerts, missed calls, low battery) are auto-flagged.\n';
        text += 'NOTE: Mobile events are from the PHONE (SMS, app notifications, calls). Platform messages (WhatsApp, Telegram, Email) come from platform tools — do NOT confuse them.\n';

        sections.push({ id: 'mobile-agents', content: text });
      }
    } catch (e) {
      logger.debug(`[ReasoningLoop] Mobile agent context failed: ${e.message}`);
    }

    return sections;
  }

  /**
   * Estimate token count from text (~4 chars per token)
   * @param {string} text
   * @returns {number}
   */
  estimateTokens(text) {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
  }

  /**
   * Truncate conversation messages using content-aware head-tail split.
   * Preserves tool result messages from the middle (they contain critical data).
   * Only truncates conversation messages, NOT the system prompt.
   * @param {Array} messages - Conversation messages
   * @returns {Array} Truncated messages
   */
  truncateMessages(messages) {
    const { headMessages, tailMessages, maxConversationMessages } = this.contextBudget;

    // Only truncate if we exceed max conversation messages
    if (messages.length <= maxConversationMessages) {
      return messages;
    }

    const head = messages.slice(0, headMessages);
    const tail = messages.slice(-tailMessages);
    const middle = messages.slice(headMessages, -tailMessages);

    // From the middle, preserve tool result messages (they contain critical data)
    const MAX_PRESERVED = 4;
    const preserved = [];
    for (const msg of middle) {
      if (preserved.length >= MAX_PRESERVED) break;
      if (msg.role === 'user' && msg.content && msg.content.startsWith('Tool "')) {
        let content = msg.content;
        // Summarize if too long
        if (content.length > 300) {
          const toolMatch = content.match(/^Tool "([^"]+)"/);
          const toolName = toolMatch ? toolMatch[1] : 'unknown';
          const isSuccess = content.includes('executed successfully');
          content = isSuccess
            ? `Tool "${toolName}" succeeded. [result summarized, ${msg.content.length} chars]`
            : `Tool "${toolName}" failed. [details truncated]`;
        }
        preserved.push({ ...msg, content });
      }
    }

    const trimmedCount = middle.length - preserved.length;
    const summaryParts = [`...${trimmedCount} earlier messages trimmed.`];
    if (preserved.length > 0) {
      summaryParts.push(`${preserved.length} tool results preserved.`);
    }
    summaryParts.push('Key context in system prompt.');

    const marker = {
      role: 'system',
      content: `[${summaryParts.join(' ')}]`,
    };

    logger.debug(`[ReasoningLoop] Messages truncated: ${messages.length} -> ${head.length + 1 + preserved.length + tail.length} (${trimmedCount} trimmed, ${preserved.length} tool results preserved)`);
    return [...head, marker, ...preserved, ...tail];
  }

  formatAgentContext(context) {
    const parts = ['\n=== YOUR CURRENT CONTEXT ==='];

    if (context.profile) {
      parts.push(`Role: ${context.profile.role || 'AI Agent'}`);
      parts.push(`Autonomy: ${context.profile.autonomy_level || 'supervised'}`);
    }

    // Master contact identification (critical for recognizing owner messages)
    if (context.masterContactName) {
      parts.push(`\nYour Master/Owner: "${context.masterContactName}" (via ${context.masterContactChannel || 'whatsapp'})`);
      parts.push('Messages from your master are direct instructions - respond helpfully and immediately without requiring approval.');

      // Phase 2b: Familiarity-based communication guidance
      if (context.masterFamiliarity) {
        const { count, level } = context.masterFamiliarity;
        parts.push(`\nMaster Familiarity: ${level} (${count} interactions)`);
        if (level === 'new') {
          parts.push('This is an early interaction with your master. Be attentive, introduce your capabilities briefly, and confirm understanding of requests. Use a welcoming, slightly formal tone.');
        } else if (level === 'developing') {
          parts.push('You are building rapport with your master. Be helpful and proactive but not overly familiar. Reference past interactions when relevant.');
        } else if (level === 'established') {
          parts.push('You have a well-established working relationship with your master. Be efficient and direct. Skip lengthy introductions. Anticipate needs based on patterns.');
        } else if (level === 'deep') {
          parts.push('You have an extensive history with your master. Be confident and efficient. Use shorthand when appropriate. Proactively suggest improvements based on known preferences.');
        }
      }
    }

    if (context.goals?.length > 0) {
      parts.push('\nActive Goals:');
      context.goals.forEach((g, i) => {
        parts.push(`  ${i + 1}. ${g.title} (${g.priority || 'normal'} priority, ${g.status})`);
      });
    }

    if (context.skills?.length > 0) {
      const levelNames = { 1: 'Beginner', 2: 'Intermediate', 3: 'Advanced', 4: 'Expert' };
      parts.push('\nYour Skills & Expertise:');
      context.skills.forEach(s => {
        const levelName = levelNames[s.current_level] || 'Beginner';
        parts.push(`  - ${s.name} (${s.category}) — Level ${s.current_level} (${levelName})`);
        if (s.current_level >= 3) {
          parts.push(`    You are highly proficient at ${s.category} tasks. Use advanced tools confidently.`);
        } else if (s.current_level === 1) {
          parts.push(`    You are learning ${s.category}. Prefer simpler approaches and verify results.`);
        }
      });
      const expertSkills = context.skills.filter(s => s.current_level >= 3);
      if (expertSkills.length > 0) {
        parts.push(`\nLeverage your expertise in: ${expertSkills.map(s => s.name).join(', ')}`);
      }
    }

    if (context.teamMembers?.length > 0) {
      parts.push(`\nTeam: ${context.teamMembers.length} members`);
    }

    if (context.schedules?.length > 0) {
      parts.push('\nActive Schedules:');
      context.schedules.forEach(s => {
        parts.push(`  - ${s.title} (${s.schedule_type}: ${s.action_type})`);
      });
    }

    if (context.monitoring?.length > 0) {
      parts.push('\nMonitoring:');
      context.monitoring.forEach(m => {
        parts.push(`  - ${m.source_name} (${m.source_type}, priority: ${m.priority || 'normal'})`);
      });
    }

    if (context.tasks?.length > 0) {
      const active = context.tasks.filter(t => t.status !== 'completed');
      const completed = context.tasks.filter(t => t.status === 'completed');

      if (active.length > 0) {
        parts.push(`\nActive Tasks (${active.length}):`);
        active.forEach((t, i) => {
          const priority = t.priority === 'urgent' ? '[URGENT]' : t.priority === 'high' ? '[HIGH]' : '';
          const due = t.due_at ? ` due:${t.due_at.split('T')[0]}` : '';
          parts.push(`  ${i + 1}. [taskId:${t.id}] ${priority} ${t.title} (${t.status})${due}`);
          if (t.assignee_name) parts.push(`     Assigned to: ${t.assignee_name}`);
          if (t.ai_summary) parts.push(`     ${t.ai_summary.substring(0, 80)}`);
        });
        parts.push('  Use the taskId shown in [taskId:...] when calling updateTaskStatus.');
      }

      if (completed.length > 0) {
        parts.push(`\nRecently Completed Tasks (${completed.length}):`);
        completed.forEach((t, i) => {
          parts.push(`  ${i + 1}. [taskId:${t.id}] ${t.title} (completed${t.completed_at ? ' ' + t.completed_at.split('T')[0] : ''})`);
          if (t.ai_summary) parts.push(`     Result: ${t.ai_summary.substring(0, 100)}`);
        });
      }
    }

    if (context.knowledgeLibraries?.length > 0) {
      parts.push('\nKnowledge Libraries (use ragQuery to search):');
      context.knowledgeLibraries.forEach(l => {
        parts.push(`  - "${l.name}": ${l.description || 'No description'} [libraryId: ${l.id}]`);
      });
      parts.push('IMPORTANT: When asked about topics covered by your knowledge libraries, ALWAYS use ragQuery FIRST before searching the web.');
      parts.push('You can target a specific library with libraryId, or omit it to search ALL libraries.');
    }

    return parts.join('\n');
  }

  formatToolInstructions(tools, autonomyLevel, tier = 'moderate') {
    const parts = ['\n=== AVAILABLE TOOLS ==='];
    const isSimpleTier = (tier === 'trivial' || tier === 'simple');

    // Compact format: tool_id(required_params) - description
    tools.forEach((tool, i) => {
      const reqParams = (tool.requiredParams || []).join(', ');
      const optParams = Object.entries(tool.parameters || {})
        .filter(([name]) => !(tool.requiredParams || []).includes(name))
        .map(([name]) => name)
        .join(', ');
      const paramStr = reqParams
        ? `(${reqParams}${optParams ? `, [${optParams}]` : ''})`
        : optParams ? `([${optParams}])` : '()';
      parts.push(`${i + 1}. ${tool.id}${paramStr} - ${tool.description}`);
    });

    parts.push('');
    parts.push('=== OUTPUT FORMAT ===');
    parts.push('You may include brief reasoning before your tool call. Output exactly ONE tool call per response.');
    parts.push('Use this JSON format inside a fenced block:');
    parts.push('```tool');
    parts.push('{"action": "toolName", "params": {"key": "value"}, "reasoning": "why"}');
    parts.push('```');
    parts.push('Special actions:');
    parts.push('- {"action": "done", "reasoning": "summary of what you accomplished"} - when finished');
    parts.push('- {"action": "silent", "reasoning": "why"} - when no response needed');
    parts.push('');

    if (isSimpleTier) {
      // Simplified response sequence for simple/trivial messages (greetings, quick queries)
      // Reduces iterations from 4 to 2: respond + done
      parts.push('=== RESPONSE INSTRUCTIONS ===');
      parts.push('This is a simple message. Respond directly and concisely:');
      parts.push('1. Use "respond" with your answer (1 tool call)');
      parts.push('2. Use "done" to finish');
      parts.push('Do NOT use an acknowledge-then-report pattern for simple messages. Just reply directly.');
      parts.push('Each "respond" sends a real-time message to the user immediately.');
      parts.push('');
      parts.push('RULES: Never fabricate data. Never mention tool names to users. Be honest if something fails.');
    } else {
      // Full response sequence for moderate/complex/critical tasks
      parts.push('=== RESPONSE SEQUENCE (for incoming messages) ===');
      parts.push('Follow this sequence when handling a user message:');
      parts.push('1. ACKNOWLEDGE: Use "respond" with a SHORT acknowledgment ONLY (1-2 sentences, e.g. "Got it! Let me check that for you.")');
      parts.push('2. EXECUTE: Use research/action tools (searchContacts, getConversations, getMessages, searchWeb, ragQuery, etc.)');
      parts.push('3. REPORT: Use "respond" again with your ACTUAL findings from the tool results');
      parts.push('4. FINISH: Use "done" to end');
      parts.push('Each "respond" sends a real-time message to the user immediately.');
      parts.push('');
      parts.push('CRITICAL ANTI-TEMPLATE RULE:');
      parts.push('- NEVER include placeholder text like [Insert...], [timestamp], [data here], {{variable}} in respond messages.');
      parts.push('- NEVER compose a template or skeleton response before calling data tools. The respond message is sent AS-IS to the user.');
      parts.push('- The ACKNOWLEDGE respond must ONLY be a brief confirmation, NOT a pre-formatted answer template.');
      parts.push('- GOOD: respond("Got it! Let me find the most recent message from Sakinah.")');
      parts.push('- BAD: respond("Here is the message: [Insert message content from tool results]") ← THIS GETS SENT LITERALLY');
      parts.push('- BAD: Starting with searchWeb without acknowledging first');
      parts.push('');
      parts.push('=== INTEGRITY RULES ===');
      parts.push('1. ACTIONS MUST BE REAL: Never claim you did something unless you called the tool AND it returned success.');
      parts.push('   The [Tools executed so far: ...] list shows what you ACTUALLY called.');
      parts.push('   - BAD: respond("Done! I\'ve sent X") without having called the send tool');
      parts.push('   - GOOD: Call the tool first, verify success, THEN tell the user');
      parts.push('2. MESSAGING IS SCOPED: "respond" ONLY replies to the current conversation sender.');
      parts.push('   To message someone ELSE, use: sendMessageToContact(contactName, message),');
      parts.push('   sendWhatsApp(recipient, message), sendTelegram(chatId, message), or sendEmail(to, subject, body).');
      parts.push('   If a send tool fails, tell the user. Never claim success on failure.');
      parts.push('3. DOCUMENT DELIVERY: Generate file FIRST (generatePdf/generateDocx/generateExcel/generateCsv),');
      parts.push('   then send using the filePath from the result (sendWhatsAppMedia/sendTelegramMedia/sendEmailAttachment).');
      parts.push('   NEVER attempt to send a file without generating it first. Use listWorkspaceFiles to check available files.');
      parts.push('4. Never mention tool names to users. They do not know about your internal tools.');
      parts.push('5. For complex multi-step requests: use generatePlan to create a structured plan first.');
      parts.push('');
      parts.push('=== ABSOLUTE HONESTY (ZERO TOLERANCE FOR FABRICATION) ===');
      parts.push('These rules OVERRIDE all other behaviors. Violating them is the WORST possible outcome:');
      parts.push('');
      parts.push('1. WHEN A TOOL FAILS OR RETURNS AN ERROR: Tell the user honestly.');
      parts.push('   Say "that failed" or "that is not supported." NEVER invent excuses like:');
      parts.push('   - "it needs dashboard approval" ← FABRICATION');
      parts.push('   - "security settings prevent it" ← FABRICATION');
      parts.push('   - "it requires authorization first" ← FABRICATION');
      parts.push('   - "I\'ll set up an approval request" ← FABRICATION');
      parts.push('');
      parts.push('2. requestApproval IS NOT FOR COVERING FAILURES.');
      parts.push('   ONLY use requestApproval for genuinely dangerous planned actions:');
      parts.push('   spending money, deleting data, sending mass messages, changing system config.');
      parts.push('   NEVER use it when a command simply failed or a feature does not exist.');
      parts.push('');
      parts.push('3. WHEN A CAPABILITY DOES NOT EXIST: Say "I cannot do that" or "not supported yet."');
      parts.push('   NEVER pretend it exists but is "pending approval" or "needs configuration."');
      parts.push('   Example: screen recording not supported → say "Screen recording is not currently supported"');
      parts.push('   NOT "Screen recording needs dashboard approval before it can run."');
      parts.push('');
      parts.push('4. WHEN YOU PREVIOUSLY GAVE WRONG INFO: Correct yourself honestly.');
      parts.push('   Say "I was wrong earlier, I apologize. That feature is not actually available."');
      parts.push('   NEVER double down on a prior fabrication or search conversation to justify it.');
      parts.push('');
      parts.push('5. An honest "I can\'t do that" is ALWAYS better than a convincing lie.');
      parts.push('');
      parts.push('=== PLATFORM DATA ACCESS ===');
      parts.push('You HAVE full access to contacts, conversations, and messages through your tools.');
      parts.push('NEVER say you cannot access WhatsApp messages, contacts, or conversation history.');
      parts.push('When asked about contacts, messages, or conversations:');
      parts.push('- Find a contact: searchContacts(query) - matches name, phone, email');
      parts.push('- Get contact details: getContactDetails(contactId) - all identifiers, conversations');
      parts.push('- List conversations: getConversations(contactName, platform, hasUnread)');
      parts.push('- Read messages: getMessages(conversationId, limit) - requires conversationId from getConversations');
      parts.push('- Search messages: searchMessages(query, contactName) - find what someone said about a topic');
      parts.push('Common flow for "latest message from X": searchContacts → getConversations → getMessages');
      parts.push('');
      parts.push('=== ANTI-HALLUCINATION: DATA INTEGRITY RULES ===');
      parts.push('CRITICAL: When asked about messages, conversations, or what someone said:');
      parts.push('1. You MUST use searchMessages, getConversations, or getMessages tools FIRST.');
      parts.push('2. NEVER fabricate, invent, or guess message content. Only report what the tools return.');
      parts.push('3. NEVER quote messages you did not retrieve from a tool result.');
      parts.push('4. If tools return zero results, say "I found no messages matching that" - do NOT make up content.');
      parts.push('5. If asked "did X say Y?" and tools show no match, answer "I couldn\'t find that message."');
      parts.push('6. NEVER paraphrase or embellish tool results - report them accurately.');
      parts.push('Violating these rules produces harmful misinformation. Always verify with tools before responding.');
      parts.push('');
      parts.push('=== INTERNET & SEARCH CAPABILITIES ===');
      parts.push('You HAVE full internet access through your tools. NEVER say you cannot search the web or browse the internet.');
      parts.push('You can search the web, fetch web pages, scrape content, and make HTTP API requests.');
      parts.push('If a user asks you to look something up, search for something, or find information online - USE your searchWeb tool.');
      parts.push('');
      parts.push('=== SEARCH PRIORITY ===');
      parts.push('When answering questions about topics you may have knowledge on:');
      parts.push('1. FIRST: Use ragQuery to search your knowledge libraries (internal knowledge)');
      parts.push('2. THEN: If ragQuery returns insufficient results, supplement with searchWeb (external/latest info)');
      parts.push('3. Combine both sources to give the most complete and accurate answer.');
      parts.push('For general knowledge queries, location searches, or anything requiring current data - go directly to searchWeb.');
      parts.push('Never skip ragQuery and go directly to searchWeb when the question matches your knowledge library topics.');
    }

    parts.push('');
    parts.push(`Autonomy: ${autonomyLevel || 'supervised'}.`);

    // Add orchestration guidance when orchestrate tool is available
    if (tools.some(t => t.id === 'orchestrate')) {
      parts.push('');
      parts.push('=== ORCHESTRATION ===');
      parts.push('For complex tasks requiring multiple areas of expertise:');
      parts.push('1. Break the task into 2-5 focused subtasks (each with a title, description, and requiredSkills)');
      parts.push('2. Use "orchestrate" to run them in parallel with specialist sub-agents');
      parts.push('3. Wait for results, then use "respond" with a synthesized answer combining all findings');
      parts.push('Do NOT orchestrate simple tasks - handle them directly with your own tools.');
      parts.push('Example: { "action": "orchestrate", "params": { "goal": "...", "subtasks": [{"title": "...", "description": "...", "requiredSkills": "analysis"}] } }');
    }

    return parts.join('\n');
  }

  buildUserMessage(trigger, triggerContext) {
    const parts = [];
    const now = new Date().toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur' });

    switch (trigger) {
      case 'wake_up':
        parts.push(`You just came online. Current time: ${now}.`);
        if (triggerContext.situation) parts.push(triggerContext.situation);
        if (triggerContext.agentCount !== undefined) {
          parts.push(`There are ${triggerContext.agentCount} agents in the system.`);
        }
        if (triggerContext.platformCount !== undefined) {
          parts.push(`${triggerContext.platformCount} platforms are connected.`);
        }
        parts.push('Based on your personality, goals, and current situation - what should you do?');
        break;

      case 'event':
        parts.push(`Current time: ${now}. An event occurred:`);
        if (triggerContext.event === 'incoming_message') {
          // === INTENT CLASSIFICATION: Tell the AI what the user's latest intent is ===
          const taskStatus = triggerContext.lastTaskStatus || {};
          if (taskStatus.taskStatus === 'completed' && taskStatus.intentHint !== 'possible_followup') {
            parts.push('');
            parts.push(`=== TASK STATE ===`);
            parts.push(`Previous task: "${taskStatus.previousTask || 'unknown'}" → STATUS: **COMPLETED** (already answered)`);
            if (taskStatus.intentHint === 'new_intent') {
              parts.push('The new message below is a **NEW REQUEST** — unrelated to the previous task. Do NOT re-execute the previous task.');
            } else if (taskStatus.intentHint === 'new_intent_media') {
              parts.push('The new message is **MEDIA (image/file)** — a new topic. Do NOT re-execute the previous task. Respond to the media.');
            } else if (taskStatus.intentHint === 'acknowledgement') {
              parts.push('The new message is an **ACKNOWLEDGEMENT** (e.g., "thank you"). The previous task is closed. Just respond politely.');
            }
            parts.push('=== END TASK STATE ===');
            parts.push('');
          } else if (taskStatus.intentHint === 'possible_followup') {
            parts.push('');
            parts.push(`=== TASK STATE ===`);
            parts.push(`Previous task: "${taskStatus.previousTask || 'unknown'}" → STATUS: ${taskStatus.taskStatus === 'completed' ? 'COMPLETED' : 'PENDING'}`);
            parts.push('The new message appears to be a **FOLLOW-UP** to the previous task. Continue where you left off.');
            parts.push('=== END TASK STATE ===');
            parts.push('');
          }

          if (triggerContext.isMaster) {
            parts.push(`**IMPORTANT: Message from YOUR MASTER/OWNER "${triggerContext.sender || 'unknown'}" via ${triggerContext.platform || 'unknown'}.**`);
            parts.push('This is a direct instruction from your owner. Respond helpfully and immediately.');
          } else {
            parts.push(`New ${triggerContext.platform || 'unknown'} message from "${triggerContext.sender || 'unknown'}".`);
          }
          if (triggerContext.agentName) parts.push(`Received on agent: ${triggerContext.agentName}`);
          if (triggerContext.subject) parts.push(`Subject: ${triggerContext.subject}`);

          // Handle media messages (images, PDFs, etc.) explicitly
          if (triggerContext.hasMedia && triggerContext.contentType !== 'text') {
            parts.push(`**This message contains media: ${triggerContext.contentType || 'unknown type'}**`);
            // Tell the AI exactly where the media file is stored on the server
            if (triggerContext.mediaLocalPath) {
              parts.push(`**Media file location on server:** \`${triggerContext.mediaLocalPath}\``);
              parts.push('');
              parts.push('=== MEDIA PROCESSING RULES ===');
              parts.push('This file is on the SERVER (not the user\'s device). Use BACKEND tools only:');
              parts.push('');
              parts.push('STEP 1 — READ the file using the correct backend tool:');
              parts.push('  - Image (.jpg, .png, .webp) → extractTextFromImage(filePath) or analyzeImageMessage(filePath)');
              parts.push('  - PDF (.pdf) → readPdf(filePath)');
              parts.push('  - Word (.docx) → readDocx(filePath)');
              parts.push('  - Excel (.xlsx) → readExcel(filePath)');
              parts.push('  - CSV (.csv) → readCsv(filePath)');
              parts.push('  - Text/code → readText(filePath)');
              parts.push('');
              parts.push('STEP 2 — PROCESS: Use the extracted content with aiChat or your own reasoning.');
              parts.push('');
              parts.push('STEP 3 — GENERATE output (if user requests a document):');
              parts.push('  - generatePdf, generateDocx, generateExcel, generateCsv');
              parts.push('');
              parts.push('STEP 4 — SEND the generated file back:');
              parts.push('  - sendWhatsAppMedia / sendTelegramMedia / sendEmailAttachment');
              parts.push('');
              parts.push('DEFAULT: Use the backend tools above for processing. Do NOT use executeOnLocalAgent unless user asks.');
              parts.push('');
              // ── Detect explicit CLI tool request from user message ──
              const userText = (triggerContext.preview || '').replace(/---\s*Enriched Data\s*---[\s\S]*/i, '').trim();
              const cliRequestMatch = userText.match(/(?:use|with|via|through)\s+(claude|gemini|opencode)\s+(?:cli|tool)/i);
              const cliToolMap = { claude: 'claudeCliPrompt', gemini: 'geminiCliPrompt', opencode: 'opencodeCliPrompt' };

              if (cliRequestMatch) {
                const requestedCli = cliRequestMatch[1].toLowerCase();
                const requestedToolId = cliToolMap[requestedCli];
                parts.push(`*** USER EXPLICITLY REQUESTED: ${cliRequestMatch[1].toUpperCase()} CLI ***`);
                parts.push(`You MUST use the "${requestedToolId}" tool for this task. Do NOT use a different CLI tool.`);
                parts.push('');
              }

              parts.push('CLI TOOL USAGE:');
              parts.push('Available: claudeCliPrompt (default), geminiCliPrompt (FREE), opencodeCliPrompt (FREE).');
              parts.push('If user asks for a SPECIFIC CLI tool, use THAT tool. Otherwise default to claudeCliPrompt.');
              parts.push('  IMPORTANT: Pass the media file path in the "mediaFiles" parameter so the CLI can access it!');
              const exampleTool = cliRequestMatch ? cliToolMap[cliRequestMatch[1].toLowerCase()] : 'claudeCliPrompt';
              parts.push('  Example: ' + exampleTool + '({ prompt: "Convert this image to a DOCX document", mediaFiles: ["' + (triggerContext.mediaLocalPath || '/app/data/media/file.jpg') + '"] })');
              parts.push('  The system will automatically copy the file into the CLI workspace.');
              parts.push('  Do NOT tell the CLI to look for files at /app/data/media/ — use mediaFiles parameter instead.');
              parts.push('=== END MEDIA PROCESSING RULES ===');
            }
            if (triggerContext.preview && triggerContext.preview.replace(/---\s*Enriched Data\s*---[\s\S]*/i, '').trim().length > 10) {
              parts.push(`Message content and analysis: ${triggerContext.preview}`);
            } else {
              parts.push('The sender shared media without text caption. Acknowledge receipt and respond to the media itself.');
            }
          } else if (triggerContext.preview) {
            parts.push(`Message content: ${triggerContext.preview}`);
          }

          // Include quoted/replied-to message context (WhatsApp reply feature)
          if (triggerContext.quotedMessage) {
            const qm = triggerContext.quotedMessage;
            parts.push('');
            parts.push('--- User is REPLYING TO this previous message ---');
            if (qm.fromMe) {
              parts.push(`Original sender: You (the AI agent)`);
            } else {
              parts.push(`Original sender: ${qm.author || qm.from || 'unknown'}`);
            }
            parts.push(`Original message: "${qm.body || '[media/no text]'}"`);
            if (qm.timestamp) {
              parts.push(`Sent at: ${new Date(qm.timestamp * 1000).toISOString()}`);
            }
            parts.push('--- End quoted message ---');
            parts.push('Consider the quoted message as context when responding.');
          }

          // Include conversation history for context
          if (triggerContext.conversationHistory) {
            parts.push('');
            parts.push('--- Conversation History (context only) ---');
            parts.push(triggerContext.conversationHistory);
            parts.push('--- End History ---');
          }

          // Orchestrator guidance
          if (triggerContext.isMaster) {
            parts.push('');
            parts.push('**RESPOND FIRST, THEN ACT.** Your very first action MUST be "respond" to acknowledge the request.');
            parts.push('After acknowledging, use tools to fulfill the request:');
            parts.push('- STEP 1: Use "respond" to acknowledge (e.g. "Got it! Let me look into that for you.")');
            parts.push('- STEP 2: Use "searchWeb" or "ragQuery" to research');
            parts.push('- STEP 3: Use "delegateTask" or "handoffToAgent" to delegate tasks to team members (with a detailed brief)');
            parts.push('- STEP 4: Use "respond" again with final results/summary');
            parts.push('- Optional: Use "createSchedule" to set follow-up reminders');
          } else {
            parts.push('');
            parts.push('Decide if this needs your attention. Use "respond" to reply, or "done" with action "silent" if no reply is needed.');
          }
        } else if (triggerContext.event === 'task_response_received') {
          // Human responded to a requestHumanInput task
          parts.push(`**TASK RESPONSE RECEIVED**`);
          parts.push(`A human responded to your earlier question.`);
          if (triggerContext.taskTitle) parts.push(`Task: ${triggerContext.taskTitle}`);
          if (triggerContext.question) parts.push(`Your question was: "${triggerContext.question}"`);
          if (triggerContext.responseContent) parts.push(`Their response: "${triggerContext.responseContent}"`);
          if (triggerContext.responderName) parts.push(`Responded by: ${triggerContext.responderName}`);
          if (triggerContext.planId) parts.push(`This is part of plan: ${triggerContext.planId}`);
          parts.push('');
          parts.push('Continue executing the plan with this new information.');
          parts.push('Use the response to complete remaining plan steps, then use "respond" to send the final results to the original requester.');
        } else if (triggerContext.event === 'agent_status_changes') {
          parts.push('Agent status changes detected:');
          (triggerContext.changes || []).forEach(c => {
            parts.push(`  - ${c.agentName}: ${c.oldStatus} → ${c.newStatus}`);
          });
          parts.push('Decide if master should be notified about these changes.');
        } else if (triggerContext.event === 'orchestrated_task') {
          // Sub-agent receiving a task from the orchestrator
          parts.push(triggerContext.situation || 'Complete the assigned task.');
        } else {
          parts.push(JSON.stringify(triggerContext, null, 2));
        }
        break;

      case 'schedule':
        parts.push(`Current time: ${now}. A scheduled task triggered:`);
        if (triggerContext.scheduleTitle) parts.push(`Task: ${triggerContext.scheduleTitle}`);
        if (triggerContext.customPrompt) parts.push(`Instructions: ${triggerContext.customPrompt}`);
        if (triggerContext.situation) parts.push(triggerContext.situation);
        parts.push('Execute this task based on your capabilities and instructions.');
        break;

      case 'periodic_think':
        parts.push(`Current time: ${now}. Periodic self-check.`);
        if (triggerContext.triggerType) parts.push(`Trigger: ${triggerContext.triggerType}`);
        if (triggerContext.suggestedAction) parts.push(`Suggested action: ${triggerContext.suggestedAction}`);
        if (triggerContext.reasoning) parts.push(`Context: ${triggerContext.reasoning}`);
        parts.push('Review your goals and current situation. Decide what needs attention.');
        break;

      case 'heartbeat':
        parts.push(`Current time: ${now}. Heartbeat check.`);
        if (triggerContext.lastHeartbeatOk) {
          parts.push(`Last successful heartbeat: ${new Date(triggerContext.lastHeartbeatOk).toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur' })}`);
        }
        parts.push('Report your current status briefly. Use the heartbeat_ok tool to confirm you are operational.');
        break;

      case 'approval_resume':
        parts.push(`Current time: ${now}. **APPROVAL GRANTED** for tool "${triggerContext.approvedTool}".`);
        if (triggerContext.approvedParams && Object.keys(triggerContext.approvedParams).length > 0) {
          parts.push(`Approved parameters: ${JSON.stringify(triggerContext.approvedParams)}`);
        }
        if (triggerContext.modifiedPayload) {
          parts.push('**NOTE:** Master MODIFIED the parameters before approving. Use the approved parameters above.');
        }
        if (triggerContext.approverNotes) {
          parts.push(`Master notes: "${triggerContext.approverNotes}"`);
        }
        if (triggerContext._approvalToolResult) {
          parts.push('');
          parts.push('**Tool execution result (pre-executed):**');
          parts.push(JSON.stringify(triggerContext._approvalToolResult, null, 2));
        }
        parts.push('');
        parts.push('The approved tool has been pre-executed. Review the result above, then continue your task or use "done" if complete.');
        break;

      default:
        parts.push(`Current time: ${now}. Trigger: ${trigger}`);
        if (Object.keys(triggerContext).length > 0) {
          parts.push(JSON.stringify(triggerContext, null, 2));
        }
        parts.push('Decide what to do based on your context and capabilities.');
    }

    return parts.join('\n');
  }

  // =====================================================
  // TOOL SELECTION
  // =====================================================

  selectToolsForAgent(agentId, profile, triggerContext = {}) {
    const { getSystemToolsRegistry } = require('../ai/SystemToolsRegistry.cjs');
    const registry = getSystemToolsRegistry();

    // Tier-aware tool selection: use reduced tool set for simple/trivial tiers
    // to shrink the system prompt and speed up AI responses
    const tier = triggerContext._classifiedTier || 'moderate';
    const SIMPLE_TOOLS = [
      // Core
      'notifyMaster', 'aiChat', 'done', 'heartbeat_ok',
      // Response
      'respond', 'clarify',
      // Self-awareness (read-only, lightweight)
      'getMyProfile', 'listMyTasks', 'searchMemory',
      // Knowledge & Research
      'ragQuery', 'searchWeb',
      // Outbound messaging
      'sendMessageToContact',
      // Human-in-the-loop
      'requestApproval', 'requestHumanInput',
      // Contacts & conversations (for "who messaged me" type queries)
      'searchContacts', 'getContactDetails', 'getConversations', 'getMessages', 'searchMessages',
    ];

    const baseTools = (tier === 'trivial' || tier === 'simple') ? SIMPLE_TOOLS : ALWAYS_AVAILABLE;
    const selectedIds = new Set(baseTools);

    // Add orchestration tools ONLY for master/top-level agents at depth 0
    const orchestrationDepth = triggerContext._orchestrationDepth || 0;
    if (orchestrationDepth === 0) {
      // Check if agent can create children (required for orchestration)
      try {
        const db = getDatabase();
        const agentProfile = db.prepare('SELECT agent_type, can_create_children FROM agentic_profiles WHERE id = ?').get(agentId);
        if (agentProfile && agentProfile.can_create_children) {
          selectedIds.add('orchestrate');
          selectedIds.add('createSpecialist');
          logger.debug(`[ReasoningLoop] Orchestration tools enabled for agent ${agentId}`);
        }
      } catch (e) { /* profile lookup optional */ }
    }

    // Add tools based on monitoring sources
    try {
      const db = getDatabase();
      const monitoring = db.prepare(
        'SELECT source_type FROM agentic_monitoring WHERE agentic_id = ? AND is_active = 1'
      ).all(agentId);

      for (const m of monitoring) {
        const tools = SOURCE_TO_TOOLS[m.source_type] || [];
        tools.forEach(t => selectedIds.add(t));
      }
    } catch (e) { /* monitoring table may not exist */ }

    // Auto-detect connected platform accounts and add send tools
    // This ensures sendWhatsApp/sendTelegram/sendEmail are available
    // even without explicit monitoring sources, as long as an account is connected
    try {
      const db = getDatabase();
      const agProfile = db.prepare(
        'SELECT agent_id, response_agent_ids FROM agentic_profiles WHERE id = ?'
      ).get(agentId);

      if (agProfile) {
        const agentIdsToCheck = JSON.parse(agProfile.response_agent_ids || '[]');
        if (agProfile.agent_id) agentIdsToCheck.push(agProfile.agent_id);

        // Also check user's agents
        if (profile.user_id) {
          const userAgents = db.prepare(
            'SELECT id FROM agents WHERE user_id = ?'
          ).all(profile.user_id);
          for (const ua of userAgents) {
            if (!agentIdsToCheck.includes(ua.id)) agentIdsToCheck.push(ua.id);
          }
        }

        const placeholders = agentIdsToCheck.map(() => '?').join(',');
        if (agentIdsToCheck.length > 0) {
          const connectedPlatforms = db.prepare(`
            SELECT DISTINCT platform FROM platform_accounts
            WHERE agent_id IN (${placeholders}) AND status = 'connected'
          `).all(...agentIdsToCheck);

          for (const p of connectedPlatforms) {
            const tools = SOURCE_TO_TOOLS[p.platform] || [];
            tools.forEach(t => selectedIds.add(t));
          }
        }
      }
    } catch (e) {
      logger.debug(`[ReasoningLoop] Platform account auto-detect failed: ${e.message}`);
    }

    // Add Local Agent tools if user has any online local agents (Phase 5.2 + 5.4)
    try {
      const { getLocalAgentGateway } = require('../LocalAgentGateway.cjs');
      const gateway = getLocalAgentGateway();
      const onlineAgents = gateway.getOnlineAgents(profile.user_id);
      if (onlineAgents.length > 0) {
        selectedIds.add('executeOnLocalAgent');
        selectedIds.add('uploadToTempStorage'); // Phase 5.4: file transfer via temp storage
        logger.debug(`[ReasoningLoop] Local Agent + TempStorage tools enabled (${onlineAgents.length} online)`);
      }
    } catch (e) { /* local agent gateway optional */ }

    // Add Mobile Agent tools if user has any paired mobile devices
    try {
      const { getDatabase: getDb } = require('../database.cjs');
      const db2 = getDb();
      const mobileCount = db2.prepare(
        "SELECT COUNT(*) as count FROM mobile_agents WHERE user_id = ? AND status = 'active'"
      ).get(profile.user_id);
      if (mobileCount?.count > 0) {
        selectedIds.add('queryMobileEvents');
        selectedIds.add('getMobileDeviceStatus');
        selectedIds.add('getMobileDeviceLocation');
        selectedIds.add('sendSmsViaDevice');
        selectedIds.add('markMobileEventRead');
        logger.debug(`[ReasoningLoop] Mobile Agent tools enabled (${mobileCount.count} devices)`);
      }
    } catch (e) { /* mobile agent optional */ }

    // Add server-side CLI AI tools only if authenticated (avoids wasting iterations on broken tools)
    try {
      const { getCLIAIProvider } = require('../ai/providers/CLIAIProvider.cjs');
      const cliProvider = getCLIAIProvider();
      // Claude is the default CLI tool; Gemini/OpenCode used when explicitly requested
      const cliTools = [
        { tool: 'claudeCliPrompt', cliType: 'claude' },
        { tool: 'geminiCliPrompt', cliType: 'gemini' },
        { tool: 'opencodeCliPrompt', cliType: 'opencode' },
      ];
      const addedCli = [];
      for (const { tool, cliType } of cliTools) {
        if (cliProvider.isAuthenticated(cliType)) {
          selectedIds.add(tool);
          addedCli.push(cliType);
        }
      }
      if (addedCli.length > 0) {
        logger.debug(`[ReasoningLoop] CLI tools enabled: ${addedCli.join(', ')}`);
      }
    } catch (e) { /* CLI provider optional */ }

    // Add tools based on skills (Phase 5: level-gated tool access)
    try {
      const db = getDatabase();
      const skills = db.prepare(`
        SELECT c.category, s.current_level FROM agentic_agent_skills s
        JOIN agentic_skills_catalog c ON s.skill_id = c.id
        WHERE s.agentic_id = ?
      `).all(agentId);

      for (const s of skills) {
        const categoryConfig = SKILL_CATEGORY_TO_TOOLS[s.category];
        if (!categoryConfig) continue;

        // Use level-gated tools (get tools up to agent's current level)
        const level = Math.min(s.current_level || 1, 4);
        const levelTools = categoryConfig.levelGated[level] || categoryConfig.levelGated[1] || [];
        levelTools.forEach(t => selectedIds.add(t));
      }
    } catch (e) { /* skills tables may not exist */ }

    // Apply permission filter (autonomy level gating)
    let filteredIds = [...selectedIds];
    try {
      const { getAgenticToolPermissions } = require('./AgenticToolPermissions.cjs');
      const permissions = getAgenticToolPermissions();
      filteredIds = permissions.getAvailableTools(
        agentId, profile.autonomy_level || 'semi-autonomous', filteredIds
      );
    } catch (e) {
      // Permission module optional - fall back to unfiltered list
      logger.debug(`[ReasoningLoop] Permission filter unavailable: ${e.message}`);
    }

    // Get tool definitions from registry - no artificial limit, let AI provider handle context
    const toolDefs = [];
    for (const toolId of filteredIds) {
      const tool = registry.tools.get(toolId);
      if (tool) {
        toolDefs.push(tool);
      }
    }

    return toolDefs;
  }

  // =====================================================
  // TOOL CALL PARSING
  // =====================================================

  /**
   * Parse native OpenAI-format tool calls from provider response.
   * Converts from OpenAI format: { id, type:'function', function:{ name, arguments } }
   * To internal format: { action, params, reasoning, _nativeToolCallId }
   *
   * @param {Array} nativeToolCalls - Array of OpenAI tool_calls from API response
   * @returns {Array} Internal tool call format
   */
  parseNativeToolCalls(nativeToolCalls) {
    const toolCalls = [];
    if (!Array.isArray(nativeToolCalls)) return toolCalls;

    for (const tc of nativeToolCalls) {
      if (tc.type !== 'function') continue;

      const fnName = tc.function?.name;
      if (!fnName) {
        logger.warn('[ReasoningLoop] Native tool call missing function name, skipping');
        continue;
      }

      let params = {};
      try {
        const rawArgs = tc.function?.arguments;
        if (rawArgs && typeof rawArgs === 'string') {
          params = JSON.parse(rawArgs);
        } else if (rawArgs && typeof rawArgs === 'object') {
          params = rawArgs;
        }
      } catch (e) {
        logger.warn(`[ReasoningLoop] Failed to parse native tool call arguments for ${fnName}: ${e.message}`);
        continue;
      }

      toolCalls.push({
        action: fnName,
        params,
        reasoning: params.reasoning || '', // Some models put reasoning in params
        _nativeToolCallId: tc.id, // Preserve for tool result message feedback
      });
    }

    return toolCalls;
  }

  parseToolCalls(aiResponse) {
    const toolCalls = [];

    // Strategy 0: Entire response is valid JSON with "action" key
    // Handles bare JSON like {"action":"respond","params":{"message":"..."}}
    const trimmed = aiResponse.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      const parsed = this.tryParseJson(trimmed);
      if (parsed && parsed.action) {
        logger.debug(`[ReasoningLoop] parseToolCalls: Strategy 0 matched (bare JSON) - action="${parsed.action}"`);
        toolCalls.push(parsed);
      }
    }

    // Strategy 0b: Multiple bare JSON objects separated by whitespace/newlines
    // Scan for ALL top-level JSON objects using balanced brace matching
    if (toolCalls.length <= 1) {
      const bareJsonCalls = this._extractAllJsonObjects(aiResponse);
      for (const candidate of bareJsonCalls) {
        const parsed = this.tryParseJson(candidate);
        if (parsed && parsed.action) {
          const isDupe = toolCalls.some(tc =>
            tc.action === parsed.action &&
            JSON.stringify(tc.params) === JSON.stringify(parsed.params)
          );
          if (!isDupe) {
            logger.debug(`[ReasoningLoop] parseToolCalls: Strategy 0b matched (bare JSON #${toolCalls.length + 1}) - action="${parsed.action}"`);
            toolCalls.push(parsed);
          }
        }
      }
    }

    // Strategy 1: Fenced ```tool blocks
    if (toolCalls.length === 0) {
      const fencedToolRegex = /```tool\s*\n?([\s\S]*?)```/g;
      let match;
      while ((match = fencedToolRegex.exec(aiResponse)) !== null) {
        const parsed = this.tryParseJson(match[1].trim());
        if (parsed && parsed.action) {
          logger.debug(`[ReasoningLoop] parseToolCalls: Strategy 1 matched (fenced tool) - action="${parsed.action}"`);
          toolCalls.push(parsed);
        }
      }
    }

    // Strategy 1b: Also check for ALL fenced blocks even if earlier strategies found something
    // (AI might output bare JSON + fenced blocks in same response)
    if (toolCalls.length > 0) {
      const allFencedRegex = /```(?:tool|json)?\s*\n?([\s\S]*?)```/g;
      let match;
      while ((match = allFencedRegex.exec(aiResponse)) !== null) {
        const parsed = this.tryParseJson(match[1].trim());
        if (parsed && parsed.action && !toolCalls.some(tc => tc.action === parsed.action && JSON.stringify(tc.params) === JSON.stringify(parsed.params))) {
          logger.debug(`[ReasoningLoop] parseToolCalls: Strategy 1b matched (fenced + existing) - action="${parsed.action}"`);
          toolCalls.push(parsed);
        }
      }
    }

    // Strategy 2: Fenced ```json blocks (many models use this)
    if (toolCalls.length === 0) {
      const fencedJsonRegex = /```json\s*\n?([\s\S]*?)```/g;
      let match;
      while ((match = fencedJsonRegex.exec(aiResponse)) !== null) {
        const parsed = this.tryParseJson(match[1].trim());
        if (parsed && parsed.action) {
          logger.debug(`[ReasoningLoop] parseToolCalls: Strategy 2 matched (fenced json) - action="${parsed.action}"`);
          toolCalls.push(parsed);
        }
      }
    }

    // Strategy 3: Plain fenced ``` blocks
    if (toolCalls.length === 0) {
      const fencedPlainRegex = /```\s*\n?([\s\S]*?)```/g;
      let match;
      while ((match = fencedPlainRegex.exec(aiResponse)) !== null) {
        const parsed = this.tryParseJson(match[1].trim());
        if (parsed && parsed.action) {
          logger.debug(`[ReasoningLoop] parseToolCalls: Strategy 3 matched (fenced plain) - action="${parsed.action}"`);
          toolCalls.push(parsed);
        }
      }
    }

    // Strategy 4: Bare JSON with "action" key (flat, no nested braces)
    if (toolCalls.length === 0) {
      const jsonRegex = /\{[^{}]*"action"\s*:\s*"[^"]+?"[^{}]*\}/g;
      let match;
      while ((match = jsonRegex.exec(aiResponse)) !== null) {
        const parsed = this.tryParseJson(match[0]);
        if (parsed && parsed.action) {
          logger.debug(`[ReasoningLoop] parseToolCalls: Strategy 4 matched (flat JSON) - action="${parsed.action}"`);
          toolCalls.push(parsed);
        }
      }
    }

    // Strategy 5: Greedy nested JSON extraction using balanced brace matching
    if (toolCalls.length === 0) {
      const actionIdx = aiResponse.indexOf('"action"');
      if (actionIdx >= 0) {
        // Find the opening brace before "action"
        let braceStart = aiResponse.lastIndexOf('{', actionIdx);
        if (braceStart >= 0) {
          // Walk forward to find balanced closing brace
          let depth = 0;
          let braceEnd = -1;
          for (let i = braceStart; i < aiResponse.length; i++) {
            if (aiResponse[i] === '{') depth++;
            else if (aiResponse[i] === '}') {
              depth--;
              if (depth === 0) { braceEnd = i; break; }
            }
          }
          if (braceEnd > braceStart) {
            const candidate = aiResponse.substring(braceStart, braceEnd + 1);
            const parsed = this.tryParseJson(candidate);
            if (parsed && parsed.action) {
              logger.debug(`[ReasoningLoop] parseToolCalls: Strategy 5 matched (balanced braces) - action="${parsed.action}"`);
              toolCalls.push(parsed);
            }
          }
        }
      }
    }

    // Strategy 6: Unclosed fenced blocks (model output truncated, missing closing ```)
    if (toolCalls.length === 0) {
      const unclosedMatch = aiResponse.match(/```(?:tool|json)?\s*\n?(\{[\s\S]*)/);
      if (unclosedMatch) {
        // Try balanced brace extraction from the unclosed block
        const fragment = unclosedMatch[1];
        let depth = 0;
        let braceEnd = -1;
        for (let i = 0; i < fragment.length; i++) {
          if (fragment[i] === '{') depth++;
          else if (fragment[i] === '}') {
            depth--;
            if (depth === 0) { braceEnd = i; break; }
          }
        }
        if (braceEnd > 0) {
          const candidate = fragment.substring(0, braceEnd + 1);
          const parsed = this.tryParseJson(candidate);
          if (parsed && parsed.action) {
            logger.debug(`[ReasoningLoop] parseToolCalls: Strategy 6 matched (unclosed fence) - action="${parsed.action}"`);
            toolCalls.push(parsed);
          }
        }
      }
    }

    if (toolCalls.length === 0 && trimmed.includes('"action"')) {
      logger.warn(`[ReasoningLoop] parseToolCalls: AI response contains "action" but no tool calls were parsed. Response: ${trimmed.substring(0, 200)}`);
    }

    return toolCalls.map(tc => ({
      action: tc.action,
      params: tc.params || tc.parameters || {},
      reasoning: tc.reasoning || '',
    }));
  }

  tryParseJson(str) {
    try {
      return JSON.parse(str);
    } catch (e) {
      // Try to extract just the JSON part
      const jsonMatch = str.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try { return JSON.parse(jsonMatch[0]); } catch (e2) {
          // Try unescaping double-encoded JSON (CLI NDJSON wrapping produces literal \" in text)
          try {
            const unescaped = jsonMatch[0]
              .replace(/\\"/g, '"')
              .replace(/\\n/g, '\n')
              .replace(/\\t/g, '\t')
              .replace(/\\\\/g, '\\');
            const result = JSON.parse(unescaped);
            logger.debug('[ReasoningLoop] tryParseJson: Parsed after unescaping double-encoded JSON');
            return result;
          } catch (e3) { /* skip */ }
        }
      }
      return null;
    }
  }

  /**
   * Extract all top-level JSON objects from a string using balanced brace matching.
   * Returns an array of JSON strings.
   * @param {string} text
   * @returns {string[]}
   */
  _extractAllJsonObjects(text) {
    const results = [];
    let i = 0;
    while (i < text.length) {
      if (text[i] === '{') {
        let depth = 0;
        const start = i;
        let inString = false;
        let escape = false;
        for (let j = i; j < text.length; j++) {
          const ch = text[j];
          if (escape) { escape = false; continue; }
          if (ch === '\\' && inString) { escape = true; continue; }
          if (ch === '"' && !escape) { inString = !inString; continue; }
          if (inString) continue;
          if (ch === '{') depth++;
          else if (ch === '}') {
            depth--;
            if (depth === 0) {
              results.push(text.substring(start, j + 1));
              i = j + 1;
              break;
            }
          }
          if (j === text.length - 1) { i = j + 1; }
        }
        if (depth !== 0) break; // unclosed brace, stop scanning
      } else {
        i++;
      }
    }
    return results;
  }

  // =====================================================
  // TOOL EXECUTION
  // =====================================================

  async executeTool(toolId, params, context) {
    const { getSystemToolsRegistry } = require('../ai/SystemToolsRegistry.cjs');
    const registry = getSystemToolsRegistry();

    const startTime = Date.now();
    try {
      const result = await registry.executeTool(toolId, params, context);

      // Audit log (best-effort)
      this._logToolExecution(toolId, params, result, context, Date.now() - startTime);

      return result;
    } catch (error) {
      this._logToolExecution(toolId, params, { success: false, error: error.message }, context, Date.now() - startTime);
      return { success: false, error: error.message };
    }
  }

  /**
   * Log tool execution to agentic_tool_executions table.
   * @private
   */
  _logToolExecution(toolId, params, result, context, executionTimeMs) {
    try {
      const db = getDatabase();
      // Check if table exists before inserting
      const tableExists = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='agentic_tool_executions'"
      ).get();
      if (!tableExists) return;

      db.prepare(`
        INSERT INTO agentic_tool_executions (
          id, agentic_id, user_id, tool_id, parameters,
          result, status, execution_time_ms, trigger_source,
          session_id, orchestration_id, error_message, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(
        crypto.randomUUID(),
        context.agenticId || '',
        context.userId || '',
        toolId,
        JSON.stringify(params || {}).slice(0, 2000),
        JSON.stringify(result?.result || result?.error || '').slice(0, 2000),
        result?.success ? 'success' : 'failed',
        executionTimeMs || 0,
        context.triggerSource || 'reasoning_loop',
        context.sessionId || null,
        context.orchestrationId || null,
        result?.error || null
      );
    } catch (e) {
      // Audit logging is best-effort - never break the reasoning loop
    }
  }

  // =====================================================
  // AUTONOMY & APPROVAL
  // =====================================================

  needsApproval(profile, toolId) {
    const autonomy = profile.autonomy_level || 'supervised';

    // Autonomous agents don't need approval (except explicit overrides)
    if (autonomy === 'autonomous') {
      const requireApproval = this.safeJsonParse(profile.require_approval_for, []);
      return requireApproval.includes(toolId);
    }

    // Semi-autonomous: safe tools auto-execute, others need approval
    if (autonomy === 'semi-autonomous') {
      return !SAFE_TOOLS.has(toolId);
    }

    // Supervised: everything needs approval
    return true;
  }

  queueForApproval(db, agentId, userId, toolCall) {
    try {
      const id = crypto.randomUUID();
      db.prepare(`
        INSERT INTO agentic_approval_queue (
          id, agentic_id, user_id, action_type, action_title,
          action_description, action_payload, status, created_at
        ) VALUES (?, ?, ?, 'tool_execution', ?, ?, ?, 'pending', datetime('now'))
      `).run(
        id,
        agentId,
        userId,
        `Execute tool: ${toolCall.action}`,
        toolCall.reasoning || `Agent wants to use ${toolCall.action}`,
        JSON.stringify({ tool: toolCall.action, params: toolCall.params }),
      );
      logger.info(`[ReasoningLoop] Queued ${toolCall.action} for approval (${id})`);
    } catch (e) {
      logger.warn(`[ReasoningLoop] Failed to queue approval: ${e.message}`);
    }
  }

  // =====================================================
  // RESPONSE SANITIZATION
  // =====================================================

  /**
   * Check if AI response looks like raw error output (API errors, stack traces, migration text)
   * that should NOT be sent to the user as a response.
   * @param {string} text - The AI response text
   * @returns {boolean} true if it looks like error output
   */
  _looksLikeErrorOutput(text) {
    if (!text || text.length < 10) return false;

    const ERROR_INDICATORS = [
      /Insufficient credits/i,
      /statusCode["']?\s*:\s*[45]\d{2}/i,
      /"error"\s*:\s*[{\['"]/i,
      /openrouter\.ai\/settings\/credits/i,
      /Performing one time database migration/i,
      /rate_limit_exceeded/i,
      /EACCES:\s*permission denied/i,
      /ENOENT:\s*no such file/i,
      /Error:\s*connect\s+ECONNREFUSED/i,
      /at\s+\w+\s+\(.*\.(?:js|cjs|mjs|ts):\d+:\d+\)/i,  // Stack traces
      /UnhandledPromiseRejection/i,
      /\bfetch\b.*\bfailed\b/i,
      /\bsocket hang up\b/i,
      /\bECONNRESET\b/i,
      /\bETIMEDOUT\b/i,
      /^\s*\{[\s\S]*"statusCode"\s*:\s*\d{3}/,  // Raw JSON error responses
    ];

    for (const pattern of ERROR_INDICATORS) {
      if (pattern.test(text)) return true;
    }

    // If response is mostly JSON with error-like fields, flag it
    const trimmed = text.trim();
    if ((trimmed.startsWith('{') || trimmed.startsWith('[')) && trimmed.length > 20) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed.error || parsed.statusCode >= 400 || parsed.code === 'ECONNREFUSED') {
          return true;
        }
      } catch (e) { /* not pure JSON */ }
    }

    return false;
  }

  /**
   * Detect if text contains placeholder/template markers that should not be sent to users.
   * E.g. "[Insert actual message content...]", "[timestamp]", "{{variable}}"
   */
  _looksLikePlaceholderText(text) {
    if (!text || text.length < 10) return false;

    const PLACEHOLDER_PATTERNS = [
      /\[Insert\b/i,                          // [Insert actual message...]
      /\[actual\b/i,                           // [actual content here]
      /\[timestamp\]/i,                        // [timestamp]
      /\[data\s+here\]/i,                      // [data here]
      /\[message\s+content\]/i,                // [message content]
      /\[placeholder\]/i,                      // [placeholder]
      /\[fill\s+in\]/i,                        // [fill in]
      /\[replace\s+with\]/i,                   // [replace with...]
      /\[TODO\b/i,                             // [TODO: ...]
      /\{\{[a-zA-Z_]+\}\}/,                    // {{variable}} style templates
      /\[from\s+tool\s+results?\]/i,           // [from tool results]
    ];

    for (const pattern of PLACEHOLDER_PATTERNS) {
      if (pattern.test(text)) return true;
    }

    return false;
  }

  // =====================================================
  // LOGGING
  // =====================================================

  logActivity(db, agentId, userId, activityType, trigger, metadata) {
    try {
      const id = crypto.randomUUID();
      db.prepare(`
        INSERT INTO agentic_activity_log (
          id, agentic_id, user_id, activity_type, activity_description,
          trigger_type, status, metadata, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'success', ?, datetime('now'))
      `).run(
        id,
        agentId,
        userId,
        activityType,
        `${activityType} via ${trigger}`,
        trigger,
        JSON.stringify(metadata),
      );
    } catch (e) {
      logger.debug(`[ReasoningLoop] Activity log write failed: ${e.message}`);
    }
  }

  // =====================================================
  // RATE LIMITING
  // =====================================================

  checkRateLimit(agentId) {
    const now = Date.now();
    const windowMs = 3600000; // 1 hour
    const entry = this.rateLimiter.get(agentId);

    if (!entry || (now - entry.windowStart) > windowMs) {
      this.rateLimiter.set(agentId, { count: 1, windowStart: now });
      return true;
    }

    if (entry.count >= this.maxCyclesPerHour) {
      return false;
    }

    entry.count++;
    return true;
  }

  // =====================================================
  // PLAN-DRIVEN REASONING
  // =====================================================

  /**
   * Determine if this request should use plan-driven mode.
   * @param {string} tier - Task complexity tier
   * @param {Object} triggerContext - Trigger context
   * @returns {boolean}
   */
  shouldUsePlanDrivenMode(tier, triggerContext) {
    // Only for moderate/complex/critical tiers
    if (!['moderate', 'complex', 'critical'].includes(tier)) return false;

    // Only for incoming_message events
    if (triggerContext.event !== 'incoming_message') return false;

    // Skip if sub-agent (has _maxIterations override from orchestrator)
    if (triggerContext._maxIterations) return false;

    // Skip if this is a plan continuation (task_response_received)
    if (triggerContext.event === 'task_response_received') return false;

    return true;
  }

  /**
   * Run plan-driven reasoning loop (RooCode/Cline pattern).
   * Phase 1: AI generates a plan (TODO list) via generatePlan tool
   * Phase 2: Execute each plan step with mini reactive loops
   * Phase 3: Synthesize results
   * Phase 4: Complete and save learnings
   *
   * @param {string} agentId - agentic_profiles.id
   * @param {Object} profile - Agent profile row
   * @param {Array} messages - Initial messages [system, user]
   * @param {Object} triggerContext - Trigger context
   * @returns {Object|null} - Result or null to fall back to reactive loop
   */
  async runPlanDrivenLoop(agentId, profile, messages, triggerContext) {
    const db = getDatabase();
    const actions = [];
    let tokensUsed = 0;
    let iterations = 0;

    const hasOwnProvider = profile.ai_provider && profile.ai_provider !== 'task-routing';
    const tools = this.selectToolsForAgent(agentId, profile, triggerContext);
    const toolContext = {
      agenticId: agentId,
      userId: profile.user_id,
      conversationId: triggerContext.conversationId || null,
      accountId: triggerContext.accountId || null,
      _orchestrationDepth: triggerContext._orchestrationDepth || 0,
    };

    // ─── Phase 1: PLANNING ───
    logger.info(`[ReasoningLoop:PlanMode] Phase 1: Requesting plan from AI for agent ${agentId}`);

    // Ask AI to generate a plan
    const planMessages = [...messages];
    planMessages.push({
      role: 'user',
      content: `This is a complex request that needs a structured plan.
Use the "generatePlan" tool to break this request into ordered steps FIRST.
Each step should have: title, description, type (tool_action/research/human_input/delegation/synthesis), and expectedTool.
Do NOT execute anything yet - just create the plan.`,
    });

    const planResult = await this._callAI(planMessages, profile, hasOwnProvider);
    tokensUsed += planResult.tokensUsed;
    iterations++;

    if (!planResult.content) {
      logger.warn('[ReasoningLoop:PlanMode] AI returned empty response for planning - falling back to reactive');
      return null;
    }

    // Parse the AI's response for a generatePlan tool call
    const planToolCalls = this.parseToolCalls(planResult.content);
    const generatePlanCall = planToolCalls.find(c => c.action === 'generatePlan');

    if (!generatePlanCall) {
      logger.info('[ReasoningLoop:PlanMode] AI did not use generatePlan - falling back to reactive');
      return null; // AI chose not to plan, fall back to reactive loop
    }

    // Execute the generatePlan tool
    const planToolResult = await this.executeTool('generatePlan', generatePlanCall.params, toolContext);
    if (!planToolResult.success) {
      logger.error(`[ReasoningLoop:PlanMode] generatePlan failed: ${planToolResult.error}`);
      return null;
    }

    const plan = planToolResult.result;
    logger.info(`[ReasoningLoop:PlanMode] Plan created: "${plan.goal}" with ${plan.totalSteps} steps`);
    actions.push({
      tool: 'generatePlan',
      params: generatePlanCall.params,
      reasoning: generatePlanCall.reasoning,
      status: 'executed',
      result: plan,
    });

    // Send initial acknowledgment if callback available
    if (typeof triggerContext._onIntermediateRespond === 'function') {
      try {
        const ackMsg = `Got it! I've created a plan with ${plan.totalSteps} steps to handle your request. Working on it now...`;
        await triggerContext._onIntermediateRespond(ackMsg);
        actions.push({ tool: 'respond', params: { message: ackMsg }, status: 'executed', sentImmediately: true });
      } catch (e) { /* best effort */ }
    }

    // ─── Phase 2: EXECUTION ───
    logger.info(`[ReasoningLoop:PlanMode] Phase 2: Executing ${plan.steps.length} plan steps`);

    const stepResults = {};
    let blockedSteps = 0;

    for (const step of plan.steps) {
      // Check abort signal from outer run() timeout
      if (triggerContext._abortSignal?.aborted) {
        logger.warn(`[ReasoningLoop:PlanMode] Aborted at step ${step.order}/${plan.totalSteps}`);
        break;
      }

      logger.info(`[ReasoningLoop:PlanMode] Executing step ${step.order}/${plan.totalSteps}: "${step.title}" (${step.type})`);

      // Update step status to in_progress
      try {
        db.prepare("UPDATE agentic_tasks SET status = 'in_progress', started_at = COALESCE(started_at, datetime('now')), updated_at = datetime('now') WHERE id = ?")
          .run(step.id);
      } catch (e) { /* best effort */ }

      if (step.type === 'human_input') {
        // ─── Human-in-loop step: send question and block ───
        const humanStepMessages = [...messages];
        humanStepMessages.push({
          role: 'user',
          content: `You need human input for this step: "${step.title}".
Use the "requestHumanInput" tool to ask the question. Parameters needed:
- question: The specific question to ask
- taskId: "${step.id}"
Determine WHO to ask (master contact or specific team member) and WHAT to ask.`,
        });

        const humanResult = await this._callAI(humanStepMessages, profile, hasOwnProvider);
        tokensUsed += humanResult.tokensUsed;
        iterations++;

        const humanCalls = this.parseToolCalls(humanResult.content || '');
        const humanInputCall = humanCalls.find(c => c.action === 'requestHumanInput');

        if (humanInputCall) {
          // Ensure taskId is set
          humanInputCall.params.taskId = humanInputCall.params.taskId || step.id;

          const hiResult = await this.executeTool('requestHumanInput', humanInputCall.params, toolContext);
          actions.push({
            tool: 'requestHumanInput',
            params: humanInputCall.params,
            reasoning: humanInputCall.reasoning,
            status: hiResult.success ? 'executed' : 'failed',
            result: hiResult.success ? hiResult.result : hiResult.error,
          });

          if (hiResult.success) {
            stepResults[step.id] = { status: 'blocked', awaitingFrom: hiResult.result.awaitingFrom };
            blockedSteps++;
            logger.info(`[ReasoningLoop:PlanMode] Step ${step.order} blocked - awaiting response from ${hiResult.result.awaitingFrom}`);

            // Notify user about the wait
            if (typeof triggerContext._onIntermediateRespond === 'function') {
              try {
                await triggerContext._onIntermediateRespond(
                  `I've asked ${hiResult.result.awaitingFrom} about: "${humanInputCall.params.question}". I'll continue once they respond.`
                );
              } catch (e) { /* best effort */ }
            }
          }
        } else {
          stepResults[step.id] = { status: 'skipped', reason: 'AI did not generate requestHumanInput call' };
        }

        continue; // Move to next step
      }

      // ─── Tool action / research / delegation / synthesis step: mini reactive loop ───
      const MAX_STEP_ITERATIONS = 3;
      const stepMessages = [...messages];

      // Provide context of completed steps
      const completedContext = Object.entries(stepResults)
        .filter(([, v]) => v.status === 'completed')
        .map(([id, v]) => `- Step "${v.title || id}": ${JSON.stringify(v.result || v.summary || 'done').substring(0, 200)}`)
        .join('\n');

      stepMessages.push({
        role: 'user',
        content: `You are now executing step ${step.order}/${plan.totalSteps} of your plan: "${step.title}"
${step.description ? `Description: ${step.description}` : ''}
${completedContext ? `\nResults from previous steps:\n${completedContext}` : ''}

Execute this step using the appropriate tools. When done, use "done" to indicate this step is complete.`,
      });

      let stepCompleted = false;
      for (let si = 0; si < MAX_STEP_ITERATIONS; si++) {
        const stepAiResult = await this._callAI(stepMessages, profile, hasOwnProvider);
        tokensUsed += stepAiResult.tokensUsed;
        iterations++;

        if (!stepAiResult.content) break;

        const stepToolCalls = this.parseToolCalls(stepAiResult.content);

        if (stepToolCalls.length === 0) {
          // AI responded with plain text - treat as step result
          stepResults[step.id] = { status: 'completed', title: step.title, summary: stepAiResult.content.substring(0, 500) };
          stepCompleted = true;
          break;
        }

        const stepAvailableToolIds = tools.map(t => t.id).concat(['done', 'silent', 'heartbeat_ok']);
        for (const call of stepToolCalls) {
          if (call.action === 'done') {
            stepResults[step.id] = { status: 'completed', title: step.title, summary: call.reasoning || '' };
            stepCompleted = true;
            break;
          }

          // Validate and auto-correct tool call
          const stepValidation = this.validateToolCall(call, stepAvailableToolIds);
          if (!stepValidation.valid) {
            stepMessages.push({ role: 'assistant', content: stepAiResult.content });
            stepMessages.push({ role: 'user', content: `Tool call error: ${stepValidation.error}\nUse a valid tool.` });
            break;
          }
          call.action = stepValidation.correctedCall.action;
          call.params = stepValidation.correctedCall.params;

          if (call.action === 'respond' && typeof triggerContext._onIntermediateRespond === 'function') {
            // Send intermediate update
            const respResult = await this.executeTool('respond', call.params, toolContext);
            if (respResult.success && respResult.result?.message) {
              try { await triggerContext._onIntermediateRespond(respResult.result.message); } catch (e) { /* ok */ }
            }
            actions.push({ tool: 'respond', params: call.params, status: 'executed', sentImmediately: true });

            stepMessages.push({ role: 'assistant', content: stepAiResult.content });
            stepMessages.push({ role: 'user', content: `Response sent. Continue executing this step or use "done" when complete.` });
            continue;
          }

          // Execute the tool
          const approvalNeeded = this.needsApproval(profile, call.action);
          if (approvalNeeded) {
            this.queueForApproval(db, agentId, profile.user_id, call);
            actions.push({ tool: call.action, params: call.params, status: 'queued_for_approval' });
            stepMessages.push({ role: 'assistant', content: stepAiResult.content });
            stepMessages.push({ role: 'user', content: `Tool "${call.action}" requires approval. Queued. Continue with alternatives or "done".` });
          } else {
            const toolResult = await this.executeTool(call.action, call.params, toolContext);
            actions.push({
              tool: call.action,
              params: call.params,
              reasoning: call.reasoning,
              status: toolResult.success ? 'executed' : 'failed',
              result: toolResult.success ? toolResult.result : toolResult.error,
            });

            // Feed result back
            stepMessages.push({ role: 'assistant', content: stepAiResult.content });
            stepMessages.push({
              role: 'user',
              content: toolResult.success
                ? `Tool "${call.action}" result: ${this.summarizeToolResult(call.action, toolResult.result)}. Continue this step or "done" when complete.`
                : `Tool "${call.action}" failed: ${toolResult.error}. Try another approach or "done".`,
            });

            // Store last tool result for step summary
            if (toolResult.success) {
              stepResults[step.id] = {
                status: 'in_progress',
                title: step.title,
                result: toolResult.result,
              };
            }
          }
        }

        if (stepCompleted) break;
      }

      // Mark step failed if not completed (don't falsely mark as completed)
      if (!stepCompleted) {
        const existingResult = stepResults[step.id];
        if (!existingResult || existingResult.status === 'in_progress') {
          stepResults[step.id] = { status: 'failed', title: step.title, summary: 'Max iterations reached or AI failure' };
        }
      }

      // Error recovery: if step failed, check if remaining steps should continue
      if (stepResults[step.id]?.status === 'failed') {
        const remainingSteps = plan.steps.filter(s => s.order > step.order);

        if (remainingSteps.length > 0) {
          // Ask AI whether to continue, adapt, or abort
          const recoveryMessages = [...messages];
          recoveryMessages.push({
            role: 'user',
            content: `Step ${step.order}/${plan.totalSteps} ("${step.title}") FAILED: ${stepResults[step.id].summary}
Remaining steps: ${remainingSteps.map(s => `${s.order}. ${s.title}`).join(', ')}

Can the remaining steps proceed without this step's result?
Reply with JSON: {"decision": "continue|abort", "reasoning": "why"}`,
          });

          const recoveryResult = await this._callAI(recoveryMessages, profile, hasOwnProvider);
          tokensUsed += recoveryResult.tokensUsed;
          iterations++;

          let shouldAbort = false;
          if (recoveryResult.content) {
            try {
              const jsonMatch = recoveryResult.content.match(/\{[\s\S]*\}/);
              const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
              if (parsed.decision === 'abort') {
                shouldAbort = true;
                // Notify user about failure
                if (typeof triggerContext._onIntermediateRespond === 'function') {
                  try {
                    await triggerContext._onIntermediateRespond(
                      `I encountered a problem at step ${step.order} ("${step.title}") and cannot complete the remaining plan. ${parsed.reasoning || ''}`
                    );
                  } catch (e) { /* best effort */ }
                }
                logger.warn(`[ReasoningLoop:PlanMode] Plan aborted at step ${step.order}: ${parsed.reasoning || 'AI decided to abort'}`);
              }
            } catch (e) { /* parsing failed, default to continue */ }
          }

          if (shouldAbort) break;

          // Notify user about partial failure but continuing
          if (typeof triggerContext._onIntermediateRespond === 'function') {
            try {
              await triggerContext._onIntermediateRespond(
                `Step ${step.order} ("${step.title}") had an issue, but I'm continuing with the remaining steps.`
              );
            } catch (e) { /* best effort */ }
          }
        }
      }

      // Update task status (parameterized queries to prevent SQL injection)
      try {
        const stepStatus = stepResults[step.id]?.status;
        const finalStatus = stepStatus === 'blocked' ? 'blocked' : (stepStatus === 'failed' ? 'cancelled' : 'completed');
        const summary = (stepResults[step.id]?.summary || stepResults[step.id]?.reason || '').substring(0, 500);

        if (summary) {
          const completedAt = finalStatus === 'completed' ? new Date().toISOString() : null;
          db.prepare(`
            UPDATE agentic_tasks SET status = ?, ai_summary = ?, completed_at = COALESCE(?, completed_at), updated_at = datetime('now')
            WHERE id = ?
          `).run(finalStatus, summary, completedAt, step.id);
        } else {
          const completedAt = finalStatus === 'completed' ? new Date().toISOString() : null;
          db.prepare(`
            UPDATE agentic_tasks SET status = ?, completed_at = COALESCE(?, completed_at), updated_at = datetime('now')
            WHERE id = ?
          `).run(finalStatus, completedAt, step.id);
        }
      } catch (e) { /* best effort */ }
    }

    // ─── Phase 3: SYNTHESIS ───
    logger.info(`[ReasoningLoop:PlanMode] Phase 3: Synthesizing results (${Object.keys(stepResults).length} steps completed, ${blockedSteps} blocked)`);

    let finalThought = '';

    // Build synthesis prompt with all step results
    const synthMessages = [...messages];
    const resultsText = Object.entries(stepResults)
      .map(([id, v]) => {
        if (v.status === 'blocked') return `- ${v.title || id}: BLOCKED (awaiting response from ${v.awaitingFrom})`;
        const resultStr = v.result ? JSON.stringify(v.result).substring(0, 300) : (v.summary || 'completed');
        return `- ${v.title || id}: ${resultStr}`;
      }).join('\n');

    synthMessages.push({
      role: 'user',
      content: `You have completed your plan. Here are the results from each step:

${resultsText}

${blockedSteps > 0 ? `Note: ${blockedSteps} step(s) are awaiting human responses. Mention this in your summary.` : ''}

Now use "respond" to send a comprehensive final response to the user summarizing everything you found and accomplished. Then use "done" to finish.`,
    });

    const synthResult = await this._callAI(synthMessages, profile, hasOwnProvider);
    tokensUsed += synthResult.tokensUsed;
    iterations++;

    if (synthResult.content) {
      const synthCalls = this.parseToolCalls(synthResult.content);
      for (const call of synthCalls) {
        if (call.action === 'respond' && typeof triggerContext._onIntermediateRespond === 'function') {
          const respResult = await this.executeTool('respond', call.params, toolContext);
          if (respResult.success && respResult.result?.message) {
            try { await triggerContext._onIntermediateRespond(respResult.result.message); } catch (e) { /* ok */ }
            finalThought = respResult.result.message;
          }
          actions.push({ tool: 'respond', params: call.params, status: 'executed', sentImmediately: true });
        } else if (call.action === 'done') {
          finalThought = finalThought || call.reasoning || 'Plan completed';
        }
      }

      if (!finalThought) {
        finalThought = synthResult.content;
      }
    }

    // ─── Phase 4: COMPLETION ───
    logger.info(`[ReasoningLoop:PlanMode] Phase 4: Completing plan`);

    // Update root plan task
    try {
      const planStatus = blockedSteps > 0 ? 'blocked' : 'completed';
      db.prepare(`
        UPDATE agentic_tasks SET
          status = ?, completed_at = datetime('now'), updated_at = datetime('now'),
          ai_summary = ?
        WHERE id = ?
      `).run(planStatus, (finalThought || '').substring(0, 500), plan.planId);
    } catch (e) { /* best effort */ }

    // Save learnings to memory
    try {
      const { getAgenticMemoryService } = require('./AgenticMemoryService.cjs');
      const memService = getAgenticMemoryService();
      if (memService && memService.createMemory) {
        await memService.createMemory({
          agenticId: agentId,
          userId: profile.user_id,
          content: `Completed plan: "${plan.goal}". ${Object.keys(stepResults).length} steps. ${blockedSteps} awaiting human input. Result: ${(finalThought || '').substring(0, 200)}`,
          memoryType: 'plan_execution',
          tags: ['plan', 'reasoning'],
          importanceScore: 5,
        });
      }
    } catch (e) { /* memory save is best-effort */ }

    // Log completion
    this.logActivity(db, agentId, profile.user_id, 'plan_driven_cycle_end', 'event', {
      planId: plan.planId,
      goal: plan.goal,
      totalSteps: plan.totalSteps,
      completedSteps: Object.values(stepResults).filter(v => v.status === 'completed').length,
      blockedSteps,
      iterations,
      tokensUsed,
    });

    return { actions, iterations, tokensUsed, finalThought, planId: plan.planId, planDriven: true };
  }

  /**
   * Helper: Make a single AI call via SuperBrainRouter.
   * @private
   */
  async _callAI(messages, profile, hasOwnProvider) {
    const { getSuperBrainRouter } = require('../ai/SuperBrainRouter.cjs');
    const superBrain = getSuperBrainRouter();

    const truncatedMessages = this.truncateMessages(messages);

    const processRequest = {
      task: 'Autonomous agent reasoning: analyze context, select tools, execute actions. Requires structured JSON output.',
      messages: truncatedMessages,
      userId: profile.user_id,
    };

    if (hasOwnProvider) {
      processRequest.forceProvider = profile.ai_provider;
    } else {
      processRequest.forceTier = 'moderate';
    }

    try {
      const result = await superBrain.process(processRequest, {
        isAgentic: true,
        temperature: profile.temperature != null ? profile.temperature : undefined,
        maxTokens: profile.max_tokens != null ? profile.max_tokens : undefined,
        model: hasOwnProvider ? profile.ai_model : undefined,
      });

      return {
        content: result.content || '',
        tokensUsed: (result.usage?.promptTokens || 0) + (result.usage?.completionTokens || 0),
      };
    } catch (e) {
      logger.error(`[ReasoningLoop:PlanMode] AI call failed: ${e.message}`);
      return { content: '', tokensUsed: 0 };
    }
  }

  // =====================================================
  // UTILS
  // =====================================================

  safeJsonParse(str, fallback = null) {
    if (!str) return fallback;
    try { return JSON.parse(str); } catch (e) { return fallback; }
  }

  // =====================================================
  // TOOL RESULT SUMMARIZATION
  // =====================================================

  /**
   * Summarize a tool result to a reasonable size for feeding back to the AI.
   * Prevents context window pollution from large raw JSON dumps.
   * @param {string} toolId - The tool that produced the result
   * @param {*} result - The raw tool result
   * @param {number} maxChars - Maximum characters for the summary (default 800)
   * @returns {string} Summarized result string
   */
  summarizeToolResult(toolId, result, maxChars = 800) {
    if (result === null || result === undefined) return 'No result returned';

    // CLI tool results: prioritize file info over verbose CLI text output
    // The 'response' field from CLI can be 1000+ chars of raw output, pushing
    // critical createdFiles info beyond the 800-char truncation limit.
    if (typeof result === 'object' && result !== null && result.createdFiles && Array.isArray(result.createdFiles) && result.createdFiles.length > 0) {
      const fileList = result.createdFiles.map(f =>
        `- ${f.name} (${f.size}) path="${f.filePath}" mime=${f.mimeType}${f.autoDelivered ? ' [AUTO-DELIVERED]' : ''}`
      ).join('\n');
      const autoNote = result.autoDelivered
        ? `\n[${result.autoDelivered} file(s) have been AUTO-DELIVERED to the user via DLQ — do NOT call sendWhatsAppMedia/sendTelegramMedia again for these files]`
        : '';
      const briefResponse = (result.response || '').substring(0, 300);
      return `CLI ${result.cliType || 'tool'} completed successfully.\nGenerated files:\n${fileList}${autoNote}\n\nCLI output (brief): ${briefResponse}`;
    }

    // String results: truncate if too long
    if (typeof result === 'string') {
      if (result.length <= maxChars) return result;
      return result.substring(0, maxChars) + `... [truncated, ${result.length} chars total]`;
    }

    // Array results (e.g., search results, contact lists): count + preview
    if (Array.isArray(result)) {
      const count = result.length;
      if (count === 0) return '[] (empty)';

      const preview = result.slice(0, 3).map(item => {
        if (typeof item === 'object' && item !== null) {
          const itemStr = JSON.stringify(item);
          return itemStr.length > 200 ? itemStr.substring(0, 200) + '...' : itemStr;
        }
        return String(item);
      });

      let summary = `[${count} items] First ${Math.min(3, count)}:\n${preview.join('\n')}`;
      if (count > 3) summary += `\n... and ${count - 3} more`;

      if (summary.length > maxChars) {
        return summary.substring(0, maxChars) + '...';
      }
      return summary;
    }

    // Object results: truncate long values
    if (typeof result === 'object') {
      const str = JSON.stringify(result);
      if (str.length <= maxChars) return str;

      const truncated = {};
      for (const [key, value] of Object.entries(result)) {
        if (typeof value === 'string' && value.length > 200) {
          truncated[key] = value.substring(0, 200) + `... [${value.length} chars]`;
        } else if (Array.isArray(value) && value.length > 3) {
          truncated[key] = `[${value.length} items] ${JSON.stringify(value.slice(0, 2)).substring(0, 150)}...`;
        } else {
          truncated[key] = value;
        }
      }

      const truncStr = JSON.stringify(truncated);
      if (truncStr.length <= maxChars) return truncStr;
      return truncStr.substring(0, maxChars) + '...';
    }

    return String(result);
  }

  // =====================================================
  // TOOL CALL VALIDATION
  // =====================================================

  /**
   * Levenshtein distance for fuzzy tool name matching.
   * @private
   */
  _levenshtein(a, b) {
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] = a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
    return dp[m][n];
  }

  /**
   * Validate and auto-correct a tool call before execution.
   * Fuzzy-matches tool names, corrects common parameter name mistakes.
   * @param {Object} call - Parsed tool call { action, params, reasoning }
   * @param {string[]} availableToolIds - Available tool IDs for this agent
   * @returns {{ valid: boolean, correctedCall: Object|null, error: string|null }}
   */
  validateToolCall(call, availableToolIds) {
    // Common aliases: AI models frequently use these instead of exact tool names
    const TOOL_ALIASES = {
      'respondToUser': 'respond', 'reply': 'respond', 'send_response': 'respond',
      'search': 'searchWeb', 'web_search': 'searchWeb', 'webSearch': 'searchWeb',
      'query': 'ragQuery', 'queryKnowledge': 'ragQuery', 'rag_query': 'ragQuery',
      'finish': 'done', 'complete': 'done', 'end': 'done',
      'notify': 'notifyMaster', 'delegate': 'delegateTask',
      'handoff': 'handoffToAgent', 'hand_off': 'handoffToAgent',
      'send_whatsapp': 'sendWhatsApp', 'send_email': 'sendEmail', 'send_telegram': 'sendTelegram',
      'createPlan': 'generatePlan', 'makePlan': 'generatePlan', 'plan': 'generatePlan',
      'ask_human': 'requestHumanInput', 'askHuman': 'requestHumanInput',
      'save_memory': 'saveMemory', 'remember': 'saveMemory',
      'check_agents': 'checkAgentStatuses', 'listAgents': 'checkAgentStatuses',
      'send_message': 'sendMessageToContact', 'sendMessage': 'sendMessageToContact',
    };

    // Common parameter name corrections
    const PARAM_ALIASES = {
      'msg': 'message', 'text': 'message', 'content': 'message', 'body': 'message',
      'q': 'query', 'search_query': 'query', 'searchQuery': 'query', 'term': 'query',
      'recipient_name': 'contactName', 'contact': 'contactName',
    };

    let action = call.action;
    let params = { ...call.params };

    // Step 1: Direct match
    if (availableToolIds.includes(action)) {
      // Correct param names even on direct match
      params = this._correctParamNames(params, PARAM_ALIASES);
      return { valid: true, correctedCall: { ...call, action, params }, error: null };
    }

    // Step 2: Alias match
    if (TOOL_ALIASES[action] && availableToolIds.includes(TOOL_ALIASES[action])) {
      const corrected = TOOL_ALIASES[action];
      logger.info(`[ReasoningLoop] Tool alias corrected: "${action}" -> "${corrected}"`);
      action = corrected;
      params = this._correctParamNames(params, PARAM_ALIASES);
      return { valid: true, correctedCall: { ...call, action, params }, error: null };
    }

    // Step 3: Fuzzy match (Levenshtein distance <= 3)
    let bestMatch = null;
    let bestDistance = Infinity;
    for (const toolId of availableToolIds) {
      const dist = this._levenshtein(action.toLowerCase(), toolId.toLowerCase());
      if (dist < bestDistance && dist <= 3) {
        bestDistance = dist;
        bestMatch = toolId;
      }
    }
    if (bestMatch) {
      logger.info(`[ReasoningLoop] Tool fuzzy-matched: "${action}" -> "${bestMatch}" (distance: ${bestDistance})`);
      action = bestMatch;
      params = this._correctParamNames(params, PARAM_ALIASES);
      return { valid: true, correctedCall: { ...call, action, params }, error: null };
    }

    // Step 4: No match - return error with suggestions
    const suggestions = availableToolIds
      .map(id => ({ id, dist: this._levenshtein(action.toLowerCase(), id.toLowerCase()) }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 5)
      .map(s => s.id);

    return {
      valid: false,
      correctedCall: null,
      error: `Tool "${action}" not found. Did you mean: ${suggestions.join(', ')}?`,
    };
  }

  /**
   * Correct common parameter name mistakes.
   * @private
   */
  _correctParamNames(params, aliases) {
    const corrected = { ...params };
    for (const [alias, canonical] of Object.entries(aliases)) {
      if (corrected[alias] !== undefined && corrected[canonical] === undefined) {
        corrected[canonical] = corrected[alias];
        delete corrected[alias];
      }
    }
    return corrected;
  }

  // =====================================================
  // ITERATION BUDGET CLASSIFICATION
  // =====================================================

  /**
   * Determine iteration budget using TaskClassifier's structured analysis
   * instead of fragile inline keyword matching.
   * @param {string} taskText - The task/message text
   * @param {string} triggerType - The trigger type (e.g., 'incoming_message')
   * @param {Object} classification - Result from TaskClassifier.classify()
   * @returns {{ tier: string, reason: string|null }}
   */
  classifyIterationBudget(taskText, triggerType, classification) {
    let tier = classification.tier;
    let reason = null;

    // Floor: direct human messages should never be trivial
    if (tier === 'trivial' && triggerType === 'incoming_message') {
      tier = 'simple';
      reason = 'incoming_message upgraded from trivial to simple';
    }

    const analysis = classification.analysis || {};
    const confidence = classification.confidence || 0;

    // Multi-step tasks need at least moderate budget
    if ((tier === 'trivial' || tier === 'simple') && analysis.isMultiStep) {
      tier = 'moderate';
      reason = 'multi-step task detected via analysis';
    }

    // CLI tool requests need at least moderate budget for tool selection
    // When user explicitly asks for CLI tools (gemini, claude, opencode),
    // the AI needs enough iterations to: 1) pick the right CLI tool, 2) execute, 3) respond
    if ((tier === 'trivial' || tier === 'simple') && taskText) {
      const lower = taskText.toLowerCase();
      const cliMentioned = /\b(gemini\s*cli|claude\s*cli|opencode\s*cli|cli\s*tool|use\s+(gemini|claude|opencode))\b/i.test(lower);
      const fileGenMentioned = /\b(convert|generate|create|make)\b.*\b(docx|xlsx|pdf|excel|document|file|spreadsheet)\b/i.test(lower);
      if (cliMentioned || fileGenMentioned) {
        tier = 'moderate';
        reason = cliMentioned
          ? 'CLI tool explicitly requested — needs tool selection budget'
          : 'file generation task — needs tool execution budget';
      }
    }

    // Command-type messages with low confidence in simple tier -> boost to moderate
    if (tier === 'simple' && analysis.isCommand && triggerType === 'incoming_message' && confidence < 0.75) {
      tier = 'moderate';
      reason = `command with low confidence (${confidence}) boosted to moderate`;
    }

    // Check score differentials: if complex score is close to simple, boost to moderate
    // Guard: only for messages with meaningful content (>5 words) to prevent "Hi" from upgrading
    const wordCount = taskText.split(/\s+/).filter(Boolean).length;
    if (tier === 'simple' && classification.scores && wordCount > 5) {
      const complexScore = classification.scores.complex || 0;
      const simpleScore = classification.scores.simple || 0;
      if (complexScore > 0 && complexScore >= simpleScore * 0.7) {
        tier = 'moderate';
        reason = `complex score (${complexScore.toFixed(1)}) close to simple (${simpleScore.toFixed(1)})`;
      }
    }

    return { tier, reason };
  }

  // =====================================================
  // PHASE 4: WebSocket Event Emission + Runtime Control
  // =====================================================

  /**
   * Emit a real-time agentic event via WebSocket.
   * @param {string|null} userId - User to target (null = broadcast to agent room)
   * @param {string} agentId - Agent ID
   * @param {string} event - Event name (e.g. 'agentic:reasoning:start')
   * @param {Object} data - Event payload
   */
  _emitAgenticEvent(userId, agentId, event, data) {
    try {
      const io = global.io;
      if (!io) return;
      const payload = { ...data, agentId };
      // Emit to agent-specific room
      io.to(`agent:${agentId}`).emit(event, payload);
      // Also emit to user room if userId available
      if (userId) {
        io.to(`user:${userId}`).emit(event, payload);
      }
    } catch (e) {
      // WebSocket emission is non-blocking
    }
  }

  /**
   * Sanitize params for WebSocket transmission (remove secrets, truncate long strings).
   */
  _sanitizeParams(params) {
    if (!params || typeof params !== 'object') return params;
    const sanitized = { ...params };
    const sensitiveKeys = ['password', 'apiKey', 'token', 'secret', 'api_key'];
    for (const key of sensitiveKeys) {
      if (sanitized[key]) sanitized[key] = '***';
    }
    for (const [key, value] of Object.entries(sanitized)) {
      if (typeof value === 'string' && value.length > 500) {
        sanitized[key] = value.substring(0, 500) + '...';
      }
    }
    return sanitized;
  }

  /**
   * Pause a running reasoning loop.
   */
  pause(agentId) {
    this.pausedLoops.add(agentId);
    logger.info(`[ReasoningLoop] Paused agent ${agentId}`);
    this._emitAgenticEvent(null, agentId, 'agentic:status:changed', {
      status: 'paused', timestamp: new Date().toISOString(),
    });
  }

  /**
   * Resume a paused reasoning loop.
   */
  resume(agentId) {
    this.pausedLoops.delete(agentId);
    logger.info(`[ReasoningLoop] Resumed agent ${agentId}`);
    this._emitAgenticEvent(null, agentId, 'agentic:status:changed', {
      status: 'resumed', timestamp: new Date().toISOString(),
    });
  }

  /**
   * Interrupt (force stop) a running reasoning loop.
   */
  interrupt(agentId) {
    this.interruptedLoops.add(agentId);
    logger.info(`[ReasoningLoop] Interrupted agent ${agentId}`);
    this._emitAgenticEvent(null, agentId, 'agentic:status:changed', {
      status: 'interrupted', timestamp: new Date().toISOString(),
    });
  }

  /**
   * Check if an agent's reasoning loop is currently running.
   */
  isRunning(agentId) {
    for (const [key] of this.runningLoops) {
      if (key.startsWith(agentId + ':')) return true;
    }
    return false;
  }

  /**
   * Check if an agent is currently paused.
   */
  isPaused(agentId) {
    return this.pausedLoops.has(agentId);
  }

  /**
   * Get rate limit status for an agent.
   */
  getRateLimitStatus(agentId) {
    const entry = this.rateLimiter.get(agentId);
    if (!entry) return { used: 0, max: this.maxCyclesPerHour, resetsAt: null };
    const now = Date.now();
    const windowMs = 60 * 60 * 1000;
    if (now - entry.windowStart > windowMs) {
      return { used: 0, max: this.maxCyclesPerHour, resetsAt: null };
    }
    return {
      used: entry.count,
      max: this.maxCyclesPerHour,
      resetsAt: new Date(entry.windowStart + windowMs).toISOString(),
    };
  }

  // =====================================================
  // PHASE 2: Post-Execution Reflection
  // =====================================================

  /**
   * Reflect on execution results, save learnings, update skill XP.
   * Non-blocking: errors don't affect the main execution.
   */
  async _reflectOnExecution(agentId, userId, trigger, triggerContext, result) {
    try {
      const { getReflectionService } = require('./ReflectionService.cjs');
      const reflectionService = getReflectionService();

      const insights = await reflectionService.reflect(agentId, userId, {
        trigger,
        triggerContext,
        actions: result.actions || [],
        iterations: result.iterations || 0,
        tokensUsed: result.tokensUsed || 0,
        finalThought: result.finalThought,
      });

      // Save memories
      if (insights.memoriesToSave.length > 0) {
        try {
          const { getAgenticMemoryService } = require('./AgenticMemoryService.cjs');
          const memService = getAgenticMemoryService();

          for (const mem of insights.memoriesToSave) {
            try {
              await memService.createMemory(agentId, userId, {
                type: mem.type,
                content: mem.content,
                importance_score: mem.importance,
                tags: mem.tags || [],
              });
            } catch (e) {
              logger.debug(`[ReasoningLoop] Failed to save learning memory: ${e.message}`);
            }
          }
          logger.info(`[ReasoningLoop] Saved ${insights.memoriesToSave.length} memories from reflection`);
        } catch (e) {
          logger.debug(`[ReasoningLoop] Memory service unavailable for reflection: ${e.message}`);
        }
      }

      // Update skill XP
      if (insights.skillUpdates.length > 0) {
        try {
          const db = getDatabase();
          for (const update of insights.skillUpdates) {
            try {
              const skill = db.prepare(`
                SELECT s.id FROM agentic_agent_skills s
                JOIN agentic_skills_catalog c ON s.skill_id = c.id
                WHERE s.agentic_id = ? AND c.category = ?
                LIMIT 1
              `).get(agentId, update.category);

              if (skill) {
                db.prepare(`
                  UPDATE agentic_agent_skills SET xp = xp + ?, updated_at = ? WHERE id = ?
                `).run(update.xpGain, new Date().toISOString(), skill.id);
              }
            } catch (e) { /* skill update optional */ }
          }

          // Check for level-ups after XP updates
          reflectionService.checkSkillLevelUps(agentId);
        } catch (e) {
          logger.debug(`[ReasoningLoop] Skill XP update failed: ${e.message}`);
        }
      }

      // Phase 7: Apply skill decay for inactive skills
      try {
        reflectionService.applySkillDecay(agentId);
      } catch (decayErr) {
        logger.debug(`[ReasoningLoop] Skill decay check failed: ${decayErr.message}`);
      }
    } catch (reflectionError) {
      logger.debug(`[ReasoningLoop] Reflection error (non-critical): ${reflectionError.message}`);
    }
  }

  // =====================================================
  // PHASE 7: RAG Auto-Enrichment
  // =====================================================

  /**
   * Automatically query the user's knowledge libraries for context
   * relevant to the current conversation. Injects RAG results as
   * a system-level context message (only on iteration 2+).
   */
  async _enrichWithRAG(agentId, userId, messages) {
    try {
      const db = getDatabase();

      // Check if user has knowledge libraries
      const libraries = db.prepare(`SELECT id FROM knowledge_libraries WHERE user_id = ?`).all(userId);
      if (!libraries || libraries.length === 0) return;

      // Extract search terms from the last 2 user/assistant messages
      const recentMessages = messages.slice(-2).filter(m => m.role === 'user' || m.role === 'assistant');
      if (recentMessages.length === 0) return;

      const searchText = recentMessages.map(m => m.content).join(' ');
      // Extract key terms (first 100 chars, skip common words)
      const terms = searchText.substring(0, 200).replace(/[^\w\s]/g, ' ').split(/\s+/)
        .filter(w => w.length > 3)
        .slice(0, 8)
        .join(' ');

      if (!terms || terms.length < 4) return;

      const { getRetrievalService } = require('../rag/RetrievalService.cjs');
      const retrieval = getRetrievalService();
      const results = await retrieval.retrieve(terms, {
        libraryIds: libraries.map(l => l.id),
        topK: 3,
        minScore: 0.5,
        userId,
      });

      if (results && results.chunks && results.chunks.length > 0) {
        const contextSnippets = results.chunks
          .map(c => c.content || c.text || '')
          .filter(Boolean)
          .map(t => t.substring(0, 500))
          .join('\n---\n');

        if (contextSnippets.length > 10) {
          // Inject as system context (before the last message)
          const insertIdx = Math.max(1, messages.length - 1);
          messages.splice(insertIdx, 0, {
            role: 'system',
            content: `[RAG Context — Relevant knowledge from your libraries]\n${contextSnippets}`,
          });
          logger.debug(`[ReasoningLoop] RAG enrichment: injected ${results.chunks.length} chunks for agent ${agentId}`);
        }
      }
    } catch (err) {
      logger.debug(`[ReasoningLoop] RAG enrichment skipped: ${err.message}`);
    }
  }

  // =====================================================
  // PHASE 5: Micro-XP + Skill Helpers
  // =====================================================

  /**
   * Award +1 micro-XP for a successful tool execution.
   */
  _awardMicroXP(agentId, toolName) {
    try {
      const category = this._getToolCategory(toolName);
      if (!category) return;

      const db = getDatabase();
      db.prepare(`
        UPDATE agentic_agent_skills
        SET xp = xp + 1, updated_at = ?
        WHERE agentic_id = ? AND skill_id IN (
          SELECT id FROM agentic_skills_catalog WHERE category = ?
        )
      `).run(new Date().toISOString(), agentId, category);
    } catch (e) { /* XP update is optional */ }
  }

  /**
   * Get the skill category for a given tool.
   */
  _getToolCategory(toolId) {
    for (const [category, config] of Object.entries(SKILL_CATEGORY_TO_TOOLS)) {
      if (config.tools && config.tools.includes(toolId)) return category;
    }
    return null;
  }

  /**
   * Get an agent's skills (for decomposition context).
   */
  _getAgentSkills(agentId) {
    try {
      const db = getDatabase();
      return db.prepare(`
        SELECT c.name, c.category, s.current_level, s.xp
        FROM agentic_agent_skills s
        JOIN agentic_skills_catalog c ON s.skill_id = c.id
        WHERE s.agentic_id = ?
      `).all(agentId);
    } catch (e) {
      return [];
    }
  }
}

// Singleton
let instance = null;

function getAgentReasoningLoop() {
  if (!instance) {
    instance = new AgentReasoningLoop();
    logger.info('[ReasoningLoop] AgentReasoningLoop initialized');
  }
  return instance;
}

module.exports = {
  AgentReasoningLoop,
  getAgentReasoningLoop,
};
