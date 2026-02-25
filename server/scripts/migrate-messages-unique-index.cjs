/**
 * Migration: Add UNIQUE index on messages(conversation_id, external_id)
 *
 * This migration:
 * 1. Removes duplicate messages (keeps the oldest by rowid)
 * 2. Creates a UNIQUE index so INSERT OR IGNORE works correctly
 *
 * Run: node server/scripts/migrate-messages-unique-index.cjs
 */

const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, '..', 'data', 'swarm.db');

function migrate() {
  console.log('=== Messages Unique Index Migration ===');
  console.log(`Database: ${DB_PATH}`);

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  try {
    // Check if index already exists
    const existingIndex = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'index' AND name = 'idx_messages_conv_ext_id'
    `).get();

    if (existingIndex) {
      console.log('Index idx_messages_conv_ext_id already exists. Skipping migration.');
      db.close();
      return;
    }

    // Count duplicates before cleanup
    const dupeCount = db.prepare(`
      SELECT COUNT(*) as count FROM (
        SELECT conversation_id, external_id, COUNT(*) as cnt
        FROM messages
        WHERE external_id IS NOT NULL AND external_id != ''
        GROUP BY conversation_id, external_id
        HAVING cnt > 1
      )
    `).get();

    console.log(`Found ${dupeCount.count} sets of duplicate messages`);

    if (dupeCount.count > 0) {
      // Remove duplicates - keep the row with the smallest rowid (oldest)
      const deleteResult = db.prepare(`
        DELETE FROM messages
        WHERE rowid NOT IN (
          SELECT MIN(rowid)
          FROM messages
          WHERE external_id IS NOT NULL AND external_id != ''
          GROUP BY conversation_id, external_id
        )
        AND external_id IS NOT NULL AND external_id != ''
      `).run();

      console.log(`Removed ${deleteResult.changes} duplicate message rows`);
    }

    // Create the UNIQUE index (only for non-null external_ids)
    db.prepare(`
      CREATE UNIQUE INDEX idx_messages_conv_ext_id
      ON messages(conversation_id, external_id)
      WHERE external_id IS NOT NULL AND external_id != ''
    `).run();

    console.log('Created UNIQUE index idx_messages_conv_ext_id');

    // Verify
    const totalMessages = db.prepare('SELECT COUNT(*) as count FROM messages').get();
    console.log(`Total messages after migration: ${totalMessages.count}`);

    console.log('=== Migration complete ===');
  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  } finally {
    db.close();
  }
}

migrate();
