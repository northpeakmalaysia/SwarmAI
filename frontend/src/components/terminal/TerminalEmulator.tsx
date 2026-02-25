import React, { useEffect, useRef, useCallback, useState, forwardRef, useImperativeHandle } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../../stores/authStore';
import type { TerminalSession } from '../../hooks/useTerminal';

/**
 * SwarmAI terminal theme - matches the dark swarm aesthetic
 */
const TERMINAL_THEME = {
  background: '#0f172a',      // slate-900
  foreground: '#e2e8f0',      // slate-200
  cursor: '#22d3ee',          // cyan-400
  cursorAccent: '#0f172a',    // slate-900
  selectionBackground: 'rgba(34, 211, 238, 0.3)',  // cyan with transparency
  black: '#1e293b',           // slate-800
  red: '#f87171',             // red-400
  green: '#4ade80',           // green-400
  yellow: '#fbbf24',          // amber-400
  blue: '#60a5fa',            // blue-400
  magenta: '#c084fc',         // purple-400
  cyan: '#22d3ee',            // cyan-400
  white: '#f1f5f9',           // slate-100
  brightBlack: '#475569',     // slate-600
  brightRed: '#fca5a5',       // red-300
  brightGreen: '#86efac',     // green-300
  brightYellow: '#fde047',    // yellow-300
  brightBlue: '#93c5fd',      // blue-300
  brightMagenta: '#d8b4fe',   // purple-300
  brightCyan: '#67e8f9',      // cyan-300
  brightWhite: '#ffffff'      // white
};

/**
 * WebSocket URL helper - uses current origin for nginx proxy compatibility
 */
const getWsURL = (): string => {
  const wsUrl = import.meta.env.VITE_WS_URL;
  if (wsUrl) return wsUrl;
  return window.location.origin;
};

/**
 * Terminal emulator props
 */
interface TerminalEmulatorProps {
  /** Terminal session to connect to */
  session: TerminalSession | null;
  /** Optional CSS class name */
  className?: string;
  /** Callback when session exits */
  onSessionExit?: (exitCode: number) => void;
  /** Callback when connection state changes */
  onConnectionChange?: (connected: boolean) => void;
  /** Callback when session error occurs (e.g., session not found) */
  onSessionError?: (error: string) => void;
  /** Whether terminal is focused */
  autoFocus?: boolean;
}

/**
 * Terminal emulator ref interface
 */
export interface TerminalEmulatorRef {
  /** Focus the terminal */
  focus: () => void;
  /** Clear the terminal content */
  clear: () => void;
  /** Write text to the terminal */
  write: (text: string) => void;
  /** Resize the terminal to fit container */
  fit: () => void;
}

/**
 * TerminalEmulator Component
 *
 * Renders an xterm.js terminal and connects to backend via WebSocket
 * for real-time terminal I/O.
 */
export const TerminalEmulator = forwardRef<TerminalEmulatorRef, TerminalEmulatorProps>(
  ({ session, className = '', onSessionExit, onConnectionChange, onSessionError, autoFocus = true }, ref) => {
    const terminalRef = useRef<HTMLDivElement>(null);
    const xtermRef = useRef<Terminal | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);
    const socketRef = useRef<Socket | null>(null);
    const inputDisposableRef = useRef<{ dispose: () => void } | null>(null);
    const sessionRef = useRef<TerminalSession | null>(null);
    const [isConnected, setIsConnected] = useState(false);

    const { token, user } = useAuthStore();

    // Keep session ref updated
    sessionRef.current = session;

    // Expose methods via ref
    useImperativeHandle(ref, () => ({
      focus: () => {
        xtermRef.current?.focus();
      },
      clear: () => {
        xtermRef.current?.clear();
      },
      write: (text: string) => {
        xtermRef.current?.write(text);
      },
      fit: () => {
        fitAddonRef.current?.fit();
      }
    }), []);

    /**
     * Handle terminal resize and notify server
     */
    const handleResize = useCallback(() => {
      if (!fitAddonRef.current || !xtermRef.current) return;

      fitAddonRef.current.fit();

      if (session && socketRef.current?.connected) {
        socketRef.current.emit('terminal:resize', {
          sessionId: session.id,
          token,
          cols: xtermRef.current.cols,
          rows: xtermRef.current.rows
        });
      }
    }, [session, token]);

    /**
     * Initialize xterm.js terminal
     */
    useEffect(() => {
      if (!terminalRef.current) return;

      // Create terminal instance
      const terminal = new Terminal({
        cursorBlink: true,
        cursorStyle: 'block',
        fontSize: 14,
        fontFamily: 'Menlo, Monaco, "Cascadia Code", "Fira Code", Consolas, "Courier New", monospace',
        fontWeight: 'normal',
        fontWeightBold: 'bold',
        lineHeight: 1.2,
        letterSpacing: 0,
        theme: TERMINAL_THEME,
        allowTransparency: true,
        scrollback: 10000,
        tabStopWidth: 4,
        convertEol: true,
        disableStdin: false,
        rightClickSelectsWord: true,
        windowOptions: {
          setWinSizeChars: true
        }
      });

      // Create and load addons
      const fitAddon = new FitAddon();
      const webLinksAddon = new WebLinksAddon();

      terminal.loadAddon(fitAddon);
      terminal.loadAddon(webLinksAddon);

      // Setup keyboard shortcuts for copy/paste
      terminal.attachCustomKeyEventHandler((event) => {
        // Ctrl+C with selection = copy to clipboard
        if (event.ctrlKey && event.key === 'c' && terminal.hasSelection()) {
          const selection = terminal.getSelection();
          navigator.clipboard.writeText(selection);
          return false; // Prevent default (don't send Ctrl+C to terminal)
        }

        // Ctrl+Shift+C = copy (alternative)
        if (event.ctrlKey && event.shiftKey && event.key === 'C') {
          const selection = terminal.getSelection();
          if (selection) {
            navigator.clipboard.writeText(selection);
          }
          return false;
        }

        // Ctrl+V = paste from clipboard
        if (event.ctrlKey && event.key === 'v') {
          navigator.clipboard.readText().then((text) => {
            const currentSession = sessionRef.current;
            if (text && socketRef.current?.connected && currentSession) {
              socketRef.current.emit('terminal:write', {
                sessionId: currentSession.id,
                input: text
              });
            }
          });
          return false; // Prevent default
        }

        // Ctrl+Shift+V = paste (alternative)
        if (event.ctrlKey && event.shiftKey && event.key === 'V') {
          navigator.clipboard.readText().then((text) => {
            const currentSession = sessionRef.current;
            if (text && socketRef.current?.connected && currentSession) {
              socketRef.current.emit('terminal:write', {
                sessionId: currentSession.id,
                input: text
              });
            }
          });
          return false;
        }

        return true; // Allow other keys
      });

      // Open terminal in container
      terminal.open(terminalRef.current);

      // Initial fit
      setTimeout(() => fitAddon.fit(), 0);

      // Store references
      xtermRef.current = terminal;
      fitAddonRef.current = fitAddon;

      // Write welcome message if no session
      if (!session) {
        terminal.writeln('\x1b[1;36m========================================\x1b[0m');
        terminal.writeln('\x1b[1;36m     SwarmAI CLI Terminal              \x1b[0m');
        terminal.writeln('\x1b[1;36m========================================\x1b[0m');
        terminal.writeln('');
        terminal.writeln('Select a terminal type and click "New Session" to begin.');
        terminal.writeln('');
      }

      // Handle window resize
      window.addEventListener('resize', handleResize);

      // Auto-focus if specified
      if (autoFocus) {
        terminal.focus();
      }

      return () => {
        window.removeEventListener('resize', handleResize);
        inputDisposableRef.current?.dispose();
        terminal.dispose();
        xtermRef.current = null;
        fitAddonRef.current = null;
      };
    }, [handleResize, autoFocus]); // Note: session intentionally not in deps to avoid recreating terminal

    /**
     * Connect to WebSocket when session becomes active
     */
    useEffect(() => {
      if (!session || !token || !xtermRef.current) {
        // Disconnect if no session
        if (socketRef.current) {
          socketRef.current.disconnect();
          socketRef.current = null;
          setIsConnected(false);
          onConnectionChange?.(false);
        }
        return;
      }

      const terminal = xtermRef.current;

      // Clear terminal and show connecting message
      terminal.clear();
      terminal.writeln(`\x1b[33mConnecting to ${session.type} session...\x1b[0m\n`);

      // Create socket connection
      const socket = io(getWsURL(), {
        transports: ['websocket'],
        auth: { token }
      });

      socketRef.current = socket;

      // Handle connection established
      socket.on('connect', () => {
        console.log('[TerminalEmulator] WebSocket connected');

        // First authenticate the socket connection with userId
        if (user?.id) {
          socket.emit('auth', { userId: user.id, agentIds: [] });
          console.log('[TerminalEmulator] Auth event sent for user:', user.id);
        }

        // Subscribe to terminal session
        socket.emit('terminal:subscribe', {
          sessionId: session.id,
          token
        });
      });

      // Handle successful subscription
      socket.on('terminal:subscribed', (data: { sessionId: string }) => {
        console.log('[TerminalEmulator] Subscribed to session:', data.sessionId);
        terminal.writeln('\x1b[32mConnected to terminal session.\x1b[0m\n');
        setIsConnected(true);
        onConnectionChange?.(true);

        // Send initial resize
        socket.emit('terminal:resize', {
          sessionId: session.id,
          token,
          cols: terminal.cols,
          rows: terminal.rows
        });
      });

      // Handle buffered output (sent on reconnection)
      socket.on('terminal:buffer', (data: { data: string }) => {
        terminal.write(data.data);
      });

      // Handle terminal output
      socket.on('terminal:data', (data: { data: string }) => {
        terminal.write(data.data);
      });

      // Handle session exit
      socket.on('terminal:exit', (data: { exitCode: number }) => {
        terminal.writeln(`\n\x1b[33mSession ended (exit code: ${data.exitCode})\x1b[0m`);
        setIsConnected(false);
        onConnectionChange?.(false);
        onSessionExit?.(data.exitCode);
      });

      // Handle errors
      socket.on('terminal:error', (data: { error: string; sessionId?: string }) => {
        terminal.writeln(`\n\x1b[31mError: ${data.error}\x1b[0m`);

        // If this is a session-related error, notify parent to clear state
        if (data.error.includes('Session not found') ||
            data.error.includes('access denied') ||
            data.error.includes('Session ID is required')) {
          onSessionError?.(data.error);
        }
      });

      // Handle disconnection
      socket.on('disconnect', (reason) => {
        console.log('[TerminalEmulator] WebSocket disconnected:', reason);
        setIsConnected(false);
        onConnectionChange?.(false);

        if (reason !== 'io client disconnect') {
          terminal.writeln('\n\x1b[33mConnection lost. Attempting to reconnect...\x1b[0m');
        }
      });

      // Handle reconnection
      socket.io.on('reconnect', () => {
        terminal.writeln('\n\x1b[32mReconnected!\x1b[0m\n');
        // Re-subscribe to session
        socket.emit('terminal:subscribe', {
          sessionId: session.id,
          token
        });
      });

      // Setup terminal input handler
      inputDisposableRef.current?.dispose();
      inputDisposableRef.current = terminal.onData((data) => {
        if (socket.connected) {
          socket.emit('terminal:write', {
            sessionId: session.id,
            input: data
          });
        }
      });

      return () => {
        inputDisposableRef.current?.dispose();
        inputDisposableRef.current = null;
        socket.disconnect();
        socketRef.current = null;
        setIsConnected(false);
      };
    }, [session, token, user, onSessionExit, onConnectionChange, onSessionError]);

    return (
      <div
        ref={terminalRef}
        className={`w-full h-full min-h-[300px] bg-slate-900 p-2 ${className}`}
      />
    );
  }
);

TerminalEmulator.displayName = 'TerminalEmulator';

export default TerminalEmulator;
