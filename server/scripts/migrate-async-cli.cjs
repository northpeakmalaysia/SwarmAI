/**
 * Migration: Async CLI Execution Tracking
 *
 * Creates table for tracking long-running CLI tool executions that run
 * in the background (beyond the 4-minute reasoning loop timeout).
 *
 * The AsyncCLIExecutionManager uses this table for:
 * - Tracking active background CLI processes (server-side and local agent)
 * - Crash recovery on server restart
 * - Delivery status for completed results
 *
 * Idempotent - safe to run multiple times.
 */

const path = require('path');

function migrate() {
  const dbPath = path.join(__dirname, '..', 'data', 'swarm.db');
  const Database = require('better-sqlite3');
  const db = new Database(dbPath, { verbose: null });
  db.pragma('journal_mode = WAL');

  console.log('=== Async CLI Execution Migration ===');

  // 1. Async CLI executions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS async_cli_executions (
      id TEXT PRIMARY KEY,

      -- CLI execution context
      cli_type TEXT NOT NULL CHECK(cli_type IN ('claude', 'gemini', 'opencode')),
      source TEXT NOT NULL DEFAULT 'server' CHECK(source IN ('server', 'local_agent')),
      local_agent_id TEXT,

      -- User/agent context (needed for result delivery)
      user_id TEXT NOT NULL,
      agentic_profile_id TEXT,
      conversation_id TEXT,
      account_id TEXT,
      external_id TEXT,
      platform TEXT,

      -- Workspace
      workspace_path TEXT,

      -- Execution state
      status TEXT NOT NULL DEFAULT 'running'
        CHECK(status IN ('running', 'completed', 'failed', 'cancelled', 'stale_killed')),

      -- Timeout configuration
      stale_threshold_ms INTEGER NOT NULL DEFAULT 300000,
      max_timeout_ms INTEGER NOT NULL DEFAULT 3600000,

      -- Result tracking
      stdout_length INTEGER DEFAULT 0,
      output_files TEXT DEFAULT '[]',
      error TEXT,

      -- Delivery
      delivery_status TEXT NOT NULL DEFAULT 'pending'
        CHECK(delivery_status IN ('pending', 'delivering', 'delivered', 'failed', 'not_needed')),
      delivery_error TEXT,

      -- Timestamps
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_activity_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      delivered_at TEXT,

      -- Foreign keys (soft)
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);
  console.log('  [OK] async_cli_executions table created/verified');

  // 2. Indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_async_cli_status
      ON async_cli_executions(status);
    CREATE INDEX IF NOT EXISTS idx_async_cli_delivery
      ON async_cli_executions(delivery_status)
      WHERE delivery_status != 'delivered' AND delivery_status != 'not_needed';
    CREATE INDEX IF NOT EXISTS idx_async_cli_user
      ON async_cli_executions(user_id, status);
  `);
  console.log('  [OK] Indexes created/verified');

  db.close();
  console.log('=== Async CLI Execution Migration Complete ===');
}

// Run if executed directly
if (require.main === module) {
  migrate();
}

module.exports = { migrate };
