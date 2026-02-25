/**
 * Schedule Trigger Node
 *
 * Executes flows on a schedule using cron expressions, recurring intervals, or one-time schedules.
 * Requires background scheduler service to be running.
 */

const { BaseNodeExecutor } = require('../../BaseNodeExecutor.cjs');

class ScheduleTriggerNode extends BaseNodeExecutor {
  constructor() {
    super('trigger:schedule', 'trigger');
  }

  async execute(context) {
    const { input, node } = context;
    const data = node.data || {};

    // Get schedule information from input (populated by scheduler service)
    const scheduledTime = input.scheduledTime || new Date().toISOString();
    const scheduleType = data.scheduleType || 'oneTime';

    // Extract schedule data
    const scheduleData = {
      triggeredAt: scheduledTime,
      triggerType: 'schedule',
      scheduleType,
      timezone: data.timezone || 'UTC',
      actualTime: new Date().toISOString(),
      drift: this.calculateDrift(scheduledTime),
    };

    // Add type-specific data
    switch (scheduleType) {
      case 'cron':
        scheduleData.cronExpression = data.cronExpression || '';
        break;

      case 'recurring':
        scheduleData.interval = data.interval || {};
        break;

      case 'oneTime':
        scheduleData.scheduledDate = data.scheduledDate || '';
        break;
    }

    return this.success(scheduleData);
  }

  /**
   * Calculate drift between scheduled time and actual execution time
   */
  calculateDrift(scheduledTime) {
    try {
      const scheduled = new Date(scheduledTime);
      const actual = new Date();
      const driftMs = actual - scheduled;

      return {
        milliseconds: driftMs,
        seconds: Math.round(driftMs / 1000),
        isLate: driftMs > 0,
      };
    } catch (error) {
      return { milliseconds: 0, seconds: 0, isLate: false };
    }
  }

  validate(node) {
    const errors = [];
    const data = node.data || {};

    // Schedule type validation
    if (!data.scheduleType) {
      errors.push('Schedule type is required');
    } else if (!['cron', 'recurring', 'oneTime'].includes(data.scheduleType)) {
      errors.push('Schedule type must be one of: cron, recurring, oneTime');
    }

    // Type-specific validation
    if (data.scheduleType === 'cron') {
      if (!data.cronExpression) {
        errors.push('Cron expression is required for cron schedule');
      } else {
        const cronErrors = this.validateCronExpression(data.cronExpression);
        errors.push(...cronErrors);
      }
    }

    if (data.scheduleType === 'recurring') {
      if (!data.interval) {
        errors.push('Interval is required for recurring schedule');
      } else {
        const interval = data.interval;

        if (!interval.value || interval.value <= 0) {
          errors.push('Interval value must be greater than 0');
        }

        if (!interval.unit) {
          errors.push('Interval unit is required');
        } else if (!['minutes', 'hours', 'days', 'weeks'].includes(interval.unit)) {
          errors.push('Interval unit must be one of: minutes, hours, days, weeks');
        }

        // Minimum interval checks
        if (interval.unit === 'minutes' && interval.value < 5) {
          errors.push('Minimum interval for minutes is 5 minutes');
        }
      }
    }

    if (data.scheduleType === 'oneTime') {
      if (!data.scheduledDate) {
        errors.push('Scheduled date is required for one-time schedule');
      } else {
        try {
          const date = new Date(data.scheduledDate);
          if (isNaN(date.getTime())) {
            errors.push('Invalid scheduled date format');
          } else if (date < new Date()) {
            errors.push('Scheduled date must be in the future');
          }
        } catch (e) {
          errors.push('Invalid scheduled date format');
        }
      }
    }

    // Timezone validation
    if (data.timezone && !this.isValidTimezone(data.timezone)) {
      errors.push('Invalid timezone. Use IANA timezone format (e.g., America/New_York)');
    }

    // Date range validation
    if (data.startDate && data.endDate) {
      try {
        const start = new Date(data.startDate);
        const end = new Date(data.endDate);
        if (start >= end) {
          errors.push('Start date must be before end date');
        }
      } catch (e) {
        // Invalid dates already caught above
      }
    }

    return errors;
  }

  /**
   * Validate cron expression format
   */
  validateCronExpression(expression) {
    const errors = [];

    if (typeof expression !== 'string' || expression.trim().length === 0) {
      errors.push('Cron expression must be a non-empty string');
      return errors;
    }

    const parts = expression.trim().split(/\s+/);

    // Standard cron: 5 or 6 fields (second is optional)
    if (parts.length < 5 || parts.length > 6) {
      errors.push('Cron expression must have 5 or 6 fields (minute hour day month weekday [second])');
      return errors;
    }

    // Validate each field
    const fieldValidations = [
      { name: 'minute', min: 0, max: 59, index: 0 },
      { name: 'hour', min: 0, max: 23, index: 1 },
      { name: 'day', min: 1, max: 31, index: 2 },
      { name: 'month', min: 1, max: 12, index: 3 },
      { name: 'weekday', min: 0, max: 6, index: 4 },
    ];

    for (const field of fieldValidations) {
      const value = parts[field.index];
      if (!this.isValidCronField(value, field.min, field.max)) {
        errors.push(`Invalid ${field.name} field: ${value}`);
      }
    }

    return errors;
  }

  /**
   * Validate a single cron field
   */
  isValidCronField(value, min, max) {
    if (!value) return false;

    // Wildcard
    if (value === '*') return true;

    // List (e.g., 1,2,3)
    if (value.includes(',')) {
      return value.split(',').every(v => this.isValidCronField(v.trim(), min, max));
    }

    // Range (e.g., 1-5)
    if (value.includes('-')) {
      const [start, end] = value.split('-').map(v => parseInt(v, 10));
      return !isNaN(start) && !isNaN(end) && start >= min && end <= max && start < end;
    }

    // Step (e.g., */5 or 1-10/2)
    if (value.includes('/')) {
      const [range, step] = value.split('/');
      const stepNum = parseInt(step, 10);
      if (isNaN(stepNum) || stepNum <= 0) return false;

      if (range === '*') return true;
      return this.isValidCronField(range, min, max);
    }

    // Single number
    const num = parseInt(value, 10);
    return !isNaN(num) && num >= min && num <= max;
  }

  /**
   * Validate timezone (basic check)
   */
  isValidTimezone(timezone) {
    try {
      // Try to create a date with this timezone
      new Date().toLocaleString('en-US', { timeZone: timezone });
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Get metadata for FlowBuilder UI
   */
  static getMetadata() {
    return {
      type: 'trigger:schedule',
      category: 'trigger',
      name: 'Schedule Trigger',
      description: 'Trigger flow on a schedule (cron, recurring, or one-time)',
      icon: 'clock',
      properties: [
        {
          name: 'scheduleType',
          type: 'select',
          label: 'Schedule Type',
          description: 'Type of schedule to use',
          required: true,
          options: [
            { value: 'cron', label: 'Cron Expression (advanced)' },
            { value: 'recurring', label: 'Recurring Interval (simple)' },
            { value: 'oneTime', label: 'One-Time (future date)' },
          ],
          default: 'recurring',
        },
        {
          name: 'cronExpression',
          type: 'text',
          label: 'Cron Expression',
          description: 'Cron expression (e.g., "0 9 * * 1-5" for weekdays at 9am)',
          required: true,
          visibleWhen: 'scheduleType === "cron"',
          placeholder: '0 9 * * 1-5',
          help: 'Format: minute hour day month weekday',
        },
        {
          name: 'interval',
          type: 'object',
          label: 'Interval',
          description: 'How often to run the schedule',
          required: true,
          visibleWhen: 'scheduleType === "recurring"',
          properties: [
            {
              name: 'value',
              type: 'number',
              label: 'Every',
              required: true,
              min: 1,
              default: 1,
            },
            {
              name: 'unit',
              type: 'select',
              label: 'Unit',
              required: true,
              options: [
                { value: 'minutes', label: 'Minutes (min 5)' },
                { value: 'hours', label: 'Hours' },
                { value: 'days', label: 'Days' },
                { value: 'weeks', label: 'Weeks' },
              ],
              default: 'hours',
            },
          ],
        },
        {
          name: 'scheduledDate',
          type: 'datetime',
          label: 'Scheduled Date',
          description: 'When to trigger the flow (must be in the future)',
          required: true,
          visibleWhen: 'scheduleType === "oneTime"',
        },
        {
          name: 'timezone',
          type: 'text',
          label: 'Timezone',
          description: 'IANA timezone (e.g., America/New_York, Europe/London, Asia/Tokyo)',
          default: 'UTC',
          placeholder: 'UTC',
          help: 'Uses IANA timezone database format',
        },
        {
          name: 'startDate',
          type: 'datetime',
          label: 'Start Date (Optional)',
          description: 'When to start the schedule (for cron/recurring)',
          visibleWhen: 'scheduleType !== "oneTime"',
        },
        {
          name: 'endDate',
          type: 'datetime',
          label: 'End Date (Optional)',
          description: 'When to stop the schedule (for cron/recurring)',
          visibleWhen: 'scheduleType !== "oneTime"',
        },
      ],
      outputs: [
        {
          name: 'triggeredAt',
          type: 'string',
          description: 'Scheduled execution time (ISO 8601)',
        },
        {
          name: 'actualTime',
          type: 'string',
          description: 'Actual execution time (ISO 8601)',
        },
        {
          name: 'scheduleType',
          type: 'string',
          description: 'Type of schedule (cron, recurring, oneTime)',
        },
        {
          name: 'timezone',
          type: 'string',
          description: 'Timezone used for scheduling',
        },
        {
          name: 'drift',
          type: 'object',
          description: 'Time drift between scheduled and actual execution',
          properties: [
            { name: 'milliseconds', type: 'number' },
            { name: 'seconds', type: 'number' },
            { name: 'isLate', type: 'boolean' },
          ],
        },
        {
          name: 'cronExpression',
          type: 'string',
          description: 'Cron expression (if type is cron)',
        },
        {
          name: 'interval',
          type: 'object',
          description: 'Interval settings (if type is recurring)',
        },
      ],
    };
  }
}

module.exports = { ScheduleTriggerNode };
