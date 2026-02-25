/**
 * AI Concurrency Guard
 * ====================
 * Global concurrency limiter for background AI tasks.
 * Shared between SchedulerService, SelfPromptingEngine, and any future
 * background AI consumers. Prevents V8 heap exhaustion from too many
 * simultaneous AI/CLI tasks.
 *
 * Usage:
 *   const { getAIConcurrencyGuard } = require('./AIConcurrencyGuard.cjs');
 *   const guard = getAIConcurrencyGuard();
 *
 *   // Blocking (waits for slot):
 *   const release = await guard.acquire(30000);
 *   try { ... } finally { release(); }
 *
 *   // Non-blocking (skip if busy):
 *   const release = guard.tryAcquire();
 *   if (!release) return; // at capacity
 *   try { ... } finally { release(); }
 */

const { logger } = require('../logger.cjs');

class AIConcurrencyGuard {
  constructor() {
    this.maxConcurrent = parseInt(process.env.AI_MAX_CONCURRENT_BACKGROUND, 10) || 3;
    this.running = 0;
    this.queue = []; // waiting resolvers
  }

  /**
   * Acquire a slot. Returns a release function.
   * If at capacity, waits until a slot is free or timeout.
   * @param {number} timeoutMs - Max time to wait for a slot (default 60s)
   * @returns {Promise<Function>} release function
   */
  async acquire(timeoutMs = 60000) {
    if (this.running < this.maxConcurrent) {
      this.running++;
      logger.debug(`[ConcurrencyGuard] Acquired slot (${this.running}/${this.maxConcurrent})`);
      return this._createRelease();
    }

    // Wait for a slot
    return new Promise((resolve, reject) => {
      const entry = {};

      entry.timer = setTimeout(() => {
        const idx = this.queue.indexOf(entry);
        if (idx !== -1) this.queue.splice(idx, 1);
        reject(new Error(`ConcurrencyGuard: timeout waiting for slot after ${timeoutMs}ms (${this.running}/${this.maxConcurrent} active)`));
      }, timeoutMs);

      entry.resolve = (releaseFn) => {
        clearTimeout(entry.timer);
        resolve(releaseFn);
      };

      this.queue.push(entry);
      logger.debug(`[ConcurrencyGuard] Queued (${this.queue.length} waiting, ${this.running}/${this.maxConcurrent} active)`);
    });
  }

  /**
   * Try to acquire without waiting. Returns release function or null.
   */
  tryAcquire() {
    if (this.running < this.maxConcurrent) {
      this.running++;
      logger.debug(`[ConcurrencyGuard] Acquired slot (${this.running}/${this.maxConcurrent})`);
      return this._createRelease();
    }
    logger.debug(`[ConcurrencyGuard] At capacity (${this.running}/${this.maxConcurrent}), skipping`);
    return null;
  }

  /**
   * Create a one-time release function
   */
  _createRelease() {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.running--;
      logger.debug(`[ConcurrencyGuard] Released slot (${this.running}/${this.maxConcurrent})`);

      // Wake next waiter if any
      if (this.queue.length > 0 && this.running < this.maxConcurrent) {
        this.running++;
        const next = this.queue.shift();
        next.resolve(this._createRelease());
      }
    };
  }

  /**
   * Get current stats
   */
  getStats() {
    return {
      running: this.running,
      maxConcurrent: this.maxConcurrent,
      queued: this.queue.length,
    };
  }
}

// Singleton
let _instance = null;

function getAIConcurrencyGuard() {
  if (!_instance) {
    _instance = new AIConcurrencyGuard();
  }
  return _instance;
}

module.exports = { AIConcurrencyGuard, getAIConcurrencyGuard };
