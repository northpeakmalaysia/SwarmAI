import React, { useState, useRef, useEffect } from 'react';
import {
    Plus,
    Search,
    UserPlus,
    RefreshCw,
    PanelLeftClose,
    PanelLeft,
    ArrowLeft,
    Info,
    MessageCircle,
    Newspaper,
    Radio,
    Users,
    ChevronDown,
    Trash2,
    Mail,
} from 'lucide-react';
import { EmailFeature } from '../email';
import { cn } from '../../lib/utils';
import { useIsMobile } from '../../hooks/useMediaQuery';
import { ChatList, ChatWindow } from '../../components/messaging';
import { AddContactModal } from '../../components/messaging/AddContactModal';
import { ForceResyncModal, ConfirmDialog } from '../../components/common';
import { SyncProgressToast } from '../../components/common/SyncProgressToast';
import { useMessageLogic } from './hooks/useMessageLogic';
import { EmptyState } from './components/shared/EmptyState';
import { ContactInfoPanel } from './components/details/ContactInfoPanel';
import { ContactListItem } from './components/sidebar/ContactList/ContactListItem';
import { CONTACT_FILTER_TAGS } from './types';

export const MessagesFeature: React.FC = () => {
    const {
        // State
        conversationId,
        selectedAgentId,
        setSelectedAgentId,
        showInfoPanel,
        setShowInfoPanel,
        showLeftPanel,
        setShowLeftPanel,
        typingUsers,
        viewMode,
        setViewMode,
        setCategoryFilter,
        showAddContactModal,
        setShowAddContactModal,
        contactFilterTag,
        setContactFilterTag,
        contactSearchQuery,
        setContactSearchQuery,
        isRefreshing,
        isLoading,
        isLoadingMore,
        isContactsLoading,
        isSending,
        hasMoreMessages,

        // Data
        agents,
        currentAgent,
        chats,
        selectedChat,
        convertedMessages,
        contactsWithPlatforms,
        selectedContact,
        selectedContactIdentifiers,
        selectedContactTags,

        // Handlers
        handleSelectChat,
        handleSelectContact,
        handleCreateConversation,
        handleDeleteConversation,
        handleUpdateChat,
        handleSendMessage,
        handleTyping,
        handleRefreshMessages,
        handleLoadMore,
        handleForceResync,
        executeForceResync,
        handleResyncComplete,
        handleCloseResyncModal,
        handleSyncContacts,
        handleSyncChats,
        handleSyncComplete,
        handleAddContactSuccess,
        handleBack,
        handleDeleteAllMessages,
        handleDeleteAllContacts,

        // Modal state
        showResyncModal,
    } = useMessageLogic();

    // Sync dropdown state
    const [showSyncMenu, setShowSyncMenu] = useState(false);
    const syncMenuRef = useRef<HTMLDivElement>(null);

    // Delete confirmation dialog state
    const [showDeleteMessagesDialog, setShowDeleteMessagesDialog] = useState(false);
    const [showDeleteContactsDialog, setShowDeleteContactsDialog] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    // Close sync menu on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (syncMenuRef.current && !syncMenuRef.current.contains(e.target as Node)) {
                setShowSyncMenu(false);
            }
        };
        if (showSyncMenu) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showSyncMenu]);

    const isMobile = useIsMobile();

    // Mobile: determine which view to show
    // Desktop: respect left panel toggle state
    const showChatList = isMobile ? !conversationId : showLeftPanel;
    const showChatWindow = isMobile ? !!conversationId : true;
    const showMobileInfoPanel = isMobile && showInfoPanel;

    // Render EmailFeature for email tab (has its own complete layout)
    if (viewMode === 'email') {
        return (
            <div className="h-full flex flex-col min-h-0 bg-slate-900 overflow-hidden relative">
                {/* Tab switcher bar for email view */}
                <div className="h-12 px-3 flex items-center gap-2 border-b border-white/5 bg-slate-900/80 backdrop-blur-xl flex-shrink-0">
                    <div className="flex items-center gap-1 bg-slate-800/50 rounded-lg p-1">
                        {[
                            { id: 'chats', icon: MessageCircle, label: 'Chats', color: 'bg-slate-600' },
                            { id: 'email', icon: Mail, label: 'Email', color: 'bg-sky-600' },
                            { id: 'news', icon: Newspaper, label: 'News', color: 'bg-emerald-600' },
                            { id: 'status', icon: Radio, label: 'Status', color: 'bg-purple-600' },
                            { id: 'contacts', icon: Users, label: 'Contacts', color: 'bg-slate-600' }
                        ].map((tab) => (
                            <button
                                key={tab.id}
                                type="button"
                                onClick={() => {
                                    setViewMode(tab.id as any);
                                    setCategoryFilter(tab.id === 'contacts' || tab.id === 'email' ? undefined : (tab.id === 'chats' ? 'chat' : tab.id));
                                }}
                                className={cn(
                                    'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-all duration-200',
                                    viewMode === tab.id
                                        ? `${tab.color} text-white shadow-lg shadow-black/20`
                                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                                )}
                            >
                                <tab.icon className="w-3.5 h-3.5" />
                                <span className="font-medium">{tab.label}</span>
                            </button>
                        ))}
                    </div>
                </div>
                {/* Email feature content */}
                <div className="flex-1 min-h-0">
                    <EmailFeature />
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex min-h-0 bg-slate-900 overflow-hidden relative">
            {/* Background Decor - optional for depth if you want pure glassmorphism later */}
            <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-indigo-900/20 via-slate-900 to-slate-900 -z-10 pointer-events-none" />

            {/* Chat List Sidebar */}
            {showChatList && (
                <div className={cn(
                    'border-r border-white/5 flex flex-col min-h-0 transition-all duration-300',
                    isMobile ? 'w-full' : 'w-80',
                    'bg-slate-900/80 backdrop-blur-xl' // Glassmorphic sidebar
                )}>
                    {/* Header */}
                    <div className="h-16 px-4 flex items-center justify-between border-b border-white/5 bg-slate-900/50">
                        <h1 className="text-lg font-semibold text-white tracking-tight">Messages</h1>
                        <div className="flex items-center gap-2">
                            {/* Sync Dropdown Button */}
                            {selectedAgentId && viewMode !== 'contacts' && (
                                <div className="relative" ref={syncMenuRef}>
                                    <button
                                        type="button"
                                        onClick={() => setShowSyncMenu(!showSyncMenu)}
                                        disabled={isRefreshing}
                                        className="flex items-center gap-1 px-2 py-1.5 text-sky-400 hover:text-sky-300 hover:bg-white/5 rounded-lg transition-colors touch-target disabled:opacity-50"
                                        title="Sync options"
                                    >
                                        <RefreshCw className={cn('w-4 h-4', isRefreshing && 'animate-spin')} />
                                        <ChevronDown className="w-3 h-3" />
                                    </button>
                                    {showSyncMenu && (
                                        <div className="absolute right-0 top-full mt-1 w-48 bg-slate-800 border border-white/10 rounded-lg shadow-2xl z-50 py-1 overflow-hidden">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setShowSyncMenu(false);
                                                    handleSyncContacts();
                                                }}
                                                className="w-full px-3 py-2.5 text-left text-sm text-gray-300 hover:bg-white/5 hover:text-white flex items-center gap-2.5 transition-colors"
                                            >
                                                <Users className="w-4 h-4 text-emerald-400" />
                                                <div>
                                                    <div className="font-medium">Sync Contacts</div>
                                                    <div className="text-[11px] text-gray-500">Update contact list</div>
                                                </div>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setShowSyncMenu(false);
                                                    handleSyncChats();
                                                }}
                                                className="w-full px-3 py-2.5 text-left text-sm text-gray-300 hover:bg-white/5 hover:text-white flex items-center gap-2.5 transition-colors"
                                            >
                                                <MessageCircle className="w-4 h-4 text-sky-400" />
                                                <div>
                                                    <div className="font-medium">Sync Chats</div>
                                                    <div className="text-[11px] text-gray-500">Update chats & messages</div>
                                                </div>
                                            </button>
                                            <div className="border-t border-white/5 my-1" />
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setShowSyncMenu(false);
                                                    handleForceResync();
                                                }}
                                                className="w-full px-3 py-2.5 text-left text-sm text-orange-400 hover:bg-orange-500/10 hover:text-orange-300 flex items-center gap-2.5 transition-colors"
                                            >
                                                <RefreshCw className="w-4 h-4" />
                                                <div>
                                                    <div className="font-medium">Force Resync</div>
                                                    <div className="text-[11px] text-gray-500">Delete & re-sync all</div>
                                                </div>
                                            </button>
                                            <div className="border-t border-white/5 my-1" />
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setShowSyncMenu(false);
                                                    setShowDeleteMessagesDialog(true);
                                                }}
                                                className="w-full px-3 py-2.5 text-left text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 flex items-center gap-2.5 transition-colors"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                                <div>
                                                    <div className="font-medium">Delete All Messages</div>
                                                    <div className="text-[11px] text-gray-500">Remove all chats & media</div>
                                                </div>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setShowSyncMenu(false);
                                                    setShowDeleteContactsDialog(true);
                                                }}
                                                className="w-full px-3 py-2.5 text-left text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 flex items-center gap-2.5 transition-colors"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                                <div>
                                                    <div className="font-medium">Delete All Contacts</div>
                                                    <div className="text-[11px] text-gray-500">Remove all contacts</div>
                                                </div>
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                            <button
                                type="button"
                                onClick={handleCreateConversation}
                                className="p-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors touch-target"
                                title="New conversation"
                            >
                                <Plus className="w-5 h-5" />
                            </button>
                        </div>
                    </div>

                    {/* View Toggle Tabs */}
                    <div className="px-3 py-3 border-b border-white/5">
                        <div className="grid grid-cols-5 bg-slate-800/50 rounded-lg p-1 gap-1">
                            {[
                                { id: 'chats', icon: MessageCircle, label: 'Chats', color: 'bg-slate-600' },
                                { id: 'email', icon: Mail, label: 'Email', color: 'bg-sky-600' },
                                { id: 'news', icon: Newspaper, label: 'News', color: 'bg-emerald-600' },
                                { id: 'status', icon: Radio, label: 'Status', color: 'bg-purple-600' },
                                { id: 'contacts', icon: Users, label: 'Contacts', color: 'bg-slate-600' }
                            ].map((tab) => (
                                <button
                                    key={tab.id}
                                    type="button"
                                    onClick={() => {
                                        setViewMode(tab.id as any);
                                        setCategoryFilter(tab.id === 'contacts' || tab.id === 'email' ? undefined : (tab.id === 'chats' ? 'chat' : tab.id));
                                    }}
                                    className={cn(
                                        'flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs transition-all duration-200',
                                        viewMode === tab.id
                                            ? `${tab.color} text-white shadow-lg shadow-black/20`
                                            : 'text-gray-400 hover:text-white hover:bg-white/5'
                                    )}
                                >
                                    <tab.icon className="w-3.5 h-3.5" />
                                    <span className="hidden sm:inline font-medium">{tab.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Agent Selector (only for chat views) */}
                    {viewMode !== 'contacts' && (
                        <div className="px-3 py-2 border-b border-white/5">
                            <select
                                value={selectedAgentId || ''}
                                onChange={(e) => setSelectedAgentId(e.target.value || undefined)}
                                aria-label="Filter by agent"
                                className="w-full px-3 py-2 bg-slate-800/50 border border-white/10 rounded-lg text-sm text-gray-300 focus:outline-none focus:border-sky-500/50 focus:bg-slate-800 focus:text-white transition-colors cursor-pointer"
                            >
                                <option value="">All agents</option>
                                {agents.map((agent) => (
                                    <option key={agent.id} value={agent.id}>
                                        {agent.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* Main List Content */}
                    <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
                        {viewMode !== 'contacts' ? (
                            <ChatList
                                chats={chats}
                                selectedId={selectedChat?.id}
                                onSelect={handleSelectChat}
                                onDelete={handleDeleteConversation}
                                onUpdate={handleUpdateChat}
                                isLoading={isLoading}
                                className="flex-1"
                            />
                        ) : (
                            <div className="flex flex-col h-full">
                                {/* Contact Search & Actions */}
                                <div className="px-3 py-3 border-b border-white/5 space-y-3 bg-slate-900/30">
                                    <div className="flex items-center gap-2">
                                        <div className="relative flex-1 group">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 group-focus-within:text-sky-400 transition-colors" />
                                            <input
                                                type="text"
                                                placeholder="Search contacts..."
                                                value={contactSearchQuery}
                                                onChange={(e) => setContactSearchQuery(e.target.value)}
                                                className="w-full pl-10 pr-4 py-2 bg-slate-800/50 border border-white/10 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-sky-500/50 focus:bg-slate-800/80 transition-all"
                                            />
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setShowAddContactModal(true)}
                                            className="p-2 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white rounded-lg shadow-lg shadow-sky-900/20 transition-all transform active:scale-95"
                                            title="Add contact"
                                        >
                                            <UserPlus className="w-5 h-5" />
                                        </button>
                                    </div>

                                    {/* Filter Tags */}
                                    <div className="flex items-center gap-2 overflow-x-auto scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-transparent pb-2">
                                        {CONTACT_FILTER_TAGS.map((tag) => (
                                            <button
                                                key={tag.value}
                                                type="button"
                                                onClick={() => setContactFilterTag(tag.value)}
                                                className={cn(
                                                    'px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all duration-200 border',
                                                    contactFilterTag === tag.value
                                                        ? `${tag.color} border-transparent text-white shadow-md`
                                                        : 'bg-slate-800/50 border-white/5 text-gray-400 hover:text-white hover:border-white/20'
                                                )}
                                            >
                                                {tag.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Contacts Count */}
                                <div className="px-4 py-2 text-[10px] text-gray-500 uppercase tracking-wider font-semibold border-b border-white/5">
                                    {contactsWithPlatforms.length} contact{contactsWithPlatforms.length !== 1 ? 's' : ''}
                                    {contactSearchQuery && ` found`}
                                </div>

                                {/* Contact Items */}
                                <div className="flex-1 overflow-y-auto">
                                    {isContactsLoading ? (
                                        <div className="flex items-center justify-center h-32">
                                            <div className="animate-spin w-6 h-6 border-2 border-sky-500 border-t-transparent rounded-full" />
                                        </div>
                                    ) : contactsWithPlatforms.length > 0 ? (
                                        <div className="divide-y divide-white/5">
                                            {contactsWithPlatforms.map((contact) => (
                                                <ContactListItem
                                                    key={contact.id}
                                                    contact={contact}
                                                    isSelected={selectedContact?.id === contact.id}
                                                    onClick={() => handleSelectContact(contact.id)}
                                                />
                                            ))}
                                        </div>
                                    ) : (
                                        <EmptyState
                                            text={contactSearchQuery ? 'No contacts found' : 'No contacts yet'}
                                            subtext={contactSearchQuery ? 'Try a different search' : 'Add your first contact to start'}
                                        />
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Main Chat Area */}
            {showChatWindow && !showMobileInfoPanel && (
                <div className="flex-1 flex flex-col min-h-0 min-w-0 bg-slate-900/50 backdrop-blur-sm relative z-0">
                    {selectedChat ? (
                        <>
                            {/* Header */}
                            <div className="h-16 px-4 flex items-center gap-4 border-b border-white/5 bg-slate-900/80 backdrop-blur-md sticky top-0 z-10">
                                {isMobile ? (
                                    <button
                                        onClick={handleBack}
                                        className="p-2 -ml-2 text-gray-400 hover:text-white rounded-full hover:bg-white/10"
                                    >
                                        <ArrowLeft className="w-5 h-5" />
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => setShowLeftPanel(!showLeftPanel)}
                                        className="p-2 -ml-2 text-gray-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
                                    >
                                        {showLeftPanel ? <PanelLeftClose className="w-5 h-5" /> : <PanelLeft className="w-5 h-5" />}
                                    </button>
                                )}

                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <h2 className="text-white font-medium truncate text-lg">{selectedChat.title}</h2>
                                        {selectedChat.isGroup && (
                                            <span className="px-1.5 py-0.5 text-[10px] bg-purple-500/20 text-purple-400 border border-purple-500/20 rounded font-medium">Group</span>
                                        )}
                                    </div>
                                    <p className="text-xs text-gray-400 truncate flex items-center gap-1">
                                        <span className={cn(
                                            'w-1.5 h-1.5 rounded-full',
                                            selectedChat.platform === 'whatsapp' ? 'bg-emerald-500' : 'bg-gray-500'
                                        )} />
                                        {selectedChat.externalId || selectedChat.platform.replace('-', ' ')}
                                    </p>
                                </div>

                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={handleRefreshMessages}
                                        disabled={isRefreshing}
                                        className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50"
                                    >
                                        <RefreshCw className={cn('w-5 h-5', isRefreshing && 'animate-spin')} />
                                    </button>
                                    <button
                                        onClick={() => setShowInfoPanel(!showInfoPanel)}
                                        className={cn(
                                            'p-2 rounded-lg transition-all duration-200',
                                            showInfoPanel
                                                ? 'text-sky-400 bg-sky-500/10'
                                                : 'text-gray-400 hover:text-white hover:bg-white/10'
                                        )}
                                    >
                                        <Info className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>

                            {/* Chat Window */}
                            <ChatWindow
                                chat={selectedChat}
                                messages={convertedMessages}
                                isLoading={isLoading}
                                hasMore={hasMoreMessages}
                                onLoadMore={handleLoadMore}
                                onSend={handleSendMessage}
                                isSending={isSending}
                                typingUsers={typingUsers}
                                onTyping={handleTyping}
                                onToggleInfo={() => setShowInfoPanel(!showInfoPanel)}
                                showInfo={showInfoPanel && !isMobile}
                                className="flex-1 h-0"
                                hideHeader={true}
                            />
                        </>
                    ) : (
                        !isMobile && (
                            <div className="flex-1 flex flex-col">
                                {/* Header for empty state */}
                                <div className="h-16 px-4 flex items-center border-b border-white/5 bg-slate-900/50">
                                    <button
                                        onClick={() => setShowLeftPanel(!showLeftPanel)}
                                        className="p-2 -ml-2 text-gray-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
                                    >
                                        {showLeftPanel ? <PanelLeftClose className="w-5 h-5" /> : <PanelLeft className="w-5 h-5" />}
                                    </button>
                                </div>
                                <EmptyState
                                    text={viewMode === 'contacts' && selectedContact ? 'No conversations for this contact' : 'Select a conversation'}
                                    subtext={viewMode === 'contacts' ? 'Start a new conversation to communicate' : 'Or create a new one to start messaging'}
                                />
                            </div>
                        )
                    )}
                </div>
            )}

            {/* Info Panel */}
            {showInfoPanel && selectedChat && !isMobile && (
                <div className="w-80 border-l border-white/5 bg-slate-900/80 backdrop-blur-xl shadow-2xl z-20 transition-all duration-300">
                    <ContactInfoPanel
                        chat={selectedChat}
                        contact={selectedContact ? {
                            id: selectedContact.id,
                            displayName: selectedContact.displayName,
                            primaryPhone: selectedContact.primaryPhone || undefined,
                            primaryEmail: selectedContact.primaryEmail || undefined,
                            primaryTelegramUsername: selectedContact.primaryTelegramUsername || undefined,
                            company: selectedContact.company || undefined,
                            notes: selectedContact.notes || undefined,
                            isBlocked: selectedContact.isBlocked,
                            isFavorite: selectedContact.isFavorite,
                            identifiers: selectedContactIdentifiers.map(id => ({
                                id: id.id,
                                platform: id.platform,
                                identifierType: id.identifierType,
                                identifierValue: id.identifierValue,
                            })),
                            tags: selectedContactTags.map(t => ({
                                tagName: t.name,
                                tagColor: t.color || undefined,
                            })),
                        } : undefined}
                        onClose={() => setShowInfoPanel(false)}
                    />
                </div>
            )}

            {/* Mobile Info Overlay */}
            {showMobileInfoPanel && selectedChat && (
                <div className="fixed inset-0 z-50 bg-slate-900">
                    <ContactInfoPanel
                        chat={selectedChat}
                        contact={selectedContact ? {
                            id: selectedContact.id,
                            displayName: selectedContact.displayName,
                            primaryPhone: selectedContact.primaryPhone || undefined,
                            primaryEmail: selectedContact.primaryEmail || undefined,
                            primaryTelegramUsername: selectedContact.primaryTelegramUsername || undefined,
                            company: selectedContact.company || undefined,
                            notes: selectedContact.notes || undefined,
                            isBlocked: selectedContact.isBlocked,
                            isFavorite: selectedContact.isFavorite,
                            identifiers: selectedContactIdentifiers.map(id => ({
                                id: id.id,
                                platform: id.platform,
                                identifierType: id.identifierType,
                                identifierValue: id.identifierValue,
                            })),
                            tags: selectedContactTags.map(t => ({
                                tagName: t.name,
                                tagColor: t.color || undefined,
                            })),
                        } : undefined}
                        onClose={() => setShowInfoPanel(false)}
                    />
                </div>
            )}

            {/* Add Contact Modal */}
            <AddContactModal
                isOpen={showAddContactModal}
                onClose={() => setShowAddContactModal(false)}
                onSuccess={handleAddContactSuccess}
            />

            {/* Force Resync Modal (only for destructive full resync) */}
            {currentAgent && (
                <ForceResyncModal
                    open={showResyncModal}
                    onClose={handleCloseResyncModal}
                    onConfirm={executeForceResync}
                    onComplete={handleResyncComplete}
                    agentName={currentAgent.name}
                    agentId={currentAgent.id}
                />
            )}

            {/* Non-blocking Sync Progress Toast (bottom-right) */}
            <SyncProgressToast
                agentId={currentAgent?.id || null}
                onComplete={handleSyncComplete}
            />

            {/* Delete All Messages Confirmation Dialog */}
            <ConfirmDialog
                open={showDeleteMessagesDialog}
                onClose={() => setShowDeleteMessagesDialog(false)}
                onConfirm={async () => {
                    setIsDeleting(true);
                    try {
                        await handleDeleteAllMessages();
                        setShowDeleteMessagesDialog(false);
                    } catch (error: any) {
                        console.error('Delete messages error:', error);
                        // Toast is already shown by the handler or will show generic error
                    } finally {
                        setIsDeleting(false);
                    }
                }}
                title="Delete All Messages"
                message={`Are you sure you want to delete ALL messages, conversations, and media for ${currentAgent?.name || 'this agent'}? This action cannot be undone.`}
                confirmText="Delete All"
                variant="danger"
                loading={isDeleting}
            />

            {/* Delete All Contacts Confirmation Dialog */}
            <ConfirmDialog
                open={showDeleteContactsDialog}
                onClose={() => setShowDeleteContactsDialog(false)}
                onConfirm={async () => {
                    setIsDeleting(true);
                    try {
                        await handleDeleteAllContacts();
                        setShowDeleteContactsDialog(false);
                    } catch (error: any) {
                        console.error('Delete contacts error:', error);
                        // Toast is already shown by the handler or will show generic error
                    } finally {
                        setIsDeleting(false);
                    }
                }}
                title="Delete All Contacts"
                message={`Are you sure you want to delete ALL contacts for ${currentAgent?.name || 'this agent'}? This action cannot be undone.`}
                confirmText="Delete All"
                variant="danger"
                loading={isDeleting}
            />
        </div>
    );
}
