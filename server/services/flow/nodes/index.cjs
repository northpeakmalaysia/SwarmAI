/**
 * Flow Nodes Registry
 *
 * Central index for all node executors. Provides factory function
 * to create and register all available node types with the FlowExecutionEngine.
 */

// Import node categories
const triggers = require('./triggers/index.cjs');
const ai = require('./ai/index.cjs');
const logic = require('./logic/index.cjs');
const messaging = require('./messaging/index.cjs');
const web = require('./web/index.cjs');
const agentic = require('./agentic/index.cjs');
const data = require('./data/index.cjs');
const swarm = require('./swarm/index.cjs');

/**
 * All available node executors organized by category
 */
const nodeExecutors = {
  triggers: {
    ManualTriggerNode: triggers.ManualTriggerNode,
    WebhookTriggerNode: triggers.WebhookTriggerNode,
    MessageTriggerNode: triggers.MessageTriggerNode,
    ScheduleTriggerNode: triggers.ScheduleTriggerNode,
  },
  ai: {
    ChatCompletionNode: ai.ChatCompletionNode,
    RAGQueryNode: ai.RAGQueryNode,
    AIRouterNode: ai.AIRouterNode,
    TranslateNode: ai.TranslateNode,
    SummarizeNode: ai.SummarizeNode,
    SuperBrainNode: ai.SuperBrainNode,
    ClassifyIntentNode: ai.ClassifyIntentNode,
    RephraseNode: ai.RephraseNode,
  },
  logic: {
    ConditionNode: logic.ConditionNode,
    SwitchNode: logic.SwitchNode,
    DelayNode: logic.DelayNode,
    SetVariableNode: logic.SetVariableNode,
    LoopNode: logic.LoopNode,
    ErrorHandlerNode: logic.ErrorHandlerNode,
    ParallelNode: logic.ParallelNode,
    MergeNode: logic.MergeNode,
    SubflowNode: logic.SubflowNode,
    RetryNode: logic.RetryNode,
  },
  messaging: {
    SendTextNode: messaging.SendTextNode,
    SendMediaNode: messaging.SendMediaNode,
    SendWhatsAppNode: messaging.SendWhatsAppNode,
    SendTelegramNode: messaging.SendTelegramNode,
    WaitForReplyNode: messaging.WaitForReplyNode,
  },
  web: {
    HttpRequestNode: web.HttpRequestNode,
  },
  agentic: {
    CustomToolNode: agentic.CustomToolNode,
  },
  data: {
    QueryNode: data.QueryNode,
    InsertNode: data.InsertNode,
    UpdateNode: data.UpdateNode,
  },
  swarm: {
    SwarmQueryAgentNode: swarm.SwarmQueryAgentNode,
    SwarmBroadcastNode: swarm.SwarmBroadcastNode,
    SwarmHandoffNode: swarm.SwarmHandoffNode,
    SwarmFindAgentNode: swarm.SwarmFindAgentNode,
    SwarmTaskNode: swarm.SwarmTaskNode,
    SwarmConsensusNode: swarm.SwarmConsensusNode,
    SwarmStatusNode: swarm.SwarmStatusNode,
  },
};

/**
 * Get a flat array of all node executor classes
 * @returns {Array} Array of node executor classes
 */
function getAllNodeExecutors() {
  const all = [];
  for (const category of Object.values(nodeExecutors)) {
    for (const ExecutorClass of Object.values(category)) {
      all.push(ExecutorClass);
    }
  }
  return all;
}

/**
 * Create instances of all node executors
 * @returns {Array} Array of instantiated node executors
 */
function createAllNodeExecutors() {
  return getAllNodeExecutors().map(ExecutorClass => new ExecutorClass());
}

/**
 * Register all node executors with a FlowExecutionEngine instance
 * @param {FlowExecutionEngine} engine - The engine to register nodes with
 */
function registerAllNodes(engine) {
  const executors = createAllNodeExecutors();
  for (const executor of executors) {
    engine.registerNode(executor);
  }
  return executors.length;
}

/**
 * Get node executor class by type identifier
 * @param {string} type - The node type (e.g., 'trigger:manual', 'ai:chatCompletion')
 * @returns {Class|null} The executor class or null if not found
 */
function getNodeExecutorByType(type) {
  // Create instances to check types
  for (const category of Object.values(nodeExecutors)) {
    for (const ExecutorClass of Object.values(category)) {
      const instance = new ExecutorClass();
      if (instance.type === type) {
        return ExecutorClass;
      }
    }
  }
  return null;
}

/**
 * Get list of all registered node types
 * @returns {Array<{type: string, category: string, name: string}>}
 */
function getRegisteredNodeTypes() {
  const types = [];
  for (const [categoryName, category] of Object.entries(nodeExecutors)) {
    for (const [className, ExecutorClass] of Object.entries(category)) {
      const instance = new ExecutorClass();
      types.push({
        type: instance.type,
        category: instance.category,
        name: className,
      });
    }
  }
  return types;
}

/**
 * Register custom tool nodes dynamically
 * Call this after initial node registration to add user's custom tools
 * @param {FlowExecutionEngine} engine - The engine to register nodes with
 * @param {string} [userId] - Optional user ID to filter tools
 * @returns {number} Number of custom tools registered
 */
function registerCustomToolNodes(engine, userId = null) {
  const customNodes = agentic.loadCustomToolNodes(userId);
  for (const node of customNodes) {
    engine.registerNode(node);
  }
  return customNodes.length;
}

module.exports = {
  // Category exports
  triggers,
  ai,
  logic,
  messaging,
  web,
  agentic,
  data,
  swarm,

  // Node executor registry
  nodeExecutors,

  // Utility functions
  getAllNodeExecutors,
  createAllNodeExecutors,
  registerAllNodes,
  registerCustomToolNodes,
  getNodeExecutorByType,
  getRegisteredNodeTypes,

  // Custom tool utilities (re-exported for convenience)
  loadCustomToolNodes: agentic.loadCustomToolNodes,
  getCustomToolsMetadata: agentic.getCustomToolsMetadata,
};
