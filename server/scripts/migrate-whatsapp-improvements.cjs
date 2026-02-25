/**
 * Migration: WhatsApp Integration Improvements
 *
 * Adds:
 * 1. platform_metrics table - Platform monitoring/observability
 * 2. whatsapp_rate_limits table - Business API rate limiting
 * 3. status_updated_at column to messages - Read receipt tracking
 * 4. Fixes contacts with phone number as display_name
 */

const { getDatabase, initDatabase } = require('../services/database.cjs');
const { logger } = require('../services/logger.cjs');

function migrate() {
  try {
    // Initialize database first
    initDatabase();
    const db = getDatabase();

    logger.info('Starting WhatsApp improvements migration...');

    // 1. Create platform_metrics table
    logger.info('Creating platform_metrics table...');
    db.exec(`
      CREATE TABLE IF NOT EXISTS platform_metrics (
        id TEXT PRIMARY KEY,
        platform TEXT NOT NULL,
        account_id TEXT,
        metric_type TEXT NOT NULL,
        data TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_platform_metrics_lookup
      ON platform_metrics(platform, account_id, created_at)
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_platform_metrics_type
      ON platform_metrics(metric_type, created_at)
    `);

    logger.info('  platform_metrics table created');

    // 2. Create whatsapp_rate_limits table
    logger.info('Creating whatsapp_rate_limits table...');
    db.exec(`
      CREATE TABLE IF NOT EXISTS whatsapp_rate_limits (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        recipient_phone TEXT,
        window_type TEXT NOT NULL,
        count INTEGER DEFAULT 0,
        window_start TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_whatsapp_rate_limits_lookup
      ON whatsapp_rate_limits(account_id, window_type, window_start)
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_whatsapp_rate_limits_recipient
      ON whatsapp_rate_limits(account_id, recipient_phone, window_type)
    `);

    logger.info('  whatsapp_rate_limits table created');

    // 3. Add status_updated_at column to messages if not exists
    logger.info('Adding status_updated_at column to messages...');
    const messagesColumns = db.prepare("PRAGMA table_info(messages)").all().map(c => c.name);
    if (!messagesColumns.includes('status_updated_at')) {
      db.exec(`ALTER TABLE messages ADD COLUMN status_updated_at TEXT`);
      logger.info('  status_updated_at column added to messages');
    } else {
      logger.info('  status_updated_at column already exists');
    }

    // Create index on status for efficient queries
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_messages_status
      ON messages(status)
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_messages_external_id
      ON messages(external_id)
    `);

    logger.info('  message status indexes created');

    // 4. Fix contacts with phone number as display_name
    logger.info('Fixing contacts with phone number as display_name...');

    // Find contacts where display_name looks like a phone number
    const phoneContacts = db.prepare(`
      SELECT DISTINCT c.id, c.display_name
      FROM contacts c
      WHERE c.display_name IS NOT NULL
        AND (
          c.display_name LIKE '+%'
          OR c.display_name GLOB '[0-9]*'
        )
        AND LENGTH(c.display_name) >= 8
        AND LENGTH(c.display_name) <= 20
    `).all();

    let fixedCount = 0;
    for (const contact of phoneContacts) {
      // Check if it's actually a phone-like pattern
      const isPhoneLike = /^[\+]?[0-9\s\-\(\)]+$/.test(contact.display_name);
      if (isPhoneLike) {
        db.prepare('UPDATE contacts SET display_name = NULL WHERE id = ?').run(contact.id);
        fixedCount++;
      }
    }

    logger.info(`  Fixed ${fixedCount} contacts with phone-as-name`);

    // Verification
    logger.info('Verifying migration...');

    const tables = ['platform_metrics', 'whatsapp_rate_limits'];
    for (const table of tables) {
      const exists = db.prepare(`
        SELECT COUNT(*) as count
        FROM sqlite_master
        WHERE type='table' AND name=?
      `).get(table);

      if (exists.count > 0) {
        logger.info(`  ${table}: OK`);
      } else {
        logger.error(`  ${table}: FAILED`);
      }
    }

    // Check status_updated_at column
    const updatedColumns = db.prepare("PRAGMA table_info(messages)").all().map(c => c.name);
    if (updatedColumns.includes('status_updated_at')) {
      logger.info('  messages.status_updated_at: OK');
    } else {
      logger.error('  messages.status_updated_at: FAILED');
    }

    logger.info('Migration completed successfully!');

  } catch (error) {
    logger.error(`Migration failed: ${error.message}`);
    logger.error(error.stack);
    process.exit(1);
  }
}

// Run migration if executed directly
if (require.main === module) {
  logger.info('='.repeat(50));
  logger.info('WhatsApp Improvements Migration');
  logger.info('='.repeat(50));
  migrate();
  process.exit(0);
}

module.exports = { migrate };
