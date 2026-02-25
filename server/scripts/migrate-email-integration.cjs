/**
 * Database Migration: Email Integration
 *
 * Adds tables for:
 * - email_coordination: Swarm email task tracking
 * - email_ingestion_log: RAG email ingestion history
 * - Updates platform_accounts for email-specific settings
 *
 * Run with: node server/scripts/migrate-email-integration.cjs
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'swarm.db');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('Database Migration: Email Integration');
console.log(`Database: ${DB_PATH}`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// 1. Email Coordination table (Swarm Module)
console.log('\n[1/4] Creating email_coordination table...');
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS email_coordination (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      email_id TEXT NOT NULL,
      email_external_id TEXT,
      platform_account_id TEXT,
      assigned_agent_id TEXT,
      conversation_id TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'assigned', 'processing', 'responded', 'handoff', 'completed', 'failed')),
      priority TEXT DEFAULT 'normal' CHECK(priority IN ('low', 'normal', 'high', 'urgent')),
      metadata TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (assigned_agent_id) REFERENCES agents(id)
    );
    CREATE INDEX IF NOT EXISTS idx_email_coord_user ON email_coordination(user_id);
    CREATE INDEX IF NOT EXISTS idx_email_coord_agent ON email_coordination(assigned_agent_id);
    CREATE INDEX IF NOT EXISTS idx_email_coord_status ON email_coordination(status);
    CREATE INDEX IF NOT EXISTS idx_email_coord_email ON email_coordination(email_id);
  `);
  console.log('   ✓ email_coordination table created');
} catch (e) {
  if (e.message.includes('already exists')) {
    console.log('   ✓ email_coordination table already exists');
  } else {
    console.error(`   ✗ Error: ${e.message}`);
  }
}

// 2. Email Ingestion Log table (RAG Module)
console.log('\n[2/4] Creating email_ingestion_log table...');
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS email_ingestion_log (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      library_id TEXT NOT NULL,
      document_id TEXT NOT NULL,
      email_id TEXT NOT NULL,
      email_external_id TEXT,
      platform_account_id TEXT,
      from_address TEXT,
      subject TEXT,
      thread_id TEXT,
      has_attachments INTEGER DEFAULT 0,
      attachment_count INTEGER DEFAULT 0,
      reliability_score REAL,
      match_score REAL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (library_id) REFERENCES knowledge_libraries(id),
      FOREIGN KEY (document_id) REFERENCES knowledge_documents(id)
    );
    CREATE INDEX IF NOT EXISTS idx_email_ing_user ON email_ingestion_log(user_id);
    CREATE INDEX IF NOT EXISTS idx_email_ing_library ON email_ingestion_log(library_id);
    CREATE INDEX IF NOT EXISTS idx_email_ing_thread ON email_ingestion_log(thread_id);
    CREATE INDEX IF NOT EXISTS idx_email_ing_from ON email_ingestion_log(from_address);
  `);
  console.log('   ✓ email_ingestion_log table created');
} catch (e) {
  if (e.message.includes('already exists')) {
    console.log('   ✓ email_ingestion_log table already exists');
  } else {
    console.error(`   ✗ Error: ${e.message}`);
  }
}

// 3. Add auto_ingest_rag column to platform_accounts
console.log('\n[3/4] Adding auto_ingest_rag to platform_accounts...');
try {
  db.exec(`ALTER TABLE platform_accounts ADD COLUMN auto_ingest_rag INTEGER DEFAULT 0`);
  console.log('   ✓ Column added');
} catch (e) {
  if (e.message.includes('duplicate column')) {
    console.log('   ✓ Column already exists');
  } else {
    console.error(`   ✗ Error: ${e.message}`);
  }
}

// 4. Add email_settings column to platform_accounts
console.log('\n[4/4] Adding email_settings to platform_accounts...');
try {
  db.exec(`ALTER TABLE platform_accounts ADD COLUMN email_settings TEXT`);
  console.log('   ✓ Column added');
} catch (e) {
  if (e.message.includes('duplicate column')) {
    console.log('   ✓ Column already exists');
  } else {
    console.error(`   ✗ Error: ${e.message}`);
  }
}

// Verify tables
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('Verification:');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

const tables = db.prepare(`
  SELECT name FROM sqlite_master
  WHERE type='table' AND name IN ('email_coordination', 'email_ingestion_log')
`).all();

tables.forEach((t) => {
  const count = db.prepare(`SELECT COUNT(*) as count FROM ${t.name}`).get();
  console.log(`   ✓ ${t.name}: ${count.count} rows`);
});

// Check platform_accounts columns
const columns = db.prepare(`PRAGMA table_info(platform_accounts)`).all();
const hasAutoIngest = columns.some((c) => c.name === 'auto_ingest_rag');
const hasEmailSettings = columns.some((c) => c.name === 'email_settings');
console.log(`   ✓ platform_accounts.auto_ingest_rag: ${hasAutoIngest ? 'exists' : 'missing'}`);
console.log(`   ✓ platform_accounts.email_settings: ${hasEmailSettings ? 'exists' : 'missing'}`);

db.close();

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('✅ Migration completed successfully!');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
