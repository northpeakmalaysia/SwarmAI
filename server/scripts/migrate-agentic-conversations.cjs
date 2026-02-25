/**
 * Migration: Create agentic_conversations + agentic_conversation_messages tables
 *
 * Stores inter-agent conversation records for Phase 6 (Collaboration Protocol).
 * Supports consultation, consensus voting, and knowledge sharing between agents.
 *
 * Usage: node server/scripts/migrate-agentic-conversations.cjs
 */

const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = process.env.SQLITE_PATH || path.join(__dirname, '..', 'data', 'swarm.db');

function migrate() {
  console.log(`[migrate-agentic-conversations] Opening database: ${DB_PATH}`);
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  // Create agentic_conversations table
  db.exec(`
    CREATE TABLE IF NOT EXISTS agentic_conversations (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL DEFAULT 'consultation',
      initiator_id TEXT NOT NULL,
      participant_ids TEXT NOT NULL,
      user_id TEXT NOT NULL,
      topic TEXT,
      status TEXT DEFAULT 'active',
      result TEXT,
      metadata TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT,
      FOREIGN KEY (initiator_id) REFERENCES agentic_profiles(id)
    );
  `);

  // Create agentic_conversation_messages table
  db.exec(`
    CREATE TABLE IF NOT EXISTS agentic_conversation_messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'agent',
      content TEXT NOT NULL,
      message_type TEXT DEFAULT 'message',
      metadata TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (conversation_id) REFERENCES agentic_conversations(id),
      FOREIGN KEY (sender_id) REFERENCES agentic_profiles(id)
    );
  `);

  // Create indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_agentic_conv_initiator ON agentic_conversations(initiator_id, status);
    CREATE INDEX IF NOT EXISTS idx_agentic_conv_user ON agentic_conversations(user_id);
    CREATE INDEX IF NOT EXISTS idx_agentic_conv_type ON agentic_conversations(type, status);
    CREATE INDEX IF NOT EXISTS idx_agentic_conv_msgs ON agentic_conversation_messages(conversation_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_agentic_conv_msgs_sender ON agentic_conversation_messages(sender_id);
  `);

  console.log('[migrate-agentic-conversations] Tables created successfully');
  db.close();
}

try {
  migrate();
  console.log('[migrate-agentic-conversations] Migration completed');
} catch (error) {
  console.error('[migrate-agentic-conversations] Migration failed:', error.message);
  process.exit(1);
}
