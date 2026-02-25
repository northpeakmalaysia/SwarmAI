/**
 * Migration: Add webhook_executions table
 *
 * This table tracks incoming webhook trigger executions for flows.
 * Different from webhook_logs which tracks outgoing HTTP webhooks.
 */

const { getDatabase, initDatabase } = require('../services/database.cjs');
const { logger } = require('../services/logger.cjs');

function migrate() {
  try {
    // Initialize database first
    initDatabase();
    const db = getDatabase();

    logger.info('Creating webhook_executions table...');

    // Create webhook_executions table
    db.exec(`
      CREATE TABLE IF NOT EXISTS webhook_executions (
        id TEXT PRIMARY KEY,
        flow_id TEXT NOT NULL,
        webhook_path TEXT NOT NULL,
        method TEXT NOT NULL,
        request TEXT,
        response TEXT,
        auth_method TEXT,
        authenticated INTEGER DEFAULT 1,
        status TEXT DEFAULT 'pending',
        error TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        completed_at TEXT,
        FOREIGN KEY (flow_id) REFERENCES flows(id) ON DELETE CASCADE
      )
    `);

    // Create index on flow_id for faster lookups
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_webhook_executions_flow_id
      ON webhook_executions(flow_id)
    `);

    // Create index on created_at for chronological queries
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_webhook_executions_created_at
      ON webhook_executions(created_at DESC)
    `);

    logger.info('✅ webhook_executions table created successfully');
    logger.info('✅ Indexes created successfully');

    // Check if table exists and show count
    const result = db.prepare(`
      SELECT COUNT(*) as count
      FROM sqlite_master
      WHERE type='table' AND name='webhook_executions'
    `).get();

    if (result.count > 0) {
      const rowCount = db.prepare('SELECT COUNT(*) as count FROM webhook_executions').get();
      logger.info(`✅ Migration complete. Table has ${rowCount.count} rows`);
    } else {
      logger.error('❌ Migration failed: Table was not created');
      process.exit(1);
    }

  } catch (error) {
    logger.error(`Migration failed: ${error.message}`);
    logger.error(error.stack);
    process.exit(1);
  }
}

// Run migration if executed directly
if (require.main === module) {
  logger.info('Starting webhook_executions table migration...');
  migrate();
  logger.info('Migration completed successfully!');
  process.exit(0);
}

module.exports = { migrate };
