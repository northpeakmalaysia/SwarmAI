/**
 * Session Cleanup Service
 * Handles detection and cleanup of orphaned WhatsApp session folders
 */

const fs = require('fs');
const path = require('path');
const { getDatabase } = require('./database.cjs');
const { logger } = require('./logger.cjs');

const SESSION_DIR = path.join(__dirname, '..', 'data', 'whatsapp-sessions');

class SessionCleanupService {
  /**
   * Get all orphaned session folders
   * (folders that exist on disk but have no matching platform_account in database)
   */
  getOrphanedSessions() {
    try {
      // Check if session directory exists
      if (!fs.existsSync(SESSION_DIR)) {
        return [];
      }

      // List all session folders
      const folders = fs.readdirSync(SESSION_DIR)
        .filter(f => f.startsWith('session-') && fs.statSync(path.join(SESSION_DIR, f)).isDirectory())
        .map(f => f.replace('session-', ''));

      if (folders.length === 0) {
        return [];
      }

      // Get all existing platform account IDs from database
      const db = getDatabase();
      const existingAccounts = db.prepare(
        'SELECT id FROM platform_accounts WHERE platform = ?'
      ).all('whatsapp');
      const existingIds = new Set(existingAccounts.map(r => r.id));

      // Find orphaned sessions (folders without matching DB records)
      const orphaned = folders
        .filter(id => !existingIds.has(id))
        .map(id => {
          const folderPath = path.join(SESSION_DIR, `session-${id}`);
          const stats = fs.statSync(folderPath);
          return {
            sessionId: id,
            folderName: `session-${id}`,
            sizeBytes: this.getFolderSize(folderPath),
            lastModified: stats.mtime.toISOString()
          };
        });

      return orphaned;
    } catch (error) {
      logger.error(`Error getting orphaned sessions: ${error.message}`);
      return [];
    }
  }

  /**
   * Delete a specific orphaned session folder
   * @param {string} sessionId - The session ID (UUID without 'session-' prefix)
   * @returns {boolean} - True if deleted, false if not found or error
   */
  deleteOrphanedSession(sessionId) {
    try {
      // Verify it's actually orphaned (no DB record)
      const db = getDatabase();
      const exists = db.prepare(
        'SELECT id FROM platform_accounts WHERE id = ?'
      ).get(sessionId);

      if (exists) {
        logger.warn(`Cannot delete session ${sessionId} - platform account still exists`);
        return false;
      }

      const folderPath = path.join(SESSION_DIR, `session-${sessionId}`);
      if (fs.existsSync(folderPath)) {
        fs.rmSync(folderPath, { recursive: true, force: true });
        logger.info(`Deleted orphaned session: session-${sessionId}`);
        return true;
      }

      return false;
    } catch (error) {
      logger.error(`Error deleting orphaned session ${sessionId}: ${error.message}`);
      return false;
    }
  }

  /**
   * Delete all orphaned session folders
   * @returns {{ deleted: number, total: number }} - Number of deleted sessions
   */
  cleanupAllOrphaned() {
    const orphaned = this.getOrphanedSessions();
    let deleted = 0;

    for (const session of orphaned) {
      if (this.deleteOrphanedSession(session.sessionId)) {
        deleted++;
      }
    }

    logger.info(`Cleaned up ${deleted}/${orphaned.length} orphaned sessions`);
    return { deleted, total: orphaned.length };
  }

  /**
   * Calculate folder size recursively
   * @param {string} folderPath - Path to folder
   * @returns {number} - Size in bytes
   */
  getFolderSize(folderPath) {
    try {
      let size = 0;
      const files = fs.readdirSync(folderPath, { withFileTypes: true });

      for (const file of files) {
        const filePath = path.join(folderPath, file.name);
        if (file.isDirectory()) {
          size += this.getFolderSize(filePath);
        } else {
          size += fs.statSync(filePath).size;
        }
      }

      return size;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Format bytes to human-readable string
   * @param {number} bytes - Size in bytes
   * @returns {string} - Formatted size (e.g., "1.5 MB")
   */
  formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

// Export singleton instance
const sessionCleanupService = new SessionCleanupService();

module.exports = { SessionCleanupService, sessionCleanupService };
