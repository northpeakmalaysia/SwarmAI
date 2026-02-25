/**
 * Agent Store Tests
 * Tests for the Zustand agent store which manages agent state
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useAgentStore, Agent } from '../../stores/agentStore';
import { mockApi } from '../setup';

// ============================================================================
// Test Data
// ============================================================================

const createMockAgent = (overrides: Partial<Agent> = {}): Agent => ({
  id: 'agent-1',
  name: 'Test Agent',
  description: 'A test agent',
  systemPrompt: 'You are a helpful assistant.',
  model: 'gpt-4',
  provider: 'openrouter',
  status: 'idle',
  skills: ['support', 'sales'],
  temperature: 0.7,
  maxTokens: 2048,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

// ============================================================================
// Test Suite
// ============================================================================

describe('agentStore', () => {
  // Reset store state before each test
  beforeEach(() => {
    const store = useAgentStore.getState();
    useAgentStore.setState({
      agents: [],
      selectedAgent: null,
      isLoading: false,
      error: null,
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --------------------------------------------------------------------------
  // Initial State Tests
  // --------------------------------------------------------------------------
  describe('Initial State', () => {
    it('has empty agents array initially', () => {
      const { agents } = useAgentStore.getState();
      expect(agents).toEqual([]);
    });

    it('has null selectedAgent initially', () => {
      const { selectedAgent } = useAgentStore.getState();
      expect(selectedAgent).toBeNull();
    });

    it('has isLoading false initially', () => {
      const { isLoading } = useAgentStore.getState();
      expect(isLoading).toBe(false);
    });

    it('has null error initially', () => {
      const { error } = useAgentStore.getState();
      expect(error).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // fetchAgents Tests
  // --------------------------------------------------------------------------
  describe('fetchAgents', () => {
    it('sets isLoading to true while fetching', async () => {
      const agents = [createMockAgent()];
      mockApi.get.mockImplementation(() => new Promise((resolve) => {
        // Check isLoading state during the request
        setTimeout(() => {
          resolve({ data: agents });
        }, 10);
      }));

      const fetchPromise = useAgentStore.getState().fetchAgents();

      // isLoading should be true immediately
      expect(useAgentStore.getState().isLoading).toBe(true);

      await fetchPromise;
    });

    it('fetches agents successfully', async () => {
      const agents = [
        createMockAgent({ id: 'agent-1', name: 'Agent 1' }),
        createMockAgent({ id: 'agent-2', name: 'Agent 2' }),
      ];
      mockApi.get.mockResolvedValue({ data: agents });

      await useAgentStore.getState().fetchAgents();

      const state = useAgentStore.getState();
      expect(state.agents).toEqual(agents);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
      expect(mockApi.get).toHaveBeenCalledWith('/agents');
    });

    it('handles fetch error', async () => {
      const errorMessage = 'Network error';
      mockApi.get.mockRejectedValue(new Error(errorMessage));

      await useAgentStore.getState().fetchAgents();

      const state = useAgentStore.getState();
      expect(state.agents).toEqual([]);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBe(errorMessage);
    });

    it('clears previous error on new fetch', async () => {
      // First, set an error state
      useAgentStore.setState({ error: 'Previous error' });

      const agents = [createMockAgent()];
      mockApi.get.mockResolvedValue({ data: agents });

      await useAgentStore.getState().fetchAgents();

      expect(useAgentStore.getState().error).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // createAgent Tests
  // --------------------------------------------------------------------------
  describe('createAgent', () => {
    it('creates agent successfully', async () => {
      const newAgent = createMockAgent({ id: 'new-agent', name: 'New Agent' });
      mockApi.post.mockResolvedValue({ data: newAgent });

      const result = await useAgentStore.getState().createAgent({
        name: 'New Agent',
        description: 'A new agent',
        systemPrompt: 'You are helpful.',
        model: 'gpt-4',
        provider: 'openrouter',
      });

      const state = useAgentStore.getState();
      expect(state.agents).toContainEqual(newAgent);
      expect(state.isLoading).toBe(false);
      expect(result).toEqual(newAgent);
      expect(mockApi.post).toHaveBeenCalledWith('/agents', expect.any(Object));
    });

    it('appends new agent to existing agents', async () => {
      const existingAgent = createMockAgent({ id: 'existing', name: 'Existing' });
      useAgentStore.setState({ agents: [existingAgent] });

      const newAgent = createMockAgent({ id: 'new-agent', name: 'New Agent' });
      mockApi.post.mockResolvedValue({ data: newAgent });

      await useAgentStore.getState().createAgent({ name: 'New Agent' });

      const state = useAgentStore.getState();
      expect(state.agents).toHaveLength(2);
      expect(state.agents).toContainEqual(existingAgent);
      expect(state.agents).toContainEqual(newAgent);
    });

    it('handles create error and throws', async () => {
      const errorMessage = 'Validation error';
      mockApi.post.mockRejectedValue(new Error(errorMessage));

      await expect(
        useAgentStore.getState().createAgent({ name: 'Test' })
      ).rejects.toThrow(errorMessage);

      const state = useAgentStore.getState();
      expect(state.isLoading).toBe(false);
      expect(state.error).toBe(errorMessage);
    });
  });

  // --------------------------------------------------------------------------
  // updateAgent Tests
  // --------------------------------------------------------------------------
  describe('updateAgent', () => {
    it('updates agent successfully', async () => {
      const existingAgent = createMockAgent({ id: 'agent-1', name: 'Original Name' });
      useAgentStore.setState({ agents: [existingAgent] });

      const updatedAgent = { ...existingAgent, name: 'Updated Name' };
      mockApi.put.mockResolvedValue({ data: updatedAgent });

      const result = await useAgentStore.getState().updateAgent('agent-1', {
        name: 'Updated Name',
      });

      const state = useAgentStore.getState();
      expect(state.agents[0].name).toBe('Updated Name');
      expect(result).toEqual(updatedAgent);
      expect(mockApi.put).toHaveBeenCalledWith('/agents/agent-1', { name: 'Updated Name' });
    });

    it('updates selectedAgent if it is the one being updated', async () => {
      const existingAgent = createMockAgent({ id: 'agent-1', name: 'Original' });
      useAgentStore.setState({
        agents: [existingAgent],
        selectedAgent: existingAgent,
      });

      const updatedAgent = { ...existingAgent, name: 'Updated' };
      mockApi.put.mockResolvedValue({ data: updatedAgent });

      await useAgentStore.getState().updateAgent('agent-1', { name: 'Updated' });

      const state = useAgentStore.getState();
      expect(state.selectedAgent?.name).toBe('Updated');
    });

    it('does not update selectedAgent if different agent is updated', async () => {
      const agent1 = createMockAgent({ id: 'agent-1', name: 'Agent 1' });
      const agent2 = createMockAgent({ id: 'agent-2', name: 'Agent 2' });
      useAgentStore.setState({
        agents: [agent1, agent2],
        selectedAgent: agent1,
      });

      const updatedAgent2 = { ...agent2, name: 'Updated Agent 2' };
      mockApi.put.mockResolvedValue({ data: updatedAgent2 });

      await useAgentStore.getState().updateAgent('agent-2', { name: 'Updated Agent 2' });

      const state = useAgentStore.getState();
      expect(state.selectedAgent?.name).toBe('Agent 1'); // Unchanged
    });

    it('handles update error and throws', async () => {
      const existingAgent = createMockAgent({ id: 'agent-1' });
      useAgentStore.setState({ agents: [existingAgent] });

      const errorMessage = 'Not found';
      mockApi.put.mockRejectedValue(new Error(errorMessage));

      await expect(
        useAgentStore.getState().updateAgent('agent-1', { name: 'Test' })
      ).rejects.toThrow(errorMessage);

      const state = useAgentStore.getState();
      expect(state.error).toBe(errorMessage);
    });
  });

  // --------------------------------------------------------------------------
  // deleteAgent Tests
  // --------------------------------------------------------------------------
  describe('deleteAgent', () => {
    it('deletes agent successfully', async () => {
      const agent = createMockAgent({ id: 'agent-1' });
      useAgentStore.setState({ agents: [agent] });

      mockApi.delete.mockResolvedValue({ data: {} });

      await useAgentStore.getState().deleteAgent('agent-1');

      const state = useAgentStore.getState();
      expect(state.agents).toHaveLength(0);
      expect(mockApi.delete).toHaveBeenCalledWith('/agents/agent-1');
    });

    it('removes only the deleted agent from the list', async () => {
      const agent1 = createMockAgent({ id: 'agent-1' });
      const agent2 = createMockAgent({ id: 'agent-2' });
      useAgentStore.setState({ agents: [agent1, agent2] });

      mockApi.delete.mockResolvedValue({ data: {} });

      await useAgentStore.getState().deleteAgent('agent-1');

      const state = useAgentStore.getState();
      expect(state.agents).toHaveLength(1);
      expect(state.agents[0].id).toBe('agent-2');
    });

    it('clears selectedAgent if deleted agent was selected', async () => {
      const agent = createMockAgent({ id: 'agent-1' });
      useAgentStore.setState({
        agents: [agent],
        selectedAgent: agent,
      });

      mockApi.delete.mockResolvedValue({ data: {} });

      await useAgentStore.getState().deleteAgent('agent-1');

      const state = useAgentStore.getState();
      expect(state.selectedAgent).toBeNull();
    });

    it('keeps selectedAgent if different agent is deleted', async () => {
      const agent1 = createMockAgent({ id: 'agent-1' });
      const agent2 = createMockAgent({ id: 'agent-2' });
      useAgentStore.setState({
        agents: [agent1, agent2],
        selectedAgent: agent1,
      });

      mockApi.delete.mockResolvedValue({ data: {} });

      await useAgentStore.getState().deleteAgent('agent-2');

      const state = useAgentStore.getState();
      expect(state.selectedAgent?.id).toBe('agent-1');
    });

    it('handles delete error and throws', async () => {
      const agent = createMockAgent({ id: 'agent-1' });
      useAgentStore.setState({ agents: [agent] });

      const errorMessage = 'Delete failed';
      mockApi.delete.mockRejectedValue(new Error(errorMessage));

      await expect(
        useAgentStore.getState().deleteAgent('agent-1')
      ).rejects.toThrow(errorMessage);

      const state = useAgentStore.getState();
      expect(state.error).toBe(errorMessage);
      // Agent should still be in the list since delete failed
      expect(state.agents).toContainEqual(agent);
    });
  });

  // --------------------------------------------------------------------------
  // selectAgent Tests
  // --------------------------------------------------------------------------
  describe('selectAgent', () => {
    it('sets selectedAgent', () => {
      const agent = createMockAgent({ id: 'agent-1' });

      useAgentStore.getState().selectAgent(agent);

      expect(useAgentStore.getState().selectedAgent).toEqual(agent);
    });

    it('clears selectedAgent when passed null', () => {
      const agent = createMockAgent({ id: 'agent-1' });
      useAgentStore.setState({ selectedAgent: agent });

      useAgentStore.getState().selectAgent(null);

      expect(useAgentStore.getState().selectedAgent).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // activateAgent Tests
  // --------------------------------------------------------------------------
  describe('activateAgent', () => {
    it('activates agent and sets status to idle', async () => {
      const agent = createMockAgent({ id: 'agent-1', status: 'offline' });
      useAgentStore.setState({ agents: [agent] });

      mockApi.post.mockResolvedValue({ data: {} });

      await useAgentStore.getState().activateAgent('agent-1');

      const state = useAgentStore.getState();
      expect(state.agents[0].status).toBe('idle');
      expect(mockApi.post).toHaveBeenCalledWith('/agents/agent-1/activate');
    });

    it('handles activation error and throws', async () => {
      const agent = createMockAgent({ id: 'agent-1', status: 'offline' });
      useAgentStore.setState({ agents: [agent] });

      const errorMessage = 'Activation failed';
      mockApi.post.mockRejectedValue(new Error(errorMessage));

      await expect(
        useAgentStore.getState().activateAgent('agent-1')
      ).rejects.toThrow(errorMessage);

      const state = useAgentStore.getState();
      expect(state.error).toBe(errorMessage);
      // Status should remain unchanged on error
      expect(state.agents[0].status).toBe('offline');
    });
  });

  // --------------------------------------------------------------------------
  // deactivateAgent Tests
  // --------------------------------------------------------------------------
  describe('deactivateAgent', () => {
    it('deactivates agent and sets status to offline', async () => {
      const agent = createMockAgent({ id: 'agent-1', status: 'idle' });
      useAgentStore.setState({ agents: [agent] });

      mockApi.post.mockResolvedValue({ data: {} });

      await useAgentStore.getState().deactivateAgent('agent-1');

      const state = useAgentStore.getState();
      expect(state.agents[0].status).toBe('offline');
      expect(mockApi.post).toHaveBeenCalledWith('/agents/agent-1/deactivate');
    });

    it('handles deactivation error and throws', async () => {
      const agent = createMockAgent({ id: 'agent-1', status: 'idle' });
      useAgentStore.setState({ agents: [agent] });

      const errorMessage = 'Deactivation failed';
      mockApi.post.mockRejectedValue(new Error(errorMessage));

      await expect(
        useAgentStore.getState().deactivateAgent('agent-1')
      ).rejects.toThrow(errorMessage);

      const state = useAgentStore.getState();
      expect(state.error).toBe(errorMessage);
      // Status should remain unchanged on error
      expect(state.agents[0].status).toBe('idle');
    });
  });

  // --------------------------------------------------------------------------
  // Store Subscription Tests
  // --------------------------------------------------------------------------
  describe('Store Subscriptions', () => {
    it('notifies subscribers on state change', async () => {
      const subscriber = vi.fn();
      const unsubscribe = useAgentStore.subscribe(subscriber);

      const agent = createMockAgent();
      mockApi.post.mockResolvedValue({ data: agent });

      await useAgentStore.getState().createAgent({ name: 'Test' });

      expect(subscriber).toHaveBeenCalled();
      unsubscribe();
    });

    it('can select specific state slices', () => {
      const agent1 = createMockAgent({ id: 'agent-1' });
      const agent2 = createMockAgent({ id: 'agent-2' });
      useAgentStore.setState({ agents: [agent1, agent2] });

      // Use selector to get specific agent
      const getAgentById = (id: string) =>
        useAgentStore.getState().agents.find((a) => a.id === id);

      expect(getAgentById('agent-1')).toEqual(agent1);
      expect(getAgentById('agent-2')).toEqual(agent2);
      expect(getAgentById('non-existent')).toBeUndefined();
    });
  });
});
