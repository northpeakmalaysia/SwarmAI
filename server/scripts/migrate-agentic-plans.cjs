/**
 * Migration: Create agentic_plans table
 *
 * Stores decomposed task execution plans for Phase 3 (Task Decomposition).
 * Plans contain step graphs with dependencies for DAG-based parallel execution.
 *
 * Usage: node server/scripts/migrate-agentic-plans.cjs
 */

const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = process.env.SQLITE_PATH || path.join(__dirname, '..', 'data', 'swarm.db');

function migrate() {
  console.log(`[migrate-agentic-plans] Opening database: ${DB_PATH}`);
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  // Create agentic_plans table
  db.exec(`
    CREATE TABLE IF NOT EXISTS agentic_plans (
      id TEXT PRIMARY KEY,
      agentic_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      goal TEXT NOT NULL,
      steps TEXT NOT NULL,
      dependency_graph TEXT,
      parallel_groups TEXT,
      status TEXT DEFAULT 'pending',
      step_results TEXT,
      current_step TEXT,
      total_steps INTEGER DEFAULT 0,
      completed_steps INTEGER DEFAULT 0,
      failed_steps INTEGER DEFAULT 0,
      tokens_used INTEGER DEFAULT 0,
      trigger TEXT,
      trigger_context TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT,
      FOREIGN KEY (agentic_id) REFERENCES agentic_profiles(id)
    );
  `);

  // Create indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_agentic_plans_agent ON agentic_plans(agentic_id, status);
    CREATE INDEX IF NOT EXISTS idx_agentic_plans_user ON agentic_plans(user_id);
    CREATE INDEX IF NOT EXISTS idx_agentic_plans_created ON agentic_plans(created_at);
  `);

  console.log('[migrate-agentic-plans] Table "agentic_plans" created successfully');
  db.close();
}

try {
  migrate();
  console.log('[migrate-agentic-plans] Migration completed');
} catch (error) {
  console.error('[migrate-agentic-plans] Migration failed:', error.message);
  process.exit(1);
}
