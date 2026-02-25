/**
 * Parallel Node
 *
 * Forks flow execution into multiple parallel branches.
 * Works with MergeNode to join branches back together.
 *
 * Features:
 * - Execute multiple branches simultaneously
 * - Configurable execution modes (all, any, race, settled)
 * - Timeout protection per branch
 * - Continue on error option
 * - Branch result aggregation
 */

const { BaseNodeExecutor } = require('../../BaseNodeExecutor.cjs');
const { ParallelMode } = require('../../core/ParallelExecutionManager.cjs');

class ParallelNode extends BaseNodeExecutor {
  constructor() {
    super('logic:parallel', 'logic');
  }

  /**
   * Get static metadata for this node type
   */
  static getMetadata() {
    return {
      type: 'logic:parallel',
      label: 'Parallel Fork',
      description: 'Fork execution into multiple parallel branches',
      icon: 'GitFork',
      category: 'logic',
      color: 'indigo',
      properties: {
        mode: {
          type: 'select',
          label: 'Execution Mode',
          description: 'How to handle parallel execution',
          options: [
            { value: 'all', label: 'All - Wait for all branches to complete' },
            { value: 'any', label: 'Any - Continue when first branch succeeds' },
            { value: 'race', label: 'Race - Continue when first branch completes (success or failure)' },
            { value: 'settled', label: 'Settled - Wait for all, collect results regardless of status' }
          ],
          default: 'all'
        },
        branches: {
          type: 'array',
          label: 'Branch Names',
          description: 'Named branches for parallel execution',
          itemSchema: {
            type: 'object',
            properties: {
              name: { type: 'text', label: 'Branch Name' },
              description: { type: 'text', label: 'Description' }
            }
          }
        },
        timeout: {
          type: 'number',
          label: 'Branch Timeout (seconds)',
          description: 'Maximum time for each branch (0 = no timeout)',
          default: 30,
          min: 0,
          max: 300
        },
        continueOnError: {
          type: 'boolean',
          label: 'Continue on Error',
          description: 'Continue other branches if one fails',
          default: false
        },
        maxConcurrency: {
          type: 'number',
          label: 'Max Concurrency',
          description: 'Maximum number of branches to run simultaneously (0 = unlimited)',
          default: 0,
          min: 0,
          max: 100
        },
        storeInVariable: {
          type: 'text',
          label: 'Store Results In',
          description: 'Variable to store branch results',
          placeholder: 'parallelResults'
        }
      },
      outputs: {
        // Dynamic outputs based on branches
        default: { label: 'All Complete', type: 'default' },
        branch1: { label: 'Branch 1', type: 'branch' },
        branch2: { label: 'Branch 2', type: 'branch' },
        branch3: { label: 'Branch 3', type: 'branch' },
        error: { label: 'Error', type: 'conditional' }
      },
      getDefaultConfig: () => ({
        mode: 'all',
        branches: [
          { name: 'branch1', description: 'First parallel branch' },
          { name: 'branch2', description: 'Second parallel branch' }
        ],
        timeout: 30,
        continueOnError: false,
        maxConcurrency: 0,
        storeInVariable: ''
      })
    };
  }

  /**
   * Validate node configuration
   */
  validate(node) {
    const errors = [];
    const data = node.data || {};

    if (!data.branches || data.branches.length < 2) {
      errors.push('At least 2 branches are required for parallel execution');
    }

    if (data.timeout !== undefined && data.timeout < 0) {
      errors.push('Timeout must be a non-negative number');
    }

    return errors;
  }

  /**
   * Execute the node
   */
  async execute(context) {
    const {
      mode,
      branches,
      timeout,
      continueOnError,
      maxConcurrency,
      storeInVariable
    } = context.node.data;

    if (!branches || branches.length < 2) {
      return this.failure('At least 2 branches are required', 'INSUFFICIENT_BRANCHES');
    }

    try {
      const parallelManager = context.services?.parallelManager;

      if (!parallelManager) {
        return this.failure('Parallel execution manager not available', 'SERVICE_UNAVAILABLE');
      }

      context.logger.info(`Starting parallel execution: ${branches.length} branches, mode=${mode}`);

      // Get branch node IDs from connected edges
      const branchNodeIds = this.getBranchNodeIds(context);

      if (branchNodeIds.length === 0) {
        return this.failure('No branch nodes connected', 'NO_BRANCHES');
      }

      // Execute branches in parallel
      const result = await parallelManager.executeBranches({
        executionId: context.executionId,
        branches: branchNodeIds,
        mode: this.mapMode(mode),
        timeout: (timeout || 30) * 1000,
        continueOnError: continueOnError || false,
        maxConcurrency: maxConcurrency || 0,
        context
      });

      // Build output
      const output = {
        mode,
        branchCount: branches.length,
        completedCount: result.completed?.length || 0,
        failedCount: result.failed?.length || 0,
        results: result.results || {},
        startedAt: result.startedAt,
        completedAt: result.completedAt,
        duration: result.duration
      };

      // Store in variable if specified
      if (storeInVariable) {
        context.variables[storeInVariable] = output;
      }

      // Determine output path based on results
      if (result.failed?.length > 0 && !continueOnError) {
        return this.failure(
          `${result.failed.length} branch(es) failed`,
          'BRANCH_FAILED',
          false,
          ['error']
        );
      }

      // Return branch outputs for MergeNode
      return {
        success: true,
        output,
        continueExecution: true,
        // Signal that this is a parallel fork
        parallelFork: true,
        branchResults: result.results
      };

    } catch (error) {
      context.logger.error(`Parallel execution failed: ${error.message}`);
      return this.failure(error.message, 'PARALLEL_ERROR', true, ['error']);
    }
  }

  /**
   * Get connected branch node IDs
   * @private
   */
  getBranchNodeIds(context) {
    const edges = context.flow?.edges || [];
    const nodeId = context.node.id;

    // Find all edges that originate from this node
    return edges
      .filter(edge => edge.source === nodeId)
      .map(edge => edge.target);
  }

  /**
   * Map mode string to ParallelMode enum
   * @private
   */
  mapMode(mode) {
    switch (mode) {
      case 'all': return ParallelMode.ALL;
      case 'any': return ParallelMode.ANY;
      case 'race': return ParallelMode.RACE;
      case 'settled': return ParallelMode.SETTLED;
      default: return ParallelMode.ALL;
    }
  }
}

module.exports = { ParallelNode };
