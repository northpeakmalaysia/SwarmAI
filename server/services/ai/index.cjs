/**
 * Super Brain AI Services Index
 *
 * Central exports for all Super Brain AI orchestration services.
 * Provides unified access to task classification, provider routing,
 * CLI management, and failover configuration.
 */

// Core Services
const { TaskClassifier, getTaskClassifier, TASK_TIERS } = require('./TaskClassifier.cjs');
const { ProviderStrategy, getProviderStrategy, PROVIDERS, DEFAULT_STRATEGY } = require('./ProviderStrategy.cjs');
const { SuperBrainRouter, getSuperBrainRouter, HEALTH_STATUS } = require('./SuperBrainRouter.cjs');

// CLI Management
const { CLIAuthManager, getCLIAuthManager, AUTH_STATES, CLI_TYPES } = require('./CLIAuthManager.cjs');
const { WorkspaceManager, getWorkspaceManager } = require('./WorkspaceManager.cjs');

// Configuration
const { FailoverConfigService, getFailoverConfigService } = require('./FailoverConfigService.cjs');

// Providers
const { OllamaProvider, getOllamaProvider } = require('./providers/OllamaProvider.cjs');
const { OpenRouterProvider, getOpenRouterProvider } = require('./providers/OpenRouterProvider.cjs');
const { CLIAIProvider, getCLIAIProvider, CLI_CONFIGS, EXECUTION_STATUS } = require('./providers/CLIAIProvider.cjs');

// AI Router & System Tools
const { SystemToolsRegistry, getSystemToolsRegistry, TOOL_CATEGORIES, BUILT_IN_TOOLS } = require('./SystemToolsRegistry.cjs');
const { AIRouterService, getAIRouterService, CONFIDENCE_THRESHOLDS, CHAIN_PLACEHOLDERS } = require('./AIRouterService.cjs');
const { initializeToolExecutors } = require('./SystemToolExecutors.cjs');

// Message Processor (Central Hub)
const {
  SuperBrainMessageProcessor,
  getSuperBrainMessageProcessor,
  PROCESSING_MODES,
  RESPONSE_TYPES,
  MESSAGE_SCHEMA,
} = require('./SuperBrainMessageProcessor.cjs');

// Activity Logging
const {
  SuperBrainLogService,
  getSuperBrainLogService,
  LOG_TTL_SECONDS,
} = require('./SuperBrainLogService.cjs');

/**
 * Initialize the Super Brain system
 * Sets up all services with proper dependencies
 * @param {Object} options - Initialization options
 * @returns {Object} Initialized Super Brain router
 */
function initializeSuperBrain(options = {}) {
  const {
    terminalService,
    healthCheckInterval = 60000,
    enableHealthCheck = true,
  } = options;

  // Get singleton instances
  const superBrain = getSuperBrainRouter({
    healthCheckInterval,
    enableHealthCheck,
  });

  const cliAuthManager = getCLIAuthManager();
  const workspaceManager = getWorkspaceManager();
  const failoverConfig = getFailoverConfigService();

  // Wire up dependencies
  if (terminalService) {
    cliAuthManager.setTerminalService(terminalService);
  }

  superBrain.setFailoverConfig(failoverConfig);
  superBrain.setWorkspaceManager(workspaceManager);

  // Start cleanup tasks
  cliAuthManager.startCleanupTask();

  // Load authenticated sessions from database
  cliAuthManager.loadAuthenticatedSessions();

  // Initialize AI Router and Tool Executors
  initializeToolExecutors();
  const aiRouter = getAIRouterService();
  aiRouter.setSuperBrain(superBrain);

  // Initialize Message Processor (Central Hub)
  const messageProcessor = getSuperBrainMessageProcessor();
  if (options.broadcast) {
    messageProcessor.setBroadcast(options.broadcast);
  }

  // Initialize Log Service with broadcast
  const logService = getSuperBrainLogService();
  if (options.broadcast) {
    logService.setBroadcast(options.broadcast);
  }

  return superBrain;
}

/**
 * Shutdown the Super Brain system
 * Cleans up all services and stops monitoring
 */
function shutdownSuperBrain() {
  const superBrain = getSuperBrainRouter();
  const cliAuthManager = getCLIAuthManager();

  superBrain.stopHealthMonitoring();
  cliAuthManager.stopCleanupTask();

  // Shutdown MCP connections
  try {
    const { getMCPClientManager } = require('../mcp/MCPClientManager.cjs');
    const mcpManager = getMCPClientManager();
    mcpManager.shutdown().catch(err => {
      console.warn(`MCP shutdown error: ${err.message}`);
    });
  } catch (e) {
    // MCP not initialized, ignore
  }
}

/**
 * Get Super Brain status summary
 * @returns {Object} Status summary of all components
 */
function getSuperBrainStatus() {
  const superBrain = getSuperBrainRouter();
  const cliAuthManager = getCLIAuthManager();
  const workspaceManager = getWorkspaceManager();
  const failoverConfig = getFailoverConfigService();

  return {
    router: superBrain.getInfo(),
    cliAuth: cliAuthManager.getAuthStatus(),
    workspaces: workspaceManager.getInfo(),
    failoverConfig: failoverConfig.getDefaultHierarchy(),
  };
}

module.exports = {
  // Core Services
  TaskClassifier,
  getTaskClassifier,
  TASK_TIERS,

  ProviderStrategy,
  getProviderStrategy,
  PROVIDERS,
  DEFAULT_STRATEGY,

  SuperBrainRouter,
  getSuperBrainRouter,
  HEALTH_STATUS,

  // CLI Management
  CLIAuthManager,
  getCLIAuthManager,
  AUTH_STATES,
  CLI_TYPES,

  WorkspaceManager,
  getWorkspaceManager,

  // Configuration
  FailoverConfigService,
  getFailoverConfigService,

  // Providers
  OllamaProvider,
  getOllamaProvider,

  OpenRouterProvider,
  getOpenRouterProvider,

  CLIAIProvider,
  getCLIAIProvider,
  CLI_CONFIGS,
  EXECUTION_STATUS,

  // AI Router & System Tools
  SystemToolsRegistry,
  getSystemToolsRegistry,
  TOOL_CATEGORIES,
  BUILT_IN_TOOLS,

  AIRouterService,
  getAIRouterService,
  CONFIDENCE_THRESHOLDS,
  CHAIN_PLACEHOLDERS,

  initializeToolExecutors,

  // Message Processor
  SuperBrainMessageProcessor,
  getSuperBrainMessageProcessor,
  PROCESSING_MODES,
  RESPONSE_TYPES,
  MESSAGE_SCHEMA,

  // Activity Logging
  SuperBrainLogService,
  getSuperBrainLogService,
  LOG_TTL_SECONDS,

  // Initialization helpers
  initializeSuperBrain,
  shutdownSuperBrain,
  getSuperBrainStatus,

  // MCP (lazy-loaded via require in routes)
  getMCPClientManager: () => require('../mcp/MCPClientManager.cjs').getMCPClientManager(),
};
