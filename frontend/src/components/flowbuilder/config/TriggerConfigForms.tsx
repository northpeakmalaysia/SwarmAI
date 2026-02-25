/**
 * Trigger Configuration Forms for FlowBuilder
 * =============================================
 * Rich configuration forms for all trigger node types.
 *
 * Ported from WhatsBots with adaptations for SwarmAI patterns.
 * Provides comprehensive UI for trigger configuration including:
 * - Schedule/Time triggers with simple and advanced (cron) modes
 * - Message triggers with pattern matching and content type filters
 * - Webhook triggers with authentication options
 * - Event triggers for system events
 * - Email triggers with filtering options
 *
 * @version 1.0.0
 * @date 2026-02-03
 */

import React, { useState, useEffect } from 'react';
import { Info, RefreshCw, Loader2, Mail, Paperclip, Filter, Clock } from 'lucide-react';
import {
  ConfigInput,
  ConfigSelect,
  ConfigCheckbox,
  ConfigTextarea,
  ConfigSlider,
  SectionHeader,
  InfoBox,
  OutputVariablesDoc,
  ButtonGroup,
} from './shared/FormComponents';

// ==========================================
// TYPES
// ==========================================
export interface TriggerConfigFormsProps {
  nodeType: string;
  config: Record<string, unknown>;
  onConfigChange: (config: Record<string, unknown>) => void;
  agentId?: string;
}

// ==========================================
// SCHEDULE/TIME TRIGGER CONFIG FORM
// ==========================================
const ScheduleTriggerForm: React.FC<{
  config: Record<string, unknown>;
  onConfigChange: (config: Record<string, unknown>) => void;
}> = ({ config, onConfigChange }) => {
  const updateConfig = (key: string, value: unknown) => {
    onConfigChange({ ...config, [key]: value });
  };

  // Generate cron expression from simple config
  const generateCronFromSimple = (
    frequency: string,
    time: string,
    dayOfWeek: string,
    dayOfMonth: string,
    intervalMinutes: string
  ) => {
    const [hours, minutes] = (time || '09:00').split(':').map(Number);
    const min = isNaN(minutes) ? 0 : minutes;
    const hr = isNaN(hours) ? 9 : hours;

    switch (frequency) {
      case 'everyMinute':
        return '* * * * *';
      case 'everyXMinutes':
        return `*/${intervalMinutes || 5} * * * *`;
      case 'hourly':
        return `${min} * * * *`;
      case 'daily':
        return `${min} ${hr} * * *`;
      case 'weekdays':
        return `${min} ${hr} * * 1-5`;
      case 'weekends':
        return `${min} ${hr} * * 0,6`;
      case 'weekly':
        return `${min} ${hr} * * ${dayOfWeek || '1'}`;
      case 'monthly':
        return `${min} ${hr} ${dayOfMonth || '1'} * *`;
      default:
        return `${min} ${hr} * * *`;
    }
  };

  // Update cron when simple config changes
  const updateSimpleConfig = (key: string, value: unknown) => {
    const newConfig = { ...config, [key]: value };
    const effectiveMode = (newConfig.scheduleMode as string) || 'simple';
    if (effectiveMode === 'simple') {
      newConfig.cronExpression = generateCronFromSimple(
        (newConfig.frequency as string) || 'daily',
        (newConfig.time as string) || '09:00',
        (newConfig.dayOfWeek as string) || '1',
        (newConfig.dayOfMonth as string) || '1',
        (newConfig.intervalMinutes as string) || '5'
      );
    }
    onConfigChange(newConfig);
  };

  const scheduleMode = (config.scheduleMode as string) || 'simple';
  const frequency = (config.frequency as string) || 'daily';

  // Days of week options
  const daysOfWeek = [
    { value: '0', label: 'Sunday' },
    { value: '1', label: 'Monday' },
    { value: '2', label: 'Tuesday' },
    { value: '3', label: 'Wednesday' },
    { value: '4', label: 'Thursday' },
    { value: '5', label: 'Friday' },
    { value: '6', label: 'Saturday' },
  ];

  // Days of month options
  const daysOfMonth = Array.from({ length: 31 }, (_, i) => ({
    value: String(i + 1),
    label: `${i + 1}${i === 0 ? 'st' : i === 1 ? 'nd' : i === 2 ? 'rd' : 'th'}`,
  }));

  // Cron presets for advanced mode
  const cronPresets = [
    { label: 'Every minute', value: '* * * * *' },
    { label: 'Every 5 min', value: '*/5 * * * *' },
    { label: 'Every hour', value: '0 * * * *' },
    { label: 'Daily 9 AM', value: '0 9 * * *' },
    { label: 'Monday 9 AM', value: '0 9 * * 1' },
    { label: '1st of month', value: '0 0 1 * *' },
  ];

  // Human readable description
  const getScheduleDescription = () => {
    const time = (config.time as string) || '09:00';
    const dayName = daysOfWeek.find((d) => d.value === ((config.dayOfWeek as string) || '1'))?.label || 'Monday';
    const dayNum = (config.dayOfMonth as string) || '1';

    switch (frequency) {
      case 'everyMinute':
        return 'Runs every minute';
      case 'everyXMinutes':
        return `Runs every ${(config.intervalMinutes as string) || 5} minutes`;
      case 'hourly':
        return `Runs every hour at :${time.split(':')[1] || '00'} minutes`;
      case 'daily':
        return `Runs every day at ${time}`;
      case 'weekdays':
        return `Runs Monday-Friday at ${time}`;
      case 'weekends':
        return `Runs Saturday & Sunday at ${time}`;
      case 'weekly':
        return `Runs every ${dayName} at ${time}`;
      case 'monthly':
        return `Runs on day ${dayNum} of each month at ${time}`;
      default:
        return '';
    }
  };

  return (
    <div className="space-y-4">
      {/* Mode Toggle */}
      <div className="mb-4">
        <label className="block text-xs font-medium text-slate-300 mb-2">Schedule Mode</label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => updateSimpleConfig('scheduleMode', 'simple')}
            className={`flex-1 px-3 py-2 text-sm rounded-lg transition-colors ${
              scheduleMode === 'simple'
                ? 'bg-purple-500/30 text-purple-300 border border-purple-500/50'
                : 'bg-slate-700/50 text-slate-400 border border-slate-600 hover:bg-slate-600/50'
            }`}
          >
            <Clock className="w-4 h-4 inline mr-1" /> Simple
          </button>
          <button
            type="button"
            onClick={() => updateConfig('scheduleMode', 'advanced')}
            className={`flex-1 px-3 py-2 text-sm rounded-lg transition-colors ${
              scheduleMode === 'advanced'
                ? 'bg-purple-500/30 text-purple-300 border border-purple-500/50'
                : 'bg-slate-700/50 text-slate-400 border border-slate-600 hover:bg-slate-600/50'
            }`}
          >
            <span className="mr-1">&#9881;</span> Advanced (Cron)
          </button>
        </div>
      </div>

      {/* Simple Mode */}
      {scheduleMode === 'simple' && (
        <>
          {/* Frequency Selection */}
          <ButtonGroup
            label="How Often?"
            value={frequency}
            onChange={(v) => updateSimpleConfig('frequency', v)}
            columns={2}
            variant="success"
            options={[
              { value: 'everyMinute', label: 'Every Minute', icon: '⚡' },
              { value: 'everyXMinutes', label: 'Every X Minutes', icon: '⏱️' },
              { value: 'hourly', label: 'Hourly', icon: '🕐' },
              { value: 'daily', label: 'Daily', icon: '📅' },
              { value: 'weekdays', label: 'Weekdays', icon: '💼' },
              { value: 'weekends', label: 'Weekends', icon: '🌴' },
              { value: 'weekly', label: 'Weekly', icon: '📆' },
              { value: 'monthly', label: 'Monthly', icon: '🗓️' },
            ]}
          />

          {/* Interval for Every X Minutes */}
          {frequency === 'everyXMinutes' && (
            <ConfigSelect
              label="Every how many minutes?"
              value={(config.intervalMinutes as string) || '5'}
              onChange={(v) => updateSimpleConfig('intervalMinutes', v)}
              options={[1, 2, 3, 5, 10, 15, 20, 30, 45].map((m) => ({
                value: String(m),
                label: `${m} minutes`,
              }))}
            />
          )}

          {/* Time Picker (for most frequencies) */}
          {!['everyMinute', 'everyXMinutes'].includes(frequency) && (
            <div className="mb-4">
              <label className="block text-xs font-medium text-slate-300 mb-1">What Time?</label>
              <input
                type="time"
                value={(config.time as string) || '09:00'}
                onChange={(e) => updateSimpleConfig('time', e.target.value)}
                className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-sm text-slate-100 focus:outline-none focus:border-purple-500"
              />
            </div>
          )}

          {/* Day of Week (for weekly) */}
          {frequency === 'weekly' && (
            <ConfigSelect
              label="Which Day?"
              value={(config.dayOfWeek as string) || '1'}
              onChange={(v) => updateSimpleConfig('dayOfWeek', v)}
              options={daysOfWeek}
            />
          )}

          {/* Day of Month (for monthly) */}
          {frequency === 'monthly' && (
            <ConfigSelect
              label="Which Day of Month?"
              value={(config.dayOfMonth as string) || '1'}
              onChange={(v) => updateSimpleConfig('dayOfMonth', v)}
              options={daysOfMonth}
            />
          )}

          {/* Schedule Description */}
          <InfoBox variant="success">
            <p className="text-xs font-medium">📋 {getScheduleDescription()}</p>
            <p className="text-xs opacity-60 mt-1">Cron: {config.cronExpression as string}</p>
          </InfoBox>
        </>
      )}

      {/* Advanced Mode (Cron) */}
      {scheduleMode === 'advanced' && (
        <>
          <ConfigInput
            label="Cron Expression"
            value={(config.cronExpression as string) || ''}
            onChange={(v) => updateConfig('cronExpression', v)}
            placeholder="0 9 * * *"
            helpText="Format: minute hour day month weekday"
          />

          <div className="mb-4">
            <label className="block text-xs font-medium text-slate-300 mb-1">Quick Presets</label>
            <div className="flex flex-wrap gap-1">
              {cronPresets.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => updateConfig('cronExpression', preset.value)}
                  className={`px-2 py-1 text-xs rounded transition-colors ${
                    config.cronExpression === preset.value
                      ? 'bg-green-500/30 text-green-300'
                      : 'bg-slate-700/50 text-slate-400 hover:bg-slate-600/50'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Cron Helper */}
          <div className="mb-4 p-3 bg-slate-700/30 rounded-lg">
            <p className="text-xs text-slate-400 font-medium mb-2">Cron Format Guide:</p>
            <div className="text-xs text-slate-500 space-y-1">
              <p>
                <code className="text-amber-300">*</code> = every
              </p>
              <p>
                <code className="text-amber-300">*/5</code> = every 5
              </p>
              <p>
                <code className="text-amber-300">0</code> = at 0
              </p>
              <p>
                <code className="text-amber-300">1-5</code> = range 1 to 5
              </p>
              <p>
                <code className="text-amber-300">1,3,5</code> = at 1, 3, and 5
              </p>
            </div>
          </div>
        </>
      )}

      <ConfigSelect
        label="Timezone"
        value={(config.timezone as string) || 'UTC'}
        onChange={(v) => updateConfig('timezone', v)}
        options={[
          { value: 'Asia/Kuala_Lumpur', label: 'Asia/Kuala_Lumpur (GMT+8)' },
          { value: 'Asia/Singapore', label: 'Asia/Singapore (GMT+8)' },
          { value: 'Asia/Jakarta', label: 'Asia/Jakarta (GMT+7)' },
          { value: 'Asia/Bangkok', label: 'Asia/Bangkok (GMT+7)' },
          { value: 'Asia/Hong_Kong', label: 'Asia/Hong_Kong (GMT+8)' },
          { value: 'Asia/Tokyo', label: 'Asia/Tokyo (GMT+9)' },
          { value: 'UTC', label: 'UTC (GMT+0)' },
          { value: 'America/New_York', label: 'America/New_York (EST)' },
          { value: 'America/Los_Angeles', label: 'America/Los_Angeles (PST)' },
          { value: 'Europe/London', label: 'Europe/London (GMT)' },
        ]}
      />

      <ConfigCheckbox
        label="Enabled"
        checked={(config.enabled as boolean) !== false}
        onChange={(v) => updateConfig('enabled', v)}
        helpText="Whether this trigger is active"
      />

      {/* Output Variables */}
      <OutputVariablesDoc
        variables={[
          { name: '{{trigger.timestamp}}', description: 'Execution timestamp' },
          { name: '{{trigger.scheduledTime}}', description: 'Scheduled run time' },
          { name: '{{trigger.timezone}}', description: 'Configured timezone' },
        ]}
      />
    </div>
  );
};

// ==========================================
// MESSAGE TRIGGER CONFIG FORM
// ==========================================
const MessageTriggerForm: React.FC<{
  config: Record<string, unknown>;
  onConfigChange: (config: Record<string, unknown>) => void;
  agentId?: string;
}> = ({ config, onConfigChange }) => {
  const updateConfig = (key: string, value: unknown) => {
    onConfigChange({ ...config, [key]: value });
  };

  const isMatchAny = config.patternType === 'any';

  return (
    <div className="space-y-4">
      {/* Platform Selection */}
      <ConfigSelect
        label="Platform"
        value={(config.platform as string) || 'any'}
        onChange={(v) => updateConfig('platform', v)}
        options={[
          { value: 'any', label: 'Any Platform' },
          { value: 'whatsapp', label: 'WhatsApp' },
          { value: 'whatsapp-business', label: 'WhatsApp Business' },
          { value: 'telegram-bot', label: 'Telegram Bot' },
          { value: 'telegram-user', label: 'Telegram User' },
          { value: 'email', label: 'Email' },
          { value: 'http-api', label: 'HTTP API' },
        ]}
        helpText="Filter messages by platform"
      />

      <ConfigSelect
        label="Pattern Type"
        value={(config.patternType as string) || 'contains'}
        onChange={(v) => updateConfig('patternType', v)}
        options={[
          { value: 'any', label: 'Match Any (all messages)' },
          { value: 'contains', label: 'Contains' },
          { value: 'exact', label: 'Exact Match' },
          { value: 'startsWith', label: 'Starts With' },
          { value: 'endsWith', label: 'Ends With' },
          { value: 'regex', label: 'Regular Expression' },
        ]}
        helpText={isMatchAny ? 'Triggers on every incoming message' : 'How to match the pattern against messages'}
      />

      {isMatchAny && (
        <InfoBox variant="warning">
          <p className="text-xs">
            This trigger will fire on ALL incoming messages. Use sender/source filters below to limit scope.
          </p>
        </InfoBox>
      )}

      {!isMatchAny && (
        <>
          <ConfigInput
            label="Pattern"
            value={(config.pattern as string) || ''}
            onChange={(v) => updateConfig('pattern', v)}
            placeholder="hello|hi|hey"
            helpText="Text pattern to match incoming messages"
          />

          <ConfigCheckbox
            label="Case Sensitive"
            checked={(config.caseSensitive as boolean) || false}
            onChange={(v) => updateConfig('caseSensitive', v)}
          />
        </>
      )}

      {/* Message Sources */}
      <div className="mb-4">
        <label className="block text-xs font-medium text-slate-300 mb-2">Message Sources</label>
        <ConfigCheckbox
          label="From Groups"
          checked={(config.fromGroups as boolean) !== false}
          onChange={(v) => updateConfig('fromGroups', v)}
          className="mb-2"
        />
        <ConfigCheckbox
          label="From Private Chats"
          checked={(config.fromPrivate as boolean) !== false}
          onChange={(v) => updateConfig('fromPrivate', v)}
        />
      </div>

      {/* Message Type Filters */}
      <div className="mb-4">
        <label className="block text-xs font-medium text-slate-300 mb-2">Message Types</label>
        <p className="text-xs text-slate-500 mb-2">Select which message types should trigger this flow</p>
        <div className="grid grid-cols-2 gap-2">
          {[
            { key: 'allowChat', label: '💬 Text Chat', defaultValue: true },
            { key: 'allowImage', label: '🖼️ Image', defaultValue: true },
            { key: 'allowVideo', label: '🎬 Video', defaultValue: true },
            { key: 'allowAudio', label: '🎵 Audio', defaultValue: true },
            { key: 'allowVoice', label: '🎤 Voice Note', defaultValue: true },
            { key: 'allowDocument', label: '📄 Document', defaultValue: true },
            { key: 'allowSticker', label: '🎭 Sticker', defaultValue: true },
            { key: 'allowLocation', label: '📍 Location', defaultValue: true },
            { key: 'allowContact', label: '👤 Contact', defaultValue: true },
            { key: 'allowCallLog', label: '📞 Call Log', defaultValue: false },
          ].map((item) => (
            <label
              key={item.key}
              className="flex items-center space-x-2 cursor-pointer p-2 rounded bg-slate-700/30 hover:bg-slate-700/50"
            >
              <input
                type="checkbox"
                checked={(config[item.key] as boolean) ?? item.defaultValue}
                onChange={(e) => updateConfig(item.key, e.target.checked)}
                className="w-4 h-4 rounded border-slate-600 bg-slate-700/50 text-purple-500 focus:ring-purple-500 focus:ring-offset-0"
              />
              <span className="text-xs text-slate-300">{item.label}</span>
            </label>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => {
              onConfigChange({
                ...config,
                allowChat: true,
                allowImage: true,
                allowVideo: true,
                allowAudio: true,
                allowVoice: true,
                allowDocument: true,
                allowSticker: true,
                allowLocation: true,
                allowContact: true,
                allowCallLog: true,
              });
            }}
            className="px-2 py-1 text-xs bg-slate-700/50 text-slate-400 hover:bg-slate-600/50 rounded"
          >
            Select All
          </button>
          <button
            type="button"
            onClick={() => {
              onConfigChange({
                ...config,
                allowChat: false,
                allowImage: false,
                allowVideo: false,
                allowAudio: false,
                allowVoice: false,
                allowDocument: false,
                allowSticker: false,
                allowLocation: false,
                allowContact: false,
                allowCallLog: false,
              });
            }}
            className="px-2 py-1 text-xs bg-slate-700/50 text-slate-400 hover:bg-slate-600/50 rounded"
          >
            Clear All
          </button>
          <button
            type="button"
            onClick={() => {
              onConfigChange({
                ...config,
                allowChat: true,
                allowImage: true,
                allowVideo: true,
                allowAudio: true,
                allowVoice: true,
                allowDocument: true,
                allowSticker: true,
                allowLocation: true,
                allowContact: true,
                allowCallLog: false,
              });
            }}
            className="px-2 py-1 text-xs bg-green-700/50 text-green-400 hover:bg-green-600/50 rounded"
          >
            Default (No Call Log)
          </button>
        </div>
      </div>

      {/* Sender Filter */}
      <ConfigInput
        label="Sender Filter (Optional)"
        value={
          Array.isArray(config.senderFilter)
            ? (config.senderFilter as string[]).join(', ')
            : (config.senderFilter as string) || ''
        }
        onChange={(v) =>
          updateConfig(
            'senderFilter',
            v
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          )
        }
        placeholder="628123456789, 628987654321"
        helpText="Comma-separated phone numbers to filter (leave empty for all)"
      />

      {/* Output Variables */}
      <OutputVariablesDoc
        variables={[
          { name: '{{message.id}}', description: 'Message ID' },
          { name: '{{message.content}}', description: 'Message text content' },
          { name: '{{message.from}}', description: 'Sender identifier' },
          { name: '{{message.to}}', description: 'Recipient identifier' },
          { name: '{{message.conversationId}}', description: 'Conversation ID' },
          { name: '{{message.contentType}}', description: 'Message type (text, image, etc.)' },
          { name: '{{message.mediaUrl}}', description: 'Media URL if present' },
          { name: '{{message.platform}}', description: 'Source platform' },
          { name: '{{trigger.matchedFilters}}', description: 'List of matched filters' },
        ]}
      />
    </div>
  );
};

// ==========================================
// WEBHOOK TRIGGER CONFIG FORM
// ==========================================
const WebhookTriggerForm: React.FC<{
  config: Record<string, unknown>;
  onConfigChange: (config: Record<string, unknown>) => void;
}> = ({ config, onConfigChange }) => {
  const updateConfig = (key: string, value: unknown) => {
    onConfigChange({ ...config, [key]: value });
  };

  return (
    <div className="space-y-4">
      <ConfigInput
        label="Webhook Path"
        value={(config.webhookPath as string) || (config.path as string) || ''}
        onChange={(v) => updateConfig('path', v)}
        placeholder="my-webhook-endpoint"
        helpText="URL path for the webhook (e.g., /api/flows/webhook/{path})"
      />

      <ConfigSelect
        label="HTTP Method"
        value={(config.method as string) || 'POST'}
        onChange={(v) => updateConfig('method', v)}
        options={[
          { value: 'POST', label: 'POST' },
          { value: 'GET', label: 'GET' },
          { value: 'PUT', label: 'PUT' },
          { value: 'DELETE', label: 'DELETE' },
        ]}
      />

      <ConfigCheckbox
        label="Require Authentication"
        checked={(config.requireAuth as boolean) || false}
        onChange={(v) => updateConfig('requireAuth', v)}
        helpText="Require bearer token authentication"
      />

      {Boolean(config.requireAuth) && (
        <ConfigInput
          label="Auth Token / Secret"
          value={(config.secret as string) || (config.authToken as string) || ''}
          onChange={(v) => updateConfig('secret', v)}
          placeholder="your-secret-token"
          type="password"
          helpText="Token for webhook validation"
        />
      )}

      {/* Response Configuration */}
      <ConfigSelect
        label="Response Type"
        value={(config.responseType as string) || 'json'}
        onChange={(v) => updateConfig('responseType', v)}
        options={[
          { value: 'json', label: 'JSON Response' },
          { value: 'text', label: 'Plain Text' },
          { value: 'none', label: 'No Response (202 Accepted)' },
        ]}
      />

      {/* Output Variables */}
      <OutputVariablesDoc
        variant="blue"
        variables={[
          { name: '{{webhook.method}}', description: 'HTTP method used' },
          { name: '{{webhook.path}}', description: 'Request path' },
          { name: '{{webhook.headers}}', description: 'Request headers' },
          { name: '{{webhook.query}}', description: 'Query parameters' },
          { name: '{{webhook.body}}', description: 'Request body' },
          { name: '{{webhook.ip}}', description: 'Client IP address' },
        ]}
      />
    </div>
  );
};

// ==========================================
// EVENT TRIGGER CONFIG FORM
// ==========================================
const EventTriggerForm: React.FC<{
  config: Record<string, unknown>;
  onConfigChange: (config: Record<string, unknown>) => void;
}> = ({ config, onConfigChange }) => {
  const updateConfig = (key: string, value: unknown) => {
    onConfigChange({ ...config, [key]: value });
  };

  return (
    <div className="space-y-4">
      <ConfigSelect
        label="Event Type"
        value={(config.eventType as string) || ''}
        onChange={(v) => updateConfig('eventType', v)}
        options={[
          { value: 'agent_connected', label: 'Agent Connected' },
          { value: 'agent_disconnected', label: 'Agent Disconnected' },
          { value: 'group_join', label: 'Group Join' },
          { value: 'group_leave', label: 'Group Leave' },
          { value: 'message_revoked', label: 'Message Revoked' },
          { value: 'contact_changed', label: 'Contact Changed' },
          { value: 'chat_archived', label: 'Chat Archived' },
          { value: 'status_change', label: 'Status Change' },
          { value: 'flow_completed', label: 'Flow Completed' },
          { value: 'flow_error', label: 'Flow Error' },
          { value: 'custom', label: 'Custom Event' },
        ]}
        helpText="System event that triggers this flow"
      />

      {config.eventType === 'custom' && (
        <ConfigInput
          label="Custom Event Name"
          value={(config.customEventName as string) || ''}
          onChange={(v) => updateConfig('customEventName', v)}
          placeholder="my.custom.event"
          helpText="Name of the custom event to listen for"
        />
      )}

      <ConfigTextarea
        label="Event Filter (JSON)"
        value={
          typeof config.eventFilter === 'object'
            ? JSON.stringify(config.eventFilter, null, 2)
            : (config.eventFilter as string) || ''
        }
        onChange={(v) => {
          try {
            updateConfig('eventFilter', JSON.parse(v));
          } catch {
            updateConfig('eventFilter', v);
          }
        }}
        placeholder='{"agentId": "agent-123"}'
        helpText="Optional JSON filter to match specific event data"
        rows={3}
      />

      <InfoBox variant="info">
        <p className="text-xs">
          <Info className="w-3 h-3 inline mr-1" />
          Event triggers are fired automatically when the selected event occurs. The event data will be available in the
          flow context.
        </p>
      </InfoBox>

      {/* Output Variables */}
      <OutputVariablesDoc
        variant="purple"
        variables={[
          { name: '{{event.type}}', description: 'Event type' },
          { name: '{{event.timestamp}}', description: 'Event timestamp' },
          { name: '{{event.data}}', description: 'Full event data' },
          { name: '{{event.source}}', description: 'Event source' },
        ]}
      />
    </div>
  );
};

// ==========================================
// EMAIL TRIGGER CONFIG FORM
// ==========================================
const EmailTriggerForm: React.FC<{
  config: Record<string, unknown>;
  onConfigChange: (config: Record<string, unknown>) => void;
}> = ({ config, onConfigChange }) => {
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [emailAccounts, setEmailAccounts] = useState<Array<{ id: string; name: string; email: string }>>([]);

  const updateConfig = (key: string, value: unknown) => {
    onConfigChange({ ...config, [key]: value });
  };

  // Fetch email accounts (simulated - would connect to API in real implementation)
  const fetchEmailAccounts = async () => {
    setLoadingAccounts(true);
    try {
      // In real implementation, fetch from /api/email/accounts
      // For now, we'll leave it empty and show a message
      setEmailAccounts([]);
    } finally {
      setLoadingAccounts(false);
    }
  };

  useEffect(() => {
    fetchEmailAccounts();
  }, []);

  // Attachment type options
  const attachmentTypes = [
    { value: 'any', label: 'Any Attachment' },
    { value: 'pdf', label: 'PDF Documents' },
    { value: 'image', label: 'Images (PNG, JPG, GIF)' },
    { value: 'excel', label: 'Excel Spreadsheets' },
    { value: 'word', label: 'Word Documents' },
    { value: 'zip', label: 'ZIP Archives' },
  ];

  return (
    <div className="space-y-4">
      {/* Account Selection */}
      <div className="mb-4">
        <label className="block text-xs font-medium text-slate-300 mb-1">
          <Mail className="w-3 h-3 inline mr-1" />
          Email Account
        </label>
        <div className="flex items-center space-x-2">
          <select
            value={(config.accountId as string) || ''}
            onChange={(e) => updateConfig('accountId', e.target.value)}
            disabled={loadingAccounts}
            className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-slate-100 focus:outline-none focus:border-purple-500 disabled:opacity-50 [&>option]:bg-slate-700 [&>option]:text-slate-100"
          >
            <option value="" className="bg-slate-700 text-slate-400">
              Select an email account...
            </option>
            {emailAccounts.map((account) => (
              <option key={account.id} value={account.id} className="bg-slate-700 text-slate-100">
                {account.name} ({account.email})
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={fetchEmailAccounts}
            disabled={loadingAccounts}
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 rounded-lg transition-colors disabled:opacity-50"
            title="Refresh accounts"
          >
            {loadingAccounts ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          </button>
        </div>
        {emailAccounts.length === 0 && !loadingAccounts && (
          <p className="mt-1 text-xs text-amber-400">
            No email accounts configured. Add accounts in Settings &gt; Email.
          </p>
        )}
      </div>

      {/* Filters Section */}
      <div className="p-3 bg-slate-700/30 rounded-lg border border-slate-600/50">
        <SectionHeader title="Email Filters" icon={<Filter className="w-4 h-4" />} />

        <ConfigInput
          label="From Address"
          value={(config.fromFilter as string) || ''}
          onChange={(v) => updateConfig('fromFilter', v)}
          placeholder="email@example.com or *@domain.com"
          helpText="Email or domain pattern (use * for wildcard)"
        />

        <ConfigInput
          label="To/CC Address"
          value={(config.toFilter as string) || ''}
          onChange={(v) => updateConfig('toFilter', v)}
          placeholder="recipient@example.com"
        />

        <div className="mb-3">
          <label className="block text-xs font-medium text-slate-400 mb-1">Subject Filter</label>
          <div className="flex items-center space-x-2">
            <input
              type="text"
              value={(config.subjectFilter as string) || ''}
              onChange={(e) => updateConfig('subjectFilter', e.target.value)}
              placeholder="Invoice, Order Confirmation..."
              className="flex-1 px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-purple-500"
            />
            <label className="flex items-center space-x-1 text-xs text-slate-400 cursor-pointer">
              <input
                type="checkbox"
                checked={(config.subjectIsRegex as boolean) || false}
                onChange={(e) => updateConfig('subjectIsRegex', e.target.checked)}
                className="w-3 h-3 rounded border-slate-600 bg-slate-700/50 text-purple-500 focus:ring-purple-500 focus:ring-offset-0"
              />
              <span>Regex</span>
            </label>
          </div>
        </div>

        <div className="mb-3">
          <label className="block text-xs font-medium text-slate-400 mb-1">Body Filter</label>
          <div className="flex items-center space-x-2">
            <input
              type="text"
              value={(config.bodyFilter as string) || ''}
              onChange={(e) => updateConfig('bodyFilter', e.target.value)}
              placeholder="Search text in email body..."
              className="flex-1 px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-purple-500"
            />
            <label className="flex items-center space-x-1 text-xs text-slate-400 cursor-pointer">
              <input
                type="checkbox"
                checked={(config.bodyIsRegex as boolean) || false}
                onChange={(e) => updateConfig('bodyIsRegex', e.target.checked)}
                className="w-3 h-3 rounded border-slate-600 bg-slate-700/50 text-purple-500 focus:ring-purple-500 focus:ring-offset-0"
              />
              <span>Regex</span>
            </label>
          </div>
        </div>

        <ConfigCheckbox
          label="Unread emails only"
          checked={(config.unreadOnly as boolean) !== false}
          onChange={(v) => updateConfig('unreadOnly', v)}
        />

        <ConfigCheckbox
          label="Has attachment"
          checked={(config.hasAttachment as boolean) || false}
          onChange={(v) => updateConfig('hasAttachment', v)}
        />

        {Boolean(config.hasAttachment) && (
          <ConfigSelect
            label="Attachment Type"
            value={(config.attachmentType as string) || 'any'}
            onChange={(v) => updateConfig('attachmentType', v)}
            options={attachmentTypes}
            className="ml-6"
          />
        )}
      </div>

      {/* Polling Settings */}
      <div className="p-3 bg-slate-700/30 rounded-lg border border-slate-600/50">
        <SectionHeader title="Polling Settings" />

        <ConfigSlider
          label="Check every"
          value={(config.pollingInterval as number) || 5}
          onChange={(v) => updateConfig('pollingInterval', v)}
          min={1}
          max={60}
          valueSuffix=" minutes"
          marks={[
            { value: 1, label: '1 min' },
            { value: 30, label: '30 min' },
            { value: 60, label: '60 min' },
          ]}
        />

        <ConfigCheckbox
          label="Mark as read after processing"
          checked={(config.markAsRead as boolean) || false}
          onChange={(v) => updateConfig('markAsRead', v)}
        />
      </div>

      <ConfigCheckbox
        label="Enabled"
        checked={(config.enabled as boolean) !== false}
        onChange={(v) => updateConfig('enabled', v)}
        helpText="Whether this email trigger is active"
      />

      {/* Output Variables */}
      <OutputVariablesDoc
        variables={[
          { name: '{{email.from}}', description: 'Sender email address' },
          { name: '{{email.fromName}}', description: 'Sender display name' },
          { name: '{{email.to}}', description: 'Recipient address' },
          { name: '{{email.subject}}', description: 'Email subject' },
          { name: '{{email.body}}', description: 'Plain text body' },
          { name: '{{email.bodyHtml}}', description: 'HTML body' },
          { name: '{{email.date}}', description: 'Received date' },
          { name: '{{email.attachments}}', description: 'Array of attachments' },
          { name: '{{email.messageId}}', description: 'Unique message ID' },
        ]}
      />
    </div>
  );
};

// ==========================================
// MANUAL TRIGGER CONFIG FORM
// ==========================================
const ManualTriggerForm: React.FC<{
  config: Record<string, unknown>;
  onConfigChange: (config: Record<string, unknown>) => void;
}> = ({ config, onConfigChange }) => {
  const updateConfig = (key: string, value: unknown) => {
    onConfigChange({ ...config, [key]: value });
  };

  return (
    <div className="space-y-4">
      <ConfigInput
        label="Description"
        value={(config.description as string) || ''}
        onChange={(v) => updateConfig('description', v)}
        placeholder="Describe when this flow should be triggered manually"
        helpText="Optional description for documentation purposes"
      />

      <ConfigTextarea
        label="Default Input (JSON)"
        value={
          typeof config.defaultInput === 'object'
            ? JSON.stringify(config.defaultInput, null, 2)
            : (config.defaultInput as string) || ''
        }
        onChange={(v) => {
          try {
            updateConfig('defaultInput', JSON.parse(v));
          } catch {
            updateConfig('defaultInput', v);
          }
        }}
        placeholder='{"message": "Hello", "userId": "user-123"}'
        helpText="Default input data when triggered manually"
        rows={4}
      />

      <ConfigCheckbox
        label="Require Confirmation"
        checked={(config.requireConfirmation as boolean) || false}
        onChange={(v) => updateConfig('requireConfirmation', v)}
        helpText="Show confirmation dialog before executing"
      />

      <InfoBox variant="info">
        <p className="text-xs">
          Manual triggers start when you click the "Run" button or via API call. Use the default input to pre-populate
          data for testing.
        </p>
      </InfoBox>

      {/* Output Variables */}
      <OutputVariablesDoc
        variant="purple"
        variables={[
          { name: '{{trigger.type}}', description: 'Always "manual"' },
          { name: '{{trigger.timestamp}}', description: 'Execution timestamp' },
          { name: '{{trigger.userId}}', description: 'User who triggered' },
          { name: '{{input.*}}', description: 'Input data provided' },
        ]}
      />
    </div>
  );
};

// ==========================================
// MAIN COMPONENT - TRIGGER CONFIG FORMS
// ==========================================
const TriggerConfigForms: React.FC<TriggerConfigFormsProps> = ({ nodeType, config, onConfigChange, agentId }) => {
  // Map node types to form components
  // Support both old-style (trigger-message) and new-style (message_received) names
  switch (nodeType) {
    // Schedule/Time triggers
    case 'trigger:schedule':
    case 'schedule':
    case 'trigger-time':
      return <ScheduleTriggerForm config={config} onConfigChange={onConfigChange} />;

    // Message triggers
    case 'trigger:message':
    case 'message_received':
    case 'trigger-message':
      return <MessageTriggerForm config={config} onConfigChange={onConfigChange} agentId={agentId} />;

    // Webhook triggers
    case 'trigger:webhook':
    case 'webhook':
    case 'trigger-webhook':
      return <WebhookTriggerForm config={config} onConfigChange={onConfigChange} />;

    // Event triggers
    case 'trigger:event':
    case 'event':
    case 'trigger-event':
      return <EventTriggerForm config={config} onConfigChange={onConfigChange} />;

    // Email triggers
    case 'trigger:email':
    case 'email_received':
    case 'trigger-email':
      return <EmailTriggerForm config={config} onConfigChange={onConfigChange} />;

    // Manual triggers
    case 'trigger:manual':
    case 'manual':
    case 'trigger-manual':
      return <ManualTriggerForm config={config} onConfigChange={onConfigChange} />;

    default:
      return (
        <div className="p-4 text-slate-400 text-sm">
          <InfoBox variant="warning">
            <p>No configuration form available for trigger type: {nodeType}</p>
          </InfoBox>
        </div>
      );
  }
};

export default TriggerConfigForms;
