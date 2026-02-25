import React from 'react';
import {
  MessageSquare,
  Send,
  Mail,
  Bot,
  Play,
  Pause,
  Settings,
  Trash2,
  Star,
  MessageCircle,
  Clock,
  Webhook,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { Card, CardFooter } from '../common/Card';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { AgentStatusBadge, AgentStatus } from './AgentStatusBadge';
import { Platform, platformMeta } from './PlatformSetupWizard';
import { formatRelativeTime } from '@/utils/dateFormat';

/**
 * Extended Agent interface for UI display
 */
export interface AgentData {
  id: string;
  name: string;
  description?: string;
  platform?: Platform;
  phoneNumber?: string;
  email?: string;
  telegramUsername?: string;
  status: AgentStatus;
  skills: string[];
  reputation?: {
    score: number; // 0-100
    totalInteractions: number;
  };
  unreadCount?: number;
  lastActiveAt?: string;
  model?: string;
  avatar?: string;
}

export interface AgentCardProps {
  /** Agent data to display */
  agent: AgentData;
  /** Called when start button is clicked */
  onStart?: () => void;
  /** Called when stop button is clicked */
  onStop?: () => void;
  /** Called when configure button is clicked */
  onConfigure?: () => void;
  /** Called when delete button is clicked */
  onDelete?: () => void;
  /** Called when card is clicked */
  onClick?: () => void;
  /** Whether actions are disabled */
  disabled?: boolean;
  /** Show loading state */
  loading?: boolean;
  /** Additional className */
  className?: string;
}

/**
 * Platform icon component
 */
const PlatformIcon: React.FC<{ platform?: Platform; className?: string }> = ({
  platform,
  className,
}) => {
  if (!platform) {
    return <Bot className={className} />;
  }

  const iconProps = { className };

  switch (platform) {
    case 'whatsapp':
    case 'whatsapp-business':
      return <MessageSquare {...iconProps} />;
    case 'telegram-bot':
    case 'telegram-user':
      return <Send {...iconProps} />;
    case 'email':
      return <Mail {...iconProps} />;
    case 'http-api':
      return <Webhook {...iconProps} />;
    // Note: 'agentic-ai' removed - Agentic AI agents are created in the Agentic module
    default:
      return <Bot {...iconProps} />;
  }
};

/**
 * Platform background colors
 */
const platformBgColors: Record<Platform | 'default', string> = {
  whatsapp: 'bg-emerald-500/20',
  'whatsapp-business': 'bg-emerald-500/20',
  'telegram-bot': 'bg-sky-500/20',
  'telegram-user': 'bg-sky-500/20',
  email: 'bg-rose-500/20',
  'http-api': 'bg-violet-500/20',
  default: 'bg-gradient-to-br from-sky-500/20 to-violet-500/20',
};

/**
 * Platform icon colors
 */
const platformIconColors: Record<Platform | 'default', string> = {
  whatsapp: 'text-emerald-400',
  'whatsapp-business': 'text-emerald-400',
  'telegram-bot': 'text-sky-400',
  'telegram-user': 'text-sky-400',
  email: 'text-rose-400',
  'http-api': 'text-violet-400',
  default: 'text-sky-400',
};

/**
 * Platform glow colors for pressed neumorphism
 */
const platformGlowColors: Record<Platform | 'default', 'default' | 'emerald' | 'amber' | 'purple' | 'rose' | 'sky'> = {
  whatsapp: 'emerald',
  'whatsapp-business': 'emerald',
  'telegram-bot': 'sky',
  'telegram-user': 'sky',
  email: 'rose',
  'http-api': 'purple',
  default: 'default',
};

/**
 * Format relative time - delegates to shared utility with timezone support
 */
const formatLastActive = (dateString?: string): string => {
  if (!dateString) return 'Never';
  return formatRelativeTime(dateString);
};

/**
 * Star rating display
 */
const ReputationStars: React.FC<{ score: number }> = ({ score }) => {
  // Convert score (0-100) to stars (0-5)
  const starCount = Math.round((score / 100) * 5);

  return (
    <div className="flex items-center gap-0.5" title={`Reputation: ${score}%`}>
      {[...Array(5)].map((_, i) => (
        <Star
          key={i}
          className={cn(
            'w-3.5 h-3.5',
            i < starCount ? 'text-amber-400 fill-amber-400' : 'text-gray-600'
          )}
        />
      ))}
    </div>
  );
};

/**
 * AgentCard - Displays an agent's information in a card format
 *
 * @example
 * ```tsx
 * <AgentCard
 *   agent={{
 *     id: '1',
 *     name: 'Support Agent',
 *     platform: 'whatsapp',
 *     status: 'online',
 *     skills: ['support', 'sales'],
 *     reputation: { score: 85, totalInteractions: 150 },
 *   }}
 *   onStart={() => activateAgent(agent.id)}
 *   onStop={() => deactivateAgent(agent.id)}
 *   onConfigure={() => openConfigModal(agent)}
 *   onDelete={() => deleteAgent(agent.id)}
 * />
 * ```
 */
export const AgentCard: React.FC<AgentCardProps> = ({
  agent,
  onStart,
  onStop,
  onConfigure,
  onDelete,
  onClick,
  disabled = false,
  loading = false,
  className,
}) => {
  const platform = agent.platform || 'default';
  const bgColor = platformBgColors[platform] || platformBgColors.default;
  const iconColor = platformIconColors[platform] || platformIconColors.default;
  const glowColor = platformGlowColors[platform] || platformGlowColors.default;

  const isActive = ['online', 'swarming', 'idle', 'busy', 'processing'].includes(agent.status);

  // Get contact info
  const contactInfo = agent.phoneNumber || agent.email || agent.telegramUsername;

  return (
    <Card
      variant="pressed-glow"
      glowColor={glowColor}
      noPadding
      onClick={onClick}
      className={cn(
        'relative overflow-hidden cursor-pointer',
        loading && 'animate-pulse',
        className
      )}
    >
      {/* Unread count badge */}
      {agent.unreadCount && agent.unreadCount > 0 && (
        <div className="absolute top-3 right-3 z-10">
          <span className="flex items-center gap-1 px-2 py-0.5 bg-red-500 text-white text-xs font-medium rounded-full">
            <MessageCircle className="w-3 h-3" />
            {agent.unreadCount > 99 ? '99+' : agent.unreadCount}
          </span>
        </div>
      )}

      <div className="p-4">
        {/* Header with platform icon and status */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            {/* Platform icon */}
            <div
              className={cn(
                'w-10 h-10 rounded-lg flex items-center justify-center',
                bgColor
              )}
            >
              <PlatformIcon platform={agent.platform} className={cn('w-5 h-5', iconColor)} />
            </div>

            {/* Name and contact */}
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-white truncate">{agent.name}</h3>
              {contactInfo && (
                <p className="text-sm text-gray-400 truncate">{contactInfo}</p>
              )}
            </div>
          </div>

          {/* Status badge */}
          <AgentStatusBadge status={agent.status} size="sm" />
        </div>

        {/* Description */}
        {agent.description && (
          <p className="text-sm text-gray-400 mb-3 line-clamp-2">{agent.description}</p>
        )}

        {/* Skills */}
        {agent.skills && agent.skills.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {agent.skills.slice(0, 4).map((skill) => (
              <Badge key={skill} size="sm" variant="default">
                {skill}
              </Badge>
            ))}
            {agent.skills.length > 4 && (
              <Badge size="sm" variant="default">
                +{agent.skills.length - 4}
              </Badge>
            )}
          </div>
        )}

        {/* Reputation and last active */}
        <div className="flex items-center justify-between text-sm">
          {agent.reputation ? (
            <div className="flex items-center gap-2">
              <ReputationStars score={agent.reputation.score} />
              <span className="text-gray-500 text-xs">
                ({agent.reputation.totalInteractions})
              </span>
            </div>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-1 text-gray-500">
            <Clock className="w-3.5 h-3.5" />
            <span className="text-xs">{formatLastActive(agent.lastActiveAt)}</span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <CardFooter className="bg-swarm-darker/50 px-4 py-3 mt-0 border-t border-swarm-border/20">
        <div className="flex items-center gap-2 w-full">
          {/* Start/Stop button */}
          <Button
            size="sm"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              isActive ? onStop?.() : onStart?.();
            }}
            disabled={disabled}
            title={isActive ? 'Stop agent' : 'Start agent'}
            className={cn(
              isActive
                ? 'text-gray-400 hover:text-amber-400 hover:bg-amber-500/10'
                : 'text-emerald-400 hover:bg-emerald-500/10'
            )}
          >
            {isActive ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </Button>

          {/* Configure button */}
          <Button
            size="sm"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              onConfigure?.();
            }}
            disabled={disabled}
            title="Configure agent"
          >
            <Settings className="w-4 h-4" />
          </Button>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Delete button */}
          <Button
            size="sm"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              onDelete?.();
            }}
            disabled={disabled}
            title="Delete agent"
            className="text-gray-400 hover:text-red-400 hover:bg-red-500/10"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
};

// Export helper components and types
export { PlatformIcon, ReputationStars, formatLastActive };
export { platformBgColors, platformIconColors, platformGlowColors };

AgentCard.displayName = 'AgentCard';

export default AgentCard;
