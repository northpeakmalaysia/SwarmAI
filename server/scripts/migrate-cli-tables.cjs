#!/usr/bin/env node
/**
 * Migration Script: Add CLI Auth State and CLI Settings tables
 *
 * This script adds new tables for CLI tool management:
 * - cli_auth_state: Tracks authentication status per CLI tool (persists across restarts)
 * - cli_settings: Per-user CLI tool preferences (model selection, timeout, etc.)
 *
 * Usage:
 *   node server/scripts/migrate-cli-tables.cjs
 *
 * Safe to run multiple times (uses IF NOT EXISTS)
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Database path
const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'swarm.db');

console.log('='.repeat(60));
console.log('CLI Tables Migration Script');
console.log('='.repeat(60));
console.log(`Database: ${DB_PATH}`);
console.log('');

// Check if database exists
if (!fs.existsSync(DB_PATH)) {
  console.error('❌ Database file not found. Run the server first to create it.');
  process.exit(1);
}

// Open database
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

try {
  // Create cli_auth_state table
  console.log('Creating cli_auth_state table...');
  db.exec(`
    CREATE TABLE IF NOT EXISTS cli_auth_state (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      cli_type TEXT NOT NULL UNIQUE CHECK(cli_type IN ('claude', 'gemini', 'opencode')),
      is_authenticated INTEGER DEFAULT 0,
      auth_method TEXT,
      authenticated_at TEXT,
      authenticated_by TEXT,
      expires_at TEXT,
      capabilities TEXT,
      config TEXT,
      last_used_at TEXT,
      last_check_at TEXT,
      error_message TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);
  console.log('✅ cli_auth_state table created');

  // Create cli_settings table
  console.log('Creating cli_settings table...');
  db.exec(`
    CREATE TABLE IF NOT EXISTS cli_settings (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      user_id TEXT NOT NULL,
      cli_type TEXT NOT NULL CHECK(cli_type IN ('claude', 'gemini', 'opencode')),

      -- Model preferences
      preferred_model TEXT,
      fallback_model TEXT,

      -- Execution preferences
      timeout_seconds INTEGER DEFAULT 300,
      max_tokens INTEGER,
      temperature REAL,

      -- CLI-specific settings (JSON)
      settings TEXT,

      -- Usage tracking
      total_executions INTEGER DEFAULT 0,
      total_tokens_used INTEGER DEFAULT 0,
      last_used_at TEXT,

      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, cli_type),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
  console.log('✅ cli_settings table created');

  // Create indexes for better query performance
  console.log('Creating indexes...');

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_cli_auth_state_type ON cli_auth_state(cli_type);
    CREATE INDEX IF NOT EXISTS idx_cli_settings_user ON cli_settings(user_id);
    CREATE INDEX IF NOT EXISTS idx_cli_settings_user_type ON cli_settings(user_id, cli_type);
  `);
  console.log('✅ Indexes created');

  // Initialize default auth states for all CLI types
  console.log('Initializing default CLI auth states...');
  const cliTypes = ['claude', 'gemini', 'opencode'];

  for (const cliType of cliTypes) {
    const existing = db.prepare('SELECT id FROM cli_auth_state WHERE cli_type = ?').get(cliType);
    if (!existing) {
      db.prepare(`
        INSERT INTO cli_auth_state (cli_type, is_authenticated, created_at, updated_at)
        VALUES (?, 0, datetime('now'), datetime('now'))
      `).run(cliType);
      console.log(`  - Initialized ${cliType} auth state`);
    } else {
      console.log(`  - ${cliType} auth state already exists`);
    }
  }

  // Verify tables
  console.log('');
  console.log('Verifying tables...');

  const tables = db.prepare(`
    SELECT name FROM sqlite_master WHERE type='table' AND name IN ('cli_auth_state', 'cli_settings')
  `).all();

  console.log(`Found ${tables.length} tables: ${tables.map(t => t.name).join(', ')}`);

  // Show current auth states
  const authStates = db.prepare('SELECT cli_type, is_authenticated FROM cli_auth_state').all();
  console.log('');
  console.log('Current CLI Auth States:');
  for (const state of authStates) {
    console.log(`  - ${state.cli_type}: ${state.is_authenticated ? 'authenticated' : 'not authenticated'}`);
  }

  console.log('');
  console.log('='.repeat(60));
  console.log('✅ Migration completed successfully!');
  console.log('='.repeat(60));

} catch (error) {
  console.error('❌ Migration failed:', error.message);
  process.exit(1);
} finally {
  db.close();
}
