/**
 * Agentic AI Platform Components
 *
 * This module exports all components for the Agentic Profiles feature,
 * which provides autonomous AI agent management with hierarchy,
 * team collaboration, and approval workflows.
 */

// Profile Card - Display component for profile list
export { ProfileCard } from './ProfileCard';
export type { ProfileCardProps } from './ProfileCard';

// Profile Form Modal - Create/Edit profile dialog
export { ProfileFormModal } from './ProfileFormModal';
export type { ProfileFormModalProps } from './ProfileFormModal';

// Profile Detail Panel - Full profile view with tabs
export { ProfileDetailPanel } from './ProfileDetailPanel';
export type { ProfileDetailPanelProps } from './ProfileDetailPanel';

// Team Members List - Manage team members
export { TeamMembersList } from './TeamMembersList';
export type { TeamMembersListProps } from './TeamMembersList';

// Approval Queue - Pending approvals management
export { ApprovalQueue } from './ApprovalQueue';
export type { ApprovalQueueProps } from './ApprovalQueue';

// Master Contact Panel - Configure superior contact for approvals & reports
export { MasterContactPanel } from './MasterContactPanel';
export type { MasterContactPanelProps, MasterContactConfig } from './MasterContactPanel';

// Hierarchy Tree View - Visual master/sub-agent tree
export { HierarchyTreeView } from './HierarchyTreeView';
export type { HierarchyTreeViewProps, HierarchyNode, HierarchyData } from './HierarchyTreeView';

// Team Member Form - Enhanced form with all PRD fields
export { TeamMemberForm } from './TeamMemberForm';
export type { TeamMemberFormProps, TeamMemberFormData } from './TeamMemberForm';

// Goals Panel - Goal management
export { GoalsPanel } from './GoalsPanel';

// Memory Panel - Agent memory management
export { MemoryPanel } from './MemoryPanel';

// Schedules Panel - Schedule management
export { SchedulesPanel } from './SchedulesPanel';

// Skills Panel - Skills management
export { SkillsPanel } from './SkillsPanel';

// AI Routing Panel - Task routing configuration
export { AIRoutingPanel } from './AIRoutingPanel';

// Job Scheduler Panel - Job history and execution
export { JobSchedulerPanel } from './JobSchedulerPanel';

// Task Tracking Panel - Task management and tracking
export { TaskTrackingPanel } from './TaskTrackingPanel';
export type { TaskTrackingPanelProps, Task } from './TaskTrackingPanel';

// Platform Monitoring Panel - Platform connection status
export { PlatformMonitoringPanel } from './PlatformMonitoringPanel';
export type { PlatformMonitoringPanelProps, PlatformAccount } from './PlatformMonitoringPanel';

// Contact Scope Panel - Contact access restrictions
export { ContactScopePanel } from './ContactScopePanel';
export type { ContactScopePanelProps } from './ContactScopePanel';

// Activity Log Panel - Comprehensive audit trail
export { ActivityLogPanel } from './ActivityLogPanel';
export type { ActivityLogPanelProps } from './ActivityLogPanel';

// Cost Tracking Panel - Usage and budget management
export { CostTrackingPanel } from './CostTrackingPanel';
export type { CostTrackingPanelProps } from './CostTrackingPanel';

// Notifications Panel - Master contact notification history
export { NotificationsPanel } from './NotificationsPanel';
export type { NotificationsPanelProps } from './NotificationsPanel';

// Self-Prompting Panel - Autonomous prompt generation engine
export { SelfPromptingPanel } from './SelfPromptingPanel';
export type { SelfPromptingPanelProps } from './SelfPromptingPanel';

// Self-Learning Panel - RAG auto-learn configuration
export { SelfLearningPanel } from './SelfLearningPanel';
export type { SelfLearningPanelProps } from './SelfLearningPanel';

// Background Info Panel - Company background configuration
export { BackgroundInfoPanel } from './BackgroundInfoPanel';
export type { BackgroundInfoPanelProps } from './BackgroundInfoPanel';

// AI Messaging Panel - AI-to-AI message threading
export { AIMessagingPanel } from './AIMessagingPanel';
export type { AIMessagingPanelProps } from './AIMessagingPanel';

// Personality Panel - Markdown personality configuration
export { PersonalityPanel } from './PersonalityPanel';
export type { PersonalityPanelProps } from './PersonalityPanel';
