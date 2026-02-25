/**
 * Migration: Mobile Agent System
 *
 * Creates tables for:
 * - mobile_agents: Registered mobile phone devices
 * - mobile_pairing_codes: 6-digit pairing code flow (YouTube TV style)
 * - mobile_events: SMS, notifications, calls, device status, GPS events
 *
 * Completely separate from Local Agent (Phase 5.x) tables.
 * Idempotent - safe to run multiple times.
 */

const path = require('path');

function migrate() {
  const dbPath = path.join(__dirname, '..', 'data', 'swarm.db');
  const Database = require('better-sqlite3');
  const db = new Database(dbPath, { verbose: null });
  db.pragma('journal_mode = WAL');

  console.log('=== Mobile Agent Migration ===');

  // 1. mobile_agents table
  db.exec(`
    CREATE TABLE IF NOT EXISTS mobile_agents (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      api_key_hash TEXT NOT NULL,
      api_key_prefix TEXT NOT NULL,
      phone_number TEXT,
      device_model TEXT,
      device_manufacturer TEXT,
      os_version TEXT,
      app_version TEXT,
      is_online INTEGER DEFAULT 0,
      last_connected_at TEXT,
      last_heartbeat_at TEXT,
      health_metrics TEXT DEFAULT '{}',
      push_config TEXT DEFAULT '{}',
      capabilities TEXT DEFAULT '[]',
      status TEXT DEFAULT 'active'
        CHECK(status IN ('active', 'revoked')),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
  console.log('  [OK] mobile_agents table');

  // 2. mobile_pairing_codes table
  db.exec(`
    CREATE TABLE IF NOT EXISTS mobile_pairing_codes (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL,
      device_name TEXT NOT NULL,
      device_info TEXT DEFAULT '{}',
      phone_number TEXT,
      server_url TEXT,
      status TEXT DEFAULT 'pending'
        CHECK(status IN ('pending', 'paired', 'expired', 'consumed')),
      user_id TEXT,
      mobile_agent_id TEXT,
      api_key_hash TEXT,
      api_key_prefix TEXT,
      expires_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
  console.log('  [OK] mobile_pairing_codes table');

  // 3. mobile_events table
  db.exec(`
    CREATE TABLE IF NOT EXISTS mobile_events (
      id TEXT PRIMARY KEY,
      mobile_agent_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      event_type TEXT NOT NULL CHECK(event_type IN (
        'sms_received','sms_sent','notification','battery_status',
        'device_status','call_missed','call_incoming','connectivity_change',
        'location_update'
      )),
      source_app TEXT,
      sender TEXT,
      title TEXT,
      body TEXT,
      metadata TEXT DEFAULT '{}',
      is_read INTEGER DEFAULT 0,
      is_important INTEGER DEFAULT 0,
      device_timestamp TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
  console.log('  [OK] mobile_events table');

  // 4. Indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_ma_user ON mobile_agents(user_id);
    CREATE INDEX IF NOT EXISTS idx_ma_status ON mobile_agents(status);
    CREATE INDEX IF NOT EXISTS idx_ma_api_key ON mobile_agents(api_key_hash);

    CREATE INDEX IF NOT EXISTS idx_mpc_code ON mobile_pairing_codes(code);
    CREATE INDEX IF NOT EXISTS idx_mpc_status ON mobile_pairing_codes(status);

    CREATE INDEX IF NOT EXISTS idx_me_user_type ON mobile_events(user_id, event_type);
    CREATE INDEX IF NOT EXISTS idx_me_agent ON mobile_events(mobile_agent_id);
    CREATE INDEX IF NOT EXISTS idx_me_created ON mobile_events(created_at);
    CREATE INDEX IF NOT EXISTS idx_me_important ON mobile_events(user_id, is_important);
  `);
  console.log('  [OK] Indexes created');

  db.close();
  console.log('=== Mobile Agent Migration Complete ===');
}

// Run if called directly
if (require.main === module) {
  migrate();
}

module.exports = { migrate };
