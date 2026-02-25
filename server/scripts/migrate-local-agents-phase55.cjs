/**
 * Migration: Local Agent Phase 5.5
 * - Adds target_user_id to local_agent_challenges for multi-tenant scoping
 * - Adds health_metrics column to local_agents for health dashboard (#9)
 *
 * Run: node server/scripts/migrate-local-agents-phase55.cjs
 */

const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'swarm.db');

function migrate() {
  console.log('[Migration 5.5] Starting...');
  console.log('[Migration 5.5] Database:', DB_PATH);

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  // Add target_user_id to local_agent_challenges
  try {
    db.exec("ALTER TABLE local_agent_challenges ADD COLUMN target_user_id TEXT DEFAULT NULL");
    console.log('[Migration 5.5] Added target_user_id to local_agent_challenges');
  } catch (e) {
    if (e.message.includes('duplicate column')) {
      console.log('[Migration 5.5] target_user_id already exists — skipping');
    } else {
      throw e;
    }
  }

  // Add health_metrics to local_agents (for #9 health dashboard)
  try {
    db.exec("ALTER TABLE local_agents ADD COLUMN health_metrics TEXT DEFAULT NULL");
    console.log('[Migration 5.5] Added health_metrics to local_agents');
  } catch (e) {
    if (e.message.includes('duplicate column')) {
      console.log('[Migration 5.5] health_metrics already exists — skipping');
    } else {
      throw e;
    }
  }

  db.close();
  console.log('[Migration 5.5] Done!');
}

migrate();
