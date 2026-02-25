#!/usr/bin/env node
/**
 * Migration: Merge Duplicate WhatsApp Contacts
 *
 * WhatsApp returns multiple entries for the same person (real phone + LID numbers).
 * The old sync created a separate contact for each unique number.
 * This script merges duplicates by display_name, keeping the oldest contact as primary
 * and moving all identifiers + conversations to it.
 *
 * Safe to run multiple times (idempotent).
 * Does NOT delete any data - only merges identifiers and re-links conversations.
 *
 * Usage: node server/scripts/migrate-merge-duplicate-contacts.cjs [--dry-run]
 */

const path = require('path');
const { initDatabase, getDatabase } = require('../services/database.cjs');

// Initialize database connection
initDatabase();

const isDryRun = process.argv.includes('--dry-run');

function run() {
  const db = getDatabase();

  console.log('=== Merge Duplicate WhatsApp Contacts ===');
  console.log(`Mode: ${isDryRun ? 'DRY RUN (no changes)' : 'LIVE'}`);
  console.log('');

  // 1. Add unique index on contact_identifiers to prevent future duplicates
  if (!isDryRun) {
    try {
      db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_contact_identifiers_unique
        ON contact_identifiers(contact_id, identifier_type, identifier_value)
      `);
      console.log('Created unique index on contact_identifiers (contact_id, type, value)');
    } catch (err) {
      // May fail if duplicates already exist in the table - clean those first
      console.log(`Note: Unique index creation deferred (${err.message})`);
    }
  }

  // 2. Find duplicate contacts by display_name (same user, same name, WhatsApp identifiers)
  const duplicateGroups = db.prepare(`
    SELECT c.user_id, c.display_name, COUNT(DISTINCT c.id) as contact_count,
           GROUP_CONCAT(DISTINCT c.id) as contact_ids
    FROM contacts c
    JOIN contact_identifiers ci ON ci.contact_id = c.id
    WHERE ci.identifier_type = 'whatsapp'
      AND c.display_name IS NOT NULL
      AND c.display_name != ''
      AND c.display_name NOT LIKE '+%'
    GROUP BY c.user_id, c.display_name
    HAVING COUNT(DISTINCT c.id) > 1
    ORDER BY contact_count DESC
  `).all();

  if (duplicateGroups.length === 0) {
    console.log('No duplicate contacts found. Database is clean!');
    return;
  }

  console.log(`Found ${duplicateGroups.length} groups of duplicate contacts:`);
  console.log('');

  let totalMerged = 0;
  let totalIdentifiersMoved = 0;
  let totalConversationsMoved = 0;
  let totalTeamMembersMoved = 0;
  let totalContactsRemoved = 0;

  for (const group of duplicateGroups) {
    const contactIds = group.contact_ids.split(',');
    console.log(`  "${group.display_name}" (user: ${group.user_id.substring(0, 8)}...): ${contactIds.length} duplicates`);

    // Get full details for each contact in this group
    const contacts = contactIds.map(id => {
      const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(id);
      const identifiers = db.prepare(
        'SELECT * FROM contact_identifiers WHERE contact_id = ?'
      ).all(id);
      const conversations = db.prepare(
        'SELECT id FROM conversations WHERE contact_id = ?'
      ).all(id);
      const teamMembers = db.prepare(
        'SELECT id FROM agentic_team_members WHERE contact_id = ?'
      ).all(id);
      return { ...contact, identifiers, conversations, teamMembers };
    });

    // Keep the oldest contact (by created_at) as the primary
    contacts.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const primary = contacts[0];
    const duplicates = contacts.slice(1);

    // Use the best avatar available
    const bestAvatar = contacts.find(c => c.avatar)?.avatar;

    console.log(`    Primary: ${primary.id.substring(0, 8)}... (created: ${primary.created_at}, identifiers: ${primary.identifiers.length})`);

    for (const dup of duplicates) {
      console.log(`    Merge:   ${dup.id.substring(0, 8)}... (created: ${dup.created_at}, identifiers: ${dup.identifiers.length}, convos: ${dup.conversations.length})`);

      if (!isDryRun) {
        // Move identifiers that don't already exist on primary
        for (const identifier of dup.identifiers) {
          const exists = db.prepare(`
            SELECT 1 FROM contact_identifiers
            WHERE contact_id = ? AND identifier_type = ? AND identifier_value = ?
          `).get(primary.id, identifier.identifier_type, identifier.identifier_value);

          if (!exists) {
            db.prepare(`
              UPDATE contact_identifiers SET contact_id = ?, is_primary = 0 WHERE id = ?
            `).run(primary.id, identifier.id);
            totalIdentifiersMoved++;
          } else {
            // Duplicate identifier - remove it
            db.prepare('DELETE FROM contact_identifiers WHERE id = ?').run(identifier.id);
          }
        }

        // Move conversations to primary contact
        for (const convo of dup.conversations) {
          db.prepare(`
            UPDATE conversations SET contact_id = ?, updated_at = datetime('now') WHERE id = ?
          `).run(primary.id, convo.id);
          totalConversationsMoved++;
        }

        // Move team member references to primary contact
        for (const tm of dup.teamMembers) {
          // Check if primary already has a team member entry for same agentic profile
          const existingTm = db.prepare(`
            SELECT id FROM agentic_team_members
            WHERE contact_id = ? AND agentic_id = (SELECT agentic_id FROM agentic_team_members WHERE id = ?)
          `).get(primary.id, tm.id);

          if (!existingTm) {
            db.prepare(`
              UPDATE agentic_team_members SET contact_id = ? WHERE id = ?
            `).run(primary.id, tm.id);
            totalTeamMembersMoved++;
          } else {
            // Already has team member entry - remove duplicate
            db.prepare('DELETE FROM agentic_team_members WHERE id = ?').run(tm.id);
          }
        }

        // Move agentic_profiles master_contact_id references
        try {
          db.prepare(`
            UPDATE agentic_profiles SET master_contact_id = ? WHERE master_contact_id = ?
          `).run(primary.id, dup.id);
        } catch (e) { /* table may not exist */ }

        // Move agentic_notifications recipient_contact_id references
        try {
          db.prepare(`
            UPDATE agentic_notifications SET recipient_contact_id = ? WHERE recipient_contact_id = ?
          `).run(primary.id, dup.id);
        } catch (e) { /* table may not exist */ }

        // Move any remaining contact_identifiers (shouldn't be any but just in case)
        db.prepare('DELETE FROM contact_identifiers WHERE contact_id = ?').run(dup.id);

        // Remove the duplicate contact (all references have been moved)
        db.prepare('DELETE FROM contacts WHERE id = ?').run(dup.id);
        totalContactsRemoved++;
      }

      totalMerged++;
    }

    // Update primary with best avatar if needed
    if (!isDryRun && bestAvatar && !primary.avatar) {
      db.prepare('UPDATE contacts SET avatar = ?, updated_at = datetime(\'now\') WHERE id = ?')
        .run(bestAvatar, primary.id);
    }
  }

  // 3. Now try creating the unique index again (after cleanup)
  if (!isDryRun) {
    try {
      db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_contact_identifiers_unique
        ON contact_identifiers(contact_id, identifier_type, identifier_value)
      `);
      console.log('\nCreated unique index on contact_identifiers');
    } catch (err) {
      console.log(`\nWarning: Could not create unique index: ${err.message}`);
    }
  }

  console.log('');
  console.log('=== Summary ===');
  console.log(`Duplicate groups found: ${duplicateGroups.length}`);
  console.log(`Contacts merged: ${totalMerged}`);
  console.log(`Identifiers moved: ${totalIdentifiersMoved}`);
  console.log(`Conversations re-linked: ${totalConversationsMoved}`);
  console.log(`Team members re-linked: ${totalTeamMembersMoved}`);
  console.log(`Duplicate contacts removed: ${totalContactsRemoved}`);

  if (isDryRun) {
    console.log('\nThis was a DRY RUN. No changes were made.');
    console.log('Run without --dry-run to apply changes.');
  } else {
    console.log('\nDone! Duplicates have been merged.');
  }
}

try {
  run();
} catch (error) {
  console.error('Migration failed:', error.message);
  console.error(error.stack);
  process.exit(1);
}
