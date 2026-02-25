import React from 'react';
import { Type, Moon, Sun, Monitor } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';
import { Card, CardHeader, CardBody } from '../common/Card';
import { cn } from '../../lib/utils';

/**
 * Font scale presets with labels
 */
const fontScalePresets = [
  { value: 0.6, label: '60%' },
  { value: 0.7, label: '70%' },
  { value: 0.8, label: '80%' },
  { value: 0.85, label: '85%' },
  { value: 0.9, label: '90%' },
  { value: 0.95, label: '95%' },
  { value: 1.0, label: '100%' },
  { value: 1.1, label: '110%' },
  { value: 1.2, label: '120%' },
  { value: 1.3, label: '130%' },
  { value: 1.5, label: '150%' },
];

/**
 * Theme options
 */
const themeOptions = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
] as const;

/**
 * AppearanceSettings component
 * Allows users to customize font scale and theme preferences
 */
export const AppearanceSettings: React.FC = () => {
  const { fontScale, setFontScale, theme, setTheme } = useUIStore();

  return (
    <div className="space-y-6">
      {/* Font Size Card */}
      <Card>
        <CardHeader
          title="Font Size"
          subtitle="Adjust the text size across the application"
        />
        <CardBody className="space-y-6">
          {/* Current Scale Display */}
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-slate-700 flex items-center justify-center">
              <Type className="w-6 h-6 text-sky-400" />
            </div>
            <div className="flex-1">
              <p className="text-sm text-gray-400">Current font scale</p>
              <p className="text-2xl font-semibold text-white">
                {Math.round(fontScale * 100)}%
              </p>
            </div>
          </div>

          {/* Slider */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>60%</span>
              <span>100%</span>
              <span>150%</span>
            </div>
            <input
              type="range"
              min="0.6"
              max="1.5"
              step="0.05"
              value={fontScale}
              onChange={(e) => setFontScale(parseFloat(e.target.value))}
              className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer
                [&::-webkit-slider-thumb]:appearance-none
                [&::-webkit-slider-thumb]:w-4
                [&::-webkit-slider-thumb]:h-4
                [&::-webkit-slider-thumb]:rounded-full
                [&::-webkit-slider-thumb]:bg-sky-500
                [&::-webkit-slider-thumb]:hover:bg-sky-400
                [&::-webkit-slider-thumb]:cursor-pointer
                [&::-moz-range-thumb]:w-4
                [&::-moz-range-thumb]:h-4
                [&::-moz-range-thumb]:rounded-full
                [&::-moz-range-thumb]:bg-sky-500
                [&::-moz-range-thumb]:border-0
                [&::-moz-range-thumb]:cursor-pointer"
            />
          </div>

          {/* Quick Presets */}
          <div>
            <p className="text-sm text-gray-400 mb-3">Quick presets</p>
            <div className="flex flex-wrap gap-2">
              {fontScalePresets.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => setFontScale(preset.value)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                    Math.abs(fontScale - preset.value) < 0.01
                      ? 'bg-sky-500 text-white'
                      : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
                  )}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Preview */}
          <div className="p-4 bg-slate-800 rounded-lg space-y-2">
            <p className="text-xs text-gray-500">Preview</p>
            <p className="text-white">This is how text will appear at {Math.round(fontScale * 100)}% scale.</p>
            <p className="text-sm text-gray-400">Smaller secondary text for reference.</p>
          </div>
        </CardBody>
      </Card>

      {/* Theme Card */}
      <Card>
        <CardHeader
          title="Theme"
          subtitle="Choose your preferred color scheme"
        />
        <CardBody>
          <div className="grid grid-cols-3 gap-3">
            {themeOptions.map((option) => {
              const Icon = option.icon;
              const isSelected = theme === option.value;

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setTheme(option.value)}
                  className={cn(
                    'flex flex-col items-center gap-2 p-4 rounded-lg border transition-colors',
                    isSelected
                      ? 'border-sky-500 bg-sky-500/10 text-sky-400'
                      : 'border-slate-600 bg-slate-800 text-gray-400 hover:bg-slate-700'
                  )}
                >
                  <Icon className="w-6 h-6" />
                  <span className="text-sm font-medium">{option.label}</span>
                </button>
              );
            })}
          </div>
          <p className="text-xs text-gray-500 mt-3">
            System follows your device's appearance settings.
          </p>
        </CardBody>
      </Card>
    </div>
  );
};

export default AppearanceSettings;
