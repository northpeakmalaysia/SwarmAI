/**
 * Merge Node
 *
 * Joins multiple parallel branches back into a single flow.
 * Works with ParallelNode to synchronize branch results.
 *
 * Features:
 * - Wait for all/any/first branches
 * - Aggregate branch results
 * - Handle partial failures
 * - Timeout protection
 * - Result transformation
 */

const { BaseNodeExecutor } = require('../../BaseNodeExecutor.cjs');

class MergeNode extends BaseNodeExecutor {
  constructor() {
    super('logic:merge', 'logic');
  }

  /**
   * Get static metadata for this node type
   */
  static getMetadata() {
    return {
      type: 'logic:merge',
      label: 'Merge Branches',
      description: 'Join parallel branches back into a single flow',
      icon: 'GitMerge',
      category: 'logic',
      color: 'indigo',
      properties: {
        waitMode: {
          type: 'select',
          label: 'Wait Mode',
          description: 'How to wait for branches',
          options: [
            { value: 'all', label: 'All - Wait for all branches' },
            { value: 'any', label: 'Any - Continue when first branch arrives' },
            { value: 'count', label: 'Count - Wait for N branches' }
          ],
          default: 'all'
        },
        expectedBranches: {
          type: 'number',
          label: 'Expected Branch Count',
          description: 'Number of branches expected to arrive',
          default: 2,
          min: 1,
          max: 100
        },
        waitCount: {
          type: 'number',
          label: 'Wait Count',
          description: 'Number of branches to wait for (when mode is "count")',
          default: 1,
          min: 1,
          max: 100,
          showWhen: { waitMode: 'count' }
        },
        timeout: {
          type: 'number',
          label: 'Timeout (seconds)',
          description: 'Maximum time to wait for branches (0 = no timeout)',
          default: 60,
          min: 0,
          max: 600
        },
        aggregation: {
          type: 'select',
          label: 'Result Aggregation',
          description: 'How to aggregate branch results',
          options: [
            { value: 'array', label: 'Array - Collect all results in array' },
            { value: 'object', label: 'Object - Merge results by branch name' },
            { value: 'first', label: 'First - Use first result only' },
            { value: 'last', label: 'Last - Use last result only' },
            { value: 'concat', label: 'Concat - Concatenate string/array results' }
          ],
          default: 'object'
        },
        handleMissing: {
          type: 'select',
          label: 'Handle Missing Branches',
          description: 'What to do if a branch never arrives',
          options: [
            { value: 'error', label: 'Error - Fail the merge' },
            { value: 'ignore', label: 'Ignore - Continue without missing' },
            { value: 'default', label: 'Default - Use default value' }
          ],
          default: 'error'
        },
        defaultValue: {
          type: 'json',
          label: 'Default Value',
          description: 'Default value for missing branches',
          showWhen: { handleMissing: 'default' }
        },
        storeInVariable: {
          type: 'text',
          label: 'Store Merged Result In',
          placeholder: 'mergedResult'
        }
      },
      outputs: {
        default: { label: 'Merged', type: 'default' },
        partial: { label: 'Partial (timeout/missing)', type: 'conditional' },
        error: { label: 'Error', type: 'conditional' }
      },
      getDefaultConfig: () => ({
        waitMode: 'all',
        expectedBranches: 2,
        waitCount: 1,
        timeout: 60,
        aggregation: 'object',
        handleMissing: 'error',
        defaultValue: null,
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

    if (data.expectedBranches !== undefined && data.expectedBranches < 1) {
      errors.push('Expected branches must be at least 1');
    }

    if (data.waitMode === 'count' && data.waitCount > data.expectedBranches) {
      errors.push('Wait count cannot exceed expected branch count');
    }

    return errors;
  }

  /**
   * Execute the node
   */
  async execute(context) {
    const {
      waitMode,
      expectedBranches,
      waitCount,
      timeout,
      aggregation,
      handleMissing,
      defaultValue,
      storeInVariable
    } = context.node.data;

    try {
      // Get branch results from context
      // These are collected as branches complete and arrive at this merge point
      const branchResults = context.branchResults || {};
      const arrivedCount = Object.keys(branchResults).length;

      context.logger.info(`Merge node: ${arrivedCount}/${expectedBranches} branches arrived`);

      // Check if we have enough branches
      const requiredCount = waitMode === 'count' ? waitCount :
                           waitMode === 'any' ? 1 : expectedBranches;

      if (arrivedCount < requiredCount) {
        // Handle missing branches
        switch (handleMissing) {
          case 'error':
            return this.failure(
              `Missing branches: ${arrivedCount}/${expectedBranches} arrived`,
              'MISSING_BRANCHES',
              false,
              ['error']
            );

          case 'ignore':
            context.logger.warn(`Proceeding with ${arrivedCount}/${expectedBranches} branches`);
            break;

          case 'default':
            // Fill missing with default values
            for (let i = arrivedCount; i < expectedBranches; i++) {
              branchResults[`branch_${i}`] = defaultValue;
            }
            break;
        }
      }

      // Aggregate results
      const mergedResult = this.aggregateResults(branchResults, aggregation);

      // Build output
      const output = {
        branchCount: arrivedCount,
        expectedBranches,
        results: mergedResult,
        partial: arrivedCount < expectedBranches,
        aggregation,
        mergedAt: new Date().toISOString()
      };

      // Store in variable if specified
      if (storeInVariable) {
        context.variables[storeInVariable] = mergedResult;
      }

      // Determine output path
      if (arrivedCount < expectedBranches) {
        return this.success(output, ['partial']);
      }

      return this.success(output);

    } catch (error) {
      context.logger.error(`Merge failed: ${error.message}`);
      return this.failure(error.message, 'MERGE_ERROR', true, ['error']);
    }
  }

  /**
   * Aggregate branch results based on strategy
   * @private
   */
  aggregateResults(results, strategy) {
    const values = Object.values(results);
    const entries = Object.entries(results);

    switch (strategy) {
      case 'array':
        return values;

      case 'object':
        // Already an object
        return results;

      case 'first':
        return values[0];

      case 'last':
        return values[values.length - 1];

      case 'concat':
        // Concatenate arrays or strings
        return values.reduce((acc, val) => {
          if (Array.isArray(acc) && Array.isArray(val)) {
            return [...acc, ...val];
          }
          if (typeof acc === 'string' && typeof val === 'string') {
            return acc + val;
          }
          if (acc === undefined) {
            return val;
          }
          // Mixed types - collect in array
          return Array.isArray(acc) ? [...acc, val] : [acc, val];
        }, undefined);

      default:
        return results;
    }
  }
}

module.exports = { MergeNode };
