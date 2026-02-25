// WebSocket connection management
export { useWebSocket } from './useWebSocket';

// Agent status subscriptions
export { useAgentStatus, useAgentQR } from './useAgentStatus';

// Message subscriptions
export { useMessages, useAllMessages } from './useMessages';

// Swarm event subscriptions
export { useSwarmUpdates, useTaskUpdates } from './useSwarmUpdates';

// Terminal management
export { useTerminal } from './useTerminal';
export type { TerminalType, TerminalSession } from './useTerminal';

// CLI session management
export { useCliSession, useCliSessionById } from './useCliSession';
export type {
  CLISession,
  CreateSessionOptions,
  UpdateSessionOptions,
  UseCliSessionReturn,
} from './useCliSession';

// Responsive design hooks
export {
  useMediaQuery,
  useIsMobile,
  useIsTablet,
  useIsDesktop,
  useIsMobileOrTablet,
  useBreakpoint,
} from './useMediaQuery';
