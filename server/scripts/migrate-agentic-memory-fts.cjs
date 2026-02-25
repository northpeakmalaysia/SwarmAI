/**
 * Database Migration: Agentic Memory FTS5
 * ========================================
 * Creates FTS5 virtual table and sync mapping for hybrid memory search.
 * Run with: node server/scripts/migrate-agentic-memory-fts.cjs
 *
 * This is idempotent - safe to run multiple times.
 */
const Database = require('better-sqlite3');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'swarm.db');

console.log(`Opening database: ${DB_PATH}`);
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// Step 1: Create FTS5 virtual table (content-less, manual sync)
console.log('\n1. Creating agentic_memory_fts virtual table...');
try {
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS agentic_memory_fts USING fts5(
      title,
      content,
      summary,
      tags,
      content='',
      content_rowid='rowid'
    );
  `);
  console.log('   OK: agentic_memory_fts created');
} catch (e) {
  if (e.message.includes('already exists')) {
    console.log('   SKIP: agentic_memory_fts already exists');
  } else {
    console.error(`   ERROR: ${e.message}`);
  }
}

// Step 2: Create mapping table (FTS5 rowid -> memory.id)
console.log('\n2. Creating agentic_memory_fts_map table...');
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS agentic_memory_fts_map (
      rowid INTEGER PRIMARY KEY AUTOINCREMENT,
      memory_id TEXT NOT NULL UNIQUE,
      agentic_id TEXT NOT NULL,
      user_id TEXT NOT NULL
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_fts_map_memory ON agentic_memory_fts_map(memory_id);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_fts_map_agentic ON agentic_memory_fts_map(agentic_id);`);
  console.log('   OK: agentic_memory_fts_map created with indexes');
} catch (e) {
  console.log(`   INFO: ${e.message}`);
}

// Step 3: Backfill existing memories into FTS5
console.log('\n3. Backfilling existing memories...');
try {
  const existingMemories = db.prepare(`
    SELECT id, agentic_id, user_id, title, content, summary, tags
    FROM agentic_memory
  `).all();

  console.log(`   Found ${existingMemories.length} memories to index`);

  const insertMap = db.prepare(`
    INSERT OR IGNORE INTO agentic_memory_fts_map (memory_id, agentic_id, user_id) VALUES (?, ?, ?)
  `);
  const insertFts = db.prepare(`
    INSERT INTO agentic_memory_fts(rowid, title, content, summary, tags) VALUES (?, ?, ?, ?, ?)
  `);
  const getRowid = db.prepare('SELECT rowid FROM agentic_memory_fts_map WHERE memory_id = ?');

  let backfilled = 0;
  let skipped = 0;

  const transaction = db.transaction(() => {
    for (const mem of existingMemories) {
      const mapResult = insertMap.run(mem.id, mem.agentic_id, mem.user_id);
      if (mapResult.changes > 0) {
        const mapRow = getRowid.get(mem.id);
        if (mapRow) {
          try {
            insertFts.run(
              mapRow.rowid,
              mem.title || '',
              mem.content || '',
              mem.summary || '',
              mem.tags || '[]'
            );
            backfilled++;
          } catch (ftsErr) {
            // May already exist if partial previous run
            skipped++;
          }
        }
      } else {
        skipped++;
      }
    }
  });
  transaction();

  console.log(`   OK: Backfilled ${backfilled} memories, skipped ${skipped} (already indexed)`);
} catch (e) {
  console.error(`   ERROR during backfill: ${e.message}`);
}

db.close();
console.log('\nMigration completed successfully.');
