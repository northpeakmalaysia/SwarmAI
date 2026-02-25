/**
 * Database Migration: Heartbeat Protocol
 * ========================================
 * Adds heartbeat_config column to agentic_profiles.
 * Run with: node server/scripts/migrate-heartbeat.cjs
 *
 * Idempotent - safe to run multiple times.
 */
const Database = require('better-sqlite3');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'swarm.db');

console.log(`Opening database: ${DB_PATH}`);
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// Add heartbeat_config column to agentic_profiles
console.log('\n1. Adding heartbeat_config column to agentic_profiles...');
try {
  const columns = db.prepare("PRAGMA table_info(agentic_profiles)").all();
  const hasColumn = columns.some(c => c.name === 'heartbeat_config');

  if (!hasColumn) {
    db.exec(`ALTER TABLE agentic_profiles ADD COLUMN heartbeat_config TEXT DEFAULT NULL`);
    console.log('   OK: heartbeat_config column added');
  } else {
    console.log('   SKIP: heartbeat_config column already exists');
  }
} catch (e) {
  console.log(`   INFO: ${e.message}`);
}

db.close();
console.log('\nMigration completed successfully.');
