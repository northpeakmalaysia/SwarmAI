/**
 * Loop Node
 *
 * Provides iteration capabilities for flows.
 * Supports for-each, while, and count loop types.
 */

const { BaseNodeExecutor } = require('../../BaseNodeExecutor.cjs');

class LoopNode extends BaseNodeExecutor {
  constructor() {
    super('logic:loop', 'logic');
  }

  async execute(context) {
    const { node, abortSignal } = context;
    const data = node.data || {};

    // Get loop type
    const loopType = data.loopType || 'forEach';
    const maxIterations = parseInt(data.maxIterations, 10) || 1000; // Safety limit

    // Initialize loop state
    const loopState = {
      currentItem: null,
      currentIndex: 0,
      totalIterations: 0,
      completed: false,
      items: [],
      shouldContinue: true,
    };

    try {
      switch (loopType) {
        case 'forEach':
          return await this.executeForEach(data, context, loopState, maxIterations, abortSignal);

        case 'while':
          return await this.executeWhile(data, context, loopState, maxIterations, abortSignal);

        case 'count':
          return await this.executeCount(data, context, loopState, maxIterations, abortSignal);

        default:
          return this.failure(`Unsupported loop type: ${loopType}`, 'INVALID_LOOP_TYPE');
      }
    } catch (error) {
      return this.failure(`Loop execution error: ${error.message}`, 'LOOP_ERROR', {
        loopType,
        currentIndex: loopState.currentIndex,
        error: error.message,
      });
    }
  }

  /**
   * Execute for-each loop (iterate over array or object)
   */
  async executeForEach(data, context, loopState, maxIterations, abortSignal) {
    const arraySource = data.arraySource || '';

    if (!arraySource) {
      return this.failure('Array source is required for forEach loop', 'MISSING_ARRAY_SOURCE');
    }

    // Resolve array source (supports templates)
    let items = this.resolveTemplates(arraySource, context);

    // If result is a string, try to parse as JSON
    if (typeof items === 'string') {
      try {
        items = JSON.parse(items);
      } catch (e) {
        // Not JSON, treat as single-item array
        items = [items];
      }
    }

    // Convert object to array of [key, value] pairs
    if (items && typeof items === 'object' && !Array.isArray(items)) {
      items = Object.entries(items);
    }

    // Ensure items is an array
    if (!Array.isArray(items)) {
      return this.failure('Array source must resolve to an array or object', 'INVALID_ARRAY_SOURCE', {
        resolvedValue: items,
        type: typeof items,
      });
    }

    loopState.items = items;
    loopState.totalIterations = Math.min(items.length, maxIterations);

    // Iterate over items
    for (let i = 0; i < items.length && i < maxIterations; i++) {
      // Check abort signal
      if (abortSignal?.aborted) {
        return this.failure('Loop aborted', 'ABORTED', {
          currentIndex: i,
          totalIterations: i,
          completed: false,
        });
      }

      loopState.currentIndex = i;
      loopState.currentItem = items[i];

      // TODO: Execute child nodes here (for future enhancement)
      // For now, we just track the iteration state
    }

    loopState.completed = true;

    return this.success({
      loopType: 'forEach',
      currentItem: loopState.currentItem, // Last item
      currentIndex: loopState.currentIndex,
      totalIterations: loopState.currentIndex + 1,
      completed: true,
      items: items.length,
    });
  }

  /**
   * Execute while loop (loop with condition)
   */
  async executeWhile(data, context, loopState, maxIterations, abortSignal) {
    const conditionTemplate = data.condition || '';

    if (!conditionTemplate) {
      return this.failure('Condition is required for while loop', 'MISSING_CONDITION');
    }

    let iterations = 0;

    while (iterations < maxIterations) {
      // Check abort signal
      if (abortSignal?.aborted) {
        return this.failure('Loop aborted', 'ABORTED', {
          currentIndex: iterations,
          totalIterations: iterations,
          completed: false,
        });
      }

      // Update loop state for template resolution
      loopState.currentIndex = iterations;
      const contextWithLoop = {
        ...context,
        loop: loopState,
      };

      // Evaluate condition
      const conditionResult = this.resolveTemplates(conditionTemplate, contextWithLoop);
      const shouldContinue = this.evaluateCondition(conditionResult);

      if (!shouldContinue) {
        break;
      }

      // TODO: Execute child nodes here (for future enhancement)
      iterations++;
    }

    loopState.totalIterations = iterations;
    loopState.completed = iterations < maxIterations; // Completed if not hit max

    if (iterations >= maxIterations) {
      return this.failure(
        `While loop exceeded maximum iterations (${maxIterations})`,
        'MAX_ITERATIONS_EXCEEDED',
        {
          maxIterations,
          totalIterations: iterations,
          completed: false,
        }
      );
    }

    return this.success({
      loopType: 'while',
      currentIndex: iterations - 1,
      totalIterations: iterations,
      completed: true,
    });
  }

  /**
   * Execute count loop (loop N times)
   */
  async executeCount(data, context, loopState, maxIterations, abortSignal) {
    const count = parseInt(data.count, 10) || 0;

    if (count <= 0) {
      return this.failure('Count must be greater than 0', 'INVALID_COUNT', { count });
    }

    const actualCount = Math.min(count, maxIterations);

    for (let i = 0; i < actualCount; i++) {
      // Check abort signal
      if (abortSignal?.aborted) {
        return this.failure('Loop aborted', 'ABORTED', {
          currentIndex: i,
          totalIterations: i,
          completed: false,
        });
      }

      loopState.currentIndex = i;

      // TODO: Execute child nodes here (for future enhancement)
    }

    loopState.totalIterations = actualCount;
    loopState.completed = true;

    return this.success({
      loopType: 'count',
      currentIndex: actualCount - 1,
      totalIterations: actualCount,
      completed: true,
      requestedCount: count,
      actualCount,
    });
  }

  /**
   * Evaluate a condition result to boolean
   */
  evaluateCondition(value) {
    // Handle different types
    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'string') {
      const lower = value.toLowerCase().trim();
      if (lower === 'true' || lower === '1' || lower === 'yes') {
        return true;
      }
      if (lower === 'false' || lower === '0' || lower === 'no' || lower === '') {
        return false;
      }
    }

    if (typeof value === 'number') {
      return value !== 0;
    }

    // For objects/arrays, truthy check
    return !!value;
  }

  validate(node) {
    const errors = [];
    const data = node.data || {};

    // Loop type validation
    if (!data.loopType) {
      errors.push('Loop type is required');
    } else if (!['forEach', 'while', 'count'].includes(data.loopType)) {
      errors.push('Loop type must be one of: forEach, while, count');
    }

    // Type-specific validation
    if (data.loopType === 'forEach' && !data.arraySource) {
      errors.push('Array source is required for forEach loop');
    }

    if (data.loopType === 'while' && !data.condition) {
      errors.push('Condition is required for while loop');
    }

    if (data.loopType === 'count') {
      const count = parseInt(data.count, 10);
      if (!data.count || isNaN(count) || count <= 0) {
        errors.push('Count must be a positive number');
      }
    }

    // Max iterations validation
    if (data.maxIterations !== undefined) {
      const max = parseInt(data.maxIterations, 10);
      if (isNaN(max) || max <= 0) {
        errors.push('Max iterations must be a positive number');
      } else if (max > 10000) {
        errors.push('Max iterations cannot exceed 10,000 for safety');
      }
    }

    return errors;
  }

  /**
   * Get metadata for FlowBuilder UI
   */
  static getMetadata() {
    return {
      type: 'logic:loop',
      category: 'logic',
      name: 'Loop',
      description: 'Iterate over items, loop with condition, or repeat N times',
      icon: 'repeat',
      properties: [
        {
          name: 'loopType',
          type: 'select',
          label: 'Loop Type',
          description: 'Type of loop to execute',
          required: true,
          options: [
            { value: 'forEach', label: 'For Each (iterate over array/object)' },
            { value: 'while', label: 'While (loop with condition)' },
            { value: 'count', label: 'Count (repeat N times)' },
          ],
          default: 'forEach',
        },
        {
          name: 'arraySource',
          type: 'text',
          label: 'Array Source',
          description: 'Array or object to iterate over (supports templates like {{var.items}})',
          required: true,
          supportsTemplates: true,
          visibleWhen: 'loopType === "forEach"',
          placeholder: '{{var.items}}',
        },
        {
          name: 'condition',
          type: 'text',
          label: 'Condition',
          description: 'Loop while this condition is true (supports templates)',
          required: true,
          supportsTemplates: true,
          visibleWhen: 'loopType === "while"',
          placeholder: '{{var.count}} < 10',
        },
        {
          name: 'count',
          type: 'number',
          label: 'Count',
          description: 'Number of times to loop',
          required: true,
          min: 1,
          max: 10000,
          visibleWhen: 'loopType === "count"',
          default: 10,
        },
        {
          name: 'maxIterations',
          type: 'number',
          label: 'Max Iterations',
          description: 'Safety limit to prevent infinite loops',
          default: 1000,
          min: 1,
          max: 10000,
        },
      ],
      outputs: [
        {
          name: 'loopType',
          type: 'string',
          description: 'The type of loop executed',
        },
        {
          name: 'currentItem',
          type: 'any',
          description: 'Current/last item (forEach only)',
        },
        {
          name: 'currentIndex',
          type: 'number',
          description: 'Current/last iteration index (0-based)',
        },
        {
          name: 'totalIterations',
          type: 'number',
          description: 'Total number of iterations executed',
        },
        {
          name: 'completed',
          type: 'boolean',
          description: 'Whether loop completed successfully',
        },
        {
          name: 'items',
          type: 'number',
          description: 'Number of items in array (forEach only)',
        },
        {
          name: 'requestedCount',
          type: 'number',
          description: 'Requested count (count loop only)',
        },
        {
          name: 'actualCount',
          type: 'number',
          description: 'Actual iterations (may be less if max exceeded)',
        },
      ],
    };
  }
}

module.exports = { LoopNode };
