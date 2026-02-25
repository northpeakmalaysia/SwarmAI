/**
 * Database Migration: Agentic Skills System Tables
 *
 * Creates tables for the agent skills system:
 * 1. agentic_skills_catalog - Predefined skills available in the system
 * 2. agentic_agent_skills - Skills assigned to specific agents
 * 3. agentic_skill_history - Skill training/learning history
 *
 * Run with: node server/scripts/migrate-agentic-skills.cjs
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'swarm.db');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('Database Migration: Agentic Skills System');
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
// 1. SKILLS CATALOG (Predefined skills)
// =====================================================
createTable(1, 3, 'agentic_skills_catalog', `
  CREATE TABLE IF NOT EXISTS agentic_skills_catalog (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL CHECK(category IN ('communication', 'analysis', 'automation', 'integration', 'management')),
    description TEXT,
    icon TEXT,
    prerequisites TEXT DEFAULT '[]',
    max_level INTEGER DEFAULT 4,
    tools_unlocked TEXT DEFAULT '[]',
    xp_per_level TEXT DEFAULT '[100, 300, 600, 1000]',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_skills_catalog_category ON agentic_skills_catalog(category);
  CREATE INDEX IF NOT EXISTS idx_skills_catalog_name ON agentic_skills_catalog(name);
`);

// =====================================================
// 2. AGENT SKILLS (Skills assigned to agents)
// =====================================================
createTable(2, 3, 'agentic_agent_skills', `
  CREATE TABLE IF NOT EXISTS agentic_agent_skills (
    id TEXT PRIMARY KEY,
    agentic_id TEXT NOT NULL,
    skill_id TEXT NOT NULL,
    current_level INTEGER DEFAULT 1 CHECK(current_level >= 1 AND current_level <= 4),
    experience_points INTEGER DEFAULT 0,
    points_to_next_level INTEGER DEFAULT 100,
    acquired_at TEXT DEFAULT (datetime('now')),
    last_used_at TEXT,
    usage_count INTEGER DEFAULT 0,
    is_inherited INTEGER DEFAULT 0,
    inherited_from TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(agentic_id, skill_id),
    FOREIGN KEY (agentic_id) REFERENCES agentic_profiles(id) ON DELETE CASCADE,
    FOREIGN KEY (skill_id) REFERENCES agentic_skills_catalog(id),
    FOREIGN KEY (inherited_from) REFERENCES agentic_profiles(id)
  );

  CREATE INDEX IF NOT EXISTS idx_agent_skills_agentic ON agentic_agent_skills(agentic_id);
  CREATE INDEX IF NOT EXISTS idx_agent_skills_skill ON agentic_agent_skills(skill_id);
  CREATE INDEX IF NOT EXISTS idx_agent_skills_level ON agentic_agent_skills(agentic_id, current_level DESC);
  CREATE INDEX IF NOT EXISTS idx_agent_skills_inherited ON agentic_agent_skills(agentic_id, is_inherited);
`);

// =====================================================
// 3. SKILL HISTORY (Training/learning history)
// =====================================================
createTable(3, 3, 'agentic_skill_history', `
  CREATE TABLE IF NOT EXISTS agentic_skill_history (
    id TEXT PRIMARY KEY,
    agentic_id TEXT NOT NULL,
    skill_id TEXT NOT NULL,
    action TEXT NOT NULL CHECK(action IN ('acquired', 'upgraded', 'used', 'inherited', 'removed', 'downgraded')),
    from_level INTEGER,
    to_level INTEGER,
    experience_gained INTEGER DEFAULT 0,
    details TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (agentic_id) REFERENCES agentic_profiles(id) ON DELETE CASCADE,
    FOREIGN KEY (skill_id) REFERENCES agentic_skills_catalog(id)
  );

  CREATE INDEX IF NOT EXISTS idx_skill_history_agentic ON agentic_skill_history(agentic_id);
  CREATE INDEX IF NOT EXISTS idx_skill_history_skill ON agentic_skill_history(skill_id);
  CREATE INDEX IF NOT EXISTS idx_skill_history_time ON agentic_skill_history(agentic_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_skill_history_action ON agentic_skill_history(agentic_id, action);
`);

// =====================================================
// Insert default skills into catalog
// =====================================================
console.log('\n[4/4] Inserting default skills into catalog...');

const defaultSkills = [
  // Communication skills
  {
    id: 'skill-email-management',
    name: 'email_management',
    category: 'communication',
    description: 'Ability to read, compose, organize, and manage email communications effectively',
    icon: 'mail',
    prerequisites: '[]',
    max_level: 4,
    tools_unlocked: '["email_send", "email_draft", "email_reply", "email_organize"]',
    xp_per_level: '[100, 300, 600, 1000]'
  },
  {
    id: 'skill-chat-response',
    name: 'chat_response',
    category: 'communication',
    description: 'Ability to respond to chat messages across various platforms with appropriate tone and content',
    icon: 'message-circle',
    prerequisites: '[]',
    max_level: 4,
    tools_unlocked: '["chat_reply", "chat_compose", "quick_reply"]',
    xp_per_level: '[100, 300, 600, 1000]'
  },
  {
    id: 'skill-report-writing',
    name: 'report_writing',
    category: 'communication',
    description: 'Ability to create structured reports, summaries, and documentation',
    icon: 'file-text',
    prerequisites: '[]',
    max_level: 4,
    tools_unlocked: '["report_generate", "summary_create", "document_draft"]',
    xp_per_level: '[100, 300, 600, 1000]'
  },
  {
    id: 'skill-multilingual',
    name: 'multilingual',
    category: 'communication',
    description: 'Ability to communicate and translate across multiple languages',
    icon: 'globe',
    prerequisites: '[]',
    max_level: 4,
    tools_unlocked: '["translate", "language_detect", "localize"]',
    xp_per_level: '[150, 400, 800, 1200]'
  },

  // Analysis skills
  {
    id: 'skill-data-analysis',
    name: 'data_analysis',
    category: 'analysis',
    description: 'Ability to analyze data, identify patterns, and extract insights',
    icon: 'bar-chart-2',
    prerequisites: '[]',
    max_level: 4,
    tools_unlocked: '["data_analyze", "pattern_detect", "insight_extract"]',
    xp_per_level: '[150, 400, 800, 1200]'
  },
  {
    id: 'skill-sentiment-analysis',
    name: 'sentiment_analysis',
    category: 'analysis',
    description: 'Ability to analyze emotional tone and sentiment in text communications',
    icon: 'heart',
    prerequisites: '[]',
    max_level: 4,
    tools_unlocked: '["sentiment_detect", "emotion_analyze", "tone_check"]',
    xp_per_level: '[100, 300, 600, 1000]'
  },
  {
    id: 'skill-trend-detection',
    name: 'trend_detection',
    category: 'analysis',
    description: 'Ability to identify trends, patterns, and anomalies over time',
    icon: 'trending-up',
    prerequisites: '["data_analysis"]',
    max_level: 4,
    tools_unlocked: '["trend_analyze", "anomaly_detect", "forecast"]',
    xp_per_level: '[200, 500, 900, 1400]'
  },
  {
    id: 'skill-document-parsing',
    name: 'document_parsing',
    category: 'analysis',
    description: 'Ability to extract structured information from documents of various formats',
    icon: 'file-search',
    prerequisites: '[]',
    max_level: 4,
    tools_unlocked: '["document_parse", "extract_fields", "ocr_read"]',
    xp_per_level: '[150, 400, 800, 1200]'
  },

  // Automation skills
  {
    id: 'skill-task-scheduling',
    name: 'task_scheduling',
    category: 'automation',
    description: 'Ability to create, manage, and optimize task schedules',
    icon: 'calendar',
    prerequisites: '[]',
    max_level: 4,
    tools_unlocked: '["schedule_create", "schedule_optimize", "reminder_set"]',
    xp_per_level: '[100, 300, 600, 1000]'
  },
  {
    id: 'skill-workflow-automation',
    name: 'workflow_automation',
    category: 'automation',
    description: 'Ability to design and execute automated workflows and processes',
    icon: 'git-branch',
    prerequisites: '["task_scheduling"]',
    max_level: 4,
    tools_unlocked: '["workflow_create", "workflow_execute", "process_automate"]',
    xp_per_level: '[200, 500, 900, 1400]'
  },
  {
    id: 'skill-rule-engine',
    name: 'rule_engine',
    category: 'automation',
    description: 'Ability to create and manage conditional rules and triggers',
    icon: 'git-merge',
    prerequisites: '[]',
    max_level: 4,
    tools_unlocked: '["rule_create", "condition_evaluate", "trigger_manage"]',
    xp_per_level: '[150, 400, 800, 1200]'
  },
  {
    id: 'skill-triggers',
    name: 'triggers',
    category: 'automation',
    description: 'Ability to set up and respond to various event triggers',
    icon: 'zap',
    prerequisites: '[]',
    max_level: 4,
    tools_unlocked: '["trigger_create", "event_listen", "action_execute"]',
    xp_per_level: '[100, 300, 600, 1000]'
  },

  // Integration skills
  {
    id: 'skill-api-integration',
    name: 'api_integration',
    category: 'integration',
    description: 'Ability to connect with and use external APIs and services',
    icon: 'link',
    prerequisites: '[]',
    max_level: 4,
    tools_unlocked: '["api_call", "api_connect", "data_sync"]',
    xp_per_level: '[150, 400, 800, 1200]'
  },
  {
    id: 'skill-webhook-management',
    name: 'webhook_management',
    category: 'integration',
    description: 'Ability to create, manage, and process webhooks',
    icon: 'webhook',
    prerequisites: '["api_integration"]',
    max_level: 4,
    tools_unlocked: '["webhook_create", "webhook_receive", "payload_process"]',
    xp_per_level: '[200, 500, 900, 1400]'
  },
  {
    id: 'skill-platform-sync',
    name: 'platform_sync',
    category: 'integration',
    description: 'Ability to synchronize data across multiple platforms',
    icon: 'refresh-cw',
    prerequisites: '["api_integration"]',
    max_level: 4,
    tools_unlocked: '["sync_execute", "conflict_resolve", "data_merge"]',
    xp_per_level: '[200, 500, 900, 1400]'
  },

  // Management skills
  {
    id: 'skill-team-coordination',
    name: 'team_coordination',
    category: 'management',
    description: 'Ability to coordinate tasks and communications among team members',
    icon: 'users',
    prerequisites: '[]',
    max_level: 4,
    tools_unlocked: '["task_assign", "team_notify", "coordination_manage"]',
    xp_per_level: '[150, 400, 800, 1200]'
  },
  {
    id: 'skill-resource-allocation',
    name: 'resource_allocation',
    category: 'management',
    description: 'Ability to allocate and manage resources efficiently',
    icon: 'layers',
    prerequisites: '["team_coordination"]',
    max_level: 4,
    tools_unlocked: '["resource_assign", "capacity_plan", "workload_balance"]',
    xp_per_level: '[200, 500, 900, 1400]'
  },
  {
    id: 'skill-priority-management',
    name: 'priority_management',
    category: 'management',
    description: 'Ability to assess, set, and manage priorities for tasks and requests',
    icon: 'flag',
    prerequisites: '[]',
    max_level: 4,
    tools_unlocked: '["priority_set", "urgency_assess", "queue_manage"]',
    xp_per_level: '[100, 300, 600, 1000]'
  }
];

try {
  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO agentic_skills_catalog
    (id, name, category, description, icon, prerequisites, max_level, tools_unlocked, xp_per_level)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let inserted = 0;
  let skipped = 0;

  for (const skill of defaultSkills) {
    const result = insertStmt.run(
      skill.id,
      skill.name,
      skill.category,
      skill.description,
      skill.icon,
      skill.prerequisites,
      skill.max_level,
      skill.tools_unlocked,
      skill.xp_per_level
    );
    if (result.changes > 0) {
      inserted++;
    } else {
      skipped++;
    }
  }

  console.log(`   ✓ Default skills: ${inserted} inserted, ${skipped} already existed`);
} catch (e) {
  console.error(`   ✗ Error inserting skills: ${e.message}`);
  results.failed.push({ table: 'default_skills', error: e.message });
}

// =====================================================
// Verification
// =====================================================
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('Verification:');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

const tableNames = [
  'agentic_skills_catalog',
  'agentic_agent_skills',
  'agentic_skill_history'
];

const existingTables = db.prepare(`
  SELECT name FROM sqlite_master
  WHERE type='table' AND name IN ('agentic_skills_catalog', 'agentic_agent_skills', 'agentic_skill_history')
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

// Show skill categories
const categories = db.prepare(`
  SELECT category, COUNT(*) as count FROM agentic_skills_catalog GROUP BY category
`).all();

console.log('\n   Skill Categories:');
categories.forEach(cat => {
  console.log(`     - ${cat.category}: ${cat.count} skills`);
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
  console.log('\n X Migration completed with errors!');
  process.exit(1);
} else {
  console.log('\n [OK] Migration completed successfully!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}
