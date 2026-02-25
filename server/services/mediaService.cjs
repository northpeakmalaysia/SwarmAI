/**
 * Media Service
 * Handles media download, caching, and TTL cleanup
 *
 * Features:
 * - Download media from platform URLs
 * - Cache locally with configurable TTL per user
 * - Automatic cleanup of expired media
 * - Secure serving via API route
 */

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('./database.cjs');
const { logger } = require('./logger.cjs');

const MEDIA_DIR = path.join(__dirname, '..', 'data', 'media');

// Default TTL: 7 days
const DEFAULT_MEDIA_TTL_DAYS = 7;

// Max file size: 50MB
const MAX_FILE_SIZE = 50 * 1024 * 1024;

class MediaService {
  constructor() {
    this.ensureMediaDir();
  }

  /**
   * Ensure media directory exists
   */
  ensureMediaDir() {
    if (!fs.existsSync(MEDIA_DIR)) {
      fs.mkdirSync(MEDIA_DIR, { recursive: true });
      logger.info(`Created media directory: ${MEDIA_DIR}`);
    }
  }

  /**
   * Get user's media TTL setting from preferences
   * @param {string} userId - User ID
   * @returns {number} TTL in days
   */
  getMediaTTL(userId) {
    try {
      const db = getDatabase();
      const settings = db.prepare(`
        SELECT preferences FROM user_settings WHERE user_id = ?
      `).get(userId);

      if (settings?.preferences) {
        try {
          const prefs = JSON.parse(settings.preferences);
          const ttl = parseInt(prefs.media_ttl_days, 10);
          if (ttl && ttl >= 1 && ttl <= 30) {
            return ttl;
          }
        } catch {
          // Invalid JSON, use default
        }
      }
    } catch (error) {
      logger.warn(`Failed to get media TTL for user ${userId}: ${error.message}`);
    }
    return DEFAULT_MEDIA_TTL_DAYS;
  }

  /**
   * Set user's media TTL setting
   * @param {string} userId - User ID
   * @param {number} ttlDays - TTL in days (1-30)
   */
  setMediaTTL(userId, ttlDays) {
    const db = getDatabase();
    const days = Math.max(1, Math.min(30, parseInt(ttlDays, 10) || DEFAULT_MEDIA_TTL_DAYS));

    // Get existing settings
    let settings = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(userId);
    let preferences = {};

    if (settings?.preferences) {
      try {
        preferences = JSON.parse(settings.preferences);
      } catch {
        // Invalid JSON, start fresh
      }
    }

    preferences.media_ttl_days = days;

    if (settings) {
      db.prepare(`
        UPDATE user_settings SET preferences = ?, updated_at = datetime('now') WHERE user_id = ?
      `).run(JSON.stringify(preferences), userId);
    } else {
      db.prepare(`
        INSERT INTO user_settings (id, user_id, preferences) VALUES (?, ?, ?)
      `).run(uuidv4(), userId, JSON.stringify(preferences));
    }

    logger.info(`Set media TTL for user ${userId}: ${days} days`);
    return days;
  }

  /**
   * Download and cache media from platform URL
   * @param {string} messageId - Message ID
   * @param {string} originalUrl - Original media URL from platform
   * @param {string} mimeType - MIME type of media
   * @param {string} userId - User ID for TTL settings
   * @returns {Promise<string>} Local path or original URL on failure
   */
  async cacheMedia(messageId, originalUrl, mimeType, userId) {
    const db = getDatabase();
    const ttlDays = this.getMediaTTL(userId);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + ttlDays);

    // Check if already cached and not expired
    const existing = db.prepare(`
      SELECT * FROM media_cache WHERE message_id = ? AND expires_at > datetime('now')
    `).get(messageId);

    if (existing && existing.local_path && fs.existsSync(existing.local_path)) {
      logger.debug(`Media already cached: ${messageId}`);
      return existing.local_path;
    }

    // If expired, delete old cache
    if (existing) {
      this.deleteMedia(messageId);
    }

    // Handle Telegram file IDs (prefixed with 'telegram:')
    // These are pre-downloaded by the TelegramBotClient, so we just create the DB record
    if (originalUrl.startsWith('telegram:')) {
      const ext = this.getExtension(mimeType || 'application/octet-stream');
      const filename = `${messageId}${ext}`;
      const localPath = path.join(MEDIA_DIR, filename);

      // If file already exists (written by TelegramBotClient), just create the record
      if (fs.existsSync(localPath)) {
        const fileSize = fs.statSync(localPath).size;
        const cacheId = uuidv4();
        db.prepare(`
          INSERT OR REPLACE INTO media_cache (id, message_id, user_id, original_url, local_path, mime_type, file_size, expires_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(cacheId, messageId, userId, originalUrl, localPath, mimeType, fileSize, expiresAt.toISOString());
        logger.info(`Registered Telegram media: ${filename} (${fileSize} bytes)`);
        return localPath;
      }

      // If file doesn't exist yet, return the telegram: reference - caller will write it
      logger.debug(`Telegram media pending write: ${messageId}`);
      return localPath;
    }

    try {
      logger.info(`Downloading media for message ${messageId}: ${originalUrl.substring(0, 50)}...`);

      // Download media
      const response = await fetch(originalUrl, {
        headers: {
          'User-Agent': 'SwarmAI/2.0',
        },
        signal: AbortSignal.timeout(30000), // 30 second timeout
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Check content length
      const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
      if (contentLength > MAX_FILE_SIZE) {
        throw new Error(`File too large: ${contentLength} bytes (max ${MAX_FILE_SIZE})`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());

      // Verify size after download
      if (buffer.length > MAX_FILE_SIZE) {
        throw new Error(`Downloaded file too large: ${buffer.length} bytes`);
      }

      // Determine extension from MIME type
      const ext = this.getExtension(mimeType || response.headers.get('content-type') || '');
      const filename = `${messageId}${ext}`;
      const localPath = path.join(MEDIA_DIR, filename);

      // Save to disk
      fs.writeFileSync(localPath, buffer);

      // Save to cache table
      const cacheId = uuidv4();
      db.prepare(`
        INSERT INTO media_cache (id, message_id, user_id, original_url, local_path, mime_type, file_size, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        cacheId,
        messageId,
        userId,
        originalUrl,
        localPath,
        mimeType || response.headers.get('content-type'),
        buffer.length,
        expiresAt.toISOString()
      );

      logger.info(`Cached media: ${filename} (${buffer.length} bytes, expires: ${expiresAt.toISOString()})`);
      return localPath;

    } catch (error) {
      logger.error(`Failed to cache media for message ${messageId}: ${error.message}`);
      return originalUrl; // Fallback to original URL
    }
  }

  /**
   * Get media URL for a message (cached path or original)
   * @param {string} messageId - Message ID
   * @returns {Object|null} { localPath, originalUrl, mimeType } or null
   */
  getMedia(messageId) {
    const db = getDatabase();
    const cached = db.prepare(`
      SELECT local_path, original_url, mime_type, expires_at
      FROM media_cache WHERE message_id = ?
    `).get(messageId);

    if (!cached) {
      return null;
    }

    // Check if expired
    if (new Date(cached.expires_at) < new Date()) {
      this.deleteMedia(messageId);
      return { originalUrl: cached.original_url, mimeType: cached.mime_type, expired: true };
    }

    // Check if file still exists
    if (cached.local_path && fs.existsSync(cached.local_path)) {
      return {
        localPath: cached.local_path,
        originalUrl: cached.original_url,
        mimeType: cached.mime_type,
        expired: false
      };
    }

    // File missing, return original URL
    return { originalUrl: cached.original_url, mimeType: cached.mime_type, fileMissing: true };
  }

  /**
   * Check if media is cached and valid
   * @param {string} messageId - Message ID
   * @returns {boolean}
   */
  isCached(messageId) {
    const media = this.getMedia(messageId);
    return media && media.localPath && !media.expired && !media.fileMissing;
  }

  /**
   * Delete cached media for a message
   * @param {string} messageId - Message ID
   */
  deleteMedia(messageId) {
    const db = getDatabase();

    try {
      const cached = db.prepare('SELECT local_path FROM media_cache WHERE message_id = ?').get(messageId);

      if (cached?.local_path && fs.existsSync(cached.local_path)) {
        fs.unlinkSync(cached.local_path);
        logger.debug(`Deleted cached media file: ${cached.local_path}`);
      }

      db.prepare('DELETE FROM media_cache WHERE message_id = ?').run(messageId);
    } catch (error) {
      logger.error(`Failed to delete media for message ${messageId}: ${error.message}`);
    }
  }

  /**
   * Cleanup expired media files
   * Should be run periodically (e.g., hourly via cron)
   * @returns {number} Number of files cleaned
   */
  cleanupExpired() {
    const db = getDatabase();

    try {
      const expired = db.prepare(`
        SELECT id, local_path, message_id FROM media_cache WHERE expires_at < datetime('now')
      `).all();

      let cleaned = 0;
      for (const item of expired) {
        try {
          if (item.local_path && fs.existsSync(item.local_path)) {
            fs.unlinkSync(item.local_path);
          }
          db.prepare('DELETE FROM media_cache WHERE id = ?').run(item.id);
          cleaned++;
        } catch (error) {
          logger.error(`Failed to cleanup media ${item.id}: ${error.message}`);
        }
      }

      if (cleaned > 0) {
        logger.info(`Media cleanup: removed ${cleaned} expired files`);
      }

      return cleaned;
    } catch (error) {
      logger.error(`Media cleanup failed: ${error.message}`);
      return 0;
    }
  }

  /**
   * Get storage statistics for a user
   * @param {string} userId - User ID
   * @returns {Object} { totalFiles, totalSize, oldestExpiry, newestExpiry }
   */
  getStorageStats(userId) {
    const db = getDatabase();

    try {
      const stats = db.prepare(`
        SELECT
          COUNT(*) as total_files,
          SUM(file_size) as total_size,
          MIN(expires_at) as oldest_expiry,
          MAX(expires_at) as newest_expiry
        FROM media_cache
        WHERE user_id = ?
      `).get(userId);

      return {
        totalFiles: stats.total_files || 0,
        totalSize: stats.total_size || 0,
        totalSizeMB: ((stats.total_size || 0) / (1024 * 1024)).toFixed(2),
        oldestExpiry: stats.oldest_expiry,
        newestExpiry: stats.newest_expiry
      };
    } catch (error) {
      logger.error(`Failed to get storage stats: ${error.message}`);
      return { totalFiles: 0, totalSize: 0, totalSizeMB: '0.00' };
    }
  }

  /**
   * Delete all cached media for a user
   * @param {string} userId - User ID
   * @returns {number} Number of files deleted
   */
  clearUserMedia(userId) {
    const db = getDatabase();

    try {
      const items = db.prepare('SELECT id, local_path FROM media_cache WHERE user_id = ?').all(userId);

      let deleted = 0;
      for (const item of items) {
        try {
          if (item.local_path && fs.existsSync(item.local_path)) {
            fs.unlinkSync(item.local_path);
          }
          deleted++;
        } catch {
          // Continue with others
        }
      }

      db.prepare('DELETE FROM media_cache WHERE user_id = ?').run(userId);
      logger.info(`Cleared ${deleted} media files for user ${userId}`);
      return deleted;
    } catch (error) {
      logger.error(`Failed to clear user media: ${error.message}`);
      return 0;
    }
  }

  /**
   * Get file extension from MIME type
   * @param {string} mimeType - MIME type
   * @returns {string} File extension with dot
   */
  getExtension(mimeType) {
    const map = {
      'image/jpeg': '.jpg',
      'image/jpg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'image/svg+xml': '.svg',
      'video/mp4': '.mp4',
      'video/webm': '.webm',
      'video/quicktime': '.mov',
      'video/x-msvideo': '.avi',
      'audio/mpeg': '.mp3',
      'audio/mp3': '.mp3',
      'audio/ogg': '.ogg',
      'audio/wav': '.wav',
      'audio/webm': '.weba',
      'audio/aac': '.aac',
      'application/pdf': '.pdf',
      'application/msword': '.doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
      'application/vnd.ms-excel': '.xls',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
      'application/vnd.ms-powerpoint': '.ppt',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
      'application/zip': '.zip',
      'application/x-rar-compressed': '.rar',
      'application/x-7z-compressed': '.7z',
      'text/plain': '.txt',
      'text/csv': '.csv',
      'application/json': '.json',
    };
    return map[mimeType?.toLowerCase()] || '';
  }

  /**
   * Get MIME type from file extension
   * @param {string} ext - File extension (with or without dot)
   * @returns {string} MIME type or 'application/octet-stream'
   */
  getMimeType(ext) {
    const normalized = ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`;
    const map = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.mov': 'video/quicktime',
      '.avi': 'video/x-msvideo',
      '.mp3': 'audio/mpeg',
      '.ogg': 'audio/ogg',
      '.wav': 'audio/wav',
      '.weba': 'audio/webm',
      '.aac': 'audio/aac',
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.ppt': 'application/vnd.ms-powerpoint',
      '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      '.zip': 'application/zip',
      '.rar': 'application/x-rar-compressed',
      '.7z': 'application/x-7z-compressed',
      '.txt': 'text/plain',
      '.csv': 'text/csv',
      '.json': 'application/json',
    };
    return map[normalized] || 'application/octet-stream';
  }
}

// Singleton instance
const mediaService = new MediaService();

module.exports = {
  MediaService,
  mediaService,
  MEDIA_DIR,
  DEFAULT_MEDIA_TTL_DAYS,
  MAX_FILE_SIZE
};
