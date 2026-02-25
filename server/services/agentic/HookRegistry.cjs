/**
 * Hook Registry
 * =============
 * Central event-driven hook system for extensibility.
 * Handlers are registered per event with priority ordering.
 * Each handler is an async function that receives context and can modify it.
 *
 * Usage:
 *   const { getHookRegistry } = require('./HookRegistry.cjs');
 *   const hooks = getHookRegistry();
 *   hooks.register('message:incoming', handler, { priority: 50, name: 'myHook' });
 *   const ctx = await hooks.emit('message:incoming', { message, userId });
 */

const { logger } = require('../logger.cjs');

const MAX_HOOKS_PER_EVENT = 20;
const HANDLER_TIMEOUT_MS = 5000;

class HookRegistry {
  constructor() {
    this.hooks = new Map();  // eventName -> sorted array of { handler, priority, name }
    this.stats = new Map();  // eventName -> { emitCount, errorCount, lastEmit }
  }

  /**
   * Register a hook handler for an event.
   * @param {string} eventName - Event to listen for
   * @param {Function} handler - async (context) => modifiedContext
   * @param {Object} options
   * @param {number} options.priority - Lower runs first (default: 100)
   * @param {string} options.name - Handler identifier for debugging
   */
  register(eventName, handler, { priority = 100, name = 'anonymous' } = {}) {
    if (typeof handler !== 'function') {
      throw new Error(`Hook handler for '${eventName}' must be a function`);
    }

    if (!this.hooks.has(eventName)) {
      this.hooks.set(eventName, []);
    }

    const handlers = this.hooks.get(eventName);

    if (handlers.length >= MAX_HOOKS_PER_EVENT) {
      logger.warn(`[HookRegistry] Max hooks (${MAX_HOOKS_PER_EVENT}) reached for '${eventName}', ignoring '${name}'`);
      return;
    }

    // Remove existing handler with same name to prevent duplicates
    const existingIdx = handlers.findIndex(h => h.name === name);
    if (existingIdx >= 0) {
      handlers.splice(existingIdx, 1);
    }

    handlers.push({ handler, priority, name });
    handlers.sort((a, b) => a.priority - b.priority);

    logger.debug(`[HookRegistry] Registered '${name}' for '${eventName}' (priority: ${priority})`);
  }

  /**
   * Unregister a handler by name.
   * @param {string} eventName
   * @param {string} name - Handler name to remove
   */
  unregister(eventName, name) {
    const handlers = this.hooks.get(eventName);
    if (!handlers) return;

    const idx = handlers.findIndex(h => h.name === name);
    if (idx >= 0) {
      handlers.splice(idx, 1);
      logger.debug(`[HookRegistry] Unregistered '${name}' from '${eventName}'`);
    }
  }

  /**
   * Emit an event and run all registered handlers in priority order.
   * Each handler receives the context and can modify it.
   * Errors are caught per handler - never crash the system.
   *
   * @param {string} eventName
   * @param {Object} context - Event data (passed to each handler)
   * @returns {Object} Potentially modified context
   */
  async emit(eventName, context = {}) {
    const handlers = this.hooks.get(eventName);

    // Track stats
    if (!this.stats.has(eventName)) {
      this.stats.set(eventName, { emitCount: 0, errorCount: 0, lastEmit: null });
    }
    const stats = this.stats.get(eventName);
    stats.emitCount++;
    stats.lastEmit = Date.now();

    if (!handlers || handlers.length === 0) {
      return context;
    }

    let currentContext = { ...context };

    for (const { handler, name } of handlers) {
      try {
        const result = await Promise.race([
          handler(currentContext),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`Hook '${name}' timed out after ${HANDLER_TIMEOUT_MS}ms`)), HANDLER_TIMEOUT_MS)
          ),
        ]);

        // If handler returns a modified context, use it
        if (result && typeof result === 'object') {
          currentContext = result;
        }
      } catch (error) {
        stats.errorCount++;
        logger.warn(`[HookRegistry] Hook '${name}' failed for '${eventName}': ${error.message}`);
        // Continue to next handler - never crash
      }
    }

    return currentContext;
  }

  /**
   * Emit an event without waiting for results (fire-and-forget).
   * Useful for logging and non-critical side effects.
   * @param {string} eventName
   * @param {Object} context
   */
  emitAsync(eventName, context = {}) {
    this.emit(eventName, context).catch(err => {
      logger.debug(`[HookRegistry] Async emit error for '${eventName}': ${err.message}`);
    });
  }

  /**
   * Get all registered events and their handler counts.
   * @returns {Object}
   */
  getRegisteredEvents() {
    const events = {};
    for (const [eventName, handlers] of this.hooks) {
      events[eventName] = {
        handlerCount: handlers.length,
        handlers: handlers.map(h => ({ name: h.name, priority: h.priority })),
        stats: this.stats.get(eventName) || { emitCount: 0, errorCount: 0, lastEmit: null },
      };
    }
    return events;
  }

  /**
   * Check if any handlers exist for an event.
   * @param {string} eventName
   * @returns {boolean}
   */
  hasHandlers(eventName) {
    const handlers = this.hooks.get(eventName);
    return handlers && handlers.length > 0;
  }

  /**
   * Clear all hooks (for testing/cleanup).
   */
  clear() {
    this.hooks.clear();
    this.stats.clear();
  }
}

// Singleton
let _instance = null;
function getHookRegistry() {
  if (!_instance) {
    _instance = new HookRegistry();
  }
  return _instance;
}

module.exports = {
  HookRegistry,
  getHookRegistry,
};
