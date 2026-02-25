import React, { useEffect, useRef, useCallback, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../../stores/authStore';
import { Button } from '../common/Button';
import { AlertCircle, Check, Loader2, Terminal as TerminalIcon, RefreshCw } from 'lucide-react';
import api from '../../services/api';
import toast from 'react-hot-toast';

/**
 * Terminal theme - dark minimal style
 */
const TERMINAL_THEME = {
  background: '#0f172a',
  foreground: '#e2e8f0',
  cursor: '#22d3ee',
  cursorAccent: '#0f172a',
  selectionBackground: 'rgba(34, 211, 238, 0.3)',
  black: '#1e293b',
  red: '#f87171',
  green: '#4ade80',
  yellow: '#fbbf24',
  blue: '#60a5fa',
  magenta: '#c084fc',
  cyan: '#22d3ee',
  white: '#f1f5f9',
  brightBlack: '#475569',
  brightRed: '#fca5a5',
  brightGreen: '#86efac',
  brightYellow: '#fde047',
  brightBlue: '#93c5fd',
  brightMagenta: '#d8b4fe',
  brightCyan: '#67e8f9',
  brightWhite: '#ffffff'
};

/**
 * CLI type configurations
 */
const CLI_CONFIGS: Record<string, { name: string; command: string; description: string }> = {
  'cli-claude': {
    name: 'Claude CLI',
    command: 'claude auth login',
    description: 'Authenticate with your Anthropic account'
  },
  'cli-gemini': {
    name: 'Gemini CLI',
    command: 'gemini auth login',
    description: 'Authenticate with your Google account'
  },
  'cli-opencode': {
    name: 'OpenCode CLI',
    command: 'opencode auth login',
    description: 'Configure multi-provider authentication'
  }
};

/**
 * WebSocket URL helper
 */
const getWsURL = (): string => {
  const wsUrl = import.meta.env.VITE_WS_URL;
  if (wsUrl) return wsUrl;
  return window.location.origin;
};

/**
 * CLI Auth Terminal Props
 */
interface CLIAuthTerminalProps {
  /** CLI provider type */
  cliType: 'cli-claude' | 'cli-gemini' | 'cli-opencode';
  /** Callback when authentication is completed */
  onAuthComplete?: (success: boolean) => void;
  /** Callback when authentication status changes */
  onStatusChange?: (status: 'idle' | 'authenticating' | 'success' | 'error') => void;
}

/**
 * CLIAuthTerminal Component
 *
 * Mini terminal for CLI authentication within a modal.
 * Creates a terminal session, runs auth command, and tracks completion.
 */
export const CLIAuthTerminal: React.FC<CLIAuthTerminalProps> = ({
  cliType,
  onAuthComplete,
  onStatusChange
}) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const inputDisposableRef = useRef<{ dispose: () => void } | null>(null);

  const [status, setStatus] = useState<'idle' | 'authenticating' | 'success' | 'error'>('idle');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [authSessionId, setAuthSessionId] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const { token, user } = useAuthStore();
  const cliConfig = CLI_CONFIGS[cliType];

  /**
   * Update status and notify parent
   */
  const updateStatus = useCallback((newStatus: 'idle' | 'authenticating' | 'success' | 'error') => {
    setStatus(newStatus);
    onStatusChange?.(newStatus);
  }, [onStatusChange]);

  /**
   * Handle terminal resize
   */
  const handleResize = useCallback(() => {
    if (!fitAddonRef.current || !xtermRef.current) return;
    fitAddonRef.current.fit();

    if (sessionId && socketRef.current?.connected) {
      socketRef.current.emit('terminal:resize', {
        sessionId,
        token,
        cols: xtermRef.current.cols,
        rows: xtermRef.current.rows
      });
    }
  }, [sessionId, token]);

  /**
   * Initialize xterm.js terminal
   */
  useEffect(() => {
    if (!terminalRef.current) return;

    const terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontSize: 12,
      fontFamily: 'Menlo, Monaco, "Cascadia Code", "Fira Code", Consolas, monospace',
      lineHeight: 1.2,
      theme: TERMINAL_THEME,
      scrollback: 1000,
      convertEol: true,
      disableStdin: false,
      rows: 12,
      cols: 80
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(terminalRef.current);

    setTimeout(() => fitAddon.fit(), 0);

    xtermRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // Welcome message
    terminal.writeln(`\x1b[1;36m${cliConfig.name} Authentication\x1b[0m`);
    terminal.writeln(`\x1b[90m${cliConfig.description}\x1b[0m`);
    terminal.writeln('');
    terminal.writeln('Click "Start Authentication" to begin.');
    terminal.writeln('');

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      inputDisposableRef.current?.dispose();
      terminal.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
  }, [cliConfig, handleResize]);

  /**
   * Connect to WebSocket when session is active
   */
  useEffect(() => {
    if (!sessionId || !token || !xtermRef.current) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setIsConnected(false);
      }
      return;
    }

    const terminal = xtermRef.current;
    terminal.clear();
    terminal.writeln(`\x1b[33mConnecting to terminal...\x1b[0m\n`);

    const socket = io(getWsURL(), {
      transports: ['websocket'],
      auth: { token }
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      if (user?.id) {
        socket.emit('auth', { userId: user.id, agentIds: [] });
      }
      socket.emit('terminal:subscribe', { sessionId, token });
    });

    socket.on('terminal:subscribed', () => {
      terminal.writeln('\x1b[32mConnected!\x1b[0m\n');
      terminal.writeln(`\x1b[1mRun this command:\x1b[0m \x1b[33m${cliConfig.command}\x1b[0m\n`);
      setIsConnected(true);
      updateStatus('authenticating');

      socket.emit('terminal:resize', {
        sessionId,
        token,
        cols: terminal.cols,
        rows: terminal.rows
      });
    });

    socket.on('terminal:data', (data: { data: string }) => {
      terminal.write(data.data);
    });

    socket.on('terminal:buffer', (data: { data: string }) => {
      terminal.write(data.data);
    });

    socket.on('terminal:exit', (data: { exitCode: number }) => {
      terminal.writeln(`\n\x1b[33mSession ended (exit code: ${data.exitCode})\x1b[0m`);
      setIsConnected(false);
    });

    socket.on('terminal:error', (data: { error: string }) => {
      terminal.writeln(`\n\x1b[31mError: ${data.error}\x1b[0m`);
    });

    socket.on('disconnect', (reason) => {
      setIsConnected(false);
      if (reason !== 'io client disconnect') {
        terminal.writeln('\n\x1b[33mConnection lost.\x1b[0m');
      }
    });

    inputDisposableRef.current?.dispose();
    inputDisposableRef.current = terminal.onData((data) => {
      if (socket.connected) {
        socket.emit('terminal:write', { sessionId, input: data });
      }
    });

    return () => {
      inputDisposableRef.current?.dispose();
      inputDisposableRef.current = null;
      socket.disconnect();
      socketRef.current = null;
      setIsConnected(false);
    };
  }, [sessionId, token, user, cliConfig, updateStatus]);

  /**
   * Start authentication session
   */
  const startAuth = async () => {
    setIsLoading(true);
    try {
      // Start CLI auth session via superbrain routes
      const authResponse = await api.post('/superbrain/cli/auth/start', {
        cliType: cliType.replace('cli-', '') // Convert 'cli-claude' to 'claude'
      });

      // API returns { success: true, session: { sessionId, ... } }
      const newAuthSessionId = authResponse.data.session?.sessionId || authResponse.data.sessionId;
      if (!newAuthSessionId) {
        throw new Error('No session ID returned from server');
      }
      setAuthSessionId(newAuthSessionId);

      // Create terminal session
      const terminalResponse = await api.post('/superbrain/cli/auth/terminal', {
        sessionId: newAuthSessionId
      });
      // API returns { success: true, terminalSessionId: ... }
      const terminalSessionId = terminalResponse.data.terminalSessionId || terminalResponse.data.sessionId;
      setSessionId(terminalSessionId);

      updateStatus('authenticating');
    } catch (error: unknown) {
      console.error('Failed to start auth:', error);
      const err = error as { response?: { data?: { error?: string } } };
      toast.error(err.response?.data?.error || 'Failed to start authentication session');
      updateStatus('error');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Complete authentication
   */
  const completeAuth = async () => {
    if (!authSessionId) {
      toast.error('No auth session active');
      return;
    }

    setIsLoading(true);
    try {
      const response = await api.post('/superbrain/cli/auth/complete', {
        sessionId: authSessionId
      });

      if (response.data.success) {
        updateStatus('success');
        onAuthComplete?.(true);
        toast.success(`${cliConfig.name} authenticated successfully!`);
      } else {
        updateStatus('error');
        onAuthComplete?.(false);
        toast.error('Authentication failed');
      }
    } catch (error: unknown) {
      console.error('Failed to complete auth:', error);
      const err = error as { response?: { data?: { error?: string } } };
      toast.error(err.response?.data?.error || 'Failed to complete authentication');
      updateStatus('error');
      onAuthComplete?.(false);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Reset and try again
   */
  const resetAuth = () => {
    setSessionId(null);
    setAuthSessionId(null);
    setIsConnected(false);
    updateStatus('idle');

    if (xtermRef.current) {
      xtermRef.current.clear();
      xtermRef.current.writeln(`\x1b[1;36m${cliConfig.name} Authentication\x1b[0m`);
      xtermRef.current.writeln(`\x1b[90m${cliConfig.description}\x1b[0m`);
      xtermRef.current.writeln('');
      xtermRef.current.writeln('Click "Start Authentication" to begin.');
      xtermRef.current.writeln('');
    }
  };

  return (
    <div className="space-y-3">
      {/* Instructions */}
      <div className="p-3 bg-slate-800/50 border border-slate-700 rounded-lg">
        <div className="flex items-start gap-3">
          <TerminalIcon className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm space-y-1">
            <p className="text-white font-medium">{cliConfig.name} Authentication</p>
            <ol className="text-gray-400 list-decimal list-inside space-y-0.5 text-xs">
              <li>Click "Start Authentication" to open terminal</li>
              <li>Run: <code className="text-cyan-400 bg-slate-800 px-1 py-0.5 rounded">{cliConfig.command}</code></li>
              <li>Follow the prompts to authenticate</li>
              <li>Click "Complete Authentication" when done</li>
            </ol>
          </div>
        </div>
      </div>

      {/* Terminal */}
      <div className="relative">
        <div
          ref={terminalRef}
          className="w-full h-[240px] bg-slate-900 rounded-lg border border-slate-700 overflow-hidden p-2"
        />

        {/* Status overlay */}
        {status === 'success' && (
          <div className="absolute inset-0 bg-slate-900/90 flex items-center justify-center rounded-lg">
            <div className="text-center">
              <Check className="w-12 h-12 text-emerald-400 mx-auto mb-2" />
              <p className="text-emerald-400 font-medium">Authentication Successful!</p>
            </div>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        {status === 'idle' && (
          <Button
            onClick={startAuth}
            loading={isLoading}
            icon={<TerminalIcon className="w-4 h-4" />}
            className="flex-1"
          >
            Start Authentication
          </Button>
        )}

        {status === 'authenticating' && (
          <>
            <Button
              variant="ghost"
              onClick={resetAuth}
              icon={<RefreshCw className="w-4 h-4" />}
            >
              Reset
            </Button>
            <Button
              onClick={completeAuth}
              loading={isLoading}
              icon={<Check className="w-4 h-4" />}
              className="flex-1"
            >
              Complete Authentication
            </Button>
          </>
        )}

        {status === 'error' && (
          <Button
            onClick={resetAuth}
            icon={<RefreshCw className="w-4 h-4" />}
            className="flex-1"
          >
            Try Again
          </Button>
        )}

        {status === 'success' && (
          <div className="flex-1 flex items-center justify-center gap-2 p-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400">
            <Check className="w-5 h-5" />
            <span className="font-medium">Authenticated</span>
          </div>
        )}
      </div>

      {/* Connection status */}
      {status === 'authenticating' && (
        <div className="flex items-center gap-2 text-xs">
          <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400' : 'bg-amber-400'}`} />
          <span className="text-gray-400">
            {isConnected ? 'Terminal connected' : 'Connecting...'}
          </span>
        </div>
      )}
    </div>
  );
};

export default CLIAuthTerminal;
