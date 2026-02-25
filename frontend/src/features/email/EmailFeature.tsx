/**
 * EmailFeature Component
 * Main email interface with thread list, thread view, and composer
 */

import React, { useState } from 'react';
import {
  Mail,
  Send,
  FileText,
  Archive,
  Trash2,
  AlertTriangle,
  Search,
  RefreshCw,
  Plus,
  PanelLeftClose,
  PanelLeft,
  ArrowLeft,
  Inbox,
  Star,
  Clock,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useIsMobile } from '../../hooks/useMediaQuery';
import { EmailList } from './components/EmailList';
import { EmailThread } from './components/EmailThread';
import { EmailComposer } from './components/EmailComposer';
import { useEmailLogic } from './hooks/useEmailLogic';
import type { EmailFolder } from './types';

interface FolderItem {
  id: EmailFolder;
  label: string;
  icon: React.ElementType;
  color: string;
}

const FOLDERS: FolderItem[] = [
  { id: 'inbox', label: 'Inbox', icon: Inbox, color: 'text-sky-400' },
  { id: 'sent', label: 'Sent', icon: Send, color: 'text-emerald-400' },
  { id: 'drafts', label: 'Drafts', icon: FileText, color: 'text-amber-400' },
  { id: 'archive', label: 'Archive', icon: Archive, color: 'text-gray-400' },
  { id: 'trash', label: 'Trash', icon: Trash2, color: 'text-red-400' },
  { id: 'spam', label: 'Spam', icon: AlertTriangle, color: 'text-orange-400' },
];

export const EmailFeature: React.FC = () => {
  const {
    // State
    selectedAgentId,
    setSelectedAgentId,
    selectedFolder,
    setSelectedFolder,
    selectedThreadId,
    searchQuery,
    setSearchQuery,
    isLoading,
    isLoadingMore,
    isRefreshing,
    hasMoreMessages,
    showComposer,
    composerState,

    // Data
    emailAgents,
    emailThreads,
    selectedThread,
    emailMessages,

    // Handlers
    handleSelectThread,
    handleBack,
    handleRefresh,
    handleLoadMore,
    handleReply,
    handleStar,
    handleSendEmail,
    handleTranslate,
    handleRephrase,
    handleComposeNew,
    handleCloseComposer,
  } = useEmailLogic();

  const [showLeftPanel, setShowLeftPanel] = useState(true);
  const isMobile = useIsMobile();

  // Mobile view logic
  const showSidebar = isMobile ? !selectedThreadId : showLeftPanel;
  const showThreadView = isMobile ? !!selectedThreadId : true;

  return (
    <div className="h-full flex min-h-0 bg-slate-900 overflow-hidden relative">
      {/* Background */}
      <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-indigo-900/20 via-slate-900 to-slate-900 -z-10 pointer-events-none" />

      {/* Sidebar - Folders & Thread List */}
      {showSidebar && (
        <div className={cn(
          'border-r border-white/5 flex flex-col min-h-0 transition-all duration-300',
          isMobile ? 'w-full' : 'w-80',
          'bg-slate-900/80 backdrop-blur-xl'
        )}>
          {/* Header */}
          <div className="h-16 px-4 flex items-center justify-between border-b border-white/5 bg-slate-900/50">
            <h1 className="text-lg font-semibold text-white tracking-tight flex items-center gap-2">
              <Mail className="w-5 h-5 text-sky-400" />
              Email
            </h1>
            <div className="flex items-center gap-2">
              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="p-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors disabled:opacity-50"
              >
                <RefreshCw className={cn('w-5 h-5', isRefreshing && 'animate-spin')} />
              </button>
              <button
                onClick={handleComposeNew}
                className="p-2 bg-sky-500 hover:bg-sky-400 text-white rounded-lg transition-colors"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Agent Selector */}
          <div className="px-3 py-2 border-b border-white/5">
            <select
              value={selectedAgentId || ''}
              onChange={(e) => setSelectedAgentId(e.target.value || undefined)}
              className="w-full px-3 py-2 bg-slate-800/50 border border-white/10 rounded-lg text-sm text-gray-300 focus:outline-none focus:border-sky-500/50"
            >
              <option value="">All email accounts</option>
              {emailAgents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
          </div>

          {/* Folders */}
          <div className="px-2 py-2 border-b border-white/5">
            <div className="space-y-0.5">
              {FOLDERS.map((folder) => {
                const Icon = folder.icon;
                const isActive = selectedFolder === folder.id;
                // Count for this folder (simplified - would come from API)
                const count = folder.id === 'inbox' ? emailThreads.filter(t => t.unreadCount > 0).length : 0;

                return (
                  <button
                    key={folder.id}
                    onClick={() => setSelectedFolder(folder.id)}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                      isActive
                        ? 'bg-sky-500/10 text-white'
                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                    )}
                  >
                    <Icon className={cn('w-4 h-4', isActive ? folder.color : '')} />
                    <span className="flex-1 text-left">{folder.label}</span>
                    {count > 0 && (
                      <span className="px-1.5 py-0.5 text-[10px] bg-sky-500/20 text-sky-400 rounded-full font-medium">
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Search */}
          <div className="px-3 py-2 border-b border-white/5">
            <div className="relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 group-focus-within:text-sky-400 transition-colors" />
              <input
                type="text"
                placeholder="Search emails..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-800/50 border border-white/10 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-sky-500/50"
              />
            </div>
          </div>

          {/* Thread List */}
          <EmailList
            threads={emailThreads}
            selectedId={selectedThreadId || undefined}
            onSelect={handleSelectThread}
            onStar={(id, starred) => handleStar(id, starred)}
            isLoading={isLoading}
            className="flex-1"
          />
        </div>
      )}

      {/* Main Content - Thread View or Empty State */}
      {showThreadView && (
        <div className="flex-1 flex flex-col min-h-0 min-w-0 bg-slate-900/50 backdrop-blur-sm">
          {selectedThread && emailMessages.length > 0 ? (
            <>
              {/* Thread Header */}
              <div className="px-4 py-3 flex items-center gap-4 border-b border-white/5 bg-slate-900/80 backdrop-blur-md">
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
                    className="p-2 -ml-2 text-gray-400 hover:text-white rounded-lg hover:bg-white/10"
                  >
                    {showLeftPanel ? <PanelLeftClose className="w-5 h-5" /> : <PanelLeft className="w-5 h-5" />}
                  </button>
                )}

                <div className="flex-1 min-w-0">
                  <h2 className="text-white font-medium truncate">
                    {selectedThread.subject || '(No Subject)'}
                  </h2>
                  <div className="flex items-center gap-2 mt-0.5">
                    {selectedThread.participants.length > 0 && (
                      <span className="text-xs text-gray-400 truncate">
                        {selectedThread.participants[0].email || selectedThread.participants[0].name}
                      </span>
                    )}
                    <span className="text-xs text-gray-600">·</span>
                    <span className="text-xs text-gray-500">
                      {selectedThread.messageCount} message{selectedThread.messageCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleStar(selectedThread.id, !selectedThread.isStarred)}
                    className={cn(
                      'p-2 rounded-lg transition-colors',
                      selectedThread.isStarred
                        ? 'text-amber-400 hover:text-amber-300'
                        : 'text-gray-400 hover:text-amber-400'
                    )}
                  >
                    <Star className={cn('w-5 h-5', selectedThread.isStarred && 'fill-current')} />
                  </button>
                  <button
                    onClick={handleRefresh}
                    disabled={isRefreshing}
                    className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={cn('w-5 h-5', isRefreshing && 'animate-spin')} />
                  </button>
                </div>
              </div>

              {/* Thread Messages */}
              <EmailThread
                messages={emailMessages}
                subject={selectedThread.subject}
                onReply={handleReply}
                onStar={(id, starred) => handleStar(id, starred)}
                onTranslate={handleTranslate}
                onRephrase={() => {}}
                isLoading={isLoading}
                className="flex-1"
              />

              {/* Quick Reply Bar */}
              <div className="px-4 py-3 border-t border-white/5 bg-slate-900/50">
                <button
                  onClick={() => {
                    const lastMsg = emailMessages[emailMessages.length - 1];
                    if (lastMsg) handleReply(lastMsg.id, 'reply');
                  }}
                  className="w-full px-4 py-2.5 bg-slate-800/50 hover:bg-slate-800 border border-white/10 rounded-lg text-sm text-gray-400 hover:text-white transition-colors text-left"
                >
                  Click to reply...
                </button>
              </div>
            </>
          ) : (
            !isMobile && (
              <div className="flex-1 flex flex-col">
                {/* Header */}
                <div className="h-16 px-4 flex items-center border-b border-white/5 bg-slate-900/50">
                  <button
                    onClick={() => setShowLeftPanel(!showLeftPanel)}
                    className="p-2 -ml-2 text-gray-400 hover:text-white rounded-lg hover:bg-white/10"
                  >
                    {showLeftPanel ? <PanelLeftClose className="w-5 h-5" /> : <PanelLeft className="w-5 h-5" />}
                  </button>
                </div>

                {/* Empty state */}
                <div className="flex-1 flex flex-col items-center justify-center">
                  <div className="w-20 h-20 rounded-full bg-slate-800/50 flex items-center justify-center mb-4">
                    <Mail className="w-10 h-10 text-gray-500" />
                  </div>
                  <h3 className="text-lg font-medium text-white mb-1">No email selected</h3>
                  <p className="text-sm text-gray-500 mb-4">Select an email to view its contents</p>
                  <button
                    onClick={handleComposeNew}
                    className="flex items-center gap-2 px-4 py-2 bg-sky-500 hover:bg-sky-400 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Compose New Email
                  </button>
                </div>
              </div>
            )
          )}
        </div>
      )}

      {/* Composer Modal */}
      {showComposer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl">
            <EmailComposer
              initialState={composerState || undefined}
              onSend={handleSendEmail}
              onDiscard={handleCloseComposer}
              onRephrase={handleRephrase}
              isOpen={true}
            />
          </div>
        </div>
      )}
    </div>
  );
};
