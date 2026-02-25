import React, { useState } from 'react';
import { Edit2, MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatShortDate } from '@/utils/dateFormat';
import { formatContactDisplay } from '@/features/messages/utils/formatters';
import { PlatformIcon } from '../../shared/PlatformIcon';
import type { Platform } from '@/types';

interface ContactListItemProps {
    contact: {
        id: string;
        displayName: string;
        primaryPhone?: string;
        primaryEmail?: string;
        primaryTelegramUsername?: string;
        avatarUrl?: string;
        lastContactAt?: string;
        conversationCount?: number;
        platforms?: string[];
        tags?: string[];
    };
    isSelected: boolean;
    onClick: () => void;
    onEdit?: () => void;
    onStartChat?: () => void;
}

/**
 * Contact List Item component for contact-centric view
 */
export const ContactListItem: React.FC<ContactListItemProps> = ({ contact, isSelected, onClick, onEdit, onStartChat }) => {
    const platforms = contact.platforms || [];
    const [showActions, setShowActions] = useState(false);

    return (
        <div
            className={cn(
                'group relative p-3 flex items-start gap-3 hover:bg-slate-700/50 transition-colors cursor-pointer',
                isSelected && 'bg-slate-700'
            )}
            onClick={onClick}
            onMouseEnter={() => setShowActions(true)}
            onMouseLeave={() => setShowActions(false)}
        >
            {/* Avatar */}
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-swarm-primary to-swarm-secondary flex items-center justify-center flex-shrink-0">
                {contact.avatarUrl ? (
                    <img
                        src={contact.avatarUrl}
                        alt={formatContactDisplay(contact.displayName, contact.id)}
                        className="w-full h-full rounded-full object-cover"
                    />
                ) : (
                    <span className="text-sm font-medium text-white">
                        {contact.displayName.charAt(0).toUpperCase()}
                    </span>
                )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium text-white truncate">{formatContactDisplay(contact.displayName, contact.id)}</h4>
                    {contact.lastContactAt && !showActions && (
                        <span className="text-xs text-gray-500 flex-shrink-0">
                            {formatShortDate(contact.lastContactAt)}
                        </span>
                    )}
                </div>

                {/* Platform icons and tags */}
                <div className="flex items-center gap-1 mt-1 flex-wrap">
                    {platforms.map((platform) => (
                        <PlatformIcon
                            key={platform}
                            platform={platform as Platform}
                            className="w-3 h-3"
                        />
                    ))}
                    {contact.tags && contact.tags.slice(0, 2).map((tag) => (
                        <span
                            key={tag}
                            className={cn(
                                'px-1.5 py-0.5 text-[10px] rounded font-medium',
                                tag === 'Customer' && 'bg-blue-500/20 text-blue-400',
                                tag === 'Lead' && 'bg-yellow-500/20 text-yellow-400',
                                tag === 'VIP' && 'bg-purple-500/20 text-purple-400',
                                tag === 'Partner' && 'bg-green-500/20 text-green-400',
                                tag === 'Enterprise' && 'bg-orange-500/20 text-orange-400',
                                !['Customer', 'Lead', 'VIP', 'Partner', 'Enterprise'].includes(tag) && 'bg-slate-600 text-gray-300'
                            )}
                        >
                            {tag}
                        </span>
                    ))}
                    {contact.tags && contact.tags.length > 2 && (
                        <span className="text-[10px] text-gray-500">+{contact.tags.length - 2}</span>
                    )}
                </div>

                {/* Secondary info */}
                <p className="text-xs text-gray-500 truncate mt-0.5">
                    {contact.primaryPhone || contact.primaryEmail || contact.primaryTelegramUsername || 'No contact info'}
                </p>
            </div>

            {/* Hover Actions */}
            {showActions && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    {onEdit && (
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                onEdit();
                            }}
                            className="p-1.5 bg-slate-600 hover:bg-slate-500 text-gray-300 hover:text-white rounded-lg transition-colors"
                            title="Edit contact"
                        >
                            <Edit2 className="w-4 h-4" />
                        </button>
                    )}
                    {onStartChat && (
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                onStartChat();
                            }}
                            className="p-1.5 bg-swarm-primary hover:bg-swarm-primary/90 text-white rounded-lg transition-colors"
                            title="Start chat"
                        >
                            <MessageCircle className="w-4 h-4" />
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};
