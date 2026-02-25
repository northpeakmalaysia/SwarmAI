/**
 * Migration: Deduplicate Messages
 *
 * This script removes duplicate messages that have the same external_id
 * within the same conversation. Keeps the oldest message (first inserted).
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'swarm.db');

function migrate() {
  console.log('Opening database at:', DB_PATH);
  const db = new Database(DB_PATH);

  try {
    // Find all duplicate external_ids
    const duplicates = db.prepare(`
      SELECT conversation_id, external_id, COUNT(*) as count, MIN(rowid) as keep_rowid
      FROM messages
      WHERE external_id IS NOT NULL
      GROUP BY conversation_id, external_id
      HAVING COUNT(*) > 1
    `).all();

    console.log(`Found ${duplicates.length} sets of duplicate messages`);

    if (duplicates.length === 0) {
      console.log('No duplicates to fix. Exiting.');
      return;
    }

    // Begin transaction
    const beginTx = db.prepare('BEGIN');
    const commitTx = db.prepare('COMMIT');
    const rollbackTx = db.prepare('ROLLBACK');

    beginTx.run();

    let totalDeleted = 0;

    try {
      for (const dup of duplicates) {
        // Delete all but the oldest (lowest rowid) for this external_id + conversation_id
        const deleteResult = db.prepare(`
          DELETE FROM messages
          WHERE conversation_id = ?
            AND external_id = ?
            AND rowid != ?
        `).run(dup.conversation_id, dup.external_id, dup.keep_rowid);

        totalDeleted += deleteResult.changes;

        if (deleteResult.changes > 0) {
          console.log(`Removed ${deleteResult.changes} duplicate(s) for external_id: ${dup.external_id.substring(0, 50)}...`);
        }
      }

      commitTx.run();
      console.log(`\nSuccessfully removed ${totalDeleted} duplicate messages`);

    } catch (err) {
      rollbackTx.run();
      console.error('Error during deduplication, rolled back:', err);
      throw err;
    }

    // Verify
    const remaining = db.prepare(`
      SELECT COUNT(*) as count
      FROM (
        SELECT conversation_id, external_id, COUNT(*) as cnt
        FROM messages
        WHERE external_id IS NOT NULL
        GROUP BY conversation_id, external_id
        HAVING COUNT(*) > 1
      )
    `).get();

    console.log(`Remaining duplicates: ${remaining.count}`);

  } finally {
    db.close();
  }
}

migrate();
