/**
 * Database Migration: Agentic AI Tables
 *
 * Creates all 20 tables for the Agentic AI system:
 * 1.  agentic_profiles - Core profile with hierarchy and autonomy settings
 * 2.  agentic_monitoring - Supervision settings for message sources
 * 3.  agentic_team_members - Team composition with contacts
 * 4.  agentic_knowledge - Knowledge library bindings
 * 5.  agentic_goals - Objectives and metrics
 * 6.  agentic_schedules - Recurring tasks with cron expressions
 * 7.  agentic_tasks - Task queue with assignments
 * 8.  agentic_ai_routing - AI model routing with failover chains
 * 9.  agentic_messages - AI-to-AI internal messages
 * 10. agentic_routing_presets - Saved routing configurations
 * 11. agentic_activity_log - All agent actions for auditing
 * 12. agentic_hierarchy_log - Parent-child relationship changes
 * 13. agentic_approval_queue - Pending human approvals
 * 14. agentic_master_notifications - Notifications sent to master contacts
 * 15. agentic_memory - Long-term memory storage
 * 16. agentic_memory_vectors - Vector embeddings for semantic search
 * 17. agentic_memory_sessions - Active memory sessions (Redis-backed)
 * 18. agentic_contact_scope - Contact access restrictions
 * 19. agentic_scope_log - Blocked contact attempt audit trail
 * 20. agentic_background - Company background info (master agents only)
 *
 * Run with: node server/scripts/migrate-agentic-tables.cjs
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'swarm.db');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('Database Migration: Agentic AI Tables');
console.log(`Database: ${DB_PATH}`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// Track success/failure for summary
const results = { success: [], failed: [], skipped: [] };

function createTable(step, totalSteps, tableName, sql) {
  console.log(`\n[${step}/${totalSteps}] Creating ${tableName} table...`);
  try {
    db.exec(sql);
    console.log(`   ✓ ${tableName} table created`);
    results.success.push(tableName);
  } catch (e) {
    if (e.message.includes('already exists')) {
      console.log(`   ✓ ${tableName} table already exists`);
      results.skipped.push(tableName);
    } else {
      console.error(`   ✗ Error: ${e.message}`);
      results.failed.push({ table: tableName, error: e.message });
    }
  }
}

// =====================================================
// 1. AGENTIC PROFILES (Core entity)
// =====================================================
createTable(1, 20, 'agentic_profiles', `
  CREATE TABLE IF NOT EXISTS agentic_profiles (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,

    -- Link to agents table (for Agentic AI agents)
    agent_id TEXT UNIQUE,

    -- Basic Info
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    description TEXT,
    avatar TEXT,

    -- Hierarchy
    agent_type TEXT DEFAULT 'master' CHECK(agent_type IN ('master', 'sub')),
    parent_agentic_id TEXT,
    hierarchy_level INTEGER DEFAULT 0,
    hierarchy_path TEXT,

    -- Creation context
    created_by_type TEXT DEFAULT 'user' CHECK(created_by_type IN ('user', 'agentic')),
    created_by_agentic_id TEXT,
    creation_reason TEXT,
    creation_prompt TEXT,

    -- Inheritance settings
    inherit_team INTEGER DEFAULT 1,
    inherit_knowledge INTEGER DEFAULT 1,
    inherit_monitoring INTEGER DEFAULT 0,
    inherit_routing INTEGER DEFAULT 1,

    -- AI Configuration
    ai_provider TEXT DEFAULT 'task-routing',
    ai_model TEXT,
    temperature REAL DEFAULT 0.7,
    max_tokens INTEGER DEFAULT 4096,
    system_prompt TEXT,
    routing_preset TEXT,

    -- Autonomy Settings
    autonomy_level TEXT DEFAULT 'supervised'
      CHECK(autonomy_level IN ('supervised', 'semi-autonomous', 'autonomous')),
    require_approval_for TEXT DEFAULT '[]',

    -- Master Contact
    master_contact_id TEXT,
    master_contact_channel TEXT DEFAULT 'email'
      CHECK(master_contact_channel IN ('email', 'whatsapp', 'telegram')),
    notify_master_on TEXT DEFAULT '["approval_needed", "daily_report", "critical_error"]',
    escalation_timeout_minutes INTEGER DEFAULT 60,

    -- Sub-agent permissions
    can_create_children INTEGER DEFAULT 0,
    max_children INTEGER DEFAULT 5,
    max_hierarchy_depth INTEGER DEFAULT 3,
    children_autonomy_cap TEXT DEFAULT 'supervised',

    -- Resource limits
    daily_budget REAL DEFAULT 10.0,
    daily_budget_used REAL DEFAULT 0.0,
    rate_limit_per_minute INTEGER DEFAULT 60,

    -- Status
    status TEXT DEFAULT 'inactive'
      CHECK(status IN ('inactive', 'active', 'paused', 'error', 'terminated')),
    paused_by TEXT,
    last_active_at TEXT,

    -- Lifecycle
    expires_at TEXT,
    terminated_at TEXT,
    termination_reason TEXT,

    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),

    -- Note: No FOREIGN KEY on user_id to support test-bypass-user and external auth systems
    FOREIGN KEY (parent_agentic_id) REFERENCES agentic_profiles(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_agentic_user ON agentic_profiles(user_id);
  CREATE INDEX IF NOT EXISTS idx_agentic_agent ON agentic_profiles(agent_id);
  CREATE INDEX IF NOT EXISTS idx_agentic_parent ON agentic_profiles(parent_agentic_id);
  CREATE INDEX IF NOT EXISTS idx_agentic_hierarchy ON agentic_profiles(hierarchy_path);
  CREATE INDEX IF NOT EXISTS idx_agentic_status ON agentic_profiles(status);
`);

// Add agent_id column if it doesn't exist (migration for existing databases)
// Note: agent_id is deprecated - agentic_profiles IS the agent, not a link to agents table
try {
  const columns = db.prepare("PRAGMA table_info(agentic_profiles)").all();
  const hasAgentId = columns.some(col => col.name === 'agent_id');
  if (!hasAgentId) {
    db.exec("ALTER TABLE agentic_profiles ADD COLUMN agent_id TEXT UNIQUE");
    db.exec("CREATE INDEX IF NOT EXISTS idx_agentic_agent ON agentic_profiles(agent_id)");
    console.log('   Added agent_id column to agentic_profiles table');
  }
} catch (e) {
  // Table might not exist yet, ignore
}

// Add cli_type column for workspace CLI type (PRD refactor)
try {
  const columns = db.prepare("PRAGMA table_info(agentic_profiles)").all();
  const hasCliType = columns.some(col => col.name === 'cli_type');
  if (!hasCliType) {
    db.exec("ALTER TABLE agentic_profiles ADD COLUMN cli_type TEXT DEFAULT 'claude' CHECK(cli_type IN ('claude', 'gemini', 'opencode', 'bash'))");
    console.log('   Added cli_type column to agentic_profiles table');
  }
} catch (e) {
  // Ignore errors
}

// Add workspace_autonomy_level column (PRD refactor)
try {
  const columns = db.prepare("PRAGMA table_info(agentic_profiles)").all();
  const hasField = columns.some(col => col.name === 'workspace_autonomy_level');
  if (!hasField) {
    db.exec("ALTER TABLE agentic_profiles ADD COLUMN workspace_autonomy_level TEXT DEFAULT 'semi' CHECK(workspace_autonomy_level IN ('semi', 'full'))");
    console.log('   Added workspace_autonomy_level column to agentic_profiles table');
  }
} catch (e) {
  // Ignore errors
}

// Add response_agent_ids column (multi-select Active Agents for outbound messaging)
try {
  const columns = db.prepare("PRAGMA table_info(agentic_profiles)").all();
  const hasField = columns.some(col => col.name === 'response_agent_ids');
  if (!hasField) {
    db.exec("ALTER TABLE agentic_profiles ADD COLUMN response_agent_ids TEXT DEFAULT '[]'");
    console.log('   Added response_agent_ids column to agentic_profiles table');
  }
} catch (e) {
  // Ignore errors
}

// Expand notification_type CHECK constraint for Athena and other notification types
try {
  const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='agentic_master_notifications'").get();
  if (tableExists) {
    // Check if constraint needs updating by trying to insert a test type
    let needsUpdate = false;
    try {
      db.prepare("INSERT INTO agentic_master_notifications (id, agentic_id, user_id, master_contact_id, notification_type, title, content, channel) VALUES ('__test__', '__test__', '__test__', '__test__', 'test', '__test__', '__test__', 'test')").run();
      db.prepare("DELETE FROM agentic_master_notifications WHERE id = '__test__'").run();
    } catch (e) {
      if (e.message.includes('CHECK constraint')) needsUpdate = true;
    }

    if (needsUpdate) {
      console.log('   Expanding notification_type constraint...');
      db.exec(`
        ALTER TABLE agentic_master_notifications RENAME TO _old_notifications;
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
            'health_summary', 'agent_status_change', 'startup', 'info'
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
        INSERT INTO agentic_master_notifications SELECT * FROM _old_notifications;
        DROP TABLE _old_notifications;
        CREATE INDEX IF NOT EXISTS idx_master_notif_agentic ON agentic_master_notifications(agentic_id);
        CREATE INDEX IF NOT EXISTS idx_master_notif_user ON agentic_master_notifications(user_id);
        CREATE INDEX IF NOT EXISTS idx_master_notif_master ON agentic_master_notifications(master_contact_id, delivery_status);
      `);
      console.log('   Expanded notification_type constraint for Athena');
    }
  }
} catch (e) {
  console.log(`   Warning: notification constraint migration: ${e.message}`);
}

// =====================================================
// 2. PLATFORM MONITORING
// =====================================================
createTable(2, 20, 'agentic_monitoring', `
  CREATE TABLE IF NOT EXISTS agentic_monitoring (
    id TEXT PRIMARY KEY,
    agentic_id TEXT NOT NULL,
    user_id TEXT NOT NULL,

    -- Source configuration
    source_type TEXT NOT NULL
      CHECK(source_type IN ('email', 'whatsapp', 'telegram', 'platform_account')),
    source_id TEXT,
    source_name TEXT,

    -- Filters
    filter_keywords TEXT DEFAULT '[]',
    filter_senders TEXT DEFAULT '[]',
    filter_categories TEXT DEFAULT '[]',
    priority TEXT DEFAULT 'normal'
      CHECK(priority IN ('low', 'normal', 'high', 'urgent')),

    -- Actions
    auto_respond INTEGER DEFAULT 0,
    auto_classify INTEGER DEFAULT 1,
    forward_to_team INTEGER DEFAULT 0,

    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),

    FOREIGN KEY (agentic_id) REFERENCES agentic_profiles(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_agentic_mon_agentic ON agentic_monitoring(agentic_id);
  CREATE INDEX IF NOT EXISTS idx_agentic_mon_user ON agentic_monitoring(user_id);
  CREATE INDEX IF NOT EXISTS idx_agentic_mon_source ON agentic_monitoring(source_type, source_id);
`);

// =====================================================
// 3. TEAM MEMBERS
// =====================================================
createTable(3, 20, 'agentic_team_members', `
  CREATE TABLE IF NOT EXISTS agentic_team_members (
    id TEXT PRIMARY KEY,
    agentic_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    contact_id TEXT NOT NULL,

    -- Role & Skills
    role TEXT NOT NULL,
    department TEXT,
    skills TEXT DEFAULT '[]',

    -- Availability
    is_available INTEGER DEFAULT 1,
    availability_schedule TEXT DEFAULT '{}',
    timezone TEXT DEFAULT 'Asia/Jakarta',
    max_concurrent_tasks INTEGER DEFAULT 3,

    -- Preferences
    task_types TEXT DEFAULT '[]',
    priority_level TEXT DEFAULT 'normal',
    preferred_channel TEXT DEFAULT 'email'
      CHECK(preferred_channel IN ('email', 'whatsapp', 'telegram')),
    notification_frequency TEXT DEFAULT 'immediate'
      CHECK(notification_frequency IN ('immediate', 'hourly', 'daily')),

    -- Performance metrics
    tasks_completed INTEGER DEFAULT 0,
    avg_completion_time INTEGER DEFAULT 0,
    rating REAL DEFAULT 5.0,

    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),

    FOREIGN KEY (agentic_id) REFERENCES agentic_profiles(id) ON DELETE CASCADE,
    FOREIGN KEY (contact_id) REFERENCES contacts(id)
  );

  CREATE INDEX IF NOT EXISTS idx_agentic_team_agentic ON agentic_team_members(agentic_id);
  CREATE INDEX IF NOT EXISTS idx_agentic_team_user ON agentic_team_members(user_id);
  CREATE INDEX IF NOT EXISTS idx_agentic_team_contact ON agentic_team_members(contact_id);
`);

// =====================================================
// 4. KNOWLEDGE LIBRARY BINDINGS
// =====================================================
createTable(4, 20, 'agentic_knowledge', `
  CREATE TABLE IF NOT EXISTS agentic_knowledge (
    id TEXT PRIMARY KEY,
    agentic_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    library_id TEXT NOT NULL,

    access_type TEXT DEFAULT 'read'
      CHECK(access_type IN ('read', 'write', 'manage')),
    auto_learn INTEGER DEFAULT 0,
    learn_from TEXT DEFAULT '[]',
    priority INTEGER DEFAULT 0,

    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),

    FOREIGN KEY (agentic_id) REFERENCES agentic_profiles(id) ON DELETE CASCADE,
    FOREIGN KEY (library_id) REFERENCES knowledge_libraries(id)
  );

  CREATE INDEX IF NOT EXISTS idx_agentic_know_agentic ON agentic_knowledge(agentic_id);
  CREATE INDEX IF NOT EXISTS idx_agentic_know_user ON agentic_knowledge(user_id);
  CREATE INDEX IF NOT EXISTS idx_agentic_know_library ON agentic_knowledge(library_id);
`);

// =====================================================
// 5. GOALS & OBJECTIVES
// =====================================================
createTable(5, 20, 'agentic_goals', `
  CREATE TABLE IF NOT EXISTS agentic_goals (
    id TEXT PRIMARY KEY,
    agentic_id TEXT NOT NULL,
    user_id TEXT NOT NULL,

    title TEXT NOT NULL,
    description TEXT,
    goal_type TEXT DEFAULT 'ongoing'
      CHECK(goal_type IN ('ongoing', 'deadline', 'milestone')),

    -- Metrics
    target_metric TEXT,
    target_value TEXT,
    current_value TEXT,

    -- Timeline
    deadline_at TEXT,

    priority TEXT DEFAULT 'normal',
    status TEXT DEFAULT 'active'
      CHECK(status IN ('active', 'paused', 'completed', 'failed')),

    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),

    FOREIGN KEY (agentic_id) REFERENCES agentic_profiles(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_agentic_goals_agentic ON agentic_goals(agentic_id);
  CREATE INDEX IF NOT EXISTS idx_agentic_goals_user ON agentic_goals(user_id);
  CREATE INDEX IF NOT EXISTS idx_agentic_goals_status ON agentic_goals(status);
`);

// =====================================================
// 6. SCHEDULES
// =====================================================
createTable(6, 20, 'agentic_schedules', `
  CREATE TABLE IF NOT EXISTS agentic_schedules (
    id TEXT PRIMARY KEY,
    agentic_id TEXT NOT NULL,
    user_id TEXT NOT NULL,

    title TEXT NOT NULL,
    description TEXT,

    schedule_type TEXT DEFAULT 'cron'
      CHECK(schedule_type IN ('cron', 'interval', 'once', 'event')),
    cron_expression TEXT,
    interval_minutes INTEGER,
    next_run_at TEXT,
    last_run_at TEXT,

    -- Action
    action_type TEXT NOT NULL
      CHECK(action_type IN ('check_messages', 'send_report', 'review_tasks',
                            'update_knowledge', 'custom_prompt', 'self_reflect', 'health_summary', 'reasoning_cycle')),
    action_config TEXT DEFAULT '{}',
    custom_prompt TEXT,

    created_by TEXT DEFAULT 'user' CHECK(created_by IN ('user', 'self')),

    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),

    FOREIGN KEY (agentic_id) REFERENCES agentic_profiles(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_agentic_sched_agentic ON agentic_schedules(agentic_id);
  CREATE INDEX IF NOT EXISTS idx_agentic_sched_user ON agentic_schedules(user_id);
  CREATE INDEX IF NOT EXISTS idx_agentic_sched_next ON agentic_schedules(next_run_at, is_active);
`);

// =====================================================
// 7. TASK TRACKING
// =====================================================
createTable(7, 20, 'agentic_tasks', `
  CREATE TABLE IF NOT EXISTS agentic_tasks (
    id TEXT PRIMARY KEY,
    agentic_id TEXT NOT NULL,
    user_id TEXT NOT NULL,

    -- Details
    title TEXT NOT NULL,
    description TEXT,
    task_type TEXT,

    -- Assignment
    assigned_to TEXT,
    assigned_at TEXT,

    -- Source
    source_type TEXT,
    source_id TEXT,
    source_content TEXT,

    -- Status
    status TEXT DEFAULT 'pending'
      CHECK(status IN ('pending', 'assigned', 'in_progress', 'review',
                       'completed', 'cancelled', 'blocked')),
    priority TEXT DEFAULT 'normal',

    -- Timeline
    due_at TEXT,
    started_at TEXT,
    completed_at TEXT,

    -- Updates
    updates TEXT DEFAULT '[]',

    -- AI Analysis
    ai_summary TEXT,
    ai_suggested_assignee TEXT,
    ai_estimated_hours REAL,

    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),

    FOREIGN KEY (agentic_id) REFERENCES agentic_profiles(id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_to) REFERENCES agentic_team_members(id)
  );

  CREATE INDEX IF NOT EXISTS idx_agentic_task_agentic ON agentic_tasks(agentic_id);
  CREATE INDEX IF NOT EXISTS idx_agentic_task_user ON agentic_tasks(user_id);
  CREATE INDEX IF NOT EXISTS idx_agentic_task_status ON agentic_tasks(agentic_id, status);
  CREATE INDEX IF NOT EXISTS idx_agentic_task_assignee ON agentic_tasks(assigned_to, status);
`);

// =====================================================
// 8. AI ROUTING (with Failover Chain)
// =====================================================
createTable(8, 20, 'agentic_ai_routing', `
  CREATE TABLE IF NOT EXISTS agentic_ai_routing (
    id TEXT PRIMARY KEY,
    agentic_id TEXT NOT NULL,
    user_id TEXT NOT NULL,

    task_type TEXT NOT NULL CHECK(task_type IN (
      'email_draft', 'email_send', 'message_respond', 'message_classify',
      'task_analyze', 'task_assign', 'task_summarize', 'task_prioritize',
      'rag_query', 'knowledge_extract', 'knowledge_summarize',
      'self_prompt', 'self_schedule', 'self_reflect',
      'agent_create', 'agent_communicate', 'agent_delegate',
      'decision_simple', 'decision_complex', 'escalation_check',
      'memory_store', 'memory_recall',
      'default'
    )),

    -- Provider chain with automatic failover
    provider_chain TEXT NOT NULL DEFAULT '[]',

    -- Model parameters
    temperature REAL DEFAULT 0.7,
    max_tokens INTEGER DEFAULT 4096,
    system_prompt_override TEXT,

    -- Retry/failover settings
    max_retries INTEGER DEFAULT 2,
    retry_delay_ms INTEGER DEFAULT 1000,
    timeout_seconds INTEGER DEFAULT 60,

    priority TEXT DEFAULT 'normal',

    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),

    FOREIGN KEY (agentic_id) REFERENCES agentic_profiles(id) ON DELETE CASCADE,
    UNIQUE(agentic_id, task_type)
  );

  CREATE INDEX IF NOT EXISTS idx_agentic_routing_agentic ON agentic_ai_routing(agentic_id);
  CREATE INDEX IF NOT EXISTS idx_agentic_routing_user ON agentic_ai_routing(user_id);
`);

// =====================================================
// 9. AI-TO-AI MESSAGES
// =====================================================
createTable(9, 20, 'agentic_messages', `
  CREATE TABLE IF NOT EXISTS agentic_messages (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    from_agentic_id TEXT NOT NULL,
    to_agentic_id TEXT NOT NULL,

    message_type TEXT DEFAULT 'request'
      CHECK(message_type IN ('request', 'response', 'notification',
                             'handoff', 'status_update', 'escalation')),

    subject TEXT,
    content TEXT NOT NULL,
    context TEXT DEFAULT '{}',
    reply_to_id TEXT,

    status TEXT DEFAULT 'pending'
      CHECK(status IN ('pending', 'read', 'processing', 'completed', 'failed')),

    created_at TEXT DEFAULT (datetime('now')),
    processed_at TEXT,

    FOREIGN KEY (from_agentic_id) REFERENCES agentic_profiles(id),
    FOREIGN KEY (to_agentic_id) REFERENCES agentic_profiles(id)
  );

  CREATE INDEX IF NOT EXISTS idx_agentic_msg_user ON agentic_messages(user_id);
  CREATE INDEX IF NOT EXISTS idx_agentic_msg_from ON agentic_messages(from_agentic_id);
  CREATE INDEX IF NOT EXISTS idx_agentic_msg_to ON agentic_messages(to_agentic_id, status);
`);

// =====================================================
// 10. ROUTING PRESETS
// =====================================================
createTable(10, 20, 'agentic_routing_presets', `
  CREATE TABLE IF NOT EXISTS agentic_routing_presets (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    name TEXT NOT NULL,
    description TEXT,
    routing_config TEXT NOT NULL DEFAULT '{}',
    recommended_for TEXT DEFAULT '[]',
    is_system INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_agentic_presets_user ON agentic_routing_presets(user_id);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_agentic_presets_name ON agentic_routing_presets(name) WHERE user_id IS NULL;
`);

// Insert default presets
console.log('\n   Inserting default routing presets...');
try {
  db.exec(`
    INSERT OR IGNORE INTO agentic_routing_presets (id, name, description, routing_config, recommended_for, is_system)
    VALUES
      ('preset-gm', 'GM Operation', 'For General Manager / Operations Lead roles', '{}', '["manager","operations"]', 1),
      ('preset-support', 'Support Agent', 'For customer support roles', '{}', '["support","helpdesk"]', 1),
      ('preset-dev', 'Developer Assistant', 'For technical roles', '{}', '["developer","engineer"]', 1);
  `);
  console.log('   ✓ Default presets inserted');
} catch (e) {
  console.log(`   ✓ Default presets already exist or skipped: ${e.message}`);
}

// =====================================================
// 11. ACTIVITY LOG
// =====================================================
createTable(11, 20, 'agentic_activity_log', `
  CREATE TABLE IF NOT EXISTS agentic_activity_log (
    id TEXT PRIMARY KEY,
    agentic_id TEXT NOT NULL,
    user_id TEXT NOT NULL,

    activity_type TEXT NOT NULL,
    activity_description TEXT,

    trigger_type TEXT,
    trigger_id TEXT,

    status TEXT DEFAULT 'success',
    error_message TEXT,

    required_approval INTEGER DEFAULT 0,
    approved_by TEXT,
    approved_at TEXT,

    metadata TEXT DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now')),

    FOREIGN KEY (agentic_id) REFERENCES agentic_profiles(id)
  );

  CREATE INDEX IF NOT EXISTS idx_agentic_log_agentic ON agentic_activity_log(agentic_id);
  CREATE INDEX IF NOT EXISTS idx_agentic_log_user ON agentic_activity_log(user_id);
  CREATE INDEX IF NOT EXISTS idx_agentic_log_time ON agentic_activity_log(agentic_id, created_at DESC);
`);

// =====================================================
// 12. HIERARCHY LOG
// =====================================================
createTable(12, 20, 'agentic_hierarchy_log', `
  CREATE TABLE IF NOT EXISTS agentic_hierarchy_log (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,

    event_type TEXT NOT NULL CHECK(event_type IN (
      'sub_created', 'sub_paused', 'sub_resumed', 'sub_terminated',
      'sub_promoted', 'autonomy_changed', 'budget_exceeded',
      'depth_limit_hit', 'permission_denied'
    )),

    parent_agentic_id TEXT,
    child_agentic_id TEXT,
    triggered_by TEXT,
    details TEXT DEFAULT '{}',

    created_at TEXT DEFAULT (datetime('now')),

    FOREIGN KEY (parent_agentic_id) REFERENCES agentic_profiles(id),
    FOREIGN KEY (child_agentic_id) REFERENCES agentic_profiles(id)
  );

  CREATE INDEX IF NOT EXISTS idx_agentic_hier_user ON agentic_hierarchy_log(user_id);
  CREATE INDEX IF NOT EXISTS idx_agentic_hier_parent ON agentic_hierarchy_log(parent_agentic_id);
  CREATE INDEX IF NOT EXISTS idx_agentic_hier_child ON agentic_hierarchy_log(child_agentic_id);
`);

// =====================================================
// 13. APPROVAL QUEUE (Human-in-the-Loop)
// =====================================================
createTable(13, 20, 'agentic_approval_queue', `
  CREATE TABLE IF NOT EXISTS agentic_approval_queue (
    id TEXT PRIMARY KEY,
    agentic_id TEXT NOT NULL,
    user_id TEXT NOT NULL,

    -- What needs approval
    action_type TEXT NOT NULL CHECK(action_type IN (
      'send_email', 'send_message', 'create_task', 'assign_task',
      'create_agent', 'terminate_agent', 'update_knowledge',
      'create_schedule', 'budget_increase', 'autonomy_change'
    )),
    action_title TEXT NOT NULL,
    action_description TEXT,
    action_payload TEXT NOT NULL DEFAULT '{}',

    -- Context
    triggered_by TEXT,
    trigger_context TEXT DEFAULT '{}',
    confidence_score REAL,
    reasoning TEXT,

    -- Approval target
    master_contact_id TEXT NOT NULL,
    notification_channel TEXT,
    notification_sent_at TEXT,
    notification_count INTEGER DEFAULT 0,

    -- Status
    status TEXT DEFAULT 'pending'
      CHECK(status IN ('pending', 'approved', 'rejected', 'expired', 'auto_approved')),
    priority TEXT DEFAULT 'normal'
      CHECK(priority IN ('low', 'normal', 'high', 'urgent')),

    -- Resolution
    resolved_by TEXT,
    resolved_at TEXT,
    resolution_notes TEXT,
    modified_payload TEXT,

    -- Timing
    expires_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),

    FOREIGN KEY (agentic_id) REFERENCES agentic_profiles(id) ON DELETE CASCADE,
    FOREIGN KEY (master_contact_id) REFERENCES contacts(id)
  );

  CREATE INDEX IF NOT EXISTS idx_approval_agentic ON agentic_approval_queue(agentic_id);
  CREATE INDEX IF NOT EXISTS idx_approval_user ON agentic_approval_queue(user_id);
  CREATE INDEX IF NOT EXISTS idx_approval_status ON agentic_approval_queue(agentic_id, status);
  CREATE INDEX IF NOT EXISTS idx_approval_master ON agentic_approval_queue(master_contact_id, status);
  CREATE INDEX IF NOT EXISTS idx_approval_expires ON agentic_approval_queue(expires_at, status);
`);

// =====================================================
// 14. MASTER CONTACT NOTIFICATIONS
// =====================================================
createTable(14, 20, 'agentic_master_notifications', `
  CREATE TABLE IF NOT EXISTS agentic_master_notifications (
    id TEXT PRIMARY KEY,
    agentic_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    master_contact_id TEXT NOT NULL,

    -- Notification content
    notification_type TEXT NOT NULL CHECK(notification_type IN (
      'approval_needed', 'approval_reminder', 'daily_report', 'weekly_report',
      'critical_error', 'budget_warning', 'budget_exceeded',
      'agent_created', 'agent_terminated', 'escalation', 'status_update'
    )),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    context TEXT DEFAULT '{}',

    -- Delivery
    channel TEXT NOT NULL,
    delivery_status TEXT DEFAULT 'pending'
      CHECK(delivery_status IN ('pending', 'sent', 'delivered', 'read', 'failed')),
    sent_at TEXT,
    delivered_at TEXT,
    read_at TEXT,
    error_message TEXT,

    -- Reference
    reference_type TEXT,
    reference_id TEXT,

    created_at TEXT DEFAULT (datetime('now')),

    FOREIGN KEY (agentic_id) REFERENCES agentic_profiles(id) ON DELETE CASCADE,
    FOREIGN KEY (master_contact_id) REFERENCES contacts(id)
  );

  CREATE INDEX IF NOT EXISTS idx_master_notif_agentic ON agentic_master_notifications(agentic_id);
  CREATE INDEX IF NOT EXISTS idx_master_notif_user ON agentic_master_notifications(user_id);
  CREATE INDEX IF NOT EXISTS idx_master_notif_master ON agentic_master_notifications(master_contact_id, delivery_status);
`);

// =====================================================
// 15. AGENTIC MEMORY SYSTEM
// =====================================================
createTable(15, 20, 'agentic_memory', `
  CREATE TABLE IF NOT EXISTS agentic_memory (
    id TEXT PRIMARY KEY,
    agentic_id TEXT NOT NULL,
    user_id TEXT NOT NULL,

    -- Memory classification
    memory_type TEXT NOT NULL CHECK(memory_type IN (
      'conversation',
      'transaction',
      'decision',
      'learning',
      'context',
      'preference',
      'relationship',
      'event',
      'reflection'
    )),

    -- Content
    title TEXT,
    content TEXT NOT NULL,
    summary TEXT,

    -- Associations
    contact_id TEXT,
    conversation_id TEXT,
    task_id TEXT,
    related_memory_ids TEXT DEFAULT '[]',

    -- Metadata
    importance_score REAL DEFAULT 0.5,
    emotion_context TEXT,
    tags TEXT DEFAULT '[]',
    metadata TEXT DEFAULT '{}',

    -- Temporal
    occurred_at TEXT,
    expires_at TEXT,
    last_recalled_at TEXT,
    recall_count INTEGER DEFAULT 0,

    -- Storage location
    storage_type TEXT DEFAULT 'inline' CHECK(storage_type IN ('inline', 'redis', 'file')),
    storage_key TEXT,

    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),

    FOREIGN KEY (agentic_id) REFERENCES agentic_profiles(id) ON DELETE CASCADE,
    FOREIGN KEY (contact_id) REFERENCES contacts(id),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id),
    FOREIGN KEY (task_id) REFERENCES agentic_tasks(id)
  );

  CREATE INDEX IF NOT EXISTS idx_memory_agentic ON agentic_memory(agentic_id);
  CREATE INDEX IF NOT EXISTS idx_memory_user ON agentic_memory(user_id);
  CREATE INDEX IF NOT EXISTS idx_memory_type ON agentic_memory(agentic_id, memory_type);
  CREATE INDEX IF NOT EXISTS idx_memory_contact ON agentic_memory(agentic_id, contact_id);
  CREATE INDEX IF NOT EXISTS idx_memory_importance ON agentic_memory(agentic_id, importance_score DESC);
  CREATE INDEX IF NOT EXISTS idx_memory_time ON agentic_memory(agentic_id, occurred_at DESC);
`);

// =====================================================
// 16. AGENTIC MEMORY EMBEDDINGS
// =====================================================
createTable(16, 20, 'agentic_memory_vectors', `
  CREATE TABLE IF NOT EXISTS agentic_memory_vectors (
    id TEXT PRIMARY KEY,
    memory_id TEXT NOT NULL,
    agentic_id TEXT NOT NULL,
    user_id TEXT NOT NULL,

    -- Vector storage reference
    vector_collection TEXT NOT NULL,
    vector_id TEXT NOT NULL,

    -- Embedding info
    embedding_model TEXT,
    embedding_version INTEGER DEFAULT 1,

    created_at TEXT DEFAULT (datetime('now')),

    FOREIGN KEY (memory_id) REFERENCES agentic_memory(id) ON DELETE CASCADE,
    FOREIGN KEY (agentic_id) REFERENCES agentic_profiles(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_memory_vector_agentic ON agentic_memory_vectors(agentic_id);
  CREATE INDEX IF NOT EXISTS idx_memory_vector_user ON agentic_memory_vectors(user_id);
  CREATE INDEX IF NOT EXISTS idx_memory_vector_memory ON agentic_memory_vectors(agentic_id, memory_id);
`);

// =====================================================
// 17. AGENTIC MEMORY SESSIONS
// =====================================================
createTable(17, 20, 'agentic_memory_sessions', `
  CREATE TABLE IF NOT EXISTS agentic_memory_sessions (
    id TEXT PRIMARY KEY,
    agentic_id TEXT NOT NULL,
    user_id TEXT NOT NULL,

    -- Session info
    session_type TEXT NOT NULL CHECK(session_type IN (
      'active_conversation',
      'working_context',
      'recent_interactions',
      'pending_decisions'
    )),

    -- Redis reference
    redis_key TEXT NOT NULL,
    redis_ttl INTEGER DEFAULT 3600,

    -- Metadata
    contact_id TEXT,
    metadata TEXT DEFAULT '{}',

    last_accessed_at TEXT,
    expires_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),

    FOREIGN KEY (agentic_id) REFERENCES agentic_profiles(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_memory_session_agentic ON agentic_memory_sessions(agentic_id);
  CREATE INDEX IF NOT EXISTS idx_memory_session_user ON agentic_memory_sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_memory_session_type ON agentic_memory_sessions(agentic_id, session_type);
`);

// =====================================================
// 18. CONTACT SCOPE (Output Permissions)
// =====================================================
createTable(18, 20, 'agentic_contact_scope', `
  CREATE TABLE IF NOT EXISTS agentic_contact_scope (
    id TEXT PRIMARY KEY,
    agentic_id TEXT NOT NULL,
    user_id TEXT NOT NULL,

    -- Scope type
    scope_type TEXT DEFAULT 'team_only' CHECK(scope_type IN (
      'team_only',
      'contacts_whitelist',
      'contacts_tags',
      'all_user_contacts',
      'unrestricted'
    )),

    -- Whitelist configuration
    whitelist_contact_ids TEXT DEFAULT '[]',
    whitelist_tags TEXT DEFAULT '[]',

    -- Always-allowed exceptions
    allow_team_members INTEGER DEFAULT 1,
    allow_master_contact INTEGER DEFAULT 1,

    -- Behavior settings
    notify_on_out_of_scope INTEGER DEFAULT 1,
    auto_add_approved INTEGER DEFAULT 0,
    log_all_communications INTEGER DEFAULT 1,

    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),

    FOREIGN KEY (agentic_id) REFERENCES agentic_profiles(id) ON DELETE CASCADE,
    UNIQUE(agentic_id)
  );

  CREATE INDEX IF NOT EXISTS idx_contact_scope_agentic ON agentic_contact_scope(agentic_id);
  CREATE INDEX IF NOT EXISTS idx_contact_scope_user ON agentic_contact_scope(user_id);
`);

// =====================================================
// 19. CONTACT SCOPE LOG (Audit trail)
// =====================================================
createTable(19, 20, 'agentic_scope_log', `
  CREATE TABLE IF NOT EXISTS agentic_scope_log (
    id TEXT PRIMARY KEY,
    agentic_id TEXT NOT NULL,
    user_id TEXT NOT NULL,

    -- Attempt details
    action_type TEXT NOT NULL CHECK(action_type IN ('send_email', 'send_message')),
    recipient_type TEXT,
    recipient_value TEXT,
    recipient_contact_id TEXT,
    recipient_name TEXT,

    -- Message preview
    message_subject TEXT,
    message_preview TEXT,

    -- Resolution
    status TEXT DEFAULT 'pending' CHECK(status IN (
      'pending', 'approved', 'approved_added', 'rejected', 'expired'
    )),
    approval_id TEXT,
    resolved_by TEXT,
    resolved_at TEXT,

    -- Context
    reason_blocked TEXT,

    created_at TEXT DEFAULT (datetime('now')),

    FOREIGN KEY (agentic_id) REFERENCES agentic_profiles(id) ON DELETE CASCADE,
    FOREIGN KEY (recipient_contact_id) REFERENCES contacts(id)
  );

  CREATE INDEX IF NOT EXISTS idx_scope_log_agentic ON agentic_scope_log(agentic_id);
  CREATE INDEX IF NOT EXISTS idx_scope_log_user ON agentic_scope_log(user_id);
  CREATE INDEX IF NOT EXISTS idx_scope_log_status ON agentic_scope_log(agentic_id, status);
  CREATE INDEX IF NOT EXISTS idx_scope_log_recipient ON agentic_scope_log(recipient_value);
`);

// =====================================================
// 20. BACKGROUND INFORMATION (Organization Context)
// =====================================================
createTable(20, 20, 'agentic_background', `
  CREATE TABLE IF NOT EXISTS agentic_background (
    id TEXT PRIMARY KEY,
    agentic_id TEXT NOT NULL,
    user_id TEXT NOT NULL,

    -- Company Identity
    company_name TEXT NOT NULL,
    company_short_name TEXT,
    company_type TEXT,
    registration_number TEXT,
    tax_id TEXT,

    -- Business Details
    industry TEXT,
    description TEXT,
    established TEXT,
    employee_count TEXT,
    services TEXT DEFAULT '[]',
    products TEXT DEFAULT '[]',

    -- Contact Information
    primary_phone TEXT,
    alternate_phone TEXT,
    primary_email TEXT,
    support_email TEXT,
    website TEXT,

    -- Address
    address_street TEXT,
    address_city TEXT,
    address_state TEXT,
    address_postal_code TEXT,
    address_country TEXT,

    -- Operations
    timezone TEXT DEFAULT 'UTC',
    business_hours TEXT DEFAULT '{}',
    holidays TEXT DEFAULT '[]',

    -- Social Media
    linkedin TEXT,
    facebook TEXT,
    twitter TEXT,
    instagram TEXT,

    -- Custom fields
    custom_fields TEXT DEFAULT '{}',

    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),

    FOREIGN KEY (agentic_id) REFERENCES agentic_profiles(id) ON DELETE CASCADE,
    UNIQUE(agentic_id)
  );

  CREATE INDEX IF NOT EXISTS idx_background_agentic ON agentic_background(agentic_id);
  CREATE INDEX IF NOT EXISTS idx_background_user ON agentic_background(user_id);
`);

// =====================================================
// Verification
// =====================================================
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('Verification:');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

const tableNames = [
  'agentic_profiles',
  'agentic_monitoring',
  'agentic_team_members',
  'agentic_knowledge',
  'agentic_goals',
  'agentic_schedules',
  'agentic_tasks',
  'agentic_ai_routing',
  'agentic_messages',
  'agentic_routing_presets',
  'agentic_activity_log',
  'agentic_hierarchy_log',
  'agentic_approval_queue',
  'agentic_master_notifications',
  'agentic_memory',
  'agentic_memory_vectors',
  'agentic_memory_sessions',
  'agentic_contact_scope',
  'agentic_scope_log',
  'agentic_background'
];

const existingTables = db.prepare(`
  SELECT name FROM sqlite_master
  WHERE type='table' AND name LIKE 'agentic_%'
`).all().map(t => t.name);

let verified = 0;
let missing = 0;

tableNames.forEach((name) => {
  if (existingTables.includes(name)) {
    const count = db.prepare(`SELECT COUNT(*) as count FROM ${name}`).get();
    console.log(`   ✓ ${name}: ${count.count} rows`);
    verified++;
  } else {
    console.log(`   ✗ ${name}: MISSING`);
    missing++;
  }
});

db.close();

// =====================================================
// Summary
// =====================================================
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('Migration Summary:');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`   Created: ${results.success.length}`);
console.log(`   Already existed: ${results.skipped.length}`);
console.log(`   Failed: ${results.failed.length}`);
console.log(`   Verified: ${verified}/${tableNames.length}`);

if (results.failed.length > 0) {
  console.log('\n   Failed tables:');
  results.failed.forEach(f => {
    console.log(`      - ${f.table}: ${f.error}`);
  });
}

if (missing > 0) {
  console.log('\n❌ Migration completed with errors!');
  process.exit(1);
} else {
  console.log('\n✅ Migration completed successfully!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}
