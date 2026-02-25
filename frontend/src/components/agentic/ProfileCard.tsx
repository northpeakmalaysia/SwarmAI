import React from 'react';
import {
  Bot,
  Settings,
  Eye,
  UserPlus,
  Clock,
  Users,
  GitBranch,
  Gauge,
  Power,
  Trash2,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { Card, CardFooter } from '../common/Card';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import type { AgenticProfile } from '../../stores/agenticStore';
import { formatRelativeTime, formatDate as formatDateUtil } from '../../utils/dateFormat';

/**
 * Status badge configuration
 */
const statusConfig: Record<AgenticProfile['status'], { variant: 'success' | 'warning' | 'default'; label: string }> = {
  active: { variant: 'success', label: 'Active' },
  inactive: { variant: 'default', label: 'Inactive' },
  paused: { variant: 'warning', label: 'Paused' },
  deleted: { variant: 'default', label: 'Deleted' },
  terminated: { variant: 'default', label: 'Terminated' },
};

/**
 * Autonomy level color mapping
 */
const getAutonomyColor = (level: 'supervised' | 'semi-autonomous' | 'autonomous'): string => {
  if (level === 'supervised') return 'text-emerald-400';
  if (level === 'semi-autonomous') return 'text-amber-400';
  return 'text-red-400';
};

const getAutonomyLabel = (level: 'supervised' | 'semi-autonomous' | 'autonomous'): string => {
  if (level === 'supervised') return 'Supervised';
  if (level === 'semi-autonomous') return 'Semi-Autonomous';
  return 'Autonomous';
};

/**
 * Format relative time
 */
const formatUpdatedAt = (dateString?: string): string => {
  if (!dateString) return 'Never';
  return formatRelativeTime(dateString);
};

export interface ProfileCardProps {
  /** Agentic profile data to display */
  profile: AgenticProfile;
  /** Called when edit button is clicked */
  onEdit?: () => void;
  /** Called when view details button is clicked */
  onViewDetails?: () => void;
  /** Called when create sub-agent button is clicked */
  onCreateSubAgent?: () => void;
  /** Called when activate/deactivate toggle is clicked */
  onToggleStatus?: () => void;
  /** Called when delete button is clicked */
  onDelete?: () => void;
  /** Called when card is clicked (select) */
  onClick?: () => void;
  /** Whether this card is selected */
  isSelected?: boolean;
  /** Whether actions are disabled */
  disabled?: boolean;
  /** Show loading state */
  loading?: boolean;
  /** Additional className */
  className?: string;
}

/**
 * ProfileCard - Displays an agentic profile in a card format
 *
 * @example
 * ```tsx
 * <ProfileCard
 *   profile={{
 *     id: '1',
 *     name: 'Customer Support Lead',
 *     description: 'Handles tier 1 support',
 *     autonomyLevel: 5,
 *     hierarchyLevel: 0,
 *     status: 'active',
 *     ...
 *   }}
 *   onEdit={() => openEditModal(profile)}
 *   onViewDetails={() => selectProfile(profile)}
 *   onCreateSubAgent={() => openCreateSubAgentModal(profile)}
 * />
 * ```
 */
export const ProfileCard: React.FC<ProfileCardProps> = ({
  profile,
  onEdit,
  onViewDetails,
  onCreateSubAgent,
  onToggleStatus,
  onDelete,
  onClick,
  isSelected = false,
  disabled = false,
  loading = false,
  className,
}) => {
  const status = statusConfig[profile.status] || statusConfig.active;
  const autonomyColor = getAutonomyColor(profile.autonomyLevel);
  const autonomyLabel = getAutonomyLabel(profile.autonomyLevel);

  return (
    <Card
      variant="pressed-glow"
      glowColor={isSelected ? 'sky' : 'default'}
      noPadding
      onClick={onClick}
      className={cn(
        'relative overflow-hidden cursor-pointer',
        loading && 'animate-pulse',
        isSelected && 'ring-2 ring-sky-500/50',
        className
      )}
    >
      <div className="p-4">
        {/* Header with icon and status */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            {/* Profile icon */}
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-purple-500/20">
              <Bot className="w-5 h-5 text-purple-400" />
            </div>

            {/* Name and description */}
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-white truncate">{profile.name}</h3>
              {profile.description && (
                <p className="text-sm text-gray-400 truncate">{profile.description}</p>
              )}
            </div>
          </div>

          {/* Status badge */}
          <Badge
            variant={status.variant}
            dot
            pulse={profile.status === 'active'}
          >
            {status.label}
          </Badge>
        </div>

        {/* Profile metrics */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          {/* Autonomy Level */}
          <div className="flex items-center gap-2 text-sm">
            <Gauge className={cn('w-4 h-4', autonomyColor)} />
            <span className="text-gray-400">Autonomy:</span>
            <span className={cn('font-medium', autonomyColor)}>
              {autonomyLabel}
            </span>
          </div>

          {/* Hierarchy Level */}
          <div className="flex items-center gap-2 text-sm">
            <GitBranch className="w-4 h-4 text-sky-400" />
            <span className="text-gray-400">Level:</span>
            <span className="font-medium text-sky-400">
              {profile.hierarchyLevel === 0 ? 'Root' : `L${profile.hierarchyLevel}`}
            </span>
          </div>
        </div>

        {/* Parent info if sub-agent */}
        {profile.parentProfileId && (
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-3">
            <Users className="w-4 h-4" />
            <span>Sub-agent of parent profile</span>
          </div>
        )}

        {/* Updated time */}
        <div className="flex items-center justify-end text-sm">
          <div className="flex items-center gap-1 text-gray-500">
            <Clock className="w-3.5 h-3.5" />
            <span className="text-xs">{formatUpdatedAt(profile.updatedAt)}</span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <CardFooter className="bg-swarm-darker/50 px-4 py-3 mt-0 border-t border-swarm-border/20">
        <div className="flex items-center gap-2 w-full">
          {/* View Details button */}
          <Button
            size="sm"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              onViewDetails?.();
            }}
            disabled={disabled}
            title="View details"
            className="text-sky-400 hover:bg-sky-500/10"
          >
            <Eye className="w-4 h-4" />
          </Button>

          {/* Edit button */}
          <Button
            size="sm"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              onEdit?.();
            }}
            disabled={disabled}
            title="Edit profile"
          >
            <Settings className="w-4 h-4" />
          </Button>

          {/* Activate/Deactivate toggle */}
          <Button
            size="sm"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              onToggleStatus?.();
            }}
            disabled={disabled}
            title={profile.status === 'active' ? 'Deactivate agent' : 'Activate agent'}
            className={cn(
              profile.status === 'active'
                ? 'text-emerald-400 hover:text-red-400 hover:bg-red-500/10'
                : 'text-gray-500 hover:text-emerald-400 hover:bg-emerald-500/10'
            )}
          >
            <Power className="w-4 h-4" />
          </Button>

          {/* Delete button */}
          {onDelete && (
            <Button
              size="sm"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              disabled={disabled}
              title="Delete profile"
              className="text-gray-500 hover:text-red-400 hover:bg-red-500/10"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Create Sub-agent button */}
          <Button
            size="sm"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              onCreateSubAgent?.();
            }}
            disabled={disabled || profile.status !== 'active'}
            title="Create sub-agent"
            className="text-purple-400 hover:text-purple-300 hover:bg-purple-500/10"
          >
            <UserPlus className="w-4 h-4" />
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
};

ProfileCard.displayName = 'ProfileCard';

export default ProfileCard;
