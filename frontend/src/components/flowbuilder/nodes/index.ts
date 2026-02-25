/**
 * FlowBuilder Custom Node Components
 *
 * Custom node types for React Flow canvas supporting:
 * - Trigger nodes (amber) - Flow entry points
 * - Action nodes (various) - Operations and transformations
 * - AI nodes (violet) - AI-powered operations
 * - Swarm nodes (cyan) - Multi-agent operations
 */

export { default as TriggerNode } from './TriggerNode';
export { default as ActionNode } from './ActionNode';
export { default as AINode } from './AINode';
export { default as SwarmNode } from './SwarmNode';

export type { TriggerNodeData } from './TriggerNode';
export type { ActionNodeData } from './ActionNode';
export type { AINodeData } from './AINode';
export type { SwarmNodeData } from './SwarmNode';

// Node type registration for React Flow
import TriggerNode from './TriggerNode';
import ActionNode from './ActionNode';
import AINode from './AINode';
import SwarmNode from './SwarmNode';

export const nodeTypes = {
  trigger: TriggerNode,
  action: ActionNode,
  ai: AINode,
  swarm: SwarmNode,
} as const;

export type NodeType = keyof typeof nodeTypes;

// Node definitions for palette
export interface NodeDefinition {
  type: string;
  subtype: string;
  label: string;
  description: string;
  category: 'trigger' | 'action' | 'ai' | 'swarm';
  color: string;
  icon: string;
}

export const nodeDefinitions: NodeDefinition[] = [
  // Trigger nodes
  { type: 'trigger', subtype: 'manual', label: 'Manual Trigger', description: 'Manually start the flow', category: 'trigger', color: 'amber', icon: 'Play' },
  { type: 'trigger', subtype: 'schedule', label: 'Schedule', description: 'Run on a schedule', category: 'trigger', color: 'amber', icon: 'Clock' },
  { type: 'trigger', subtype: 'webhook', label: 'Webhook', description: 'Trigger from HTTP request', category: 'trigger', color: 'amber', icon: 'Webhook' },
  { type: 'trigger', subtype: 'message_received', label: 'Message Received', description: 'Trigger on new message', category: 'trigger', color: 'amber', icon: 'MessageSquare' },
  { type: 'trigger', subtype: 'email_received', label: 'Email Received', description: 'Trigger on new email', category: 'trigger', color: 'amber', icon: 'Mail' },
  { type: 'trigger', subtype: 'event', label: 'Event', description: 'Trigger on system event', category: 'trigger', color: 'amber', icon: 'Calendar' },

  // Action nodes - Basic
  { type: 'action', subtype: 'send_message', label: 'Send Message', description: 'Send a message to a conversation', category: 'action', color: 'emerald', icon: 'MessageSquare' },
  { type: 'action', subtype: 'http_request', label: 'HTTP Request', description: 'Make an HTTP API call', category: 'action', color: 'blue', icon: 'Globe' },
  { type: 'action', subtype: 'send_email', label: 'Send Email', description: 'Send an email', category: 'action', color: 'rose', icon: 'Mail' },
  { type: 'action', subtype: 'set_variable', label: 'Set Variable', description: 'Set a flow variable', category: 'action', color: 'purple', icon: 'Variable' },
  { type: 'action', subtype: 'condition', label: 'Condition', description: 'Branch based on conditions', category: 'action', color: 'yellow', icon: 'GitBranch' },
  { type: 'action', subtype: 'delay', label: 'Delay', description: 'Wait for a duration', category: 'action', color: 'orange', icon: 'Timer' },
  { type: 'action', subtype: 'transform', label: 'Transform', description: 'Transform data', category: 'action', color: 'pink', icon: 'Shuffle' },

  // Action nodes - Control Flow
  { type: 'action', subtype: 'loop', label: 'Loop', description: 'Iterate over array items', category: 'action', color: 'indigo', icon: 'Repeat' },
  { type: 'action', subtype: 'switch', label: 'Switch', description: 'Multi-path branching', category: 'action', color: 'yellow', icon: 'GitBranch' },
  { type: 'action', subtype: 'wait_for_event', label: 'Wait for Event', description: 'Pause until event occurs', category: 'action', color: 'orange', icon: 'Clock' },
  { type: 'action', subtype: 'subflow', label: 'Subflow', description: 'Execute another flow', category: 'action', color: 'teal', icon: 'Workflow' },

  // Action nodes - File Operations
  { type: 'action', subtype: 'file_read', label: 'Read File', description: 'Read file contents', category: 'action', color: 'blue', icon: 'FileInput' },
  { type: 'action', subtype: 'file_write', label: 'Write File', description: 'Write to a file', category: 'action', color: 'blue', icon: 'FileOutput' },
  { type: 'action', subtype: 'file_list', label: 'List Files', description: 'List files in directory', category: 'action', color: 'blue', icon: 'FolderOpen' },
  { type: 'action', subtype: 'file_delete', label: 'Delete File', description: 'Delete a file', category: 'action', color: 'red', icon: 'FileX' },

  // Action nodes - Web Operations
  { type: 'action', subtype: 'web_fetch', label: 'Web Fetch', description: 'Fetch URL content', category: 'action', color: 'cyan', icon: 'Globe' },
  { type: 'action', subtype: 'web_scrape', label: 'Web Scrape', description: 'Extract data from webpage', category: 'action', color: 'cyan', icon: 'Code' },

  // Action nodes - Data Operations
  { type: 'action', subtype: 'data_transform', label: 'Data Transform', description: 'Transform with JSONPath/JMESPath', category: 'action', color: 'purple', icon: 'Shuffle' },
  { type: 'action', subtype: 'data_validate', label: 'Data Validate', description: 'Validate against schema', category: 'action', color: 'purple', icon: 'CheckCircle' },

  // Action nodes - Scheduler
  { type: 'action', subtype: 'scheduler_create', label: 'Create Schedule', description: 'Create a new schedule', category: 'action', color: 'amber', icon: 'CalendarPlus' },
  { type: 'action', subtype: 'scheduler_list', label: 'List Schedules', description: 'List all schedules', category: 'action', color: 'amber', icon: 'CalendarDays' },
  { type: 'action', subtype: 'scheduler_update', label: 'Update Schedule', description: 'Update existing schedule', category: 'action', color: 'amber', icon: 'CalendarCog' },
  { type: 'action', subtype: 'scheduler_delete', label: 'Delete Schedule', description: 'Delete a schedule', category: 'action', color: 'amber', icon: 'CalendarX' },
  { type: 'action', subtype: 'scheduler_get_next', label: 'Get Next Execution', description: 'Get next scheduled run', category: 'action', color: 'amber', icon: 'CalendarClock' },

  // AI nodes - Core
  { type: 'ai', subtype: 'ai_response', label: 'AI Response', description: 'Generate AI response', category: 'ai', color: 'violet', icon: 'MessageCircle' },
  { type: 'ai', subtype: 'ai_with_rag', label: 'AI + RAG', description: 'AI with knowledge retrieval', category: 'ai', color: 'violet', icon: 'FileSearch' },
  { type: 'ai', subtype: 'sentiment_analysis', label: 'Sentiment Analysis', description: 'Analyze text sentiment', category: 'ai', color: 'violet', icon: 'Lightbulb' },
  { type: 'ai', subtype: 'extract_entities', label: 'Extract Entities', description: 'Extract entities from text', category: 'ai', color: 'violet', icon: 'Tags' },
  { type: 'ai', subtype: 'summarize_memory', label: 'Summarize', description: 'Summarize conversation', category: 'ai', color: 'violet', icon: 'FileText' },

  // AI nodes - Advanced
  { type: 'ai', subtype: 'ai_router', label: 'AI Router', description: 'Route to best AI provider', category: 'ai', color: 'violet', icon: 'Route' },
  { type: 'ai', subtype: 'ai_classify', label: 'AI Classify', description: 'Classify text into categories', category: 'ai', color: 'violet', icon: 'Tags' },
  { type: 'ai', subtype: 'ai_translate', label: 'AI Translate', description: 'Translate between languages', category: 'ai', color: 'violet', icon: 'Languages' },
  { type: 'ai', subtype: 'ai_summarize', label: 'AI Summarize', description: 'Summarize text content', category: 'ai', color: 'violet', icon: 'FileText' },

  // AI nodes - CLI Tools
  { type: 'ai', subtype: 'ai_claude_cli', label: 'Claude CLI', description: 'Execute Claude Code CLI', category: 'ai', color: 'orange', icon: 'Terminal' },
  { type: 'ai', subtype: 'ai_gemini_cli', label: 'Gemini CLI', description: 'Execute Google Gemini CLI', category: 'ai', color: 'blue', icon: 'Terminal' },
  { type: 'ai', subtype: 'ai_opencode_cli', label: 'OpenCode CLI', description: 'Execute OpenCode CLI', category: 'ai', color: 'green', icon: 'Terminal' },

  // MCP (Model Context Protocol) nodes
  { type: 'action', subtype: 'mcp_tool', label: 'MCP Tool', description: 'Call MCP server tool (database, API, etc.)', category: 'action', color: 'emerald', icon: 'Wrench' },
  { type: 'action', subtype: 'mcp_resource', label: 'MCP Resource', description: 'Read MCP server resource', category: 'action', color: 'emerald', icon: 'FileJson' },

  // Swarm nodes
  { type: 'swarm', subtype: 'agent_query', label: 'Query Agent', description: 'Send query to agent', category: 'swarm', color: 'cyan', icon: 'Search' },
  { type: 'swarm', subtype: 'swarm_broadcast', label: 'Broadcast', description: 'Broadcast to multiple agents', category: 'swarm', color: 'cyan', icon: 'Radio' },
  { type: 'swarm', subtype: 'agent_handoff', label: 'Handoff', description: 'Transfer to another agent', category: 'swarm', color: 'cyan', icon: 'ArrowRightLeft' },
  { type: 'swarm', subtype: 'swarm_consensus', label: 'Consensus', description: 'Multi-agent voting', category: 'swarm', color: 'cyan', icon: 'Vote' },
  { type: 'swarm', subtype: 'swarm_task', label: 'Swarm Task', description: 'Create collaborative task', category: 'swarm', color: 'cyan', icon: 'ListTodo' },
  { type: 'swarm', subtype: 'find_agent', label: 'Find Agent', description: 'Find best agent for task', category: 'swarm', color: 'cyan', icon: 'Search' },
  { type: 'swarm', subtype: 'swarm_status', label: 'Swarm Status', description: 'Get swarm status', category: 'swarm', color: 'cyan', icon: 'Activity' },
];

// Group definitions by category
export const nodesByCategory = nodeDefinitions.reduce((acc, node) => {
  if (!acc[node.category]) {
    acc[node.category] = [];
  }
  acc[node.category].push(node);
  return acc;
}, {} as Record<string, NodeDefinition[]>);

// Category metadata
export const categoryInfo: Record<string, { label: string; color: string; description: string }> = {
  trigger: { label: 'Triggers', color: 'amber', description: 'Start your flow' },
  action: { label: 'Actions', color: 'blue', description: 'Perform operations' },
  ai: { label: 'AI', color: 'violet', description: 'AI-powered nodes' },
  swarm: { label: 'Swarm', color: 'cyan', description: 'Multi-agent operations' },
};
