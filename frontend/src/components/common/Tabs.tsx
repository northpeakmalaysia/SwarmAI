import React, { createContext, useContext, useState, useCallback, useId } from 'react';
import { cn } from '../../lib/utils';

// Context for tabs
interface TabsContextValue {
  activeTab: string;
  setActiveTab: (value: string) => void;
  baseId: string;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext() {
  const context = useContext(TabsContext);
  if (!context) {
    throw new Error('Tabs components must be used within a Tabs provider');
  }
  return context;
}

// Tabs root component
export interface TabsProps {
  /** Controlled active tab value */
  value?: string;
  /** Default active tab for uncontrolled mode */
  defaultValue?: string;
  /** Callback when active tab changes */
  onValueChange?: (value: string) => void;
  /** Tabs content */
  children: React.ReactNode;
  /** Additional class name */
  className?: string;
}

/**
 * Tabs component for organizing content into panels.
 * Supports both controlled and uncontrolled modes.
 *
 * @example
 * ```tsx
 * // Uncontrolled
 * <Tabs defaultValue="overview">
 *   <Tabs.List>
 *     <Tabs.Trigger value="overview" icon={<Info />}>Overview</Tabs.Trigger>
 *     <Tabs.Trigger value="settings" icon={<Settings />}>Settings</Tabs.Trigger>
 *   </Tabs.List>
 *   <Tabs.Content value="overview">Overview content</Tabs.Content>
 *   <Tabs.Content value="settings">Settings content</Tabs.Content>
 * </Tabs>
 *
 * // Controlled
 * <Tabs value={activeTab} onValueChange={setActiveTab}>
 *   ...
 * </Tabs>
 * ```
 */
export const Tabs: React.FC<TabsProps> & {
  List: typeof TabsList;
  Trigger: typeof TabsTrigger;
  Content: typeof TabsContent;
} = ({ value, defaultValue, onValueChange, children, className }) => {
  const baseId = useId();
  const [internalValue, setInternalValue] = useState(defaultValue || '');

  const activeTab = value !== undefined ? value : internalValue;

  const setActiveTab = useCallback(
    (newValue: string) => {
      if (value === undefined) {
        setInternalValue(newValue);
      }
      onValueChange?.(newValue);
    },
    [value, onValueChange]
  );

  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab, baseId }}>
      <div className={cn('w-full', className)}>
        {children}
      </div>
    </TabsContext.Provider>
  );
};

// Tabs list component
export interface TabsListProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Alignment of tabs */
  align?: 'start' | 'center' | 'end' | 'stretch';
}

export const TabsList = React.forwardRef<HTMLDivElement, TabsListProps>(
  ({ align = 'start', className, children, ...props }, ref) => {
    const alignStyles = {
      start: 'justify-start',
      center: 'justify-center',
      end: 'justify-end',
      stretch: 'justify-stretch',
    };

    return (
      <div
        ref={ref}
        role="tablist"
        className={cn(
          'flex items-center gap-1 p-1 bg-slate-800/50 rounded-lg border border-slate-700',
          alignStyles[align],
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

TabsList.displayName = 'TabsList';

// Tabs trigger component
export interface TabsTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Unique value for this tab */
  value: string;
  /** Icon element to render before text */
  icon?: React.ReactNode;
}

export const TabsTrigger = React.forwardRef<HTMLButtonElement, TabsTriggerProps>(
  ({ value, icon, disabled, className, children, ...props }, ref) => {
    const { activeTab, setActiveTab, baseId } = useTabsContext();
    const isActive = activeTab === value;
    const tabId = `${baseId}-tab-${value}`;
    const panelId = `${baseId}-panel-${value}`;

    return (
      <button
        ref={ref}
        id={tabId}
        role="tab"
        type="button"
        aria-selected={isActive}
        aria-controls={panelId}
        tabIndex={isActive ? 0 : -1}
        disabled={disabled}
        onClick={() => setActiveTab(value)}
        className={cn(
          'inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md',
          'transition-all duration-200',
          'focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-1 focus:ring-offset-slate-800',
          isActive
            ? 'bg-sky-500 text-white shadow-sm'
            : 'text-gray-400 hover:text-white hover:bg-slate-700',
          disabled && 'opacity-50 cursor-not-allowed',
          className
        )}
        {...props}
      >
        {icon && (
          <span className="w-4 h-4" aria-hidden="true">
            {icon}
          </span>
        )}
        {children}
      </button>
    );
  }
);

TabsTrigger.displayName = 'TabsTrigger';

// Tabs content component
export interface TabsContentProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Value matching the corresponding trigger */
  value: string;
  /** Force mount content even when not active (useful for forms) */
  forceMount?: boolean;
}

export const TabsContent = React.forwardRef<HTMLDivElement, TabsContentProps>(
  ({ value, forceMount = false, className, children, ...props }, ref) => {
    const { activeTab, baseId } = useTabsContext();
    const isActive = activeTab === value;
    const tabId = `${baseId}-tab-${value}`;
    const panelId = `${baseId}-panel-${value}`;

    if (!isActive && !forceMount) {
      return null;
    }

    return (
      <div
        ref={ref}
        id={panelId}
        role="tabpanel"
        aria-labelledby={tabId}
        tabIndex={0}
        hidden={!isActive}
        className={cn(
          'mt-4 focus:outline-none',
          !isActive && forceMount && 'hidden',
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

TabsContent.displayName = 'TabsContent';

// Attach sub-components
Tabs.List = TabsList;
Tabs.Trigger = TabsTrigger;
Tabs.Content = TabsContent;

export default Tabs;
