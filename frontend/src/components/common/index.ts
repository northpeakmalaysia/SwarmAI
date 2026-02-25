/**
 * Common UI Components
 *
 * Reusable UI components following the SwarmAI design system.
 *
 * @example
 * ```tsx
 * import { Button, Input, Modal, Card, Badge, Tabs, ToastProvider, useToast } from '@/components/common';
 * ```
 */

// Button
export { Button, default as ButtonComponent } from './Button';
export type { ButtonProps, ButtonVariant, ButtonSize } from './Button';

// Input
export { Input, default as InputComponent } from './Input';
export type { InputProps, InputSize, InputType } from './Input';

// Modal
export { Modal, default as ModalComponent } from './Modal';
export type { ModalProps, ModalSize } from './Modal';

// ConfirmDialog
export { ConfirmDialog, default as ConfirmDialogComponent } from './ConfirmDialog';
export type { ConfirmDialogProps, ConfirmDialogVariant } from './ConfirmDialog';

// PromptDialog
export { PromptDialog, default as PromptDialogComponent } from './PromptDialog';
export type { PromptDialogProps } from './PromptDialog';

// ForceResyncModal
export { ForceResyncModal, default as ForceResyncModalComponent } from './ForceResyncModal';
export type { ForceResyncModalProps, ResyncStatus, ResyncProgress } from './ForceResyncModal';

// Card
export { Card, CardHeader, CardBody, CardFooter, default as CardComponent } from './Card';
export type { CardProps, CardVariant, CardHeaderProps, CardBodyProps, CardFooterProps } from './Card';

// Badge
export { Badge, StatusBadge, default as BadgeComponent } from './Badge';
export type { BadgeProps, BadgeVariant, BadgeSize, StatusBadgeProps } from './Badge';

// Tabs
export { Tabs, TabsList, TabsTrigger, TabsContent, default as TabsComponent } from './Tabs';
export type { TabsProps, TabsListProps, TabsTriggerProps, TabsContentProps } from './Tabs';

// Toast
export { ToastProvider, useToast, toast, default as ToastProviderComponent } from './Toast';
export type { Toast, ToastType, ToastProviderProps } from './Toast';

// SyncProgressToast
export { SyncProgressToast, default as SyncProgressToastComponent } from './SyncProgressToast';
export type { SyncTask } from './SyncProgressToast';

// SwarmIcon (existing component)
export { default as SwarmIcon } from './SwarmIcon';

// ToggleSwitch
export { ToggleSwitch, default as ToggleSwitchComponent } from './ToggleSwitch';
export type { ToggleSwitchProps } from './ToggleSwitch';

// SearchableSelect - Generic searchable dropdown
export { SearchableSelect, default as SearchableSelectComponent } from './SearchableSelect';
export type { SearchableSelectProps, SelectOption } from './SearchableSelect';

// SearchableModelSelect - AI model selection dropdown
export { SearchableModelSelect, default as SearchableModelSelectComponent } from './SearchableModelSelect';
export type { SearchableModelSelectProps, ModelOption } from './SearchableModelSelect';
