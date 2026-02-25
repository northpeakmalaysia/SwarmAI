/**
 * Migration: Add OCR settings to superbrain_settings table
 *
 * Adds:
 * - ocr_languages: User's preferred OCR language chain (e.g., 'eng+msa+chi_sim')
 * - ocr_auto_extract: Whether to auto-extract text from image-only messages
 * - ocr_min_confidence: Minimum confidence threshold for OCR extraction
 *
 * Run: node server/scripts/migrate-ocr-settings.cjs
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

console.log('Starting OCR settings migration...\n');

// Columns to add to superbrain_settings
const columnsToAdd = [
  {
    name: 'ocr_languages',
    type: "TEXT DEFAULT 'eng+msa+chi_sim'",
    description: 'OCR language chain (e.g., eng+msa+chi_sim)'
  },
  {
    name: 'ocr_auto_extract',
    type: 'INTEGER DEFAULT 1',
    description: 'Auto-extract text from image-only messages (1=enabled, 0=disabled)'
  },
  {
    name: 'ocr_min_confidence',
    type: 'REAL DEFAULT 0.3',
    description: 'Minimum OCR confidence threshold (0.0-1.0)'
  }
];

// Check if superbrain_settings table exists
const tableExists = db.prepare(`
  SELECT name FROM sqlite_master WHERE type='table' AND name='superbrain_settings'
`).get();

if (!tableExists) {
  console.log('superbrain_settings table does not exist. Creating it...');

  db.exec(`
    CREATE TABLE IF NOT EXISTS superbrain_settings (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE,
      preferred_free_model TEXT,
      preferred_paid_model TEXT,
      trivial_tier_provider TEXT DEFAULT 'ollama',
      trivial_tier_model TEXT,
      simple_tier_provider TEXT,
      simple_tier_model TEXT,
      moderate_tier_provider TEXT,
      moderate_tier_model TEXT,
      complex_tier_provider TEXT,
      complex_tier_model TEXT,
      critical_tier_provider TEXT,
      critical_tier_model TEXT,
      auto_send_mode TEXT DEFAULT 'restricted',
      enabled_tools TEXT,
      tool_confidence_threshold REAL DEFAULT 0.7,
      ai_router_mode TEXT DEFAULT 'full',
      ocr_languages TEXT DEFAULT 'eng+msa+chi_sim',
      ocr_auto_extract INTEGER DEFAULT 1,
      ocr_min_confidence REAL DEFAULT 0.3,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  console.log('Created superbrain_settings table with OCR columns.\n');
  console.log('Migration completed successfully!');
  db.close();
  process.exit(0);
}

// Check existing columns
const tableInfo = db.prepare('PRAGMA table_info(superbrain_settings)').all();
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
    db.exec(`ALTER TABLE superbrain_settings ADD COLUMN ${col.name} ${col.type}`);
    console.log(`  ✅ Added column "${col.name}" (${col.description})`);
    addedCount++;
  } catch (error) {
    console.error(`  ❌ Failed to add column "${col.name}":`, error.message);
  }
}

console.log('');
console.log(`Migration summary: ${addedCount} columns added, ${skippedCount} skipped`);
console.log('');
console.log('Available OCR languages:');
console.log('  - eng: English');
console.log('  - msa: Malay');
console.log('  - chi_sim: Chinese (Simplified)');
console.log('  - chi_tra: Chinese (Traditional)');
console.log('  - tam: Tamil');
console.log('  - hin: Hindi');
console.log('');
console.log('Migration completed successfully!');

db.close();
