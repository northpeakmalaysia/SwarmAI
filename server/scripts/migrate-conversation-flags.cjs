/**
 * Migration: Add is_pinned, is_muted, is_archived flags to conversations table
 *
 * Run: node server/scripts/migrate-conversation-flags.cjs
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '..', 'data', 'swarm.db');

// Check if database exists
if (!fs.existsSync(dbPath)) {
  console.error('Database not found at:', dbPath);
  process.exit(1);
}

const db = new Database(dbPath);

console.log('Starting conversation flags migration...\n');

// Columns to add to conversations
const columnsToAdd = [
  {
    name: 'is_pinned',
    type: 'INTEGER DEFAULT 0',
    description: 'Whether conversation is pinned to top'
  },
  {
    name: 'is_muted',
    type: 'INTEGER DEFAULT 0',
    description: 'Whether notifications are muted'
  },
  {
    name: 'is_archived',
    type: 'INTEGER DEFAULT 0',
    description: 'Whether conversation is archived'
  }
];

// Check existing columns
const tableInfo = db.prepare('PRAGMA table_info(conversations)').all();
const existingColumns = tableInfo.map(col => col.name);

console.log('Existing columns:', existingColumns.join(', '));
console.log('');

let addedCount = 0;
let skippedCount = 0;

for (const col of columnsToAdd) {
  if (existingColumns.includes(col.name)) {
    console.log(`  ⏭  Column "${col.name}" already exists - skipping`);
    skippedCount++;
    continue;
  }

  try {
    db.exec(`ALTER TABLE conversations ADD COLUMN ${col.name} ${col.type}`);
    console.log(`  ✅ Added column "${col.name}" (${col.description})`);
    addedCount++;
  } catch (error) {
    console.error(`  ❌ Failed to add column "${col.name}":`, error.message);
  }
}

console.log('');
console.log(`Migration summary: ${addedCount} columns added, ${skippedCount} skipped`);
console.log('');
console.log('Migration completed successfully!');

db.close();
