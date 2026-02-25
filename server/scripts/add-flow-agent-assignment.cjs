/**
 * Migration: Add flow-agent assignment
 *
 * Adds agent_id column to flows table and creates
 * flow_agent_assignments table for many-to-many relationships.
 *
 * Run with: node scripts/add-flow-agent-assignment.cjs
 */

const { getDatabase } = require('../services/database.cjs');
const { logger } = require('../services/logger.cjs');

function migrate() {
  const db = getDatabase();

  console.log('Starting flow-agent assignment migration...');

  try {
    // Check if agent_id column exists
    const flowColumns = db.prepare(`PRAGMA table_info(flows)`).all();
    const hasAgentId = flowColumns.some(col => col.name === 'agent_id');

    if (!hasAgentId) {
      console.log('Adding agent_id column to flows table...');
      db.exec(`ALTER TABLE flows ADD COLUMN agent_id TEXT`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_flows_agent_id ON flows(agent_id)`);
      console.log('  ✓ Added agent_id column to flows table');
    } else {
      console.log('  - agent_id column already exists in flows table');
    }

    // Create flow_agent_assignments table for many-to-many (optional)
    // This allows a flow to be assigned to multiple agents
    console.log('Creating flow_agent_assignments table...');
    db.exec(`
      CREATE TABLE IF NOT EXISTS flow_agent_assignments (
        id TEXT PRIMARY KEY,
        flow_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        priority INTEGER DEFAULT 0,
        trigger_filter TEXT,
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (flow_id) REFERENCES flows(id) ON DELETE CASCADE,
        FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
        UNIQUE(flow_id, agent_id)
      )
    `);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_flow_agent_flow ON flow_agent_assignments(flow_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_flow_agent_agent ON flow_agent_assignments(agent_id)`);
    console.log('  ✓ Created flow_agent_assignments table');

    console.log('\n✓ Migration completed successfully!');
    console.log('\nFlow-agent assignment is now available:');
    console.log('  - flows.agent_id: Direct 1-to-1 assignment');
    console.log('  - flow_agent_assignments: Many-to-many with priorities and filters');

  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  }
}

migrate();
