/**
 * Event Batcher — Collects events and pushes in batches
 *
 * Buffers mobile events in memory and flushes either:
 * - Every pushIntervalMs (default 30s)
 * - When batch reaches maxBatchSize (default 20)
 *
 * If socket is disconnected, events queue up to maxQueueSize (500).
 * Oldest events are dropped if queue overflows.
 */
import { MobileEvent, DEFAULT_CONFIG } from '../utils/constants';

type FlushCallback = (events: MobileEvent[]) => void;

export class EventBatcher {
  private queue: MobileEvent[] = [];
  private flushCallback: FlushCallback | null = null;
  private flushInterval: ReturnType<typeof setInterval> | null = null;
  private config = { ...DEFAULT_CONFIG };

  setFlushCallback(callback: FlushCallback): void {
    this.flushCallback = callback;
  }

  updateConfig(config: Partial<typeof DEFAULT_CONFIG>): void {
    this.config = { ...this.config, ...config };
  }

  push(event: MobileEvent): void {
    this.queue.push(event);

    // Drop oldest if queue overflow
    if (this.queue.length > this.config.maxQueueSize) {
      this.queue = this.queue.slice(-this.config.maxQueueSize);
    }

    // Flush if batch size reached
    if (this.queue.length >= this.config.maxBatchSize) {
      this.flush();
    }
  }

  flush(): void {
    if (this.queue.length === 0 || !this.flushCallback) return;

    const batch = this.queue.splice(0, this.config.maxBatchSize);
    this.flushCallback(batch);
  }

  start(): void {
    this.stop();
    this.flushInterval = setInterval(() => this.flush(), this.config.pushIntervalMs);
  }

  stop(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
  }

  getQueueSize(): number {
    return this.queue.length;
  }

  clear(): void {
    this.queue = [];
  }
}

// Singleton
let instance: EventBatcher | null = null;

export function getEventBatcher(): EventBatcher {
  if (!instance) {
    instance = new EventBatcher();
  }
  return instance;
}
