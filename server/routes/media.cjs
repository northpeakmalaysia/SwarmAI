/**
 * Media Routes
 * Serves cached media files with authentication and ownership verification
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const { authenticate } = require('./auth.cjs');
const { getDatabase } = require('../services/database.cjs');
const { mediaService, MEDIA_DIR } = require('../services/mediaService.cjs');
const { logger } = require('../services/logger.cjs');

const router = express.Router();

/**
 * GET /api/media/:messageId
 * Serve cached media file for a message
 * Requires authentication and ownership verification
 */
router.get('/:messageId', authenticate, (req, res) => {
  const { messageId } = req.params;
  const db = getDatabase();

  try {
    // Verify ownership through message → conversation → user
    const message = db.prepare(`
      SELECT m.*, c.user_id
      FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      WHERE m.id = ?
    `).get(messageId);

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    if (message.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get cached media info
    const media = mediaService.getMedia(messageId);

    if (!media) {
      // No cache entry, try to return original URL if stored in message
      if (message.media_url) {
        return res.redirect(message.media_url);
      }
      return res.status(404).json({ error: 'Media not found' });
    }

    if (media.expired || media.fileMissing) {
      // Cache expired or file missing, redirect to original
      if (media.originalUrl) {
        return res.redirect(media.originalUrl);
      }
      return res.status(404).json({ error: 'Media expired or unavailable' });
    }

    // Serve the cached file
    const filePath = media.localPath;

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Media file not found' });
    }

    // Set appropriate content type
    const mimeType = media.mimeType || 'application/octet-stream';
    res.setHeader('Content-Type', mimeType);

    // Set cache headers (cache for 1 hour since we handle TTL ourselves)
    res.setHeader('Cache-Control', 'private, max-age=3600');

    // Stream the file
    res.sendFile(filePath, (err) => {
      if (err && !res.headersSent) {
        logger.error(`Failed to serve media ${messageId}: ${err.message}`);
        res.status(500).json({ error: 'Failed to serve media' });
      }
    });

  } catch (error) {
    logger.error(`Media route error: ${error.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/media/:messageId/info
 * Get media cache information
 */
router.get('/:messageId/info', authenticate, (req, res) => {
  const { messageId } = req.params;
  const db = getDatabase();

  try {
    // Verify ownership
    const message = db.prepare(`
      SELECT m.*, c.user_id
      FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      WHERE m.id = ?
    `).get(messageId);

    if (!message || message.user_id !== req.user.id) {
      return res.status(404).json({ error: 'Media not found' });
    }

    const media = mediaService.getMedia(messageId);

    if (!media) {
      return res.json({
        messageId,
        cached: false,
        originalUrl: message.media_url || null
      });
    }

    res.json({
      messageId,
      cached: !media.expired && !media.fileMissing,
      mimeType: media.mimeType,
      originalUrl: media.originalUrl,
      expired: media.expired || false,
      fileMissing: media.fileMissing || false
    });

  } catch (error) {
    logger.error(`Media info error: ${error.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/media/:messageId
 * Delete cached media for a message
 */
router.delete('/:messageId', authenticate, (req, res) => {
  const { messageId } = req.params;
  const db = getDatabase();

  try {
    // Verify ownership
    const message = db.prepare(`
      SELECT m.*, c.user_id
      FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      WHERE m.id = ?
    `).get(messageId);

    if (!message || message.user_id !== req.user.id) {
      return res.status(404).json({ error: 'Media not found' });
    }

    mediaService.deleteMedia(messageId);
    res.json({ success: true, message: 'Media cache deleted' });

  } catch (error) {
    logger.error(`Media delete error: ${error.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/media/stats
 * Get media storage statistics for current user
 */
router.get('/user/stats', authenticate, (req, res) => {
  try {
    const stats = mediaService.getStorageStats(req.user.id);
    const ttlDays = mediaService.getMediaTTL(req.user.id);

    res.json({
      ...stats,
      ttlDays,
      maxFileSizeMB: 50
    });

  } catch (error) {
    logger.error(`Media stats error: ${error.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/media/settings/ttl
 * Update media TTL setting for current user
 */
router.put('/settings/ttl', authenticate, (req, res) => {
  const { ttlDays } = req.body;

  if (ttlDays === undefined) {
    return res.status(400).json({ error: 'ttlDays is required' });
  }

  try {
    const actualTtl = mediaService.setMediaTTL(req.user.id, ttlDays);
    res.json({ success: true, ttlDays: actualTtl });

  } catch (error) {
    logger.error(`Media TTL update error: ${error.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/media/user/clear
 * Clear all cached media for current user
 */
router.delete('/user/clear', authenticate, (req, res) => {
  try {
    const deleted = mediaService.clearUserMedia(req.user.id);
    res.json({ success: true, deletedCount: deleted });

  } catch (error) {
    logger.error(`Media clear error: ${error.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/media/cleanup
 * Manually trigger cleanup of expired media (admin only)
 */
router.post('/cleanup', authenticate, (req, res) => {
  // Only allow superusers to run cleanup
  if (!req.user.isSuperuser) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  try {
    const cleaned = mediaService.cleanupExpired();
    res.json({ success: true, cleanedCount: cleaned });

  } catch (error) {
    logger.error(`Media cleanup error: ${error.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
