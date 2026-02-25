import React, { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { useSuperBrainStore } from '../../../stores/superbrainStore';

/**
 * Translation Settings Component
 * Configure how messages are translated in conversations.
 */
export default function TranslationSettings() {
  const {
    settings,
    supportedLanguages,
    availableProviders,
    loading,
    loadingProviders,
    error,
    fetchSettings,
    updateSettings,
    fetchAvailableProviders,
    clearError,
  } = useSuperBrainStore();

  const [localSettings, setLocalSettings] = useState(settings);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSettings();
    fetchAvailableProviders();
  }, [fetchSettings, fetchAvailableProviders]);

  useEffect(() => {
    if (settings) {
      setLocalSettings(settings);
    }
  }, [settings]);

  const handleSave = async () => {
    if (!localSettings) return;
    setSaving(true);
    try {
      await updateSettings(localSettings);
    } catch {
      // Error handled in store
    } finally {
      setSaving(false);
    }
  };

  const updateLocal = (key: string, value: unknown) => {
    if (!localSettings) return;
    setLocalSettings({ ...localSettings, [key]: value });
  };

  // Get API and CLI providers for grouping
  const apiProviders = availableProviders.filter(p => p.type === 'api');
  const cliProviders = availableProviders.filter(p => p.type === 'cli');

  if (loading && !settings) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500" />
      </div>
    );
  }

  return (
    <div>
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 mb-6">
          <p className="text-red-400">{error}</p>
          <button type="button" onClick={clearError} className="text-sm text-red-300 hover:text-red-200 mt-2">
            Dismiss
          </button>
        </div>
      )}

      <div className="space-y-6">
        {/* Default Language */}
        <div>
          <label className="block text-sm font-medium text-dark-200 mb-2">
            Default Translation Language
          </label>
          <select
            value={localSettings?.translationLanguage || 'en'}
            onChange={(e) => updateLocal('translationLanguage', e.target.value)}
            className="input-field w-full max-w-xs"
            aria-label="Default Translation Language"
          >
            {supportedLanguages.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.name} ({lang.code})
              </option>
            ))}
          </select>
          <p className="text-dark-500 text-xs mt-1">
            Messages will be translated to this language by default
          </p>
        </div>

        {/* Translation Provider */}
        <div>
          <label className="block text-sm font-medium text-dark-200 mb-2">
            Translation Provider
          </label>
          <select
            value={localSettings?.translationProvider || 'system'}
            onChange={(e) => updateLocal('translationProvider', e.target.value)}
            className="input-field w-full max-w-md"
            disabled={loadingProviders}
            aria-label="Translation Provider"
          >
            <option value="system">Use Task Routing (Recommended)</option>
            <optgroup label="API Providers">
              {apiProviders.map((provider) => (
                <option
                  key={provider.id}
                  value={provider.id}
                  disabled={!provider.isConfigured}
                >
                  {provider.name}
                  {!provider.isConfigured ? ' (Not configured)' : ''}
                </option>
              ))}
            </optgroup>
            <optgroup label="CLI Providers">
              {cliProviders.map((provider) => (
                <option
                  key={provider.id}
                  value={provider.id}
                  disabled={!provider.isAuthenticated}
                >
                  {provider.name}
                  {!provider.isAuthenticated ? ' (Not authenticated)' : ''}
                </option>
              ))}
            </optgroup>
          </select>
          <p className="text-dark-500 text-xs mt-1">
            Select a provider for translation tasks, or use Task Routing to automatically select based on task complexity
          </p>
        </div>

        {/* Auto Translate */}
        <div className="flex items-center justify-between">
          <div>
            <label className="block text-sm font-medium text-dark-200">
              Auto-translate incoming messages
            </label>
            <p className="text-dark-500 text-xs mt-1">
              Automatically translate incoming messages to your default language
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={localSettings?.autoTranslate || false}
              onChange={(e) => updateLocal('autoTranslate', e.target.checked)}
              className="sr-only peer"
              aria-label="Auto-translate incoming messages"
            />
            <div className="w-11 h-6 bg-dark-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-500" />
          </label>
        </div>

        {/* Show Original */}
        <div className="flex items-center justify-between">
          <div>
            <label className="block text-sm font-medium text-dark-200">
              Show original with translation
            </label>
            <p className="text-dark-500 text-xs mt-1">
              Display original message alongside translated version
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={localSettings?.showOriginalWithTranslation !== false}
              onChange={(e) => updateLocal('showOriginalWithTranslation', e.target.checked)}
              className="sr-only peer"
              aria-label="Show original with translation"
            />
            <div className="w-11 h-6 bg-dark-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-500" />
          </label>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end mt-6 pt-6 border-t border-dark-700">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="btn-primary flex items-center gap-2"
        >
          {saving ? (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          Save Changes
        </button>
      </div>
    </div>
  );
}
