/**
 * Migration: Phase 7 — Path to 100% Autonomy
 *
 * Creates tables for:
 * - agentic_checkpoints: Checkpoint/resume state for reasoning loops
 * - agentic_idempotency: Deduplication cache for side-effect tools
 * - ALTER agentic_conversations: Add deadline column for async consensus
 *
 * Usage: node server/scripts/migrate-agentic-phase7.cjs
 */

const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = process.env.SQLITE_PATH || path.join(__dirname, '..', 'data', 'swarm.db');

function migrate() {
  console.log(`[migrate-agentic-phase7] Opening database: ${DB_PATH}`);
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  // ─── Table 1: agentic_checkpoints ───
  // Stores reasoning loop state for crash recovery / resume
  db.exec(`
    CREATE TABLE IF NOT EXISTS agentic_checkpoints (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      trigger TEXT,
      trigger_context TEXT,
      iteration INTEGER DEFAULT 0,
      messages TEXT,
      action_records TEXT,
      tokens_used INTEGER DEFAULT 0,
      tier TEXT,
      plan_id TEXT,
      status TEXT DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
  `);

  // Indexes for checkpoint lookups
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_checkpoints_agent_status
      ON agentic_checkpoints(agent_id, status);
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_checkpoints_expires
      ON agentic_checkpoints(expires_at);
  `);

  console.log('[migrate-agentic-phase7] Created agentic_checkpoints table');

  // ─── Table 2: agentic_idempotency ───
  // Short-lived cache to prevent duplicate side-effect tool executions
  db.exec(`
    CREATE TABLE IF NOT EXISTS agentic_idempotency (
      key TEXT PRIMARY KEY,
      tool_name TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      result TEXT,
      status TEXT DEFAULT 'pending',
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_idempotency_expires
      ON agentic_idempotency(expires_at);
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_idempotency_agent
      ON agentic_idempotency(agent_id, tool_name);
  `);

  console.log('[migrate-agentic-phase7] Created agentic_idempotency table');

  // ─── ALTER: agentic_conversations + deadline ───
  // Safe ADD COLUMN — SQLite ignores if column already exists (via try/catch)
  try {
    db.exec(`ALTER TABLE agentic_conversations ADD COLUMN deadline TEXT;`);
    console.log('[migrate-agentic-phase7] Added deadline column to agentic_conversations');
  } catch (err) {
    if (err.message.includes('duplicate column')) {
      console.log('[migrate-agentic-phase7] deadline column already exists — skipping');
    } else if (err.message.includes('no such table')) {
      console.log('[migrate-agentic-phase7] agentic_conversations table not yet created — deadline column will be added when table is created');
    } else {
      throw err;
    }
  }

  db.close();
  console.log('[migrate-agentic-phase7] Migration complete!');
}

// Run
try {
  migrate();
} catch (err) {
  console.error('[migrate-agentic-phase7] Migration failed:', err.message);
  process.exit(1);
}
