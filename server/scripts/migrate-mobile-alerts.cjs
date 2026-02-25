/**
 * Migration: mobile_alerts table
 *
 * Stores server-to-phone push notifications for the Mobile Agent.
 * Alerts are pushed via socket.io 'mobile:alert' event and displayed
 * as native Android notifications via @notifee/react-native.
 *
 * Usage: node server/scripts/migrate-mobile-alerts.cjs
 */

const path = require('path');

// Resolve database from project root
const dbPath = path.resolve(__dirname, '..', 'services', 'database.cjs');
const { getDatabase } = require(dbPath);

function migrate() {
  const db = getDatabase();

  console.log('[migrate-mobile-alerts] Starting migration...');

  db.exec(`
    CREATE TABLE IF NOT EXISTS mobile_alerts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      agentic_id TEXT,
      alert_type TEXT NOT NULL CHECK(alert_type IN (
        'approval_needed','task_completed','critical_error',
        'budget_warning','budget_exceeded','daily_report',
        'schedule_alert','reminder','custom','test'
      )),
      title TEXT NOT NULL,
      body TEXT,
      priority TEXT DEFAULT 'normal' CHECK(priority IN ('low','normal','high','urgent')),
      action_url TEXT,
      reference_type TEXT,
      reference_id TEXT,
      delivery_status TEXT DEFAULT 'pending' CHECK(delivery_status IN ('pending','delivered','failed')),
      delivered_to TEXT DEFAULT '[]',
      read_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_ma_user ON mobile_alerts(user_id);
    CREATE INDEX IF NOT EXISTS idx_ma_unread ON mobile_alerts(user_id, read_at);
    CREATE INDEX IF NOT EXISTS idx_ma_type ON mobile_alerts(alert_type);
  `);

  console.log('[migrate-mobile-alerts] mobile_alerts table created successfully');
}

try {
  migrate();
  console.log('[migrate-mobile-alerts] Migration complete');
} catch (error) {
  if (error.message.includes('already exists')) {
    console.log('[migrate-mobile-alerts] Table already exists — skipping');
  } else {
    console.error('[migrate-mobile-alerts] Migration failed:', error.message);
    process.exit(1);
  }
}
