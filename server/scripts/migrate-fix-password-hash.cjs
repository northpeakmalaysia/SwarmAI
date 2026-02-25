/**
 * Database Migration: Fix password_hash NOT NULL constraint
 *
 * SQLite doesn't support ALTER COLUMN, so we need to:
 * 1. Create a new table with correct schema
 * 2. Copy data from old table
 * 3. Drop old table
 * 4. Rename new table
 *
 * Safe to run multiple times.
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Database path
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'swarm.db');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('Database Migration: Fix password_hash constraint');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`Database: ${DB_PATH}`);

if (!fs.existsSync(DB_PATH)) {
  console.log('Database does not exist. Nothing to migrate.');
  process.exit(0);
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// Check current schema
const tableInfo = db.prepare("PRAGMA table_info(users)").all();
const passwordColumn = tableInfo.find(col => col.name === 'password_hash');

if (!passwordColumn) {
  console.log('password_hash column not found. Schema may be different.');
  db.close();
  process.exit(0);
}

console.log(`\nCurrent password_hash column: notnull=${passwordColumn.notnull}`);

if (passwordColumn.notnull === 0) {
  console.log('password_hash already allows NULL. No migration needed.');
  db.close();
  process.exit(0);
}

console.log('\nMigrating users table to allow NULL password_hash...');

// Start transaction
db.exec('BEGIN TRANSACTION');

try {
  // 1. Create new table with correct schema
  console.log('1. Creating users_new table...');
  db.exec(`
    CREATE TABLE users_new (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT,
      name TEXT,
      role TEXT DEFAULT 'user' CHECK(role IN ('user', 'admin')),
      is_superuser INTEGER DEFAULT 0,
      rate_limit_tier TEXT DEFAULT 'free',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // 2. Copy data from old table
  console.log('2. Copying data from users to users_new...');
  const columns = tableInfo.map(col => col.name).join(', ');

  // Get columns that exist in both tables
  const newTableInfo = db.prepare("PRAGMA table_info(users_new)").all();
  const newColumns = newTableInfo.map(col => col.name);
  const commonColumns = tableInfo
    .map(col => col.name)
    .filter(name => newColumns.includes(name));

  const columnList = commonColumns.join(', ');
  console.log(`   Copying columns: ${columnList}`);

  db.exec(`INSERT INTO users_new (${columnList}) SELECT ${columnList} FROM users`);

  // 3. Drop old table
  console.log('3. Dropping old users table...');
  db.exec('DROP TABLE users');

  // 4. Rename new table
  console.log('4. Renaming users_new to users...');
  db.exec('ALTER TABLE users_new RENAME TO users');

  // 5. Recreate indexes
  console.log('5. Recreating indexes...');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email)');

  // Commit transaction
  db.exec('COMMIT');

  console.log('\n✅ Migration completed successfully!');

  // Verify
  const newInfo = db.prepare("PRAGMA table_info(users)").all();
  const newPasswordCol = newInfo.find(col => col.name === 'password_hash');
  console.log(`\nVerification: password_hash notnull=${newPasswordCol.notnull} (should be 0)`);

} catch (error) {
  console.error('\n❌ Migration failed:', error.message);
  db.exec('ROLLBACK');
  process.exit(1);
}

db.close();

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
