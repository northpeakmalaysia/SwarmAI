/**
 * TempFileService
 * Singleton service for temporary file storage with 24h TTL auto-cleanup.
 *
 * Stores files to disk under server/data/temp-files/{userId}/ and tracks
 * metadata in the temp_files SQLite table. Each file gets a unique download
 * token that can be used without JWT auth (the token IS the auth).
 *
 * Usage:
 *   const { getTempFileService } = require('./TempFileService.cjs');
 *   const svc = getTempFileService();
 *   const result = await svc.store(userId, buffer, 'report.pdf', 'application/pdf');
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { getDatabase } = require('./database.cjs');
const { logger } = require('./logger.cjs');

const STORAGE_DIR = path.join(__dirname, '..', 'data', 'temp-files');
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

class TempFileService {
  constructor() {
    // Ensure root storage directory exists
    if (!fs.existsSync(STORAGE_DIR)) {
      fs.mkdirSync(STORAGE_DIR, { recursive: true });
    }
    this._cleanupTimer = null;
    logger.info('[TempFileService] Initialized, storage dir: ' + STORAGE_DIR);
  }

  // ---------------------------------------------------------------------------
  // store
  // ---------------------------------------------------------------------------

  /**
   * Store a file buffer to disk and register it in the database.
   *
   * @param {string} userId       - Owner user id
   * @param {Buffer} buffer       - File contents
   * @param {string} originalName - Original filename (e.g. "photo.jpg")
   * @param {string} mimeType     - MIME type (e.g. "image/jpeg")
   * @param {Object} [options]
   * @param {number} [options.ttlHours=24]      - Time-to-live in hours
   * @param {number} [options.maxTtlHours=72]   - Maximum allowed TTL
   * @param {string} [options.localAgentId]      - Associated local agent id
   * @param {string} [options.source='local-agent'] - Upload source label
   * @param {Object} [options.metadata={}]       - Arbitrary JSON metadata
   * @returns {Object} Stored file info with download URL
   */
  store(userId, buffer, originalName, mimeType, options = {}) {
    const {
      ttlHours = 24,
      maxTtlHours = 72,
      localAgentId = null,
      source = 'local-agent',
      metadata = {}
    } = options;

    // --- Validation ---
    if (!userId) throw new Error('userId is required');
    if (!Buffer.isBuffer(buffer)) throw new Error('buffer must be a Buffer');
    if (!originalName) throw new Error('originalName is required');
    if (buffer.length > MAX_FILE_SIZE) {
      throw new Error(`File size ${buffer.length} exceeds maximum of ${MAX_FILE_SIZE} bytes (50 MB)`);
    }

    const effectiveTtl = Math.min(Math.max(ttlHours, 1), maxTtlHours);

    // Generate identifiers
    const id = crypto.randomUUID();
    const token = crypto.randomBytes(32).toString('hex');

    // Ensure user subdirectory
    const userDir = path.join(STORAGE_DIR, userId);
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
    }

    // Sanitize filename — keep only safe chars
    const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const diskFilename = `${id}_${safeName}`;
    const localPath = path.join(userDir, diskFilename);

    // Write file to disk
    fs.writeFileSync(localPath, buffer);

    // Calculate expiry
    const now = new Date();
    const expiresAt = new Date(now.getTime() + effectiveTtl * 3600 * 1000);
    const createdAtISO = now.toISOString().replace('T', ' ').replace('Z', '').split('.')[0];
    const expiresAtISO = expiresAt.toISOString().replace('T', ' ').replace('Z', '').split('.')[0];

    // Insert database row (rollback file on failure)
    const db = getDatabase();
    try {
      db.prepare(`
        INSERT INTO temp_files (id, token, user_id, original_name, mime_type, file_size, local_path, source, local_agent_id, metadata, expires_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        token,
        userId,
        originalName,
        mimeType || 'application/octet-stream',
        buffer.length,
        localPath,
        source,
        localAgentId,
        JSON.stringify(metadata),
        expiresAtISO,
        createdAtISO
      );
    } catch (dbErr) {
      // Rollback: remove orphaned file on disk
      try { fs.unlinkSync(localPath); } catch { /* ignore */ }
      throw dbErr;
    }

    const result = {
      id,
      token,
      downloadUrl: '/api/temp-files/download/' + token,
      originalName,
      mimeType: mimeType || 'application/octet-stream',
      size: buffer.length,
      expiresAt: expiresAtISO,
      createdAt: createdAtISO
    };

    logger.info(`[TempFileService] Stored file "${originalName}" (${buffer.length} bytes) for user ${userId}, expires ${expiresAtISO}`);
    return result;
  }

  // ---------------------------------------------------------------------------
  // getByToken
  // ---------------------------------------------------------------------------

  /**
   * Look up a temp file by its download token.
   * Returns null if not found or expired.
   *
   * @param {string} token
   * @returns {Object|null} File info row or null
   */
  getByToken(token) {
    if (!token) return null;

    const db = getDatabase();
    const row = db.prepare('SELECT * FROM temp_files WHERE token = ?').get(token);
    if (!row) return null;

    // Check expiry
    const expiresAt = new Date(row.expires_at + 'Z'); // SQLite stores UTC without Z
    if (expiresAt < new Date()) {
      logger.debug(`[TempFileService] Token lookup for expired file id=${row.id}`);
      return null;
    }

    return row;
  }

  // ---------------------------------------------------------------------------
  // getStream
  // ---------------------------------------------------------------------------

  /**
   * Get a readable stream for the file identified by token.
   * Returns { info, stream } or null if not found / expired / file missing.
   *
   * @param {string} token
   * @returns {{ info: Object, stream: fs.ReadStream } | null}
   */
  getStream(token) {
    const info = this.getByToken(token);
    if (!info) return null;

    // Verify the file still exists on disk
    if (!fs.existsSync(info.local_path)) {
      logger.warn(`[TempFileService] File on disk missing for id=${info.id}, path=${info.local_path}`);
      return null;
    }

    return {
      info,
      stream: fs.createReadStream(info.local_path)
    };
  }

  // ---------------------------------------------------------------------------
  // delete
  // ---------------------------------------------------------------------------

  /**
   * Delete a specific temp file. Validates that userId matches the owner.
   *
   * @param {string} id     - File record id
   * @param {string} userId - Requesting user id (must match owner)
   * @returns {boolean} true if deleted, false if not found or unauthorized
   */
  delete(id, userId) {
    if (!id || !userId) return false;

    const db = getDatabase();
    const row = db.prepare('SELECT * FROM temp_files WHERE id = ? AND user_id = ?').get(id, userId);
    if (!row) return false;

    // Remove from disk (ignore if already gone)
    try {
      if (fs.existsSync(row.local_path)) {
        fs.unlinkSync(row.local_path);
      }
    } catch (err) {
      if (err.code !== 'ENOENT') {
        logger.warn(`[TempFileService] Failed to delete file from disk: ${err.message}`);
      }
    }

    // Remove from database
    db.prepare('DELETE FROM temp_files WHERE id = ?').run(id);
    logger.info(`[TempFileService] Deleted file id=${id} for user ${userId}`);
    return true;
  }

  // ---------------------------------------------------------------------------
  // listForUser
  // ---------------------------------------------------------------------------

  /**
   * List non-expired temp files for a user, newest first.
   *
   * @param {string} userId
   * @param {number} [limit=50]
   * @returns {Array<Object>}
   */
  listForUser(userId, limit = 50) {
    if (!userId) return [];

    const db = getDatabase();
    const rows = db.prepare(
      'SELECT * FROM temp_files WHERE user_id = ? ORDER BY created_at DESC LIMIT ?'
    ).all(userId, limit);

    // Filter out expired entries
    const now = new Date();
    return rows.filter(row => {
      const expiresAt = new Date(row.expires_at + 'Z');
      return expiresAt >= now;
    });
  }

  // ---------------------------------------------------------------------------
  // cleanupExpired
  // ---------------------------------------------------------------------------

  /**
   * Remove all expired temp files from disk and database.
   * Also removes empty user subdirectories.
   *
   * @returns {number} Count of cleaned-up files
   */
  cleanupExpired() {
    const db = getDatabase();

    // Find all expired rows
    const expiredRows = db.prepare(
      "SELECT * FROM temp_files WHERE expires_at < datetime('now')"
    ).all();

    if (expiredRows.length === 0) {
      return 0;
    }

    // Delete files from disk
    const userDirsToCheck = new Set();
    for (const row of expiredRows) {
      try {
        if (fs.existsSync(row.local_path)) {
          fs.unlinkSync(row.local_path);
        }
        // Track parent dir for potential cleanup
        userDirsToCheck.add(path.dirname(row.local_path));
      } catch (err) {
        if (err.code !== 'ENOENT') {
          logger.warn(`[TempFileService] Cleanup: failed to delete ${row.local_path}: ${err.message}`);
        }
      }
    }

    // Delete expired rows from database
    const result = db.prepare(
      "DELETE FROM temp_files WHERE expires_at < datetime('now')"
    ).run();

    // Remove empty user subdirectories
    for (const dir of userDirsToCheck) {
      try {
        if (fs.existsSync(dir)) {
          const remaining = fs.readdirSync(dir);
          if (remaining.length === 0) {
            fs.rmdirSync(dir);
            logger.debug(`[TempFileService] Removed empty directory: ${dir}`);
          }
        }
      } catch (err) {
        // Non-critical, just log
        logger.debug(`[TempFileService] Could not remove directory ${dir}: ${err.message}`);
      }
    }

    logger.info(`[TempFileService] Cleanup complete: ${result.changes} expired files removed`);
    return result.changes;
  }

  // ---------------------------------------------------------------------------
  // Periodic cleanup interval
  // ---------------------------------------------------------------------------

  /**
   * Start a recurring interval that calls cleanupExpired().
   * Default: every 1 hour (3600000 ms).
   *
   * @param {number} [intervalMs=3600000]
   */
  startCleanupInterval(intervalMs = 3600000) {
    if (this._cleanupTimer) {
      clearInterval(this._cleanupTimer);
    }
    this._cleanupTimer = setInterval(() => {
      try {
        this.cleanupExpired();
      } catch (err) {
        logger.error(`[TempFileService] Periodic cleanup error: ${err.message}`);
      }
    }, intervalMs);

    // Run one cleanup immediately on start
    try {
      this.cleanupExpired();
    } catch (err) {
      logger.error(`[TempFileService] Initial cleanup error: ${err.message}`);
    }

    logger.info(`[TempFileService] Cleanup interval started (every ${intervalMs / 1000}s)`);
  }

  /**
   * Stop the periodic cleanup interval.
   */
  stopCleanupInterval() {
    if (this._cleanupTimer) {
      clearInterval(this._cleanupTimer);
      this._cleanupTimer = null;
      logger.info('[TempFileService] Cleanup interval stopped');
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let instance = null;

/**
 * Get the singleton TempFileService instance.
 * @returns {TempFileService}
 */
function getTempFileService() {
  if (!instance) {
    instance = new TempFileService();
  }
  return instance;
}

module.exports = { getTempFileService };
