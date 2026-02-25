/**
 * Messaging Nodes Index
 *
 * Provides messaging nodes for the FlowBuilder:
 * - SendTextNode: Generic multi-channel text sending
 * - SendMediaNode: Multi-channel media sending
 * - SendWhatsAppNode: Dedicated WhatsApp with full features
 * - SendTelegramNode: Dedicated Telegram with full features
 * - WaitForReplyNode: Interactive wait for user reply
 * - CrossAgentSendNode: Cross-agent/cross-platform messaging
 */

const { SendTextNode } = require('./SendTextNode.cjs');
const { SendMediaNode } = require('./SendMediaNode.cjs');
const { SendWhatsAppNode } = require('./SendWhatsAppNode.cjs');
const { SendTelegramNode } = require('./SendTelegramNode.cjs');
const { WaitForReplyNode } = require('./WaitForReplyNode.cjs');
const { CrossAgentSendNode } = require('./CrossAgentSendNode.cjs');

module.exports = {
  // Generic multi-channel nodes
  SendTextNode,
  SendMediaNode,

  // Platform-specific nodes
  SendWhatsAppNode,
  SendTelegramNode,

  // Cross-agent messaging
  CrossAgentSendNode,

  // Interactive nodes
  WaitForReplyNode,
};
