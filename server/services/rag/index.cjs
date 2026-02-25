/**
 * RAG Pipeline Index
 *
 * Central export for all RAG-related services.
 */

const { VectorStoreService, getVectorStoreService } = require('./VectorStoreService.cjs');
const { ChunkingService, getChunkingService } = require('./ChunkingService.cjs');
const { RetrievalService, getRetrievalService } = require('./RetrievalService.cjs');
const { EmailIngestion, getEmailIngestion, INGESTION_RESULT, EMAIL_DOMAIN_RELIABILITY } = require('./EmailIngestion.cjs');

module.exports = {
  // Vector Store
  VectorStoreService,
  getVectorStoreService,

  // Chunking
  ChunkingService,
  getChunkingService,

  // Retrieval
  RetrievalService,
  getRetrievalService,

  // Email Ingestion
  EmailIngestion,
  getEmailIngestion,
  INGESTION_RESULT,
  EMAIL_DOMAIN_RELIABILITY,
};
