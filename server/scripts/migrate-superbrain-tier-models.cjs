/**
 * Migration: Add tier-specific model columns to superbrain_settings
 *
 * Run: node server/scripts/migrate-superbrain-tier-models.cjs
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'swarm.db');

console.log('Connecting to database:', dbPath);
const db = new Database(dbPath);

const migrations = [
  // Add trivial tier provider (missing from original schema)
  `ALTER TABLE superbrain_settings ADD COLUMN trivial_tier_provider TEXT DEFAULT 'ollama'`,

  // Add model columns for each tier
  `ALTER TABLE superbrain_settings ADD COLUMN trivial_tier_model TEXT`,
  `ALTER TABLE superbrain_settings ADD COLUMN simple_tier_model TEXT`,
  `ALTER TABLE superbrain_settings ADD COLUMN moderate_tier_model TEXT`,
  `ALTER TABLE superbrain_settings ADD COLUMN complex_tier_model TEXT`,
  `ALTER TABLE superbrain_settings ADD COLUMN critical_tier_model TEXT`,
];

console.log('Running migrations...');

for (const sql of migrations) {
  try {
    db.exec(sql);
    console.log('✓', sql.substring(0, 80) + '...');
  } catch (error) {
    if (error.message.includes('duplicate column name')) {
      console.log('○ Column already exists, skipping:', sql.substring(40, 80));
    } else {
      console.error('✗ Error:', error.message);
    }
  }
}

console.log('\nMigration complete!');
db.close();
