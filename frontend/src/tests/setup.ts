/**
 * Test Setup File
 * Configures the testing environment with necessary mocks and utilities
 */
import '@testing-library/jest-dom';
import { vi, beforeEach, afterEach } from 'vitest';

// ============================================================================
// Mock WebSocket Service
// ============================================================================
export const mockWebSocket = {
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn(),
  subscribe: vi.fn().mockReturnValue(() => {}),
  subscribeMany: vi.fn().mockReturnValue(() => {}),
  emit: vi.fn(),
  emitWithAck: vi.fn().mockResolvedValue({}),
  subscribeToAgent: vi.fn(),
  unsubscribeFromAgent: vi.fn(),
  subscribeToConversation: vi.fn(),
  unsubscribeFromConversation: vi.fn(),
  subscribeToFlowExecution: vi.fn(),
  unsubscribeFromFlowExecution: vi.fn(),
  getSubscribedAgents: vi.fn().mockReturnValue([]),
  removeAllHandlers: vi.fn(),
  removeHandlers: vi.fn(),
  reconnect: vi.fn(),
  get isConnected() {
    return true;
  },
  get state() {
    return 'connected' as const;
  },
  get socketId() {
    return 'mock-socket-id';
  },
};

vi.mock('../services/websocket', () => ({
  websocket: mockWebSocket,
  ConnectionState: {
    disconnected: 'disconnected',
    connecting: 'connecting',
    connected: 'connected',
    error: 'error',
  },
}));

// ============================================================================
// Mock API Service
// ============================================================================
export const mockApi = {
  get: vi.fn().mockResolvedValue({ data: {} }),
  post: vi.fn().mockResolvedValue({ data: {} }),
  put: vi.fn().mockResolvedValue({ data: {} }),
  delete: vi.fn().mockResolvedValue({ data: {} }),
  patch: vi.fn().mockResolvedValue({ data: {} }),
  defaults: {
    headers: {
      common: {},
    },
  },
};

vi.mock('../services/api', () => ({
  default: mockApi,
}));

// ============================================================================
// Mock localStorage
// ============================================================================
const localStorageMock: Storage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  key: vi.fn(),
  length: 0,
};

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

// ============================================================================
// Mock sessionStorage
// ============================================================================
const sessionStorageMock: Storage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  key: vi.fn(),
  length: 0,
};

Object.defineProperty(window, 'sessionStorage', {
  value: sessionStorageMock,
  writable: true,
});

// ============================================================================
// Mock matchMedia
// ============================================================================
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// ============================================================================
// Mock ResizeObserver
// ============================================================================
class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

Object.defineProperty(window, 'ResizeObserver', {
  writable: true,
  value: ResizeObserverMock,
});

// ============================================================================
// Mock IntersectionObserver
// ============================================================================
class IntersectionObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  root = null;
  rootMargin = '';
  thresholds = [];
  takeRecords = vi.fn().mockReturnValue([]);
}

Object.defineProperty(window, 'IntersectionObserver', {
  writable: true,
  value: IntersectionObserverMock,
});

// ============================================================================
// Mock scrollTo
// ============================================================================
Object.defineProperty(window, 'scrollTo', {
  writable: true,
  value: vi.fn(),
});

// ============================================================================
// Mock import.meta.env
// ============================================================================
vi.stubGlobal('import.meta', {
  env: {
    VITE_API_URL: 'http://localhost:3200',
    VITE_WS_URL: 'http://localhost:3201',
    MODE: 'test',
    DEV: true,
    PROD: false,
  },
});

// ============================================================================
// Global Test Hooks
// ============================================================================
beforeEach(() => {
  // Reset all mocks before each test
  vi.clearAllMocks();

  // Reset localStorage mock
  localStorageMock.getItem = vi.fn();
  localStorageMock.setItem = vi.fn();
  localStorageMock.removeItem = vi.fn();
  localStorageMock.clear = vi.fn();
});

afterEach(() => {
  // Clean up after each test
  vi.restoreAllMocks();
});

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Helper to wait for the next tick
 */
export const nextTick = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Helper to create a mock agent
 */
export const createMockAgent = (overrides: Record<string, unknown> = {}) => ({
  id: 'test-agent-1',
  name: 'Test Agent',
  description: 'A test agent for unit testing',
  systemPrompt: 'You are a helpful assistant.',
  model: 'gpt-4',
  provider: 'openrouter' as const,
  status: 'idle' as const,
  skills: ['support', 'sales'],
  temperature: 0.7,
  maxTokens: 2048,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

/**
 * Helper to create a mock user
 */
export const createMockUser = (overrides: Record<string, unknown> = {}) => ({
  id: 'test-user-1',
  email: 'test@example.com',
  name: 'Test User',
  role: 'user' as const,
  createdAt: new Date().toISOString(),
  ...overrides,
});
