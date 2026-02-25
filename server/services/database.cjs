/**
 * Database Service
 * SQLite database management using better-sqlite3
 * Modeled after WhatsBots agentDataService.cjs pattern
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { logger } = require('./logger.cjs');

// Database path
const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'swarm.db');

let db = null;

/**
 * Initialize the database
 */
function initDatabase() {
  // Ensure data directory exists
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // Create database connection
  db = new Database(DB_PATH);

  // Enable WAL mode for better concurrency
  db.pragma('journal_mode = WAL');

  // Create tables
  createTables();

  logger.info(`Database initialized at ${DB_PATH}`);
  return db;
}

/**
 * Get database instance
 */
function getDatabase() {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

/**
 * Create all required tables
 */
function createTables() {
  // Users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT,
      name TEXT,
      role TEXT DEFAULT 'user' CHECK(role IN ('user', 'admin')),
      is_superuser INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Magic links table
  db.exec(`
    CREATE TABLE IF NOT EXISTS magic_links (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      token TEXT UNIQUE NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Create index for magic links token lookup
  db.exec(`CREATE INDEX IF NOT EXISTS idx_magic_links_token ON magic_links(token)`);

  // Agents table
  db.exec(`
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'offline' CHECK(status IN ('idle', 'busy', 'offline', 'error')),
      avatar TEXT,
      system_prompt TEXT,
      ai_provider TEXT DEFAULT 'openrouter',
      ai_model TEXT,
      skills TEXT DEFAULT '[]',
      temperature REAL DEFAULT 0.7,
      max_tokens INTEGER DEFAULT 4096,
      reputation_score INTEGER DEFAULT 100,
      auto_response INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Add missing columns to agents table if they don't exist (migration)
  try {
    db.exec(`ALTER TABLE agents ADD COLUMN skills TEXT DEFAULT '[]'`);
  } catch (e) { /* column may already exist */ }
  try {
    db.exec(`ALTER TABLE agents ADD COLUMN temperature REAL DEFAULT 0.7`);
  } catch (e) { /* column may already exist */ }
  try {
    db.exec(`ALTER TABLE agents ADD COLUMN max_tokens INTEGER DEFAULT 4096`);
  } catch (e) { /* column may already exist */ }
  try {
    db.exec(`ALTER TABLE agents ADD COLUMN reputation_score INTEGER DEFAULT 100`);
  } catch (e) { /* column may already exist */ }

  // Platform accounts table
  db.exec(`
    CREATE TABLE IF NOT EXISTS platform_accounts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      agent_id TEXT,
      platform TEXT NOT NULL CHECK(platform IN ('whatsapp', 'telegram-bot', 'telegram-user', 'email')),
      status TEXT DEFAULT 'disconnected' CHECK(status IN ('disconnected', 'connecting', 'qr_pending', 'connected', 'error')),
      credentials_encrypted TEXT,
      session_data TEXT,
      connection_metadata TEXT,
      last_connected_at TEXT,
      last_error TEXT,
      error_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (agent_id) REFERENCES agents(id)
    )
  `);

  // Contacts table
  db.exec(`
    CREATE TABLE IF NOT EXISTS contacts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      display_name TEXT,
      avatar TEXT,
      notes TEXT,
      tags TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Contact identifiers (for cross-platform linking)
  db.exec(`
    CREATE TABLE IF NOT EXISTS contact_identifiers (
      id TEXT PRIMARY KEY,
      contact_id TEXT NOT NULL,
      identifier_type TEXT NOT NULL CHECK(identifier_type IN ('phone', 'email', 'whatsapp', 'telegram', 'username')),
      identifier_value TEXT NOT NULL,
      identifier_normalized TEXT,
      platform TEXT,
      is_primary INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
    )
  `);

  // Conversations table
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      agent_id TEXT,
      platform TEXT NOT NULL,
      external_id TEXT,
      contact_id TEXT,
      title TEXT,
      status TEXT DEFAULT 'active' CHECK(status IN ('active', 'archived', 'closed')),
      category TEXT DEFAULT 'chat' CHECK(category IN ('chat', 'news', 'status')),
      is_group INTEGER DEFAULT 0,
      metadata TEXT,
      last_message_at TEXT,
      unread_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (agent_id) REFERENCES agents(id),
      FOREIGN KEY (contact_id) REFERENCES contacts(id)
    )
  `);

  // Messages table
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      direction TEXT NOT NULL CHECK(direction IN ('incoming', 'outgoing')),
      content_type TEXT DEFAULT 'text' CHECK(content_type IN ('text', 'image', 'video', 'audio', 'document', 'sticker', 'location', 'contact', 'voice', 'system')),
      content TEXT,
      media_url TEXT,
      media_local_path TEXT,
      media_mime_type TEXT,
      external_id TEXT,
      sender_id TEXT,
      sender_name TEXT,
      reply_to_id TEXT,
      status TEXT DEFAULT 'sent' CHECK(status IN ('pending', 'sent', 'delivered', 'read', 'failed')),
      ai_generated INTEGER DEFAULT 0,
      metadata TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    )
  `);

  // Migration: Add media_local_path column to messages if not exists
  const messagesColumns = db.prepare("PRAGMA table_info(messages)").all().map(c => c.name);
  if (!messagesColumns.includes('media_local_path')) {
    db.exec(`ALTER TABLE messages ADD COLUMN media_local_path TEXT`);
    logger.info('Added media_local_path column to messages table');
  }
  // Migration: Add status_updated_at column to messages if not exists (for read receipts)
  if (!messagesColumns.includes('status_updated_at')) {
    db.exec(`ALTER TABLE messages ADD COLUMN status_updated_at TEXT`);
    logger.info('Added status_updated_at column to messages table');
  }

  // WhatsApp QR codes table
  db.exec(`
    CREATE TABLE IF NOT EXISTS whatsapp_qr_codes (
      id TEXT PRIMARY KEY,
      platform_account_id TEXT NOT NULL,
      qr_data TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (platform_account_id) REFERENCES platform_accounts(id) ON DELETE CASCADE
    )
  `);

  // Delivery queue table (DLQ + retry for outbound messages)
  db.exec(`
    CREATE TABLE IF NOT EXISTS delivery_queue (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      recipient TEXT NOT NULL,
      platform TEXT NOT NULL,
      content TEXT NOT NULL,
      content_type TEXT DEFAULT 'text',
      options TEXT DEFAULT '{}',
      status TEXT DEFAULT 'pending',
      retry_count INTEGER DEFAULT 0,
      max_retries INTEGER DEFAULT 5,
      last_error TEXT,
      next_retry_at TEXT,
      source TEXT,
      source_context TEXT,
      conversation_id TEXT,
      message_id TEXT,
      agent_id TEXT,
      user_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      sent_at TEXT,
      dead_at TEXT
    )
  `);

  // Swarm tasks table
  db.exec(`
    CREATE TABLE IF NOT EXISTS swarm_tasks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      priority TEXT DEFAULT 'normal' CHECK(priority IN ('low', 'normal', 'high', 'urgent')),
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'completed', 'failed', 'cancelled')),
      assigned_agent_id TEXT,
      result TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (assigned_agent_id) REFERENCES agents(id)
    )
  `);

  // Handoffs table
  db.exec(`
    CREATE TABLE IF NOT EXISTS handoffs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      conversation_id TEXT,
      from_agent_id TEXT,
      to_agent_id TEXT NOT NULL,
      reason TEXT,
      status TEXT DEFAULT 'completed',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (conversation_id) REFERENCES conversations(id),
      FOREIGN KEY (from_agent_id) REFERENCES agents(id),
      FOREIGN KEY (to_agent_id) REFERENCES agents(id)
    )
  `);

  // Consensus requests table
  db.exec(`
    CREATE TABLE IF NOT EXISTS consensus_requests (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      question TEXT NOT NULL,
      options TEXT,
      agent_ids TEXT,
      threshold REAL DEFAULT 0.5,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'completed', 'expired')),
      result TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Collaborations table
  db.exec(`
    CREATE TABLE IF NOT EXISTS collaborations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      agent_ids TEXT,
      task TEXT,
      context TEXT,
      status TEXT DEFAULT 'active' CHECK(status IN ('active', 'completed', 'cancelled')),
      result TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Flows table
  db.exec(`
    CREATE TABLE IF NOT EXISTS flows (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      agent_id TEXT,
      name TEXT NOT NULL,
      description TEXT,
      nodes TEXT,
      edges TEXT,
      variables TEXT,
      trigger_type TEXT DEFAULT 'manual',
      status TEXT DEFAULT 'inactive' CHECK(status IN ('active', 'inactive')),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (agent_id) REFERENCES agents(id)
    )
  `);

  // Migration: Add agent_id column to flows if not exists
  try {
    db.exec(`ALTER TABLE flows ADD COLUMN agent_id TEXT`);
    logger.info('Added agent_id column to flows table');
  } catch (e) {
    // Column already exists
  }

  db.exec(`CREATE INDEX IF NOT EXISTS idx_flows_agent_id ON flows(agent_id)`);

  // Flow-agent assignments for many-to-many relationships
  db.exec(`
    CREATE TABLE IF NOT EXISTS flow_agent_assignments (
      id TEXT PRIMARY KEY,
      flow_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      priority INTEGER DEFAULT 0,
      trigger_filter TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (flow_id) REFERENCES flows(id) ON DELETE CASCADE,
      FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
      UNIQUE(flow_id, agent_id)
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_flow_agent_flow ON flow_agent_assignments(flow_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_flow_agent_agent ON flow_agent_assignments(agent_id)`);

  // Flow executions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS flow_executions (
      id TEXT PRIMARY KEY,
      flow_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      inputs TEXT,
      outputs TEXT,
      status TEXT DEFAULT 'running' CHECK(status IN ('running', 'completed', 'failed', 'cancelled')),
      error TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT,
      FOREIGN KEY (flow_id) REFERENCES flows(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Migration: Add missing columns to flow_executions
  const flowExecColumns = db.prepare("PRAGMA table_info(flow_executions)").all().map(c => c.name);
  if (!flowExecColumns.includes('trigger_type')) {
    db.exec(`ALTER TABLE flow_executions ADD COLUMN trigger_type TEXT DEFAULT 'manual'`);
    logger.info('Added trigger_type column to flow_executions table');
  }
  if (!flowExecColumns.includes('node_results')) {
    db.exec(`ALTER TABLE flow_executions ADD COLUMN node_results TEXT DEFAULT '[]'`);
    logger.info('Added node_results column to flow_executions table');
  }
  if (!flowExecColumns.includes('started_at')) {
    db.exec(`ALTER TABLE flow_executions ADD COLUMN started_at TEXT`);
    logger.info('Added started_at column to flow_executions table');
  }

  // AI providers table
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_providers (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      api_key TEXT,
      base_url TEXT,
      config TEXT,
      models TEXT,
      is_default INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Add missing columns to ai_providers (migration)
  const aiProviderColumns = db.prepare("PRAGMA table_info(ai_providers)").all().map(c => c.name);
  if (!aiProviderColumns.includes('last_tested')) {
    db.exec(`ALTER TABLE ai_providers ADD COLUMN last_tested TEXT`);
    logger.info('Added last_tested column to ai_providers table');
  }
  if (!aiProviderColumns.includes('budget_limit')) {
    db.exec(`ALTER TABLE ai_providers ADD COLUMN budget_limit REAL`);
    logger.info('Added budget_limit column to ai_providers table');
  }
  if (!aiProviderColumns.includes('budget_used')) {
    db.exec(`ALTER TABLE ai_providers ADD COLUMN budget_used REAL DEFAULT 0`);
    logger.info('Added budget_used column to ai_providers table');
  }
  if (!aiProviderColumns.includes('is_active')) {
    db.exec(`ALTER TABLE ai_providers ADD COLUMN is_active INTEGER DEFAULT 1`);
    logger.info('Added is_active column to ai_providers table');
  }

  // AI usage table
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_usage (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      provider TEXT,
      model TEXT,
      input_tokens INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      cost REAL DEFAULT 0,
      agent_id TEXT,
      conversation_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // MCP servers table
  db.exec(`
    CREATE TABLE IF NOT EXISTS mcp_servers (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      command TEXT,
      args TEXT,
      env TEXT,
      config TEXT,
      tools TEXT,
      status TEXT DEFAULT 'disconnected',
      connected_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Tool API keys table (for tools like searchWeb with Brave, Serper, etc.)
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

  // MCP server tools table (discovered tools from MCP servers)
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

  // Knowledge libraries table
  db.exec(`
    CREATE TABLE IF NOT EXISTS knowledge_libraries (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      settings TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Knowledge folders table
  db.exec(`
    CREATE TABLE IF NOT EXISTS knowledge_folders (
      id TEXT PRIMARY KEY,
      library_id TEXT NOT NULL,
      parent_id TEXT,
      name TEXT NOT NULL,
      description TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (library_id) REFERENCES knowledge_libraries(id) ON DELETE CASCADE,
      FOREIGN KEY (parent_id) REFERENCES knowledge_folders(id)
    )
  `);

  // Migration: add missing columns to knowledge_folders for existing databases
  try {
    const folderCols = db.pragma('table_info(knowledge_folders)').map(c => c.name);
    if (!folderCols.includes('description')) {
      db.exec(`ALTER TABLE knowledge_folders ADD COLUMN description TEXT`);
    }
    if (!folderCols.includes('updated_at')) {
      db.exec(`ALTER TABLE knowledge_folders ADD COLUMN updated_at TEXT`);
      db.exec(`UPDATE knowledge_folders SET updated_at = created_at WHERE updated_at IS NULL`);
    }
  } catch (e) {
    // Columns already exist or table doesn't exist yet
  }

  // Knowledge documents table
  db.exec(`
    CREATE TABLE IF NOT EXISTS knowledge_documents (
      id TEXT PRIMARY KEY,
      library_id TEXT NOT NULL,
      folder_id TEXT,
      title TEXT,
      content TEXT,
      content_type TEXT DEFAULT 'text',
      source_type TEXT,
      source_url TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'completed', 'failed')),
      progress INTEGER DEFAULT 0,
      metadata TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (library_id) REFERENCES knowledge_libraries(id) ON DELETE CASCADE,
      FOREIGN KEY (folder_id) REFERENCES knowledge_folders(id)
    )
  `);

  // Add missing columns to knowledge_documents (migration)
  const kdColumns = db.prepare("PRAGMA table_info(knowledge_documents)").all().map(c => c.name);
  if (!kdColumns.includes('chunk_count')) {
    db.exec(`ALTER TABLE knowledge_documents ADD COLUMN chunk_count INTEGER DEFAULT 0`);
    logger.info('Added chunk_count column to knowledge_documents table');
  }
  if (!kdColumns.includes('file_size')) {
    db.exec(`ALTER TABLE knowledge_documents ADD COLUMN file_size INTEGER DEFAULT 0`);
    logger.info('Added file_size column to knowledge_documents table');
  }
  if (!kdColumns.includes('content_type')) {
    db.exec(`ALTER TABLE knowledge_documents ADD COLUMN content_type TEXT DEFAULT 'text'`);
    logger.info('Added content_type column to knowledge_documents table');
  }

  // Ingestion log table (for auto-ingest feature audit trail)
  db.exec(`
    CREATE TABLE IF NOT EXISTS ingestion_log (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      library_id TEXT NOT NULL,
      document_id TEXT NOT NULL,
      source TEXT,
      match_score REAL,
      reason TEXT,
      metadata TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (library_id) REFERENCES knowledge_libraries(id),
      FOREIGN KEY (document_id) REFERENCES knowledge_documents(id)
    )
  `);

  // Source reliability table for tracking source reputation
  db.exec(`
    CREATE TABLE IF NOT EXISTS source_reliability (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      domain TEXT,
      source_id TEXT,
      source_name TEXT,
      total_ingested INTEGER DEFAULT 0,
      total_confirmed INTEGER DEFAULT 0,
      total_rejected INTEGER DEFAULT 0,
      trust_score REAL DEFAULT 0.5,
      last_activity TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Subscriptions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      plan TEXT DEFAULT 'free',
      status TEXT DEFAULT 'active' CHECK(status IN ('active', 'cancelled', 'expired')),
      agent_slots INTEGER DEFAULT 2,
      features TEXT,
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      cancelled_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Payments table
  db.exec(`
    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      amount REAL,
      currency TEXT DEFAULT 'USD',
      status TEXT,
      stripe_payment_id TEXT,
      description TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Agentic workspaces table
  // Note: profile_id links to agentic_profiles (PRD design)
  // agent_id is deprecated but kept for backwards compatibility
  db.exec(`
    CREATE TABLE IF NOT EXISTS agentic_workspaces (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      agent_id TEXT,
      profile_id TEXT,
      cli_type TEXT NOT NULL CHECK(cli_type IN ('claude', 'gemini', 'opencode', 'bash')),
      autonomy_level TEXT DEFAULT 'semi' CHECK(autonomy_level IN ('semi', 'full')),
      workspace_path TEXT,
      config TEXT,
      status TEXT DEFAULT 'active' CHECK(status IN ('active', 'paused', 'error')),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (profile_id) REFERENCES agentic_profiles(id) ON DELETE CASCADE
    )
  `);

  // Migration: Add profile_id column if it doesn't exist
  try {
    db.exec(`ALTER TABLE agentic_workspaces ADD COLUMN profile_id TEXT`);
  } catch (e) {
    // Column already exists, ignore
  }

  // Migration: Add status column if it doesn't exist
  try {
    db.exec(`ALTER TABLE agentic_workspaces ADD COLUMN status TEXT DEFAULT 'active'`);
  } catch (e) {
    // Column already exists, ignore
  }

  // Create index for profile_id
  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_agentic_workspaces_profile ON agentic_workspaces(profile_id)`);
  } catch (e) {
    // Index already exists, ignore
  }

  // Agentic tokens table
  db.exec(`
    CREATE TABLE IF NOT EXISTS agentic_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      name TEXT,
      token TEXT NOT NULL,
      expires_at TEXT,
      last_used_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (workspace_id) REFERENCES agentic_workspaces(id) ON DELETE CASCADE
    )
  `);

  // Custom tools table
  db.exec(`
    CREATE TABLE IF NOT EXISTS custom_tools (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      parameters TEXT,
      code TEXT,
      language TEXT DEFAULT 'python',
      usage_guide TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (workspace_id) REFERENCES agentic_workspaces(id) ON DELETE CASCADE
    )
  `);

  // Migration: Add usage_guide column if it doesn't exist
  try {
    db.exec(`ALTER TABLE custom_tools ADD COLUMN usage_guide TEXT`);
  } catch (e) {
    // Column already exists, ignore
  }

  // HTTP webhooks table
  db.exec(`
    CREATE TABLE IF NOT EXISTS http_webhooks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      method TEXT DEFAULT 'POST',
      headers TEXT,
      config TEXT,
      token TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Webhook logs table
  db.exec(`
    CREATE TABLE IF NOT EXISTS webhook_logs (
      id TEXT PRIMARY KEY,
      webhook_id TEXT NOT NULL,
      request TEXT,
      response TEXT,
      status_code INTEGER,
      duration INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (webhook_id) REFERENCES http_webhooks(id) ON DELETE CASCADE
    )
  `);

  // Data sources table
  db.exec(`
    CREATE TABLE IF NOT EXISTS data_sources (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      library_id TEXT,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      config TEXT,
      schedule TEXT,
      status TEXT DEFAULT 'idle',
      sync_progress INTEGER DEFAULT 0,
      last_sync_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (library_id) REFERENCES knowledge_libraries(id)
    )
  `);

  // Data items table
  db.exec(`
    CREATE TABLE IF NOT EXISTS data_items (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      external_id TEXT,
      title TEXT,
      content TEXT,
      metadata TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (source_id) REFERENCES data_sources(id) ON DELETE CASCADE
    )
  `);

  // Sync history table
  db.exec(`
    CREATE TABLE IF NOT EXISTS sync_history (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      status TEXT,
      items_synced INTEGER DEFAULT 0,
      error TEXT,
      started_at TEXT,
      completed_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (source_id) REFERENCES data_sources(id) ON DELETE CASCADE
    )
  `);

  // FTP sources table
  db.exec(`
    CREATE TABLE IF NOT EXISTS ftp_sources (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      library_id TEXT,
      name TEXT NOT NULL,
      host TEXT NOT NULL,
      port INTEGER DEFAULT 21,
      username TEXT NOT NULL,
      password TEXT,
      protocol TEXT DEFAULT 'ftp' CHECK(protocol IN ('ftp', 'sftp', 'ftps')),
      remote_path TEXT DEFAULT '/',
      config TEXT,
      schedule TEXT,
      schedule_enabled INTEGER DEFAULT 0,
      status TEXT DEFAULT 'disconnected',
      sync_progress INTEGER DEFAULT 0,
      last_sync_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (library_id) REFERENCES knowledge_libraries(id)
    )
  `);

  // FTP files table
  db.exec(`
    CREATE TABLE IF NOT EXISTS ftp_files (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      remote_path TEXT NOT NULL,
      local_path TEXT,
      size INTEGER,
      modified_at TEXT,
      synced_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (source_id) REFERENCES ftp_sources(id) ON DELETE CASCADE
    )
  `);

  // FTP sync history table
  db.exec(`
    CREATE TABLE IF NOT EXISTS ftp_sync_history (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      status TEXT,
      files_synced INTEGER DEFAULT 0,
      error TEXT,
      started_at TEXT,
      completed_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (source_id) REFERENCES ftp_sources(id) ON DELETE CASCADE
    )
  `);

  // Database sources table (SQL Server, PostgreSQL, MySQL connectors)
  db.exec(`
    CREATE TABLE IF NOT EXISTS database_sources (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      library_id TEXT,
      name TEXT NOT NULL,
      db_type TEXT NOT NULL DEFAULT 'sqlserver',
      host TEXT NOT NULL,
      port INTEGER DEFAULT 1433,
      database_name TEXT NOT NULL,
      username TEXT NOT NULL,
      password TEXT,
      encrypt INTEGER DEFAULT 1,
      trust_server_certificate INTEGER DEFAULT 0,
      extraction_query TEXT,
      content_fields TEXT,
      title_field TEXT,
      id_field TEXT,
      metadata_fields TEXT,
      schedule_enabled INTEGER DEFAULT 0,
      cron_expression TEXT DEFAULT '0 0 * * *',
      last_sync_at TEXT,
      last_sync_status TEXT,
      last_sync_error TEXT,
      item_count INTEGER DEFAULT 0,
      status TEXT DEFAULT 'disconnected',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (library_id) REFERENCES knowledge_libraries(id)
    )
  `);

  // Database sync history table
  db.exec(`
    CREATE TABLE IF NOT EXISTS database_sync_history (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      status TEXT NOT NULL,
      rows_discovered INTEGER DEFAULT 0,
      rows_ingested INTEGER DEFAULT 0,
      rows_failed INTEGER DEFAULT 0,
      error_message TEXT,
      started_at TEXT,
      completed_at TEXT,
      duration_ms INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (source_id) REFERENCES database_sources(id) ON DELETE CASCADE
    )
  `);

  // Terminal history table
  db.exec(`
    CREATE TABLE IF NOT EXISTS terminal_history (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      session_id TEXT,
      command TEXT,
      output TEXT,
      exit_code INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // User settings table
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_settings (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE,
      theme TEXT DEFAULT 'dark',
      language TEXT DEFAULT 'en',
      preferences TEXT,
      notifications TEXT,
      privacy TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Generic key-value settings table (for notifications, AI keys, preferences, etc.)
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id),
      UNIQUE(user_id, key)
    )
  `);

  // Create index for settings lookup
  db.exec(`CREATE INDEX IF NOT EXISTS idx_settings_user_key ON settings(user_id, key)`);

  // API keys table
  db.exec(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT,
      key_hash TEXT NOT NULL,
      key_prefix TEXT,
      last_used_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Add reputation_score column to agents if not exists
  try {
    db.exec(`ALTER TABLE agents ADD COLUMN reputation_score INTEGER DEFAULT 100`);
  } catch (e) {
    // Column already exists
  }

  // Add avatar column to users if not exists
  try {
    db.exec(`ALTER TABLE users ADD COLUMN avatar TEXT`);
  } catch (e) {
    // Column already exists
  }

  // Add suspension columns to users if not exists (for admin user management)
  try {
    db.exec(`ALTER TABLE users ADD COLUMN is_suspended INTEGER DEFAULT 0`);
  } catch (e) {
    // Column already exists
  }
  try {
    db.exec(`ALTER TABLE users ADD COLUMN suspended_reason TEXT`);
  } catch (e) {
    // Column already exists
  }
  try {
    db.exec(`ALTER TABLE users ADD COLUMN suspended_at TEXT`);
  } catch (e) {
    // Column already exists
  }
  try {
    db.exec(`ALTER TABLE users ADD COLUMN suspended_by TEXT`);
  } catch (e) {
    // Column already exists
  }

  // Add category column to conversations if not exists (for News/Status tabs)
  try {
    db.exec(`ALTER TABLE conversations ADD COLUMN category TEXT DEFAULT 'chat' CHECK(category IN ('chat', 'news', 'status'))`);
  } catch (e) {
    // Column already exists
  }

  // Migrate existing conversations: auto-detect category from external_id
  try {
    // Mark newsletters
    db.exec(`UPDATE conversations SET category = 'news' WHERE external_id LIKE '%@newsletter%' AND category = 'chat'`);
    // Mark status broadcasts
    db.exec(`UPDATE conversations SET category = 'status' WHERE (external_id LIKE '%@broadcast%' OR external_id = 'status@broadcast') AND category = 'chat'`);
  } catch (e) {
    // Migration already done or no matching rows
  }

  // Super Brain: AI Failover Config table
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_failover_config (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      hierarchy TEXT NOT NULL,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Super Brain: CLI Auth Sessions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS cli_auth_sessions (
      id TEXT PRIMARY KEY,
      cli_type TEXT NOT NULL CHECK(cli_type IN ('claude', 'gemini', 'opencode')),
      user_id TEXT NOT NULL,
      terminal_session_id TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'completed', 'failed', 'expired', 'revoked')),
      expires_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Super Brain: AI Provider Health table
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_provider_health (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      status TEXT DEFAULT 'unknown',
      last_check TEXT,
      latency_ms INTEGER,
      error_rate REAL DEFAULT 0,
      consecutive_errors INTEGER DEFAULT 0,
      last_error TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // OpenRouter Models cache table
  db.exec(`
    CREATE TABLE IF NOT EXISTS openrouter_models (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      context_length INTEGER,
      pricing_prompt REAL,
      pricing_completion REAL,
      is_free INTEGER DEFAULT 0,
      provider TEXT,
      top_provider TEXT,
      per_request_limits TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Ollama Models cache table (with dynamic capabilities from /api/show)
  db.exec(`
    CREATE TABLE IF NOT EXISTS ollama_models (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      size INTEGER,
      parameter_size TEXT,
      quantization TEXT,
      format TEXT,
      family TEXT,
      context_length INTEGER,
      embedding_length INTEGER,
      supports_completion INTEGER DEFAULT 0,
      supports_vision INTEGER DEFAULT 0,
      supports_embedding INTEGER DEFAULT 0,
      supports_tools INTEGER DEFAULT 0,
      raw_capabilities TEXT,
      model_info TEXT,
      modified_at TEXT,
      synced_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Super Brain: CLI Executions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS cli_executions (
      id TEXT PRIMARY KEY,
      cli_type TEXT NOT NULL,
      user_id TEXT,
      workspace_id TEXT,
      task TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'running', 'completed', 'failed', 'timeout', 'cancelled')),
      output TEXT,
      error TEXT,
      duration_ms INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // CLI Auth State table - Tracks authentication status per CLI tool (persists across restarts)
  db.exec(`
    CREATE TABLE IF NOT EXISTS cli_auth_state (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      cli_type TEXT NOT NULL UNIQUE CHECK(cli_type IN ('claude', 'gemini', 'opencode')),
      is_authenticated INTEGER DEFAULT 0,
      auth_method TEXT,
      authenticated_at TEXT,
      authenticated_by TEXT,
      expires_at TEXT,
      capabilities TEXT,
      config TEXT,
      last_used_at TEXT,
      last_check_at TEXT,
      error_message TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // CLI Settings table - Per-user CLI tool preferences
  db.exec(`
    CREATE TABLE IF NOT EXISTS cli_settings (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      user_id TEXT NOT NULL,
      cli_type TEXT NOT NULL CHECK(cli_type IN ('claude', 'gemini', 'opencode')),

      -- Model preferences
      preferred_model TEXT,
      fallback_model TEXT,

      -- Execution preferences
      timeout_seconds INTEGER DEFAULT 300,
      max_tokens INTEGER,
      temperature REAL,

      -- CLI-specific settings (JSON)
      settings TEXT,

      -- Usage tracking
      total_executions INTEGER DEFAULT 0,
      total_tokens_used INTEGER DEFAULT 0,
      last_used_at TEXT,

      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, cli_type),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Super Brain: AI Request Metrics table
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_request_metrics (
      id TEXT PRIMARY KEY,
      request_id TEXT,
      user_id TEXT,
      task_tier TEXT,
      provider TEXT,
      model TEXT,
      duration_ms INTEGER,
      input_tokens INTEGER,
      output_tokens INTEGER,
      success INTEGER DEFAULT 1,
      error TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Media cache table with TTL support
  db.exec(`
    CREATE TABLE IF NOT EXISTS media_cache (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      original_url TEXT NOT NULL,
      local_path TEXT,
      mime_type TEXT,
      file_size INTEGER,
      expires_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Platform metrics table (for observability)
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
  db.exec(`CREATE INDEX IF NOT EXISTS idx_platform_metrics_lookup ON platform_metrics(platform, account_id, created_at)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_platform_metrics_type ON platform_metrics(metric_type, created_at)`);

  // WhatsApp rate limits table
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
  db.exec(`CREATE INDEX IF NOT EXISTS idx_whatsapp_rate_limits_lookup ON whatsapp_rate_limits(account_id, window_type, window_start)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_whatsapp_rate_limits_recipient ON whatsapp_rate_limits(account_id, recipient_phone, window_type)`);

  // SuperBrain settings table (per-user AI configuration)
  db.exec(`
    CREATE TABLE IF NOT EXISTS superbrain_settings (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      user_id TEXT NOT NULL UNIQUE,

      -- Translation Settings
      translation_language TEXT DEFAULT 'en',
      translation_provider TEXT DEFAULT 'system',
      translation_model TEXT,
      auto_translate INTEGER DEFAULT 0,
      show_original_with_translation INTEGER DEFAULT 1,

      -- Rephrase Settings
      rephrase_provider TEXT DEFAULT 'system',
      rephrase_model TEXT,
      rephrase_style TEXT DEFAULT 'professional',

      -- Task Classification Preferences (Provider per tier)
      -- NOTE: Users configure their model preferences via Task Routing settings
      trivial_tier_provider TEXT DEFAULT 'ollama',
      simple_tier_provider TEXT DEFAULT 'openrouter',
      moderate_tier_provider TEXT DEFAULT 'openrouter',
      complex_tier_provider TEXT DEFAULT 'openrouter',
      critical_tier_provider TEXT DEFAULT 'cli-claude',

      -- Model per tier (specific model to use for each classification)
      trivial_tier_model TEXT,
      simple_tier_model TEXT,
      moderate_tier_model TEXT,
      complex_tier_model TEXT,
      critical_tier_model TEXT,

      -- Custom Failover Chain (JSON per tier)
      custom_failover_chain TEXT,

      -- Model Preferences (general fallbacks)
      preferred_free_model TEXT,
      preferred_paid_model TEXT,

      -- Tool Access Control Settings
      auto_send_mode TEXT DEFAULT 'restricted' CHECK(auto_send_mode IN ('allowed', 'restricted')),
      enabled_tools TEXT, -- JSON array of tool IDs, NULL = all tools enabled
      tool_confidence_threshold REAL DEFAULT 0.7 CHECK(tool_confidence_threshold >= 0 AND tool_confidence_threshold <= 1),
      ai_router_mode TEXT DEFAULT 'full' CHECK(ai_router_mode IN ('full', 'classify_only', 'disabled')),

      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // System settings table (superadmin global defaults)
  db.exec(`
    CREATE TABLE IF NOT EXISTS system_settings (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      key TEXT UNIQUE NOT NULL,
      value TEXT,
      description TEXT,
      updated_by TEXT,
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (updated_by) REFERENCES users(id)
    )
  `);

  // Create indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_media_cache_message_id ON media_cache(message_id);
    CREATE INDEX IF NOT EXISTS idx_media_cache_expires ON media_cache(expires_at);
    CREATE INDEX IF NOT EXISTS idx_media_cache_user_id ON media_cache(user_id);
    CREATE INDEX IF NOT EXISTS idx_agents_user_id ON agents(user_id);
    CREATE INDEX IF NOT EXISTS idx_platform_accounts_user_id ON platform_accounts(user_id);
    CREATE INDEX IF NOT EXISTS idx_platform_accounts_agent_id ON platform_accounts(agent_id);
    CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
    CREATE INDEX IF NOT EXISTS idx_conversations_agent_id ON conversations(agent_id);
    CREATE INDEX IF NOT EXISTS idx_conversations_external_id ON conversations(external_id);
    CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
    CREATE INDEX IF NOT EXISTS idx_messages_external_id ON messages(external_id);
    CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status);
    CREATE INDEX IF NOT EXISTS idx_contact_identifiers_contact_id ON contact_identifiers(contact_id);
    CREATE INDEX IF NOT EXISTS idx_contact_identifiers_value ON contact_identifiers(identifier_value);
    CREATE INDEX IF NOT EXISTS idx_swarm_tasks_user_id ON swarm_tasks(user_id);
    CREATE INDEX IF NOT EXISTS idx_flows_user_id ON flows(user_id);
    CREATE INDEX IF NOT EXISTS idx_ai_usage_user_id ON ai_usage(user_id);
    CREATE INDEX IF NOT EXISTS idx_knowledge_documents_library_id ON knowledge_documents(library_id);
    CREATE INDEX IF NOT EXISTS idx_agentic_workspaces_user_id ON agentic_workspaces(user_id);
    CREATE INDEX IF NOT EXISTS idx_http_webhooks_user_id ON http_webhooks(user_id);
    CREATE INDEX IF NOT EXISTS idx_data_sources_user_id ON data_sources(user_id);
    CREATE INDEX IF NOT EXISTS idx_ftp_sources_user_id ON ftp_sources(user_id);
    CREATE INDEX IF NOT EXISTS idx_database_sources_user_id ON database_sources(user_id);
    CREATE INDEX IF NOT EXISTS idx_database_sources_library_id ON database_sources(library_id);
    CREATE INDEX IF NOT EXISTS idx_ai_failover_config_active ON ai_failover_config(active);
    CREATE INDEX IF NOT EXISTS idx_cli_auth_sessions_user_id ON cli_auth_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_cli_auth_sessions_status ON cli_auth_sessions(status);
    CREATE INDEX IF NOT EXISTS idx_ai_provider_health_provider ON ai_provider_health(provider);
    CREATE INDEX IF NOT EXISTS idx_cli_executions_user_id ON cli_executions(user_id);
    CREATE INDEX IF NOT EXISTS idx_ai_request_metrics_user_id ON ai_request_metrics(user_id);
    CREATE INDEX IF NOT EXISTS idx_ai_request_metrics_created_at ON ai_request_metrics(created_at);
    CREATE INDEX IF NOT EXISTS idx_superbrain_settings_user_id ON superbrain_settings(user_id);
    CREATE INDEX IF NOT EXISTS idx_system_settings_key ON system_settings(key);
    CREATE INDEX IF NOT EXISTS idx_ingestion_log_user ON ingestion_log(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_ingestion_log_library ON ingestion_log(library_id);
    CREATE INDEX IF NOT EXISTS idx_source_reliability_domain ON source_reliability(user_id, domain);
  `);

  // Migration: Add embedding settings columns to superbrain_settings
  const sbColumns = db.prepare("PRAGMA table_info(superbrain_settings)").all().map(c => c.name);
  if (!sbColumns.includes('embedding_provider')) {
    db.exec(`ALTER TABLE superbrain_settings ADD COLUMN embedding_provider TEXT DEFAULT 'auto'`);
    logger.info('Added embedding_provider column to superbrain_settings table');
  }
  if (!sbColumns.includes('embedding_model')) {
    db.exec(`ALTER TABLE superbrain_settings ADD COLUMN embedding_model TEXT`);
    logger.info('Added embedding_model column to superbrain_settings table');
  }

  // Migration: Add OCR/Vision settings columns to superbrain_settings
  if (!sbColumns.includes('ocr_enabled')) {
    db.exec(`ALTER TABLE superbrain_settings ADD COLUMN ocr_enabled INTEGER DEFAULT 1`);
    logger.info('Added ocr_enabled column to superbrain_settings table');
  }
  if (!sbColumns.includes('ocr_languages')) {
    db.exec(`ALTER TABLE superbrain_settings ADD COLUMN ocr_languages TEXT DEFAULT 'eng+msa+chi_sim'`);
    logger.info('Added ocr_languages column to superbrain_settings table');
  }
  if (!sbColumns.includes('ocr_auto_extract')) {
    db.exec(`ALTER TABLE superbrain_settings ADD COLUMN ocr_auto_extract INTEGER DEFAULT 1`);
    logger.info('Added ocr_auto_extract column to superbrain_settings table');
  }
  if (!sbColumns.includes('ocr_min_confidence')) {
    db.exec(`ALTER TABLE superbrain_settings ADD COLUMN ocr_min_confidence REAL DEFAULT 0.3`);
    logger.info('Added ocr_min_confidence column to superbrain_settings table');
  }
  if (!sbColumns.includes('vision_enabled')) {
    db.exec(`ALTER TABLE superbrain_settings ADD COLUMN vision_enabled INTEGER DEFAULT 1`);
    logger.info('Added vision_enabled column to superbrain_settings table');
  }
  // Vision AI settings - user must configure their own providers/models (no defaults)
  if (!sbColumns.includes('vision_provider_1')) {
    db.exec(`ALTER TABLE superbrain_settings ADD COLUMN vision_provider_1 TEXT DEFAULT NULL`);
    logger.info('Added vision_provider_1 column to superbrain_settings table');
  }
  if (!sbColumns.includes('vision_model_1')) {
    db.exec(`ALTER TABLE superbrain_settings ADD COLUMN vision_model_1 TEXT DEFAULT NULL`);
    logger.info('Added vision_model_1 column to superbrain_settings table');
  }
  if (!sbColumns.includes('vision_provider_2')) {
    db.exec(`ALTER TABLE superbrain_settings ADD COLUMN vision_provider_2 TEXT DEFAULT NULL`);
    logger.info('Added vision_provider_2 column to superbrain_settings table');
  }
  if (!sbColumns.includes('vision_model_2')) {
    db.exec(`ALTER TABLE superbrain_settings ADD COLUMN vision_model_2 TEXT DEFAULT NULL`);
    logger.info('Added vision_model_2 column to superbrain_settings table');
  }
  if (!sbColumns.includes('vision_provider_3')) {
    db.exec(`ALTER TABLE superbrain_settings ADD COLUMN vision_provider_3 TEXT DEFAULT NULL`);
    logger.info('Added vision_provider_3 column to superbrain_settings table');
  }
  if (!sbColumns.includes('vision_model_3')) {
    db.exec(`ALTER TABLE superbrain_settings ADD COLUMN vision_model_3 TEXT DEFAULT NULL`);
    logger.info('Added vision_model_3 column to superbrain_settings table');
  }

  // Vision AI custom prompt (user-configurable)
  if (!sbColumns.includes('vision_ai_prompt')) {
    db.exec(`ALTER TABLE superbrain_settings ADD COLUMN vision_ai_prompt TEXT DEFAULT NULL`);
    logger.info('Added vision_ai_prompt column to superbrain_settings table');
  }

  // Document Analysis Settings
  if (!sbColumns.includes('doc_auto_extract')) {
    db.exec(`ALTER TABLE superbrain_settings ADD COLUMN doc_auto_extract INTEGER DEFAULT 1`);
    logger.info('Added doc_auto_extract column to superbrain_settings table');
  }
  if (!sbColumns.includes('doc_auto_summarize')) {
    db.exec(`ALTER TABLE superbrain_settings ADD COLUMN doc_auto_summarize INTEGER DEFAULT 0`);
    logger.info('Added doc_auto_summarize column to superbrain_settings table');
  }

  // Voice Transcription Settings
  if (!sbColumns.includes('transcription_enabled')) {
    db.exec(`ALTER TABLE superbrain_settings ADD COLUMN transcription_enabled INTEGER DEFAULT 1`);
    logger.info('Added transcription_enabled column to superbrain_settings table');
  }
  if (!sbColumns.includes('transcription_auto_extract')) {
    db.exec(`ALTER TABLE superbrain_settings ADD COLUMN transcription_auto_extract INTEGER DEFAULT 1`);
    logger.info('Added transcription_auto_extract column to superbrain_settings table');
  }
  if (!sbColumns.includes('transcription_provider_1')) {
    db.exec(`ALTER TABLE superbrain_settings ADD COLUMN transcription_provider_1 TEXT DEFAULT NULL`);
    logger.info('Added transcription_provider_1 column to superbrain_settings table');
  }
  if (!sbColumns.includes('transcription_model_1')) {
    db.exec(`ALTER TABLE superbrain_settings ADD COLUMN transcription_model_1 TEXT DEFAULT NULL`);
    logger.info('Added transcription_model_1 column to superbrain_settings table');
  }
  if (!sbColumns.includes('transcription_provider_2')) {
    db.exec(`ALTER TABLE superbrain_settings ADD COLUMN transcription_provider_2 TEXT DEFAULT NULL`);
    logger.info('Added transcription_provider_2 column to superbrain_settings table');
  }
  if (!sbColumns.includes('transcription_model_2')) {
    db.exec(`ALTER TABLE superbrain_settings ADD COLUMN transcription_model_2 TEXT DEFAULT NULL`);
    logger.info('Added transcription_model_2 column to superbrain_settings table');
  }
  if (!sbColumns.includes('transcription_provider_3')) {
    db.exec(`ALTER TABLE superbrain_settings ADD COLUMN transcription_provider_3 TEXT DEFAULT NULL`);
    logger.info('Added transcription_provider_3 column to superbrain_settings table');
  }
  if (!sbColumns.includes('transcription_model_3')) {
    db.exec(`ALTER TABLE superbrain_settings ADD COLUMN transcription_model_3 TEXT DEFAULT NULL`);
    logger.info('Added transcription_model_3 column to superbrain_settings table');
  }
  if (!sbColumns.includes('transcription_language')) {
    db.exec(`ALTER TABLE superbrain_settings ADD COLUMN transcription_language TEXT DEFAULT 'auto'`);
    logger.info('Added transcription_language column to superbrain_settings table');
  }

  // Reasoning Budget (per-tier iteration limits, JSON)
  if (!sbColumns.includes('reasoning_budgets')) {
    db.exec(`ALTER TABLE superbrain_settings ADD COLUMN reasoning_budgets TEXT DEFAULT NULL`);
    logger.info('Added reasoning_budgets column to superbrain_settings table');
  }

  // AI Task Classifier Settings (local keyword-based or AI-powered classification)
  if (!sbColumns.includes('classifier_mode')) {
    db.exec(`ALTER TABLE superbrain_settings ADD COLUMN classifier_mode TEXT DEFAULT 'local'`);
    logger.info('Added classifier_mode column to superbrain_settings table');
  }
  if (!sbColumns.includes('classifier_provider_1')) {
    db.exec(`ALTER TABLE superbrain_settings ADD COLUMN classifier_provider_1 TEXT DEFAULT NULL`);
    logger.info('Added classifier_provider_1 column to superbrain_settings table');
  }
  if (!sbColumns.includes('classifier_model_1')) {
    db.exec(`ALTER TABLE superbrain_settings ADD COLUMN classifier_model_1 TEXT DEFAULT NULL`);
    logger.info('Added classifier_model_1 column to superbrain_settings table');
  }
  if (!sbColumns.includes('classifier_provider_2')) {
    db.exec(`ALTER TABLE superbrain_settings ADD COLUMN classifier_provider_2 TEXT DEFAULT NULL`);
    logger.info('Added classifier_provider_2 column to superbrain_settings table');
  }
  if (!sbColumns.includes('classifier_model_2')) {
    db.exec(`ALTER TABLE superbrain_settings ADD COLUMN classifier_model_2 TEXT DEFAULT NULL`);
    logger.info('Added classifier_model_2 column to superbrain_settings table');
  }
  // Unlimited classifier chain (JSON array of {provider, model} entries)
  // Supersedes classifier_provider_1/2 and classifier_model_1/2 when populated
  if (!sbColumns.includes('classifier_chain')) {
    db.exec(`ALTER TABLE superbrain_settings ADD COLUMN classifier_chain TEXT DEFAULT NULL`);
    logger.info('Added classifier_chain column to superbrain_settings table');
    // Migrate existing fixed-slot data into classifier_chain JSON
    try {
      const rows = db.prepare(`SELECT user_id, classifier_provider_1, classifier_model_1, classifier_provider_2, classifier_model_2 FROM superbrain_settings WHERE classifier_provider_1 IS NOT NULL`).all();
      for (const r of rows) {
        const chain = [];
        if (r.classifier_provider_1) chain.push({ provider: r.classifier_provider_1, model: r.classifier_model_1 || null });
        if (r.classifier_provider_2) chain.push({ provider: r.classifier_provider_2, model: r.classifier_model_2 || null });
        if (chain.length > 0) {
          db.prepare(`UPDATE superbrain_settings SET classifier_chain = ? WHERE user_id = ?`).run(JSON.stringify(chain), r.user_id);
        }
      }
      if (rows.length > 0) logger.info(`Migrated ${rows.length} user(s) classifier settings to classifier_chain`);
    } catch (migErr) {
      logger.warn(`classifier_chain migration warning: ${migErr.message}`);
    }
  }

  // Migration: Consolidate openrouter-free/openrouter-paid to single 'openrouter'
  // User's Task Routing settings now control model selection (free vs paid)
  try {
    const updateResult = db.prepare(`
      UPDATE superbrain_settings
      SET
        simple_tier_provider = CASE WHEN simple_tier_provider IN ('openrouter-free', 'openrouter-paid') THEN 'openrouter' ELSE simple_tier_provider END,
        moderate_tier_provider = CASE WHEN moderate_tier_provider IN ('openrouter-free', 'openrouter-paid') THEN 'openrouter' ELSE moderate_tier_provider END,
        complex_tier_provider = CASE WHEN complex_tier_provider IN ('openrouter-free', 'openrouter-paid') THEN 'openrouter' ELSE complex_tier_provider END,
        vision_provider_2 = CASE WHEN vision_provider_2 IN ('openrouter-free', 'openrouter-paid') THEN 'openrouter' ELSE vision_provider_2 END,
        vision_provider_3 = CASE WHEN vision_provider_3 IN ('openrouter-free', 'openrouter-paid') THEN 'openrouter' ELSE vision_provider_3 END
      WHERE simple_tier_provider IN ('openrouter-free', 'openrouter-paid')
         OR moderate_tier_provider IN ('openrouter-free', 'openrouter-paid')
         OR complex_tier_provider IN ('openrouter-free', 'openrouter-paid')
         OR vision_provider_2 IN ('openrouter-free', 'openrouter-paid')
         OR vision_provider_3 IN ('openrouter-free', 'openrouter-paid')
    `).run();
    if (updateResult.changes > 0) {
      logger.info(`Migrated ${updateResult.changes} rows: openrouter-free/paid → openrouter`);
    }
  } catch (migrationError) {
    // Migration is optional - don't fail if it can't run
    logger.debug(`OpenRouter migration skipped: ${migrationError.message}`);
  }

  logger.info('Database tables created/verified');
}

/**
 * Run a query and return all results
 */
function all(sql, params = []) {
  return db.prepare(sql).all(...params);
}

/**
 * Run a query and return first result
 */
function get(sql, params = []) {
  return db.prepare(sql).get(...params);
}

/**
 * Run a query (insert/update/delete)
 */
function run(sql, params = []) {
  return db.prepare(sql).run(...params);
}

/**
 * Run multiple queries in a transaction
 */
function transaction(fn) {
  return db.transaction(fn)();
}

module.exports = {
  initDatabase,
  getDatabase,
  all,
  get,
  run,
  transaction
};
