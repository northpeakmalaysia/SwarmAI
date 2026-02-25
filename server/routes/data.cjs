/**
 * Data Source Routes
 * Data source management and synchronization
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('../services/database.cjs');
const { logger } = require('../services/logger.cjs');
const { authenticate } = require('./auth.cjs');

const router = express.Router();

router.use(authenticate);

/**
 * GET /api/data/sources
 * List data sources
 */
router.get('/sources', (req, res) => {
  try {
    const db = getDatabase();
    const { libraryId } = req.query;

    let query = 'SELECT * FROM data_sources WHERE user_id = ?';
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
        config: s.config ? JSON.parse(s.config) : {},
        schedule: s.schedule ? JSON.parse(s.schedule) : null
      }))
    });

  } catch (error) {
    logger.error(`Failed to list data sources: ${error.message}`);
    res.status(500).json({ error: 'Failed to list data sources' });
  }
});

/**
 * GET /api/data/sources/:sourceId
 * Get data source details
 */
router.get('/sources/:sourceId', (req, res) => {
  try {
    const db = getDatabase();

    const source = db.prepare('SELECT * FROM data_sources WHERE id = ? AND user_id = ?')
      .get(req.params.sourceId, req.user.id);

    if (!source) {
      return res.status(404).json({ error: 'Data source not found' });
    }

    res.json({
      source: {
        ...source,
        config: source.config ? JSON.parse(source.config) : {},
        schedule: source.schedule ? JSON.parse(source.schedule) : null
      }
    });

  } catch (error) {
    logger.error(`Failed to get data source: ${error.message}`);
    res.status(500).json({ error: 'Failed to get data source' });
  }
});

/**
 * POST /api/data/sources
 * Create data source
 */
router.post('/sources', (req, res) => {
  try {
    const { libraryId, name, type, config, schedule } = req.body;

    if (!name || !type) {
      return res.status(400).json({ error: 'Name and type are required' });
    }

    const db = getDatabase();
    const sourceId = uuidv4();

    db.prepare(`
      INSERT INTO data_sources (id, user_id, library_id, name, type, config, schedule, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'idle')
    `).run(
      sourceId,
      req.user.id,
      libraryId || null,
      name,
      type,
      JSON.stringify(config || {}),
      schedule ? JSON.stringify(schedule) : null
    );

    const source = db.prepare('SELECT * FROM data_sources WHERE id = ?').get(sourceId);

    res.status(201).json({
      source: {
        ...source,
        config: source.config ? JSON.parse(source.config) : {},
        schedule: source.schedule ? JSON.parse(source.schedule) : null
      }
    });

  } catch (error) {
    logger.error(`Failed to create data source: ${error.message}`);
    res.status(500).json({ error: 'Failed to create data source' });
  }
});

/**
 * PATCH /api/data/sources/:sourceId
 * Update data source
 */
router.patch('/sources/:sourceId', (req, res) => {
  try {
    const db = getDatabase();

    const existing = db.prepare('SELECT id FROM data_sources WHERE id = ? AND user_id = ?')
      .get(req.params.sourceId, req.user.id);

    if (!existing) {
      return res.status(404).json({ error: 'Data source not found' });
    }

    const { name, config, schedule } = req.body;

    const updates = [];
    const params = [];

    if (name !== undefined) { updates.push('name = ?'); params.push(name); }
    if (config !== undefined) { updates.push('config = ?'); params.push(JSON.stringify(config)); }
    if (schedule !== undefined) { updates.push('schedule = ?'); params.push(schedule ? JSON.stringify(schedule) : null); }

    if (updates.length > 0) {
      updates.push("updated_at = datetime('now')");
      params.push(req.params.sourceId);
      db.prepare(`UPDATE data_sources SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }

    const source = db.prepare('SELECT * FROM data_sources WHERE id = ?').get(req.params.sourceId);

    res.json({
      source: {
        ...source,
        config: source.config ? JSON.parse(source.config) : {},
        schedule: source.schedule ? JSON.parse(source.schedule) : null
      }
    });

  } catch (error) {
    logger.error(`Failed to update data source: ${error.message}`);
    res.status(500).json({ error: 'Failed to update data source' });
  }
});

/**
 * DELETE /api/data/sources/:sourceId
 * Delete data source
 */
router.delete('/sources/:sourceId', (req, res) => {
  try {
    const db = getDatabase();

    const result = db.prepare('DELETE FROM data_sources WHERE id = ? AND user_id = ?')
      .run(req.params.sourceId, req.user.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Data source not found' });
    }

    res.json({ message: 'Data source deleted' });

  } catch (error) {
    logger.error(`Failed to delete data source: ${error.message}`);
    res.status(500).json({ error: 'Failed to delete data source' });
  }
});

/**
 * POST /api/data/sources/:sourceId/sync
 * Trigger data sync
 */
router.post('/sources/:sourceId/sync', async (req, res) => {
  try {
    const db = getDatabase();

    const source = db.prepare('SELECT * FROM data_sources WHERE id = ? AND user_id = ?')
      .get(req.params.sourceId, req.user.id);

    if (!source) {
      return res.status(404).json({ error: 'Data source not found' });
    }

    // Update status to syncing
    db.prepare("UPDATE data_sources SET status = 'syncing', last_sync_at = datetime('now') WHERE id = ?")
      .run(req.params.sourceId);

    // TODO: Implement actual sync logic
    // For now, simulate sync completion
    setTimeout(() => {
      db.prepare("UPDATE data_sources SET status = 'idle' WHERE id = ?").run(req.params.sourceId);

      if (global.wsBroadcast) {
        global.wsBroadcast('data:sync_complete', { sourceId: req.params.sourceId });
      }
    }, 2000);

    res.json({ status: 'syncing' });

  } catch (error) {
    logger.error(`Failed to sync data source: ${error.message}`);
    res.status(500).json({ error: 'Failed to sync data source' });
  }
});

/**
 * POST /api/data/sources/:sourceId/sync/cancel
 * Cancel sync
 */
router.post('/sources/:sourceId/sync/cancel', (req, res) => {
  try {
    const db = getDatabase();

    db.prepare("UPDATE data_sources SET status = 'idle' WHERE id = ? AND user_id = ?")
      .run(req.params.sourceId, req.user.id);

    res.json({ status: 'cancelled' });

  } catch (error) {
    logger.error(`Failed to cancel sync: ${error.message}`);
    res.status(500).json({ error: 'Failed to cancel sync' });
  }
});

/**
 * GET /api/data/sources/:sourceId/sync/progress
 * Get sync progress
 */
router.get('/sources/:sourceId/sync/progress', (req, res) => {
  try {
    const db = getDatabase();

    const source = db.prepare('SELECT id, status, sync_progress FROM data_sources WHERE id = ? AND user_id = ?')
      .get(req.params.sourceId, req.user.id);

    if (!source) {
      return res.status(404).json({ error: 'Data source not found' });
    }

    res.json({
      status: source.status,
      progress: source.sync_progress || 0
    });

  } catch (error) {
    logger.error(`Failed to get sync progress: ${error.message}`);
    res.status(500).json({ error: 'Failed to get sync progress' });
  }
});

/**
 * GET /api/data/sources/:sourceId/history
 * Get sync history
 */
router.get('/sources/:sourceId/history', (req, res) => {
  try {
    const db = getDatabase();
    const { limit = 20, offset = 0 } = req.query;

    const history = db.prepare(`
      SELECT * FROM sync_history
      WHERE source_id = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(req.params.sourceId, parseInt(limit), parseInt(offset));

    res.json({ history });

  } catch (error) {
    logger.error(`Failed to get sync history: ${error.message}`);
    res.status(500).json({ error: 'Failed to get sync history' });
  }
});

/**
 * GET /api/data/sources/:sourceId/items
 * Get data items
 */
router.get('/sources/:sourceId/items', (req, res) => {
  try {
    const db = getDatabase();
    const { limit = 50, offset = 0 } = req.query;

    const items = db.prepare(`
      SELECT * FROM data_items
      WHERE source_id = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(req.params.sourceId, parseInt(limit), parseInt(offset));

    res.json({
      items: items.map(i => ({
        ...i,
        metadata: i.metadata ? JSON.parse(i.metadata) : {}
      }))
    });

  } catch (error) {
    logger.error(`Failed to get data items: ${error.message}`);
    res.status(500).json({ error: 'Failed to get data items' });
  }
});

/**
 * GET /api/data/statistics
 * Get data source statistics
 */
router.get('/statistics', (req, res) => {
  try {
    const db = getDatabase();

    const stats = db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM data_sources WHERE user_id = ?) as totalSources,
        (SELECT COUNT(*) FROM data_sources WHERE user_id = ? AND status = 'syncing') as activeSyncs,
        (SELECT COUNT(*) FROM data_items di JOIN data_sources ds ON di.source_id = ds.id WHERE ds.user_id = ?) as totalItems
    `).get(req.user.id, req.user.id, req.user.id);

    res.json({ statistics: stats });

  } catch (error) {
    logger.error(`Failed to get statistics: ${error.message}`);
    res.status(500).json({ error: 'Failed to get statistics' });
  }
});

module.exports = router;
