/**
 * Library Matcher Service
 *
 * Matches incoming content to the most appropriate RAG library
 * using a two-stage approach:
 * 1. Fast keyword pre-filtering
 * 2. Semantic embedding similarity for final ranking
 *
 * This enables automatic content routing to the right knowledge base
 * based on library descriptions and configured keywords.
 */

const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('../database.cjs');
const { logger } = require('../logger.cjs');

// Lazy load AI service to avoid circular dependencies
let _aiService = null;
function getAIService() {
  if (!_aiService) {
    const { getAIService: getService } = require('../ai/AIService.cjs');
    _aiService = getService();
  }
  return _aiService;
}

/**
 * Default matching configuration
 */
const DEFAULT_CONFIG = {
  minScore: 0.75,           // Minimum similarity score to match (increased from 0.65 for stricter matching)
  keywordBoost: 0.15,       // Boost score if keywords match (increased from 0.1)
  maxAlternates: 3,         // Number of alternate matches to return
  embeddingCacheTTL: 3600000, // 1 hour cache for embeddings
  requireKeywordMatch: true, // Require at least one keyword to match for libraries with keywords configured
  minKeywordMatchRatio: 0.2, // Minimum ratio of keywords that must match (20% = at least 2 out of 10)
  minKeywordMatches: 2,      // Minimum number of keywords that must match (unless library has fewer keywords)
};

class LibraryMatcher {
  constructor(options = {}) {
    this.config = { ...DEFAULT_CONFIG, ...options };
    this.embeddingCache = new Map(); // In-memory cache for library embeddings
  }

  /**
   * Find the best matching library for content
   * @param {string} content - Message content to match
   * @param {string} userId - User ID
   * @param {Object} options - Matching options
   * @returns {Promise<Object>} Match result
   */
  async matchLibrary(content, userId, options = {}) {
    const startTime = Date.now();
    const {
      minScore = this.config.minScore,
      source = null,
      skipKeywordFilter = false,
      forceEmbeddingMatch = false,
    } = options;

    const db = getDatabase();

    try {
      // 1. Get all libraries with auto_ingest enabled for this user
      let libraries = db.prepare(`
        SELECT id, name, description, match_keywords, match_embedding, ingest_sources
        FROM knowledge_libraries
        WHERE user_id = ? AND auto_ingest = 1
      `).all(userId);

      if (libraries.length === 0) {
        return {
          matched: false,
          reason: 'no_auto_ingest_libraries',
          processingTimeMs: Date.now() - startTime,
        };
      }

      logger.debug(`LibraryMatcher: Found ${libraries.length} auto-ingest libraries for user ${userId}`);

      // 2. Filter by source if specified
      if (source) {
        libraries = libraries.filter(lib => {
          if (!lib.ingest_sources) return true; // No filter = accept all
          try {
            const sources = JSON.parse(lib.ingest_sources);
            return sources.length === 0 || sources.includes(source);
          } catch {
            return true;
          }
        });

        if (libraries.length === 0) {
          return {
            matched: false,
            reason: 'no_libraries_for_source',
            source,
            processingTimeMs: Date.now() - startTime,
          };
        }
      }

      // 3. Fast keyword pre-filtering (required for strict matching)
      let keywordMatches = new Map(); // Track which keywords matched for scoring boost
      if (!skipKeywordFilter && !forceEmbeddingMatch) {
        const contentLower = content.toLowerCase();
        const filteredLibraries = [];

        for (const lib of libraries) {
          // Parse keywords
          let keywords = [];
          if (lib.match_keywords) {
            try {
              keywords = JSON.parse(lib.match_keywords);
            } catch {
              keywords = [];
            }
          }

          // If library has no keywords configured and requireKeywordMatch is true,
          // skip this library (it's not properly configured for auto-ingest)
          if (keywords.length === 0) {
            if (this.config.requireKeywordMatch) {
              logger.debug(`LibraryMatcher: Skipping "${lib.name}" - no keywords configured`);
              continue;
            }
            // If requireKeywordMatch is false, include libraries without keywords
            filteredLibraries.push(lib);
            continue;
          }

          // Check for keyword matches
          const matchedKeywords = keywords.filter(kw =>
            contentLower.includes(kw.toLowerCase())
          );

          if (matchedKeywords.length > 0) {
            // Calculate keyword match ratio
            const matchRatio = matchedKeywords.length / keywords.length;
            const minRequired = Math.min(this.config.minKeywordMatches, keywords.length);

            // Require minimum keyword match ratio OR minimum keyword count
            // This prevents generic single-keyword matches like just "USA"
            if (matchedKeywords.length >= minRequired || matchRatio >= this.config.minKeywordMatchRatio) {
              filteredLibraries.push(lib);
              keywordMatches.set(lib.id, matchedKeywords);
              logger.debug(`LibraryMatcher: Keywords matched for "${lib.name}": ${matchedKeywords.join(', ')} (${(matchRatio * 100).toFixed(0)}% match)`);
            } else {
              logger.debug(`LibraryMatcher: Insufficient keyword matches for "${lib.name}": ${matchedKeywords.length}/${keywords.length} (${(matchRatio * 100).toFixed(0)}% < ${(this.config.minKeywordMatchRatio * 100).toFixed(0)}% min, need at least ${minRequired} keywords)`);
            }
          } else {
            logger.debug(`LibraryMatcher: No keywords matched for "${lib.name}" (configured: ${keywords.join(', ')})`);
          }
        }

        if (filteredLibraries.length === 0) {
          logger.info(`LibraryMatcher: No libraries matched keywords in content`);
          return {
            matched: false,
            reason: 'no_keyword_match',
            processingTimeMs: Date.now() - startTime,
          };
        }

        libraries = filteredLibraries;
      }

      // 4. Semantic matching using embeddings
      const aiService = getAIService();

      // Generate content embedding
      let contentEmbedding;
      try {
        const embedResult = await aiService.embed([content], { userId });
        contentEmbedding = embedResult[0];
      } catch (error) {
        logger.error(`LibraryMatcher: Failed to generate content embedding: ${error.message}`);
        // Fall back to keyword-only matching if embedding fails
        if (keywordMatches.size > 0) {
          const bestKeywordMatch = Array.from(keywordMatches.entries())
            .sort((a, b) => b[1].length - a[1].length)[0];

          const matchedLib = libraries.find(l => l.id === bestKeywordMatch[0]);
          return {
            matched: true,
            library: {
              id: matchedLib.id,
              name: matchedLib.name,
              description: matchedLib.description,
            },
            score: 0.5 + (bestKeywordMatch[1].length * 0.1), // Estimate score from keywords
            matchType: 'keyword_fallback',
            matchedKeywords: bestKeywordMatch[1],
            processingTimeMs: Date.now() - startTime,
          };
        }
        return {
          matched: false,
          reason: 'embedding_failed',
          error: error.message,
          processingTimeMs: Date.now() - startTime,
        };
      }

      // Score each library
      const scores = [];
      for (const lib of libraries) {
        let libEmbedding;

        // Check cache first
        const cacheKey = `lib:${lib.id}`;
        const cached = this.embeddingCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.config.embeddingCacheTTL) {
          libEmbedding = cached.embedding;
        } else if (lib.match_embedding) {
          // Use stored embedding
          libEmbedding = this.deserializeEmbedding(lib.match_embedding);
          this.embeddingCache.set(cacheKey, { embedding: libEmbedding, timestamp: Date.now() });
        } else {
          // Generate and cache embedding from description
          try {
            const [embedding] = await aiService.embed(
              [lib.description || lib.name],
              { userId }
            );
            libEmbedding = embedding;

            // Store in database for future use
            db.prepare(`
              UPDATE knowledge_libraries SET match_embedding = ? WHERE id = ?
            `).run(this.serializeEmbedding(embedding), lib.id);

            this.embeddingCache.set(cacheKey, { embedding: libEmbedding, timestamp: Date.now() });
          } catch (error) {
            logger.warn(`LibraryMatcher: Failed to generate embedding for library ${lib.id}: ${error.message}`);
            continue;
          }
        }

        // Calculate cosine similarity
        let similarity = this.cosineSimilarity(contentEmbedding, libEmbedding);

        // Apply keyword boost if keywords matched
        if (keywordMatches.has(lib.id)) {
          const boost = Math.min(this.config.keywordBoost * keywordMatches.get(lib.id).length, 0.2);
          similarity = Math.min(1.0, similarity + boost);
        }

        scores.push({
          library: lib,
          score: similarity,
          matchedKeywords: keywordMatches.get(lib.id) || [],
        });
      }

      if (scores.length === 0) {
        return {
          matched: false,
          reason: 'no_embeddings_available',
          processingTimeMs: Date.now() - startTime,
        };
      }

      // 5. Sort by score and get best match
      scores.sort((a, b) => b.score - a.score);
      const bestMatch = scores[0];

      if (!bestMatch || bestMatch.score < minScore) {
        return {
          matched: false,
          reason: 'below_threshold',
          bestScore: bestMatch?.score,
          bestLibrary: bestMatch?.library?.name,
          threshold: minScore,
          processingTimeMs: Date.now() - startTime,
        };
      }

      logger.info(`LibraryMatcher: Matched "${bestMatch.library.name}" with score ${bestMatch.score.toFixed(3)}`);

      return {
        matched: true,
        library: {
          id: bestMatch.library.id,
          name: bestMatch.library.name,
          description: bestMatch.library.description,
        },
        score: bestMatch.score,
        matchedKeywords: bestMatch.matchedKeywords,
        alternates: scores.slice(1, this.config.maxAlternates + 1).map(s => ({
          id: s.library.id,
          name: s.library.name,
          score: s.score,
        })),
        processingTimeMs: Date.now() - startTime,
      };

    } catch (error) {
      logger.error(`LibraryMatcher: Error matching library: ${error.message}`);
      return {
        matched: false,
        reason: 'error',
        error: error.message,
        processingTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Get all libraries available for auto-ingest
   * @param {string} userId - User ID
   * @returns {Array} List of libraries with auto-ingest enabled
   */
  getAutoIngestLibraries(userId) {
    const db = getDatabase();
    return db.prepare(`
      SELECT id, name, description, match_keywords, ingest_sources
      FROM knowledge_libraries
      WHERE user_id = ? AND auto_ingest = 1
    `).all(userId);
  }

  /**
   * Regenerate embedding for a library
   * @param {string} libraryId - Library ID
   * @param {string} userId - User ID
   * @returns {Promise<boolean>} Success status
   */
  async regenerateLibraryEmbedding(libraryId, userId) {
    const db = getDatabase();
    const aiService = getAIService();

    const library = db.prepare(`
      SELECT id, name, description FROM knowledge_libraries
      WHERE id = ? AND user_id = ?
    `).get(libraryId, userId);

    if (!library) {
      return false;
    }

    try {
      const [embedding] = await aiService.embed(
        [library.description || library.name],
        { userId }
      );

      db.prepare(`
        UPDATE knowledge_libraries
        SET match_embedding = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(this.serializeEmbedding(embedding), libraryId);

      // Update cache
      this.embeddingCache.set(`lib:${libraryId}`, { embedding, timestamp: Date.now() });

      logger.info(`LibraryMatcher: Regenerated embedding for library ${libraryId}`);
      return true;
    } catch (error) {
      logger.error(`LibraryMatcher: Failed to regenerate embedding: ${error.message}`);
      return false;
    }
  }

  /**
   * Clear embedding cache
   */
  clearCache() {
    this.embeddingCache.clear();
    logger.info('LibraryMatcher: Cache cleared');
  }

  /**
   * Cosine similarity between two vectors
   * @private
   */
  cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) {
      return 0;
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0) return 0;

    return dotProduct / denominator;
  }

  /**
   * Serialize embedding to Buffer for storage
   * @private
   */
  serializeEmbedding(embedding) {
    return Buffer.from(new Float32Array(embedding).buffer);
  }

  /**
   * Deserialize embedding from Buffer
   * @private
   */
  deserializeEmbedding(buffer) {
    if (!buffer) return null;
    // Handle both Buffer and Uint8Array
    const arrayBuffer = buffer.buffer || buffer;
    return Array.from(new Float32Array(arrayBuffer.slice(
      buffer.byteOffset || 0,
      (buffer.byteOffset || 0) + buffer.length
    )));
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      cacheSize: this.embeddingCache.size,
      config: this.config,
    };
  }
}

// Singleton instance
let libraryMatcherInstance = null;

/**
 * Get the LibraryMatcher singleton
 * @param {Object} options - Configuration options
 * @returns {LibraryMatcher}
 */
function getLibraryMatcher(options = {}) {
  if (!libraryMatcherInstance) {
    libraryMatcherInstance = new LibraryMatcher(options);
  }
  return libraryMatcherInstance;
}

module.exports = {
  LibraryMatcher,
  getLibraryMatcher,
};
