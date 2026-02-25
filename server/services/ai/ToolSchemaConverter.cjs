'use strict';

/**
 * ToolSchemaConverter
 *
 * Converts SwarmAI internal tool definitions (from SystemToolsRegistry)
 * to OpenAI-compatible function calling format for native tool use.
 *
 * SwarmAI format:
 *   { id, name, description, parameters: { param: { type, description, optional } }, requiredParams }
 *
 * OpenAI format:
 *   { type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } }
 */

const { logger } = require('../logger.cjs');

/**
 * Map SwarmAI parameter type to JSON Schema type
 */
function mapParamType(swarmType) {
  if (!swarmType) return 'string';
  const normalized = String(swarmType).toLowerCase().trim();

  switch (normalized) {
    case 'string':  return 'string';
    case 'number':  return 'number';
    case 'integer': return 'integer';
    case 'boolean': return 'boolean';
    case 'array':   return 'array';
    case 'object':  return 'object';
    case 'any':     return null;  // No type constraint
    default:        return 'string';
  }
}

/**
 * Convert a single SwarmAI tool parameter to JSON Schema property
 */
function convertParam(paramDef) {
  const prop = {};
  const mappedType = mapParamType(paramDef.type);

  if (mappedType) {
    prop.type = mappedType;
  }

  if (paramDef.description) {
    prop.description = paramDef.description;
  }

  // Array items
  if (mappedType === 'array' && paramDef.items) {
    prop.items = typeof paramDef.items === 'object' ? paramDef.items : { type: 'string' };
  }

  // Enum values
  if (paramDef.enum) {
    prop.enum = paramDef.enum;
  }

  return prop;
}

/**
 * Convert a single SwarmAI tool definition to OpenAI function calling format
 *
 * @param {Object} toolDef - SwarmAI tool definition from SystemToolsRegistry
 * @returns {Object|null} OpenAI function tool format, or null if invalid
 */
function convertToolToOpenAI(toolDef) {
  if (!toolDef || !toolDef.id) return null;

  const properties = {};
  const paramEntries = Object.entries(toolDef.parameters || {});

  for (const [paramName, paramDef] of paramEntries) {
    properties[paramName] = convertParam(paramDef);
  }

  const required = (toolDef.requiredParams || []).filter(p => properties[p]);

  const schema = {
    type: 'object',
    properties,
  };

  if (required.length > 0) {
    schema.required = required;
  }

  return {
    type: 'function',
    function: {
      name: toolDef.id,
      description: (toolDef.description || toolDef.name || toolDef.id).substring(0, 1024),
      parameters: schema,
    },
  };
}

/**
 * Synthetic tool definitions for special actions (done, silent, respond, clarify)
 * These are not "real" tools but control actions the AI uses to manage the loop.
 */
const SYNTHETIC_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'done',
      description: 'Signal that the task is complete. Use this when you have fully addressed the request and no more actions are needed.',
      parameters: {
        type: 'object',
        properties: {
          reasoning: {
            type: 'string',
            description: 'Summary of what was accomplished',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'silent',
      description: 'Signal that no response is needed for this message. Use when the message does not require any reply.',
      parameters: {
        type: 'object',
        properties: {
          reasoning: {
            type: 'string',
            description: 'Why no response is needed',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'respond',
      description: 'Send a text response to the user in the current conversation. This replies to the person who sent the message.',
      parameters: {
        type: 'object',
        properties: {
          message: {
            type: 'string',
            description: 'The response message to send',
          },
        },
        required: ['message'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'clarify',
      description: 'Ask the user a clarifying question to get more information before proceeding.',
      parameters: {
        type: 'object',
        properties: {
          question: {
            type: 'string',
            description: 'The clarifying question to ask',
          },
        },
        required: ['question'],
      },
    },
  },
];

// Tools that are already covered by SYNTHETIC_TOOLS (avoid duplicates)
const SYNTHETIC_TOOL_IDS = new Set(SYNTHETIC_TOOLS.map(t => t.function.name));

/**
 * Convert an array of SwarmAI tool definitions to OpenAI function calling format.
 * Includes synthetic tools (done, silent, respond, clarify) and deduplicates.
 *
 * @param {Object[]} toolDefs - Array of SwarmAI tool definitions
 * @returns {Object[]} Array of OpenAI function tool definitions
 */
function convertToolsToOpenAI(toolDefs) {
  if (!toolDefs || !Array.isArray(toolDefs) || toolDefs.length === 0) {
    return [...SYNTHETIC_TOOLS];
  }

  const converted = [];
  const seenNames = new Set();

  // Convert real tools first (skip those covered by synthetics)
  for (const toolDef of toolDefs) {
    if (!toolDef?.id) continue;
    if (SYNTHETIC_TOOL_IDS.has(toolDef.id)) continue;
    if (seenNames.has(toolDef.id)) continue;

    const openAITool = convertToolToOpenAI(toolDef);
    if (openAITool) {
      converted.push(openAITool);
      seenNames.add(toolDef.id);
    }
  }

  // Add synthetic tools
  for (const synth of SYNTHETIC_TOOLS) {
    if (!seenNames.has(synth.function.name)) {
      converted.push(synth);
      seenNames.add(synth.function.name);
    }
  }

  logger.debug(`[ToolSchemaConverter] Converted ${converted.length} tools to OpenAI format (${toolDefs.length} input + ${SYNTHETIC_TOOLS.length} synthetic)`);

  return converted;
}

module.exports = {
  convertToolToOpenAI,
  convertToolsToOpenAI,
  convertParam,
  mapParamType,
  SYNTHETIC_TOOLS,
};
