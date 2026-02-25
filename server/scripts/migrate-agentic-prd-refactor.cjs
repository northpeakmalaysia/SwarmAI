/**
 * Database Migration: Agentic AI PRD Refactor
 *
 * This migration aligns the implementation with the PRD design where:
 * - agentic_profiles IS the Agentic AI Agent (not a supporting entity)
 * - agentic_workspaces links to profile_id (not agent_id from agents table)
 * - CLI type is defined at the profile level
 *
 * Changes:
 * 1. Add cli_type column to agentic_profiles
 * 2. Add profile_id column to agentic_workspaces
 * 3. Migrate existing workspaces to link via profile_id
 * 4. Create profiles for orphan workspaces
 *
 * Run with: node server/scripts/migrate-agentic-prd-refactor.cjs
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'swarm.db');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('Database Migration: Agentic AI PRD Refactor');
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

function runMigration(step, totalSteps, description, migrateFn) {
  console.log(`\n[${step}/${totalSteps}] ${description}...`);
  try {
    const result = migrateFn();
    console.log(`   ✓ ${description} - ${result || 'Done'}`);
    results.success.push(description);
    return true;
  } catch (e) {
    if (e.message.includes('duplicate column') || e.message.includes('already exists')) {
      console.log(`   ✓ ${description} - Already done`);
      results.skipped.push(description);
      return true;
    } else {
      console.error(`   ✗ Error: ${e.message}`);
      results.failed.push({ step: description, error: e.message });
      return false;
    }
  }
}

// =====================================================
// Step 1: Add cli_type to agentic_profiles
// =====================================================
runMigration(1, 6, 'Add cli_type column to agentic_profiles', () => {
  const columns = db.prepare("PRAGMA table_info(agentic_profiles)").all();
  const hasCliType = columns.some(col => col.name === 'cli_type');

  if (!hasCliType) {
    db.exec(`
      ALTER TABLE agentic_profiles
      ADD COLUMN cli_type TEXT DEFAULT 'claude'
      CHECK(cli_type IN ('claude', 'gemini', 'opencode', 'bash'))
    `);
    return 'Added cli_type column';
  }
  return 'Column already exists';
});

// =====================================================
// Step 2: Add workspace_autonomy_level to agentic_profiles
// =====================================================
runMigration(2, 6, 'Add workspace_autonomy_level to agentic_profiles', () => {
  const columns = db.prepare("PRAGMA table_info(agentic_profiles)").all();
  const hasField = columns.some(col => col.name === 'workspace_autonomy_level');

  if (!hasField) {
    db.exec(`
      ALTER TABLE agentic_profiles
      ADD COLUMN workspace_autonomy_level TEXT DEFAULT 'semi'
      CHECK(workspace_autonomy_level IN ('semi', 'full'))
    `);
    return 'Added workspace_autonomy_level column';
  }
  return 'Column already exists';
});

// =====================================================
// Step 3: Add profile_id to agentic_workspaces
// =====================================================
runMigration(3, 6, 'Add profile_id column to agentic_workspaces', () => {
  const columns = db.prepare("PRAGMA table_info(agentic_workspaces)").all();
  const hasProfileId = columns.some(col => col.name === 'profile_id');

  if (!hasProfileId) {
    db.exec(`ALTER TABLE agentic_workspaces ADD COLUMN profile_id TEXT`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_agentic_workspaces_profile ON agentic_workspaces(profile_id)`);
    return 'Added profile_id column and index';
  }
  return 'Column already exists';
});

// =====================================================
// Step 4: Migrate existing workspaces to use profile_id
// =====================================================
runMigration(4, 6, 'Migrate existing workspaces to profile_id', () => {
  // Find workspaces that have agent_id but no profile_id
  const workspaces = db.prepare(`
    SELECT w.id, w.user_id, w.agent_id, w.cli_type, w.autonomy_level
    FROM agentic_workspaces w
    WHERE w.profile_id IS NULL AND w.agent_id IS NOT NULL
  `).all();

  if (workspaces.length === 0) {
    return 'No workspaces to migrate';
  }

  let migrated = 0;
  let created = 0;

  for (const workspace of workspaces) {
    // Find profile linked to this agent_id
    let profile = db.prepare(`
      SELECT id FROM agentic_profiles
      WHERE agent_id = ? AND user_id = ?
    `).get(workspace.agent_id, workspace.user_id);

    if (!profile) {
      // Check if there's an agent record to get name
      const agent = db.prepare(`
        SELECT name, description FROM agents
        WHERE id = ? AND user_id = ?
      `).get(workspace.agent_id, workspace.user_id);

      // Create a profile for this workspace
      const profileId = uuidv4();
      db.prepare(`
        INSERT INTO agentic_profiles (
          id, user_id, agent_id, name, role, description,
          cli_type, workspace_autonomy_level,
          agent_type, hierarchy_level, hierarchy_path,
          autonomy_level, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'master', 0, ?, 'supervised', 'inactive')
      `).run(
        profileId,
        workspace.user_id,
        workspace.agent_id,
        agent?.name || `Agentic Agent (migrated)`,
        'Agentic AI Agent',
        agent?.description || 'Auto-migrated from legacy workspace',
        workspace.cli_type,
        workspace.autonomy_level,
        `/${profileId}`
      );

      profile = { id: profileId };
      created++;
    }

    // Update workspace with profile_id
    db.prepare(`
      UPDATE agentic_workspaces
      SET profile_id = ?, cli_type = COALESCE(cli_type, ?)
      WHERE id = ?
    `).run(profile.id, workspace.cli_type, workspace.id);

    // Also update the profile's cli_type if not set
    db.prepare(`
      UPDATE agentic_profiles
      SET cli_type = COALESCE(cli_type, ?),
          workspace_autonomy_level = COALESCE(workspace_autonomy_level, ?)
      WHERE id = ?
    `).run(workspace.cli_type, workspace.autonomy_level, profile.id);

    migrated++;
  }

  return `Migrated ${migrated} workspaces, created ${created} new profiles`;
});

// =====================================================
// Step 5: Migrate profiles without cli_type from their workspaces
// =====================================================
runMigration(5, 6, 'Sync cli_type from existing workspaces to profiles', () => {
  // Find profiles that have workspaces but no cli_type set
  const result = db.prepare(`
    UPDATE agentic_profiles
    SET cli_type = (
      SELECT w.cli_type FROM agentic_workspaces w
      WHERE w.profile_id = agentic_profiles.id
      LIMIT 1
    )
    WHERE cli_type IS NULL
    AND id IN (SELECT profile_id FROM agentic_workspaces WHERE profile_id IS NOT NULL)
  `).run();

  return `Updated ${result.changes} profiles with cli_type from workspaces`;
});

// =====================================================
// Step 6: Verify data integrity
// =====================================================
runMigration(6, 6, 'Verify data integrity', () => {
  const profileCount = db.prepare(`SELECT COUNT(*) as count FROM agentic_profiles`).get().count;
  const workspaceCount = db.prepare(`SELECT COUNT(*) as count FROM agentic_workspaces`).get().count;
  const linkedWorkspaces = db.prepare(`SELECT COUNT(*) as count FROM agentic_workspaces WHERE profile_id IS NOT NULL`).get().count;
  const profilesWithCliType = db.prepare(`SELECT COUNT(*) as count FROM agentic_profiles WHERE cli_type IS NOT NULL`).get().count;

  console.log(`\n   Data Summary:`);
  console.log(`   - Total profiles: ${profileCount}`);
  console.log(`   - Profiles with cli_type: ${profilesWithCliType}`);
  console.log(`   - Total workspaces: ${workspaceCount}`);
  console.log(`   - Workspaces linked to profiles: ${linkedWorkspaces}`);

  if (workspaceCount > 0 && linkedWorkspaces < workspaceCount) {
    console.log(`   ⚠️  Warning: ${workspaceCount - linkedWorkspaces} workspaces not linked to profiles`);
  }

  return 'Verification complete';
});

db.close();

// =====================================================
// Summary
// =====================================================
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('Migration Summary:');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`   Completed: ${results.success.length}`);
console.log(`   Skipped (already done): ${results.skipped.length}`);
console.log(`   Failed: ${results.failed.length}`);

if (results.failed.length > 0) {
  console.log('\n   Failed steps:');
  results.failed.forEach(f => {
    console.log(`      - ${f.step}: ${f.error}`);
  });
  console.log('\n❌ Migration completed with errors!');
  process.exit(1);
} else {
  console.log('\n✅ Migration completed successfully!');
  console.log('\nNext steps:');
  console.log('1. Rebuild backend: docker compose build --no-cache backend');
  console.log('2. Restart: docker compose up -d backend');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}
