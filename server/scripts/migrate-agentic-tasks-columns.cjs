/**
 * Migration: Add missing columns to agentic_tasks table
 *
 * Adds columns required by the Tasks endpoints:
 * - parent_task_id: For task hierarchy/subtasks
 * - tags: JSON array of tags
 * - progress_percent: Task completion percentage (0-100)
 * - actual_hours: Actual hours spent
 * - ai_analysis: AI analysis notes
 * - completion_notes: Notes on completion
 *
 * Run with: node server/scripts/migrate-agentic-tasks-columns.cjs
 */

const Database = require('better-sqlite3');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'swarm.db');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('Migration: Add missing columns to agentic_tasks');
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
    return false;
  }

  try {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDef}`);
    console.log(`   + ${columnName}: added successfully`);
    return true;
  } catch (error) {
    console.error(`   ! ${columnName}: failed - ${error.message}`);
    return false;
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

console.log('\nAdding missing columns to agentic_tasks...');

// Add missing columns
const columnsToAdd = [
  { name: 'parent_task_id', def: 'TEXT' },
  { name: 'tags', def: "TEXT DEFAULT '[]'" },
  { name: 'progress_percent', def: 'INTEGER DEFAULT 0' },
  { name: 'actual_hours', def: 'REAL' },
  { name: 'ai_analysis', def: 'TEXT' },
  { name: 'completion_notes', def: 'TEXT' }
];

let added = 0;
let existed = 0;
let failed = 0;

columnsToAdd.forEach(({ name, def }) => {
  const result = addColumnIfNotExists('agentic_tasks', name, def);
  if (result === true) added++;
  else if (result === false && columnExists('agentic_tasks', name)) existed++;
  else failed++;
});

// Create index for parent_task_id if it doesn't exist
try {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_agentic_task_parent
    ON agentic_tasks(parent_task_id)
  `);
  console.log('\n   + idx_agentic_task_parent index: created/verified');
} catch (error) {
  console.log(`\n   ! idx_agentic_task_parent index: ${error.message}`);
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
