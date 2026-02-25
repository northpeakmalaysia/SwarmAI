/**
 * Migration: Agentic AI Tools
 *
 * Creates tables for:
 * - agentic_tool_overrides: Per-agent tool permission overrides
 * - agentic_tool_executions: Tool execution audit log
 *
 * Idempotent - safe to run multiple times.
 */

const path = require('path');

function migrate() {
  const dbPath = path.join(__dirname, '..', 'data', 'swarm.db');
  const Database = require('better-sqlite3');
  const db = new Database(dbPath, { verbose: null });
  db.pragma('journal_mode = WAL');

  console.log('=== Agentic AI Tools Migration ===');

  // 1. Per-agent tool overrides
  db.exec(`
    CREATE TABLE IF NOT EXISTS agentic_tool_overrides (
      id TEXT PRIMARY KEY,
      agentic_id TEXT NOT NULL,
      tool_id TEXT NOT NULL,
      override_type TEXT NOT NULL CHECK(override_type IN ('enable', 'disable', 'require_approval')),
      custom_config TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(agentic_id, tool_id),
      FOREIGN KEY (agentic_id) REFERENCES agentic_profiles(id)
    );
  `);
  console.log('  [OK] agentic_tool_overrides table');

  // 2. Tool execution audit log
  db.exec(`
    CREATE TABLE IF NOT EXISTS agentic_tool_executions (
      id TEXT PRIMARY KEY,
      agentic_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      tool_id TEXT NOT NULL,
      parameters TEXT DEFAULT '{}',
      result TEXT DEFAULT '{}',
      status TEXT DEFAULT 'success',
      execution_time_ms INTEGER,
      trigger_source TEXT,
      session_id TEXT,
      orchestration_id TEXT,
      error_message TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (agentic_id) REFERENCES agentic_profiles(id)
    );
  `);
  console.log('  [OK] agentic_tool_executions table');

  // 3. Indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_tool_executions_agent ON agentic_tool_executions(agentic_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_tool_executions_tool ON agentic_tool_executions(tool_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_tool_executions_session ON agentic_tool_executions(session_id);
    CREATE INDEX IF NOT EXISTS idx_tool_overrides_agent ON agentic_tool_overrides(agentic_id);
  `);
  console.log('  [OK] Indexes created');

  db.close();
  console.log('=== Migration complete ===');
}

// Run if called directly
if (require.main === module) {
  migrate();
}

module.exports = { migrate };
