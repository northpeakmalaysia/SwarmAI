/**
 * Setup Script: Athena Personal Assistant Agent
 * ===============================================
 * Creates Athena as an Agentic AI agent with:
 * - Agent record in agents table
 * - Agentic profile with master contact + response agents
 * - Monitoring configuration for all platforms
 * - Scheduled health summary
 *
 * IDEMPOTENT: Safe to run multiple times - checks for existing records.
 *
 * Run with: node server/scripts/setup-athena.cjs
 * Or in Docker: docker compose exec backend node /app/scripts/setup-athena.cjs
 */

const Database = require('better-sqlite3');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'swarm.db');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('Setup: Athena Personal Assistant Agent');
console.log(`Database: ${DB_PATH}`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// =====================================================
// CONFIGURATION
// =====================================================
const MASTER_PHONE = '60164970049';
const MASTER_DISPLAY_NAME = 'Master';
const ATHENA_NAME = 'Athena';

const ATHENA_SYSTEM_PROMPT = `You are Athena, an intelligent Personal Assistant AI agent.

Your primary responsibilities:
1. Monitor all other agents' activities across all platforms (WhatsApp, Email, Telegram)
2. Track agent status changes, platform connections, and task completions/failures
3. Send timely WhatsApp notifications to your Master about important events
4. Compile and deliver periodic health summaries of the entire system

Notification Guidelines:
- Be concise but informative in your notifications
- Prioritize critical errors and platform disconnections
- Batch similar notifications to avoid flooding
- Include relevant context (agent name, platform, error details)
- Use appropriate urgency levels (urgent/high/normal/low)

You are always watching, always reporting, and always keeping your Master informed.`;

// =====================================================
// Step 1: Find user
// =====================================================
console.log('\n[1/7] Finding user...');
const user = db.prepare(`
  SELECT id, email, name FROM users ORDER BY created_at ASC LIMIT 1
`).get();

if (!user) {
  console.error('   No users found in database. Create a user first.');
  process.exit(1);
}
console.log(`   Found user: ${user.name || user.email} (${user.id})`);

// =====================================================
// Step 2: Find or create Master Contact
// =====================================================
console.log('\n[2/7] Setting up Master contact...');

// Check if contact with this phone exists (join through contacts for user_id filter)
let masterContactId = null;
const existingIdentifier = db.prepare(`
  SELECT ci.contact_id FROM contact_identifiers ci
  JOIN contacts c ON c.id = ci.contact_id
  WHERE ci.identifier_value = ? AND c.user_id = ?
`).get(MASTER_PHONE, user.id);

if (existingIdentifier) {
  masterContactId = existingIdentifier.contact_id;
  console.log(`   Master contact already exists: ${masterContactId}`);
} else {
  // Check if there's a contact with the phone in identifier_value without user filter
  const altIdentifier = db.prepare(`
    SELECT ci.contact_id FROM contact_identifiers ci
    WHERE ci.identifier_value = ?
  `).get(MASTER_PHONE);

  if (altIdentifier) {
    masterContactId = altIdentifier.contact_id;
    console.log(`   Found existing contact for phone ${MASTER_PHONE}: ${masterContactId}`);
  } else {
    // Create new contact
    masterContactId = uuidv4();
    db.prepare(`
      INSERT INTO contacts (id, user_id, display_name, is_favorite, created_at, updated_at)
      VALUES (?, ?, ?, 1, datetime('now'), datetime('now'))
    `).run(masterContactId, user.id, MASTER_DISPLAY_NAME);

    // Create identifier (no user_id column in contact_identifiers)
    db.prepare(`
      INSERT INTO contact_identifiers (id, contact_id, identifier_type, identifier_value, platform, is_primary, created_at)
      VALUES (?, ?, 'phone', ?, 'whatsapp', 1, datetime('now'))
    `).run(uuidv4(), masterContactId, MASTER_PHONE);

    console.log(`   Created Master contact: ${masterContactId} (phone: ${MASTER_PHONE})`);
  }
}

// =====================================================
// Step 3: Find SwarmNest agent (response agent)
// =====================================================
console.log('\n[3/7] Finding SwarmNest agent...');
const swarmNestAgent = db.prepare(`
  SELECT id, name FROM agents WHERE name = 'SwarmNest' AND user_id = ?
`).get(user.id);

if (!swarmNestAgent) {
  // Try without user_id filter
  const anySwarmNest = db.prepare(`SELECT id, name FROM agents WHERE name = 'SwarmNest'`).get();
  if (!anySwarmNest) {
    console.warn('   SwarmNest agent not found. Athena will need response agents configured manually.');
  } else {
    console.log(`   Found SwarmNest: ${anySwarmNest.id}`);
  }
}
const swarmNestId = swarmNestAgent?.id || db.prepare(`SELECT id FROM agents WHERE name = 'SwarmNest'`).get()?.id;
console.log(`   SwarmNest agent ID: ${swarmNestId || 'NOT FOUND'}`);

// =====================================================
// Step 4: Create Athena Agent
// =====================================================
console.log('\n[4/7] Creating Athena agent...');
let athenaAgent = db.prepare(`
  SELECT id, name FROM agents WHERE name = ? AND user_id = ?
`).get(ATHENA_NAME, user.id);

if (athenaAgent) {
  console.log(`   Athena agent already exists: ${athenaAgent.id}`);
} else {
  const athenaAgentId = uuidv4();
  db.prepare(`
    INSERT INTO agents (id, user_id, name, description, status, system_prompt, auto_response, reputation_score, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'idle', ?, 0, 100, datetime('now'), datetime('now'))
  `).run(
    athenaAgentId,
    user.id,
    ATHENA_NAME,
    'Personal Assistant - Monitors all agents and sends WhatsApp notifications to Master',
    ATHENA_SYSTEM_PROMPT
  );
  athenaAgent = { id: athenaAgentId, name: ATHENA_NAME };
  console.log(`   Created Athena agent: ${athenaAgentId}`);
}

// =====================================================
// Step 5: Create Athena Agentic Profile
// =====================================================
console.log('\n[5/7] Creating Athena agentic profile...');
let athenaProfile = db.prepare(`
  SELECT id FROM agentic_profiles WHERE agent_id = ? AND user_id = ?
`).get(athenaAgent.id, user.id);

if (!athenaProfile) {
  // Also check by name
  athenaProfile = db.prepare(`
    SELECT id FROM agentic_profiles WHERE name = ? AND user_id = ?
  `).get(ATHENA_NAME, user.id);
}

const responseAgentIds = swarmNestId ? [swarmNestId] : [];

if (athenaProfile) {
  console.log(`   Athena profile already exists: ${athenaProfile.id}`);
  // Update response_agent_ids if needed
  db.prepare(`
    UPDATE agentic_profiles
    SET response_agent_ids = ?, master_contact_id = ?, master_contact_channel = 'whatsapp',
        notify_master_on = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(
    JSON.stringify(responseAgentIds),
    masterContactId,
    JSON.stringify(['new_email', 'agent_status_change', 'platform_disconnect', 'task_completed', 'task_failed', 'critical_error', 'daily_report', 'health_check']),
    athenaProfile.id
  );
  console.log(`   Updated profile with master contact and response agents`);
} else {
  const profileId = uuidv4();
  const hierarchyPath = `/${profileId}`;

  // Check if response_agent_ids column exists
  let hasResponseAgentIds = false;
  try {
    const columns = db.prepare("PRAGMA table_info(agentic_profiles)").all();
    hasResponseAgentIds = columns.some(col => col.name === 'response_agent_ids');
  } catch (e) { /* ignore */ }

  if (hasResponseAgentIds) {
    db.prepare(`
      INSERT INTO agentic_profiles (
        id, user_id, agent_id, name, role, description,
        agent_type, hierarchy_level, hierarchy_path,
        ai_provider, system_prompt,
        autonomy_level,
        master_contact_id, master_contact_channel, notify_master_on, escalation_timeout_minutes,
        response_agent_ids,
        status
      )
      VALUES (?, ?, ?, ?, ?, ?, 'master', 0, ?, 'task-routing', ?, 'autonomous', ?, 'whatsapp', ?, 60, ?, 'active')
    `).run(
      profileId,
      user.id,
      athenaAgent.id,
      ATHENA_NAME,
      'Personal Assistant',
      'Monitors all agents and sends WhatsApp notifications to Master',
      hierarchyPath,
      ATHENA_SYSTEM_PROMPT,
      masterContactId,
      JSON.stringify(['new_email', 'agent_status_change', 'platform_disconnect', 'task_completed', 'task_failed', 'critical_error', 'daily_report', 'health_check']),
      JSON.stringify(responseAgentIds)
    );
  } else {
    db.prepare(`
      INSERT INTO agentic_profiles (
        id, user_id, agent_id, name, role, description,
        agent_type, hierarchy_level, hierarchy_path,
        ai_provider, system_prompt,
        autonomy_level,
        master_contact_id, master_contact_channel, notify_master_on, escalation_timeout_minutes,
        status
      )
      VALUES (?, ?, ?, ?, ?, ?, 'master', 0, ?, 'task-routing', ?, 'autonomous', ?, 'whatsapp', ?, 60, 'active')
    `).run(
      profileId,
      user.id,
      athenaAgent.id,
      ATHENA_NAME,
      'Personal Assistant',
      'Monitors all agents and sends WhatsApp notifications to Master',
      hierarchyPath,
      ATHENA_SYSTEM_PROMPT,
      masterContactId,
      JSON.stringify(['new_email', 'agent_status_change', 'platform_disconnect', 'task_completed', 'task_failed', 'critical_error', 'daily_report', 'health_check'])
    );
  }

  athenaProfile = { id: profileId };
  console.log(`   Created Athena profile: ${profileId}`);
}

// =====================================================
// Step 6: Create Monitoring Configuration
// =====================================================
console.log('\n[6/7] Setting up monitoring configuration...');

const monitoringSources = [
  { type: 'email', name: 'All Email Accounts' },
  { type: 'whatsapp', name: 'All WhatsApp Accounts' },
  { type: 'platform_account', name: 'All Platform Accounts' },
];

for (const source of monitoringSources) {
  const existing = db.prepare(`
    SELECT id FROM agentic_monitoring
    WHERE agentic_id = ? AND source_type = ? AND source_id IS NULL
  `).get(athenaProfile.id, source.type);

  if (existing) {
    console.log(`   Monitoring ${source.type} already configured`);
  } else {
    db.prepare(`
      INSERT INTO agentic_monitoring (id, agentic_id, user_id, source_type, source_id, source_name, auto_classify, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, NULL, ?, 1, 1, datetime('now'), datetime('now'))
    `).run(uuidv4(), athenaProfile.id, user.id, source.type, source.name);
    console.log(`   Created monitoring: ${source.name}`);
  }
}

// =====================================================
// Step 7: Create Scheduled Tasks
// =====================================================
console.log('\n[7/7] Setting up scheduled tasks...');

const existingSchedule = db.prepare(`
  SELECT id FROM agentic_schedules
  WHERE agentic_id = ? AND action_type IN ('send_report', 'health_summary')
`).get(athenaProfile.id);

if (existingSchedule) {
  // Update existing schedule to use health_summary if it was send_report
  db.prepare(`
    UPDATE agentic_schedules
    SET action_type = 'health_summary',
        action_config = '{"sendNotification": true}',
        next_run_at = CASE WHEN next_run_at IS NULL THEN datetime('now', '+60 minutes') ELSE next_run_at END,
        updated_at = datetime('now')
    WHERE id = ?
  `).run(existingSchedule.id);
  console.log(`   Health report schedule updated to health_summary`);
} else {
  db.prepare(`
    INSERT INTO agentic_schedules (id, agentic_id, user_id, title, description, schedule_type, interval_minutes, next_run_at, action_type, action_config, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'interval', 60, datetime('now', '+60 minutes'), 'health_summary', '{"sendNotification": true}', 1, datetime('now'), datetime('now'))
  `).run(
    uuidv4(),
    athenaProfile.id,
    user.id,
    'Hourly Health Summary',
    'Gathers system health stats and sends to Master via notification'
  );
  console.log(`   Created hourly health summary schedule`);
}

// =====================================================
// SUMMARY
// =====================================================
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('Athena Setup Complete!');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`  Agent ID:       ${athenaAgent.id}`);
console.log(`  Profile ID:     ${athenaProfile.id}`);
console.log(`  Master Contact: ${masterContactId} (${MASTER_PHONE})`);
console.log(`  Response Agents: ${responseAgentIds.length > 0 ? responseAgentIds.join(', ') : 'NONE (configure manually)'}`);
console.log(`  Master Channel:  WhatsApp`);
console.log(`  Status:          Active`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

db.close();
