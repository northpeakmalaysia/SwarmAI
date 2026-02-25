import React, { useEffect, useState } from 'react';
import { Save, RotateCcw, ChevronDown, ChevronRight, Info } from 'lucide-react';
import { useSuperBrainStore } from '../../../stores/superbrainStore';

/**
 * Advanced SuperBrain Settings Component
 * Fine-tune model preferences and failover behavior.
 * Now uses dynamic providers from user settings and Integrations.
 */
export default function AdvancedSettings() {
  const {
    settings,
    providerTiers,
    availableProviders,
    loadingProviders,
    loading,
    error,
    fetchSettings,
    updateSettings,
    resetSettings,
    fetchAvailableProviders,
    clearError,
  } = useSuperBrainStore();

  const [localSettings, setLocalSettings] = useState(settings);
  const [saving, setSaving] = useState(false);
  const [showFailover, setShowFailover] = useState(false);

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

  const handleReset = async () => {
    if (!confirm('Are you sure you want to reset all SuperBrain settings to defaults?')) return;
    setSaving(true);
    try {
      await resetSettings();
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

  if ((loading || loadingProviders) && !settings) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500" />
      </div>
    );
  }

  // Build failover display data
  const failoverData = localSettings?.customFailoverChain || providerTiers;

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

      <div className="bg-dark-800/50 rounded-lg p-4 mb-6 flex items-start gap-3">
        <Info className="w-5 h-5 text-primary-400 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-dark-300">
          <p className="font-medium text-white mb-1">Advanced Settings</p>
          <p>
            Configure custom failover chains and view configured providers.
            Model selection is managed in Task Routing settings.
          </p>
        </div>
      </div>

      <div className="space-y-6">
        {/* Custom Failover Chain - Collapsible */}
        <div className="border border-dark-600 rounded-lg">
          <button
            type="button"
            onClick={() => setShowFailover(!showFailover)}
            className="w-full flex items-center justify-between p-4 text-left"
          >
            <span className="font-medium text-dark-200">Custom Failover Chain</span>
            {showFailover ? (
              <ChevronDown className="w-5 h-5 text-dark-400" />
            ) : (
              <ChevronRight className="w-5 h-5 text-dark-400" />
            )}
          </button>
          {showFailover && (
            <div className="px-4 pb-4 border-t border-dark-600">
              <p className="text-dark-400 text-sm mt-4 mb-4">
                Configure custom failover chains for each task tier. Leave empty to use defaults.
              </p>
              <div className="bg-dark-800 rounded-lg p-4 overflow-x-auto">
                <pre className="text-dark-300 text-sm">
                  {JSON.stringify(failoverData, null, 2)}
                </pre>
              </div>
              <p className="text-dark-500 text-xs mt-2">
                Advanced configuration - contact support for custom setups
              </p>
            </div>
          )}
        </div>

        {/* Available Providers Summary */}
        <div className="border border-dark-600 rounded-lg p-4">
          <h4 className="text-sm font-medium text-dark-200 mb-3">Configured Providers</h4>
          <div className="space-y-2">
            {availableProviders.length === 0 ? (
              <p className="text-dark-400 text-sm">No providers configured</p>
            ) : (
              availableProviders.map((provider) => (
                <div
                  key={provider.id}
                  className="flex items-center justify-between text-sm"
                >
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${
                      provider.isAuthenticated ? 'bg-green-400' : 'bg-yellow-400'
                    }`} />
                    <span className="text-dark-200">{provider.name}</span>
                    <span className="text-dark-500">({provider.type})</span>
                  </div>
                  <span className="text-dark-400">
                    {provider.models.length} models
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-between mt-6 pt-6 border-t border-dark-700">
        <button
          type="button"
          onClick={handleReset}
          disabled={saving}
          className="btn-secondary flex items-center gap-2"
        >
          <RotateCcw className="w-4 h-4" />
          Reset to Defaults
        </button>
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
