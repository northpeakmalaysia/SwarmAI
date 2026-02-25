/**
 * SuperBrain Log List
 *
 * Displays a scrollable list of SuperBrain activity log entries.
 */

import React from 'react';
import {
  CheckCircle,
  XCircle,
  Clock,
  Zap,
  Bot,
  MessageSquare,
  Smartphone,
  Mail,
  Link2,
  Send,
} from 'lucide-react';
import { SuperBrainLogEntry } from '@/stores/superbrainLogStore';
import { formatDistanceToNow } from 'date-fns';

interface Props {
  logs: SuperBrainLogEntry[];
  selectedId: string | null;
  onSelect: (log: SuperBrainLogEntry) => void;
  isLoading: boolean;
}

const tierColors: Record<string, string> = {
  trivial: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  simple: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  moderate: 'bg-sky-500/20 text-sky-400 border-sky-500/30',
  complex: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  critical: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
};

const intentColors: Record<string, string> = {
  SKIP: 'text-gray-500',
  PASSIVE: 'text-amber-400',
  ACTIVE: 'text-emerald-400',
};

const platformIcons: Record<string, React.ReactNode> = {
  whatsapp: <Smartphone className="w-4 h-4 text-green-400" />,
  telegram: <Send className="w-4 h-4 text-blue-400" />,
  email: <Mail className="w-4 h-4 text-amber-400" />,
  webhook: <Link2 className="w-4 h-4 text-purple-400" />,
};

export const SuperBrainLogList: React.FC<Props> = ({
  logs,
  selectedId,
  onSelect,
  isLoading,
}) => {
  if (logs.length === 0 && !isLoading) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center">
        <Bot className="w-12 h-12 text-gray-600 mb-4" />
        <p className="text-gray-400">No SuperBrain activity yet</p>
        <p className="text-sm text-gray-500 mt-2">
          Logs will appear here when messages are processed
        </p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-slate-700/50">
      {logs.map((log) => (
        <LogEntry
          key={log.id}
          log={log}
          isSelected={selectedId === log.id}
          onSelect={() => onSelect(log)}
        />
      ))}

      {isLoading && (
        <div className="p-4 text-center text-gray-500">
          <div className="inline-flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-gray-500 border-t-transparent rounded-full animate-spin" />
            Loading more logs...
          </div>
        </div>
      )}
    </div>
  );
};

interface LogEntryProps {
  log: SuperBrainLogEntry;
  isSelected: boolean;
  onSelect: () => void;
}

const LogEntry: React.FC<LogEntryProps> = ({ log, isSelected, onSelect }) => {
  const tierClass = log.classification.tier
    ? tierColors[log.classification.tier]
    : 'bg-slate-700/50 text-gray-400';

  const intentClass = log.classification.intent
    ? intentColors[log.classification.intent]
    : 'text-gray-500';

  return (
    <div
      onClick={onSelect}
      className={`p-3 cursor-pointer transition-colors hover:bg-slate-800/50 ${
        isSelected ? 'bg-sky-500/10 border-l-2 border-l-sky-500' : ''
      }`}
    >
      {/* Header row */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {/* Status icon */}
          {log.result.success ? (
            <CheckCircle className="w-4 h-4 text-emerald-400" />
          ) : (
            <XCircle className="w-4 h-4 text-rose-400" />
          )}

          {/* Platform icon */}
          {platformIcons[log.message.platform] || (
            <MessageSquare className="w-4 h-4 text-gray-400" />
          )}

          {/* Intent badge */}
          {log.classification.intent && (
            <span className={`text-xs ${intentClass}`}>
              {log.classification.intent}
            </span>
          )}

          {/* Tier badge */}
          {log.classification.tier && (
            <span className={`px-2 py-0.5 text-xs rounded-full border ${tierClass}`}>
              {log.classification.tier}
            </span>
          )}
        </div>

        {/* Timestamp */}
        <span className="text-xs text-gray-500">
          {formatDistanceToNow(log.timestamp, { addSuffix: true })}
        </span>
      </div>

      {/* Message preview */}
      <div className="text-sm text-gray-300 truncate mb-2">
        <span className="font-medium text-gray-400">{log.message.sender}:</span>{' '}
        {log.message.contentPreview || '(no content)'}
      </div>

      {/* Footer row */}
      <div className="flex items-center gap-3 text-xs text-gray-500">
        {/* Provider */}
        {log.execution.providerUsed && (
          <span className="flex items-center gap-1">
            <Zap className="w-3 h-3" />
            {formatProvider(log.execution.providerUsed)}
          </span>
        )}

        {/* Duration */}
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {log.duration.total}ms
        </span>

        {/* Tools with status */}
        {log.tools.length > 0 && (
          <span className="flex items-center gap-1 flex-wrap">
            <span className="text-base leading-none">🔧</span>
            {log.tools.map((tool, idx) => (
              <span
                key={idx}
                className={`font-mono text-[10px] px-1 py-0.5 rounded ${
                  tool.result?.success
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'bg-rose-500/20 text-rose-400'
                }`}
              >
                {tool.name}
              </span>
            ))}
          </span>
        )}

        {/* Result type */}
        <span className="ml-auto text-gray-600">
          {formatResultType(log.result.type)}
        </span>
      </div>
    </div>
  );
};

function formatProvider(provider: string): string {
  const map: Record<string, string> = {
    'ollama': 'Ollama',
    'openrouter': 'OpenRouter',
    'openrouter-free': 'OR Free', // Legacy
    'openrouter-paid': 'OR Paid', // Legacy
    'cli-claude': 'Claude',
    'cli-gemini': 'Gemini',
    'cli-opencode': 'OpenCode',
  };
  return map[provider] || provider;
}

function formatResultType(type: string | null): string {
  if (!type) return '';
  return type.replace(/_/g, ' ');
}

export default SuperBrainLogList;
