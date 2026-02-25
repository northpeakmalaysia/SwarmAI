import React, { useState, useEffect, useCallback } from 'react';
import {
  MessageSquare,
  Bot,
  Send,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Clock,
  CheckCircle2,
  AlertCircle,
  Filter,
  Search,
  ArrowRight,
  Reply,
  Forward,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { Input } from '../common/Input';
import { Modal } from '../common/Modal';
import { Tabs } from '../common/Tabs';
import toast from 'react-hot-toast';
import api from '../../services/api';
import { formatRelativeTime } from '@/utils/dateFormat';

export interface AIMessagingPanelProps {
  agenticId: string;
  className?: string;
}

interface AIMessage {
  id: string;
  fromAgenticId: string;
  fromAgenticName: string;
  toAgenticId: string;
  toAgenticName: string;
  messageType: 'query' | 'response' | 'delegation' | 'handoff' | 'broadcast' | 'context_share';
  subject: string;
  content: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  status: 'sent' | 'delivered' | 'read' | 'acknowledged' | 'responded';
  threadId?: string;
  parentMessageId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  readAt?: string;
  acknowledgedAt?: string;
}

interface Thread {
  id: string;
  subject: string;
  participants: { id: string; name: string }[];
  messageCount: number;
  lastMessageAt: string;
  status: 'active' | 'closed';
}

const messageTypeConfig = {
  query: { icon: MessageSquare, color: 'text-blue-400', bg: 'bg-blue-500/10', label: 'Query' },
  response: { icon: Reply, color: 'text-emerald-400', bg: 'bg-emerald-500/10', label: 'Response' },
  delegation: { icon: Forward, color: 'text-purple-400', bg: 'bg-purple-500/10', label: 'Delegation' },
  handoff: { icon: ArrowRight, color: 'text-orange-400', bg: 'bg-orange-500/10', label: 'Handoff' },
  broadcast: { icon: Send, color: 'text-cyan-400', bg: 'bg-cyan-500/10', label: 'Broadcast' },
  context_share: { icon: MessageSquare, color: 'text-pink-400', bg: 'bg-pink-500/10', label: 'Context' },
};

const priorityConfig = {
  low: { color: 'text-gray-400', label: 'Low' },
  normal: { color: 'text-blue-400', label: 'Normal' },
  high: { color: 'text-orange-400', label: 'High' },
  urgent: { color: 'text-red-400', label: 'Urgent' },
};

const statusConfig = {
  sent: { color: 'text-gray-400', label: 'Sent' },
  delivered: { color: 'text-blue-400', label: 'Delivered' },
  read: { color: 'text-cyan-400', label: 'Read' },
  acknowledged: { color: 'text-emerald-400', label: 'Acknowledged' },
  responded: { color: 'text-purple-400', label: 'Responded' },
};

export const AIMessagingPanel: React.FC<AIMessagingPanelProps> = ({
  agenticId,
  className,
}) => {
  const [activeTab, setActiveTab] = useState('inbox');
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedMessage, setExpandedMessage] = useState<string | null>(null);
  const [selectedThread, setSelectedThread] = useState<Thread | null>(null);
  const [threadMessages, setThreadMessages] = useState<AIMessage[]>([]);
  const [showComposeModal, setShowComposeModal] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Compose form state
  const [composeData, setComposeData] = useState({
    toAgenticId: '',
    messageType: 'query' as AIMessage['messageType'],
    subject: '',
    content: '',
    priority: 'normal' as AIMessage['priority'],
  });

  // Fetch messages
  const fetchMessages = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await api.get(`/agentic/profiles/${agenticId}/messages?pageSize=50`);
      setMessages(response.data.messages || []);
    } catch (error) {
      console.error('Failed to fetch messages:', error);
      toast.error('Failed to load messages');
    } finally {
      setIsLoading(false);
    }
  }, [agenticId]);

  // Fetch threads
  const fetchThreads = useCallback(async () => {
    try {
      const response = await api.get(`/agentic/profiles/${agenticId}/threads`);
      setThreads(response.data.threads || []);
    } catch (error) {
      console.error('Failed to fetch threads:', error);
    }
  }, [agenticId]);

  useEffect(() => {
    fetchMessages();
    fetchThreads();
  }, [fetchMessages, fetchThreads]);

  // Mark as read
  const handleMarkRead = async (messageId: string) => {
    try {
      await api.post(`/agentic/profiles/${agenticId}/messages/${messageId}/read`);
      fetchMessages();
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  };

  // Acknowledge message
  const handleAcknowledge = async (messageId: string) => {
    try {
      await api.post(`/agentic/profiles/${agenticId}/messages/${messageId}/acknowledge`);
      toast.success('Message acknowledged');
      fetchMessages();
    } catch (error) {
      console.error('Failed to acknowledge:', error);
      toast.error('Failed to acknowledge message');
    }
  };

  // Respond to message
  const handleRespond = async (message: AIMessage) => {
    setComposeData({
      toAgenticId: message.fromAgenticId,
      messageType: 'response',
      subject: `Re: ${message.subject}`,
      content: '',
      priority: message.priority,
    });
    setShowComposeModal(true);
  };

  // Send message
  const handleSendMessage = async () => {
    if (!composeData.toAgenticId || !composeData.content.trim()) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      await api.post(`/agentic/profiles/${agenticId}/messages`, composeData);
      toast.success('Message sent');
      setShowComposeModal(false);
      setComposeData({
        toAgenticId: '',
        messageType: 'query',
        subject: '',
        content: '',
        priority: 'normal',
      });
      fetchMessages();
    } catch (error) {
      console.error('Failed to send message:', error);
      toast.error('Failed to send message');
    }
  };

  // Filter messages
  const filteredMessages = messages.filter((msg) => {
    if (typeFilter !== 'all' && msg.messageType !== typeFilter) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        msg.subject.toLowerCase().includes(query) ||
        msg.content.toLowerCase().includes(query) ||
        msg.fromAgenticName.toLowerCase().includes(query)
      );
    }
    return true;
  });

  // Inbox vs Sent
  const inboxMessages = filteredMessages.filter((msg) => msg.toAgenticId === agenticId);
  const sentMessages = filteredMessages.filter((msg) => msg.fromAgenticId === agenticId);

  // Render message card
  const renderMessageCard = (message: AIMessage) => {
    const typeConfig = messageTypeConfig[message.messageType];
    const TypeIcon = typeConfig.icon;
    const isExpanded = expandedMessage === message.id;
    const isInbox = message.toAgenticId === agenticId;
    const isUnread = isInbox && message.status === 'sent' || message.status === 'delivered';

    return (
      <div
        key={message.id}
        className={cn(
          'p-4 rounded-xl border transition-colors cursor-pointer',
          isUnread
            ? 'bg-sky-500/5 border-sky-500/30 hover:border-sky-500/50'
            : 'bg-swarm-darker border-swarm-border/20 hover:border-swarm-border/40'
        )}
        onClick={() => {
          setExpandedMessage(isExpanded ? null : message.id);
          if (isUnread) handleMarkRead(message.id);
        }}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className={cn('p-1.5 rounded-lg', typeConfig.bg)}>
              <TypeIcon className={cn('w-4 h-4', typeConfig.color)} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-white">
                  {isInbox ? message.fromAgenticName : message.toAgenticName}
                </span>
                {isUnread && (
                  <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
                )}
              </div>
              <span className="text-xs text-gray-500">{formatRelativeTime(message.createdAt)}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="default" size="sm" className={typeConfig.bg}>
              <span className={typeConfig.color}>{typeConfig.label}</span>
            </Badge>
            {message.priority !== 'normal' && (
              <Badge
                variant={message.priority === 'urgent' ? 'error' : 'warning'}
                size="sm"
              >
                {priorityConfig[message.priority].label}
              </Badge>
            )}
          </div>
        </div>

        {/* Subject */}
        <h5 className="font-medium text-gray-200 mb-1">{message.subject}</h5>

        {/* Content Preview */}
        <p className={cn('text-sm text-gray-400', !isExpanded && 'line-clamp-2')}>
          {message.content}
        </p>

        {/* Expanded Content */}
        {isExpanded && (
          <div className="mt-3 pt-3 border-t border-swarm-border/20 space-y-3">
            {/* Status */}
            <div className="flex items-center gap-4 text-xs">
              <span className={statusConfig[message.status].color}>
                <CheckCircle2 className="w-3 h-3 inline mr-1" />
                {statusConfig[message.status].label}
              </span>
              {message.readAt && (
                <span className="text-gray-500">
                  Read: {formatRelativeTime(message.readAt)}
                </span>
              )}
              {message.acknowledgedAt && (
                <span className="text-gray-500">
                  Ack: {formatRelativeTime(message.acknowledgedAt)}
                </span>
              )}
            </div>

            {/* Actions */}
            {isInbox && (
              <div className="flex items-center gap-2">
                {message.status !== 'acknowledged' && message.status !== 'responded' && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAcknowledge(message.id);
                    }}
                    icon={<CheckCircle2 className="w-3 h-3" />}
                  >
                    Acknowledge
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="primary"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRespond(message);
                  }}
                  icon={<Reply className="w-3 h-3" />}
                >
                  Respond
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-sky-400" />
          <h4 className="text-sm font-medium text-gray-400">AI-to-AI Messaging</h4>
          <Badge variant="default" size="sm">
            {inboxMessages.filter((m) => m.status === 'sent' || m.status === 'delivered').length} unread
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              fetchMessages();
              fetchThreads();
            }}
            icon={<RefreshCw className="w-4 h-4" />}
          >
            Refresh
          </Button>
          <Button
            size="sm"
            variant="primary"
            onClick={() => setShowComposeModal(true)}
            icon={<Send className="w-4 h-4" />}
          >
            Compose
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="flex-1 relative">
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search messages..."
            iconLeft={<Search className="w-4 h-4" />}
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-3 py-2 text-sm bg-swarm-dark border border-swarm-border/30 rounded-lg text-white"
        >
          <option value="all">All Types</option>
          {Object.entries(messageTypeConfig).map(([type, config]) => (
            <option key={type} value={type}>
              {config.label}
            </option>
          ))}
        </select>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <Tabs.List>
          <Tabs.Trigger value="inbox" icon={<MessageSquare className="w-4 h-4" />}>
            Inbox ({inboxMessages.length})
          </Tabs.Trigger>
          <Tabs.Trigger value="sent" icon={<Send className="w-4 h-4" />}>
            Sent ({sentMessages.length})
          </Tabs.Trigger>
          <Tabs.Trigger value="threads" icon={<Bot className="w-4 h-4" />}>
            Threads ({threads.length})
          </Tabs.Trigger>
        </Tabs.List>

        {/* Inbox Tab */}
        <Tabs.Content value="inbox" className="mt-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500" />
            </div>
          ) : inboxMessages.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No messages in inbox</p>
              <p className="text-xs mt-1">Messages from other agents will appear here</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[500px] overflow-y-auto">
              {inboxMessages.map(renderMessageCard)}
            </div>
          )}
        </Tabs.Content>

        {/* Sent Tab */}
        <Tabs.Content value="sent" className="mt-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500" />
            </div>
          ) : sentMessages.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Send className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No sent messages</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[500px] overflow-y-auto">
              {sentMessages.map(renderMessageCard)}
            </div>
          )}
        </Tabs.Content>

        {/* Threads Tab */}
        <Tabs.Content value="threads" className="mt-4">
          {threads.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Bot className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No message threads</p>
              <p className="text-xs mt-1">Conversations with other agents will be grouped here</p>
            </div>
          ) : (
            <div className="space-y-3">
              {threads.map((thread) => (
                <div
                  key={thread.id}
                  className="p-4 bg-swarm-darker rounded-xl border border-swarm-border/20 hover:border-swarm-border/40 transition-colors cursor-pointer"
                  onClick={() => setSelectedThread(thread)}
                >
                  <div className="flex items-start justify-between mb-2">
                    <h5 className="font-medium text-white">{thread.subject}</h5>
                    <Badge
                      variant={thread.status === 'active' ? 'success' : 'default'}
                      size="sm"
                    >
                      {thread.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span>{thread.messageCount} messages</span>
                    <span>•</span>
                    <span>{thread.participants.length} participants</span>
                    <span>•</span>
                    <span>{formatRelativeTime(thread.lastMessageAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Tabs.Content>
      </Tabs>

      {/* Compose Modal */}
      <Modal
        open={showComposeModal}
        onClose={() => setShowComposeModal(false)}
        title="Compose Message"
        size="md"
      >
        <div className="space-y-4 p-4">
          {/* To Agent */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              To Agent *
            </label>
            <Input
              value={composeData.toAgenticId}
              onChange={(e) => setComposeData({ ...composeData, toAgenticId: e.target.value })}
              placeholder="Agent ID or name"
            />
          </div>

          {/* Message Type & Priority */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Type</label>
              <select
                value={composeData.messageType}
                onChange={(e) =>
                  setComposeData({
                    ...composeData,
                    messageType: e.target.value as AIMessage['messageType'],
                  })
                }
                className="w-full px-3 py-2 bg-swarm-dark border border-swarm-border/30 rounded-lg text-white"
              >
                {Object.entries(messageTypeConfig).map(([type, config]) => (
                  <option key={type} value={type}>
                    {config.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Priority</label>
              <select
                value={composeData.priority}
                onChange={(e) =>
                  setComposeData({
                    ...composeData,
                    priority: e.target.value as AIMessage['priority'],
                  })
                }
                className="w-full px-3 py-2 bg-swarm-dark border border-swarm-border/30 rounded-lg text-white"
              >
                {Object.entries(priorityConfig).map(([priority, config]) => (
                  <option key={priority} value={priority}>
                    {config.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Subject */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Subject</label>
            <Input
              value={composeData.subject}
              onChange={(e) => setComposeData({ ...composeData, subject: e.target.value })}
              placeholder="Message subject"
            />
          </div>

          {/* Content */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Message *</label>
            <textarea
              value={composeData.content}
              onChange={(e) => setComposeData({ ...composeData, content: e.target.value })}
              placeholder="Enter your message..."
              className="w-full px-3 py-2 bg-swarm-dark border border-swarm-border/30 rounded-lg text-white placeholder-gray-500"
              rows={4}
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4 border-t border-swarm-border/20">
            <Button variant="ghost" onClick={() => setShowComposeModal(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSendMessage}
              icon={<Send className="w-4 h-4" />}
            >
              Send Message
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default AIMessagingPanel;
