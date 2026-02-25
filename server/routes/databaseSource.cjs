/**
 * Database Source Routes
 *
 * API routes for managing database connections and syncing to RAG knowledge base.
 * Supports SQL Server with extensibility for PostgreSQL and MySQL.
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('../services/database.cjs');
const { logger } = require('../services/logger.cjs');
const { authenticate } = require('./auth.cjs');
const DatabaseConnector = require('../services/database/DatabaseConnectorService.cjs');

const router = express.Router();

// Apply authentication middleware
router.use(authenticate);

// Active sync operations (for cancellation)
const activeSyncs = new Map();

/**
 * POST /api/database/test
 * Test database connection without saving
 */
router.post('/test', async (req, res) => {
  try {
    const { host, port, databaseName, username, password, dbType, encrypt, trustServerCertificate } = req.body;

    if (!host || !databaseName || !username) {
      return res.status(400).json({ error: 'Host, database name, and username are required' });
    }

    const result = await DatabaseConnector.testConnection({
      host,
      port: port || 1433,
      databaseName,
      username,
      password,
      dbType: dbType || 'sqlserver',
      encrypt: encrypt !== false,
      trustServerCertificate: trustServerCertificate === true,
    });

    res.json(result);
  } catch (error) {
    logger.error(`Connection test failed: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/database/sources
 * List database sources for user
 */
router.get('/sources', (req, res) => {
  try {
    const db = getDatabase();
    const { libraryId } = req.query;

    let query = 'SELECT * FROM database_sources WHERE user_id = ?';
    const params = [req.user.id];

    if (libraryId) {
      query += ' AND library_id = ?';
      params.push(libraryId);
    }

    query += ' ORDER BY created_at DESC';

    const sources = db.prepare(query).all(...params);

    res.json({
      sources: sources.map(s => ({
        ...s,
        contentFields: parseJsonField(s.content_fields),
        metadataFields: parseJsonField(s.metadata_fields),
        password: undefined, // Never return password
        encrypt: s.encrypt === 1,
        trustServerCertificate: s.trust_server_certificate === 1,
        scheduleEnabled: s.schedule_enabled === 1,
      })),
    });
  } catch (error) {
    logger.error(`Failed to list database sources: ${error.message}`);
    res.status(500).json({ error: 'Failed to list database sources' });
  }
});

/**
 * GET /api/database/sources/:sourceId
 * Get database source details
 */
router.get('/sources/:sourceId', (req, res) => {
  try {
    const db = getDatabase();

    const source = db.prepare('SELECT * FROM database_sources WHERE id = ? AND user_id = ?')
      .get(req.params.sourceId, req.user.id);

    if (!source) {
      return res.status(404).json({ error: 'Database source not found' });
    }

    res.json({
      source: {
        ...source,
        contentFields: parseJsonField(source.content_fields),
        metadataFields: parseJsonField(source.metadata_fields),
        password: undefined,
        encrypt: source.encrypt === 1,
        trustServerCertificate: source.trust_server_certificate === 1,
        scheduleEnabled: source.schedule_enabled === 1,
      },
    });
  } catch (error) {
    logger.error(`Failed to get database source: ${error.message}`);
    res.status(500).json({ error: 'Failed to get database source' });
  }
});

/**
 * POST /api/database/sources
 * Create database source
 */
router.post('/sources', async (req, res) => {
  try {
    const {
      libraryId,
      name,
      host,
      port,
      databaseName,
      username,
      password,
      dbType,
      encrypt,
      trustServerCertificate,
      extractionQuery,
      contentFields,
      titleField,
      idField,
      metadataFields,
      scheduleEnabled,
      cronExpression,
    } = req.body;

    if (!name || !host || !databaseName || !username) {
      return res.status(400).json({ error: 'Name, host, database name, and username are required' });
    }

    // Validate content fields if provided
    if (contentFields && contentFields.length === 0) {
      return res.status(400).json({ error: 'At least one content field is required when providing field mappings' });
    }

    const db = getDatabase();
    const sourceId = uuidv4();

    // Test connection first
    const testResult = await DatabaseConnector.testConnection({
      host,
      port: port || 1433,
      databaseName,
      username,
      password,
      dbType: dbType || 'sqlserver',
      encrypt: encrypt !== false,
      trustServerCertificate: trustServerCertificate === true,
    });

    const initialStatus = testResult.success ? 'connected' : 'disconnected';

    db.prepare(`
      INSERT INTO database_sources (
        id, user_id, library_id, name, db_type, host, port, database_name,
        username, password, encrypt, trust_server_certificate,
        extraction_query, content_fields, title_field, id_field, metadata_fields,
        schedule_enabled, cron_expression, status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      sourceId,
      req.user.id,
      libraryId || null,
      name,
      dbType || 'sqlserver',
      host,
      port || 1433,
      databaseName,
      username,
      password || null,
      encrypt !== false ? 1 : 0,
      trustServerCertificate === true ? 1 : 0,
      extractionQuery || null,
      contentFields ? JSON.stringify(contentFields) : null,
      titleField || null,
      idField || null,
      metadataFields ? JSON.stringify(metadataFields) : null,
      scheduleEnabled ? 1 : 0,
      cronExpression || '0 0 * * *',
      initialStatus
    );

    const source = db.prepare('SELECT * FROM database_sources WHERE id = ?').get(sourceId);

    res.status(201).json({
      source: {
        ...source,
        contentFields: parseJsonField(source.content_fields),
        metadataFields: parseJsonField(source.metadata_fields),
        password: undefined,
        encrypt: source.encrypt === 1,
        trustServerCertificate: source.trust_server_certificate === 1,
        scheduleEnabled: source.schedule_enabled === 1,
      },
      connectionTest: testResult,
    });
  } catch (error) {
    logger.error(`Failed to create database source: ${error.message}`);
    res.status(500).json({ error: 'Failed to create database source' });
  }
});

/**
 * PATCH /api/database/sources/:sourceId
 * Update database source
 */
router.patch('/sources/:sourceId', async (req, res) => {
  try {
    const db = getDatabase();

    const existing = db.prepare('SELECT * FROM database_sources WHERE id = ? AND user_id = ?')
      .get(req.params.sourceId, req.user.id);

    if (!existing) {
      return res.status(404).json({ error: 'Database source not found' });
    }

    const {
      name,
      host,
      port,
      databaseName,
      username,
      password,
      dbType,
      encrypt,
      trustServerCertificate,
      extractionQuery,
      contentFields,
      titleField,
      idField,
      metadataFields,
      scheduleEnabled,
      cronExpression,
    } = req.body;

    const updates = [];
    const params = [];

    if (name !== undefined) { updates.push('name = ?'); params.push(name); }
    if (host !== undefined) { updates.push('host = ?'); params.push(host); }
    if (port !== undefined) { updates.push('port = ?'); params.push(port); }
    if (databaseName !== undefined) { updates.push('database_name = ?'); params.push(databaseName); }
    if (username !== undefined) { updates.push('username = ?'); params.push(username); }
    if (password !== undefined) { updates.push('password = ?'); params.push(password); }
    if (dbType !== undefined) { updates.push('db_type = ?'); params.push(dbType); }
    if (encrypt !== undefined) { updates.push('encrypt = ?'); params.push(encrypt ? 1 : 0); }
    if (trustServerCertificate !== undefined) { updates.push('trust_server_certificate = ?'); params.push(trustServerCertificate ? 1 : 0); }
    if (extractionQuery !== undefined) { updates.push('extraction_query = ?'); params.push(extractionQuery); }
    if (contentFields !== undefined) { updates.push('content_fields = ?'); params.push(JSON.stringify(contentFields)); }
    if (titleField !== undefined) { updates.push('title_field = ?'); params.push(titleField); }
    if (idField !== undefined) { updates.push('id_field = ?'); params.push(idField); }
    if (metadataFields !== undefined) { updates.push('metadata_fields = ?'); params.push(JSON.stringify(metadataFields)); }
    if (scheduleEnabled !== undefined) { updates.push('schedule_enabled = ?'); params.push(scheduleEnabled ? 1 : 0); }
    if (cronExpression !== undefined) { updates.push('cron_expression = ?'); params.push(cronExpression); }

    if (updates.length > 0) {
      updates.push("updated_at = datetime('now')");
      params.push(req.params.sourceId);
      db.prepare(`UPDATE database_sources SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }

    const source = db.prepare('SELECT * FROM database_sources WHERE id = ?').get(req.params.sourceId);

    res.json({
      source: {
        ...source,
        contentFields: parseJsonField(source.content_fields),
        metadataFields: parseJsonField(source.metadata_fields),
        password: undefined,
        encrypt: source.encrypt === 1,
        trustServerCertificate: source.trust_server_certificate === 1,
        scheduleEnabled: source.schedule_enabled === 1,
      },
    });
  } catch (error) {
    logger.error(`Failed to update database source: ${error.message}`);
    res.status(500).json({ error: 'Failed to update database source' });
  }
});

/**
 * DELETE /api/database/sources/:sourceId
 * Delete database source
 */
router.delete('/sources/:sourceId', async (req, res) => {
  try {
    const db = getDatabase();

    // Close any active connection pool
    await DatabaseConnector.closePool(req.params.sourceId);

    const result = db.prepare('DELETE FROM database_sources WHERE id = ? AND user_id = ?')
      .run(req.params.sourceId, req.user.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Database source not found' });
    }

    res.json({ message: 'Database source deleted' });
  } catch (error) {
    logger.error(`Failed to delete database source: ${error.message}`);
    res.status(500).json({ error: 'Failed to delete database source' });
  }
});

/**
 * GET /api/database/sources/:sourceId/tables
 * List tables in the database
 */
router.get('/sources/:sourceId/tables', async (req, res) => {
  try {
    const db = getDatabase();

    const source = db.prepare('SELECT * FROM database_sources WHERE id = ? AND user_id = ?')
      .get(req.params.sourceId, req.user.id);

    if (!source) {
      return res.status(404).json({ error: 'Database source not found' });
    }

    const tables = await DatabaseConnector.getTables(source);

    res.json({ tables });
  } catch (error) {
    logger.error(`Failed to get tables: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/database/sources/:sourceId/columns
 * Get columns for a table
 */
router.get('/sources/:sourceId/columns', async (req, res) => {
  try {
    const { table, schema } = req.query;

    if (!table) {
      return res.status(400).json({ error: 'Table name is required' });
    }

    const db = getDatabase();

    const source = db.prepare('SELECT * FROM database_sources WHERE id = ? AND user_id = ?')
      .get(req.params.sourceId, req.user.id);

    if (!source) {
      return res.status(404).json({ error: 'Database source not found' });
    }

    const columns = await DatabaseConnector.getColumns(source, table, schema || 'dbo');

    res.json({ columns });
  } catch (error) {
    logger.error(`Failed to get columns: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/database/sources/:sourceId/preview
 * Preview query results
 */
router.post('/sources/:sourceId/preview', async (req, res) => {
  try {
    const { query, limit } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    // Security: Only allow SELECT queries
    if (!query.trim().toLowerCase().startsWith('select')) {
      return res.status(400).json({ error: 'Only SELECT queries are allowed' });
    }

    const db = getDatabase();

    const source = db.prepare('SELECT * FROM database_sources WHERE id = ? AND user_id = ?')
      .get(req.params.sourceId, req.user.id);

    if (!source) {
      return res.status(404).json({ error: 'Database source not found' });
    }

    const result = await DatabaseConnector.previewQuery(source, query, limit || 10);

    res.json(result);
  } catch (error) {
    logger.error(`Preview query failed: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/database/sources/:sourceId/sync
 * Trigger sync to RAG knowledge base
 */
router.post('/sources/:sourceId/sync', async (req, res) => {
  const syncId = uuidv4();

  try {
    const db = getDatabase();

    const source = db.prepare('SELECT * FROM database_sources WHERE id = ? AND user_id = ?')
      .get(req.params.sourceId, req.user.id);

    if (!source) {
      return res.status(404).json({ error: 'Database source not found' });
    }

    if (!source.extraction_query) {
      return res.status(400).json({ error: 'No extraction query configured' });
    }

    if (!source.content_fields) {
      return res.status(400).json({ error: 'No content fields configured' });
    }

    // Check if sync is already running
    if (activeSyncs.has(req.params.sourceId)) {
      return res.status(409).json({ error: 'Sync already in progress' });
    }

    // Update status to syncing
    db.prepare("UPDATE database_sources SET status = 'syncing', updated_at = datetime('now') WHERE id = ?")
      .run(req.params.sourceId);

    // Create sync history entry
    db.prepare(`
      INSERT INTO database_sync_history (id, source_id, status, started_at, created_at)
      VALUES (?, ?, 'running', datetime('now'), datetime('now'))
    `).run(syncId, req.params.sourceId);

    // Track active sync
    activeSyncs.set(req.params.sourceId, { syncId, cancelled: false });

    // Return immediately, sync runs in background
    res.json({ syncId, status: 'started' });

    // Run sync in background
    runSync(source, syncId, req.user.id).catch(err => {
      logger.error(`Background sync failed: ${err.message}`);
    });
  } catch (error) {
    logger.error(`Failed to start sync: ${error.message}`);
    res.status(500).json({ error: 'Failed to start sync' });
  }
});

/**
 * POST /api/database/sources/:sourceId/sync/cancel
 * Cancel running sync
 */
router.post('/sources/:sourceId/sync/cancel', (req, res) => {
  try {
    const activeSync = activeSyncs.get(req.params.sourceId);

    if (!activeSync) {
      return res.status(404).json({ error: 'No active sync found' });
    }

    activeSync.cancelled = true;

    const db = getDatabase();
    db.prepare("UPDATE database_sources SET status = 'connected', updated_at = datetime('now') WHERE id = ?")
      .run(req.params.sourceId);

    db.prepare(`
      UPDATE database_sync_history
      SET status = 'cancelled', completed_at = datetime('now')
      WHERE id = ?
    `).run(activeSync.syncId);

    activeSyncs.delete(req.params.sourceId);

    res.json({ status: 'cancelled' });
  } catch (error) {
    logger.error(`Failed to cancel sync: ${error.message}`);
    res.status(500).json({ error: 'Failed to cancel sync' });
  }
});

/**
 * GET /api/database/sources/:sourceId/sync/status
 * Get sync status
 */
router.get('/sources/:sourceId/sync/status', (req, res) => {
  try {
    const db = getDatabase();

    const source = db.prepare('SELECT id, status, last_sync_at, last_sync_status, last_sync_error, item_count FROM database_sources WHERE id = ? AND user_id = ?')
      .get(req.params.sourceId, req.user.id);

    if (!source) {
      return res.status(404).json({ error: 'Database source not found' });
    }

    // Get latest sync history
    const latestSync = db.prepare(`
      SELECT * FROM database_sync_history
      WHERE source_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(req.params.sourceId);

    res.json({
      status: source.status,
      lastSyncAt: source.last_sync_at,
      lastSyncStatus: source.last_sync_status,
      lastSyncError: source.last_sync_error,
      itemCount: source.item_count,
      currentSync: latestSync?.status === 'running' ? latestSync : null,
    });
  } catch (error) {
    logger.error(`Failed to get sync status: ${error.message}`);
    res.status(500).json({ error: 'Failed to get sync status' });
  }
});

/**
 * GET /api/database/sources/:sourceId/history
 * Get sync history
 */
router.get('/sources/:sourceId/history', (req, res) => {
  try {
    const db = getDatabase();
    const { limit = 20, offset = 0 } = req.query;

    const history = db.prepare(`
      SELECT * FROM database_sync_history
      WHERE source_id = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(req.params.sourceId, parseInt(limit), parseInt(offset));

    const total = db.prepare('SELECT COUNT(*) as count FROM database_sync_history WHERE source_id = ?')
      .get(req.params.sourceId).count;

    res.json({ history, total });
  } catch (error) {
    logger.error(`Failed to get sync history: ${error.message}`);
    res.status(500).json({ error: 'Failed to get sync history' });
  }
});

/**
 * POST /api/database/sources/:sourceId/test
 * Test connection for existing source
 */
router.post('/sources/:sourceId/test', async (req, res) => {
  try {
    const db = getDatabase();

    const source = db.prepare('SELECT * FROM database_sources WHERE id = ? AND user_id = ?')
      .get(req.params.sourceId, req.user.id);

    if (!source) {
      return res.status(404).json({ error: 'Database source not found' });
    }

    const result = await DatabaseConnector.testConnection(source);

    // Update status based on test result
    db.prepare("UPDATE database_sources SET status = ?, updated_at = datetime('now') WHERE id = ?")
      .run(result.success ? 'connected' : 'error', req.params.sourceId);

    res.json(result);
  } catch (error) {
    logger.error(`Connection test failed: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Parse JSON field (handles string or array)
 */
function parseJsonField(value) {
  if (!value) return null;
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return value.split(',').map(s => s.trim()).filter(Boolean);
    }
  }
  return null;
}

/**
 * Run sync operation in background
 */
async function runSync(source, syncId, userId) {
  const db = getDatabase();
  const startTime = Date.now();

  try {
    // Import RetrievalService for RAG ingestion
    let RetrievalService;
    try {
      RetrievalService = require('../services/rag/RetrievalService.cjs');
    } catch (err) {
      logger.warn(`RetrievalService not available: ${err.message}`);
    }

    // Check if cancelled
    const activeSync = activeSyncs.get(source.id);
    if (activeSync?.cancelled) {
      return;
    }

    // Execute sync
    const result = await DatabaseConnector.syncToKnowledge(source, (current, total, status) => {
      // Check if cancelled
      const sync = activeSyncs.get(source.id);
      if (sync?.cancelled) {
        throw new Error('Sync cancelled');
      }

      // Update progress
      db.prepare(`
        UPDATE database_sync_history
        SET rows_discovered = ?, rows_ingested = ?
        WHERE id = ?
      `).run(total, current, syncId);

      // Broadcast progress via WebSocket
      if (global.wsBroadcast) {
        global.wsBroadcast('database:sync_progress', {
          sourceId: source.id,
          syncId,
          current,
          total,
          status,
        });
      }
    });

    // Ingest documents to RAG if RetrievalService is available
    let ingestedCount = 0;
    if (RetrievalService && result.documents && source.library_id) {
      for (const doc of result.documents) {
        try {
          await RetrievalService.ingestDocument(source.library_id, {
            title: doc.title,
            content: doc.content,
            sourceType: 'database',
            sourceUrl: `${source.db_type}://${source.host}/${source.database_name}`,
            metadata: {
              ...doc.metadata,
              externalId: doc.externalId,
              databaseSourceId: source.id,
            },
          });
          ingestedCount++;
        } catch (err) {
          logger.error(`Failed to ingest document ${doc.externalId}: ${err.message}`);
          result.rowsFailed++;
        }
      }
    } else {
      ingestedCount = result.documents?.length || 0;
    }

    const duration = Date.now() - startTime;

    // Update sync history
    db.prepare(`
      UPDATE database_sync_history
      SET status = 'completed', rows_discovered = ?, rows_ingested = ?, rows_failed = ?,
          completed_at = datetime('now'), duration_ms = ?
      WHERE id = ?
    `).run(result.rowsProcessed, ingestedCount, result.rowsFailed, duration, syncId);

    // Update source status
    db.prepare(`
      UPDATE database_sources
      SET status = 'connected', last_sync_at = datetime('now'), last_sync_status = 'completed',
          last_sync_error = NULL, item_count = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(ingestedCount, source.id);

    // Broadcast completion
    if (global.wsBroadcast) {
      global.wsBroadcast('database:sync_complete', {
        sourceId: source.id,
        syncId,
        rowsIngested: ingestedCount,
        rowsFailed: result.rowsFailed,
        durationMs: duration,
      });
    }

    logger.info(`Database sync completed: ${ingestedCount} documents ingested in ${duration}ms`);
  } catch (error) {
    const duration = Date.now() - startTime;

    // Update sync history with error
    db.prepare(`
      UPDATE database_sync_history
      SET status = 'failed', error_message = ?, completed_at = datetime('now'), duration_ms = ?
      WHERE id = ?
    `).run(error.message, duration, syncId);

    // Update source status
    db.prepare(`
      UPDATE database_sources
      SET status = 'error', last_sync_status = 'failed', last_sync_error = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(error.message, source.id);

    // Broadcast error
    if (global.wsBroadcast) {
      global.wsBroadcast('database:sync_error', {
        sourceId: source.id,
        syncId,
        error: error.message,
      });
    }

    logger.error(`Database sync failed: ${error.message}`);
  } finally {
    activeSyncs.delete(source.id);
  }
}

module.exports = router;
