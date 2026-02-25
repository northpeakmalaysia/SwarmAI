/**
 * Built-in Tools Index
 *
 * Central export for all built-in agentic tools.
 * These tools are pre-configured and ready to use without custom code.
 */

const {
  EMAIL_TOOLS,
  getEmailTools,
  getEmailTool,
  executeEmailTool,
  getEmailToolList,
} = require('./EmailTools.cjs');

/**
 * All built-in tools organized by category
 */
const BUILTIN_TOOLS = {
  email: EMAIL_TOOLS,
};

/**
 * Get all built-in tools as a flat object
 * @returns {Object} All tools
 */
function getAllBuiltinTools() {
  return {
    ...EMAIL_TOOLS,
    // Add more tool categories here as they're created
  };
}

/**
 * Get all built-in tools as a list
 * @returns {Array} Tool list
 */
function getBuiltinToolList() {
  return [
    ...getEmailToolList(),
    // Add more tool lists here
  ];
}

/**
 * Get a specific built-in tool by name
 * @param {string} name - Tool name (e.g., 'email_send')
 * @returns {Object|null} Tool definition or null
 */
function getBuiltinTool(name) {
  // Check email tools
  const emailTool = getEmailTool(name);
  if (emailTool) return emailTool;

  // Add more tool lookups here as categories are added
  return null;
}

/**
 * Execute a built-in tool
 * @param {string} toolName - Tool name
 * @param {Object} inputs - Tool inputs
 * @param {Object} context - Execution context
 * @returns {Promise<Object>} Execution result
 */
async function executeBuiltinTool(toolName, inputs, context) {
  // Determine category and execute
  if (toolName.startsWith('email_')) {
    return executeEmailTool(toolName, inputs, context);
  }

  // Add more category checks here

  return { success: false, error: `Unknown built-in tool: ${toolName}` };
}

/**
 * Get tools by category
 * @param {string} category - Category name
 * @returns {Object} Tools in category
 */
function getToolsByCategory(category) {
  return BUILTIN_TOOLS[category] || {};
}

/**
 * Get available categories
 * @returns {Array} Category names
 */
function getCategories() {
  return Object.keys(BUILTIN_TOOLS);
}

module.exports = {
  // Collections
  BUILTIN_TOOLS,
  getAllBuiltinTools,
  getBuiltinToolList,
  getCategories,
  getToolsByCategory,

  // Individual tools
  getBuiltinTool,
  executeBuiltinTool,

  // Email tools (re-exported for convenience)
  EMAIL_TOOLS,
  getEmailTools,
  getEmailTool,
  executeEmailTool,
  getEmailToolList,
};
