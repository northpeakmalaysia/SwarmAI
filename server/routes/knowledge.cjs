/**
 * Knowledge Routes
 * RAG knowledge base management
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getDatabase } = require('../services/database.cjs');
const { logger } = require('../services/logger.cjs');
const { authenticate } = require('./auth.cjs');
const { getLibraryMatcher } = require('../services/rag/LibraryMatcher.cjs');
const { getURLScrapingService } = require('../services/rag/URLScrapingService.cjs');
const { getNewsletterIngestion } = require('../services/rag/NewsletterIngestion.cjs');

// Configure multer for file uploads
const UPLOAD_DIR = path.join(__dirname, '../data/uploads/knowledge');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${uuidv4().slice(0, 8)}`;
    cb(null, `${uniqueSuffix}-${file.originalname}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 200 * 1024 * 1024, // 200MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allowed file types for RAG ingestion
    const allowedMimes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
      'text/csv',
      'text/markdown',
      'application/json',
      'text/html',
    ];
    const allowedExts = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.xlsm', '.txt', '.csv', '.tsv', '.md', '.json', '.html'];

    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedMimes.includes(file.mimetype) || allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype} (${ext})`));
    }
  }
});

const router = express.Router();

router.use(authenticate);

// ============================================
// Libraries
// ============================================

/**
 * GET /api/knowledge/libraries
 * List knowledge libraries
 */
router.get('/libraries', (req, res) => {
  try {
    const db = getDatabase();

    const libraries = db.prepare(`
      SELECT
        l.*,
        (SELECT COUNT(*) FROM knowledge_documents WHERE library_id = l.id) as documentCount,
        (SELECT COUNT(*) FROM knowledge_folders WHERE library_id = l.id) as folderCount,
        (SELECT COALESCE(SUM(chunk_count), 0) FROM knowledge_documents WHERE library_id = l.id) as totalChunks,
        (SELECT COALESCE(SUM(file_size), 0) FROM knowledge_documents WHERE library_id = l.id) as totalSize
      FROM knowledge_libraries l
      WHERE l.user_id = ?
      ORDER BY l.name
    `).all(req.user.id);

    res.json({
      libraries: libraries.map(l => ({
        id: l.id,
        name: l.name,
        description: l.description,
        documentCount: l.documentCount || 0,
        totalChunks: l.totalChunks || 0,
        totalSize: l.totalSize || 0,
        createdAt: l.created_at,
        updatedAt: l.updated_at,
        settings: l.settings ? JSON.parse(l.settings) : {},
        autoIngest: {
          enabled: l.auto_ingest === 1,
          keywords: l.match_keywords ? JSON.parse(l.match_keywords) : [],
          sources: l.ingest_sources ? JSON.parse(l.ingest_sources) : [],
        }
      }))
    });

  } catch (error) {
    logger.error(`Failed to list libraries: ${error.message}`);
    res.status(500).json({ error: 'Failed to list libraries' });
  }
});

/**
 * GET /api/knowledge/libraries/:id
 * Get library details
 */
router.get('/libraries/:id', (req, res) => {
  try {
    const db = getDatabase();

    const library = db.prepare('SELECT * FROM knowledge_libraries WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!library) {
      return res.status(404).json({ error: 'Library not found' });
    }

    res.json({
      library: {
        ...library,
        settings: library.settings ? JSON.parse(library.settings) : {}
      }
    });

  } catch (error) {
    logger.error(`Failed to get library: ${error.message}`);
    res.status(500).json({ error: 'Failed to get library' });
  }
});

/**
 * POST /api/knowledge/libraries
 * Create knowledge library
 */
router.post('/libraries', (req, res) => {
  try {
    const { name, description, settings, autoIngest } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Library name is required' });
    }

    const db = getDatabase();
    const libraryId = uuidv4();

    // Prepare auto-ingest fields
    const autoIngestEnabled = autoIngest?.enabled ? 1 : 0;
    const matchKeywords = autoIngest?.keywords?.length > 0
      ? JSON.stringify(autoIngest.keywords)
      : null;
    const ingestSources = autoIngest?.sources?.length > 0
      ? JSON.stringify(autoIngest.sources)
      : null;

    db.prepare(`
      INSERT INTO knowledge_libraries (id, user_id, name, description, settings, auto_ingest, match_keywords, ingest_sources)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      libraryId,
      req.user.id,
      name,
      description || null,
      JSON.stringify(settings || {}),
      autoIngestEnabled,
      matchKeywords,
      ingestSources
    );

    const library = db.prepare('SELECT * FROM knowledge_libraries WHERE id = ?').get(libraryId);

    res.status(201).json({
      library: {
        ...library,
        settings: library.settings ? JSON.parse(library.settings) : {},
        autoIngest: {
          enabled: library.auto_ingest === 1,
          keywords: library.match_keywords ? JSON.parse(library.match_keywords) : [],
          sources: library.ingest_sources ? JSON.parse(library.ingest_sources) : [],
        }
      }
    });

  } catch (error) {
    logger.error(`Failed to create library: ${error.message}`);
    res.status(500).json({ error: 'Failed to create library' });
  }
});

/**
 * PATCH /api/knowledge/libraries/:id
 * Update library (including auto-ingest settings)
 */
router.patch('/libraries/:id', (req, res) => {
  try {
    const db = getDatabase();

    const existing = db.prepare('SELECT * FROM knowledge_libraries WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);

    if (!existing) {
      return res.status(404).json({ error: 'Library not found' });
    }

    const { name, description, settings, autoIngest } = req.body;

    const updates = [];
    const params = [];

    if (name !== undefined) { updates.push('name = ?'); params.push(name); }
    if (description !== undefined) { updates.push('description = ?'); params.push(description); }
    if (settings !== undefined) { updates.push('settings = ?'); params.push(JSON.stringify(settings)); }

    // Handle auto-ingest settings
    if (autoIngest !== undefined) {
      if (autoIngest.enabled !== undefined) {
        updates.push('auto_ingest = ?');
        params.push(autoIngest.enabled ? 1 : 0);
      }
      if (autoIngest.keywords !== undefined) {
        updates.push('match_keywords = ?');
        params.push(JSON.stringify(autoIngest.keywords));
        // Clear cached embedding when keywords change to force re-generation
        updates.push('match_embedding = NULL');
      }
      if (autoIngest.sources !== undefined) {
        updates.push('ingest_sources = ?');
        params.push(JSON.stringify(autoIngest.sources));
      }
    }

    if (updates.length > 0) {
      updates.push("updated_at = datetime('now')");
      params.push(req.params.id);
      db.prepare(`UPDATE knowledge_libraries SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }

    const library = db.prepare('SELECT * FROM knowledge_libraries WHERE id = ?').get(req.params.id);

    res.json({
      library: {
        id: library.id,
        name: library.name,
        description: library.description,
        documentCount: library.document_count || 0,
        totalChunks: library.total_chunks || 0,
        totalSize: library.total_size || 0,
        createdAt: library.created_at,
        updatedAt: library.updated_at,
        settings: library.settings ? JSON.parse(library.settings) : {},
        autoIngest: {
          enabled: library.auto_ingest === 1,
          keywords: library.match_keywords ? JSON.parse(library.match_keywords) : [],
          sources: library.ingest_sources ? JSON.parse(library.ingest_sources) : [],
        }
      }
    });

  } catch (error) {
    logger.error(`Failed to update library: ${error.message}`);
    res.status(500).json({ error: 'Failed to update library' });
  }
});

/**
 * DELETE /api/knowledge/libraries/:id
 * Delete library
 */
router.delete('/libraries/:id', (req, res) => {
  try {
    const db = getDatabase();

    const result = db.prepare('DELETE FROM knowledge_libraries WHERE id = ? AND user_id = ?')
      .run(req.params.id, req.user.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Library not found' });
    }

    res.json({ message: 'Library deleted' });

  } catch (error) {
    logger.error(`Failed to delete library: ${error.message}`);
    res.status(500).json({ error: 'Failed to delete library' });
  }
});

// ============================================
// Auto-Ingest Configuration
// ============================================

/**
 * GET /api/knowledge/libraries/:id/auto-ingest
 * Get auto-ingest settings for a library
 */
router.get('/libraries/:id/auto-ingest', (req, res) => {
  try {
    const db = getDatabase();

    const library = db.prepare(`
      SELECT id, name, description, auto_ingest, match_keywords, ingest_sources
      FROM knowledge_libraries
      WHERE id = ? AND user_id = ?
    `).get(req.params.id, req.user.id);

    if (!library) {
      return res.status(404).json({ error: 'Library not found' });
    }

    res.json({
      libraryId: library.id,
      libraryName: library.name,
      enabled: library.auto_ingest === 1,
      keywords: library.match_keywords ? JSON.parse(library.match_keywords) : [],
      sources: library.ingest_sources ? JSON.parse(library.ingest_sources) : [],
      description: library.description,
    });

  } catch (error) {
    logger.error(`Failed to get auto-ingest settings: ${error.message}`);
    res.status(500).json({ error: 'Failed to get auto-ingest settings' });
  }
});

/**
 * PATCH /api/knowledge/libraries/:id/auto-ingest
 * Update auto-ingest settings for a library
 */
router.patch('/libraries/:id/auto-ingest', async (req, res) => {
  try {
    const { enabled, keywords, sources, description } = req.body;
    const db = getDatabase();

    // Verify ownership
    const library = db.prepare(
      'SELECT * FROM knowledge_libraries WHERE id = ? AND user_id = ?'
    ).get(req.params.id, req.user.id);

    if (!library) {
      return res.status(404).json({ error: 'Library not found' });
    }

    // Build update query
    const updates = [];
    const params = [];

    if (enabled !== undefined) {
      updates.push('auto_ingest = ?');
      params.push(enabled ? 1 : 0);
    }

    if (keywords !== undefined) {
      updates.push('match_keywords = ?');
      params.push(JSON.stringify(keywords));
    }

    if (sources !== undefined) {
      updates.push('ingest_sources = ?');
      params.push(JSON.stringify(sources));
    }

    if (description !== undefined) {
      updates.push('description = ?');
      params.push(description);
      // Clear cached embedding when description changes
      updates.push('match_embedding = NULL');
    }

    if (updates.length > 0) {
      updates.push("updated_at = datetime('now')");
      params.push(req.params.id);
      db.prepare(
        `UPDATE knowledge_libraries SET ${updates.join(', ')} WHERE id = ?`
      ).run(...params);
    }

    // Regenerate embedding if description changed
    if (description !== undefined) {
      try {
        const { getLibraryMatcher } = require('../services/rag/LibraryMatcher.cjs');
        await getLibraryMatcher().regenerateLibraryEmbedding(req.params.id, req.user.id);
      } catch (e) {
        logger.warn(`Failed to regenerate embedding: ${e.message}`);
      }
    }

    const updated = db.prepare(`
      SELECT id, name, description, auto_ingest, match_keywords, ingest_sources
      FROM knowledge_libraries WHERE id = ?
    `).get(req.params.id);

    res.json({
      success: true,
      libraryId: updated.id,
      libraryName: updated.name,
      enabled: updated.auto_ingest === 1,
      keywords: updated.match_keywords ? JSON.parse(updated.match_keywords) : [],
      sources: updated.ingest_sources ? JSON.parse(updated.ingest_sources) : [],
    });

  } catch (error) {
    logger.error(`Failed to update auto-ingest settings: ${error.message}`);
    res.status(500).json({ error: 'Failed to update auto-ingest settings' });
  }
});

/**
 * GET /api/knowledge/auto-ingest/libraries
 * Get all libraries with auto-ingest enabled
 */
router.get('/auto-ingest/libraries', (req, res) => {
  try {
    const db = getDatabase();

    const libraries = db.prepare(`
      SELECT
        l.id,
        l.name,
        l.description,
        l.auto_ingest,
        l.match_keywords,
        l.ingest_sources,
        (SELECT COUNT(*) FROM knowledge_documents WHERE library_id = l.id) as documentCount
      FROM knowledge_libraries l
      WHERE l.user_id = ? AND l.auto_ingest = 1
      ORDER BY l.name
    `).all(req.user.id);

    res.json({
      libraries: libraries.map(l => ({
        id: l.id,
        name: l.name,
        description: l.description,
        keywords: l.match_keywords ? JSON.parse(l.match_keywords) : [],
        sources: l.ingest_sources ? JSON.parse(l.ingest_sources) : [],
        documentCount: l.documentCount,
      })),
    });

  } catch (error) {
    logger.error(`Failed to list auto-ingest libraries: ${error.message}`);
    res.status(500).json({ error: 'Failed to list auto-ingest libraries' });
  }
});

/**
 * GET /api/knowledge/auto-ingest/history
 * Get ingestion history
 */
router.get('/auto-ingest/history', (req, res) => {
  try {
    const db = getDatabase();
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);

    const history = db.prepare(`
      SELECT
        il.*,
        kl.name as library_name,
        kd.title as document_title
      FROM ingestion_log il
      LEFT JOIN knowledge_libraries kl ON il.library_id = kl.id
      LEFT JOIN knowledge_documents kd ON il.document_id = kd.id
      WHERE il.user_id = ?
      ORDER BY il.created_at DESC
      LIMIT ?
    `).all(req.user.id, limit);

    res.json({ history });

  } catch (error) {
    logger.error(`Failed to get ingestion history: ${error.message}`);
    res.status(500).json({ error: 'Failed to get ingestion history' });
  }
});

/**
 * GET /api/knowledge/auto-ingest/stats
 * Get ingestion statistics
 */
router.get('/auto-ingest/stats', (req, res) => {
  try {
    const db = getDatabase();

    // Get counts by library
    const byLibrary = db.prepare(`
      SELECT
        kl.id,
        kl.name,
        COUNT(il.id) as ingestion_count,
        AVG(il.reliability_score) as avg_reliability,
        AVG(il.match_score) as avg_match_score
      FROM knowledge_libraries kl
      LEFT JOIN ingestion_log il ON il.library_id = kl.id
      WHERE kl.user_id = ? AND kl.auto_ingest = 1
      GROUP BY kl.id
    `).all(req.user.id);

    // Get counts by source
    const bySource = db.prepare(`
      SELECT
        source,
        COUNT(*) as count,
        AVG(reliability_score) as avg_reliability
      FROM ingestion_log
      WHERE user_id = ?
      GROUP BY source
      ORDER BY count DESC
    `).all(req.user.id);

    // Get total counts
    const totals = db.prepare(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN reliability_score >= 0.7 THEN 1 END) as high_reliability,
        COUNT(CASE WHEN reliability_score < 0.5 THEN 1 END) as low_reliability,
        AVG(reliability_score) as avg_reliability
      FROM ingestion_log
      WHERE user_id = ?
    `).get(req.user.id);

    res.json({
      totals: totals || { total: 0, high_reliability: 0, low_reliability: 0, avg_reliability: 0 },
      byLibrary,
      bySource,
    });

  } catch (error) {
    logger.error(`Failed to get ingestion stats: ${error.message}`);
    res.status(500).json({ error: 'Failed to get ingestion stats' });
  }
});

/**
 * GET /api/knowledge/sources
 * Get known source reliability ratings
 */
router.get('/sources', (req, res) => {
  try {
    const { getContentProcessor, SOURCE_RELIABILITY } = require('../services/rag/ContentProcessor.cjs');

    const sources = Object.entries(SOURCE_RELIABILITY)
      .filter(([domain]) => domain !== '_unknown')
      .map(([domain, info]) => ({
        domain,
        name: info.name,
        score: info.score,
        category: info.category,
      }))
      .sort((a, b) => b.score - a.score);

    res.json({ sources });

  } catch (error) {
    logger.error(`Failed to get sources: ${error.message}`);
    res.status(500).json({ error: 'Failed to get sources' });
  }
});

// ============================================
// Folders
// ============================================

/**
 * GET /api/knowledge/libraries/:libraryId/folders
 * List folders in library
 */
router.get('/libraries/:libraryId/folders', (req, res) => {
  try {
    const db = getDatabase();
    const { parentId } = req.query;

    let query = 'SELECT * FROM knowledge_folders WHERE library_id = ?';
    const params = [req.params.libraryId];

    if (parentId) {
      query += ' AND parent_id = ?';
      params.push(parentId);
    } else {
      query += ' AND parent_id IS NULL';
    }

    query += ' ORDER BY name';

    const folders = db.prepare(query).all(...params);

    res.json({ folders });

  } catch (error) {
    logger.error(`Failed to list folders: ${error.message}`);
    res.status(500).json({ error: 'Failed to list folders' });
  }
});

/**
 * POST /api/knowledge/libraries/:libraryId/folders
 * Create folder
 */
router.post('/libraries/:libraryId/folders', (req, res) => {
  try {
    const { name, parentId } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Folder name is required' });
    }

    const db = getDatabase();
    const folderId = uuidv4();

    db.prepare(`
      INSERT INTO knowledge_folders (id, library_id, parent_id, name)
      VALUES (?, ?, ?, ?)
    `).run(folderId, req.params.libraryId, parentId || null, name);

    const folder = db.prepare('SELECT * FROM knowledge_folders WHERE id = ?').get(folderId);

    res.status(201).json({ folder });

  } catch (error) {
    logger.error(`Failed to create folder: ${error.message}`);
    res.status(500).json({ error: 'Failed to create folder' });
  }
});

/**
 * DELETE /api/knowledge/folders/:folderId
 * Delete folder
 */
router.delete('/folders/:folderId', (req, res) => {
  try {
    const db = getDatabase();

    db.prepare('DELETE FROM knowledge_folders WHERE id = ?').run(req.params.folderId);

    res.json({ message: 'Folder deleted' });

  } catch (error) {
    logger.error(`Failed to delete folder: ${error.message}`);
    res.status(500).json({ error: 'Failed to delete folder' });
  }
});

// ============================================
// Documents
// ============================================

/**
 * Transform database document to frontend format
 * @param {Object} d - Database document record
 * @returns {Object} Frontend-formatted document
 */
function transformDocument(d) {
  const metadata = d.metadata ? JSON.parse(d.metadata) : {};

  // Get file size from various sources, defaulting to 0
  const size = d.file_size || metadata.size || metadata.fileSize || metadata.file_size || 0;

  // Get chunk count from various sources, defaulting to 0
  const chunkCount = d.chunk_count || metadata.chunkCount || metadata.chunks_created || 0;

  // Safely handle dates - return null if invalid
  const createdAt = d.created_at && !isNaN(new Date(d.created_at).getTime())
    ? d.created_at
    : new Date().toISOString();
  const updatedAt = d.updated_at && !isNaN(new Date(d.updated_at).getTime())
    ? d.updated_at
    : createdAt;

  return {
    id: d.id,
    libraryId: d.library_id,
    folderId: d.folder_id,
    fileName: d.title || metadata.fileName || metadata.source_name || 'Untitled',
    sourceType: d.source_type || 'manual',
    sourceUrl: d.source_url,
    mimeType: metadata.mimeType || metadata.mime_type || null,
    size: Number.isFinite(size) ? size : 0,
    chunkCount: Number.isFinite(chunkCount) ? chunkCount : 0,
    status: d.status === 'completed' ? 'indexed' : d.status,
    errorMessage: metadata.error || metadata.embeddingError || null,
    metadata,
    createdAt,
    updatedAt,
  };
}

/**
 * GET /api/knowledge/libraries/:libraryId/documents
 * List documents
 */
router.get('/libraries/:libraryId/documents', (req, res) => {
  try {
    const db = getDatabase();
    const { folderId, status, limit = 50, offset = 0 } = req.query;

    let query = 'SELECT * FROM knowledge_documents WHERE library_id = ?';
    const params = [req.params.libraryId];

    if (folderId) {
      query += ' AND folder_id = ?';
      params.push(folderId);
    }
    if (status) {
      // Map frontend status to database status
      const dbStatus = status === 'indexed' ? 'completed' : status;
      query += ' AND status = ?';
      params.push(dbStatus);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const documents = db.prepare(query).all(...params);

    res.json({
      documents: documents.map(transformDocument)
    });

  } catch (error) {
    logger.error(`Failed to list documents: ${error.message}`);
    res.status(500).json({ error: 'Failed to list documents' });
  }
});

/**
 * GET /api/knowledge/documents/:documentId
 * Get document details
 */
router.get('/documents/:documentId', (req, res) => {
  try {
    const db = getDatabase();

    const document = db.prepare('SELECT * FROM knowledge_documents WHERE id = ?')
      .get(req.params.documentId);

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    res.json({
      document: transformDocument(document)
    });

  } catch (error) {
    logger.error(`Failed to get document: ${error.message}`);
    res.status(500).json({ error: 'Failed to get document' });
  }
});

/**
 * GET /api/knowledge/documents/:documentId/content
 * Get document content for viewing/downloading
 */
router.get('/documents/:documentId/content', (req, res) => {
  try {
    const db = getDatabase();

    const document = db.prepare('SELECT id, title, content, source_type, created_at FROM knowledge_documents WHERE id = ?')
      .get(req.params.documentId);

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    res.json({
      id: document.id,
      title: document.title,
      content: document.content || '',
      sourceType: document.source_type,
      createdAt: document.created_at,
    });

  } catch (error) {
    logger.error(`Failed to get document content: ${error.message}`);
    res.status(500).json({ error: 'Failed to get document content' });
  }
});

/**
 * DELETE /api/knowledge/documents/:documentId
 * Delete document
 */
router.delete('/documents/:documentId', async (req, res) => {
  try {
    const db = getDatabase();
    const documentId = req.params.documentId;

    // Get library_id before deleting so we can clean up Qdrant vectors
    const doc = db.prepare('SELECT library_id FROM knowledge_documents WHERE id = ?').get(documentId);

    // Delete related ingestion_log records first (foreign key constraint)
    db.prepare('DELETE FROM ingestion_log WHERE document_id = ?').run(documentId);

    // Then delete the document
    db.prepare('DELETE FROM knowledge_documents WHERE id = ?').run(documentId);

    // Clean up vectors from Qdrant
    if (doc?.library_id) {
      try {
        const { getVectorStoreService } = require('../services/rag/index.cjs');
        const vectorStore = getVectorStoreService();
        const collectionName = vectorStore.getCollectionName(doc.library_id);
        await vectorStore.deleteByFilter(collectionName, {
          must: [{ key: 'documentId', match: { value: documentId } }]
        });
        logger.info(`Deleted vectors for document ${documentId} from ${collectionName}`);
      } catch (vectorError) {
        logger.warn(`Failed to delete vectors for document ${documentId}: ${vectorError.message}`);
      }
    }

    res.json({ message: 'Document deleted' });

  } catch (error) {
    logger.error(`Failed to delete document: ${error.message}`);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

/**
 * POST /api/knowledge/documents/bulk-delete
 * Delete multiple documents at once
 */
router.post('/documents/bulk-delete', async (req, res) => {
  try {
    const { documentIds, status, libraryId } = req.body;
    const db = getDatabase();

    let deletedCount = 0;
    // Collect document info before deletion for Qdrant cleanup
    let docsForVectorCleanup = [];

    if (documentIds && Array.isArray(documentIds) && documentIds.length > 0) {
      // Get library_ids before deleting for Qdrant cleanup
      const placeholders = documentIds.map(() => '?').join(',');
      docsForVectorCleanup = db.prepare(`SELECT id, library_id FROM knowledge_documents WHERE id IN (${placeholders})`).all(...documentIds);

      // Delete related ingestion_log records first (foreign key constraint)
      db.prepare(`DELETE FROM ingestion_log WHERE document_id IN (${placeholders})`).run(...documentIds);

      // Then delete the documents
      const result = db.prepare(`DELETE FROM knowledge_documents WHERE id IN (${placeholders})`).run(...documentIds);
      deletedCount = result.changes;
    } else if (status && libraryId) {
      // Get document IDs to delete for ingestion_log and Qdrant cleanup
      const docsToDelete = db.prepare('SELECT id, library_id FROM knowledge_documents WHERE library_id = ? AND status = ?').all(libraryId, status);
      docsForVectorCleanup = docsToDelete;
      const docIds = docsToDelete.map(d => d.id);

      if (docIds.length > 0) {
        const placeholders = docIds.map(() => '?').join(',');
        // Delete related ingestion_log records first
        db.prepare(`DELETE FROM ingestion_log WHERE document_id IN (${placeholders})`).run(...docIds);
      }

      // Delete all documents with specific status in a library
      const result = db.prepare('DELETE FROM knowledge_documents WHERE library_id = ? AND status = ?').run(libraryId, status);
      deletedCount = result.changes;
    } else if (status) {
      // Get document IDs to delete for ingestion_log and Qdrant cleanup
      const docsToDelete = db.prepare('SELECT id, library_id FROM knowledge_documents WHERE status = ?').all(status);
      docsForVectorCleanup = docsToDelete;
      const docIds = docsToDelete.map(d => d.id);

      if (docIds.length > 0) {
        const placeholders = docIds.map(() => '?').join(',');
        // Delete related ingestion_log records first
        db.prepare(`DELETE FROM ingestion_log WHERE document_id IN (${placeholders})`).run(...docIds);
      }

      // Delete all documents with specific status (across all libraries for this user)
      // Note: In production, add user_id check via library ownership
      const result = db.prepare('DELETE FROM knowledge_documents WHERE status = ?').run(status);
      deletedCount = result.changes;
    } else {
      return res.status(400).json({ error: 'Please provide documentIds array, or status with optional libraryId' });
    }

    // Clean up vectors from Qdrant for all deleted documents
    if (docsForVectorCleanup.length > 0) {
      try {
        const { getVectorStoreService } = require('../services/rag/index.cjs');
        const vectorStore = getVectorStoreService();

        // Group by library_id to batch Qdrant operations
        const byLibrary = {};
        for (const doc of docsForVectorCleanup) {
          if (!byLibrary[doc.library_id]) byLibrary[doc.library_id] = [];
          byLibrary[doc.library_id].push(doc.id);
        }

        for (const [libId, docIds] of Object.entries(byLibrary)) {
          const collectionName = vectorStore.getCollectionName(libId);
          for (const docId of docIds) {
            await vectorStore.deleteByFilter(collectionName, {
              must: [{ key: 'documentId', match: { value: docId } }]
            });
          }
          logger.info(`Deleted vectors for ${docIds.length} documents from ${collectionName}`);
        }
      } catch (vectorError) {
        logger.warn(`Failed to delete vectors during bulk delete: ${vectorError.message}`);
      }
    }

    logger.info(`Bulk deleted ${deletedCount} documents`);
    res.json({ message: 'Documents deleted', deletedCount });

  } catch (error) {
    logger.error(`Failed to bulk delete documents: ${error.message}`);
    res.status(500).json({ error: 'Failed to bulk delete documents' });
  }
});

// ============================================
// Ingestion
// ============================================

/**
 * POST /api/knowledge/libraries/:libraryId/ingest/upload
 * Upload file for ingestion
 */
router.post('/libraries/:libraryId/ingest/upload', upload.single('file'), async (req, res) => {
  try {
    const { libraryId } = req.params;
    const { folderId, options } = req.body;
    const userId = req.user?.id;

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const db = getDatabase();

    // Verify library exists and belongs to user
    const library = db.prepare('SELECT * FROM knowledge_libraries WHERE id = ? AND user_id = ?').get(libraryId, userId);
    if (!library) {
      // Clean up uploaded file
      fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: 'Library not found' });
    }

    const filePath = req.file.path;
    const fileName = req.file.originalname;
    const fileSize = req.file.size;
    const mimeType = req.file.mimetype;
    const ext = path.extname(fileName).toLowerCase();

    // Parse options if provided
    const ingestionOptions = options ? JSON.parse(options) : {};
    const chunkStrategy = ingestionOptions.chunkStrategy || 'paragraph';
    const chunkSize = ingestionOptions.chunkSize || 500;

    // Extract text content based on file type
    let extractedText = '';
    let docTitle = fileName;

    // Track if OCR was used
    let ocrUsed = false;
    let ocrPages = 0;

    try {
      if (ext === '.pdf') {
        const pdfParse = require('pdf-parse');
        const buffer = fs.readFileSync(filePath);
        const data = await pdfParse(buffer);
        extractedText = data.text;
        docTitle = data.info?.Title || fileName;

        // Check if PDF appears to be scanned (no text or very little)
        if (!extractedText || extractedText.trim().length < 50) {
          logger.info(`PDF "${fileName}" appears to be scanned - attempting OCR...`);

          try {
            const { pdfOcrService } = require('../services/vision/PdfOcrService.cjs');
            const ocrStatus = await pdfOcrService.getStatus();

            if (ocrStatus.available) {
              const ocrResult = await pdfOcrService.extractText(filePath, {
                languages: ingestionOptions.ocrLanguages || 'eng+msa+chi_sim',
                maxPages: ingestionOptions.maxOcrPages || 50
              });

              if (ocrResult.text && ocrResult.text.trim().length > 0) {
                extractedText = ocrResult.text;
                ocrUsed = true;
                ocrPages = ocrResult.pages;
                logger.info(`OCR extracted ${extractedText.length} chars from ${ocrPages} pages`);
              }
            } else {
              logger.warn('OCR not available - poppler or tesseract missing');
            }
          } catch (ocrError) {
            logger.warn(`OCR failed: ${ocrError.message}`);
            // Continue with whatever text we have
          }
        }
      } else if (['.xls', '.xlsx', '.xlsm'].includes(ext)) {
        const xlsx = require('xlsx');
        const workbook = xlsx.readFile(filePath);
        const allText = [];
        for (const sheetName of workbook.SheetNames) {
          const sheet = workbook.Sheets[sheetName];
          const csv = xlsx.utils.sheet_to_csv(sheet);
          allText.push(`[Sheet: ${sheetName}]\n${csv}`);
        }
        extractedText = allText.join('\n\n');
      } else if (['.doc', '.docx'].includes(ext)) {
        const mammoth = require('mammoth');
        const buffer = fs.readFileSync(filePath);
        const result = await mammoth.extractRawText({ buffer });
        extractedText = result.value;
      } else if (['.csv', '.tsv'].includes(ext)) {
        extractedText = fs.readFileSync(filePath, 'utf-8');
      } else {
        // Try as plain text (.txt, .md, .json, .html)
        try {
          extractedText = fs.readFileSync(filePath, 'utf-8');
        } catch {
          return res.status(400).json({ error: `Cannot read file as text: ${ext || mimeType}` });
        }
      }

      if (!extractedText || extractedText.trim().length === 0) {
        // Provide helpful error message for scanned PDFs
        if (ext === '.pdf') {
          const { pdfOcrService } = require('../services/vision/PdfOcrService.cjs');
          const ocrStatus = await pdfOcrService.getStatus();
          if (!ocrStatus.available) {
            return res.status(400).json({
              error: 'Could not extract text from PDF. This appears to be a scanned/image-based PDF.',
              hint: 'OCR is not available. Install poppler-utils and tesseract-ocr for scanned PDF support.',
              ocrStatus
            });
          }
        }
        return res.status(400).json({ error: 'Could not extract any text content from the document.' });
      }

      // Ingest into the RAG library
      const { getRetrievalService } = require('../services/rag/RetrievalService.cjs');
      const retrievalService = getRetrievalService();

      const result = await retrievalService.ingestDocument(
        {
          title: docTitle,
          content: extractedText,
          sourceType: 'file_upload',
          sourceUrl: null,
          folderId: folderId || null,
          metadata: {
            fileName,
            mimeType,
            fileSize,
            extractedAt: new Date().toISOString(),
            ocrUsed,
            ocrPages: ocrUsed ? ocrPages : undefined,
          },
        },
        libraryId,
        { userId, chunkStrategy, chunkSize }
      );

      logger.info(`File ${fileName} (${(fileSize / 1024 / 1024).toFixed(2)}MB) ingested into library ${libraryId}: ${result.chunksCreated} chunks`);

      res.status(201).json({
        success: true,
        documentId: result.documentId,
        chunksCreated: result.chunksCreated,
        title: docTitle,
        libraryId,
        libraryName: library.name,
        fileSize,
        status: 'completed',
        ocrUsed,
        ocrPages: ocrUsed ? ocrPages : undefined,
      });

    } finally {
      // Clean up uploaded file after processing
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

  } catch (error) {
    logger.error(`Failed to upload file: ${error.message}`);
    // Clean up file on error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: `Failed to upload file: ${error.message}` });
  }
});

/**
 * POST /api/knowledge/libraries/:libraryId/ingest/split-upload
 * Upload a large PDF and automatically split it into smaller documents
 *
 * Options:
 * - pagesPerSplit: Number of pages per split (default: 20)
 * - targetSizeMB: Target size per split in MB (default: 10)
 * - ocrLanguages: OCR languages for scanned PDFs (default: 'eng+msa+chi_sim')
 */
router.post('/libraries/:libraryId/ingest/split-upload', upload.single('file'), async (req, res) => {
  try {
    const { libraryId } = req.params;
    const { folderId, options } = req.body;
    const userId = req.user?.id;

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const ext = path.extname(req.file.originalname).toLowerCase();
    if (ext !== '.pdf') {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Split upload only supports PDF files' });
    }

    const db = getDatabase();

    // Verify library exists and belongs to user
    const library = db.prepare('SELECT * FROM knowledge_libraries WHERE id = ? AND user_id = ?').get(libraryId, userId);
    if (!library) {
      fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: 'Library not found' });
    }

    const filePath = req.file.path;
    const fileName = req.file.originalname;
    const fileSize = req.file.size;

    // Parse options
    const ingestionOptions = options ? JSON.parse(options) : {};
    const pagesPerSplit = ingestionOptions.pagesPerSplit || 20;
    const targetSizeMB = ingestionOptions.targetSizeMB || 10;
    const ocrLanguages = ingestionOptions.ocrLanguages || 'eng+msa+chi_sim';

    logger.info(`Split upload: ${fileName} (${(fileSize / 1024 / 1024).toFixed(2)}MB) - ${pagesPerSplit} pages/split or ${targetSizeMB}MB target`);

    try {
      const { pdfSplitterService } = require('../services/document/PdfSplitterService.cjs');

      // Get PDF info first
      const pdfInfo = await pdfSplitterService.getPdfInfo(filePath);

      // Split and ingest
      const result = await pdfSplitterService.splitAndIngest(filePath, libraryId, {
        userId,
        folderId: folderId || null,
        pagesPerSplit,
        targetSizeMB,
        ocrLanguages
      });

      logger.info(`Split upload complete: ${fileName} -> ${result.documents.length} documents`);

      res.status(201).json({
        success: true,
        splitUsed: result.splitUsed,
        splitId: result.splitId,
        originalFile: fileName,
        originalSize: fileSize,
        originalPages: pdfInfo.pageCount,
        totalParts: result.totalParts || 1,
        documents: result.documents.map(d => ({
          documentId: d.documentId,
          title: d.title,
          partNumber: d.partNumber,
          pageRange: d.pageRange,
          chunksCreated: d.chunksCreated
        })),
        libraryId,
        libraryName: library.name,
        status: 'completed'
      });

    } finally {
      // Clean up uploaded file
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

  } catch (error) {
    logger.error(`Failed to split upload: ${error.message}`);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: `Failed to process file: ${error.message}` });
  }
});

/**
 * GET /api/knowledge/pdf/info
 * Get PDF info (page count, size) before deciding to split
 */
router.post('/pdf/info', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const ext = path.extname(req.file.originalname).toLowerCase();
    if (ext !== '.pdf') {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Only PDF files supported' });
    }

    try {
      const { pdfSplitterService, DEFAULT_PAGES_PER_SPLIT, DEFAULT_TARGET_SIZE_MB } = require('../services/document/PdfSplitterService.cjs');

      const pdfInfo = await pdfSplitterService.getPdfInfo(req.file.path);

      // Calculate recommended splits
      const byPages = Math.ceil(pdfInfo.pageCount / DEFAULT_PAGES_PER_SPLIT);
      const bySize = Math.ceil(pdfInfo.fileSizeMB / DEFAULT_TARGET_SIZE_MB);

      res.json({
        fileName: req.file.originalname,
        pageCount: pdfInfo.pageCount,
        fileSize: pdfInfo.fileSize,
        fileSizeMB: Math.round(pdfInfo.fileSizeMB * 100) / 100,
        avgPageSizeMB: Math.round(pdfInfo.avgPageSizeMB * 1000) / 1000,
        recommendations: {
          splitRecommended: pdfInfo.fileSizeMB > 10 || pdfInfo.pageCount > 30,
          estimatedParts: Math.max(byPages, bySize),
          byPageCount: byPages,
          byFileSize: bySize,
          defaultPagesPerSplit: DEFAULT_PAGES_PER_SPLIT,
          defaultTargetSizeMB: DEFAULT_TARGET_SIZE_MB
        }
      });

    } finally {
      // Clean up
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
    }

  } catch (error) {
    logger.error(`Failed to get PDF info: ${error.message}`);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/knowledge/libraries/:libraryId/ingest/from-message
 * Ingest a document from a chat message into a RAG library.
 * Reads the cached media file, extracts text, and stores in the library.
 */
router.post('/libraries/:libraryId/ingest/from-message', async (req, res) => {
  try {
    const { libraryId } = req.params;
    const { messageId, folderId } = req.body;
    const userId = req.user?.id;

    if (!messageId) {
      return res.status(400).json({ error: 'messageId is required' });
    }

    const db = getDatabase();

    // Verify library exists and belongs to user
    const library = db.prepare('SELECT * FROM knowledge_libraries WHERE id = ? AND user_id = ?').get(libraryId, userId);
    if (!library) {
      return res.status(404).json({ error: 'Library not found' });
    }

    // Get message with media info
    const message = db.prepare(`
      SELECT m.*, mc.local_path, mc.mime_type as cached_mime_type
      FROM messages m
      LEFT JOIN media_cache mc ON mc.message_id = m.id
      WHERE m.id = ?
    `).get(messageId);

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Get the file path
    const filePath = message.local_path;
    if (!filePath) {
      return res.status(400).json({ error: 'No cached file found for this message. The media may have expired.' });
    }

    const fs = require('fs');
    if (!fs.existsSync(filePath)) {
      return res.status(400).json({ error: 'Cached file no longer exists on disk.' });
    }

    // Determine file type from MIME type or extension
    const mimeType = message.cached_mime_type || message.media_mime_type || '';
    const metadata = message.metadata ? JSON.parse(message.metadata) : {};
    const fileName = metadata.fileName || 'document';
    const ext = require('path').extname(fileName).toLowerCase() ||
      (mimeType.includes('pdf') ? '.pdf' :
       mimeType.includes('excel') || mimeType.includes('spreadsheet') ? '.xlsx' :
       mimeType.includes('word') || mimeType.includes('document') ? '.docx' :
       mimeType.includes('csv') ? '.csv' :
       mimeType.includes('text') ? '.txt' : '');

    // Extract text content based on file type
    let extractedText = '';
    let docTitle = fileName;

    if (ext === '.pdf') {
      const pdfParse = require('pdf-parse');
      const buffer = fs.readFileSync(filePath);
      const data = await pdfParse(buffer);
      extractedText = data.text;
      docTitle = data.info?.Title || fileName;
    } else if (['.xls', '.xlsx', '.xlsm'].includes(ext)) {
      const xlsx = require('xlsx');
      const workbook = xlsx.readFile(filePath);
      const allText = [];
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const csv = xlsx.utils.sheet_to_csv(sheet);
        allText.push(`[Sheet: ${sheetName}]\n${csv}`);
      }
      extractedText = allText.join('\n\n');
    } else if (['.doc', '.docx'].includes(ext)) {
      const mammoth = require('mammoth');
      const buffer = fs.readFileSync(filePath);
      const result = await mammoth.extractRawText({ buffer });
      extractedText = result.value;
    } else if (['.csv', '.tsv'].includes(ext)) {
      extractedText = fs.readFileSync(filePath, 'utf-8');
    } else {
      // Try as plain text
      try {
        extractedText = fs.readFileSync(filePath, 'utf-8');
      } catch {
        return res.status(400).json({ error: `Unsupported file type: ${ext || mimeType}` });
      }
    }

    if (!extractedText || extractedText.trim().length === 0) {
      return res.status(400).json({ error: 'Could not extract any text content from the document.' });
    }

    // Ingest into the RAG library
    const { getRetrievalService } = require('../services/rag/RetrievalService.cjs');
    const retrievalService = getRetrievalService();

    const result = await retrievalService.ingestDocument(
      {
        title: docTitle,
        content: extractedText,
        sourceType: 'message_document',
        sourceUrl: null,
        folderId: folderId || null,
        metadata: {
          messageId,
          fileName,
          mimeType,
          extractedAt: new Date().toISOString(),
          originalSize: fs.statSync(filePath).size,
        },
      },
      libraryId,
      { userId, chunkStrategy: 'paragraph', chunkSize: 500 }
    );

    logger.info(`Document from message ${messageId} ingested into library ${libraryId}: ${result.chunksCreated} chunks`);

    res.json({
      success: true,
      documentId: result.documentId,
      chunksCreated: result.chunksCreated,
      title: docTitle,
      libraryId,
      libraryName: library.name,
    });

  } catch (error) {
    logger.error(`Failed to ingest document from message: ${error.message}`);
    res.status(500).json({ error: `Failed to ingest document: ${error.message}` });
  }
});

/**
 * POST /api/knowledge/libraries/:libraryId/ingest/web
 * Ingest web content
 */
router.post('/libraries/:libraryId/ingest/web', async (req, res) => {
  try {
    const { url, folderId } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    const db = getDatabase();
    const documentId = uuidv4();

    db.prepare(`
      INSERT INTO knowledge_documents (id, library_id, folder_id, title, source_type, source_url, status)
      VALUES (?, ?, ?, ?, 'web', ?, 'processing')
    `).run(documentId, req.params.libraryId, folderId || null, url, url);

    // TODO: Implement actual web scraping and embedding
    setTimeout(() => {
      db.prepare("UPDATE knowledge_documents SET status = 'completed' WHERE id = ?").run(documentId);
    }, 2000);

    res.status(201).json({ documentId, status: 'processing' });

  } catch (error) {
    logger.error(`Failed to ingest web content: ${error.message}`);
    res.status(500).json({ error: 'Failed to ingest web content' });
  }
});

/**
 * POST /api/knowledge/libraries/:libraryId/ingest/github
 * Ingest GitHub repository
 */
router.post('/libraries/:libraryId/ingest/github', async (req, res) => {
  try {
    const { repoUrl, branch, folderId } = req.body;

    if (!repoUrl) {
      return res.status(400).json({ error: 'Repository URL is required' });
    }

    const db = getDatabase();
    const documentId = uuidv4();

    db.prepare(`
      INSERT INTO knowledge_documents (id, library_id, folder_id, title, source_type, source_url, status, metadata)
      VALUES (?, ?, ?, ?, 'github', ?, 'processing', ?)
    `).run(documentId, req.params.libraryId, folderId || null, repoUrl, repoUrl, JSON.stringify({ branch: branch || 'main' }));

    res.status(201).json({ documentId, status: 'processing' });

  } catch (error) {
    logger.error(`Failed to ingest GitHub repo: ${error.message}`);
    res.status(500).json({ error: 'Failed to ingest GitHub repo' });
  }
});

/**
 * POST /api/knowledge/libraries/:libraryId/ingest/manual
 * Ingest manual content
 */
router.post('/libraries/:libraryId/ingest/manual', async (req, res) => {
  try {
    const { title, content, type, folderId, chunkStrategy = 'paragraph' } = req.body;

    if (!title || !content) {
      return res.status(400).json({ error: 'Title and content are required' });
    }

    const documentId = uuidv4();

    // Use the retrieval service to ingest with embeddings
    const { getRetrievalService } = require('../services/rag/index.cjs');
    const retrieval = getRetrievalService();

    try {
      const result = await retrieval.ingestDocument(
        {
          id: documentId,
          title,
          content,
          sourceType: type || 'text',
          folderId: folderId || null,
        },
        req.params.libraryId,
        {
          userId: req.user.id,
          chunkStrategy,
        }
      );

      const db = getDatabase();
      const document = db.prepare('SELECT * FROM knowledge_documents WHERE id = ?').get(documentId);

      res.status(201).json({
        document: {
          ...document,
          metadata: document.metadata ? JSON.parse(document.metadata) : {},
        },
        chunksCreated: result.chunksCreated,
      });
    } catch (ingestError) {
      // If embedding fails, still save the document without vectors
      logger.warn(`Embedding failed, saving document without vectors: ${ingestError.message}`);

      const db = getDatabase();
      db.prepare(`
        INSERT INTO knowledge_documents (id, library_id, folder_id, title, content, source_type, status, metadata)
        VALUES (?, ?, ?, ?, ?, ?, 'completed', ?)
      `).run(
        documentId,
        req.params.libraryId,
        folderId || null,
        title,
        content,
        type || 'text',
        JSON.stringify({ embeddingError: ingestError.message })
      );

      const document = db.prepare('SELECT * FROM knowledge_documents WHERE id = ?').get(documentId);

      res.status(201).json({
        document: {
          ...document,
          metadata: document.metadata ? JSON.parse(document.metadata) : {},
        },
        warning: 'Document saved without vector embeddings',
      });
    }

  } catch (error) {
    logger.error(`Failed to ingest manual content: ${error.message}`);
    res.status(500).json({ error: 'Failed to ingest manual content' });
  }
});

/**
 * GET /api/knowledge/ingestion/:documentId/progress
 * Get ingestion progress
 */
router.get('/ingestion/:documentId/progress', (req, res) => {
  try {
    const db = getDatabase();

    const document = db.prepare('SELECT id, status, progress FROM knowledge_documents WHERE id = ?')
      .get(req.params.documentId);

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    res.json({
      documentId: document.id,
      status: document.status,
      progress: document.progress || 0
    });

  } catch (error) {
    logger.error(`Failed to get progress: ${error.message}`);
    res.status(500).json({ error: 'Failed to get progress' });
  }
});

// ============================================
// RAG Query
// ============================================

/**
 * POST /api/knowledge/query
 * Execute RAG query
 */
router.post('/query', async (req, res) => {
  try {
    const { query, libraryIds, limit, topK, minScore = 0.3 } = req.body;
    const resultLimit = topK || limit || 10;

    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    // Get user's libraries if none specified
    const db = getDatabase();
    let targetLibraryIds = libraryIds;

    if (!targetLibraryIds || targetLibraryIds.length === 0) {
      const userLibraries = db.prepare(`
        SELECT id FROM knowledge_libraries WHERE user_id = ?
      `).all(req.user.id);
      targetLibraryIds = userLibraries.map(l => l.id);
    }

    if (targetLibraryIds.length === 0) {
      return res.json({
        results: [],
        query,
        totalFound: 0,
        searchTimeMs: 0,
        message: 'No knowledge libraries found'
      });
    }

    // Check if libraries have any completed documents
    const libraryStats = db.prepare(`
      SELECT
        kl.id,
        kl.name,
        COUNT(kd.id) as doc_count,
        SUM(CASE WHEN kd.status = 'completed' THEN 1 ELSE 0 END) as completed_count
      FROM knowledge_libraries kl
      LEFT JOIN knowledge_documents kd ON kd.library_id = kl.id
      WHERE kl.id IN (${targetLibraryIds.map(() => '?').join(',')})
      GROUP BY kl.id
    `).all(...targetLibraryIds);

    const emptyLibraries = libraryStats.filter(s => s.completed_count === 0);
    const indexedLibraries = libraryStats.filter(s => s.completed_count > 0);

    if (indexedLibraries.length === 0) {
      return res.json({
        results: [],
        query,
        totalFound: 0,
        searchTimeMs: 0,
        searchedLibraries: targetLibraryIds.length,
        message: 'No indexed documents found. Please upload and ingest documents into your libraries first.',
        libraryStatus: libraryStats.map(s => ({
          id: s.id,
          name: s.name,
          documentCount: s.doc_count,
          indexedCount: s.completed_count,
        })),
      });
    }

    // Execute RAG query only on libraries with indexed documents
    const { getRetrievalService } = require('../services/rag/index.cjs');
    const retrieval = getRetrievalService();

    const startTime = Date.now();
    const result = await retrieval.retrieve(query, {
      libraryIds: indexedLibraries.map(l => l.id),
      topK: parseInt(resultLimit),
      minScore: parseFloat(minScore),
      userId: req.user.id,
    });
    const searchTimeMs = Date.now() - startTime;

    res.json({
      results: result.chunks,
      query: result.query,
      totalFound: result.totalResults,
      searchTimeMs,
      searchedLibraries: indexedLibraries.length,
      skippedLibraries: emptyLibraries.length > 0 ? emptyLibraries.map(l => ({
        id: l.id,
        name: l.name,
        reason: l.doc_count === 0 ? 'no_documents' : 'no_completed_ingestion',
      })) : undefined,
    });

  } catch (error) {
    logger.error(`Failed to execute query: ${error.message}`);
    res.status(500).json({ error: 'Failed to execute query' });
  }
});

/**
 * POST /api/knowledge/context
 * Generate context from RAG
 */
router.post('/context', async (req, res) => {
  try {
    const { query, libraryIds, maxTokens = 2000, topK = 5 } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    // Get user's libraries if none specified
    const db = getDatabase();
    let targetLibraryIds = libraryIds;

    if (!targetLibraryIds || targetLibraryIds.length === 0) {
      const userLibraries = db.prepare(`
        SELECT id FROM knowledge_libraries WHERE user_id = ?
      `).all(req.user.id);
      targetLibraryIds = userLibraries.map(l => l.id);
    }

    if (targetLibraryIds.length === 0) {
      return res.json({
        context: '',
        sources: [],
        tokenCount: 0,
        message: 'No knowledge libraries found'
      });
    }

    // Execute RAG retrieval
    const { getRetrievalService } = require('../services/rag/index.cjs');
    const retrieval = getRetrievalService();

    const result = await retrieval.retrieve(query, {
      libraryIds: targetLibraryIds,
      topK: parseInt(topK),
      minScore: 0.6,
      userId: req.user.id,
    });

    // Generate context string
    const context = retrieval.generateContext(result.chunks, { maxTokens });

    // Estimate token count (rough: 4 chars per token)
    const tokenCount = Math.ceil(context.length / 4);

    // Extract sources
    const sources = result.chunks.map(c => ({
      documentId: c.documentId,
      libraryId: c.libraryId,
      score: c.score,
      preview: c.content.substring(0, 100) + '...',
    }));

    res.json({
      context,
      sources,
      tokenCount,
      chunksUsed: result.chunks.length,
    });

  } catch (error) {
    logger.error(`Failed to generate context: ${error.message}`);
    res.status(500).json({ error: 'Failed to generate context' });
  }
});

/**
 * GET /api/knowledge/statistics
 * Get knowledge base statistics
 */
router.get('/statistics', (req, res) => {
  try {
    const db = getDatabase();

    // Get basic counts
    const basicStats = db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM knowledge_libraries WHERE user_id = ?) as totalLibraries,
        (SELECT COUNT(*) FROM knowledge_documents d
         JOIN knowledge_libraries l ON d.library_id = l.id
         WHERE l.user_id = ?) as totalDocuments,
        (SELECT COALESCE(SUM(d.chunk_count), 0) FROM knowledge_documents d
         JOIN knowledge_libraries l ON d.library_id = l.id
         WHERE l.user_id = ?) as totalChunks,
        (SELECT COALESCE(SUM(LENGTH(d.content)), 0) FROM knowledge_documents d
         JOIN knowledge_libraries l ON d.library_id = l.id
         WHERE l.user_id = ?) as totalSize
    `).get(req.user.id, req.user.id, req.user.id, req.user.id);

    // Get per-library stats
    const libraryStats = db.prepare(`
      SELECT
        l.id as libraryId,
        l.name as libraryName,
        COUNT(d.id) as documentCount,
        COALESCE(SUM(d.chunk_count), 0) as chunkCount
      FROM knowledge_libraries l
      LEFT JOIN knowledge_documents d ON d.library_id = l.id
      WHERE l.user_id = ?
      GROUP BY l.id, l.name
      ORDER BY l.name
    `).all(req.user.id);

    // TODO: Track query statistics in a separate table
    // For now, return placeholder values
    const statistics = {
      totalLibraries: basicStats.totalLibraries || 0,
      totalDocuments: basicStats.totalDocuments || 0,
      totalChunks: basicStats.totalChunks || 0,
      totalSize: basicStats.totalSize || 0,
      queriesExecuted: 0, // TODO: Implement query tracking
      averageQueryTime: 0, // TODO: Implement query tracking
      libraryStats: libraryStats || [],
    };

    res.json(statistics);

  } catch (error) {
    logger.error(`Failed to get statistics: ${error.message}`);
    res.status(500).json({ error: 'Failed to get statistics' });
  }
});

// ============================================
// Audit Routes (Auto-Ingest Verification)
// ============================================

/**
 * GET /api/knowledge/audit/ingestion-history
 * Get auto-ingestion history with document details
 */
router.get('/audit/ingestion-history', (req, res) => {
  try {
    const db = getDatabase();
    const { limit = 100, offset = 0, libraryId } = req.query;

    let whereClause = 'il.user_id = ?';
    const params = [req.user.id];

    if (libraryId) {
      whereClause += ' AND il.library_id = ?';
      params.push(libraryId);
    }

    const history = db.prepare(`
      SELECT
        il.*,
        kl.name as library_name,
        kl.match_keywords as library_keywords,
        kd.title as document_title,
        kd.source_type as document_source_type,
        kd.status as document_status,
        kd.content as document_content,
        kd.created_at as document_created_at
      FROM ingestion_log il
      LEFT JOIN knowledge_libraries kl ON il.library_id = kl.id
      LEFT JOIN knowledge_documents kd ON il.document_id = kd.id
      WHERE ${whereClause}
      ORDER BY il.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, parseInt(limit), parseInt(offset));

    const total = db.prepare(`
      SELECT COUNT(*) as count FROM ingestion_log il WHERE ${whereClause}
    `).get(...params);

    res.json({
      history: history.map(h => ({
        id: h.id,
        documentId: h.document_id,
        libraryId: h.library_id,
        libraryName: h.library_name,
        libraryKeywords: h.library_keywords ? JSON.parse(h.library_keywords) : [],
        documentTitle: h.document_title || 'Untitled',
        documentSourceType: h.document_source_type,
        documentStatus: h.document_status,
        documentPreview: h.document_content ? h.document_content.substring(0, 200) + '...' : null,
        source: h.source,
        sourceName: h.source_name,
        reliabilityScore: h.reliability_score,
        matchScore: h.match_score,
        createdAt: h.created_at,
        documentCreatedAt: h.document_created_at,
      })),
      total: total?.count || 0,
      limit: parseInt(limit),
      offset: parseInt(offset),
    });

  } catch (error) {
    logger.error(`Failed to get ingestion history: ${error.message}`);
    res.status(500).json({ error: 'Failed to get ingestion history' });
  }
});

// Minimum match threshold - below this, document is considered "uncategorized"
// Increased from 10% to 20% to prevent false matches with generic keywords
const MINIMUM_MATCH_THRESHOLD = 0.2; // 20% minimum match required
const UNCATEGORIZED_LIBRARY_NAME = 'Uncategorized';

/**
 * Helper: Get or create the "Uncategorized" library for a user
 */
function getOrCreateUncategorizedLibrary(db, userId) {
  // Check if Uncategorized library exists
  let uncategorized = db.prepare(`
    SELECT id, name, description FROM knowledge_libraries
    WHERE user_id = ? AND name = ?
  `).get(userId, UNCATEGORIZED_LIBRARY_NAME);

  if (!uncategorized) {
    // Create the Uncategorized library
    const id = `lib_uncategorized_${userId}_${Date.now()}`;
    db.prepare(`
      INSERT INTO knowledge_libraries (id, user_id, name, description, match_keywords, auto_ingest, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(
      id,
      userId,
      UNCATEGORIZED_LIBRARY_NAME,
      'Documents that do not match any library keywords. Review and organize these periodically.',
      '[]', // No keywords - this is a catch-all
      0     // Auto-ingest disabled
    );

    uncategorized = { id, name: UNCATEGORIZED_LIBRARY_NAME, description: 'Documents that do not match any library keywords.' };
    logger.info(`Created Uncategorized library for user ${userId}: ${id}`);
  }

  return uncategorized;
}

/**
 * POST /api/knowledge/audit/recheck/:documentId
 * Re-check a document against all libraries using the SAME algorithm as auto-ingest
 * This ensures consistency between ingestion and audit scoring
 */
router.post('/audit/recheck/:documentId', async (req, res) => {
  try {
    const db = getDatabase();
    const { documentId } = req.params;
    const libraryMatcher = getLibraryMatcher();

    // Get document content
    const document = db.prepare(`
      SELECT kd.*, kl.user_id
      FROM knowledge_documents kd
      JOIN knowledge_libraries kl ON kd.library_id = kl.id
      WHERE kd.id = ? AND kl.user_id = ?
    `).get(documentId, req.user.id);

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const content = document.content || document.title || '';
    const contentLower = content.toLowerCase();

    // Get all user libraries (including those without auto_ingest for comparison)
    const libraries = db.prepare(`
      SELECT id, name, description, match_keywords, auto_ingest
      FROM knowledge_libraries
      WHERE user_id = ? AND name != ?
      ORDER BY name
    `).all(req.user.id, UNCATEGORIZED_LIBRARY_NAME);

    // Also get current library info
    const currentLibraryData = db.prepare(`
      SELECT id, name, description, match_keywords, auto_ingest
      FROM knowledge_libraries
      WHERE id = ?
    `).get(document.library_id);

    // Use LibraryMatcher for semantic scoring (same algorithm as auto-ingest)
    // This ensures consistency between ingestion and audit
    const matchResult = await libraryMatcher.matchLibrary(content, req.user.id, {
      minScore: 0, // Don't filter - we want all scores for display
      skipKeywordFilter: true, // Get all libraries, not just keyword matches
      forceEmbeddingMatch: true, // Always use embeddings
    });

    // Helper to calculate keyword breakdown for UI display
    const calculateKeywordBreakdown = (lib) => {
      const keywords = lib.match_keywords ? JSON.parse(lib.match_keywords) : [];
      let matchedKeywords = [];
      let keywordScore = 0;
      let nameScore = 0;
      let descScore = 0;

      if (keywords.length > 0) {
        matchedKeywords = keywords.filter(kw => contentLower.includes(kw.toLowerCase()));
        keywordScore = matchedKeywords.length / keywords.length;
      }

      if (lib.name) {
        const nameLower = lib.name.toLowerCase();
        const nameWords = nameLower.split(/\s+/).filter(w => w.length > 2);
        if (contentLower.includes(nameLower)) {
          nameScore = 1.0;
        } else if (nameWords.length > 0) {
          const matchedNameWords = nameWords.filter(w => contentLower.includes(w));
          nameScore = matchedNameWords.length / nameWords.length;
        }
      }

      if (lib.description) {
        const descLower = lib.description.toLowerCase();
        const commonWords = ['the', 'and', 'for', 'with', 'this', 'that', 'from', 'have', 'are', 'was', 'were', 'been', 'being'];
        const descWords = descLower.split(/\s+/).filter(w => w.length > 3 && !commonWords.includes(w));
        if (descWords.length > 0) {
          const matchedDescWords = descWords.filter(w => contentLower.includes(w));
          descScore = matchedDescWords.length / descWords.length;
        }
      }

      return { keywordScore, nameScore, descScore, matchedKeywords };
    };

    // Build library matches with both semantic and keyword scores
    const libraryMatches = [];

    // Add matched library from LibraryMatcher result
    if (matchResult.matched && matchResult.library) {
      const lib = libraries.find(l => l.id === matchResult.library.id);
      if (lib) {
        const breakdown = calculateKeywordBreakdown(lib);
        libraryMatches.push({
          libraryId: lib.id,
          libraryName: lib.name,
          description: lib.description,
          autoIngestEnabled: lib.auto_ingest === 1,
          keywords: lib.match_keywords ? JSON.parse(lib.match_keywords) : [],
          matchedKeywords: matchResult.matchedKeywords || breakdown.matchedKeywords,
          matchScore: matchResult.score, // Use LibraryMatcher's semantic score
          keywordScore: breakdown.keywordScore,
          nameScore: breakdown.nameScore,
          descScore: breakdown.descScore,
          isCurrentLibrary: lib.id === document.library_id,
          matchType: 'semantic', // Indicate this is semantic matching
        });
      }
    }

    // Add alternates from LibraryMatcher
    if (matchResult.alternates) {
      for (const alt of matchResult.alternates) {
        const lib = libraries.find(l => l.id === alt.id);
        if (lib && !libraryMatches.some(m => m.libraryId === lib.id)) {
          const breakdown = calculateKeywordBreakdown(lib);
          libraryMatches.push({
            libraryId: lib.id,
            libraryName: lib.name,
            description: lib.description,
            autoIngestEnabled: lib.auto_ingest === 1,
            keywords: lib.match_keywords ? JSON.parse(lib.match_keywords) : [],
            matchedKeywords: breakdown.matchedKeywords,
            matchScore: alt.score,
            keywordScore: breakdown.keywordScore,
            nameScore: breakdown.nameScore,
            descScore: breakdown.descScore,
            isCurrentLibrary: lib.id === document.library_id,
            matchType: 'semantic',
          });
        }
      }
    }

    // Add remaining libraries that weren't in the match result
    for (const lib of libraries) {
      if (!libraryMatches.some(m => m.libraryId === lib.id)) {
        const breakdown = calculateKeywordBreakdown(lib);
        // Calculate simple keyword-weighted score for unmatched libraries
        const simpleScore = (breakdown.keywordScore * 0.75) + (breakdown.nameScore * 0.10) + (breakdown.descScore * 0.15);
        libraryMatches.push({
          libraryId: lib.id,
          libraryName: lib.name,
          description: lib.description,
          autoIngestEnabled: lib.auto_ingest === 1,
          keywords: lib.match_keywords ? JSON.parse(lib.match_keywords) : [],
          matchedKeywords: breakdown.matchedKeywords,
          matchScore: simpleScore,
          keywordScore: breakdown.keywordScore,
          nameScore: breakdown.nameScore,
          descScore: breakdown.descScore,
          isCurrentLibrary: lib.id === document.library_id,
          matchType: 'keyword_only', // Indicate fallback scoring
        });
      }
    }

    // Add current library if not already included
    if (currentLibraryData && !libraryMatches.some(l => l.libraryId === currentLibraryData.id)) {
      const breakdown = calculateKeywordBreakdown(currentLibraryData);
      const simpleScore = (breakdown.keywordScore * 0.75) + (breakdown.nameScore * 0.10) + (breakdown.descScore * 0.15);
      libraryMatches.push({
        libraryId: currentLibraryData.id,
        libraryName: currentLibraryData.name,
        description: currentLibraryData.description,
        autoIngestEnabled: currentLibraryData.auto_ingest === 1,
        keywords: currentLibraryData.match_keywords ? JSON.parse(currentLibraryData.match_keywords) : [],
        matchedKeywords: breakdown.matchedKeywords,
        matchScore: simpleScore,
        keywordScore: breakdown.keywordScore,
        nameScore: breakdown.nameScore,
        descScore: breakdown.descScore,
        isCurrentLibrary: true,
        matchType: 'keyword_only',
      });
    }

    // Sort by match score (descending)
    libraryMatches.sort((a, b) => b.matchScore - a.matchScore);

    // Get current library info
    const currentLibrary = libraryMatches.find(l => l.isCurrentLibrary);

    // Find best match
    const bestMatch = libraryMatches[0];

    // Check if best match is above threshold (use LibraryMatcher's threshold)
    const semanticThreshold = libraryMatcher.config.minScore || 0.75;
    const bestMatchAboveThreshold = bestMatch && bestMatch.matchScore >= MINIMUM_MATCH_THRESHOLD;

    // Determine if mismatched (better library exists with significant score difference)
    const scoreDifference = bestMatch ? bestMatch.matchScore - (currentLibrary?.matchScore || 0) : 0;
    const isMismatched = bestMatchAboveThreshold &&
                         !bestMatch.isCurrentLibrary &&
                         scoreDifference > 0.1; // Require 10% score difference to suggest move

    // Check if NO library matches well
    const noMatch = !bestMatchAboveThreshold || bestMatch.matchScore === 0;

    // Get or create Uncategorized library if needed
    let uncategorizedLibrary = null;
    if (noMatch) {
      uncategorizedLibrary = getOrCreateUncategorizedLibrary(db, req.user.id);
    }

    // Check if document is already in Uncategorized
    const isInUncategorized = currentLibrary?.libraryName === UNCATEGORIZED_LIBRARY_NAME;

    // Generate appropriate suggestion
    let suggestion = null;
    if (noMatch && !isInUncategorized) {
      suggestion = `No library matches this document well (best: ${Math.round((bestMatch?.matchScore || 0) * 100)}%). Consider moving to "${UNCATEGORIZED_LIBRARY_NAME}" for later review.`;
    } else if (isMismatched) {
      suggestion = `Consider moving to "${bestMatch.libraryName}" (${Math.round(bestMatch.matchScore * 100)}% match vs current ${Math.round((currentLibrary?.matchScore || 0) * 100)}%)`;
    } else if (isInUncategorized && bestMatchAboveThreshold) {
      suggestion = `A matching library found: "${bestMatch.libraryName}" (${Math.round(bestMatch.matchScore * 100)}% match). Consider moving from Uncategorized.`;
    }

    res.json({
      document: {
        id: document.id,
        title: document.title || 'Untitled',
        contentPreview: content.substring(0, 300) + '...',
        currentLibraryId: document.library_id,
      },
      currentLibrary: currentLibrary || null,
      bestMatch: bestMatch || null,
      isMismatched,
      noMatch,
      uncategorizedLibrary,
      minimumThreshold: MINIMUM_MATCH_THRESHOLD,
      semanticThreshold, // Include the semantic threshold for reference
      suggestion,
      allMatches: libraryMatches,
      matchingAlgorithm: 'semantic+keywords', // Indicate which algorithm was used
    });

  } catch (error) {
    logger.error(`Failed to recheck document: ${error.message}`);
    res.status(500).json({ error: 'Failed to recheck document' });
  }
});

/**
 * POST /api/knowledge/audit/move
 * Move a document to a different library
 */
router.post('/audit/move', (req, res) => {
  try {
    const db = getDatabase();
    const { documentId, targetLibraryId } = req.body;

    if (!documentId || !targetLibraryId) {
      return res.status(400).json({ error: 'documentId and targetLibraryId are required' });
    }

    // Verify document ownership
    const document = db.prepare(`
      SELECT kd.*, kl.user_id
      FROM knowledge_documents kd
      JOIN knowledge_libraries kl ON kd.library_id = kl.id
      WHERE kd.id = ? AND kl.user_id = ?
    `).get(documentId, req.user.id);

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Verify target library ownership
    const targetLibrary = db.prepare(`
      SELECT * FROM knowledge_libraries WHERE id = ? AND user_id = ?
    `).get(targetLibraryId, req.user.id);

    if (!targetLibrary) {
      return res.status(404).json({ error: 'Target library not found' });
    }

    // Move document
    db.prepare(`
      UPDATE knowledge_documents SET library_id = ?, folder_id = NULL WHERE id = ?
    `).run(targetLibraryId, documentId);

    // Update ingestion log
    db.prepare(`
      UPDATE ingestion_log SET library_id = ? WHERE document_id = ?
    `).run(targetLibraryId, documentId);

    logger.info(`Moved document ${documentId} from ${document.library_id} to ${targetLibraryId}`);

    res.json({
      message: 'Document moved successfully',
      document: {
        id: documentId,
        previousLibraryId: document.library_id,
        newLibraryId: targetLibraryId,
        newLibraryName: targetLibrary.name,
      },
    });

  } catch (error) {
    logger.error(`Failed to move document: ${error.message}`);
    res.status(500).json({ error: 'Failed to move document' });
  }
});

/**
 * POST /api/knowledge/audit/bulk-recheck
 * Re-check all auto-ingested documents for a library
 * Uses weighted scoring consistent with individual document recheck
 * Flags documents where:
 * 1. Original ingestion score was below threshold (weak match)
 * 2. Another library has significantly better keyword match
 */
router.post('/audit/bulk-recheck', async (req, res) => {
  try {
    const db = getDatabase();
    const { libraryId } = req.body;

    // Get all documents in the library that were auto-ingested
    let whereClause = 'kl.user_id = ?';
    const params = [req.user.id];

    if (libraryId) {
      whereClause += ' AND il.library_id = ?';
      params.push(libraryId);
    }

    const autoIngestedDocs = db.prepare(`
      SELECT DISTINCT
        kd.id,
        kd.title,
        kd.content,
        kd.library_id,
        il.match_score as original_match_score,
        kl.name as library_name
      FROM ingestion_log il
      JOIN knowledge_documents kd ON il.document_id = kd.id
      JOIN knowledge_libraries kl ON kd.library_id = kl.id
      WHERE ${whereClause}
    `).all(...params);

    // Get all user libraries
    const libraries = db.prepare(`
      SELECT id, name, description, match_keywords, auto_ingest
      FROM knowledge_libraries
      WHERE user_id = ?
    `).all(req.user.id);

    const results = {
      total: autoIngestedDocs.length,
      correct: 0,
      mismatched: 0,
      weakMatch: 0, // Documents with low original match scores
      suggestions: [],
    };

    // Helper to calculate weighted keyword score (same as individual recheck)
    const calculateWeightedScore = (content, lib) => {
      const contentLower = content.toLowerCase();
      const keywords = lib.match_keywords ? JSON.parse(lib.match_keywords) : [];
      let keywordScore = 0;
      let nameScore = 0;
      let descScore = 0;
      let matchedKeywords = [];

      if (keywords.length > 0) {
        matchedKeywords = keywords.filter(kw => contentLower.includes(kw.toLowerCase()));
        keywordScore = matchedKeywords.length / keywords.length;
      }

      if (lib.name) {
        const nameLower = lib.name.toLowerCase();
        const nameWords = nameLower.split(/\s+/).filter(w => w.length > 2);
        if (contentLower.includes(nameLower)) {
          nameScore = 1.0;
        } else if (nameWords.length > 0) {
          const matchedNameWords = nameWords.filter(w => contentLower.includes(w));
          nameScore = matchedNameWords.length / nameWords.length;
        }
      }

      if (lib.description) {
        const descLower = lib.description.toLowerCase();
        const commonWords = ['the', 'and', 'for', 'with', 'this', 'that', 'from', 'have', 'are', 'was', 'were', 'been', 'being'];
        const descWords = descLower.split(/\s+/).filter(w => w.length > 3 && !commonWords.includes(w));
        if (descWords.length > 0) {
          const matchedDescWords = descWords.filter(w => contentLower.includes(w));
          descScore = matchedDescWords.length / descWords.length;
        }
      }

      return {
        score: (keywordScore * 0.75) + (nameScore * 0.10) + (descScore * 0.15),
        keywordScore,
        matchedKeywords,
      };
    };

    for (const doc of autoIngestedDocs) {
      const content = doc.content || doc.title || '';

      // Check if original ingestion score was weak (below semantic threshold)
      // Original score is from LibraryMatcher (semantic + keywords)
      const originalScoreWeak = doc.original_match_score < 0.60; // NewsletterIngestion minLibraryMatchScore

      // Calculate weighted scores for all libraries (for comparison)
      let bestMatch = null;
      let bestScore = 0;
      let currentScore = 0;
      let currentMatchedKeywords = [];

      for (const lib of libraries) {
        const result = calculateWeightedScore(content, lib);

        if (lib.id === doc.library_id) {
          currentScore = result.score;
          currentMatchedKeywords = result.matchedKeywords;
        }

        if (result.score > bestScore) {
          bestScore = result.score;
          bestMatch = {
            libraryId: lib.id,
            libraryName: lib.name,
            score: result.score,
            matchedKeywords: result.matchedKeywords,
          };
        }
      }

      // Determine mismatch criteria:
      // 1. Another library has significantly higher score (>10% difference)
      // 2. OR current keyword score is very low (<20%) despite having semantic match
      const scoreDifference = bestScore - currentScore;
      const hasSignificantlyBetterMatch = bestMatch &&
                                          bestMatch.libraryId !== doc.library_id &&
                                          scoreDifference > 0.1;

      // Check if keywords suggest wrong library (low keyword match in current library)
      const keywordMismatch = currentScore < MINIMUM_MATCH_THRESHOLD && bestScore >= MINIMUM_MATCH_THRESHOLD;

      const isMismatched = hasSignificantlyBetterMatch || keywordMismatch;

      if (isMismatched) {
        results.mismatched++;
        results.suggestions.push({
          documentId: doc.id,
          documentTitle: doc.title || 'Untitled',
          currentLibraryId: doc.library_id,
          currentLibraryName: doc.library_name,
          currentScore,
          currentKeywords: currentMatchedKeywords,
          originalMatchScore: doc.original_match_score,
          suggestedLibraryId: bestMatch?.libraryId,
          suggestedLibraryName: bestMatch?.libraryName,
          suggestedScore: bestScore,
          suggestedKeywords: bestMatch?.matchedKeywords,
          reason: keywordMismatch ? 'keyword_mismatch' : 'better_match_found',
        });
      } else if (originalScoreWeak) {
        // Document was ingested with weak confidence - flag for review
        results.weakMatch++;
        results.suggestions.push({
          documentId: doc.id,
          documentTitle: doc.title || 'Untitled',
          currentLibraryId: doc.library_id,
          currentLibraryName: doc.library_name,
          currentScore,
          currentKeywords: currentMatchedKeywords,
          originalMatchScore: doc.original_match_score,
          reason: 'weak_original_match',
        });
      } else {
        results.correct++;
      }
    }

    res.json({
      ...results,
      thresholds: {
        minimumMatch: MINIMUM_MATCH_THRESHOLD,
        significantDifference: 0.1,
        weakMatchThreshold: 0.60,
      },
    });

  } catch (error) {
    logger.error(`Failed to bulk recheck: ${error.message}`);
    res.status(500).json({ error: 'Failed to bulk recheck' });
  }
});

// ============================================
// URL Scraping
// ============================================

/**
 * POST /api/knowledge/scrape-url
 * Scrape content from a URL
 */
router.post('/scrape-url', async (req, res) => {
  try {
    const { url, autoIngest = false, libraryId } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Validate URL format
    try {
      new URL(url);
    } catch (e) {
      return res.status(400).json({ error: 'Invalid URL format' });
    }

    const urlScrapingService = getURLScrapingService();
    const scrapeResult = await urlScrapingService.scrape(url);

    if (!scrapeResult.success) {
      return res.status(400).json({
        error: scrapeResult.error,
        message: scrapeResult.message,
        url
      });
    }

    // Auto-ingest to library if requested
    if (autoIngest) {
      const ingestion = getNewsletterIngestion();

      // Build enriched content from scraped result
      const enrichedContent = urlScrapingService.buildEnrichedContent('', scrapeResult);

      // Create a message-like object for ingestion
      const message = {
        content: enrichedContent,
        from: 'api-scrape',
        sender: { name: 'API Scrape', id: req.user.id }
      };

      // If libraryId provided, try to ingest directly
      if (libraryId) {
        // TODO: Direct library ingestion
        logger.info(`URL scraped and ready for ingestion to library: ${libraryId}`);
      } else {
        // Use auto-matching
        const ingestionResult = await ingestion.ingest(message, { userId: req.user.id });
        scrapeResult.ingestion = ingestionResult;
      }
    }

    logger.info(`URL scraped: ${url} - ${scrapeResult.title} (${scrapeResult.contentLength} chars)`);

    res.json({
      success: true,
      ...scrapeResult
    });

  } catch (error) {
    logger.error(`Failed to scrape URL: ${error.message}`);
    res.status(500).json({ error: 'Failed to scrape URL', message: error.message });
  }
});

/**
 * POST /api/knowledge/detect-url
 * Detect if a message is URL-primary
 */
router.post('/detect-url', (req, res) => {
  try {
    const { content } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }

    const urlScrapingService = getURLScrapingService();
    const detection = urlScrapingService.detectUrlPrimaryMessage(content);

    res.json({
      success: true,
      ...detection
    });

  } catch (error) {
    logger.error(`Failed to detect URL: ${error.message}`);
    res.status(500).json({ error: 'Failed to detect URL' });
  }
});

/**
 * GET /api/knowledge/scraping/stats
 * Get URL scraping statistics
 */
router.get('/scraping/stats', (req, res) => {
  try {
    const urlScrapingService = getURLScrapingService();
    const ingestion = getNewsletterIngestion();

    res.json({
      scraping: urlScrapingService.getStats(),
      ingestion: ingestion.getStats()
    });

  } catch (error) {
    logger.error(`Failed to get scraping stats: ${error.message}`);
    res.status(500).json({ error: 'Failed to get scraping stats' });
  }
});

/**
 * GET /api/knowledge/scraping/sources
 * Get list of known reliable sources
 */
router.get('/scraping/sources', (req, res) => {
  try {
    const { getContentProcessor } = require('../services/rag/ContentProcessor.cjs');
    const contentProcessor = getContentProcessor();

    res.json({
      sources: contentProcessor.getKnownSources()
    });

  } catch (error) {
    logger.error(`Failed to get sources: ${error.message}`);
    res.status(500).json({ error: 'Failed to get sources' });
  }
});

/**
 * DELETE /api/knowledge/scraping/cache
 * Clear URL scraping cache
 */
router.delete('/scraping/cache', (req, res) => {
  try {
    const urlScrapingService = getURLScrapingService();
    urlScrapingService.clearCache();

    res.json({
      success: true,
      message: 'Cache cleared'
    });

  } catch (error) {
    logger.error(`Failed to clear cache: ${error.message}`);
    res.status(500).json({ error: 'Failed to clear cache' });
  }
});

// ============================================
// Chunked Upload for Large Files
// ============================================

// Store for tracking chunked uploads in progress
const chunkedUploads = new Map();
const CHUNKED_UPLOAD_DIR = path.join(__dirname, '../data/uploads/chunked');
const CHUNK_EXPIRY_MS = 3600000; // 1 hour

// Ensure chunked upload directory exists
if (!fs.existsSync(CHUNKED_UPLOAD_DIR)) {
  fs.mkdirSync(CHUNKED_UPLOAD_DIR, { recursive: true });
}

// Cleanup expired chunked uploads periodically
setInterval(() => {
  const now = Date.now();
  for (const [uploadId, upload] of chunkedUploads) {
    if (now - upload.startedAt > CHUNK_EXPIRY_MS) {
      // Clean up chunks
      const uploadDir = path.join(CHUNKED_UPLOAD_DIR, uploadId);
      if (fs.existsSync(uploadDir)) {
        fs.rmSync(uploadDir, { recursive: true, force: true });
      }
      chunkedUploads.delete(uploadId);
      logger.info(`Cleaned up expired chunked upload: ${uploadId}`);
    }
  }
}, 300000); // Check every 5 minutes

/**
 * POST /api/knowledge/chunked-upload/init
 * Initialize a chunked upload session
 */
router.post('/chunked-upload/init', (req, res) => {
  try {
    const { fileName, fileSize, totalChunks, libraryId, folderId, options } = req.body;
    const userId = req.user?.id;

    if (!fileName || !fileSize || !totalChunks || !libraryId) {
      return res.status(400).json({
        error: 'Missing required fields: fileName, fileSize, totalChunks, libraryId'
      });
    }

    const db = getDatabase();

    // Verify library exists and belongs to user
    const library = db.prepare('SELECT * FROM knowledge_libraries WHERE id = ? AND user_id = ?')
      .get(libraryId, userId);
    if (!library) {
      return res.status(404).json({ error: 'Library not found' });
    }

    // Generate upload ID
    const uploadId = uuidv4();
    const uploadDir = path.join(CHUNKED_UPLOAD_DIR, uploadId);
    fs.mkdirSync(uploadDir, { recursive: true });

    // Store upload session
    chunkedUploads.set(uploadId, {
      uploadId,
      userId,
      libraryId,
      libraryName: library.name,
      folderId: folderId || null,
      fileName,
      fileSize,
      totalChunks: parseInt(totalChunks),
      receivedChunks: new Set(),
      options: options ? JSON.parse(options) : {},
      startedAt: Date.now(),
      uploadDir
    });

    logger.info(`Chunked upload initialized: ${uploadId} for ${fileName} (${(fileSize / 1024 / 1024).toFixed(2)}MB, ${totalChunks} chunks)`);

    res.json({
      uploadId,
      message: 'Upload session initialized',
      chunkSize: Math.ceil(fileSize / totalChunks)
    });

  } catch (error) {
    logger.error(`Failed to initialize chunked upload: ${error.message}`);
    res.status(500).json({ error: 'Failed to initialize upload' });
  }
});

/**
 * POST /api/knowledge/chunked-upload/:uploadId/chunk
 * Upload a single chunk
 */
const chunkUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadId = req.params.uploadId;
      const uploadDir = path.join(CHUNKED_UPLOAD_DIR, uploadId);
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      const chunkIndex = req.body.chunkIndex || '0';
      cb(null, `chunk-${chunkIndex.padStart(6, '0')}`);
    }
  }),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB per chunk
  }
});

router.post('/chunked-upload/:uploadId/chunk', chunkUpload.single('chunk'), (req, res) => {
  try {
    const { uploadId } = req.params;
    const { chunkIndex } = req.body;
    const userId = req.user?.id;

    const upload = chunkedUploads.get(uploadId);
    if (!upload) {
      return res.status(404).json({ error: 'Upload session not found or expired' });
    }

    if (upload.userId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const index = parseInt(chunkIndex);
    upload.receivedChunks.add(index);

    const progress = (upload.receivedChunks.size / upload.totalChunks) * 100;

    logger.debug(`Chunk ${index + 1}/${upload.totalChunks} received for ${uploadId} (${progress.toFixed(1)}%)`);

    res.json({
      success: true,
      chunkIndex: index,
      receivedChunks: upload.receivedChunks.size,
      totalChunks: upload.totalChunks,
      progress: Math.round(progress)
    });

  } catch (error) {
    logger.error(`Failed to upload chunk: ${error.message}`);
    res.status(500).json({ error: 'Failed to upload chunk' });
  }
});

/**
 * POST /api/knowledge/chunked-upload/:uploadId/complete
 * Complete chunked upload and process the file
 */
router.post('/chunked-upload/:uploadId/complete', async (req, res) => {
  try {
    const { uploadId } = req.params;
    const userId = req.user?.id;

    const upload = chunkedUploads.get(uploadId);
    if (!upload) {
      return res.status(404).json({ error: 'Upload session not found or expired' });
    }

    if (upload.userId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Verify all chunks received
    if (upload.receivedChunks.size !== upload.totalChunks) {
      return res.status(400).json({
        error: 'Not all chunks received',
        received: upload.receivedChunks.size,
        expected: upload.totalChunks,
        missing: Array.from({ length: upload.totalChunks }, (_, i) => i)
          .filter(i => !upload.receivedChunks.has(i))
      });
    }

    // Merge chunks into final file
    const ext = path.extname(upload.fileName).toLowerCase();
    const finalPath = path.join(UPLOAD_DIR, `${uploadId}-${upload.fileName}`);
    const writeStream = fs.createWriteStream(finalPath);

    for (let i = 0; i < upload.totalChunks; i++) {
      const chunkPath = path.join(upload.uploadDir, `chunk-${String(i).padStart(6, '0')}`);
      if (!fs.existsSync(chunkPath)) {
        writeStream.close();
        return res.status(400).json({ error: `Missing chunk ${i}` });
      }
      const chunkData = fs.readFileSync(chunkPath);
      writeStream.write(chunkData);
    }

    writeStream.end();

    // Wait for write to complete
    await new Promise((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });

    // Clean up chunk files
    fs.rmSync(upload.uploadDir, { recursive: true, force: true });
    chunkedUploads.delete(uploadId);

    logger.info(`Chunked upload complete: ${upload.fileName} (${(upload.fileSize / 1024 / 1024).toFixed(2)}MB)`);

    // Now process the merged file (same as regular upload)
    const db = getDatabase();
    const library = db.prepare('SELECT * FROM knowledge_libraries WHERE id = ?').get(upload.libraryId);

    let extractedText = '';
    let docTitle = upload.fileName;
    let ocrUsed = false;
    let ocrPages = 0;

    try {
      if (ext === '.pdf') {
        const pdfParse = require('pdf-parse');
        const buffer = fs.readFileSync(finalPath);
        const data = await pdfParse(buffer);
        extractedText = data.text;
        docTitle = data.info?.Title || upload.fileName;

        // Check if PDF appears to be scanned (no text or very little)
        if (!extractedText || extractedText.trim().length < 50) {
          logger.info(`PDF "${upload.fileName}" appears to be scanned - attempting OCR...`);

          try {
            const { pdfOcrService } = require('../services/vision/PdfOcrService.cjs');
            const ocrStatus = await pdfOcrService.getStatus();

            if (ocrStatus.available) {
              const ocrResult = await pdfOcrService.extractText(finalPath, {
                languages: upload.options.ocrLanguages || 'eng+msa+chi_sim',
                maxPages: upload.options.maxOcrPages || 50
              });

              if (ocrResult.text && ocrResult.text.trim().length > 0) {
                extractedText = ocrResult.text;
                ocrUsed = true;
                ocrPages = ocrResult.pages;
                logger.info(`OCR extracted ${extractedText.length} chars from ${ocrPages} pages`);
              }
            }
          } catch (ocrError) {
            logger.warn(`OCR failed: ${ocrError.message}`);
          }
        }
      } else if (['.xls', '.xlsx', '.xlsm'].includes(ext)) {
        const xlsx = require('xlsx');
        const workbook = xlsx.readFile(finalPath);
        const allText = [];
        for (const sheetName of workbook.SheetNames) {
          const sheet = workbook.Sheets[sheetName];
          const csv = xlsx.utils.sheet_to_csv(sheet);
          allText.push(`[Sheet: ${sheetName}]\n${csv}`);
        }
        extractedText = allText.join('\n\n');
      } else if (['.doc', '.docx'].includes(ext)) {
        const mammoth = require('mammoth');
        const buffer = fs.readFileSync(finalPath);
        const result = await mammoth.extractRawText({ buffer });
        extractedText = result.value;
      } else if (['.csv', '.tsv'].includes(ext)) {
        extractedText = fs.readFileSync(finalPath, 'utf-8');
      } else {
        try {
          extractedText = fs.readFileSync(finalPath, 'utf-8');
        } catch {
          // Clean up and return error
          if (fs.existsSync(finalPath)) fs.unlinkSync(finalPath);
          return res.status(400).json({ error: `Cannot read file as text: ${ext}` });
        }
      }

      if (!extractedText || extractedText.trim().length === 0) {
        if (fs.existsSync(finalPath)) fs.unlinkSync(finalPath);
        return res.status(400).json({
          error: 'Could not extract any text content from the document.',
          hint: ext === '.pdf' ? 'This may be a scanned PDF. OCR may not be available.' : undefined
        });
      }

      // Ingest into the RAG library
      const { getRetrievalService } = require('../services/rag/RetrievalService.cjs');
      const retrievalService = getRetrievalService();

      const chunkStrategy = upload.options.chunkStrategy || 'paragraph';
      const chunkSize = upload.options.chunkSize || 500;

      const result = await retrievalService.ingestDocument(
        {
          title: docTitle,
          content: extractedText,
          sourceType: 'chunked_upload',
          sourceUrl: null,
          folderId: upload.folderId,
          metadata: {
            fileName: upload.fileName,
            fileSize: upload.fileSize,
            extractedAt: new Date().toISOString(),
            ocrUsed,
            ocrPages: ocrUsed ? ocrPages : undefined,
            chunkedUpload: true,
            totalChunks: upload.totalChunks
          },
        },
        upload.libraryId,
        { userId, chunkStrategy, chunkSize }
      );

      logger.info(`Chunked file ${upload.fileName} ingested: ${result.chunksCreated} chunks`);

      res.status(201).json({
        success: true,
        documentId: result.documentId,
        chunksCreated: result.chunksCreated,
        title: docTitle,
        libraryId: upload.libraryId,
        libraryName: upload.libraryName,
        fileSize: upload.fileSize,
        status: 'completed',
        ocrUsed,
        ocrPages: ocrUsed ? ocrPages : undefined
      });

    } finally {
      // Clean up merged file
      if (fs.existsSync(finalPath)) {
        fs.unlinkSync(finalPath);
      }
    }

  } catch (error) {
    logger.error(`Failed to complete chunked upload: ${error.message}`);
    res.status(500).json({ error: `Failed to process file: ${error.message}` });
  }
});

/**
 * DELETE /api/knowledge/chunked-upload/:uploadId
 * Cancel a chunked upload
 */
router.delete('/chunked-upload/:uploadId', (req, res) => {
  try {
    const { uploadId } = req.params;
    const userId = req.user?.id;

    const upload = chunkedUploads.get(uploadId);
    if (!upload) {
      return res.status(404).json({ error: 'Upload session not found' });
    }

    if (upload.userId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Clean up
    if (fs.existsSync(upload.uploadDir)) {
      fs.rmSync(upload.uploadDir, { recursive: true, force: true });
    }
    chunkedUploads.delete(uploadId);

    logger.info(`Chunked upload cancelled: ${uploadId}`);

    res.json({ success: true, message: 'Upload cancelled' });

  } catch (error) {
    logger.error(`Failed to cancel chunked upload: ${error.message}`);
    res.status(500).json({ error: 'Failed to cancel upload' });
  }
});

/**
 * GET /api/knowledge/chunked-upload/:uploadId/status
 * Get chunked upload progress
 */
router.get('/chunked-upload/:uploadId/status', (req, res) => {
  try {
    const { uploadId } = req.params;
    const userId = req.user?.id;

    const upload = chunkedUploads.get(uploadId);
    if (!upload) {
      return res.status(404).json({ error: 'Upload session not found or expired' });
    }

    if (upload.userId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const progress = (upload.receivedChunks.size / upload.totalChunks) * 100;

    res.json({
      uploadId,
      fileName: upload.fileName,
      fileSize: upload.fileSize,
      totalChunks: upload.totalChunks,
      receivedChunks: upload.receivedChunks.size,
      progress: Math.round(progress),
      startedAt: upload.startedAt,
      elapsedMs: Date.now() - upload.startedAt
    });

  } catch (error) {
    logger.error(`Failed to get upload status: ${error.message}`);
    res.status(500).json({ error: 'Failed to get status' });
  }
});

/**
 * GET /api/knowledge/ocr/status
 * Get OCR service status
 */
router.get('/ocr/status', async (req, res) => {
  try {
    const { pdfOcrService } = require('../services/vision/PdfOcrService.cjs');
    const status = await pdfOcrService.getStatus();
    res.json(status);
  } catch (error) {
    logger.error(`Failed to get OCR status: ${error.message}`);
    res.status(500).json({ error: 'Failed to get OCR status' });
  }
});

module.exports = router;
