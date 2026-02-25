/**
 * RAG Query Node
 *
 * Performs Retrieval-Augmented Generation queries against the knowledge base.
 * Retrieves relevant context from vector store and optionally generates a response.
 */

const { BaseNodeExecutor } = require('../../BaseNodeExecutor.cjs');
const { getSuperBrainRouter } = require('../../../ai/SuperBrainRouter.cjs');

class RAGQueryNode extends BaseNodeExecutor {
  constructor() {
    super('ai:ragQuery', 'ai');
  }

  async execute(context) {
    const { node, services } = context;
    const data = node.data || {};

    // Get query
    const query = this.resolveTemplate(
      this.getRequired(data, 'query'),
      context
    );

    // Get library IDs to search
    const libraryIds = this.getOptional(data, 'libraryIds', []);
    const topK = this.getOptional(data, 'topK', 5);
    const minScore = this.getOptional(data, 'minScore', 0.7);
    const generateResponse = this.getOptional(data, 'generateResponse', true);

    try {
      // Get RAG service if available
      const ragService = services?.rag;

      if (!ragService) {
        // Fall back to simpler vector search if RAG service not available
        return this.failure(
          'RAG service not available. Please configure vector store.',
          'RAG_UNAVAILABLE'
        );
      }

      // Perform retrieval
      const retrievalResult = await ragService.retrieve(query, {
        libraryIds,
        topK: parseInt(topK, 10),
        minScore: parseFloat(minScore),
      });

      const chunks = retrievalResult.chunks || [];
      const contextText = chunks.map(c => c.content).join('\n\n---\n\n');

      // Optionally generate a response using the retrieved context
      let response = null;
      let aiModel = null;
      let aiProvider = null;
      if (generateResponse && chunks.length > 0) {
        const superBrain = getSuperBrainRouter();

        const systemPrompt = this.getOptional(
          data,
          'systemPrompt',
          'You are a helpful assistant. Answer questions based on the provided context. If the context does not contain relevant information, say so.'
        );

        const messages = [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: `Context:\n${contextText}\n\nQuestion: ${query}`
          },
        ];

        // Route through SuperBrain for Task Routing support
        // RAG responses are typically simple factual queries
        const forceTier = this.getOptional(data, 'tier', 'simple');

        const aiResult = await superBrain.process({
          task: query,
          messages,
          userId: context.userId,
          forceTier,
        }, {
          temperature: 0.3, // Lower temperature for factual responses
          hasRAG: true, // Signal that this has RAG context
        });

        response = aiResult.content;
        aiModel = aiResult.model;
        aiProvider = aiResult.provider;
      }

      return this.success({
        query,
        chunks: chunks.map(c => ({
          content: c.content,
          score: c.score,
          metadata: c.metadata,
        })),
        chunkCount: chunks.length,
        context: contextText,
        response,
        model: aiModel,
        provider: aiProvider,
        completedAt: new Date().toISOString(),
      });
    } catch (error) {
      return this.failure(
        `RAG query failed: ${error.message}`,
        'RAG_ERROR',
        true // Usually recoverable
      );
    }
  }

  validate(node) {
    const errors = [];
    const data = node.data || {};

    if (!data.query) {
      errors.push('Query is required');
    }

    if (data.topK !== undefined) {
      const k = parseInt(data.topK, 10);
      if (isNaN(k) || k < 1 || k > 100) {
        errors.push('topK must be a number between 1 and 100');
      }
    }

    if (data.minScore !== undefined) {
      const score = parseFloat(data.minScore);
      if (isNaN(score) || score < 0 || score > 1) {
        errors.push('minScore must be a number between 0 and 1');
      }
    }

    return errors;
  }
}

module.exports = { RAGQueryNode };
