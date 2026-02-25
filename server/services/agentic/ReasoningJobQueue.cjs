/**
 * ReasoningJobQueue — Phase 7: Distributed Job Queue
 * ====================================================
 * Uses Bull (Redis-backed) to queue reasoning loop executions.
 * Enables horizontal scaling and priority-based processing.
 *
 * Priority levels:
 *   1 = master/critical (urgent)
 *   2 = complex tasks
 *   3 = standard tasks
 *   5 = low-priority/periodic
 *
 * Usage:
 *   const { getReasoningJobQueue } = require('./ReasoningJobQueue.cjs');
 *   const queue = getReasoningJobQueue();
 *   await queue.enqueue(agentId, 'wake_up', { situation: '...' });
 */

const { logger } = require('../logger.cjs');
const { config } = require('../../config/index.cjs');

class ReasoningJobQueue {
  constructor() {
    this.queue = null;
    this.initialized = false;
    this.processing = false;
  }

  /**
   * Initialize the Bull queue with Redis connection.
   */
  initialize() {
    if (this.initialized) return;

    try {
      const Queue = require('bull');

      // Parse REDIS_URL if available (Docker: redis://redis:6379), else use host/port
      let redisOpts;
      if (config.redisUrl) {
        redisOpts = config.redisUrl;
      } else {
        redisOpts = {
          host: config.redisHost || 'localhost',
          port: config.redisPort || 6380,
        };
        if (config.redisPassword) {
          redisOpts.password = config.redisPassword;
        }
      }

      this.queue = new Queue('agentic-reasoning', {
        redis: redisOpts,
        defaultJobOptions: {
          removeOnComplete: 100, // Keep last 100 completed jobs
          removeOnFail: 50,      // Keep last 50 failed jobs
          attempts: 1,           // No auto-retry (reasoning loop has its own recovery)
          timeout: 5 * 60 * 1000, // 5 minute max per job
        },
      });

      this.queue.on('error', (err) => {
        logger.warn(`[JobQueue] Queue error: ${err.message}`);
      });

      this.queue.on('failed', (job, err) => {
        logger.warn(`[JobQueue] Job ${job.id} failed: ${err.message}`);
      });

      this.initialized = true;
      logger.info('[JobQueue] Bull queue initialized (Redis-backed)');
    } catch (err) {
      logger.warn(`[JobQueue] Failed to initialize Bull queue: ${err.message}. Jobs will execute directly.`);
      this.initialized = false;
    }
  }

  /**
   * Start the worker to process queued reasoning jobs.
   * @param {number} concurrency - Number of concurrent jobs (default: 3)
   */
  startWorker(concurrency = 3) {
    if (!this.queue || this.processing) return;

    this.queue.process(concurrency, async (job) => {
      const { agentId, trigger, triggerContext } = job.data;

      logger.info(`[JobQueue] Processing job ${job.id}: agent=${agentId}, trigger=${trigger}`);

      try {
        const { getAgentReasoningLoop } = require('./AgentReasoningLoop.cjs');
        const loop = getAgentReasoningLoop();
        const result = await loop.run(agentId, trigger, triggerContext);

        logger.info(`[JobQueue] Job ${job.id} completed: ${result.iterations} iterations, ${result.actions?.length || 0} actions`);
        return result;
      } catch (err) {
        logger.error(`[JobQueue] Job ${job.id} error: ${err.message}`);
        throw err;
      }
    });

    this.processing = true;
    logger.info(`[JobQueue] Worker started with concurrency=${concurrency}`);
  }

  /**
   * Enqueue a reasoning job.
   *
   * @param {string} agentId - Agent to run
   * @param {string} trigger - Trigger type
   * @param {Object} triggerContext - Context data
   * @param {Object} options - { priority, isMaster, isCritical, isComplex }
   * @returns {Promise<Object>} Bull job object
   */
  async enqueue(agentId, trigger, triggerContext = {}, options = {}) {
    if (!this.queue || !this.initialized) {
      // Fallback: execute directly if queue not available
      return null;
    }

    // Determine priority
    let priority = 5; // default: low
    if (options.isMaster || options.priority === 1) priority = 1;
    else if (options.isCritical || options.priority === 2) priority = 2;
    else if (options.isComplex || options.priority === 3) priority = 3;
    else if (options.priority) priority = options.priority;

    const job = await this.queue.add(
      { agentId, trigger, triggerContext },
      { priority, jobId: `${agentId}-${trigger}-${Date.now()}` }
    );

    logger.info(`[JobQueue] Enqueued job ${job.id}: agent=${agentId}, trigger=${trigger}, priority=${priority}`);
    return job;
  }

  /**
   * Get queue statistics.
   */
  async getStats() {
    if (!this.queue) {
      return { available: false };
    }

    try {
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        this.queue.getWaitingCount(),
        this.queue.getActiveCount(),
        this.queue.getCompletedCount(),
        this.queue.getFailedCount(),
        this.queue.getDelayedCount(),
      ]);

      return {
        available: true,
        waiting,
        active,
        completed,
        failed,
        delayed,
      };
    } catch (err) {
      return { available: false, error: err.message };
    }
  }

  /**
   * Graceful shutdown.
   */
  async stop() {
    if (this.queue) {
      try {
        await this.queue.close();
        logger.info('[JobQueue] Queue closed gracefully');
      } catch (err) {
        logger.warn(`[JobQueue] Queue close error: ${err.message}`);
      }
      this.queue = null;
      this.initialized = false;
      this.processing = false;
    }
  }
}

// Singleton
let _instance = null;
function getReasoningJobQueue() {
  if (!_instance) _instance = new ReasoningJobQueue();
  return _instance;
}

module.exports = { ReasoningJobQueue, getReasoningJobQueue };
