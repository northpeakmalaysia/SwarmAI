/**
 * AI Flow Generator Modal
 *
 * AI-to-AI flow generation: Flow Generator AI (configurable name) creates flows with SuperBrain knowledge support.
 * Architecture: User → Flow Generator AI ←→ SuperBrain (Knowledge Service) ← RAG
 *
 * The Flow Generator AI can query SuperBrain for node information during flow generation.
 * Shows conversation log including AI-to-AI communication.
 * AI name is configurable in Administration > Swarm Config (default: Athena)
 */

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  X, Sparkles, AlertCircle, Check, ChevronDown,
  Code, Eye, Loader2, Send, Bot, User, MessageSquare, Trash2,
  Brain, ChevronRight, Save, Zap, Search
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { api } from '../../services/api';
import { formatTime } from '../../utils/dateFormat';

interface GeneratedFlow {
  name: string;
  description: string;
  nodes: Array<{
    id: string;
    type: string;
    position: { x: number; y: number };
    data: Record<string, unknown>;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
  }>;
}

interface AiFlowGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onFlowGenerated: (flow: GeneratedFlow) => void;
  autoSave?: boolean;
}

interface ModelInfo {
  id: string;
  name: string;
  isFree?: boolean;
}

interface ProviderInfo {
  id: string;
  name: string;
  type: string;
  models: ModelInfo[];
  isAuthenticated?: boolean;
}

interface AiCommunicationEntry {
  from: string;
  to: string;
  content: string;
  query?: string;
  resultCount?: number;
  timestamp: string;
  provider?: string;
  model?: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  tokensUsed?: number;
  ragUsed?: boolean;
  intent?: 'QUESTION' | 'CLARIFY' | 'COMPLETE' | 'UNKNOWN' | 'IN_PROGRESS' | 'ERROR';
  conversationStatus?: 'awaiting_input' | 'in_progress' | 'completed' | 'error';
  aiCommunicationLog?: AiCommunicationEntry[];
  iterations?: number;
}

const AiFlowGeneratorModal: React.FC<AiFlowGeneratorModalProps> = ({
  isOpen,
  onClose,
  onFlowGenerated,
  autoSave = true
}) => {
  // Provider and model state
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [providersLoading, setProvidersLoading] = useState(false);
  const [showProviderDropdown, setShowProviderDropdown] = useState(false);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [providerSearch, setProviderSearch] = useState('');
  const [modelSearch, setModelSearch] = useState('');

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Generated flow state
  const [generatedFlow, setGeneratedFlow] = useState<GeneratedFlow | null>(null);
  const [editedJson, setEditedJson] = useState('');
  const [activeTab, setActiveTab] = useState<'chat' | 'preview' | 'json' | 'ai-log'>('chat');
  const [jsonError, setJsonError] = useState<string | null>(null);

  // AI-to-AI communication state
  const [showAiLog, setShowAiLog] = useState(false);
  const [aiCommunicationLog, setAiCommunicationLog] = useState<AiCommunicationEntry[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // AI name from swarm config (default: Athena)
  const [aiName, setAiName] = useState('Athena');

  // Refs
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const providerSearchRef = useRef<HTMLInputElement>(null);
  const modelSearchRef = useRef<HTMLInputElement>(null);

  // Get models for selected provider
  const currentProvider = providers.find(p => p.name === selectedProvider);
  const availableModels = currentProvider?.models || [];

  // Filter providers and models by search
  const filteredProviders = providers.filter(p =>
    p.name.toLowerCase().includes(providerSearch.toLowerCase())
  );
  const filteredModels = availableModels.filter(m =>
    (m.name || m.id).toLowerCase().includes(modelSearch.toLowerCase()) ||
    m.id.toLowerCase().includes(modelSearch.toLowerCase())
  );

  // Scroll to bottom of chat
  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Update editedJson when flow is generated
  useEffect(() => {
    if (generatedFlow) {
      setEditedJson(JSON.stringify(generatedFlow, null, 2));
    }
  }, [generatedFlow]);

  // Load providers and AI name on mount
  useEffect(() => {
    const loadProviders = async () => {
      setProvidersLoading(true);
      try {
        // api.get() returns response.data directly (already unwrapped by interceptor)
        const response = await api.get('/superbrain/providers/available') as {
          providers?: ProviderInfo[]
        };
        console.log('[AiFlowGenerator] API Response:', response);
        const providerList = response?.providers || [];
        console.log('[AiFlowGenerator] Provider list:', providerList.length, 'providers');
        // Filter to only authenticated providers
        const authenticatedProviders = providerList.filter(p => p.isAuthenticated !== false);
        console.log('[AiFlowGenerator] Authenticated providers:', authenticatedProviders.length);
        setProviders(authenticatedProviders);

        // Auto-select first provider with models
        if (authenticatedProviders.length > 0) {
          const firstWithModels = authenticatedProviders.find(p => p.models && p.models.length > 0);
          console.log('[AiFlowGenerator] First provider with models:', firstWithModels?.name, 'has', firstWithModels?.models?.length, 'models');
          if (firstWithModels) {
            setSelectedProvider(firstWithModels.name);
            if (firstWithModels.models.length > 0) {
              // Prefer free models
              const freeModel = firstWithModels.models.find(m => m.isFree || m.id?.includes(':free'));
              setSelectedModel(freeModel?.id || firstWithModels.models[0]?.id || '');
            }
          }
        }
      } catch (err) {
        console.error('[AiFlowGenerator] Failed to load providers:', err);
      } finally {
        setProvidersLoading(false);
      }
    };

    const loadAiName = async () => {
      try {
        // api.get() returns response.data directly (already unwrapped by interceptor)
        const response = await api.get('/swarm/config') as {
          config?: { flowGeneratorAiName?: string }
        };
        const name = response?.config?.flowGeneratorAiName;
        if (name) {
          setAiName(name);
        }
      } catch (err) {
        // Use default name
      }
    };

    if (isOpen) {
      loadProviders();
      loadAiName();
    }
  }, [isOpen]);

  // Update welcome message when aiName is loaded
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      setMessages([{
        id: 'welcome',
        role: 'assistant',
        content: `Hi! I'm ${aiName}, your FlowBuilder assistant. I work with SuperBrain's knowledge system to create the perfect flow for you.\n\nDescribe the automation you want to create, and I'll:\n• Ask clarifying questions if needed\n• Consult SuperBrain for node details\n• Generate a complete flow JSON\n\nYour flow will be auto-saved when complete!`,
        timestamp: new Date()
      }]);
    }
  }, [isOpen, aiName]);

  // Reset model when provider changes
  useEffect(() => {
    if (selectedProvider && currentProvider?.models?.length) {
      // For CLI providers, prefer "default" (auto) model
      const defaultModel = currentProvider.models.find(m => m.id === 'default');
      if (defaultModel) {
        setSelectedModel('default');
      } else {
        // For API providers, prefer free models
        const freeModel = currentProvider.models.find(m => m.isFree || m.id?.includes(':free'));
        setSelectedModel(freeModel?.id || currentProvider.models[0]?.id || '');
      }
    } else {
      setSelectedModel('');
    }
  }, [selectedProvider, currentProvider]);

  // Auto-save flow when generated
  const saveFlow = async (flow: GeneratedFlow) => {
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      await api.post('/flows', {
        name: flow.name,
        description: flow.description,
        nodes: flow.nodes,
        edges: flow.edges,
        trigger: flow.nodes.find(n => n.type === 'trigger')?.data?.subtype || 'manual'
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to auto-save flow:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const sendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;
    if (!selectedModel) {
      setError('Please select a model first');
      return;
    }

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: inputMessage.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);
    setError(null);

    try {
      // Build conversation history for the API
      const conversationHistory = messages
        .filter(m => m.id !== 'welcome')
        .map(m => ({ role: m.role, content: m.content }));

      const response = await api.post('/flows/generate/chat', {
        message: userMessage.content,
        conversationHistory,
        provider: selectedProvider,
        model: selectedModel
      }) as {
        data: {
          response: string;
          intent?: 'QUESTION' | 'CLARIFY' | 'COMPLETE' | 'UNKNOWN' | 'IN_PROGRESS' | 'ERROR';
          isComplete: boolean;
          conversationStatus?: 'awaiting_input' | 'in_progress' | 'completed' | 'error';
          flow?: GeneratedFlow;
          tokensUsed?: number;
          provider?: string;
          model?: string;
          aiCommunicationLog?: AiCommunicationEntry[];
          iterations?: number;
          aiName?: string;
          error?: string;
        }
      };

      // Handle both wrapped {data: {...}} and unwrapped response formats
      const data = response.data || response;

      if (data?.error) {
        setError(data.error);
        return;
      }

      // Update AI name from response (configurable in admin settings)
      if (data?.aiName) {
        setAiName(data.aiName);
      }

      // Update AI communication log
      if (data?.aiCommunicationLog && data.aiCommunicationLog.length > 0) {
        const newEntries = data.aiCommunicationLog;
        setAiCommunicationLog(prev => [...prev, ...newEntries]);
      }

      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: data?.response || '',
        timestamp: new Date(),
        tokensUsed: data?.tokensUsed,
        intent: data?.intent,
        conversationStatus: data?.conversationStatus,
        aiCommunicationLog: data?.aiCommunicationLog,
        iterations: data?.iterations
      };

      setMessages(prev => [...prev, assistantMessage]);

      // If flow was generated (Flow Generator AI confirmed COMPLETE)
      if (data?.isComplete && data?.flow) {
        setGeneratedFlow(data.flow);
        setActiveTab('preview');

        // Auto-save if enabled
        if (autoSave && data.flow) {
          await saveFlow(data.flow);
        }
      }

    } catch (err: unknown) {
      console.error('Error sending message:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to connect to server';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleJsonEdit = (value: string) => {
    setEditedJson(value);
    try {
      JSON.parse(value);
      setJsonError(null);
    } catch {
      setJsonError('Invalid JSON');
    }
  };

  const applyJsonChanges = () => {
    if (jsonError) return;
    try {
      const parsed = JSON.parse(editedJson);
      setGeneratedFlow(parsed);
    } catch {
      setJsonError('Invalid JSON');
    }
  };

  const handleImport = () => {
    if (!generatedFlow) return;

    if (activeTab === 'json' && !jsonError) {
      try {
        const parsed = JSON.parse(editedJson);
        onFlowGenerated(parsed);
      } catch {
        onFlowGenerated(generatedFlow);
      }
    } else {
      onFlowGenerated(generatedFlow);
    }
    onClose();
  };

  const clearConversation = () => {
    setMessages([{
      id: 'welcome',
      role: 'assistant',
      content: 'Conversation cleared. How can I help you create a new flow?',
      timestamp: new Date()
    }]);
    setGeneratedFlow(null);
    setEditedJson('');
    setActiveTab('chat');
    setAiCommunicationLog([]);
    setSaveSuccess(false);
  };

  const handleClose = () => {
    setMessages([]);
    setInputMessage('');
    setGeneratedFlow(null);
    setEditedJson('');
    setError(null);
    setActiveTab('chat');
    onClose();
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-5xl max-h-[90vh] shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-violet-500/20 rounded-lg">
              <Sparkles className="w-5 h-5 text-violet-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">AI Flow Generator</h2>
              <p className="text-sm text-slate-400">
                {aiName} + SuperBrain Knowledge
                {aiCommunicationLog.length > 0 && (
                  <span className="ml-2 text-violet-400">
                    ({aiCommunicationLog.filter(l => l.from === 'SuperBrain').length} knowledge queries)
                  </span>
                )}
              </p>
            </div>
            {saveSuccess && (
              <span className="flex items-center gap-1 px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded-full">
                <Check className="w-3 h-3" />
                Auto-saved
              </span>
            )}
            {isSaving && (
              <span className="flex items-center gap-1 px-2 py-1 bg-blue-500/20 text-blue-400 text-xs rounded-full">
                <Loader2 className="w-3 h-3 animate-spin" />
                Saving...
              </span>
            )}
          </div>
          <div className="flex items-center space-x-2">
            {/* Provider Selector - Searchable */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setShowProviderDropdown(!showProviderDropdown);
                  setShowModelDropdown(false);
                  setProviderSearch('');
                  setTimeout(() => providerSearchRef.current?.focus(), 100);
                }}
                className="flex items-center space-x-2 px-3 py-1.5 bg-slate-900/50 border border-slate-600 rounded-lg text-sm text-slate-300 hover:border-violet-500/50 transition-all"
              >
                <span>{selectedProvider || 'Provider'}</span>
                <ChevronDown className="w-3 h-3" />
              </button>
              {showProviderDropdown && (
                <div className="absolute z-20 right-0 mt-1 w-56 bg-slate-800 border border-slate-600 rounded-lg shadow-xl overflow-hidden">
                  {/* Search input */}
                  <div className="p-2 border-b border-slate-700">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                      <input
                        ref={providerSearchRef}
                        type="text"
                        value={providerSearch}
                        onChange={(e) => setProviderSearch(e.target.value)}
                        placeholder="Search providers..."
                        className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-900 border border-slate-600 rounded text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                      />
                    </div>
                  </div>
                  <div className="max-h-48 overflow-y-auto">
                    {providersLoading ? (
                      <div className="p-3 text-slate-400 text-sm flex items-center space-x-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Loading...</span>
                      </div>
                    ) : filteredProviders.length === 0 ? (
                      <div className="p-3 text-slate-500 text-sm text-center">No providers found</div>
                    ) : (
                      filteredProviders.map(provider => (
                        <button
                          key={provider.name}
                          type="button"
                          onClick={() => {
                            setSelectedProvider(provider.name);
                            setShowProviderDropdown(false);
                            setProviderSearch('');
                          }}
                          className={cn(
                            'w-full text-left px-4 py-2 text-sm hover:bg-slate-700/50 transition-colors',
                            selectedProvider === provider.name ? 'bg-violet-500/20 text-violet-300' : 'text-slate-300'
                          )}
                        >
                          <span>{provider.name}</span>
                          <span className="text-[10px] text-slate-500 ml-2">({provider.models?.length || 0} models)</span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Model Selector - Searchable */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  if (selectedProvider) {
                    setShowModelDropdown(!showModelDropdown);
                    setShowProviderDropdown(false);
                    setModelSearch('');
                    setTimeout(() => modelSearchRef.current?.focus(), 100);
                  }
                }}
                disabled={!selectedProvider}
                className={cn(
                  'flex items-center space-x-2 px-3 py-1.5 bg-slate-900/50 border border-slate-600 rounded-lg text-sm transition-all max-w-[200px]',
                  selectedProvider ? 'text-slate-300 hover:border-violet-500/50' : 'text-slate-500 cursor-not-allowed'
                )}
              >
                <span className="truncate">
                  {selectedModel
                    ? (availableModels.find(m => m.id === selectedModel)?.name || selectedModel)
                    : 'Model'}
                </span>
                <ChevronDown className="w-3 h-3 flex-shrink-0" />
              </button>
              {showModelDropdown && availableModels.length > 0 && (
                <div className="absolute z-20 right-0 mt-1 w-80 bg-slate-800 border border-slate-600 rounded-lg shadow-xl overflow-hidden">
                  {/* Search input */}
                  <div className="p-2 border-b border-slate-700">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                      <input
                        ref={modelSearchRef}
                        type="text"
                        value={modelSearch}
                        onChange={(e) => setModelSearch(e.target.value)}
                        placeholder="Search models..."
                        className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-900 border border-slate-600 rounded text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                      />
                    </div>
                    <div className="flex items-center gap-2 mt-2 text-[10px] text-slate-500">
                      <span>{filteredModels.length} of {availableModels.length} models</span>
                      {availableModels.filter(m => m.isFree).length > 0 && (
                        <span className="text-green-400">({availableModels.filter(m => m.isFree).length} free)</span>
                      )}
                    </div>
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {filteredModels.length === 0 ? (
                      <div className="p-3 text-slate-500 text-sm text-center">No models found</div>
                    ) : (
                      filteredModels.map(model => (
                        <button
                          key={model.id}
                          type="button"
                          onClick={() => {
                            setSelectedModel(model.id);
                            setShowModelDropdown(false);
                            setModelSearch('');
                          }}
                          className={cn(
                            'w-full text-left px-4 py-2 text-sm hover:bg-slate-700/50 transition-colors',
                            selectedModel === model.id ? 'bg-violet-500/20 text-violet-300' : 'text-slate-300',
                            model.id === 'default' && 'border-l-2 border-violet-500 bg-violet-500/10'
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate">{model.name || model.id}</span>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              {model.id === 'default' && (
                                <span className="text-[10px] text-violet-400 px-1.5 py-0.5 bg-violet-500/20 rounded flex items-center gap-1">
                                  <Zap className="w-3 h-3" />auto
                                </span>
                              )}
                              {model.isFree && model.id !== 'default' && (
                                <span className="text-[10px] text-green-400 px-1.5 py-0.5 bg-green-500/20 rounded">free</span>
                              )}
                            </div>
                          </div>
                          {model.id !== 'default' && (
                            <span className="block text-[10px] text-slate-500 truncate">{model.id}</span>
                          )}
                          {model.id === 'default' && (
                            <span className="block text-[10px] text-slate-400">Let the CLI choose the best model</span>
                          )}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={handleClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
              title="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-700">
          <button
            type="button"
            onClick={() => setActiveTab('chat')}
            className={cn(
              'flex items-center space-x-2 px-4 py-2.5 text-sm font-medium transition-colors',
              activeTab === 'chat'
                ? 'bg-slate-700/50 text-white border-b-2 border-violet-500'
                : 'text-slate-400 hover:text-white'
            )}
          >
            <MessageSquare className="w-4 h-4" />
            <span>Chat</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('preview')}
            disabled={!generatedFlow}
            className={cn(
              'flex items-center space-x-2 px-4 py-2.5 text-sm font-medium transition-colors',
              activeTab === 'preview'
                ? 'bg-slate-700/50 text-white border-b-2 border-violet-500'
                : generatedFlow
                  ? 'text-slate-400 hover:text-white'
                  : 'text-slate-600 cursor-not-allowed'
            )}
          >
            <Eye className="w-4 h-4" />
            <span>Preview</span>
            {generatedFlow && <span className="w-2 h-2 bg-green-500 rounded-full" />}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('json')}
            disabled={!generatedFlow}
            className={cn(
              'flex items-center space-x-2 px-4 py-2.5 text-sm font-medium transition-colors',
              activeTab === 'json'
                ? 'bg-slate-700/50 text-white border-b-2 border-violet-500'
                : generatedFlow
                  ? 'text-slate-400 hover:text-white'
                  : 'text-slate-600 cursor-not-allowed'
            )}
          >
            <Code className="w-4 h-4" />
            <span>JSON</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('ai-log')}
            className={cn(
              'flex items-center space-x-2 px-4 py-2.5 text-sm font-medium transition-colors',
              activeTab === 'ai-log'
                ? 'bg-slate-700/50 text-white border-b-2 border-violet-500'
                : 'text-slate-400 hover:text-white'
            )}
          >
            <Brain className="w-4 h-4" />
            <span>AI Log</span>
            {aiCommunicationLog.length > 0 && (
              <span className="w-5 h-5 rounded-full bg-violet-500/30 text-violet-400 text-xs flex items-center justify-center">
                {aiCommunicationLog.length}
              </span>
            )}
          </button>
          <div className="flex-1" />
          <button
            type="button"
            onClick={clearConversation}
            className="flex items-center space-x-2 px-4 py-2.5 text-sm text-slate-400 hover:text-white transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            <span>Clear</span>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {activeTab === 'chat' && (
            <>
              {/* Chat Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={cn(
                      'flex items-start space-x-3',
                      msg.role === 'user' && 'flex-row-reverse space-x-reverse'
                    )}
                  >
                    <div className={cn(
                      'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
                      msg.role === 'assistant' ? 'bg-violet-500/20' : 'bg-blue-500/20'
                    )}>
                      {msg.role === 'assistant' ? (
                        <Bot className="w-4 h-4 text-violet-400" />
                      ) : (
                        <User className="w-4 h-4 text-blue-400" />
                      )}
                    </div>
                    <div className={cn(
                      'flex-1 max-w-[80%]',
                      msg.role === 'user' && 'flex flex-col items-end'
                    )}>
                      <div className={cn(
                        'rounded-2xl px-4 py-3',
                        msg.role === 'assistant'
                          ? 'bg-slate-700/50 text-slate-200'
                          : 'bg-blue-600/20 text-blue-100'
                      )}>
                        <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                      </div>
                      <div className="flex items-center space-x-2 mt-1 text-xs text-slate-500">
                        <span>{formatTime(msg.timestamp instanceof Date ? msg.timestamp.toISOString() : msg.timestamp)}</span>
                        {msg.intent && msg.intent !== 'UNKNOWN' && (
                          <span className={cn(
                            'px-1.5 py-0.5 rounded text-[10px] font-medium',
                            msg.intent === 'COMPLETE' && 'bg-green-500/20 text-green-400',
                            msg.intent === 'QUESTION' && 'bg-amber-500/20 text-amber-400',
                            msg.intent === 'CLARIFY' && 'bg-blue-500/20 text-blue-400'
                          )}>
                            {msg.intent}
                          </span>
                        )}
                        {msg.tokensUsed && <span>• {msg.tokensUsed} tokens</span>}
                        {msg.iterations && msg.iterations > 1 && (
                          <span className="text-violet-400">• {msg.iterations} AI rounds</span>
                        )}
                        {msg.aiCommunicationLog && msg.aiCommunicationLog.some(l => l.from === 'SuperBrain') && (
                          <span className="flex items-center gap-1 text-cyan-400">
                            <Brain className="w-3 h-3" />
                            SuperBrain
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex items-start space-x-3">
                    <div className="w-8 h-8 rounded-full bg-violet-500/20 flex items-center justify-center">
                      <Bot className="w-4 h-4 text-violet-400" />
                    </div>
                    <div className="bg-slate-700/50 rounded-2xl px-4 py-3">
                      <div className="flex flex-col space-y-1">
                        <div className="flex items-center space-x-2">
                          <Loader2 className="w-4 h-4 animate-spin text-violet-400" />
                          <span className="text-sm text-slate-400">{aiName} is generating your flow...</span>
                        </div>
                        <div className="flex items-center space-x-2 text-xs text-slate-500">
                          <Brain className="w-3 h-3 text-cyan-400" />
                          <span>May consult SuperBrain for node details</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Error Message */}
              {error && (
                <div className="mx-4 mb-2 flex items-center space-x-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <AlertCircle className="w-4 h-4 text-red-400" />
                  <span className="text-sm text-red-300">{error}</span>
                </div>
              )}

              {/* Input Area */}
              <div className="p-4 border-t border-slate-700">
                <div className="flex items-end space-x-3">
                  <textarea
                    ref={inputRef}
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Describe the flow you want to create..."
                    className="flex-1 px-4 py-3 bg-slate-900/50 border border-slate-600 rounded-xl text-slate-200 placeholder-slate-500 resize-none focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent min-h-[48px] max-h-[120px]"
                    rows={1}
                    disabled={isLoading}
                  />
                  <button
                    type="button"
                    onClick={sendMessage}
                    disabled={isLoading || !inputMessage.trim() || !selectedModel}
                    className={cn(
                      'p-3 rounded-xl transition-all',
                      isLoading || !inputMessage.trim() || !selectedModel
                        ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                        : 'bg-violet-600 hover:bg-violet-700 text-white'
                    )}
                    title="Send message"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  Press Enter to send, Shift+Enter for new line
                </p>
              </div>
            </>
          )}

          {activeTab === 'preview' && generatedFlow && (
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="bg-slate-900/50 rounded-lg p-4">
                <h3 className="text-white font-medium mb-2">{generatedFlow.name}</h3>
                <p className="text-slate-400 text-sm">{generatedFlow.description}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-900/50 rounded-lg p-4">
                  <div className="text-xs text-slate-500 uppercase tracking-wide mb-2">Nodes</div>
                  <div className="text-2xl font-bold text-white">{generatedFlow.nodes?.length || 0}</div>
                </div>
                <div className="bg-slate-900/50 rounded-lg p-4">
                  <div className="text-xs text-slate-500 uppercase tracking-wide mb-2">Connections</div>
                  <div className="text-2xl font-bold text-white">{generatedFlow.edges?.length || 0}</div>
                </div>
              </div>
              {generatedFlow.nodes && generatedFlow.nodes.length > 0 && (
                <div className="bg-slate-900/50 rounded-lg p-4">
                  <div className="text-xs text-slate-500 uppercase tracking-wide mb-3">Flow Structure</div>
                  <div className="space-y-2">
                    {generatedFlow.nodes.map((node, idx) => (
                      <div key={node.id || idx} className="flex items-center gap-2 text-sm">
                        <span className="w-6 h-6 rounded bg-violet-500/20 text-violet-400 flex items-center justify-center text-xs font-medium">
                          {idx + 1}
                        </span>
                        <span className="text-slate-300">{node.data?.label as string || node.type}</span>
                        <span className="text-slate-600 text-xs">({node.type}:{node.data?.subtype as string})</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'json' && generatedFlow && (
            <div className="flex-1 overflow-hidden p-4 flex flex-col">
              <textarea
                value={editedJson}
                onChange={(e) => handleJsonEdit(e.target.value)}
                className="flex-1 px-4 py-3 bg-slate-900 border border-slate-600 rounded-lg text-slate-200 font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                spellCheck={false}
                title="Edit flow JSON"
                placeholder="Flow JSON configuration..."
              />
              {jsonError && (
                <div className="mt-2 text-red-400 text-sm flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4" />
                  <span>{jsonError}</span>
                </div>
              )}
              {!jsonError && editedJson !== JSON.stringify(generatedFlow, null, 2) && (
                <button
                  type="button"
                  onClick={applyJsonChanges}
                  className="mt-2 flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors self-start"
                >
                  <Check className="w-4 h-4" />
                  <span>Apply Changes</span>
                </button>
              )}
            </div>
          )}

          {activeTab === 'ai-log' && (
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <div className="flex items-center gap-2 mb-4">
                <Brain className="w-5 h-5 text-violet-400" />
                <h3 className="text-white font-medium">AI-to-AI Communication Log</h3>
                <span className="text-xs text-slate-500">
                  ({aiCommunicationLog.length} entries)
                </span>
              </div>

              {aiCommunicationLog.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  <Brain className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>No AI-to-AI communication yet</p>
                  <p className="text-sm mt-1">When {aiName} queries SuperBrain for node info, it will appear here</p>
                </div>
              ) : (
                aiCommunicationLog.map((entry, idx) => (
                  <div
                    key={idx}
                    className={cn(
                      'rounded-lg border p-3',
                      entry.from !== 'SuperBrain'
                        ? 'bg-blue-500/10 border-blue-500/30'
                        : 'bg-cyan-500/10 border-cyan-500/30'
                    )}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      {entry.from !== 'SuperBrain' ? (
                        <Bot className="w-4 h-4 text-blue-400" />
                      ) : (
                        <Brain className="w-4 h-4 text-cyan-400" />
                      )}
                      <span className={cn(
                        'text-sm font-medium',
                        entry.from !== 'SuperBrain' ? 'text-blue-400' : 'text-cyan-400'
                      )}>
                        {entry.from}
                      </span>
                      <ChevronRight className="w-3 h-3 text-slate-600" />
                      <span className="text-sm text-slate-400">{entry.to}</span>
                      <span className="flex-1" />
                      <span className="text-xs text-slate-500">
                        {formatTime(entry.timestamp)}
                      </span>
                    </div>

                    {entry.query && (
                      <div className="mb-2 p-2 bg-slate-900/50 rounded text-sm">
                        <span className="text-slate-500 text-xs uppercase">Query: </span>
                        <span className="text-slate-300">{entry.query}</span>
                      </div>
                    )}

                    <div className="text-sm text-slate-300 whitespace-pre-wrap">
                      {entry.content.length > 300
                        ? entry.content.substring(0, 300) + '...'
                        : entry.content}
                    </div>

                    {entry.resultCount !== undefined && (
                      <div className="mt-2 flex items-center gap-2 text-xs">
                        <Zap className="w-3 h-3 text-amber-400" />
                        <span className="text-amber-400">{entry.resultCount} results from RAG</span>
                      </div>
                    )}

                    {entry.provider && (
                      <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                        <span>Provider: {entry.provider}</span>
                        {entry.model && <span>• Model: {entry.model}</span>}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-slate-700">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <div className="flex items-center gap-3">
            {generatedFlow && !saveSuccess && (
              <button
                type="button"
                onClick={() => saveFlow(generatedFlow)}
                disabled={isSaving}
                className="flex items-center space-x-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg transition-colors"
                title="Save flow to library"
              >
                {isSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                <span>Save</span>
              </button>
            )}
            {generatedFlow && (
              <button
                type="button"
                onClick={handleImport}
                disabled={!!jsonError}
                className={cn(
                  'flex items-center space-x-2 px-6 py-2.5 rounded-lg font-medium transition-all',
                  jsonError
                    ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                    : 'bg-green-600 hover:bg-green-700 text-white'
                )}
              >
                <Check className="w-4 h-4" />
                <span>Import to Canvas</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default AiFlowGeneratorModal;
