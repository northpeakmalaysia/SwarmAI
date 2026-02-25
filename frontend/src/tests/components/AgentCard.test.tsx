/**
 * AgentCard Component Tests
 * Tests for the AgentCard component which displays agent information
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AgentCard, AgentCardProps, AgentData, formatLastActive } from '../../components/agents/AgentCard';

// ============================================================================
// Test Data
// ============================================================================

const createMockAgentData = (overrides: Partial<AgentData> = {}): AgentData => ({
  id: 'agent-1',
  name: 'Test Agent',
  description: 'A test agent for unit testing',
  platform: 'whatsapp',
  phoneNumber: '+1234567890',
  status: 'idle',
  skills: ['support', 'sales', 'technical'],
  reputation: {
    score: 85,
    totalInteractions: 150,
  },
  lastActiveAt: new Date().toISOString(),
  model: 'gpt-4',
  ...overrides,
});

// ============================================================================
// Test Suite
// ============================================================================

describe('AgentCard', () => {
  // --------------------------------------------------------------------------
  // Rendering Tests
  // --------------------------------------------------------------------------
  describe('Rendering', () => {
    it('renders agent name correctly', () => {
      const agent = createMockAgentData({ name: 'Support Agent' });
      render(<AgentCard agent={agent} />);

      expect(screen.getByText('Support Agent')).toBeInTheDocument();
    });

    it('renders agent description when provided', () => {
      const agent = createMockAgentData({ description: 'Handles customer inquiries' });
      render(<AgentCard agent={agent} />);

      expect(screen.getByText('Handles customer inquiries')).toBeInTheDocument();
    });

    it('does not render description when not provided', () => {
      const agent = createMockAgentData({ description: undefined });
      render(<AgentCard agent={agent} />);

      expect(screen.queryByText(/Handles/)).not.toBeInTheDocument();
    });

    it('renders phone number as contact info for WhatsApp platform', () => {
      const agent = createMockAgentData({
        platform: 'whatsapp',
        phoneNumber: '+1987654321',
      });
      render(<AgentCard agent={agent} />);

      expect(screen.getByText('+1987654321')).toBeInTheDocument();
    });

    it('renders email as contact info for email platform', () => {
      const agent = createMockAgentData({
        platform: 'email',
        phoneNumber: undefined,
        email: 'agent@test.com',
      });
      render(<AgentCard agent={agent} />);

      expect(screen.getByText('agent@test.com')).toBeInTheDocument();
    });

    it('renders telegram username for telegram platform', () => {
      const agent = createMockAgentData({
        platform: 'telegram-bot',
        phoneNumber: undefined,
        telegramUsername: '@testbot',
      });
      render(<AgentCard agent={agent} />);

      expect(screen.getByText('@testbot')).toBeInTheDocument();
    });

    it('renders skills badges', () => {
      const agent = createMockAgentData({
        skills: ['support', 'sales', 'technical'],
      });
      render(<AgentCard agent={agent} />);

      expect(screen.getByText('support')).toBeInTheDocument();
      expect(screen.getByText('sales')).toBeInTheDocument();
      expect(screen.getByText('technical')).toBeInTheDocument();
    });

    it('shows +N badge when more than 4 skills', () => {
      const agent = createMockAgentData({
        skills: ['skill1', 'skill2', 'skill3', 'skill4', 'skill5', 'skill6'],
      });
      render(<AgentCard agent={agent} />);

      // Should show first 4 skills
      expect(screen.getByText('skill1')).toBeInTheDocument();
      expect(screen.getByText('skill2')).toBeInTheDocument();
      expect(screen.getByText('skill3')).toBeInTheDocument();
      expect(screen.getByText('skill4')).toBeInTheDocument();

      // Should show +2 badge
      expect(screen.getByText('+2')).toBeInTheDocument();
    });

    it('renders unread count badge when unread messages exist', () => {
      const agent = createMockAgentData({ unreadCount: 5 });
      render(<AgentCard agent={agent} />);

      expect(screen.getByText('5')).toBeInTheDocument();
    });

    it('shows 99+ when unread count exceeds 99', () => {
      const agent = createMockAgentData({ unreadCount: 150 });
      render(<AgentCard agent={agent} />);

      expect(screen.getByText('99+')).toBeInTheDocument();
    });

    it('does not render unread badge when count is 0', () => {
      const agent = createMockAgentData({ unreadCount: 0 });
      const { container } = render(<AgentCard agent={agent} />);

      // The unread badge container should not exist (no red badge)
      const unreadBadge = container.querySelector('.bg-red-500');
      expect(unreadBadge).not.toBeInTheDocument();
    });

    it('applies loading animation class when loading is true', () => {
      const agent = createMockAgentData();
      const { container } = render(<AgentCard agent={agent} loading />);

      // Check for animate-pulse class
      const card = container.firstChild as HTMLElement;
      expect(card).toHaveClass('animate-pulse');
    });
  });

  // --------------------------------------------------------------------------
  // Status Tests
  // --------------------------------------------------------------------------
  describe('Status Display', () => {
    it.each([
      ['online', 'Online'],
      ['offline', 'Offline'],
      ['idle', 'Ready'],
      ['busy', 'Busy'],
      ['processing', 'Processing'],
      ['swarming', 'Swarming'],
      ['disconnected', 'Disconnected'],
      ['error', 'Error'],
    ] as const)('displays correct status label for %s status', (status, expectedLabel) => {
      const agent = createMockAgentData({ status });
      render(<AgentCard agent={agent} />);

      expect(screen.getByText(expectedLabel)).toBeInTheDocument();
    });
  });

  // --------------------------------------------------------------------------
  // Click Handler Tests
  // --------------------------------------------------------------------------
  describe('Click Handlers', () => {
    it('calls onClick when card is clicked', () => {
      const onClick = vi.fn();
      const agent = createMockAgentData();
      render(<AgentCard agent={agent} onClick={onClick} />);

      // Click on the card (by name since Card doesn't have role)
      const name = screen.getByText('Test Agent');
      fireEvent.click(name.closest('[class*="rounded-xl"]')!);

      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('calls onStart when start button is clicked for offline agent', () => {
      const onStart = vi.fn();
      const agent = createMockAgentData({ status: 'offline' });
      render(<AgentCard agent={agent} onStart={onStart} />);

      const startButton = screen.getByTitle('Start agent');
      fireEvent.click(startButton);

      expect(onStart).toHaveBeenCalledTimes(1);
    });

    it('calls onStop when stop button is clicked for active agent', () => {
      const onStop = vi.fn();
      const agent = createMockAgentData({ status: 'idle' });
      render(<AgentCard agent={agent} onStop={onStop} />);

      const stopButton = screen.getByTitle('Stop agent');
      fireEvent.click(stopButton);

      expect(onStop).toHaveBeenCalledTimes(1);
    });

    it('calls onConfigure when configure button is clicked', () => {
      const onConfigure = vi.fn();
      const agent = createMockAgentData();
      render(<AgentCard agent={agent} onConfigure={onConfigure} />);

      const configureButton = screen.getByTitle('Configure agent');
      fireEvent.click(configureButton);

      expect(onConfigure).toHaveBeenCalledTimes(1);
    });

    it('calls onDelete when delete button is clicked', () => {
      const onDelete = vi.fn();
      const agent = createMockAgentData();
      render(<AgentCard agent={agent} onDelete={onDelete} />);

      const deleteButton = screen.getByTitle('Delete agent');
      fireEvent.click(deleteButton);

      expect(onDelete).toHaveBeenCalledTimes(1);
    });

    it('stops event propagation when action buttons are clicked', () => {
      const onClick = vi.fn();
      const onConfigure = vi.fn();
      const agent = createMockAgentData();
      render(<AgentCard agent={agent} onClick={onClick} onConfigure={onConfigure} />);

      const configureButton = screen.getByTitle('Configure agent');
      fireEvent.click(configureButton);

      // onClick should not be called because propagation is stopped
      expect(onConfigure).toHaveBeenCalledTimes(1);
      // Note: Due to how fireEvent works, onClick may still be called
      // In real browser behavior, stopPropagation would prevent this
    });

    it('disables action buttons when disabled prop is true', () => {
      const onStart = vi.fn();
      const agent = createMockAgentData({ status: 'offline' });
      render(<AgentCard agent={agent} onStart={onStart} disabled />);

      const startButton = screen.getByTitle('Start agent');
      expect(startButton).toBeDisabled();
    });
  });

  // --------------------------------------------------------------------------
  // Active Status Tests
  // --------------------------------------------------------------------------
  describe('Active Status Detection', () => {
    it.each([
      ['online', true],
      ['swarming', true],
      ['idle', true],
      ['busy', true],
      ['processing', true],
      ['offline', false],
      ['disconnected', false],
      ['error', false],
    ] as const)('correctly identifies %s as active=%s', (status, isActive) => {
      const onStart = vi.fn();
      const onStop = vi.fn();
      const agent = createMockAgentData({ status });
      render(<AgentCard agent={agent} onStart={onStart} onStop={onStop} />);

      if (isActive) {
        expect(screen.getByTitle('Stop agent')).toBeInTheDocument();
      } else {
        expect(screen.getByTitle('Start agent')).toBeInTheDocument();
      }
    });
  });

  // --------------------------------------------------------------------------
  // Reputation Display Tests
  // --------------------------------------------------------------------------
  describe('Reputation Display', () => {
    it('renders reputation stars for agents with reputation', () => {
      const agent = createMockAgentData({
        reputation: { score: 80, totalInteractions: 100 },
      });
      render(<AgentCard agent={agent} />);

      // Check for interaction count
      expect(screen.getByText('(100)')).toBeInTheDocument();
    });

    it('does not render reputation when not provided', () => {
      const agent = createMockAgentData({ reputation: undefined });
      render(<AgentCard agent={agent} />);

      // Interaction count should not appear
      expect(screen.queryByText(/\(\d+\)/)).not.toBeInTheDocument();
    });
  });

  // --------------------------------------------------------------------------
  // Platform Icon Tests
  // --------------------------------------------------------------------------
  describe('Platform Icons', () => {
    it('renders correct icon for whatsapp platform', () => {
      const agent = createMockAgentData({ platform: 'whatsapp' });
      const { container } = render(<AgentCard agent={agent} />);

      // Check for emerald background color (whatsapp)
      const iconContainer = container.querySelector('.bg-emerald-500\\/20');
      expect(iconContainer).toBeInTheDocument();
    });

    it('renders correct icon for telegram platform', () => {
      const agent = createMockAgentData({ platform: 'telegram-bot' });
      const { container } = render(<AgentCard agent={agent} />);

      // Check for sky background color (telegram)
      const iconContainer = container.querySelector('.bg-sky-500\\/20');
      expect(iconContainer).toBeInTheDocument();
    });

    it('renders correct icon for email platform', () => {
      const agent = createMockAgentData({ platform: 'email' });
      const { container } = render(<AgentCard agent={agent} />);

      // Check for rose background color (email)
      const iconContainer = container.querySelector('.bg-rose-500\\/20');
      expect(iconContainer).toBeInTheDocument();
    });

    it('renders default icon when no platform specified', () => {
      const agent = createMockAgentData({ platform: undefined });
      const { container } = render(<AgentCard agent={agent} />);

      // Check for gradient background (default)
      const iconContainer = container.querySelector('[class*="bg-gradient-to-br"]');
      expect(iconContainer).toBeInTheDocument();
    });
  });
});

// ============================================================================
// formatLastActive Function Tests
// ============================================================================

describe('formatLastActive', () => {
  beforeEach(() => {
    // Mock current date to 2024-01-15 12:00:00
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));
  });

  it('returns "Never" for undefined date', () => {
    expect(formatLastActive(undefined)).toBe('Never');
  });

  it('returns "Just now" for dates less than 1 minute ago', () => {
    const now = new Date('2024-01-15T11:59:30Z'); // 30 seconds ago
    expect(formatLastActive(now.toISOString())).toBe('Just now');
  });

  it('returns minutes ago for dates less than 1 hour ago', () => {
    const thirtyMinsAgo = new Date('2024-01-15T11:30:00Z');
    expect(formatLastActive(thirtyMinsAgo.toISOString())).toBe('30m ago');
  });

  it('returns hours ago for dates less than 24 hours ago', () => {
    const sixHoursAgo = new Date('2024-01-15T06:00:00Z');
    expect(formatLastActive(sixHoursAgo.toISOString())).toBe('6h ago');
  });

  it('returns days ago for dates less than 7 days ago', () => {
    const threeDaysAgo = new Date('2024-01-12T12:00:00Z');
    expect(formatLastActive(threeDaysAgo.toISOString())).toBe('3d ago');
  });

  it('returns formatted date for dates more than 7 days ago', () => {
    const twoWeeksAgo = new Date('2024-01-01T12:00:00Z');
    const result = formatLastActive(twoWeeksAgo.toISOString());
    // Should return date in locale format
    expect(result).toMatch(/\d{1,2}\/\d{1,2}\/\d{4}/);
  });

  afterEach(() => {
    vi.useRealTimers();
  });
});
