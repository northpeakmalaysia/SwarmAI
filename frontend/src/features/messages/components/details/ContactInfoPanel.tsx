import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    X,
    User,
    Phone,
    Mail,
    Link2,
    Globe,
    Tag,
    Calendar,
    Bot,
    Plus,
    ExternalLink
} from 'lucide-react';
import { cn } from '../../../../lib/utils';
import { formatDate } from '../../../../utils/dateFormat';
import { useIsMobile } from '../../../../hooks/useMediaQuery';
import { formatContactDisplay } from '../../utils/formatters';
import { PlatformIcon } from '../shared/PlatformIcon';
import { useContactStore } from '../../../../stores/contactStore';
import toast from 'react-hot-toast';
import type { Chat, Platform } from '../../../../types';

interface ContactInfoPanelProps {
    chat: Chat;
    contact?: {
        id: string;
        displayName: string;
        primaryPhone?: string;
        primaryEmail?: string;
        primaryTelegramUsername?: string;
        company?: string;
        notes?: string;
        isBlocked?: boolean;
        isFavorite?: boolean;
        identifiers?: Array<{
            id: string;
            platform: string;
            identifierType: string;
            identifierValue: string;
        }>;
        tags?: Array<{ tagName: string; tagColor?: string }>;
    };
    onClose: () => void;
}

/**
 * Contact Info Panel component with linked identifiers
 */
export const ContactInfoPanel: React.FC<ContactInfoPanelProps> = ({ chat, contact, onClose }) => {
    const primaryParticipant = chat.participants[0];
    const isMobile = useIsMobile();
    const navigate = useNavigate();
    const { addTag, removeTag } = useContactStore();

    // Tag management state
    const [newTag, setNewTag] = useState('');
    const [showAddTag, setShowAddTag] = useState(false);
    const [isAddingTag, setIsAddingTag] = useState(false);

    // Local tags state to update UI immediately
    const [localTags, setLocalTags] = useState<Array<{ tagName: string; tagColor?: string }>>(
        contact?.tags || []
    );

    // Sync local tags when contact changes
    React.useEffect(() => {
        setLocalTags(contact?.tags || []);
    }, [contact?.tags]);

    const handleAddTag = async () => {
        if (!newTag.trim() || !contact) return;

        setIsAddingTag(true);
        try {
            await addTag(contact.id, newTag.trim());
            setLocalTags(prev => [...prev, { tagName: newTag.trim() }]);
            setNewTag('');
            setShowAddTag(false);
            toast.success('Tag added');
        } catch {
            toast.error('Failed to add tag');
        } finally {
            setIsAddingTag(false);
        }
    };

    const handleRemoveTag = async (tagName: string) => {
        if (!contact) return;

        try {
            await removeTag(contact.id, tagName);
            setLocalTags(prev => prev.filter(t => t.tagName !== tagName));
            toast.success('Tag removed');
        } catch {
            toast.error('Failed to remove tag');
        }
    };

    const handleManageContact = () => {
        if (contact) {
            navigate(`/contacts/${contact.id}`);
        }
    };

    return (
        <div className={cn(
            'bg-slate-800 border-l border-slate-700 flex flex-col h-full',
            isMobile ? 'w-full' : 'w-72'
        )}>
            {/* Header */}
            <div className="panel-header">
                <h3 className="font-medium text-white">Contact Info</h3>
                <button
                    type="button"
                    onClick={onClose}
                    className="p-2 text-gray-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors touch-target"
                    aria-label="Close contact info"
                    title="Close"
                >
                    <X className="w-5 h-5" />
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto panel-body">
                {/* Avatar and name */}
                <div className="flex flex-col items-center mb-6">
                    <div
                        className={cn(
                            'w-20 h-20 rounded-full flex items-center justify-center mb-3',
                            chat.platform === 'whatsapp' && 'bg-emerald-500/20',
                            chat.platform === 'telegram-bot' && 'bg-sky-500/20',
                            chat.platform === 'telegram-user' && 'bg-sky-500/20',
                            chat.platform === 'email' && 'bg-rose-500/20'
                        )}
                    >
                        {primaryParticipant?.avatarUrl ? (
                            <img
                                src={primaryParticipant.avatarUrl}
                                alt={primaryParticipant.name}
                                className="w-full h-full rounded-full object-cover"
                            />
                        ) : (
                            <User className="w-10 h-10 text-gray-300" />
                        )}
                    </div>
                    <h4 className="text-lg font-medium text-white">{formatContactDisplay(contact?.displayName, contact?.id) || chat.title}</h4>
                    {contact?.company && (
                        <p className="text-sm text-gray-400">{contact.company}</p>
                    )}
                    <p className="text-xs text-gray-500 capitalize mt-1">{chat.platform.replace('-', ' ')}</p>
                </div>

                {/* Linked Contact Info */}
                {contact && (
                    <div className="stack-md">
                        {/* Primary Identifiers */}
                        <div className="bg-slate-700/50 rounded-lg p-3 space-y-3">
                            <div className="flex items-center gap-2 mb-2">
                                <Link2 className="w-4 h-4 text-gray-400" />
                                <p className="text-xs text-gray-400 font-medium">Contact Details</p>
                            </div>

                            {contact.primaryPhone && (
                                <div className="flex items-center gap-3">
                                    <Phone className="w-4 h-4 text-emerald-400" />
                                    <div>
                                        <p className="text-xs text-gray-400">Phone</p>
                                        <p className="text-sm text-white">{contact.primaryPhone}</p>
                                    </div>
                                </div>
                            )}

                            {contact.primaryEmail && (
                                <div className="flex items-center gap-3">
                                    <Mail className="w-4 h-4 text-rose-400" />
                                    <div>
                                        <p className="text-xs text-gray-400">Email</p>
                                        <p className="text-sm text-white">{contact.primaryEmail}</p>
                                    </div>
                                </div>
                            )}

                            {contact.primaryTelegramUsername && (
                                <div className="flex items-center gap-3">
                                    <PlatformIcon platform="telegram-user" />
                                    <div>
                                        <p className="text-xs text-gray-400">Telegram</p>
                                        <p className="text-sm text-white">@{contact.primaryTelegramUsername}</p>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Linked Platforms */}
                        {contact.identifiers && contact.identifiers.length > 0 && (
                            <div className="bg-slate-700/50 rounded-lg p-3">
                                <div className="flex items-center gap-2 mb-3">
                                    <Globe className="w-4 h-4 text-gray-400" />
                                    <p className="text-xs text-gray-400 font-medium">Linked Platforms</p>
                                </div>
                                <div className="space-y-2">
                                    {contact.identifiers.map((identifier) => (
                                        <div
                                            key={identifier.id}
                                            className="flex items-center gap-2 text-sm"
                                        >
                                            <PlatformIcon platform={identifier.platform as Platform} />
                                            <span className="text-gray-300 truncate">{identifier.identifierValue}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Tags */}
                        <div className="bg-slate-700/50 rounded-lg p-3">
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    <Tag className="w-4 h-4 text-gray-400" />
                                    <p className="text-xs text-gray-400">Tags</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setShowAddTag(!showAddTag)}
                                    className="text-xs text-sky-400 hover:text-sky-300 flex items-center gap-1"
                                >
                                    <Plus className="w-3 h-3" />
                                    Add
                                </button>
                            </div>

                            {/* Add tag input */}
                            {showAddTag && (
                                <div className="flex gap-2 mb-2">
                                    <input
                                        type="text"
                                        value={newTag}
                                        onChange={(e) => setNewTag(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
                                        placeholder="Tag name (e.g., VIP, Customer)"
                                        className="flex-1 px-2 py-1 text-xs bg-slate-600 border border-slate-500 rounded text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-sky-500"
                                        autoFocus
                                    />
                                    <button
                                        type="button"
                                        onClick={handleAddTag}
                                        disabled={isAddingTag || !newTag.trim()}
                                        className="px-2 py-1 text-xs bg-sky-500 hover:bg-sky-600 disabled:bg-slate-600 disabled:text-gray-400 text-white rounded transition-colors"
                                    >
                                        {isAddingTag ? '...' : 'Add'}
                                    </button>
                                </div>
                            )}

                            {/* Tags list */}
                            <div className="flex flex-wrap gap-1">
                                {localTags.length > 0 ? (
                                    localTags.map((tag) => (
                                        <span
                                            key={tag.tagName}
                                            className="group px-2 py-0.5 text-xs rounded flex items-center gap-1 cursor-default"
                                            style={{
                                                backgroundColor: tag.tagColor ? `${tag.tagColor}20` : 'rgb(71 85 105)',
                                                color: tag.tagColor || 'rgb(209 213 219)',
                                            }}
                                        >
                                            {tag.tagName}
                                            <button
                                                type="button"
                                                onClick={() => handleRemoveTag(tag.tagName)}
                                                className="opacity-0 group-hover:opacity-100 hover:text-red-400 transition-opacity ml-0.5"
                                                title="Remove tag"
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        </span>
                                    ))
                                ) : (
                                    <span className="text-xs text-gray-500">No tags yet</span>
                                )}
                            </div>
                        </div>

                        {/* Notes */}
                        {contact.notes && (
                            <div className="bg-slate-700/50 rounded-lg p-3">
                                <p className="text-xs text-gray-400 mb-2">Notes</p>
                                <p className="text-sm text-gray-300 whitespace-pre-wrap">{contact.notes}</p>
                            </div>
                        )}

                        {/* Manage Contact Link */}
                        <button
                            type="button"
                            onClick={handleManageContact}
                            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-slate-700/50 hover:bg-slate-600/50 rounded-lg text-sm text-sky-400 hover:text-sky-300 transition-colors"
                        >
                            <ExternalLink className="w-4 h-4" />
                            Manage Contact
                        </button>
                    </div>
                )}

                {/* Fallback for non-contact chats */}
                {!contact && (
                    <div className="stack-md">
                        {/* Platform-specific info */}
                        <div className="bg-slate-700/50 rounded-lg p-3 space-y-3">
                            {/* WhatsApp - show phone or externalId */}
                            {(chat.platform === 'whatsapp' || chat.platform === 'whatsapp-business') && (
                                <div className="flex items-center gap-3">
                                    <Phone className="w-4 h-4 text-emerald-400" />
                                    <div>
                                        <p className="text-xs text-gray-400">Phone / Chat ID</p>
                                        <p className="text-sm text-white font-mono">
                                            {primaryParticipant?.phone || chat.externalId || 'Unknown'}
                                        </p>
                                    </div>
                                </div>
                            )}
                            {/* Telegram - show username or externalId */}
                            {(chat.platform === 'telegram-bot' || chat.platform === 'telegram-user') && (
                                <div className="flex items-center gap-3">
                                    <User className="w-4 h-4 text-sky-400" />
                                    <div>
                                        <p className="text-xs text-gray-400">
                                            {primaryParticipant?.username ? 'Username' : 'Chat ID'}
                                        </p>
                                        <p className="text-sm text-white font-mono">
                                            {primaryParticipant?.username
                                                ? `@${primaryParticipant.username}`
                                                : chat.externalId || 'Unknown'}
                                        </p>
                                    </div>
                                </div>
                            )}
                            {/* Email - show email address */}
                            {chat.platform === 'email' && (
                                <div className="flex items-center gap-3">
                                    <Mail className="w-4 h-4 text-rose-400" />
                                    <div>
                                        <p className="text-xs text-gray-400">Email</p>
                                        <p className="text-sm text-white">
                                            {primaryParticipant?.email || chat.externalId || 'Unknown'}
                                        </p>
                                    </div>
                                </div>
                            )}
                            {/* Other platforms - show externalId */}
                            {chat.platform !== 'whatsapp' &&
                                chat.platform !== 'whatsapp-business' &&
                                chat.platform !== 'telegram-bot' &&
                                chat.platform !== 'telegram-user' &&
                                chat.platform !== 'email' &&
                                chat.externalId && (
                                    <div className="flex items-center gap-3">
                                        <Globe className="w-4 h-4 text-gray-400" />
                                        <div>
                                            <p className="text-xs text-gray-400">External ID</p>
                                            <p className="text-sm text-white font-mono">{chat.externalId}</p>
                                        </div>
                                    </div>
                                )}
                        </div>
                    </div>
                )}

                {/* Chat info */}
                <div className="mt-4 bg-slate-700/50 rounded-lg p-3 space-y-3">
                    <div className="flex items-center gap-3">
                        <Calendar className="w-4 h-4 text-gray-400" />
                        <div>
                            <p className="text-xs text-gray-400">Started</p>
                            <p className="text-sm text-white">
                                {formatDate(chat.createdAt)}
                            </p>
                        </div>
                    </div>
                    {chat.assignedAgentId && (
                        <div className="flex items-center gap-3">
                            <Bot className="w-4 h-4 text-sky-400" />
                            <div>
                                <p className="text-xs text-gray-400">Assigned Agent</p>
                                <p className="text-sm text-white">Agent #{chat.assignedAgentId}</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
