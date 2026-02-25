/**
 * Migration: Fix Contact Names
 *
 * This migration fixes corrupt contact names that were synced from WhatsApp
 * with invalid/garbage values like `$?:`, `&AM&`, `,,`, `---`, `.`
 *
 * Run: node server/scripts/migrate-fix-contact-names.cjs
 */

const path = require('path');
const Database = require('better-sqlite3');

// Database path
const DB_PATH = path.resolve(__dirname, '../data/swarm.db');

console.log('🔄 Starting contact names migration...');
console.log(`📂 Database: ${DB_PATH}`);

/**
 * Check if a contact name is valid
 * Returns false for garbage names like: $?:, &AM&, ,,, ---, ., etc.
 */
function isValidContactName(name) {
  if (!name || typeof name !== 'string') return false;

  const trimmed = name.trim();

  // Must be at least 2 characters
  if (trimmed.length < 2) return false;

  // Must have at least 2 alphanumeric characters (supports Unicode)
  const hasValidChars = /[a-zA-Z0-9\u00C0-\u024F\u1E00-\u1EFF\u4E00-\u9FFF\uAC00-\uD7AF]{2,}/u.test(trimmed);

  return hasValidChars;
}

try {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  // Find all contacts with their WhatsApp identifier
  const contacts = db.prepare(`
    SELECT
      c.id,
      c.display_name,
      ci.identifier_value as phone
    FROM contacts c
    LEFT JOIN contact_identifiers ci ON ci.contact_id = c.id AND ci.identifier_type = 'whatsapp'
  `).all();

  console.log(`\n📊 Total contacts: ${contacts.length}`);

  let fixedCount = 0;
  let invalidNames = [];

  const updateStmt = db.prepare(`
    UPDATE contacts
    SET display_name = ?, updated_at = datetime('now')
    WHERE id = ?
  `);

  for (const contact of contacts) {
    if (!isValidContactName(contact.display_name)) {
      const oldName = contact.display_name;
      const phone = contact.phone;

      // Generate a better name from phone number
      const newName = phone ? `+${phone}` : `Contact ${contact.id.slice(0, 8)}`;

      invalidNames.push({ id: contact.id, old: oldName, new: newName });

      updateStmt.run(newName, contact.id);
      fixedCount++;
    }
  }

  if (fixedCount > 0) {
    console.log(`\n🔧 Fixed ${fixedCount} contacts with invalid names:`);
    invalidNames.slice(0, 20).forEach(item => {
      console.log(`   - "${item.old}" → "${item.new}"`);
    });
    if (invalidNames.length > 20) {
      console.log(`   ... and ${invalidNames.length - 20} more`);
    }
  } else {
    console.log(`\n✅ All contact names are valid - no fixes needed`);
  }

  db.close();
  console.log('\n🎉 Migration completed successfully!');

} catch (error) {
  console.error('❌ Migration failed:', error.message);
  process.exit(1);
}
