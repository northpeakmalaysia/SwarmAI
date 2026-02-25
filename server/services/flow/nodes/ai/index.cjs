/**
 * AI Nodes Index
 *
 * Provides AI-powered nodes for the FlowBuilder:
 * - ChatCompletionNode: General AI chat completion
 * - RAGQueryNode: Query knowledge base with RAG
 * - AIRouterNode: Route to different AI providers
 * - TranslateNode: Text translation
 * - SummarizeNode: Text summarization
 * - SuperBrainNode: Advanced AI routing with tier classification
 * - ClassifyIntentNode: Intent/category classification
 * - RephraseNode: Text rephrasing in different styles
 */

const { ChatCompletionNode } = require('./ChatCompletionNode.cjs');
const { RAGQueryNode } = require('./RAGQueryNode.cjs');
const { AIRouterNode } = require('./AIRouterNode.cjs');
const { TranslateNode } = require('./TranslateNode.cjs');
const { SummarizeNode } = require('./SummarizeNode.cjs');
const { SuperBrainNode } = require('./SuperBrainNode.cjs');
const { ClassifyIntentNode } = require('./ClassifyIntentNode.cjs');
const { RephraseNode } = require('./RephraseNode.cjs');

module.exports = {
  // Core AI nodes
  ChatCompletionNode,
  RAGQueryNode,
  AIRouterNode,
  TranslateNode,
  SummarizeNode,

  // Enhanced AI nodes (v2)
  SuperBrainNode,
  ClassifyIntentNode,
  RephraseNode,
};
