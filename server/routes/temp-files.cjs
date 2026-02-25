/**
 * Temp File Routes
 * REST API for temporary file storage with token-based downloads.
 *
 * Routes:
 *   GET  /download/:token  - Download file (NO JWT auth, token is the auth)
 *   GET  /                 - List user's temp files (JWT auth)
 *   POST /upload           - Upload a temp file (JWT auth + multer)
 *   POST /agent-upload     - Upload from Local Agent (API key auth + multer)
 *   DELETE /:id            - Delete a temp file (JWT auth)
 *
 * Mount at: /api/temp-files
 */

const express = require('express');
const crypto = require('crypto');
const multer = require('multer');
const path = require('path');
const { authenticate } = require('./auth.cjs');
const { getTempFileService } = require('../services/TempFileService.cjs');
const { getDatabase } = require('../services/database.cjs');
const { logger } = require('../services/logger.cjs');

const router = express.Router();

// ---------------------------------------------------------------------------
// Multer configuration — store in memory so we can pass Buffer to service
// ---------------------------------------------------------------------------

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024 // 50 MB
  }
});

// ---------------------------------------------------------------------------
// GET /download/:token — Public (token IS the auth)
// ---------------------------------------------------------------------------

/**
 * Download a temp file by its unique token.
 * No JWT required — the token serves as authentication.
 */
router.get('/download/:token', (req, res) => {
  try {
    const svc = getTempFileService();
    const result = svc.getStream(req.params.token);

    if (!result) {
      return res.status(404).json({ error: 'File not found or expired' });
    }

    const { info, stream } = result;

    // Set response headers
    res.setHeader('Content-Type', info.mime_type || 'application/octet-stream');
    res.setHeader('Content-Length', info.file_size);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(info.original_name)}"`
    );

    // Pipe file stream to response
    stream.on('error', (err) => {
      logger.error(`[temp-files] Stream error for token ${req.params.token}: ${err.message}`);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to stream file' });
      }
    });

    stream.pipe(res);
  } catch (err) {
    logger.error(`[temp-files] GET /download/:token error: ${err.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// GET / — List user's temp files (JWT auth)
// ---------------------------------------------------------------------------

router.get('/', authenticate, (req, res) => {
  try {
    const svc = getTempFileService();
    const files = svc.listForUser(req.user.id);
    res.json({ files });
  } catch (err) {
    logger.error(`[temp-files] GET / error: ${err.message}`);
    res.status(500).json({ error: 'Failed to list temp files' });
  }
});

// ---------------------------------------------------------------------------
// POST /upload — Upload a temp file (JWT auth + multer)
// ---------------------------------------------------------------------------

router.post('/upload', authenticate, upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided. Use form field name "file".' });
    }

    const svc = getTempFileService();

    // Build options from request body
    const options = {};
    if (req.body.ttlHours) options.ttlHours = parseInt(req.body.ttlHours, 10) || 24;
    if (req.body.localAgentId) options.localAgentId = req.body.localAgentId;
    if (req.body.source) options.source = req.body.source;
    if (req.body.metadata) {
      try {
        options.metadata = typeof req.body.metadata === 'string'
          ? JSON.parse(req.body.metadata)
          : req.body.metadata;
      } catch (_) {
        // Ignore invalid metadata JSON
        options.metadata = {};
      }
    }

    const result = svc.store(
      req.user.id,
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
      options
    );

    res.status(201).json(result);
  } catch (err) {
    logger.error(`[temp-files] POST /upload error: ${err.message}`);

    // Return user-friendly message for size errors
    if (err.message && err.message.includes('exceeds maximum')) {
      return res.status(400).json({ error: err.message });
    }

    // Multer file-too-large error
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File size exceeds maximum of 50 MB' });
    }

    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// ---------------------------------------------------------------------------
// POST /agent-upload — Upload from Local Agent (API key auth, no JWT needed)
// ---------------------------------------------------------------------------

/**
 * Local Agent uploads files directly via HTTP instead of sending base64 through WebSocket.
 * Auth: Authorization: Bearer sla_... (Local Agent API key, validated via SHA256 hash lookup)
 */
router.post('/agent-upload', upload.single('file'), (req, res) => {
  try {
    // Validate API key from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer sla_')) {
      return res.status(401).json({ error: 'Missing or invalid Local Agent API key' });
    }

    const apiKey = authHeader.slice(7); // strip "Bearer "
    const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

    const db = getDatabase();
    const agent = db.prepare(
      "SELECT id, user_id, name FROM local_agents WHERE api_key_hash = ? AND status = 'active'"
    ).get(keyHash);

    if (!agent) {
      return res.status(401).json({ error: 'Invalid or revoked API key' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file provided. Use form field name "file".' });
    }

    const svc = getTempFileService();

    const options = {
      localAgentId: agent.id,
      source: req.body.source || 'local-agent',
      ttlHours: parseInt(req.body.ttlHours, 10) || 24,
    };
    if (req.body.metadata) {
      try {
        options.metadata = typeof req.body.metadata === 'string'
          ? JSON.parse(req.body.metadata)
          : req.body.metadata;
      } catch (_) {
        options.metadata = {};
      }
    }

    const result = svc.store(
      agent.user_id,
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
      options
    );

    logger.info(`[temp-files] Agent "${agent.name}" uploaded ${req.file.originalname} (${req.file.size} bytes)`);
    res.status(201).json(result);
  } catch (err) {
    logger.error(`[temp-files] POST /agent-upload error: ${err.message}`);
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File size exceeds maximum of 50 MB' });
    }
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// ---------------------------------------------------------------------------
// DELETE /:id — Delete a temp file (JWT auth)
// ---------------------------------------------------------------------------

router.delete('/:id', authenticate, (req, res) => {
  try {
    const svc = getTempFileService();
    const deleted = svc.delete(req.params.id, req.user.id);

    if (!deleted) {
      return res.status(404).json({ error: 'File not found or unauthorized' });
    }

    res.json({ success: true, message: 'File deleted' });
  } catch (err) {
    logger.error(`[temp-files] DELETE /:id error: ${err.message}`);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

module.exports = router;
