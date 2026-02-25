/**
 * Chunking Service
 *
 * Splits documents into smaller chunks for embedding.
 * Supports various chunking strategies optimized for RAG.
 */

const { logger } = require('../logger.cjs');
const crypto = require('crypto');

// Default chunking configuration
const DEFAULT_CHUNK_SIZE = 500;
const DEFAULT_CHUNK_OVERLAP = 50;

class ChunkingService {
  constructor(options = {}) {
    this.chunkSize = options.chunkSize || DEFAULT_CHUNK_SIZE;
    this.chunkOverlap = options.chunkOverlap || DEFAULT_CHUNK_OVERLAP;
  }

  /**
   * Split text into chunks
   * @param {string} text - Text to split
   * @param {Object} options - Chunking options
   * @returns {Array<{content: string, startIndex: number, endIndex: number}>}
   */
  chunk(text, options = {}) {
    const chunkSize = options.chunkSize || this.chunkSize;
    const overlap = options.overlap || this.chunkOverlap;
    const strategy = options.strategy || 'paragraph';

    switch (strategy) {
      case 'fixed':
        return this.fixedSizeChunk(text, chunkSize, overlap);
      case 'sentence':
        return this.sentenceChunk(text, chunkSize, overlap);
      case 'paragraph':
        return this.paragraphChunk(text, chunkSize, overlap);
      case 'semantic':
        return this.semanticChunk(text, chunkSize);
      default:
        return this.paragraphChunk(text, chunkSize, overlap);
    }
  }

  /**
   * Fixed size chunking
   * @private
   */
  fixedSizeChunk(text, chunkSize, overlap) {
    const chunks = [];
    let startIndex = 0;

    while (startIndex < text.length) {
      const endIndex = Math.min(startIndex + chunkSize, text.length);
      const content = text.slice(startIndex, endIndex);

      chunks.push({
        content,
        startIndex,
        endIndex,
        length: content.length,
      });

      startIndex = endIndex - overlap;
      if (startIndex >= text.length) break;
    }

    return chunks;
  }

  /**
   * Sentence-aware chunking
   * @private
   */
  sentenceChunk(text, maxSize, overlap) {
    // Split into sentences
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];

    const chunks = [];
    let currentChunk = '';
    let currentStart = 0;
    let sentenceStart = 0;

    for (const sentence of sentences) {
      const trimmedSentence = sentence.trim();

      if (currentChunk.length + trimmedSentence.length > maxSize && currentChunk.length > 0) {
        // Save current chunk
        chunks.push({
          content: currentChunk.trim(),
          startIndex: currentStart,
          endIndex: sentenceStart,
          length: currentChunk.trim().length,
        });

        // Start new chunk with overlap
        if (overlap > 0) {
          const overlapText = currentChunk.slice(-overlap);
          currentChunk = overlapText + ' ' + trimmedSentence;
          currentStart = sentenceStart - overlap;
        } else {
          currentChunk = trimmedSentence;
          currentStart = sentenceStart;
        }
      } else {
        currentChunk += (currentChunk ? ' ' : '') + trimmedSentence;
      }

      sentenceStart += sentence.length;
    }

    // Add final chunk
    if (currentChunk.trim()) {
      chunks.push({
        content: currentChunk.trim(),
        startIndex: currentStart,
        endIndex: text.length,
        length: currentChunk.trim().length,
      });
    }

    return chunks;
  }

  /**
   * Paragraph-aware chunking
   * @private
   */
  paragraphChunk(text, maxSize, overlap) {
    // Split by paragraph breaks
    const paragraphs = text.split(/\n\n+/);

    const chunks = [];
    let currentChunk = '';
    let currentStart = 0;
    let position = 0;

    for (const paragraph of paragraphs) {
      const trimmedPara = paragraph.trim();
      if (!trimmedPara) {
        position += paragraph.length + 2; // Account for \n\n
        continue;
      }

      // If paragraph alone exceeds max size, use sentence chunking
      if (trimmedPara.length > maxSize) {
        // Save current chunk first
        if (currentChunk.trim()) {
          chunks.push({
            content: currentChunk.trim(),
            startIndex: currentStart,
            endIndex: position,
            length: currentChunk.trim().length,
          });
          currentChunk = '';
        }

        // Chunk the large paragraph
        const paraChunks = this.sentenceChunk(trimmedPara, maxSize, overlap);
        for (const pc of paraChunks) {
          chunks.push({
            content: pc.content,
            startIndex: position + pc.startIndex,
            endIndex: position + pc.endIndex,
            length: pc.length,
          });
        }

        currentStart = position + trimmedPara.length;
      } else if (currentChunk.length + trimmedPara.length + 2 > maxSize && currentChunk.length > 0) {
        // Save current chunk
        chunks.push({
          content: currentChunk.trim(),
          startIndex: currentStart,
          endIndex: position,
          length: currentChunk.trim().length,
        });

        // Start new chunk
        currentChunk = trimmedPara;
        currentStart = position;
      } else {
        currentChunk += (currentChunk ? '\n\n' : '') + trimmedPara;
      }

      position += paragraph.length + 2;
    }

    // Add final chunk
    if (currentChunk.trim()) {
      chunks.push({
        content: currentChunk.trim(),
        startIndex: currentStart,
        endIndex: text.length,
        length: currentChunk.trim().length,
      });
    }

    return chunks;
  }

  /**
   * Semantic chunking (header/section aware)
   * @private
   */
  semanticChunk(text, maxSize) {
    // Look for headers (markdown or plain text patterns)
    const headerPattern = /^(#{1,6}\s.+|[A-Z][^.!?]*:?\s*$)/gm;

    const sections = [];
    let lastIndex = 0;
    let match;

    while ((match = headerPattern.exec(text)) !== null) {
      if (match.index > lastIndex) {
        sections.push({
          content: text.slice(lastIndex, match.index).trim(),
          isHeader: false,
          startIndex: lastIndex,
        });
      }
      sections.push({
        content: match[0],
        isHeader: true,
        startIndex: match.index,
      });
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      sections.push({
        content: text.slice(lastIndex).trim(),
        isHeader: false,
        startIndex: lastIndex,
      });
    }

    // Combine sections into chunks
    const chunks = [];
    let currentChunk = '';
    let currentStart = 0;
    let lastHeader = '';

    for (const section of sections) {
      if (section.isHeader) {
        lastHeader = section.content;
        continue;
      }

      const content = section.content;
      if (!content) continue;

      // Prepend header context if available
      const withContext = lastHeader
        ? `${lastHeader}\n\n${content}`
        : content;

      if (withContext.length > maxSize) {
        // Save current chunk
        if (currentChunk.trim()) {
          chunks.push({
            content: currentChunk.trim(),
            startIndex: currentStart,
            endIndex: section.startIndex,
            length: currentChunk.trim().length,
          });
        }

        // Split large section
        const subChunks = this.paragraphChunk(withContext, maxSize, 50);
        for (const sc of subChunks) {
          chunks.push({
            ...sc,
            startIndex: section.startIndex + sc.startIndex,
            endIndex: section.startIndex + sc.endIndex,
          });
        }

        currentChunk = '';
        currentStart = section.startIndex + content.length;
      } else if (currentChunk.length + withContext.length + 2 > maxSize && currentChunk.length > 0) {
        chunks.push({
          content: currentChunk.trim(),
          startIndex: currentStart,
          endIndex: section.startIndex,
          length: currentChunk.trim().length,
        });

        currentChunk = withContext;
        currentStart = section.startIndex;
      } else {
        currentChunk += (currentChunk ? '\n\n' : '') + withContext;
        if (currentStart === 0) currentStart = section.startIndex;
      }
    }

    if (currentChunk.trim()) {
      chunks.push({
        content: currentChunk.trim(),
        startIndex: currentStart,
        endIndex: text.length,
        length: currentChunk.trim().length,
      });
    }

    return chunks;
  }

  /**
   * Chunk a document with metadata
   * @param {Object} document - Document to chunk
   * @param {Object} options - Chunking options
   * @returns {Array} Chunks with metadata
   */
  chunkDocument(document, options = {}) {
    const { content, id, title, source, metadata = {} } = document;

    if (!content) {
      return [];
    }

    const chunks = this.chunk(content, options);

    return chunks.map((chunk, index) => ({
      // Generate a valid UUID for Qdrant (instead of invalid format like "uuid_chunk_0")
      id: crypto.randomUUID(),
      documentId: id,
      content: chunk.content,
      chunkIndex: index,
      totalChunks: chunks.length,
      startIndex: chunk.startIndex,
      endIndex: chunk.endIndex,
      metadata: {
        ...metadata,
        title,
        source,
        chunkLength: chunk.length,
        originalChunkId: `${id}_chunk_${index}`, // Keep original format for debugging
      },
    }));
  }
}

// Singleton instance
let chunkingServiceInstance = null;

function getChunkingService(options = {}) {
  if (!chunkingServiceInstance) {
    chunkingServiceInstance = new ChunkingService(options);
  }
  return chunkingServiceInstance;
}

module.exports = {
  ChunkingService,
  getChunkingService,
};
