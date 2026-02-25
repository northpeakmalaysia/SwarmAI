/**
 * Flow Middleware Index
 *
 * Exports all middleware components for the FlowBuilder module.
 */

const {
  FlowErrorHandler,
  getErrorHandler,
  ErrorStrategy,
  BackoffStrategy,
  ErrorCategory
} = require('./ErrorHandler.cjs');

const {
  CircuitBreaker,
  CircuitOpenError,
  getCircuitBreaker,
  CircuitState
} = require('./CircuitBreaker.cjs');

module.exports = {
  // Error Handler
  FlowErrorHandler,
  getErrorHandler,
  ErrorStrategy,
  BackoffStrategy,
  ErrorCategory,

  // Circuit Breaker
  CircuitBreaker,
  CircuitOpenError,
  getCircuitBreaker,
  CircuitState
};
