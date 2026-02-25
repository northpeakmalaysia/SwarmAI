/**
 * Migration: Fix Conversation Categories
 *
 * This migration updates existing conversations to have the correct category
 * based on their external_id pattern:
 * - @newsletter → category = 'news'
 * - @broadcast → category = 'status'
 * - Everything else → category = 'chat' (default)
 *
 * Run: node server/scripts/migrate-fix-conversation-categories.cjs
 */

const path = require('path');
const Database = require('better-sqlite3');

// Database path
const DB_PATH = path.resolve(__dirname, '../data/swarm.db');

console.log('🔄 Starting conversation categories migration...');
console.log(`📂 Database: ${DB_PATH}`);

try {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  // Count affected rows before update
  const newsletterCount = db.prepare(`
    SELECT COUNT(*) as count FROM conversations
    WHERE external_id LIKE '%@newsletter%' AND (category IS NULL OR category != 'news')
  `).get();

  const broadcastCount = db.prepare(`
    SELECT COUNT(*) as count FROM conversations
    WHERE (external_id LIKE '%@broadcast%' OR external_id = 'status@broadcast')
    AND (category IS NULL OR category != 'status')
  `).get();

  const nullCategoryCount = db.prepare(`
    SELECT COUNT(*) as count FROM conversations
    WHERE category IS NULL
  `).get();

  console.log(`\n📊 Current state:`);
  console.log(`   - Newsletters with wrong category: ${newsletterCount.count}`);
  console.log(`   - Broadcasts with wrong category: ${broadcastCount.count}`);
  console.log(`   - Conversations with NULL category: ${nullCategoryCount.count}`);

  // Update newsletters to 'news' category
  const updateNewsletters = db.prepare(`
    UPDATE conversations
    SET category = 'news', updated_at = datetime('now')
    WHERE external_id LIKE '%@newsletter%'
  `);
  const newsletterResult = updateNewsletters.run();
  console.log(`\n✅ Updated ${newsletterResult.changes} newsletters to category 'news'`);

  // Update broadcasts to 'status' category
  const updateBroadcasts = db.prepare(`
    UPDATE conversations
    SET category = 'status', updated_at = datetime('now')
    WHERE (external_id LIKE '%@broadcast%' OR external_id = 'status@broadcast')
  `);
  const broadcastResult = updateBroadcasts.run();
  console.log(`✅ Updated ${broadcastResult.changes} broadcasts to category 'status'`);

  // Update remaining NULL categories to 'chat'
  const updateNulls = db.prepare(`
    UPDATE conversations
    SET category = 'chat', updated_at = datetime('now')
    WHERE category IS NULL
  `);
  const nullResult = updateNulls.run();
  console.log(`✅ Updated ${nullResult.changes} conversations with NULL to category 'chat'`);

  // Verify results
  const verification = db.prepare(`
    SELECT category, COUNT(*) as count
    FROM conversations
    GROUP BY category
    ORDER BY count DESC
  `).all();

  console.log(`\n📊 Category distribution after migration:`);
  verification.forEach(row => {
    console.log(`   - ${row.category || 'NULL'}: ${row.count} conversations`);
  });

  db.close();
  console.log('\n🎉 Migration completed successfully!');

} catch (error) {
  console.error('❌ Migration failed:', error.message);
  process.exit(1);
}
