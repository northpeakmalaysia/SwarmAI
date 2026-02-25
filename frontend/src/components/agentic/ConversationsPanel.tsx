/**
 * ConversationsPanel — Phase 7: Agent Conversation UI
 *
 * Lists inter-agent conversations (consultations, consensus votes).
 * Filter tabs: All | Consultations | Consensus
 * Click to open ConversationThread.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { MessageSquare, Users, Vote, RefreshCw, ChevronRight } from 'lucide-react';
import api from '@/services/api';
import { ConversationThread } from './ConversationThread';
import { formatDateTime } from '@/utils/dateFormat';

interface Conversation {
  id: string;
  type: string;
  initiator_id: string;
  participant_ids: string;
  topic: string;
  status: string;
  result: string;
  created_at: string;
  completed_at: string;
}

interface ConversationsPanelProps {
  agentId: string;
}

const typeIcons: Record<string, React.ReactNode> = {
  consultation: <MessageSquare className="w-3.5 h-3.5" />,
  consensus: <Vote className="w-3.5 h-3.5" />,
  knowledge_share: <Users className="w-3.5 h-3.5" />,
};

const typeColors: Record<string, string> = {
  consultation: 'bg-blue-500/20 text-blue-300',
  consensus: 'bg-purple-500/20 text-purple-300',
  knowledge_share: 'bg-green-500/20 text-green-300',
};

const statusColors: Record<string, string> = {
  active: 'bg-yellow-500/20 text-yellow-300',
  completed: 'bg-green-500/20 text-green-300',
  failed: 'bg-red-500/20 text-red-300',
};

type FilterType = 'all' | 'consultation' | 'consensus';

export const ConversationsPanel: React.FC<ConversationsPanelProps> = ({ agentId }) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<FilterType>('all');
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);

  const fetchConversations = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/agentic/profiles/${agentId}/conversations`);
      setConversations(data.conversations || data || []);
    } catch (err) {
      console.error('Failed to load conversations:', err);
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const filtered = filter === 'all'
    ? conversations
    : conversations.filter(c => c.type === filter);

  // Show thread if a conversation is selected
  if (selectedConvId) {
    return (
      <div>
        <button
          onClick={() => setSelectedConvId(null)}
          className="text-xs text-blue-400 hover:text-blue-300 mb-3 flex items-center gap-1"
        >
          {'<'} Back to conversations
        </button>
        <ConversationThread conversationId={selectedConvId} />
      </div>
    );
  }

  if (loading && conversations.length === 0) {
    return (
      <div className="p-6 text-center text-gray-500">
        <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />
        Loading conversations...
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Filter tabs */}
      <div className="flex gap-1 bg-gray-900 rounded-lg p-1">
        {(['all', 'consultation', 'consensus'] as FilterType[]).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`flex-1 px-3 py-1.5 text-xs rounded-md transition-colors capitalize ${
              filter === f ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {f === 'all' ? `All (${conversations.length})` : `${f} (${conversations.filter(c => c.type === f).length})`}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="p-6 text-center text-gray-500">
          <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No conversations yet.</p>
          <p className="text-xs mt-1">Agent conversations will appear here.</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {filtered.map(conv => {
            const participants = conv.participant_ids ? JSON.parse(conv.participant_ids).length : 0;

            return (
              <button
                key={conv.id}
                onClick={() => setSelectedConvId(conv.id)}
                className="w-full flex items-center gap-3 px-3 py-2.5 bg-gray-800 rounded-lg border border-gray-700 hover:border-gray-600 transition-colors text-left"
              >
                <span className={`p-1.5 rounded ${typeColors[conv.type] || 'bg-gray-700 text-gray-300'}`}>
                  {typeIcons[conv.type] || <MessageSquare className="w-3.5 h-3.5" />}
                </span>

                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white truncate">
                    {conv.topic || `${conv.type} conversation`}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span>{participants} participants</span>
                    <span>{formatDateTime(conv.created_at)}</span>
                  </div>
                </div>

                <span className={`px-2 py-0.5 rounded text-xs ${statusColors[conv.status] || 'bg-gray-700 text-gray-400'}`}>
                  {conv.status}
                </span>

                <ChevronRight className="w-4 h-4 text-gray-600" />
              </button>
            );
          })}
        </div>
      )}

      <button
        onClick={fetchConversations}
        className="w-full py-2 text-xs text-gray-500 hover:text-gray-400 flex items-center justify-center gap-1"
      >
        <RefreshCw className="w-3 h-3" /> Refresh
      </button>
    </div>
  );
};

export default ConversationsPanel;
