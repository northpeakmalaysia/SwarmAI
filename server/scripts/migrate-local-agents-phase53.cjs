/**
 * Migration: Local Agent Phase 5.3 (MCP Integration)
 *
 * Adds mcp_tools column to local_agents table.
 * Idempotent - safe to run multiple times.
 */
const path = require('path');

function migrate() {
  const dbPath = path.join(__dirname, '..', 'data', 'swarm.db');
  const Database = require('better-sqlite3');
  const db = new Database(dbPath, { verbose: null });
  db.pragma('journal_mode = WAL');

  console.log('=== Local Agent Migration (Phase 5.3 - MCP Integration) ===');

  try {
    db.exec(`ALTER TABLE local_agents ADD COLUMN mcp_tools TEXT DEFAULT '[]'`);
    console.log('  [OK] Added mcp_tools column to local_agents');
  } catch (e) {
    if (e.message.includes('duplicate column')) {
      console.log('  [SKIP] mcp_tools column already exists');
    } else {
      throw e;
    }
  }

  db.close();
  console.log('=== Migration Complete ===');
}

if (require.main === module) {
  migrate();
}

module.exports = { migrate };
