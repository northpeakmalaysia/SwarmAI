/**
 * Migration: Scope Overhaul
 *
 * Adds per-platform scope support and group whitelisting to agentic_contact_scope.
 *
 * Changes:
 * - Adds `platform_account_id` column (NULL = global default, set = per-account override)
 * - Adds `whitelist_group_ids` column (JSON array of conversation IDs)
 * - Changes uniqueness from UNIQUE(agentic_id) to UNIQUE(agentic_id, platform_account_id)
 * - Preserves existing rows as global defaults (platform_account_id = NULL)
 *
 * Run: node server/scripts/migrate-scope-overhaul.cjs
 */

const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, '..', 'data', 'swarm.db');

function migrate() {
  console.log('=== Scope Overhaul Migration ===');
  console.log(`Database: ${DB_PATH}`);

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  // Check if table exists
  const tableExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='agentic_contact_scope'"
  ).get();

  if (!tableExists) {
    console.log('Table agentic_contact_scope does not exist. Creating fresh...');
    db.exec(`
      CREATE TABLE agentic_contact_scope (
        id TEXT PRIMARY KEY,
        agentic_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        platform_account_id TEXT DEFAULT NULL,
        scope_type TEXT DEFAULT 'team_only',
        whitelist_contact_ids TEXT DEFAULT '[]',
        whitelist_tags TEXT DEFAULT '[]',
        whitelist_group_ids TEXT DEFAULT '[]',
        allow_team_members INTEGER DEFAULT 1,
        allow_master_contact INTEGER DEFAULT 1,
        notify_on_out_of_scope INTEGER DEFAULT 1,
        auto_add_approved INTEGER DEFAULT 0,
        log_all_communications INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE(agentic_id, platform_account_id)
      );
    `);
    console.log('Created agentic_contact_scope table with new schema.');
    db.close();
    return;
  }

  // Check if columns already exist
  const cols = db.pragma('table_info(agentic_contact_scope)').map(c => c.name);

  if (cols.includes('platform_account_id') && cols.includes('whitelist_group_ids')) {
    console.log('Migration already applied (columns exist). Skipping.');
    db.close();
    return;
  }

  // Count existing rows for reporting
  const rowCount = db.prepare('SELECT COUNT(*) as cnt FROM agentic_contact_scope').get().cnt;
  console.log(`Existing rows: ${rowCount} (will become global defaults)`);

  // Recreate table with new schema, preserving data
  db.exec('BEGIN TRANSACTION');

  try {
    // 1. Rename old table
    db.exec('ALTER TABLE agentic_contact_scope RENAME TO _agentic_contact_scope_old');

    // 2. Create new table with updated schema
    db.exec(`
      CREATE TABLE agentic_contact_scope (
        id TEXT PRIMARY KEY,
        agentic_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        platform_account_id TEXT DEFAULT NULL,
        scope_type TEXT DEFAULT 'team_only',
        whitelist_contact_ids TEXT DEFAULT '[]',
        whitelist_tags TEXT DEFAULT '[]',
        whitelist_group_ids TEXT DEFAULT '[]',
        allow_team_members INTEGER DEFAULT 1,
        allow_master_contact INTEGER DEFAULT 1,
        notify_on_out_of_scope INTEGER DEFAULT 1,
        auto_add_approved INTEGER DEFAULT 0,
        log_all_communications INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE(agentic_id, platform_account_id)
      );
    `);

    // 3. Copy data — existing rows get platform_account_id = NULL (global defaults)
    //    and whitelist_group_ids = '[]'
    const oldCols = db.pragma('table_info(_agentic_contact_scope_old)').map(c => c.name);
    // Build column list from old table (only cols that exist in both)
    const commonCols = [
      'id', 'agentic_id', 'user_id', 'scope_type',
      'whitelist_contact_ids', 'whitelist_tags',
      'allow_team_members', 'allow_master_contact',
      'notify_on_out_of_scope', 'auto_add_approved',
      'log_all_communications', 'created_at', 'updated_at'
    ].filter(c => oldCols.includes(c));

    const selectCols = commonCols.join(', ');
    db.exec(`
      INSERT INTO agentic_contact_scope (${selectCols})
      SELECT ${selectCols} FROM _agentic_contact_scope_old
    `);

    // 4. Drop old table
    db.exec('DROP TABLE _agentic_contact_scope_old');

    db.exec('COMMIT');

    const newCount = db.prepare('SELECT COUNT(*) as cnt FROM agentic_contact_scope').get().cnt;
    console.log(`Migration complete. ${newCount} rows migrated as global defaults (platform_account_id = NULL).`);
    console.log('New columns: platform_account_id (TEXT), whitelist_group_ids (TEXT/JSON)');
    console.log('New uniqueness: UNIQUE(agentic_id, platform_account_id)');

  } catch (err) {
    db.exec('ROLLBACK');
    console.error('Migration failed, rolled back:', err.message);

    // Try to restore old table name if rename succeeded but rest failed
    try {
      const oldExists = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='_agentic_contact_scope_old'"
      ).get();
      if (oldExists) {
        db.exec('ALTER TABLE _agentic_contact_scope_old RENAME TO agentic_contact_scope');
        console.log('Restored original table.');
      }
    } catch (restoreErr) {
      console.error('Could not restore:', restoreErr.message);
    }
  }

  db.close();
}

migrate();
