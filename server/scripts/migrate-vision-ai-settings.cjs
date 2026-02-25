/**
 * Migration Script: Add Vision AI Settings to superbrain_settings table
 *
 * Adds configurable 3-level fallback chain for Vision AI image analysis
 *
 * Run: node server/scripts/migrate-vision-ai-settings.cjs
 */

const path = require('path');

// Load database
const dbPath = path.join(__dirname, '..', 'data', 'swarm.db');
const Database = require('better-sqlite3');
const db = new Database(dbPath);

console.log('Starting Vision AI settings migration...');
console.log(`Database: ${dbPath}`);

// Check current columns in superbrain_settings
const tableInfo = db.prepare("PRAGMA table_info(superbrain_settings)").all();
const existingColumns = tableInfo.map(col => col.name);

console.log(`Existing columns: ${existingColumns.length}`);

// Vision AI columns to add
// NOTE: Provider columns can store:
//   - Provider ID (UUID from ai_providers table)
//   - Provider type (e.g., 'ollama', 'openrouter', 'gemini-cli')
//   - Provider name (e.g., 'MidAI', 'LocalAI')
// VisionAIService resolves these dynamically from user's configured ai_providers
// NO HARDCODED DEFAULTS - user must configure their own vision providers/models
const visionColumns = [
  // Master toggle for Vision AI
  { name: 'vision_enabled', type: 'INTEGER', default: 1 },

  // Vision AI fallback chain - all NULL by default (user must configure)
  { name: 'vision_provider_1', type: 'TEXT', default: 'NULL' },
  { name: 'vision_model_1', type: 'TEXT', default: 'NULL' },
  { name: 'vision_provider_2', type: 'TEXT', default: 'NULL' },
  { name: 'vision_model_2', type: 'TEXT', default: 'NULL' },
  { name: 'vision_provider_3', type: 'TEXT', default: 'NULL' },
  { name: 'vision_model_3', type: 'TEXT', default: 'NULL' },

  // OCR settings (already implemented but adding for completeness)
  { name: 'ocr_enabled', type: 'INTEGER', default: 1 },
  { name: 'ocr_languages', type: 'TEXT', default: "'eng+msa+chi_sim'" },
  { name: 'ocr_min_confidence', type: 'REAL', default: 0.3 },
];

let addedColumns = 0;

for (const col of visionColumns) {
  if (existingColumns.includes(col.name)) {
    console.log(`  Column ${col.name} already exists, skipping.`);
    continue;
  }

  try {
    const sql = `ALTER TABLE superbrain_settings ADD COLUMN ${col.name} ${col.type} DEFAULT ${col.default}`;
    db.exec(sql);
    console.log(`  ✅ Added column: ${col.name}`);
    addedColumns++;
  } catch (error) {
    console.error(`  ❌ Failed to add column ${col.name}: ${error.message}`);
  }
}

console.log(`\nMigration complete: ${addedColumns} columns added.`);

// Show sample data structure
console.log('\nVision AI Settings Structure:');
console.log('═══════════════════════════════════════════════════════════════');
console.log('vision_enabled         - Enable Vision AI image analysis (1/0)');
console.log('vision_provider_1/2/3  - Provider reference: ID, type, or name');
console.log('                         Supported types: ollama, openrouter, gemini-cli');
console.log('                         Can also use provider ID or name from ai_providers');
console.log('vision_model_1/2/3     - Model for each level (e.g., llava:latest, gpt-4o)');
console.log('ocr_enabled            - Enable OCR text extraction (1/0)');
console.log('ocr_languages          - OCR languages (e.g., eng+msa+chi_sim)');
console.log('ocr_min_confidence     - Min OCR confidence to use (0.0-1.0)');
console.log('═══════════════════════════════════════════════════════════════');

// Default fallback chain explanation
console.log('\nDefault Vision AI Fallback Chain:');
console.log('  Level 1: Ollama (llava:latest) - Local, free, fast');
console.log('  Level 2: OpenRouter (Gemini 2.0 Flash) - Cloud vision');
console.log('  Level 3: Auto (from remaining configured providers)');
console.log('\nNOTE: Vision AI uses providers configured in Settings > Integrations.');

db.close();
console.log('\nDatabase closed.');
