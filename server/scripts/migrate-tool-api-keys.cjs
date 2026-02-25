/**
 * Migration Script: Tool API Keys and MCP Server Tools
 *
 * Adds two new tables:
 * 1. tool_api_keys - Store user API keys for tools like searchWeb (Brave, Serper, etc.)
 * 2. mcp_server_tools - Store discovered tools from MCP servers
 *
 * Run: node server/scripts/migrate-tool-api-keys.cjs
 */

const path = require('path');
const Database = require('better-sqlite3');

// Database path
const DB_PATH = path.join(__dirname, '..', 'data', 'swarm.db');

function migrate() {
  console.log('Starting migration: Tool API Keys and MCP Server Tools');
  console.log(`Database path: ${DB_PATH}`);

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  try {
    // Start transaction
    db.exec('BEGIN TRANSACTION');

    // ============================================
    // Table 1: tool_api_keys
    // ============================================
    console.log('\n[1/4] Creating tool_api_keys table...');

    db.exec(`
      CREATE TABLE IF NOT EXISTS tool_api_keys (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        tool_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        api_key TEXT NOT NULL,
        priority INTEGER DEFAULT 1,
        is_active INTEGER DEFAULT 1,
        last_used_at TEXT,
        last_error TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE(user_id, tool_id, provider),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    console.log('   - Table created');

    // Create indexes
    console.log('[2/4] Creating indexes for tool_api_keys...');
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_tool_api_keys_user
      ON tool_api_keys(user_id)
    `);
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_tool_api_keys_tool_priority
      ON tool_api_keys(tool_id, user_id, priority)
    `);
    console.log('   - Indexes created');

    // ============================================
    // Table 2: mcp_server_tools
    // ============================================
    console.log('\n[3/4] Creating mcp_server_tools table...');

    db.exec(`
      CREATE TABLE IF NOT EXISTS mcp_server_tools (
        id TEXT PRIMARY KEY,
        server_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        tool_name TEXT NOT NULL,
        description TEXT,
        input_schema TEXT,
        is_enabled INTEGER DEFAULT 1,
        last_synced_at TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (server_id) REFERENCES mcp_servers(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(server_id, tool_name)
      )
    `);
    console.log('   - Table created');

    // Create indexes
    console.log('[4/4] Creating indexes for mcp_server_tools...');
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_mcp_server_tools_server
      ON mcp_server_tools(server_id)
    `);
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_mcp_server_tools_user
      ON mcp_server_tools(user_id)
    `);
    console.log('   - Indexes created');

    // Commit transaction
    db.exec('COMMIT');

    console.log('\n========================================');
    console.log('Migration completed successfully!');
    console.log('========================================');

    // Verify tables
    console.log('\nVerifying tables...');
    const tables = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name IN ('tool_api_keys', 'mcp_server_tools')
    `).all();

    tables.forEach(t => console.log(`   - ${t.name} exists`));

    if (tables.length === 2) {
      console.log('\nAll tables created successfully!');
    } else {
      console.warn('\nWarning: Not all tables were created');
    }

  } catch (error) {
    console.error('\nMigration failed:', error.message);
    db.exec('ROLLBACK');
    process.exit(1);
  } finally {
    db.close();
  }
}

// Run migration
migrate();
