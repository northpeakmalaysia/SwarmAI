/**
 * Migration: Voice Transcription Settings
 *
 * Adds voice transcription columns to superbrain_settings table.
 * Safe to run multiple times (checks column existence before ALTER).
 *
 * Usage: node server/scripts/migrate-voice-transcription.cjs
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '../data/swarm.db');

console.log('=== Voice Transcription Settings Migration ===');
console.log(`Database: ${DB_PATH}`);

try {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  // Get existing columns
  const columns = db.prepare('PRAGMA table_info(superbrain_settings)').all();
  const existingColumns = columns.map(c => c.name);

  console.log(`\nExisting columns: ${existingColumns.length}`);

  const newColumns = [
    { name: 'transcription_enabled', type: 'INTEGER DEFAULT 1' },
    { name: 'transcription_auto_extract', type: 'INTEGER DEFAULT 1' },
    { name: 'transcription_provider_1', type: 'TEXT DEFAULT NULL' },
    { name: 'transcription_model_1', type: 'TEXT DEFAULT NULL' },
    { name: 'transcription_provider_2', type: 'TEXT DEFAULT NULL' },
    { name: 'transcription_model_2', type: 'TEXT DEFAULT NULL' },
    { name: 'transcription_provider_3', type: 'TEXT DEFAULT NULL' },
    { name: 'transcription_model_3', type: 'TEXT DEFAULT NULL' },
    { name: 'transcription_language', type: "TEXT DEFAULT 'auto'" },
  ];

  let added = 0;
  let skipped = 0;

  for (const col of newColumns) {
    if (existingColumns.includes(col.name)) {
      console.log(`  [SKIP] ${col.name} (already exists)`);
      skipped++;
    } else {
      db.exec(`ALTER TABLE superbrain_settings ADD COLUMN ${col.name} ${col.type}`);
      console.log(`  [ADD]  ${col.name} ${col.type}`);
      added++;
    }
  }

  db.close();

  console.log(`\n=== Migration Complete ===`);
  console.log(`Added: ${added}, Skipped: ${skipped}`);

} catch (error) {
  console.error(`\nMigration failed: ${error.message}`);
  process.exit(1);
}
