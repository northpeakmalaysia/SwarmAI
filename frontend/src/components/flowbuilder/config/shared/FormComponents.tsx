/**
 * Shared Form Components for FlowBuilder Node Configuration
 *
 * These components provide consistent styling and behavior for all node config forms.
 * Ported from WhatsBots with adaptations for SwarmAI patterns.
 */

import React from 'react';
import { Info } from 'lucide-react';
import { cn } from '../../../../lib/utils';

// ==========================================
// SHARED INPUT COMPONENT
// ==========================================
interface ConfigInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  helpText?: string;
  showVariablePicker?: boolean;
  disabled?: boolean;
  required?: boolean;
  className?: string;
}

export const ConfigInput: React.FC<ConfigInputProps> = ({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  helpText,
  showVariablePicker,
  disabled,
  required,
  className,
}) => (
  <div className={cn('mb-4', className)}>
    <label className="block text-xs font-medium text-slate-300 mb-1">
      {label}
      {required && <span className="text-red-400 ml-1">*</span>}
    </label>
    <div className="relative">
      <input
        type={type}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={cn(
          'w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-sm text-slate-100',
          'placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
      />
      {showVariablePicker && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2">
          <button
            type="button"
            onClick={() => onChange((value || '') + '{{}}')}
            className="text-xs text-slate-400 hover:text-purple-400 px-1.5 py-0.5 rounded bg-slate-600/50 hover:bg-slate-600"
          >
            {'{{}}'}
          </button>
        </div>
      )}
    </div>
    {helpText && (
      <p className="mt-1 text-xs text-slate-500 flex items-start">
        <Info className="w-3 h-3 mr-1 mt-0.5 flex-shrink-0" />
        {helpText}
      </p>
    )}
  </div>
);

// ==========================================
// SHARED SELECT COMPONENT
// ==========================================
interface ConfigSelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  helpText?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
}

export const ConfigSelect: React.FC<ConfigSelectProps> = ({
  label,
  value,
  onChange,
  options,
  helpText,
  disabled,
  required,
  className,
}) => (
  <div className={cn('mb-4', className)}>
    <label className="block text-xs font-medium text-slate-300 mb-1">
      {label}
      {required && <span className="text-red-400 ml-1">*</span>}
    </label>
    <select
      value={value || options[0]?.value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={cn(
        'w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-slate-100',
        'focus:outline-none focus:border-purple-500 transition-colors',
        '[&>option]:bg-slate-700 [&>option]:text-slate-100',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value} className="bg-slate-700 text-slate-100">
          {opt.label}
        </option>
      ))}
    </select>
    {helpText && (
      <p className="mt-1 text-xs text-slate-500 flex items-start">
        <Info className="w-3 h-3 mr-1 mt-0.5 flex-shrink-0" />
        {helpText}
      </p>
    )}
  </div>
);

// ==========================================
// SHARED CHECKBOX COMPONENT
// ==========================================
interface ConfigCheckboxProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  helpText?: string;
  disabled?: boolean;
  className?: string;
}

export const ConfigCheckbox: React.FC<ConfigCheckboxProps> = ({
  label,
  checked,
  onChange,
  helpText,
  disabled,
  className,
}) => (
  <div className={cn('mb-4', className)}>
    <label className={cn('flex items-center space-x-2', disabled ? 'cursor-not-allowed' : 'cursor-pointer')}>
      <input
        type="checkbox"
        checked={checked || false}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className={cn(
          'w-4 h-4 rounded border-slate-600 bg-slate-700/50 text-purple-500',
          'focus:ring-purple-500 focus:ring-offset-0',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
      />
      <span className={cn('text-sm text-slate-300', disabled && 'opacity-50')}>{label}</span>
    </label>
    {helpText && (
      <p className="mt-1 text-xs text-slate-500 flex items-start ml-6">
        <Info className="w-3 h-3 mr-1 mt-0.5 flex-shrink-0" />
        {helpText}
      </p>
    )}
  </div>
);

// ==========================================
// SHARED TEXTAREA COMPONENT
// ==========================================
interface ConfigTextareaProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  helpText?: string;
  rows?: number;
  disabled?: boolean;
  required?: boolean;
  className?: string;
}

export const ConfigTextarea: React.FC<ConfigTextareaProps> = ({
  label,
  value,
  onChange,
  placeholder,
  helpText,
  rows = 3,
  disabled,
  required,
  className,
}) => (
  <div className={cn('mb-4', className)}>
    <label className="block text-xs font-medium text-slate-300 mb-1">
      {label}
      {required && <span className="text-red-400 ml-1">*</span>}
    </label>
    <textarea
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      disabled={disabled}
      className={cn(
        'w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-sm text-slate-100',
        'placeholder-slate-500 focus:outline-none focus:border-purple-500 resize-none transition-colors',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
    />
    {helpText && (
      <p className="mt-1 text-xs text-slate-500 flex items-start">
        <Info className="w-3 h-3 mr-1 mt-0.5 flex-shrink-0" />
        {helpText}
      </p>
    )}
  </div>
);

// ==========================================
// SECTION HEADER COMPONENT
// ==========================================
interface SectionHeaderProps {
  title: string;
  icon?: React.ReactNode;
  className?: string;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({ title, icon, className }) => (
  <div className={cn('flex items-center mb-3', className)}>
    {icon && <span className="w-4 h-4 text-slate-400 mr-2">{icon}</span>}
    <span className="text-sm font-medium text-slate-300">{title}</span>
  </div>
);

// ==========================================
// INFO BOX COMPONENT
// ==========================================
interface InfoBoxProps {
  children: React.ReactNode;
  variant?: 'info' | 'warning' | 'success' | 'error';
  className?: string;
}

export const InfoBox: React.FC<InfoBoxProps> = ({ children, variant = 'info', className }) => {
  const variantStyles = {
    info: 'bg-blue-500/10 border-blue-500/30 text-blue-300',
    warning: 'bg-amber-500/10 border-amber-500/30 text-amber-300',
    success: 'bg-green-500/10 border-green-500/30 text-green-300',
    error: 'bg-red-500/10 border-red-500/30 text-red-300',
  };

  return (
    <div className={cn('mb-4 p-3 border rounded-lg', variantStyles[variant], className)}>
      {children}
    </div>
  );
};

// ==========================================
// OUTPUT VARIABLES DOCUMENTATION
// ==========================================
interface OutputVariable {
  name: string;
  description: string;
}

interface OutputVariablesDocProps {
  variables: OutputVariable[];
  title?: string;
  variant?: 'green' | 'blue' | 'purple';
  className?: string;
}

export const OutputVariablesDoc: React.FC<OutputVariablesDocProps> = ({
  variables,
  title = 'Available Output Variables',
  variant = 'green',
  className,
}) => {
  const variantStyles = {
    green: 'bg-green-500/10 border-green-500/30 text-green-300',
    blue: 'bg-blue-500/10 border-blue-500/30 text-blue-300',
    purple: 'bg-purple-500/10 border-purple-500/30 text-purple-300',
  };

  const textStyles = {
    green: 'text-green-400',
    blue: 'text-blue-400',
    purple: 'text-purple-400',
  };

  return (
    <div className={cn('mb-4 p-3 border rounded-lg', variantStyles[variant], className)}>
      <p className="text-xs font-medium mb-2">{title}</p>
      <div className="text-xs space-y-1 font-mono">
        {variables.map((v) => (
          <div key={v.name} className="grid grid-cols-2 gap-x-2">
            <span className={textStyles[variant]}>{v.name}</span>
            <span className="opacity-80">{v.description}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ==========================================
// BUTTON GROUP COMPONENT
// ==========================================
interface ButtonGroupOption {
  value: string;
  label: string;
  icon?: string;
}

interface ButtonGroupProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: ButtonGroupOption[];
  columns?: 2 | 3 | 4;
  variant?: 'default' | 'primary' | 'success';
  className?: string;
}

export const ButtonGroup: React.FC<ButtonGroupProps> = ({
  label,
  value,
  onChange,
  options,
  columns = 2,
  variant = 'default',
  className,
}) => {
  const activeStyles = {
    default: 'bg-purple-500/30 text-purple-300 border-purple-500/50',
    primary: 'bg-blue-500/30 text-blue-300 border-blue-500/50',
    success: 'bg-green-500/30 text-green-300 border-green-500/50',
  };

  return (
    <div className={cn('mb-4', className)}>
      {label && <label className="block text-xs font-medium text-slate-300 mb-2">{label}</label>}
      <div className={cn('grid gap-2', `grid-cols-${columns}`)}>
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              'px-3 py-2 text-xs rounded-lg transition-colors text-left border',
              value === opt.value
                ? activeStyles[variant]
                : 'bg-slate-700/50 text-slate-400 border-slate-600/50 hover:bg-slate-600/50'
            )}
          >
            {opt.icon && <span className="mr-1">{opt.icon}</span>}
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
};

// ==========================================
// SLIDER COMPONENT
// ==========================================
interface ConfigSliderProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  helpText?: string;
  showValue?: boolean;
  valueSuffix?: string;
  marks?: { value: number; label: string }[];
  className?: string;
}

export const ConfigSlider: React.FC<ConfigSliderProps> = ({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  helpText,
  showValue = true,
  valueSuffix = '',
  marks,
  className,
}) => (
  <div className={cn('mb-4', className)}>
    <label className="block text-xs font-medium text-slate-400 mb-1">
      {label}
      {showValue && <span className="text-slate-300 ml-1">: {value}{valueSuffix}</span>}
    </label>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(parseInt(e.target.value))}
      className="w-full h-2 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-purple-500"
    />
    {marks && (
      <div className="flex justify-between text-xs text-slate-500 mt-1">
        {marks.map((mark) => (
          <span key={mark.value}>{mark.label}</span>
        ))}
      </div>
    )}
    {helpText && (
      <p className="mt-1 text-xs text-slate-500 flex items-start">
        <Info className="w-3 h-3 mr-1 mt-0.5 flex-shrink-0" />
        {helpText}
      </p>
    )}
  </div>
);
