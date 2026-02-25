/**
 * Parallel Execution Manager
 *
 * Handles parallel branch execution in flows with:
 * - Fork/join patterns
 * - Multiple completion modes (all, any, race)
 * - Branch isolation and merging
 * - Timeout handling per branch
 */

const { v4: uuidv4 } = require('uuid');
const { logger } = require('../../logger.cjs');
const { ExecutionContext, FlowError } = require('./ExecutionContext.cjs');

/**
 * Execution modes for parallel branches
 */
const ParallelMode = {
  ALL: 'all',       // Wait for all branches to complete
  ANY: 'any',       // Complete when first branch finishes (success or failure)
  RACE: 'race',     // Complete when first successful branch finishes
  SETTLED: 'settled' // Wait for all, but don't fail on individual errors
};

/**
 * ParallelExecutionManager handles fork/join patterns in flow execution.
 */
class ParallelExecutionManager {
  /**
   * @param {FlowExecutionEngine} engine - Reference to the execution engine
   */
  constructor(engine) {
    this.engine = engine;
    this.activeBranches = new Map(); // executionId -> Map(branchId -> branchState)
  }

  /**
   * Execute multiple branches in parallel
   *
   * @param {Object} options - Execution options
   * @param {string} options.executionId - Parent execution ID
   * @param {string[]} options.branches - Array of node IDs to start branches from
   * @param {string} options.mode - Completion mode (all, any, race, settled)
   * @param {number} options.timeout - Timeout in ms for all branches
   * @param {boolean} options.continueOnError - Continue if a branch fails
   * @param {ExecutionContext} options.context - Parent execution context
   * @returns {Promise<Object>} Aggregated results from all branches
   */
  async executeBranches(options) {
    const {
      executionId,
      branches,
      mode = ParallelMode.ALL,
      timeout = 30000,
      continueOnError = false,
      context
    } = options;

    if (!branches || branches.length === 0) {
      return {
        completed: [],
        failed: [],
        outputs: {}
      };
    }

    // Track active branches for this execution
    const branchTracker = new Map();
    this.activeBranches.set(executionId, branchTracker);

    logger.info(`Starting parallel execution: ${branches.length} branches, mode=${mode}`);

    try {
      // Create promises for each branch
      const branchPromises = branches.map((nodeId, index) =>
        this.executeBranch({
          nodeId,
          branchId: `branch-${index}`,
          context,
          branchTracker,
          timeout
        })
      );

      // Execute based on mode
      let results;
      switch (mode) {
        case ParallelMode.ALL:
          results = await this.executeAll(branchPromises, continueOnError);
          break;
        case ParallelMode.ANY:
          results = await this.executeAny(branchPromises);
          break;
        case ParallelMode.RACE:
          results = await this.executeRace(branchPromises);
          break;
        case ParallelMode.SETTLED:
          results = await this.executeSettled(branchPromises);
          break;
        default:
          results = await this.executeAll(branchPromises, continueOnError);
      }

      return this.formatResults(results, branches);

    } finally {
      // Clean up branch tracking
      this.activeBranches.delete(executionId);
    }
  }

  /**
   * Execute a single branch
   * @private
   */
  async executeBranch(options) {
    const { nodeId, branchId, context, branchTracker, timeout } = options;

    const branchState = {
      id: branchId,
      nodeId,
      status: 'running',
      startedAt: Date.now(),
      output: null,
      error: null
    };
    branchTracker.set(branchId, branchState);

    try {
      // Create isolated context for this branch
      const branchContext = context.createBranchContext(branchId);

      // Get the starting node
      const startNode = context.getNode(nodeId);
      if (!startNode) {
        throw new FlowError(`Branch start node not found: ${nodeId}`, 'NODE_NOT_FOUND');
      }

      // Create timeout promise
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new FlowError(`Branch ${branchId} timed out`, 'BRANCH_TIMEOUT', false));
        }, timeout);
      });

      // Execute branch with timeout
      const executionPromise = this.executeNodeChain(startNode, branchContext);

      const result = await Promise.race([executionPromise, timeoutPromise]);

      // Merge branch results back to parent
      context.mergeBranchContext(branchContext);

      branchState.status = 'completed';
      branchState.output = result;
      branchState.completedAt = Date.now();
      branchState.duration = branchState.completedAt - branchState.startedAt;

      return {
        branchId,
        nodeId,
        status: 'completed',
        output: result,
        duration: branchState.duration
      };

    } catch (error) {
      branchState.status = 'failed';
      branchState.error = error.message;
      branchState.completedAt = Date.now();
      branchState.duration = branchState.completedAt - branchState.startedAt;

      logger.error(`Branch ${branchId} failed: ${error.message}`);

      return {
        branchId,
        nodeId,
        status: 'failed',
        error: error.message,
        code: error.code || 'BRANCH_ERROR',
        duration: branchState.duration
      };
    }
  }

  /**
   * Execute node chain (delegates to engine)
   * @private
   */
  async executeNodeChain(startNode, context) {
    // This will be called by the engine's executeNodeChain method
    // For now, return node outputs from context after execution
    return this.engine.executeNodeChainInternal
      ? await this.engine.executeNodeChainInternal(startNode, context, new Set())
      : context.collectFinalOutput();
  }

  /**
   * Wait for all branches to complete
   * @private
   */
  async executeAll(promises, continueOnError) {
    if (continueOnError) {
      // Use allSettled to get all results regardless of failures
      const settled = await Promise.allSettled(promises);
      return settled.map((result, index) => {
        if (result.status === 'fulfilled') {
          return result.value;
        } else {
          return {
            branchId: `branch-${index}`,
            status: 'failed',
            error: result.reason?.message || 'Unknown error'
          };
        }
      });
    } else {
      // Fail fast on first error
      return Promise.all(promises);
    }
  }

  /**
   * Complete when first branch finishes
   * @private
   */
  async executeAny(promises) {
    const result = await Promise.race(promises);
    return [result];
  }

  /**
   * Complete when first successful branch finishes
   * @private
   */
  async executeRace(promises) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const errors = [];

      promises.forEach((promise, index) => {
        promise
          .then(result => {
            if (!settled && result.status === 'completed') {
              settled = true;
              resolve([result]);
            }
          })
          .catch(error => {
            errors.push({ index, error });
            if (errors.length === promises.length && !settled) {
              reject(new FlowError('All branches failed', 'ALL_BRANCHES_FAILED'));
            }
          });
      });
    });
  }

  /**
   * Wait for all branches, don't fail on individual errors
   * @private
   */
  async executeSettled(promises) {
    const settled = await Promise.allSettled(promises);
    return settled.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return {
          branchId: `branch-${index}`,
          status: 'failed',
          error: result.reason?.message || 'Unknown error'
        };
      }
    });
  }

  /**
   * Format results into standard structure
   * @private
   */
  formatResults(results, originalBranches) {
    const completed = results.filter(r => r.status === 'completed');
    const failed = results.filter(r => r.status === 'failed');

    const outputs = {};
    for (const result of completed) {
      outputs[result.nodeId] = result.output;
    }

    return {
      completed,
      failed,
      outputs,
      totalBranches: originalBranches.length,
      successCount: completed.length,
      failureCount: failed.length,
      allSucceeded: failed.length === 0,
      anySucceeded: completed.length > 0
    };
  }

  /**
   * Cancel all branches for an execution
   * @param {string} executionId
   */
  cancelBranches(executionId) {
    const branchTracker = this.activeBranches.get(executionId);
    if (branchTracker) {
      for (const [branchId, state] of branchTracker) {
        if (state.status === 'running') {
          state.status = 'cancelled';
          logger.info(`Cancelled branch: ${branchId}`);
        }
      }
    }
  }

  /**
   * Get status of all branches for an execution
   * @param {string} executionId
   * @returns {Object[]}
   */
  getBranchStatus(executionId) {
    const branchTracker = this.activeBranches.get(executionId);
    if (!branchTracker) {
      return [];
    }

    return Array.from(branchTracker.values()).map(state => ({
      branchId: state.id,
      nodeId: state.nodeId,
      status: state.status,
      duration: state.completedAt
        ? state.completedAt - state.startedAt
        : Date.now() - state.startedAt
    }));
  }
}

module.exports = {
  ParallelExecutionManager,
  ParallelMode
};
