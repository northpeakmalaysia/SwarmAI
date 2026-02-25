/**
 * Manual Trigger Node
 *
 * Executes when manually triggered via API or UI.
 * This is the default trigger for test executions.
 */

const { BaseNodeExecutor } = require('../../BaseNodeExecutor.cjs');

class ManualTriggerNode extends BaseNodeExecutor {
  constructor() {
    super('trigger:manual', 'trigger');
  }

  async execute(context) {
    const { input, node } = context;

    return this.success({
      triggeredAt: new Date().toISOString(),
      triggeredBy: input.userId || 'manual',
      triggerType: 'manual',
      input: input,
    });
  }

  validate(node) {
    return []; // No required configuration
  }
}

module.exports = { ManualTriggerNode };
