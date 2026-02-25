import React, { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { useSuperBrainStore } from '../../../stores/superbrainStore';

/**
 * Rephrase Settings Component
 * Configure how messages are rephrased for different contexts.
 */
export default function RephraseSettings() {
  const {
    settings,
    rephraseStyles,
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
        {/* Rephrase Provider */}
        <div>
          <label className="block text-sm font-medium text-dark-200 mb-2">
            Rephrase Provider
          </label>
          <select
            value={localSettings?.rephraseProvider || 'system'}
            onChange={(e) => updateLocal('rephraseProvider', e.target.value)}
            className="input-field w-full max-w-md"
            disabled={loadingProviders}
            aria-label="Rephrase Provider"
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
            Select a provider for message rephrasing, or use Task Routing to automatically select based on task complexity
          </p>
        </div>

        {/* Default Rephrase Style */}
        <div>
          <label className="block text-sm font-medium text-dark-200 mb-2">
            Default Rephrase Style
          </label>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {Object.entries(rephraseStyles).map(([key, description]) => (
              <button
                type="button"
                key={key}
                onClick={() => updateLocal('rephraseStyle', key)}
                className={`p-3 rounded-lg border text-left transition-colors ${
                  localSettings?.rephraseStyle === key
                    ? 'border-primary-500 bg-primary-500/10 text-white'
                    : 'border-dark-600 bg-dark-800 text-dark-300 hover:border-dark-500'
                }`}
              >
                <span className="block font-medium capitalize">{key}</span>
                <span className="block text-xs mt-1 text-dark-400">{description}</span>
              </button>
            ))}
          </div>
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
