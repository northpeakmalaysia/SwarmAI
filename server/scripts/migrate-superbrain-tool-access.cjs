/**
 * Migration: Add Tool Access Control columns to superbrain_settings table
 *
 * New columns:
 * - auto_send_mode: 'allowed' | 'restricted' (default: 'restricted')
 *   Controls whether SuperBrain can auto-send messages without FlowBuilder
 *
 * - enabled_tools: JSON array of tool IDs
 *   If NULL, all tools are enabled. Otherwise only listed tools can be used.
 *
 * - tool_confidence_threshold: 0.0 - 1.0 (default: 0.7)
 *   Minimum AI confidence required to auto-execute a tool
 *
 * - ai_router_mode: 'full' | 'classify_only' | 'disabled' (default: 'full')
 *   Controls AI Router behavior
 *
 * Run with: node server/scripts/migrate-superbrain-tool-access.cjs
 */

const path = require('path');
const Database = require('better-sqlite3');

// Database path
const dbPath = path.join(__dirname, '..', 'data', 'swarm.db');

console.log('='.repeat(60));
console.log('SuperBrain Tool Access Migration');
console.log('='.repeat(60));
console.log(`Database: ${dbPath}`);
console.log('');

try {
  const db = new Database(dbPath);

  // Get current columns
  const columns = db.prepare(`PRAGMA table_info(superbrain_settings)`).all();
  const columnNames = columns.map(c => c.name);

  console.log('Current columns:', columnNames.join(', '));
  console.log('');

  // Columns to add
  const newColumns = [
    {
      name: 'auto_send_mode',
      definition: "TEXT DEFAULT 'restricted' CHECK(auto_send_mode IN ('allowed', 'restricted'))",
      default: 'restricted',
    },
    {
      name: 'enabled_tools',
      definition: 'TEXT', // JSON array, NULL = all enabled
      default: null,
    },
    {
      name: 'tool_confidence_threshold',
      definition: 'REAL DEFAULT 0.7 CHECK(tool_confidence_threshold >= 0 AND tool_confidence_threshold <= 1)',
      default: 0.7,
    },
    {
      name: 'ai_router_mode',
      definition: "TEXT DEFAULT 'full' CHECK(ai_router_mode IN ('full', 'classify_only', 'disabled'))",
      default: 'full',
    },
  ];

  let addedCount = 0;

  for (const col of newColumns) {
    if (columnNames.includes(col.name)) {
      console.log(`[SKIP] Column '${col.name}' already exists`);
    } else {
      console.log(`[ADD] Adding column '${col.name}'...`);

      // SQLite doesn't support CHECK constraints in ALTER TABLE, so we add without CHECK
      // The CHECK will be enforced in new databases from the schema
      let sql;
      if (col.name === 'auto_send_mode') {
        sql = `ALTER TABLE superbrain_settings ADD COLUMN ${col.name} TEXT DEFAULT 'restricted'`;
      } else if (col.name === 'enabled_tools') {
        sql = `ALTER TABLE superbrain_settings ADD COLUMN ${col.name} TEXT`;
      } else if (col.name === 'tool_confidence_threshold') {
        sql = `ALTER TABLE superbrain_settings ADD COLUMN ${col.name} REAL DEFAULT 0.7`;
      } else if (col.name === 'ai_router_mode') {
        sql = `ALTER TABLE superbrain_settings ADD COLUMN ${col.name} TEXT DEFAULT 'full'`;
      }

      db.exec(sql);
      console.log(`[OK] Column '${col.name}' added successfully`);
      addedCount++;
    }
  }

  console.log('');
  console.log('='.repeat(60));

  if (addedCount > 0) {
    console.log(`Migration complete! Added ${addedCount} new column(s).`);
    console.log('');
    console.log('New settings available:');
    console.log('- auto_send_mode: "allowed" | "restricted" (default: restricted)');
    console.log('  Controls whether SuperBrain can auto-send messages');
    console.log('');
    console.log('- enabled_tools: JSON array of tool IDs (default: null = all)');
    console.log('  List of tools SuperBrain is allowed to execute');
    console.log('');
    console.log('- tool_confidence_threshold: 0.0-1.0 (default: 0.7)');
    console.log('  Minimum confidence to auto-execute tools');
    console.log('');
    console.log('- ai_router_mode: "full" | "classify_only" | "disabled"');
    console.log('  Controls AI Router behavior');
  } else {
    console.log('No changes needed - all columns already exist.');
  }

  console.log('='.repeat(60));

  // Verify columns
  const updatedColumns = db.prepare(`PRAGMA table_info(superbrain_settings)`).all();
  console.log('');
  console.log('Verified columns:');
  for (const col of updatedColumns) {
    const isNew = newColumns.some(nc => nc.name === col.name);
    console.log(`  ${isNew ? '[NEW] ' : '      '}${col.name}: ${col.type} ${col.notnull ? 'NOT NULL' : ''} ${col.dflt_value ? `DEFAULT ${col.dflt_value}` : ''}`);
  }

  db.close();
  process.exit(0);

} catch (error) {
  console.error('');
  console.error('ERROR:', error.message);
  console.error('');
  process.exit(1);
}
