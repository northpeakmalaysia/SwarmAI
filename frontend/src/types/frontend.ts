/**
 * SwarmAI Frontend Type Definitions
 * Comprehensive types for the Multi-Agent Messaging Platform
 */

// ============================================================================
// Platform Types
// ============================================================================

/**
 * Supported messaging platforms
 */
// Note: 'agentic-ai' removed - Agentic AI agents are created exclusively in the Agentic module
export type Platform = 'whatsapp' | 'whatsapp-business' | 'telegram-bot' | 'telegram-user' | 'email' | 'http-api';

/**
 * Platform connection status
 */
export type PlatformStatus =
  | 'connected'
  | 'disconnected'
  | 'connecting'
  | 'error'
  | 'qr_pending';

// ============================================================================
// Agent Types
// ============================================================================

/**
 * Agent operational status
 */
export type AgentStatus = 'idle' | 'busy' | 'offline';

/**
 * Agent swarm participation status
 */
export type SwarmParticipationStatus = 'available' | 'busy' | 'offline' | 'maintenance';

/**
 * AI Provider types
 */
export type AIProviderType = 'openrouter' | 'ollama' | 'anthropic' | 'google' | 'openai-compatible' | 'cli-claude' | 'cli-gemini' | 'cli-opencode' | 'local-agent' | 'groq' | 'openai-whisper';

/**
 * WhatsApp platform configuration
 */
export interface WhatsAppPlatformConfig {
  sessionData?: string;
  phoneNumber?: string;
  pushName?: string;
  profilePicUrl?: string;
  businessProfile?: {
    description?: string;
    email?: string;
    website?: string;
    category?: string;
  };
}

/**
 * Telegram Bot platform configuration
 */
export interface TelegramBotPlatformConfig {
  botToken?: string;
  botUsername?: string;
  botId?: number;
  botName?: string;
  canJoinGroups?: boolean;
  canReadGroupMessages?: boolean;
  supportsInlineQueries?: boolean;
}

/**
 * Telegram User platform configuration
 */
export interface TelegramUserPlatformConfig {
  apiId?: number;
  apiHash?: string;
  phoneNumber?: string;
  sessionString?: string;
  userId?: number;
  username?: string;
  firstName?: string;
  lastName?: string;
}

/**
 * Email platform configuration
 */
export interface EmailPlatformConfig {
  email?: string;
  imapHost?: string;
  imapPort?: number;
  smtpHost?: string;
  smtpPort?: number;
  useTls?: boolean;
  username?: string;
  password?: string;
}

/**
 * WhatsApp Business platform configuration
 */
export interface WhatsAppBusinessPlatformConfig {
  accessToken?: string;
  phoneNumberId?: string;
  businessAccountId?: string;
  verifyToken?: string;
  appSecret?: string;
  webhookUrl?: string;
}

/**
 * HTTP API platform configuration
 */
export interface HttpApiPlatformConfig {
  apiKey?: string;
  webhookUrl?: string;
  allowedIps?: string[];
}

/**
 * Persona domain types for Agentic AI
 */
export type PersonaDomain =
  | 'software_engineering'
  | 'data_science'
  | 'devops'
  | 'security'
  | 'product_management'
  | 'technical_writing'
  | 'customer_support'
  | 'sales_marketing'
  | 'finance'
  | 'legal'
  | 'hr'
  | 'research'
  | 'education'
  | 'creative'
  | 'general'
  | 'custom';

/**
 * Persona profile for Agentic AI agents
 */
export interface PersonaProfile {
  id: string;
  agentId: string;
  name: string;
  domain: PersonaDomain;
  expertise: string[];
  communicationStyle: {
    formality: 'casual' | 'professional' | 'formal';
    verbosity: 'concise' | 'balanced' | 'detailed';
    tone: 'friendly' | 'neutral' | 'authoritative';
  };
  decisionMaking: {
    riskTolerance: 'conservative' | 'balanced' | 'aggressive';
    autonomyPreference: 'guided' | 'collaborative' | 'autonomous';
    conflictResolution: 'avoid' | 'compromise' | 'assert';
  };
  learningStyle: {
    adaptability: number;
    feedbackSensitivity: number;
    patternRetention: number;
  };
  contextualBehaviors: Record<string, unknown>;
  isActive: boolean;
  isDefault: boolean;
  usageCount: number;
  lastUsedAt?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Simplified persona for dropdown selection
 */
export interface PersonaOption {
  id: string;
  name: string;
  domain: PersonaDomain;
  isActive: boolean;
  isDefault: boolean;
}

/**
 * Persona configuration for agentic workspace
 */
export interface PersonaConfig {
  enabled: boolean;
  autoCreate: boolean;
  autoSelect: boolean;
  defaultPersonaId?: string;
  allowedDomains?: PersonaDomain[];
}

/**
 * Agentic AI platform configuration
 */
export interface AgenticAIPlatformConfig {
  cliType: 'claude' | 'gemini' | 'opencode' | 'bash';
  autonomyLevel: 'supervised' | 'semi-autonomous' | 'autonomous';
  workspacePath?: string;
  contextFilePath?: string;
  permanentToken?: string;
  capabilities: string[];
  customToolsEnabled: boolean;
  selfImprovementEnabled: boolean;
  ragAutoUpdateEnabled: boolean;
  maxConcurrentTasks?: number;
  taskTimeout?: number;
  personaConfig?: PersonaConfig;
  // Profile configuration fields (PRD)
  profileRole?: string;
  systemPrompt?: string;
  requireApprovalFor?: string[];
  masterContactId?: string | null;
  masterContactChannel?: 'email' | 'whatsapp' | 'telegram';
  notifyOn?: string[];
}

/**
 * Custom tool definition for Agentic AI
 */
export interface CustomTool {
  id: string;
  name: string;
  displayName: string;
  description: string;
  scriptPath: string;
  inputs: Array<{
    name: string;
    type: 'string' | 'number' | 'boolean' | 'object' | 'array';
    required: boolean;
    description?: string;
  }>;
  outputs: Array<{
    name: string;
    type: 'string' | 'number' | 'boolean' | 'object' | 'array';
    description?: string;
  }>;
  category: string;
  isActive: boolean;
  executionCount: number;
  lastExecutedAt?: string;
  createdBy: 'user' | 'agentic-ai';
  createdAt: string;
  updatedAt: string;
}

/**
 * Agentic AI workspace
 */
export interface AgenticWorkspace {
  id: string;
  userId: string;
  agentId: string;
  workspacePath: string;
  cliType: 'claude' | 'gemini' | 'opencode' | 'bash';
  contextFilePath?: string;
  autonomyLevel: 'semi' | 'full';
  capabilities: string[];
  customTools: CustomTool[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Agentic AI execution record
 */
export interface AgenticExecution {
  id: string;
  agentId: string;
  workspaceId?: string;
  taskDescription: string;
  taskType?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  inputData?: Record<string, unknown>;
  outputData?: Record<string, unknown>;
  errorMessage?: string;
  durationMs?: number;
  feedbackScore?: number;
  learnedPatterns?: string[];
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
}

/**
 * Union type for platform-specific configuration
 */
export type PlatformConfig =
  | WhatsAppPlatformConfig
  | WhatsAppBusinessPlatformConfig
  | TelegramBotPlatformConfig
  | TelegramUserPlatformConfig
  | EmailPlatformConfig
  | HttpApiPlatformConfig
  | AgenticAIPlatformConfig;

/**
 * Agent working hours configuration
 */
export interface WorkingHours {
  enabled: boolean;
  timezone: string;
  schedule: {
    monday?: { start: string; end: string };
    tuesday?: { start: string; end: string };
    wednesday?: { start: string; end: string };
    thursday?: { start: string; end: string };
    friday?: { start: string; end: string };
    saturday?: { start: string; end: string };
    sunday?: { start: string; end: string };
  };
  holidays?: string[];
  autoReplyOutsideHours?: boolean;
  outsideHoursMessage?: string;
}

/**
 * Agent reputation scores
 */
export interface AgentReputation {
  agentId: string;
  overallScore: number;
  taskCompletionRate: number;
  averageResponseTime: number;
  userSatisfactionScore: number;
  handoffSuccessRate: number;
  collaborationScore: number;
  totalTasksCompleted: number;
  totalHandoffs: number;
  lastUpdated: string;
}

/**
 * Agent capability for skill-based routing
 */
export interface AgentCapability {
  name: string;
  level: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  keywords: string[];
  description?: string;
}

/**
 * Swarm configuration for an agent
 */
export interface SwarmConfig {
  participationEnabled: boolean;
  maxConcurrentTasks: number;
  capabilities: AgentCapability[];
  preferredCollaborators?: string[];
  autoAcceptHandoffs: boolean;
  handoffThreshold: number;
  collaborationMode: 'active' | 'passive' | 'disabled';
}

/**
 * Complete Agent interface
 */
export interface Agent {
  id: string;
  agentId: string;
  userId: string;
  name: string;
  description?: string;
  avatar?: string;
  phoneNumber?: string;
  platform: Platform;
  platformConfig?: PlatformConfig;
  platformStatus?: PlatformStatus;
  role: 'assistant' | 'specialist' | 'supervisor' | 'worker';
  department?: string;
  skills: string[];
  systemPrompt: string;
  model: string;
  provider: AIProviderType;
  temperature: number;
  maxTokens: number;
  swarmConfig?: SwarmConfig;
  reputation?: AgentReputation;
  autoReconnect: boolean;
  maxConcurrentChats: number;
  workingHours?: WorkingHours;
  kbOnlyMode: boolean;
  status: AgentStatus;
  swarmStatus?: SwarmParticipationStatus;
  lastSeen?: string;
  activeChats: number;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Input for creating a new agent
 */
export interface CreateAgentInput {
  name: string;
  description?: string;
  avatar?: string;
  platform: Platform;
  systemPrompt: string;
  model: string;
  provider: AIProviderType;
  temperature?: number;
  maxTokens?: number;
  skills?: string[];
  role?: Agent['role'];
  department?: string;
  swarmConfig?: Partial<SwarmConfig>;
  workingHours?: WorkingHours;
  kbOnlyMode?: boolean;
  autoReconnect?: boolean;
  maxConcurrentChats?: number;
}

/**
 * Input for updating an agent
 */
export interface UpdateAgentInput extends Partial<CreateAgentInput> {
  platformConfig?: PlatformConfig;
}

// ============================================================================
// Message Types
// ============================================================================

/**
 * Message direction
 */
export type MessageDirection = 'incoming' | 'outgoing';

/**
 * Message content type
 */
export type MessageContentType =
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'voice'
  | 'document'
  | 'sticker'
  | 'location'
  | 'contact'
  | 'poll'
  | 'reaction'
  | 'system'
  | 'call'
  | 'revoked';

/**
 * Message sender information
 */
export interface MessageSender {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  username?: string;
  avatarUrl?: string;
  isBot?: boolean;
}

/**
 * Media content for attachments
 */
export interface MediaContent {
  type: 'image' | 'video' | 'audio' | 'voice' | 'document' | 'sticker';
  url?: string;
  localPath?: string;
  mimeType?: string;
  fileName?: string;
  fileSize?: number;
  duration?: number;
  width?: number;
  height?: number;
  thumbnail?: string;
  caption?: string;
}

/**
 * Location content
 */
export interface LocationContent {
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
}

/**
 * Contact content
 */
export interface ContactContent {
  name: string;
  phones?: string[];
  emails?: string[];
  organization?: string;
  vcard?: string;
}

/**
 * Poll content
 */
export interface PollContent {
  question: string;
  options: string[];
  allowMultiple?: boolean;
  votes?: Record<string, number>;
  voterIds?: Record<string, string[]>;
}

/**
 * Message reaction
 */
export interface MessageReaction {
  emoji: string;
  targetMessageId: string;
  isRemoval?: boolean;
  reactedBy?: string;
  timestamp?: string;
}

/**
 * Unified message content
 */
export interface MessageContent {
  type: MessageContentType;
  text?: string;
  media?: MediaContent;
  location?: LocationContent;
  contact?: ContactContent;
  poll?: PollContent;
  reaction?: MessageReaction;
}

/**
 * Platform-specific metadata
 */
export interface PlatformMetadata {
  waMessageId?: string;
  waChat?: {
    isGroup: boolean;
    groupName?: string;
    groupId?: string;
  };
  tgMessageId?: number;
  tgChat?: {
    type: 'private' | 'group' | 'supergroup' | 'channel';
    title?: string;
    chatId: number;
  };
  tgReplyMarkup?: unknown;
  emailMessageId?: string;
  emailThreadId?: string;
  emailSubject?: string;
  emailCc?: string[];
  emailBcc?: string[];
  emailHeaders?: Record<string, string>;
}

/**
 * Complete Message interface
 */
export interface Message {
  id: string;
  conversationId: string;
  chatId?: string;
  platform: Platform;
  direction: MessageDirection;
  sender: MessageSender;
  content: MessageContent;
  replyToId?: string;
  forwardedFrom?: MessageSender;
  isFromAI?: boolean;
  aiModelUsed?: string;
  aiTokensUsed?: number;
  agentId?: string;
  agentName?: string;
  platformMetadata?: PlatformMetadata;
  externalId?: string;
  reactions?: MessageReaction[];
  timestamp: string;
  editedAt?: string;
  deletedAt?: string;
  status?: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  metadata?: Record<string, unknown>;
  createdAt: string;
}

// ============================================================================
// Chat/Conversation Types
// ============================================================================

/**
 * Chat participant
 */
export interface ChatParticipant {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  username?: string;
  avatarUrl?: string;
  isBot?: boolean;
  role?: 'admin' | 'member';
  joinedAt?: string;
}

/**
 * Chat/Conversation interface
 */
export interface Chat {
  id: string;
  agentId: string;
  platform: Platform;
  externalId?: string;
  /** Linked contact ID from contacts database */
  contactId?: string;
  title: string;
  isGroup: boolean;
  participants: ChatParticipant[];
  lastMessage?: Message;
  lastMessageAt?: string;
  unreadCount: number;
  isPinned: boolean;
  isMuted: boolean;
  isArchived: boolean;
  labels?: string[];
  assignedAgentId?: string;
  status: 'active' | 'pending' | 'resolved' | 'archived';
  category?: 'chat' | 'news' | 'status';
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/**
 * Conversation (alias for Chat, for message store compatibility)
 */
export interface Conversation {
  id: string;
  title: string;
  agentId?: string;
  agentName?: string;
  lastMessage?: string;
  messageCount: number;
  category?: 'chat' | 'news' | 'status';
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// Flow Types
// ============================================================================

/**
 * Node categories for FlowBuilder
 */
export type NodeCategory =
  | 'trigger'
  | 'whatsapp'
  | 'telegram'
  | 'email'
  | 'ai'
  | 'data'
  | 'swarm'
  | 'logic'
  | 'utility';

/**
 * Flow trigger types
 */
export type FlowTriggerType =
  | 'manual'
  | 'schedule'
  | 'webhook'
  | 'whatsapp_message'
  | 'telegram_message'
  | 'email_received'
  | 'swarm_event'
  | 'api';

/**
 * Flow trigger configuration
 */
export interface FlowTrigger {
  type: FlowTriggerType;
  config: Record<string, unknown>;
  enabled: boolean;
}

/**
 * Port data types
 */
export type PortDataType = 'string' | 'number' | 'boolean' | 'object' | 'array' | 'any';

/**
 * Node port definition
 */
export interface NodePort {
  id: string;
  name: string;
  type: 'flow' | 'data';
  dataType: PortDataType;
  required: boolean;
  multiple: boolean;
  defaultValue?: unknown;
  description?: string;
}

/**
 * Flow node data
 */
export interface FlowNodeData {
  label: string;
  description?: string;
  category: NodeCategory;
  inputs?: NodePort[];
  outputs?: NodePort[];
  config: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Flow node (extends React Flow Node)
 */
export interface FlowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: FlowNodeData;
  selected?: boolean;
  dragging?: boolean;
  width?: number;
  height?: number;
  parentId?: string;
  extent?: 'parent' | [number, number, number, number];
  expandParent?: boolean;
  style?: Record<string, string | number>;
}

/**
 * Edge type for visual representation
 */
export type FlowEdgeType = 'default' | 'smoothstep' | 'step' | 'straight' | 'bezier';

/**
 * Flow edge (extends React Flow Edge)
 */
export interface FlowEdge {
  id: string;
  source: string;
  sourceHandle?: string;
  target: string;
  targetHandle?: string;
  type?: FlowEdgeType;
  animated?: boolean;
  label?: string;
  style?: Record<string, string | number>;
  data?: Record<string, unknown>;
}

/**
 * Flow viewport
 */
export interface FlowViewport {
  x: number;
  y: number;
  zoom: number;
}

/**
 * Execution statistics
 */
export interface ExecutionStats {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageExecutionTime: number;
  lastExecutionAt?: string;
  lastSuccessAt?: string;
  lastFailureAt?: string;
}

/**
 * Flow metadata
 */
export interface FlowMetadata {
  tags: string[];
  category?: string;
  icon?: string;
  color?: string;
  executionStats: ExecutionStats;
  custom?: Record<string, unknown>;
}

/**
 * Flow status
 */
export type FlowStatus = 'draft' | 'active' | 'paused' | 'archived';

/**
 * Complete Flow interface
 */
export interface Flow {
  id: string;
  name: string;
  description?: string;
  version: number;
  status: FlowStatus;
  nodes: FlowNode[];
  edges: FlowEdge[];
  viewport?: FlowViewport;
  triggers?: FlowTrigger[];
  variables?: FlowVariable[];
  settings?: FlowSettings;
  metadata?: FlowMetadata;
  isActive: boolean;
  lastRun?: string;
  runCount: number;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
  archivedAt?: string;
}

/**
 * Flow variable
 */
export interface FlowVariable {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  defaultValue?: unknown;
  description?: string;
  scope: 'flow' | 'execution' | 'global';
  sensitive?: boolean;
  readonly?: boolean;
}

/**
 * Flow settings
 */
export interface FlowSettings {
  timeout: number;
  maxRetries: number;
  retryDelay: number;
  errorHandling: 'stop' | 'continue' | 'retry' | 'fallback';
  logging: {
    enabled: boolean;
    level: 'debug' | 'info' | 'warn' | 'error';
    includeNodeOutputs: boolean;
    maskSensitiveData: boolean;
  };
  concurrency: {
    maxParallel: number;
    queueSize: number;
  };
  enabledEnvironments: Array<'development' | 'staging' | 'production'>;
  rateLimit?: {
    maxExecutionsPerMinute: number;
    maxExecutionsPerHour: number;
  };
}

/**
 * Flow execution status
 */
export type FlowExecutionStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'timeout';

/**
 * Flow execution record
 */
export interface FlowExecution {
  id: string;
  flowId: string;
  flowVersion?: number;
  status: FlowExecutionStatus;
  trigger?: {
    type: FlowTriggerType;
    source: string;
    data?: Record<string, unknown>;
  };
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: {
    code: string;
    message: string;
    nodeId?: string;
    stack?: string;
  };
  nodeExecutions?: Array<{
    nodeId: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
    input?: Record<string, unknown>;
    output?: Record<string, unknown>;
    error?: string;
    startedAt?: string;
    completedAt?: string;
    durationMs?: number;
  }>;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  logs: string[];
  createdAt?: string;
}

// ============================================================================
// Swarm Types
// ============================================================================

/**
 * Swarm status overview
 */
export interface SwarmStatus {
  activeAgents: number;
  totalAgents: number;
  pendingTasks: number;
  activeTasks: number;
  completedTasks: number;
  collaborations: number;
  averageResponseTime?: number;
  healthScore?: number;
}

/**
 * Swarm task priority
 */
export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';

/**
 * Swarm task status
 */
export type SwarmTaskStatus =
  | 'pending'
  | 'assigned'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'cancelled';

/**
 * Swarm task type
 */
export type SwarmTaskType = 'query' | 'action' | 'analysis' | 'collaboration' | 'consensus';

/**
 * Swarm task interface
 */
export interface SwarmTask {
  id: string;
  type: SwarmTaskType;
  title: string;
  description: string;
  status: SwarmTaskStatus;
  priority: TaskPriority;
  requiredCapabilities?: string[];
  assignedAgentId?: string;
  assignedAgents: string[];
  collaboratingAgentIds?: string[];
  parentTaskId?: string;
  subtaskIds?: string[];
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  progress?: number;
  createdAt: string;
  assignedAt?: string;
  startedAt?: string;
  completedAt?: string;
  deadline?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Handoff status
 */
export type HandoffStatus = 'pending' | 'accepted' | 'rejected' | 'completed' | 'expired';

/**
 * Handoff context
 */
export interface HandoffContext {
  conversationSummary: string;
  recentMessages: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
  }>;
  userIntent: string;
  relevantKnowledge?: string[];
  previousAgents: string[];
  specialInstructions?: string;
}

/**
 * Swarm handoff request
 */
export interface SwarmHandoff {
  id: string;
  fromAgentId: string;
  fromAgentName?: string;
  toAgentId?: string;
  toAgentName?: string;
  conversationId: string;
  reason: string;
  requiredCapabilities?: string[];
  context?: HandoffContext;
  status: HandoffStatus;
  priority: TaskPriority;
  createdAt: string;
  acceptedAt?: string;
  completedAt?: string;
  expiresAt?: string;
}

/**
 * Consensus option
 */
export interface ConsensusOption {
  id: string;
  label: string;
  description: string;
  proposedBy: string;
}

/**
 * Consensus vote
 */
export interface ConsensusVote {
  agentId: string;
  optionId: string;
  confidence: number;
  reasoning?: string;
  timestamp: string;
}

/**
 * Consensus session
 */
export interface ConsensusSession {
  id: string;
  topic: string;
  description: string;
  options: ConsensusOption[];
  votes: ConsensusVote[];
  status: 'open' | 'closed' | 'decided' | 'no_consensus';
  requiredParticipants: string[];
  minimumVotes: number;
  consensusThreshold: number;
  decidedOption?: string;
  createdAt: string;
  closesAt: string;
  decidedAt?: string;
}

/**
 * Collaboration contribution
 */
export interface CollaborationContribution {
  agentId: string;
  taskId: string;
  type: 'analysis' | 'suggestion' | 'validation' | 'execution';
  content: string;
  confidence: number;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

/**
 * Collaboration session
 */
export interface CollaborationSession {
  id: string;
  taskId: string;
  leadAgentId: string;
  participantAgentIds: string[];
  status: 'forming' | 'active' | 'deliberating' | 'completed' | 'disbanded';
  type: 'parallel' | 'sequential' | 'hierarchical';
  contributions: CollaborationContribution[];
  finalResult?: Record<string, unknown>;
  createdAt: string;
  completedAt?: string;
}

// ============================================================================
// AI Provider Types
// ============================================================================

/**
 * AI Provider configuration
 */
export interface AIProvider {
  id: string;
  userId: string;
  name: string;
  type: AIProviderType;
  baseUrl: string;
  apiKey?: string;
  isActive: boolean;
  isDefault: boolean;
  models: string[];
  defaultModel?: string;
  rateLimitRpm?: number;
  rateLimitTpm?: number;
  budgetLimit?: number;
  budgetUsed: number;
  budgetResetDate?: string;
  customHeaders?: Record<string, string>;
  lastTested?: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * AI Model configuration
 */
export interface AIModel {
  id: string;
  providerId: string;
  modelId: string;
  displayName?: string;
  contextWindow?: number;
  maxOutputTokens?: number;
  inputPricePer1k?: number;
  outputPricePer1k?: number;
  supportsVision: boolean;
  supportsFunctions: boolean;
  supportsStreaming: boolean;
  isActive: boolean;
  createdAt: string;
}

/**
 * AI Usage record
 */
export interface AIUsage {
  id: string;
  userId: string;
  agentId?: string;
  providerId: string;
  modelId: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost?: number;
  requestType: 'chat' | 'embedding' | 'completion';
  conversationId?: string;
  createdAt: string;
}

/**
 * AI Usage summary
 */
export interface AIUsageSummary {
  totalTokens: number;
  totalCost: number;
  requestCount: number;
  averageTokensPerRequest: number;
  byProvider: Record<string, {
    tokens: number;
    cost: number;
    requests: number;
  }>;
  byModel: Record<string, {
    tokens: number;
    cost: number;
    requests: number;
  }>;
  byDate: Array<{
    date: string;
    tokens: number;
    cost: number;
    requests: number;
  }>;
}

// ============================================================================
// Subscription Types
// ============================================================================

/**
 * Subscription plan types
 */
export type SubscriptionPlan = 'free' | 'starter' | 'pro' | 'enterprise';

/**
 * Subscription status
 */
export type SubscriptionStatus = 'active' | 'past_due' | 'cancelled' | 'trialing' | 'paused';

/**
 * Feature flags for subscription tiers
 */
export interface SubscriptionFeatures {
  maxAgents: number;
  maxFlows: number;
  maxMessagesPerMonth: number;
  maxStorageGb: number;
  aiEnabled: boolean;
  aiTokensPerMonth: number;
  ragEnabled: boolean;
  ragDocuments: number;
  swarmEnabled: boolean;
  swarmMaxCollaborators: number;
  webhooksEnabled: boolean;
  apiAccessEnabled: boolean;
  customBranding: boolean;
  prioritySupport: boolean;
  ssoEnabled: boolean;
  auditLogs: boolean;
  advancedAnalytics: boolean;
}

/**
 * Subscription interface
 */
export interface Subscription {
  id: string;
  userId: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  features: SubscriptionFeatures;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  stripePriceId?: string;
  agentSlots: number;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  trialEnd?: string;
  usage: {
    agents: number;
    flows: number;
    messages: number;
    storage: number;
    aiTokens: number;
    ragDocuments: number;
  };
  createdAt: string;
  updatedAt: string;
}

/**
 * Payment record
 */
export interface Payment {
  id: string;
  subscriptionId: string;
  amount: number;
  currency: string;
  status: 'pending' | 'succeeded' | 'failed' | 'refunded';
  stripePaymentId?: string;
  description?: string;
  createdAt: string;
}

// ============================================================================
// UI State Types
// ============================================================================

/**
 * Notification types
 */
export type NotificationType = 'success' | 'error' | 'warning' | 'info';

/**
 * Notification interface
 */
export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message?: string;
  duration?: number;
  dismissible?: boolean;
  action?: {
    label: string;
    onClick: () => void;
  };
  createdAt: string;
}

/**
 * Modal types
 */
export type ModalType =
  | 'createAgent'
  | 'editAgent'
  | 'deleteAgent'
  | 'qrCode'
  | 'createFlow'
  | 'editFlow'
  | 'deleteFlow'
  | 'uploadDocument'
  | 'startCollaboration'
  | 'initiateHandoff'
  | 'settings'
  | 'confirm'
  | 'custom';

/**
 * Modal state interface
 */
export interface ModalState {
  isOpen: boolean;
  type: ModalType | null;
  title?: string;
  data?: Record<string, unknown>;
  onConfirm?: () => void | Promise<void>;
  onCancel?: () => void;
}

/**
 * Sidebar state
 */
export interface SidebarState {
  isOpen: boolean;
  isCollapsed: boolean;
  activeSection?: string;
}

/**
 * Theme mode
 */
export type ThemeMode = 'light' | 'dark' | 'system';

/**
 * UI preferences
 */
export interface UIPreferences {
  theme: ThemeMode;
  sidebarCollapsed: boolean;
  compactMode: boolean;
  showTimestamps: boolean;
  soundEnabled: boolean;
  desktopNotifications: boolean;
  language: string;
  dateFormat: string;
  timeFormat: '12h' | '24h';
}

// ============================================================================
// User Types
// ============================================================================

/**
 * User role
 */
export type UserRole = 'admin' | 'user' | 'viewer';

/**
 * Authentication method
 */
export type AuthMethod = 'password' | 'magiclink' | 'passkey' | 'oauth';

/**
 * User interface
 */
export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  role: UserRole;
  isSuperuser?: boolean;
  lastAuthMethod?: AuthMethod;
  onboardingCompleted?: boolean;
  preferences?: UIPreferences;
  subscription?: Subscription;
  createdAt: string;
  updatedAt?: string;
}

// ============================================================================
// WebSocket Event Types
// ============================================================================

/**
 * WebSocket event types
 */
export type WebSocketEventType =
  | 'connect'
  | 'disconnect'
  | 'error'
  | 'message:new'
  | 'message:update'
  | 'message:delete'
  | 'agent:status_changed'
  | 'agent:platform_status'
  | 'swarm:task_created'
  | 'swarm:task_update'
  | 'swarm:handoff'
  | 'swarm:collaboration'
  | 'swarm:consensus'
  | 'flow:execution_start'
  | 'flow:execution_update'
  | 'flow:execution_complete'
  | 'flow:queue:status'
  | 'flow:schedule:triggered'
  | 'notification';

/**
 * WebSocket event payload
 */
export interface WebSocketEvent<T = unknown> {
  type: WebSocketEventType;
  payload: T;
  timestamp: string;
}

// ============================================================================
// API Response Types
// ============================================================================

/**
 * Paginated response
 */
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasMore: boolean;
}

/**
 * API Error response
 */
export interface APIError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  stack?: string;
}

/**
 * API Response wrapper
 */
export interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: APIError;
  meta?: {
    requestId: string;
    timestamp: string;
    duration: number;
  };
}

// ============================================================================
// Filter and Sort Types
// ============================================================================

/**
 * Sort direction
 */
export type SortDirection = 'asc' | 'desc';

/**
 * Sort configuration
 */
export interface SortConfig<T = string> {
  field: T;
  direction: SortDirection;
}

/**
 * Filter operator
 */
export type FilterOperator =
  | 'equals'
  | 'notEquals'
  | 'contains'
  | 'notContains'
  | 'startsWith'
  | 'endsWith'
  | 'greaterThan'
  | 'lessThan'
  | 'greaterThanOrEqual'
  | 'lessThanOrEqual'
  | 'in'
  | 'notIn'
  | 'between'
  | 'isNull'
  | 'isNotNull';

/**
 * Filter condition
 */
export interface FilterCondition {
  field: string;
  operator: FilterOperator;
  value: unknown;
}

/**
 * Filter configuration
 */
export interface FilterConfig {
  conditions: FilterCondition[];
  logic: 'and' | 'or';
}

// ============================================================================
// Export All Types
// ============================================================================

export type {
  // Re-export for convenience
  Platform as PlatformType,
};
