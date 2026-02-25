/**
 * Condition Node
 *
 * Evaluates a condition and routes flow execution to different branches
 * based on the result (true/false).
 */

const { BaseNodeExecutor } = require('../../BaseNodeExecutor.cjs');

class ConditionNode extends BaseNodeExecutor {
  constructor() {
    super('logic:condition', 'logic');
  }

  async execute(context) {
    const { node } = context;
    const data = node.data || {};

    // Get the value to check
    const leftValue = this.resolveTemplate(
      this.getRequired(data, 'leftValue'),
      context
    );

    // Get the comparison operator
    const operator = this.getOptional(data, 'operator', 'equals');

    // Get the right value (for comparison)
    const rightValue = this.resolveTemplate(
      this.getOptional(data, 'rightValue', ''),
      context
    );

    // Evaluate the condition
    let result = false;

    try {
      result = this.evaluateCondition(leftValue, operator, rightValue);
    } catch (error) {
      return this.failure(
        `Condition evaluation failed: ${error.message}`,
        'CONDITION_ERROR'
      );
    }

    // Determine next nodes based on result
    // Convention: true branch is first output, false branch is second
    const outputs = node.outputs || {};
    const trueOutput = outputs.true || outputs.yes || outputs[0];
    const falseOutput = outputs.false || outputs.no || outputs[1];

    const nextNodes = result
      ? (trueOutput ? [trueOutput] : [])
      : (falseOutput ? [falseOutput] : []);

    return this.success(
      {
        condition: {
          left: leftValue,
          operator,
          right: rightValue,
        },
        result,
        branch: result ? 'true' : 'false',
      },
      nextNodes.length > 0 ? nextNodes : undefined
    );
  }

  evaluateCondition(left, operator, right) {
    // Normalize values for comparison
    const normalizeValue = (val) => {
      if (val === 'true') return true;
      if (val === 'false') return false;
      if (val === 'null' || val === 'undefined') return null;
      const num = Number(val);
      if (!isNaN(num) && val !== '') return num;
      return val;
    };

    const leftNorm = normalizeValue(left);
    const rightNorm = normalizeValue(right);

    switch (operator) {
      case 'equals':
      case 'eq':
      case '==':
        return leftNorm == rightNorm;

      case 'strictEquals':
      case 'seq':
      case '===':
        return leftNorm === rightNorm;

      case 'notEquals':
      case 'neq':
      case '!=':
        return leftNorm != rightNorm;

      case 'greaterThan':
      case 'gt':
      case '>':
        return leftNorm > rightNorm;

      case 'greaterThanOrEquals':
      case 'gte':
      case '>=':
        return leftNorm >= rightNorm;

      case 'lessThan':
      case 'lt':
      case '<':
        return leftNorm < rightNorm;

      case 'lessThanOrEquals':
      case 'lte':
      case '<=':
        return leftNorm <= rightNorm;

      case 'contains':
        return String(left).includes(String(right));

      case 'notContains':
        return !String(left).includes(String(right));

      case 'startsWith':
        return String(left).startsWith(String(right));

      case 'endsWith':
        return String(left).endsWith(String(right));

      case 'matches':
        try {
          const regex = new RegExp(right);
          return regex.test(String(left));
        } catch {
          throw new Error(`Invalid regex pattern: ${right}`);
        }

      case 'isEmpty':
        return left === '' || left === null || left === undefined ||
               (Array.isArray(left) && left.length === 0) ||
               (typeof left === 'object' && Object.keys(left).length === 0);

      case 'isNotEmpty':
        return !(left === '' || left === null || left === undefined ||
                (Array.isArray(left) && left.length === 0) ||
                (typeof left === 'object' && Object.keys(left).length === 0));

      case 'isTrue':
      case 'truthy':
        return Boolean(leftNorm);

      case 'isFalse':
      case 'falsy':
        return !Boolean(leftNorm);

      default:
        throw new Error(`Unknown operator: ${operator}`);
    }
  }

  validate(node) {
    const errors = [];
    const data = node.data || {};

    if (!data.leftValue) {
      errors.push('Left value is required for condition');
    }

    const validOperators = [
      'equals', 'eq', '==',
      'strictEquals', 'seq', '===',
      'notEquals', 'neq', '!=',
      'greaterThan', 'gt', '>',
      'greaterThanOrEquals', 'gte', '>=',
      'lessThan', 'lt', '<',
      'lessThanOrEquals', 'lte', '<=',
      'contains', 'notContains',
      'startsWith', 'endsWith',
      'matches',
      'isEmpty', 'isNotEmpty',
      'isTrue', 'truthy',
      'isFalse', 'falsy',
    ];

    if (data.operator && !validOperators.includes(data.operator)) {
      errors.push(`Invalid operator: ${data.operator}`);
    }

    return errors;
  }
}

module.exports = { ConditionNode };
