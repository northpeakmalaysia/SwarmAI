/**
 * ConversationThread — Phase 7: Agent Conversation UI
 *
 * Chat-style display of messages within an inter-agent conversation.
 * Shows agent names, message types, timestamps, and consensus results.
 */

import React, { useState, useEffect } from 'react';
import { MessageSquare, User, Vote, RefreshCw } from 'lucide-react';
import api from '@/services/api';
import { formatTime } from '@/utils/dateFormat';

interface ConversationMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_name?: string;
  message_type: string;
  content: string;
  metadata?: string;
  created_at: string;
}

interface ConversationThreadProps {
  conversationId: string;
}

const messageTypeColors: Record<string, string> = {
  question: 'border-blue-500',
  response: 'border-green-500',
  vote: 'border-purple-500',
  result: 'border-yellow-500',
  knowledge: 'border-cyan-500',
};

const messageTypeBadge: Record<string, string> = {
  question: 'bg-blue-500/20 text-blue-300',
  response: 'bg-green-500/20 text-green-300',
  vote: 'bg-purple-500/20 text-purple-300',
  result: 'bg-yellow-500/20 text-yellow-300',
  knowledge: 'bg-cyan-500/20 text-cyan-300',
};

export const ConversationThread: React.FC<ConversationThreadProps> = ({ conversationId }) => {
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMessages = async () => {
      setLoading(true);
      try {
        const { data } = await api.get(`/agentic/conversations/${conversationId}/messages`);
        setMessages(data.messages || data || []);
      } catch (err) {
        console.error('Failed to load conversation messages:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchMessages();
  }, [conversationId]);

  if (loading) {
    return (
      <div className="p-6 text-center text-gray-500">
        <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />
        Loading messages...
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="p-6 text-center text-gray-500">
        <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p>No messages in this conversation.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 max-h-96 overflow-y-auto">
      {messages.map(msg => {
        let meta: Record<string, string> = {};
        try { const parsed = JSON.parse(msg.metadata || '{}'); meta = Object.fromEntries(Object.entries(parsed).map(([k, v]) => [k, String(v ?? '')])); } catch { /* ignore */ }

        return (
          <div
            key={msg.id}
            className={`border-l-2 ${messageTypeColors[msg.message_type] || 'border-gray-600'} bg-gray-800 rounded-r-lg px-3 py-2`}
          >
            <div className="flex items-center gap-2 mb-1">
              <User className="w-3 h-3 text-gray-500" />
              <span className="text-xs font-medium text-gray-300">
                {msg.sender_name || msg.sender_id?.substring(0, 8) || 'Unknown'}
              </span>
              <span className={`px-1.5 py-0.5 rounded text-[10px] ${messageTypeBadge[msg.message_type] || 'bg-gray-700 text-gray-400'}`}>
                {msg.message_type}
              </span>
              <span className="flex-1" />
              <span className="text-[10px] text-gray-600">{formatTime(msg.created_at)}</span>
            </div>

            <div className="text-sm text-gray-300 whitespace-pre-wrap">
              {msg.content}
            </div>

            {/* Consensus vote display */}
            {msg.message_type === 'vote' && meta.vote && (
              <div className="mt-1 flex items-center gap-1.5">
                <Vote className="w-3 h-3 text-purple-400" />
                <span className="text-xs text-purple-300 font-medium">
                  Vote: {String(meta.vote)}
                </span>
                {meta.confidence && (
                  <span className="text-xs text-gray-500">
                    (confidence: {String(meta.confidence)})
                  </span>
                )}
              </div>
            )}

            {/* Result summary */}
            {msg.message_type === 'result' && meta.decision && (
              <div className="mt-1 bg-yellow-500/10 rounded px-2 py-1 text-xs text-yellow-300">
                Decision: {String(meta.decision)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default ConversationThread;
