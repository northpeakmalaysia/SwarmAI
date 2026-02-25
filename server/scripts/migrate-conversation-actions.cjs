/**
 * Migration: Add pin, mute, archive columns to conversations table
 *
 * Run: node server/scripts/migrate-conversation-actions.cjs
 */

const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'swarm.db');

console.log('='.repeat(60));
console.log('Migration: Add pin/mute/archive columns to conversations');
console.log('='.repeat(60));
console.log(`Database: ${DB_PATH}`);
console.log('');

try {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  // Check existing columns
  const tableInfo = db.prepare("PRAGMA table_info('conversations')").all();
  const existingColumns = tableInfo.map(col => col.name);

  console.log('Existing columns:', existingColumns.join(', '));
  console.log('');

  // Columns to add
  const columnsToAdd = [
    { name: 'is_pinned', type: 'INTEGER DEFAULT 0', description: 'Pin status' },
    { name: 'is_muted', type: 'INTEGER DEFAULT 0', description: 'Mute status' },
    { name: 'is_archived', type: 'INTEGER DEFAULT 0', description: 'Archive status' },
  ];

  let addedCount = 0;

  for (const column of columnsToAdd) {
    if (existingColumns.includes(column.name)) {
      console.log(`✓ Column '${column.name}' already exists (${column.description})`);
    } else {
      console.log(`+ Adding column '${column.name}' (${column.description})...`);
      db.exec(`ALTER TABLE conversations ADD COLUMN ${column.name} ${column.type}`);
      addedCount++;
      console.log(`  ✓ Column '${column.name}' added successfully`);
    }
  }

  console.log('');
  console.log('='.repeat(60));
  console.log(`Migration complete! Added ${addedCount} new column(s).`);
  console.log('='.repeat(60));

  db.close();
  process.exit(0);

} catch (error) {
  console.error('Migration failed:', error.message);
  process.exit(1);
}
