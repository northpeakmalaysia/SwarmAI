/**
 * Migration: Plan-Driven Reasoning Loop Columns
 *
 * Adds columns to agentic_tasks for plan-driven execution:
 * - plan_item_type: Type of plan step (tool_action, human_input, delegation, research, synthesis)
 * - plan_order: Execution order within parent plan
 * - plan_context: JSON context (expectedTool, dependsOn)
 * - awaiting_from_contact_id: Who we're waiting for (human-in-loop)
 * - awaiting_from_conversation_id: Conversation context for the wait
 * - awaiting_response_message: The question we asked the human
 * - response_received: The answer we got back
 * - response_received_at: When the response came in
 * - original_requester_conversation_id: To notify back the original requester
 * - original_requester_account_id: Account to send notification through
 *
 * Run with: node server/scripts/migrate-plan-driven-tasks.cjs
 */

const Database = require('better-sqlite3');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'swarm.db');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('Migration: Plan-Driven Reasoning Loop Columns');
console.log(`Database: ${DB_PATH}`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// Helper function to check if a column exists
function columnExists(tableName, columnName) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  return columns.some(col => col.name === columnName);
}

// Helper function to add a column safely
function addColumnIfNotExists(tableName, columnName, columnDef) {
  if (columnExists(tableName, columnName)) {
    console.log(`   - ${columnName}: already exists`);
    return 'existed';
  }

  try {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDef}`);
    console.log(`   + ${columnName}: added successfully`);
    return 'added';
  } catch (error) {
    console.error(`   ! ${columnName}: failed - ${error.message}`);
    return 'failed';
  }
}

// Check if table exists
const tableExists = db.prepare(`
  SELECT name FROM sqlite_master
  WHERE type='table' AND name='agentic_tasks'
`).get();

if (!tableExists) {
  console.log('\nTable agentic_tasks does not exist. Please run migrate-agentic-tables.cjs first.');
  process.exit(1);
}

console.log('\n[1/3] Adding plan-driven columns to agentic_tasks...');

const columnsToAdd = [
  // Plan structure
  { name: 'plan_item_type', def: 'TEXT' },   // tool_action | human_input | delegation | research | synthesis
  { name: 'plan_order', def: 'INTEGER' },     // execution order within parent plan
  { name: 'plan_context', def: 'TEXT' },       // JSON: {expectedTool, dependsOn}

  // Human-in-loop: awaiting response
  { name: 'awaiting_from_contact_id', def: 'TEXT' },
  { name: 'awaiting_from_conversation_id', def: 'TEXT' },
  { name: 'awaiting_response_message', def: 'TEXT' },
  { name: 'response_received', def: 'TEXT' },
  { name: 'response_received_at', def: 'TEXT' },

  // Original requester notification
  { name: 'original_requester_conversation_id', def: 'TEXT' },
  { name: 'original_requester_account_id', def: 'TEXT' },
];

let added = 0;
let existed = 0;
let failed = 0;

columnsToAdd.forEach(({ name, def }) => {
  const result = addColumnIfNotExists('agentic_tasks', name, def);
  if (result === 'added') added++;
  else if (result === 'existed') existed++;
  else failed++;
});

// Create indexes for task-message correlation
console.log('\n[2/3] Creating indexes for task-message correlation...');

const indexes = [
  {
    name: 'idx_agentic_task_awaiting',
    sql: `CREATE INDEX IF NOT EXISTS idx_agentic_task_awaiting
          ON agentic_tasks(awaiting_from_contact_id, status)
          WHERE plan_item_type = 'human_input' AND status = 'blocked'`,
  },
  {
    name: 'idx_agentic_task_plan_parent',
    sql: `CREATE INDEX IF NOT EXISTS idx_agentic_task_plan_parent
          ON agentic_tasks(parent_task_id, plan_order)
          WHERE parent_task_id IS NOT NULL`,
  },
  {
    name: 'idx_agentic_task_plan_type',
    sql: `CREATE INDEX IF NOT EXISTS idx_agentic_task_plan_type
          ON agentic_tasks(agentic_id, plan_item_type, status)
          WHERE plan_item_type IS NOT NULL`,
  },
];

indexes.forEach(({ name, sql }) => {
  try {
    db.exec(sql);
    console.log(`   + ${name}: created/verified`);
  } catch (error) {
    console.log(`   ! ${name}: ${error.message}`);
  }
});

// Verify migration
console.log('\n[3/3] Verifying migration...');

const columns = db.prepare('PRAGMA table_info(agentic_tasks)').all();
const columnNames = columns.map(c => c.name);
const expectedColumns = columnsToAdd.map(c => c.name);
const missing = expectedColumns.filter(c => !columnNames.includes(c));

if (missing.length === 0) {
  console.log('   All plan-driven columns verified successfully.');
} else {
  console.log(`   WARNING: Missing columns: ${missing.join(', ')}`);
}

db.close();

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('Migration Summary:');
console.log(`   Added: ${added}`);
console.log(`   Already existed: ${existed}`);
console.log(`   Failed: ${failed}`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

if (failed > 0) {
  console.log('\nMigration completed with errors.');
  process.exit(1);
} else {
  console.log('\nMigration completed successfully.');
}
