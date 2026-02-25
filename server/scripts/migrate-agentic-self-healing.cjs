/**
 * Migration: Agentic Self-Healing System
 *
 * Creates tables for:
 * - agentic_self_healing_log: Tracks self-healing lifecycle (detection → diagnosis → fix → test → outcome)
 *
 * Also adds health_check columns to agentic_self_prompt_config if they don't exist.
 *
 * Idempotent - safe to run multiple times.
 */

const path = require('path');

function migrate() {
  const dbPath = path.join(__dirname, '..', 'data', 'swarm.db');
  const Database = require('better-sqlite3');
  const db = new Database(dbPath, { verbose: null });
  db.pragma('journal_mode = WAL');

  console.log('=== Agentic Self-Healing Migration ===');

  // 1. Self-healing log table
  db.exec(`
    CREATE TABLE IF NOT EXISTS agentic_self_healing_log (
      id TEXT PRIMARY KEY,
      agentic_id TEXT NOT NULL,
      user_id TEXT NOT NULL,

      -- Healing lifecycle
      status TEXT NOT NULL DEFAULT 'detected'
        CHECK(status IN ('detected', 'analyzing', 'proposing_fix',
          'awaiting_approval', 'backing_up', 'applying_fix',
          'testing', 'completed', 'rolled_back', 'escalated', 'failed')),

      -- Issue details
      severity TEXT NOT NULL DEFAULT 'medium'
        CHECK(severity IN ('low', 'medium', 'high', 'critical')),
      trigger_source TEXT NOT NULL DEFAULT 'manual'
        CHECK(trigger_source IN ('hook', 'periodic', 'manual')),
      trigger_context TEXT DEFAULT '{}',

      -- Diagnosis
      diagnosis TEXT DEFAULT '{}',
      error_summary TEXT,
      affected_tools TEXT DEFAULT '[]',

      -- Proposed fix
      proposed_fix TEXT DEFAULT '{}',
      fix_type TEXT,
      fix_reasoning TEXT,

      -- Backup (before applying fix)
      config_backup TEXT DEFAULT '{}',
      backup_created_at TEXT,

      -- Fix application
      applied_fix TEXT DEFAULT '{}',
      applied_at TEXT,

      -- Test results
      test_results TEXT DEFAULT '{}',
      test_passed INTEGER DEFAULT 0,

      -- Rollback
      rolled_back_at TEXT,
      rollback_reason TEXT,

      -- Approval (for HIGH severity)
      approval_id TEXT,
      approved_by TEXT,
      approved_at TEXT,

      -- Escalation (for CRITICAL)
      notification_id TEXT,
      escalated_at TEXT,

      -- Outcome
      outcome TEXT,
      outcome_notes TEXT,

      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),

      FOREIGN KEY (agentic_id) REFERENCES agentic_profiles(id) ON DELETE CASCADE
    );
  `);
  console.log('  [OK] agentic_self_healing_log table');

  // 2. Indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_self_healing_agent
      ON agentic_self_healing_log(agentic_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_self_healing_status
      ON agentic_self_healing_log(status);
    CREATE INDEX IF NOT EXISTS idx_self_healing_severity
      ON agentic_self_healing_log(severity);
  `);
  console.log('  [OK] Indexes created');

  // 3. Add health_check columns to agentic_self_prompt_config (if table exists)
  try {
    const columns = db.prepare('PRAGMA table_info(agentic_self_prompt_config)').all();
    if (columns.length > 0) {
      const colNames = columns.map(c => c.name);

      if (!colNames.includes('enable_health_check')) {
        db.exec('ALTER TABLE agentic_self_prompt_config ADD COLUMN enable_health_check INTEGER DEFAULT 1');
        console.log('  [OK] Added enable_health_check to agentic_self_prompt_config');
      }
      if (!colNames.includes('health_check_interval_minutes')) {
        db.exec('ALTER TABLE agentic_self_prompt_config ADD COLUMN health_check_interval_minutes INTEGER DEFAULT 360');
        console.log('  [OK] Added health_check_interval_minutes to agentic_self_prompt_config');
      }
    } else {
      console.log('  [SKIP] agentic_self_prompt_config table not found');
    }
  } catch (e) {
    console.log(`  [SKIP] agentic_self_prompt_config: ${e.message}`);
  }

  // 4. Expand notification_type CHECK constraint to include 'athena_response'
  //    SQLite can't ALTER CHECK constraints, so we rebuild the table if needed.
  try {
    // Check if 'athena_response' is already allowed
    const testId = '__migration_test_' + Date.now();
    try {
      db.prepare(`
        INSERT INTO agentic_master_notifications (id, agentic_id, user_id, master_contact_id, notification_type, title, content, channel)
        VALUES (?, 'test', 'test', 'test', 'athena_response', 'test', 'test', 'email')
      `).run(testId);
      // If it succeeds, the constraint already allows it — clean up
      db.prepare('DELETE FROM agentic_master_notifications WHERE id = ?').run(testId);
      console.log('  [SKIP] notification_type constraint already includes athena_response');
    } catch (constraintErr) {
      if (constraintErr.message.includes('CHECK constraint')) {
        console.log('  [FIX] Expanding notification_type CHECK constraint...');
        db.exec('BEGIN TRANSACTION');
        try {
          db.exec(`
            CREATE TABLE IF NOT EXISTS _notifications_backup AS SELECT * FROM agentic_master_notifications;
            DROP TABLE agentic_master_notifications;
            CREATE TABLE agentic_master_notifications (
              id TEXT PRIMARY KEY,
              agentic_id TEXT NOT NULL,
              user_id TEXT NOT NULL,
              master_contact_id TEXT NOT NULL,
              notification_type TEXT NOT NULL CHECK(notification_type IN (
                'approval_needed', 'approval_reminder', 'daily_report', 'weekly_report',
                'critical_error', 'budget_warning', 'budget_exceeded',
                'agent_created', 'agent_terminated', 'escalation', 'status_update',
                'test', 'new_email', 'platform_disconnect', 'task_completed', 'task_failed',
                'health_summary', 'agent_status_change', 'startup', 'info',
                'athena_response', 'out_of_scope', 'self_healing'
              )),
              title TEXT NOT NULL,
              content TEXT NOT NULL,
              context TEXT DEFAULT '{}',
              channel TEXT NOT NULL,
              delivery_status TEXT DEFAULT 'pending'
                CHECK(delivery_status IN ('pending', 'sent', 'delivered', 'read', 'failed')),
              sent_at TEXT,
              delivered_at TEXT,
              read_at TEXT,
              error_message TEXT,
              reference_type TEXT,
              reference_id TEXT,
              created_at TEXT DEFAULT (datetime('now')),
              FOREIGN KEY (agentic_id) REFERENCES agentic_profiles(id) ON DELETE CASCADE,
              FOREIGN KEY (master_contact_id) REFERENCES contacts(id)
            );
            INSERT INTO agentic_master_notifications SELECT * FROM _notifications_backup;
            DROP TABLE _notifications_backup;
          `);
          db.exec('COMMIT');
          // Recreate indexes
          db.exec(`
            CREATE INDEX IF NOT EXISTS idx_master_notif_agent ON agentic_master_notifications(agentic_id, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_master_notif_status ON agentic_master_notifications(delivery_status);
          `);
          console.log('  [OK] notification_type CHECK expanded (added athena_response, out_of_scope, self_healing)');
        } catch (rebuildErr) {
          db.exec('ROLLBACK');
          console.log(`  [ERR] Failed to expand constraint: ${rebuildErr.message}`);
        }
      }
    }
  } catch (e) {
    console.log(`  [SKIP] Notification constraint check: ${e.message}`);
  }

  db.close();
  console.log('=== Self-Healing Migration Complete ===');
}

// Run if called directly
if (require.main === module) {
  migrate();
}

module.exports = { migrate };
