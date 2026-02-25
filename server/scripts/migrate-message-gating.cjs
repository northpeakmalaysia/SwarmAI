/**
 * Database Migration: Message Gating
 * ====================================
 * Creates tables for multi-layer message gating (echo, group allowlist, rate limit, etc.)
 * Run with: node server/scripts/migrate-message-gating.cjs
 *
 * Idempotent - safe to run multiple times.
 */
const Database = require('better-sqlite3');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'swarm.db');

console.log(`Opening database: ${DB_PATH}`);
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// Step 1: Group allowlist table
console.log('\n1. Creating message_gating_group_allowlist table...');
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS message_gating_group_allowlist (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      group_id TEXT NOT NULL,
      platform TEXT NOT NULL,
      group_name TEXT,
      bot_names TEXT DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, group_id, platform)
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_gating_allowlist_user ON message_gating_group_allowlist(user_id);`);
  console.log('   OK: message_gating_group_allowlist created');
} catch (e) {
  console.log(`   INFO: ${e.message}`);
}

// Step 2: Gating config table
console.log('\n2. Creating message_gating_config table...');
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS message_gating_config (
      user_id TEXT PRIMARY KEY,
      echo_enabled INTEGER DEFAULT 1,
      group_allowlist_enabled INTEGER DEFAULT 1,
      mention_gate_enabled INTEGER DEFAULT 1,
      rate_limit_enabled INTEGER DEFAULT 1,
      rate_limit_max INTEGER DEFAULT 10,
      rate_limit_window_seconds INTEGER DEFAULT 60,
      content_min_length INTEGER DEFAULT 3,
      content_block_media_only INTEGER DEFAULT 0,
      bot_identifiers TEXT DEFAULT '[]',
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);
  console.log('   OK: message_gating_config created');
} catch (e) {
  console.log(`   INFO: ${e.message}`);
}

db.close();
console.log('\nMigration completed successfully.');
