/**
 * OCR & Vision Settings Tab
 *
 * Configure OCR (Tesseract) and Vision AI settings.
 * - OCR: Local text extraction from images using Tesseract
 * - Vision AI: AI-powered image analysis with 3-level provider fallback
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Eye,
  FileText,
  Loader2,
  Check,
  AlertCircle,
  Info,
  ChevronDown,
  ChevronUp,
  Layers,
  MessageSquare,
  RotateCcw,
} from 'lucide-react';
import { Button } from '../../common/Button';
import { Badge } from '../../common/Badge';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';

interface OcrLanguage {
  code: string;
  name: string;
}

interface VisionProvider {
  id: string;
  name: string;
  type: string;
  isDefault: boolean;
  hasApiKey: boolean;
  visionCapable: boolean;
  visionModels: string[];
  allModels: string[];
}

interface VisionModels {
  [key: string]: string[];
}

interface FallbackChainItem {
  providerId: string;
  providerName: string;
  providerType: string;
  model: string;
}

interface OcrStatus {
  available: boolean;
  version?: string;
  languages?: string[];
  defaultLanguageChain?: string;
  ocrLanguages: Record<string, string>;
}

interface VisionStatus {
  visionEnabled: boolean;
  ocrEnabled: boolean;
  fallbackChain: FallbackChainItem[];
  providerStatus: Record<string, boolean>;
  availableProviders: VisionProvider[];
  suggestedModels: VisionModels;
}

interface PromptPreset {
  name: string;
  description: string;
  prompt: string;
}

interface PromptData {
  currentPrompt: string;
  isCustom: boolean;
  presets: Record<string, PromptPreset>;
}

interface Settings {
  // OCR settings
  ocrEnabled: boolean;
  ocrLanguages: string;
  ocrMinConfidence: number;
  // Vision AI settings
  visionEnabled: boolean;
  visionProvider1: string;
  visionModel1: string;
  visionProvider2: string;
  visionModel2: string;
  visionProvider3: string;
  visionModel3: string;
  visionAiPrompt: string;
}

export const OcrVisionSettingsTab: React.FC = () => {
  const { token } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [ocrExpanded, setOcrExpanded] = useState(true);
  const [visionExpanded, setVisionExpanded] = useState(true);
  const [promptExpanded, setPromptExpanded] = useState(false);

  // OCR data
  const [ocrStatus, setOcrStatus] = useState<OcrStatus | null>(null);

  // Prompt data
  const [promptData, setPromptData] = useState<PromptData | null>(null);

  // Vision data
  const [visionStatus, setVisionStatus] = useState<VisionStatus | null>(null);
  const [suggestedModels, setSuggestedModels] = useState<VisionModels>({});

  // Settings
  const [settings, setSettings] = useState<Settings>({
    ocrEnabled: true,
    ocrLanguages: 'eng+msa+chi_sim',
    ocrMinConfidence: 0.3,
    visionEnabled: true,
    visionProvider1: '',
    visionModel1: '',
    visionProvider2: '',
    visionModel2: '',
    visionProvider3: '',
    visionModel3: '',
    visionAiPrompt: '',
  });

  // Fetch all data
  const fetchData = useCallback(async () => {
    if (!token) return;

    setLoading(true);
    setError(null);

    try {
      // Fetch OCR status, Vision status, Vision models, and Prompt in parallel
      const [ocrRes, visionRes, modelsRes, promptRes] = await Promise.all([
        fetch('/api/superbrain/ocr/status', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch('/api/superbrain/vision/status', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch('/api/superbrain/vision/models', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch('/api/superbrain/vision/prompt', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (!ocrRes.ok || !visionRes.ok || !modelsRes.ok) {
        throw new Error('Failed to fetch OCR/Vision settings');
      }

      const [ocrData, visionData, modelsData, promptDataRes] = await Promise.all([
        ocrRes.json(),
        visionRes.json(),
        modelsRes.json(),
        promptRes.ok ? promptRes.json() : null,
      ]);

      setOcrStatus(ocrData);
      setVisionStatus(visionData);
      setSuggestedModels(modelsData.visionModels || {});
      if (promptDataRes) {
        setPromptData(promptDataRes);
      }

      // Build settings from fetched data
      const fallbackChain = visionData.fallbackChain || [];
      setSettings({
        ocrEnabled: visionData.ocrEnabled ?? true,
        ocrLanguages: ocrData.defaultLanguageChain || 'eng+msa+chi_sim',
        ocrMinConfidence: 0.3,
        visionEnabled: visionData.visionEnabled ?? true,
        visionProvider1: fallbackChain[0]?.providerId || '',
        visionModel1: fallbackChain[0]?.model || '',
        visionProvider2: fallbackChain[1]?.providerId || '',
        visionModel2: fallbackChain[1]?.model || '',
        visionProvider3: fallbackChain[2]?.providerId || '',
        visionModel3: fallbackChain[2]?.model || '',
        visionAiPrompt: promptDataRes?.currentPrompt || '',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch settings');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Save settings
  const saveSettings = async () => {
    if (!token) return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      // Save settings and prompt in parallel
      const [settingsRes, promptRes] = await Promise.all([
        fetch('/api/superbrain/settings', {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ocrEnabled: settings.ocrEnabled ? 1 : 0,
            ocrLanguages: settings.ocrLanguages,
            ocrMinConfidence: settings.ocrMinConfidence,
            visionEnabled: settings.visionEnabled ? 1 : 0,
            visionProvider1: settings.visionProvider1 || null,
            visionModel1: settings.visionModel1 || null,
            visionProvider2: settings.visionProvider2 || null,
            visionModel2: settings.visionModel2 || null,
            visionProvider3: settings.visionProvider3 || null,
            visionModel3: settings.visionModel3 || null,
            visionAiPrompt: settings.visionAiPrompt || null,
          }),
        }),
        // Also update prompt via dedicated endpoint
        settings.visionAiPrompt ? fetch('/api/superbrain/vision/prompt', {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ prompt: settings.visionAiPrompt }),
        }) : Promise.resolve({ ok: true }),
      ]);

      if (!settingsRes.ok) {
        throw new Error('Failed to save OCR/Vision settings');
      }

      setSuccess('OCR & Vision settings saved successfully');
      setTimeout(() => setSuccess(null), 3000);

      // Refresh data to get updated fallback chain
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  // Get available languages for multi-select
  const availableLanguages: OcrLanguage[] = ocrStatus?.ocrLanguages
    ? Object.entries(ocrStatus.ocrLanguages).map(([code, name]) => ({
        code,
        name: name as string,
      }))
    : [];

  // Parse selected languages
  const selectedLanguages = settings.ocrLanguages.split('+').filter(Boolean);

  // Toggle language selection
  const toggleLanguage = (code: string) => {
    const current = new Set(selectedLanguages);
    if (current.has(code)) {
      current.delete(code);
    } else {
      current.add(code);
    }
    setSettings({
      ...settings,
      ocrLanguages: Array.from(current).join('+') || 'eng',
    });
  };

  // Get models for a provider
  const getModelsForProvider = (providerId: string): string[] => {
    if (!providerId || !visionStatus) return [];

    const provider = visionStatus.availableProviders.find(p => p.id === providerId);
    if (!provider) return [];

    // Return provider's vision models or suggested models for this type
    if (provider.visionModels.length > 0) {
      return provider.visionModels;
    }

    return suggestedModels[provider.type] || [];
  };

  // Get provider status color
  const getStatusColor = (providerId: string): string => {
    if (!visionStatus) return 'bg-gray-500';
    return visionStatus.providerStatus[providerId] ? 'bg-green-500' : 'bg-red-500';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
        <span className="ml-2 text-gray-400">Loading OCR & Vision settings...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-medium text-white flex items-center gap-2">
          <Eye className="w-5 h-5 text-purple-400" />
          OCR & Vision Configuration
        </h3>
        <p className="text-sm text-gray-400 mt-1">
          Configure text extraction (OCR) and AI-powered image analysis settings.
        </p>
      </div>

      {/* Error/Success Messages */}
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

      {/* OCR Section */}
      <div className="border border-gray-700 rounded-lg overflow-hidden">
        <button
          type="button"
          onClick={() => setOcrExpanded(!ocrExpanded)}
          aria-label="Toggle OCR settings"
          className="w-full p-4 bg-gray-800/50 flex items-center justify-between hover:bg-gray-800/70 transition-colors"
        >
          <div className="flex items-center gap-3">
            <FileText className="w-5 h-5 text-amber-400" />
            <div className="text-left">
              <span className="font-medium text-white">OCR (Text Extraction)</span>
              <p className="text-xs text-gray-400 mt-0.5">
                Extract text from images using Tesseract (local, free)
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {ocrStatus?.available ? (
              <Badge variant="success" size="sm">Available</Badge>
            ) : (
              <Badge variant="error" size="sm">Not Available</Badge>
            )}
            {ocrExpanded ? (
              <ChevronUp className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-400" />
            )}
          </div>
        </button>

        {ocrExpanded && (
          <div className="p-4 space-y-4 border-t border-gray-700">
            {/* OCR Info Banner */}
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-200/80">
                  OCR uses <strong>Tesseract</strong> (local) to extract text from images.
                  No API key required. Supports multiple languages.
                </p>
              </div>
            </div>

            {/* OCR Enable Toggle */}
            <div className="flex items-center justify-between p-3 bg-gray-800/30 rounded-lg">
              <div>
                <span className="text-white font-medium">Enable OCR</span>
                <p className="text-xs text-gray-400 mt-0.5">
                  Automatically extract text from image messages
                </p>
              </div>
              <button
                type="button"
                aria-label={settings.ocrEnabled ? 'Disable OCR' : 'Enable OCR'}
                onClick={() => setSettings({ ...settings, ocrEnabled: !settings.ocrEnabled })}
                className={cn(
                  'w-12 h-6 rounded-full transition-colors flex items-center',
                  settings.ocrEnabled ? 'bg-green-500 justify-end' : 'bg-gray-600 justify-start'
                )}
              >
                <div className="w-5 h-5 bg-white rounded-full mx-0.5 shadow" />
              </button>
            </div>

            {/* Language Selection */}
            {settings.ocrEnabled && (
              <>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-300">
                    OCR Languages
                  </label>
                  <p className="text-xs text-gray-400">
                    Select languages to detect. More languages = slower but more accurate for mixed content.
                  </p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {availableLanguages.map((lang) => (
                      <button
                        key={lang.code}
                        type="button"
                        onClick={() => toggleLanguage(lang.code)}
                        className={cn(
                          'px-3 py-1.5 rounded-lg border text-sm transition-all',
                          selectedLanguages.includes(lang.code)
                            ? 'border-purple-500 bg-purple-500/20 text-purple-200'
                            : 'border-gray-600 bg-gray-800/50 text-gray-400 hover:border-gray-500'
                        )}
                      >
                        {lang.name}
                        {selectedLanguages.includes(lang.code) && (
                          <Check className="w-3 h-3 ml-1.5 inline" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Confidence Threshold */}
                <div className="space-y-2">
                  <label htmlFor="ocr-confidence" className="block text-sm font-medium text-gray-300">
                    Minimum Confidence: {Math.round(settings.ocrMinConfidence * 100)}%
                  </label>
                  <p className="text-xs text-gray-400">
                    Only save extracted text if confidence is above this threshold
                  </p>
                  <input
                    id="ocr-confidence"
                    type="range"
                    min="0"
                    max="100"
                    value={settings.ocrMinConfidence * 100}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        ocrMinConfidence: parseInt(e.target.value) / 100,
                      })
                    }
                    title={`OCR minimum confidence: ${Math.round(settings.ocrMinConfidence * 100)}%`}
                    className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
                  />
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>0% (Accept all)</span>
                    <span>100% (Very strict)</span>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Vision AI Section */}
      <div className="border border-gray-700 rounded-lg overflow-hidden">
        <button
          type="button"
          onClick={() => setVisionExpanded(!visionExpanded)}
          aria-label="Toggle Vision AI settings"
          className="w-full p-4 bg-gray-800/50 flex items-center justify-between hover:bg-gray-800/70 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Eye className="w-5 h-5 text-purple-400" />
            <div className="text-left">
              <span className="font-medium text-white">Vision AI (Image Analysis)</span>
              <p className="text-xs text-gray-400 mt-0.5">
                AI-powered image understanding with 3-level fallback
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {visionStatus?.availableProviders && visionStatus.availableProviders.length > 0 ? (
              <Badge variant="info" size="sm">
                {visionStatus.availableProviders.length} provider{visionStatus.availableProviders.length !== 1 ? 's' : ''}
              </Badge>
            ) : (
              <Badge variant="warning" size="sm">No Providers</Badge>
            )}
            {visionExpanded ? (
              <ChevronUp className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-400" />
            )}
          </div>
        </button>

        {visionExpanded && (
          <div className="p-4 space-y-4 border-t border-gray-700">
            {/* Vision Info Banner */}
            <div className="p-3 bg-purple-500/10 border border-purple-500/30 rounded-lg">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-purple-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-purple-200/80">
                  Vision AI uses your configured <strong>AI Providers</strong> to analyze images.
                  Configure a 3-level fallback chain for reliability. Only vision-capable providers are shown.
                </p>
              </div>
            </div>

            {/* No Providers Warning */}
            {(!visionStatus?.availableProviders || visionStatus.availableProviders.length === 0) && (
              <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="text-amber-200 font-medium">No Vision-Capable Providers</p>
                    <p className="text-amber-200/70 mt-1">
                      Add AI providers with vision capabilities (Ollama with LLaVA, OpenRouter, etc.)
                      in the <strong>AI Providers</strong> tab to enable Vision AI.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Vision Enable Toggle */}
            <div className="flex items-center justify-between p-3 bg-gray-800/30 rounded-lg">
              <div>
                <span className="text-white font-medium">Enable Vision AI</span>
                <p className="text-xs text-gray-400 mt-0.5">
                  Use AI to analyze and describe image content
                </p>
              </div>
              <button
                type="button"
                aria-label={settings.visionEnabled ? 'Disable Vision AI' : 'Enable Vision AI'}
                onClick={() => setSettings({ ...settings, visionEnabled: !settings.visionEnabled })}
                className={cn(
                  'w-12 h-6 rounded-full transition-colors flex items-center',
                  settings.visionEnabled ? 'bg-purple-500 justify-end' : 'bg-gray-600 justify-start'
                )}
              >
                <div className="w-5 h-5 bg-white rounded-full mx-0.5 shadow" />
              </button>
            </div>

            {/* 3-Level Fallback Chain */}
            {settings.visionEnabled && visionStatus?.availableProviders && visionStatus.availableProviders.length > 0 && (
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
                      <label htmlFor="vision-provider-1" className="text-xs text-gray-400">Provider</label>
                      <select
                        id="vision-provider-1"
                        title="Select primary vision provider"
                        value={settings.visionProvider1}
                        onChange={(e) => {
                          const providerId = e.target.value;
                          const models = getModelsForProvider(providerId);
                          setSettings({
                            ...settings,
                            visionProvider1: providerId,
                            visionModel1: models[0] || '',
                          });
                        }}
                        className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:border-purple-500 focus:outline-none"
                      >
                        <option value="">Select provider...</option>
                        {visionStatus.availableProviders.map((provider) => (
                          <option key={provider.id} value={provider.id}>
                            {provider.name} ({provider.type})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label htmlFor="vision-model-1" className="text-xs text-gray-400">Model</label>
                      <select
                        id="vision-model-1"
                        title="Select primary vision model"
                        value={settings.visionModel1}
                        onChange={(e) => setSettings({ ...settings, visionModel1: e.target.value })}
                        disabled={!settings.visionProvider1}
                        className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:border-purple-500 focus:outline-none disabled:opacity-50"
                      >
                        <option value="">Select model...</option>
                        {getModelsForProvider(settings.visionProvider1).map((model) => (
                          <option key={model} value={model}>
                            {model}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {settings.visionProvider1 && (
                    <div className="flex items-center gap-2 text-xs">
                      <div className={cn('w-2 h-2 rounded-full', getStatusColor(settings.visionProvider1))} />
                      <span className="text-gray-400">
                        {visionStatus.providerStatus[settings.visionProvider1] ? 'Available' : 'Unavailable'}
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
                      <label htmlFor="vision-provider-2" className="text-xs text-gray-400">Provider</label>
                      <select
                        id="vision-provider-2"
                        title="Select fallback 1 provider"
                        value={settings.visionProvider2}
                        onChange={(e) => {
                          const providerId = e.target.value;
                          const models = getModelsForProvider(providerId);
                          setSettings({
                            ...settings,
                            visionProvider2: providerId,
                            visionModel2: models[0] || '',
                          });
                        }}
                        className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:border-purple-500 focus:outline-none"
                      >
                        <option value="">None</option>
                        {visionStatus.availableProviders.map((provider) => (
                          <option key={provider.id} value={provider.id}>
                            {provider.name} ({provider.type})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label htmlFor="vision-model-2" className="text-xs text-gray-400">Model</label>
                      <select
                        id="vision-model-2"
                        title="Select fallback 1 model"
                        value={settings.visionModel2}
                        onChange={(e) => setSettings({ ...settings, visionModel2: e.target.value })}
                        disabled={!settings.visionProvider2}
                        className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:border-purple-500 focus:outline-none disabled:opacity-50"
                      >
                        <option value="">Select model...</option>
                        {getModelsForProvider(settings.visionProvider2).map((model) => (
                          <option key={model} value={model}>
                            {model}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {settings.visionProvider2 && (
                    <div className="flex items-center gap-2 text-xs">
                      <div className={cn('w-2 h-2 rounded-full', getStatusColor(settings.visionProvider2))} />
                      <span className="text-gray-400">
                        {visionStatus.providerStatus[settings.visionProvider2] ? 'Available' : 'Unavailable'}
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
                      <label htmlFor="vision-provider-3" className="text-xs text-gray-400">Provider</label>
                      <select
                        id="vision-provider-3"
                        title="Select fallback 2 provider"
                        value={settings.visionProvider3}
                        onChange={(e) => {
                          const providerId = e.target.value;
                          const models = getModelsForProvider(providerId);
                          setSettings({
                            ...settings,
                            visionProvider3: providerId,
                            visionModel3: models[0] || '',
                          });
                        }}
                        className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:border-purple-500 focus:outline-none"
                      >
                        <option value="">None</option>
                        {visionStatus.availableProviders.map((provider) => (
                          <option key={provider.id} value={provider.id}>
                            {provider.name} ({provider.type})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label htmlFor="vision-model-3" className="text-xs text-gray-400">Model</label>
                      <select
                        id="vision-model-3"
                        title="Select fallback 2 model"
                        value={settings.visionModel3}
                        onChange={(e) => setSettings({ ...settings, visionModel3: e.target.value })}
                        disabled={!settings.visionProvider3}
                        className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:border-purple-500 focus:outline-none disabled:opacity-50"
                      >
                        <option value="">Select model...</option>
                        {getModelsForProvider(settings.visionProvider3).map((model) => (
                          <option key={model} value={model}>
                            {model}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {settings.visionProvider3 && (
                    <div className="flex items-center gap-2 text-xs">
                      <div className={cn('w-2 h-2 rounded-full', getStatusColor(settings.visionProvider3))} />
                      <span className="text-gray-400">
                        {visionStatus.providerStatus[settings.visionProvider3] ? 'Available' : 'Unavailable'}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Vision AI Prompt Section */}
      {settings.visionEnabled && (
        <div className="border border-gray-700 rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => setPromptExpanded(!promptExpanded)}
            aria-label="Toggle Vision AI prompt settings"
            className="w-full p-4 bg-gray-800/50 flex items-center justify-between hover:bg-gray-800/70 transition-colors"
          >
            <div className="flex items-center gap-3">
              <MessageSquare className="w-5 h-5 text-cyan-400" />
              <div className="text-left">
                <span className="font-medium text-white">Vision AI Prompt</span>
                <p className="text-xs text-gray-400 mt-0.5">
                  Customize how Vision AI analyzes images
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {promptData?.isCustom ? (
                <Badge variant="info" size="sm">Custom</Badge>
              ) : (
                <Badge variant="default" size="sm">Default</Badge>
              )}
              {promptExpanded ? (
                <ChevronUp className="w-5 h-5 text-gray-400" />
              ) : (
                <ChevronDown className="w-5 h-5 text-gray-400" />
              )}
            </div>
          </button>

          {promptExpanded && (
            <div className="p-4 space-y-4 border-t border-gray-700">
              {/* Prompt Presets */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-300">
                  Quick Presets
                </label>
                <p className="text-xs text-gray-400">
                  Choose a preset for common use cases, or write your own custom prompt below.
                </p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {promptData?.presets && Object.entries(promptData.presets).map(([key, preset]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSettings({ ...settings, visionAiPrompt: preset.prompt })}
                      title={preset.description}
                      className={cn(
                        'px-3 py-1.5 rounded-lg border text-sm transition-all',
                        settings.visionAiPrompt === preset.prompt
                          ? 'border-cyan-500 bg-cyan-500/20 text-cyan-200'
                          : 'border-gray-600 bg-gray-800/50 text-gray-400 hover:border-gray-500'
                      )}
                    >
                      {preset.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Prompt Editor */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label htmlFor="vision-ai-prompt" className="block text-sm font-medium text-gray-300">
                    Prompt
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      if (promptData?.presets?.default) {
                        setSettings({ ...settings, visionAiPrompt: promptData.presets.default.prompt });
                      }
                    }}
                    className="text-xs text-gray-400 hover:text-cyan-400 flex items-center gap-1"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Reset to default
                  </button>
                </div>
                <textarea
                  id="vision-ai-prompt"
                  value={settings.visionAiPrompt}
                  onChange={(e) => setSettings({ ...settings, visionAiPrompt: e.target.value })}
                  placeholder="Enter your custom Vision AI prompt..."
                  rows={8}
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:border-cyan-500 focus:outline-none resize-y font-mono"
                />
                <p className="text-xs text-gray-500">
                  This prompt is sent to the Vision AI model when analyzing images.
                  Use clear instructions to get the best results.
                </p>
              </div>

              {/* Prompt Tips */}
              <div className="p-3 bg-cyan-500/10 border border-cyan-500/30 rounded-lg">
                <div className="flex items-start gap-2">
                  <Info className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-cyan-200/80 space-y-1">
                    <p><strong>Tips for better prompts:</strong></p>
                    <ul className="list-disc list-inside space-y-0.5 pl-1">
                      <li>Be specific about what information you want extracted</li>
                      <li>Use numbered lists for structured output</li>
                      <li>Mention if you want text transcribed exactly</li>
                      <li>Specify output length (concise vs detailed)</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Current Configuration Summary */}
      <div className="p-4 bg-gray-800/50 border border-gray-700 rounded-lg">
        <h4 className="text-sm font-medium text-white mb-3">Current Configuration</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-amber-400" />
              <span className="text-gray-400">OCR:</span>
              <Badge variant={settings.ocrEnabled ? 'success' : 'error'} size="sm">
                {settings.ocrEnabled ? 'Enabled' : 'Disabled'}
              </Badge>
            </div>
            {settings.ocrEnabled && (
              <div className="pl-6 text-xs text-gray-500">
                Languages: {settings.ocrLanguages.split('+').join(', ')}
              </div>
            )}
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-purple-400" />
              <span className="text-gray-400">Vision AI:</span>
              <Badge variant={settings.visionEnabled ? 'success' : 'error'} size="sm">
                {settings.visionEnabled ? 'Enabled' : 'Disabled'}
              </Badge>
            </div>
            {settings.visionEnabled && settings.visionProvider1 && (
              <div className="pl-6 text-xs text-gray-500">
                Primary: {visionStatus?.availableProviders.find(p => p.id === settings.visionProvider1)?.name || 'None'}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Save Button */}
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

export default OcrVisionSettingsTab;
