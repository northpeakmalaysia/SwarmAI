/**
 * Migration: Add scheduled_messages table
 * Run: node server/scripts/migrate-scheduled-messages.cjs
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'swarm.db');
const db = new Database(dbPath);

console.log('🔄 Running migration: scheduled_messages table...');

// Create scheduled_messages table if it doesn't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS scheduled_messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    agent_id TEXT,
    content TEXT NOT NULL,
    content_type TEXT DEFAULT 'text',
    scheduled_at TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    error_message TEXT,
    sent_message_id TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_scheduled_messages_user_id ON scheduled_messages(user_id);
  CREATE INDEX IF NOT EXISTS idx_scheduled_messages_status ON scheduled_messages(status);
  CREATE INDEX IF NOT EXISTS idx_scheduled_messages_scheduled_at ON scheduled_messages(scheduled_at);
`);

console.log('✅ scheduled_messages table created');

// Verify table structure
const columns = db.prepare(`PRAGMA table_info(scheduled_messages)`).all();
console.log('📋 Table structure:');
columns.forEach(col => {
  console.log(`  - ${col.name} (${col.type}${col.notnull ? ', NOT NULL' : ''}${col.pk ? ', PK' : ''})`);
});

db.close();
console.log('✅ Migration complete!');
