/**
 * Migration: Local Agent System (Phase 5.1)
 *
 * Creates tables for:
 * - local_agents: Registered local agent devices
 * - local_agent_challenges: Auth challenge/approval flow
 *
 * Idempotent - safe to run multiple times.
 */

const path = require('path');

function migrate() {
  const dbPath = path.join(__dirname, '..', 'data', 'swarm.db');
  const Database = require('better-sqlite3');
  const db = new Database(dbPath, { verbose: null });
  db.pragma('journal_mode = WAL');

  console.log('=== Local Agent Migration (Phase 5.1) ===');

  // 1. local_agents table
  db.exec(`
    CREATE TABLE IF NOT EXISTS local_agents (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      api_key_hash TEXT NOT NULL,
      api_key_prefix TEXT NOT NULL,
      hostname TEXT,
      os_type TEXT,
      os_version TEXT,
      last_connected_at TEXT,
      last_heartbeat_at TEXT,
      is_online INTEGER DEFAULT 0,
      capabilities TEXT DEFAULT '[]',
      status TEXT DEFAULT 'active' CHECK(status IN ('active', 'revoked')),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
  console.log('  [OK] local_agents table');

  // 2. local_agent_challenges table
  db.exec(`
    CREATE TABLE IF NOT EXISTS local_agent_challenges (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'denied', 'expired')),
      device_name TEXT,
      device_info TEXT DEFAULT '{}',
      api_key_hash TEXT,
      api_key_prefix TEXT,
      local_agent_id TEXT,
      expires_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
  console.log('  [OK] local_agent_challenges table');

  // 3. Indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_local_agents_user
      ON local_agents(user_id);
    CREATE INDEX IF NOT EXISTS idx_local_agents_status
      ON local_agents(status);
    CREATE INDEX IF NOT EXISTS idx_local_agent_challenges_status
      ON local_agent_challenges(status);
    CREATE INDEX IF NOT EXISTS idx_local_agent_challenges_user
      ON local_agent_challenges(user_id);
  `);
  console.log('  [OK] Indexes created');

  db.close();
  console.log('=== Local Agent Migration Complete ===');
}

// Run if called directly
if (require.main === module) {
  migrate();
}

module.exports = { migrate };
