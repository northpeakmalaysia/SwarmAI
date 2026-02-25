import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Terminal, AlertTriangle, RefreshCw, Info } from 'lucide-react';
import { TerminalEmulator, TerminalToolbar } from '../components/terminal';
import type { TerminalEmulatorRef } from '../components/terminal';
import { useTerminal, type TerminalSession } from '../hooks/useTerminal';
import { cn } from '../lib/utils';
import toast from 'react-hot-toast';

/**
 * TerminalPage Component
 *
 * Main page for CLI terminal integration. Provides:
 * - Terminal type selection
 * - Session management (create, switch, kill)
 * - Full xterm.js terminal experience
 * - Fullscreen mode support
 */
export default function TerminalPage() {
  const {
    types,
    sessions,
    loading,
    error,
    createSession,
    killSession,
    installCli,
    clearError,
    refreshSessions
  } = useTerminal();

  const [selectedType, setSelectedType] = useState<string>('bash');
  const [activeSession, setActiveSession] = useState<TerminalSession | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  const terminalRef = useRef<TerminalEmulatorRef>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Set default type when types are loaded
  useEffect(() => {
    if (types.length > 0 && !types.find(t => t.type === selectedType && t.installed)) {
      const firstInstalled = types.find(t => t.installed);
      if (firstInstalled) {
        setSelectedType(firstInstalled.type);
      }
    }
  }, [types, selectedType]);

  // Handle creating a new terminal session
  const handleCreateSession = useCallback(async () => {
    try {
      terminalRef.current?.clear();
      terminalRef.current?.write(`\x1b[33mStarting ${selectedType} session...\x1b[0m\n\n`);

      const session = await createSession(selectedType, {
        cols: 80,
        rows: 24
      });

      setActiveSession(session);
      toast.success(`Started ${selectedType} session`);

      // Focus terminal after short delay
      setTimeout(() => {
        terminalRef.current?.focus();
        terminalRef.current?.fit();
      }, 100);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create session';
      terminalRef.current?.write(`\x1b[31mError: ${message}\x1b[0m\n`);
      toast.error(message);
    }
  }, [selectedType, createSession]);

  // Handle killing the current session
  const handleKillSession = useCallback(async () => {
    if (!activeSession) return;

    try {
      await killSession(activeSession.id);
      setActiveSession(null);
      terminalRef.current?.write('\n\x1b[33mSession terminated.\x1b[0m\n');
      toast.success('Session terminated');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to kill session';
      toast.error(message);
    }
  }, [activeSession, killSession]);

  // Handle session selection from tabs
  const handleSessionSelect = useCallback((session: TerminalSession) => {
    if (session.id === activeSession?.id) return;
    setActiveSession(session);
    setTimeout(() => {
      terminalRef.current?.focus();
      terminalRef.current?.fit();
    }, 100);
  }, [activeSession]);

  // Handle session exit event from terminal
  const handleSessionExit = useCallback((exitCode: number) => {
    setActiveSession(null);
    refreshSessions();
    toast(
      exitCode === 0
        ? 'Session ended normally'
        : `Session ended with code ${exitCode}`,
      { icon: exitCode === 0 ? 'info' : 'warning' }
    );
  }, [refreshSessions]);

  // Handle session error (e.g., session not found on backend)
  const handleSessionError = useCallback((error: string) => {
    console.warn('[TerminalPage] Session error:', error);
    setActiveSession(null);
    refreshSessions();
    toast.error(error);
  }, [refreshSessions]);

  // Handle connection state changes
  const handleConnectionChange = useCallback((connected: boolean) => {
    setIsConnected(connected);
  }, []);

  // Handle CLI installation
  const handleInstallCli = useCallback(async (cli: string) => {
    try {
      terminalRef.current?.write(`\x1b[33mInstalling ${cli}...\x1b[0m\n`);
      await installCli(cli);
      terminalRef.current?.write(`\x1b[32m${cli} installed successfully!\x1b[0m\n`);
      toast.success(`${cli} installed successfully`);
    } catch (err) {
      const message = err instanceof Error ? err.message : `Failed to install ${cli}`;
      terminalRef.current?.write(`\x1b[31mError: ${message}\x1b[0m\n`);
      toast.error(message);
    }
  }, [installCli]);

  // Handle fullscreen toggle
  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;

    if (!isFullscreen) {
      if (containerRef.current.requestFullscreen) {
        containerRef.current.requestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  }, [isFullscreen]);

  // Listen for fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
      // Refit terminal after fullscreen change
      setTimeout(() => terminalRef.current?.fit(), 100);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  // Render error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8">
        <div className="p-4 bg-red-500/20 rounded-full mb-4">
          <AlertTriangle className="w-8 h-8 text-red-400" />
        </div>
        <h2 className="text-xl font-semibold text-white mb-2">Terminal Error</h2>
        <p className="text-slate-400 text-center mb-4 max-w-md">{error}</p>
        <button
          onClick={() => {
            clearError();
            refreshSessions();
          }}
          className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Retry</span>
        </button>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        'flex flex-col bg-slate-900',
        isFullscreen
          ? 'fixed inset-0 z-50'
          : 'h-[calc(100vh-3.5rem)]' // Full height minus top navigation
      )}
    >
      {/* Page Header (only shown when not fullscreen) */}
      {!isFullscreen && (
        <div className="toolbar bg-slate-800">
          <div className="inline-sm">
            <div className="p-2 bg-cyan-500/20 rounded-lg">
              <Terminal className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-white">CLI Terminal</h1>
              <p className="text-xs text-slate-400">
                Access AI CLI tools directly from the browser
              </p>
            </div>
          </div>

          {/* Connection Status */}
          <div className="inline-xs">
            <div className={cn(
              'w-2 h-2 rounded-full',
              isConnected ? 'bg-green-400 animate-pulse' : 'bg-slate-500'
            )} />
            <span className="text-sm text-slate-400">
              {isConnected ? 'Connected' : activeSession ? 'Connecting...' : 'Idle'}
            </span>
          </div>
        </div>
      )}

      {/* Info Banner (only shown when not fullscreen and no types) */}
      {!isFullscreen && types.length === 0 && (
        <div className="px-6 py-3 bg-slate-800/50 border-b border-slate-700">
          <div className="inline-sm">
            <Info className="w-4 h-4 text-sky-400 flex-shrink-0" />
            <p className="text-sm text-slate-300">
              Terminal types are being loaded. Make sure the backend terminal service is running.
            </p>
          </div>
        </div>
      )}

      {/* Terminal Toolbar */}
      <TerminalToolbar
        types={types}
        selectedType={selectedType}
        onTypeChange={setSelectedType}
        onCreateSession={handleCreateSession}
        onKillSession={handleKillSession}
        activeSession={activeSession}
        sessions={sessions}
        onSessionSelect={handleSessionSelect}
        loading={loading}
        isFullscreen={isFullscreen}
        onToggleFullscreen={toggleFullscreen}
        onInstallCli={handleInstallCli}
      />

      {/* Terminal Container */}
      <div className="flex-1 overflow-hidden">
        <TerminalEmulator
          ref={terminalRef}
          session={activeSession}
          onSessionExit={handleSessionExit}
          onSessionError={handleSessionError}
          onConnectionChange={handleConnectionChange}
          autoFocus={true}
          className="h-full"
        />
      </div>

      {/* Footer with Keyboard Shortcuts (only when not fullscreen) */}
      {!isFullscreen && (
        <div className="page-footer bg-slate-800 text-xs text-slate-500 inline-md flex-wrap">
          <span className="inline-xs">
            <kbd className="px-1.5 py-0.5 bg-slate-700 rounded text-slate-400 font-mono text-[10px]">Ctrl+C</kbd>
            <span>Interrupt</span>
          </span>
          <span className="inline-xs">
            <kbd className="px-1.5 py-0.5 bg-slate-700 rounded text-slate-400 font-mono text-[10px]">Ctrl+D</kbd>
            <span>EOF/Exit</span>
          </span>
          <span className="inline-xs">
            <kbd className="px-1.5 py-0.5 bg-slate-700 rounded text-slate-400 font-mono text-[10px]">F11</kbd>
            <span>Fullscreen</span>
          </span>
          <span className="inline-xs">
            <kbd className="px-1.5 py-0.5 bg-slate-700 rounded text-slate-400 font-mono text-[10px]">Ctrl+Shift+V</kbd>
            <span>Paste</span>
          </span>
        </div>
      )}
    </div>
  );
}
