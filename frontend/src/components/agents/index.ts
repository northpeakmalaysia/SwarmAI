/**
 * Agent Management UI Components
 *
 * Components for creating, configuring, and managing AI agents.
 *
 * @example
 * ```tsx
 * import {
 *   AgentCard,
 *   AgentStatusBadge,
 *   CreateAgentModal,
 *   EditAgentModal,
 *   PlatformSetupWizard,
 *   QRCodeDisplay,
 * } from '@/components/agents';
 * ```
 */

// AgentCard
export { AgentCard, default as AgentCardComponent } from './AgentCard';
export { PlatformIcon, ReputationStars, formatLastActive } from './AgentCard';
export { platformBgColors, platformIconColors } from './AgentCard';
export type { AgentCardProps, AgentData } from './AgentCard';

// AgentStatusBadge
export { AgentStatusBadge, default as AgentStatusBadgeComponent } from './AgentStatusBadge';
export type { AgentStatusBadgeProps, AgentStatus } from './AgentStatusBadge';

// CreateAgentModal
export { CreateAgentModal, default as CreateAgentModalComponent } from './CreateAgentModal';
export type { CreateAgentModalProps, AgentConfiguration } from './CreateAgentModal';

// EditAgentModal
export { EditAgentModal, default as EditAgentModalComponent } from './EditAgentModal';
export type { EditAgentModalProps } from './EditAgentModal';

// PlatformSetupWizard
export { PlatformSetupWizard, default as PlatformSetupWizardComponent } from './PlatformSetupWizard';
export { platformMeta } from './PlatformSetupWizard';
export type { PlatformSetupWizardProps, Platform, PlatformConfig } from './PlatformSetupWizard';

// QRCodeDisplay
export { QRCodeDisplay, default as QRCodeDisplayComponent } from './QRCodeDisplay';
export type { QRCodeDisplayProps, QRStatus } from './QRCodeDisplay';

// OrphanedSessionsPanel
export { OrphanedSessionsPanel, default as OrphanedSessionsPanelComponent } from './OrphanedSessionsPanel';

// AgentSettingsModal
export { AgentSettingsModal, default as AgentSettingsModalComponent } from './AgentSettingsModal';
export type { AgentSettingsModalProps } from './AgentSettingsModal';

// Platform-specific settings
export { EmailAgentSettings } from './settings/EmailAgentSettings';
export type { EmailSettings, EmailAgentSettingsProps } from './settings/EmailAgentSettings';

export { WhatsAppAgentSettings } from './settings/WhatsAppAgentSettings';
export type { WhatsAppSettings, WhatsAppAgentSettingsProps } from './settings/WhatsAppAgentSettings';

export { TelegramBotSettings } from './settings/TelegramBotSettings';
export type { TelegramBotSettings as TelegramBotSettingsType, TelegramBotSettingsProps, BotCommand } from './settings/TelegramBotSettings';
