/**
 * Delay Node
 *
 * Pauses flow execution for a specified duration.
 * Useful for rate limiting, scheduling, or creating intentional pauses.
 */

const { BaseNodeExecutor } = require('../../BaseNodeExecutor.cjs');

class DelayNode extends BaseNodeExecutor {
  constructor() {
    super('logic:delay', 'logic');
  }

  async execute(context) {
    const { node } = context;
    const data = node.data || {};

    // Get delay duration
    const duration = this.getOptional(data, 'duration', 1000);
    const unit = this.getOptional(data, 'unit', 'ms');

    // Convert to milliseconds
    let delayMs = parseInt(duration, 10);
    switch (unit) {
      case 's':
      case 'seconds':
        delayMs *= 1000;
        break;
      case 'm':
      case 'minutes':
        delayMs *= 60 * 1000;
        break;
      case 'h':
      case 'hours':
        delayMs *= 60 * 60 * 1000;
        break;
      case 'ms':
      case 'milliseconds':
      default:
        // Already in milliseconds
        break;
    }

    // Cap at maximum delay (30 minutes)
    const maxDelay = 30 * 60 * 1000;
    if (delayMs > maxDelay) {
      delayMs = maxDelay;
    }

    // Validate delay is positive
    if (delayMs <= 0) {
      return this.skip('Delay duration is 0 or negative, skipping');
    }

    const startTime = Date.now();

    // Wait for the specified duration
    // Check abort signal periodically for long delays
    if (delayMs > 1000 && context.abortSignal) {
      const checkInterval = Math.min(delayMs / 10, 1000);
      let elapsed = 0;

      while (elapsed < delayMs) {
        if (context.abortSignal.aborted) {
          return this.failure('Delay cancelled', 'CANCELLED');
        }

        const remaining = delayMs - elapsed;
        const waitTime = Math.min(checkInterval, remaining);

        await new Promise(resolve => setTimeout(resolve, waitTime));
        elapsed = Date.now() - startTime;
      }
    } else {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }

    const endTime = Date.now();

    return this.success({
      requestedDelay: duration,
      unit,
      actualDelayMs: endTime - startTime,
      startTime: new Date(startTime).toISOString(),
      endTime: new Date(endTime).toISOString(),
    });
  }

  validate(node) {
    const errors = [];
    const data = node.data || {};

    if (data.duration !== undefined) {
      const dur = parseInt(data.duration, 10);
      if (isNaN(dur)) {
        errors.push('Duration must be a number');
      }
    }

    const validUnits = ['ms', 'milliseconds', 's', 'seconds', 'm', 'minutes', 'h', 'hours'];
    if (data.unit && !validUnits.includes(data.unit)) {
      errors.push(`Invalid unit: ${data.unit}. Valid units: ${validUnits.join(', ')}`);
    }

    return errors;
  }
}

module.exports = { DelayNode };
