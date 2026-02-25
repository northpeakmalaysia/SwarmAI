/**
 * Trigger Nodes Index
 * Exports all trigger node executors and provides registration helper
 */

const { ManualTriggerNode } = require('./ManualTriggerNode.cjs');
const { WebhookTriggerNode } = require('./WebhookTriggerNode.cjs');
const { MessageTriggerNode, SUPPORTED_PLATFORMS } = require('./MessageTriggerNode.cjs');
const { ScheduleTriggerNode } = require('./ScheduleTriggerNode.cjs');

/**
 * Register all trigger nodes with the flow execution engine
 * @param {Object} engine - FlowExecutionEngine instance
 */
function registerTriggerNodes(engine) {
  // Register base trigger nodes
  engine.registerNode(new ManualTriggerNode());
  engine.registerNode(new WebhookTriggerNode());
  engine.registerNode(new MessageTriggerNode());
  engine.registerNode(new ScheduleTriggerNode());

  // Register platform-specific message trigger aliases
  // These allow flows to use trigger:whatsapp_message, trigger:telegram-bot_message, etc.
  SUPPORTED_PLATFORMS.forEach(platform => {
    if (platform !== 'any') {
      const platformTrigger = new MessageTriggerNode();
      platformTrigger.type = `trigger:${platform}_message`;
      engine.registerNode(platformTrigger);
    }
  });

  // Register generic any_message trigger alias
  const anyMessageTrigger = new MessageTriggerNode();
  anyMessageTrigger.type = 'trigger:any_message';
  engine.registerNode(anyMessageTrigger);
}

/**
 * Get metadata for all trigger nodes (for FlowBuilder UI)
 */
function getTriggerNodeMetadata() {
  return [
    ManualTriggerNode.getMetadata ? ManualTriggerNode.getMetadata() : {
      type: 'trigger:manual',
      category: 'trigger',
      name: 'Manual Trigger',
      description: 'Start flow manually'
    },
    WebhookTriggerNode.getMetadata ? WebhookTriggerNode.getMetadata() : {
      type: 'trigger:webhook',
      category: 'trigger',
      name: 'Webhook Trigger',
      description: 'Start flow via HTTP webhook'
    },
    MessageTriggerNode.getMetadata()
  ];
}

module.exports = {
  ManualTriggerNode,
  WebhookTriggerNode,
  MessageTriggerNode,
  ScheduleTriggerNode,
  registerTriggerNodes,
  getTriggerNodeMetadata,
  SUPPORTED_PLATFORMS
};
