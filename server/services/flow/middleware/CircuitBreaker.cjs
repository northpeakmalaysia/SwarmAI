/**
 * Circuit Breaker
 *
 * Protects against cascading failures by:
 * - Tracking failure rates per node type or service
 * - Opening circuit when threshold exceeded
 * - Half-open state for testing recovery
 * - Automatic reset after timeout
 */

const { logger } = require('../../logger.cjs');

/**
 * Circuit states
 */
const CircuitState = {
  CLOSED: 'closed',     // Normal operation
  OPEN: 'open',         // Failing, rejecting requests
  HALF_OPEN: 'half_open' // Testing if recovered
};

/**
 * CircuitBreaker implements the circuit breaker pattern.
 */
class CircuitBreaker {
  /**
   * @param {Object} [options] - Configuration options
   * @param {number} [options.failureThreshold=5] - Failures before opening
   * @param {number} [options.successThreshold=2] - Successes in half-open to close
   * @param {number} [options.resetTimeout=30000] - Time in ms before trying half-open
   * @param {number} [options.halfOpenRequests=1] - Allowed requests in half-open
   * @param {number} [options.monitorInterval=60000] - Stats reset interval
   */
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 5;
    this.successThreshold = options.successThreshold || 2;
    this.resetTimeout = options.resetTimeout || 30000;
    this.halfOpenRequests = options.halfOpenRequests || 1;
    this.monitorInterval = options.monitorInterval || 60000;

    // Circuit states per key
    this.circuits = new Map();

    // Start monitoring timer
    this.monitorTimer = setInterval(() => this.monitor(), this.monitorInterval);
  }

  /**
   * Get or create circuit state for a key
   * @param {string} key - Circuit identifier (e.g., 'node:ai:chatCompletion')
   * @returns {Object}
   */
  getCircuit(key) {
    if (!this.circuits.has(key)) {
      this.circuits.set(key, {
        state: CircuitState.CLOSED,
        failures: 0,
        successes: 0,
        lastFailure: null,
        lastSuccess: null,
        halfOpenAttempts: 0,
        totalRequests: 0,
        totalFailures: 0,
        createdAt: Date.now()
      });
    }
    return this.circuits.get(key);
  }

  /**
   * Check if request should be allowed
   * @param {string} key - Circuit identifier
   * @returns {boolean}
   */
  canExecute(key) {
    const circuit = this.getCircuit(key);

    switch (circuit.state) {
      case CircuitState.CLOSED:
        return true;

      case CircuitState.OPEN:
        // Check if reset timeout has passed
        if (Date.now() - circuit.lastFailure >= this.resetTimeout) {
          this.transitionToHalfOpen(key, circuit);
          return circuit.halfOpenAttempts < this.halfOpenRequests;
        }
        return false;

      case CircuitState.HALF_OPEN:
        return circuit.halfOpenAttempts < this.halfOpenRequests;

      default:
        return true;
    }
  }

  /**
   * Execute a function with circuit breaker protection
   * @param {string} key - Circuit identifier
   * @param {Function} operation - Async function to execute
   * @returns {Promise<*>}
   * @throws {CircuitOpenError} If circuit is open
   */
  async execute(key, operation) {
    const circuit = this.getCircuit(key);
    circuit.totalRequests++;

    // Check if we can execute
    if (!this.canExecute(key)) {
      const remainingTime = this.resetTimeout - (Date.now() - circuit.lastFailure);
      throw new CircuitOpenError(key, remainingTime);
    }

    // Track half-open attempt
    if (circuit.state === CircuitState.HALF_OPEN) {
      circuit.halfOpenAttempts++;
    }

    try {
      const result = await operation();
      this.recordSuccess(key);
      return result;
    } catch (error) {
      this.recordFailure(key, error);
      throw error;
    }
  }

  /**
   * Record a successful execution
   * @param {string} key
   */
  recordSuccess(key) {
    const circuit = this.getCircuit(key);
    circuit.successes++;
    circuit.lastSuccess = Date.now();
    circuit.failures = 0; // Reset failure count

    if (circuit.state === CircuitState.HALF_OPEN) {
      if (circuit.successes >= this.successThreshold) {
        this.transitionToClosed(key, circuit);
      }
    }
  }

  /**
   * Record a failed execution
   * @param {string} key
   * @param {Error} error
   */
  recordFailure(key, error) {
    const circuit = this.getCircuit(key);
    circuit.failures++;
    circuit.totalFailures++;
    circuit.lastFailure = Date.now();
    circuit.successes = 0; // Reset success count

    if (circuit.state === CircuitState.HALF_OPEN) {
      // Any failure in half-open opens the circuit again
      this.transitionToOpen(key, circuit, error);
    } else if (circuit.state === CircuitState.CLOSED) {
      if (circuit.failures >= this.failureThreshold) {
        this.transitionToOpen(key, circuit, error);
      }
    }
  }

  /**
   * Transition to closed state
   * @private
   */
  transitionToClosed(key, circuit) {
    const previousState = circuit.state;
    circuit.state = CircuitState.CLOSED;
    circuit.failures = 0;
    circuit.halfOpenAttempts = 0;

    logger.info(`Circuit breaker CLOSED: ${key}`, {
      previousState,
      totalRequests: circuit.totalRequests,
      totalFailures: circuit.totalFailures
    });
  }

  /**
   * Transition to open state
   * @private
   */
  transitionToOpen(key, circuit, error) {
    const previousState = circuit.state;
    circuit.state = CircuitState.OPEN;
    circuit.halfOpenAttempts = 0;

    logger.warn(`Circuit breaker OPEN: ${key}`, {
      previousState,
      failures: circuit.failures,
      lastError: error?.message,
      resetIn: this.resetTimeout
    });
  }

  /**
   * Transition to half-open state
   * @private
   */
  transitionToHalfOpen(key, circuit) {
    const previousState = circuit.state;
    circuit.state = CircuitState.HALF_OPEN;
    circuit.halfOpenAttempts = 0;
    circuit.successes = 0;

    logger.info(`Circuit breaker HALF_OPEN: ${key}`, {
      previousState,
      testingRecovery: true
    });
  }

  /**
   * Manually reset a circuit
   * @param {string} key
   */
  reset(key) {
    const circuit = this.getCircuit(key);
    this.transitionToClosed(key, circuit);
    circuit.failures = 0;
    circuit.successes = 0;
  }

  /**
   * Force open a circuit
   * @param {string} key
   */
  forceOpen(key) {
    const circuit = this.getCircuit(key);
    circuit.state = CircuitState.OPEN;
    circuit.lastFailure = Date.now();
    logger.warn(`Circuit breaker FORCE OPEN: ${key}`);
  }

  /**
   * Get circuit status
   * @param {string} key
   * @returns {Object}
   */
  getStatus(key) {
    const circuit = this.getCircuit(key);
    return {
      key,
      state: circuit.state,
      failures: circuit.failures,
      successes: circuit.successes,
      totalRequests: circuit.totalRequests,
      totalFailures: circuit.totalFailures,
      failureRate: circuit.totalRequests > 0
        ? (circuit.totalFailures / circuit.totalRequests * 100).toFixed(2)
        : 0,
      lastFailure: circuit.lastFailure
        ? new Date(circuit.lastFailure).toISOString()
        : null,
      lastSuccess: circuit.lastSuccess
        ? new Date(circuit.lastSuccess).toISOString()
        : null,
      canExecute: this.canExecute(key),
      nextAttempt: circuit.state === CircuitState.OPEN
        ? new Date(circuit.lastFailure + this.resetTimeout).toISOString()
        : null
    };
  }

  /**
   * Get all circuit statuses
   * @returns {Object[]}
   */
  getAllStatus() {
    return Array.from(this.circuits.keys()).map(key => this.getStatus(key));
  }

  /**
   * Monitor circuits and log stats
   * @private
   */
  monitor() {
    const now = Date.now();

    for (const [key, circuit] of this.circuits) {
      // Log circuits that have been active
      if (circuit.totalRequests > 0) {
        const failureRate = (circuit.totalFailures / circuit.totalRequests * 100).toFixed(2);

        if (circuit.state !== CircuitState.CLOSED || parseFloat(failureRate) > 10) {
          logger.info(`Circuit stats: ${key}`, {
            state: circuit.state,
            requests: circuit.totalRequests,
            failures: circuit.totalFailures,
            failureRate: `${failureRate}%`
          });
        }
      }

      // Clean up old closed circuits with no recent activity
      const inactiveTime = now - Math.max(
        circuit.lastSuccess || 0,
        circuit.lastFailure || 0,
        circuit.createdAt
      );

      if (circuit.state === CircuitState.CLOSED &&
        circuit.totalRequests === 0 &&
        inactiveTime > this.monitorInterval * 10) {
        this.circuits.delete(key);
      }
    }
  }

  /**
   * Shutdown the circuit breaker
   */
  shutdown() {
    if (this.monitorTimer) {
      clearInterval(this.monitorTimer);
      this.monitorTimer = null;
    }
  }

  /**
   * Create a key for a node type
   * @param {string} nodeType
   * @returns {string}
   */
  static nodeKey(nodeType) {
    return `node:${nodeType}`;
  }

  /**
   * Create a key for an external service
   * @param {string} service
   * @returns {string}
   */
  static serviceKey(service) {
    return `service:${service}`;
  }

  /**
   * Create a key for an API endpoint
   * @param {string} endpoint
   * @returns {string}
   */
  static apiKey(endpoint) {
    return `api:${endpoint}`;
  }
}

/**
 * Custom error for circuit open state
 */
class CircuitOpenError extends Error {
  constructor(key, remainingTime) {
    super(`Circuit breaker is open for ${key}. Try again in ${remainingTime}ms`);
    this.name = 'CircuitOpenError';
    this.code = 'CIRCUIT_OPEN';
    this.key = key;
    this.remainingTime = remainingTime;
    this.recoverable = true;
  }
}

// Singleton instance
let breakerInstance = null;

/**
 * Get the CircuitBreaker singleton
 * @param {Object} [options]
 * @returns {CircuitBreaker}
 */
function getCircuitBreaker(options) {
  if (!breakerInstance) {
    breakerInstance = new CircuitBreaker(options);
  }
  return breakerInstance;
}

module.exports = {
  CircuitBreaker,
  CircuitOpenError,
  getCircuitBreaker,
  CircuitState
};
