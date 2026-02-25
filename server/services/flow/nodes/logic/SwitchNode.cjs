/**
 * Switch Node
 *
 * Routes flow execution to one of multiple branches based on matching a value
 * against a set of cases. Similar to a switch/case statement.
 */

const { BaseNodeExecutor } = require('../../BaseNodeExecutor.cjs');

class SwitchNode extends BaseNodeExecutor {
  constructor() {
    super('logic:switch', 'logic');
  }

  async execute(context) {
    const { node } = context;
    const data = node.data || {};

    // Get the value to switch on
    const switchValue = this.resolveTemplate(
      this.getRequired(data, 'value'),
      context
    );

    // Get the cases
    const cases = this.getOptional(data, 'cases', []);
    const defaultCase = this.getOptional(data, 'defaultCase', null);
    const strictMatch = this.getOptional(data, 'strictMatch', false);

    // Find matching case
    let matchedCase = null;
    let matchedIndex = -1;

    for (let i = 0; i < cases.length; i++) {
      const caseItem = cases[i];
      const caseValue = this.resolveTemplate(caseItem.value || '', context);

      const matches = strictMatch
        ? switchValue === caseValue
        : switchValue == caseValue;

      if (matches) {
        matchedCase = caseItem;
        matchedIndex = i;
        break;
      }
    }

    // Determine which output to use
    let nextNodes = [];
    let matchedLabel = null;

    if (matchedCase) {
      matchedLabel = matchedCase.label || `case_${matchedIndex}`;
      // Use the case's specified output or find by index
      const outputs = node.outputs || {};
      const outputId = matchedCase.outputId || outputs[matchedLabel] || outputs[matchedIndex];
      if (outputId) {
        nextNodes = [outputId];
      }
    } else if (defaultCase !== null) {
      matchedLabel = 'default';
      const outputs = node.outputs || {};
      const outputId = outputs.default || outputs[cases.length];
      if (outputId) {
        nextNodes = [outputId];
      }
    }

    return this.success(
      {
        value: switchValue,
        matchedCase: matchedLabel,
        matchedIndex,
        caseCount: cases.length,
        hasDefault: defaultCase !== null,
      },
      nextNodes.length > 0 ? nextNodes : undefined
    );
  }

  validate(node) {
    const errors = [];
    const data = node.data || {};

    if (!data.value) {
      errors.push('Switch value is required');
    }

    if (!data.cases || !Array.isArray(data.cases) || data.cases.length === 0) {
      errors.push('At least one case is required');
    } else {
      // Validate each case
      data.cases.forEach((caseItem, index) => {
        if (caseItem.value === undefined || caseItem.value === null) {
          errors.push(`Case ${index} is missing a value`);
        }
      });
    }

    return errors;
  }
}

module.exports = { SwitchNode };
