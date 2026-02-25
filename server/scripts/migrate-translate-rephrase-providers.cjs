/**
 * Migration: Add translation_provider and rephrase_provider columns
 *
 * This migration adds provider-based selection for translation and rephrase
 * settings, instead of direct model selection.
 */

const { getDatabase, initDatabase } = require('../services/database.cjs');
const { logger } = require('../services/logger.cjs');

async function migrate() {
  // Initialize database if not already done
  initDatabase();
  const db = getDatabase();

  console.log('Starting migration: translate-rephrase-providers...');

  try {
    // Check if columns already exist
    const tableInfo = db.prepare('PRAGMA table_info(superbrain_settings)').all();
    const existingColumns = tableInfo.map(col => col.name);

    // Add translation_provider column if not exists
    if (!existingColumns.includes('translation_provider')) {
      console.log('Adding translation_provider column...');
      db.exec(`
        ALTER TABLE superbrain_settings
        ADD COLUMN translation_provider TEXT DEFAULT 'system'
      `);
      console.log('Added translation_provider column');
    } else {
      console.log('translation_provider column already exists');
    }

    // Add rephrase_provider column if not exists
    if (!existingColumns.includes('rephrase_provider')) {
      console.log('Adding rephrase_provider column...');
      db.exec(`
        ALTER TABLE superbrain_settings
        ADD COLUMN rephrase_provider TEXT DEFAULT 'system'
      `);
      console.log('Added rephrase_provider column');
    } else {
      console.log('rephrase_provider column already exists');
    }

    console.log('Migration completed successfully!');

  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
}

// Run if executed directly
if (require.main === module) {
  migrate()
    .then(() => {
      console.log('Done');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

module.exports = { migrate };
