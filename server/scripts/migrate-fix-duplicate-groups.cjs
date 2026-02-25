/**
 * Migration: Fix Duplicate Group Conversations
 *
 * This script fixes duplicate conversations caused by different external_id formats:
 * - WhatsApp sync uses: "120363420625326989@g.us"
 * - UnifiedMessageService used: "whatsapp-group:120363420625326989@g.us"
 *
 * The fix merges duplicates by:
 * 1. Finding pairs of conversations with matching chat IDs
 * 2. Moving messages from the prefixed version to the raw ID version
 * 3. Deleting the duplicate prefixed conversation
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'swarm.db');

function migrate() {
  console.log('Opening database at:', DB_PATH);
  const db = new Database(DB_PATH);

  try {
    // Find duplicate group conversations
    // Looking for pairs where one has the raw @g.us format and another has whatsapp-group: prefix
    const duplicates = db.prepare(`
      SELECT
        c1.id as raw_id,
        c1.external_id as raw_external_id,
        c1.title as raw_title,
        c1.created_at as raw_created_at,
        c2.id as prefixed_id,
        c2.external_id as prefixed_external_id,
        c2.title as prefixed_title,
        c2.created_at as prefixed_created_at,
        (SELECT COUNT(*) FROM messages WHERE conversation_id = c1.id) as raw_msg_count,
        (SELECT COUNT(*) FROM messages WHERE conversation_id = c2.id) as prefixed_msg_count
      FROM conversations c1
      INNER JOIN conversations c2 ON c2.external_id = 'whatsapp-group:' || c1.external_id
      WHERE c1.external_id LIKE '%@g.us'
        AND c1.is_group = 1
    `).all();

    console.log(`Found ${duplicates.length} duplicate conversation pairs`);

    if (duplicates.length === 0) {
      console.log('No duplicates to fix. Exiting.');
      return;
    }

    // Begin transaction
    const beginTx = db.prepare('BEGIN');
    const commitTx = db.prepare('COMMIT');
    const rollbackTx = db.prepare('ROLLBACK');

    beginTx.run();

    try {
      for (const dup of duplicates) {
        console.log(`\nProcessing duplicate pair:`);
        console.log(`  Raw: ${dup.raw_id} (${dup.raw_external_id}) - "${dup.raw_title}" - ${dup.raw_msg_count} messages`);
        console.log(`  Prefixed: ${dup.prefixed_id} (${dup.prefixed_external_id}) - "${dup.prefixed_title}" - ${dup.prefixed_msg_count} messages`);

        // Keep the one with the raw external_id (from WhatsApp sync)
        // Move messages from prefixed to raw (only if they don't already exist)
        if (dup.prefixed_msg_count > 0) {
          // Get messages from prefixed that don't exist in raw
          const messagesToMove = db.prepare(`
            SELECT id, external_id FROM messages
            WHERE conversation_id = ?
              AND external_id NOT IN (
                SELECT external_id FROM messages WHERE conversation_id = ?
              )
          `).all(dup.prefixed_id, dup.raw_id);

          if (messagesToMove.length > 0) {
            for (const msg of messagesToMove) {
              db.prepare(`
                UPDATE messages SET conversation_id = ? WHERE id = ?
              `).run(dup.raw_id, msg.id);
            }
            console.log(`  Moved ${messagesToMove.length} unique messages to raw conversation`);
          }

          // Delete any remaining messages in prefixed (they're duplicates)
          const deleteResult = db.prepare(`
            DELETE FROM messages WHERE conversation_id = ?
          `).run(dup.prefixed_id);
          if (deleteResult.changes > 0) {
            console.log(`  Deleted ${deleteResult.changes} duplicate messages from prefixed conversation`);
          }
        }

        // Update title if the raw one has a bad title (phone number or "Unknown")
        const rawTitleIsBad = dup.raw_title === 'Unknown' ||
                              dup.raw_title === 'Group Chat' ||
                              dup.raw_title.match(/^\+?\d+$/);
        const prefixedTitleIsGood = dup.prefixed_title &&
                                     dup.prefixed_title !== 'Unknown' &&
                                     dup.prefixed_title !== 'Group Chat' &&
                                     !dup.prefixed_title.match(/^\+?\d+$/);

        if (rawTitleIsBad && prefixedTitleIsGood) {
          db.prepare(`
            UPDATE conversations SET title = ? WHERE id = ?
          `).run(dup.prefixed_title, dup.raw_id);
          console.log(`  Updated title from "${dup.raw_title}" to "${dup.prefixed_title}"`);
        }

        // Delete the prefixed duplicate
        db.prepare(`DELETE FROM conversations WHERE id = ?`).run(dup.prefixed_id);
        console.log(`  Deleted prefixed duplicate conversation`);
      }

      commitTx.run();
      console.log(`\nSuccessfully fixed ${duplicates.length} duplicate conversation pairs`);

    } catch (err) {
      rollbackTx.run();
      console.error('Error during migration, rolled back:', err);
      throw err;
    }

    // Also fix any remaining prefixed external_ids that don't have a raw counterpart
    // by removing the prefix
    const orphanedPrefixed = db.prepare(`
      SELECT id, external_id, title
      FROM conversations
      WHERE external_id LIKE 'whatsapp-group:%@g.us'
    `).all();

    if (orphanedPrefixed.length > 0) {
      console.log(`\nFixing ${orphanedPrefixed.length} orphaned prefixed conversations...`);

      beginTx.run();
      try {
        for (const conv of orphanedPrefixed) {
          const rawExternalId = conv.external_id.replace('whatsapp-group:', '');
          console.log(`  Converting ${conv.external_id} to ${rawExternalId}`);
          db.prepare(`
            UPDATE conversations SET external_id = ? WHERE id = ?
          `).run(rawExternalId, conv.id);
        }
        commitTx.run();
        console.log(`Fixed ${orphanedPrefixed.length} orphaned conversations`);
      } catch (err) {
        rollbackTx.run();
        console.error('Error fixing orphaned conversations:', err);
      }
    }

  } finally {
    db.close();
  }
}

migrate();
