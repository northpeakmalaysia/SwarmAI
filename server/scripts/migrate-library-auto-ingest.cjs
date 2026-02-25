/**
 * Migration: Add auto-ingest settings to knowledge_libraries
 *
 * Adds columns for smart content routing:
 * - match_keywords: JSON array for fast pre-filtering
 * - match_embedding: BLOB for semantic matching
 * - auto_ingest: Boolean to enable automatic ingestion
 * - ingest_sources: JSON array of allowed sources
 *
 * Run with: node server/scripts/migrate-library-auto-ingest.cjs
 */

const path = require('path');
const { getDatabase, initDatabase } = require('../services/database.cjs');

async function migrate() {
  console.log('Starting migration: library auto-ingest settings...\n');

  // Initialize database connection
  initDatabase();
  const db = getDatabase();

  try {
    // Check if columns already exist
    const tableInfo = db.prepare("PRAGMA table_info(knowledge_libraries)").all();
    const existingColumns = tableInfo.map(c => c.name);

    const columnsToAdd = [
      { name: 'match_keywords', sql: 'ALTER TABLE knowledge_libraries ADD COLUMN match_keywords TEXT' },
      { name: 'match_embedding', sql: 'ALTER TABLE knowledge_libraries ADD COLUMN match_embedding BLOB' },
      { name: 'auto_ingest', sql: 'ALTER TABLE knowledge_libraries ADD COLUMN auto_ingest INTEGER DEFAULT 0' },
      { name: 'ingest_sources', sql: 'ALTER TABLE knowledge_libraries ADD COLUMN ingest_sources TEXT' },
    ];

    let addedCount = 0;
    for (const col of columnsToAdd) {
      if (existingColumns.includes(col.name)) {
        console.log(`  ✓ Column '${col.name}' already exists`);
      } else {
        db.exec(col.sql);
        console.log(`  ✓ Added column '${col.name}'`);
        addedCount++;
      }
    }

    // Create ingestion_log table if it doesn't exist
    db.exec(`
      CREATE TABLE IF NOT EXISTS ingestion_log (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        library_id TEXT NOT NULL,
        document_id TEXT NOT NULL,
        source TEXT,
        source_name TEXT,
        author_name TEXT,
        reliability_score REAL,
        match_score REAL,
        content_preview TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (library_id) REFERENCES knowledge_libraries(id),
        FOREIGN KEY (document_id) REFERENCES knowledge_documents(id)
      )
    `);
    console.log(`  ✓ Ensured ingestion_log table exists`);

    // Create source_reliability table for tracking source reputation
    db.exec(`
      CREATE TABLE IF NOT EXISTS source_reliability (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        domain TEXT,
        source_id TEXT,
        source_name TEXT,
        category TEXT,
        reliability_score REAL DEFAULT 0.5,
        total_ingestions INTEGER DEFAULT 0,
        successful_ingestions INTEGER DEFAULT 0,
        notes TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);
    console.log(`  ✓ Ensured source_reliability table exists`);

    // Create index for faster lookups
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_knowledge_libraries_auto_ingest
      ON knowledge_libraries(user_id, auto_ingest)
    `);
    console.log(`  ✓ Created index for auto_ingest lookups`);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_ingestion_log_user
      ON ingestion_log(user_id, created_at)
    `);
    console.log(`  ✓ Created index for ingestion_log lookups`);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_source_reliability_domain
      ON source_reliability(user_id, domain)
    `);
    console.log(`  ✓ Created index for source_reliability lookups`);

    console.log(`\n✅ Migration completed successfully!`);
    console.log(`   Added ${addedCount} new columns to knowledge_libraries`);

    // Show current libraries
    const libraries = db.prepare('SELECT id, name, auto_ingest FROM knowledge_libraries').all();
    if (libraries.length > 0) {
      console.log(`\nExisting libraries (${libraries.length}):`);
      for (const lib of libraries) {
        console.log(`   - ${lib.name} (auto_ingest: ${lib.auto_ingest ? 'enabled' : 'disabled'})`);
      }
    }

  } catch (error) {
    console.error(`\n❌ Migration failed: ${error.message}`);
    process.exit(1);
  }
}

// Run migration
migrate();
