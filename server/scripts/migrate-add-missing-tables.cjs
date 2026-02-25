/**
 * Database Migration: Add Missing Tables
 *
 * Adds tables required for feature parity with old backend:
 * - agent_logs: Agent action logging
 * - cli_sessions: CLI session management
 * - passkeys: WebAuthn passkey storage
 * - openrouter_models: Model cache from OpenRouter
 * - rate_limit_usage: Rate limiting tracking
 *
 * Safe to run multiple times (uses IF NOT EXISTS)
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Database path
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'swarm.db');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('Database Migration: Add Missing Tables');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`Database: ${DB_PATH}`);

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// ============================================
// Settings Table (generic key-value storage)
// ============================================
console.log('\n[0/5] Creating settings table...');

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_settings_user_key ON settings(user_id, key);
`);
console.log('   ✓ settings table ready');

// ============================================
// Agent Logs Table
// ============================================
console.log('\n[1/5] Creating agent_logs table...');

db.exec(`
  CREATE TABLE IF NOT EXISTS agent_logs (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    conversation_id TEXT,
    message_id TEXT,
    parent_log_id TEXT,
    action_type TEXT NOT NULL,
    action_data TEXT,
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    cost REAL DEFAULT 0,
    duration_ms INTEGER DEFAULT 0,
    error TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_agent_logs_agent ON agent_logs(agent_id);
  CREATE INDEX IF NOT EXISTS idx_agent_logs_user ON agent_logs(user_id);
  CREATE INDEX IF NOT EXISTS idx_agent_logs_conversation ON agent_logs(conversation_id);
  CREATE INDEX IF NOT EXISTS idx_agent_logs_created ON agent_logs(created_at);
  CREATE INDEX IF NOT EXISTS idx_agent_logs_action_type ON agent_logs(action_type);
  CREATE INDEX IF NOT EXISTS idx_agent_logs_parent ON agent_logs(parent_log_id);
`);
console.log('   ✓ agent_logs table ready');

// ============================================
// CLI Sessions Table
// ============================================
console.log('\n[2/5] Creating cli_sessions table...');

db.exec(`
  CREATE TABLE IF NOT EXISTS cli_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    agent_id TEXT,
    cli_type TEXT NOT NULL CHECK(cli_type IN ('claude', 'gemini', 'opencode', 'bash')),
    status TEXT DEFAULT 'active' CHECK(status IN ('active', 'completed', 'failed', 'expired')),
    last_prompt TEXT,
    last_output TEXT,
    context_summary TEXT,
    metadata TEXT,
    expires_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_cli_sessions_user ON cli_sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_cli_sessions_workspace ON cli_sessions(workspace_id);
  CREATE INDEX IF NOT EXISTS idx_cli_sessions_status ON cli_sessions(status);
  CREATE INDEX IF NOT EXISTS idx_cli_sessions_expires ON cli_sessions(expires_at);
`);
console.log('   ✓ cli_sessions table ready');

// ============================================
// Passkeys Table
// ============================================
console.log('\n[3/5] Creating passkeys table...');

db.exec(`
  CREATE TABLE IF NOT EXISTS passkeys (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    credential_id TEXT NOT NULL UNIQUE,
    public_key TEXT NOT NULL,
    counter INTEGER DEFAULT 0,
    device_type TEXT,
    backed_up INTEGER DEFAULT 0,
    transports TEXT,
    name TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    last_used_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_passkeys_user ON passkeys(user_id);
  CREATE INDEX IF NOT EXISTS idx_passkeys_credential ON passkeys(credential_id);
`);
console.log('   ✓ passkeys table ready');

// ============================================
// OpenRouter Models Table
// ============================================
console.log('\n[4/5] Creating openrouter_models table...');

db.exec(`
  CREATE TABLE IF NOT EXISTS openrouter_models (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    context_length INTEGER,
    pricing_prompt REAL,
    pricing_completion REAL,
    modality TEXT,
    provider TEXT,
    is_free INTEGER DEFAULT 0,
    architecture TEXT,
    top_provider TEXT,
    per_request_limits TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_models_provider ON openrouter_models(provider);
  CREATE INDEX IF NOT EXISTS idx_models_free ON openrouter_models(is_free);
  CREATE INDEX IF NOT EXISTS idx_models_context ON openrouter_models(context_length);
`);
console.log('   ✓ openrouter_models table ready');

// ============================================
// Rate Limit Usage Table
// ============================================
console.log('\n[5/5] Creating rate_limit_usage table...');

db.exec(`
  CREATE TABLE IF NOT EXISTS rate_limit_usage (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    tier TEXT DEFAULT 'free',
    minute_count INTEGER DEFAULT 0,
    minute_reset_at TEXT,
    hour_count INTEGER DEFAULT 0,
    hour_reset_at TEXT,
    day_count INTEGER DEFAULT 0,
    day_reset_at TEXT,
    month_cost REAL DEFAULT 0,
    month_reset_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_rate_limit_user ON rate_limit_usage(user_id);

  -- Rate limit history for analytics
  CREATE TABLE IF NOT EXISTS rate_limit_history (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    tier TEXT,
    requests_count INTEGER,
    tokens_used INTEGER,
    cost REAL,
    period_start TEXT,
    period_end TEXT,
    period_type TEXT CHECK(period_type IN ('minute', 'hour', 'day', 'month')),
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_rate_history_user ON rate_limit_history(user_id);
  CREATE INDEX IF NOT EXISTS idx_rate_history_period ON rate_limit_history(period_start, period_end);
`);
console.log('   ✓ rate_limit_usage and rate_limit_history tables ready');

// ============================================
// Add missing columns to existing tables
// ============================================
console.log('\n[+] Checking for missing columns in existing tables...');

// Helper to check if column exists
function columnExists(table, column) {
  const info = db.prepare(`PRAGMA table_info(${table})`).all();
  return info.some(col => col.name === column);
}

// Add user tier column to users table if not exists
if (!columnExists('users', 'rate_limit_tier')) {
  console.log('   Adding rate_limit_tier to users...');
  db.exec(`ALTER TABLE users ADD COLUMN rate_limit_tier TEXT DEFAULT 'free'`);
  console.log('   ✓ rate_limit_tier added');
} else {
  console.log('   ✓ rate_limit_tier already exists');
}

// ============================================
// Done
// ============================================
db.close();

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('✅ Migration completed successfully!');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
