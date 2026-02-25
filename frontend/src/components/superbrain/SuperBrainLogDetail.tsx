/**
 * SuperBrain Log Detail
 *
 * Displays detailed information about a selected log entry.
 */

import React from 'react';
import { formatDateTime } from '@/utils/dateFormat';
import {
  CheckCircle,
  XCircle,
  MessageSquare,
  Settings,
  Zap,
  Wrench,
  Clock,
  FileText,
  AlertTriangle,
} from 'lucide-react';
import { SuperBrainLogEntry } from '@/stores/superbrainLogStore';

interface Props {
  log: SuperBrainLogEntry;
}

export const SuperBrainLogDetail: React.FC<Props> = ({ log }) => {
  return (
    <div className="p-4 space-y-6 overflow-auto">
      {/* Header */}
      <div className="border-b border-slate-700 pb-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-semibold text-white">Log Details</h3>
          <span
            className={`px-3 py-1 rounded-full text-sm ${
              log.result.success
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
            }`}
          >
            {log.result.success ? 'Success' : 'Error'}
          </span>
        </div>
        <p className="text-sm text-gray-500">
          {formatDateTime(new Date(log.timestamp).toISOString())}
        </p>
        <p className="text-xs text-gray-600 font-mono mt-1">
          ID: {log.id}
        </p>
      </div>

      {/* Message Section */}
      <Section title="Message" icon={<MessageSquare className="w-4 h-4" />}>
        <InfoRow label="ID" value={log.message.id} mono />
        <InfoRow label="Platform" value={log.message.platform} />
        <InfoRow label="Sender" value={log.message.sender} />
        <InfoRow label="Content" value={log.message.contentPreview || '(empty)'} />
        {log.message.conversationId && (
          <InfoRow label="Conversation" value={log.message.conversationId} mono />
        )}
      </Section>

      {/* Classification Section */}
      <Section title="Classification" icon={<Settings className="w-4 h-4" />}>
        <div className="grid grid-cols-2 gap-3">
          <InfoBox
            label="Intent"
            value={log.classification.intent || 'N/A'}
            color={getIntentColor(log.classification.intent)}
          />
          <InfoBox
            label="Tier"
            value={log.classification.tier || 'N/A'}
            color={getTierColor(log.classification.tier)}
          />
        </div>
        {log.classification.confidence !== null && (
          <div className="mt-3">
            <span className="text-xs text-gray-500">Confidence:</span>
            <div className="flex items-center gap-2 mt-1">
              <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-sky-500 rounded-full"
                  style={{ width: `${(log.classification.confidence || 0) * 100}%` }}
                />
              </div>
              <span className="text-sm text-gray-400">
                {((log.classification.confidence || 0) * 100).toFixed(0)}%
              </span>
            </div>
          </div>
        )}
        {log.classification.reasons.length > 0 && (
          <div className="mt-3">
            <span className="text-xs text-gray-500">Reasons:</span>
            <ul className="list-disc list-inside text-sm text-gray-400 mt-1 space-y-0.5">
              {log.classification.reasons.map((reason, i) => (
                <li key={i}>{reason}</li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      {/* Execution Section */}
      <Section title="Execution" icon={<Zap className="w-4 h-4" />}>
        <InfoRow label="Provider" value={formatProvider(log.execution.providerUsed)} />
        <InfoRow label="Model" value={log.execution.model || 'N/A'} />

        {log.execution.providerChain.length > 0 && (
          <div className="mt-2">
            <span className="text-xs text-gray-500">Provider Chain:</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {log.execution.providerChain.map((p, i) => (
                <span
                  key={i}
                  className={`px-2 py-0.5 text-xs rounded ${
                    p === log.execution.providerUsed
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'bg-slate-700 text-gray-400'
                  }`}
                >
                  {formatProvider(p)}
                </span>
              ))}
            </div>
          </div>
        )}

        {log.execution.failedProviders.length > 0 && (
          <div className="mt-3 p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg">
            <div className="flex items-center gap-2 text-rose-400 text-sm font-medium mb-2">
              <AlertTriangle className="w-4 h-4" />
              Failed Providers
            </div>
            <ul className="space-y-1">
              {log.execution.failedProviders.map((fp, i) => (
                <li key={i} className="text-sm text-rose-300">
                  <span className="font-medium">{formatProvider(fp.provider)}:</span>{' '}
                  <span className="text-rose-400/80">{fp.error}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {log.execution.tokenUsage && (
          <div className="mt-3 grid grid-cols-3 gap-2">
            <TokenCard label="Input" value={log.execution.tokenUsage.input} />
            <TokenCard label="Output" value={log.execution.tokenUsage.output} />
            <TokenCard label="Total" value={log.execution.tokenUsage.total} />
          </div>
        )}
      </Section>

      {/* Tools Section */}
      {log.tools.length > 0 && (
        <Section title={`Tools (${log.tools.length})`} icon={<Wrench className="w-4 h-4" />}>
          <div className="space-y-3">
            {log.tools.map((tool, i) => (
              <ToolCard key={i} tool={tool} />
            ))}
          </div>
        </Section>
      )}

      {/* Timing Section */}
      <Section title="Timing" icon={<Clock className="w-4 h-4" />}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <TimingCard label="Total" value={log.duration.total} primary />
          <TimingCard label="Classification" value={log.duration.classification} />
          <TimingCard label="Provider Select" value={log.duration.providerSelection} />
          <TimingCard label="Execution" value={log.duration.execution} />
          <TimingCard label="Tools" value={log.duration.tools} />
        </div>
      </Section>

      {/* Result Section */}
      <Section title="Result" icon={<FileText className="w-4 h-4" />}>
        <InfoRow label="Type" value={log.result.type?.replace(/_/g, ' ') || 'N/A'} />

        {log.result.error && (
          <div className="mt-2 p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-sm text-rose-400">
            {log.result.error}
          </div>
        )}

        {log.result.responsePreview && (
          <div className="mt-2">
            <span className="text-xs text-gray-500">Response Preview:</span>
            <p className="mt-1 text-sm bg-slate-800 p-3 rounded-lg text-gray-300">
              {log.result.responsePreview}
            </p>
          </div>
        )}
      </Section>
    </div>
  );
};

// Helper Components

interface SectionProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}

const Section: React.FC<SectionProps> = ({ title, icon, children }) => (
  <div>
    <h4 className="flex items-center gap-2 font-medium text-gray-300 mb-3">
      {icon}
      {title}
    </h4>
    <div className="pl-6">{children}</div>
  </div>
);

interface InfoRowProps {
  label: string;
  value: string | null;
  mono?: boolean;
}

const InfoRow: React.FC<InfoRowProps> = ({ label, value, mono }) => (
  <div className="flex items-start gap-3 text-sm mb-2">
    <span className="text-gray-500 w-24 flex-shrink-0">{label}:</span>
    <span className={`text-gray-300 ${mono ? 'font-mono text-xs' : ''}`}>
      {value || 'N/A'}
    </span>
  </div>
);

interface InfoBoxProps {
  label: string;
  value: string;
  color?: string;
}

const InfoBox: React.FC<InfoBoxProps> = ({ label, value, color = 'bg-slate-700' }) => (
  <div className={`p-2 rounded ${color}`}>
    <div className="text-xs text-gray-400">{label}</div>
    <div className="font-medium text-white">{value}</div>
  </div>
);

interface TimingCardProps {
  label: string;
  value: number;
  primary?: boolean;
}

const TimingCard: React.FC<TimingCardProps> = ({ label, value, primary }) => (
  <div className={`p-2 rounded text-center ${primary ? 'bg-sky-500/20' : 'bg-slate-800'}`}>
    <div className="text-xs text-gray-500">{label}</div>
    <div className={`font-medium ${primary ? 'text-sky-400' : 'text-gray-300'}`}>
      {value}ms
    </div>
  </div>
);

interface TokenCardProps {
  label: string;
  value: number;
}

const TokenCard: React.FC<TokenCardProps> = ({ label, value }) => (
  <div className="p-2 bg-slate-800 rounded text-center">
    <div className="text-xs text-gray-500">{label}</div>
    <div className="font-medium text-gray-300">{value.toLocaleString()}</div>
  </div>
);

interface ToolCardProps {
  tool: {
    name: string;
    category?: string | null;
    parameters?: Record<string, unknown> | null;
    result?: {
      success: boolean;
      output?: unknown;
      error?: string | null;
    } | null;
    duration?: number | null;
  };
}

const ToolCard: React.FC<ToolCardProps> = ({ tool }) => {
  const [isExpanded, setIsExpanded] = React.useState(true);
  const isSuccess = tool.result?.success ?? true;
  const hasParams = tool.parameters && Object.keys(tool.parameters).length > 0;
  const hasOutput = tool.result?.output !== undefined && tool.result?.output !== null;

  // Format parameter value for display
  const formatParamValue = (value: unknown): string => {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'string') {
      // Truncate long strings
      return value.length > 100 ? `"${value.substring(0, 100)}..."` : `"${value}"`;
    }
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    return String(value);
  };

  return (
    <div className={`rounded-lg border ${
      isSuccess
        ? 'bg-slate-800/50 border-slate-700'
        : 'bg-rose-500/5 border-rose-500/30'
    }`}>
      {/* Tool Header */}
      <div
        className="flex items-center justify-between p-3 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <span className={`font-mono font-medium ${isSuccess ? 'text-white' : 'text-rose-300'}`}>
            {tool.name}
          </span>
          {tool.category && (
            <span className="px-1.5 py-0.5 text-[10px] bg-slate-700 text-gray-400 rounded">
              {tool.category}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`px-2 py-0.5 text-xs font-medium rounded ${
              isSuccess
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
            }`}
          >
            {isSuccess ? 'Success' : 'Error'}
          </span>
          {tool.duration !== null && tool.duration !== undefined && (
            <span className="text-xs text-gray-500">{tool.duration}ms</span>
          )}
          <span className="text-gray-500 text-xs">{isExpanded ? '▼' : '▶'}</span>
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-slate-700/50">
          {/* Parameters */}
          {hasParams ? (
            <div className="mt-2">
              <div className="text-xs text-gray-500 mb-1.5 font-medium">Parameters:</div>
              <div className="space-y-1">
                {Object.entries(tool.parameters!).map(([key, value]) => (
                  <div key={key} className="flex items-start gap-2 text-xs">
                    <span className="text-sky-400 font-mono shrink-0">{key}:</span>
                    <span className="text-gray-300 font-mono break-all">
                      {formatParamValue(value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-2 text-xs text-gray-500 italic">
              No parameters recorded (log created before update)
            </div>
          )}

          {/* Error */}
          {tool.result?.error && (
            <div className="mt-2 p-2 bg-rose-500/10 border border-rose-500/20 rounded">
              <div className="text-xs text-rose-400 font-medium mb-1">Error:</div>
              <p className="text-sm text-rose-300">{tool.result.error}</p>
            </div>
          )}

          {/* Output (success case) */}
          {isSuccess && hasOutput && (
            <div className="mt-2">
              <div className="text-xs text-gray-500 mb-1.5 font-medium">Output:</div>
              <pre className="text-xs bg-slate-900 p-2 rounded overflow-x-auto text-gray-400 max-h-32 overflow-y-auto">
                {typeof tool.result?.output === 'string'
                  ? tool.result.output
                  : JSON.stringify(tool.result?.output, null, 2)}
              </pre>
            </div>
          )}

          {/* No output case */}
          {isSuccess && !hasOutput && !tool.result?.error && (
            <div className="mt-2 text-xs text-gray-500 italic">
              No output recorded
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Helper Functions

function formatProvider(provider: string | null): string {
  if (!provider) return 'N/A';
  const map: Record<string, string> = {
    'ollama': 'Ollama',
    'openrouter': 'OpenRouter',
    'openrouter-free': 'OpenRouter Free', // Legacy
    'openrouter-paid': 'OpenRouter Paid', // Legacy
    'cli-claude': 'Claude CLI',
    'cli-gemini': 'Gemini CLI',
    'cli-opencode': 'OpenCode CLI',
  };
  return map[provider] || provider;
}

function getIntentColor(intent: string | null): string {
  const colors: Record<string, string> = {
    SKIP: 'bg-gray-500/20',
    PASSIVE: 'bg-amber-500/20',
    ACTIVE: 'bg-emerald-500/20',
  };
  return intent ? colors[intent] || 'bg-slate-700' : 'bg-slate-700';
}

function getTierColor(tier: string | null): string {
  const colors: Record<string, string> = {
    trivial: 'bg-gray-500/20',
    simple: 'bg-emerald-500/20',
    moderate: 'bg-sky-500/20',
    complex: 'bg-orange-500/20',
    critical: 'bg-rose-500/20',
  };
  return tier ? colors[tier] || 'bg-slate-700' : 'bg-slate-700';
}

export default SuperBrainLogDetail;
