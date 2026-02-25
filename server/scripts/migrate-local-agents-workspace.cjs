/**
 * Migration: Local Agent Workspace System
 *
 * Adds workspace_root column to local_agents table.
 * Stores the configured workspace root path reported by each local agent.
 *
 * Idempotent - safe to run multiple times.
 */

const path = require('path');

function migrate() {
  const dbPath = path.join(__dirname, '..', 'data', 'swarm.db');
  const Database = require('better-sqlite3');
  const db = new Database(dbPath, { verbose: null });
  db.pragma('journal_mode = WAL');

  console.log('=== Local Agent Workspace Migration ===');

  // Add workspace_root column to local_agents
  try {
    db.exec(`ALTER TABLE local_agents ADD COLUMN workspace_root TEXT DEFAULT NULL`);
    console.log('  [OK] Added workspace_root column to local_agents');
  } catch (e) {
    if (e.message.includes('duplicate column')) {
      console.log('  [SKIP] workspace_root column already exists');
    } else {
      throw e;
    }
  }

  db.close();
  console.log('=== Local Agent Workspace Migration Complete ===');
}

// Run if called directly
if (require.main === module) {
  migrate();
}

module.exports = { migrate };
