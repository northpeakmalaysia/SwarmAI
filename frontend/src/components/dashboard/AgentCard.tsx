import { useState } from 'react';
import { MessageCircle, Users, Star, Clock, Mail, RefreshCw } from 'lucide-react';

export interface AgentCardData {
  id: string;
  name: string;
  platform: 'whatsapp' | 'telegram' | 'email' | 'slack' | 'other';
  contact: string;
  status: 'swarming' | 'idle' | 'offline';
  messageCount: number;
  chatCount: number;
  skills: string[];
  reputationScore: number;
  lastSeen?: string;
  // Platform info for sync functionality
  platformAccountId?: string | null;
  platformStatus?: 'connected' | 'disconnected' | 'error' | 'qr_pending' | null;
}

interface AgentCardProps {
  agent: AgentCardData;
  onReconnect?: () => void;
  onSync?: () => Promise<void>;
}

const platformConfig = {
  whatsapp: {
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
      </svg>
    ),
    bgColor: 'bg-emerald-500/20',
    textColor: 'text-emerald-400',
    label: 'WhatsApp',
  },
  telegram: {
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
      </svg>
    ),
    bgColor: 'bg-sky-500/20',
    textColor: 'text-sky-400',
    label: 'Telegram Bot',
  },
  email: {
    icon: <Mail className="w-5 h-5" />,
    bgColor: 'bg-rose-500/20',
    textColor: 'text-rose-400',
    label: 'Email',
  },
  slack: {
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zm10.124 2.521a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.52 2.521h-2.522V8.834zm-1.271 0a2.528 2.528 0 0 1-2.521 2.521 2.528 2.528 0 0 1-2.521-2.521V2.522A2.528 2.528 0 0 1 15.166 0a2.528 2.528 0 0 1 2.521 2.522v6.312zm-2.521 10.124a2.528 2.528 0 0 1 2.521 2.522A2.528 2.528 0 0 1 15.166 24a2.528 2.528 0 0 1-2.521-2.52v-2.522h2.521zm0-1.271a2.528 2.528 0 0 1-2.521-2.521 2.528 2.528 0 0 1 2.521-2.521h6.312A2.528 2.528 0 0 1 24 15.165a2.528 2.528 0 0 1-2.52 2.521h-6.314z"/>
      </svg>
    ),
    bgColor: 'bg-purple-500/20',
    textColor: 'text-purple-400',
    label: 'Slack',
  },
  other: {
    icon: <MessageCircle className="w-5 h-5" />,
    bgColor: 'bg-gray-500/20',
    textColor: 'text-gray-400',
    label: 'Channel',
  },
};

const statusConfig = {
  swarming: {
    dotColor: 'bg-emerald-400',
    textColor: 'text-emerald-400',
    label: 'Swarming',
  },
  idle: {
    dotColor: 'bg-amber-400',
    textColor: 'text-amber-400',
    label: 'Idle',
  },
  offline: {
    dotColor: 'bg-gray-400',
    textColor: 'text-gray-400',
    label: 'Offline',
  },
};

const skillColors = [
  'bg-blue-500/20 text-blue-400',
  'bg-purple-500/20 text-purple-400',
  'bg-emerald-500/20 text-emerald-400',
  'bg-orange-500/20 text-orange-400',
  'bg-rose-500/20 text-rose-400',
  'bg-indigo-500/20 text-indigo-400',
];

export function AgentCard({ agent, onReconnect, onSync }: AgentCardProps) {
  const [isSyncing, setIsSyncing] = useState(false);
  const platform = platformConfig[agent.platform];
  const status = statusConfig[agent.status];
  const isOffline = agent.status === 'offline';
  const canSync = agent.platformAccountId && agent.platformStatus === 'connected';

  const handleSync = async () => {
    if (!onSync || isSyncing) return;
    setIsSyncing(true);
    try {
      await onSync();
    } finally {
      setIsSyncing(false);
    }
  };

  // Dynamic glow based on status
  const glowClass = agent.status === 'swarming'
    ? 'hover:shadow-neu-pressed-glow-emerald'
    : agent.status === 'idle'
    ? 'hover:shadow-neu-pressed-glow-amber'
    : 'hover:shadow-neu-pressed-glow';

  return (
    <div
      className={`bg-swarm-dark rounded-2xl p-4 border border-swarm-border/30 shadow-neu-pressed hover:border-swarm-primary/30 transition-all duration-300 ${glowClass} ${
        isOffline ? 'opacity-60' : ''
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full ${isOffline ? 'bg-gray-500/20' : platform.bgColor} flex items-center justify-center ${isOffline ? 'text-gray-400' : platform.textColor}`}>
            {platform.icon}
          </div>
          <div>
            <div className="font-medium text-white">{agent.name}</div>
            <div className="text-xs text-gray-400">
              {platform.label} • {agent.contact}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 ${status.dotColor} rounded-full ${agent.status === 'swarming' ? 'animate-pulse' : ''}`}></span>
          <span className={`text-xs ${status.textColor}`}>{status.label}</span>
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 text-sm text-gray-400 mb-3">
        <span className="flex items-center gap-1">
          <MessageCircle className="w-3.5 h-3.5" />
          {agent.messageCount} msgs
        </span>
        {isOffline && agent.lastSeen ? (
          <span className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            Last seen {agent.lastSeen}
          </span>
        ) : (
          <span className="flex items-center gap-1">
            <Users className="w-3.5 h-3.5" />
            {agent.chatCount} {agent.platform === 'email' ? 'threads' : 'chats'}
          </span>
        )}
      </div>

      {/* Footer */}
      {isOffline ? (
        <button
          onClick={onReconnect}
          className="w-full py-2 bg-swarm-dark hover:bg-swarm-border rounded-lg text-sm transition-colors text-gray-300"
        >
          Reconnect
        </button>
      ) : (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            {agent.skills.slice(0, 2).map((skill, index) => (
              <span
                key={skill}
                className={`px-2 py-0.5 ${skillColors[index % skillColors.length]} text-xs rounded-full`}
              >
                {skill}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {/* Sync button - only show if platform is connected */}
            {canSync && onSync && (
              <button
                type="button"
                onClick={handleSync}
                disabled={isSyncing}
                className="flex items-center gap-1 px-2 py-1 bg-swarm-dark hover:bg-swarm-border rounded-lg text-xs transition-colors text-gray-300 disabled:opacity-50"
                title="Sync contacts and messages"
              >
                <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>Sync</span>
              </button>
            )}
            <div className="flex items-center gap-1 text-amber-400">
              <Star className="w-3.5 h-3.5 fill-current" />
              <span className="text-sm font-medium">{agent.reputationScore}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
