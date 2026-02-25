import React from 'react';
import {
  Plus,
  X,
  Terminal,
  Maximize2,
  Minimize2,
  Download,
  RefreshCw,
  Loader2
} from 'lucide-react';
import type { TerminalType, TerminalSession } from '../../hooks/useTerminal';
import { cn } from '../../lib/utils';

/**
 * TerminalToolbar Props
 */
interface TerminalToolbarProps {
  /** Available terminal types */
  types: TerminalType[];
  /** Currently selected terminal type */
  selectedType: string;
  /** Callback when terminal type changes */
  onTypeChange: (type: string) => void;
  /** Callback to create a new session */
  onCreateSession: () => void;
  /** Callback to kill the current session */
  onKillSession: () => void;
  /** Current active session */
  activeSession: TerminalSession | null;
  /** All user sessions */
  sessions: TerminalSession[];
  /** Callback when a session tab is clicked */
  onSessionSelect: (session: TerminalSession) => void;
  /** Whether an operation is loading */
  loading?: boolean;
  /** Whether fullscreen mode is active */
  isFullscreen?: boolean;
  /** Callback to toggle fullscreen */
  onToggleFullscreen?: () => void;
  /** Callback to install a CLI */
  onInstallCli?: (cli: string) => void;
  /** Optional CSS class */
  className?: string;
}

/**
 * TerminalToolbar Component
 *
 * Provides controls for managing terminal sessions including:
 * - Terminal type selector
 * - New session button
 * - Session tabs
 * - Kill session button
 * - Fullscreen toggle
 */
export const TerminalToolbar: React.FC<TerminalToolbarProps> = ({
  types,
  selectedType,
  onTypeChange,
  onCreateSession,
  onKillSession,
  activeSession,
  sessions,
  onSessionSelect,
  loading = false,
  isFullscreen = false,
  onToggleFullscreen,
  onInstallCli,
  className
}) => {
  // Get installed types for the dropdown
  const installedTypes = types.filter(t => t.installed);
  const uninstalledTypes = types.filter(t => !t.installed && t.type !== 'bash');

  return (
    <div className={cn(
      'flex items-center gap-3 px-6 py-2 bg-slate-800/80 border-b border-slate-700',
      className
    )}>
      {/* Terminal Type Selector */}
      <div className="flex items-center gap-2">
        <Terminal className="w-4 h-4 text-slate-400" />
        <select
          value={selectedType}
          onChange={(e) => onTypeChange(e.target.value)}
          disabled={!!activeSession || loading}
          className={cn(
            'px-3 py-1.5 bg-slate-700 text-white text-sm rounded border border-slate-600',
            'focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'transition-colors duration-200'
          )}
        >
          {installedTypes.length > 0 ? (
            installedTypes.map((type) => (
              <option key={type.type} value={type.type}>
                {type.name}
              </option>
            ))
          ) : (
            <option value="bash">Bash (Default)</option>
          )}
        </select>
      </div>

      {/* New Session / Kill Session Button */}
      {!activeSession ? (
        <button
          onClick={onCreateSession}
          disabled={loading}
          className={cn(
            'flex items-center gap-2 px-4 py-1.5 bg-cyan-600 hover:bg-cyan-700',
            'text-white text-sm font-medium rounded',
            'transition-colors duration-200',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Plus className="w-4 h-4" />
          )}
          <span>New Session</span>
        </button>
      ) : (
        <button
          onClick={onKillSession}
          disabled={loading}
          className={cn(
            'flex items-center gap-2 px-4 py-1.5 bg-red-600 hover:bg-red-700',
            'text-white text-sm font-medium rounded',
            'transition-colors duration-200',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <X className="w-4 h-4" />
          )}
          <span>Kill Session</span>
        </button>
      )}

      {/* Separator */}
      <div className="w-px h-6 bg-slate-600" />

      {/* Session Tabs */}
      <div className="flex-1 flex items-center gap-1 overflow-x-auto">
        {sessions.length === 0 ? (
          <span className="text-sm text-slate-500 px-2">No active sessions</span>
        ) : (
          sessions.map((session) => (
            <button
              key={session.id}
              onClick={() => onSessionSelect(session)}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded text-sm whitespace-nowrap',
                'transition-colors duration-200',
                activeSession?.id === session.id
                  ? 'bg-cyan-600/20 text-cyan-400 border border-cyan-500/50'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600 border border-transparent'
              )}
            >
              <Terminal className="w-3 h-3" />
              <span>{session.type}</span>
              <span className="text-xs text-slate-500">
                ({session.id.slice(0, 6)})
              </span>
            </button>
          ))
        )}
      </div>

      {/* Install CLI Buttons (only show when not in session) */}
      {!activeSession && uninstalledTypes.length > 0 && onInstallCli && (
        <>
          <div className="w-px h-6 bg-slate-600" />
          <div className="flex items-center gap-2">
            {uninstalledTypes.slice(0, 2).map((type) => (
              <button
                key={type.type}
                onClick={() => onInstallCli(type.type.replace('-bypass', ''))}
                disabled={loading}
                className={cn(
                  'flex items-center gap-1 px-2 py-1 bg-slate-700 hover:bg-slate-600',
                  'text-slate-300 text-xs rounded',
                  'transition-colors duration-200',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
                title={`Install ${type.name}`}
              >
                <Download className="w-3 h-3" />
                <span>
                  {type.name.replace(' CLI', '').replace(' (Skip Permissions)', '')}
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      {/* Right-side controls */}
      <div className="flex items-center gap-2 ml-auto">
        {/* Session Info */}
        {activeSession && (
          <span className="text-xs text-slate-400">
            {activeSession.type} ({activeSession.cols}x{activeSession.rows})
          </span>
        )}

        {/* Fullscreen Toggle */}
        {onToggleFullscreen && (
          <button
            onClick={onToggleFullscreen}
            className={cn(
              'p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded',
              'transition-colors duration-200'
            )}
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? (
              <Minimize2 className="w-4 h-4" />
            ) : (
              <Maximize2 className="w-4 h-4" />
            )}
          </button>
        )}
      </div>
    </div>
  );
};

export default TerminalToolbar;
