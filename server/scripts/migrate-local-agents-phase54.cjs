/**
 * Migration: Local Agent Phase 5.4 (Temp File Uploads)
 *
 * Creates:
 * - temp_files: Temporary file storage for local agent uploads
 *
 * Idempotent - safe to run multiple times.
 */

const path = require('path');

function migrate() {
  const dbPath = path.join(__dirname, '..', 'data', 'swarm.db');
  const Database = require('better-sqlite3');
  const db = new Database(dbPath, { verbose: null });
  db.pragma('journal_mode = WAL');

  console.log('=== Local Agent Migration (Phase 5.4 - Temp File Uploads) ===');

  try {
    // 1. temp_files table
    db.exec(`
      CREATE TABLE IF NOT EXISTS temp_files (
        id TEXT PRIMARY KEY,
        token TEXT NOT NULL UNIQUE,
        user_id TEXT NOT NULL,
        original_name TEXT NOT NULL,
        mime_type TEXT DEFAULT 'application/octet-stream',
        file_size INTEGER NOT NULL,
        local_path TEXT NOT NULL,
        source TEXT DEFAULT 'local-agent',
        local_agent_id TEXT,
        metadata TEXT DEFAULT '{}',
        expires_at TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);
    console.log('  [OK] temp_files table');

    // 2. Indexes
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_temp_files_token
        ON temp_files(token);
      CREATE INDEX IF NOT EXISTS idx_temp_files_user_id
        ON temp_files(user_id);
      CREATE INDEX IF NOT EXISTS idx_temp_files_expires_at
        ON temp_files(expires_at);
    `);
    console.log('  [OK] Indexes created');

    db.close();
    console.log('=== Local Agent Phase 5.4 Migration Complete ===');
  } catch (err) {
    console.error('Migration failed:', err.message);
    db.close();
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  migrate();
}

module.exports = { migrate };
