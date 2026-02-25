import React, { useEffect, useState } from 'react';
import {
  Bot,
  Settings,
  Users,
  GitBranch,
  Gauge,
  Clock,
  Brain,
  Activity,
  ChevronRight,
  Edit,
  X,
  Target,
  Calendar,
  Sparkles,
  Route,
  UserCog,
  ListChecks,
  Monitor,
  Shield,
  FileText,
  DollarSign,
  BellRing,
  Zap,
  GraduationCap,
  Building2,
  MessageSquareShare,
  Heart,
  BarChart3,
  History,
  MessageSquare,
  MonitorSmartphone,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { Tabs } from '../common/Tabs';
import { useAgenticStore, AgenticProfile } from '../../stores/agenticStore';
import TeamMembersList from './TeamMembersList';
import ApprovalQueue from './ApprovalQueue';
import GoalsPanel from './GoalsPanel';
import MemoryPanel from './MemoryPanel';
import SchedulesPanel from './SchedulesPanel';
import SkillsPanel from './SkillsPanel';
import AIRoutingPanel from './AIRoutingPanel';
import JobSchedulerPanel from './JobSchedulerPanel';
import MasterContactPanel from './MasterContactPanel';
import HierarchyTreeView from './HierarchyTreeView';
import TaskTrackingPanel from './TaskTrackingPanel';
import PlatformMonitoringPanel from './PlatformMonitoringPanel';
import ContactScopePanel from './ContactScopePanel';
import ActivityLogPanel from './ActivityLogPanel';
import CostTrackingPanel from './CostTrackingPanel';
import NotificationsPanel from './NotificationsPanel';
import SelfPromptingPanel from './SelfPromptingPanel';
import SelfLearningPanel from './SelfLearningPanel';
import BackgroundInfoPanel from './BackgroundInfoPanel';
import AuditLogPanel from './AuditLogPanel';
import PersonalityPanel from './PersonalityPanel';
import ExecutionMonitor from './ExecutionMonitor';
import ReasoningTimeline from './ReasoningTimeline';
import RuntimeControlPanel from './RuntimeControlPanel';
import ConversationsPanel from './ConversationsPanel';
import MetricsDashboard from './MetricsDashboard';
import ExecutionHistoryPanel from './ExecutionHistoryPanel';
import LocalAgentsTabPanel from './LocalAgentsTabPanel';
import { useAgenticMonitor } from '../../hooks/useAgenticMonitor';
import { formatDateTime } from '@/utils/dateFormat';

export interface ProfileDetailPanelProps {
  /** Profile to display */
  profile: AgenticProfile;
  /** Callback when edit button is clicked */
  onEdit?: () => void;
  /** Callback when close button is clicked */
  onClose?: () => void;
  /** Additional className */
  className?: string;
}

/**
 * Status badge configuration
 */
const statusConfig: Record<string, { variant: 'success' | 'warning' | 'default'; label: string }> = {
  active: { variant: 'success', label: 'Active' },
  paused: { variant: 'warning', label: 'Paused' },
  deleted: { variant: 'default', label: 'Deleted' },
  inactive: { variant: 'default', label: 'Inactive' },
};

// Get status with fallback
const getStatus = (status: string) => statusConfig[status] || { variant: 'default' as const, label: status || 'Unknown' };

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
 * Hierarchy tree item component
 */
const HierarchyTreeItem: React.FC<{
  profile: AgenticProfile;
  isCurrent: boolean;
  depth: number;
}> = ({ profile, isCurrent, depth }) => {
  const status = getStatus(profile.status);

  return (
    <div
      className={cn(
        'flex items-center gap-2 p-2 rounded-lg',
        isCurrent ? 'bg-sky-500/20 border border-sky-500/30' : 'hover:bg-swarm-dark/50'
      )}
      style={{ marginLeft: `${depth * 20}px` }}
    >
      <Bot className={cn('w-4 h-4', isCurrent ? 'text-sky-400' : 'text-gray-400')} />
      <span className={cn('font-medium', isCurrent ? 'text-white' : 'text-gray-300')}>
        {profile.name}
      </span>
      <Badge variant={status.variant} size="sm" dot>
        {status.label}
      </Badge>
    </div>
  );
};

/**
 * ProfileDetailPanel - Shows full details of an agentic profile
 *
 * @example
 * ```tsx
 * <ProfileDetailPanel
 *   profile={selectedProfile}
 *   onEdit={() => openEditModal(profile)}
 *   onClose={() => setSelectedProfile(null)}
 * />
 * ```
 */
export const ProfileDetailPanel: React.FC<ProfileDetailPanelProps> = ({
  profile,
  onEdit,
  onClose,
  className,
}) => {
  const {
    fetchHierarchy,
    fetchTeamMembers,
    fetchApprovals,
    fetchMemories,
    teamMembers,
    approvals,
    memories,
    isLoadingProfiles,
  } = useAgenticStore();

  const [hierarchy, setHierarchy] = useState<AgenticProfile[]>([]);
  const [activeTab, setActiveTab] = useState('overview');
  const [platformAccounts, setPlatformAccounts] = useState<Array<{ id: string; name: string; platform: string }>>([]);

  // Subscribe to real-time agentic execution events
  useAgenticMonitor(profile.id);

  const status = getStatus(profile.status);
  const autonomyColor = getAutonomyColor(profile.autonomyLevel);
  const autonomyLabel = getAutonomyLabel(profile.autonomyLevel);

  // Fetch data when profile changes
  useEffect(() => {
    if (profile.id) {
      fetchHierarchy(profile.id).then(setHierarchy);
      fetchTeamMembers(profile.id);
      fetchApprovals(profile.id);
      fetchMemories(profile.id);
    }
  }, [profile.id, fetchHierarchy, fetchTeamMembers, fetchApprovals, fetchMemories]);

  // Fetch platform accounts for scope panel
  useEffect(() => {
    const fetchPlatforms = async () => {
      try {
        const tok = localStorage.getItem('token');
        if (!tok) return;
        const res = await fetch('/api/platforms/accounts', { headers: { Authorization: `Bearer ${tok}` } });
        if (res.ok) {
          const data = await res.json();
          setPlatformAccounts((data.accounts || []).map((a: any) => ({
            id: a.id, name: a.name || a.phone || a.id, platform: a.platform,
          })));
        }
      } catch { /* ignore */ }
    };
    fetchPlatforms();
  }, []);

  return (
    <div
      className={cn(
        'bg-swarm-dark border border-swarm-border/30 rounded-2xl shadow-neu-pressed',
        'flex flex-col h-full',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-swarm-border/30">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-purple-500/20">
            <Bot className="w-6 h-6 text-purple-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">{profile.name}</h2>
            <div className="flex items-center gap-2 mt-0.5">
              <Badge variant={status.variant} size="sm" dot pulse={profile.status === 'active'}>
                {status.label}
              </Badge>
              <span className="text-xs text-gray-500">
                Level {profile.hierarchyLevel === 0 ? 'Root' : profile.hierarchyLevel}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onEdit}
            icon={<Edit className="w-4 h-4" />}
          >
            Edit
          </Button>
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="px-4 pt-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <Tabs.List className="flex-wrap">
            <Tabs.Trigger value="overview" icon={<Activity className="w-4 h-4" />}>
              Overview
            </Tabs.Trigger>
            <Tabs.Trigger value="live" icon={<Zap className="w-4 h-4" />}>
              Live
            </Tabs.Trigger>
            <Tabs.Trigger value="goals" icon={<Target className="w-4 h-4" />}>
              Goals
            </Tabs.Trigger>
            <Tabs.Trigger value="memory" icon={<Brain className="w-4 h-4" />}>
              Memory
            </Tabs.Trigger>
            <Tabs.Trigger value="skills" icon={<Sparkles className="w-4 h-4" />}>
              Skills
            </Tabs.Trigger>
            <Tabs.Trigger value="schedules" icon={<Calendar className="w-4 h-4" />}>
              Schedules
            </Tabs.Trigger>
            <Tabs.Trigger value="ai-routing" icon={<Route className="w-4 h-4" />}>
              AI Routing
            </Tabs.Trigger>
            <Tabs.Trigger value="team" icon={<Users className="w-4 h-4" />}>
              Team ({teamMembers.length})
            </Tabs.Trigger>
            <Tabs.Trigger value="superior" icon={<UserCog className="w-4 h-4" />}>
              Superior
            </Tabs.Trigger>
            <Tabs.Trigger value="tasks" icon={<ListChecks className="w-4 h-4" />}>
              Tasks
            </Tabs.Trigger>
            <Tabs.Trigger value="platforms" icon={<Monitor className="w-4 h-4" />}>
              Platforms
            </Tabs.Trigger>
            <Tabs.Trigger value="scope" icon={<Shield className="w-4 h-4" />}>
              Scope
            </Tabs.Trigger>
            <Tabs.Trigger value="audit" icon={<FileText className="w-4 h-4" />}>
              Audit
            </Tabs.Trigger>
            <Tabs.Trigger value="cost" icon={<DollarSign className="w-4 h-4" />}>
              Cost
            </Tabs.Trigger>
            <Tabs.Trigger value="notifications" icon={<BellRing className="w-4 h-4" />}>
              Alerts
            </Tabs.Trigger>
            <Tabs.Trigger value="self-prompting" icon={<Zap className="w-4 h-4" />}>
              Self-Prompt
            </Tabs.Trigger>
            <Tabs.Trigger value="self-learning" icon={<GraduationCap className="w-4 h-4" />}>
              Learning
            </Tabs.Trigger>
            <Tabs.Trigger value="background" icon={<Building2 className="w-4 h-4" />}>
              Background
            </Tabs.Trigger>
            <Tabs.Trigger value="personality" icon={<Heart className="w-4 h-4" />}>
              Personality
            </Tabs.Trigger>
            <Tabs.Trigger value="ai-messaging" icon={<MessageSquareShare className="w-4 h-4" />}>
              AI Comms
            </Tabs.Trigger>
            <Tabs.Trigger value="hierarchy" icon={<GitBranch className="w-4 h-4" />}>
              Hierarchy
            </Tabs.Trigger>
            <Tabs.Trigger value="local-agents" icon={<MonitorSmartphone className="w-4 h-4" />}>
              Devices
            </Tabs.Trigger>
            <Tabs.Trigger value="activity" icon={<Clock className="w-4 h-4" />}>
              Approvals ({approvals.filter(a => a.status === 'pending').length})
            </Tabs.Trigger>
            <Tabs.Trigger value="conversations" icon={<MessageSquare className="w-4 h-4" />}>
              Conversations
            </Tabs.Trigger>
            <Tabs.Trigger value="metrics" icon={<BarChart3 className="w-4 h-4" />}>
              Metrics
            </Tabs.Trigger>
            <Tabs.Trigger value="exec-history" icon={<History className="w-4 h-4" />}>
              History
            </Tabs.Trigger>
          </Tabs.List>

          {/* Overview Tab */}
          <Tabs.Content value="overview" className="p-4">
            <div className="space-y-6">
              {/* Description */}
              {profile.description && (
                <div>
                  <h4 className="text-sm font-medium text-gray-400 mb-2">Description</h4>
                  <p className="text-white">{profile.description}</p>
                </div>
              )}

              {/* Stats grid */}
              <div className="grid grid-cols-2 gap-4">
                {/* Autonomy Level */}
                <div className="p-4 bg-swarm-darker rounded-xl border border-swarm-border/20">
                  <div className="flex items-center gap-2 mb-2">
                    <Gauge className={cn('w-5 h-5', autonomyColor)} />
                    <span className="text-sm text-gray-400">Autonomy Level</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className={cn('text-2xl font-bold', autonomyColor)}>
                      {autonomyLabel}
                    </span>
                    <Badge variant={profile.autonomyLevel === 'supervised' ? 'success' : profile.autonomyLevel === 'semi-autonomous' ? 'warning' : 'error'} size="sm">
                      {profile.autonomyLevel === 'supervised' ? 'Low' : profile.autonomyLevel === 'semi-autonomous' ? 'Medium' : 'High'}
                    </Badge>
                  </div>
                </div>

                {/* Hierarchy Level */}
                <div className="p-4 bg-swarm-darker rounded-xl border border-swarm-border/20">
                  <div className="flex items-center gap-2 mb-2">
                    <GitBranch className="w-5 h-5 text-sky-400" />
                    <span className="text-sm text-gray-400">Hierarchy Level</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-sky-400">
                      {profile.hierarchyLevel === 0 ? 'Root' : `L${profile.hierarchyLevel}`}
                    </span>
                    {profile.parentProfileId && (
                      <span className="text-gray-500 text-sm">Sub-agent</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Timestamps */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Created:</span>
                  <span className="ml-2 text-gray-300">{formatDateTime(profile.createdAt)}</span>
                </div>
                <div>
                  <span className="text-gray-500">Updated:</span>
                  <span className="ml-2 text-gray-300">{formatDateTime(profile.updatedAt)}</span>
                </div>
              </div>
            </div>
          </Tabs.Content>

          {/* Live Execution Tab */}
          <Tabs.Content value="live" className="p-4">
            <div className="space-y-4">
              <ExecutionMonitor agentId={profile.id} />
              <RuntimeControlPanel agentId={profile.id} />
              <ReasoningTimeline agentId={profile.id} />
            </div>
          </Tabs.Content>

          {/* Goals Tab */}
          <Tabs.Content value="goals" className="p-4">
            <GoalsPanel agenticId={profile.id} />
          </Tabs.Content>

          {/* Memory Tab */}
          <Tabs.Content value="memory" className="p-4">
            <MemoryPanel agenticId={profile.id} />
          </Tabs.Content>

          {/* Skills Tab */}
          <Tabs.Content value="skills" className="p-4">
            <SkillsPanel agenticId={profile.id} />
          </Tabs.Content>

          {/* Schedules Tab */}
          <Tabs.Content value="schedules" className="p-4">
            <div className="space-y-6">
              {/* Schedule Management */}
              <SchedulesPanel agenticId={profile.id} />

              {/* Job Execution History */}
              <div className="pt-4 border-t border-swarm-border/20">
                <h4 className="text-sm font-medium text-gray-400 mb-4 flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Job Execution History
                </h4>
                <JobSchedulerPanel agenticId={profile.id} />
              </div>
            </div>
          </Tabs.Content>

          {/* AI Routing Tab */}
          <Tabs.Content value="ai-routing" className="p-4">
            <AIRoutingPanel agenticId={profile.id} />
          </Tabs.Content>

          {/* Team Tab */}
          <Tabs.Content value="team" className="p-4">
            <TeamMembersList
              agenticId={profile.id}
              members={teamMembers}
              isLoading={isLoadingProfiles}
            />
          </Tabs.Content>

          {/* Superior (Master Contact) Tab */}
          <Tabs.Content value="superior" className="p-4">
            <MasterContactPanel
              agenticId={profile.id}
              initialConfig={{
                contactId: profile.masterContactId,
                channel: (profile.masterContactChannel as 'email' | 'whatsapp' | 'telegram') || 'email',
              }}
              readOnly={profile.profileType === 'sub' && profile.hierarchyLevel > 0}
            />
          </Tabs.Content>

          {/* Tasks Tab */}
          <Tabs.Content value="tasks" className="p-4">
            <TaskTrackingPanel agenticId={profile.id} />
          </Tabs.Content>

          {/* Platforms Tab */}
          <Tabs.Content value="platforms" className="p-4">
            <PlatformMonitoringPanel agenticId={profile.id} />
          </Tabs.Content>

          {/* Contact Scope Tab */}
          <Tabs.Content value="scope" className="p-4">
            <ContactScopePanel agenticId={profile.id} platformAccounts={platformAccounts} />
          </Tabs.Content>

          {/* Audit Trail Tab */}
          <Tabs.Content value="audit" className="p-4">
            <ActivityLogPanel agenticId={profile.id} />
          </Tabs.Content>

          {/* Cost Tracking Tab */}
          <Tabs.Content value="cost" className="p-4">
            <CostTrackingPanel agenticId={profile.id} />
          </Tabs.Content>

          {/* Notifications Tab */}
          <Tabs.Content value="notifications" className="p-4">
            <NotificationsPanel agenticId={profile.id} />
          </Tabs.Content>

          {/* Self-Prompting Tab */}
          <Tabs.Content value="self-prompting" className="p-4">
            <SelfPromptingPanel agenticId={profile.id} />
          </Tabs.Content>

          {/* Self-Learning Tab */}
          <Tabs.Content value="self-learning" className="p-4">
            <SelfLearningPanel agenticId={profile.id} />
          </Tabs.Content>

          {/* Background Info Tab */}
          <Tabs.Content value="background" className="p-4">
            <BackgroundInfoPanel agenticId={profile.id} />
          </Tabs.Content>

          {/* Audit Log Tab (was AI Messaging) */}
          <Tabs.Content value="ai-messaging" className="p-4">
            <AuditLogPanel agenticId={profile.id} />
          </Tabs.Content>

          {/* Personality Tab */}
          <Tabs.Content value="personality" className="p-4">
            <PersonalityPanel agenticId={profile.id} />
          </Tabs.Content>

          {/* Hierarchy Tab */}
          <Tabs.Content value="hierarchy" className="p-4">
            <HierarchyTreeView
              agenticId={profile.id}
              actionsEnabled={profile.profileType === 'master' || profile.hierarchyLevel === 0}
              maxDepth={3}
              onSelectNode={(node) => {
                // Could navigate to the selected node's profile
                console.log('Selected node:', node);
              }}
            />
          </Tabs.Content>

          {/* Activity/Approvals Tab */}
          <Tabs.Content value="activity" className="p-4">
            <ApprovalQueue
              agenticId={profile.id}
              approvals={approvals}
              isLoading={isLoadingProfiles}
            />
          </Tabs.Content>

          {/* Phase 7: Conversations Tab */}
          <Tabs.Content value="conversations" className="p-4">
            <ConversationsPanel agentId={profile.id} />
          </Tabs.Content>

          {/* Phase 7: Metrics Tab */}
          <Tabs.Content value="metrics" className="p-4">
            <MetricsDashboard agentId={profile.id} />
          </Tabs.Content>

          {/* Phase 7: Execution History Tab */}
          <Tabs.Content value="exec-history" className="p-4">
            <ExecutionHistoryPanel agentId={profile.id} />
          </Tabs.Content>

          <Tabs.Content value="local-agents" className="p-4">
            <LocalAgentsTabPanel />
          </Tabs.Content>
        </Tabs>
      </div>
    </div>
  );
};

ProfileDetailPanel.displayName = 'ProfileDetailPanel';

export default ProfileDetailPanel;
