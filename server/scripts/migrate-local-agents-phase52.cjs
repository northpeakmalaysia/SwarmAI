/**
 * Migration: Local Agent Phase 5.2
 *
 * Creates:
 * - local_agent_commands: Command execution history/audit trail
 * - Adds tool_registry column to local_agents
 *
 * Idempotent - safe to run multiple times.
 */

const path = require('path');

function migrate() {
  const dbPath = path.join(__dirname, '..', 'data', 'swarm.db');
  const Database = require('better-sqlite3');
  const db = new Database(dbPath, { verbose: null });
  db.pragma('journal_mode = WAL');

  console.log('=== Local Agent Migration (Phase 5.2) ===');

  // 1. local_agent_commands table
  db.exec(`
    CREATE TABLE IF NOT EXISTS local_agent_commands (
      id TEXT PRIMARY KEY,
      local_agent_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      agentic_profile_id TEXT,
      command TEXT NOT NULL,
      params TEXT DEFAULT '{}',
      status TEXT DEFAULT 'pending'
        CHECK(status IN ('pending','sent','executing','success','failed','timeout','approval_required','approved','denied')),
      result TEXT,
      error_message TEXT,
      execution_time_ms INTEGER,
      requested_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT,
      FOREIGN KEY (local_agent_id) REFERENCES local_agents(id)
    );
  `);
  console.log('  [OK] local_agent_commands table');

  // 2. Indexes for local_agent_commands
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_lac_agent
      ON local_agent_commands(local_agent_id);
    CREATE INDEX IF NOT EXISTS idx_lac_user
      ON local_agent_commands(user_id);
    CREATE INDEX IF NOT EXISTS idx_lac_status
      ON local_agent_commands(status);
    CREATE INDEX IF NOT EXISTS idx_lac_requested
      ON local_agent_commands(requested_at);
  `);
  console.log('  [OK] Indexes created');

  // 3. Add tool_registry column to local_agents (safe ALTER TABLE)
  try {
    db.exec(`ALTER TABLE local_agents ADD COLUMN tool_registry TEXT DEFAULT '{}'`);
    console.log('  [OK] Added tool_registry column to local_agents');
  } catch (e) {
    if (e.message.includes('duplicate column')) {
      console.log('  [SKIP] tool_registry column already exists');
    } else {
      throw e;
    }
  }

  db.close();
  console.log('=== Local Agent Phase 5.2 Migration Complete ===');
}

// Run if called directly
if (require.main === module) {
  migrate();
}

module.exports = { migrate };
