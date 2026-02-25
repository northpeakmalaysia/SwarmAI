/**
 * FTP Source Routes
 * FTP/SFTP data source management
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('../services/database.cjs');
const { logger } = require('../services/logger.cjs');
const { authenticate } = require('./auth.cjs');

const router = express.Router();

router.use(authenticate);

/**
 * GET /api/ftp/sources
 * List FTP sources
 */
router.get('/sources', (req, res) => {
  try {
    const db = getDatabase();
    const { libraryId } = req.query;

    let query = 'SELECT * FROM ftp_sources WHERE user_id = ?';
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
        schedule: s.schedule ? JSON.parse(s.schedule) : null,
        password: undefined // Never return password
      }))
    });

  } catch (error) {
    logger.error(`Failed to list FTP sources: ${error.message}`);
    res.status(500).json({ error: 'Failed to list FTP sources' });
  }
});

/**
 * GET /api/ftp/sources/:sourceId
 * Get FTP source details
 */
router.get('/sources/:sourceId', (req, res) => {
  try {
    const db = getDatabase();

    const source = db.prepare('SELECT * FROM ftp_sources WHERE id = ? AND user_id = ?')
      .get(req.params.sourceId, req.user.id);

    if (!source) {
      return res.status(404).json({ error: 'FTP source not found' });
    }

    res.json({
      source: {
        ...source,
        config: source.config ? JSON.parse(source.config) : {},
        schedule: source.schedule ? JSON.parse(source.schedule) : null,
        password: undefined
      }
    });

  } catch (error) {
    logger.error(`Failed to get FTP source: ${error.message}`);
    res.status(500).json({ error: 'Failed to get FTP source' });
  }
});

/**
 * POST /api/ftp/sources
 * Create FTP source
 */
router.post('/sources', (req, res) => {
  try {
    const { libraryId, name, host, port, username, password, protocol, remotePath, config, schedule } = req.body;

    if (!name || !host || !username) {
      return res.status(400).json({ error: 'Name, host, and username are required' });
    }

    const db = getDatabase();
    const sourceId = uuidv4();

    db.prepare(`
      INSERT INTO ftp_sources (id, user_id, library_id, name, host, port, username, password, protocol, remote_path, config, schedule, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'disconnected')
    `).run(
      sourceId,
      req.user.id,
      libraryId || null,
      name,
      host,
      port || 21,
      username,
      password || null,
      protocol || 'ftp',
      remotePath || '/',
      JSON.stringify(config || {}),
      schedule ? JSON.stringify(schedule) : null
    );

    const source = db.prepare('SELECT * FROM ftp_sources WHERE id = ?').get(sourceId);

    res.status(201).json({
      source: {
        ...source,
        config: source.config ? JSON.parse(source.config) : {},
        schedule: source.schedule ? JSON.parse(source.schedule) : null,
        password: undefined
      }
    });

  } catch (error) {
    logger.error(`Failed to create FTP source: ${error.message}`);
    res.status(500).json({ error: 'Failed to create FTP source' });
  }
});

/**
 * PUT /api/ftp/sources/:sourceId
 * Update FTP source
 */
router.put('/sources/:sourceId', (req, res) => {
  try {
    const db = getDatabase();

    const existing = db.prepare('SELECT id FROM ftp_sources WHERE id = ? AND user_id = ?')
      .get(req.params.sourceId, req.user.id);

    if (!existing) {
      return res.status(404).json({ error: 'FTP source not found' });
    }

    const { name, host, port, username, password, protocol, remotePath, config, schedule } = req.body;

    const updates = [];
    const params = [];

    if (name !== undefined) { updates.push('name = ?'); params.push(name); }
    if (host !== undefined) { updates.push('host = ?'); params.push(host); }
    if (port !== undefined) { updates.push('port = ?'); params.push(port); }
    if (username !== undefined) { updates.push('username = ?'); params.push(username); }
    if (password !== undefined) { updates.push('password = ?'); params.push(password); }
    if (protocol !== undefined) { updates.push('protocol = ?'); params.push(protocol); }
    if (remotePath !== undefined) { updates.push('remote_path = ?'); params.push(remotePath); }
    if (config !== undefined) { updates.push('config = ?'); params.push(JSON.stringify(config)); }
    if (schedule !== undefined) { updates.push('schedule = ?'); params.push(schedule ? JSON.stringify(schedule) : null); }

    if (updates.length > 0) {
      updates.push("updated_at = datetime('now')");
      params.push(req.params.sourceId);
      db.prepare(`UPDATE ftp_sources SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }

    const source = db.prepare('SELECT * FROM ftp_sources WHERE id = ?').get(req.params.sourceId);

    res.json({
      source: {
        ...source,
        config: source.config ? JSON.parse(source.config) : {},
        schedule: source.schedule ? JSON.parse(source.schedule) : null,
        password: undefined
      }
    });

  } catch (error) {
    logger.error(`Failed to update FTP source: ${error.message}`);
    res.status(500).json({ error: 'Failed to update FTP source' });
  }
});

/**
 * DELETE /api/ftp/sources/:sourceId
 * Delete FTP source
 */
router.delete('/sources/:sourceId', (req, res) => {
  try {
    const db = getDatabase();

    const result = db.prepare('DELETE FROM ftp_sources WHERE id = ? AND user_id = ?')
      .run(req.params.sourceId, req.user.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'FTP source not found' });
    }

    res.json({ message: 'FTP source deleted' });

  } catch (error) {
    logger.error(`Failed to delete FTP source: ${error.message}`);
    res.status(500).json({ error: 'Failed to delete FTP source' });
  }
});

/**
 * POST /api/ftp/test-connection
 * Test FTP connection
 */
router.post('/test-connection', async (req, res) => {
  try {
    const { host, port, username, password, protocol } = req.body;

    if (!host || !username) {
      return res.status(400).json({ error: 'Host and username are required' });
    }

    // TODO: Implement actual FTP connection test
    res.json({
      success: true,
      message: 'Connection test not implemented yet'
    });

  } catch (error) {
    logger.error(`Failed to test connection: ${error.message}`);
    res.status(500).json({ error: 'Failed to test connection' });
  }
});

/**
 * POST /api/ftp/sources/:sourceId/test
 * Test source connection
 */
router.post('/sources/:sourceId/test', async (req, res) => {
  try {
    const db = getDatabase();

    const source = db.prepare('SELECT * FROM ftp_sources WHERE id = ? AND user_id = ?')
      .get(req.params.sourceId, req.user.id);

    if (!source) {
      return res.status(404).json({ error: 'FTP source not found' });
    }

    // TODO: Implement actual connection test
    res.json({
      success: true,
      message: 'Connection test not implemented yet'
    });

  } catch (error) {
    logger.error(`Failed to test source: ${error.message}`);
    res.status(500).json({ error: 'Failed to test source' });
  }
});

/**
 * POST /api/ftp/sources/:sourceId/sync
 * Trigger FTP sync
 */
router.post('/sources/:sourceId/sync', async (req, res) => {
  try {
    const db = getDatabase();

    const source = db.prepare('SELECT * FROM ftp_sources WHERE id = ? AND user_id = ?')
      .get(req.params.sourceId, req.user.id);

    if (!source) {
      return res.status(404).json({ error: 'FTP source not found' });
    }

    db.prepare("UPDATE ftp_sources SET status = 'syncing', last_sync_at = datetime('now') WHERE id = ?")
      .run(req.params.sourceId);

    // TODO: Implement actual FTP sync
    setTimeout(() => {
      db.prepare("UPDATE ftp_sources SET status = 'connected' WHERE id = ?").run(req.params.sourceId);

      if (global.wsBroadcast) {
        global.wsBroadcast('ftp:sync_complete', { sourceId: req.params.sourceId });
      }
    }, 3000);

    res.json({ status: 'syncing' });

  } catch (error) {
    logger.error(`Failed to sync FTP source: ${error.message}`);
    res.status(500).json({ error: 'Failed to sync FTP source' });
  }
});

/**
 * POST /api/ftp/sources/:sourceId/sync/cancel
 * Cancel FTP sync
 */
router.post('/sources/:sourceId/sync/cancel', (req, res) => {
  try {
    const db = getDatabase();

    db.prepare("UPDATE ftp_sources SET status = 'connected' WHERE id = ? AND user_id = ?")
      .run(req.params.sourceId, req.user.id);

    res.json({ status: 'cancelled' });

  } catch (error) {
    logger.error(`Failed to cancel sync: ${error.message}`);
    res.status(500).json({ error: 'Failed to cancel sync' });
  }
});

/**
 * GET /api/ftp/sources/:sourceId/sync/status
 * Get sync status
 */
router.get('/sources/:sourceId/sync/status', (req, res) => {
  try {
    const db = getDatabase();

    const source = db.prepare('SELECT id, status, sync_progress FROM ftp_sources WHERE id = ? AND user_id = ?')
      .get(req.params.sourceId, req.user.id);

    if (!source) {
      return res.status(404).json({ error: 'FTP source not found' });
    }

    res.json({
      status: source.status,
      progress: source.sync_progress || 0
    });

  } catch (error) {
    logger.error(`Failed to get sync status: ${error.message}`);
    res.status(500).json({ error: 'Failed to get sync status' });
  }
});

/**
 * GET /api/ftp/sources/:sourceId/files
 * Get tracked files
 */
router.get('/sources/:sourceId/files', (req, res) => {
  try {
    const db = getDatabase();

    const files = db.prepare(`
      SELECT * FROM ftp_files
      WHERE source_id = ?
      ORDER BY remote_path
    `).all(req.params.sourceId);

    res.json({ files });

  } catch (error) {
    logger.error(`Failed to get files: ${error.message}`);
    res.status(500).json({ error: 'Failed to get files' });
  }
});

/**
 * GET /api/ftp/sources/:sourceId/browse
 * Browse remote directory
 */
router.get('/sources/:sourceId/browse', async (req, res) => {
  try {
    const { path: remotePath = '/' } = req.query;

    // TODO: Implement actual FTP directory listing
    res.json({
      path: remotePath,
      entries: []
    });

  } catch (error) {
    logger.error(`Failed to browse directory: ${error.message}`);
    res.status(500).json({ error: 'Failed to browse directory' });
  }
});

/**
 * GET /api/ftp/sources/:sourceId/history
 * Get sync history
 */
router.get('/sources/:sourceId/history', (req, res) => {
  try {
    const db = getDatabase();
    const { limit = 20 } = req.query;

    const history = db.prepare(`
      SELECT * FROM ftp_sync_history
      WHERE source_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(req.params.sourceId, parseInt(limit));

    res.json({ history });

  } catch (error) {
    logger.error(`Failed to get sync history: ${error.message}`);
    res.status(500).json({ error: 'Failed to get sync history' });
  }
});

/**
 * POST /api/ftp/sources/:sourceId/schedule/enable
 * Enable schedule
 */
router.post('/sources/:sourceId/schedule/enable', (req, res) => {
  try {
    const db = getDatabase();

    db.prepare("UPDATE ftp_sources SET schedule_enabled = 1 WHERE id = ? AND user_id = ?")
      .run(req.params.sourceId, req.user.id);

    res.json({ enabled: true });

  } catch (error) {
    logger.error(`Failed to enable schedule: ${error.message}`);
    res.status(500).json({ error: 'Failed to enable schedule' });
  }
});

/**
 * POST /api/ftp/sources/:sourceId/schedule/disable
 * Disable schedule
 */
router.post('/sources/:sourceId/schedule/disable', (req, res) => {
  try {
    const db = getDatabase();

    db.prepare("UPDATE ftp_sources SET schedule_enabled = 0 WHERE id = ? AND user_id = ?")
      .run(req.params.sourceId, req.user.id);

    res.json({ enabled: false });

  } catch (error) {
    logger.error(`Failed to disable schedule: ${error.message}`);
    res.status(500).json({ error: 'Failed to disable schedule' });
  }
});

/**
 * PUT /api/ftp/sources/:sourceId/schedule
 * Update schedule
 */
router.put('/sources/:sourceId/schedule', (req, res) => {
  try {
    const { schedule } = req.body;
    const db = getDatabase();

    db.prepare("UPDATE ftp_sources SET schedule = ? WHERE id = ? AND user_id = ?")
      .run(JSON.stringify(schedule), req.params.sourceId, req.user.id);

    res.json({ schedule });

  } catch (error) {
    logger.error(`Failed to update schedule: ${error.message}`);
    res.status(500).json({ error: 'Failed to update schedule' });
  }
});

module.exports = router;
