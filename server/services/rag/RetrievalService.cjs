/**
 * Retrieval Service
 *
 * Provides semantic search and context retrieval for RAG queries.
 * Orchestrates embedding, vector search, and result ranking.
 */

const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('../database.cjs');
const { logger } = require('../logger.cjs');
const { getVectorStoreService } = require('./VectorStoreService.cjs');
const { getChunkingService } = require('./ChunkingService.cjs');
const { getAIService } = require('../ai/AIService.cjs');

class RetrievalService {
  constructor() {
    this.vectorStore = getVectorStoreService();
    this.chunker = getChunkingService();
  }

  /**
   * Ingest a document into the knowledge base
   * @param {Object} document - Document to ingest
   * @param {string} libraryId - Library ID
   * @param {Object} options - Ingestion options
   * @returns {Promise<Object>} Ingestion result
   */
  async ingestDocument(document, libraryId, options = {}) {
    const db = getDatabase();
    const aiService = getAIService();

    const { userId, chunkStrategy = 'paragraph', chunkSize = 500 } = options;

    // Create or update document record
    const docId = document.id || uuidv4();

    db.prepare(`
      INSERT INTO knowledge_documents (
        id, library_id, folder_id, title, content, source_type, source_url,
        status, progress, metadata, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'processing', 0, ?, datetime('now'), datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        content = excluded.content,
        status = 'processing',
        progress = 0,
        updated_at = datetime('now')
    `).run(
      docId,
      libraryId,
      document.folderId || null,
      document.title || 'Untitled',
      document.content,
      document.sourceType || 'text',
      document.sourceUrl || null,
      JSON.stringify(document.metadata || {})
    );

    try {
      // Chunk the document
      const chunks = this.chunker.chunkDocument(
        { ...document, id: docId },
        { strategy: chunkStrategy, chunkSize }
      );

      // Update progress
      db.prepare(`
        UPDATE knowledge_documents SET progress = 20 WHERE id = ?
      `).run(docId);

      // Generate embeddings
      const texts = chunks.map(c => c.content);
      const embeddings = await aiService.embed(texts, { userId });

      // Update progress
      db.prepare(`
        UPDATE knowledge_documents SET progress = 60 WHERE id = ?
      `).run(docId);

      // Prepare points for vector store
      const points = chunks.map((chunk, i) => ({
        id: chunk.id,
        vector: embeddings[i],
        payload: {
          documentId: docId,
          libraryId,
          content: chunk.content,
          chunkIndex: chunk.chunkIndex,
          metadata: chunk.metadata,
        },
      }));

      // Store in vector database
      const collectionName = this.vectorStore.getCollectionName(libraryId);
      await this.vectorStore.upsertPoints(collectionName, points);

      // Update document status and chunk count
      db.prepare(`
        UPDATE knowledge_documents
        SET status = 'completed', progress = 100, chunk_count = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(chunks.length, docId);

      logger.info(`Ingested document ${docId} with ${chunks.length} chunks`);

      return {
        documentId: docId,
        chunksCreated: chunks.length,
        status: 'completed',
      };
    } catch (error) {
      // Update document status to failed
      db.prepare(`
        UPDATE knowledge_documents
        SET status = 'failed', metadata = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(JSON.stringify({ error: error.message }), docId);

      logger.error(`Failed to ingest document: ${error.message}`);
      throw error;
    }
  }

  /**
   * Retrieve relevant chunks for a query
   * @param {string} query - Search query
   * @param {Object} options - Retrieval options
   * @returns {Promise<Object>} Retrieval results
   */
  async retrieve(query, options = {}) {
    const {
      libraryIds = [],
      topK = 5,
      minScore = 0.7,
      userId,
    } = options;

    const aiService = getAIService();

    logger.info(`RAG Query: "${query.substring(0, 100)}..." | Libraries: ${libraryIds.length} | minScore: ${minScore}`);

    // Check if libraries have documents
    const db = getDatabase();
    for (const libraryId of libraryIds) {
      const stats = db.prepare(`
        SELECT
          (SELECT name FROM knowledge_libraries WHERE id = ?) as name,
          COUNT(*) as doc_count,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_count
        FROM knowledge_documents WHERE library_id = ?
      `).get(libraryId, libraryId);

      if (!stats || stats.doc_count === 0) {
        logger.warn(`RAG: Library "${stats?.name || libraryId}" has NO documents - nothing to search`);
      } else if (stats.completed_count === 0) {
        logger.warn(`RAG: Library "${stats.name}" has ${stats.doc_count} docs but none completed ingestion`);
      } else {
        logger.debug(`RAG: Library "${stats.name}" has ${stats.completed_count}/${stats.doc_count} completed docs`);
      }
    }

    // Generate query embedding
    const [queryEmbedding] = await aiService.embed([query], { userId });
    logger.debug(`RAG: Generated query embedding (${queryEmbedding?.length || 0} dimensions)`);

    const allResults = [];

    // Search each library
    for (const libraryId of libraryIds) {
      const collectionName = this.vectorStore.getCollectionName(libraryId);

      try {
        // Check collection info first
        const collectionInfo = await this.vectorStore.getCollectionInfo(collectionName);
        if (!collectionInfo) {
          logger.warn(`RAG: Collection ${collectionName} does not exist - library not indexed`);
          continue;
        }

        const pointsCount = collectionInfo.points_count || 0;
        if (pointsCount === 0) {
          logger.warn(`RAG: Collection ${collectionName} exists but has 0 vectors`);
          continue;
        }

        logger.debug(`RAG: Searching ${collectionName} (${pointsCount} vectors)`);

        const results = await this.vectorStore.search(
          collectionName,
          queryEmbedding,
          {
            limit: topK,
            scoreThreshold: minScore,
          }
        );

        if (results.length === 0) {
          logger.info(`RAG: No results above score threshold ${minScore} in ${collectionName}`);
        } else {
          logger.info(`RAG: Found ${results.length} results in ${collectionName} (best score: ${results[0]?.score?.toFixed(3)})`);
        }

        allResults.push(...results.map(r => ({
          ...r,
          libraryId,
        })));
      } catch (error) {
        logger.warn(`Failed to search library ${libraryId}: ${error.message}`);
      }
    }

    // Sort by score and limit
    allResults.sort((a, b) => b.score - a.score);
    const topResults = allResults.slice(0, topK);

    // Collect unique document IDs to fetch metadata
    const documentIds = [...new Set(topResults.map(r => r.payload?.documentId).filter(Boolean))];
    const docMap = {};
    if (documentIds.length > 0) {
      const db = getDatabase();
      const placeholders = documentIds.map(() => '?').join(',');
      const docs = db.prepare(`
        SELECT id, library_id, folder_id, title, source_type
        FROM knowledge_documents
        WHERE id IN (${placeholders})
      `).all(...documentIds);
      for (const doc of docs) {
        docMap[doc.id] = doc;
      }
    }

    // Format chunks to match frontend RAGQueryResult interface
    // Filter out orphaned vectors (documents deleted from DB but still in Qdrant)
    const chunks = topResults
      .filter(r => {
        const docId = r.payload?.documentId;
        if (docId && !docMap[docId]) {
          logger.debug(`RAG: Filtering out orphaned vector ${r.id} (document ${docId} no longer in DB)`);
          return false;
        }
        return true;
      })
      .map(r => {
        const docId = r.payload?.documentId;
        const doc = docMap[docId] || {};
        return {
          id: r.id,
          text: r.payload?.content || '',
          score: r.score,
          document: {
            id: docId || '',
            fileName: doc.title || r.payload?.metadata?.source_name || 'Unknown',
            sourceType: doc.source_type || 'manual',
            libraryId: r.libraryId,
            folderId: doc.folder_id || undefined,
          },
          metadata: r.payload?.metadata || {},
        };
      });

    return {
      query,
      chunks,
      totalResults: chunks.length,
      searchedLibraries: libraryIds.length,
    };
  }

  /**
   * Generate context string from retrieved chunks
   * @param {Array} chunks - Retrieved chunks
   * @param {Object} options - Context options
   * @returns {string} Context string
   */
  generateContext(chunks, options = {}) {
    const { maxTokens = 4000, separator = '\n\n---\n\n' } = options;

    // Rough token estimation (4 chars per token)
    const maxChars = maxTokens * 4;

    let context = '';
    let totalLength = 0;

    for (const chunk of chunks) {
      const chunkText = chunk.content;
      const chunkLength = chunkText.length + separator.length;

      if (totalLength + chunkLength > maxChars) {
        // Truncate if needed
        const remaining = maxChars - totalLength;
        if (remaining > 100) {
          context += chunkText.slice(0, remaining) + '...';
        }
        break;
      }

      context += (context ? separator : '') + chunkText;
      totalLength += chunkLength;
    }

    return context;
  }

  /**
   * Delete document from knowledge base
   * @param {string} documentId - Document ID
   * @param {string} libraryId - Library ID
   */
  async deleteDocument(documentId, libraryId) {
    const db = getDatabase();

    // Delete from vector store
    const collectionName = this.vectorStore.getCollectionName(libraryId);
    await this.vectorStore.deleteByFilter(collectionName, {
      must: [
        { key: 'documentId', match: { value: documentId } },
      ],
    });

    // Delete from database
    db.prepare(`
      DELETE FROM knowledge_documents WHERE id = ?
    `).run(documentId);

    logger.info(`Deleted document ${documentId} from library ${libraryId}`);
  }

  /**
   * Delete entire library from vector store
   * @param {string} libraryId - Library ID
   */
  async deleteLibrary(libraryId) {
    const collectionName = this.vectorStore.getCollectionName(libraryId);

    try {
      await this.vectorStore.deleteCollection(collectionName);
    } catch (error) {
      logger.warn(`Failed to delete collection: ${error.message}`);
    }

    logger.info(`Deleted library ${libraryId} from vector store`);
  }

  /**
   * Get statistics for a library
   * @param {string} libraryId - Library ID
   * @returns {Promise<Object>} Library statistics
   */
  async getLibraryStats(libraryId) {
    const db = getDatabase();

    const documents = db.prepare(`
      SELECT COUNT(*) as count,
             SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
             SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processing,
             SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
      FROM knowledge_documents WHERE library_id = ?
    `).get(libraryId);

    let vectorCount = 0;
    try {
      const collectionName = this.vectorStore.getCollectionName(libraryId);
      const info = await this.vectorStore.getCollectionInfo(collectionName);
      vectorCount = info?.points_count || 0;
    } catch {
      // Collection may not exist
    }

    return {
      documentCount: documents?.count || 0,
      completedDocuments: documents?.completed || 0,
      processingDocuments: documents?.processing || 0,
      failedDocuments: documents?.failed || 0,
      vectorCount,
    };
  }
}

// Singleton instance
let retrievalServiceInstance = null;

function getRetrievalService() {
  if (!retrievalServiceInstance) {
    retrievalServiceInstance = new RetrievalService();
  }
  return retrievalServiceInstance;
}

module.exports = {
  RetrievalService,
  getRetrievalService,
};
