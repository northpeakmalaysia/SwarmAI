import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../../lib/utils';
import type { PlatformAccount } from '../../../stores/platformAccountStore';
import type { PlatformTabSelection } from '../types';

interface PlatformDropdownTabProps {
  platform: 'whatsapp' | 'telegram';
  accounts: PlatformAccount[];
  totalUnread: number;
  getUnreadForAgent: (agentId: string) => number;
  isActive: boolean;
  activeAccountId?: string;
  onSelect: (selection: PlatformTabSelection) => void;
  icon: React.ReactNode;
  label: string;
  activeColor: string;
}

export const PlatformDropdownTab: React.FC<PlatformDropdownTabProps> = ({
  platform,
  accounts,
  totalUnread,
  getUnreadForAgent,
  isActive,
  activeAccountId,
  onSelect,
  icon,
  label,
  activeColor,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });

  // Close dropdown on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Recalculate position when dropdown opens
  const updatePosition = () => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + 4, left: rect.left });
    }
  };

  const handleClick = () => {
    if (accounts.length <= 1) {
      // Single account — select directly, no dropdown
      onSelect({
        type: 'platform',
        platform,
        accountId: accounts[0]?.id,
        subFilter: platform === 'whatsapp' ? 'chat' : undefined,
      });
    } else {
      // Multiple accounts — toggle dropdown
      if (!isActive) {
        // First click: select "All" and open dropdown
        onSelect({
          type: 'platform',
          platform,
          subFilter: platform === 'whatsapp' ? 'chat' : undefined,
        });
      }
      if (!isOpen) updatePosition();
      setIsOpen(!isOpen);
    }
  };

  const handleSelectAccount = (accountId?: string) => {
    onSelect({
      type: 'platform',
      platform,
      accountId,
      subFilter: platform === 'whatsapp' ? 'chat' : undefined,
    });
    setIsOpen(false);
  };

  const connectedCount = accounts.filter(a => a.status === 'connected').length;

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={handleClick}
        className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-all duration-200 whitespace-nowrap',
          isActive
            ? `${activeColor} text-white shadow-lg shadow-black/20`
            : 'text-gray-400 hover:text-white hover:bg-white/5'
        )}
      >
        {icon}
        <span className="font-medium">{label}</span>
        {totalUnread > 0 && (
          <span className="min-w-[18px] h-[18px] flex items-center justify-center px-1 text-[10px] font-bold bg-red-500 text-white rounded-full">
            {totalUnread > 99 ? '99+' : totalUnread}
          </span>
        )}
        {accounts.length > 1 && (
          <ChevronDown className={cn('w-3 h-3 transition-transform', isOpen && 'rotate-180')} />
        )}
      </button>

      {/* Dropdown menu — fixed position to escape overflow clipping */}
      {isOpen && accounts.length > 1 && (
        <div
          ref={dropdownRef}
          className="fixed w-56 bg-slate-800 border border-white/10 rounded-lg shadow-2xl py-1 overflow-hidden"
          style={{ top: dropdownPos.top, left: dropdownPos.left, zIndex: 9999 }}
        >
          {/* "All" option */}
          <button
            type="button"
            onClick={() => handleSelectAccount(undefined)}
            className={cn(
              'w-full px-3 py-2 text-left text-sm flex items-center justify-between transition-colors',
              !activeAccountId && isActive
                ? 'bg-white/10 text-white'
                : 'text-gray-300 hover:bg-white/5 hover:text-white'
            )}
          >
            <span className="font-medium">All {label}</span>
            <span className="text-[10px] text-gray-500">{connectedCount} connected</span>
          </button>

          <div className="border-t border-white/5 my-1" />

          {/* Individual accounts */}
          {accounts.map((account) => {
            const unread = getUnreadForAgent(account.agentId);
            const isSelected = activeAccountId === account.id && isActive;

            return (
              <button
                key={account.id}
                type="button"
                onClick={() => handleSelectAccount(account.id)}
                className={cn(
                  'w-full px-3 py-2 text-left text-sm flex items-center gap-2 transition-colors',
                  isSelected
                    ? 'bg-white/10 text-white'
                    : 'text-gray-300 hover:bg-white/5 hover:text-white'
                )}
              >
                {/* Status dot */}
                <span className={cn(
                  'w-2 h-2 rounded-full flex-shrink-0',
                  account.status === 'connected' ? 'bg-emerald-400' :
                  account.status === 'qr_pending' ? 'bg-yellow-400 animate-pulse' :
                  'bg-gray-500'
                )} />

                {/* Account label */}
                <div className="flex-1 min-w-0">
                  <div className="truncate font-medium">{account.displayLabel}</div>
                  {account.agentName && (
                    <div className="text-[10px] text-gray-500 truncate">{account.agentName}</div>
                  )}
                </div>

                {/* Unread badge */}
                {unread > 0 && (
                  <span className="min-w-[18px] h-[18px] flex items-center justify-center px-1 text-[10px] font-bold bg-red-500 text-white rounded-full">
                    {unread > 99 ? '99+' : unread}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
