/**
 * Voice Transcription Settings Tab
 *
 * Configure voice/audio transcription settings.
 * - Local Whisper: Free local transcription using whisper.cpp or faster-whisper
 * - Cloud Transcription: AI-powered transcription with 3-level provider fallback
 * - Transcription Settings: Auto-transcribe toggle and language selection
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Mic,
  Cloud,
  Loader2,
  Check,
  AlertCircle,
  Info,
  ChevronDown,
  ChevronUp,
  Layers,
  Settings,
} from 'lucide-react';
import { Button } from '../../common/Button';
import { Badge } from '../../common/Badge';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3210';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TranscriptionProvider {
  id: string;
  name: string;
  type: string;
  hasApiKey: boolean;
  transcriptionModels: string[];
  baseUrl: string | null;
}

interface LocalWhisperStatus {
  available: boolean;
  whisperAvailable: boolean;
  ffmpegAvailable: boolean;
  version?: string;
  type?: string;
  command?: string;
  models?: Record<string, string>;
  languages?: Record<string, string>;
}

interface CloudStatus {
  enabled: boolean;
  fallbackChain: Array<{
    providerId: string;
    providerName: string;
    providerType: string;
    model: string;
  }>;
  providerStatus: Record<string, boolean>;
}

interface TranscriptionStatus {
  local: LocalWhisperStatus;
  cloud: CloudStatus;
}

interface ProvidersResponse {
  providers: TranscriptionProvider[];
  currentSettings: {
    transcriptionAutoExtract: boolean;
    transcriptionLanguage: string;
    transcriptionCloudEnabled: boolean;
    transcriptionProvider1: string;
    transcriptionModel1: string;
    transcriptionProvider2: string;
    transcriptionModel2: string;
    transcriptionProvider3: string;
    transcriptionModel3: string;
  };
}

interface TranscriptionSettings {
  // Cloud transcription settings
  transcriptionCloudEnabled: boolean;
  transcriptionProvider1: string;
  transcriptionModel1: string;
  transcriptionProvider2: string;
  transcriptionModel2: string;
  transcriptionProvider3: string;
  transcriptionModel3: string;
  // General settings
  transcriptionAutoExtract: boolean;
  transcriptionLanguage: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LANGUAGE_OPTIONS: Array<{ code: string; name: string }> = [
  { code: 'auto', name: 'Auto Detect' },
  { code: 'en', name: 'English' },
  { code: 'ms', name: 'Malay' },
  { code: 'zh', name: 'Chinese' },
  { code: 'ta', name: 'Tamil' },
  { code: 'hi', name: 'Hindi' },
  { code: 'id', name: 'Indonesian' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'th', name: 'Thai' },
  { code: 'vi', name: 'Vietnamese' },
  { code: 'ar', name: 'Arabic' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'es', name: 'Spanish' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'ru', name: 'Russian' },
  { code: 'it', name: 'Italian' },
  { code: 'nl', name: 'Dutch' },
  { code: 'tr', name: 'Turkish' },
];

/** Default models per provider type */
const DEFAULT_MODELS: Record<string, string[]> = {
  groq: ['whisper-large-v3', 'whisper-large-v3-turbo', 'distil-whisper-large-v3-en'],
  'openai-whisper': ['whisper-1'],
  'openai-compatible': ['whisper-1', 'whisper-large-v3'],
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const VoiceTranscriptionSettingsTab: React.FC = () => {
  const { token } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Section expand/collapse
  const [whisperExpanded, setWhisperExpanded] = useState(true);
  const [cloudExpanded, setCloudExpanded] = useState(true);
  const [settingsExpanded, setSettingsExpanded] = useState(true);

  // Data
  const [localStatus, setLocalStatus] = useState<LocalWhisperStatus | null>(null);
  const [cloudStatus, setCloudStatus] = useState<CloudStatus | null>(null);
  const [providers, setProviders] = useState<TranscriptionProvider[]>([]);

  // Settings form
  const [settings, setSettings] = useState<TranscriptionSettings>({
    transcriptionCloudEnabled: false,
    transcriptionProvider1: '',
    transcriptionModel1: '',
    transcriptionProvider2: '',
    transcriptionModel2: '',
    transcriptionProvider3: '',
    transcriptionModel3: '',
    transcriptionAutoExtract: false,
    transcriptionLanguage: 'auto',
  });

  // ---------------------------------------------------------------------------
  // Fetch data
  // ---------------------------------------------------------------------------

  const fetchData = useCallback(async () => {
    if (!token) return;

    setLoading(true);
    setError(null);

    try {
      const headers = { Authorization: `Bearer ${token}` };

      const [statusRes, providersRes] = await Promise.all([
        fetch(`${API_BASE}/api/superbrain/transcription/status`, { headers }),
        fetch(`${API_BASE}/api/superbrain/transcription/providers`, { headers }),
      ]);

      if (!statusRes.ok || !providersRes.ok) {
        throw new Error('Failed to fetch transcription settings');
      }

      const statusData: TranscriptionStatus = await statusRes.json();
      const providersData: ProvidersResponse = await providersRes.json();

      setLocalStatus(statusData.local);
      setCloudStatus(statusData.cloud);
      setProviders(providersData.providers || []);

      // Populate settings from current server state
      const current = providersData.currentSettings;
      if (current) {
        setSettings({
          transcriptionCloudEnabled: current.transcriptionCloudEnabled ?? false,
          transcriptionProvider1: current.transcriptionProvider1 || '',
          transcriptionModel1: current.transcriptionModel1 || '',
          transcriptionProvider2: current.transcriptionProvider2 || '',
          transcriptionModel2: current.transcriptionModel2 || '',
          transcriptionProvider3: current.transcriptionProvider3 || '',
          transcriptionModel3: current.transcriptionModel3 || '',
          transcriptionAutoExtract: current.transcriptionAutoExtract ?? false,
          transcriptionLanguage: current.transcriptionLanguage || 'auto',
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch settings');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ---------------------------------------------------------------------------
  // Save settings
  // ---------------------------------------------------------------------------

  const saveSettings = async () => {
    if (!token) return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`${API_BASE}/api/superbrain/settings`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transcriptionCloudEnabled: settings.transcriptionCloudEnabled ? 1 : 0,
          transcriptionProvider1: settings.transcriptionProvider1 || null,
          transcriptionModel1: settings.transcriptionModel1 || null,
          transcriptionProvider2: settings.transcriptionProvider2 || null,
          transcriptionModel2: settings.transcriptionModel2 || null,
          transcriptionProvider3: settings.transcriptionProvider3 || null,
          transcriptionModel3: settings.transcriptionModel3 || null,
          transcriptionAutoExtract: settings.transcriptionAutoExtract ? 1 : 0,
          transcriptionLanguage: settings.transcriptionLanguage || 'auto',
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to save transcription settings');
      }

      setSuccess('Transcription settings saved successfully');
      setTimeout(() => setSuccess(null), 3000);

      // Refresh data to reflect the new state
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** Get the list of models available for a given provider id. */
  const getModelsForProvider = (providerId: string): string[] => {
    if (!providerId) return [];

    const provider = providers.find((p) => p.id === providerId);
    if (!provider) return [];

    // Use the provider's own transcription models if available
    if (provider.transcriptionModels && provider.transcriptionModels.length > 0) {
      return provider.transcriptionModels;
    }

    // Fall back to default models for the provider type
    return DEFAULT_MODELS[provider.type] || [];
  };

  /** Get provider status indicator colour class. */
  const getStatusColor = (providerId: string): string => {
    if (!cloudStatus) return 'bg-gray-500';
    return cloudStatus.providerStatus[providerId] ? 'bg-green-500' : 'bg-red-500';
  };

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
        <span className="ml-2 text-gray-400">Loading transcription settings...</span>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-medium text-white flex items-center gap-2">
          <Mic className="w-5 h-5 text-cyan-400" />
          Voice Transcription Configuration
        </h3>
        <p className="text-sm text-gray-400 mt-1">
          Configure local and cloud-based voice/audio transcription for incoming messages.
        </p>
      </div>

      {/* Error / Success Messages */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-400" />
          <span className="text-red-200">{error}</span>
        </div>
      )}

      {success && (
        <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg flex items-center gap-3">
          <Check className="w-5 h-5 text-green-400" />
          <span className="text-green-200">{success}</span>
        </div>
      )}

      {/* ================================================================= */}
      {/* Section 1: Local Whisper (Free)                                   */}
      {/* ================================================================= */}
      <div className="border border-gray-700 rounded-lg overflow-hidden">
        <button
          type="button"
          onClick={() => setWhisperExpanded(!whisperExpanded)}
          aria-label="Toggle Local Whisper settings"
          className="w-full p-4 bg-gray-800/50 flex items-center justify-between hover:bg-gray-800/70 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Mic className="w-5 h-5 text-amber-400" />
            <div className="text-left">
              <span className="font-medium text-white">Local Whisper</span>
              <p className="text-xs text-gray-400 mt-0.5">
                Free local audio transcription using whisper.cpp or faster-whisper
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {localStatus?.available ? (
              <Badge variant="success" size="sm">Available</Badge>
            ) : (
              <Badge variant="default" size="sm">Not Available</Badge>
            )}
            {whisperExpanded ? (
              <ChevronUp className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-400" />
            )}
          </div>
        </button>

        {whisperExpanded && (
          <div className="p-4 space-y-4 border-t border-gray-700">
            {/* Info Banner */}
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-200/80">
                  Whisper runs <strong>locally</strong> on your server for free transcription.
                  No API key required. Supports multiple languages automatically.
                </p>
              </div>
            </div>

            {/* Status Details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Whisper Binary */}
              <div className="p-3 bg-gray-800/30 rounded-lg space-y-2">
                <span className="text-sm font-medium text-gray-300">Whisper Binary</span>
                <div className="flex items-center gap-2 text-sm">
                  <div
                    className={cn(
                      'w-2 h-2 rounded-full',
                      localStatus?.whisperAvailable ? 'bg-green-500' : 'bg-red-500'
                    )}
                  />
                  <span className={localStatus?.whisperAvailable ? 'text-green-400' : 'text-red-400'}>
                    {localStatus?.whisperAvailable ? 'Installed' : 'Not Found'}
                  </span>
                </div>
                {localStatus?.version && (
                  <p className="text-xs text-gray-500">Version: {localStatus.version}</p>
                )}
                {localStatus?.type && (
                  <p className="text-xs text-gray-500">Type: {localStatus.type}</p>
                )}
                {localStatus?.command && (
                  <p className="text-xs text-gray-500 font-mono">Command: {localStatus.command}</p>
                )}
              </div>

              {/* FFmpeg */}
              <div className="p-3 bg-gray-800/30 rounded-lg space-y-2">
                <span className="text-sm font-medium text-gray-300">FFmpeg (Audio Conversion)</span>
                <div className="flex items-center gap-2 text-sm">
                  <div
                    className={cn(
                      'w-2 h-2 rounded-full',
                      localStatus?.ffmpegAvailable ? 'bg-green-500' : 'bg-red-500'
                    )}
                  />
                  <span className={localStatus?.ffmpegAvailable ? 'text-green-400' : 'text-red-400'}>
                    {localStatus?.ffmpegAvailable ? 'Installed' : 'Not Found'}
                  </span>
                </div>
                <p className="text-xs text-gray-500">
                  {localStatus?.ffmpegAvailable
                    ? 'Audio files will be converted automatically before transcription.'
                    : 'Required for converting audio formats (ogg, mp4, etc.) to wav.'}
                </p>
              </div>
            </div>

            {/* Installation Help */}
            {!localStatus?.available && (
              <div className="p-3 bg-gray-800/30 rounded-lg">
                <p className="text-xs text-gray-400">
                  To enable local transcription, install whisper.cpp or faster-whisper and ffmpeg on your server.
                  Both must be available in the system PATH. Docker images include these by default.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ================================================================= */}
      {/* Section 2: Cloud Transcription (3-level fallback)                 */}
      {/* ================================================================= */}
      <div className="border border-gray-700 rounded-lg overflow-hidden">
        <button
          type="button"
          onClick={() => setCloudExpanded(!cloudExpanded)}
          aria-label="Toggle Cloud Transcription settings"
          className="w-full p-4 bg-gray-800/50 flex items-center justify-between hover:bg-gray-800/70 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Cloud className="w-5 h-5 text-purple-400" />
            <div className="text-left">
              <span className="font-medium text-white">Cloud Transcription</span>
              <p className="text-xs text-gray-400 mt-0.5">
                AI-powered transcription with 3-level provider fallback
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {providers.length > 0 ? (
              <Badge variant="info" size="sm">
                {providers.length} provider{providers.length !== 1 ? 's' : ''}
              </Badge>
            ) : (
              <Badge variant="warning" size="sm">No Providers</Badge>
            )}
            {cloudExpanded ? (
              <ChevronUp className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-400" />
            )}
          </div>
        </button>

        {cloudExpanded && (
          <div className="p-4 space-y-4 border-t border-gray-700">
            {/* Info Banner */}
            <div className="p-3 bg-purple-500/10 border border-purple-500/30 rounded-lg">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-purple-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-purple-200/80">
                  Cloud transcription uses your configured <strong>AI Providers</strong> with
                  transcription capabilities (Groq, OpenAI Whisper, OpenAI-compatible).
                  Configure a 3-level fallback chain for reliability. Used when local Whisper is unavailable.
                </p>
              </div>
            </div>

            {/* No Providers Warning */}
            {providers.length === 0 && (
              <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="text-amber-200 font-medium">No Transcription-Capable Providers</p>
                    <p className="text-amber-200/70 mt-1">
                      Add AI providers with transcription capabilities (Groq, OpenAI Whisper, etc.)
                      in the <strong>AI Providers</strong> tab to enable cloud transcription.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Cloud Enable Toggle */}
            <div className="flex items-center justify-between p-3 bg-gray-800/30 rounded-lg">
              <div>
                <span className="text-white font-medium">Enable Cloud Transcription</span>
                <p className="text-xs text-gray-400 mt-0.5">
                  Use cloud AI providers when local Whisper is unavailable or fails
                </p>
              </div>
              <button
                type="button"
                aria-label={settings.transcriptionCloudEnabled ? 'Disable Cloud Transcription' : 'Enable Cloud Transcription'}
                onClick={() =>
                  setSettings({ ...settings, transcriptionCloudEnabled: !settings.transcriptionCloudEnabled })
                }
                className={cn(
                  'w-12 h-6 rounded-full transition-colors flex items-center',
                  settings.transcriptionCloudEnabled ? 'bg-purple-500 justify-end' : 'bg-gray-600 justify-start'
                )}
              >
                <div className="w-5 h-5 bg-white rounded-full mx-0.5 shadow" />
              </button>
            </div>

            {/* 3-Level Fallback Chain */}
            {settings.transcriptionCloudEnabled && providers.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-purple-400" />
                  <label className="text-sm font-medium text-gray-300">
                    Provider Fallback Chain
                  </label>
                </div>
                <p className="text-xs text-gray-400 -mt-2">
                  Configure up to 3 providers. If Level 1 fails, it tries Level 2, then Level 3.
                </p>

                {/* Level 1 - Primary */}
                <div className="p-4 bg-gray-800/30 rounded-lg border border-gray-700 space-y-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="success" size="sm">Level 1</Badge>
                    <span className="text-sm text-white font-medium">Primary Provider</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label htmlFor="transcription-provider-1" className="text-xs text-gray-400">Provider</label>
                      <select
                        id="transcription-provider-1"
                        title="Select primary transcription provider"
                        value={settings.transcriptionProvider1}
                        onChange={(e) => {
                          const providerId = e.target.value;
                          const models = getModelsForProvider(providerId);
                          setSettings({
                            ...settings,
                            transcriptionProvider1: providerId,
                            transcriptionModel1: models[0] || '',
                          });
                        }}
                        className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:border-purple-500 focus:outline-none"
                      >
                        <option value="">Select provider...</option>
                        {providers.map((provider) => (
                          <option key={provider.id} value={provider.id}>
                            {provider.name} ({provider.type})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label htmlFor="transcription-model-1" className="text-xs text-gray-400">Model</label>
                      <select
                        id="transcription-model-1"
                        title="Select primary transcription model"
                        value={settings.transcriptionModel1}
                        onChange={(e) => setSettings({ ...settings, transcriptionModel1: e.target.value })}
                        disabled={!settings.transcriptionProvider1}
                        className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:border-purple-500 focus:outline-none disabled:opacity-50"
                      >
                        <option value="">Select model...</option>
                        {getModelsForProvider(settings.transcriptionProvider1).map((model) => (
                          <option key={model} value={model}>
                            {model}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {settings.transcriptionProvider1 && (
                    <div className="flex items-center gap-2 text-xs">
                      <div className={cn('w-2 h-2 rounded-full', getStatusColor(settings.transcriptionProvider1))} />
                      <span className="text-gray-400">
                        {cloudStatus?.providerStatus[settings.transcriptionProvider1] ? 'Available' : 'Unavailable'}
                      </span>
                    </div>
                  )}
                </div>

                {/* Level 2 - Fallback 1 */}
                <div className="p-4 bg-gray-800/30 rounded-lg border border-gray-700 space-y-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="warning" size="sm">Level 2</Badge>
                    <span className="text-sm text-white font-medium">Fallback 1</span>
                    <span className="text-xs text-gray-500">(optional)</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label htmlFor="transcription-provider-2" className="text-xs text-gray-400">Provider</label>
                      <select
                        id="transcription-provider-2"
                        title="Select fallback 1 provider"
                        value={settings.transcriptionProvider2}
                        onChange={(e) => {
                          const providerId = e.target.value;
                          const models = getModelsForProvider(providerId);
                          setSettings({
                            ...settings,
                            transcriptionProvider2: providerId,
                            transcriptionModel2: models[0] || '',
                          });
                        }}
                        className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:border-purple-500 focus:outline-none"
                      >
                        <option value="">None</option>
                        {providers.map((provider) => (
                          <option key={provider.id} value={provider.id}>
                            {provider.name} ({provider.type})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label htmlFor="transcription-model-2" className="text-xs text-gray-400">Model</label>
                      <select
                        id="transcription-model-2"
                        title="Select fallback 1 model"
                        value={settings.transcriptionModel2}
                        onChange={(e) => setSettings({ ...settings, transcriptionModel2: e.target.value })}
                        disabled={!settings.transcriptionProvider2}
                        className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:border-purple-500 focus:outline-none disabled:opacity-50"
                      >
                        <option value="">Select model...</option>
                        {getModelsForProvider(settings.transcriptionProvider2).map((model) => (
                          <option key={model} value={model}>
                            {model}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {settings.transcriptionProvider2 && (
                    <div className="flex items-center gap-2 text-xs">
                      <div className={cn('w-2 h-2 rounded-full', getStatusColor(settings.transcriptionProvider2))} />
                      <span className="text-gray-400">
                        {cloudStatus?.providerStatus[settings.transcriptionProvider2] ? 'Available' : 'Unavailable'}
                      </span>
                    </div>
                  )}
                </div>

                {/* Level 3 - Fallback 2 */}
                <div className="p-4 bg-gray-800/30 rounded-lg border border-gray-700 space-y-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="error" size="sm">Level 3</Badge>
                    <span className="text-sm text-white font-medium">Fallback 2</span>
                    <span className="text-xs text-gray-500">(optional)</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label htmlFor="transcription-provider-3" className="text-xs text-gray-400">Provider</label>
                      <select
                        id="transcription-provider-3"
                        title="Select fallback 2 provider"
                        value={settings.transcriptionProvider3}
                        onChange={(e) => {
                          const providerId = e.target.value;
                          const models = getModelsForProvider(providerId);
                          setSettings({
                            ...settings,
                            transcriptionProvider3: providerId,
                            transcriptionModel3: models[0] || '',
                          });
                        }}
                        className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:border-purple-500 focus:outline-none"
                      >
                        <option value="">None</option>
                        {providers.map((provider) => (
                          <option key={provider.id} value={provider.id}>
                            {provider.name} ({provider.type})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label htmlFor="transcription-model-3" className="text-xs text-gray-400">Model</label>
                      <select
                        id="transcription-model-3"
                        title="Select fallback 2 model"
                        value={settings.transcriptionModel3}
                        onChange={(e) => setSettings({ ...settings, transcriptionModel3: e.target.value })}
                        disabled={!settings.transcriptionProvider3}
                        className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:border-purple-500 focus:outline-none disabled:opacity-50"
                      >
                        <option value="">Select model...</option>
                        {getModelsForProvider(settings.transcriptionProvider3).map((model) => (
                          <option key={model} value={model}>
                            {model}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {settings.transcriptionProvider3 && (
                    <div className="flex items-center gap-2 text-xs">
                      <div className={cn('w-2 h-2 rounded-full', getStatusColor(settings.transcriptionProvider3))} />
                      <span className="text-gray-400">
                        {cloudStatus?.providerStatus[settings.transcriptionProvider3] ? 'Available' : 'Unavailable'}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ================================================================= */}
      {/* Section 3: Transcription Settings                                 */}
      {/* ================================================================= */}
      <div className="border border-gray-700 rounded-lg overflow-hidden">
        <button
          type="button"
          onClick={() => setSettingsExpanded(!settingsExpanded)}
          aria-label="Toggle Transcription settings"
          className="w-full p-4 bg-gray-800/50 flex items-center justify-between hover:bg-gray-800/70 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Settings className="w-5 h-5 text-cyan-400" />
            <div className="text-left">
              <span className="font-medium text-white">Transcription Settings</span>
              <p className="text-xs text-gray-400 mt-0.5">
                Auto-transcribe toggle and language preferences
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant={settings.transcriptionAutoExtract ? 'success' : 'default'} size="sm">
              {settings.transcriptionAutoExtract ? 'Auto' : 'Manual'}
            </Badge>
            {settingsExpanded ? (
              <ChevronUp className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-400" />
            )}
          </div>
        </button>

        {settingsExpanded && (
          <div className="p-4 space-y-4 border-t border-gray-700">
            {/* Auto-Transcribe Toggle */}
            <div className="flex items-center justify-between p-3 bg-gray-800/30 rounded-lg">
              <div>
                <span className="text-white font-medium">Auto-Transcribe Voice Messages</span>
                <p className="text-xs text-gray-400 mt-0.5">
                  Automatically transcribe incoming voice and audio messages
                </p>
              </div>
              <button
                type="button"
                aria-label={settings.transcriptionAutoExtract ? 'Disable auto-transcribe' : 'Enable auto-transcribe'}
                onClick={() =>
                  setSettings({ ...settings, transcriptionAutoExtract: !settings.transcriptionAutoExtract })
                }
                className={cn(
                  'w-12 h-6 rounded-full transition-colors flex items-center',
                  settings.transcriptionAutoExtract ? 'bg-green-500 justify-end' : 'bg-gray-600 justify-start'
                )}
              >
                <div className="w-5 h-5 bg-white rounded-full mx-0.5 shadow" />
              </button>
            </div>

            {/* Language Selector */}
            <div className="space-y-2">
              <label htmlFor="transcription-language" className="block text-sm font-medium text-gray-300">
                Transcription Language
              </label>
              <p className="text-xs text-gray-400">
                Select the primary language for transcription. &quot;Auto Detect&quot; works for most cases
                but specifying a language can improve accuracy.
              </p>
              <select
                id="transcription-language"
                title="Select transcription language"
                value={settings.transcriptionLanguage}
                onChange={(e) => setSettings({ ...settings, transcriptionLanguage: e.target.value })}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:border-cyan-500 focus:outline-none"
              >
                {LANGUAGE_OPTIONS.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.name} {lang.code !== 'auto' ? `(${lang.code})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Transcription Tips */}
            <div className="p-3 bg-cyan-500/10 border border-cyan-500/30 rounded-lg">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-cyan-200/80 space-y-1">
                  <p><strong>How transcription works:</strong></p>
                  <ul className="list-disc list-inside space-y-0.5 pl-1">
                    <li>Local Whisper is tried first (free, no API key needed)</li>
                    <li>If local fails, cloud providers are used as fallback</li>
                    <li>Transcribed text is stored alongside the original audio</li>
                    <li>Agents can read transcriptions to understand voice messages</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ================================================================= */}
      {/* Current Configuration Summary                                     */}
      {/* ================================================================= */}
      <div className="p-4 bg-gray-800/50 border border-gray-700 rounded-lg">
        <h4 className="text-sm font-medium text-white mb-3">Current Configuration</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          {/* Local Whisper */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Mic className="w-4 h-4 text-amber-400" />
              <span className="text-gray-400">Local Whisper:</span>
              <Badge variant={localStatus?.available ? 'success' : 'error'} size="sm">
                {localStatus?.available ? 'Available' : 'Unavailable'}
              </Badge>
            </div>
            {localStatus?.available && localStatus.type && (
              <div className="pl-6 text-xs text-gray-500">
                Type: {localStatus.type}
              </div>
            )}
          </div>

          {/* Cloud Transcription */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Cloud className="w-4 h-4 text-purple-400" />
              <span className="text-gray-400">Cloud:</span>
              <Badge variant={settings.transcriptionCloudEnabled ? 'success' : 'error'} size="sm">
                {settings.transcriptionCloudEnabled ? 'Enabled' : 'Disabled'}
              </Badge>
            </div>
            {settings.transcriptionCloudEnabled && settings.transcriptionProvider1 && (
              <div className="pl-6 text-xs text-gray-500">
                Primary: {providers.find((p) => p.id === settings.transcriptionProvider1)?.name || 'None'}
              </div>
            )}
          </div>

          {/* Auto-Transcribe */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Settings className="w-4 h-4 text-cyan-400" />
              <span className="text-gray-400">Auto:</span>
              <Badge variant={settings.transcriptionAutoExtract ? 'success' : 'default'} size="sm">
                {settings.transcriptionAutoExtract ? 'Enabled' : 'Disabled'}
              </Badge>
            </div>
            <div className="pl-6 text-xs text-gray-500">
              Language: {LANGUAGE_OPTIONS.find((l) => l.code === settings.transcriptionLanguage)?.name || 'Auto Detect'}
            </div>
          </div>
        </div>
      </div>

      {/* ================================================================= */}
      {/* Save Button                                                       */}
      {/* ================================================================= */}
      <div className="flex justify-end">
        <Button onClick={saveSettings} disabled={saving} className="min-w-[120px]">
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Check className="w-4 h-4 mr-2" />
              Save Settings
            </>
          )}
        </Button>
      </div>
    </div>
  );
};

export default VoiceTranscriptionSettingsTab;
