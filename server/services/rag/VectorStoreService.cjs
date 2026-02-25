/**
 * Vector Store Service
 *
 * Manages vector storage and retrieval using Qdrant.
 * Provides CRUD operations for vector embeddings.
 */

const { logger } = require('../logger.cjs');

// Qdrant configuration
// Auto-detect: if QDRANT_URL uses Docker hostname 'qdrant' but we're running locally, use localhost
let QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
if (QDRANT_URL.includes('://qdrant:') && !process.env.DOCKER_CONTAINER) {
  // Check if we can reach the Docker hostname, if not fall back to localhost
  QDRANT_URL = QDRANT_URL.replace('://qdrant:', '://localhost:');
  logger.debug(`VectorStore: Using localhost for Qdrant (outside Docker)`);
}
const QDRANT_API_KEY = process.env.QDRANT_API_KEY || null;
const DEFAULT_VECTOR_SIZE = 1536; // OpenAI embeddings (Ollama nomic-embed-text is 768)

class VectorStoreService {
  constructor() {
    this.baseUrl = QDRANT_URL;
    this.apiKey = QDRANT_API_KEY;
    this.initialized = false;
  }

  /**
   * Make a request to Qdrant API
   * @private
   */
  async request(method, path, body = null) {
    const url = `${this.baseUrl}${path}`;

    const headers = {
      'Content-Type': 'application/json',
    };

    if (this.apiKey) {
      headers['api-key'] = this.apiKey;
    }

    const options = {
      method,
      headers,
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(url, options);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Qdrant error (${response.status}): ${errorText}`);
      }

      return response.json();
    } catch (error) {
      if (error.message.includes('ECONNREFUSED')) {
        throw new Error('Qdrant is not available. Please ensure Qdrant is running.');
      }
      throw error;
    }
  }

  /**
   * Ensure a collection exists with correct vector dimensions
   * @param {string} collectionName - Collection name
   * @param {number} vectorSize - Vector dimension size
   */
  async ensureCollection(collectionName, vectorSize = DEFAULT_VECTOR_SIZE) {
    try {
      // Check if collection exists
      const response = await this.request('GET', `/collections/${collectionName}`);
      if (response.result) {
        // Verify vector dimensions match
        const existingSize = response.result.config?.params?.vectors?.size;
        if (existingSize && existingSize !== vectorSize) {
          logger.warn(`Collection ${collectionName} has wrong dimensions (${existingSize} vs ${vectorSize}), recreating...`);
          await this.deleteCollection(collectionName);
        } else {
          return true;
        }
      }
    } catch (error) {
      // Collection doesn't exist, create it
    }

    try {
      await this.request('PUT', `/collections/${collectionName}`, {
        vectors: {
          size: vectorSize,
          distance: 'Cosine',
        },
      });

      logger.info(`Created Qdrant collection: ${collectionName} (${vectorSize} dimensions)`);
      return true;
    } catch (error) {
      logger.error(`Failed to create collection: ${error.message}`);
      throw error;
    }
  }

  /**
   * Delete a collection
   * @param {string} collectionName - Collection name
   */
  async deleteCollection(collectionName) {
    await this.request('DELETE', `/collections/${collectionName}`);
    logger.info(`Deleted Qdrant collection: ${collectionName}`);
  }

  /**
   * Get collection for a library
   * @param {string} libraryId - Library ID
   * @returns {string} Collection name
   */
  getCollectionName(libraryId) {
    return `rag_library_${libraryId}`;
  }

  /**
   * Insert vectors into a collection
   * @param {string} collectionName - Collection name
   * @param {Array} points - Points to insert
   */
  async upsertPoints(collectionName, points) {
    // Detect vector dimension from first point
    const vectorSize = points[0]?.vector?.length || DEFAULT_VECTOR_SIZE;
    await this.ensureCollection(collectionName, vectorSize);

    // Batch upsert in chunks of 100
    const batchSize = 100;
    for (let i = 0; i < points.length; i += batchSize) {
      const batch = points.slice(i, i + batchSize);

      await this.request('PUT', `/collections/${collectionName}/points`, {
        points: batch.map(point => ({
          id: point.id,
          vector: point.vector,
          payload: point.payload || {},
        })),
      });
    }

    logger.debug(`Upserted ${points.length} points to ${collectionName}`);
  }

  /**
   * Search for similar vectors
   * @param {string} collectionName - Collection name
   * @param {number[]} vector - Query vector
   * @param {Object} options - Search options
   * @returns {Promise<Array>} Search results
   */
  async search(collectionName, vector, options = {}) {
    const { limit = 5, filter = null, scoreThreshold = 0 } = options;

    const body = {
      vector,
      limit,
      with_payload: true,
      with_vector: false,
    };

    if (filter) {
      body.filter = filter;
    }

    if (scoreThreshold > 0) {
      body.score_threshold = scoreThreshold;
    }

    try {
      const response = await this.request(
        'POST',
        `/collections/${collectionName}/points/search`,
        body
      );

      return (response.result || []).map(r => ({
        id: r.id,
        score: r.score,
        payload: r.payload,
      }));
    } catch (error) {
      // Collection might not exist yet
      if (error.message.includes('not found')) {
        return [];
      }
      throw error;
    }
  }

  /**
   * Delete points by IDs
   * @param {string} collectionName - Collection name
   * @param {string[]} ids - Point IDs to delete
   */
  async deletePoints(collectionName, ids) {
    await this.request('POST', `/collections/${collectionName}/points/delete`, {
      points: ids,
    });

    logger.debug(`Deleted ${ids.length} points from ${collectionName}`);
  }

  /**
   * Delete points by filter
   * @param {string} collectionName - Collection name
   * @param {Object} filter - Filter to match points
   */
  async deleteByFilter(collectionName, filter) {
    await this.request('POST', `/collections/${collectionName}/points/delete`, {
      filter,
    });

    logger.debug(`Deleted points by filter from ${collectionName}`);
  }

  /**
   * Get collection info
   * @param {string} collectionName - Collection name
   * @returns {Promise<Object>} Collection info
   */
  async getCollectionInfo(collectionName) {
    try {
      const response = await this.request('GET', `/collections/${collectionName}`);
      return response.result;
    } catch (error) {
      if (error.message.includes('not found')) {
        return null;
      }
      throw error;
    }
  }

  /**
   * List all collections
   * @returns {Promise<string[]>} Collection names
   */
  async listCollections() {
    const response = await this.request('GET', '/collections');
    return (response.result?.collections || []).map(c => c.name);
  }

  /**
   * Check if Qdrant is available
   * @returns {Promise<boolean>}
   */
  async isAvailable() {
    try {
      await this.request('GET', '/');
      return true;
    } catch {
      return false;
    }
  }
}

// Singleton instance
let vectorStoreInstance = null;

function getVectorStoreService() {
  if (!vectorStoreInstance) {
    vectorStoreInstance = new VectorStoreService();
  }
  return vectorStoreInstance;
}

module.exports = {
  VectorStoreService,
  getVectorStoreService,
};
