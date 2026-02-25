import React from 'react';
import { Mail, Newspaper, Users } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { PlatformIcon } from './shared/PlatformIcon';
import { PlatformDropdownTab } from './PlatformDropdownTab';
import type { PlatformGroup } from '../../../stores/platformAccountStore';
import type { ViewMode, PlatformTabSelection } from '../types';
import { isPlatformTab } from '../types';

interface PlatformTabBarProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  platformGroups: PlatformGroup[];
  hasEmailAccounts: boolean;
  getUnreadByPlatform: (platform: string) => number;
  getUnreadByAgent: (agentId: string) => number;
}

const PLATFORM_CONFIG: Record<string, { label: string; activeColor: string; platformType: 'whatsapp' | 'telegram' }> = {
  whatsapp: { label: 'WhatsApp', activeColor: 'bg-emerald-600', platformType: 'whatsapp' },
  telegram: { label: 'Telegram', activeColor: 'bg-sky-600', platformType: 'telegram' },
};

export const PlatformTabBar: React.FC<PlatformTabBarProps> = ({
  viewMode,
  onViewModeChange,
  platformGroups,
  hasEmailAccounts,
  getUnreadByPlatform,
  getUnreadByAgent,
}) => {
  // Static tabs rendered after platform groups
  const staticTabs: Array<{
    id: string;
    icon: React.ReactNode;
    label: string;
    color: string;
    show: boolean;
  }> = [
    {
      id: 'email',
      icon: <Mail className="w-3.5 h-3.5" />,
      label: 'Email',
      color: 'bg-rose-600',
      show: hasEmailAccounts,
    },
    {
      id: 'news',
      icon: <Newspaper className="w-3.5 h-3.5" />,
      label: 'News',
      color: 'bg-amber-600',
      show: true,
    },
    {
      id: 'contacts',
      icon: <Users className="w-3.5 h-3.5" />,
      label: 'Contacts',
      color: 'bg-slate-600',
      show: true,
    },
  ];

  const isStaticActive = (id: string) => {
    if (isPlatformTab(viewMode)) return false;
    return viewMode === id;
  };

  const isPlatformGroupActive = (platform: string) => {
    return isPlatformTab(viewMode) && viewMode.platform === platform;
  };

  return (
    <div className="flex items-center gap-1 bg-slate-800/50 rounded-lg p-1 overflow-x-auto scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-transparent">
      {/* Platform dropdown tabs (first priority) */}
      {platformGroups.map((group) => {
        const config = PLATFORM_CONFIG[group.platform];
        if (!config) return null;

        return (
          <PlatformDropdownTab
            key={group.platform}
            platform={config.platformType}
            accounts={group.accounts}
            totalUnread={getUnreadByPlatform(group.platform)}
            getUnreadForAgent={getUnreadByAgent}
            isActive={isPlatformGroupActive(group.platform)}
            activeAccountId={isPlatformTab(viewMode) && viewMode.platform === group.platform ? viewMode.accountId : undefined}
            onSelect={(selection: PlatformTabSelection) => onViewModeChange(selection)}
            icon={<PlatformIcon platform={group.platform as any} className="w-3.5 h-3.5" />}
            label={config.label}
            activeColor={config.activeColor}
          />
        );
      })}

      {/* Static tabs (email, news, contacts) */}
      {staticTabs.filter(t => t.show).map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onViewModeChange(tab.id as ViewMode)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-all duration-200 whitespace-nowrap',
            isStaticActive(tab.id)
              ? `${tab.color} text-white shadow-lg shadow-black/20`
              : 'text-gray-400 hover:text-white hover:bg-white/5'
          )}
        >
          {tab.icon}
          <span className="hidden sm:inline font-medium">{tab.label}</span>
        </button>
      ))}
    </div>
  );
};
