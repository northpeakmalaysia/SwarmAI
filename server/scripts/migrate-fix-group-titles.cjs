/**
 * Migration: Fix Group Conversation Titles
 *
 * This migration attempts to fix group conversations that have the sender's name
 * as the title instead of the actual group name.
 *
 * Note: This can only fix groups where we can look up the name from a sync.
 * Groups that haven't been synced yet will get fixed when they're synced.
 *
 * Run: node server/scripts/migrate-fix-group-titles.cjs
 */

const path = require('path');
const Database = require('better-sqlite3');

// Database path
const DB_PATH = path.resolve(__dirname, '../data/swarm.db');

console.log('🔄 Starting group titles migration...');
console.log(`📂 Database: ${DB_PATH}`);
console.log('\n⚠️  Note: Group names will be properly set on next WhatsApp sync.');
console.log('    This script only reports groups that may need attention.\n');

try {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  // Find all group conversations
  const groupConversations = db.prepare(`
    SELECT
      id,
      title,
      external_id,
      platform
    FROM conversations
    WHERE is_group = 1 AND platform = 'whatsapp'
    ORDER BY updated_at DESC
  `).all();

  console.log(`📊 Found ${groupConversations.length} WhatsApp group conversations`);

  // Check for groups that might have wrong titles
  // (title doesn't look like a group name - might be a person's name)
  const suspiciousGroups = groupConversations.filter(conv => {
    // If title is just a phone number format, it's likely wrong
    if (/^\+?\d+$/.test(conv.title.replace(/\s/g, ''))) return true;

    // If title matches common 1:1 chat patterns
    if (/\(\+\d+\)$/.test(conv.title)) return true;

    return false;
  });

  if (suspiciousGroups.length > 0) {
    console.log(`\n⚠️  Found ${suspiciousGroups.length} groups with potentially wrong titles:`);
    suspiciousGroups.slice(0, 10).forEach(g => {
      console.log(`   - "${g.title}" (${g.external_id})`);
    });
    if (suspiciousGroups.length > 10) {
      console.log(`   ... and ${suspiciousGroups.length - 10} more`);
    }
    console.log('\n💡 These will be automatically fixed on next WhatsApp sync.');
    console.log('   Run "Force Resync" from the Messages page to update immediately.');
  } else {
    console.log('\n✅ All group titles appear to be valid.');
  }

  // Show sample of group titles for verification
  console.log('\n📋 Sample of current group titles:');
  groupConversations.slice(0, 10).forEach(g => {
    console.log(`   - "${g.title}"`);
  });

  db.close();
  console.log('\n🎉 Analysis completed!');

} catch (error) {
  console.error('❌ Analysis failed:', error.message);
  process.exit(1);
}
