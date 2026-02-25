#!/usr/bin/env node

/**
 * Migration: Add media_local_path column to messages table
 *
 * This column stores the local file path for media files that have been
 * downloaded and stored locally (e.g., for OCR processing).
 *
 * Run with: node server/scripts/migrate-add-media-local-path.cjs
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Database path - same as in database.cjs
const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'swarm.db');

console.log('='.repeat(60));
console.log('Migration: Add media_local_path column to messages table');
console.log('='.repeat(60));
console.log();

// Check if database exists
if (!fs.existsSync(DB_PATH)) {
  console.error('Error: Database file not found at:', DB_PATH);
  console.error('Run the application first to initialize the database.');
  process.exit(1);
}

// Open database with WAL mode
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

console.log('Connected to database:', DB_PATH);
console.log();

try {
  // Check if column already exists
  const tableInfo = db.prepare("PRAGMA table_info(messages)").all();
  const columnExists = tableInfo.some(col => col.name === 'media_local_path');

  if (columnExists) {
    console.log('Column "media_local_path" already exists in messages table.');
    console.log('Migration skipped - no changes needed.');
  } else {
    console.log('Adding "media_local_path" column to messages table...');

    // Add the column
    db.exec(`
      ALTER TABLE messages ADD COLUMN media_local_path TEXT
    `);

    console.log('Column added successfully!');

    // Verify the change
    const updatedTableInfo = db.prepare("PRAGMA table_info(messages)").all();
    const newColumn = updatedTableInfo.find(col => col.name === 'media_local_path');

    if (newColumn) {
      console.log('Verification: Column found with properties:');
      console.log('  - Name:', newColumn.name);
      console.log('  - Type:', newColumn.type);
      console.log('  - Not Null:', newColumn.notnull ? 'Yes' : 'No');
      console.log('  - Default:', newColumn.dflt_value ?? 'NULL');
    }
  }

  console.log();
  console.log('Migration completed successfully!');
  console.log('='.repeat(60));

} catch (error) {
  console.error('Migration failed:', error.message);
  process.exit(1);
} finally {
  db.close();
}
